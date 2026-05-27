import React, { useEffect, useRef, useState } from 'react';

// =============================================
// Dropdown — shared custom dropdown component
// =============================================
// Rule 13 — built once, reused across Phase 2A (Year/Month),
// Phase 4 trends filters, Phase 5 compare selectors, Phase 6.5
// composite report selection, Phase 8 admin UI form fields.
//
// Native <select> in dark themes has a white-on-white bug across
// browsers (option element styling is not consistent). This is the
// project's canonical select replacement.
//
// Props:
//   label             string  — small label above the trigger ("Year", "Month")
//   value             string  — currently selected option `value`
//   options           array   — [{ value, label, disabled?, hint? }, ...]
//   onChange          (value) — called when user selects a new option
//   placeholder       string  — text when no value selected (defaults to '—')
//   width             number  — min-width of trigger in px (default 110)
//   ariaLabel         string  — accessibility label (defaults to label)
//
// Keyboard:
//   Click trigger to open. Click outside or Escape to close.
//   ArrowDown/ArrowUp navigate options. Enter selects. Home/End jumps.
// =============================================

export default function Dropdown({
  label,
  value,
  options = [],
  onChange,
  placeholder = '—',
  width = 110,
  ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(-1);
  const rootRef = useRef(null);
  const panelRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Reset focus index when opening
  useEffect(() => {
    if (open) {
      const selectedIdx = options.findIndex((o) => o.value === value && !o.disabled);
      setFocusIndex(selectedIdx >= 0 ? selectedIdx : firstEnabledIndex(options));
    } else {
      setFocusIndex(-1);
    }
  }, [open, options, value]);

  function firstEnabledIndex(list) {
    return list.findIndex((o) => !o.disabled);
  }

  function lastEnabledIndex(list) {
    for (let i = list.length - 1; i >= 0; i--) {
      if (!list[i].disabled) return i;
    }
    return -1;
  }

  function moveFocus(delta) {
    if (options.length === 0) return;
    let i = focusIndex;
    for (let step = 0; step < options.length; step++) {
      i = (i + delta + options.length) % options.length;
      if (!options[i].disabled) { setFocusIndex(i); return; }
    }
  }

  function onTriggerKey(e) {
    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveFocus(-1); }
    else if (e.key === 'Home') { e.preventDefault(); setFocusIndex(firstEnabledIndex(options)); }
    else if (e.key === 'End')  { e.preventDefault(); setFocusIndex(lastEnabledIndex(options)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = options[focusIndex];
      if (opt && !opt.disabled) {
        onChange && onChange(opt.value);
        setOpen(false);
      }
    }
  }

  const selected = options.find((o) => o.value === value);
  const displayText = selected ? selected.label : placeholder;

  return (
    <div
      className="dropdown"
      ref={rootRef}
      style={{ ...styles.root, ...(open ? styles.rootOpen : {}) }}
    >
      <button
        type="button"
        style={{
          ...styles.trigger,
          ...(open ? styles.triggerOpen : {}),
          minWidth: width,
        }}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel || label}
      >
        {label && <span style={styles.labelText}>{label}</span>}
        <span style={styles.valueText}>{displayText}</span>
        <svg
          width="12" height="12" fill="none" viewBox="0 0 24 24"
          stroke="currentColor" strokeWidth="2.5"
          style={{ ...styles.chevron, transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
        </svg>
      </button>

      {open && (
        <div
          ref={panelRef}
          style={styles.panel}
          role="listbox"
          aria-activedescendant={focusIndex >= 0 ? `dd-opt-${focusIndex}` : undefined}
        >
          {options.map((opt, i) => {
            const isSelected = opt.value === value;
            const isFocused = i === focusIndex;
            return (
              <div
                key={opt.value ?? `opt-${i}`}
                id={`dd-opt-${i}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={opt.disabled || undefined}
                onMouseEnter={() => !opt.disabled && setFocusIndex(i)}
                onClick={() => {
                  if (opt.disabled) return;
                  onChange && onChange(opt.value);
                  setOpen(false);
                }}
                style={{
                  ...styles.option,
                  ...(opt.disabled ? styles.optionDisabled : {}),
                  ...(isSelected && !opt.disabled ? styles.optionSelected : {}),
                  ...(isFocused && !opt.disabled && !isSelected ? styles.optionHover : {}),
                }}
              >
                <span>{opt.label}</span>
                {opt.disabled && opt.hint && (
                  <span style={styles.hintTag}>{opt.hint}</span>
                )}
                {isSelected && !opt.disabled && (
                  <span style={styles.check}>✓</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  root: {
    position: 'relative',
    display: 'inline-block',
    fontFamily: 'inherit',
  },
  rootOpen: {},
  trigger: {
    background: 'rgba(255,255,255,0.05)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.12)',
    padding: '9px 14px',
    borderRadius: 8,
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    transition: 'all 0.15s ease',
    letterSpacing: 0,
  },
  triggerOpen: {
    background: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(243,192,54,0.45)',
    boxShadow: '0 0 0 3px rgba(243,192,54,0.1)',
  },
  labelText: {
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: '1.3px',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.45)',
    marginRight: 2,
  },
  valueText: {
    flex: 1,
    textAlign: 'left',
  },
  chevron: {
    color: '#F3C036',
    transition: 'transform 0.18s ease',
    flexShrink: 0,
  },
  panel: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    zIndex: 50,
    minWidth: '100%',
    background: 'rgba(26,16,40,0.96)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10,
    padding: 6,
    boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
    maxHeight: 240,
    overflowY: 'auto',
  },
  option: {
    padding: '8px 12px',
    fontSize: 13,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.85)',
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'all 0.12s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    userSelect: 'none',
  },
  optionHover: {
    background: 'rgba(243,192,54,0.1)',
    color: '#F3C036',
  },
  optionSelected: {
    background: 'rgba(243,192,54,0.15)',
    color: '#F3C036',
    fontWeight: 600,
  },
  optionDisabled: {
    color: 'rgba(255,255,255,0.25)',
    cursor: 'not-allowed',
  },
  hintTag: {
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: '1px',
    color: 'rgba(255,255,255,0.3)',
    textTransform: 'uppercase',
    background: 'rgba(255,255,255,0.05)',
    padding: '2px 6px',
    borderRadius: 4,
  },
  check: {
    color: '#F3C036',
    fontWeight: 700,
  },
};
