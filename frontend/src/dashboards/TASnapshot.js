import React, { useEffect, useMemo, useState } from 'react';
import { resolveComputedValues, formatValue, buildMonthOptions } from '../engine/computers';

// =============================================
// TASnapshot — bespoke Talent Acquisition published view
// =============================================
// DASHBOARD BUILDER — B6. Per Design v5, snapshots are bespoke per module.
// This is the hand-designed TA layout (approved mockup), but fully
// DATA-DRIVEN: every displayed number is read by its TA field key from the
// resolved values map — never hardcoded. Same { config, values } interface as
// the generic ModuleSnapshot, so ModuleSnapshotPreview can pass them through.
//
// Reads resolveComputedValues (engine) so computed-of-computed resolves
// (Hired %, matrix Total/Remaining, Total Trainees, Internal Total). Read-only.
// Balanced-rows layout (no dead space): hero (3) → 2-up rows → full-width
// Departments (5/row) → full-width Training.
// =============================================

export default function TASnapshot({ config, values }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Flat active field list (all sections) → for resolver + key lookups.
  const allFields = useMemo(() => {
    const out = [];
    for (const s of (config.sections || [])) {
      if (s.is_active === false) continue;
      for (const f of (s.fields || [])) {
        if (f.is_active !== false) out.push({ ...f, section: s.key });
      }
    }
    return out;
  }, [config]);

  const fieldByKey = useMemo(() => {
    const m = {};
    for (const f of allFields) m[f.key] = f;
    return m;
  }, [allFields]);

  const resolved = useMemo(
    () => resolveComputedValues(allFields, values, allFields),
    [allFields, values]
  );

  // ---- value readers ----
  // Formatted display for a field key ('—' when missing/unknown).
  function disp(key) {
    const f = fieldByKey[key];
    if (!f) return '—';
    const v = resolved[key];
    if (v === undefined || v === null || v === '') return '—';
    return formatValue(f, v);
  }
  // Raw number for a field key (or null) — for math (sorting, source total, bars).
  function num(key) {
    const v = resolved[key];
    if (v === undefined || v === null || v === '') return null;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }

  const monthName = (buildMonthOptions().find((m) => m.value === String(config.__month)) || {}).label
    || config.__monthName || '';

  // ---- Departments: sort by value desc, dim zeros ----
  const DEPTS = [
    ['dept_retail_auto', 'Retail Auto'], ['dept_msme', 'MSME'], ['dept_customer_accounts', 'Customer Accounts'],
    ['dept_hr', 'HR'], ['dept_it', 'IT'], ['dept_st', 'S&T'], ['dept_audit', 'Audit'],
    ['dept_risk_cs', 'Risk & CS'], ['dept_compliance', 'Compliance'], ['dept_dmo', 'DMO'],
    ['dept_legal', 'Legal'], ['dept_finance', 'Finance'], ['dept_cx', 'CX'],
    ['dept_marketing', 'Marketing'], ['dept_admin_services', 'Admin Services'],
  ].filter(([k]) => fieldByKey[k]);
  const deptsSorted = DEPTS
    .map(([k, label]) => ({ k, label, n: num(k) }))
    .sort((a, b) => (b.n ?? -1) - (a.n ?? -1));

  // ---- Hiring source: bars relative to max + total ----
  const SOURCES = [
    ['src_hrdf', 'HRDF'], ['src_referral', 'Referral'],
    ['src_linkedin_bayt', 'LinkedIn & Bayt'], ['src_internal_posts', 'Internal Posts'],
  ].filter(([k]) => fieldByKey[k]);
  const srcRows = SOURCES.map(([k, label]) => ({ k, label, n: num(k) ?? 0 })).sort((a, b) => b.n - a.n);
  const srcMax = srcRows.reduce((m, r) => Math.max(m, r.n), 0) || 1;
  const srcTotal = srcRows.reduce((s, r) => s + r.n, 0);

  // ---- Gender bar widths ----
  const femalePct = num('female_pct');
  const malePct = num('male_pct');
  const fW = femalePct == null ? 0 : femalePct;
  const mW = malePct == null ? 0 : malePct;

  // ---- Matrix cell helpers ----
  function mtx(row, col) {
    const key = `mtx_${row}_${col}`;
    const f = fieldByKey[key];
    const computed = f && f.source === 'computed';
    return { text: disp(key), computed };
  }

  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <h1 style={S.h1}>Talent Acquisition</h1>
        {monthName && <span style={S.badge}>{`${String(monthName).toUpperCase()} ${config.__year || ''}`.trim()}</span>}
      </div>

      {/* HERO (3 cards) */}
      <div style={{ ...S.hero, ...(isMobile ? S.heroMobile : {}) }}>
        <div style={S.kpi}>
          <div style={S.kpiAccent} />
          <div style={S.kpiLbl}>Hired Percentage</div>
          <div style={{ ...S.kpiVal, color: '#F3C036' }}>{disp('hired_pct')}</div>
          <div style={S.kpiSub}>{disp('total_hired_ytd')} hired of {disp('total_vacant')} vacancies</div>
        </div>
        <div style={S.kpi}>
          <div style={S.kpiAccent} />
          <div style={S.kpiLbl}>Total Hired (YTD)</div>
          <div style={S.kpiVal}>{disp('total_hired_ytd')}</div>
          <div style={S.kpiSub}>{disp('hired_in_month')} hired{monthName ? ` in ${monthName}` : ''}</div>
        </div>
        <div style={S.kpi}>
          <div style={S.kpiAccent} />
          <div style={S.kpiLbl}>Avg. Time to Fill</div>
          <div style={S.kpiVal}>{disp('avg_time_to_fill')}<span style={S.kpiUnit}> days</span></div>
          <div style={S.kpiSub}>HO {disp('ov_time_to_fill_ho')} · OP {disp('ov_time_to_fill_op')}</div>
        </div>
      </div>

      {/* ROW: Vacancies & Hired | Overview HO/OP */}
      <div style={{ ...S.brow, ...(isMobile ? S.browMobile : {}) }}>
        <div style={S.card}>
          <div style={S.cardAccent} />
          <h2 style={S.h2}>Vacancies &amp; Hired</h2>
          <div style={{ ...S.funnels, ...(isMobile ? { gridTemplateColumns: '1fr 1fr' } : {}) }}>
            <div>
              <div style={S.funnelLbl}>Vacancies</div>
              <div style={S.funnelBig}>{disp('total_vacant')}</div>
              <div style={S.funnelRow}><span>New Position</span><b style={S.funnelB}>{disp('new_position_vacant')}</b></div>
              <div style={S.funnelRow}><span>Replacement</span><b style={S.funnelB}>{disp('replacement_vacant')}</b></div>
            </div>
            <div>
              <div style={S.funnelLbl}>Hired</div>
              <div style={S.funnelBig}>{disp('total_hired_ytd')}</div>
              <div style={S.funnelRow}><span>New Position</span><b style={S.funnelB}>{disp('new_position_hired')}</b></div>
              <div style={S.funnelRow}><span>Replacement</span><b style={S.funnelB}>{disp('replacement_hired')}</b></div>
            </div>
          </div>
        </div>

        <div style={S.card}>
          <div style={S.cardAccent} />
          <h2 style={S.h2}>Overview — HO vs OP</h2>
          <div style={S.tableScroll}>
            <table style={S.hoop}>
              <thead>
                <tr><th style={S.hoopThL}>Metric</th><th style={S.hoopTh}>HO</th><th style={S.hoopTh}>OP</th></tr>
              </thead>
              <tbody>
                {[
                  ['Hired', 'ov_hired_ho', 'ov_hired_op'],
                  ['Time to Fill', 'ov_time_to_fill_ho', 'ov_time_to_fill_op'],
                  ['Interviews', 'ov_interviews_ho', 'ov_interviews_op'],
                  ['Induction Program', 'ov_induction_ho', 'ov_induction_op'],
                ].map(([label, hoK, opK]) => (
                  <tr key={label}>
                    <td style={S.hoopTdL}>{label}</td>
                    <td style={S.hoopTdN}>{disp(hoK)}</td>
                    <td style={S.hoopTdN}>{disp(opK)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ROW: Matrix | Hiring Source */}
      <div style={{ ...S.brow, ...(isMobile ? S.browMobile : {}) }}>
        <div style={S.card}>
          <div style={S.cardAccent} />
          <h2 style={S.h2}>Vacant / Filled / Remaining</h2>
          <div style={S.tableScroll}>
            <table style={S.mtx}>
              <thead>
                <tr>
                  <th style={S.mtxThL}>Location</th>
                  <th style={S.mtxTh}>Vacant</th><th style={S.mtxTh}>Filled</th><th style={S.mtxTh}>Remaining</th>
                </tr>
              </thead>
              <tbody>
                {[['head_office', 'Head Office', false], ['operation', 'Operation', false], ['total', 'Total', true]].map(([row, label, isTotal]) => (
                  <tr key={row}>
                    <td style={{ ...S.mtxTdL, ...(isTotal ? S.mtxTotalCell : {}) }}>{label}</td>
                    {['vacant', 'filled', 'remaining'].map((col) => {
                      const c = mtx(row, col);
                      return (
                        <td key={col} style={{ ...S.mtxTdN, ...(isTotal ? S.mtxTotalCell : {}), ...(c.computed ? S.mtxCalc : {}) }}>
                          {c.text}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={S.card}>
          <div style={S.cardAccent} />
          <h2 style={S.h2}>Hiring Source</h2>
          <div style={S.src}>
            {srcRows.map((r) => (
              <div key={r.k} style={S.srcR}>
                <span style={S.srcNm}>{r.label}</span>
                <span style={S.srcTrack}><span style={{ ...S.srcFill, width: `${Math.round((r.n / srcMax) * 100)}%` }} /></span>
                <span style={S.srcV}>{disp(r.k)}</span>
              </div>
            ))}
          </div>
          <div style={S.srcTotal}><span>Total Sources</span><span style={S.srcTotalV}>{srcTotal.toLocaleString('en-US')}</span></div>
        </div>
      </div>

      {/* ROW: Gender | Internal Mobility */}
      <div style={{ ...S.brow, ...(isMobile ? S.browMobile : {}) }}>
        <div style={S.card}>
          <div style={S.cardAccent} />
          <h2 style={S.h2}>Gender of Hired</h2>
          <div style={S.gbar}>
            <div style={{ ...S.gbarF, width: `${fW}%` }}>{femalePct == null ? '' : disp('female_pct')}</div>
            <div style={{ ...S.gbarM, width: `${mW}%` }}>{malePct == null ? '' : disp('male_pct')}</div>
          </div>
          <div style={S.glegend}>
            <span>● Female {disp('female_pct')}</span>
            <span>Male {disp('male_pct')} ●</span>
          </div>
        </div>

        <div style={S.card}>
          <div style={S.cardAccent} />
          <h2 style={S.h2}>Internal Mobility</h2>
          <div style={S.row2}>
            <div><div style={S.row2N}>{disp('internal_job_post')}</div><div style={S.row2L}>Internal Job Posts</div></div>
            <div><div style={S.row2N}>{disp('internal_total')}</div><div style={S.row2L}>Total Movement</div></div>
          </div>
          <div style={S.tableScroll}>
            <table style={S.hoop}>
              <thead><tr><th style={S.hoopTh}>HO</th><th style={S.hoopTh}>OP</th></tr></thead>
              <tbody><tr><td style={S.hoopTdN}>{disp('internal_ho')}</td><td style={S.hoopTdN}>{disp('internal_op')}</td></tr></tbody>
            </table>
          </div>
        </div>
      </div>

      {/* FULL WIDTH: Hired by Department (5 per row) */}
      <div style={{ ...S.card, marginBottom: 18 }}>
        <div style={S.cardAccent} />
        <h2 style={S.h2}>Hired by Department</h2>
        <div style={{ ...S.depts5, ...(isMobile ? S.depts5Mobile : {}) }}>
          {deptsSorted.map((d) => (
            <div key={d.k} style={S.dept}>
              <span>{d.label}</span>
              <span style={{ ...S.deptC, ...((d.n === 0 || d.n == null) ? S.deptZero : {}) }}>{disp(d.k)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* FULL WIDTH: Training & Outcomes */}
      <div style={S.card}>
        <div style={S.cardAccent} />
        <h2 style={S.h2}>Training &amp; Outcomes</h2>
        <div style={{ ...S.trainWrap, ...(isMobile ? { flexDirection: 'column', alignItems: 'stretch' } : {}) }}>
          <div style={{ ...S.row2, margin: 0 }}>
            <div><div style={S.row2N}>{disp('total_trainees')}</div><div style={S.row2L}>Total Trainees</div></div>
            <div><div style={S.row2N}>{disp('trainees_hired')}</div><div style={S.row2L}>Trainees Hired</div></div>
          </div>
          <div style={{ ...S.tgrid, flex: 1, minWidth: isMobile ? 0 : 320 }}>
            <div style={S.tcell}><div style={S.tcellN}>{disp('coop')}</div><div style={S.tcellL}>Coop</div></div>
            <div style={S.tcell}><div style={S.tcellN}>{disp('tamheer')}</div><div style={S.tcellL}>Tamheer</div></div>
            <div style={S.tcell}><div style={S.tcellN}>{disp('summer')}</div><div style={S.tcellL}>Summer</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================
// Styles (match the approved mockup)
// =============================================
const ACCENT = 'linear-gradient(90deg, #F3C036, #ec4899, #a855f7)';
const S = {
  wrap: { maxWidth: 1240, margin: '0 auto', padding: '4px 0 40px', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", color: '#fff' },
  head: { display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', marginBottom: 24 },
  h1: { fontSize: 30, fontWeight: 800, letterSpacing: '-0.5px' },
  badge: { background: 'rgba(243,192,54,0.15)', color: '#F3C036', fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 20, letterSpacing: '0.5px' },

  card: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '22px 24px', position: 'relative', overflow: 'hidden' },
  cardAccent: { content: '', position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: ACCENT, opacity: 0.7 },
  h2: { fontSize: 12, fontWeight: 700, letterSpacing: '1.4px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginBottom: 16 },

  hero: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 },
  heroMobile: { gridTemplateColumns: '1fr' },
  kpi: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 22, position: 'relative', overflow: 'hidden' },
  kpiAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: ACCENT },
  kpiLbl: { fontSize: 11, fontWeight: 700, letterSpacing: '1px', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase' },
  kpiVal: { fontSize: 42, fontWeight: 800, letterSpacing: '-1px', marginTop: 6, color: '#fff', fontVariantNumeric: 'tabular-nums' },
  kpiUnit: { fontSize: 18, fontWeight: 700 },
  kpiSub: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 6 },

  brow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18, alignItems: 'stretch' },
  browMobile: { gridTemplateColumns: '1fr' },

  funnels: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  funnelLbl: { fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 },
  funnelBig: { fontSize: 30, fontWeight: 800, color: '#F3C036' },
  funnelRow: { display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '7px 0', borderTop: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.75)' },
  funnelB: { color: '#fff' },

  tableScroll: { overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' },
  hoop: { width: '100%', borderCollapse: 'separate', borderSpacing: '0 7px' },
  hoopTh: { fontSize: 10, letterSpacing: '1px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', textAlign: 'right', padding: '0 14px', fontWeight: 700 },
  hoopThL: { fontSize: 10, letterSpacing: '1px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', textAlign: 'left', padding: '0 14px', fontWeight: 700 },
  hoopTdL: { background: 'rgba(255,255,255,0.03)', padding: '10px 14px', fontSize: 14, color: 'rgba(255,255,255,0.75)', borderRadius: '9px 0 0 9px' },
  hoopTdN: { background: 'rgba(255,255,255,0.03)', padding: '10px 14px', fontSize: 14, textAlign: 'right', fontWeight: 700, borderRadius: '0 9px 9px 0', fontVariantNumeric: 'tabular-nums' },

  mtx: { width: '100%', borderCollapse: 'separate', borderSpacing: '0 7px' },
  mtxTh: { fontSize: 10, letterSpacing: '1px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', textAlign: 'right', padding: '0 14px', fontWeight: 700 },
  mtxThL: { fontSize: 10, letterSpacing: '1px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', textAlign: 'left', padding: '0 14px', fontWeight: 700 },
  mtxTdL: { background: 'rgba(255,255,255,0.03)', padding: '11px 14px', fontSize: 15, color: 'rgba(255,255,255,0.8)', borderRadius: '9px 0 0 9px' },
  mtxTdN: { background: 'rgba(255,255,255,0.03)', padding: '11px 14px', fontSize: 15, textAlign: 'right', fontWeight: 700, borderRadius: '0 9px 9px 0', fontVariantNumeric: 'tabular-nums' },
  mtxCalc: { color: '#F3C036' },
  mtxTotalCell: { background: 'rgba(243,192,54,0.08)' },

  depts5: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 9 },
  depts5Mobile: { gridTemplateColumns: 'repeat(2, 1fr)' },
  dept: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '9px 12px', fontSize: 13 },
  deptC: { fontWeight: 800, color: '#F3C036' },
  deptZero: { color: 'rgba(255,255,255,0.3)' },

  src: { display: 'flex', flexDirection: 'column', gap: 10 },
  srcR: { display: 'flex', alignItems: 'center', gap: 10 },
  srcNm: { width: 130, fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  srcTrack: { flex: 1, height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 6, overflow: 'hidden' },
  srcFill: { display: 'block', height: '100%', background: 'linear-gradient(90deg, #F3C036, #ec4899)' },
  srcV: { width: 34, textAlign: 'right', fontWeight: 800, color: '#F3C036', fontSize: 14 },
  srcTotal: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.12)', fontSize: 14, fontWeight: 800 },
  srcTotalV: { color: '#F3C036', fontSize: 18 },

  gbar: { display: 'flex', height: 38, borderRadius: 9, overflow: 'hidden', marginTop: 4 },
  gbarF: { background: 'linear-gradient(90deg, #ec4899, #f472b6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, minWidth: 0 },
  gbarM: { background: 'linear-gradient(90deg, #3b82f6, #60a5fa)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, minWidth: 0 },
  glegend: { display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 8 },

  row2: { display: 'flex', gap: 24, marginBottom: 8 },
  row2N: { fontSize: 26, fontWeight: 800, color: '#F3C036', fontVariantNumeric: 'tabular-nums' },
  row2L: { fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.5px' },

  trainWrap: { display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' },
  tgrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 },
  tcell: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 9, padding: 12, textAlign: 'center' },
  tcellN: { fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums' },
  tcellL: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 3 },
};
