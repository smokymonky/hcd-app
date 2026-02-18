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
  `;

   try {
    await pool.query(schema);
    
    // Add plain_password column if not exists
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS plain_password TEXT');
    
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

    console.log('Database initialization complete');
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
