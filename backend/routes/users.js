// =============================================
// Users Routes
// Admin user management
// =============================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { authenticateToken, isAdmin, autoAssignModuleForUser } = require('../middleware/auth');

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

    res.json({
      message: 'User updated successfully',
      user: result.rows[0]
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

module.exports = router;
