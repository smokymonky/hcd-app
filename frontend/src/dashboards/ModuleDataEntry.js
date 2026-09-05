import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  computeFieldValue,
  formatValue,
  buildYearOptions,
  buildMonthOptions,
} from '../engine/computers';
import { dashboardsAPI, structureAPI } from '../services/api';
import Dropdown from './Dropdown';

// =============================================
// ModuleDataEntry — Module Engine generic data-entry renderer
// =============================================
// MODULE ENGINE — Step 2b-2.
//
// Draws a data-entry form from a MODULE CONFIG (e.g. hrOpsConfig) instead
// of a module-specific FIELDS/SECTIONS pair. Reproduces the live
// HROpsDataEntry behavior generically: same load → values/lastSaved,
// same period selector, same section/subsection render, same HO/OP
// paired rows, same computed cells + footer total, same target helper,
// same send-changed-only save + submit-gate + beforeunload + period-switch
// + negative-value guards, same isMobile layout.
//
// PREVIEW ONLY (Step 2b-2). Wired at /hub/dashboards/:moduleCode/entry-v2.
// It reuses the SAME submission + save endpoints as the live entry, so a
// change here writes to the same (module, year, month) submission — that
// shared data is what makes side-by-side parity checkable. The live
// HROpsDataEntry is untouched.
//
// SCOPE: everything EXCEPT the labeled_grid type. The services section
// renders as plain number fields for now (labeled_grid is Step 2b-3).
//
// CONFIG RENDER-HINT GAPS (noted, not invented — the 2b-1 canonical
// config intentionally dropped these live render hints; the preview uses
// sensible defaults and does NOT fabricate live-divergent behavior):
//   - section header-total pills (live: headerTotalCompute/headerTotalKey)
//     → OMITTED in preview (summing would diverge from live's specific
//     expressions). Footer totals (services) ARE reproduced.
//   - per-section header icons (live: section.iconPath) → generic icon.
//   - per-subsection display labels (live: hardcoded map) → humanized key.
//   - field helper text / required marks → omitted (not needed for preview).
// These are cosmetic; field keys, types, computed values, footer totals,
// the target helper, save, and guards all match live exactly.
// =============================================

export default function ModuleDataEntry({ config, user, year, month, onStatusChange, onPeriodChange, canEditStructure = false, editMode = false, onStructureChanged, onStructurePatch }) {
  // Flatten config → a FIELDS-like list (adds engine-friendly accessors).
  const FIELDS = useMemo(() => flattenConfigFields(config), [config]);
  const ALL_SECTIONS = useMemo(() => (config.sections || []).slice().sort((a, b) => ((a.order ?? a.sort_order ?? 0) - (b.order ?? b.sort_order ?? 0))), [config]);
  // Active sections render as the dashboard; hidden ones only appear in the
  // edit-mode "Show hidden" list.
  const SECTIONS = useMemo(() => ALL_SECTIONS.filter((s) => s.is_active !== false), [ALL_SECTIONS]);
  const HIDDEN_SECTIONS = useMemo(() => ALL_SECTIONS.filter((s) => s.is_active === false), [ALL_SECTIONS]);
  // B4 — reference choices for the formula picker.
  const pickerSections = useMemo(() => sectionChoices(config), [config]);
  const numericFields = useMemo(() => numericFieldChoices(config, null), [config]);

  const canEdit = canEditStructure && editMode;
  const code = config.code;

  // ---- B3b-1 section-edit UI state ----
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [newSectionLayout, setNewSectionLayout] = useState('kpi');
  const [renamingSectionId, setRenamingSectionId] = useState(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [confirmDeleteSection, setConfirmDeleteSection] = useState(null); // { id, title } | null
  const [structureMsg, setStructureMsg] = useState(null);

  // ---- B3b-2 field-edit UI state ----
  const [addFieldOpenFor, setAddFieldOpenFor] = useState(null); // section.id | null
  const [newFieldLabel, setNewFieldLabel] = useState({}); // { [sectionId]: string }
  const [newFieldType, setNewFieldType] = useState({});   // { [sectionId]: type }
  const [newFieldUnit, setNewFieldUnit] = useState({});   // { [sectionId]: string }
  // B4 — calculated-field draft for the Add form (one add form open at a time).
  const [addCalc, setAddCalc] = useState({ formula_type: '', formula_args: {}, displayType: 'number' });
  const [editingField, setEditingField] = useState(null); // the field row being edited | null
  const [editFieldForm, setEditFieldForm] = useState({ label: '', type: 'number', unit: '' });
  const [showHiddenFieldsFor, setShowHiddenFieldsFor] = useState({}); // { [sectionKey]: bool }
  const [confirmDeleteField, setConfirmDeleteField] = useState(null); // { id, label, sectionKey } | null

  const [submission, setSubmission] = useState(null);
  const [values, setValues] = useState({});
  const [lastSaved, setLastSaved] = useState({});
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [expandedSections, setExpandedSections] = useState(
    () => Object.fromEntries((config.sections || []).map((s) => [s.key, true]))
  );

  const status = submission?.status || 'empty';
  const isReadOnly = isStatusReadOnly(status);
  const isRejected = status === 'rejected';

  // ---------- LOAD (same as live, config.code driven) ----------
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessage(null);

    dashboardsAPI.listSubmissions(config.code, { year })
      .then((rows) => {
        if (cancelled) return;
        const match = (rows || []).find((r) => r.month === month && r.year === year);
        if (!match) {
          setSubmission(null);
          setValues({});
          setLastSaved({});
          setHistory([]);
          if (onStatusChange) onStatusChange('empty');
          return;
        }
        return dashboardsAPI.getSubmission(match.id);
      })
      .then((detail) => {
        if (cancelled || !detail) return;
        const { submission: sub, data, history: hx } = detail;
        setSubmission(sub);
        const v = {};
        (data || []).forEach((row) => { v[row.field_key] = row.value ?? ''; });
        setValues(v);
        setLastSaved(v);
        setHistory(hx || []);
        if (onStatusChange) onStatusChange(sub.status);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[ModuleDataEntry] load failed:', err);
        setMessage({ type: 'error', text: `Could not load submission: ${err.message || 'unknown error'}` });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [config.code, year, month, onStatusChange]);

  const hasUnsavedChanges = useMemo(() => valuesDiffer(values, lastSaved), [values, lastSaved]);

  // beforeunload guard (same as live)
  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    function onBeforeUnload(e) { e.preventDefault(); e.returnValue = ''; return ''; }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsavedChanges]);

  const latestRejection = useMemo(() => {
    if (!isRejected) return null;
    return (history || []).find((h) =>
      h.to_state === 'rejected' || h.action === 'admin_rejected' || h.action === 'rejected'
    );
  }, [history, isRejected]);

  // ---------- HANDLERS ----------
  function handleFieldChange(fieldKey, raw) {
    if (isReadOnly) return;
    setValues((prev) => ({ ...prev, [fieldKey]: raw }));
  }

  function toggleSection(sectionKey) {
    setExpandedSections((prev) => ({ ...prev, [sectionKey]: !prev[sectionKey] }));
  }

  // ---- B3b section-edit handlers (OPTIMISTIC) ----
  // Instant local update → one background structureAPI call → revert on error.
  // NOTE: this delivery (B3b-2) converts the section handlers to the optimistic
  // pattern AND adds the field handlers below, so both behave identically.
  //
  // patchSections(updater) mutates the preview-owned config.sections in place
  // (single source the renderer reads). Falls back to onStructureChanged only
  // if the patch callback wasn't provided (never in production).
  function patchSections(updater) {
    if (typeof onStructurePatch === 'function') {
      onStructurePatch(updater);
    } else if (typeof onStructureChanged === 'function') {
      onStructureChanged();
    }
  }

  const isTempId = (id) => typeof id === 'string' && id.startsWith('tmp_');

  // Fire an API call in the background. On error, revert to the snapshot and
  // show an error. UI already reflects the optimistic change before this runs.
  function fireBackground(apiCall, prevSections, errMsg, onSuccess) {
    Promise.resolve()
      .then(apiCall)
      .then((result) => { if (onSuccess) onSuccess(result); })
      .catch((err) => {
        console.error('[ModuleDataEntry] structure op failed (reverting):', err);
        patchSections(() => prevSections);   // snapshot-and-restore
        setStructureMsg({ type: 'error', text: `${errMsg}: ${err.message || 'unknown error'}` });
      });
  }

  // ===== SECTION handlers (optimistic) =====
  function handleAddSection() {
    const title = newSectionTitle.trim();
    if (!title) { setStructureMsg({ type: 'error', text: 'Section title cannot be empty.' }); return; }
    const layout = newSectionLayout;
    const prevSections = (config.sections || []).slice();
    const tempId = `tmp_${Date.now()}`;
    const maxOrder = prevSections.reduce((m, s) => Math.max(m, s.sort_order ?? 0), 0);

    setStructureMsg(null);
    patchSections((secs) => [...secs, {
      id: tempId, key: tempId, title, layout,
      sort_order: maxOrder + 1, is_active: true, fields: [], _pending: true,
    }]);
    setNewSectionTitle('');
    setNewSectionLayout('kpi');
    setAddSectionOpen(false);

    fireBackground(
      () => structureAPI.createSection(code, { title, layout }),
      prevSections,
      'Could not add section',
      (row) => patchSections((secs) => secs.map((s) => (s.id === tempId ? { ...row, fields: [] } : s)))
    );
  }

  function handleRenameSection(id) {
    if (isTempId(id)) { setStructureMsg({ type: 'error', text: 'Still saving that section — try again in a moment.' }); return; }
    const title = renameTitle.trim();
    if (!title) { setStructureMsg({ type: 'error', text: 'Section title cannot be empty.' }); return; }
    const prevSections = (config.sections || []).slice();

    setStructureMsg(null);
    patchSections((secs) => secs.map((s) => (s.id === id ? { ...s, title } : s)));
    setRenamingSectionId(null);
    setRenameTitle('');

    fireBackground(
      () => structureAPI.updateSection(code, id, { title }),
      prevSections,
      'Could not rename section'
    );
  }

  function handleReorderSection(index, dir) {
    const target = index + dir;
    if (target < 0 || target >= SECTIONS.length) return;
    const ids = SECTIONS.map((s) => s.id);
    if (ids.some(isTempId)) { setStructureMsg({ type: 'error', text: 'A section is still saving — try again in a moment.' }); return; }
    const [moved] = ids.splice(index, 1);
    ids.splice(target, 0, moved);
    const prevSections = (config.sections || []).slice();

    setStructureMsg(null);
    patchSections((secs) => {
      const orderByIds = new Map(ids.map((sid, i) => [sid, i + 1]));
      return secs
        .map((s) => (orderByIds.has(s.id) ? { ...s, sort_order: orderByIds.get(s.id) } : s))
        .slice()
        .sort((a, b) => ((a.sort_order ?? 0) - (b.sort_order ?? 0)));
    });

    fireBackground(
      () => structureAPI.reorderSections(code, ids),
      prevSections,
      'Could not reorder sections'
    );
  }

  function handleDeleteSectionConfirmed() {
    const targetRow = confirmDeleteSection;
    setConfirmDeleteSection(null);
    if (!targetRow) return;
    if (isTempId(targetRow.id)) { setStructureMsg({ type: 'error', text: 'Still saving that section — try again in a moment.' }); return; }
    const prevSections = (config.sections || []).slice();

    setStructureMsg(null);
    patchSections((secs) => secs.map((s) => (s.id === targetRow.id ? { ...s, is_active: false } : s)));

    fireBackground(
      () => structureAPI.deleteSection(code, targetRow.id),
      prevSections,
      'Could not hide section'
    );
  }

  function handleRestoreSection(id) {
    if (isTempId(id)) return;
    const prevSections = (config.sections || []).slice();

    setStructureMsg(null);
    patchSections((secs) => secs.map((s) => (s.id === id ? { ...s, is_active: true } : s)));

    fireBackground(
      () => structureAPI.restoreSection(code, id),
      prevSections,
      'Could not restore section'
    );
  }

  // ===== FIELD handlers (B3b-2, optimistic) =====
  // Patch a single section's fields array by section key.
  function patchSectionFields(sectionKey, fieldUpdater) {
    patchSections((secs) => secs.map((s) => (
      s.key === sectionKey ? { ...s, fields: fieldUpdater(s.fields || []) } : s
    )));
  }

  function handleAddField(section) {
    const label = (newFieldLabel[section.id] || '').trim();
    if (!label) { setStructureMsg({ type: 'error', text: 'Field label cannot be empty.' }); return; }
    if (isTempId(section.id)) { setStructureMsg({ type: 'error', text: 'That section is still saving — try again in a moment.' }); return; }
    const sel = newFieldType[section.id] || 'number';
    const isCalc = sel === 'calculated';
    const unit = (newFieldUnit[section.id] || '').trim() || null;
    const prevSections = (config.sections || []).slice();
    const tempId = `tmp_${Date.now()}`;
    const sectionFields = (section.fields || []);
    const maxOrder = sectionFields.reduce((m, f) => Math.max(m, f.sort_order ?? 0), 0);

    // B4 — calculated field: validate the curated formula before anything.
    let displayType = sel;
    let formula_type = null;
    let formula_args = null;
    let source = 'manual';
    if (isCalc) {
      const err = validateFormula(addCalc.formula_type, addCalc.formula_args);
      if (err) { setStructureMsg({ type: 'error', text: err }); return; }
      source = 'computed';
      formula_type = addCalc.formula_type;
      formula_args = addCalc.formula_args;
      displayType = addCalc.displayType || defaultDisplayType(formula_type);
    }

    setStructureMsg(null);
    patchSectionFields(section.key, (fields) => [...fields, {
      id: tempId, key: tempId, label, type: displayType, unit,
      section: section.key, source,
      formula_type, formula_args, dimension: null,
      dimension_row: null, dimension_col: null, subsection: null,
      sort_order: maxOrder + 10, is_active: true, _pending: true,
    }]);
    // Reset that section's add-field form.
    setNewFieldLabel((m) => ({ ...m, [section.id]: '' }));
    setNewFieldType((m) => ({ ...m, [section.id]: 'number' }));
    setNewFieldUnit((m) => ({ ...m, [section.id]: '' }));
    setAddCalc({ formula_type: '', formula_args: {}, displayType: 'number' });
    setAddFieldOpenFor(null);

    const payload = isCalc
      ? { label, type: displayType, unit, source: 'computed', formula_type, formula_args }
      : { label, type: displayType, unit };

    fireBackground(
      () => structureAPI.createField(code, section.id, payload),
      prevSections,
      'Could not add field',
      (row) => patchSectionFields(section.key, (fields) => fields.map((f) => (
        f.id === tempId ? { ...row, section: section.key } : f
      )))
    );
  }

  function handleSaveFieldEdit() {
    const f = editingField;
    if (!f) return;
    if (isTempId(f.id)) { setStructureMsg({ type: 'error', text: 'Still saving that field — try again in a moment.' }); return; }
    const label = (editFieldForm.label || '').trim();
    if (!label) { setStructureMsg({ type: 'error', text: 'Field label cannot be empty.' }); return; }
    const unit = (editFieldForm.unit || '').trim() || null;
    const prevSections = (config.sections || []).slice();
    const isCalc = editFieldForm.type === 'calculated';

    let payload;
    let localPatch;
    if (isCalc) {
      // B4 — computed field: validate + send source/formula. This UNLOCKS what
      // B3b-2 kept read-only. Display type stored in editFieldForm.displayType.
      const err = validateFormula(editFieldForm.formula_type, editFieldForm.formula_args);
      if (err) { setStructureMsg({ type: 'error', text: err }); return; }
      const displayType = editFieldForm.displayType || defaultDisplayType(editFieldForm.formula_type);
      payload = {
        label, type: displayType, unit, source: 'computed',
        formula_type: editFieldForm.formula_type, formula_args: editFieldForm.formula_args,
      };
      localPatch = { label, type: displayType, unit, source: 'computed', formula_type: editFieldForm.formula_type, formula_args: editFieldForm.formula_args };
    } else {
      // Simple field. If it WAS computed, null out the formula on the switch.
      const type = editFieldForm.type || f.type;
      payload = { label, type, unit, source: 'manual', formula_type: null, formula_args: null };
      localPatch = { label, type, unit, source: 'manual', formula_type: null, formula_args: null };
    }

    setStructureMsg(null);
    patchSectionFields(f.section, (fields) => fields.map((x) => (
      x.id === f.id ? { ...x, ...localPatch } : x
    )));
    setEditingField(null);

    fireBackground(
      () => structureAPI.updateField(code, f.id, payload),
      prevSections,
      'Could not update field'
    );
  }

  function handleReorderField(section, index, dir) {
    const fields = (section.fields || []).filter((f) => f.is_active !== false);
    const target = index + dir;
    if (target < 0 || target >= fields.length) return;
    const ids = fields.map((f) => f.id);
    if (ids.some(isTempId)) { setStructureMsg({ type: 'error', text: 'A field is still saving — try again in a moment.' }); return; }
    const [moved] = ids.splice(index, 1);
    ids.splice(target, 0, moved);
    const prevSections = (config.sections || []).slice();

    setStructureMsg(null);
    patchSectionFields(section.key, (allFields) => {
      const orderByIds = new Map(ids.map((fid, i) => [fid, (i + 1) * 10]));
      return allFields
        .map((f) => (orderByIds.has(f.id) ? { ...f, sort_order: orderByIds.get(f.id) } : f))
        .slice()
        .sort((a, b) => ((a.sort_order ?? 0) - (b.sort_order ?? 0)));
    });

    fireBackground(
      () => structureAPI.reorderFields(code, ids),
      prevSections,
      'Could not reorder fields'
    );
  }

  function handleDeleteFieldConfirmed() {
    const target = confirmDeleteField; // { id, label, sectionKey }
    setConfirmDeleteField(null);
    if (!target) return;
    if (isTempId(target.id)) { setStructureMsg({ type: 'error', text: 'Still saving that field — try again in a moment.' }); return; }
    const prevSections = (config.sections || []).slice();

    setStructureMsg(null);
    patchSectionFields(target.sectionKey, (fields) => fields.map((f) => (
      f.id === target.id ? { ...f, is_active: false } : f
    )));

    fireBackground(
      () => structureAPI.deleteField(code, target.id),
      prevSections,
      'Could not hide field'
    );
  }

  function handleRestoreField(sectionKey, id) {
    if (isTempId(id)) return;
    const prevSections = (config.sections || []).slice();

    setStructureMsg(null);
    patchSectionFields(sectionKey, (fields) => fields.map((f) => (
      f.id === id ? { ...f, is_active: true } : f
    )));

    fireBackground(
      () => structureAPI.restoreField(code, id),
      prevSections,
      'Could not restore field'
    );
  }

  // Negative-value guard (same as live, config-driven)
  function findNegativeValues() {
    const offenders = [];
    for (const f of FIELDS) {
      if (f.source === 'computed') continue;
      const raw = values[f.key];
      if (raw === undefined || raw === null || raw === '') continue;
      const n = Number(raw);
      if (Number.isFinite(n) && n < 0) {
        const dim = f.dimensionCol ? ` (${String(f.dimensionCol).toUpperCase()})` : '';
        offenders.push(`${f.label}${dim}: value cannot be negative`);
      }
    }
    return offenders;
  }

  async function handleSaveDraft() {
    const negatives = findNegativeValues();
    if (negatives.length > 0) {
      setMessage({ type: 'error', text: `Cannot save — ${negatives.join(' · ')}` });
      return false;
    }
    // send-changed-only (diff vs lastSaved) — identical to live
    const changed = FIELDS
      .filter((f) => f.source !== 'computed')
      .filter((f) => {
        const cur = values[f.key];
        const prev = lastSaved[f.key];
        const sc = cur === undefined || cur === null ? '' : String(cur);
        const sp = prev === undefined || prev === null ? '' : String(prev);
        return sc !== sp;
      })
      .map((f) => ({
        section: f.section,
        field_key: f.key,
        value: values[f.key] === undefined || values[f.key] === '' ? null : String(values[f.key]),
      }));

    if (changed.length === 0) {
      setMessage({ type: 'info', text: 'No changes to save.' });
      return true;
    }

    setSaving(true);
    setMessage(null);
    try {
      const resp = await dashboardsAPI.saveSubmission(config.code, { year, month, data: changed });
      const sub = resp.submission;
      setSubmission(sub);
      const v = {};
      (resp.data || []).forEach((row) => { v[row.field_key] = row.value ?? ''; });
      setValues(v);
      setLastSaved(v);
      const detail = await dashboardsAPI.getSubmission(sub.id);
      setHistory(detail.history || []);
      if (onStatusChange) onStatusChange(sub.status);
      setMessage({ type: 'success', text: resp.created ? 'Draft created.' : 'Draft saved.' });
      return true;
    } catch (err) {
      console.error('[ModuleDataEntry] save failed:', err);
      setMessage({ type: 'error', text: `Save failed: ${err.message || 'unknown error'}` });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    if (!submission || !submission.id) {
      setMessage({ type: 'error', text: 'Save a draft first before submitting for review.' });
      return;
    }
    const negatives = findNegativeValues();
    if (negatives.length > 0) {
      setMessage({ type: 'error', text: `Cannot submit — ${negatives.join(' · ')}` });
      return;
    }
    if (hasUnsavedChanges) {
      const ok = await handleSaveDraft();
      if (!ok) return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const resp = await dashboardsAPI.submitSubmission(submission.id);
      const sub = resp.submission;
      setSubmission(sub);
      const detail = await dashboardsAPI.getSubmission(sub.id);
      setHistory(detail.history || []);
      if (onStatusChange) onStatusChange(sub.status);
      setMessage({ type: 'success', text: 'Submitted for review.' });
    } catch (err) {
      console.error('[ModuleDataEntry] submit failed:', err);
      setMessage({ type: 'error', text: `Submit failed: ${err.message || 'unknown error'}` });
    } finally {
      setSubmitting(false);
    }
  }

  // ---------- RENDER ----------
  if (loading) {
    return (
      <div style={styles.loading}>
        <div style={styles.spinner} />
        <style>{`@keyframes hrSpin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const yearOptions = buildYearOptions();
  const monthOptions = buildMonthOptions();

  function handlePeriodChange(nextYear, nextMonth) {
    if (hasUnsavedChanges) {
      const proceed = window.confirm('You have unsaved changes. Switch period and lose them?');
      if (!proceed) return;
    }
    if (typeof onPeriodChange === 'function') {
      onPeriodChange(Number(nextYear), Number(nextMonth));
    }
  }

  return (
    <div style={{ ...styles.canvas, ...(isMobile ? styles.canvasMobile : {}) }}>
      <div style={{ ...styles.periodSelector, ...(isMobile ? styles.periodSelectorMobile : {}) }}>
        <span style={styles.periodSelectorLabel}>ENTERING</span>
        {isMobile ? (
          <>
            <div style={styles.dropdownFill}>
              <Dropdown label="Year" value={String(year)} options={yearOptions} onChange={(v) => handlePeriodChange(v, month)} width="100%" />
            </div>
            <div style={styles.dropdownFill}>
              <Dropdown label="Month" value={String(month)} options={monthOptions} onChange={(v) => handlePeriodChange(year, v)} width="100%" />
            </div>
          </>
        ) : (
          <>
            <Dropdown label="Year" value={String(year)} options={yearOptions} onChange={(v) => handlePeriodChange(v, month)} width={120} />
            <Dropdown label="Month" value={String(month)} options={monthOptions} onChange={(v) => handlePeriodChange(year, v)} width={150} />
          </>
        )}
        <span style={styles.previewBadge}>PREVIEW · engine v2</span>
      </div>

      {renderStatusBanner(status, latestRejection)}

      {message && (
        <div style={message.type === 'error' ? styles.alertError : styles.alertSuccess}>
          {message.text}
        </div>
      )}

      {/* B3b-1 — section-edit toolbar (admin edit mode only) */}
      {canEdit && (
        <div style={styles.editToolbar}>
          <div style={styles.editToolbarRow}>
            {!addSectionOpen ? (
              <button type="button" style={styles.addSectionBtn} onClick={() => setAddSectionOpen(true)}>
                + Add Section
              </button>
            ) : (
              <div style={styles.addSectionForm} onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  autoFocus
                  placeholder="Section title"
                  value={newSectionTitle}
                  onChange={(e) => setNewSectionTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddSection(); if (e.key === 'Escape') setAddSectionOpen(false); }}
                  style={styles.addSectionInput}
                />
                <select value={newSectionLayout} onChange={(e) => setNewSectionLayout(e.target.value)} style={styles.addSectionSelect}>
                  <option style={OPT} value="kpi">kpi</option>
                  <option style={OPT} value="ho_op">ho_op</option>
                  <option style={OPT} value="labeled_grid">labeled_grid</option>
                  <option style={OPT} value="matrix">matrix</option>
                  <option style={OPT} value="group">group</option>
                </select>
                <button type="button" style={styles.miniSave} onClick={handleAddSection}>Add</button>
                <button type="button" style={styles.miniCancel} onClick={() => { setAddSectionOpen(false); setNewSectionTitle(''); }}>Cancel</button>
              </div>
            )}
            <button type="button" style={{ ...styles.showHiddenBtn, ...(showHidden ? styles.showHiddenOn : {}) }} onClick={() => setShowHidden((v) => !v)}>
              {showHidden ? 'Hide hidden sections' : `Show hidden sections${HIDDEN_SECTIONS.length ? ` (${HIDDEN_SECTIONS.length})` : ''}`}
            </button>
          </div>
          {structureMsg && (
            <div style={structureMsg.type === 'error' ? styles.alertError : styles.alertSuccess}>
              {structureMsg.text}
            </div>
          )}
          {showHidden && (
            <div style={styles.hiddenList}>
              {HIDDEN_SECTIONS.length === 0 ? (
                <div style={styles.hiddenEmpty}>No hidden sections.</div>
              ) : HIDDEN_SECTIONS.map((s) => (
                <div key={s.id} style={styles.hiddenRow}>
                  <span style={styles.hiddenName}>{s.title} <span style={styles.hiddenKey}>{s.key}</span></span>
                  <button type="button" style={styles.restoreBtn} onClick={() => handleRestoreSection(s.id)}>Restore</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {SECTIONS.map((section, sectionIndex) => {
        const expanded = expandedSections[section.key] !== false;
        const fields = FIELDS.filter((f) => f.section === section.key && f.is_active !== false);
        const filledCount = countFilledManual(fields, values);
        const totalManual = fields.filter((f) => f.source !== 'computed').length;
        const isRenaming = renamingSectionId === section.id;

        return (
          <div key={section.key} style={{ ...styles.section, ...(expanded ? {} : styles.sectionCollapsed) }}>
            <div style={styles.sectionAccent} />
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggleSection(section.key)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSection(section.key); } }}
              style={{ ...styles.sectionHeader, ...(expanded ? styles.sectionHeaderExpanded : {}) }}
            >
              <div style={styles.sectionHeaderLeft}>
                <div style={styles.sectionIcon}>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                       dangerouslySetInnerHTML={{ __html: config.icon || GENERIC_SECTION_ICON }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isRenaming ? (
                    <div style={styles.renameRow} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        autoFocus
                        value={renameTitle}
                        onChange={(e) => setRenameTitle(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSection(section.id); if (e.key === 'Escape') { setRenamingSectionId(null); } }}
                        style={styles.renameInput}
                      />
                      <button type="button" style={styles.miniSave} onClick={() => handleRenameSection(section.id)}>Save</button>
                      <button type="button" style={styles.miniCancel} onClick={() => setRenamingSectionId(null)}>Cancel</button>
                    </div>
                  ) : (
                    <div style={styles.sectionTitle}>
                      {section.title}
                      {isTempId(section.id) && <span style={styles.savingHint}>saving…</span>}
                    </div>
                  )}
                  <div style={styles.sectionMeta}>
                    <span style={styles.progressMini}>
                      <span style={styles.progressBar}>
                        <span style={{ ...styles.progressBarFill, width: totalManual === 0 ? '0%' : `${(filledCount / totalManual) * 100}%` }} />
                      </span>
                      {filledCount}/{totalManual} fields
                    </span>
                  </div>
                </div>
              </div>
              {canEdit && !isRenaming && (
                <div style={styles.sectionEditControls} onClick={(e) => e.stopPropagation()}>
                  <button type="button" title="Move up" style={styles.editIconBtn} disabled={isTempId(section.id) || sectionIndex === 0} onClick={() => handleReorderSection(sectionIndex, -1)}>↑</button>
                  <button type="button" title="Move down" style={styles.editIconBtn} disabled={isTempId(section.id) || sectionIndex === SECTIONS.length - 1} onClick={() => handleReorderSection(sectionIndex, 1)}>↓</button>
                  <button type="button" title="Rename" style={styles.editIconBtn} disabled={isTempId(section.id)} onClick={() => { setRenamingSectionId(section.id); setRenameTitle(section.title); }}>✎</button>
                  <button type="button" title="Hide section" style={{ ...styles.editIconBtn, ...styles.editIconDanger }} disabled={isTempId(section.id)} onClick={() => setConfirmDeleteSection({ id: section.id, title: section.title })}>🗑</button>
                </div>
              )}
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
                style={{ color: 'rgba(255,255,255,0.5)', flexShrink: 0, transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.25s ease' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
              </svg>
            </div>

            {expanded && (
              <div style={{ ...styles.sectionBody, ...(isMobile ? styles.sectionBodyMobile : {}) }}>
                {section.layout === 'ho_op'
                  ? renderDimensionGrid(section, fields, values, handleFieldChange, isReadOnly, isMobile)
                  : (section.layout === 'grid' || section.layout === 'labeled_grid')
                    ? renderServicesGrid(fields, values, handleFieldChange, isReadOnly, isMobile)
                    : renderSubsectionedGrid(fields, values, handleFieldChange, isReadOnly, isMobile)
                }
                {renderSectionFooter(section, fields, values)}

                {/* B3b-2 — field-edit controls (admin edit mode only) */}
                {canEdit && !isTempId(section.id) && (
                  <div style={styles.fieldEditZone}>
                    {/* per-field controls (active fields) */}
                    <div style={styles.fieldEditList}>
                      {fields.map((f, fieldIndex) => (
                        <div key={f.id} style={styles.fieldEditRow}>
                          <span style={styles.fieldEditName}>
                            {f.label}
                            {f.dimension_col ? <span style={styles.fieldEditTag}>{String(f.dimension_col).toUpperCase()}</span> : null}
                            {f.source === 'computed' ? <span style={styles.fieldEditComputedTag}>computed</span> : null}
                            {isTempId(f.id) && <span style={styles.savingHint}>saving…</span>}
                          </span>
                          <span style={styles.fieldEditControls}>
                            <button type="button" title="Move up" style={styles.editIconBtn} disabled={isTempId(f.id) || fieldIndex === 0} onClick={() => handleReorderField(section, fieldIndex, -1)}>↑</button>
                            <button type="button" title="Move down" style={styles.editIconBtn} disabled={isTempId(f.id) || fieldIndex === fields.length - 1} onClick={() => handleReorderField(section, fieldIndex, 1)}>↓</button>
                            <button type="button" title="Edit" style={styles.editIconBtn} disabled={isTempId(f.id)} onClick={() => {
                              setEditingField(f);
                              const isComp = f.source === 'computed';
                              setEditFieldForm({
                                label: f.label,
                                type: isComp ? 'calculated' : f.type,
                                displayType: isComp ? (f.type || defaultDisplayType(f.formula_type)) : f.type,
                                unit: f.unit || '',
                                formula_type: f.formula_type || '',
                                formula_args: f.formula_args || {},
                              });
                            }}>✎</button>
                            <button type="button" title="Hide field" style={{ ...styles.editIconBtn, ...styles.editIconDanger }} disabled={isTempId(f.id)} onClick={() => setConfirmDeleteField({ id: f.id, label: f.label, sectionKey: section.key })}>🗑</button>
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* + Add Field */}
                    {addFieldOpenFor === section.id ? (
                      <div style={styles.addFieldFormWrap} onClick={(e) => e.stopPropagation()}>
                        <div style={styles.addFieldForm}>
                          <input
                            type="text"
                            autoFocus
                            placeholder="Field label"
                            value={newFieldLabel[section.id] || ''}
                            onChange={(e) => setNewFieldLabel((m) => ({ ...m, [section.id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter' && (newFieldType[section.id] || 'number') !== 'calculated') handleAddField(section); if (e.key === 'Escape') setAddFieldOpenFor(null); }}
                            style={styles.addFieldInput}
                          />
                          <select value={newFieldType[section.id] || 'number'} onChange={(e) => setNewFieldType((m) => ({ ...m, [section.id]: e.target.value }))} style={styles.addFieldSelect}>
                            <option style={OPT} value="number">number</option>
                            <option style={OPT} value="percentage">percentage</option>
                            <option style={OPT} value="currency">currency</option>
                            <option style={OPT} value="text">text</option>
                            <option style={OPT} value="longtext">longtext</option>
                            <option style={OPT} value="ratio">ratio</option>
                            <option style={OPT} value="calculated">Calculated…</option>
                          </select>
                          {(newFieldType[section.id] || 'number') !== 'calculated' && (
                            <input
                              type="text"
                              placeholder="unit (opt)"
                              value={newFieldUnit[section.id] || ''}
                              onChange={(e) => setNewFieldUnit((m) => ({ ...m, [section.id]: e.target.value }))}
                              style={styles.addFieldUnit}
                            />
                          )}
                          <button type="button" style={styles.miniSave} onClick={() => handleAddField(section)}>Add</button>
                          <button type="button" style={styles.miniCancel} onClick={() => { setAddFieldOpenFor(null); setAddCalc({ formula_type: '', formula_args: {}, displayType: 'number' }); }}>Cancel</button>
                        </div>
                        {(newFieldType[section.id] || 'number') === 'calculated' && (
                          <div style={styles.calcBox}>
                            <FormulaPicker
                              formulaType={addCalc.formula_type}
                              formulaArgs={addCalc.formula_args}
                              numericFields={numericFields}
                              sections={pickerSections}
                              onChange={(ft, args) => setAddCalc((c) => ({ ...c, formula_type: ft, formula_args: args, displayType: c.displayTypeTouched ? c.displayType : defaultDisplayType(ft) }))}
                            />
                            <label style={styles.fieldEditLabel}>Display as</label>
                            <select
                              value={addCalc.displayType}
                              onChange={(e) => setAddCalc((c) => ({ ...c, displayType: e.target.value, displayTypeTouched: true }))}
                              style={styles.modalInput}
                            >
                              <option style={OPT} value="percentage">percentage</option>
                              <option style={OPT} value="number">number</option>
                              <option style={OPT} value="currency">currency</option>
                            </select>
                            <input
                              type="text"
                              placeholder="unit (opt, e.g. %, SR)"
                              value={newFieldUnit[section.id] || ''}
                              onChange={(e) => setNewFieldUnit((m) => ({ ...m, [section.id]: e.target.value }))}
                              style={{ ...styles.modalInput, marginTop: 8 }}
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      <button type="button" style={styles.addFieldBtn} onClick={() => { setAddFieldOpenFor(section.id); setAddCalc({ formula_type: '', formula_args: {}, displayType: 'number' }); }}>+ Add Field</button>
                    )}

                    {/* Show hidden fields */}
                    {(() => {
                      const hiddenFields = (section.fields || []).filter((f) => f.is_active === false);
                      const shown = !!showHiddenFieldsFor[section.key];
                      return (
                        <>
                          <button
                            type="button"
                            style={styles.showHiddenFieldsBtn}
                            onClick={() => setShowHiddenFieldsFor((m) => ({ ...m, [section.key]: !shown }))}
                          >
                            {shown ? 'Hide hidden fields' : `Show hidden fields${hiddenFields.length ? ` (${hiddenFields.length})` : ''}`}
                          </button>
                          {shown && (
                            <div style={styles.hiddenList}>
                              {hiddenFields.length === 0 ? (
                                <div style={styles.hiddenEmpty}>No hidden fields.</div>
                              ) : hiddenFields.map((f) => (
                                <div key={f.id} style={styles.hiddenRow}>
                                  <span style={styles.hiddenName}>{f.label} <span style={styles.hiddenKey}>{f.key}</span></span>
                                  <button type="button" style={styles.restoreBtn} onClick={() => handleRestoreField(section.key, f.id)}>Restore</button>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div style={{ ...styles.formActions, ...(isMobile ? styles.formActionsMobile : {}) }}>
        <div style={styles.saveState}>
          {hasUnsavedChanges && !isReadOnly ? (
            <><span style={styles.dotUnsaved}>•</span>Unsaved changes</>
          ) : isReadOnly ? (
            <>Locked while under review.</>
          ) : submission && submission.updated_at ? (
            <><span style={styles.dotSaved} />All changes saved</>
          ) : (
            <>No draft saved yet</>
          )}
        </div>
        {!isReadOnly && (
          <div style={{ ...styles.actionsRight, ...(isMobile ? styles.actionsRightMobile : {}) }}>
            <button type="button" style={{ ...styles.btnGhost, ...(isMobile ? styles.btnGhostMobile : {}) }} onClick={handleSaveDraft} disabled={saving || submitting}>
              {saving ? 'Saving…' : 'Save Draft'}
            </button>
            <button type="button" style={{ ...styles.btnPrimary, ...(isMobile ? styles.btnPrimaryMobile : {}) }} onClick={handleSubmit} disabled={submitting || saving || !submission} title={!submission ? 'Save a draft first' : ''}>
              {submitting ? 'Submitting…' : (isRejected ? 'Re-submit for Review →' : 'Submit for Review →')}
            </button>
          </div>
        )}
      </div>

      {/* B3b-1 — confirm hide-section modal (portal, Principle 6B.11) */}
      <ConfirmModal
        open={!!confirmDeleteSection}
        title="Hide this section?"
        body={confirmDeleteSection
          ? `"${confirmDeleteSection.title}" and its fields will be hidden. Its data is preserved and you can restore it from "Show hidden sections".`
          : ''}
        confirmLabel="Hide section"
        busy={false}
        onCancel={() => setConfirmDeleteSection(null)}
        onConfirm={handleDeleteSectionConfirmed}
      />

      {/* B3b-2 — confirm hide-field modal */}
      <ConfirmModal
        open={!!confirmDeleteField}
        title="Hide this field?"
        body={confirmDeleteField
          ? `"${confirmDeleteField.label}" will be hidden. Its data is preserved and you can restore it from "Show hidden fields".`
          : ''}
        confirmLabel="Hide field"
        busy={false}
        onCancel={() => setConfirmDeleteField(null)}
        onConfirm={handleDeleteFieldConfirmed}
      />

      {/* B3b-2 — edit-field modal (label + type + unit; formula/HO-OP read-only) */}
      <FieldEditModal
        field={editingField}
        form={editFieldForm}
        setForm={setEditFieldForm}
        numericFields={numericFieldChoices(config, editingField?.key)}
        sections={pickerSections}
        onCancel={() => setEditingField(null)}
        onSave={handleSaveFieldEdit}
      />
    </div>
  );
}

// =============================================
// FieldEditModal — B4. Edits label + type + unit, and for Calculated fields
// exposes the editable curated FORMULA PICKER (unlocks what B3b-2 kept
// read-only). HO/OP dimension editing is still deferred (shown read-only).
// The type dropdown includes 'calculated'; picking it reveals the picker +
// a display-type selector. Simple↔computed switches send the right source +
// formula fields (computed→simple nulls formula_type/args).
// =============================================
function FieldEditModal({ field, form, setForm, numericFields, sections, onCancel, onSave }) {
  useEffect(() => {
    if (!field) return undefined;
    function onKey(e) { if (e.key === 'Escape') onCancel && onCancel(); }
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [field, onCancel]);

  if (!field) return null;
  const isHoOp = field.dimension === 'ho_op';
  const isCalc = form.type === 'calculated';

  return createPortal(
    <div
      style={styles.modalBackdrop}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel && onCancel(); }}
      role="dialog"
      aria-modal="true"
    >
      <div style={{ ...styles.modalCard, maxWidth: 460 }}>
        <div style={{ ...styles.modalAccent, background: 'linear-gradient(90deg, #F3C036, #ec4899, #a855f7)' }} />
        <div style={styles.modalHeader}>
          <div style={styles.modalTitle}>Edit field</div>
          <button type="button" aria-label="Close" style={styles.modalClose} onClick={onCancel}>✕</button>
        </div>
        <div style={styles.modalBody}>
          <label style={styles.fieldEditLabel}>Label</label>
          <input
            type="text"
            autoFocus
            value={form.label}
            onChange={(e) => setForm((s) => ({ ...s, label: e.target.value }))}
            style={styles.modalInput}
          />
          <label style={styles.fieldEditLabel}>Type</label>
          <select
            value={form.type}
            onChange={(e) => {
              const v = e.target.value;
              setForm((s) => {
                if (v === 'calculated') {
                  const ft = s.formula_type || '';
                  return { ...s, type: 'calculated', displayType: s.displayType || (ft ? defaultDisplayType(ft) : 'percentage') };
                }
                return { ...s, type: v };
              });
            }}
            style={styles.modalInput}
          >
            <option style={OPT} value="number">number</option>
            <option style={OPT} value="percentage">percentage</option>
            <option style={OPT} value="currency">currency</option>
            <option style={OPT} value="text">text</option>
            <option style={OPT} value="longtext">longtext</option>
            <option style={OPT} value="ratio">ratio</option>
            <option style={OPT} value="calculated">Calculated…</option>
          </select>

          {isCalc && (
            <div style={styles.calcBox}>
              {isHoOp && (
                <div style={styles.fieldLockNote}>
                  This is an HO/OP field. Editing the HO/OP dimension comes later; the formula below still applies.
                </div>
              )}
              <FormulaPicker
                formulaType={form.formula_type}
                formulaArgs={form.formula_args}
                numericFields={numericFields}
                sections={sections}
                onChange={(ft, args) => setForm((s) => ({
                  ...s,
                  formula_type: ft,
                  formula_args: args,
                  displayType: s.displayTypeTouched ? s.displayType : defaultDisplayType(ft),
                }))}
              />
              <label style={styles.fieldEditLabel}>Display as</label>
              <select
                value={form.displayType || 'percentage'}
                onChange={(e) => setForm((s) => ({ ...s, displayType: e.target.value, displayTypeTouched: true }))}
                style={styles.modalInput}
              >
                <option style={OPT} value="percentage">percentage</option>
                <option style={OPT} value="number">number</option>
                <option style={OPT} value="currency">currency</option>
              </select>
            </div>
          )}

          <label style={styles.fieldEditLabel}>Unit (optional)</label>
          <input
            type="text"
            value={form.unit}
            onChange={(e) => setForm((s) => ({ ...s, unit: e.target.value }))}
            placeholder="e.g. %, SR, days"
            style={styles.modalInput}
          />
        </div>
        <div style={styles.modalFooter}>
          <button type="button" style={styles.btnGhost} onClick={onCancel}>Cancel</button>
          <button type="button" style={styles.miniSaveLarge} onClick={onSave}>Save</button>
        </div>
      </div>
    </div>,
    document.body
  );
}


// =============================================
// ConfirmModal — portal + Esc + backdrop-click (Principle 6B.11)
// =============================================
function ConfirmModal({ open, title, body, confirmLabel, busy, onCancel, onConfirm }) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) { if (e.key === 'Escape' && !busy) onCancel && onCancel(); }
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, busy, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      style={styles.modalBackdrop}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel && onCancel(); }}
      role="dialog"
      aria-modal="true"
    >
      <div style={styles.modalCard}>
        <div style={styles.modalAccent} />
        <div style={styles.modalHeader}>
          <div style={styles.modalTitle}>{title}</div>
          <button type="button" aria-label="Close" style={styles.modalClose} disabled={busy} onClick={onCancel}>✕</button>
        </div>
        <div style={styles.modalBody}>{body}</div>
        <div style={styles.modalFooter}>
          <button type="button" style={styles.btnGhost} onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" style={styles.modalDangerBtn} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// =============================================
// Helpers
// =============================================
const GENERIC_SECTION_ICON = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>';

// Shared <option> style so open dropdown lists are readable (dark bg + light
// text) instead of the browser-default white-on-light. Applied to every
// native <select> option in the builder UI. Styling only.
const OPT = { backgroundColor: '#2d1f42', color: '#ffffff' };

// =============================================
// B4 — computed / calculator field helpers + picker
// =============================================
const B4_NUMERIC_TYPES = ['number', 'percentage', 'currency'];

// Active numeric fields across the module (for formula reference pickers),
// excluding a given key (a computed field can't reference itself).
function numericFieldChoices(config, excludeKey) {
  const out = [];
  for (const s of (config.sections || [])) {
    if (s.is_active === false) continue;
    for (const f of (s.fields || [])) {
      if (f.is_active === false) continue;
      if (!B4_NUMERIC_TYPES.includes(f.type)) continue;
      if (excludeKey && f.key === excludeKey) continue;
      out.push({ key: f.key, label: f.label });
    }
  }
  return out;
}

function sectionChoices(config) {
  return (config.sections || [])
    .filter((s) => s.is_active !== false)
    .map((s) => ({ key: s.key, title: s.title }));
}

// Sensible default display type for a formula.
function defaultDisplayType(ft) {
  return (ft === 'percent_of' || ft === 'avg') ? 'percentage' : 'number';
}

// Validate a curated formula; returns an error string or null.
function validateFormula(ft, args) {
  const a = args || {};
  if (ft === 'sum') return a.section ? null : 'Choose a section to total.';
  if (ft === 'percent_of') {
    if (!a.numerator) return 'Choose the part field.';
    if (!Array.isArray(a.over) || a.over.length < 1) return 'Choose at least one field for the total.';
    return null;
  }
  if (ft === 'avg') {
    if (!Array.isArray(a.over) || a.over.length < 1) return 'Choose at least one field to average.';
    return null;
  }
  if (ft === 'ratio') {
    if (!a.numerator || !a.denominator) return 'Choose both A and B.';
    return null;
  }
  return 'Choose a formula.';
}

// Simple checkbox multi-select for field references.
function MultiSelect({ options, value, onChange }) {
  const set = new Set(value || []);
  function toggle(k) {
    const n = new Set(set);
    if (n.has(k)) n.delete(k); else n.add(k);
    onChange([...n]);
  }
  return (
    <div style={styles.multiSelect}>
      {options.length === 0 ? (
        <div style={styles.hiddenEmpty}>No numeric fields available.</div>
      ) : options.map((o) => (
        <label key={o.key} style={styles.multiOpt}>
          <input type="checkbox" checked={set.has(o.key)} onChange={() => toggle(o.key)} /> {o.label}
        </label>
      ))}
    </div>
  );
}

// Curated formula picker — friendly labels, references fields by label,
// stores keys in formula_args. Controlled: onChange(formula_type, formula_args).
function FormulaPicker({ formulaType, formulaArgs, onChange, numericFields, sections }) {
  const args = formulaArgs || {};
  const setType = (ft) => onChange(ft, {}); // reset args when the formula changes
  const setArgs = (next) => onChange(formulaType, next);
  return (
    <div style={styles.pickerWrap}>
      <label style={styles.fieldEditLabel}>Formula</label>
      <select value={formulaType || ''} onChange={(e) => setType(e.target.value)} style={styles.modalInput}>
        <option style={OPT} value="">Choose…</option>
        <option style={OPT} value="sum">Total of a section (sum)</option>
        <option style={OPT} value="percent_of">Percentage (part of a total)</option>
        <option style={OPT} value="avg">Average of fields</option>
        <option style={OPT} value="ratio">Ratio (A ÷ B)</option>
      </select>

      {formulaType === 'sum' && (
        <>
          <div style={styles.pickerHint}>Add up all number fields in:</div>
          <select value={args.section || ''} onChange={(e) => setArgs({ section: e.target.value })} style={styles.modalInput}>
            <option style={OPT} value="">Choose section…</option>
            {sections.map((s) => <option style={OPT} key={s.key} value={s.key}>{s.title}</option>)}
          </select>
        </>
      )}

      {formulaType === 'percent_of' && (
        <>
          <div style={styles.pickerHint}>This value =</div>
          <select value={args.numerator || ''} onChange={(e) => setArgs({ ...args, numerator: e.target.value })} style={styles.modalInput}>
            <option style={OPT} value="">Choose the part…</option>
            {numericFields.map((f) => <option style={OPT} key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <div style={styles.pickerHint}>as a % of the total of:</div>
          <MultiSelect options={numericFields} value={args.over || []} onChange={(over) => setArgs({ ...args, over })} />
        </>
      )}

      {formulaType === 'avg' && (
        <>
          <div style={styles.pickerHint}>Average of:</div>
          <MultiSelect options={numericFields} value={args.over || []} onChange={(over) => setArgs({ ...args, over })} />
        </>
      )}

      {formulaType === 'ratio' && (
        <div style={styles.ratioRow}>
          <select value={args.numerator || ''} onChange={(e) => setArgs({ ...args, numerator: e.target.value })} style={{ ...styles.modalInput, flex: 1 }}>
            <option style={OPT} value="">A…</option>
            {numericFields.map((f) => <option style={OPT} key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <span style={styles.ratioDiv}>÷</span>
          <select value={args.denominator || ''} onChange={(e) => setArgs({ ...args, denominator: e.target.value })} style={{ ...styles.modalInput, flex: 1 }}>
            <option style={OPT} value="">B…</option>
            {numericFields.map((f) => <option style={OPT} key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}


// Flatten config/structure sections → flat field list, carrying section onto
// each field and NORMALIZING both shapes:
//   - DB structure (B1): dimension_row/dimension_col/formula_type/formula_args
//   - file config (2b-1): dimensionRow/dimensionCol/formula
// so the render helpers + curated evaluator work regardless of source.
function flattenConfigFields(config) {
  const out = [];
  for (const s of (config.sections || [])) {
    for (const f of (s.fields || [])) {
      out.push({
        ...f,
        section: f.section || s.key,
        dimensionRow: f.dimensionRow || f.dimension_row || null,
        dimensionCol: f.dimensionCol || f.dimension_col || null,
        // curated-formula fields (DB); harmless when absent (file config)
        formula_type: f.formula_type || null,
        formula_args: f.formula_args || null,
      });
    }
  }
  return out;
}

function isStatusReadOnly(status) {
  return ['submitted', 'head_reviewed', 'director_reviewed', 'approved', 'published'].includes(status);
}

function valuesDiffer(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) {
    const va = a?.[k];
    const vb = b?.[k];
    const sa = va === undefined || va === null ? '' : String(va);
    const sb = vb === undefined || vb === null ? '' : String(vb);
    if (sa !== sb) return true;
  }
  return false;
}

function countFilledManual(fields, values) {
  let n = 0;
  for (const f of fields) {
    if (f.source === 'computed') continue;
    const v = values[f.key];
    if (v !== undefined && v !== null && String(v).trim() !== '') n += 1;
  }
  return n;
}

// Humanize a subsection key as a sensible default (config lacks display labels).
function humanizeKey(k) {
  if (!k || k === 'default') return '';
  return k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderStatusBanner(status, rejection) {
  if (status === 'submitted' || status === 'head_reviewed' || status === 'director_reviewed') {
    return (
      <div style={styles.bannerInfo}>
        <span style={styles.bannerIcon}>ⓘ</span>
        <div>
          <strong style={styles.bannerStrong}>Your submission is under review.</strong>{' '}
          The form is locked while review is in progress. You'll be notified when there's an update.
        </div>
      </div>
    );
  }
  if (status === 'rejected') {
    const reason = rejection?.reason || 'No reason provided.';
    const at = rejection?.created_at ? new Date(rejection.created_at).toLocaleString() : '';
    return (
      <>
        <div style={styles.bannerError}>
          <span style={styles.bannerIcon}>!</span>
          <div>
            <strong style={styles.bannerStrong}>Submission rejected.</strong> Reason for rejection:<br />
            <em style={{ color: 'rgba(255,255,255,0.85)' }}>"{reason}"</em>
            {at && <div style={styles.bannerMeta}>Rejected {at}</div>}
          </div>
        </div>
        <div style={styles.bannerResume}>
          <span style={styles.bannerIcon}>↻</span>
          <div>
            <strong style={styles.bannerStrong}>Saving will resume editing.</strong> Your first Save Draft
            will automatically transition this submission back to draft. Continue making your fixes.
          </div>
        </div>
      </>
    );
  }
  if (status === 'approved') {
    return (
      <div style={styles.bannerApproved}>
        <span style={styles.bannerIcon}>★</span>
        <div><strong style={styles.bannerStrong}>Approved.</strong> Your submission was approved and will appear in dashboards shortly. The form is locked.</div>
      </div>
    );
  }
  if (status === 'published') {
    return (
      <div style={styles.bannerPublished}>
        <span style={styles.bannerIcon}>✓</span>
        <div><strong style={styles.bannerStrong}>Published.</strong> Data is visible across HR Dashboards. To make changes, contact an administrator to reopen the submission.</div>
      </div>
    );
  }
  return null;
}

// Subsectioned grid (headcount): group by subsection, render all fields inline.
function renderSubsectionedGrid(fields, values, onChange, readOnly, isMobile = false) {
  const bySubsection = {};
  for (const f of fields) {
    const sub = f.subsection || 'default';
    if (!bySubsection[sub]) bySubsection[sub] = [];
    bySubsection[sub].push(f);
  }
  return Object.entries(bySubsection).map(([subKey, subFields]) => (
    <div key={subKey} style={styles.subsection}>
      {humanizeKey(subKey) && <div style={styles.subsectionLabel}>{humanizeKey(subKey)}</div>}
      <div style={{ ...styles.fieldGrid, ...(isMobile ? styles.fieldGridMobile : {}) }}>
        {subFields.map((f) => (
          <FieldCell key={f.key} field={f} values={values} onChange={onChange} readOnly={readOnly} allFields={fields} />
        ))}
      </div>
    </div>
  ));
}

// HO/OP dimension grid — identical layout to live.
function renderDimensionGrid(section, fields, values, onChange, readOnly, isMobile = false) {
  const rows = {};
  for (const f of fields) {
    if (f.source === 'computed') continue;
    const r = f.dimensionRow || f.key;
    if (!rows[r]) rows[r] = { ho: null, op: null, label: '', helper: '' };
    rows[r].label = f.label;
    if (f.rowHelper) rows[r].helper = f.rowHelper;
    if (f.dimensionCol === 'ho') rows[r].ho = f;
    if (f.dimensionCol === 'op') rows[r].op = f;
  }

  if (isMobile) {
    return (
      <>
        {Object.entries(rows).map(([rowKey, row]) => (
          <div key={rowKey} style={styles.dimensionRowMobile}>
            <div style={styles.dimensionRowLabel}>
              {row.label}
              {row.helper && (<div style={styles.dimensionRowHelper}>{row.helper}</div>)}
            </div>
            {[{ f: row.ho, tag: 'HO' }, { f: row.op, tag: 'OP' }].map(({ f, tag }, i) => (
              f ? (
                <div key={f.key} style={styles.dimensionMobileField}>
                  <span style={styles.dimensionMobileTag}>{tag}</span>
                  <input type="number" min="0" style={{ ...styles.dimensionInput, ...styles.dimensionInputMobile }}
                    value={values[f.key] ?? ''} onChange={(e) => onChange(f.key, e.target.value)}
                    readOnly={readOnly} disabled={readOnly} inputMode="numeric" />
                </div>
              ) : <div key={i} />
            ))}
          </div>
        ))}
      </>
    );
  }

  return (
    <>
      <div style={styles.dimensionHeaderRow}>
        <div />
        <div style={styles.dimensionColHead}>HO</div>
        <div style={styles.dimensionColHead}>OP</div>
      </div>
      {Object.entries(rows).map(([rowKey, row]) => (
        <div key={rowKey} style={styles.dimensionRow}>
          <div style={styles.dimensionRowLabel}>
            {row.label}
            {row.helper && (<div style={styles.dimensionRowHelper}>{row.helper}</div>)}
          </div>
          {[row.ho, row.op].map((f, i) => (
            f ? (
              <input key={f.key} type="number" min="0" style={styles.dimensionInput}
                value={values[f.key] ?? ''} onChange={(e) => onChange(f.key, e.target.value)}
                readOnly={readOnly} disabled={readOnly} inputMode="numeric" />
            ) : <div key={i} />
          ))}
        </div>
      ))}
    </>
  );
}

// Services grid — plain number fields (labeled_grid is Step 2b-3).
function renderServicesGrid(fields, values, onChange, readOnly, isMobile = false) {
  const manualFields = fields.filter((f) => f.source !== 'computed');
  return (
    <div style={{ ...styles.servicesGrid, ...(isMobile ? styles.servicesGridMobile : {}) }}>
      {manualFields.map((f) => (
        <div key={f.key} style={styles.serviceField}>
          <label style={styles.fieldLabel}>
            {f.label}
            {f.helper && <span style={styles.fieldHelper}>{f.helper}</span>}
          </label>
          <input type="number" min="0" style={styles.serviceInput}
            value={values[f.key] ?? ''} onChange={(e) => onChange(f.key, e.target.value)}
            readOnly={readOnly} disabled={readOnly} inputMode="numeric" />
        </div>
      ))}
    </div>
  );
}

// Footer total — any computed field in the section (e.g. total_handled_requests).
function renderSectionFooter(section, fields, values) {
  // A computed field with no subsection is the section aggregate/footer.
  // (Headcount's computed pct fields have subsections → rendered inline.)
  const footerField = fields.find((f) => f.source === 'computed' && !f.subsection);
  if (!footerField) return null;
  const computedDisplay = computeFieldValue(footerField, values, fields);
  const empty = computedDisplay === '—';
  return (
    <div style={styles.sectionFooter}>
      <div style={styles.sectionFooterLabel}>{footerField.label}</div>
      <div style={{ ...styles.sectionFooterValue, ...(empty ? styles.sectionFooterValueEmpty : {}) }}>
        {computedDisplay}
      </div>
    </div>
  );
}

// FieldCell — single field (manual or computed), identical to live.
function FieldCell({ field, values, onChange, readOnly, allFields }) {
  const isComputed = field.source === 'computed';
  const display = isComputed ? computeFieldValue(field, values, allFields) : null;
  const isEmptyComputed = isComputed && display === '—';

  const targetHelper = field.target
    ? `(target: ${formatValue(field, field.target.value)})`
    : null;

  return (
    <div style={styles.field}>
      <label style={styles.fieldLabel}>
        {field.label}
        {targetHelper && (<span style={styles.fieldHelper}>{targetHelper}</span>)}
        {field.helper && !targetHelper && (<span style={styles.fieldHelper}>{field.helper}</span>)}
      </label>
      <div style={styles.inputWrap}>
        {isComputed ? (
          <input type="text" readOnly value={display}
            style={{ ...styles.input, ...styles.inputComputed, ...(isEmptyComputed ? styles.inputComputedEmpty : {}) }} />
        ) : (
          <input type="number" min="0"
            step={field.step || (field.type === 'percentage' ? '0.1' : '1')}
            value={values[field.key] ?? ''} onChange={(e) => onChange(field.key, e.target.value)}
            readOnly={readOnly} disabled={readOnly} inputMode="decimal" style={styles.input} />
        )}
        {field.unit && (<span style={styles.unit}>{field.unit}</span>)}
      </div>
    </div>
  );
}


const styles = {
  // ---- B3b-1 section-edit styles ----
  editToolbar: {
    margin: '0 0 18px', padding: '14px 16px',
    background: 'rgba(243,192,54,0.05)', border: '1px solid rgba(243,192,54,0.2)',
    borderRadius: 12,
  },
  editToolbarRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  addSectionBtn: {
    padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
    background: 'linear-gradient(135deg, #F3C036 0%, #ec4899 100%)', border: 'none',
    color: '#1a1028', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
  },
  addSectionForm: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  addSectionInput: {
    padding: '8px 12px', borderRadius: 8, minWidth: 180,
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
    color: '#fff', fontFamily: 'inherit', fontSize: 13, outline: 'none',
  },
  addSectionSelect: {
    padding: '8px 12px', borderRadius: 8,
    background: '#2d1f42', border: '1px solid rgba(255,255,255,0.15)',
    color: '#fff', fontFamily: 'inherit', fontSize: 13, outline: 'none',
  },
  showHiddenBtn: {
    marginLeft: 'auto', padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)',
    color: 'rgba(255,255,255,0.8)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
  },
  showHiddenOn: { background: 'rgba(255,255,255,0.1)', color: '#fff' },
  hiddenList: {
    marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6,
  },
  hiddenEmpty: { fontSize: 12.5, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' },
  hiddenRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    padding: '8px 12px', background: 'rgba(0,0,0,0.2)',
    border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
  },
  hiddenName: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  hiddenKey: { fontSize: 10.5, color: 'rgba(255,255,255,0.4)', marginLeft: 6, fontFamily: 'monospace' },
  restoreBtn: {
    padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
    background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)',
    color: '#86efac', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
  },
  savingHint: { marginLeft: 8, fontSize: 10.5, fontWeight: 600, color: 'rgba(243,192,54,0.8)', fontStyle: 'italic' },
  // ---- B3b-2 field-edit styles ----
  fieldEditZone: {
    marginTop: 14, paddingTop: 14, borderTop: '1px dashed rgba(255,255,255,0.12)',
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  fieldEditList: { display: 'flex', flexDirection: 'column', gap: 4 },
  fieldEditRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    padding: '6px 10px', background: 'rgba(0,0,0,0.15)',
    border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6,
  },
  fieldEditName: { fontSize: 12.5, color: 'rgba(255,255,255,0.82)', display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 },
  fieldEditTag: {
    fontSize: 9, fontWeight: 700, letterSpacing: '0.5px', padding: '1px 5px', borderRadius: 3,
    background: 'rgba(243,192,54,0.15)', color: '#F3C036',
  },
  fieldEditComputedTag: {
    fontSize: 9, fontWeight: 700, letterSpacing: '0.5px', padding: '1px 5px', borderRadius: 3,
    background: 'rgba(168,85,247,0.18)', color: '#c4b5fd',
  },
  fieldEditControls: { display: 'inline-flex', gap: 4, flexShrink: 0 },
  addFieldBtn: {
    alignSelf: 'flex-start', padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
    color: 'rgba(255,255,255,0.85)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
  },
  addFieldForm: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  addFieldInput: {
    padding: '8px 12px', borderRadius: 8, minWidth: 150, flex: 1,
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
    color: '#fff', fontFamily: 'inherit', fontSize: 13, outline: 'none',
  },
  addFieldSelect: {
    padding: '8px 12px', borderRadius: 8,
    background: '#2d1f42', border: '1px solid rgba(255,255,255,0.15)',
    color: '#fff', fontFamily: 'inherit', fontSize: 13, outline: 'none',
  },
  addFieldUnit: {
    padding: '8px 12px', borderRadius: 8, width: 100,
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
    color: '#fff', fontFamily: 'inherit', fontSize: 13, outline: 'none',
  },
  showHiddenFieldsBtn: {
    alignSelf: 'flex-start', padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
    background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.55)', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600,
  },
  fieldEditLabel: { display: 'block', fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,0.75)', margin: '10px 0 5px' },
  modalInput: {
    width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8,
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
    color: '#fff', fontFamily: 'inherit', fontSize: 14, outline: 'none',
  },
  fieldLockNote: {
    marginTop: 12, padding: '10px 12px', borderRadius: 8,
    background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.25)',
    color: '#c4b5fd', fontSize: 11.5, lineHeight: 1.5,
  },
  // ---- B4 formula picker styles ----
  addFieldFormWrap: { display: 'flex', flexDirection: 'column', gap: 8 },
  calcBox: {
    marginTop: 4, padding: '12px 14px', borderRadius: 10,
    background: 'rgba(243,192,54,0.05)', border: '1px solid rgba(243,192,54,0.2)',
  },
  pickerWrap: { display: 'flex', flexDirection: 'column' },
  pickerHint: { fontSize: 11.5, color: 'rgba(255,255,255,0.6)', margin: '10px 0 4px' },
  ratioRow: { display: 'flex', alignItems: 'center', gap: 8 },
  ratioDiv: { fontSize: 18, fontWeight: 700, color: '#F3C036' },
  multiSelect: {
    display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto',
    padding: '8px 10px', background: 'rgba(0,0,0,0.2)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
  },
  multiOpt: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'rgba(255,255,255,0.82)', cursor: 'pointer' },
  miniSaveLarge: {
    padding: '10px 18px', borderRadius: 10, cursor: 'pointer', border: 'none',
    background: 'linear-gradient(135deg, #F3C036 0%, #ec4899 100%)', color: '#1a1028',
    fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700,
  },
  sectionEditControls: { display: 'inline-flex', gap: 4, flexShrink: 0, marginRight: 8 },
  editIconBtn: {
    width: 30, height: 30, borderRadius: 6, cursor: 'pointer',
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
    color: 'rgba(255,255,255,0.75)', fontFamily: 'inherit', fontSize: 13,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  },
  editIconDanger: { background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)', color: '#fca5a5' },
  renameRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  renameInput: {
    padding: '6px 10px', borderRadius: 6, minWidth: 160,
    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(243,192,54,0.5)',
    color: '#fff', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, outline: 'none',
  },
  miniSave: {
    padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
    background: 'linear-gradient(135deg, #F3C036 0%, #ec4899 100%)', border: 'none',
    color: '#1a1028', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
  },
  miniCancel: {
    padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
    color: 'rgba(255,255,255,0.7)', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
  },
  // ---- B3b-1 confirm modal (portal) ----
  modalBackdrop: {
    position: 'fixed', inset: 0, background: 'rgba(14,8,32,0.72)',
    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    padding: '5vh 20px', overflowY: 'auto',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  modalCard: {
    position: 'relative', width: '100%', maxWidth: 440,
    background: 'linear-gradient(135deg, #1a1028 0%, #2d1f42 60%, #3d2856 100%)',
    border: '1px solid rgba(255,255,255,0.12)', borderRadius: 18,
    boxShadow: '0 24px 80px rgba(0,0,0,0.6)', color: '#fff', overflow: 'visible',
  },
  modalAccent: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderRadius: '18px 18px 0 0',
    background: 'linear-gradient(90deg, #ef4444, #f87171, #fca5a5)',
  },
  modalHeader: {
    padding: '22px 26px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px' },
  modalClose: {
    width: 32, height: 32, flexShrink: 0, borderRadius: 8, cursor: 'pointer',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.6)', fontFamily: 'inherit', fontSize: 14,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  },
  modalBody: { padding: '20px 26px', fontSize: 13, color: 'rgba(255,255,255,0.78)', lineHeight: 1.55 },
  modalFooter: {
    padding: '14px 26px 22px', display: 'flex', justifyContent: 'flex-end', gap: 10,
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  modalDangerBtn: {
    padding: '10px 18px', borderRadius: 10, cursor: 'pointer', border: 'none',
    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', color: '#fff',
    fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
    boxShadow: '0 6px 24px rgba(239,68,68,0.3)',
  },
  previewBadge: {
    marginLeft: 'auto',
    fontSize: 10, fontWeight: 700, letterSpacing: '1px',
    color: '#F3C036',
    background: 'rgba(243,192,54,0.12)',
    border: '1px solid rgba(243,192,54,0.3)',
    borderRadius: 6, padding: '4px 8px',
  },
  canvas: {
    position: 'relative',
    maxWidth: 1100,
    margin: '24px auto 0',
    padding: '0 48px',
    animation: 'hrFadeInUp 0.5s 0.05s ease both',
  },
  // ===== MOBILE variants (layout-only) =====
  canvasMobile: {
    padding: '0 14px',
  },
  periodSelectorMobile: {
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
  fieldGridMobile: {
    gridTemplateColumns: '1fr',
  },
  servicesGridMobile: {
    gridTemplateColumns: '1fr 1fr',
  },
  sectionBodyMobile: {
    padding: '16px 14px 18px',
  },
  dimensionRowMobile: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '14px',
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 10,
    marginBottom: 8,
  },
  dimensionMobileField: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  dimensionMobileTag: {
    flexShrink: 0,
    width: 34,
    textAlign: 'center',
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: '0.5px',
    color: 'rgba(243,192,54,0.9)',
    background: 'rgba(243,192,54,0.10)',
    border: '1px solid rgba(243,192,54,0.25)',
    borderRadius: 6,
    padding: '10px 0',
  },
  dimensionInputMobile: {
    flex: 1,
    minHeight: 44,
  },
  formActionsMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 12,
  },
  actionsRightMobile: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    width: '100%',
  },
  btnGhostMobile: {
    width: '100%',
    minHeight: 46,
    textAlign: 'center',
    justifyContent: 'center',
  },
  btnPrimaryMobile: {
    width: '100%',
    minHeight: 46,
    textAlign: 'center',
    justifyContent: 'center',
  },

  // Period selector strip (Phase 2A Extension)
  // BUG 1 FIX: explicit position:relative + high zIndex lifts the entire
  // strip ABOVE sibling section cards (which create their own stacking
  // contexts via backdropFilter). Without this, the dropdown panel's
  // zIndex was constrained inside periodSelector's local context and
  // appeared behind sections in DOM source order.
  periodSelector: {
    position: 'relative',
    zIndex: 100,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.1)',
    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    borderRadius: 16,
    padding: '16px 20px',
    marginBottom: 18,
    display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
  },
  periodSelectorLabel: {
    fontSize: 11, fontWeight: 700,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: '1.5px', textTransform: 'uppercase',
  },

  loading: {
    minHeight: 300,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    width: 40, height: 40, border: '4px solid rgba(255,255,255,0.1)',
    borderTopColor: '#F3C036', borderRadius: '50%', animation: 'hrSpin 0.8s linear infinite',
  },

  // Banners
  bannerInfo: {
    padding: '14px 18px', marginBottom: 12,
    background: 'rgba(99,102,241,0.10)',
    border: '1px solid rgba(99,102,241,0.3)',
    borderRadius: 12,
    fontSize: 13, lineHeight: 1.5, color: '#c7d2fe',
    display: 'flex', alignItems: 'flex-start', gap: 12,
  },
  bannerError: {
    padding: '14px 18px', marginBottom: 10,
    background: 'rgba(239,68,68,0.10)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 12,
    fontSize: 13, lineHeight: 1.5, color: '#fca5a5',
    display: 'flex', alignItems: 'flex-start', gap: 12,
  },
  bannerResume: {
    padding: '14px 18px', marginBottom: 12,
    background: 'rgba(243,192,54,0.10)',
    border: '1px solid rgba(243,192,54,0.3)',
    borderRadius: 12,
    fontSize: 13, lineHeight: 1.5, color: '#fde68a',
    display: 'flex', alignItems: 'flex-start', gap: 12,
  },
  bannerApproved: {
    padding: '14px 18px', marginBottom: 12,
    background: 'rgba(243,192,54,0.12)',
    border: '1px solid rgba(243,192,54,0.4)',
    borderRadius: 12,
    fontSize: 13, lineHeight: 1.5, color: '#fde68a',
    display: 'flex', alignItems: 'flex-start', gap: 12,
  },
  bannerPublished: {
    padding: '14px 18px', marginBottom: 12,
    background: 'rgba(34,197,94,0.10)',
    border: '1px solid rgba(34,197,94,0.3)',
    borderRadius: 12,
    fontSize: 13, lineHeight: 1.5, color: '#bbf7d0',
    display: 'flex', alignItems: 'flex-start', gap: 12,
  },
  bannerIcon: {
    flexShrink: 0,
    width: 22, height: 22,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700,
  },
  bannerStrong: { color: '#fff', fontWeight: 600 },
  bannerMeta: { color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 4 },

  alertSuccess: {
    padding: '10px 14px', marginBottom: 12,
    background: 'rgba(34,197,94,0.10)',
    border: '1px solid rgba(34,197,94,0.3)',
    borderRadius: 8,
    color: '#bbf7d0', fontSize: 12,
  },
  alertError: {
    padding: '10px 14px', marginBottom: 12,
    background: 'rgba(239,68,68,0.10)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 8,
    color: '#fca5a5', fontSize: 12,
  },

  // Section
  section: {
    position: 'relative',
    background: 'rgba(255,255,255,0.03)',
    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 18,
    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  sectionCollapsed: {},
  sectionAccent: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: 3,
    background: 'linear-gradient(90deg, #F3C036, #ec4899, #a855f7)',
  },
  sectionHeader: {
    padding: '20px 24px 18px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    cursor: 'pointer',
    userSelect: 'none',
    borderBottom: '1px solid transparent',
    transition: 'border-color 0.2s ease',
    gap: 14,
  },
  sectionHeaderExpanded: {
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  sectionHeaderLeft: {
    display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0,
  },
  sectionIcon: {
    width: 38, height: 38,
    background: 'rgba(243,192,54,0.12)',
    borderRadius: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#F3C036',
    flexShrink: 0,
  },
  sectionTitle: {
    fontSize: 16, fontWeight: 700, letterSpacing: '-0.2px',
    marginBottom: 3,
    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
  },
  headerTotal: {
    fontSize: 13,
    fontWeight: 600,
    color: '#F3C036',
    background: 'rgba(243,192,54,0.10)',
    padding: '2px 9px',
    borderRadius: 12,
    letterSpacing: 0,
  },
  sectionMeta: {
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.5)',
    display: 'flex', alignItems: 'center', gap: 10,
  },
  progressMini: { display: 'inline-flex', alignItems: 'center', gap: 6 },
  progressBar: {
    width: 60, height: 3,
    background: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
    display: 'inline-block',
  },
  progressBarFill: {
    display: 'block',
    height: '100%',
    background: 'linear-gradient(90deg, #F3C036, #ec4899)',
    borderRadius: 2,
    transition: 'width 0.3s ease',
  },
  sectionBody: {
    padding: '22px 24px 24px',
  },

  // Subsection
  subsection: { marginBottom: 24 },
  subsectionLabel: {
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 12,
    paddingBottom: 6,
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },

  // Field grid (2-col)
  fieldGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 14,
  },
  field: {
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.78)',
    display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
  },
  req: { color: '#ef4444', fontWeight: 700 },
  fieldHelper: {
    fontSize: 10.5,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: 400,
  },

  // Input
  inputWrap: { position: 'relative' },
  input: {
    width: '100%',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    color: '#fff',
    padding: '12px 14px',
    fontFamily: 'inherit',
    fontSize: 14,
    fontWeight: 500,
    transition: 'all 0.15s ease',
    boxSizing: 'border-box',
  },
  inputComputed: {
    background: 'rgba(243,192,54,0.06)',
    borderColor: 'rgba(243,192,54,0.2)',
    color: '#F3C036',
    fontWeight: 700,
    cursor: 'not-allowed',
  },
  inputComputedEmpty: {
    color: 'rgba(243,192,54,0.4)',
    fontWeight: 500,
  },
  unit: {
    position: 'absolute',
    right: 14, top: '50%',
    transform: 'translateY(-50%)',
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12, fontWeight: 500,
    pointerEvents: 'none',
  },

  // Dimension grid
  dimensionHeaderRow: {
    display: 'grid',
    gridTemplateColumns: '200px 1fr 1fr',
    gap: 12,
    padding: '0 14px 6px',
    marginBottom: 4,
  },
  dimensionRow: {
    display: 'grid',
    gridTemplateColumns: '200px 1fr 1fr',
    gap: 12,
    alignItems: 'center',
    padding: '12px 14px',
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 10,
    marginBottom: 8,
  },
  dimensionRowLabel: {
    fontSize: 12.5,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 1.3,
  },
  dimensionRowHelper: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  dimensionColHead: {
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
  },
  dimensionInput: {
    width: '100%',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    color: '#fff',
    padding: '12px 14px',
    fontFamily: 'inherit',
    fontSize: 14,
    fontWeight: 500,
    textAlign: 'center',
    boxSizing: 'border-box',
  },

  // Services grid (3-col)
  servicesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 12,
  },
  serviceField: {
    display: 'flex', flexDirection: 'column', gap: 4,
  },
  serviceInput: {
    width: '100%',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    color: '#fff',
    padding: '10px 12px',
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 500,
    boxSizing: 'border-box',
  },

  // Section footer
  sectionFooter: {
    marginTop: 18,
    padding: '14px 18px',
    background: 'linear-gradient(135deg, rgba(243,192,54,0.10) 0%, rgba(236,72,153,0.06) 100%)',
    border: '1px solid rgba(243,192,54,0.25)',
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionFooterLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '2px',
    textTransform: 'uppercase',
    color: 'rgba(243,192,54,0.85)',
  },
  sectionFooterValue: {
    fontSize: 22,
    fontWeight: 700,
    color: '#F3C036',
    letterSpacing: '-0.5px',
    fontVariantNumeric: 'tabular-nums',
  },
  sectionFooterValueEmpty: {
    color: 'rgba(243,192,54,0.4)',
    fontWeight: 500,
  },

  // Form actions
  formActions: {
    marginTop: 28,
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', gap: 16, flexWrap: 'wrap',
  },
  saveState: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11.5,
    display: 'inline-flex', alignItems: 'center', gap: 6,
  },
  dotSaved: {
    width: 6, height: 6, borderRadius: '50%', background: '#22c55e',
  },
  dotUnsaved: {
    color: '#F3C036',
    fontSize: 18,
    lineHeight: 1,
  },
  actionsRight: {
    display: 'inline-flex', gap: 10,
  },
  btnGhost: {
    padding: '11px 22px',
    borderRadius: 10,
    fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)',
    color: 'rgba(255,255,255,0.75)',
    cursor: 'pointer',
    transition: 'all 0.18s ease',
  },
  btnPrimary: {
    padding: '11px 22px',
    borderRadius: 10,
    fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
    border: 'none',
    background: 'linear-gradient(135deg, #ec4899 0%, #a855f7 100%)',
    color: '#fff',
    boxShadow: '0 6px 24px rgba(236,72,153,0.3)',
    cursor: 'pointer',
    transition: 'all 0.18s ease',
  },
};
