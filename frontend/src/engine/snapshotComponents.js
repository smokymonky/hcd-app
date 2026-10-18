import React from 'react';
import { formatValue, formatRatio, parseList } from './computers';

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
  section_header: (block) => {
    const st = block.style || {};
    const c = st.color ? themeColor(st.color) : null;
    const size = st.size || 'M';
    const fontSize = size === 'S' ? 10 : size === 'L' ? 15 : 12;
    const variant = st.headerVariant || 'plain';
    const label = block.title || 'Section';
    if (variant === 'band') {
      const bandC = c || '#F3C036';
      return <div style={{ ...ST.sectionHeader, ...ST.sectionBand, fontSize, color: bandC, borderColor: bandC }}>{label}</div>;
    }
    if (variant === 'underline') {
      return (
        <div>
          <div style={{ ...ST.sectionHeader, fontSize, ...(c ? { color: c } : {}), marginBottom: 6 }}>{label}</div>
          <div style={ST.sectionUline} />
        </div>
      );
    }
    return <div style={{ ...ST.sectionHeader, fontSize, ...(c ? { color: c } : {}) }}>{label}</div>;
  },

  hero_kpi: (block, rv, fbk) => {
    const st = block.style || {};
    const color = themeColor(st.color);
    const f = fieldOf(block, fbk);
    const val = dispOf(block, rv, fbk);
    const size = st.size || 'M';
    const valFont = size === 'S' ? 26 : size === 'L' ? 44 : 34;
    const align = st.align === 'center' ? 'center' : 'left';
    const showTarget = !!st.showTarget;
    const hasTarget = f && f.target && f.target.value !== undefined && f.target.value !== null;
    return (
      <div style={{ ...ST.kpi, textAlign: align }}>
        <div style={ST.kpiAccent} />
        <div style={ST.kpiLbl}>{titleOf(block, fbk)}</div>
        <div style={{ ...ST.kpiVal, color, fontSize: valFont }}>
          {val}{f && f.unit && val !== '—' ? <span style={ST.kpiUnit}> {f.unit}</span> : null}
        </div>
        {showTarget && hasTarget && (
          <div style={ST.kpiSub}>target {formatValue(f, f.target.value)}</div>
        )}
      </div>
    );
  },

  stat_tile: (block, rv, fbk) => {
    const st = block.style || {};
    const color = st.color ? themeColor(st.color) : '#fff';
    const size = st.size || 'M';
    const nFont = size === 'S' ? 18 : size === 'L' ? 32 : 24;
    const showLabel = st.showLabel !== false; // default shown
    return (
      <div style={ST.st}>
        <div style={{ ...ST.stN, color, fontSize: nFont }}>{dispOf(block, rv, fbk)}</div>
        {showLabel && <div style={ST.stL}>{titleOf(block, fbk)}</div>}
      </div>
    );
  },

  ratio: (block, rv, fbk) => {
    const st = block.style || {};
    const color = st.color ? themeColor(st.color) : THEME.gold;
    const showPercent = st.showPercent !== false; // default with %
    return (
      <div style={ST.st}>
        <div style={{ ...ST.stN, color }}>
          {(() => {
            const r = rawOf(block, rv);
            if (r === null) return '—';
            const full = formatRatio(r);
            if (showPercent) return full;
            // strip the ' (Z%)' suffix → 'X / Y'
            return full.replace(/\s*\([^)]*%\)\s*$/, '');
          })()}
        </div>
        <div style={ST.stL}>{titleOf(block, fbk)}</div>
      </div>
    );
  },

  ring_gauge: (block, rv, fbk) => {
    const st = block.style || {};
    const token = st.color || 'gold';
    const g = gradFor(token);
    const n = numOf(block, rv);
    const v = n === null ? 0 : Math.max(0, Math.min(100, n));
    const R = 54; const C = 2 * Math.PI * R;
    const offset = C * (1 - v / 100);
    const stroke = g.id ? `url(#${g.id})` : g.solid;
    const sw = st.thickness === 'thin' ? 8 : st.thickness === 'thick' ? 15 : 11;
    const D = st.size === 'S' ? 110 : st.size === 'L' ? 160 : 130;
    const ctrTop = Math.round(D * 0.385); // 130 → 50 (default unchanged)
    const showLabelCenter = st.center === 'value_label';
    return (
      <div style={ST.gauge}>
        <svg width={D} height={D} viewBox="0 0 130 130">
          <circle cx="65" cy="65" r={R} fill="none" strokeWidth={sw} style={ST.track} />
          <circle cx="65" cy="65" r={R} fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={offset} transform="rotate(-90 65 65)"
            style={{ filter: `drop-shadow(0 0 5px ${g.glow})` }} />
        </svg>
        <div style={{ ...ST.gaugeCtr, top: ctrTop }}>
          <span style={ST.gaugeV}>{n === null ? '—' : `${Math.round(n)}%`}</span>
          {showLabelCenter && <span style={ST.gaugeCtrL}>{titleOf(block, fbk)}</span>}
        </div>
        {!showLabelCenter && <div style={ST.gaugeL}>{titleOf(block, fbk)}</div>}
      </div>
    );
  },

  donut: (block, rv, fbk) => {
    const st = block.style || {};
    const keys = (block.bind && Array.isArray(block.bind.fields)) ? block.bind.fields : [];
    const cycle = ['gold', 'magenta', 'purple'];
    const segColors = (st.segmentColors && typeof st.segmentColors === 'object') ? st.segmentColors : {};
    const segs = keys.map((k, i) => {
      const v = rv[k]; const n = (v === undefined || v === null || v === '') ? 0 : (parseFloat(v) || 0);
      const token = segColors[k] || cycle[i % 3];
      return { key: k, n, label: (fbk[k] && fbk[k].label) || k, g: gradFor(token), dot: themeColor(token) };
    });
    const sum = segs.reduce((s, x) => s + x.n, 0);

    const isPie = st.donutVariant === 'pie';
    const legend = st.legend || 'right';           // right(default) | bottom | none
    const showCenter = (st.center !== 'none') && !isPie; // default total; hidden for pie
    // pie fills to center: r=32.5, sw=65 → disc radius 65. donut default r=52 sw=16.
    const R = isPie ? 32.5 : 52;
    const sw = isPie ? 65 : (st.thickness === 'thin' ? 10 : st.thickness === 'thick' ? 22 : 16);
    const C = 2 * Math.PI * R; let acc = 0;

    const chart = (
      <div style={{ position: 'relative', width: 130, height: 130, flexShrink: 0 }}>
        <svg width="130" height="130" viewBox="0 0 130 130">
          {!isPie && <circle cx="65" cy="65" r={R} fill="none" strokeWidth={sw} style={ST.track} />}
          {segs.map((seg, i) => {
            const frac = sum > 0 ? seg.n / sum : 0; const len = frac * C; const off = -acc; acc += len;
            const stroke = seg.g.id ? `url(#${seg.g.id})` : seg.g.solid;
            return <circle key={i} cx="65" cy="65" r={R} fill="none" stroke={stroke} strokeWidth={sw}
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={off} transform="rotate(-90 65 65)"
              style={{ filter: `drop-shadow(0 0 5px ${seg.g.glow})` }} />;
          })}
        </svg>
        {showCenter && (
          <div style={ST.dCtr}>
            <div style={ST.dCtrN}>{Number.isFinite(sum) ? sum.toLocaleString('en-US') : '—'}</div>
            <div style={ST.dCtrL}>{block.title || 'TOTAL'}</div>
          </div>
        )}
      </div>
    );
    const legendEl = legend === 'none' ? null : (
      <div style={ST.dLabels}>
        {segs.map((seg, i) => (
          <div key={i} style={ST.dk}><span style={{ ...ST.dkDot, background: seg.dot }} /> {seg.label} <b style={ST.dkB}>{seg.n.toLocaleString('en-US')}</b></div>
        ))}
      </div>
    );
    const wrapStyle = legend === 'bottom'
      ? { ...ST.donutRow, flexDirection: 'column', alignItems: 'flex-start' }
      : ST.donutRow;
    return (<div style={wrapStyle}>{chart}{legendEl}</div>);
  },

  status_light: (block) => {
    const c = (block.style && block.style.color) ? themeColor(block.style.color) : null;
    const pill = c ? { ...ST.statusLight, color: c } : ST.statusLight;
    const dot = c ? { ...ST.statusDot, background: c, boxShadow: `0 0 10px ${c}` } : ST.statusDot;
    return <span style={pill}><span style={dot} /> {block.title || 'All systems operational'}</span>;
  },

  // Y-2d-1: big_number — LDSnapshot "Option C" big value + gradient underline.
  big_number: (block, rv, fbk) => {
    const st = block.style || {};
    const f = fieldOf(block, fbk);
    const val = dispOf(block, rv, fbk);
    const color = st.color ? themeColor(st.color) : '#F3C036';
    const n = numOf(block, rv);
    const isPct = f && (f.type === 'percentage');
    const target = (f && f.target && Number.isFinite(Number(f.target.value))) ? Number(f.target.value) : null;
    let bar = 100;
    if (n !== null) {
      if (isPct) bar = n;
      else if (target && target !== 0) bar = (n / target) * 100;
    }
    bar = Math.max(0, Math.min(100, bar));
    const showUnderline = st.showUnderline !== false; // default on
    const showTarget = !!st.showTarget;
    return (
      <div style={ST.bn}>
        <div style={{ ...ST.bnV, color }}>{val}{f && f.unit && val !== '—' ? <span style={ST.bnSm}> {f.unit}</span> : null}</div>
        <div style={ST.bnL}>{titleOf(block, fbk)}</div>
        {showUnderline && <div style={ST.uline}><div style={{ ...ST.ulineF, width: `${bar}%` }} /></div>}
        {showTarget && target !== null && <div style={ST.bnTarget}>target {formatValue(f, target)}</div>}
      </div>
    );
  },

  // Y-2d-1: progress_bar — label + track/fill (value% or value/target).
  progress_bar: (block, rv, fbk) => {
    const st = block.style || {};
    const f = fieldOf(block, fbk);
    const color = st.color ? themeColor(st.color) : null;
    const n = numOf(block, rv);
    const isPct = f && (f.type === 'percentage');
    const target = (f && f.target && Number.isFinite(Number(f.target.value))) ? Number(f.target.value) : null;
    let fill = 0;
    if (n !== null) {
      if (isPct) fill = n;
      else if (target && target !== 0) fill = (n / target) * 100;
    }
    fill = Math.max(0, Math.min(100, fill));
    const h = st.height === 'thick' ? 10 : 6;
    const showValue = st.showValue !== false; // default on
    const showTarget = !!st.showTarget;
    const fillStyle = color
      ? { ...ST.pbFill, height: '100%', background: color }
      : { ...ST.pbFill, height: '100%' };
    return (
      <div style={ST.pb}>
        <div style={ST.pbHead}>
          <span style={ST.pbLabel}>{titleOf(block, fbk)}{showTarget && target !== null ? ` · target ${formatValue(f, target)}` : ''}</span>
          {showValue && <b style={ST.pbVal}>{dispOf(block, rv, fbk)}</b>}
        </div>
        <div style={{ ...ST.pbTrack, height: h }}><div style={{ ...fillStyle, width: `${fill}%` }} /></div>
      </div>
    );
  },

  // Y-2d-1: split_bar — one bar split by two field values (e.g. 37% / 63%).
  split_bar: (block, rv, fbk) => {
    const st = block.style || {};
    const keys = (block.bind && Array.isArray(block.bind.fields)) ? block.bind.fields.slice(0, 2) : [];
    if (keys.length < 2) return <div style={ST.unsupported}>Split bar needs two fields.</div>;
    const [ka, kb] = keys;
    const toN = (k) => { const v = rv[k]; const x = (v === undefined || v === null || v === '') ? null : parseFloat(v); return Number.isFinite(x) ? x : 0; };
    const a = toN(ka); const b = toN(kb);
    const sum = a + b;
    const aPct = sum > 0 ? (a / sum) * 100 : 50;
    const bPct = sum > 0 ? (b / sum) * 100 : 50;
    const cA = themeColor(st.colorA || 'gold');
    const cB = themeColor(st.colorB || 'purple');
    const labA = (fbk[ka] && fbk[ka].label) || ka;
    const labB = (fbk[kb] && fbk[kb].label) || kb;
    const showPercent = st.showPercent !== false; // default on
    const fmt = (k, pct) => showPercent ? `${Math.round(pct)}%` : (dispByKey(fbk, rv, k));
    return (
      <div>
        {block.title ? <div style={ST.splitTitle}>{block.title}</div> : null}
        <div style={ST.splitBar}>
          <div style={{ ...ST.splitSeg, width: `${aPct}%`, background: `linear-gradient(90deg, ${cA}, ${cA})` }}>{showPercent && aPct > 10 ? `${Math.round(aPct)}%` : ''}</div>
          <div style={{ ...ST.splitSeg, width: `${bPct}%`, background: `linear-gradient(90deg, ${cB}, ${cB})` }}>{showPercent && bPct > 10 ? `${Math.round(bPct)}%` : ''}</div>
        </div>
        <div style={ST.splitLegend}>
          <span><span style={{ ...ST.dkDot, background: cA, display: 'inline-block', marginRight: 6 }} />{labA} {fmt(ka, aPct)}</span>
          <span>{labB} {fmt(kb, bPct)}<span style={{ ...ST.dkDot, background: cB, display: 'inline-block', marginLeft: 6 }} /></span>
        </div>
      </div>
    );
  },

  // Y-2d-1: list — HRSysSnapshot highlights cards (title bold + description, gold left-rule).
  list: (block, rv, fbk) => {
    const st = block.style || {};
    const key = block.bind && block.bind.field;
    const items = key ? parseList(rv[key]) : [];
    const cols = st.columns === 1 ? 1 : 2; // default 2
    const showDesc = st.showDescription !== false; // default on
    const accent = st.color ? themeColor(st.color) : '#F3C036';
    if (items.length === 0) return <div style={ST.unsupported}>—</div>;
    return (
      <div>
        {block.title ? <div style={ST.sectionHeader}>{block.title}</div> : null}
        <div style={{ ...ST.hlGrid, gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {items.map((it, i) => (
            <div key={i} style={{ ...ST.hli, borderLeft: `3px solid ${accent}` }}>
              <div style={ST.hliT}>{it.title || '—'}</div>
              {showDesc && it.description ? <div style={ST.hliD}>{it.description}</div> : null}
            </div>
          ))}
        </div>
      </div>
    );
  },
};

// Helper for split_bar label when showing raw values.
function dispByKey(fbk, rv, key) {
  const f = fbk[key];
  const v = rv[key];
  if (v === undefined || v === null || v === '') return '—';
  return f ? formatValue(f, v) : String(v);
}

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
  sectionUline: { height: 4, borderRadius: 2, background: 'linear-gradient(90deg, #F3C036, #ec4899, #a855f7)', margin: '0 0 8px', maxWidth: 120 },
  sectionBand: { display: 'inline-block', padding: '4px 12px', borderRadius: 6, border: '1px solid', background: 'rgba(243,192,54,0.08)', margin: '4px 0 8px' },
  kpi: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: '18px 20px', position: 'relative', overflow: 'hidden', height: '100%' },
  kpiAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #F3C036, #ec4899, #a855f7)' },
  kpiLbl: { fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase' },
  kpiSub: { fontSize: 11.5, color: 'rgba(255,255,255,0.5)', marginTop: 6, fontWeight: 600 },
  kpiVal: { fontSize: 34, fontWeight: 800, letterSpacing: '-1px', marginTop: 6, fontVariantNumeric: 'tabular-nums' },
  kpiUnit: { fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.5)' },
  st: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 11, padding: '14px 16px', textAlign: 'center', height: '100%' },
  stN: { fontSize: 24, fontWeight: 800, fontVariantNumeric: 'tabular-nums' },
  stL: { fontSize: 10.5, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 4 },
  gauge: { textAlign: 'center', position: 'relative', display: 'inline-block' },
  gaugeCtr: { position: 'absolute', top: 50, left: 0, right: 0, display: 'flex', justifyContent: 'center' },
  gaugeV: { fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', color: '#fff' },
  gaugeCtrL: { fontSize: 9.5, color: 'rgba(255,255,255,0.55)', fontWeight: 600, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.5px' },
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
  // Y-2d-1 — big_number (LD Option C)
  bn: { padding: '2px 0' },
  bnV: { fontSize: 32, fontWeight: 800, color: '#F3C036', lineHeight: 1, fontVariantNumeric: 'tabular-nums' },
  bnSm: { fontSize: 15, color: 'rgba(255,255,255,0.55)', fontWeight: 700 },
  bnL: { fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: '5px 0 8px', textTransform: 'uppercase', letterSpacing: '0.4px' },
  uline: { height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' },
  ulineF: { height: '100%', background: 'linear-gradient(90deg, #F3C036, #ec4899)' },
  bnTarget: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 6 },
  // Y-2d-1 — progress_bar
  pb: { padding: '2px 0' },
  pbHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 4 },
  pbLabel: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  pbVal: { color: '#F3C036', fontWeight: 800, fontSize: 13 },
  pbTrack: { background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' },
  pbFill: { background: 'linear-gradient(90deg, #F3C036, #ec4899)', borderRadius: 4 },
  // Y-2d-1 — split_bar
  splitTitle: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' },
  splitBar: { display: 'flex', height: 38, borderRadius: 9, overflow: 'hidden' },
  splitSeg: { display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: '#1a1028', minWidth: 0 },
  splitLegend: { display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 8 },
  // Y-2d-1 — list (HRSys highlights cards)
  hlGrid: { display: 'grid', gap: 12 },
  hli: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderLeft: '3px solid #F3C036', borderRadius: 9, padding: '12px 15px' },
  hliT: { fontSize: 14, fontWeight: 700, color: '#fff' },
  hliD: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 3, lineHeight: 1.5 },
};
