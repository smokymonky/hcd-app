import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ModuleDataEntry from '../dashboards/ModuleDataEntry';
import ModuleSnapshot from '../dashboards/ModuleSnapshot';
import TASnapshot from '../dashboards/TASnapshot';
import Dropdown from '../dashboards/Dropdown';
import { dashboardsAPI, targetsAPI } from '../services/api';
import { buildYearOptions, buildMonthOptions } from '../engine/computers';

// =============================================
// ModulePage — generic LIVE module page (Data Entry | Snapshot)
// =============================================
// DASHBOARD BUILDER — B6 / TA-3. The live counterpart to the preview hosts:
// a tabbed page at /hub/dashboards/:moduleCode[/:view[/:year/:month]] that
// makes any ENGINE module (TA, later L&D / HR Systems) reachable from the Hub
// with the engine Data Entry (editable, admin edit-mode) + its Snapshot
// (bespoke per module via SNAPSHOT_BY_CODE, else the generic engine snapshot).
//
// Reuses the proven fetch/assemble/edit wiring from ModuleEntryPreview
// (structure + merged targets + onStructurePatch optimistic) and
// ModuleSnapshotPreview (structure + published + targets + not-published).
//
// HR_OPS keeps its bespoke HROpsPage via explicit routes that outrank this
// ':moduleCode' route (React Router v6 ranks static > param), so this only
// ever handles TA / L&D / HR_SYS. Live HR Ops untouched.
//
// Access: Data Entry requires owner/admin; Snapshot is viewer+. A viewer sees
// only the Snapshot tab. MOBILE (≤768): header, tabs, and period stack.
// =============================================

const MODULE_NAME_BY_CODE = {
  HR_OPS: 'HR Operations',
  TA: 'Talent Acquisition',
  'L&D': 'Learning & Development',
  HR_SYS: 'HR Systems',
};

// Per-module bespoke snapshot components (Design v5); default = engine snapshot.
const SNAPSHOT_BY_CODE = { TA: TASnapshot };

export default function ModulePage({ user, onLogout }) {
  const { moduleCode, view: viewParam, year: yearParam, month: monthParam } = useParams();
  const navigate = useNavigate();

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const now = new Date();
  const [year, setYear] = useState(yearParam ? Number(yearParam) : now.getFullYear());
  const [month, setMonth] = useState(monthParam ? Number(monthParam) : now.getMonth() + 1);

  const [accessLevel, setAccessLevel] = useState(null);
  const [accessResolved, setAccessResolved] = useState(false);
  const isAdmin = accessLevel === 'admin';
  const canEnter = accessLevel === 'owner' || accessLevel === 'admin';
  const canView = canEnter || accessLevel === 'viewer';

  // Requested view (default entry); coerced to snapshot for view-only users below.
  const requestedView = (viewParam === 'snapshot') ? 'snapshot' : 'entry';

  const moduleName = MODULE_NAME_BY_CODE[moduleCode] || moduleCode;

  // ---- config (structure + merged targets) shared by both tabs ----
  const [config, setConfig] = useState(null);
  const [structureLoading, setStructureLoading] = useState(true);
  const [structureRefetching, setStructureRefetching] = useState(false);
  const [structureError, setStructureError] = useState(null);
  const [editMode, setEditMode] = useState(false);

  // ---- snapshot published values + state ----
  const [snapValues, setSnapValues] = useState({});
  const [snapLoading, setSnapLoading] = useState(false);
  const [notPublished, setNotPublished] = useState(false);

  // Resolve access (my-access; admin bypass).
  useEffect(() => {
    let cancelled = false;
    const admin = user && String(user.role || '').toLowerCase() === 'admin';
    if (admin) { setAccessLevel('admin'); setAccessResolved(true); return undefined; }
    dashboardsAPI.getMyAccess()
      .then((rows) => {
        if (cancelled) return;
        const row = (rows || []).find((r) => r.code === moduleCode || r.module_code === moduleCode);
        setAccessLevel(row ? row.access_level : null);
      })
      .catch((err) => { if (!cancelled) { console.error('[ModulePage] access failed:', err); setAccessLevel(null); } })
      .finally(() => { if (!cancelled) setAccessResolved(true); });
    return () => { cancelled = true; };
  }, [moduleCode, user]);

  // Effective view: viewers can't enter, so force snapshot.
  const activeView = (!canEnter && requestedView === 'entry') ? 'snapshot' : requestedView;

  // ---- structure fetch (targets merged) — shared assembler ----
  const buildSections = useCallback((structure, targets) => {
    const targetByKey = {};
    (Array.isArray(targets) ? targets : []).forEach((t) => {
      if (t.is_active === false) return;
      targetByKey[t.field_key] = {
        value: Number(t.target_value),
        direction: t.direction,
        tolerance: (t.tolerance == null) ? null : Number(t.tolerance),
        label: (t.label && String(t.label).trim() !== '') ? String(t.label) : undefined,
      };
    });
    return (structure.sections || []).map((s) => ({
      id: s.id, key: s.key, title: s.title, layout: s.layout,
      sort_order: s.sort_order, is_active: s.is_active,
      subsections: (s.subsections || []).map((ss) => ({
        id: ss.id, key: ss.key, title: ss.title, sort_order: ss.sort_order, is_active: ss.is_active,
      })),
      fields: (s.fields || []).map((f) => ({ ...f, section: s.key, target: targetByKey[f.key] || undefined })),
    }));
  }, []);

  const loadStructure = useCallback((opts = {}) => {
    const { background = false, withHidden = false } = opts;
    if (background) setStructureRefetching(true);
    else { setStructureLoading(true); setConfig(null); }
    setStructureError(null);
    return Promise.all([
      dashboardsAPI.getStructure(moduleCode, { includeHidden: withHidden }),
      targetsAPI.list(moduleCode).catch((e) => { console.error('[ModulePage] targets failed (non-fatal):', e); return []; }),
    ])
      .then(([structure, targets]) => {
        setConfig({
          code: structure.module_code || moduleCode,
          name: moduleName,
          sections: buildSections(structure, targets),
        });
      })
      .catch((err) => { console.error('[ModulePage] structure fetch failed:', err); setStructureError(err && err.message ? err.message : 'Could not load module structure.'); })
      .finally(() => { setStructureLoading(false); setStructureRefetching(false); });
  }, [moduleCode, moduleName, buildSections]);

  // First structure load (blocks); edit-mode flips refetch in background.
  const hasLoadedRef = useRef(false);
  useEffect(() => {
    if (!accessResolved) return;
    const background = hasLoadedRef.current;
    hasLoadedRef.current = true;
    loadStructure({ background, withHidden: editMode && isAdmin });
  }, [editMode, accessResolved, isAdmin, loadStructure]);

  const onStructureChanged = useCallback(
    () => loadStructure({ background: true, withHidden: editMode && isAdmin }),
    [loadStructure, editMode, isAdmin]
  );
  const applyStructurePatch = useCallback((updater) => {
    setConfig((prev) => (prev ? { ...prev, sections: updater(prev.sections || []) } : prev));
  }, []);

  // ---- published values fetch (snapshot tab) ----
  const loadPublished = useCallback(() => {
    setSnapLoading(true); setNotPublished(false);
    return dashboardsAPI.getPublished(moduleCode, year, month)
      .then((published) => {
        const v = {};
        (published.data || []).forEach((row) => { v[row.field_key] = row.value ?? ''; });
        setSnapValues(v);
      })
      .catch((e) => {
        if (e && /not published|no published|not found|404/i.test(e.message || '')) { setNotPublished(true); setSnapValues({}); }
        else { console.error('[ModulePage] published fetch failed:', e); setNotPublished(true); setSnapValues({}); }
      })
      .finally(() => setSnapLoading(false));
  }, [moduleCode, year, month]);

  // Load published whenever snapshot tab is active + period changes.
  useEffect(() => {
    if (accessResolved && activeView === 'snapshot') loadPublished();
  }, [accessResolved, activeView, loadPublished]);

  // ---- handlers ----
  function goView(v) {
    // Keep URL in sync so deep links + back button work.
    navigate(`/hub/dashboards/${moduleCode}/${v}`);
  }
  function handlePeriodChange(nextYear, nextMonth) {
    setYear(Number(nextYear));
    setMonth(Number(nextMonth));
  }
  function handleLogout() {
    if (onLogout) onLogout();
    navigate('/login');
  }

  // ---- loading / gate / error states ----
  if (!accessResolved || structureLoading) {
    return (
      <div style={S.shell}>
        <div style={S.spinner} />
        <style>{`@keyframes hrSpin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }
  if (!canView) {
    return (<div style={S.shell}><div style={S.notice}>You don't have access to {moduleName}.</div></div>);
  }
  if (structureError) {
    return (<div style={S.shell}><div style={S.notice}>Could not load {moduleName}: {structureError}</div></div>);
  }
  if (!config || !config.sections || config.sections.length === 0) {
    return (<div style={S.shell}><div style={S.notice}>No structure found for "{moduleCode}". (Has it been seeded?)</div></div>);
  }

  const yearOptions = buildYearOptions();
  const monthOptions = buildMonthOptions();
  const monthName = (monthOptions.find((m) => m.value === String(month)) || {}).label || month;
  const SnapComp = SNAPSHOT_BY_CODE[moduleCode] || ModuleSnapshot;

  return (
    <div style={S.shell}>
      {/* Header */}
      <div style={{ ...S.header, ...(isMobile ? S.headerMobile : {}) }}>
        <div style={S.brand}>
          <div style={S.brandName}>Abdul Latif Jameel</div>
          <div style={S.brandUnit}>FINANCE</div>
        </div>
        <button type="button" style={S.logoutBtn} onClick={handleLogout}>Logout</button>
      </div>

      {/* Breadcrumb */}
      <div style={{ ...S.breadcrumb, ...(isMobile ? S.breadcrumbMobile : {}) }}>
        <span style={S.crumbLink} onClick={() => navigate('/hub')}>Hub</span>
        <span style={S.crumbSep}>/</span>
        <span style={S.crumbLink} onClick={() => navigate('/hub/dashboards')}>HR Dashboards</span>
        <span style={S.crumbSep}>/</span>
        <span style={S.crumbCurrent}>{moduleName}</span>
      </div>

      {/* Title + tabs + edit toggle */}
      <div style={{ ...S.titleRow, ...(isMobile ? S.titleRowMobile : {}) }}>
        <div style={S.title}>{moduleName}</div>
        <div style={{ ...S.tabs, ...(isMobile ? S.tabsMobile : {}) }}>
          {canEnter && (
            <button
              type="button"
              style={{ ...S.tab, ...(isMobile ? S.tabMobile : {}), ...(activeView === 'entry' ? S.tabActive : {}) }}
              onClick={() => goView('entry')}
            >
              Data Entry
            </button>
          )}
          <button
            type="button"
            style={{ ...S.tab, ...(isMobile ? S.tabMobile : {}), ...(activeView === 'snapshot' ? S.tabActive : {}) }}
            onClick={() => goView('snapshot')}
          >
            Snapshot
          </button>
        </div>
        {isAdmin && activeView === 'entry' && (
          <button
            type="button"
            style={{ ...S.editToggle, ...(editMode ? S.editToggleOn : {}) }}
            onClick={() => setEditMode((v) => !v)}
          >
            {editMode ? '✓ Editing dashboard' : '✎ Edit dashboard'}
            {structureRefetching && <span style={S.refetch}> ↻</span>}
          </button>
        )}
      </div>

      {/* Snapshot period selector (entry has its own inside ModuleDataEntry) */}
      {activeView === 'snapshot' && (
        <div style={{ ...S.selector, ...(isMobile ? S.selectorMobile : {}) }}>
          <span style={S.selectorLabel}>VIEWING</span>
          <Dropdown label="Year" value={String(year)} options={yearOptions} onChange={(v) => handlePeriodChange(v, month)} width={120} />
          <Dropdown label="Month" value={String(month)} options={monthOptions} onChange={(v) => handlePeriodChange(year, v)} width={150} />
        </div>
      )}

      {/* Body */}
      <div style={{ ...S.body, ...(isMobile ? S.bodyMobile : {}) }}>
        {activeView === 'entry' ? (
          <ModuleDataEntry
            config={config}
            user={user}
            year={year}
            month={month}
            onPeriodChange={handlePeriodChange}
            canEditStructure={isAdmin}
            editMode={editMode && isAdmin}
            onStructureChanged={onStructureChanged}
            onStructurePatch={applyStructurePatch}
          />
        ) : snapLoading ? (
          <div style={S.spinner} />
        ) : notPublished ? (
          <div style={S.notice}>
            No published data for {monthName} {year}. Choose another period{canEnter ? ', or publish this month from the Approvals tab.' : '.'}
          </div>
        ) : (
          <SnapComp config={{ ...config, __month: month, __monthName: monthName, __year: year }} values={snapValues} />
        )}
      </div>
    </div>
  );
}

const ACCENT = 'linear-gradient(135deg, rgba(243,192,54,0.2), rgba(236,72,153,0.15))';
const S = {
  shell: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #1a1028 0%, #2d1f42 30%, #3d2856 60%, #4a3265 100%)',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    color: '#fff', paddingBottom: 60,
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '22px 48px 0', gap: 14,
  },
  headerMobile: { padding: '18px 16px 0', flexWrap: 'wrap' },
  brand: { display: 'flex', flexDirection: 'column' },
  brandName: { fontSize: 18, fontWeight: 600, color: '#fff', lineHeight: 1.1 },
  brandUnit: { fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.5)' },
  logoutBtn: {
    padding: '9px 16px', borderRadius: 8, background: 'transparent',
    border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.75)',
    cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
  },
  breadcrumb: { display: 'flex', alignItems: 'center', gap: 8, padding: '18px 48px 0', fontSize: 12, color: 'rgba(255,255,255,0.5)', flexWrap: 'wrap' },
  breadcrumbMobile: { padding: '14px 16px 0' },
  crumbLink: { color: 'rgba(255,255,255,0.7)', cursor: 'pointer' },
  crumbSep: { color: 'rgba(255,255,255,0.3)' },
  crumbCurrent: { color: '#fff', fontWeight: 600 },
  titleRow: {
    display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
    padding: '14px 48px 0',
  },
  titleRowMobile: { padding: '12px 16px 0', flexDirection: 'column', alignItems: 'stretch' },
  title: { fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px' },
  tabs: {
    display: 'inline-flex', background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 4, gap: 2,
  },
  tabsMobile: { display: 'grid', gridTemplateColumns: '1fr 1fr', width: '100%' },
  tab: {
    padding: '8px 18px', borderRadius: 7, fontSize: 13, fontWeight: 600,
    color: 'rgba(255,255,255,0.6)', cursor: 'pointer', background: 'transparent',
    border: 'none', fontFamily: 'inherit',
  },
  tabMobile: { minHeight: 40, textAlign: 'center' },
  tabActive: { background: ACCENT, color: '#fff' },
  editToggle: {
    marginLeft: 'auto', padding: '8px 16px', borderRadius: 8,
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)',
    color: 'rgba(255,255,255,0.85)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
  },
  editToggleOn: { background: ACCENT, borderColor: 'rgba(243,192,54,0.5)', color: '#F3C036' },
  refetch: { fontSize: 11, color: 'rgba(255,255,255,0.5)' },
  selector: {
    position: 'relative', zIndex: 30, display: 'flex', alignItems: 'center', gap: 14,
    flexWrap: 'wrap', padding: '18px 48px 0',
  },
  selectorMobile: { padding: '16px 16px 0' },
  selectorLabel: { fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '1.5px', textTransform: 'uppercase' },
  body: { padding: '8px 48px 0' },
  bodyMobile: { padding: '8px 16px 0' },
  notice: {
    maxWidth: 600, margin: '48px auto', padding: '20px 24px',
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 12, textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.75)',
  },
  spinner: {
    width: 36, height: 36, margin: '120px auto', border: '4px solid rgba(255,255,255,0.1)',
    borderTopColor: '#F3C036', borderRadius: '50%', animation: 'hrSpin 0.8s linear infinite',
  },
};
