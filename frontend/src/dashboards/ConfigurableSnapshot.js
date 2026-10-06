import React, { useEffect, useMemo, useState } from 'react';
import { resolveComputedValues } from '../engine/computers';
import { renderBlock, GRADIENT_DEFS } from '../engine/snapshotComponents';

// =============================================
// ConfigurableSnapshot — renders a layout config against resolved values
// =============================================
// SNAPSHOT DESIGNER (Y-1). Props { config, values } (same interface as the
// bespoke snapshots, so a host/ModulePage can pass them). Walks the layout
// tree rows → columns (12-col grid) → blocks, dispatching each block to the
// component registry. Content-only (no page header). Responsive: columns
// stack full-width on mobile (≤768). resolveComputedValues runs once so
// computed / ratio / list binds all resolve. Unknown component → a small
// placeholder (never a crash).
// =============================================

export default function ConfigurableSnapshot({ config, values }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Flat active field list → resolver + per-field formatting lookups.
  const allFields = useMemo(() => {
    const out = [];
    for (const s of ((config && config.sections) || [])) {
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
    () => resolveComputedValues(allFields, values || {}, allFields),
    [allFields, values]
  );

  const rows = (config && Array.isArray(config.rows)) ? config.rows : [];

  if (rows.length === 0) {
    return <div style={S.empty}>This snapshot has no layout yet.</div>;
  }

  return (
    <div style={S.wrap}>
      {/* gradient defs (once) so ring_gauge / donut strokes resolve */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true"><defs>
        {GRADIENT_DEFS.map((g) => (
          <linearGradient key={g.id} id={g.id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={g.stops[0]} />
            <stop offset="1" stopColor={g.stops[1]} />
          </linearGradient>
        ))}
      </defs></svg>

      {rows.map((row, ri) => {
        const cols = Array.isArray(row.columns) ? row.columns : [];
        return (
          <div
            key={row.id || ri}
            style={{
              ...S.row,
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(12, 1fr)',
            }}
          >
            {cols.map((col, ci) => {
              const width = Math.max(1, Math.min(12, Number(col.width) || 12));
              const blocks = Array.isArray(col.blocks) ? col.blocks : [];
              return (
                <div
                  key={col.id || ci}
                  style={{
                    ...S.col,
                    gridColumn: isMobile ? '1 / -1' : `span ${width}`,
                  }}
                >
                  {blocks.map((block, bi) => (
                    <div key={block.id || bi} style={S.block}>
                      {renderBlock(block, resolved, fieldByKey)}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

const S = {
  wrap: { maxWidth: 1100, margin: '0 auto', padding: '4px 0 40px', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", color: '#fff' },
  row: { display: 'grid', gap: 16, marginBottom: 16, alignItems: 'stretch' },
  col: { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 },
  block: {},
  empty: { maxWidth: 600, margin: '48px auto', padding: '20px 24px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.75)' },
};
