import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  HUB_SHELL,
  ICON_PATHS,
  buildCategoryChildren,
  buildLevel1Tiles,
  getShellEntry,
} from '../config/moduleConfig';
import { dashboardsAPI } from '../services/api';
import HubTile from '../hub/HubTile';
import UserIdentityCard from '../hub/UserIdentityCard';
import AccessDeniedModal from '../hub/AccessDeniedModal';

// =============================================
// HubPage
// =============================================
// Single component handles BOTH levels via URL routing (Rule 13 #1, #7):
//   /hub                       → Level 1 (top-level tiles)
//   /hub/:categoryId           → Level 2 (drilldown view of a category)
//
// N-level future support: add /hub/:categoryId/:childId etc. and the
// same component pattern extends without rewriting state machinery.
// React Router params are the navigation stack; no pageStack state needed.
// =============================================

export default function HubPage({ user, onLogout }) {
  const navigate = useNavigate();
  const { categoryId } = useParams();
  const isCategoryView = !!categoryId;

  // API-fetched module access (the "fill" data)
  const [apiModules, setApiModules] = useState(null);     // null = loading, [] = loaded empty, [...] = ok
  const [apiError, setApiError] = useState(null);
  const [loading, setLoading] = useState(true);

  // Access denied modal state
  const [deniedTile, setDeniedTile] = useState(null);

  // Theme setup (matches LoginPage / DashboardPage)
  useEffect(() => {
    document.body.setAttribute('data-theme', 'dark');
  }, []);

  // Fetch user's module access on mount.
  // Cache-first per Rule 4: optimistically use last-known result while
  // refreshing in background. Falls back to empty list on error so the
  // Hub still renders (function_head with no access still sees locked
  // tiles, not a broken page).
  useEffect(() => {
    let cancelled = false;

    // Try cache first
    const cached = localStorage.getItem('hcd_my_dashboard_access');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          setApiModules(parsed);
          setLoading(false);
        }
      } catch (_) { /* ignore */ }
    }

    // Always refresh from server
    dashboardsAPI.getMyAccess()
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setApiModules(list);
        setApiError(null);
        localStorage.setItem('hcd_my_dashboard_access', JSON.stringify(list));
      })
      .catch((err) => {
        if (cancelled) return;
        // Rule 5: visible (in-page) error, not silent. Logs + sets state.
        // We DON'T blank out the cached data if we had any.
        console.error('[Hub] /api/dashboards/my-access failed:', err);
        setApiError(err.message || 'Could not load module access.');
        if (apiModules == null) setApiModules([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  // Resolve the entry for the current category (Level 2)
  const categoryEntry = useMemo(() => {
    if (!isCategoryView) return null;
    const entry = getShellEntry(categoryId);
    return entry && entry.type === 'category' ? entry : null;
  }, [isCategoryView, categoryId]);

  // If the URL points to an unknown category, redirect to Level 1
  useEffect(() => {
    if (isCategoryView && !categoryEntry) {
      navigate('/hub', { replace: true });
    }
  }, [isCategoryView, categoryEntry, navigate]);

  // Build tiles for the current view
  const level1Tiles = useMemo(() => buildLevel1Tiles(), []);
  const level2Tiles = useMemo(() => {
    if (!categoryEntry) return [];
    return buildCategoryChildren(categoryEntry.id, apiModules || []);
  }, [categoryEntry, apiModules]);

  // Permission resolution per tile.
  // Locked = the user cannot click into this tile.
  // For Level 1 modules (Annual Plan): not locked (existing app gates internally).
  // For Level 1 category (HR Dashboards): not locked — drilldown shows what's locked.
  // For Level 2 dashboard tiles: locked if NOT admin AND not present in apiModules.
  function isTileLocked(tile) {
    if (tile.type === 'category') return false;
    if (tile.type === 'module' && !tile.parent) return false; // top-level static module (Annual Plan)
    // L2 dashboard: presence in apiModules means user has access
    if (user && user.role && user.role.toLowerCase() === 'admin') return false;
    if (!Array.isArray(apiModules)) return true;
    return !apiModules.some((m) => m.code === tile.moduleCode);
  }

  // Click handler — dispatched by HubTile
  function handleTileClick(tile) {
    if (tile.type === 'category') {
      navigate(`/hub/${encodeURIComponent(tile.id)}`);
      return;
    }
    // Module — check lock first
    if (isTileLocked(tile)) {
      setDeniedTile(tile);
      return;
    }
    // Navigate to its route
    if (tile.route) {
      navigate(tile.route);
    }
  }

  // Logout via the onLogout prop (which clears tokens/cache),
  // then send the user to login.
  function handleLogout() {
    if (onLogout) onLogout();
    navigate('/login');
  }

  // Back to Level 1 (used in breadcrumb)
  function goLevel1() {
    navigate('/hub');
  }

  // + New Dashboard (admin-only, disabled with tooltip per Phase 1 Option 1)
  function handleNewAction() {
    // Currently no-op; Phase 8 will wire this. The tile shows the entry
    // point exists, the tooltip explains when it activates.
  }

  // Render
  const isAdmin = user && user.role && user.role.toLowerCase() === 'admin';

  return (
    <div style={styles.stage}>
      {/* Ambient orbs */}
      <div style={styles.orb1} />
      <div style={styles.orb2} />
      <div style={styles.orb3} />
      <style>{`
        @keyframes hubFloat1 { 0%,100% { transform: translate(0,0);} 50% { transform: translate(30px,-20px);} }
        @keyframes hubFloat2 { 0%,100% { transform: translate(0,0);} 50% { transform: translate(-20px,30px);} }
        @keyframes hubFadeInUp { from { opacity:0; transform: translateY(20px);} to { opacity:1; transform: translateY(0);} }
        @keyframes hubFadeIn { from { opacity:0; } to { opacity:1; } }
      `}</style>

      {/* Top strip: logo + user identity + logout */}
      <div style={styles.topStrip}>
        <svg viewBox="0 0 180 50" style={styles.logo}>
          <text x="0" y="28" fontFamily="Inter, sans-serif" fontSize="18" fontWeight="600" fill="#ffffff">Abdul Latif Jameel</text>
          <text x="0" y="44" fontFamily="Inter, sans-serif" fontSize="12" fontWeight="500" fill="rgba(255,255,255,0.5)">FINANCE</text>
        </svg>
        <div style={styles.topRight}>
          <UserIdentityCard user={user} />
          <button type="button" style={styles.logoutBtn} onClick={handleLogout}
            onMouseEnter={(e) => Object.assign(e.currentTarget.style, styles.logoutBtnHover)}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}>
            Logout
          </button>
        </div>
      </div>

      {/* Optional API error banner (Rule 5 — visible error) */}
      {apiError && (
        <div style={styles.errorBanner}>
          Couldn&apos;t refresh module access. Showing last-known. <span style={styles.errorDetail}>({apiError})</span>
        </div>
      )}

      {/* LEVEL 1 */}
      {!isCategoryView && (
        <div style={styles.fadeIn}>
          <div style={{ ...styles.grid, ...styles.gridLevel1 }}>
            {level1Tiles.map((tile) => (
              <HubTile
                key={tile.id}
                tile={tile}
                locked={isTileLocked(tile)}
                onClick={handleTileClick}
              />
            ))}
          </div>
        </div>
      )}

      {/* LEVEL 2 */}
      {isCategoryView && categoryEntry && (
        <div style={styles.fadeIn}>
          <div style={styles.l2Header}>
            <div style={styles.breadcrumb}>
              <a onClick={goLevel1} style={styles.breadcrumbLink}
                onMouseEnter={(e) => Object.assign(e.currentTarget.style, styles.breadcrumbLinkHover)}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}>
                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
                </svg>
                Hub
              </a>
              <span style={styles.breadcrumbSep}>/</span>
              <span style={styles.breadcrumbCurrent}>{categoryEntry.title}</span>
            </div>
            <div style={styles.l2TitleRow}>
              <div>
                <div style={styles.l2Title}>{categoryEntry.title}</div>
                {categoryEntry.drilldownSubtitle && (
                  <div style={styles.l2Subtitle}>{categoryEntry.drilldownSubtitle}</div>
                )}
              </div>
              {/* + New action — admin-only, disabled with tooltip per Phase 1 spec */}
              {isAdmin && categoryEntry.allowsCreation && (
                <button
                  type="button"
                  style={styles.headerAction}
                  title={categoryEntry.newActionDisabledReason || ''}
                  onClick={handleNewAction}
                  disabled={!!categoryEntry.newActionDisabledReason}
                  aria-disabled={!!categoryEntry.newActionDisabledReason}
                  onMouseEnter={(e) => { if (!categoryEntry.newActionDisabledReason) Object.assign(e.currentTarget.style, styles.headerActionHover); }}
                  onMouseLeave={(e) => Object.assign(e.currentTarget.style, styles.headerAction)}
                >
                  <span style={styles.plusGlyph}>+</span>
                  {(categoryEntry.newActionLabel || '+ New Item').replace(/^\+\s*/, '')}
                </button>
              )}
            </div>
          </div>

          {loading && level2Tiles.length === 0 && (
            <div style={styles.loadingNote}>Loading dashboards…</div>
          )}

          <div style={{ ...styles.grid, ...styles.gridLevel2 }}>
            {level2Tiles.map((tile) => (
              <HubTile
                key={tile.id}
                tile={tile}
                locked={isTileLocked(tile)}
                onClick={handleTileClick}
              />
            ))}
          </div>

          {!loading && level2Tiles.length === 0 && (
            <div style={styles.emptyNote}>
              No dashboards available in this category yet.
            </div>
          )}
        </div>
      )}

      <div style={styles.footer}>Human Capital Hub</div>

      <AccessDeniedModal
        open={!!deniedTile}
        onClose={() => setDeniedTile(null)}
        moduleName={deniedTile?.title}
        moduleCode={deniedTile?.moduleCode}
        userFunction={user?.function}
        userFunctionNote={deniedFunctionNote(user, deniedTile)}
        requiredAccess={deniedTile?.requiredAccess || ['viewer', 'owner']}
      />
    </div>
  );
}

// Build a small helper-note string for the modal.
// E.g. "auto-mapped to HR_OPS only" if function maps to single module.
function deniedFunctionNote(user, tile) {
  if (!user || !user.function) return null;
  const FUNCTION_TO_MODULE_MAP = { OP: 'HR_OPS', 'T&A': 'TA', 'D&C': 'L&D', SBM: 'HR_SYS' };
  const mapped = FUNCTION_TO_MODULE_MAP[user.function];
  if (mapped) return `auto-mapped to ${mapped} only`;
  return 'no auto-mapping — admin must grant access';
}

const styles = {
  stage: {
    position: 'relative',
    minHeight: '100vh',
    overflow: 'hidden',
    background: 'linear-gradient(135deg, #1a1028 0%, #2d1f42 30%, #3d2856 60%, #4a3265 100%)',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    color: '#fff',
  },
  orb1: {
    position: 'absolute', top: '8%', left: '8%',
    width: 300, height: 300, borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(243,192,54,0.10) 0%, transparent 70%)',
    animation: 'hubFloat1 8s ease-in-out infinite',
    pointerEvents: 'none',
  },
  orb2: {
    position: 'absolute', bottom: '10%', right: '8%',
    width: 400, height: 400, borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(168,85,247,0.10) 0%, transparent 70%)',
    animation: 'hubFloat2 10s ease-in-out infinite',
    pointerEvents: 'none',
  },
  orb3: {
    position: 'absolute', top: '50%', left: '50%',
    width: 500, height: 500, borderRadius: '50%',
    transform: 'translate(-50%,-50%)',
    background: 'radial-gradient(circle, rgba(236,72,153,0.06) 0%, transparent 70%)',
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
    background: 'transparent',
    color: 'rgba(255,255,255,0.6)',
    border: '1px solid rgba(255,255,255,0.1)',
    padding: '9px 14px',
    borderRadius: 8,
    fontFamily: 'inherit',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    marginLeft: 10,
  },
  logoutBtnHover: {
    background: 'rgba(239,68,68,0.1)',
    borderColor: 'rgba(239,68,68,0.3)',
    color: '#ef4444',
  },
  fadeIn: {
    animation: 'hubFadeInUp 0.5s ease',
    position: 'relative',
    zIndex: 5,
  },
  errorBanner: {
    position: 'relative', zIndex: 5,
    margin: '12px 48px 0',
    padding: '10px 14px',
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 8,
    color: '#fca5a5',
    fontSize: 12,
  },
  errorDetail: { color: 'rgba(252,165,165,0.6)' },
  l2Header: { padding: '24px 48px 0' },
  breadcrumb: {
    display: 'flex', alignItems: 'center', gap: 8,
    fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 18,
  },
  breadcrumbLink: {
    color: 'rgba(255,255,255,0.7)',
    textDecoration: 'none',
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '6px 10px',
    borderRadius: 6,
    transition: 'all 0.15s ease',
    cursor: 'pointer',
  },
  breadcrumbLinkHover: {
    background: 'rgba(255,255,255,0.05)',
    color: '#F3C036',
  },
  breadcrumbSep: { color: 'rgba(255,255,255,0.3)' },
  breadcrumbCurrent: { color: '#fff', fontWeight: 600 },
  l2TitleRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 16, flexWrap: 'wrap',
  },
  l2Title: { fontSize: 22, fontWeight: 700, letterSpacing: '-0.4px' },
  l2Subtitle: {
    fontSize: 12, color: 'rgba(255,255,255,0.5)',
    marginTop: 2, fontWeight: 500,
  },
  headerAction: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '9px 14px 9px 12px',
    background: 'rgba(243,192,54,0.06)',
    border: '1.5px dashed rgba(243,192,54,0.45)',
    borderRadius: 10,
    color: '#F3C036',
    fontFamily: 'inherit',
    fontSize: 12.5,
    fontWeight: 600,
    letterSpacing: '0.2px',
    cursor: 'help',                          // help cursor signals tooltip exists
    transition: 'all 0.2s ease',
    opacity: 0.85,
  },
  headerActionHover: {
    background: 'rgba(243,192,54,0.12)',
    border: '1.5px dashed rgba(243,192,54,0.75)',
    transform: 'translateY(-1px)',
  },
  plusGlyph: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 18, height: 18,
    borderRadius: '50%',
    border: '1.5px solid rgba(243,192,54,0.6)',
    fontSize: 13, fontWeight: 400, lineHeight: 1,
  },
  grid: {
    maxWidth: 1100, margin: '0 auto',
    padding: '32px 48px 24px',
    display: 'grid', gap: 18,
  },
  gridLevel1: {
    gridTemplateColumns: 'repeat(2, 1fr)',
    paddingTop: 40,
  },
  gridLevel2: {
    gridTemplateColumns: 'repeat(2, 1fr)',
    maxWidth: 920,
  },
  loadingNote: {
    textAlign: 'center', padding: '40px 24px',
    color: 'rgba(255,255,255,0.5)', fontSize: 13,
  },
  emptyNote: {
    textAlign: 'center', padding: '40px 24px',
    color: 'rgba(255,255,255,0.5)', fontSize: 13,
  },
  footer: {
    position: 'relative', zIndex: 5,
    padding: '24px 48px 60px',
    textAlign: 'center',
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
    letterSpacing: '0.3px',
  },
};
