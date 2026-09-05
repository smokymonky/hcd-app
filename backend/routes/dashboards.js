// =============================================
// Dashboards Routes (Phase 0 - HR Dashboards module-specific)
// =============================================
// Module-agnostic workflow endpoints live in routes/workflow.js.
// This file is HR Dashboards specific (submissions, hr_ops_data,
// per-module listings, trends, published views, pending queue).
//
// All state-changing routes use BEGIN/COMMIT transactions and
// write a workflow_history row inside the same transaction.
// All transitions go through lib/workflow.validateTransition().
//
// Edit lockout (Option C): submissions are only editable in
// 'draft' or 'rejected' states. Saving a 'rejected' submission
// auto-transitions it to 'draft' (resumed_editing). Approved or
// published submissions require admin-reopen (POST /api/workflow/admin-reopen)
// before any edits are allowed.
// =============================================

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const {
  authenticateToken,
  checkModuleAccess,
  checkModuleAccessParam,
  isAdmin
} = require('../middleware/auth');
const {
  STATUS_VALUES,
  validateTransition,
  writeHistory,
  updateTargetStatus,
  resolveModuleForTarget
} = require('../lib/workflow');

// =============================================
// Helper: load a submission by id (no auth check).
// Returns the row or null.
// =============================================
const loadSubmission = async (clientOrPool, submissionId) => {
  const r = await clientOrPool.query(
    `SELECT s.*, m.code AS module_code
     FROM dashboard_submissions s
     JOIN dashboard_modules m ON s.module_id = m.id
     WHERE s.id = $1`,
    [submissionId]
  );
  return r.rows[0] || null;
};

// =============================================
// Helper: middleware that resolves the moduleCode from a
// submission id in the URL (:id) and then enforces module
// access at the given level. Admin bypasses.
// =============================================
const checkAccessForSubmission = (requiredLevel = 'viewer') => {
  return async (req, res, next) => {
    try {
      const submissionId = parseInt(req.params.id, 10);
      if (!submissionId || Number.isNaN(submissionId)) {
        return res.status(400).json({ error: 'Invalid submission id.' });
      }
      // Admin bypass
      if (req.user.role && req.user.role.toLowerCase() === 'admin') {
        req.submission = await loadSubmission(pool, submissionId);
        if (!req.submission) {
          return res.status(404).json({ error: 'Submission not found.' });
        }
        return next();
      }
      const sub = await loadSubmission(pool, submissionId);
      if (!sub) {
        return res.status(404).json({ error: 'Submission not found.' });
      }
      // Reuse checkModuleAccess by resolving the code and calling its middleware
      req.submission = sub;
      const mw = checkModuleAccess(sub.module_code, requiredLevel);
      return mw(req, res, next);
    } catch (err) {
      console.error('checkAccessForSubmission error:', err);
      return res.status(500).json({ error: 'Server error during access check.' });
    }
  };
};

// =============================================
// GET /api/dashboards/modules
// List all active dashboard modules. Any authed user.
// =============================================
router.get('/modules', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, code, name, description, sort_order, is_active
       FROM dashboard_modules
       WHERE is_active = true
       ORDER BY sort_order ASC, name ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /modules error:', err);
    res.status(500).json({ error: 'Server error loading modules.' });
  }
});

// =============================================
// GET /api/dashboards/my-access
// Modules the current user can access.
// Admin gets all modules with access_level='admin'.
// =============================================
router.get('/my-access', authenticateToken, async (req, res) => {
  try {
    if (req.user.role && req.user.role.toLowerCase() === 'admin') {
      const result = await pool.query(
        `SELECT id, code, name, description, sort_order, 'admin'::text AS access_level
         FROM dashboard_modules
         WHERE is_active = true
         ORDER BY sort_order ASC, name ASC`
      );
      return res.json(result.rows);
    }
    const result = await pool.query(
      `SELECT m.id, m.code, m.name, m.description, m.sort_order, uma.access_level
       FROM user_module_access uma
       JOIN dashboard_modules m ON uma.module_id = m.id
       WHERE uma.user_id = $1 AND m.is_active = true
       ORDER BY m.sort_order ASC, m.name ASC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /my-access error:', err);
    res.status(500).json({ error: 'Server error loading user access.' });
  }
});

// =============================================
// GET /api/dashboards/:moduleCode/submissions
// List submissions for a module. Optional ?year= &status= filters.
// Requires viewer access (owner satisfies).
// =============================================
router.get('/:moduleCode/submissions', authenticateToken, (req, res, next) => {
  // Apply checkModuleAccess dynamically with the URL param
  return checkModuleAccess(req.params.moduleCode, 'viewer')(req, res, next);
}, async (req, res) => {
  try {
    const { moduleCode } = req.params;
    const { year, status } = req.query;

    const params = [moduleCode];
    let sql = `
      SELECT s.id, s.module_id, m.code AS module_code, s.year, s.month, s.status,
             s.created_by, s.updated_at
      FROM dashboard_submissions s
      JOIN dashboard_modules m ON s.module_id = m.id
      WHERE m.code = $1
    `;
    if (year) {
      params.push(parseInt(year, 10));
      sql += ` AND s.year = $${params.length}`;
    }
    if (status) {
      if (!STATUS_VALUES.includes(status)) {
        return res.status(400).json({ error: `Invalid status filter '${status}'.` });
      }
      params.push(status);
      sql += ` AND s.status = $${params.length}`;
    }
    sql += ' ORDER BY s.year DESC, s.month DESC, s.id DESC';

    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /:moduleCode/submissions error:', err);
    res.status(500).json({ error: 'Server error loading submissions.' });
  }
});

// =============================================
// GET /api/dashboards/submissions/:id
// Full submission detail: submission row + all hr_ops_data + last 20 history rows.
// Requires viewer access on the resolved module (admin bypass).
// =============================================
router.get('/submissions/:id', authenticateToken, checkAccessForSubmission('viewer'), async (req, res) => {
  try {
    const submissionId = parseInt(req.params.id, 10);
    const submission = req.submission;

    const dataR = await pool.query(
      `SELECT section, field_key, value
       FROM hr_ops_data
       WHERE submission_id = $1
       ORDER BY section ASC, field_key ASC`,
      [submissionId]
    );
    const historyR = await pool.query(
      `SELECT id, target_type, target_id, from_state, to_state, action,
              action_by, reason, metadata, created_at
       FROM workflow_history
       WHERE target_type = 'dashboard_submission' AND target_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [submissionId]
    );

    res.json({
      submission,
      data: dataR.rows,
      history: historyR.rows
    });
  } catch (err) {
    console.error('GET /submissions/:id error:', err);
    res.status(500).json({ error: 'Server error loading submission.' });
  }
});

// =============================================
// POST /api/dashboards/:moduleCode/submissions
// Create-or-update a draft submission for (module, year, month).
// Body: { year, month, data: [{section, field_key, value}, ...] }
// Returns: 201 if newly created, 200 if updated existing.
// Body: { submission, data, created: bool }
//
// EDIT LOCKOUT (Option C):
//   - draft     -> editable, status preserved as draft
//   - rejected  -> editable, AUTO-TRANSITIONS to draft (resumed_editing
//                  in workflow_history) as part of the save
//   - submitted, head_reviewed, director_reviewed -> 409 (in-flight)
//   - approved, published -> 409 (locked; admin must use admin-reopen)
//
// hr_ops_data is REPLACED (DELETE then INSERT) inside transaction.
// =============================================
router.post('/:moduleCode/submissions', authenticateToken, (req, res, next) => {
  return checkModuleAccess(req.params.moduleCode, 'owner')(req, res, next);
}, async (req, res) => {
  const { moduleCode } = req.params;
  const { year, month, data } = req.body;

  // Validate input
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ error: 'year is required (integer).' });
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: 'month is required (1-12).' });
  }
  if (!Array.isArray(data)) {
    return res.status(400).json({ error: 'data must be an array of {section, field_key, value} objects.' });
  }
  for (const row of data) {
    if (!row || typeof row.section !== 'string' || typeof row.field_key !== 'string') {
      return res.status(400).json({ error: 'Each data entry needs string section and field_key.' });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Look up module id
    const modR = await client.query('SELECT id FROM dashboard_modules WHERE code = $1', [moduleCode]);
    if (modR.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: `Module '${moduleCode}' not found.` });
    }
    const moduleId = modR.rows[0].id;

    // Look up existing submission for (module, year, month)
    const existingR = await client.query(
      `SELECT * FROM dashboard_submissions
       WHERE module_id = $1 AND year = $2 AND month = $3
       FOR UPDATE`,
      [moduleId, year, month]
    );

    let submission;
    let created = false;

    if (existingR.rows.length === 0) {
      // INSERT new submission as draft. Validate the null -> draft transition.
      const trans = validateTransition(null, 'draft', req.user.role, true);
      if (!trans.valid) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'Illegal state transition',
          from: null, to: 'draft', reason: trans.reason
        });
      }
      const insR = await client.query(
        `INSERT INTO dashboard_submissions (module_id, year, month, status, created_by, updated_at)
         VALUES ($1, $2, $3, 'draft', $4, CURRENT_TIMESTAMP)
         RETURNING *`,
        [moduleId, year, month, req.user.id]
      );
      submission = insR.rows[0];
      created = true;
      await writeHistory(client, {
        target_type: 'dashboard_submission',
        target_id: submission.id,
        from_state: null,
        to_state: 'draft',
        action: 'created',
        action_by: req.user.id,
        metadata: { module_code: moduleCode, year, month }
      });
    } else {
      // EDIT LOCKOUT (Option C, per audit v5.2 queue):
      // Submissions are only editable in draft or rejected states.
      // Approved/published submissions require admin-reopen first.
      // submitted/head_reviewed/director_reviewed are in-flight — no edits.
      const existingStatus = existingR.rows[0].status;
      const editableStates = ['draft', 'rejected'];
      if (!editableStates.includes(existingStatus)) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'Cannot edit submission in current state',
          current_status: existingStatus,
          editable_states: editableStates,
          reason: `Submissions can only be edited when status is 'draft' or 'rejected'. Current status is '${existingStatus}'. Admin can re-open this submission via POST /api/workflow/admin-reopen.`
        });
      }

      // Status is 'draft' or 'rejected'. Proceed.
      submission = existingR.rows[0];

      // Auto-resume: if status is 'rejected', the save itself signals
      // re-engagement. Transition rejected -> draft as part of the save.
      if (existingStatus === 'rejected') {
        const actorIsOwner = (submission.created_by === req.user.id);
        const trans = validateTransition('rejected', 'draft', req.user.role, actorIsOwner);
        if (!trans.valid) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            error: 'Illegal state transition',
            from: 'rejected', to: 'draft', reason: trans.reason
          });
        }
        await updateTargetStatus(client, 'dashboard_submission', submission.id, 'draft');
        await writeHistory(client, {
          target_type: 'dashboard_submission',
          target_id: submission.id,
          from_state: 'rejected',
          to_state: 'draft',
          action: 'resumed_editing',
          action_by: req.user.id,
          metadata: { module_code: moduleCode, year, month }
        });
        submission.status = 'draft';
      }

      // Refresh updated_at (status is 'draft' at this point, either because
      // it was draft to begin with or because we just auto-resumed from rejected).
      const upd = await client.query(
        `UPDATE dashboard_submissions
         SET updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [submission.id]
      );
      submission = upd.rows[0];

      // History row for the save itself (separate from the resume transition above).
      await writeHistory(client, {
        target_type: 'dashboard_submission',
        target_id: submission.id,
        from_state: 'draft',
        to_state: 'draft',
        action: 'saved_draft',
        action_by: req.user.id,
        metadata: { module_code: moduleCode, year, month }
      });
    }

    // REPLACE hr_ops_data for this submission
    // MULTI-USER SAFE SAVE: per-field UPSERT instead of DELETE-all + re-INSERT.
    // The old code wiped the whole month then re-inserted the payload, so a
    // second employee saving a different section would erase the first's work
    // with their stale copy. Now each save MERGES only the sent fields into
    // the month; fields ABSENT from the payload are left untouched.
    // Relies on the existing UNIQUE (submission_id, section, field_key)
    // constraint (initDatabase). A field sent with null/'' upserts to NULL —
    // that's an explicit clear (the frontend only sends fields the user
    // actually changed, sending cleared-to-empty as null; omitted fields
    // are never sent, so they're never touched).
    for (const row of data) {
      await client.query(
        `INSERT INTO hr_ops_data (submission_id, section, field_key, value)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (submission_id, section, field_key)
         DO UPDATE SET value = EXCLUDED.value`,
        [submission.id, row.section, row.field_key, row.value == null ? null : String(row.value)]
      );
    }

    // Read back the data for the response
    const dataR = await client.query(
      `SELECT section, field_key, value FROM hr_ops_data
       WHERE submission_id = $1 ORDER BY section ASC, field_key ASC`,
      [submission.id]
    );

    await client.query('COMMIT');
    res.status(created ? 201 : 200).json({
      submission,
      data: dataR.rows,
      created
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POST /:moduleCode/submissions error:', err);
    res.status(500).json({ error: 'Server error saving submission.' });
  } finally {
    client.release();
  }
});

// =============================================
// POST /api/dashboards/submissions/:id/submit
// Transition submission from draft (or rejected) -> submitted.
// Requires owner access on the resolved module (admin bypass).
// =============================================
router.post('/submissions/:id/submit', authenticateToken, checkAccessForSubmission('owner'), async (req, res) => {
  const submissionId = parseInt(req.params.id, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Re-load FOR UPDATE inside the transaction (fresh state)
    const subR = await client.query(
      'SELECT * FROM dashboard_submissions WHERE id = $1 FOR UPDATE',
      [submissionId]
    );
    if (subR.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Submission not found.' });
    }
    const sub = subR.rows[0];

    const actorIsOwner = (sub.created_by === req.user.id);
    const trans = validateTransition(sub.status, 'submitted', req.user.role, actorIsOwner);
    if (!trans.valid) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Illegal state transition',
        from: sub.status, to: 'submitted', reason: trans.reason
      });
    }

    await updateTargetStatus(client, 'dashboard_submission', submissionId, 'submitted');
    await writeHistory(client, {
      target_type: 'dashboard_submission',
      target_id: submissionId,
      from_state: sub.status,
      to_state: 'submitted',
      action: 'submitted',
      action_by: req.user.id
    });

    const final = await client.query(
      `SELECT s.*, m.code AS module_code
       FROM dashboard_submissions s
       JOIN dashboard_modules m ON s.module_id = m.id
       WHERE s.id = $1`,
      [submissionId]
    );

    await client.query('COMMIT');
    res.status(200).json({
      submission: final.rows[0],
      transition: { from: sub.status, to: 'submitted' }
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POST /submissions/:id/submit error:', err);
    res.status(500).json({ error: 'Server error submitting submission.' });
  } finally {
    client.release();
  }
});

// =============================================
// GET /api/dashboards/:moduleCode/published?year=&month=
// Returns the latest published submission for the given year/month
// of the module, plus its hr_ops_data. 404 if none published.
// Any authed user (published data is org-wide visible per audit 6.4).
// =============================================
router.get('/:moduleCode/published', authenticateToken, async (req, res) => {
  try {
    const { moduleCode } = req.params;
    const { year, month } = req.query;
    if (!year || !month) {
      return res.status(400).json({ error: 'year and month are required query params.' });
    }
    const yr = parseInt(year, 10);
    const mo = parseInt(month, 10);
    if (Number.isNaN(yr) || Number.isNaN(mo) || mo < 1 || mo > 12) {
      return res.status(400).json({ error: 'year/month must be valid integers (month 1-12).' });
    }

    const subR = await pool.query(
      `SELECT s.*, m.code AS module_code
       FROM dashboard_submissions s
       JOIN dashboard_modules m ON s.module_id = m.id
       WHERE m.code = $1 AND s.year = $2 AND s.month = $3 AND s.status = 'published'
       ORDER BY s.updated_at DESC
       LIMIT 1`,
      [moduleCode, yr, mo]
    );
    if (subR.rows.length === 0) {
      return res.status(404).json({ error: 'No published submission for that module/year/month.' });
    }
    const sub = subR.rows[0];
    const dataR = await pool.query(
      `SELECT section, field_key, value FROM hr_ops_data
       WHERE submission_id = $1 ORDER BY section ASC, field_key ASC`,
      [sub.id]
    );
    res.json({ submission: sub, data: dataR.rows });
  } catch (err) {
    console.error('GET /:moduleCode/published error:', err);
    res.status(500).json({ error: 'Server error loading published submission.' });
  }
});

// =============================================
// GET /api/dashboards/:moduleCode/trends?field_key=&year=
// Returns time-series [{month, value}, ...] from published submissions
// only, for the given field_key across the given year.
// Requires viewer access (owner satisfies).
// =============================================
router.get('/:moduleCode/trends', authenticateToken, (req, res, next) => {
  return checkModuleAccess(req.params.moduleCode, 'viewer')(req, res, next);
}, async (req, res) => {
  try {
    const { moduleCode } = req.params;
    const { field_key, year } = req.query;
    if (!field_key || !year) {
      return res.status(400).json({ error: 'field_key and year are required query params.' });
    }
    const yr = parseInt(year, 10);
    if (Number.isNaN(yr)) {
      return res.status(400).json({ error: 'year must be a valid integer.' });
    }

    const r = await pool.query(
      `SELECT s.month, d.value
       FROM dashboard_submissions s
       JOIN dashboard_modules m ON s.module_id = m.id
       JOIN hr_ops_data d ON d.submission_id = s.id
       WHERE m.code = $1 AND s.year = $2 AND s.status = 'published' AND d.field_key = $3
       ORDER BY s.month ASC`,
      [moduleCode, yr, field_key]
    );
    res.json(r.rows);
  } catch (err) {
    console.error('GET /:moduleCode/trends error:', err);
    res.status(500).json({ error: 'Server error loading trends.' });
  }
});

// =============================================
// GET /api/dashboards/pending-approval
// All submissions currently awaiting review (status='submitted').
// Admin-only in Phase 0. Function_head/hr_director-scoped views
// come in Phase 3 (separate endpoints).
// =============================================
router.get('/pending-approval', authenticateToken, isAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT s.id, s.module_id, m.code AS module_code, s.year, s.month, s.status,
              s.created_by, s.updated_at
       FROM dashboard_submissions s
       JOIN dashboard_modules m ON s.module_id = m.id
       WHERE s.status = 'submitted'
       ORDER BY s.updated_at ASC`
    );
    res.json(r.rows);
  } catch (err) {
    console.error('GET /pending-approval error:', err);
    res.status(500).json({ error: 'Server error loading pending queue.' });
  }
});

// =============================================
// GET /api/dashboards/admin-queue
// PHASE 2C. Admin-only full pipeline queue across ALL modules.
// Returns every non-draft, non-rejected submission:
//   status IN (submitted, head_reviewed, director_reviewed, approved, published)
//
// Distinct from pending-approval (which stays submitted-only per its
// existing contract — Rule 10; confirmed unused by any UI but preserved).
//
// Row shape:
//   id, module_id, module_code, module_name, year, month, status,
//   created_by, owner_name, owner_role, updated_at,
//   last_action_at, last_action_by_name  (latest workflow_history entry)
//
// The lateral join grabs the most recent workflow_history row per
// submission so the UI can show "Reviewed by X · 2h ago" without a
// second round-trip. Cheap: one indexed lookup per returned row
// (idx_workflow_history_target covers target_type+target_id).
// =============================================
router.get('/admin-queue', authenticateToken, isAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT s.id, s.module_id, m.code AS module_code, m.name AS module_name,
              s.year, s.month, s.status, s.created_by,
              u.name AS owner_name, u.role AS owner_role,
              s.updated_at,
              wh.created_at AS last_action_at,
              au.name AS last_action_by_name
       FROM dashboard_submissions s
       JOIN dashboard_modules m ON s.module_id = m.id
       LEFT JOIN users u ON s.created_by = u.id
       LEFT JOIN LATERAL (
         SELECT h.created_at, h.action_by
         FROM workflow_history h
         WHERE h.target_type = 'dashboard_submission' AND h.target_id = s.id
         ORDER BY h.created_at DESC, h.id DESC
         LIMIT 1
       ) wh ON true
       LEFT JOIN users au ON wh.action_by = au.id
       WHERE s.status IN ('submitted','head_reviewed','director_reviewed','approved','published')
       ORDER BY s.updated_at DESC`
    );
    res.json(r.rows);
  } catch (err) {
    console.error('GET /admin-queue error:', err);
    res.status(500).json({ error: 'Server error loading admin queue.' });
  }
});

// =============================================
// MODULE ENGINE (Step 2a) — grid_labels endpoints
// =============================================
// Editable department/source/status labels for the 'labeled_grid' engine
// type. Gated by checkModuleAccessParam('owner') — owners of the module +
// admins only. Every query is scoped by module_code so one module's owner
// cannot read or mutate another module's labels. Rename keeps the stable id
// (historical values stay linked); delete is a soft-hide; restore reactivates.

// Helper: 404 if the module code isn't a real dashboard_modules row.
async function assertModuleExists(moduleCode) {
  const m = await pool.query('SELECT id FROM dashboard_modules WHERE code = $1', [moduleCode]);
  return m.rows.length > 0;
}

// GET /:moduleCode/labels?section=<key>&includeHidden=<bool>
router.get('/:moduleCode/labels', authenticateToken, checkModuleAccessParam('owner'), async (req, res) => {
  try {
    const { moduleCode } = req.params;
    const { section, includeHidden } = req.query;
    if (!(await assertModuleExists(moduleCode))) {
      return res.status(404).json({ error: `Unknown module '${moduleCode}'.` });
    }

    const params = [moduleCode];
    let sql = 'SELECT id, module_code, section_key, label, sort_order, is_active, created_by, created_at, updated_at FROM grid_labels WHERE module_code = $1';
    if (section) {
      params.push(section);
      sql += ` AND section_key = $${params.length}`;
    }
    if (String(includeHidden) !== 'true') {
      sql += ' AND is_active = true';
    }
    sql += ' ORDER BY sort_order ASC, id ASC';

    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (err) {
    console.error('GET /:moduleCode/labels error:', err);
    res.status(500).json({ error: 'Server error loading labels.' });
  }
});

// POST /:moduleCode/labels  { section_key, label }
router.post('/:moduleCode/labels', authenticateToken, checkModuleAccessParam('owner'), async (req, res) => {
  try {
    const { moduleCode } = req.params;
    const { section_key, label } = req.body;
    if (!(await assertModuleExists(moduleCode))) {
      return res.status(404).json({ error: `Unknown module '${moduleCode}'.` });
    }
    if (!section_key || !String(section_key).trim()) {
      return res.status(400).json({ error: 'section_key is required.' });
    }
    if (!label || !String(label).trim()) {
      return res.status(400).json({ error: 'label cannot be empty.' });
    }

    // Next sort_order within this module+section (append to end).
    const ord = await pool.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM grid_labels WHERE module_code = $1 AND section_key = $2',
      [moduleCode, section_key]
    );
    const nextOrder = ord.rows[0].next;

    const r = await pool.query(
      `INSERT INTO grid_labels (module_code, section_key, label, sort_order, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, module_code, section_key, label, sort_order, is_active, created_by, created_at, updated_at`,
      [moduleCode, section_key.trim(), label.trim(), nextOrder, req.user.id]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('POST /:moduleCode/labels error:', err);
    res.status(500).json({ error: 'Server error adding label.' });
  }
});

// PUT /:moduleCode/labels/:id  { label }  — RENAME (id stays stable)
router.put('/:moduleCode/labels/:id', authenticateToken, checkModuleAccessParam('owner'), async (req, res) => {
  try {
    const { moduleCode, id } = req.params;
    const { label } = req.body;
    if (!label || !String(label).trim()) {
      return res.status(400).json({ error: 'label cannot be empty.' });
    }
    // Scoped by module_code so an owner can't rename another module's label.
    const r = await pool.query(
      `UPDATE grid_labels
       SET label = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND module_code = $3
       RETURNING id, module_code, section_key, label, sort_order, is_active, created_by, created_at, updated_at`,
      [label.trim(), id, moduleCode]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ error: 'Label not found for this module.' });
    }
    res.json(r.rows[0]);
  } catch (err) {
    console.error('PUT /:moduleCode/labels/:id error:', err);
    res.status(500).json({ error: 'Server error renaming label.' });
  }
});

// DELETE /:moduleCode/labels/:id  — SOFT-HIDE (never hard-delete)
router.delete('/:moduleCode/labels/:id', authenticateToken, checkModuleAccessParam('owner'), async (req, res) => {
  try {
    const { moduleCode, id } = req.params;
    const r = await pool.query(
      `UPDATE grid_labels
       SET is_active = false, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND module_code = $2
       RETURNING id`,
      [id, moduleCode]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ error: 'Label not found for this module.' });
    }
    res.json({ message: 'Label hidden.', id: r.rows[0].id });
  } catch (err) {
    console.error('DELETE /:moduleCode/labels/:id error:', err);
    res.status(500).json({ error: 'Server error hiding label.' });
  }
});

// POST /:moduleCode/labels/:id/restore  — un-hide
router.post('/:moduleCode/labels/:id/restore', authenticateToken, checkModuleAccessParam('owner'), async (req, res) => {
  try {
    const { moduleCode, id } = req.params;
    const r = await pool.query(
      `UPDATE grid_labels
       SET is_active = true, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND module_code = $2
       RETURNING id, module_code, section_key, label, sort_order, is_active, created_by, created_at, updated_at`,
      [id, moduleCode]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ error: 'Label not found for this module.' });
    }
    res.json(r.rows[0]);
  } catch (err) {
    console.error('POST /:moduleCode/labels/:id/restore error:', err);
    res.status(500).json({ error: 'Server error restoring label.' });
  }
});

// =============================================
// DASHBOARD BUILDER (Step B1) — GET /:moduleCode/structure
// =============================================
// Returns the ACTIVE module structure: ordered sections, each with its
// ordered active fields. This is what the B2 renderer consumes instead of
// the hard-coded config file. Gated viewer-or-above (admin bypass) — any
// user who can see the module can read its structure. Read-only; changes
// nothing. Targets are NOT included here (they live in field_targets,
// linked by module_code + key).
// =============================================
router.get('/:moduleCode/structure', authenticateToken, checkModuleAccessParam('viewer'), async (req, res) => {
  try {
    const { moduleCode } = req.params;
    // B3b-1: admins managing structure can request hidden rows too. Default
    // (no param) is active-only — byte-identical to the original behavior.
    const includeHidden = String(req.query.includeHidden) === 'true';

    // Module must exist.
    const m = await pool.query('SELECT id FROM dashboard_modules WHERE code = $1', [moduleCode]);
    if (m.rows.length === 0) {
      return res.status(404).json({ error: `Unknown module '${moduleCode}'.` });
    }

    const sectionsRes = await pool.query(
      `SELECT id, key, title, layout, sort_order, is_active
       FROM module_sections
       WHERE module_code = $1 ${includeHidden ? '' : 'AND is_active = true'}
       ORDER BY sort_order ASC, id ASC`,
      [moduleCode]
    );

    const fieldsRes = await pool.query(
      `SELECT id, section_id, key, label, type, unit,
              dimension, dimension_row, dimension_col,
              source, formula_type, formula_args, subsection, sort_order, is_active
       FROM module_fields
       WHERE module_code = $1 ${includeHidden ? '' : 'AND is_active = true'}
       ORDER BY sort_order ASC, id ASC`,
      [moduleCode]
    );

    // Group fields under their section (ordered).
    const fieldsBySection = {};
    for (const f of fieldsRes.rows) {
      if (!fieldsBySection[f.section_id]) fieldsBySection[f.section_id] = [];
      fieldsBySection[f.section_id].push(f);
    }

    const sections = sectionsRes.rows.map((s) => ({
      id: s.id,
      key: s.key,
      title: s.title,
      layout: s.layout,
      sort_order: s.sort_order,
      is_active: s.is_active,
      fields: (fieldsBySection[s.id] || []).map((f) => ({
        id: f.id,
        key: f.key,
        label: f.label,
        type: f.type,
        unit: f.unit,
        dimension: f.dimension,
        dimension_row: f.dimension_row,
        dimension_col: f.dimension_col,
        source: f.source,
        formula_type: f.formula_type,
        formula_args: f.formula_args,
        subsection: f.subsection,
        sort_order: f.sort_order,
        is_active: f.is_active,
      })),
    }));

    res.json({ module_code: moduleCode, sections });
  } catch (err) {
    console.error('GET /:moduleCode/structure error:', err);
    res.status(500).json({ error: 'Server error loading module structure.' });
  }
});

// =============================================
// DASHBOARD BUILDER (Step B3a) — structure CRUD (ADMIN ONLY)
// =============================================
// Write endpoints for module_sections / module_fields. Admin-gated
// (structure editing is admin-only). Every query scoped by module_code so
// a module can't touch another's structure. Keys are IMMUTABLE after create
// (the storage contract — values are keyed by them); only labels/attributes
// change. All deletes are SOFT (is_active=false) to protect historical
// values. The existing viewer-gated /structure READ endpoint is unchanged.
// =============================================

const VALID_SECTION_LAYOUTS = ['kpi', 'ho_op', 'labeled_grid', 'matrix', 'group'];
const VALID_FIELD_TYPES = ['number', 'percentage', 'currency', 'text', 'longtext', 'ratio'];

// Stable slug from a human label: lowercase, non-alphanumerics → underscore.
function slugify(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100) || 'item';
}

// Ensure a candidate key is unique within a scope; append _2, _3, … if not.
// existingKeys is a Set of keys already in use in the scope.
function uniqueKey(base, existingKeys) {
  if (!existingKeys.has(base)) return base;
  let n = 2;
  while (existingKeys.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

// ---------- SECTION endpoints ----------

// POST /:moduleCode/sections  { key?, title, layout, sort_order? }
router.post('/:moduleCode/sections', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { moduleCode } = req.params;
    const { key, title, layout, sort_order } = req.body;
    if (!(await assertModuleExists(moduleCode))) {
      return res.status(404).json({ error: `Unknown module '${moduleCode}'.` });
    }
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'title cannot be empty.' });
    }
    if (!layout || !VALID_SECTION_LAYOUTS.includes(layout)) {
      return res.status(400).json({ error: `layout must be one of: ${VALID_SECTION_LAYOUTS.join(', ')}.` });
    }

    // Resolve a unique key within the module (across active + inactive, so a
    // restored section never collides). Key is immutable hereafter.
    const existing = await pool.query('SELECT key FROM module_sections WHERE module_code = $1', [moduleCode]);
    const usedKeys = new Set(existing.rows.map((r) => r.key));
    const baseKey = key && String(key).trim() ? slugify(key) : slugify(title);
    const finalKey = uniqueKey(baseKey, usedKeys);

    // Default sort_order = end of the active list.
    let order = sort_order;
    if (order == null) {
      const ord = await pool.query(
        'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM module_sections WHERE module_code = $1 AND is_active = true',
        [moduleCode]
      );
      order = ord.rows[0].next;
    }

    const r = await pool.query(
      `INSERT INTO module_sections (module_code, key, title, layout, sort_order, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, module_code, key, title, layout, sort_order, is_active`,
      [moduleCode, finalKey, title.trim(), layout, order, req.user.id]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('POST /:moduleCode/sections error:', err);
    res.status(500).json({ error: 'Server error creating section.' });
  }
});

// PUT /:moduleCode/sections/reorder  { orderedIds:[...] }
// NOTE: declared BEFORE '/sections/:id' so 'reorder' isn't captured as :id.
router.put('/:moduleCode/sections/reorder', authenticateToken, isAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { moduleCode } = req.params;
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ error: 'orderedIds must be an array.' });
    }
    await client.query('BEGIN');
    for (let i = 0; i < orderedIds.length; i++) {
      await client.query(
        'UPDATE module_sections SET sort_order = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND module_code = $3',
        [i + 1, orderedIds[i], moduleCode]
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'Sections reordered.', count: orderedIds.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('PUT /:moduleCode/sections/reorder error:', err);
    res.status(500).json({ error: 'Server error reordering sections.' });
  } finally {
    client.release();
  }
});

// PUT /:moduleCode/sections/:id  { title?, layout?, sort_order? }  (key IMMUTABLE)
router.put('/:moduleCode/sections/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { moduleCode, id } = req.params;
    const { title, layout, sort_order } = req.body;
    if (title !== undefined && !String(title).trim()) {
      return res.status(400).json({ error: 'title cannot be empty.' });
    }
    if (layout !== undefined && !VALID_SECTION_LAYOUTS.includes(layout)) {
      return res.status(400).json({ error: `layout must be one of: ${VALID_SECTION_LAYOUTS.join(', ')}.` });
    }
    const r = await pool.query(
      `UPDATE module_sections
       SET title = COALESCE($1, title),
           layout = COALESCE($2, layout),
           sort_order = COALESCE($3, sort_order),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND module_code = $5
       RETURNING id, module_code, key, title, layout, sort_order, is_active`,
      [title !== undefined ? title.trim() : null, layout ?? null, sort_order ?? null, id, moduleCode]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ error: 'Section not found for this module.' });
    }
    res.json(r.rows[0]);
  } catch (err) {
    console.error('PUT /:moduleCode/sections/:id error:', err);
    res.status(500).json({ error: 'Server error updating section.' });
  }
});

// DELETE /:moduleCode/sections/:id  → soft-hide (fields stay linked)
router.delete('/:moduleCode/sections/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { moduleCode, id } = req.params;
    const r = await pool.query(
      `UPDATE module_sections SET is_active = false, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND module_code = $2 RETURNING id`,
      [id, moduleCode]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ error: 'Section not found for this module.' });
    }
    res.json({ message: 'Section hidden.', id: r.rows[0].id });
  } catch (err) {
    console.error('DELETE /:moduleCode/sections/:id error:', err);
    res.status(500).json({ error: 'Server error hiding section.' });
  }
});

// POST /:moduleCode/sections/:id/restore
router.post('/:moduleCode/sections/:id/restore', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { moduleCode, id } = req.params;
    const r = await pool.query(
      `UPDATE module_sections SET is_active = true, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND module_code = $2
       RETURNING id, module_code, key, title, layout, sort_order, is_active`,
      [id, moduleCode]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ error: 'Section not found for this module.' });
    }
    res.json(r.rows[0]);
  } catch (err) {
    console.error('POST /:moduleCode/sections/:id/restore error:', err);
    res.status(500).json({ error: 'Server error restoring section.' });
  }
});

// ---------- FIELD endpoints ----------

// PUT /:moduleCode/fields/reorder  { orderedIds:[...] }
// Declared BEFORE '/fields/:id' so 'reorder' isn't captured as :id.
router.put('/:moduleCode/fields/reorder', authenticateToken, isAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { moduleCode } = req.params;
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ error: 'orderedIds must be an array.' });
    }
    await client.query('BEGIN');
    for (let i = 0; i < orderedIds.length; i++) {
      await client.query(
        'UPDATE module_fields SET sort_order = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND module_code = $3',
        [(i + 1) * 10, orderedIds[i], moduleCode]
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'Fields reordered.', count: orderedIds.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('PUT /:moduleCode/fields/reorder error:', err);
    res.status(500).json({ error: 'Server error reordering fields.' });
  } finally {
    client.release();
  }
});

// POST /:moduleCode/sections/:sectionId/fields
router.post('/:moduleCode/sections/:sectionId/fields', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { moduleCode, sectionId } = req.params;
    const {
      key, label, type, unit, source, formula_type, formula_args,
      dimension, dimension_row, dimension_col, subsection, sort_order,
    } = req.body;

    if (!(await assertModuleExists(moduleCode))) {
      return res.status(404).json({ error: `Unknown module '${moduleCode}'.` });
    }
    // Section must exist and belong to this module.
    const sec = await pool.query(
      'SELECT id FROM module_sections WHERE id = $1 AND module_code = $2',
      [sectionId, moduleCode]
    );
    if (sec.rows.length === 0) {
      return res.status(404).json({ error: 'Section not found for this module.' });
    }
    if (!label || !String(label).trim()) {
      return res.status(400).json({ error: 'label cannot be empty.' });
    }
    if (!type || !VALID_FIELD_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${VALID_FIELD_TYPES.join(', ')}.` });
    }

    // Unique key within (module, section) across active + inactive.
    const existing = await pool.query(
      'SELECT key FROM module_fields WHERE module_code = $1 AND section_id = $2',
      [moduleCode, sectionId]
    );
    const usedKeys = new Set(existing.rows.map((r) => r.key));
    const baseKey = key && String(key).trim() ? slugify(key) : slugify(label);
    const finalKey = uniqueKey(baseKey, usedKeys);

    let order = sort_order;
    if (order == null) {
      const ord = await pool.query(
        'SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM module_fields WHERE module_code = $1 AND section_id = $2 AND is_active = true',
        [moduleCode, sectionId]
      );
      order = ord.rows[0].next;
    }

    const r = await pool.query(
      `INSERT INTO module_fields
         (module_code, section_id, key, label, type, unit, dimension, dimension_row, dimension_col,
          source, formula_type, formula_args, subsection, sort_order, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id, module_code, section_id, key, label, type, unit, dimension, dimension_row,
                 dimension_col, source, formula_type, formula_args, subsection, sort_order, is_active`,
      [
        moduleCode, sectionId, finalKey, label.trim(), type, unit ?? null,
        dimension ?? null, dimension_row ?? null, dimension_col ?? null,
        source ?? 'manual', formula_type ?? null,
        formula_args ? JSON.stringify(formula_args) : null,
        subsection ?? null, order, req.user.id,
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('POST /:moduleCode/sections/:sectionId/fields error:', err);
    res.status(500).json({ error: 'Server error creating field.' });
  }
});

// PUT /:moduleCode/fields/:id  (key IMMUTABLE; section_id present = move)
router.put('/:moduleCode/fields/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { moduleCode, id } = req.params;
    const {
      label, type, unit, source, formula_type, formula_args,
      dimension, dimension_row, dimension_col, subsection, sort_order, section_id,
    } = req.body;

    if (label !== undefined && !String(label).trim()) {
      return res.status(400).json({ error: 'label cannot be empty.' });
    }
    if (type !== undefined && !VALID_FIELD_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${VALID_FIELD_TYPES.join(', ')}.` });
    }
    // If moving sections, the target section must belong to this module.
    if (section_id !== undefined && section_id !== null) {
      const sec = await pool.query(
        'SELECT id FROM module_sections WHERE id = $1 AND module_code = $2',
        [section_id, moduleCode]
      );
      if (sec.rows.length === 0) {
        return res.status(404).json({ error: 'Target section not found for this module.' });
      }
    }

    // formula_args: only touch when the caller sends the key (allow explicit null).
    const hasFormulaArgs = Object.prototype.hasOwnProperty.call(req.body, 'formula_args');
    const formulaArgsSql = hasFormulaArgs
      ? (formula_args ? JSON.stringify(formula_args) : null)
      : null;
    // formula_type: same treatment — allow explicit null so a computed→simple
    // switch can clear it (COALESCE alone can't null). B4.
    const hasFormulaType = Object.prototype.hasOwnProperty.call(req.body, 'formula_type');

    const r = await pool.query(
      `UPDATE module_fields
       SET label = COALESCE($1, label),
           type = COALESCE($2, type),
           unit = COALESCE($3, unit),
           source = COALESCE($4, source),
           formula_type = CASE WHEN $5 THEN $6 ELSE formula_type END,
           formula_args = CASE WHEN $7 THEN $8::jsonb ELSE formula_args END,
           dimension = COALESCE($9, dimension),
           dimension_row = COALESCE($10, dimension_row),
           dimension_col = COALESCE($11, dimension_col),
           subsection = COALESCE($12, subsection),
           sort_order = COALESCE($13, sort_order),
           section_id = COALESCE($14, section_id),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $15 AND module_code = $16
       RETURNING id, module_code, section_id, key, label, type, unit, dimension, dimension_row,
                 dimension_col, source, formula_type, formula_args, subsection, sort_order, is_active`,
      [
        label !== undefined ? label.trim() : null,
        type ?? null, unit ?? null, source ?? null,
        hasFormulaType, (hasFormulaType ? (formula_type ?? null) : null),
        hasFormulaArgs, formulaArgsSql,
        dimension ?? null, dimension_row ?? null, dimension_col ?? null,
        subsection ?? null, sort_order ?? null, section_id ?? null,
        id, moduleCode,
      ]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ error: 'Field not found for this module.' });
    }
    res.json(r.rows[0]);
  } catch (err) {
    console.error('PUT /:moduleCode/fields/:id error:', err);
    res.status(500).json({ error: 'Server error updating field.' });
  }
});

// DELETE /:moduleCode/fields/:id  → soft-hide
router.delete('/:moduleCode/fields/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { moduleCode, id } = req.params;
    const r = await pool.query(
      `UPDATE module_fields SET is_active = false, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND module_code = $2 RETURNING id`,
      [id, moduleCode]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ error: 'Field not found for this module.' });
    }
    res.json({ message: 'Field hidden.', id: r.rows[0].id });
  } catch (err) {
    console.error('DELETE /:moduleCode/fields/:id error:', err);
    res.status(500).json({ error: 'Server error hiding field.' });
  }
});

// POST /:moduleCode/fields/:id/restore
router.post('/:moduleCode/fields/:id/restore', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { moduleCode, id } = req.params;
    const r = await pool.query(
      `UPDATE module_fields SET is_active = true, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND module_code = $2
       RETURNING id, module_code, section_id, key, label, type, unit, dimension, dimension_row,
                 dimension_col, source, formula_type, formula_args, subsection, sort_order, is_active`,
      [id, moduleCode]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ error: 'Field not found for this module.' });
    }
    res.json(r.rows[0]);
  } catch (err) {
    console.error('POST /:moduleCode/fields/:id/restore error:', err);
    res.status(500).json({ error: 'Server error restoring field.' });
  }
});

module.exports = router;
