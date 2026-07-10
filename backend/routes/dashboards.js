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

module.exports = router;
