// =============================================
// HCD Application - Main App Component
// =============================================

import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check for existing session on load
  useEffect(() => {
    const storedUser = localStorage.getItem('hcd_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  // Logout function
  const handleLogout = () => {
    localStorage.removeItem('hcd_token');
    localStorage.removeItem('hcd_user');
    localStorage.removeItem('hcd_permissions');
    setUser(null);
  };

  if (loading) {
    return (
      <div style={styles.loading}>
        <div style={styles.spinner}></div>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Login Route */}
        <Route 
          path="/login" 
          element={
            user ? <Navigate to="/dashboard" /> : <LoginPage setUser={setUser} />
          } 
        />

        {/* Dashboard Route */}
        <Route 
          path="/dashboard" 
          element={
            user ? <DashboardPage user={user} onLogout={handleLogout} /> : <Navigate to="/login" />
          } 
        />

        {/* Default Redirect */}
        <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} />} />
      </Routes>
    </BrowserRouter>
  );
}

const styles = {
  loading: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1028',
    color: '#ffffff'
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #2d1f42',
    borderTop: '4px solid #F3C036',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  }
};

export default App;
