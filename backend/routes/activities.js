// =============================================
// Activities Routes
// CRUD operations for activities
// =============================================

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken, checkPermission, isAdmin } = require('../middleware/auth');

// =============================================
// GET /api/activities
// Get all activities (with optional filters)
// =============================================
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { category, owner, status, year } = req.query;
    
    let query = 'SELECT * FROM activities WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    // Phase 2.5: optional ?year. Absent → no year filter (returns ALL, exactly
    // as before — backward-compatible).
    if (year !== undefined && year !== '' && year !== null) {
      query += ` AND year = $${paramIndex}`;
      params.push(parseInt(year, 10));
      paramIndex++;
    }

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
    const { name, category, owner, due_dates, status, description, assigned_to, notes, year } = req.body;

    // Validate required fields
    if (!name || !category || !owner || !due_dates) {
      return res.status(400).json({ error: 'Name, category, owner, and due_dates are required.' });
    }

    // Phase 2.5: year defaults to 2026 when not supplied (backward-compatible).
    const activityYear = (year === undefined || year === null || year === '') ? 2026 : parseInt(year, 10);

    const result = await pool.query(
      `INSERT INTO activities (name, category, owner, due_dates, status, description, assigned_to, notes, created_by, year)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [name, category, owner, due_dates, status || 'Scheduled', description, assigned_to, notes, req.user.id, activityYear]
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
    const { year } = req.query;
    // Phase 2.5: optional ?year. Absent → no filter (byte-identical to before).
    const params = [];
    let where = '';
    if (year !== undefined && year !== '' && year !== null) {
      where = ' WHERE year = $1';
      params.push(parseInt(year, 10));
    }
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
      FROM activities${where}
    `, params);

    res.json(result.rows[0]);

  } catch (err) {
    console.error('Get stats error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// =============================================
// GET /api/activities/stats/years  (Phase 2.5)
// Distinct years that have data (always includes 2026 via the backfill).
// =============================================
// GET /stats/years — the TABS list. Distinct years from activities ∪ plan_years,
// EXCLUDING hidden years (plan_years.is_hidden = true). ?includeHidden=true
// (admin) returns ALL years with { year, is_hidden, hasActivities } for mgmt.
router.get('/stats/years', authenticateToken, async (req, res) => {
  try {
    const includeHidden = String(req.query.includeHidden) === 'true';
    if (includeHidden) {
      // Admin-only management view.
      if (!(req.user.role && req.user.role.toLowerCase() === 'admin')) {
        return res.status(403).json({ error: 'Admins only.' });
      }
      const r = await pool.query(`
        WITH all_years AS (
          SELECT year FROM plan_years
          UNION
          SELECT DISTINCT year FROM activities WHERE year IS NOT NULL
        )
        SELECT ay.year,
               COALESCE(py.is_hidden, false) AS is_hidden,
               EXISTS (SELECT 1 FROM activities a WHERE a.year = ay.year) AS has_activities
        FROM all_years ay
        LEFT JOIN plan_years py ON py.year = ay.year
        ORDER BY ay.year ASC
      `);
      return res.json(r.rows.map((x) => ({ year: x.year, is_hidden: x.is_hidden, hasActivities: x.has_activities })));
    }
    // Visible years for everyone (hidden excluded).
    const result = await pool.query(`
      SELECT year FROM (
        SELECT year FROM plan_years
        UNION
        SELECT DISTINCT year FROM activities WHERE year IS NOT NULL
      ) ay
      WHERE ay.year NOT IN (SELECT year FROM plan_years WHERE is_hidden = true)
      ORDER BY ay.year ASC
    `);
    res.json(result.rows.map((r) => r.year));
  } catch (err) {
    console.error('Get years error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /stats/years (admin) — register a year so it persists without activities.
router.post('/stats/years', authenticateToken, isAdmin, async (req, res) => {
  try {
    const y = parseInt(req.body.year, 10);
    if (!Number.isInteger(y) || y < 2000 || y > 2100) {
      return res.status(400).json({ error: 'Year must be an integer between 2000 and 2100.' });
    }
    await pool.query('INSERT INTO plan_years (year, created_by) VALUES ($1, $2) ON CONFLICT (year) DO NOTHING', [y, req.user.id]);
    res.status(201).json({ year: y });
  } catch (err) {
    console.error('Register year error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /stats/years/:year (admin) — hide/unhide. 2026 can never be hidden.
router.put('/stats/years/:year', authenticateToken, isAdmin, async (req, res) => {
  try {
    const y = parseInt(req.params.year, 10);
    if (!Number.isInteger(y)) return res.status(400).json({ error: 'Invalid year.' });
    const { is_hidden } = req.body;
    if (typeof is_hidden !== 'boolean') return res.status(400).json({ error: 'is_hidden (boolean) is required.' });
    if (y === 2026 && is_hidden === true) {
      return res.status(400).json({ error: 'The 2026 plan cannot be hidden.' });
    }
    // Ensure a registry row exists (a data-only year may not have one yet).
    await pool.query('INSERT INTO plan_years (year, created_by) VALUES ($1, $2) ON CONFLICT (year) DO NOTHING', [y, req.user.id]);
    await pool.query('UPDATE plan_years SET is_hidden = $1 WHERE year = $2', [is_hidden, y]);
    res.json({ year: y, is_hidden });
  } catch (err) {
    console.error('Hide/unhide year error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /stats/years/:year (admin) — HARD delete. Guards: never 2026; never a
// year that still has activities.
router.delete('/stats/years/:year', authenticateToken, isAdmin, async (req, res) => {
  try {
    const y = parseInt(req.params.year, 10);
    if (!Number.isInteger(y)) return res.status(400).json({ error: 'Invalid year.' });
    if (y === 2026) return res.status(400).json({ error: 'The 2026 plan cannot be deleted.' });
    const cnt = await pool.query('SELECT COUNT(*)::int AS n FROM activities WHERE year = $1', [y]);
    if (cnt.rows[0].n > 0) {
      return res.status(400).json({ error: 'Year has activities; delete them first.' });
    }
    await pool.query('DELETE FROM plan_years WHERE year = $1', [y]);
    res.json({ deleted: true });
  } catch (err) {
    console.error('Delete year error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
