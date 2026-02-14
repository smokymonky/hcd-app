// =============================================
// Dashboard Page
// Based on v17 design
// =============================================

import React, { useState, useEffect } from 'react';
import { activitiesAPI } from '../services/api';

const DashboardPage = ({ user, onLogout }) => {
  const [activities, setActivities] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    category: '',
    owner: '',
    status: ''
  });

  // Permissions from localStorage
  const permissions = JSON.parse(localStorage.getItem('hcd_permissions') || '{}');

  // Load activities
  useEffect(() => {
    loadActivities();
  }, [filters]);

  const loadActivities = async () => {
    try {
      setLoading(true);
      const data = await activitiesAPI.getAll(filters);
      setActivities(data.activities);
      
      // Get stats
      const statsData = await activitiesAPI.getStats();
      setStats(statsData);
    } catch (error) {
      console.error('Error loading activities:', error);
    } finally {
      setLoading(false);
    }
  };

  // Export PDF function (same as v17)
  const exportPDF = () => {
    // PDF export logic from v17 will go here
    alert('PDF Export - Implementation from v17');
  };

  // Group activities by category
  const groupedActivities = {
    'Activities/Programs/Projects': activities.filter(a => a.category === 'Activities/Programs/Projects'),
    'Maintenance Projects': activities.filter(a => a.category === 'Maintenance Projects'),
    'Reports': activities.filter(a => a.category === 'Reports')
  };

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const statusColors = {
    'Scheduled': '#3B82F6',
    'Progressing': '#F59E0B',
    'Completed': '#10B981',
    'Delayed': '#EF4444',
    'On Hold': '#6B7280',
    'Canceled': '#F97316',
    'Completed Early': '#8B5CF6'
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.logoMain}>Abdul Latif Jameel</span>
          <span style={styles.logoSub}>FINANCE</span>
        </div>
        <div style={styles.headerCenter}>
          <h1 style={styles.title}>HCD Annual Plan 2026</h1>
        </div>
        <div style={styles.headerRight}>
          <span style={styles.userName}>{user.name}</span>
          <span style={styles.userRole}>{user.role}</span>
          <button onClick={onLogout} style={styles.logoutBtn}>Logout</button>
        </div>
      </div>

      {/* Gold Line */}
      <div style={styles.goldLine}></div>

      {/* Stats Bar */}
      <div style={styles.statsBar}>
        <div style={styles.statItem}>
          <span style={styles.statCircle}>●</span>
          <span style={styles.statLabel}>Total: {stats.total || 0}</span>
        </div>
        <div style={styles.statItem}>
          <span style={{...styles.statCircle, color: statusColors['Scheduled']}}>●</span>
          <span style={styles.statLabel}>Scheduled: {stats.scheduled || 0}</span>
        </div>
        <div style={styles.statItem}>
          <span style={{...styles.statCircle, color: statusColors['Progressing']}}>●</span>
          <span style={styles.statLabel}>Progressing: {stats.progressing || 0}</span>
        </div>
        <div style={styles.statItem}>
          <span style={{...styles.statCircle, color: statusColors['Completed']}}>●</span>
          <span style={styles.statLabel}>Completed: {stats.completed || 0}</span>
        </div>
        {permissions.can_export_pdf && (
          <button onClick={exportPDF} style={styles.exportBtn}>Export PDF</button>
        )}
      </div>

      {/* Filters */}
      <div style={styles.filters}>
        <select 
          value={filters.owner} 
          onChange={(e) => setFilters({...filters, owner: e.target.value})}
          style={styles.filterSelect}
        >
          <option value="">All Functions</option>
          <option value="OP">OP</option>
          <option value="D&C">D&C</option>
          <option value="T&A">T&A</option>
          <option value="OD">OD</option>
          <option value="Com&Bn">Com&Bn</option>
          <option value="SBM">SBM</option>
          <option value="ALL">ALL</option>
        </select>

        <select 
          value={filters.status} 
          onChange={(e) => setFilters({...filters, status: e.target.value})}
          style={styles.filterSelect}
        >
          <option value="">All Statuses</option>
          <option value="Scheduled">Scheduled</option>
          <option value="Progressing">Progressing</option>
          <option value="Completed">Completed</option>
          <option value="Delayed">Delayed</option>
          <option value="On Hold">On Hold</option>
          <option value="Canceled">Canceled</option>
        </select>

        <button onClick={() => setFilters({ category: '', owner: '', status: '' })} style={styles.clearBtn}>
          Clear Filters
        </button>
      </div>

      {/* Loading */}
      {loading ? (
        <div style={styles.loading}>Loading activities...</div>
      ) : (
        /* Activities Table */
        <div style={styles.tableContainer}>
          {Object.entries(groupedActivities).map(([category, categoryActivities]) => (
            <div key={category} style={styles.categorySection}>
              {/* Category Header */}
              <div style={styles.categoryHeader}>{category}</div>
              
              {/* Table Header */}
              <div style={styles.tableHeader}>
                <span style={styles.colNum}>#</span>
                <span style={styles.colActivity}>Activity</span>
                <span style={styles.colOwner}>Owner</span>
                <span style={styles.colStatus}>Status</span>
                {months.map(m => (
                  <span key={m} style={styles.colMonth}>{m}</span>
                ))}
              </div>

              {/* Activity Rows */}
              {categoryActivities.map((activity, index) => (
                <div key={activity.id} style={{
                  ...styles.tableRow,
                  backgroundColor: index % 2 === 0 ? '#201830' : '#241a38'
                }}>
                  <span style={styles.colNum}>{index + 1}</span>
                  <span style={styles.colActivity}>{activity.name}</span>
                  <span style={styles.colOwner}>{activity.owner}</span>
                  <span style={styles.colStatus}>
                    <span style={{
                      ...styles.statusDot,
                      backgroundColor: statusColors[activity.status] || '#6B7280'
                    }}></span>
                  </span>
                  {months.map(m => (
                    <span key={m} style={styles.colMonth}>
                      {activity.due_dates?.includes(m) && (
                        activity.month_status?.[m] === 'Completed' ? (
                          <span style={styles.checkmark}>✓</span>
                        ) : (
                          <span style={styles.monthMarker}>M</span>
                        )
                      )}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={styles.footer}>
        <span>January 2026</span>
      </div>
    </div>
  );
};

// =============================================
// Styles (matching v17)
// =============================================

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#1a1028',
    color: '#ffffff',
    fontFamily: 'Arial, sans-serif',
    padding: '20px'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2d1f42',
    padding: '15px 20px',
    borderRadius: '8px'
  },
  headerLeft: {
    display: 'flex',
    flexDirection: 'column'
  },
  logoMain: {
    color: '#F3C036',
    fontSize: '18px',
    fontWeight: 'bold'
  },
  logoSub: {
    color: '#F3C036',
    fontSize: '10px',
    letterSpacing: '3px'
  },
  headerCenter: {
    flex: 1,
    textAlign: 'center'
  },
  title: {
    color: '#ffffff',
    fontSize: '18px',
    margin: 0
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '15px'
  },
  userName: {
    color: '#ffffff',
    fontSize: '14px'
  },
  userRole: {
    color: '#F3C036',
    fontSize: '12px',
    backgroundColor: '#371E54',
    padding: '4px 8px',
    borderRadius: '4px'
  },
  logoutBtn: {
    backgroundColor: 'transparent',
    border: '1px solid #F3C036',
    color: '#F3C036',
    padding: '6px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px'
  },
  goldLine: {
    height: '3px',
    backgroundColor: '#F3C036',
    margin: '15px 0'
  },
  statsBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    padding: '10px 0',
    flexWrap: 'wrap'
  },
  statItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px'
  },
  statCircle: {
    fontSize: '12px'
  },
  statLabel: {
    fontSize: '12px',
    color: '#A888BE'
  },
  exportBtn: {
    backgroundColor: '#F3C036',
    color: '#1a1028',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
    marginLeft: 'auto'
  },
  filters: {
    display: 'flex',
    gap: '10px',
    marginBottom: '20px',
    flexWrap: 'wrap'
  },
  filterSelect: {
    backgroundColor: '#2d1f42',
    border: '1px solid #5a4478',
    color: '#ffffff',
    padding: '8px 12px',
    borderRadius: '4px',
    cursor: 'pointer'
  },
  clearBtn: {
    backgroundColor: 'transparent',
    border: '1px solid #5a4478',
    color: '#A888BE',
    padding: '8px 12px',
    borderRadius: '4px',
    cursor: 'pointer'
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: '#A888BE'
  },
  tableContainer: {
    overflowX: 'auto'
  },
  categorySection: {
    marginBottom: '20px'
  },
  categoryHeader: {
    backgroundColor: '#3d2856',
    padding: '10px 15px',
    borderRadius: '4px 4px 0 0',
    fontWeight: 'bold',
    fontSize: '14px'
  },
  tableHeader: {
    display: 'flex',
    backgroundColor: '#2d1f42',
    padding: '8px 15px',
    fontSize: '11px',
    color: '#A888BE'
  },
  tableRow: {
    display: 'flex',
    padding: '10px 15px',
    fontSize: '12px',
    alignItems: 'center',
    borderBottom: '1px solid #2d1f42'
  },
  colNum: {
    width: '30px',
    flexShrink: 0
  },
  colActivity: {
    flex: 1,
    minWidth: '200px'
  },
  colOwner: {
    width: '60px',
    flexShrink: 0,
    textAlign: 'center'
  },
  colStatus: {
    width: '40px',
    flexShrink: 0,
    textAlign: 'center'
  },
  colMonth: {
    width: '30px',
    flexShrink: 0,
    textAlign: 'center'
  },
  statusDot: {
    display: 'inline-block',
    width: '10px',
    height: '10px',
    borderRadius: '50%'
  },
  checkmark: {
    color: '#10B981',
    fontWeight: 'bold'
  },
  monthMarker: {
    color: '#F3C036',
    fontWeight: 'bold'
  },
  footer: {
    textAlign: 'center',
    padding: '20px',
    color: '#5a4478',
    fontSize: '12px'
  }
};

export default DashboardPage;
