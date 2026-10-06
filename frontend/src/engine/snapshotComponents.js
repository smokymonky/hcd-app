import React from 'react';
import { formatValue, formatRatio } from './computers';

// =============================================
// snapshotComponents — component registry for the config-driven snapshot
// =============================================
// SNAPSHOT DESIGNER (Y-1). A registry mapping a block's `component` type to a
// React renderer. Each renderer receives (block, resolvedValues, fieldByKey)
// and renders per the palette look. ConfigurableSnapshot walks the layout and
// dispatches here. Y-1 ships the CORE SUBSET needed to prove plain + rich +
// layout: section_header, hero_kpi, stat_tile, ring_gauge, donut, status_light
// (container = the grid itself, handled by ConfigurableSnapshot).
//
// Colors come from curated THEME TOKENS via themeColor(); a custom hex passes
// through. Gradients/glow for gauges+donuts derive from the token.
// =============================================

// ---- theme ----
const THEME = {
  gold: '#F3C036',
  magenta: '#ec4899',
  pink: '#ec4899',
  purple: '#a855f7',
  green: '#22c55e',
  blue: '#3b82f6',
  white: '#ffffff',
};
// token → brand value; a '#RRGGBB' hex passes through; fallback gold.
export function themeColor(token) {
  if (!token) return THEME.gold;
  if (typeof token === 'string' && token.startsWith('#')) return token;
  return THEME[token] || THEME.gold;
}
// SVG gradient id + glow for a token (used by ring_gauge / donut).
const GRAD_BY_TOKEN = {
  gold: { id: 'cfgGold', stops: ['#FDE68A', '#F3C036'], glow: 'rgba(243,192,54,.85)' },
  magenta: { id: 'cfgPink', stops: ['#f9a8d4', '#ec4899'], glow: 'rgba(236,72,153,.85)' },
  pink: { id: 'cfgPink', stops: ['#f9a8d4', '#ec4899'], glow: 'rgba(236,72,153,.85)' },
  purple: { id: 'cfgPurple', stops: ['#c084fc', '#a855f7'], glow: 'rgba(168,85,247,.85)' },
};
export function gradFor(token) {
  if (token && typeof token === 'string' && token.startsWith('#')) {
    return { id: null, solid: token, glow: 'rgba(0,0,0,0)' };
  }
  return GRAD_BY_TOKEN[token] || GRAD_BY_TOKEN.gold;
}
// The <defs> ConfigurableSnapshot renders once so gauge/donut gradients resolve.
export const GRADIENT_DEFS = [GRAD_BY_TOKEN.gold, GRAD_BY_TOKEN.magenta, GRAD_BY_TOKEN.purple];

// ---- value helpers ----
function fieldOf(block, fieldByKey) {
  const key = block && block.bind && block.bind.field;
  return key ? fieldByKey[key] : null;
}
function rawOf(block, resolvedValues) {
  const key = block && block.bind && block.bind.field;
  if (!key) return null;
  const v = resolvedValues[key];
  return (v === undefined || v === null || v === '') ? null : v;
}
function dispOf(block, resolvedValues, fieldByKey) {
  const f = fieldOf(block, fieldByKey);
  const key = block && block.bind && block.bind.field;
  if (!key) return '—';
  const v = resolvedValues[key];
  if (v === undefined || v === null || v === '') return '—';
  return f ? formatValue(f, v) : String(v);
}
function numOf(block, resolvedValues) {
  const r = rawOf(block, resolvedValues);
  if (r === null) return null;
  const n = parseFloat(r);
  return Number.isFinite(n) ? n : null;
}
function titleOf(block, fieldByKey) {
  if (block.title) return block.title;
  const f = fieldOf(block, fieldByKey);
  return f ? f.label : '';
}

// =============================================
// Core renderers — each (block, resolvedValues, fieldByKey) → JSX
// =============================================
const REGISTRY = {
  section_header: (block) => (
    <div style={ST.sectionHeader}>{block.title || 'Section'}</div>
  ),

  hero_kpi: (block, rv, fbk) => {
    const color = themeColor(block.style && block.style.color);
    const f = fieldOf(block, fbk);
    const val = dispOf(block, rv, fbk);
    return (
      <div style={ST.kpi}>
        <div style={ST.kpiAccent} />
        <div style={ST.kpiLbl}>{titleOf(block, fbk)}</div>
        <div style={{ ...ST.kpiVal, color }}>
          {val}{f && f.unit && val !== '—' ? <span style={ST.kpiUnit}> {f.unit}</span> : null}
        </div>
      </div>
    );
  },

  stat_tile: (block, rv, fbk) => {
    const color = block.style && block.style.color ? themeColor(block.style.color) : '#fff';
    return (
      <div style={ST.st}>
        <div style={{ ...ST.stN, color }}>{dispOf(block, rv, fbk)}</div>
        <div style={ST.stL}>{titleOf(block, fbk)}</div>
      </div>
    );
  },

  ratio: (block, rv, fbk) => (
    <div style={ST.st}>
      <div style={{ ...ST.stN, color: THEME.gold }}>
        {(() => { const r = rawOf(block, rv); return r === null ? '—' : formatRatio(r); })()}
      </div>
      <div style={ST.stL}>{titleOf(block, fbk)}</div>
    </div>
  ),

  ring_gauge: (block, rv, fbk) => {
    const token = (block.style && block.style.color) || 'gold';
    const g = gradFor(token);
    const n = numOf(block, rv);
    const v = n === null ? 0 : Math.max(0, Math.min(100, n));
    const R = 54; const C = 2 * Math.PI * R;
    const offset = C * (1 - v / 100);
    const stroke = g.id ? `url(#${g.id})` : g.solid;
    return (
      <div style={ST.gauge}>
        <svg width="130" height="130" viewBox="0 0 130 130">
          <circle cx="65" cy="65" r={R} fill="none" strokeWidth="11" style={ST.track} />
          <circle cx="65" cy="65" r={R} fill="none" stroke={stroke} strokeWidth="11" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={offset} transform="rotate(-90 65 65)"
            style={{ filter: `drop-shadow(0 0 5px ${g.glow})` }} />
        </svg>
        <div style={ST.gaugeCtr}><span style={ST.gaugeV}>{n === null ? '—' : `${Math.round(n)}%`}</span></div>
        <div style={ST.gaugeL}>{titleOf(block, fbk)}</div>
      </div>
    );
  },

  donut: (block, rv, fbk) => {
    // bind.fields → segments; cycle gold/magenta/purple. Center = total.
    const keys = (block.bind && Array.isArray(block.bind.fields)) ? block.bind.fields : [];
    const tokens = ['gold', 'magenta', 'purple'];
    const segs = keys.map((k, i) => {
      const v = rv[k]; const n = (v === undefined || v === null || v === '') ? 0 : (parseFloat(v) || 0);
      return { key: k, n, label: (fbk[k] && fbk[k].label) || k, g: gradFor(tokens[i % 3]), dot: themeColor(tokens[i % 3]) };
    });
    const sum = segs.reduce((s, x) => s + x.n, 0);
    const R = 52; const C = 2 * Math.PI * R; let acc = 0;
    return (
      <div style={ST.donutRow}>
        <div style={{ position: 'relative', width: 130, height: 130 }}>
          <svg width="130" height="130" viewBox="0 0 130 130">
            <circle cx="65" cy="65" r={R} fill="none" strokeWidth="16" style={ST.track} />
            {segs.map((seg, i) => {
              const frac = sum > 0 ? seg.n / sum : 0; const len = frac * C; const off = -acc; acc += len;
              const stroke = seg.g.id ? `url(#${seg.g.id})` : seg.g.solid;
              return <circle key={i} cx="65" cy="65" r={R} fill="none" stroke={stroke} strokeWidth="16"
                strokeDasharray={`${len} ${C - len}`} strokeDashoffset={off} transform="rotate(-90 65 65)"
                style={{ filter: `drop-shadow(0 0 5px ${seg.g.glow})` }} />;
            })}
          </svg>
          <div style={ST.dCtr}>
            <div style={ST.dCtrN}>{Number.isFinite(sum) ? sum.toLocaleString('en-US') : '—'}</div>
            <div style={ST.dCtrL}>{block.title || 'TOTAL'}</div>
          </div>
        </div>
        <div style={ST.dLabels}>
          {segs.map((seg, i) => (
            <div key={i} style={ST.dk}><span style={{ ...ST.dkDot, background: seg.dot }} /> {seg.label} <b style={ST.dkB}>{seg.n.toLocaleString('en-US')}</b></div>
          ))}
        </div>
      </div>
    );
  },

  status_light: (block) => (
    <span style={ST.statusLight}><span style={ST.statusDot} /> {block.title || 'All systems operational'}</span>
  ),
};

export function renderBlock(block, resolvedValues, fieldByKey) {
  const fn = REGISTRY[block && block.component];
  if (!fn) {
    return <div style={ST.unsupported}>Unsupported component: {block && block.component ? String(block.component) : '(none)'}</div>;
  }
  try {
    return fn(block, resolvedValues || {}, fieldByKey || {});
  } catch (e) {
    return <div style={ST.unsupported}>Component error: {block.component}</div>;
  }
}

export const COMPONENT_TYPES = Object.keys(REGISTRY);

// ---- styles ----
const ST = {
  sectionHeader: { fontSize: 12, fontWeight: 700, letterSpacing: '1.3px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', margin: '4px 0 8px' },
  kpi: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: '18px 20px', position: 'relative', overflow: 'hidden', height: '100%' },
  kpiAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #F3C036, #ec4899, #a855f7)' },
  kpiLbl: { fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase' },
  kpiVal: { fontSize: 34, fontWeight: 800, letterSpacing: '-1px', marginTop: 6, fontVariantNumeric: 'tabular-nums' },
  kpiUnit: { fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.5)' },
  st: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 11, padding: '14px 16px', textAlign: 'center', height: '100%' },
  stN: { fontSize: 24, fontWeight: 800, fontVariantNumeric: 'tabular-nums' },
  stL: { fontSize: 10.5, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 4 },
  gauge: { textAlign: 'center', position: 'relative', display: 'inline-block' },
  gaugeCtr: { position: 'absolute', top: 50, left: 0, right: 0, display: 'flex', justifyContent: 'center' },
  gaugeV: { fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', color: '#fff' },
  gaugeL: { fontSize: 12, color: 'rgba(255,255,255,0.82)', fontWeight: 600, marginTop: 6 },
  track: { stroke: 'rgba(255,255,255,0.07)' },
  donutRow: { display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' },
  dCtr: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  dCtrN: { fontSize: 24, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' },
  dCtrL: { fontSize: 9, color: 'rgba(255,255,255,0.5)', letterSpacing: '1px' },
  dLabels: { display: 'flex', flexDirection: 'column', gap: 10 },
  dk: { display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'rgba(255,255,255,0.82)', minWidth: 150 },
  dkDot: { width: 11, height: 11, borderRadius: 3, flexShrink: 0 },
  dkB: { marginLeft: 'auto', fontSize: 14, fontWeight: 800, color: '#fff' },
  statusLight: { display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 20, background: 'rgba(243,192,54,0.12)', border: '1px solid rgba(243,192,54,0.4)', color: '#F3C036' },
  statusDot: { width: 8, height: 8, borderRadius: '50%', background: '#F3C036', boxShadow: '0 0 10px #F3C036' },
  unsupported: { padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.5)', fontSize: 12 },
};
