// =============================================
// Authentication Middleware
// Verifies JWT token and checks permissions
// =============================================

const jwt = require('jsonwebtoken');
const pool = require('../config/database');

// =============================================
// FUNCTION → MODULE MAPPING (Phase 0)
// Used at user creation (autoAssignModuleForUser) and by
// initDatabase.js backfill block. Single source of truth.
// Adding a 5th dashboard later: insert a row into
// dashboard_modules + add one entry here.
// =============================================
const FUNCTION_TO_MODULE_MAP = {
  'OP':  'HR_OPS',
  'T&A': 'TA',
  'D&C': 'L&D',
  'SBM': 'HR_SYS'
};

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

// =============================================
// checkModuleAccess(moduleCode, requiredLevel)        Phase 0
// Middleware factory. Verifies the authed user has
// access to a specific dashboard module at the given
// level. Admin role bypasses (admin can access any
// module). Levels: 'owner' (read+write), 'viewer'
// (read-only). 'owner' satisfies 'viewer' requirement.
// =============================================
const checkModuleAccess = (moduleCode, requiredLevel = 'owner') => {
  return async (req, res, next) => {
    try {
      // Admin bypass
      if (req.user.role && req.user.role.toLowerCase() === 'admin') {
        return next();
      }

      const result = await pool.query(
        `SELECT uma.access_level
         FROM user_module_access uma
         JOIN dashboard_modules m ON uma.module_id = m.id
         WHERE uma.user_id = $1 AND m.code = $2`,
        [req.user.id, moduleCode]
      );

      if (result.rows.length === 0) {
        return res.status(403).json({
          error: `You do not have access to module ${moduleCode}.`
        });
      }

      const userLevel = result.rows[0].access_level;
      // 'owner' satisfies both 'owner' and 'viewer'; 'viewer' satisfies only 'viewer'
      const sufficient =
        (requiredLevel === 'viewer') ||
        (requiredLevel === 'owner' && userLevel === 'owner');

      if (!sufficient) {
        return res.status(403).json({
          error: `Insufficient access level for ${moduleCode}. Required: ${requiredLevel}, have: ${userLevel}.`
        });
      }

      req.moduleAccess = { moduleCode, accessLevel: userLevel };
      next();
    } catch (err) {
      console.error('Module access check error:', err);
      return res.status(500).json({ error: 'Server error during module access check.' });
    }
  };
};

// =============================================
// autoAssignModuleForUser(userId, functionValue)     Phase 0
// Utility (NOT middleware). Called from routes/users.js
// after a new user is created. If the user's function
// maps to a dashboard module per FUNCTION_TO_MODULE_MAP,
// inserts a user_module_access row at 'owner' level.
// Idempotent (ON CONFLICT DO NOTHING).
// Returns: { mapped: bool, moduleCode: string|null, reason?: string }
// Never throws — failures return { mapped:false, reason:'<msg>' }
// so user creation is not blocked by module assignment.
// =============================================
const autoAssignModuleForUser = async (userId, functionValue, accessLevel = 'owner') => {
  try {
    if (!functionValue || !FUNCTION_TO_MODULE_MAP[functionValue]) {
      return { mapped: false, moduleCode: null, reason: 'No auto-map for function value' };
    }
    const moduleCode = FUNCTION_TO_MODULE_MAP[functionValue];

    const result = await pool.query(
      `INSERT INTO user_module_access (user_id, module_id, access_level)
       SELECT $1, id, $2 FROM dashboard_modules WHERE code = $3
       ON CONFLICT (user_id, module_id) DO NOTHING
       RETURNING id`,
      [userId, accessLevel, moduleCode]
    );

    return {
      mapped: result.rowCount > 0,
      moduleCode,
      reason: result.rowCount > 0 ? 'inserted' : 'row already existed (no-op)'
    };
  } catch (err) {
    console.error('autoAssignModuleForUser error:', err);
    return { mapped: false, moduleCode: null, reason: err.message };
  }
};

module.exports = {
  authenticateToken,
  checkPermission,
  isAdmin,
  checkModuleAccess,
  autoAssignModuleForUser,
  FUNCTION_TO_MODULE_MAP
};
