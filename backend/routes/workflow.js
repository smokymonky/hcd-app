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
  resolveModuleForTarget
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

    // 4. Validate transition. actorIsOwner irrelevant for admin actions
    //    but pass true defensively (admin-override branch fires first anyway).
    const trans = validateTransition(currentStatus, toState, actorRole, true);
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
