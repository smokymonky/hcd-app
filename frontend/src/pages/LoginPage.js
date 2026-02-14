// =============================================
// Login Page
// Same design theme as v17 dashboard
// =============================================

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';

const LoginPage = ({ setUser }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await authAPI.login(email, password);
      
      // Save token and user
      localStorage.setItem('hcd_token', data.token);
      localStorage.setItem('hcd_user', JSON.stringify(data.user));
      localStorage.setItem('hcd_permissions', JSON.stringify(data.permissions));
      
      setUser(data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.loginBox}>
        {/* Logo */}
        <div style={styles.logoContainer}>
          <div style={styles.logoText}>
            <span style={styles.logoMain}>Abdul Latif Jameel</span>
            <span style={styles.logoSub}>FINANCE</span>
          </div>
        </div>

        {/* Title */}
        <h1 style={styles.title}>Human Capital Dashboard</h1>
        <p style={styles.subtitle}>Sign in to your account</p>

        {/* Error Message */}
        {error && <div style={styles.error}>{error}</div>}

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              style={styles.input}
              required
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              style={styles.input}
              required
            />
          </div>

          <button 
            type="submit" 
            style={styles.button}
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {/* Footer */}
        <p style={styles.footer}>HCD Annual Plan 2026</p>
      </div>
    </div>
  );
};

// =============================================
// Styles (matching v17 theme)
// =============================================

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1028',
    padding: '20px',
    fontFamily: 'Arial, sans-serif'
  },
  loginBox: {
    backgroundColor: '#2d1f42',
    borderRadius: '12px',
    padding: '40px',
    width: '100%',
    maxWidth: '400px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
  },
  logoContainer: {
    textAlign: 'center',
    marginBottom: '30px'
  },
  logoText: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  logoMain: {
    color: '#F3C036',
    fontSize: '24px',
    fontWeight: 'bold'
  },
  logoSub: {
    color: '#F3C036',
    fontSize: '12px',
    letterSpacing: '4px',
    marginTop: '4px'
  },
  title: {
    color: '#ffffff',
    fontSize: '20px',
    textAlign: 'center',
    marginBottom: '8px',
    fontWeight: '500'
  },
  subtitle: {
    color: '#A888BE',
    fontSize: '14px',
    textAlign: 'center',
    marginBottom: '30px'
  },
  error: {
    backgroundColor: '#EF4444',
    color: '#ffffff',
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '20px',
    textAlign: 'center',
    fontSize: '14px'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  label: {
    color: '#A888BE',
    fontSize: '14px'
  },
  input: {
    backgroundColor: '#1a1028',
    border: '1px solid #5a4478',
    borderRadius: '8px',
    padding: '12px 16px',
    color: '#ffffff',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s'
  },
  button: {
    backgroundColor: '#F3C036',
    color: '#1a1028',
    border: 'none',
    borderRadius: '8px',
    padding: '14px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginTop: '10px',
    transition: 'background-color 0.2s'
  },
  footer: {
    color: '#5a4478',
    fontSize: '12px',
    textAlign: 'center',
    marginTop: '30px'
  }
};

export default LoginPage;
