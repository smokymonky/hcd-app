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

  // Y-2d-2: ranked_bars — bind.section → one horizontal bar per field (TA source look).
  ranked_bars: (block, rv, fbk) => {
    const st = block.style || {};
    const rows = sectionRows(fbk, rv, block.bind && block.bind.section);
    if (rows.length === 0) return <div style={ST.unsupported}>—</div>;
    const sort = st.sort || 'desc';
    let ordered = rows.slice();
    if (sort === 'desc') ordered.sort((a, b) => (b.n ?? -Infinity) - (a.n ?? -Infinity));
    else if (sort === 'asc') ordered.sort((a, b) => (a.n ?? Infinity) - (b.n ?? Infinity));
    // 'entered' keeps sectionRows order (sort_order)
    const maxItems = (st.maxItems && Number(st.maxItems) > 0) ? Number(st.maxItems) : ordered.length;
    ordered = ordered.slice(0, maxItems);
    const max = ordered.reduce((m, r) => Math.max(m, r.n ?? 0), 0) || 1;
    const color = st.color ? themeColor(st.color) : null;
    const fillBg = color ? { background: color } : {};
    const showValue = st.showValue !== false; // default on
    return (
      <div>
        {block.title ? <div style={ST.sectionHeader}>{block.title}</div> : null}
        <div style={ST.rbWrap}>
          {ordered.map((r) => (
            <div key={r.key} style={ST.rbRow}>
              <span style={ST.rbName}>{r.label}</span>
              <span style={ST.rbTrack}><span style={{ ...ST.rbFill, ...fillBg, width: `${Math.round(((r.n ?? 0) / max) * 100)}%` }} /></span>
              {showValue && <span style={ST.rbVal}>{r.disp}</span>}
            </div>
          ))}
        </div>
      </div>
    );
  },

  // Y-2d-2: labeled_grid — bind.section → grid of fields (count + % of total), HRSys by-module look.
  labeled_grid: (block, rv, fbk) => {
    const st = block.style || {};
    const rows = sectionRows(fbk, rv, block.bind && block.bind.section);
    if (rows.length === 0) return <div style={ST.unsupported}>—</div>;
    const sort = st.sort || 'entered';
    let ordered = rows.slice();
    if (sort === 'desc') ordered.sort((a, b) => (b.n ?? -Infinity) - (a.n ?? -Infinity));
    else if (sort === 'asc') ordered.sort((a, b) => (a.n ?? Infinity) - (b.n ?? Infinity));
    const cols = [4, 5, 6].includes(Number(st.columns)) ? Number(st.columns) : 6;
    const showPercent = st.showPercent !== false; // default on
    const accent = st.color ? themeColor(st.color) : '#F3C036';
    const total = rows.reduce((s, r) => s + (r.n ?? 0), 0);
    const pct = (n) => {
      if (total === 0 || n === null) return '0%';
      const p = (n / total) * 100;
      return (p > 0 && p < 1) ? `${p.toFixed(1)}%` : `${Math.round(p)}%`;
    };
    return (
      <div>
        {block.title ? <div style={ST.sectionHeader}>{block.title}</div> : null}
        <div style={{ ...ST.lgGrid, gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {ordered.map((r) => {
            const isZero = r.n === 0 || r.n === null;
            return (
              <div key={r.key} style={ST.lgCell}>
                <div style={ST.lgName}>{r.label}</div>
                <div style={{ ...ST.lgVal, ...(isZero ? { color: 'rgba(255,255,255,0.3)' } : {}) }}>
                  {r.disp}{showPercent ? <span style={{ ...ST.lgPct, color: accent }}>{pct(r.n)}</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  },

  // Y-2d-3: matrix — bind.section → rows×cols table from mtx_<row>_<col> fields
  // (reconstructs via dimension_row/col, falling back to key parse). TA look.
  matrix: (block, rv, fbk, sections) => {
    const sectionKey = block.bind && block.bind.section;
    if (!sectionKey) return <div style={ST.unsupported}>—</div>;
    const fields = Object.keys(fbk || {}).map((k) => fbk[k])
      .filter((f) => f && f.section === sectionKey && f.is_active !== false);
    const rowOrder = {}; const colOrder = {}; const cellMap = {};
    for (const f of fields) {
      let r = f.dimension_row || f.dimensionRow;
      let c = f.dimension_col || f.dimensionCol;
      if ((!r || !c) && /^mtx_/.test(f.key)) {
        // parse mtx_<row>_<col> where col is the LAST token.
        const rest = f.key.replace(/^mtx_/, '');
        const idx = rest.lastIndexOf('_');
        if (idx > 0) { r = r || rest.slice(0, idx); c = c || rest.slice(idx + 1); }
      }
      if (!r || !c) continue;
      const so = f.sort_order ?? 0;
      if (rowOrder[r] === undefined || so < rowOrder[r]) rowOrder[r] = so;
      if (colOrder[c] === undefined || so < colOrder[c]) colOrder[c] = so;
      cellMap[`${r}|${c}`] = f;
    }
    const rows = Object.keys(rowOrder).sort((a, b) => rowOrder[a] - rowOrder[b]);
    const cols = Object.keys(colOrder).sort((a, b) => colOrder[a] - colOrder[b]);
    if (rows.length === 0 || cols.length === 0) return <div style={ST.unsupported}>—</div>;
    const accent = (block.style && block.style.color) ? themeColor(block.style.color) : '#F3C036';
    const pad = (block.style && block.style.density === 'compact') ? '7px 10px' : '11px 14px';
    return (
      <div style={ST.mxScroll}>
        {block.title ? <div style={ST.sectionHeader}>{block.title}</div> : null}
        <table style={ST.mxTable}>
          <thead>
            <tr>
              <th style={ST.mxThL} />
              {cols.map((c) => <th key={c} style={ST.mxTh}>{humanizeToken(c)}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r}>
                <td style={{ ...ST.mxTdL, padding: pad }}>{humanizeToken(r)}</td>
                {cols.map((c) => {
                  const f = cellMap[`${r}|${c}`];
                  if (!f) return <td key={c} style={{ ...ST.mxTdN, padding: pad }}>—</td>;
                  const v = rv[f.key];
                  const txt = (v === undefined || v === null || v === '') ? '—' : formatValue(f, v);
                  const computed = f.source === 'computed';
                  return <td key={c} style={{ ...ST.mxTdN, padding: pad, ...(computed ? { color: accent } : {}) }}>{txt}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  },

  // Y-2d-3: program_cards — bind.section (group layout) → one card per active
  // subsection (program): name + number totals + ratio chips. LD Option-B look.
  program_cards: (block, rv, fbk, sections) => {
    const sectionKey = block.bind && block.bind.section;
    const sec = (sections || []).find((s) => s.key === sectionKey);
    if (!sec) return <div style={ST.unsupported}>—</div>;
    const programs = (sec.subsections || [])
      .filter((ss) => ss.is_active !== false)
      .slice()
      .sort((a, b) => ((a.sort_order ?? 0) - (b.sort_order ?? 0)));
    if (programs.length === 0) return <div style={ST.unsupported}>—</div>;
    const accent = (block.style && block.style.color) ? themeColor(block.style.color) : '#F3C036';
    const layout = block.style && block.style.layout ? block.style.layout : 'chips'; // chips|rows|table
    const fieldsOf = (ssKey) => Object.keys(fbk || {}).map((k) => fbk[k])
      .filter((f) => f && f.section === sectionKey && f.subsection === ssKey && f.is_active !== false)
      .sort((a, b) => ((a.sort_order ?? 0) - (b.sort_order ?? 0)));
    const disp = (f) => { const v = rv[f.key]; return (v === undefined || v === null || v === '') ? '—' : formatValue(f, v); };
    return (
      <div>
        {block.title ? <div style={ST.sectionHeader}>{block.title}</div> : null}
        <div style={ST.pcWrap}>
          {programs.map((ss) => {
            const pf = fieldsOf(ss.key);
            const totals = pf.filter((f) => f.type !== 'ratio');
            const ratios = pf.filter((f) => f.type === 'ratio');
            return (
              <div key={ss.id || ss.key} style={ST.pcCard}>
                <div style={ST.pcHead}>
                  <span style={ST.pcName}>{ss.title}</span>
                  <div style={ST.pcTotals}>
                    {totals.map((f) => (
                      <div key={f.key} style={ST.pcTotal}>
                        <div style={{ ...ST.pcTotalN, color: accent }}>{disp(f)}</div>
                        <div style={ST.pcTotalL}>{f.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {ratios.length > 0 && (
                  layout === 'rows' || layout === 'table' ? (
                    <div style={ST.pcRows}>
                      {ratios.map((f) => (
                        <div key={f.key} style={ST.pcRow}><span>{f.label}</span><b style={{ color: accent }}>{(() => { const v = rv[f.key]; return (v === undefined || v === null || v === '') ? '—' : formatRatio(v); })()}</b></div>
                      ))}
                    </div>
                  ) : (
                    <div style={ST.pcChips}>
                      {ratios.map((f) => (
                        <span key={f.key} style={{ ...ST.pcChip, borderColor: `${accent}55` }}>{f.label} <b style={{ ...ST.pcChipB, color: accent }}>{(() => { const v = rv[f.key]; return (v === undefined || v === null || v === '') ? '—' : formatRatio(v); })()}</b></span>
                      ))}
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  },
};

// Humanize a dimension token: 'head_office' → 'Head Office'.
function humanizeToken(t) {
  if (!t) return '';
  return String(t).replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
}

// Y-2d-2: gather a section's active manual-ish fields → [{key,label,n,disp}] in sort_order.
function sectionRows(fbk, rv, sectionKey) {
  if (!sectionKey) return [];
  const out = [];
  for (const key of Object.keys(fbk || {})) {
    const f = fbk[key];
    if (!f || f.section !== sectionKey) continue;
    if (f.is_active === false) continue;
    const v = rv[key];
    const n = (v === undefined || v === null || v === '') ? null : (Number.isFinite(parseFloat(v)) ? parseFloat(v) : null);
    const disp = (v === undefined || v === null || v === '') ? '—' : formatValue(f, v);
    out.push({ key, label: f.label, n, disp, sort_order: f.sort_order ?? 0 });
  }
  out.sort((a, b) => (a.sort_order - b.sort_order));
  return out;
}

// Helper for split_bar label when showing raw values.
function dispByKey(fbk, rv, key) {
  const f = fbk[key];
  const v = rv[key];
  if (v === undefined || v === null || v === '') return '—';
  return f ? formatValue(f, v) : String(v);
}

export function renderBlock(block, resolvedValues, fieldByKey, sections) {
  const fn = REGISTRY[block && block.component];
  if (!fn) {
    return <div style={ST.unsupported}>Unsupported component: {block && block.component ? String(block.component) : '(none)'}</div>;
  }
  try {
    // 4th arg `sections` is additive — only matrix / program_cards use it; the
    // other 13 renderers ignore it.
    return fn(block, resolvedValues || {}, fieldByKey || {}, sections || []);
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
  // Y-2d-2 — ranked_bars (TA source look)
  rbWrap: { display: 'flex', flexDirection: 'column', gap: 10 },
  rbRow: { display: 'flex', alignItems: 'center', gap: 10 },
  rbName: { width: 130, fontSize: 13, color: 'rgba(255,255,255,0.8)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rbTrack: { flex: 1, height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 6, overflow: 'hidden' },
  rbFill: { display: 'block', height: '100%', background: 'linear-gradient(90deg, #F3C036, #ec4899)' },
  rbVal: { width: 40, textAlign: 'right', fontWeight: 800, color: '#F3C036', fontSize: 14, flexShrink: 0, fontVariantNumeric: 'tabular-nums' },
  // Y-2d-2 — labeled_grid (HRSys by-module look)
  lgGrid: { display: 'grid', gap: 9 },
  lgCell: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 9, padding: '10px 11px' },
  lgName: { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginBottom: 4 },
  lgVal: { fontSize: 17, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' },
  lgPct: { fontSize: 11, color: '#F3C036', fontWeight: 700, marginLeft: 4 },
  // Y-2d-3 — matrix (TA look)
  mxScroll: { overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' },
  mxTable: { borderCollapse: 'separate', borderSpacing: '8px 8px', minWidth: 'max-content' },
  mxTh: { fontSize: 10, letterSpacing: '1px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', textAlign: 'right', padding: '0 14px', fontWeight: 700 },
  mxThL: { background: 'transparent' },
  mxTdL: { background: 'rgba(255,255,255,0.03)', fontSize: 15, color: 'rgba(255,255,255,0.8)', borderRadius: '9px 0 0 9px', whiteSpace: 'nowrap' },
  mxTdN: { background: 'rgba(255,255,255,0.03)', fontSize: 15, textAlign: 'right', fontWeight: 700, color: '#fff', borderRadius: '0 9px 9px 0', fontVariantNumeric: 'tabular-nums' },
  // Y-2d-3 — program_cards (LD Option-B look)
  pcWrap: { display: 'flex', flexDirection: 'column', gap: 12 },
  pcCard: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 13, padding: '15px 18px' },
  pcHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' },
  pcName: { fontSize: 15, fontWeight: 700, color: '#fff' },
  pcTotals: { display: 'flex', alignItems: 'center', gap: 26 },
  pcTotal: { textAlign: 'center', minWidth: 76 },
  pcTotalN: { fontSize: 22, fontWeight: 800, color: '#F3C036', lineHeight: 1, fontVariantNumeric: 'tabular-nums' },
  pcTotalL: { fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 4 },
  pcChips: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  pcChip: { background: 'rgba(243,192,54,0.08)', border: '1px solid rgba(243,192,54,0.22)', borderRadius: 20, padding: '6px 13px', fontSize: 12, color: 'rgba(255,255,255,0.82)' },
  pcChipB: { color: '#F3C036', marginLeft: 5, fontWeight: 800 },
  pcRows: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 },
  pcRow: { display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'rgba(255,255,255,0.78)', padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.06)' },
};
