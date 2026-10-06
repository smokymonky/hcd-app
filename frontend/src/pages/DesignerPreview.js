import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ConfigurableSnapshot from '../dashboards/ConfigurableSnapshot';
import { dashboardsAPI, targetsAPI } from '../services/api';
import Dropdown from '../dashboards/Dropdown';
import { buildYearOptions, buildMonthOptions } from '../engine/computers';

// =============================================
// DesignerPreview — view a saved layout config without the designer
// =============================================
// SNAPSHOT DESIGNER (Y-1). Route: /hub/preview/:moduleCode/designer-v1.
// Mirrors ModuleSnapshotPreview's fetch (structure + merged targets +
// published values) and ALSO fetches the module's active snapshot-layout,
// then renders <ConfigurableSnapshot config=layout values=published/>. This
// proves the config-driven renderer against real data WITHOUT touching the
// live module routes or bespoke snapshots. Additive / preview-only.
// =============================================

const MODULE_NAME_BY_CODE = {
  HR_OPS: 'HR Operations', TA: 'Talent Acquisition',
  'L&D': 'Learning & Development', HR_SYS: 'HR Systems',
};

export default function DesignerPreview({ user }) {
  const { moduleCode } = useParams();
  const navigate = useNavigate();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [accessLevel, setAccessLevel] = useState(null);
  const [accessResolved, setAccessResolved] = useState(false);

  const [layout, setLayout] = useState(null);    // the config (or null)
  const [config, setConfig] = useState(null);    // structure (sections+fields) for value resolution
  const [values, setValues] = useState({});      // published values map
  const [loading, setLoading] = useState(true);
  const [notPublished, setNotPublished] = useState(false);
  const [error, setError] = useState(null);

  // Access (my-access; admin bypass) — same gate as the snapshot.
  useEffect(() => {
    let cancelled = false;
    const isAdmin = user && String(user.role || '').toLowerCase() === 'admin';
    if (isAdmin) { setAccessLevel('admin'); setAccessResolved(true); return undefined; }
    dashboardsAPI.getMyAccess()
      .then((rows) => {
        if (cancelled) return;
        const row = (rows || []).find((r) => r.code === moduleCode || r.module_code === moduleCode);
        setAccessLevel(row ? row.access_level : null);
      })
      .catch((err) => { if (!cancelled) { console.error('[DesignerPreview] access failed:', err); setAccessLevel(null); } })
      .finally(() => { if (!cancelled) setAccessResolved(true); });
    return () => { cancelled = true; };
  }, [moduleCode, user]);

  const load = useCallback(() => {
    setLoading(true); setError(null); setNotPublished(false);
    return Promise.all([
      dashboardsAPI.getStructure(moduleCode),
      dashboardsAPI.getSnapshotLayout(moduleCode).catch((e) => { console.error('[DesignerPreview] layout fetch failed:', e); return { config: null }; }),
      dashboardsAPI.getPublished(moduleCode, year, month).catch((e) => {
        if (e && /not published|no published|not found|404/i.test(e.message || '')) return { __notPublished: true };
        throw e;
      }),
      targetsAPI.list(moduleCode).catch(() => []),
    ])
      .then(([structure, layoutRes, published, targets]) => {
        const targetByKey = {};
        (Array.isArray(targets) ? targets : []).forEach((t) => {
          if (t.is_active === false) return;
          targetByKey[t.field_key] = {
            value: Number(t.target_value), direction: t.direction,
            tolerance: (t.tolerance == null) ? null : Number(t.tolerance),
            label: (t.label && String(t.label).trim() !== '') ? String(t.label) : undefined,
          };
        });
        const sections = (structure.sections || []).map((s) => ({
          id: s.id, key: s.key, title: s.title, layout: s.layout,
          sort_order: s.sort_order, is_active: s.is_active,
          subsections: (s.subsections || []),
          fields: (s.fields || []).map((f) => ({ ...f, section: s.key, target: targetByKey[f.key] || undefined })),
        }));
        setConfig({ code: structure.module_code || moduleCode, name: MODULE_NAME_BY_CODE[moduleCode] || moduleCode, sections });
        setLayout(layoutRes ? layoutRes.config : null);

        if (published && published.__notPublished) { setNotPublished(true); setValues({}); }
        else {
          const v = {};
          (published.data || []).forEach((row) => { v[row.field_key] = row.value ?? ''; });
          setValues(v);
        }
      })
      .catch((err) => { console.error('[DesignerPreview] load failed:', err); setError(err && err.message ? err.message : 'Could not load.'); })
      .finally(() => setLoading(false));
  }, [moduleCode, year, month]);

  useEffect(() => { if (accessResolved) load(); }, [accessResolved, load]);

  function handlePeriodChange(y, m) { setYear(Number(y)); setMonth(Number(m)); }

  if (!accessResolved || loading) {
    return (<div style={S.shell}><div style={S.spinner} /><style>{`@keyframes hrSpin { to { transform: rotate(360deg); } }`}</style></div>);
  }
  const canView = accessLevel === 'admin' || accessLevel === 'owner' || accessLevel === 'viewer';
  if (!canView) return (<div style={S.shell}><div style={S.notice}>You don't have access to {MODULE_NAME_BY_CODE[moduleCode] || moduleCode}.</div></div>);
  if (error) return (<div style={S.shell}><div style={S.notice}>Could not load: {error}</div></div>);

  const yearOptions = buildYearOptions();
  const monthOptions = buildMonthOptions();
  const monthName = (monthOptions.find((m) => m.value === String(month)) || {}).label || month;
  // Merge structure into the layout config so ConfigurableSnapshot can resolve values.
  const mergedConfig = layout ? { ...layout, sections: (config && config.sections) || [] } : null;

  return (
    <div style={S.shell}>
      <div style={S.topBar}>
        <button type="button" style={S.backBtn} onClick={() => navigate(`/hub/dashboards/${moduleCode}`)}>← Back to {(config && config.name) || moduleCode}</button>
        <div style={S.title}>{(config && config.name) || moduleCode} — Designer preview <span style={S.v2}>(config-driven)</span></div>
      </div>
      <div style={S.selectorOuter}>
        <div style={S.selector}>
          <span style={S.selectorLabel}>VIEWING</span>
          <Dropdown label="Year" value={String(year)} options={yearOptions} onChange={(v) => handlePeriodChange(v, month)} width={120} />
          <Dropdown label="Month" value={String(month)} options={monthOptions} onChange={(v) => handlePeriodChange(year, v)} width={150} />
        </div>
      </div>
      <div style={S.body}>
        {!layout ? (
          <div style={S.notice}>No designer layout for {MODULE_NAME_BY_CODE[moduleCode] || moduleCode} yet.</div>
        ) : notPublished ? (
          <div style={S.notice}>No published data for {monthName} {year}. The layout still renders with blanks where values are missing.</div>
        ) : null}
        {layout && <ConfigurableSnapshot config={mergedConfig} values={values} />}
      </div>
    </div>
  );
}

const S = {
  shell: { minHeight: '100vh', background: 'linear-gradient(135deg, #1a1028 0%, #2d1f42 30%, #3d2856 60%, #4a3265 100%)', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", color: '#fff', paddingBottom: 60 },
  topBar: { display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '20px 48px 0' },
  backBtn: { padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 },
  title: { fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px' },
  v2: { fontSize: 12, fontWeight: 600, color: '#F3C036' },
  selectorOuter: { padding: '18px 48px 0' },
  selector: { maxWidth: 1100, margin: '0 auto', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: 16, padding: '16px 20px', position: 'relative', zIndex: 30, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  selectorLabel: { fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '1.5px', textTransform: 'uppercase' },
  body: { padding: '18px 48px 0' },
  notice: { maxWidth: 600, margin: '20px auto', padding: '20px 24px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.75)' },
  spinner: { width: 36, height: 36, margin: '120px auto', border: '4px solid rgba(255,255,255,0.1)', borderTopColor: '#F3C036', borderRadius: '50%', animation: 'hrSpin 0.8s linear infinite' },
};
