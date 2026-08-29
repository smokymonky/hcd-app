// =============================================
// Users Routes
// Admin user management
// =============================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { authenticateToken, isAdmin, autoAssignModuleForUser, FUNCTION_TO_MODULE_MAP } = require('../middleware/auth');

// =============================================
// GET /api/users
// Get all users (Admin only)
// =============================================
router.get('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, function, is_active, plain_password, created_at FROM users ORDER BY created_at DESC'
    );

    res.json({
      total: result.rows.length,
      users: result.rows
    });

  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// =============================================
// GET /api/users/:id
// Get single user (Admin only)
// =============================================
router.get('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT id, name, email, role, function, is_active, plain_password, created_at FROM users WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// =============================================
// POST /api/users
// Create new user (Admin only)
// =============================================
router.post('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { name, email, password, role, function: userFunction } = req.body;

    // Validate required fields
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password, and role are required.' });
    }

    // Check if email already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already exists.' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const result = await pool.query(
      `INSERT INTO users (name, email, password, plain_password, role, function)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, email, role, function, is_active, plain_password, created_at`,
      [name, email.toLowerCase(), hashedPassword, password, role, userFunction]
    );

    const newUser = result.rows[0];

    // PHASE 0: auto-assign dashboard module access based on user's function.
    // Best-effort — never blocks user creation. autoAssignModuleForUser
    // is no-throw (returns {mapped:false, reason} on errors). Users with
    // function values not in FUNCTION_TO_MODULE_MAP (OD, Com&Bn, ALL,
    // multi-function, null) get moduleAutoAssigned:null — admin must
    // assign module access manually via user_module_access.
    const moduleResult = await autoAssignModuleForUser(newUser.id, newUser.function);

    res.status(201).json({
      message: 'User created successfully',
      user: newUser,
      moduleAutoAssigned: moduleResult.moduleCode,
      moduleAssignDetail: moduleResult
    });

  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// =============================================
// PUT /api/users/:id
// Update user (Admin only)
// =============================================
router.put('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, role, function: userFunction, is_active } = req.body;

    // Check if user exists
    const checkResult = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // If email is being changed, check for duplicates
    if (email) {
      const existingUser = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [email.toLowerCase(), id]
      );

      if (existingUser.rows.length > 0) {
        return res.status(400).json({ error: 'Email already exists.' });
      }
    }

    // Hash new password if provided
    let hashedPassword = null;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(password, salt);
    }

    const result = await pool.query(
      `UPDATE users 
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           password = COALESCE($3, password),
           plain_password = COALESCE($4, plain_password),
           role = COALESCE($5, role),
           function = COALESCE($6, function),
           is_active = COALESCE($7, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING id, name, email, role, function, is_active, plain_password, created_at`,
      [name, email?.toLowerCase(), hashedPassword, password || null, role, userFunction, is_active, id]
    );

    const updatedUser = result.rows[0];

    // ACCESS MGMT — revoke-on-function-change.
    // checkResult.rows[0] holds the OLD user (pre-update). If the function
    // changed AND the old function mapped to a DIFFERENT module than the new
    // one, remove the stale AUTO access row for the old mapped module. Only
    // source='auto' is ever deleted — 'manual' grants are deliberately left
    // intact (that's the whole point of the source tag). The new-function
    // auto-grant below then adds the new module. Net: function change SWAPS
    // the auto module, manual grants survive. Best-effort — a failure here
    // never fails the user update.
    try {
      const oldUser = checkResult.rows[0];
      const oldFn = oldUser ? oldUser.function : null;
      const newFn = updatedUser ? updatedUser.function : null;
      if (oldFn && oldFn !== newFn) {
        const oldModuleCode = FUNCTION_TO_MODULE_MAP[oldFn];
        const newModuleCode = newFn ? FUNCTION_TO_MODULE_MAP[newFn] : null;
        if (oldModuleCode && oldModuleCode !== newModuleCode) {
          await pool.query(
            `DELETE FROM user_module_access
             WHERE user_id = $1
               AND source = 'auto'
               AND module_id = (SELECT id FROM dashboard_modules WHERE code = $2)`,
            [updatedUser.id, oldModuleCode]
          );
        }
      }
    } catch (revokeErr) {
      console.error('Revoke-on-function-change error (non-fatal):', revokeErr);
    }

    // EMPLOYEE ACCESS FIX: re-run the module auto-assign grant after update.
    // POST already does this on create; PUT previously did not, so an admin
    // could not fix an already-broken user (function saved NULL) by editing
    // them, and changing/assigning a function granted no access. We use the
    // function value COALESCE actually persisted (updatedUser.function) so a
    // PUT that omits function still grants based on the stored value.
    // Best-effort + idempotent (ON CONFLICT DO NOTHING, no-throw). Only fires
    // when a function value is present (auto-map functions: OP/T&A/D&C/SBM).
    // Paired with the revoke above, a function change now cleanly swaps the
    // auto module while leaving manual grants intact.
    let moduleResult = null;
    if (updatedUser && updatedUser.function) {
      moduleResult = await autoAssignModuleForUser(updatedUser.id, updatedUser.function);
    }

    res.json({
      message: 'User updated successfully',
      user: updatedUser,
      moduleAutoAssigned: moduleResult ? moduleResult.moduleCode : null,
      moduleAssignDetail: moduleResult
    });

  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// =============================================
// DELETE /api/users/:id
// Delete user (Admin only) - Soft delete
// =============================================
router.delete('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent deleting yourself
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account.' });
    }

    // Soft delete - set is_active to false
    const result = await pool.query(
      `UPDATE users SET is_active = false, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 
       RETURNING id, name, email, role`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({
      message: 'User deactivated successfully',
      user: result.rows[0]
    });

  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// =============================================
// GET /api/users/by-function/:function
// Get users by function (for assignment dropdown)
// =============================================
router.get('/by-function/:function', authenticateToken, async (req, res) => {
  try {
    const { function: userFunction } = req.params;

    const result = await pool.query(
      `SELECT id, name, email, role, function 
       FROM users 
       WHERE (function = $1 OR function = 'ALL') AND is_active = true
       ORDER BY name`,
      [userFunction]
    );

    res.json(result.rows);

  } catch (err) {
    console.error('Get users by function error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// =============================================
// ACCESS MGMT — manual module-access endpoints (admin-only)
// =============================================

// GET /api/users/:id/access
// The user's module-access rows joined to dashboard_modules.
router.get('/:id/access', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT uma.module_id, m.code AS module_code, m.name AS module_name,
              uma.access_level, uma.source
       FROM user_module_access uma
       JOIN dashboard_modules m ON uma.module_id = m.id
       WHERE uma.user_id = $1
       ORDER BY m.sort_order ASC, m.code ASC`,
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /:id/access error:', err);
    res.status(500).json({ error: 'Server error loading module access.' });
  }
});

// POST /api/users/:id/access  { module_id | module_code, access_level }
// Grant (or relabel) a module for the user. Always tagged source='manual' —
// manually setting a row overrides/relabels it as a manual grant, which
// protects it from revoke-on-function-change.
router.post('/:id/access', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { module_id, module_code, access_level } = req.body;

    if (!access_level || !['owner', 'viewer'].includes(access_level)) {
      return res.status(400).json({ error: "access_level must be 'owner' or 'viewer'." });
    }
    if (!module_id && !module_code) {
      return res.status(400).json({ error: 'module_id or module_code is required.' });
    }

    // Resolve module_id from code if needed.
    let moduleId = module_id;
    if (!moduleId) {
      const m = await pool.query('SELECT id FROM dashboard_modules WHERE code = $1', [module_code]);
      if (m.rows.length === 0) {
        return res.status(404).json({ error: `Unknown module_code '${module_code}'.` });
      }
      moduleId = m.rows[0].id;
    }

    const result = await pool.query(
      `INSERT INTO user_module_access (user_id, module_id, access_level, source)
       VALUES ($1, $2, $3, 'manual')
       ON CONFLICT (user_id, module_id)
       DO UPDATE SET access_level = EXCLUDED.access_level, source = 'manual'
       RETURNING module_id, access_level, source`,
      [id, moduleId, access_level]
    );

    // Return the row joined to module info for immediate UI render.
    const row = await pool.query(
      `SELECT uma.module_id, m.code AS module_code, m.name AS module_name,
              uma.access_level, uma.source
       FROM user_module_access uma
       JOIN dashboard_modules m ON uma.module_id = m.id
       WHERE uma.user_id = $1 AND uma.module_id = $2`,
      [id, moduleId]
    );
    res.status(201).json(row.rows[0] || result.rows[0]);
  } catch (err) {
    console.error('POST /:id/access error:', err);
    res.status(500).json({ error: 'Server error granting module access.' });
  }
});

// DELETE /api/users/:id/access/:moduleId
// Remove a module-access row regardless of source.
// NOTE: removing an 'auto' row this way may reappear if a later function
// re-assign runs autoAssignModuleForUser for that module. Manual rows stay
// gone until re-granted.
router.delete('/:id/access/:moduleId', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id, moduleId } = req.params;
    await pool.query(
      'DELETE FROM user_module_access WHERE user_id = $1 AND module_id = $2',
      [id, moduleId]
    );
    res.json({ message: 'Module access removed.' });
  } catch (err) {
    console.error('DELETE /:id/access/:moduleId error:', err);
    res.status(500).json({ error: 'Server error removing module access.' });
  }
});

module.exports = router;
