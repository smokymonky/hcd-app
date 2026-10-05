import React, { useEffect, useMemo, useState } from 'react';
import { resolveComputedValues, formatValue, parseList } from '../engine/computers';

// =============================================
// HRSysSnapshot — bespoke HR Systems published view
// =============================================
// DASHBOARD BUILDER — HR_SYS-3. Hand-designed snapshot (approved mockup):
// glassy glowing SVG ring gauges (gold / magenta / purple, white centers),
// multi-segment donuts, services tiles, by-module grid with whole %, the
// highlights LIST as cards, and incidents + SLA bar. Fully DATA-DRIVEN
// (values by HR_SYS field key from resolveComputedValues). Read-only.
// SECTION CONTENT ONLY — ModulePage's unified header owns the title/badges.
//
// WHOLE-NUMBER %s: every percentage in THIS component renders via pct()
// (Math.round, no decimals) — local only; global formatValue is untouched.
// =============================================

const R = 54;                    // gauge radius
const C = 2 * Math.PI * R;       // circumference ≈ 339.29
const DR = 52;                   // donut radius
const DC = 2 * Math.PI * DR;     // donut circumference ≈ 326.73

export default function HRSysSnapshot({ config, values }) {
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
  function num(key) {
    const v = resolved[key];
    if (v === undefined || v === null || v === '') return null;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  function disp(key) {
    const f = fieldByKey[key];
    if (!f) return '—';
    const v = resolved[key];
    if (v === undefined || v === null || v === '') return '—';
    return formatValue(f, v);
  }
  // Whole-number percent string from a raw number (local to this snapshot).
  function pct(n) {
    if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
    return `${Math.round(Number(n))}%`;
  }
  function targetOf(key) {
    const f = fieldByKey[key];
    return (f && f.target && Number.isFinite(Number(f.target.value))) ? Number(f.target.value) : null;
  }

  // ---- gauges ----
  const uptime = num('uptime_pct');
  const sla = num('sla_attainment_pct');
  const automation = num('automation_rate_pct');

  // ---- donut: new features split ----
  const backOffice = num('back_office') ?? 0;
  const employeeExp = num('employee_exp') ?? 0;
  const nfTotal = backOffice + employeeExp;

  // ---- donut: incidents by type ----
  const bugs = num('bugs_errors') ?? 0;
  const access = num('access_issues') ?? 0;
  const integration = num('integration_issues') ?? 0;
  const incTotal = bugs + access + integration;

  const openIncidents = num('open');

  // ---- by module: count + whole % of section total, sorted desc ----
  const modFields = allFields
    .filter((f) => f.section === 'by_module' && f.source !== 'computed')
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const modTotal = modFields.reduce((s, f) => s + (num(f.key) ?? 0), 0);
  const modRows = modFields
    .map((f) => ({ key: f.key, label: f.label, n: num(f.key) }))
    .sort((a, b) => (b.n ?? -1) - (a.n ?? -1));

  // ---- highlights (list field) ----
  const highlights = parseList(resolved.highlights);

  // ---- services tiles (mockup order) ----
  const serviceTiles = [
    ['completed', 'Completed', true], ['enhanced', 'Enhanced', true], ['digitalized', 'Digitalized', true],
    ['automated', 'Automated', true], ['uat', 'UAT', false], ['in_progress', 'In Progress', false],
  ].filter(([k]) => fieldByKey[k]);

  return (
    <div style={S.wrap}>
      {/* gradient + glow defs (once) */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true"><defs>
        <linearGradient id="hsGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FDE68A" /><stop offset="1" stopColor="#F3C036" /></linearGradient>
        <linearGradient id="hsPink" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f9a8d4" /><stop offset="1" stopColor="#ec4899" /></linearGradient>
        <linearGradient id="hsPurple" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#c084fc" /><stop offset="1" stopColor="#a855f7" /></linearGradient>
      </defs></svg>

      {/* 1. System Health */}
      <div style={S.card}>
        <div style={S.cardAccent} />
        <div style={S.healthHead}>
          <h2 style={S.h2}>System Health</h2>
          {openIncidents === 0 && (
            <span style={S.statusLight}><span style={S.statusDot} /> All systems operational</span>
          )}
        </div>
        <div style={{ ...S.gauges, ...(isMobile ? S.gaugesMobile : {}) }}>
          <Gauge value={uptime} grad="hsGold" glow="rgba(243,192,54,.85)" label="Uptime" sub={targetOf('uptime_pct') != null ? `target ${targetOf('uptime_pct')}%` : 'rate'} pct={pct} />
          <Gauge value={sla} grad="hsPink" glow="rgba(236,72,153,.85)" label="SLA Attainment" sub={targetOf('sla_attainment_pct') != null ? `target ${targetOf('sla_attainment_pct')}%` : 'rate'} pct={pct} />
          <Gauge value={automation} grad="hsPurple" glow="rgba(168,85,247,.85)" label="Automation" sub="rate" pct={pct} />
          <div style={S.scol}>
            <div style={S.scard}><div style={S.scardN}>{disp('new_features')}</div><div style={S.scardL}>New Features · {disp('avg_to_production')}d</div></div>
            <div style={S.scard}><div style={S.scardN}>{disp('system_incidents')}</div><div style={S.scardL}>Incidents · {disp('avg_resolution')}d avg</div></div>
          </div>
        </div>
      </div>

      {/* 2. Donuts */}
      <div style={{ ...S.row2, ...(isMobile ? S.row2Mobile : {}) }}>
        <div style={S.card}>
          <div style={S.cardAccent} /><h2 style={S.h2}>New Features — Back Office vs Employee Exp</h2>
          <div style={S.donutRow}>
            <Donut total={nfTotal} centerLabel="TOTAL" segments={[
              { value: backOffice, grad: 'hsGold', glow: 'rgba(243,192,54,.85)' },
              { value: employeeExp, grad: 'hsPurple', glow: 'rgba(168,85,247,.85)' },
            ]} />
            <div style={S.dLabels}>
              <div style={S.dk}><span style={{ ...S.dkDot, background: '#F3C036' }} /> Back Office <b style={S.dkB}>{disp('back_office')}</b></div>
              <div style={S.dk}><span style={{ ...S.dkDot, background: '#a855f7' }} /> Employee Exp <b style={S.dkB}>{disp('employee_exp')}</b></div>
            </div>
          </div>
        </div>
        <div style={S.card}>
          <div style={S.cardAccent} /><h2 style={S.h2}>Incidents by Type</h2>
          <div style={S.donutRow}>
            <Donut total={incTotal} centerLabel="RESOLVED" segments={[
              { value: bugs, grad: 'hsGold', glow: 'rgba(243,192,54,.85)' },
              { value: access, grad: 'hsPink', glow: 'rgba(236,72,153,.85)' },
              { value: integration, grad: 'hsPurple', glow: 'rgba(168,85,247,.85)' },
            ]} />
            <div style={S.dLabels}>
              <div style={S.dk}><span style={{ ...S.dkDot, background: '#F3C036' }} /> Bugs/Errors <b style={S.dkB}>{disp('bugs_errors')}</b></div>
              <div style={S.dk}><span style={{ ...S.dkDot, background: '#ec4899' }} /> Access <b style={S.dkB}>{disp('access_issues')}</b></div>
              <div style={S.dk}><span style={{ ...S.dkDot, background: '#a855f7' }} /> Integration <b style={S.dkB}>{disp('integration_issues')}</b></div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Services Status */}
      <div style={S.card}>
        <div style={S.cardAccent} /><h2 style={S.h2}>Services Status</h2>
        <div style={{ ...S.stats, gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)' }}>
          {serviceTiles.map(([k, label, gold]) => (
            <div key={k} style={S.st}>
              <div style={{ ...S.stN, ...(gold ? { color: '#F3C036' } : {}) }}>{disp(k)}</div>
              <div style={S.stL}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. By Module */}
      <div style={S.card}>
        <div style={S.cardAccent} /><h2 style={S.h2}>New Features by Module</h2>
        <div style={{ ...S.mods, ...(isMobile ? S.modsMobile : {}) }}>
          {modRows.map((m) => (
            <div key={m.key} style={S.mod}>
              <div style={S.modName}>{m.label}</div>
              <div style={S.modVal}>
                {disp(m.key)}<span style={S.modPct}>{modTotal > 0 && m.n !== null ? `${Math.round((m.n / modTotal) * 100)}%` : '0%'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Highlights (list) */}
      <div style={S.card}>
        <div style={S.cardAccent} /><h2 style={S.h2}>Highlight Overview</h2>
        {highlights.length === 0 ? (
          <div style={S.empty}>No highlights yet.</div>
        ) : (
          <div style={{ ...S.hl, ...(isMobile ? S.hlMobile : {}) }}>
            {highlights.map((it, i) => (
              <div key={i} style={S.hli}>
                <div style={S.hliT}>{it.title || '—'}</div>
                {it.description && <div style={S.hliD}>{it.description}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 6. System Incidents + SLA bar */}
      <div style={S.card}>
        <div style={S.cardAccent} /><h2 style={S.h2}>System Incidents</h2>
        <div style={{ ...S.stats, gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div style={S.st}><div style={{ ...S.stN, color: '#F3C036' }}>{disp('resolved')}</div><div style={S.stL}>Resolved</div></div>
          <div style={S.st}><div style={S.stN}>{disp('open')}</div><div style={S.stL}>Open</div></div>
          <div style={S.st}><div style={{ ...S.stN, color: '#F3C036' }}>{disp('avg_resolution')}d</div><div style={S.stL}>Avg Resolution</div></div>
        </div>
        <div style={{ marginTop: 14 }}>
          <div style={S.slaRow}>
            <span>SLA Attainment{targetOf('sla_attainment_pct') != null ? ` · target ${targetOf('sla_attainment_pct')}%` : ''}</span>
            <b style={S.slaVal}>{pct(sla)}</b>
          </div>
          <div style={S.uline}><div style={{ ...S.ulineF, width: `${sla === null ? 0 : Math.max(0, Math.min(100, Math.round(sla)))}%` }} /></div>
        </div>
      </div>
    </div>
  );
}

// ---- Gauge: single glassy ring ----
function Gauge({ value, grad, glow, label, sub, pct }) {
  const v = (value === null || value === undefined || !Number.isFinite(Number(value))) ? 0 : Math.max(0, Math.min(100, Number(value)));
  const offset = C * (1 - v / 100);
  return (
    <div style={S.gauge}>
      <svg width="130" height="130" viewBox="0 0 130 130">
        <circle cx="65" cy="65" r={R} fill="none" strokeWidth="11" style={S.track} />
        <circle
          cx="65" cy="65" r={R} fill="none" stroke={`url(#${grad})`} strokeWidth="11" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={offset} transform="rotate(-90 65 65)"
          style={{ filter: `drop-shadow(0 0 5px ${glow})` }}
        />
      </svg>
      <div style={S.gaugeCtr}><span style={S.gaugeV}>{pct(value)}</span></div>
      <div style={S.gaugeL}>{label}</div>
      <div style={S.gaugeT}>{sub}</div>
    </div>
  );
}

// ---- Donut: multi-segment ring ----
function Donut({ total, centerLabel, segments }) {
  const sum = segments.reduce((s, seg) => s + (seg.value || 0), 0);
  let acc = 0;
  return (
    <div style={{ position: 'relative', width: 130, height: 130 }}>
      <svg width="130" height="130" viewBox="0 0 130 130">
        <circle cx="65" cy="65" r={DR} fill="none" strokeWidth="16" style={S.track} />
        {segments.map((seg, i) => {
          const frac = sum > 0 ? (seg.value || 0) / sum : 0;
          const len = frac * DC;
          const dashoffset = -acc;
          acc += len;
          return (
            <circle
              key={i} cx="65" cy="65" r={DR} fill="none" stroke={`url(#${seg.grad})`} strokeWidth="16"
              strokeDasharray={`${len} ${DC - len}`} strokeDashoffset={dashoffset} transform="rotate(-90 65 65)"
              style={{ filter: `drop-shadow(0 0 5px ${seg.glow})` }}
            />
          );
        })}
      </svg>
      <div style={S.dCtr}>
        <div style={S.dCtrN}>{Number.isFinite(total) ? total.toLocaleString('en-US') : '—'}</div>
        <div style={S.dCtrL}>{centerLabel}</div>
      </div>
    </div>
  );
}

const ACCENT = 'linear-gradient(90deg, #F3C036, #ec4899, #a855f7)';
const S = {
  wrap: { maxWidth: 1100, margin: '0 auto', padding: '4px 0 40px', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", color: '#fff' },

  card: { background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '22px 24px', marginBottom: 16, position: 'relative', overflow: 'hidden', boxShadow: '0 6px 24px rgba(0,0,0,0.2)' },
  cardAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: ACCENT },
  h2: { fontSize: 11, fontWeight: 700, letterSpacing: '1.3px', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', marginBottom: 16 },
  empty: { fontSize: 13, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' },

  healthHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, gap: 12, flexWrap: 'wrap' },
  statusLight: { display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 20, background: 'rgba(243,192,54,0.12)', border: '1px solid rgba(243,192,54,0.4)', color: '#F3C036' },
  statusDot: { width: 8, height: 8, borderRadius: '50%', background: '#F3C036', boxShadow: '0 0 10px #F3C036' },

  gauges: { display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' },
  gaugesMobile: { justifyContent: 'center' },
  gauge: { textAlign: 'center', position: 'relative' },
  gaugeCtr: { position: 'absolute', top: 50, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' },
  gaugeV: { fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', color: '#fff' },
  gaugeL: { fontSize: 12, color: 'rgba(255,255,255,0.82)', fontWeight: 600, marginTop: 6 },
  gaugeT: { fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 2 },
  track: { stroke: 'rgba(255,255,255,0.07)' },

  scol: { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 150 },
  scard: { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, padding: '14px 18px', textAlign: 'center' },
  scardN: { fontSize: 28, fontWeight: 800, letterSpacing: '-1px', color: '#F3C036', fontVariantNumeric: 'tabular-nums' },
  scardL: { fontSize: 10, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 3 },

  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 0 },
  row2Mobile: { gridTemplateColumns: '1fr' },
  donutRow: { display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' },
  dLabels: { display: 'flex', flexDirection: 'column', gap: 10 },
  dk: { display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'rgba(255,255,255,0.82)', minWidth: 150 },
  dkDot: { width: 11, height: 11, borderRadius: 3, flexShrink: 0 },
  dkB: { marginLeft: 'auto', fontSize: 14, fontWeight: 800, color: '#fff' },
  dCtr: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  dCtrN: { fontSize: 24, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' },
  dCtrL: { fontSize: 9, color: 'rgba(255,255,255,0.5)', letterSpacing: '1px' },

  stats: { display: 'grid', gap: 12 },
  st: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 11, padding: '12px 14px', textAlign: 'center' },
  stN: { fontSize: 22, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' },
  stL: { fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 3 },

  mods: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 9 },
  modsMobile: { gridTemplateColumns: 'repeat(2, 1fr)' },
  mod: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 9, padding: '10px 11px' },
  modName: { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginBottom: 4 },
  modVal: { fontSize: 17, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' },
  modPct: { fontSize: 11, color: '#F3C036', fontWeight: 700, marginLeft: 4 },

  hl: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  hlMobile: { gridTemplateColumns: '1fr' },
  hli: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderLeft: '3px solid #F3C036', borderRadius: 9, padding: '12px 15px' },
  hliT: { fontSize: 14, fontWeight: 700, color: '#fff' },
  hliD: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 3, lineHeight: 1.5 },

  slaRow: { display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 2 },
  slaVal: { color: '#F3C036', fontWeight: 800 },
  uline: { height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden', marginTop: 2 },
  ulineF: { height: '100%', background: 'linear-gradient(90deg, #F3C036, #ec4899)' },
};
