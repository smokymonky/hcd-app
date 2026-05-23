const pool = require('./database');

const initDatabase = async () => {
  console.log('Initializing database...');

  const schema = `
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'Viewer',
        function VARCHAR(50),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS activities (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        owner VARCHAR(50) NOT NULL,
        due_dates TEXT[] NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'Scheduled',
        description TEXT,
        assigned_to INTEGER REFERENCES users(id),
        notes TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        month_status JSONB DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
        id SERIAL PRIMARY KEY,
        role VARCHAR(50) UNIQUE NOT NULL,
        can_view BOOLEAN DEFAULT true,
        can_export_pdf BOOLEAN DEFAULT false,
        can_create BOOLEAN DEFAULT false,
        can_edit BOOLEAN DEFAULT false,
        can_delete BOOLEAN DEFAULT false,
        can_complete BOOLEAN DEFAULT false,
        can_approve BOOLEAN DEFAULT false,
        can_comment BOOLEAN DEFAULT false,
        can_manage_users BOOLEAN DEFAULT false,
        can_assign_roles BOOLEAN DEFAULT false,
        can_system_settings BOOLEAN DEFAULT false
    );

    CREATE TABLE IF NOT EXISTS attachments (
        id SERIAL PRIMARY KEY,
        activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
        file_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        file_size INTEGER,
        uploaded_by INTEGER REFERENCES users(id),
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        comment_text TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER REFERENCES users(id),
        recipient_id INTEGER REFERENCES users(id),
        subject VARCHAR(255),
        message_text TEXT NOT NULL,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT,
        activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS approvals (
        id SERIAL PRIMARY KEY,
        activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
        request_type VARCHAR(50) NOT NULL,
        requested_by INTEGER REFERENCES users(id),
        current_approver INTEGER REFERENCES users(id),
        status VARCHAR(50) DEFAULT 'pending',
        approver_level INTEGER DEFAULT 1,
        comments TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notification_settings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) UNIQUE,
        notify_assigned BOOLEAN DEFAULT true,
        notify_comment BOOLEAN DEFAULT true,
        notify_message BOOLEAN DEFAULT true,
        notify_deadline BOOLEAN DEFAULT true
    );

    CREATE TABLE IF NOT EXISTS approval_history (
        id SERIAL PRIMARY KEY,
        approval_id INTEGER REFERENCES approvals(id) ON DELETE CASCADE,
        approver_id INTEGER REFERENCES users(id),
        action VARCHAR(50) NOT NULL,
        comments TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS activity_history (
        id SERIAL PRIMARY KEY,
        activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        action VARCHAR(50) NOT NULL,
        old_value TEXT,
        new_value TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- =============================================
    -- PHASE 0: HR ECOSYSTEM + WORKFLOW ENGINE
    -- All idempotent (IF NOT EXISTS / ON CONFLICT)
    -- =============================================

    CREATE TABLE IF NOT EXISTS dashboard_modules (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        sort_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS dashboard_submissions (
        id SERIAL PRIMARY KEY,
        module_id INTEGER NOT NULL REFERENCES dashboard_modules(id),
        year INTEGER NOT NULL,
        month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
        status VARCHAR(30) NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft','submitted','head_reviewed','director_reviewed','approved','rejected','published')),
        created_by INTEGER REFERENCES users(id),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (module_id, year, month)
    );

    CREATE TABLE IF NOT EXISTS hr_ops_data (
        id SERIAL PRIMARY KEY,
        submission_id INTEGER NOT NULL REFERENCES dashboard_submissions(id) ON DELETE CASCADE,
        section VARCHAR(100) NOT NULL,
        field_key VARCHAR(100) NOT NULL,
        value TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (submission_id, section, field_key)
    );

    CREATE TABLE IF NOT EXISTS user_module_access (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        module_id INTEGER NOT NULL REFERENCES dashboard_modules(id) ON DELETE CASCADE,
        access_level VARCHAR(20) NOT NULL DEFAULT 'owner'
          CHECK (access_level IN ('owner','viewer')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id, module_id)
    );

    CREATE TABLE IF NOT EXISTS workflow_targets (
        id SERIAL PRIMARY KEY,
        target_type VARCHAR(50) UNIQUE NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        workflow_active BOOLEAN DEFAULT false,
        require_function_head BOOLEAN DEFAULT true,
        require_hr_director BOOLEAN DEFAULT true,
        require_admin BOOLEAN DEFAULT true,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS workflow_history (
        id SERIAL PRIMARY KEY,
        target_type VARCHAR(50) NOT NULL,
        target_id INTEGER NOT NULL,
        from_state VARCHAR(30),
        to_state VARCHAR(30) NOT NULL,
        action VARCHAR(50) NOT NULL,
        action_by INTEGER REFERENCES users(id),
        reason TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

   try {
    await pool.query(schema);

    // Add plain_password column if not exists
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS plain_password TEXT');

    // =============================================
    // PHASE 0: Add new permission columns to role_permissions
    // All idempotent (ADD COLUMN IF NOT EXISTS)
    // These columns MUST exist before the 5-row INSERT below runs.
    // =============================================
    await pool.query('ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS can_submit_dashboard BOOLEAN DEFAULT false');
    await pool.query('ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS can_review_dashboard BOOLEAN DEFAULT false');
    await pool.query('ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS can_publish_dashboard BOOLEAN DEFAULT false');
    await pool.query('ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS can_view_dashboard BOOLEAN DEFAULT true');

    // PHASE 0: Indices for new tables
    await pool.query('CREATE INDEX IF NOT EXISTS idx_dashboard_submissions_module_year_month ON dashboard_submissions(module_id, year, month)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_dashboard_submissions_status ON dashboard_submissions(status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_hr_ops_data_submission ON hr_ops_data(submission_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_hr_ops_data_field_key ON hr_ops_data(field_key)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_user_module_access_user ON user_module_access(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_workflow_history_target ON workflow_history(target_type, target_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_workflow_history_actor ON workflow_history(action_by)');

    console.log('Database tables created');

    const rolesCheck = await pool.query('SELECT COUNT(*) FROM role_permissions');
    if (parseInt(rolesCheck.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO role_permissions (role, can_view, can_export_pdf, can_create, can_edit, can_delete, can_complete, can_approve, can_comment, can_manage_users, can_assign_roles, can_system_settings)
        VALUES 
          ('Admin', true, true, true, true, true, true, true, true, true, true, true),
          ('Viewer', true, false, false, false, false, false, false, false, false, false, false)
        ON CONFLICT (role) DO NOTHING
      `);
      // PHASE 0: Also seed the other 5 production roles on fresh DBs.
      // Idempotent — prod already has these (this block is only reached
      // when role_permissions is empty, e.g. a fresh Phase 0 DB).
      //
      // Values locked after role-by-role review (see audit v5.2 Section 6.10
      // for per-cell rationale). Reflects Universal Approval Principle (UAP):
      // can_create/edit/delete/complete are FALSE for non-admin in Phase 0
      // because UAP enforcement is not yet active for Annual Plan. Will flip
      // when Annual Plan workflow is activated (audit Section 6.8 + 6.9).
      //
      // Includes the 4 new dashboard columns added via ALTER TABLE above:
      // can_view_dashboard, can_submit_dashboard, can_review_dashboard,
      // can_publish_dashboard.
      await pool.query(`
        INSERT INTO role_permissions
          (role,
           can_view, can_export_pdf, can_create, can_edit, can_delete,
           can_complete, can_approve, can_comment, can_manage_users,
           can_assign_roles, can_system_settings,
           can_view_dashboard, can_submit_dashboard, can_review_dashboard,
           can_publish_dashboard)
        VALUES
          ('hr_director',   true,  true,  false, false, false, false, true,  true,  false, false, false, true,  false, true,  false),
          ('function_head', true,  true,  false, false, false, false, true,  true,  false, false, false, true,  true,  true,  false),
          ('employee',      true,  false, false, false, false, false, false, true,  false, false, false, true,  true,  false, false),
          ('esmd',          true,  true,  false, false, false, false, false, true,  false, false, false, true,  false, false, false),
          ('ceo',           true,  true,  false, false, false, false, false, true,  false, false, false, true,  false, false, false)
        ON CONFLICT (role) DO NOTHING
      `);
      console.log('Default roles added');
    }

    const adminCheck = await pool.query("SELECT COUNT(*) FROM users WHERE email = 'admin@aljfinance.com'");
    if (parseInt(adminCheck.rows[0].count) === 0) {
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await pool.query(
        `INSERT INTO users (name, email, password, role, function) VALUES ('Admin', 'admin@aljfinance.com', $1, 'Admin', 'ALL')`,
        [hashedPassword]
      );
      console.log('Admin user created: admin@aljfinance.com / admin123');
    }

    const activitiesCheck = await pool.query('SELECT COUNT(*) FROM activities');
    if (parseInt(activitiesCheck.rows[0].count) === 0) {
      await seedActivities();
      console.log('Activities added');
    }

    // =============================================
    // PHASE 0: Seed dashboard_modules (4 rows, idempotent)
    // =============================================
    await pool.query(`
      INSERT INTO dashboard_modules (code, name, description, sort_order) VALUES
        ('HR_OPS', 'HR Operations', 'Headcount, On/Off-Boarding, Services', 1),
        ('TA',     'Talent Acquisition', 'Hiring funnel, time-to-fill, sources', 2),
        ('L&D',    'Development & Career', 'Training, IDP, succession', 3),
        ('HR_SYS', 'HR Systems', 'Systems availability, ticket SLAs, automation', 4)
      ON CONFLICT (code) DO NOTHING
    `);

    // =============================================
    // PHASE 0: Seed workflow_targets registry
    // dashboard_submission: workflow active (used by HR Dashboards in Phase 0)
    // activity_completion:  workflow inactive (placeholder for future Annual Plan
    //                       activation per audit Section 6.8 — zero behavior change)
    // =============================================
    await pool.query(`
      INSERT INTO workflow_targets (target_type, display_name, workflow_active, require_function_head, require_hr_director, require_admin, description) VALUES
        ('dashboard_submission', 'HR Dashboard Submission', true,  true, true, true, 'Monthly dashboard data submitted by employees, reviewed by function_head -> hr_director -> admin'),
        ('activity_completion',  'HR Annual Plan Activity', false, true, true, true, 'Annual Plan activity workflow - schema-ready, disabled until manual activation. See audit Section 6.8.')
      ON CONFLICT (target_type) DO NOTHING
    `);

    // PHASE 0: Grant admin role the new dashboard permissions (idempotent UPDATE)
    await pool.query(`
      UPDATE role_permissions
      SET can_submit_dashboard = true,
          can_review_dashboard = true,
          can_publish_dashboard = true,
          can_view_dashboard = true
      WHERE LOWER(role) = 'admin'
    `);

    console.log('Database initialization complete');

    // =============================================
    // PHASE 0: Backfill block (GATE: PHASE0_BACKFILL_USERS)
    // Strict string match. Skip path logs visibly per Rule 5.
    // Wrapped in try/catch — failures log only, do not block server boot.
    // =============================================
    if (process.env.PHASE0_BACKFILL_USERS !== 'true') {
      console.log("[Phase 0 backfill] PHASE0_BACKFILL_USERS not set to 'true' — skipping user_module_access backfill (this is expected on production until manual backfill is run).");
    } else {
      try {
        const FUNCTION_TO_MODULE_MAP = { 'OP': 'HR_OPS', 'T&A': 'TA', 'D&C': 'L&D', 'SBM': 'HR_SYS' };
        const distinctFns = await pool.query(
          "SELECT function, COUNT(*)::int AS n FROM users WHERE is_active = true GROUP BY function ORDER BY function"
        );
        console.log('[Phase 0 backfill] Distinct function values in users table:');
        let totalInserted = 0, totalSkipped = 0;
        for (const row of distinctFns.rows) {
          const fn = row.function;
          const moduleCode = FUNCTION_TO_MODULE_MAP[fn];
          if (moduleCode) {
            const res = await pool.query(
              `INSERT INTO user_module_access (user_id, module_id, access_level)
               SELECT u.id, m.id, 'owner'
               FROM users u, dashboard_modules m
               WHERE u.function = $1 AND u.is_active = true AND m.code = $2
               ON CONFLICT (user_id, module_id) DO NOTHING
               RETURNING id`,
              [fn, moduleCode]
            );
            console.log(`  ${String(fn).padEnd(14)} -> ${String(moduleCode).padEnd(8)} (${res.rowCount} of ${row.n} users mapped)`);
            totalInserted += res.rowCount;
          } else {
            console.log(`  ${String(fn || '(null)').padEnd(14)} -> no auto-map (${row.n} users)`);
            totalSkipped += row.n;
          }
        }
        console.log(`[Phase 0 backfill] Inserted ${totalInserted} user_module_access rows. ${totalSkipped} users skipped (no auto-map).`);
      } catch (err) {
        console.error('[Phase 0 backfill] FAILED:', err.message);
        // Server continues — backfill failure is non-blocking
      }
    }

    // =============================================
    // PHASE 0: Test user seed (3-GATE protected)
    //   Gate 1: isolated DB (hcd-app-phase0 has its own Postgres)
    //   Gate 2: PHASE0_SEED_TEST_USER === 'true' (strict)
    //   Gate 3: email-not-exists check (re-deploy safe; never overwrites)
    // TEMPORARY — must be removed (delete user or change password) before
    // Phase 4 when HR Ops becomes user-visible. See audit Issue #21.
    // =============================================
    if (process.env.PHASE0_SEED_TEST_USER !== 'true') {
      console.log("[Phase 0] PHASE0_SEED_TEST_USER not set to 'true' — skipping test user seed (this is expected on production).");
    } else {
      try {
        const existing = await pool.query(
          "SELECT id FROM users WHERE email = 'hrops@aljfinance.com'"
        );
        if (existing.rows.length > 0) {
          console.log('[Phase 0] Test user hrops@aljfinance.com already exists — skipping (re-deploy safe).');
        } else {
          const bcrypt = require('bcryptjs');
          const hashed = await bcrypt.hash('Phase0Test!2026', 10);
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            const userIns = await client.query(
              `INSERT INTO users (name, email, password, plain_password, role, function, is_active)
               VALUES ('Phase0 HR Ops Test Head','hrops@aljfinance.com',$1,'Phase0Test!2026','function_head','OP',true)
               RETURNING id`,
              [hashed]
            );
            const newUserId = userIns.rows[0].id;
            await client.query(
              `INSERT INTO user_module_access (user_id, module_id, access_level)
               SELECT $1, id, 'owner' FROM dashboard_modules WHERE code = 'HR_OPS'`,
              [newUserId]
            );
            await client.query('COMMIT');
            console.log('[Phase 0] Created TEMPORARY test user hrops@aljfinance.com (delete or change password before Phase 4 - see audit Issue #21)');
          } catch (txErr) {
            await client.query('ROLLBACK');
            throw txErr;
          } finally {
            client.release();
          }
        }
      } catch (err) {
        console.error('[Phase 0 test user seed] FAILED:', err.message);
        // Server continues — test user seed failure is non-blocking
      }
    }
  } catch (err) {
    console.error('Database initialization error:', err);
    throw err;
  }
};

const seedActivities = async () => {
  const activities = [
    { name: 'Update Work Regulations', category: 'Activities/Programs/Projects', owner: 'OP', due_dates: ['May'], status: 'Scheduled' },
    { name: 'Talent Review & Calibration Governance', category: 'Activities/Programs/Projects', owner: 'D&C', due_dates: ['Jan'], status: 'Progressing' },
    { name: 'Operation Development Program (Sales)', category: 'Activities/Programs/Projects', owner: 'D&C', due_dates: ['Jan'], status: 'Progressing' },
    { name: 'Establish Talent Management Function', category: 'Activities/Programs/Projects', owner: 'D&C', due_dates: ['Apr'], status: 'Scheduled' },
    { name: 'Summer Promising Training Program', category: 'Activities/Programs/Projects', owner: 'D&C', due_dates: ['Sep'], status: 'Scheduled' },
    { name: 'Mentoring Project', category: 'Activities/Programs/Projects', owner: 'D&C', due_dates: ['Nov'], status: 'Scheduled' },
    { name: 'In-body Program', category: 'Activities/Programs/Projects', owner: 'T&A/D&C', due_dates: ['Jan'], status: 'Progressing' },
    { name: 'Enhance Onboarding Day', category: 'Activities/Programs/Projects', owner: 'T&A', due_dates: ['Jan'], status: 'Progressing' },
    { name: 'Enhancement of Onboarding', category: 'Activities/Programs/Projects', owner: 'T&A', due_dates: ['Sep'], status: 'Scheduled' },
    { name: 'University Partnership Program', category: 'Activities/Programs/Projects', owner: 'T&A', due_dates: ['Nov'], status: 'Scheduled' },
    { name: 'Wellbeing Program', category: 'Activities/Programs/Projects', owner: 'OD/SBM', due_dates: ['Feb'], status: 'Scheduled' },
    { name: 'Activate Feedback Culture Program', category: 'Activities/Programs/Projects', owner: 'OD/D&C', due_dates: ['Jan'], status: 'Progressing' },
    { name: 'Work-Life Integration & Flexible Work Models', category: 'Activities/Programs/Projects', owner: 'OD', due_dates: ['Jan'], status: 'Progressing' },
    { name: 'Operation Performance Framework', category: 'Activities/Programs/Projects', owner: 'OD', due_dates: ['Jan'], status: 'Progressing' },
    { name: 'Establish Culture Function', category: 'Activities/Programs/Projects', owner: 'OD', due_dates: ['Apr'], status: 'Scheduled' },
    { name: 'ALJUF Workload Analysis', category: 'Activities/Programs/Projects', owner: 'OD/Com&Bn', due_dates: ['Nov'], status: 'Scheduled' },
    { name: 'Implementing New Approach for Gosi', category: 'Activities/Programs/Projects', owner: 'Com&Bn', due_dates: ['Feb'], status: 'Scheduled' },
    { name: 'Medical Insurance Process Enhancement', category: 'Activities/Programs/Projects', owner: 'Com&Bn', due_dates: ['Apr'], status: 'Scheduled' },
    { name: 'Benefits Review & Enhancement', category: 'Activities/Programs/Projects', owner: 'Com&Bn', due_dates: ['Jun'], status: 'Scheduled' },
    { name: 'Move Car Loan From Finance to HR', category: 'Activities/Programs/Projects', owner: 'Com&Bn', due_dates: ['Jun'], status: 'Scheduled' },
    { name: 'Automate EOS Full Process', category: 'Activities/Programs/Projects', owner: 'Com&Bn', due_dates: ['Oct'], status: 'Scheduled' },
    { name: 'OTL Process Enhancement', category: 'Activities/Programs/Projects', owner: 'Com&Bn', due_dates: ['Dec'], status: 'Scheduled' },
    { name: 'Enhance KAIZEN', category: 'Activities/Programs/Projects', owner: 'SBM', due_dates: ['Mar'], status: 'Scheduled' },
    { name: 'Activate Oracle Mobile Application', category: 'Activities/Programs/Projects', owner: 'SBM', due_dates: ['Apr'], status: 'Scheduled' },
    { name: 'Associate Handbook', category: 'Activities/Programs/Projects', owner: 'SBM', due_dates: ['Apr'], status: 'Scheduled' },
    { name: 'AI - Phase 2', category: 'Activities/Programs/Projects', owner: 'SBM', due_dates: ['Sep'], status: 'Scheduled' },
    { name: 'Multi-Channel HR Support', category: 'Activities/Programs/Projects', owner: 'SBM', due_dates: ['Oct'], status: 'Scheduled' },
    { name: 'Recognition & Appreciation Program', category: 'Activities/Programs/Projects', owner: 'SBM', due_dates: ['Dec'], status: 'Scheduled' },
    { name: 'Identify Cross Functions Process', category: 'Activities/Programs/Projects', owner: 'ALL', due_dates: ['Mar'], status: 'Scheduled' },
    { name: 'HR Process Simplification & Automation', category: 'Activities/Programs/Projects', owner: 'ALL', due_dates: ['Jun'], status: 'Scheduled' },
    { name: '2026 Leave Balance Utilization Reminders', category: 'Maintenance Projects', owner: 'OP', due_dates: ['Mar','Jun','Sep','Dec'], status: 'Scheduled' },
    { name: 'Yearly Acknowledgment', category: 'Maintenance Projects', owner: 'OP', due_dates: ['Jan'], status: 'Progressing' },
    { name: 'Data Cleansing - Phase 3', category: 'Maintenance Projects', owner: 'OP', due_dates: ['Apr'], status: 'Scheduled' },
    { name: 'Maintain Saudization Percentage 85%', category: 'Maintenance Projects', owner: 'OP', due_dates: ['Dec'], status: 'Scheduled' },
    { name: 'Bi-Yearly L&D Letter', category: 'Maintenance Projects', owner: 'D&C', due_dates: ['Feb','Jun'], status: 'Scheduled' },
    { name: 'IDP Submission and Tracking 2026', category: 'Maintenance Projects', owner: 'D&C', due_dates: ['Mar','Dec'], status: 'Scheduled' },
    { name: 'Succession Planning', category: 'Maintenance Projects', owner: 'D&C', due_dates: ['Mar','Jun','Sep','Dec'], status: 'Scheduled' },
    { name: 'BoD & Committees Compliance Training', category: 'Maintenance Projects', owner: 'D&C', due_dates: ['Oct'], status: 'Scheduled' },
    { name: 'Executive Compliance Workshop', category: 'Maintenance Projects', owner: 'D&C', due_dates: ['Oct'], status: 'Scheduled' },
    { name: 'D&C Budget for 2027', category: 'Maintenance Projects', owner: 'D&C', due_dates: ['Nov'], status: 'Scheduled' },
    { name: 'L&D Calendar 2027', category: 'Maintenance Projects', owner: 'D&C', due_dates: ['Nov'], status: 'Scheduled' },
    { name: 'Mandatory Courses Completion 2026', category: 'Maintenance Projects', owner: 'D&C', due_dates: ['Dec'], status: 'Scheduled' },
    { name: 'Internal/External Rec Posts', category: 'Maintenance Projects', owner: 'T&A', due_dates: ['Jun'], status: 'Scheduled' },
    { name: 'Update Monthly Bank Offers', category: 'Maintenance Projects', owner: 'OD', due_dates: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], status: 'Progressing' },
    { name: 'Performance Management / Objectives Setting', category: 'Maintenance Projects', owner: 'OD', due_dates: ['Feb','Dec'], status: 'Scheduled' },
    { name: 'Structure Update & Review', category: 'Maintenance Projects', owner: 'OD', due_dates: ['Mar','Jun','Sep','Dec'], status: 'Scheduled' },
    { name: 'Employee Engagement Survey & Action Plans', category: 'Maintenance Projects', owner: 'OD', due_dates: ['Jun'], status: 'Scheduled' },
    { name: 'Bonus Cycle 2025/2026', category: 'Maintenance Projects', owner: 'Com&Bn', due_dates: ['Jan','Dec'], status: 'Progressing' },
    { name: 'Salaries Increase Cycle 2025/2026', category: 'Maintenance Projects', owner: 'Com&Bn', due_dates: ['Jan','Dec'], status: 'Progressing' },
    { name: 'Manpower Budget & Headcount 2026/2027', category: 'Maintenance Projects', owner: 'Com&Bn', due_dates: ['Oct'], status: 'Scheduled' },
    { name: 'Building HR 2027 Strategy', category: 'Maintenance Projects', owner: 'SBM', due_dates: ['Aug'], status: 'Scheduled' },
    { name: 'NRC Meetings', category: 'Maintenance Projects', owner: 'SBM', due_dates: ['Mar','Jun','Aug','Nov'], status: 'Scheduled' },
    { name: 'Update NRC Charter if applicable', category: 'Maintenance Projects', owner: 'SBM', due_dates: ['Nov'], status: 'Scheduled' },
    { name: 'KAIZEN Marathon 2026', category: 'Maintenance Projects', owner: 'SBM', due_dates: ['Sep'], status: 'Scheduled' },
    { name: 'HR Jameel', category: 'Maintenance Projects', owner: 'SBM', due_dates: ['Mar','Jun','Sep','Dec'], status: 'Scheduled' },
    { name: 'Update HC Policy if applicable', category: 'Maintenance Projects', owner: 'SBM', due_dates: ['Nov'], status: 'Scheduled' },
    { name: 'HR Tips', category: 'Maintenance Projects', owner: 'ALL', due_dates: ['Feb','Apr','Jun','Aug','Oct','Dec'], status: 'Scheduled' },
    { name: 'Operation Report - Monthly', category: 'Reports', owner: 'OP', due_dates: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], status: 'Progressing' },
    { name: 'D&C Report - Monthly', category: 'Reports', owner: 'D&C', due_dates: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], status: 'Progressing' },
    { name: 'Recruitment Report - Monthly', category: 'Reports', owner: 'T&A', due_dates: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], status: 'Progressing' },
    { name: 'Annual Plan - Monthly', category: 'Reports', owner: 'SBM', due_dates: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], status: 'Progressing' },
    { name: 'Risk Report - Monthly', category: 'Reports', owner: 'SBM', due_dates: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], status: 'Progressing' }
  ];

  for (const a of activities) {
    await pool.query(
      `INSERT INTO activities (name, category, owner, due_dates, status, created_by) VALUES ($1, $2, $3, $4, $5, 1)`,
      [a.name, a.category, a.owner, a.due_dates, a.status]
    );
  }
};

module.exports = initDatabase;
