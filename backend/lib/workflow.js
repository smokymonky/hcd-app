// =============================================
// Universal Workflow Engine — module-agnostic helper
// =============================================
// Used by:
//   - backend/routes/workflow.js (admin-approve, admin-reject, history)
//   - backend/routes/dashboards.js (save draft, submit)
//
// Design (see audit v5.1 Section 6.7 + 6.8):
//   - Generic across target_types. Currently registered:
//       'dashboard_submission' (active in Phase 0, used by HR Dashboards)
//       'activity_completion'  (registered but workflow_active=false,
//                               placeholder for future Annual Plan activation)
//   - State transitions encoded once here, not per-route.
//   - All writes accept a pg `client` so callers can run inside a transaction.
//   - History is INSERT-only; never UPDATE/DELETE on workflow_history.
// =============================================

// =============================================
// TARGET_TABLES
// Single source of truth for which physical table backs each target_type.
// Adding a new module's workflow target later = add one entry here.
// =============================================
const TARGET_TABLES = {
  dashboard_submission: {
    table: 'dashboard_submissions',
    statusColumn: 'status',
    moduleColumn: 'module_id'   // links to dashboard_modules.id
  },
  activity_completion: {
    table: 'activities',         // placeholder mapping for future Annual Plan workflow
    statusColumn: 'status',      // (NOTE: activities.status today is the Annual Plan
                                 //  status like 'Scheduled'/'Progressing' — workflow
                                 //  may use a separate column when activated; this
                                 //  entry exists only so workflow_targets seed is
                                 //  not orphaned. Workflow on this target_type is
                                 //  workflow_active=false in Phase 0 and rejected
                                 //  at the API layer.)
    moduleColumn: null
  }
};

// =============================================
// STATUS_VALUES — mirrors dashboard_submissions CHECK constraint
// =============================================
const STATUS_VALUES = [
  'draft',
  'submitted',
  'head_reviewed',
  'director_reviewed',
  'approved',
  'rejected',
  'published'
];

// =============================================
// ALLOWED_TRANSITIONS
// Map of fromState -> array of {toState, actors[]}.
// actors: which role(s) may initiate this transition (besides admin, who
// can always force a transition to 'approved' or 'rejected' via override).
// Roles are LOWERCASE to match the LOWER() pattern in checkPermission.
// =============================================
const ALLOWED_TRANSITIONS = {
  draft: [
    { toState: 'submitted', actors: ['owner', 'admin'] }
  ],
  submitted: [
    { toState: 'head_reviewed', actors: ['function_head', 'admin'] },
    { toState: 'approved',      actors: ['admin'] },
    { toState: 'rejected',      actors: ['admin'] }
  ],
  head_reviewed: [
    { toState: 'director_reviewed', actors: ['hr_director', 'admin'] },
    { toState: 'approved',          actors: ['admin'] },
    { toState: 'rejected',          actors: ['admin'] }
  ],
  director_reviewed: [
    { toState: 'approved', actors: ['admin'] },
    { toState: 'rejected', actors: ['admin'] }
  ],
  rejected: [
    { toState: 'draft', actors: ['owner', 'admin'] }   // resume editing
  ],
  approved: [
    { toState: 'published', actors: ['admin'] }         // publish step deferred — no Phase 0 endpoint
  ],
  published: [
    // terminal in Phase 0 — no transitions out
  ]
};

// =============================================
// validateTransition(fromState, toState, actorRole, actorIsOwner?)
//   actorRole: lowercase role string ('admin','function_head',...)
//   actorIsOwner: boolean — true if the actor is the submission's created_by
//                 (used for 'owner' actor matches on draft->submitted and
//                  rejected->draft transitions)
// Returns: { valid: bool, reason: string }
// =============================================
const validateTransition = (fromState, toState, actorRole, actorIsOwner = false) => {
  if (!STATUS_VALUES.includes(toState)) {
    return { valid: false, reason: `Unknown to-state '${toState}'` };
  }
  if (fromState !== null && !STATUS_VALUES.includes(fromState)) {
    return { valid: false, reason: `Unknown from-state '${fromState}'` };
  }
  if (fromState === toState) {
    return { valid: false, reason: `Cannot transition to the same state '${toState}'` };
  }

  const role = (actorRole || '').toLowerCase();

  // Admin override: admin can transition from any non-terminal state to approved or rejected
  const isAdmin = role === 'admin';
  if (isAdmin && (toState === 'approved' || toState === 'rejected')) {
    if (fromState === 'approved' || fromState === 'published') {
      return { valid: false, reason: `Cannot override terminal state '${fromState}'` };
    }
    return { valid: true, reason: 'admin override' };
  }

  // Normal path: look up legal transitions for this from-state
  const legal = ALLOWED_TRANSITIONS[fromState];
  if (!legal) {
    return { valid: false, reason: `No transitions defined from '${fromState}'` };
  }

  const match = legal.find(t => t.toState === toState);
  if (!match) {
    return { valid: false, reason: `Transition '${fromState}' -> '${toState}' is not allowed` };
  }

  // Check actor role
  const actorAllowed = match.actors.some(a => {
    if (a === 'admin')  return isAdmin;
    if (a === 'owner')  return actorIsOwner;
    return a === role;
  });

  if (!actorAllowed) {
    return { valid: false, reason: `Role '${role}' may not initiate '${fromState}' -> '${toState}'. Allowed: ${match.actors.join(', ')}` };
  }

  return { valid: true, reason: 'ok' };
};

// =============================================
// getWorkflowTarget(client, target_type)
// Returns the workflow_targets row for the given target_type, or null.
// =============================================
const getWorkflowTarget = async (client, target_type) => {
  const result = await client.query(
    'SELECT * FROM workflow_targets WHERE target_type = $1',
    [target_type]
  );
  return result.rows[0] || null;
};

// =============================================
// getTargetRow(client, target_type, target_id)
// Look up the actual row in whichever table backs this target_type.
// Returns the row or null. Throws if target_type is unknown.
// =============================================
const getTargetRow = async (client, target_type, target_id) => {
  const meta = TARGET_TABLES[target_type];
  if (!meta) {
    throw new Error(`Unknown target_type '${target_type}'`);
  }
  const result = await client.query(
    `SELECT * FROM ${meta.table} WHERE id = $1`,
    [target_id]
  );
  return result.rows[0] || null;
};

// =============================================
// updateTargetStatus(client, target_type, target_id, newStatus)
// UPDATE the target row's status column. Returns rowCount.
// Throws if target_type is unknown.
// =============================================
const updateTargetStatus = async (client, target_type, target_id, newStatus) => {
  const meta = TARGET_TABLES[target_type];
  if (!meta) {
    throw new Error(`Unknown target_type '${target_type}'`);
  }
  if (!STATUS_VALUES.includes(newStatus)) {
    throw new Error(`Invalid status '${newStatus}'`);
  }
  const result = await client.query(
    `UPDATE ${meta.table}
     SET ${meta.statusColumn} = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [newStatus, target_id]
  );
  return result.rowCount;
};

// =============================================
// writeHistory(client, entry)
// INSERT a row into workflow_history.
// entry: { target_type, target_id, from_state, to_state, action, action_by, reason?, metadata? }
// Throws on failure (caller should handle inside transaction).
// =============================================
const writeHistory = async (client, entry) => {
  const {
    target_type,
    target_id,
    from_state = null,
    to_state,
    action,
    action_by = null,
    reason = null,
    metadata = null
  } = entry;

  if (!target_type || !target_id || !to_state || !action) {
    throw new Error('writeHistory: target_type, target_id, to_state, action are required');
  }

  await client.query(
    `INSERT INTO workflow_history
       (target_type, target_id, from_state, to_state, action, action_by, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      target_type,
      target_id,
      from_state,
      to_state,
      action,
      action_by,
      reason,
      metadata ? JSON.stringify(metadata) : null
    ]
  );
};

// =============================================
// resolveModuleForTarget(client, target_type, target_id)
// For target_types whose backing table has a module_id column
// (e.g. dashboard_submission), returns the dashboard_modules.code
// for that target — useful for checkModuleAccess resolution in
// workflow endpoints. Returns null if the target_type has no
// moduleColumn or the row is not found.
// =============================================
const resolveModuleForTarget = async (client, target_type, target_id) => {
  const meta = TARGET_TABLES[target_type];
  if (!meta || !meta.moduleColumn) {
    return null;
  }
  const result = await client.query(
    `SELECT m.code
     FROM ${meta.table} t
     JOIN dashboard_modules m ON t.${meta.moduleColumn} = m.id
     WHERE t.id = $1`,
    [target_id]
  );
  return result.rows[0] ? result.rows[0].code : null;
};

module.exports = {
  TARGET_TABLES,
  STATUS_VALUES,
  ALLOWED_TRANSITIONS,
  validateTransition,
  getWorkflowTarget,
  getTargetRow,
  updateTargetStatus,
  writeHistory,
  resolveModuleForTarget
};
