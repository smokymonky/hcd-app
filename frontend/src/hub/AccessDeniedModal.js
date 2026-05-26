import React, { useEffect } from 'react';
import { ICON_PATHS } from '../../config/moduleConfig';

// =============================================
// AccessDeniedModal
// Generic module-agnostic access denied modal. Rule 13 #5.
// Works for any access decision: dashboards now, future modules
// later, future report categories, etc.
//
// Props:
//   open               boolean — controls visibility
//   onClose            () => void
//   moduleName         string — e.g. "Talent Acquisition"
//   moduleCode         string — e.g. "TA"
//   userFunction       string — e.g. "OP"
//   userFunctionNote   string — e.g. "auto-mapped to HR_OPS only"
//   requiredAccess     string | string[] — e.g. "viewer" or ["viewer","owner"]
//   onRequestAccess    optional () => void (renders Request Access button if provided)
// =============================================

export default function AccessDeniedModal({
  open,
  onClose,
  moduleName,
  moduleCode,
  userFunction,
  userFunctionNote,
  requiredAccess,
  onRequestAccess,
}) {
  // Close on Escape
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const reqList = Array.isArray(requiredAccess)
    ? requiredAccess
    : (requiredAccess ? [requiredAccess] : ['viewer']);

  // Backdrop click closes modal; modal click does not bubble
  const onBackdrop = () => onClose && onClose();
  const onModalClick = (e) => e.stopPropagation();

  return (
    <div style={styles.overlay} onClick={onBackdrop} role="dialog" aria-modal="true">
      <div style={styles.modal} onClick={onModalClick}>
        <div style={styles.accent} />
        <div style={styles.iconBox}>
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor"
               dangerouslySetInnerHTML={{ __html: ICON_PATHS.lock }} />
        </div>
        <h4 style={styles.h4}>Access required</h4>
        <p style={styles.desc}>
          You don&apos;t have access to the <strong>{moduleName}</strong> dashboard.
          Module access is granted by an admin based on your function.
        </p>
        <div style={styles.detail}>
          <div>
            <span style={styles.detailKey}>Module:</span>{' '}
            <span style={styles.detailVal}>{moduleCode}</span>
            {moduleName ? ` (${moduleName})` : null}
          </div>
          <div>
            <span style={styles.detailKey}>Your function:</span>{' '}
            <span style={styles.detailVal}>{userFunction || '—'}</span>
            {userFunctionNote ? ` (${userFunctionNote})` : null}
          </div>
          <div>
            <span style={styles.detailKey}>Required:</span>{' '}
            {reqList.map((r, i) => (
              <React.Fragment key={r}>
                <span style={styles.detailVal}>{r}</span>
                {i < reqList.length - 1 ? ' or ' : null}
              </React.Fragment>
            ))}
            {moduleCode ? ` on ${moduleCode}` : null}
          </div>
        </div>
        <div style={styles.actions}>
          <button type="button" style={{ ...styles.btn, ...styles.btnGhost }} onClick={onClose}>
            Close
          </button>
          {onRequestAccess && (
            <button type="button" style={{ ...styles.btn, ...styles.btnPrimary }} onClick={onRequestAccess}>
              Request access
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(14,8,32,0.7)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 20,
    zIndex: 1000,
    animation: 'fadeIn 0.3s ease',
  },
  modal: {
    background: 'rgba(26,16,40,0.95)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 16,
    padding: 32,
    maxWidth: 440,
    width: '100%',
    boxShadow: '0 20px 80px rgba(0,0,0,0.6)',
    position: 'relative',
    overflow: 'hidden',
    color: '#fff',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  accent: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: 3,
    background: 'linear-gradient(90deg, #F3C036, #ec4899, #a855f7)',
  },
  iconBox: {
    width: 56, height: 56, borderRadius: 14,
    background: 'rgba(239,68,68,0.12)',
    border: '1px solid rgba(239,68,68,0.25)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#ef4444',
    marginBottom: 20,
  },
  h4: {
    fontSize: 19, fontWeight: 700, marginBottom: 8,
    letterSpacing: '-0.3px',
  },
  desc: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13, lineHeight: 1.6,
    marginBottom: 18,
  },
  detail: {
    background: 'rgba(0,0,0,0.25)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 10,
    padding: '14px 16px',
    marginBottom: 22,
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 1.7,
  },
  detailKey: {
    color: 'rgba(255,255,255,0.45)',
    fontWeight: 600,
    display: 'inline-block',
    minWidth: 96,
  },
  detailVal: {
    color: '#F3C036',
    fontWeight: 600,
  },
  actions: {
    display: 'flex', gap: 10, justifyContent: 'flex-end',
  },
  btn: {
    padding: '10px 18px',
    borderRadius: 8,
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  btnGhost: {
    background: 'rgba(255,255,255,0.04)',
    color: 'rgba(255,255,255,0.7)',
    border: '1px solid rgba(255,255,255,0.1)',
  },
  btnPrimary: {
    background: 'linear-gradient(135deg, #ec4899 0%, #a855f7 100%)',
    color: '#fff',
    boxShadow: '0 4px 20px rgba(236,72,153,0.3)',
  },
};
