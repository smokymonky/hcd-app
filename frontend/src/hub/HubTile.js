import React, { useState } from 'react';
import { ICON_PATHS } from '../config/moduleConfig';

// =============================================
// HubTile
// Config-driven tile. Renders from a tile object — never has
// module-specific logic. Rule 13 #2.
//
// Props:
//   tile          tile config object (id, type, title, description, iconKey,...)
//   locked        boolean — render as inaccessible (lock badge + dim)
//   onClick       called with (tile) when tile is clicked
//   compact       boolean — slightly tighter spacing for dense grids (unused in Phase 1)
// =============================================

export default function HubTile({ tile, locked = false, onClick }) {
  const [hover, setHover] = useState(false);

  const iconPath = ICON_PATHS[tile.iconKey] || ICON_PATHS.dashboards;

  const handleClick = (e) => {
    e.preventDefault();
    if (onClick) onClick(tile);
  };

  const tileStyle = {
    ...styles.tile,
    ...(hover && !locked ? styles.tileHover : {}),
    ...(locked ? styles.tileDisabled : {}),
    ...(hover && locked ? styles.tileDisabledHover : {}),
  };

  const accentStyle = {
    ...styles.accent,
    ...(locked ? styles.accentLocked : {}),
  };

  const iconBoxStyle = {
    ...styles.iconBox,
    ...(locked ? styles.iconBoxLocked : {}),
  };

  return (
    <a
      href={tile.route || '#'}
      onClick={handleClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={tileStyle}
      aria-disabled={locked || undefined}
      role="button"
      tabIndex={0}
    >
      <div style={accentStyle} />
      {locked && (
        <div style={styles.lockBadge} aria-label="Access required">
          <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor"
               dangerouslySetInnerHTML={{ __html: ICON_PATHS.lock }} />
        </div>
      )}
      <div style={iconBoxStyle}>
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"
             dangerouslySetInnerHTML={{ __html: iconPath }} />
      </div>
      <div style={styles.title}>{tile.title}</div>
      {tile.description && <div style={styles.desc}>{tile.description}</div>}
    </a>
  );
}

const styles = {
  tile: {
    position: 'relative',
    background: 'rgba(255,255,255,0.03)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16,
    overflow: 'hidden',
    cursor: 'pointer',
    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    textDecoration: 'none',
    color: 'inherit',
    display: 'block',
    padding: '24px 24px 22px',
    minHeight: 132,
  },
  tileHover: {
    transform: 'translateY(-4px)',
    borderColor: 'rgba(255,255,255,0.18)',
    boxShadow: '0 16px 50px rgba(0,0,0,0.4), 0 0 30px rgba(243,192,54,0.08)',
  },
  tileDisabled: {
    cursor: 'not-allowed',
    opacity: 0.55,
  },
  tileDisabledHover: {
    opacity: 0.7,
  },
  accent: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 3,
    background: 'linear-gradient(90deg, #F3C036, #ec4899, #a855f7)',
    transition: 'opacity 0.25s ease',
  },
  accentLocked: {
    background: 'linear-gradient(90deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05))',
  },
  lockBadge: {
    position: 'absolute',
    top: 14, right: 14,
    width: 22, height: 22,
    background: 'rgba(0,0,0,0.3)',
    borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'rgba(255,255,255,0.55)',
    border: '1px solid rgba(255,255,255,0.1)',
  },
  iconBox: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 32, height: 32,
    background: 'rgba(243,192,54,0.12)',
    borderRadius: 8,
    color: '#F3C036',
    marginBottom: 14,
  },
  iconBoxLocked: {
    background: 'rgba(255,255,255,0.04)',
    color: 'rgba(255,255,255,0.4)',
  },
  title: {
    fontSize: 17,
    fontWeight: 700,
    letterSpacing: '-0.3px',
    marginBottom: 6,
  },
  desc: {
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 1.5,
  },
};
