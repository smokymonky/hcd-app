import React from 'react';

// =============================================
// TargetIndicator — inline status-aware target glyph
// =============================================
// Rule 13 / Principle 6B.10 (Optional Target Support):
//   Renders inline with parent metric — NEVER as a standalone card.
//   Hidden entirely when no evaluation is provided.
//
// Props:
//   evaluation — object from evaluateTarget() in hrOpsFields.js, OR null
//                Shape: { status: 'pass'|'soft-fail'|'hard-fail'|'info', message }
//   style      — optional inline-style overrides
//
// When evaluation is null/undefined, this component returns null —
// the parent metric renders cleanly with no indicator (Item 6 contract).
// =============================================

const VARIANTS = {
  pass: {
    color: '#86efac',
    glyphColor: '#22c55e',
    glyph: '✓',
  },
  'soft-fail': {
    color: '#fcd34d',
    glyphColor: '#f59e0b',
    glyph: '⚠',
  },
  'hard-fail': {
    color: '#fca5a5',
    glyphColor: '#ef4444',
    glyph: '✗',
  },
  info: {
    color: 'rgba(255,255,255,0.55)',
    glyphColor: 'rgba(255,255,255,0.55)',
    glyph: 'ⓘ',
  },
};

export default function TargetIndicator({ evaluation, style }) {
  if (!evaluation) return null;
  const v = VARIANTS[evaluation.status] || VARIANTS.info;
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.1px',
        marginTop: 6,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        lineHeight: 1.3,
        color: v.color,
        ...style,
      }}
    >
      <span
        style={{
          fontWeight: 700,
          fontSize: 11,
          lineHeight: 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 14,
          height: 14,
          color: v.glyphColor,
        }}
      >
        {v.glyph}
      </span>
      {evaluation.message}
    </div>
  );
}
