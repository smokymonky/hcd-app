import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/dashboard.css';

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
      const apiUrl = process.env.REACT_APP_API_URL || 'https://hcd-app.up.railway.app/api';
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      localStorage.setItem('hcd_token', data.token);
      localStorage.setItem('hcd_user', JSON.stringify(data.user));
      if (data.permissions) {
        localStorage.setItem('hcd_permissions', JSON.stringify(data.permissions));
      }

      setUser(data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.wrapper}>
      {/* Background decorations */}
      <div style={styles.bgOrb1} />
      <div style={styles.bgOrb2} />
      <div style={styles.bgOrb3} />

      <div style={styles.container}>
        {/* Logo */}
        <div style={styles.logoSection}>
          <svg viewBox="0 0 180 50" style={{ height: 50, width: 'auto' }}>
            <text x="0" y="28" fontFamily="Inter, sans-serif" fontSize="18" fontWeight="600" fill="#ffffff">Abdul Latif Jameel</text>
            <text x="0" y="44" fontFamily="Inter, sans-serif" fontSize="12" fontWeight="500" fill="rgba(255,255,255,0.5)">FINANCE</text>
          </svg>
        </div>

        {/* Login Card */}
        <div style={styles.card}>
          {/* Card accent line */}
          <div style={styles.cardAccent} />

          <div style={styles.cardContent}>
            <h1 style={styles.title}>HCD Annual Plan</h1>
            <p style={styles.subtitle}>Human Capital Department Portal</p>

            {error && (
              <div style={styles.errorBox}>
                <span style={styles.errorIcon}>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} style={styles.form}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Email</label>
                <div style={styles.inputWrapper}>
                  <svg style={styles.inputIcon} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                  </svg>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="admin@aljfinance.com"
                    required
                    style={styles.input}
                  />
                </div>
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Password</label>
                <div style={styles.inputWrapper}>
                  <svg style={styles.inputIcon} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    style={styles.input}
                  />
                </div>
              </div>

              <button type="submit" disabled={loading} style={{
                ...styles.submitBtn,
                opacity: loading ? 0.7 : 1,
                cursor: loading ? 'not-allowed' : 'pointer'
              }}>
                {loading ? (
                  <span style={styles.spinnerWrap}>
                    <span style={styles.spinner} />
                    Signing in...
                  </span>
                ) : 'Sign In'}
              </button>
            </form>

            <p style={styles.footer}>
              Contact your administrator for account access
            </p>
          </div>
        </div>

        {/* Year badge */}
        <div style={styles.yearBadge}>2026</div>
      </div>

      {/* Spinner animation */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes float1 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(30px,-20px); } }
        @keyframes float2 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(-20px,30px); } }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
      `}</style>
    </div>
  );
};

const styles = {
  wrapper: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #1a1028 0%, #2d1f42 30%, #3d2856 60%, #4a3265 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    position: 'relative',
    overflow: 'hidden',
    padding: '20px',
  },
  bgOrb1: {
    position: 'absolute',
    top: '10%',
    left: '10%',
    width: 300,
    height: 300,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(243,192,54,0.08) 0%, transparent 70%)',
    animation: 'float1 8s ease-in-out infinite',
  },
  bgOrb2: {
    position: 'absolute',
    bottom: '15%',
    right: '10%',
    width: 400,
    height: 400,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(168,136,190,0.08) 0%, transparent 70%)',
    animation: 'float2 10s ease-in-out infinite',
  },
  bgOrb3: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 500,
    height: 500,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(236,72,153,0.05) 0%, transparent 70%)',
    transform: 'translate(-50%, -50%)',
  },
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 32,
    zIndex: 1,
    animation: 'fadeInUp 0.6s ease',
    width: '100%',
    maxWidth: 440,
  },
  logoSection: {
    textAlign: 'center',
  },
  card: {
    width: '100%',
    background: 'rgba(255, 255, 255, 0.03)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: 16,
    border: '1px solid rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
    position: 'relative',
  },
  cardAccent: {
    height: 3,
    background: 'linear-gradient(90deg, #F3C036, #ec4899, #a855f7)',
    width: '100%',
  },
  cardContent: {
    padding: '40px 36px',
  },
  title: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: 700,
    marginBottom: 4,
    letterSpacing: '-0.3px',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: 500,
    marginBottom: 32,
  },
  errorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 16px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: 8,
    color: '#ef4444',
    fontSize: 13,
    marginBottom: 20,
  },
  errorIcon: {
    fontSize: 16,
    flexShrink: 0,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: 600,
  },
  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  inputIcon: {
    position: 'absolute',
    left: 14,
    width: 18,
    height: 18,
    color: 'rgba(255,255,255,0.4)',
    pointerEvents: 'none',
  },
  input: {
    width: '100%',
    padding: '14px 16px 14px 44px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    fontFamily: "'Inter', sans-serif",
    fontSize: 14,
    fontWeight: 500,
    color: '#ffffff',
    outline: 'none',
    transition: 'all 0.15s ease',
    boxSizing: 'border-box',
  },
  submitBtn: {
    width: '100%',
    padding: '14px 24px',
    background: 'linear-gradient(135deg, #ec4899 0%, #a855f7 100%)',
    color: '#ffffff',
    border: 'none',
    borderRadius: 8,
    fontFamily: "'Inter', sans-serif",
    fontWeight: 600,
    fontSize: 15,
    transition: 'all 0.15s ease',
    boxShadow: '0 4px 20px rgba(236, 72, 153, 0.3)',
    marginTop: 8,
  },
  spinnerWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  spinner: {
    width: 18,
    height: 18,
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#ffffff',
    borderRadius: '50%',
    display: 'inline-block',
    animation: 'spin 0.8s linear infinite',
  },
  footer: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    marginTop: 24,
  },
  yearBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px 20px',
    background: 'rgba(243, 192, 54, 0.15)',
    border: '1px solid rgba(243, 192, 54, 0.3)',
    borderRadius: 20,
    color: '#F3C036',
    fontSize: 13,
    fontWeight: 700,
    fontFamily: "'Inter', sans-serif",
    letterSpacing: '1px',
  },
};

export default LoginPage;
