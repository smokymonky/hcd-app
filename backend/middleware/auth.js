// =============================================
// Authentication Middleware
// Verifies JWT token and checks permissions
// =============================================

const jwt = require('jsonwebtoken');
const pool = require('../config/database');

// Verify JWT Token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }
};

// Check if user has specific permission
const checkPermission = (permission) => {
  return async (req, res, next) => {
    try {
      const result = await pool.query(
        'SELECT * FROM role_permissions WHERE LOWER(role) = LOWER($1)',
        [req.user.role]
      );

      if (result.rows.length === 0) {
        return res.status(403).json({ error: 'Role not found.' });
      }

      const permissions = result.rows[0];
      
      if (!permissions[permission]) {
        return res.status(403).json({ error: 'You do not have permission to perform this action.' });
      }

      next();
    } catch (err) {
      console.error('Permission check error:', err);
      return res.status(500).json({ error: 'Server error.' });
    }
  };
};

// Check if user is Admin
const isAdmin = (req, res, next) => {
  if (req.user.role.toLowerCase() !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
};

module.exports = {
  authenticateToken,
  checkPermission,
  isAdmin
};
