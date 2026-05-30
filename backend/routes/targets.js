// =============================================
// Targets Routes (Phase 2B)
// =============================================
// Admin-only CRUD for field_targets table.
//
// Field targets are per-(module, field_key) goals — value, direction
// (above/below/exact), optional tolerance (NULL = use frontend default 2.0),
// optional human-readable label. The form + snapshot read these targets
// at load time and merge into the FIELDS array's `target` property
// (Option C — seed once + hydrate forever).
//
// DELETE is SOFT: sets is_active=false, records deleted_by + deleted_at.
// PUT can RESTORE a soft-deleted target by setting is_active=true,
// but rejects with a clear message if an active target already exists
// for the same (module, field_key) — admin must delete that one first.
//
// Auth: every endpoint requires authenticateToken + isAdmin.
// Reuses the same pattern as routes/users.js.
// =============================================

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken, isAdmin } = require('../middleware/auth');

// =============================================
// Helpers
// =============================================

const VALID_DIRECTIONS = ['above', 'below', 'exact'];
const MAX_LABEL_LEN = 255;

// Validate the create/update payload. Returns { ok: true, value: cleaned } or { ok: false, error }.
// When isUpdate=true, all fields are optional EXCEPT what the caller passes
// (we only validate fields that are present).
function validatePayload(body, { isUpdate = false } = {}) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body is required.' };
  }

  const out = {};

  // module
  if (body.module !== undefined) {
    if (typeof body.module !== 'string' || body.module.trim() === '' || body.module.length > 50) {
      return { ok: false, error: 'module must be a non-empty string up to 50 chars.' };
    }
    out.module = body.module.trim();
  } else if (!isUpdate) {
    return { ok: false, error: 'module is required.' };
  }

  // field_key
  if (body.field_key !== undefined) {
    if (typeof body.field_key !== 'string' || body.field_key.trim() === '' || body.field_key.length > 100) {
      return { ok: false, error: 'field_key must be a non-empty string up to 100 chars.' };
    }
    out.field_key = body.field_key.trim();
  } else if (!isUpdate) {
    return { ok: false, error: 'field_key is required.' };
  }

  // target_value (numeric)
  if (body.target_value !== undefined) {
    const n = Number(body.target_value);
    if (!Number.isFinite(n)) {
      return { ok: false, error: 'target_value must be a finite number.' };
    }
    out.target_value = n;
  } else if (!isUpdate) {
    return { ok: false, error: 'target_value is required.' };
  }

  // direction
  if (body.direction !== undefined) {
    if (typeof body.direction !== 'string' || !VALID_DIRECTIONS.includes(body.direction)) {
      return { ok: false, error: `direction must be one of: ${VALID_DIRECTIONS.join(', ')}.` };
    }
    out.direction = body.direction;
  } else if (!isUpdate) {
    return { ok: false, error: 'direction is required.' };
  }

  // tolerance (optional, NULL means default 2.0)
  if (body.tolerance !== undefined) {
    if (body.tolerance === null) {
      out.tolerance = null;
    } else {
      const t = Number(body.tolerance);
      if (!Number.isFinite(t) || t < 0) {
        return { ok: false, error: 'tolerance must be a non-negative finite number, or null.' };
      }
      out.tolerance = t;
    }
  }

  // label (optional)
  if (body.label !== undefined) {
    if (body.label === null) {
      out.label = null;
    } else {
      if (typeof body.label !== 'string') {
        return { ok: false, error: 'label must be a string or null.' };
      }
      const trimmed = body.label.trim();
      if (trimmed.length > MAX_LABEL_LEN) {
        return { ok: false, error: `label cannot exceed ${MAX_LABEL_LEN} characters.` };
      }
      out.label = trimmed === '' ? null : trimmed;
    }
  }

  // is_active (only allowed on PUT for restore flow)
  if (body.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') {
      return { ok: false, error: 'is_active must be a boolean.' };
    }
    out.is_active = body.is_active;
  }

  return { ok: true, value: out };
}

// =============================================
// GET /api/targets?module=HR_OPS
// List all field_targets. Admin sees ACTIVE + SOFT-DELETED rows.
// Optional ?module= filter.
// Returns rows ordered by module, field_key, then deleted (active first).
// =============================================
router.get('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { module } = req.query;

    const params = [];
    let sql = `
      SELECT
        t.id, t.module, t.field_key, t.target_value, t.direction,
        t.tolerance, t.label, t.is_active,
        t.created_by, t.updated_by, t.deleted_by,
        t.created_at, t.updated_at, t.deleted_at,
        cu.name AS created_by_name,
        uu.name AS updated_by_name,
        du.name AS deleted_by_name
      FROM field_targets t
      LEFT JOIN users cu ON t.created_by = cu.id
      LEFT JOIN users uu ON t.updated_by = uu.id
      LEFT JOIN users du ON t.deleted_by = du.id
    `;
    if (module) {
      params.push(module);
      sql += ` WHERE t.module = $${params.length}`;
    }
    sql += ' ORDER BY t.module ASC, t.is_active DESC, t.field_key ASC, t.id DESC';

    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/targets error:', err);
    res.status(500).json({ error: 'Server error loading targets.' });
  }
});

// =============================================
// POST /api/targets
// Create a new active target for (module, field_key).
// Rejects (409) if an active target already exists — admin must Edit existing
// or first Delete it.
// =============================================
router.post('/', authenticateToken, isAdmin, async (req, res) => {
  const v = validatePayload(req.body, { isUpdate: false });
  if (!v.ok) return res.status(400).json({ error: v.error });
  const { module, field_key, target_value, direction, tolerance, label } = v.value;

  try {
    // Check for existing active target on (module, field_key)
    const dupe = await pool.query(
      'SELECT id FROM field_targets WHERE module = $1 AND field_key = $2 AND is_active = true LIMIT 1',
      [module, field_key]
    );
    if (dupe.rowCount > 0) {
      return res.status(409).json({
        error: `An active target already exists for ${module} / ${field_key}. Edit the existing target or delete it first.`,
        conflictingTargetId: dupe.rows[0].id,
      });
    }

    const ins = await pool.query(
      `INSERT INTO field_targets
        (module, field_key, target_value, direction, tolerance, label, is_active, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7, $7)
       RETURNING *`,
      [module, field_key, target_value, direction, tolerance ?? null, label ?? null, req.user.id]
    );

    res.status(201).json(ins.rows[0]);
  } catch (err) {
    console.error('POST /api/targets error:', err);
    // Handle the partial-unique-index violation as a 409 just in case the
    // pre-check above raced with another admin.
    if (err && err.code === '23505') {
      return res.status(409).json({
        error: `An active target already exists for this module/field. Refresh and try again.`,
      });
    }
    res.status(500).json({ error: 'Server error creating target.' });
  }
});

// =============================================
// PUT /api/targets/:id
// Update an existing target (active OR soft-deleted).
// Handles RESTORE when caller sets is_active=true on a soft-deleted row:
// rejects with 409 if a different active target exists for the same
// (module, field_key).
// Module + field_key are immutable post-creation (admin who wants to
// move a target deletes + creates a new one).
// =============================================
router.put('/:id', authenticateToken, isAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid target id.' });
  }

  const v = validatePayload(req.body, { isUpdate: true });
  if (!v.ok) return res.status(400).json({ error: v.error });
  const patch = v.value;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Load + lock the row
    const existingR = await client.query(
      'SELECT * FROM field_targets WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (existingR.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Target not found.' });
    }
    const existing = existingR.rows[0];

    // Module + field_key are IMMUTABLE — reject if caller tries to change
    if (patch.module !== undefined && patch.module !== existing.module) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'module cannot be changed. Delete this target and create a new one.' });
    }
    if (patch.field_key !== undefined && patch.field_key !== existing.field_key) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'field_key cannot be changed. Delete this target and create a new one.' });
    }

    // Detect RESTORE: caller sets is_active=true on a currently inactive row
    const isRestore = patch.is_active === true && existing.is_active === false;
    if (isRestore) {
      const blocker = await client.query(
        `SELECT id FROM field_targets
         WHERE module = $1 AND field_key = $2 AND is_active = true AND id <> $3
         LIMIT 1`,
        [existing.module, existing.field_key, id]
      );
      if (blocker.rowCount > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `Cannot restore: an active target already exists for ${existing.module} / ${existing.field_key}. Delete the active one first.`,
          conflictingTargetId: blocker.rows[0].id,
        });
      }
    }

    // Block "soft-delete via PUT" — that should go through DELETE for clarity.
    if (patch.is_active === false && existing.is_active === true) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Use DELETE /api/targets/:id to soft-delete.' });
    }

    // Build the UPDATE statement based on which fields are present
    const sets = [];
    const params = [];
    let p = 1;

    if (patch.target_value !== undefined) { sets.push(`target_value = $${p++}`); params.push(patch.target_value); }
    if (patch.direction !== undefined)    { sets.push(`direction    = $${p++}`); params.push(patch.direction); }
    if (patch.tolerance !== undefined)    { sets.push(`tolerance    = $${p++}`); params.push(patch.tolerance); }
    if (patch.label !== undefined)        { sets.push(`label        = $${p++}`); params.push(patch.label); }

    if (isRestore) {
      sets.push(`is_active   = true`);
      sets.push(`deleted_at  = NULL`);
      sets.push(`deleted_by  = NULL`);
    }

    sets.push(`updated_by  = $${p++}`); params.push(req.user.id);
    sets.push(`updated_at  = CURRENT_TIMESTAMP`);

    if (sets.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No editable fields supplied.' });
    }

    params.push(id);
    const updSql = `
      UPDATE field_targets
         SET ${sets.join(', ')}
       WHERE id = $${p}
       RETURNING *
    `;
    const upd = await client.query(updSql, params);
    await client.query('COMMIT');
    res.json(upd.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('PUT /api/targets/:id error:', err);
    if (err && err.code === '23505') {
      return res.status(409).json({
        error: 'Restore conflicts with an existing active target. Refresh and try again.',
      });
    }
    res.status(500).json({ error: 'Server error updating target.' });
  } finally {
    client.release();
  }
});

// =============================================
// DELETE /api/targets/:id
// SOFT delete: sets is_active=false, deleted_by, deleted_at.
// Hard delete is intentionally not supported (audit trail + restorability).
// =============================================
router.delete('/:id', authenticateToken, isAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid target id.' });
  }
  try {
    const upd = await pool.query(
      `UPDATE field_targets
         SET is_active  = false,
             deleted_by = $1,
             deleted_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND is_active = true
       RETURNING *`,
      [req.user.id, id]
    );
    if (upd.rowCount === 0) {
      // Either not found, or already soft-deleted — distinguish for the client
      const check = await pool.query('SELECT is_active FROM field_targets WHERE id = $1', [id]);
      if (check.rowCount === 0) {
        return res.status(404).json({ error: 'Target not found.' });
      }
      return res.status(409).json({ error: 'Target is already soft-deleted. Use PUT with is_active=true to restore.' });
    }
    res.json(upd.rows[0]);
  } catch (err) {
    console.error('DELETE /api/targets/:id error:', err);
    res.status(500).json({ error: 'Server error deleting target.' });
  }
});

module.exports = router;
