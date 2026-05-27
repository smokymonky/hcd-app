import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import HROpsDataEntry from '../dashboards/HROpsDataEntry';
import HROpsSnapshot from '../dashboards/HROpsSnapshot';
import StatusBadge from '../dashboards/StatusBadge';
import UserIdentityCard from '../hub/UserIdentityCard';
import { dashboardsAPI } from '../services/api';

// =============================================
// HROpsPage
// =============================================
// Phase 2A module page. Wraps:
//   - Top strip (logo + UserIdentityCard + Logout) — same as Hub
//   - Breadcrumb: Hub / HR Dashboards / HR Operations
//   - Module title + period badge + status badge
//   - Tab navigation: Data Entry ↔ Snapshot
//   - The selected view (HROpsDataEntry or HROpsSnapshot)
//   - Q1 banner: when user is in Entry view + current month, surface
//     unresolved rejected prior month with one-click "Open" jump
//
// Routes (App.js):
//   /hub/dashboards/HR_OPS                  → defaults to entry
//   /hub/dashboards/HR_OPS/entry            → entry view
//   /hub/dashboards/HR_OPS/snapshot         → snapshot view
//
// Access:
//   Entry view is for users with HR_OPS module access at 'owner' or
//   'admin' level. Snapshot view is for any HR_OPS access level
//   ('viewer' or higher). Backend enforces strictly; the UI checks
//   here are advisory to render the right empty state.
// =============================================

export default function HROpsPage({ user, onLogout }) {
  const navigate = useNavigate();
  const { view: viewParam } = useParams();
  const view = viewParam === 'snapshot' ? 'snapshot' : 'entry';

  const now = useMemo(() => new Date(), []);
  const [year] = useState(now.getFullYear());
  const [month] = useState(now.getMonth() + 1);

  const [currentStatus, setCurrentStatus] = useState('empty');
  const [rejectedPrior, setRejectedPrior] = useState(null);   // { year, month, id } or null
  const [accessLevel, setAccessLevel] = useState(null);        // 'admin' | 'owner' | 'viewer' | null

  // Theme
  useEffect(() => {
    document.body.setAttribute('data-theme', 'dark');
  }, []);

  // Resolve user's HR_OPS access level (so we can disable Entry tab for viewers)
  useEffect(() => {
    let cancelled = false;
    // First: read from cached my-access (Hub already populates this)
    const cached = localStorage.getItem('hcd_my_dashboard_access');
    let level = null;
    if (cached) {
      try {
        const list = JSON.parse(cached);
        if (Array.isArray(list)) {
          const row = list.find((m) => m.code === 'HR_OPS');
          if (row) level = row.access_level;
        }
      } catch (_) { /* ignore */ }
    }
    if (level) setAccessLevel(level);
    // Always refresh from server
    dashboardsAPI.getMyAccess()
      .then((rows) => {
        if (cancelled) return;
        const row = (rows || []).find((m) => m.code === 'HR_OPS');
        setAccessLevel(row ? row.access_level : null);
        // Update cache
        localStorage.setItem('hcd_my_dashboard_access', JSON.stringify(rows || []));
      })
      .catch((err) => {
        console.error('[HROpsPage] getMyAccess failed:', err);
        // Rule 5: keep previously cached value, don't blank UI silently
      });
    return () => { cancelled = true; };
  }, []);

  // Q1 — check for unresolved rejected prior month
  useEffect(() => {
    let cancelled = false;
    // Look for any rejected submission for HR_OPS in the current year
    // (and prior year if January, optional — keep simple for Phase 2A).
    dashboardsAPI.listSubmissions('HR_OPS', { year, status: 'rejected' })
      .then((rows) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        // Find any rejected submission BEFORE current month
        const priors = list.filter((r) =>
          (r.year < year) || (r.year === year && r.month < month)
        );
        if (priors.length === 0) {
          setRejectedPrior(null);
        } else {
          // Surface the most recent one
          priors.sort((a, b) => (b.year - a.year) || (b.month - a.month));
          setRejectedPrior(priors[0]);
        }
      })
      .catch((err) => {
        console.error('[HROpsPage] rejected-prior check failed:', err);
        // Non-fatal — banner just won't appear
      });
    return () => { cancelled = true; };
  }, [year, month]);

  // ---------- HANDLERS ----------
  function setView(next) {
    if (next === 'snapshot') {
      navigate('/hub/dashboards/HR_OPS/snapshot');
    } else {
      navigate('/hub/dashboards/HR_OPS/entry');
    }
  }

  function handleLogout() {
    if (onLogout) onLogout();
    navigate('/login');
  }

  function openRejectedPrior() {
    // For Phase 2A, the user just acknowledges the banner — actually
    // navigating to a specific prior-month entry requires year/month
    // routing on this page. We capture the requirement for a Phase 2A
    // follow-up; for now, scroll to the form (current month) and
    // surface a message asking them to switch period manually once
    // the period-picker UI is added in Phase 4.
    // TODO Phase 4: add /hub/dashboards/HR_OPS/entry/:year/:month route.
    setView('entry');
    // Soft visual cue: highlight banner briefly (CSS handles via :target eventually)
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- RENDER ----------
  // Q1 banner: only show on Entry view of current month when prior rejected
  // exists AND user is not already viewing that rejected month.
  const showRejectedBanner = view === 'entry' && !!rejectedPrior;

  // Tab access: viewers see only Snapshot
  const canSeeEntry = accessLevel === 'admin' || accessLevel === 'owner';

  // If viewer-only and on entry view, redirect (effectively)
  useEffect(() => {
    if (accessLevel && !canSeeEntry && view === 'entry') {
      navigate('/hub/dashboards/HR_OPS/snapshot', { replace: true });
    }
  }, [accessLevel, canSeeEntry, view, navigate]);

  return (
    <div style={styles.stage}>
      <div style={styles.orb1} />
      <div style={styles.orb2} />
      <div style={styles.orb3} />
      <style>{`
        @keyframes hrFloat1 { 0%,100% { transform: translate(0,0);} 50% { transform: translate(20px,-15px);} }
        @keyframes hrFloat2 { 0%,100% { transform: translate(0,0);} 50% { transform: translate(-15px,20px);} }
        @keyframes hrFadeInUp { from { opacity:0; transform: translateY(20px);} to { opacity:1; transform: translateY(0);} }
      `}</style>

      {/* TOP STRIP */}
      <div style={styles.topStrip}>
        <svg viewBox="0 0 180 50" style={styles.logo}>
          <text x="0" y="28" fontFamily="Inter, sans-serif" fontSize="18" fontWeight="600" fill="#ffffff">Abdul Latif Jameel</text>
          <text x="0" y="44" fontFamily="Inter, sans-serif" fontSize="12" fontWeight="500" fill="rgba(255,255,255,0.5)">FINANCE</text>
        </svg>
        <div style={styles.topRight}>
          <UserIdentityCard user={user} />
          <button
            type="button"
            style={styles.logoutBtn}
            onClick={handleLogout}
            onMouseEnter={(e) => Object.assign(e.currentTarget.style, styles.logoutBtnHover)}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* MODULE HEADER */}
      <div style={styles.moduleHeader}>
        <div style={styles.breadcrumb}>
          <a
            onClick={() => navigate('/hub')}
            style={styles.breadcrumbLink}
            onMouseEnter={(e) => Object.assign(e.currentTarget.style, styles.breadcrumbLinkHover)}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
          >
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
            </svg>
            Hub
          </a>
          <span style={styles.breadcrumbSep}>/</span>
          <a
            onClick={() => navigate('/hub/hr_dashboards')}
            style={styles.breadcrumbLink}
            onMouseEnter={(e) => Object.assign(e.currentTarget.style, styles.breadcrumbLinkHover)}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
          >
            HR Dashboards
          </a>
          <span style={styles.breadcrumbSep}>/</span>
          <span style={styles.breadcrumbCurrent}>HR Operations</span>
        </div>

        <div style={styles.titleRow}>
          <div>
            <div style={styles.title}>HR Operations</div>
            <div style={styles.subtitle}>Monthly headcount, on-boarding, services SLA.</div>
          </div>
          <div style={styles.titleRight}>
            <span style={styles.periodBadge}>{monthName(month)} {year}</span>
            {view === 'entry' && <StatusBadge status={currentStatus} />}
          </div>
        </div>

        <div style={styles.tabs}>
          {canSeeEntry && (
            <button
              type="button"
              style={{ ...styles.tab, ...(view === 'entry' ? styles.tabActive : {}) }}
              onClick={() => setView('entry')}
            >
              Data Entry
            </button>
          )}
          <button
            type="button"
            style={{ ...styles.tab, ...(view === 'snapshot' ? styles.tabActive : {}) }}
            onClick={() => setView('snapshot')}
          >
            Snapshot
          </button>
        </div>
      </div>

      {/* Q1 banner */}
      {showRejectedBanner && (
        <div style={styles.bannerResume}>
          <span style={styles.bannerIcon}>↻</span>
          <div style={{ flex: 1 }}>
            <strong style={styles.bannerStrong}>
              Heads up — your {monthName(rejectedPrior.month)} {rejectedPrior.year} submission was rejected and is still awaiting your edits.
            </strong>
            <div style={styles.bannerMeta}>
              Workflow ID #{rejectedPrior.id}
            </div>
          </div>
          <div style={styles.bannerActions}>
            <button
              type="button"
              style={styles.btnMiniPrimary}
              onClick={openRejectedPrior}
            >
              Open {monthName(rejectedPrior.month)} →
            </button>
          </div>
        </div>
      )}

      {/* VIEW */}
      {view === 'entry' && canSeeEntry && (
        <HROpsDataEntry
          user={user}
          year={year}
          month={month}
          variant="full"
          onStatusChange={setCurrentStatus}
        />
      )}
      {view === 'snapshot' && (
        <HROpsSnapshot user={user} variant="full" />
      )}

      <div style={styles.footer}>Human Capital Hub</div>
    </div>
  );
}

// =============================================
// Helpers
// =============================================
function monthName(m) {
  return ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'][m] || '';
}

// =============================================
// STYLES
// =============================================
const styles = {
  stage: {
    position: 'relative', minHeight: '100vh', overflow: 'hidden',
    background: 'linear-gradient(135deg, #1a1028 0%, #2d1f42 30%, #3d2856 60%, #4a3265 100%)',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    color: '#fff',
    paddingBottom: 60,
  },
  orb1: {
    position: 'absolute', top: '4%', left: '6%',
    width: 280, height: 280, borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(243,192,54,0.10) 0%, transparent 70%)',
    animation: 'hrFloat1 8s ease-in-out infinite', pointerEvents: 'none',
  },
  orb2: {
    position: 'absolute', bottom: '8%', right: '6%',
    width: 360, height: 360, borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(168,85,247,0.10) 0%, transparent 70%)',
    animation: 'hrFloat2 10s ease-in-out infinite', pointerEvents: 'none',
  },
  orb3: {
    position: 'absolute', top: '40%', left: '50%',
    width: 500, height: 500, borderRadius: '50%',
    transform: 'translate(-50%,-50%)',
    background: 'radial-gradient(circle, rgba(236,72,153,0.05) 0%, transparent 70%)',
    pointerEvents: 'none',
  },

  topStrip: {
    position: 'relative', zIndex: 5,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '28px 48px 0',
  },
  logo: { height: 50, width: 'auto', display: 'block' },
  topRight: { display: 'flex', alignItems: 'center' },
  logoutBtn: {
    background: 'transparent', color: 'rgba(255,255,255,0.6)',
    border: '1px solid rgba(255,255,255,0.1)',
    padding: '9px 14px', borderRadius: 8,
    fontFamily: 'inherit', fontSize: 12, fontWeight: 500,
    cursor: 'pointer', transition: 'all 0.15s ease',
    marginLeft: 10,
  },
  logoutBtnHover: {
    background: 'rgba(239,68,68,0.1)',
    borderColor: 'rgba(239,68,68,0.3)',
    color: '#ef4444',
  },

  moduleHeader: {
    position: 'relative', zIndex: 5,
    padding: '22px 48px 0',
    animation: 'hrFadeInUp 0.5s ease',
  },
  breadcrumb: {
    display: 'flex', alignItems: 'center', gap: 8,
    fontSize: 12, color: 'rgba(255,255,255,0.5)',
    marginBottom: 14,
  },
  breadcrumbLink: {
    color: 'rgba(255,255,255,0.7)',
    textDecoration: 'none',
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '6px 10px', borderRadius: 6,
    transition: 'all 0.15s ease', cursor: 'pointer',
  },
  breadcrumbLinkHover: {
    background: 'rgba(255,255,255,0.05)',
    color: '#F3C036',
  },
  breadcrumbSep: { color: 'rgba(255,255,255,0.3)' },
  breadcrumbCurrent: { color: '#fff', fontWeight: 600 },

  titleRow: {
    display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
    gap: 16, flexWrap: 'wrap', marginBottom: 16,
  },
  title: {
    fontSize: 28, fontWeight: 700, letterSpacing: '-0.6px',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13, color: 'rgba(255,255,255,0.55)', fontWeight: 500,
  },
  titleRight: {
    display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
  },
  periodBadge: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '6px 12px',
    background: 'rgba(243,192,54,0.10)',
    border: '1px solid rgba(243,192,54,0.3)',
    borderRadius: 18,
    fontSize: 11, color: '#F3C036',
    fontWeight: 700, letterSpacing: '0.8px',
    textTransform: 'uppercase',
  },

  tabs: {
    display: 'inline-flex',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
    padding: 4, gap: 2,
    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
  },
  tab: {
    padding: '8px 16px',
    borderRadius: 7,
    fontSize: 12, fontWeight: 600,
    color: 'rgba(255,255,255,0.6)',
    cursor: 'pointer', background: 'transparent', border: 'none',
    fontFamily: 'inherit',
    transition: 'all 0.18s ease',
    letterSpacing: '0.1px',
  },
  tabActive: {
    background: 'linear-gradient(135deg, rgba(243,192,54,0.18), rgba(236,72,153,0.12))',
    color: '#fff',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
  },

  bannerResume: {
    position: 'relative', zIndex: 5,
    maxWidth: 1100, margin: '14px auto 0',
    padding: '14px 18px',
    background: 'rgba(243,192,54,0.10)',
    border: '1px solid rgba(243,192,54,0.3)',
    borderRadius: 12,
    fontSize: 13, lineHeight: 1.5, color: '#fde68a',
    display: 'flex', alignItems: 'flex-start', gap: 12,
    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
  },
  bannerIcon: {
    flexShrink: 0, width: 22, height: 22,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700,
  },
  bannerStrong: { color: '#fff', fontWeight: 600 },
  bannerMeta: { color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 4 },
  bannerActions: { marginLeft: 'auto', flexShrink: 0, display: 'flex', gap: 8 },
  btnMiniPrimary: {
    padding: '6px 12px', fontSize: 11, fontWeight: 600,
    borderRadius: 6, cursor: 'pointer',
    fontFamily: 'inherit',
    background: 'rgba(243,192,54,0.2)',
    color: '#F3C036',
    border: '1px solid rgba(243,192,54,0.4)',
  },

  footer: {
    position: 'relative', zIndex: 5,
    padding: '40px 48px 0',
    textAlign: 'center',
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11, letterSpacing: '0.3px',
  },
};
