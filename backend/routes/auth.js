// =============================================
// Authentication Routes
// Login, Logout, Get Current User
// =============================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// =============================================
// POST /api/auth/login
// Login user and return token
// =============================================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // Find user by email
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND is_active = true',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = result.rows[0];

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Get user permissions
    const permResult = await pool.query(
      'SELECT * FROM role_permissions WHERE role = $1',
      [user.role]
    );
    const permissions = permResult.rows[0] || {};

    // Create JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role,
        function: user.function 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Return user data (without password)
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        function: user.function
      },
      permissions
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// =============================================
// GET /api/auth/me
// Get current logged in user
// =============================================
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, function, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const user = result.rows[0];

    // Get user permissions
    const permResult = await pool.query(
      'SELECT * FROM role_permissions WHERE role = $1',
      [user.role]
    );
    const permissions = permResult.rows[0] || {};

    res.json({ user, permissions });

  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// =============================================
// POST /api/auth/logout
// Logout (client-side removes token)
// =============================================
router.post('/logout', authenticateToken, (req, res) => {
  // JWT tokens are stateless, so logout is handled client-side
  // This endpoint is for future use (e.g., token blacklist)
  res.json({ message: 'Logout successful' });
});

module.exports = router;
