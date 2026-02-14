// =============================================
// Activities Routes
// CRUD operations for activities
// =============================================

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken, checkPermission } = require('../middleware/auth');

// =============================================
// GET /api/activities
// Get all activities (with optional filters)
// =============================================
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { category, owner, status } = req.query;
    
    let query = 'SELECT * FROM activities WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    // Apply filters if provided
    if (category) {
      query += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (owner) {
      query += ` AND owner = $${paramIndex}`;
      params.push(owner);
      paramIndex++;
    }

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    // Order by owner priority, then by first due date
    query += ` ORDER BY 
      CASE owner 
        WHEN 'OP' THEN 1 
        WHEN 'D&C' THEN 2 
        WHEN 'T&A' THEN 3
        WHEN 'T&A/D&C' THEN 3
        WHEN 'OD' THEN 4
        WHEN 'OD/SBM' THEN 4
        WHEN 'OD/D&C' THEN 4
        WHEN 'Com&Bn' THEN 5
        WHEN 'OD/Com&Bn' THEN 5
        WHEN 'SBM' THEN 6
        WHEN 'ALL' THEN 7
        ELSE 8 
      END,
      due_dates[1]`;

    const result = await pool.query(query, params);

    res.json({
      total: result.rows.length,
      activities: result.rows
    });

  } catch (err) {
    console.error('Get activities error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// =============================================
// GET /api/activities/:id
// Get single activity by ID
// =============================================
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM activities WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Activity not found.' });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error('Get activity error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// =============================================
// POST /api/activities
// Create new activity (Admin only in Phase 1)
// =============================================
router.post('/', authenticateToken, checkPermission('can_create'), async (req, res) => {
  try {
    const { name, category, owner, due_dates, status, description, assigned_to, notes } = req.body;

    // Validate required fields
    if (!name || !category || !owner || !due_dates) {
      return res.status(400).json({ error: 'Name, category, owner, and due_dates are required.' });
    }

    const result = await pool.query(
      `INSERT INTO activities (name, category, owner, due_dates, status, description, assigned_to, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [name, category, owner, due_dates, status || 'Scheduled', description, assigned_to, notes, req.user.id]
    );

    res.status(201).json({
      message: 'Activity created successfully',
      activity: result.rows[0]
    });

  } catch (err) {
    console.error('Create activity error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// =============================================
// PUT /api/activities/:id
// Update activity (Admin only in Phase 1)
// =============================================
router.put('/:id', authenticateToken, checkPermission('can_edit'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, owner, due_dates, status, description, assigned_to, notes, month_status } = req.body;

    // Check if activity exists
    const checkResult = await pool.query('SELECT * FROM activities WHERE id = $1', [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Activity not found.' });
    }

    const result = await pool.query(
      `UPDATE activities 
       SET name = COALESCE($1, name),
           category = COALESCE($2, category),
           owner = COALESCE($3, owner),
           due_dates = COALESCE($4, due_dates),
           status = COALESCE($5, status),
           description = COALESCE($6, description),
           assigned_to = $7,
           notes = COALESCE($8, notes),
           month_status = COALESCE($9, month_status),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $10
       RETURNING *`,
      [name, category, owner, due_dates, status, description, assigned_to, notes, month_status, id]
    );

    res.json({
      message: 'Activity updated successfully',
      activity: result.rows[0]
    });

  } catch (err) {
    console.error('Update activity error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// =============================================
// PATCH /api/activities/:id/status
// Update only status (Admin only in Phase 1)
// =============================================
router.patch('/:id/status', authenticateToken, checkPermission('can_edit'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, month_status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required.' });
    }

    const result = await pool.query(
      `UPDATE activities 
       SET status = $1,
           month_status = COALESCE($2, month_status),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [status, month_status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Activity not found.' });
    }

    res.json({
      message: 'Status updated successfully',
      activity: result.rows[0]
    });

  } catch (err) {
    console.error('Update status error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// =============================================
// DELETE /api/activities/:id
// Delete activity (Admin only in Phase 1)
// =============================================
router.delete('/:id', authenticateToken, checkPermission('can_delete'), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM activities WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Activity not found.' });
    }

    res.json({
      message: 'Activity deleted successfully',
      activity: result.rows[0]
    });

  } catch (err) {
    console.error('Delete activity error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// =============================================
// GET /api/activities/stats/summary
// Get activities statistics for dashboard
// =============================================
router.get('/stats/summary', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'Scheduled') as scheduled,
        COUNT(*) FILTER (WHERE status = 'Progressing') as progressing,
        COUNT(*) FILTER (WHERE status = 'Completed') as completed,
        COUNT(*) FILTER (WHERE status = 'Delayed') as delayed,
        COUNT(*) FILTER (WHERE status = 'On Hold') as on_hold,
        COUNT(*) FILTER (WHERE status = 'Canceled') as canceled,
        COUNT(*) FILTER (WHERE status = 'Completed Early') as completed_early
      FROM activities
    `);

    res.json(result.rows[0]);

  } catch (err) {
    console.error('Get stats error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
