// =============================================
// Workflow Routes (Phase 0 - module-agnostic)
// =============================================
// Module-agnostic workflow endpoints. Operates against any
// target_type registered in workflow_targets with workflow_active=true.
// Phase 0 active target_types: 'dashboard_submission'.
// Phase 0 dormant target_types: 'activity_completion' (workflow_active=false).
//
// HR Dashboards-specific endpoints (save draft, submit, listings,
// trends, published, pending) live in routes/dashboards.js.
//
// All state-changing routes use BEGIN/COMMIT transactions and
// write a workflow_history row inside the same transaction.
// All transitions go through lib/workflow.validateTransition().
// =============================================

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const {
  authenticateToken,
  isAdmin
} = require('../middleware/auth');
const {
  validateTransition,
  writeHistory,
  updateTargetStatus,
  getWorkflowTarget,
  getTargetRow,
  resolveModuleForTarget,
  STATUS_VALUES
} = require('../lib/workflow');

// =============================================
// Helper: check user has at least viewer access on a module code.
// Returns true/false. Admin always returns true.
// Used by GET /history for non-admin reads.
// =============================================
const userHasModuleAccess = async (userId, userRole, moduleCode) => {
  if (userRole && userRole.toLowerCase() === 'admin') return true;
  const r = await pool.query(
    `SELECT 1
     FROM user_module_access uma
     JOIN dashboard_modules m ON uma.module_id = m.id
     WHERE uma.user_id = $1 AND m.code = $2`,
    [userId, moduleCode]
  );
  return r.rowCount > 0;
};

// =============================================
// Helper: validate the common body shape for state-changing endpoints.
// Returns { ok: bool, error?: string }
// =============================================
const validateActionBody = (body, { reasonRequired }) => {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body required.' };
  }
  const { target_type, target_id, reason } = body;
  if (typeof target_type !== 'string' || target_type.length === 0) {
    return { ok: false, error: 'target_type (string) is required.' };
  }
  const tid = parseInt(target_id, 10);
  if (!Number.isInteger(tid) || tid <= 0) {
    return { ok: false, error: 'target_id (positive integer) is required.' };
  }
  if (reasonRequired) {
    if (typeof reason !== 'string' || reason.trim().length === 0) {
      return { ok: false, error: 'reason (non-empty string) is required for this action.' };
    }
  }
  return { ok: true };
};

// =============================================
// Internal helper: perform a generic admin transition.
// Used by admin-approve, admin-reject, admin-reopen.
// Encapsulates the BEGIN/lookup/validate/update/history/COMMIT
// pattern so the three endpoints don't duplicate it.
//
// opts: {
//   target_type, target_id, toState, action, reason, actorUserId, actorRole,
//   preTransitionGuard?: (currentStatus) => { ok: bool, error?: string, status?: 409|400|... }
// }
//
// Returns { http: number, body: object } for the route to send.
// =============================================
const performAdminTransition = async (opts) => {
  const {
    target_type,
    target_id,
    toState,
    action,
    reason,
    actorUserId,
    actorRole,
    preTransitionGuard
  } = opts;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Workflow registry check
    const wt = await getWorkflowTarget(client, target_type);
    if (!wt) {
      await client.query('ROLLBACK');
      return {
        http: 400,
        body: { error: `Unknown target_type '${target_type}'. Not registered in workflow_targets.` }
      };
    }
    if (!wt.workflow_active) {
      await client.query('ROLLBACK');
      return {
        http: 400,
        body: {
          error: `Workflow is not active for target_type '${target_type}'.`,
          hint: 'Activate via workflow_targets.workflow_active=true when ready (see audit Section 6.8).'
        }
      };
    }

    // 2. Load the target row (with FOR UPDATE if dashboard_submission)
    let targetRow;
    try {
      // FOR UPDATE only on tables we know support it (the workflow tables).
      // Use a separate query path to add FOR UPDATE without polluting the helper.
      if (target_type === 'dashboard_submission') {
        const r = await client.query(
          'SELECT * FROM dashboard_submissions WHERE id = $1 FOR UPDATE',
          [target_id]
        );
        targetRow = r.rows[0] || null;
      } else {
        targetRow = await getTargetRow(client, target_type, target_id);
      }
    } catch (lookupErr) {
      await client.query('ROLLBACK');
      console.error('performAdminTransition: target lookup failed:', lookupErr);
      return {
        http: 500,
        body: { error: 'Failed to load target row.', detail: lookupErr.message }
      };
    }

    if (!targetRow) {
      await client.query('ROLLBACK');
      return {
        http: 404,
        body: { error: `Target row not found: ${target_type}#${target_id}` }
      };
    }

    const currentStatus = targetRow.status;

    // 3. Optional pre-transition guard (used by admin-reopen to enforce
    //    "current status must be approved or published")
    if (typeof preTransitionGuard === 'function') {
      const guard = preTransitionGuard(currentStatus);
      if (!guard.ok) {
        await client.query('ROLLBACK');
        return {
          http: guard.status || 409,
          body: {
            error: guard.error,
            current_status: currentStatus,
            target_type,
            target_id
          }
        };
      }
    }

    // 4. Validate transition. actorIsOwner defaults to true for the admin
    //    handlers (unchanged); the generic /transition endpoint passes the real
    //    ownership (created_by === actor) so owner-gated transitions work.
    const actorIsOwner = (opts.actorIsOwner !== undefined) ? opts.actorIsOwner : true;
    const trans = validateTransition(currentStatus, toState, actorRole, actorIsOwner);
    if (!trans.valid) {
      await client.query('ROLLBACK');
      return {
        http: 409,
        body: {
          error: 'Illegal state transition',
          from: currentStatus,
          to: toState,
          reason: trans.reason,
          target_type,
          target_id
        }
      };
    }

    // 5. Update + history (atomic)
    await updateTargetStatus(client, target_type, target_id, toState);
    await writeHistory(client, {
      target_type,
      target_id,
      from_state: currentStatus,
      to_state: toState,
      action,
      action_by: actorUserId,
      reason: reason || null
    });

    await client.query('COMMIT');
    return {
      http: 200,
      body: {
        ok: true,
        target_type,
        target_id,
        from_state: currentStatus,
        to_state: toState,
        reason: reason || null
      }
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('performAdminTransition error:', err);
    return {
      http: 500,
      body: { error: 'Server error during workflow transition.', detail: err.message }
    };
  } finally {
    client.release();
  }
};

// =============================================
// POST /api/workflow/transition  (Phase 3 Round 2a)
// Generic transition: executes ANY transition allowed by validateTransition,
// which already encodes who-can-do-what (ALLOWED_TRANSITIONS). This single
// endpoint powers the non-admin review chain — function_head
// (submitted -> head_reviewed), hr_director (head_reviewed -> director_reviewed),
// owner resume (rejected -> draft) — and any role's allowed transition. Admin
// may also use it, but the admin-* endpoints remain for the admin queue.
// Body: { target_type, target_id, to_state, reason?: string }
// Gating is entirely validateTransition's (role + ownership); 403 on invalid.
// =============================================
router.post('/transition', authenticateToken, async (req, res) => {
  const v = validateActionBody(req.body, { reasonRequired: false });
  if (!v.ok) return res.status(400).json({ error: v.error });

  const { target_type, target_id, to_state, reason } = req.body;
  if (typeof to_state !== 'string' || to_state.length === 0) {
    return res.status(400).json({ error: 'to_state (string) is required.' });
  }
  const tid = parseInt(target_id, 10);

  // Determine ownership for owner-gated transitions (e.g. rejected -> draft).
  // Only dashboard_submission carries created_by here; load it to compare.
  let actorIsOwner = false;
  if (target_type === 'dashboard_submission') {
    try {
      const r = await pool.query('SELECT created_by FROM dashboard_submissions WHERE id = $1', [tid]);
      if (r.rows.length === 0) {
        return res.status(404).json({ error: `Target row not found: ${target_type}#${tid}` });
      }
      actorIsOwner = (r.rows[0].created_by === req.user.id);
    } catch (err) {
      console.error('POST /transition ownership lookup failed:', err);
      return res.status(500).json({ error: 'Failed to load target row.' });
    }
  }

  // Reuse the same atomic helper as the admin handlers (workflow-active check,
  // FOR UPDATE load, validateTransition, update + workflow_history, commit).
  // validateTransition returns a 403-worthy reason; map its 409 to 403 so the
  // caller sees an authorization error for a disallowed transition.
  const result = await performAdminTransition({
    target_type,
    target_id: tid,
    toState: to_state,
    action: 'transition',
    reason: (typeof reason === 'string' && reason.trim() !== '') ? reason.trim() : null,
    actorUserId: req.user.id,
    actorRole: req.user.role,
    actorIsOwner,
  });
  // An illegal/ unauthorized transition comes back as 409 'Illegal state
  // transition'; surface it as 403 (the actor isn't permitted) per the spec.
  const http = (result.http === 409 && result.body && result.body.error === 'Illegal state transition') ? 403 : result.http;
  const body = (http === 403)
    ? { error: (result.body && result.body.reason) || 'Transition not allowed.', from: result.body && result.body.from, to: result.body && result.body.to }
    : result.body;
  res.status(http).json(body);
});

// =============================================
// GET /api/workflow/my-inbox  (Round 2b)
// Returns submissions on which the CURRENT user can take the next action,
// computed via validateTransition (so it mirrors the chain exactly): a
// function_head sees 'submitted' (→ head_reviewed), hr_director sees
// 'head_reviewed' (→ director_reviewed), an owner sees their 'rejected' (→
// draft resume), admin sees all in-flight with their full actions. Each row
// has the admin-queue shape + allowedActions:[to_state,...]. Only rows with
// ≥1 allowed action for this user are returned.
// =============================================
router.get('/my-inbox', authenticateToken, async (req, res) => {
  try {
    // Candidate rows: in-flight states + the user's own rejected/draft. Same
    // join shape as dashboards admin-queue (module + owner + last action).
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
          OR (s.created_by = $1 AND s.status IN ('rejected','draft'))
       ORDER BY s.updated_at DESC`,
      [req.user.id]
    );

    const role = req.user.role;
    // Candidate to_states to probe for each row (every known status except the
    // from-state); validateTransition decides which are actually allowed for
    // this role+ownership.
    const candidateStates = Array.isArray(STATUS_VALUES) ? STATUS_VALUES : [];
    const inbox = [];
    for (const row of r.rows) {
      const actorIsOwner = row.created_by === req.user.id;
      const allowedActions = candidateStates.filter((to) => {
        if (to === row.status) return false;
        const t = validateTransition(row.status, to, role, actorIsOwner);
        return t && t.valid;
      });
      if (allowedActions.length === 0) continue;
      inbox.push({
        id: row.id,
        target_type: 'dashboard_submission',
        module_code: row.module_code,
        module_name: row.module_name,
        year: row.year,
        month: row.month,
        status: row.status,
        owner_name: row.owner_name,
        owner_role: row.owner_role,
        updated_at: row.updated_at,
        last_action_at: row.last_action_at,
        last_action_by_name: row.last_action_by_name,
        allowedActions,
      });
    }
    res.json(inbox);
  } catch (err) {
    console.error('GET /my-inbox error:', err);
    res.status(500).json({ error: 'Server error loading inbox.' });
  }
});

// =============================================
// POST /api/workflow/admin-approve
// Admin override: transition any non-terminal target to 'approved'.
// Body: { target_type, target_id, reason?: string }
// =============================================
router.post('/admin-approve', authenticateToken, isAdmin, async (req, res) => {
  const v = validateActionBody(req.body, { reasonRequired: false });
  if (!v.ok) return res.status(400).json({ error: v.error });

  const { target_type, target_id, reason } = req.body;
  const result = await performAdminTransition({
    target_type,
    target_id: parseInt(target_id, 10),
    toState: 'approved',
    action: 'admin_approved',
    reason: reason || null,
    actorUserId: req.user.id,
    actorRole: req.user.role
  });
  res.status(result.http).json(result.body);
});

// =============================================
// POST /api/workflow/admin-reject
// Admin override: transition any non-terminal target to 'rejected'.
// Body: { target_type, target_id, reason: REQUIRED (non-empty string) }
// =============================================
router.post('/admin-reject', authenticateToken, isAdmin, async (req, res) => {
  const v = validateActionBody(req.body, { reasonRequired: true });
  if (!v.ok) return res.status(400).json({ error: v.error });

  const { target_type, target_id, reason } = req.body;
  const result = await performAdminTransition({
    target_type,
    target_id: parseInt(target_id, 10),
    toState: 'rejected',
    action: 'admin_rejected',
    reason: reason.trim(),
    actorUserId: req.user.id,
    actorRole: req.user.role
  });
  res.status(result.http).json(result.body);
});

// =============================================
// POST /api/workflow/admin-reopen
// Admin re-opens an approved or published submission back to draft.
// Body: { target_type, target_id, reason: REQUIRED (non-empty string) }
//
// Pre-condition: current status MUST be in ['approved','published'].
//   - in-flight states (submitted, head_reviewed, director_reviewed)
//     should be rejected via admin-reject, not reopened
//   - draft cannot be reopened (already editable)
//   - rejected cannot be reopened (auto-resumes to draft on save by
//     the submission owner; see routes/dashboards.js Option C)
// =============================================
router.post('/admin-reopen', authenticateToken, isAdmin, async (req, res) => {
  const v = validateActionBody(req.body, { reasonRequired: true });
  if (!v.ok) return res.status(400).json({ error: v.error });

  const { target_type, target_id, reason } = req.body;

  const reopenableStates = ['approved', 'published'];
  const result = await performAdminTransition({
    target_type,
    target_id: parseInt(target_id, 10),
    toState: 'draft',
    action: 'admin_reopened',
    reason: reason.trim(),
    actorUserId: req.user.id,
    actorRole: req.user.role,
    preTransitionGuard: (currentStatus) => {
      if (!reopenableStates.includes(currentStatus)) {
        return {
          ok: false,
          status: 409,
          error: `Cannot reopen submission in status '${currentStatus}'. admin-reopen only applies to '${reopenableStates.join("' or '")}'. For in-flight states (submitted/head_reviewed/director_reviewed), use admin-reject. For drafts, no reopen is needed.`
        };
      }
      return { ok: true };
    }
  });
  res.status(result.http).json(result.body);
});

// =============================================
// POST /api/workflow/admin-publish
// Admin publishes an APPROVED submission → visible on the live Snapshot.
// Body: { target_type, target_id, reason?: string }
//
// PHASE 2C. Mirrors admin-approve via performAdminTransition, with an
// admin-reopen-style pre-transition guard:
//   Pre-condition: current status MUST be 'approved'.
//     - in-flight states (submitted/head_reviewed/director_reviewed)
//       must be approved first (use admin-approve)
//     - published is already published (no double-publish)
//     - draft/rejected are not in the admin pipeline at all
// ALLOWED_TRANSITIONS in lib/workflow.js already permits
// approved -> published for admin; this route simply exposes it.
// =============================================
router.post('/admin-publish', authenticateToken, isAdmin, async (req, res) => {
  const v = validateActionBody(req.body, { reasonRequired: false });
  if (!v.ok) return res.status(400).json({ error: v.error });

  const { target_type, target_id, reason } = req.body;

  const result = await performAdminTransition({
    target_type,
    target_id: parseInt(target_id, 10),
    toState: 'published',
    action: 'admin_published',
    reason: reason || null,
    actorUserId: req.user.id,
    actorRole: req.user.role,
    preTransitionGuard: (currentStatus) => {
      if (currentStatus !== 'approved') {
        return {
          ok: false,
          status: 400,
          error: `Cannot publish submission in status '${currentStatus}'. admin-publish only applies to 'approved' submissions. For in-flight states (submitted/head_reviewed/director_reviewed), approve first via admin-approve. Published submissions are already live.`
        };
      }
      return { ok: true };
    }
  });
  res.status(result.http).json(result.body);
});

// =============================================
// GET /api/workflow/history?target_type=&target_id=
// Returns ordered workflow_history rows for a target.
// Auth: admin OR (user has module access AND workflow_active=true).
// =============================================
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const { target_type, target_id } = req.query;
    if (typeof target_type !== 'string' || target_type.length === 0) {
      return res.status(400).json({ error: 'target_type query param required.' });
    }
    const tid = parseInt(target_id, 10);
    if (!Number.isInteger(tid) || tid <= 0) {
      return res.status(400).json({ error: 'target_id (positive integer) query param required.' });
    }

    const isAdminUser = req.user.role && req.user.role.toLowerCase() === 'admin';

    if (!isAdminUser) {
      // Non-admin: must have module access AND workflow_active must be true
      const wt = await getWorkflowTarget(pool, target_type);
      if (!wt || !wt.workflow_active) {
        return res.status(403).json({
          error: `History for target_type '${target_type}' is not available (workflow not active or unknown type).`
        });
      }
      const moduleCode = await resolveModuleForTarget(pool, target_type, tid);
      if (!moduleCode) {
        // target_type has no module column → only admin may read its history
        return res.status(403).json({
          error: `History for target_type '${target_type}' is admin-only.`
        });
      }
      const allowed = await userHasModuleAccess(req.user.id, req.user.role, moduleCode);
      if (!allowed) {
        return res.status(403).json({
          error: `You do not have access to module ${moduleCode}.`
        });
      }
    }

    const r = await pool.query(
      `SELECT id, target_type, target_id, from_state, to_state, action,
              action_by, reason, metadata, created_at
       FROM workflow_history
       WHERE target_type = $1 AND target_id = $2
       ORDER BY created_at ASC, id ASC`,
      [target_type, tid]
    );
    res.json(r.rows);
  } catch (err) {
    console.error('GET /history error:', err);
    res.status(500).json({ error: 'Server error loading workflow history.' });
  }
});

// =============================================
// GET /api/workflow/targets
// Lists the workflow_targets registry.
// Useful for UI to discover what workflow target types exist
// and which are active. Any authed user.
// =============================================
router.get('/targets', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, target_type, display_name, workflow_active,
              require_function_head, require_hr_director, require_admin,
              description
       FROM workflow_targets
       ORDER BY target_type ASC`
    );
    res.json(r.rows);
  } catch (err) {
    console.error('GET /targets error:', err);
    res.status(500).json({ error: 'Server error loading workflow targets.' });
  }
});

module.exports = router;
