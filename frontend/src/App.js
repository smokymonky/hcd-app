import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AdminPage from './pages/AdminPage';
import HubPage from './pages/HubPage';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem('hcd_user');
    const savedToken = localStorage.getItem('hcd_token');
    if (savedUser && savedToken) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem('hcd_user');
        localStorage.removeItem('hcd_token');
      }
    }
    setLoading(false);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('hcd_token');
    localStorage.removeItem('hcd_user');
    localStorage.removeItem('hcd_permissions');
    localStorage.removeItem('hcd_my_dashboard_access');
    setUser(null);
  };

  if (loading) {
    return (
      <div style={styles.loading}>
        <div style={styles.spinner} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const isAdmin = user && (user.role === 'admin' || user.role === 'Admin');

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <LoginPage setUser={setUser} />} />
        <Route path="/dashboard" element={user ? <DashboardPage user={user} onLogout={handleLogout} /> : <Navigate to="/login" />} />
        <Route path="/admin" element={isAdmin ? <AdminPage user={user} onLogout={handleLogout} /> : <Navigate to={user ? "/dashboard" : "/login"} />} />
        {/* HUB — Phase 1. Both /hub (Level 1) and /hub/:categoryId (Level 2)
            served by the same HubPage component (Rule 13 #1, #7).
            Login still routes to /dashboard (Annual Plan) — Phase 7 flips the
            cutover to /hub. Hub exists but is unlinked from login flow until then. */}
        <Route path="/hub" element={user ? <HubPage user={user} onLogout={handleLogout} /> : <Navigate to="/login" />} />
        <Route path="/hub/:categoryId" element={user ? <HubPage user={user} onLogout={handleLogout} /> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} />} />
      </Routes>
    </BrowserRouter>
  );
}

const styles = {
  loading: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg, #1a1028 0%, #2d1f42 30%, #3d2856 60%, #4a3265 100%)',
  },
  spinner: {
    width: 40, height: 40, border: '4px solid rgba(255,255,255,0.1)',
    borderTopColor: '#F3C036', borderRadius: '50%', animation: 'spin 0.8s linear infinite',
  },
};

export default App;
