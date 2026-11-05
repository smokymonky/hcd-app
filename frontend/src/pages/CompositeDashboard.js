import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardsAPI, targetsAPI } from '../services/api';
import { buildYearOptions, buildMonthOptions } from '../engine/computers';
import Dropdown from '../dashboards/Dropdown';
// Snapshot renderers — SAME set + mapping ModulePage uses (reused, not forked).
import ModuleSnapshot from '../dashboards/ModuleSnapshot';
import TASnapshot from '../dashboards/TASnapshot';
import LDSnapshot from '../dashboards/LDSnapshot';
import HRSysSnapshot from '../dashboards/HRSysSnapshot';
import HROpsSnapshot from '../dashboards/HROpsSnapshot';
import ConfigurableSnapshot from '../dashboards/ConfigurableSnapshot';
import { exportCompositeToPDF } from '../utils/compositeExport';

// =============================================
// CompositeDashboard — select N dashboards + a period → stacked snapshots
// =============================================
// Phase 6.5-a (MVP). Read-only over PUBLISHED data. Each section reproduces
// ModulePage's snapshot rendering VERBATIM: snapshot_mode 'designer' →
// ConfigurableSnapshot(layout+sections); else the bespoke map
// (TA→TASnapshot, 'L&D'→LDSnapshot, HR_SYS→HRSysSnapshot, HR_OPS→standalone
// HROpsSnapshot, default→ModuleSnapshot). Each module fetches independently
// and renders progressively. Filters/export/named reports come in 6.5-b…d.
// =============================================

// VERBATIM from ModulePage.
const SNAPSHOT_BY_CODE = { TA: TASnapshot, 'L&D': LDSnapshot, HR_SYS: HRSysSnapshot };

// VERBATIM from ModulePage.buildSections (structure + targets → config.sections).
function buildSections(structure, targets) {
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
}

const MONTH_LABEL = (m) => (buildMonthOptions().find((o) => o.value === String(m)) || {}).label || m;

export default function CompositeDashboard({ user }) {
  const navigate = useNavigate();
  const isAdmin = user && String(user.role || '').toLowerCase() === 'admin';

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [modules, setModules] = useState(null);   // accessible modules [{code,name}]
  const [selected, setSelected] = useState([]);   // selected module codes
  const [modErr, setModErr] = useState(null);
  const [loaded, setLoaded] = useState({});       // code → { sections, values } once a section has loaded
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState(null);

  // A section reports its loaded data up (keyed by code) for PDF assembly.
  const handleLoaded = useCallback((code, data) => {
    setLoaded((cur) => ({ ...cur, [code]: data }));
  }, []);

  // PDF is ready when every selected module has reported loaded data for the
  // current period (keyed per code; cleared when period/selection changes).
  const allLoaded = selected.length > 0 && selected.every((c) => loaded[c]);

  async function handleExport() {
    setExporting(true); setExportErr(null);
    try {
      const mods = selected.map((code) => {
        const meta = (modules || []).find((m) => m.code === code);
        const d = loaded[code] || {};
        return { code, name: (meta && meta.name) || code, sections: d.sections || [], values: d.values || {} };
      });
      await exportCompositeToPDF({ year, month, monthName: MONTH_LABEL(month) }, mods);
    } catch (e) {
      setExportErr(e.message || 'Could not generate PDF.');
    } finally { setExporting(false); }
  }

  // Load the user's accessible modules (admin = all active, via listModules;
  // non-admin = my-access intersected with active modules for names/meta).
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      dashboardsAPI.listModules().catch(() => []),
      isAdmin ? Promise.resolve(null) : dashboardsAPI.getMyAccess().catch(() => []),
    ]).then(([all, access]) => {
      if (cancelled) return;
      const active = (Array.isArray(all) ? all : []).filter((m) => m.is_active !== false);
      let list;
      if (isAdmin) {
        list = active;
      } else {
        const accessCodes = new Set((Array.isArray(access) ? access : []).map((a) => a.code || a.module_code));
        list = active.filter((m) => accessCodes.has(m.code));
      }
      setModules(list.map((m) => ({ code: m.code, name: m.name })));
    }).catch((e) => { if (!cancelled) { setModErr(e.message || 'Could not load modules.'); setModules([]); } });
    return () => { cancelled = true; };
  }, [isAdmin]);

  // Clear the loaded cache when the period changes (sections re-fetch under new keys).
  useEffect(() => { setLoaded({}); }, [year, month]);

  const yearOptions = buildYearOptions();
  const monthOptions = buildMonthOptions();

  function toggleModule(code) {
    setSelected((cur) => (cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]));
  }

  return (
    <div style={S.shell}>
      <style>{`@keyframes hrSpin { to { transform: rotate(360deg); } }`}</style>
      <div style={S.topBar}>
        <button type="button" style={S.backBtn} onClick={() => navigate('/hub')}>← Hub</button>
        <div style={S.title}>Composite View</div>
        <button
          type="button"
          style={{ ...S.pdfBtn, ...((!allLoaded || exporting) ? S.pdfBtnDisabled : {}) }}
          disabled={!allLoaded || exporting}
          onClick={handleExport}
          title={allLoaded ? 'Download the composite as a PDF' : 'Select dashboards and wait for them to load'}
        >
          {exporting ? 'Preparing…' : '⤓ Download PDF'}
        </button>
      </div>

      <div style={S.controls}>
        <div style={S.controlRow}>
          <span style={S.ctrlLabel}>PERIOD</span>
          <Dropdown label="Year" value={String(year)} options={yearOptions} onChange={(v) => setYear(Number(v))} width={120} />
          <Dropdown label="Month" value={String(month)} options={monthOptions} onChange={(v) => setMonth(Number(v))} width={150} />
        </div>
        <div style={S.controlRow}>
          <span style={S.ctrlLabel}>DASHBOARDS</span>
          {modules === null ? (
            <span style={S.dim}>Loading…</span>
          ) : modErr ? (
            <span style={S.dim}>{modErr}</span>
          ) : modules.length === 0 ? (
            <span style={S.dim}>No accessible dashboards.</span>
          ) : (
            <div style={S.chips}>
              {modules.map((m) => {
                const on = selected.includes(m.code);
                return (
                  <button key={m.code} type="button" style={{ ...S.chip, ...(on ? S.chipOn : {}) }} onClick={() => toggleModule(m.code)}>
                    {on ? '✓ ' : '+ '}{m.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div style={S.body}>
        {exportErr && <div style={S.alertErr}>{exportErr}</div>}
        {selected.length === 0 ? (
          <div style={S.empty}>Select dashboards to compose a view.</div>
        ) : (
          selected.map((code) => {
            const mod = (modules || []).find((m) => m.code === code);
            return (
              <CompositeSection
                key={`${code}:${year}:${month}`}
                moduleCode={code}
                moduleName={(mod && mod.name) || code}
                year={year}
                month={month}
                user={user}
                onLoaded={handleLoaded}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

// One module's snapshot section — fetches independently, renders progressively.
function CompositeSection({ moduleCode, moduleName, year, month, user, onLoaded }) {
  const [state, setState] = useState({ loading: true });

  const load = useCallback(() => {
    setState({ loading: true });
    Promise.all([
      dashboardsAPI.getStructure(moduleCode),
      targetsAPI.list(moduleCode).catch(() => []),
      dashboardsAPI.getSnapshotLayout(moduleCode).catch(() => ({ config: null })),
      dashboardsAPI.getPublished(moduleCode, year, month).catch((e) => {
        if (e && /not published|no published|not found|404/i.test(e.message || '')) return { __notPublished: true };
        throw e;
      }),
    ]).then(([structure, targets, layoutRes, published]) => {
      const sections = buildSections(structure, targets);
      const snapshotMode = structure.snapshot_mode || 'bespoke';
      const layout = layoutRes ? layoutRes.config : null;
      if (published && published.__notPublished) {
        setState({ loading: false, notPublished: true, sections, snapshotMode, layout });
        if (onLoaded) onLoaded(moduleCode, { sections, values: {} });
        return;
      }
      const values = {};
      (published.data || []).forEach((row) => { values[row.field_key] = row.value ?? ''; });
      setState({ loading: false, sections, snapshotMode, layout, values });
      if (onLoaded) onLoaded(moduleCode, { sections, values });
    }).catch((e) => {
      setState({ loading: false, error: e.message || 'Could not load.' });
      if (onLoaded) onLoaded(moduleCode, { sections: [], values: {} });
    });
  }, [moduleCode, year, month, onLoaded]);

  useEffect(() => { load(); }, [load]);

  const monthName = MONTH_LABEL(month);

  function renderSnapshot() {
    const { sections, snapshotMode, layout, values, notPublished, error } = state;
    if (error) return <div style={S.notice}>Could not load {moduleName}: {error}</div>;
    if (notPublished) return <div style={S.notice}>No published data for {monthName} {year}.</div>;
    // VERBATIM mapping from ModulePage:
    if (snapshotMode === 'designer' && layout) {
      return <ConfigurableSnapshot config={{ ...layout, sections }} values={values} />;
    }
    if (moduleCode === 'HR_OPS') {
      // Bespoke, self-contained — self-fetches its own period. Pass the chosen period.
      return <HROpsSnapshot user={user} variant="full" urlYear={year} urlMonth={month} />;
    }
    const SnapComp = SNAPSHOT_BY_CODE[moduleCode] || ModuleSnapshot;
    return <SnapComp config={{ sections, __month: month, __monthName: monthName, __year: year }} values={values} />;
  }

  return (
    <div style={S.section}>
      <div style={S.sectionHead}>
        <span style={S.sectionName}>{moduleName}</span>
        <span style={S.sectionPeriod}>{monthName} {year}</span>
      </div>
      {state.loading ? <div style={S.spinner} /> : renderSnapshot()}
    </div>
  );
}

const S = {
  shell: { minHeight: '100vh', background: 'linear-gradient(135deg, #1a1028 0%, #2d1f42 30%, #3d2856 60%, #4a3265 100%)', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", color: '#fff', paddingBottom: 60 },
  topBar: { display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '20px 48px 0' },
  backBtn: { padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 },
  title: { fontSize: 22, fontWeight: 800, letterSpacing: '-0.4px' },
  pdfBtn: { marginLeft: 'auto', padding: '9px 16px', borderRadius: 8, background: 'linear-gradient(135deg, #F3C036 0%, #ec4899 100%)', border: 'none', color: '#1a1028', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700 },
  pdfBtnDisabled: { opacity: 0.4, cursor: 'not-allowed', filter: 'grayscale(0.3)' },
  alertErr: { marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5', fontSize: 13 },
  controls: { maxWidth: 1100, margin: '18px auto 0', padding: '0 48px', display: 'flex', flexDirection: 'column', gap: 12 },
  controlRow: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: '14px 18px' },
  ctrlLabel: { fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '1.2px', minWidth: 90 },
  dim: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },
  chips: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  chip: { padding: '8px 14px', borderRadius: 20, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 },
  chipOn: { background: 'rgba(243,192,54,0.14)', border: '1px solid rgba(243,192,54,0.45)', color: '#F3C036' },
  body: { maxWidth: 1100, margin: '0 auto', padding: '22px 48px 0', display: 'flex', flexDirection: 'column', gap: 20 },
  empty: { padding: '56px 24px', textAlign: 'center', color: 'rgba(255,255,255,0.55)', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 14, fontSize: 15 },
  section: { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '18px 20px' },
  sectionHead: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.08)' },
  sectionName: { fontSize: 18, fontWeight: 800, letterSpacing: '-0.3px' },
  sectionPeriod: { fontSize: 11, fontWeight: 700, color: '#F3C036', letterSpacing: '0.5px', textTransform: 'uppercase', padding: '4px 10px', background: 'rgba(243,192,54,0.1)', border: '1px solid rgba(243,192,54,0.3)', borderRadius: 14 },
  notice: { padding: '24px', textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.6)', border: '1px dashed rgba(255,255,255,0.12)', borderRadius: 12 },
  spinner: { width: 32, height: 32, margin: '40px auto', border: '4px solid rgba(255,255,255,0.1)', borderTopColor: '#F3C036', borderRadius: '50%', animation: 'hrSpin 0.8s linear infinite' },
};
