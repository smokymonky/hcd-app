import React from 'react';

// =============================================
// UserIdentityCard
// Shows: avatar (2-initial), name, role + function pills.
// Used in Hub top-strip.
//
// Two-initial logic (Slack/Gmail/Linear convention):
//   "Bahaa"             → "B"
//   "Mohammed Ali"      → "MA"
//   "HR Ops Test Head"  → "HH"  (first word + last word)
//   empty/null          → "?"
// =============================================

function getInitials(name) {
  if (!name || typeof name !== 'string') return '?';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
}

export default function UserIdentityCard({ user }) {
  if (!user) return null;
  const initials = getInitials(user.name);
  const role = user.role || '—';
  const fn = user.function || '—';

  return (
    <div style={styles.wrap}>
      <div style={styles.avatar}>{initials}</div>
      <div style={styles.info}>
        <div style={styles.name}>{user.name}</div>
        <div style={styles.pills}>
          <span style={styles.pill}>{role}</span>
          <span style={styles.sep}>·</span>
          <span style={{ ...styles.pill, ...styles.pillFn }}>{fn}</span>
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    padding: '8px 14px 8px 8px',
    borderRadius: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 8,
    background: 'linear-gradient(135deg, #F3C036, #ec4899)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#1a1028',
    fontWeight: 700,
    fontSize: 12.5,
    letterSpacing: '-0.4px',
  },
  info: { display: 'flex', flexDirection: 'column', gap: 4 },
  name: {
    fontSize: 14, fontWeight: 600, color: '#fff',
    lineHeight: 1.1, letterSpacing: '-0.1px',
  },
  pills: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontSize: 11, lineHeight: 1,
  },
  pill: {
    display: 'inline-block',
    padding: '2px 7px',
    background: 'rgba(255,255,255,0.06)',
    borderRadius: 4,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: 600,
  },
  pillFn: {
    background: 'rgba(243,192,54,0.15)',
    color: '#F3C036',
  },
  sep: { color: 'rgba(255,255,255,0.25)', fontSize: 10 },
};
