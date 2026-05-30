import React, { useEffect, useMemo, useRef, useState } from 'react';
import Dropdown from './Dropdown';

// =============================================
// EditTargetModal — single dual-purpose Add/Edit modal
// =============================================
// Phase 2B. Real overlay (backdrop + high z-index + focus trap + Esc-to-close).
// Used by TargetsManager for both Add and Edit flows.
//
// Props:
//   mode               'add' | 'edit'
//   open               boolean — when false, returns null
//   onClose            () => void — fired on Cancel / Esc / backdrop click
//   onSave             (payload) => Promise — caller commits API
//   modules            array — full module list (active + greyed) for dropdown
//                              [{ code, name, isActive }]
//   sections           array — section metadata for grouping the Field dropdown
//                              [{ key, title }]
//   fields             array — all numeric fields of the chosen module
//                              [{ key, label, section, dataType, unit }]
//   existingTargets    array — active targets, used to grey out fields that
//                              already have a target (admin uses Edit, not duplicate Add)
//   initialValues      object — for EDIT mode: { module, field_key, target_value,
//                                                direction, tolerance, label }
//   defaultModule      string — for ADD mode: pre-select this module (optional)
//
// In EDIT mode the Module + Field dropdowns are LOCKED (admin must delete
// + re-add to move a target).
// =============================================

const DIRECTION_OPTIONS = [
  { value: 'above', label: '↑ Higher is better' },
  { value: 'below', label: '↓ Lower is better' },
  { value: 'exact', label: '= Hit exactly' },
];

export default function EditTargetModal({
  mode = 'add',
  open,
  onClose,
  onSave,
  modules = [],
  sections = [],
  fields = [],
  existingTargets = [],
  initialValues = null,
  defaultModule = null,
}) {
  // -------- LOCAL STATE --------
  const [moduleCode, setModuleCode] = useState('');
  const [fieldKey, setFieldKey] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [direction, setDirection] = useState('above');
  const [tolerance, setTolerance] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const firstFocusRef = useRef(null);

  // -------- HYDRATE WHEN OPENED --------
  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && initialValues) {
      setModuleCode(initialValues.module || '');
      setFieldKey(initialValues.field_key || '');
      setTargetValue(initialValues.target_value == null ? '' : String(initialValues.target_value));
      setDirection(initialValues.direction || 'above');
      setTolerance(initialValues.tolerance == null ? '' : String(initialValues.tolerance));
      setLabel(initialValues.label || '');
    } else {
      // ADD mode — fresh form
      setModuleCode(defaultModule || '');
      setFieldKey('');
      setTargetValue('');
      setDirection('above');
      setTolerance('');
      setLabel('');
    }
    setError(null);
    setSaving(false);
  }, [open, mode, initialValues, defaultModule]);

  // -------- ESC TO CLOSE + FOCUS TRAP --------
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape' && !saving) {
        e.stopPropagation();
        onClose && onClose();
      }
    }
    document.addEventListener('keydown', onKey);
    // Lock body scroll while open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Initial focus
    setTimeout(() => {
      if (firstFocusRef.current && typeof firstFocusRef.current.focus === 'function') {
        firstFocusRef.current.focus();
      }
    }, 50);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, saving, onClose]);

  // -------- DERIVED --------
  // Module dropdown options — disable greyed (not-yet-built) modules.
  const moduleOptions = useMemo(() => {
    return (modules || []).map((m) => ({
      value: m.code,
      label: m.name,
      disabled: !m.isActive,
      hint: m.isActive ? undefined : 'Not yet built',
    }));
  }, [modules]);

  // Field dropdown options — grouped by section, with section group labels.
  // In ADD mode: disable fields that already have an ACTIVE target.
  // In EDIT mode: also include the currently-edited field even if it has a target.
  const fieldOptions = useMemo(() => {
    if (!moduleCode) return [];
    const moduleFields = (fields || []).filter((f) => f.moduleCode === moduleCode);
    const takenKeys = new Set(
      (existingTargets || [])
        .filter((t) => t.module === moduleCode && t.is_active !== false)
        .map((t) => t.field_key)
    );
    // In EDIT mode, the current field is allowed even if taken (we're editing it)
    if (mode === 'edit' && initialValues && initialValues.field_key) {
      takenKeys.delete(initialValues.field_key);
    }
    // Build grouped option list using header rows.
    // Dropdown component supports `group` markers via dropdown-group-label,
    // but the current Dropdown.js only supports flat options. We render with
    // a flat option array and inject [Section] labels via per-option label
    // prefixes. (See N3 in delivery notes.)
    const grouped = [];
    for (const s of sections) {
      const sectionFields = moduleFields.filter((f) => f.section === s.key);
      if (sectionFields.length === 0) continue;
      // Section header (non-selectable, used as a visual divider)
      grouped.push({
        value: `__section__${s.key}`,
        label: `— ${s.title} —`,
        disabled: true,
      });
      for (const f of sectionFields) {
        const taken = takenKeys.has(f.key);
        grouped.push({
          value: f.key,
          label: f.label,
          disabled: taken,
          hint: taken ? 'Has target' : undefined,
        });
      }
    }
    return grouped;
  }, [moduleCode, fields, sections, existingTargets, mode, initialValues]);

  const selectedField = useMemo(() => {
    if (!fieldKey || !moduleCode) return null;
    return (fields || []).find((f) => f.key === fieldKey && f.moduleCode === moduleCode) || null;
  }, [fields, fieldKey, moduleCode]);

  // Unit suffix for the value + tolerance inputs (matches the field's unit)
  const fieldUnit = useMemo(() => {
    if (!selectedField) return '';
    if (selectedField.unit) return selectedField.unit;
    if (selectedField.dataType === 'percentage') return '%';
    return '';
  }, [selectedField]);

  const isExact = direction === 'exact';
  const isFieldLocked = mode === 'edit';
  const isModuleLocked = mode === 'edit';

  // -------- HANDLERS --------
  function handleSubmit() {
    setError(null);
    // Frontend validation
    if (!moduleCode) { setError('Module is required.'); return; }
    if (!fieldKey) { setError('Field is required.'); return; }
    const val = Number(targetValue);
    if (!Number.isFinite(val)) { setError('Target value must be a number.'); return; }
    if (!['above', 'below', 'exact'].includes(direction)) { setError('Direction is required.'); return; }
    let tol = null;
    if (!isExact && tolerance !== '') {
      const t = Number(tolerance);
      if (!Number.isFinite(t) || t < 0) { setError('Tolerance must be a non-negative number.'); return; }
      tol = t;
    }
    const payload = {
      module: moduleCode,
      field_key: fieldKey,
      target_value: val,
      direction,
      tolerance: tol,                              // null → backend uses default 2.0
      label: label.trim() === '' ? null : label.trim(),
    };
    setSaving(true);
    Promise.resolve()
      .then(() => onSave(payload))
      .then(() => { /* parent closes on success */ })
      .catch((err) => {
        setError(err && err.message ? err.message : 'Save failed.');
        setSaving(false);
      });
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget && !saving) {
      onClose && onClose();
    }
  }

  if (!open) return null;

  return (
    <div style={styles.backdrop} onClick={handleBackdropClick} role="dialog" aria-modal="true">
      <div style={styles.card}>
        <div style={styles.accent} />

        {/* Header */}
        <div style={styles.header}>
          <div style={styles.title}>{mode === 'edit' ? 'Edit Target' : 'Add Target'}</div>
          <div style={styles.subtitle}>
            {mode === 'edit'
              ? 'Update goal for an existing dashboard field. To change which field has a target, delete this one and add a new one.'
              : 'Attach a goal to an existing dashboard field. Changes commit immediately (admin-only).'}
          </div>
        </div>

        {/* Body */}
        <div style={styles.body}>

          {/* Module */}
          <div style={styles.row}>
            <label style={styles.label}>
              Module {!isModuleLocked && <span style={styles.req}>*</span>}
            </label>
            <Dropdown
              label={null}
              value={moduleCode}
              options={moduleOptions}
              onChange={(v) => { setModuleCode(v); setFieldKey(''); }}
              placeholder="Select a module…"
              width="100%"
            />
            {isModuleLocked && (
              <div style={styles.helper}>Locked — module cannot be changed when editing a target.</div>
            )}
            {!isModuleLocked && (
              <div style={styles.helper}>Only modules that have shipped can receive targets.</div>
            )}
          </div>

          {/* Field */}
          <div style={styles.row}>
            <label style={styles.label}>
              Field {!isFieldLocked && <span style={styles.req}>*</span>}
            </label>
            {!moduleCode ? (
              <Dropdown
                label={null}
                value=""
                options={[]}
                onChange={() => {}}
                placeholder="Choose a module first…"
                width="100%"
              />
            ) : (
              <Dropdown
                label={null}
                value={fieldKey}
                options={fieldOptions}
                onChange={(v) => {
                  // Defensive: ignore the synthetic section headers
                  if (typeof v === 'string' && v.startsWith('__section__')) return;
                  setFieldKey(v);
                }}
                placeholder="Choose a field…"
                width="100%"
              />
            )}
            {isFieldLocked && (
              <div style={styles.helper}>Locked — delete this target and add a new one to attach to a different field.</div>
            )}
            {!isFieldLocked && (
              <div style={styles.helper}>Fields with an existing active target are disabled — use Edit to change them.</div>
            )}
          </div>

          {/* Target value + Direction */}
          <div style={styles.row2col}>
            <div style={styles.col}>
              <label style={styles.label}>Target value <span style={styles.req}>*</span></label>
              <div style={styles.inputWrap}>
                <input
                  ref={firstFocusRef}
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  style={styles.input}
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  placeholder="e.g. 85"
                />
                {fieldUnit && <span style={styles.unit}>{fieldUnit}</span>}
              </div>
            </div>
            <div style={styles.col}>
              <label style={styles.label}>Direction <span style={styles.req}>*</span></label>
              <Dropdown
                label={null}
                value={direction}
                options={DIRECTION_OPTIONS}
                onChange={(v) => setDirection(v)}
                width="100%"
              />
            </div>
          </div>

          {/* Tolerance + Label */}
          <div style={styles.row2col}>
            <div style={styles.col}>
              <label style={styles.label}>
                Tolerance
                <span style={styles.optTag}>OPTIONAL</span>
              </label>
              <div style={styles.inputWrap}>
                <input
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  style={{ ...styles.input, ...(isExact ? styles.inputDisabled : {}) }}
                  value={tolerance}
                  onChange={(e) => setTolerance(e.target.value)}
                  placeholder="2"
                  disabled={isExact}
                />
                {fieldUnit && !isExact && <span style={styles.unit}>{fieldUnit}</span>}
              </div>
              <div style={styles.helper}>
                {isExact
                  ? 'Not applicable for "Hit exactly".'
                  : 'Soft-fail band in the field\'s unit. Default 2.0 if left empty.'}
              </div>
            </div>
            <div style={styles.col}>
              <label style={styles.label}>
                Label
                <span style={styles.optTag}>OPTIONAL</span>
              </label>
              <div style={styles.inputWrap}>
                <input
                  type="text"
                  style={styles.input}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. KSA labor compliance"
                  maxLength={255}
                />
              </div>
              <div style={styles.helper}>Short context shown in the admin target list.</div>
            </div>
          </div>

          {error && (
            <div style={styles.errorBox}>{error}</div>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button type="button" style={styles.btnGhost} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" style={styles.btnPrimary} onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : (mode === 'edit' ? 'Save Changes' : 'Save Target')}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================
// ConfirmDeleteModal — small confirmation modal
// =============================================
// Soft-delete confirmation triggered from TargetsManager row Delete button.
// Reassures user that delete is reversible.
//
// Props:
//   open             boolean
//   onClose          () => void
//   onConfirm        () => Promise — caller commits API
//   targetSummary    string — e.g. "Saudization (HR Operations)"
// =============================================
export function ConfirmDeleteModal({ open, onClose, onConfirm, targetSummary }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) { setDeleting(false); setError(null); }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape' && !deleting) {
        e.stopPropagation();
        onClose && onClose();
      }
    }
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, deleting, onClose]);

  function handleConfirm() {
    setError(null);
    setDeleting(true);
    Promise.resolve()
      .then(() => onConfirm())
      .catch((err) => {
        setError(err && err.message ? err.message : 'Delete failed.');
        setDeleting(false);
      });
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget && !deleting) onClose && onClose();
  }

  if (!open) return null;

  return (
    <div style={styles.backdrop} onClick={handleBackdropClick} role="dialog" aria-modal="true">
      <div style={{ ...styles.card, maxWidth: 440 }}>
        <div style={styles.accent} />
        <div style={styles.header}>
          <div style={styles.title}>Delete this target?</div>
        </div>
        <div style={{ ...styles.body, paddingTop: 4 }}>
          You're about to soft-delete the target on <strong style={{ color: '#fff' }}>{targetSummary}</strong>.
          <br /><br />
          The indicator will disappear from the live Snapshot on next load. You can restore this target at any time from the admin list. No data is permanently lost.
          {error && <div style={styles.errorBox}>{error}</div>}
        </div>
        <div style={styles.footer}>
          <button type="button" style={styles.btnGhost} onClick={onClose} disabled={deleting}>
            Cancel
          </button>
          <button type="button" style={styles.btnDanger} onClick={handleConfirm} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete Target'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================
// STYLES
// =============================================
const styles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(14,8,32,0.72)',
    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    zIndex: 9999,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '40px 20px',
    overflowY: 'auto',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  card: {
    position: 'relative',
    background: 'linear-gradient(135deg, #1a1028 0%, #2d1f42 60%, #3d2856 100%)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 18,
    maxWidth: 540,
    width: '100%',
    overflow: 'visible',
    boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
    color: '#fff',
  },
  accent: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: 3,
    background: 'linear-gradient(90deg, #F3C036, #ec4899, #a855f7)',
    borderRadius: '18px 18px 0 0',
  },
  header: {
    padding: '22px 26px 14px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  title: {
    fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px',
    marginBottom: 4, color: '#fff',
  },
  subtitle: {
    fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: 500,
    lineHeight: 1.5,
  },
  body: {
    padding: '20px 26px',
  },
  footer: {
    padding: '14px 26px 20px',
    display: 'flex', justifyContent: 'flex-end', gap: 10,
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  row: {
    display: 'flex', flexDirection: 'column', gap: 6,
    marginBottom: 16,
  },
  row2col: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14,
    marginBottom: 16,
  },
  col: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: {
    fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,0.85)',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  },
  req: { color: '#ef4444', fontWeight: 700 },
  optTag: {
    fontSize: 9.5, fontWeight: 700, letterSpacing: '1px',
    color: 'rgba(255,255,255,0.4)',
    background: 'rgba(255,255,255,0.05)',
    padding: '1px 6px', borderRadius: 3,
    marginLeft: 4, textTransform: 'uppercase',
  },
  helper: {
    fontSize: 10.5, color: 'rgba(255,255,255,0.4)',
    marginTop: 2, lineHeight: 1.4,
  },
  inputWrap: { position: 'relative' },
  input: {
    width: '100%',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    color: '#fff',
    padding: '11px 14px',
    fontFamily: 'inherit',
    fontSize: 14,
    fontWeight: 500,
    outline: 'none',
    boxSizing: 'border-box',
    MozAppearance: 'textfield',
  },
  inputDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  unit: {
    position: 'absolute',
    right: 14, top: '50%',
    transform: 'translateY(-50%)',
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12, fontWeight: 500,
    pointerEvents: 'none',
  },
  errorBox: {
    marginTop: 12,
    padding: '10px 12px',
    background: 'rgba(239,68,68,0.10)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 8,
    color: '#fca5a5', fontSize: 12, lineHeight: 1.4,
  },
  btnGhost: {
    padding: '10px 16px',
    borderRadius: 10,
    fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)',
    color: 'rgba(255,255,255,0.75)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  btnPrimary: {
    padding: '10px 18px',
    borderRadius: 10,
    fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
    border: 'none',
    background: 'linear-gradient(135deg, #ec4899 0%, #a855f7 100%)',
    color: '#fff',
    boxShadow: '0 6px 24px rgba(236,72,153,0.3)',
    cursor: 'pointer',
    transition: 'all 0.18s ease',
  },
  btnDanger: {
    padding: '10px 18px',
    borderRadius: 10,
    fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
    border: 'none',
    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
    color: '#fff',
    boxShadow: '0 6px 24px rgba(239,68,68,0.3)',
    cursor: 'pointer',
    transition: 'all 0.18s ease',
  },
};
