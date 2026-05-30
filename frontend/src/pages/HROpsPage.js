import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import HROpsDataEntry from '../dashboards/HROpsDataEntry';
import HROpsSnapshot from '../dashboards/HROpsSnapshot';
import StatusBadge from '../dashboards/StatusBadge';
import UserIdentityCard from '../hub/UserIdentityCard';
import { dashboardsAPI, targetsAPI } from '../services/api';
import { SYSTEM_START_YEAR, applyTargetsToFields } from '../config/hrOpsFields';

// =============================================
// HROpsPage
// =============================================
// Phase 2A + Extension. URL is the single source of truth for view,
// year, and month. Component reads params, defaults intelligently when
// absent, and passes year/month down to HROpsDataEntry as props.
//
// Supported URL shapes:
//   /hub/dashboards/HR_OPS                       → defaults: entry, current month
//   /hub/dashboards/HR_OPS/entry                 → entry, current month
//   /hub/dashboards/HR_OPS/snapshot              → snapshot, latest published
//   /hub/dashboards/HR_OPS/entry/:year/:month    → entry, specific historical month
//   /hub/dashboards/HR_OPS/snapshot/:year/:month → snapshot, specific published month
//
// Permissions: Entry view for users with HR_OPS module access at 'owner'
// or 'admin' level. Snapshot view for any HR_OPS access level. Backend
// enforces strictly; UI checks here are advisory.
//
// PHASE 2B: targets hydration. On mount, fetches active targets via
// GET /api/targets?module=HR_OPS and merges into FIELDS' `target` property
// BEFORE rendering HROpsDataEntry / HROpsSnapshot. Child components remain
// unchanged — they still read `field.target` from the FIELDS array. This
// is the parent-level hydration step required by Option C (seed + hydrate).
// =============================================

export default function HROpsPage({ user, onLogout }) {
  const navigate = useNavigate();
  const params = useParams();

  // ---------- DERIVE VIEW + YEAR + MONTH FROM URL ----------
  // Route param names depend on which route matched. React Router gives us
  // whichever was matched. We normalize defensively.
  const now = useMemo(() => new Date(), []);
  const view = resolveView(params);
  const { year, month } = resolvePeriod(params, now);

  // Sanity floor: if a URL hands us /entry/2024/3 (before SYSTEM_START_YEAR),
  // redirect to the floor year + same month. We never RENDER below floor.
  useEffect(() => {
    if (year < SYSTEM_START_YEAR) {
      navigate(`/hub/dashboards/HR_OPS/${view}/${SYSTEM_START_YEAR}/${month}`, { replace: true });
    }
  }, [year, month, view, navigate]);

  // State
  const [currentStatus, setCurrentStatus] = useState('empty');
  const [rejectedPrior, setRejectedPrior] = useState(null);   // { year, month, id } or null
  const [accessLevel, setAccessLevel] = useState(null);        // 'admin' | 'owner' | 'viewer' | null

  // PHASE 2B — Targets hydration gate. Children render only after this is true.
  // Fail-open: if the API call fails, we still proceed (children render with
  // cleared inline targets — better than blocking the whole module on a
  // targets-config call failing).
  const [targetsHydrated, setTargetsHydrated] = useState(false);

  // Theme
  useEffect(() => {
    document.body.setAttribute('data-theme', 'dark');
  }, []);

  // Resolve user's HR_OPS access level (cache-first, then refresh).
  useEffect(() => {
    let cancelled = false;
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
    dashboardsAPI.getMyAccess()
      .then((rows) => {
        if (cancelled) return;
        const row = (rows || []).find((m) => m.code === 'HR_OPS');
        setAccessLevel(row ? row.access_level : null);
        localStorage.setItem('hcd_my_dashboard_access', JSON.stringify(rows || []));
      })
      .catch((err) => {
        console.error('[HROpsPage] getMyAccess failed:', err);
      });
    return () => { cancelled = true; };
  }, []);

  // PHASE 2B — Hydrate FIELDS.target from /api/targets on mount.
  // This MUST complete before HROpsDataEntry / HROpsSnapshot render — they
  // read field.target during render and we want the DB version, not the
  // inline seed. applyTargetsToFields() clears inline targets first then
  // applies DB-driven active rows.
  //
  // Fail-open: if the API call fails (network, auth, server error), we
  // log + flip hydrated to true anyway so the user isn't stuck on a
  // loading screen. Children render with cleared targets (no indicators)
  // which is a graceful degradation rather than a hard failure.
  useEffect(() => {
    let cancelled = false;
    targetsAPI.list('HR_OPS')
      .then((rows) => {
        if (cancelled) return;
        applyTargetsToFields(Array.isArray(rows) ? rows : []);
        setTargetsHydrated(true);
      })
      .catch((err) => {
        // Fail-open: log and continue. Children render with no inline targets.
        console.error('[HROpsPage] targets hydration failed — proceeding without target indicators:', err);
        if (!cancelled) {
          // Defensively still clear inline targets so behavior is deterministic
          // (no "stale inline target showing even though API said no targets").
          applyTargetsToFields([]);
          setTargetsHydrated(true);
        }
      });
    return () => { cancelled = true; };
  }, []);

  // Q1 — check for unresolved rejected prior month.
  // Re-runs whenever year changes (e.g. user switches periods via dropdown).
  // We check for rejected submissions in `year` AND `year - 1` to catch
  // the January-of-new-year edge case.
  useEffect(() => {
    let cancelled = false;
    const yearsToCheck = [year, year - 1].filter((y) => y >= SYSTEM_START_YEAR);
    Promise.all(
      yearsToCheck.map((y) => dashboardsAPI.listSubmissions('HR_OPS', { year: y, status: 'rejected' }))
    )
      .then((results) => {
        if (cancelled) return;
        // Flatten and find prior-to-current
        const all = [].concat(...results.map((r) => Array.isArray(r) ? r : []));
        const priors = all.filter((r) =>
          (r.year < year) || (r.year === year && r.month < month)
        );
        if (priors.length === 0) {
          setRejectedPrior(null);
        } else {
          priors.sort((a, b) => (b.year - a.year) || (b.month - a.month));
          setRejectedPrior(priors[0]);
        }
      })
      .catch((err) => {
        console.error('[HROpsPage] rejected-prior check failed:', err);
      });
    return () => { cancelled = true; };
  }, [year, month]);

  // ---------- HANDLERS ----------
  // setView preserves year/month when switching tabs IF the URL had them.
  // When URL is /entry (no year/month) → tab switch goes to /snapshot
  // (also without year/month, defaulting to "latest published" in Snapshot).
  function setView(next) {
    const hasExplicitPeriod = params.year && params.month;
    if (hasExplicitPeriod) {
      navigate(`/hub/dashboards/HR_OPS/${next}/${year}/${month}`);
    } else {
      navigate(`/hub/dashboards/HR_OPS/${next}`);
    }
  }

  // Called by HROpsDataEntry's period dropdowns. Updates URL — that
  // triggers re-render with new year/month props, which re-fetches data.
  function handleEntryPeriodChange(newYear, newMonth) {
    navigate(`/hub/dashboards/HR_OPS/entry/${newYear}/${newMonth}`);
  }

  // Called by HROpsSnapshot's period dropdowns (same pattern).
  function handleSnapshotPeriodChange(newYear, newMonth) {
    navigate(`/hub/dashboards/HR_OPS/snapshot/${newYear}/${newMonth}`);
  }

  function handleLogout() {
    if (onLogout) onLogout();
    navigate('/login');
  }

  // Q1 banner — N2 fix: navigate to the actual rejected month's entry view.
  function openRejectedPrior() {
    if (!rejectedPrior) return;
    navigate(`/hub/dashboards/HR_OPS/entry/${rejectedPrior.year}/${rejectedPrior.month}`);
  }

  // ---------- RENDER ----------
  // Smart-relevance banner (Principle 6B.9):
  // Show only on Entry view AND only when user is NOT already on the
  // rejected month. If they ARE on it, the Rejected state UI already
  // surfaces the rejection reason; the banner would be redundant.
  const onRejectedMonthAlready = rejectedPrior
    && rejectedPrior.year === year
    && rejectedPrior.month === month;
  const showRejectedBanner = view === 'entry' && !!rejectedPrior && !onRejectedMonthAlready;

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
        @keyframes hrSpin { to { transform: rotate(360deg); } }
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

      {/* Q1 banner — smart-relevance hidden when user is on the rejected month */}
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

      {/* PHASE 2B — gate render on targets hydration. Tiny shimmer until done. */}
      {!targetsHydrated && (
        <div style={styles.hydrationSpinnerWrap}>
          <div style={styles.spinner} />
        </div>
      )}

      {/* VIEW — only render once targets are hydrated, so Snapshot's
          Saudization indicator + Entry's target evaluations come from the
          DB (not stale inline seed) on the very first frame. */}
      {targetsHydrated && view === 'entry' && canSeeEntry && (
        <HROpsDataEntry
          /* Rerender (and refetch) whenever year+month change — keyed on URL */
          key={`entry-${year}-${month}`}
          user={user}
          year={year}
          month={month}
          variant="full"
          onStatusChange={setCurrentStatus}
          onPeriodChange={handleEntryPeriodChange}
        />
      )}
      {targetsHydrated && view === 'snapshot' && (
        <HROpsSnapshot
          /* Rerender when URL period changes (or when URL had no period — pass null) */
          key={`snapshot-${params.year || 'auto'}-${params.month || 'auto'}`}
          user={user}
          urlYear={params.year ? Number(params.year) : null}
          urlMonth={params.month ? Number(params.month) : null}
          variant="full"
          onPeriodChange={handleSnapshotPeriodChange}
        />
      )}

      <div style={styles.footer}>Human Capital Hub</div>
    </div>
  );
}

// =============================================
// URL → state helpers
// =============================================
// React Router gives us only the params that matched. We normalize the
// `:view` param and resolve year/month, defaulting to current month
// when not in URL.

function resolveView(params) {
  // Routes:
  //   /HR_OPS                            → no params, default to entry
  //   /HR_OPS/:view                      → params.view = 'entry' | 'snapshot'
  //   /HR_OPS/entry/:year/:month         → no `view` param, derive from path
  //   /HR_OPS/snapshot/:year/:month      → no `view` param, derive from path
  if (params.view === 'snapshot') return 'snapshot';
  if (params.view === 'entry') return 'entry';
  // Period-bearing routes don't use :view — we know from window.location
  if (typeof window !== 'undefined' && window.location && window.location.pathname) {
    if (window.location.pathname.includes('/HR_OPS/snapshot/')) return 'snapshot';
    if (window.location.pathname.includes('/HR_OPS/entry/')) return 'entry';
  }
  return 'entry';
}

function resolvePeriod(params, now) {
  const py = parseInt(params.year, 10);
  const pm = parseInt(params.month, 10);
  const hasValidYear = Number.isFinite(py) && py >= SYSTEM_START_YEAR;
  const hasValidMonth = Number.isFinite(pm) && pm >= 1 && pm <= 12;
  if (hasValidYear && hasValidMonth) {
    return { year: py, month: pm };
  }
  // Defaults: current year + current month (1-indexed)
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

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

  hydrationSpinnerWrap: {
    position: 'relative', zIndex: 5,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: 240,
  },
  spinner: {
    width: 36, height: 36,
    border: '4px solid rgba(255,255,255,0.1)',
    borderTopColor: '#F3C036',
    borderRadius: '50%',
    animation: 'hrSpin 0.8s linear infinite',
  },

  footer: {
    position: 'relative', zIndex: 5,
    padding: '40px 48px 0',
    textAlign: 'center',
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11, letterSpacing: '0.3px',
  },
};
