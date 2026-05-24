// =============================================
// HCD Application - Main Server
// =============================================

const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const activitiesRoutes = require('./routes/activities');
const usersRoutes = require('./routes/users');
const dashboardsRoutes = require('./routes/dashboards');
const workflowRoutes = require('./routes/workflow');

// Import database initializer
const initDatabase = require('./config/initDatabase');

// Initialize Express app
const app = express();

// =============================================
// Middleware
// =============================================

// Enable CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));

// Parse JSON bodies
app.use(express.json());

// =============================================
// Routes
// =============================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'HCD API is running',
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/dashboards', dashboardsRoutes);
app.use('/api/workflow', workflowRoutes);

// =============================================
// Error Handling
// =============================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// =============================================
// Start Server
// =============================================

const PORT = process.env.PORT || 5000;

// Initialize database then start server
initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log('HCD Application Backend running on port ' + PORT);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });

module.exports = app;
