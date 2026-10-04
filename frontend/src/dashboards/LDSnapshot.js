import React, { useEffect, useMemo, useState } from 'react';
import { resolveComputedValues, formatValue, formatRatio } from '../engine/computers';

// =============================================
// LDSnapshot — bespoke Development & Career published view
// =============================================
// DASHBOARD BUILDER — L&D-3. Hand-designed L&D snapshot (approved mockup,
// "Option C" big-number + underline metric cards, "Option B" program chips).
// Fully DATA-DRIVEN: every number is read by its L&D field key from the
// resolved values map — never hardcoded. Same { config, values } interface as
// TASnapshot/ModuleSnapshot, so ModuleSnapshotPreview/ModulePage pass through.
//
// Uses resolveComputedValues so computed-of-computed + cross-section sum
// resolve (opportunities = sum of the dept grid; delivered/utilization %;
// coop_trainees). Ratios via formatRatio. Read-only. SECTION CONTENT ONLY —
// the page header (title + month/status badges) is ModulePage's.
// =============================================

export default function LDSnapshot({ config, values }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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

  // ---- readers ----
  function disp(key) {
    const f = fieldByKey[key];
    if (!f) return '—';
    const v = resolved[key];
    if (v === undefined || v === null || v === '') return '—';
    return formatValue(f, v);
  }
  function num(key) {
    const v = resolved[key];
    if (v === undefined || v === null || v === '') return null;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  // Clamp a 0..100 width for an underline bar.
  function barW(pct) {
    const n = (pct === null || pct === undefined) ? 0 : Number(pct);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }

  // ---- target lookups (for 'target N' sublines + TMD bar) ----
  function targetOf(key) {
    const f = fieldByKey[key];
    return (f && f.target && Number.isFinite(Number(f.target.value))) ? Number(f.target.value) : null;
  }
  const tmdTarget = targetOf('tmd') || 820;
  const tmdVal = num('tmd');
  const tmdBar = (tmdVal !== null && tmdTarget) ? barW((tmdVal / tmdTarget) * 100) : 0;

  // ---- departments: count + render-derived % of section total, sorted desc ----
  const deptFields = allFields
    .filter((f) => f.section === 'learning_opportunities' && f.source !== 'computed')
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const deptTotal = deptFields.reduce((s, f) => s + (num(f.key) ?? 0), 0);
  const deptRows = deptFields
    .map((f) => ({ key: f.key, label: f.label, n: num(f.key) }))
    .sort((a, b) => (b.n ?? -1) - (a.n ?? -1));
  function deptPct(n) {
    if (deptTotal === 0 || n === null) return '0%';
    const p = (n / deptTotal) * 100;
    return p < 1 && p > 0 ? `${p.toFixed(1)}%` : `${Math.round(p)}%`;
  }

  // ---- accomplished projects (group) — active program subsections + fields ----
  const projectsSection = (config.sections || []).find((s) => s.key === 'accomplished_projects');
  const programs = projectsSection
    ? (projectsSection.subsections || [])
      .filter((ss) => ss.is_active !== false)
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((ss) => {
        const pf = (projectsSection.fields || []).filter((f) => f.is_active !== false && f.subsection === ss.key);
        const totals = pf.filter((f) => f.type !== 'ratio').sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        const ratios = pf.filter((f) => f.type === 'ratio').sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        return { ss, totals, ratios };
      })
    : [];

  return (
    <div style={S.wrap}>
      {/* HERO (5) */}
      <div style={{ ...S.hero, ...(isMobile ? S.heroMobile : {}) }}>
        <HeroKpi label="TMD" value={disp('tmd')} gold sub={`target ${tmdTarget}`} />
        <HeroKpi label="Trained Associates" value={disp('trained_associates')} sub={`target ${targetOf('trained_associates') || 790}`} />
        <HeroKpi label="Satisfaction" value={disp('satisfaction_rate')} gold sub={`above ${targetOf('satisfaction_rate') || 85}% target`} />
        <HeroKpi label="Calendar Utilization" value={disp('utilization_pct')} sub={`${disp('seats_used')} / ${disp('seats_offered')} seats`} />
        <HeroKpi label="SAMA Credit Advisor" value={disp('credit_advisor_cert_pct')} gold sub={`above ${targetOf('credit_advisor_cert_pct') || 90}% target`} />
      </div>

      {/* ROW: Trained Associates | Learning Calendar */}
      <div style={{ ...S.brow, ...(isMobile ? S.browMobile : {}) }}>
        <div style={S.card}>
          <div style={S.cardAccent} /><h2 style={S.h2}>Trained Associates (YTD)</h2>
          <div style={{ ...S.bn2, ...(isMobile ? S.bn2Mobile : {}) }}>
            <BigNum value={<>{disp('trained_associates')}<span style={S.bnSm}> / {targetOf('trained_associates') || 790}</span></>} plain label="Trained Associates" bar={barW(num('trained_pct'))} />
            <BigNum value={disp('trained_pct')} label={`Trained · target ${targetOf('trained_pct') || 70}%`} bar={barW(num('trained_pct'))} />
          </div>
          <div style={{ ...S.stats, gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 4 }}>
            <Stat n={disp('female_pct')} l="Female" />
            <Stat n={disp('male_pct')} l="Male" />
            <Stat n={disp('ho_pct')} l="HO" />
            <Stat n={disp('op_pct')} l="OP" />
          </div>
        </div>
        <div style={S.card}>
          <div style={S.cardAccent} /><h2 style={S.h2}>Learning Calendar</h2>
          <BigNum value={disp('delivered_pct')} label={`Sessions Delivered · ${disp('delivered')} of ${disp('planned')}`} bar={barW(num('delivered_pct'))} />
          <BigNum value={disp('utilization_pct')} label={`Seat Utilization · ${disp('seats_used')} of ${disp('seats_offered')}`} bar={barW(num('utilization_pct'))} />
        </div>
      </div>

      {/* ROW: TMD & Satisfaction | Student Internship */}
      <div style={{ ...S.brow, ...(isMobile ? S.browMobile : {}) }}>
        <div style={S.card}>
          <div style={S.cardAccent} /><h2 style={S.h2}>TMD &amp; Satisfaction</h2>
          <div style={{ ...S.bn2, ...(isMobile ? S.bn2Mobile : {}) }}>
            <BigNum value={<>{disp('tmd')}<span style={S.bnSm}> / {tmdTarget}</span></>} label={`Learning Man-days · ${Math.round(tmdBar)}% of target`} bar={tmdBar} />
            <BigNum value={disp('satisfaction_rate')} label={`Satisfaction · target ${targetOf('satisfaction_rate') || 85}%`} bar={barW(num('satisfaction_rate'))} />
          </div>
          <div style={{ ...S.stats, gridTemplateColumns: 'repeat(2, 1fr)', marginTop: 4 }}>
            <Stat n={disp('opportunities')} l="Opportunities" gold />
          </div>
        </div>
        <div style={S.card}>
          <div style={S.cardAccent} /><h2 style={S.h2}>Student Internship</h2>
          <div style={S.kv}><span>Top 2 Departments</span><b style={S.kvVal}>{disp('top_2_departments')}</b></div>
          <div style={{ ...S.stats, gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 12 }}>
            <Stat n={disp('training_plans')} l="Training Plans" gold />
            <Stat n={disp('coop_trainees')} l={`Coop (M${disp('coop_male')}/F${disp('coop_female')})`} gold />
            <Stat n={tamheerTotal(num)} l={`Tamheer (F${disp('tamheer_female')}/M${disp('tamheer_male')})`} gold />
          </div>
        </div>
      </div>

      {/* ROW: SAMA | Talent Management */}
      <div style={{ ...S.brow, ...(isMobile ? S.browMobile : {}) }}>
        <div style={S.card}>
          <div style={S.cardAccent} /><h2 style={S.h2}>SAMA Compliance</h2>
          <div style={{ ...S.bn2, ...(isMobile ? S.bn2Mobile : {}) }}>
            <BigNum value={disp('mandatory_courses_pct')} label={`Mandatory Courses · target ${targetOf('mandatory_courses_pct') || 100}%`} bar={barW(num('mandatory_courses_pct'))} />
            <BigNum value={disp('credit_advisor_cert_pct')} label={`Credit Advisor · SAMA ${targetOf('credit_advisor_cert_pct') || 90}%`} bar={barW(num('credit_advisor_cert_pct'))} />
          </div>
        </div>
        <div style={S.card}>
          <div style={S.cardAccent} /><h2 style={S.h2}>Talent Management — 2026</h2>
          <div style={{ ...S.stats, gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <Stat n={disp('pip')} l="PIP" gold />
            <Stat n={disp('talent_pool_successors')} l="Successors" gold />
            <Stat n={disp('talent_pool_hipo')} l="HIPO" gold />
            <Stat n={disp('talent_pool_adp')} l="ADP" gold />
          </div>
        </div>
      </div>

      {/* Departments */}
      <div style={{ ...S.card, marginBottom: 18 }}>
        <div style={S.cardAccent} /><h2 style={S.h2}>Learning Opportunities by Department</h2>
        <div style={{ ...S.depts, ...(isMobile ? S.deptsMobile : {}) }}>
          {deptRows.map((d) => {
            const isZero = d.n === 0 || d.n === null;
            return (
              <div key={d.key} style={{ ...S.dept, ...(isZero ? S.deptZero : {}) }}>
                <div style={S.deptName}>{d.label}</div>
                <div style={S.deptVal}>
                  {disp(d.key)}<span style={S.deptPct}>{deptPct(d.n)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Accomplished Projects (Option B) */}
      <div style={S.card}>
        <div style={S.cardAccent} /><h2 style={S.h2}>Accomplished L&amp;D Projects / Initiatives</h2>
        <div style={S.progB}>
          {programs.length === 0 ? (
            <div style={S.programEmpty}>No programs yet.</div>
          ) : programs.map(({ ss, totals, ratios }) => (
            <div key={ss.id || ss.key} style={S.pcard}>
              <div style={{ ...S.phead, ...(isMobile ? S.pheadMobile : {}) }}>
                <span style={S.pn}>{ss.title}</span>
                <div style={S.ptotals}>
                  {totals.map((f) => (
                    <div key={f.key} style={S.ptotal}>
                      <div style={S.ptotalN}>{disp(f.key)}</div>
                      <div style={S.ptotalL}>{f.label}</div>
                    </div>
                  ))}
                </div>
              </div>
              {ratios.length > 0 && (
                <div style={S.chips}>
                  {ratios.map((f) => (
                    <span key={f.key} style={S.chip}>{f.label} <b style={S.chipB}>{formatRatio(resolved[f.key])}</b></span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Tamheer total = female + male (display-only; no seeded field).
function tamheerTotal(num) {
  const f = num('tamheer_female');
  const m = num('tamheer_male');
  if (f === null && m === null) return '—';
  return String((f ?? 0) + (m ?? 0));
}

// ---- small presentational components ----
function HeroKpi({ label, value, sub, gold }) {
  return (
    <div style={S.kpi}>
      <div style={S.kpiAccent} />
      <div style={S.kpiLbl}>{label}</div>
      <div style={{ ...S.kpiVal, ...(gold ? { color: '#F3C036' } : {}) }}>{value}</div>
      {sub && <div style={S.kpiSub}>{sub}</div>}
    </div>
  );
}
function BigNum({ value, label, bar, plain }) {
  return (
    <div style={S.bn}>
      <div style={{ ...S.bnV, ...(plain ? { color: '#fff' } : {}) }}>{value}</div>
      <div style={S.bnL}>{label}</div>
      <div style={S.uline}><div style={{ ...S.ulineF, width: `${bar}%` }} /></div>
    </div>
  );
}
function Stat({ n, l, gold }) {
  return (
    <div style={S.st}>
      <div style={{ ...S.stN, ...(gold ? { color: '#F3C036' } : {}) }}>{n}</div>
      <div style={S.stL}>{l}</div>
    </div>
  );
}

const ACCENT = 'linear-gradient(90deg, #F3C036, #ec4899, #a855f7)';
const S = {
  wrap: { maxWidth: 1240, margin: '0 auto', padding: '4px 0 40px', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", color: '#fff' },

  hero: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 20 },
  heroMobile: { gridTemplateColumns: 'repeat(2, 1fr)' },
  kpi: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: '16px 18px', position: 'relative', overflow: 'hidden' },
  kpiAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: ACCENT },
  kpiLbl: { fontSize: 10, fontWeight: 700, letterSpacing: '0.8px', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase' },
  kpiVal: { fontSize: 30, fontWeight: 800, letterSpacing: '-1px', marginTop: 5, color: '#fff', fontVariantNumeric: 'tabular-nums' },
  kpiSub: { fontSize: 11, marginTop: 5, color: 'rgba(255,255,255,0.5)' },

  card: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '20px 22px', position: 'relative', overflow: 'hidden' },
  cardAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: ACCENT, opacity: 0.7 },
  h2: { fontSize: 12, fontWeight: 700, letterSpacing: '1.3px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginBottom: 16 },

  brow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18, alignItems: 'stretch' },
  browMobile: { gridTemplateColumns: '1fr' },

  bn2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 },
  bn2Mobile: { gridTemplateColumns: '1fr' },
  bn: { marginBottom: 18 },
  bnV: { fontSize: 32, fontWeight: 800, color: '#F3C036', lineHeight: 1, fontVariantNumeric: 'tabular-nums' },
  bnSm: { fontSize: 15, color: 'rgba(255,255,255,0.55)', fontWeight: 700 },
  bnL: { fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: '5px 0 8px', textTransform: 'uppercase', letterSpacing: '0.4px' },
  uline: { height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' },
  ulineF: { height: '100%', background: 'linear-gradient(90deg, #F3C036, #ec4899)' },

  stats: { display: 'grid', gap: 12 },
  st: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 11, padding: '13px 14px', textAlign: 'center' },
  stN: { fontSize: 24, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' },
  stL: { fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 3 },
  kv: { display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', color: 'rgba(255,255,255,0.75)' },
  kvVal: { color: '#fff' },

  depts: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 9 },
  deptsMobile: { gridTemplateColumns: 'repeat(2, 1fr)' },
  dept: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 9, padding: '10px 11px' },
  deptZero: {},
  deptName: { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginBottom: 4 },
  deptVal: { fontSize: 17, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' },
  deptPct: { fontSize: 11, color: '#F3C036', fontWeight: 700, marginLeft: 4 },

  progB: { display: 'flex', flexDirection: 'column', gap: 12 },
  programEmpty: { fontSize: 13, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' },
  pcard: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 13, padding: '15px 18px' },
  phead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' },
  pheadMobile: { flexDirection: 'column', alignItems: 'flex-start', gap: 12 },
  pn: { fontSize: 15, fontWeight: 700 },
  ptotals: { display: 'flex', alignItems: 'center', gap: 26 },
  ptotal: { textAlign: 'center', minWidth: 76 },
  ptotalN: { fontSize: 22, fontWeight: 800, color: '#F3C036', lineHeight: 1, fontVariantNumeric: 'tabular-nums' },
  ptotalL: { fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 4 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { background: 'rgba(243,192,54,0.08)', border: '1px solid rgba(243,192,54,0.22)', borderRadius: 20, padding: '6px 13px', fontSize: 12, color: 'rgba(255,255,255,0.82)' },
  chipB: { color: '#F3C036', marginLeft: 5, fontWeight: 800 },
};
