import React, { useEffect, useState } from 'react';
import {
  computeFieldValue,
  evaluateTarget,
  formatValue,
  formatNumber,
} from '../engine/computers';
import TargetIndicator from './TargetIndicator';

// =============================================
// ModuleSnapshot — generic read-only published-view renderer
// =============================================
// DASHBOARD BUILDER — Step B5-1. Renders ANY module's published snapshot
// from its DB structure (config-shaped: sections[].subsections[], fields[])
// + a values map, in the approved UNIFORM style. Read-only throughout;
// no inputs, no edit controls. Preview-only (ModuleSnapshotPreview hosts
// it); the live HROpsSnapshot is untouched.
//
// Reuses engine/computers.js: computeFieldValue (curated formulas),
// evaluateTarget (full evaluated pass/soft-fail/hard-fail — the snapshot
// shows the indicator, unlike entry's static helper), formatValue/Number.
//
// Layout per approved mockup:
//   HERO row  — KPI cards for fields with featured=true; computed via
//               engine; target indicator inline where a field has a target.
//   SECTION cards (ordered) — each a gradient-accent card. Fields grouped
//               by subsection (title+order from section.subsections) then an
//               ungrouped bucket. ho_op sections → two-column HO/OP table;
//               grid/labeled_grid → uniform value grid + computed footer
//               total. Computed values tinted, NO 'CALC' tag (read-only).
//   Empty/missing → '—'.
// =============================================

const NUMERIC_TYPES = ['number', 'percentage', 'currency'];

// Format a field's displayed value: computed via engine, else raw by type.
function displayValue(field, values, allFields) {
  if (field.source === 'computed') return computeFieldValue(field, values, allFields);
  return formatValue(field, values[field.key]);
}

export default function ModuleSnapshot({ config, values }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const sections = (config.sections || [])
    .filter((s) => s.is_active !== false)
    .slice()
    .sort((a, b) => ((a.order ?? a.sort_order ?? 0) - (b.order ?? b.sort_order ?? 0)));

  // Flat active field list (for computed 'sum{section}' + self-exclusion).
  const allFields = [];
  for (const s of sections) {
    for (const f of (s.fields || [])) {
      if (f.is_active !== false) allFields.push({ ...f, section: s.key });
    }
  }

  // Hero = featured fields, in section/field order.
  const heroFields = allFields.filter((f) => f.featured);

  return (
    <div style={{ ...styles.canvas, ...(isMobile ? styles.canvasMobile : {}) }}>
      {/* HERO row */}
      {heroFields.length > 0 && (
        <div style={{ ...styles.heroGrid, ...(isMobile ? { gridTemplateColumns: 'repeat(2, 1fr)' } : {}) }}>
          {heroFields.map((f) => {
            const evaln = f.target ? evaluateTarget(f, values[f.key]) : null;
            const val = displayValue(f, values, allFields);
            return (
              <div key={f.key} style={styles.heroKpi}>
                <div style={styles.heroAccent} />
                <div style={styles.heroLabel}>{f.label}</div>
                <div style={{ ...styles.heroValue, ...(f.target ? { color: '#F3C036' } : {}) }}>
                  {val}{f.unit && val !== '—' ? <span style={styles.heroUnit}> {f.unit}</span> : null}
                </div>
                {evaln && <TargetIndicator evaluation={evaln} />}
              </div>
            );
          })}
        </div>
      )}

      {/* SECTION cards */}
      {sections.map((section) => (
        <div key={section.key} style={{ ...styles.snapSection, ...(isMobile ? styles.snapSectionMobile : {}) }}>
          <div style={styles.snapAccent} />
          <div style={{ ...styles.snapTitle, ...(isMobile ? { flexWrap: 'wrap' } : {}) }}>{section.title}</div>
          {renderSectionBody(section, values, allFields, isMobile)}
        </div>
      ))}
    </div>
  );
}

// ---- Section body dispatch by layout ----
function renderSectionBody(section, values, allFields, isMobile) {
  const fields = (section.fields || []).filter((f) => f.is_active !== false);
  if (section.layout === 'ho_op') return renderHoOp(section, fields, values, isMobile);
  if (section.layout === 'matrix') return renderMatrix(section, fields, values, allFields, isMobile);
  if (section.layout === 'grid' || section.layout === 'labeled_grid') return renderGrid(section, fields, values, allFields, isMobile);
  return renderGrouped(section, fields, values, allFields, isMobile);
}

// ---- Grouped (kpi/default): subsections (title+order) then ungrouped ----
function renderGrouped(section, fields, values, allFields, isMobile) {
  const activeSubs = (section.subsections || [])
    .filter((ss) => ss.is_active !== false)
    .slice()
    .sort((a, b) => ((a.sort_order ?? 0) - (b.sort_order ?? 0)));
  const activeKeys = new Set(activeSubs.map((ss) => ss.key));

  const byKey = {};
  for (const f of fields) {
    const k = (f.subsection && activeKeys.has(f.subsection)) ? f.subsection : '__ungrouped__';
    (byKey[k] = byKey[k] || []).push(f);
  }
  const ungrouped = byKey.__ungrouped__ || [];

  return (
    <>
      {activeSubs.map((ss) => {
        const gf = byKey[ss.key] || [];
        if (gf.length === 0) return null;
        return (
          <div key={ss.id || ss.key} style={styles.snapSubsection}>
            <div style={styles.snapSubLabel}>{ss.title}</div>
            <div style={{ ...styles.valueGrid, gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)' }}>
              {gf.map((f) => <ValueCell key={f.key} field={f} values={values} allFields={allFields} />)}
            </div>
          </div>
        );
      })}
      {ungrouped.length > 0 && (
        <div style={styles.snapSubsection}>
          {activeSubs.length > 0 && <div style={styles.snapSubLabel}>Other</div>}
          <div style={{ ...styles.valueGrid, gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)' }}>
            {ungrouped.map((f) => <ValueCell key={f.key} field={f} values={values} allFields={allFields} />)}
          </div>
        </div>
      )}
    </>
  );
}

// Humanize a dimension token: 'head_office' → 'Head Office'.
function humanizeToken(t) {
  if (!t) return '';
  return String(t).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---- MATRIX (read-only): rows × cols table; every cell computed via engine ----
function renderMatrix(section, fields, values, allFields, isMobile) {
  const rowOrder = {}; const colOrder = {}; const cellMap = {};
  for (const f of fields) {
    const r = f.dimension_row || f.dimensionRow;
    const c = f.dimension_col || f.dimensionCol;
    if (!r || !c) continue;
    const so = f.sort_order ?? 0;
    if (rowOrder[r] === undefined || so < rowOrder[r]) rowOrder[r] = so;
    if (colOrder[c] === undefined || so < colOrder[c]) colOrder[c] = so;
    cellMap[`${r}|${c}`] = f;
  }
  const rows = Object.keys(rowOrder).sort((a, b) => rowOrder[a] - rowOrder[b]);
  const cols = Object.keys(colOrder).sort((a, b) => colOrder[a] - colOrder[b]);
  return (
    <div style={styles.matrixScroll}>
      <table style={styles.matrixTable}>
        <thead>
          <tr>
            <th style={styles.matrixCorner} />
            {cols.map((c) => <th key={c} style={styles.matrixColHead}>{humanizeToken(c)}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r}>
              <td style={styles.matrixRowHead}>{humanizeToken(r)}</td>
              {cols.map((c) => {
                const f = cellMap[`${r}|${c}`];
                if (!f) return <td key={c} style={styles.matrixCell}>—</td>;
                const isComputed = f.source === 'computed';
                const v = isComputed ? computeFieldValue(f, values, allFields) : cell(f, values);
                return (
                  <td key={c} style={{ ...styles.matrixCell, ...(isComputed ? styles.matrixCellComputed : {}) }}>
                    {v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- HO/OP two-column table (group by dimension_row) ----
function renderHoOp(section, fields, values, isMobile) {
  const rows = {};
  for (const f of fields) {
    if (f.source === 'computed') continue;
    const r = f.dimension_row || f.dimensionRow || f.key;
    if (!rows[r]) rows[r] = { ho: null, op: null, label: f.label };
    const col = f.dimension_col || f.dimensionCol;
    if (col === 'ho') rows[r].ho = f;
    if (col === 'op') rows[r].op = f;
  }
  return (
    <>
      <div style={styles.hoOpHeader}>
        <div />
        <div style={styles.hoOpColHead}>HO</div>
        <div style={styles.hoOpColHead}>OP</div>
      </div>
      {Object.entries(rows).map(([rk, row]) => (
        <div key={rk} style={styles.hoOpRow}>
          <div style={styles.hoOpLabel}>{row.label}</div>
          <div style={styles.hoOpNum}>{row.ho ? cell(row.ho, values) : '—'}</div>
          <div style={styles.hoOpNum}>{row.op ? cell(row.op, values) : '—'}</div>
        </div>
      ))}
    </>
  );
}
function cell(field, values) {
  const v = values[field.key];
  return (v === undefined || v === null || v === '') ? '—' : formatValue(field, v);
}

// ---- Grid (services/labeled_grid): value grid + computed footer total ----
function renderGrid(section, fields, values, allFields, isMobile) {
  const manual = fields.filter((f) => f.source !== 'computed');
  const footer = fields.find((f) => f.source === 'computed' && !f.subsection);
  return (
    <>
      <div style={{ ...styles.valueGrid, gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)' }}>
        {manual.map((f) => <ValueCell key={f.key} field={f} values={values} allFields={allFields} />)}
      </div>
      {footer && (
        <div style={styles.snapFooter}>
          <div style={styles.snapFooterLabel}>{footer.label}</div>
          <div style={styles.snapFooterValue}>{computeFieldValue(footer, values, allFields)}</div>
        </div>
      )}
    </>
  );
}

// ---- One label→value cell (computed tinted, no CALC tag; target inline) ----
function ValueCell({ field, values, allFields }) {
  const isComputed = field.source === 'computed';
  const val = displayValue(field, values, allFields);
  const evaln = field.target ? evaluateTarget(field, values[field.key]) : null;
  const goldValue = isComputed || !!field.target;
  return (
    <div style={{ ...styles.valueCell, ...(isComputed ? styles.valueCellComputed : {}) }}>
      <div style={styles.cellRow}>
        <div style={styles.valueLabel}>{field.label}</div>
        <div style={{ ...styles.valueNum, ...(goldValue ? { color: '#F3C036' } : {}) }}>
          {val}{field.unit && val !== '—' ? <span style={styles.valueUnit}> {field.unit}</span> : null}
        </div>
      </div>
      {evaln && <TargetIndicator evaluation={evaln} />}
    </div>
  );
}


const styles = {
  heroUnit: { fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.5)' },
  snapSubsection: { marginBottom: 4 },
  snapSubLabel: {
    fontSize: 11, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.45)', margin: '18px 0 10px',
  },
  valueGrid: { display: 'grid', gap: 12, marginBottom: 4 },
  valueCell: {
    display: 'flex', flexDirection: 'column', gap: 0,
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10, padding: '12px 14px',
  },
  valueCellComputed: {
    background: 'rgba(243,192,54,0.06)', borderColor: 'rgba(243,192,54,0.18)',
  },
  cellRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  valueLabel: { fontSize: 13, color: 'rgba(255,255,255,0.75)' },
  valueNum: { fontSize: 16, fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums', textAlign: 'right' },
  valueUnit: { fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)' },
  snapFooter: {
    marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.1)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  snapFooterLabel: { fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)' },
  snapFooterValue: { fontSize: 22, fontWeight: 700, color: '#F3C036', fontVariantNumeric: 'tabular-nums' },

  canvas: {
    position: 'relative', zIndex: 5,
    maxWidth: 1200, margin: '24px auto 0',
    padding: '0 48px',
    animation: 'hrFadeInUp 0.5s 0.05s ease both',
  },
  canvasMobile: {
    padding: '0 14px',
  },

  selector: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.1)',
    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    // MICRO-FIX: backdropFilter creates a stacking context, so the Dropdown
    // panel's zIndex:1000 only competes INSIDE this bar. Later siblings
    // (hero KPI cards, also blurred stacking contexts) painted over the
    // open panel. Explicit zIndex lifts the whole bar above them.
    // Same family as Principle 6B.11 / the Phase 2A Data Entry fix.
    position: 'relative', zIndex: 30,
    borderRadius: 16,
    padding: '16px 20px',
    marginBottom: 22,
    display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
  },
  selectorLabel: {
    fontSize: 11, fontWeight: 700,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: '1.5px', textTransform: 'uppercase',
  },
  // ===== MOBILE variants (layout-only) =====
  selectorMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 10,
    padding: '14px 14px',
  },
  dropdownFill: {
    // grid item stretches the inline-block Dropdown root to full width
    display: 'grid',
    width: '100%',
  },
  publishedStampMobile: {
    marginLeft: 0,
  },
  servicesGridMobile: {
    gridTemplateColumns: '1fr 1fr',
  },
  publishedStamp: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontSize: 11, color: 'rgba(255,255,255,0.5)',
    marginLeft: 'auto',
  },
  publishedDot: {
    width: 6, height: 6, borderRadius: '50%', background: '#22c55e',
  },

  errorBanner: {
    padding: '14px 18px', marginBottom: 14,
    background: 'rgba(239,68,68,0.10)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 12,
    color: '#fca5a5', fontSize: 13,
  },

  emptyState: {
    padding: '60px 32px', textAlign: 'center',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16,
  },
  emptyTitle: {
    fontSize: 18, fontWeight: 600, color: 'rgba(255,255,255,0.85)',
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 13, color: 'rgba(255,255,255,0.5)',
    maxWidth: 500, margin: '0 auto', lineHeight: 1.6,
  },

  loading: {
    minHeight: 300,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  spinner: {
    width: 40, height: 40, border: '4px solid rgba(255,255,255,0.1)',
    borderTopColor: '#F3C036', borderRadius: '50%',
    animation: 'hrSnapSpin 0.8s linear infinite',
  },

  heroGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 16, marginBottom: 30,
  },
  heroKpi: {
    position: 'relative',
    background: 'rgba(255,255,255,0.04)',
    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: '20px 22px',
    overflow: 'hidden',
  },
  heroAccent: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: 3,
    background: 'linear-gradient(90deg, #F3C036, #ec4899, #a855f7)',
  },
  heroLabel: {
    fontSize: 11, fontWeight: 700,
    letterSpacing: '1px', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.55)',
  },
  heroValue: {
    fontSize: 38, fontWeight: 800,
    letterSpacing: '-1px', color: '#fff',
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.05, marginTop: 8,
  },
  heroSub: {
    fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: 500, marginTop: 6,
  },

  snapSection: {
    background: 'rgba(255,255,255,0.03)',
    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 18,
    padding: '22px 26px',
    marginBottom: 20,
    position: 'relative', overflow: 'hidden',
  },
  snapSectionMobile: {
    padding: '18px 14px',
  },
  snapAccent: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: 3,
    background: 'linear-gradient(90deg, #F3C036, #ec4899, #a855f7)',
    opacity: 0.7,
  },
  snapTitle: {
    fontSize: 18, fontWeight: 700, letterSpacing: '-0.2px',
    marginBottom: 4,
    display: 'flex', alignItems: 'center', gap: 10,
  },
  snapTitleAccent: {
    fontSize: 12, color: '#F3C036', fontWeight: 600,
    background: 'rgba(243,192,54,0.10)',
    padding: '2px 9px', borderRadius: 12,
    marginLeft: 6,
  },
  subSnapTitle: {
    fontSize: 11, fontWeight: 700,
    letterSpacing: '1.5px', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)', marginBottom: 10,
  },

  miniRow: {
    display: 'grid', gap: 12, marginBottom: 14,
  },
  miniKpi: {
    padding: '12px 14px',
    background: 'rgba(0,0,0,0.2)',
    border: '1px solid rgba(255,255,255,0.05)',
    borderRadius: 10,
  },
  miniLabel: {
    fontSize: 10, fontWeight: 700,
    letterSpacing: '1.2px', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.45)', marginBottom: 6,
  },
  miniValue: {
    fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px',
    color: '#fff', fontVariantNumeric: 'tabular-nums',
  },
  // POLISH: larger value size for the wide Compliance & HRDF cards.
  // Weight/format identical to miniValue — size only.
  miniValueLarge: {
    fontSize: 27,
  },
  miniValuePct: {
    fontSize: 12, fontWeight: 600,
    color: 'rgba(243,192,54,0.85)',
    marginLeft: 6,
  },

  // ---- B6/TA matrix (read-only) ----
  matrixScroll: { overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' },
  matrixTable: { borderCollapse: 'separate', borderSpacing: '8px 8px', minWidth: 'max-content' },
  matrixCorner: { background: 'transparent' },
  matrixColHead: {
    fontSize: 10, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.4)', textAlign: 'right', padding: '2px 14px',
  },
  matrixRowHead: {
    fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.8)',
    padding: '11px 14px', background: 'rgba(255,255,255,0.03)',
    borderRadius: 10, whiteSpace: 'nowrap',
  },
  matrixCell: {
    background: 'rgba(255,255,255,0.03)', borderRadius: 10,
    padding: '11px 16px', textAlign: 'right', fontSize: 14, fontWeight: 700,
    color: '#fff', fontVariantNumeric: 'tabular-nums', minWidth: 90,
  },
  matrixCellComputed: {
    background: 'rgba(243,192,54,0.06)', color: '#F3C036',
  },
  hoOpHeader: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: 12,
    padding: '0 14px 2px',
  },
  hoOpRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: 12,
    padding: '11px 14px',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: 10, marginBottom: 8, alignItems: 'center',
  },
  hoOpLabel: {
    fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.8)',
  },
  hoOpNum: {
    fontSize: 14, fontWeight: 700, color: '#fff',
    textAlign: 'right', fontVariantNumeric: 'tabular-nums',
  },
  hoOpPct: {
    color: 'rgba(243,192,54,0.7)', fontSize: 11, fontWeight: 600,
    marginLeft: 4,
  },
  hoOpColHead: {
    fontSize: 10, fontWeight: 700,
    letterSpacing: '1px', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.4)', textAlign: 'right',
  },

  servicesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 10,
  },
  snapService: {
    background: 'rgba(0,0,0,0.18)',
    border: '1px solid rgba(255,255,255,0.05)',
    borderRadius: 8,
    padding: '10px 12px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 10,
  },
  snapServiceLabel: {
    fontSize: 11.5, color: 'rgba(255,255,255,0.7)',
    fontWeight: 500, lineHeight: 1.3,
  },
  snapServiceValue: {
    fontSize: 15, fontWeight: 700, color: '#fff',
    fontVariantNumeric: 'tabular-nums', flexShrink: 0,
  },
};
