import React from 'react';

// =============================================
// StatusBadge — canonical workflow status badge
// =============================================
// Rule 13 / Principle 6B.6 (canonical color palette):
//   Empty/No submission   → neutral grey
//   Draft                 → blue
//   Submitted             → calm blue
//   Head reviewed         → calm blue (same as Submitted — still in flight)
//   Director reviewed     → calm blue
//   Rejected              → red
//   Approved              → gold (noteworthy, in-transition)
//   Published             → green (complete, verified)
//
// This component is shared across all dashboard modules. Future TA / L&D /
// HR Systems modules use the SAME StatusBadge — no module-specific colors.
//
// Props:
//   status   — backend status string OR 'empty' for no submission yet
//   label    — optional display override; defaults to a human-readable label
//   compact  — boolean; if true, removes the trailing label text (dot only)
// =============================================

// Map of status → { dotColor, bg, border, color, defaultLabel }
const PALETTE = {
  empty: {
    label: 'No submission yet',
    bg: 'rgba(255,255,255,0.05)',
    border: 'rgba(255,255,255,0.12)',
    color: 'rgba(255,255,255,0.65)',
    dot: 'rgba(255,255,255,0.4)',
    pulse: false,
  },
  draft: {
    label: 'Draft',
    bg: 'rgba(99,102,241,0.12)',
    border: 'rgba(99,102,241,0.35)',
    color: '#a5b4fc',
    dot: '#818cf8',
    pulse: true,
  },
  submitted: {
    label: 'Submitted — Pending Review',
    bg: 'rgba(243,192,54,0.12)',
    border: 'rgba(243,192,54,0.35)',
    color: '#F3C036',
    dot: '#F3C036',
    pulse: true,
  },
  head_reviewed: {
    label: 'Awaiting Director Review',
    bg: 'rgba(243,192,54,0.12)',
    border: 'rgba(243,192,54,0.35)',
    color: '#F3C036',
    dot: '#F3C036',
    pulse: true,
  },
  director_reviewed: {
    label: 'Awaiting Admin Review',
    bg: 'rgba(243,192,54,0.12)',
    border: 'rgba(243,192,54,0.35)',
    color: '#F3C036',
    dot: '#F3C036',
    pulse: true,
  },
  rejected: {
    label: 'Rejected — Returned for revision',
    bg: 'rgba(239,68,68,0.12)',
    border: 'rgba(239,68,68,0.35)',
    color: '#fca5a5',
    dot: '#ef4444',
    pulse: false,
  },
  approved: {
    label: 'Approved — Awaiting publish',
    bg: 'rgba(243,192,54,0.12)',
    border: 'rgba(243,192,54,0.4)',
    color: '#F3C036',
    dot: '#F3C036',
    pulse: false,
  },
  published: {
    label: 'Published',
    bg: 'rgba(34,197,94,0.15)',
    border: 'rgba(34,197,94,0.4)',
    color: '#86efac',
    dot: '#22c55e',
    pulse: false,
  },
};

export default function StatusBadge({ status, label, compact = false }) {
  const key = status && PALETTE[status] ? status : 'empty';
  const p = PALETTE[key];
  const displayLabel = label || p.label;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px 6px 10px',
        borderRadius: 18,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.3px',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        background: p.bg,
        border: `1px solid ${p.border}`,
        color: p.color,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: p.dot,
          animation: p.pulse ? 'sbPulse 2s ease-in-out infinite' : 'none',
        }}
      />
      {!compact && displayLabel}
      <style>{`
        @keyframes sbPulse { 0%,100% { opacity: 0.85; } 50% { opacity: 1; } }
      `}</style>
    </span>
  );
}
