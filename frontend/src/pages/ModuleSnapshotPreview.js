import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ModuleSnapshot from '../dashboards/ModuleSnapshot';
import TASnapshot from '../dashboards/TASnapshot';
import { dashboardsAPI, targetsAPI } from '../services/api';
import Dropdown from '../dashboards/Dropdown';
import { buildYearOptions, buildMonthOptions } from '../engine/computers';

// =============================================
// ModuleSnapshotPreview — Module Engine snapshot preview host
// =============================================
// DASHBOARD BUILDER — Step B5-1. Route: /hub/preview/:moduleCode/snapshot-v2
//
// Mirrors ModuleEntryPreview but for the READ-ONLY published snapshot:
// resolves access (viewer+ may view a published snapshot; admin always),
// picks a year/month, fetches getStructure + getPublished + targets, merges
// targets by key, assembles the config-shaped object, and renders the
// generic ModuleSnapshot. The live HROpsSnapshot + its route are untouched.
// =============================================

const MODULE_NAME_BY_CODE = {
  HR_OPS: 'HR Operations',
  TA: 'Talent Acquisition',
  'L&D': 'Learning & Development',
  HR_SYS: 'HR Systems',
};

export default function ModuleSnapshotPreview({ user }) {
  const { moduleCode } = useParams();
  const navigate = useNavigate();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [accessLevel, setAccessLevel] = useState(null);
  const [accessResolved, setAccessResolved] = useState(false);

  const [config, setConfig] = useState(null);        // structure + merged targets
  const [values, setValues] = useState({});          // published values map
  const [loading, setLoading] = useState(true);
  const [notPublished, setNotPublished] = useState(false);
  const [error, setError] = useState(null);

  // Resolve access (same source as entry: my-access; admin bypass).
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
      .catch((err) => { if (!cancelled) { console.error('[SnapshotPreview] access failed:', err); setAccessLevel(null); } })
      .finally(() => { if (!cancelled) setAccessResolved(true); });
    return () => { cancelled = true; };
  }, [moduleCode, user]);

  // Fetch structure + published values + targets, assemble config.
  const load = useCallback(() => {
    setLoading(true); setError(null); setNotPublished(false);
    return Promise.all([
      dashboardsAPI.getStructure(moduleCode),
      dashboardsAPI.getPublished(moduleCode, year, month).catch((e) => {
        // 404 = not published for this month → soft state, still show structure.
        if (e && /not published|no published|not found|404/i.test(e.message || '')) return { __notPublished: true };
        throw e;
      }),
      targetsAPI.list(moduleCode).catch((e) => { console.error('[SnapshotPreview] targets failed (non-fatal):', e); return []; }),
    ])
      .then(([structure, published, targets]) => {
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

        const sections = (structure.sections || []).map((s) => ({
          id: s.id, key: s.key, title: s.title, layout: s.layout,
          sort_order: s.sort_order, is_active: s.is_active,
          subsections: (s.subsections || []).map((ss) => ({
            id: ss.id, key: ss.key, title: ss.title, sort_order: ss.sort_order, is_active: ss.is_active,
          })),
          fields: (s.fields || []).map((f) => ({
            ...f, section: s.key, target: targetByKey[f.key] || undefined,
          })),
        }));
        setConfig({ code: structure.module_code || moduleCode, name: MODULE_NAME_BY_CODE[moduleCode] || moduleCode, sections });

        if (published && published.__notPublished) {
          setNotPublished(true);
          setValues({});
        } else {
          const v = {};
          (published.data || []).forEach((row) => { v[row.field_key] = row.value ?? ''; });
          setValues(v);
        }
      })
      .catch((err) => { console.error('[SnapshotPreview] load failed:', err); setError(err && err.message ? err.message : 'Could not load snapshot.'); })
      .finally(() => setLoading(false));
  }, [moduleCode, year, month]);

  useEffect(() => { if (accessResolved) load(); }, [accessResolved, load]);

  function handlePeriodChange(nextYear, nextMonth) {
    setYear(Number(nextYear)); setMonth(Number(nextMonth));
  }

  if (!accessResolved || loading) {
    return (
      <div style={S.shell}>
        <div style={S.spinner} />
        <style>{`@keyframes hrSpin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Snapshot is viewable by anyone with access to the module (viewer+), admin always.
  const canView = accessLevel === 'admin' || accessLevel === 'owner' || accessLevel === 'viewer';
  if (!canView) {
    return (
      <div style={S.shell}>
        <div style={S.notice}>You don't have access to {MODULE_NAME_BY_CODE[moduleCode] || moduleCode}.</div>
      </div>
    );
  }
  if (error) {
    return (<div style={S.shell}><div style={S.notice}>Could not load snapshot: {error}</div></div>);
  }
  if (!config) {
    return (<div style={S.shell}><div style={S.notice}>No structure found for "{moduleCode}".</div></div>);
  }

  const yearOptions = buildYearOptions();
  const monthOptions = buildMonthOptions();
  const monthName = (monthOptions.find((m) => m.value === String(month)) || {}).label || month;

  return (
    <div style={S.shell}>
      <div style={S.topBar}>
        <button type="button" style={S.backBtn} onClick={() => navigate(`/hub/dashboards/${moduleCode}`)}>
          ← Back to {config.name}
        </button>
        <div style={S.title}>
          {config.name} — Snapshot <span style={S.v2}>(engine v2 · DB-driven)</span>
        </div>
      </div>

      <div style={S.selector}>
        <span style={S.selectorLabel}>VIEWING</span>
        <Dropdown label="Year" value={String(year)} options={yearOptions} onChange={(v) => handlePeriodChange(v, month)} width={120} />
        <Dropdown label="Month" value={String(month)} options={monthOptions} onChange={(v) => handlePeriodChange(year, v)} width={150} />
      </div>

      {notPublished ? (
        <div style={S.notice}>
          No published data for {monthName} {year}. Choose another period, or publish this month from the Approvals tab.
        </div>
      ) : (
        (() => {
          // Per-module bespoke snapshot map (Design v5): TA has a hand-designed
          // component; every other module uses the generic engine snapshot.
          // The period is threaded onto config so bespoke headers can show it.
          const cfg = { ...config, __month: month, __monthName: monthName, __year: year };
          const SNAPSHOT_BY_CODE = { TA: TASnapshot };
          const Comp = SNAPSHOT_BY_CODE[moduleCode] || ModuleSnapshot;
          return <Comp config={cfg} values={values} />;
        })()
      )}
    </div>
  );
}

const S = {
  shell: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #1a1028 0%, #2d1f42 30%, #3d2856 60%, #4a3265 100%)',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    color: '#fff', paddingBottom: 60,
  },
  topBar: { display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '20px 48px 0' },
  backBtn: {
    padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)',
    cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
  },
  title: { fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px' },
  v2: { fontSize: 12, fontWeight: 600, color: '#F3C036' },
  selector: {
    position: 'relative', zIndex: 30, display: 'flex', alignItems: 'center', gap: 14,
    flexWrap: 'wrap', padding: '20px 48px 0',
  },
  selectorLabel: { fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '1.5px', textTransform: 'uppercase' },
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
