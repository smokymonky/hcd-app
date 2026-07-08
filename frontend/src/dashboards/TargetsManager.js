import React, { useEffect, useMemo, useState } from 'react';
import { targetsAPI } from '../services/api';
import EditTargetModal, { ConfirmDeleteModal } from './EditTargetModal';
import {
  FIELDS as HR_OPS_FIELDS,
  SECTIONS as HR_OPS_SECTIONS,
} from '../config/hrOpsFields';

// =============================================
// TargetsManager — admin UI for managing field_targets
// =============================================
// Phase 2B. Lives inside AdminPage as the third tab.
// Renders the cosmic glass-card aesthetic from Phase 2A (matches the
// approved mockup) — visually distinct from the lighter Activities +
// Users tabs in the same Admin Panel. That gear-shift is intentional
// per design review; eventual cosmic-ification of the rest of admin
// is separate scope.
//
// Modules:
//   HR_OPS  → ACTIVE   (uses HR_OPS_FIELDS + HR_OPS_SECTIONS for the Field dropdown)
//   TA      → GREYED   (helper: "Available once this module is built")
//   L&D     → GREYED
//   HR_SYS  → GREYED
// =============================================

// Module catalog — single source of truth for what the admin sees.
// HR_OPS pulls fields + sections from hrOpsFields.js.
// Future modules just register here when their fields config ships.
const MODULES = [
  {
    code: 'HR_OPS',
    name: 'HR Operations',
    isActive: true,
    iconPath: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>',
    fields: HR_OPS_FIELDS,
    sections: HR_OPS_SECTIONS,
  },
  {
    code: 'TA',
    name: 'Talent Acquisition',
    isActive: false,
    iconPath: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>',
    fields: [],
    sections: [],
  },
  {
    code: 'L&D',
    name: 'Learning & Development',
    isActive: false,
    iconPath: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>',
    fields: [],
    sections: [],
  },
  {
    code: 'HR_SYS',
    name: 'HR Systems',
    isActive: false,
    iconPath: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>',
    fields: [],
    sections: [],
  },
];

// Build a flat all-fields list with a `moduleCode` annotation so
// EditTargetModal can filter by module from a single list.
function buildAllFields() {
  const all = [];
  for (const m of MODULES) {
    if (!m.isActive) continue;
    for (const f of (m.fields || [])) {
      // Skip computed fields — targets are only for raw numeric inputs (Rule from spec)
      if (!f.active) continue;
      if (f.source === 'computed') continue;
      // Exclude non-numeric types (we have none currently, but be defensive)
      const dt = f.dataType;
      if (dt !== 'number' && dt !== 'percentage' && dt !== 'currency') continue;
      all.push({
        moduleCode: m.code,
        key: f.key,
        // Phase 2B polish: disambiguate HO/OP-paired fields via formatFieldLabel.
        // Single helper keeps dropdown + list + delete summary in sync.
        label: formatFieldLabel(f),
        section: f.section,
        dataType: f.dataType,
        unit: f.unit,
      });
    }
  }
  return all;
}

// Build a per-module sections list for the Field dropdown grouping.
// Returns Map<moduleCode, Array<{key,title}>>.
function buildSectionsByModule() {
  const map = {};
  for (const m of MODULES) {
    if (!m.isActive) continue;
    map[m.code] = (m.sections || []).map((s) => ({ key: s.key, title: s.title }));
  }
  return map;
}

// =============================================
// TargetsManager component
// =============================================
export default function TargetsManager() {
  const [targets, setTargets] = useState([]);            // raw API rows (active + deleted)
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // POLISH — mobile parity. Canonical pattern from DashboardPage.js.
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add');     // 'add' | 'edit'
  const [editingTarget, setEditingTarget] = useState(null);
  const [defaultModule, setDefaultModule] = useState(null);

  // Delete confirm state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingTarget, setDeletingTarget] = useState(null);

  // Inline toast
  const [toast, setToast] = useState(null);              // { type: 'success'|'error', text }

  // ---------- LOAD ----------
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    targetsAPI.list()
      .then((rows) => {
        if (cancelled) return;
        setTargets(Array.isArray(rows) ? rows : []);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[TargetsManager] load failed:', err);
        setLoadError(err && err.message ? err.message : 'Could not load targets.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [refreshTick]);

  // ---------- DERIVED ----------
  const allFields = useMemo(buildAllFields, []);
  const sectionsByModule = useMemo(buildSectionsByModule, []);
  const activeTargets = useMemo(() => targets.filter((t) => t.is_active !== false), [targets]);

  const totals = useMemo(() => ({
    active: targets.filter((t) => t.is_active !== false).length,
    deleted: targets.filter((t) => t.is_active === false).length,
  }), [targets]);

  // Group targets by module then section
  const targetsByModule = useMemo(() => {
    const map = {};
    for (const m of MODULES) map[m.code] = { active: [], deleted: [], bySection: {} };
    for (const t of targets) {
      const mEntry = map[t.module];
      if (!mEntry) continue;
      if (t.is_active === false) mEntry.deleted.push(t);
      else mEntry.active.push(t);
    }
    // Build bySection ordering for active rows
    for (const m of MODULES) {
      if (!m.isActive) continue;
      const sectionOrder = (m.sections || []).map((s) => s.key);
      const buckets = {};
      for (const sectionKey of sectionOrder) buckets[sectionKey] = [];
      // Also a fallback bucket for unknown sections
      const orphans = [];
      for (const t of map[m.code].active) {
        const field = (m.fields || []).find((f) => f.key === t.field_key);
        const sectionKey = field ? field.section : null;
        if (sectionKey && buckets[sectionKey]) {
          buckets[sectionKey].push({ row: t, field });
        } else {
          orphans.push({ row: t, field });
        }
      }
      // Sort soft-deleted rows by deleted_at desc for stable display alongside section groups
      const deletedSorted = map[m.code].deleted.slice().sort((a, b) => {
        const da = new Date(a.deleted_at || a.updated_at || 0).getTime();
        const db = new Date(b.deleted_at || b.updated_at || 0).getTime();
        return db - da;
      }).map((t) => ({ row: t, field: (m.fields || []).find((f) => f.key === t.field_key) }));
      map[m.code].bySection = { buckets, orphans, deleted: deletedSorted, sectionOrder };
    }
    return map;
  }, [targets]);

  // ---------- HANDLERS ----------
  function openAdd(forModule = null) {
    setModalMode('add');
    setEditingTarget(null);
    setDefaultModule(forModule);
    setModalOpen(true);
  }
  function openEdit(target) {
    setModalMode('edit');
    setEditingTarget(target);
    setDefaultModule(null);
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
    setEditingTarget(null);
  }

  function openDelete(target) {
    setDeletingTarget(target);
    setDeleteOpen(true);
  }
  function closeDelete() {
    setDeleteOpen(false);
    setDeletingTarget(null);
  }

  function showToast(type, text) {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleSave(payload) {
    if (modalMode === 'add') {
      const created = await targetsAPI.create(payload);
      showToast('success', `Target added: ${created.module} / ${created.field_key}.`);
    } else if (modalMode === 'edit' && editingTarget) {
      // For Edit, only send mutable fields (skip module + field_key)
      const editPayload = {
        target_value: payload.target_value,
        direction: payload.direction,
        tolerance: payload.tolerance,
        label: payload.label,
      };
      await targetsAPI.update(editingTarget.id, editPayload);
      showToast('success', `Target updated: ${editingTarget.module} / ${editingTarget.field_key}.`);
    }
    closeModal();
    setRefreshTick((n) => n + 1);
  }

  async function handleConfirmDelete() {
    if (!deletingTarget) return;
    try {
      await targetsAPI.remove(deletingTarget.id);
      showToast('success', `Soft-deleted: ${deletingTarget.module} / ${deletingTarget.field_key}.`);
      closeDelete();
      setRefreshTick((n) => n + 1);
    } catch (err) {
      // ConfirmDeleteModal will show error inline if we throw — but our toast
      // is more visible. Re-throw to let the modal catch it.
      throw err;
    }
  }

  async function handleRestore(target) {
    try {
      await targetsAPI.update(target.id, { is_active: true });
      showToast('success', `Restored: ${target.module} / ${target.field_key}.`);
      setRefreshTick((n) => n + 1);
    } catch (err) {
      showToast('error', err && err.message ? err.message : 'Restore failed.');
    }
  }

  // ---------- RENDER ----------
  return (
    <div style={styles.stage}>
      <style>{`
        @keyframes tmFadeInUp { from { opacity:0; transform: translateY(20px);} to { opacity:1; transform: translateY(0);} }
      `}</style>

      {/* Toolbar */}
      <div style={{ ...styles.toolbar, ...(isMobile ? styles.toolbarMobile : {}) }}>
        <div style={styles.toolbarLeft}>
          <span style={styles.toolbarHeading}>
            Dashboard Targets
            {!loading && (
              <span style={styles.toolbarCount}>
                {totals.active} active{totals.deleted > 0 ? ` · ${totals.deleted} soft-deleted` : ''} · 4 modules
              </span>
            )}
          </span>
          {!isMobile && <span style={styles.toolbarFilterSlot}>(filter / search — coming later)</span>}
        </div>
        <button
          type="button"
          style={{ ...styles.btnPrimary, ...(isMobile ? styles.btnPrimaryMobile : {}) }}
          onClick={() => openAdd(null)}
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
          Add Target
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div style={toast.type === 'success' ? styles.toastSuccess : styles.toastError}>
          {toast.text}
        </div>
      )}

      {/* Load error */}
      {loadError && (
        <div style={styles.errorBanner}>
          {loadError}
        </div>
      )}

      {/* Loading shimmer */}
      {loading && (
        <div style={styles.loading}>
          <div style={styles.spinner} />
          <style>{`@keyframes tmSpin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Module cards */}
      {!loading && !loadError && MODULES.map((m) => {
        const moduleBucket = targetsByModule[m.code] || { active: [], deleted: [], bySection: { buckets: {}, orphans: [], deleted: [], sectionOrder: [] } };
        const activeCount = moduleBucket.active.length;
        const deletedCount = moduleBucket.deleted.length;
        const sectionsTouched = m.isActive
          ? Object.keys(moduleBucket.bySection.buckets || {}).filter((k) => (moduleBucket.bySection.buckets[k] || []).length > 0).length
          : 0;

        return (
          <div key={m.code} style={{ ...styles.moduleCard, ...(isMobile ? styles.moduleCardMobile : {}), ...(m.isActive ? {} : styles.moduleCardDisabled) }}>
            <div style={styles.moduleAccent} />
            <div style={styles.moduleHeader}>
              <div style={styles.moduleHeaderLeft}>
                <div style={{ ...styles.moduleIcon, ...(m.isActive ? {} : styles.moduleIconDisabled) }}>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                       dangerouslySetInnerHTML={{ __html: m.iconPath }} />
                </div>
                <div>
                  <div style={styles.moduleName}>
                    {m.name}
                    {m.isActive
                      ? <span style={styles.tagActive}>Active</span>
                      : <span style={styles.tagPending}>Not yet built</span>}
                  </div>
                  <div style={styles.moduleSummary}>
                    {m.isActive
                      ? (activeCount === 0
                          ? '0 active targets'
                          : `${activeCount} target${activeCount === 1 ? '' : 's'} across ${sectionsTouched} section${sectionsTouched === 1 ? '' : 's'}`)
                        + (deletedCount > 0 ? ` · ${deletedCount} soft-deleted` : '')
                      : 'No fields available yet — targets can be added once the module ships.'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                style={{ ...styles.btnMini, ...(m.isActive ? {} : styles.btnMiniDisabled) }}
                onClick={() => m.isActive && openAdd(m.code)}
                disabled={!m.isActive}
              >
                <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                Add Target
              </button>
            </div>

            {/* Disabled body */}
            {!m.isActive && (
              <div style={styles.moduleBodyDisabled}>
                Available once this module is built.
              </div>
            )}

            {/* Active body */}
            {m.isActive && (
              <div style={styles.moduleBody}>
                {/* Empty state */}
                {activeCount === 0 && deletedCount === 0 && (
                  <EmptyState moduleName={m.name} onAdd={() => openAdd(m.code)} />
                )}

                {/* Active sections */}
                {(moduleBucket.bySection.sectionOrder || []).map((sectionKey) => {
                  const items = (moduleBucket.bySection.buckets || {})[sectionKey] || [];
                  if (items.length === 0) return null;
                  const sectionMeta = (m.sections || []).find((s) => s.key === sectionKey);
                  return (
                    <div key={sectionKey} style={styles.sectionGroup}>
                      <div style={styles.sectionLabel}>{sectionMeta ? sectionMeta.title : sectionKey}</div>
                      {items.map(({ row, field }) => (
                        <TargetRow
                          key={row.id}
                          target={row}
                          field={field}
                          isMobile={isMobile}
                          onEdit={() => openEdit(row)}
                          onDelete={() => openDelete(row)}
                        />
                      ))}
                    </div>
                  );
                })}

                {/* Orphan active rows (field_key no longer in FIELDS) */}
                {(moduleBucket.bySection.orphans || []).length > 0 && (
                  <div style={styles.sectionGroup}>
                    <div style={styles.sectionLabel}>Orphan targets (field no longer in config)</div>
                    {(moduleBucket.bySection.orphans || []).map(({ row, field }) => (
                      <TargetRow
                        key={row.id}
                        target={row}
                        field={field}
                        orphan
                        isMobile={isMobile}
                        onEdit={() => openEdit(row)}
                        onDelete={() => openDelete(row)}
                      />
                    ))}
                  </div>
                )}

                {/* Soft-deleted rows (collected at bottom) */}
                {(moduleBucket.bySection.deleted || []).length > 0 && (
                  <div style={styles.sectionGroup}>
                    <div style={styles.sectionLabel}>Soft-deleted</div>
                    {(moduleBucket.bySection.deleted || []).map(({ row, field }) => (
                      <TargetRow
                        key={row.id}
                        target={row}
                        field={field}
                        deleted
                        isMobile={isMobile}
                        onRestore={() => handleRestore(row)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Modals */}
      <EditTargetModal
        mode={modalMode}
        open={modalOpen}
        onClose={closeModal}
        onSave={handleSave}
        modules={MODULES.map((m) => ({ code: m.code, name: m.name, isActive: m.isActive }))}
        sections={modalOpen && modalMode === 'add' && defaultModule
          ? (sectionsByModule[defaultModule] || [])
          : (modalOpen && modalMode === 'edit' && editingTarget
              ? (sectionsByModule[editingTarget.module] || [])
              : (sectionsByModule[Object.keys(sectionsByModule)[0]] || []))
        }
        fields={allFields}
        existingTargets={activeTargets}
        initialValues={modalMode === 'edit' && editingTarget ? {
          module: editingTarget.module,
          field_key: editingTarget.field_key,
          target_value: editingTarget.target_value,
          direction: editingTarget.direction,
          tolerance: editingTarget.tolerance,
          label: editingTarget.label,
        } : null}
        defaultModule={defaultModule}
      />

      <ConfirmDeleteModal
        open={deleteOpen}
        onClose={closeDelete}
        onConfirm={handleConfirmDelete}
        targetSummary={deletingTarget
          ? `${labelForField(deletingTarget.field_key, deletingTarget.module)} (${moduleNameByCode(deletingTarget.module)})`
          : ''}
      />
    </div>
  );
}

// =============================================
// TargetRow — one row inside a section group
// =============================================
function TargetRow({ target, field, orphan = false, deleted = false, isMobile = false, onEdit, onDelete, onRestore }) {
  // Phase 2B polish: same formatFieldLabel helper used by the Add/Edit
  // dropdown — keeps list ↔ dropdown ↔ delete summary consistent so an
  // admin who picks "ID Cards Printed (HO)" sees that exact label in
  // the list and in the delete confirm modal.
  const fieldName = field ? formatFieldLabel(field) : target.field_key;
  const unit = field
    ? (field.unit || (field.dataType === 'percentage' ? '%' : ''))
    : '';
  const valueDisplay = formatTargetValue(target.target_value, field);
  const directionMeta = DIRECTION_META[target.direction] || DIRECTION_META.exact;
  const tolDisplay = target.tolerance == null
    ? '±2.0 (default)'
    : `±${formatNum(target.tolerance)}${unit || ''}`;

  // POLISH — mobile: rows stack vertically (field / value+direction /
  // meta / actions full-width ≥40px).
  const rowStyle = isMobile
    ? { ...styles.targetRow, ...styles.targetRowMobile, ...(deleted ? styles.targetRowDeleted : {}) }
    : { ...styles.targetRow, ...(deleted ? styles.targetRowDeleted : {}) };
  const actionsStyle = isMobile
    ? { ...styles.targetActions, ...styles.targetActionsMobile }
    : styles.targetActions;
  const miniBtnStyle = isMobile
    ? { ...styles.btnMini, ...styles.btnMiniMobile }
    : styles.btnMini;
  const restoreBtnStyle = isMobile
    ? { ...styles.btnRestore, ...styles.btnMiniMobile }
    : styles.btnRestore;

  return (
    <div style={rowStyle}>
      <div style={styles.targetFieldName}>
        <span style={deleted ? { textDecoration: 'line-through' } : {}}>{fieldName}</span>
        {orphan && <span style={styles.orphanTag}>orphan</span>}
        <span style={styles.fieldKey}>{target.field_key}</span>
      </div>
      <div style={{ ...styles.targetValue, ...(isMobile ? styles.targetValueMobile : {}) }}>{valueDisplay}</div>
      <div style={{ ...styles.targetDirection, color: directionMeta.color }}>
        <span style={{ ...styles.directionGlyph, color: directionMeta.color }}>{directionMeta.glyph}</span>
        {directionMeta.label}
      </div>
      <div style={styles.targetLabel}>
        {target.label
          ? <span>"{target.label}"</span>
          : <span style={styles.noLabel}>(no label)</span>}
        <span style={styles.tolerance}>
          {deleted
            ? `Deleted by ${target.deleted_by_name || `user #${target.deleted_by || '?'}`} · ${formatDate(target.deleted_at)}`
            : `Tolerance: ${tolDisplay}`}
        </span>
      </div>
      <div style={actionsStyle}>
        {deleted ? (
          <button type="button" style={restoreBtnStyle} onClick={onRestore}>
            <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            Restore
          </button>
        ) : (
          <>
            <button type="button" style={miniBtnStyle} onClick={onEdit}>Edit</button>
            <button type="button" style={{ ...miniBtnStyle, ...styles.btnDanger }} onClick={onDelete}>Delete</button>
          </>
        )}
      </div>
    </div>
  );
}

// =============================================
// EmptyState — shown when an active module has zero targets at all
// =============================================
function EmptyState({ moduleName, onAdd }) {
  return (
    <div style={styles.emptyState}>
      <div style={styles.emptyTitle}>No targets configured for {moduleName}</div>
      <div style={styles.emptySub}>
        Add your first target to enable pass/soft-fail/hard-fail indicators on the live Snapshot.
      </div>
      <button type="button" style={styles.btnPrimaryEmpty} onClick={onAdd}>
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
        Add your first target
      </button>
    </div>
  );
}

// =============================================
// Helpers
// =============================================
const DIRECTION_META = {
  above: { label: 'Higher is better', glyph: '↑', color: '#86efac' },
  below: { label: 'Lower is better',  glyph: '↓', color: '#93c5fd' },
  exact: { label: 'Hit exactly',      glyph: '=', color: 'rgba(255,255,255,0.65)' },
};

function moduleNameByCode(code) {
  const m = MODULES.find((x) => x.code === code);
  return m ? m.name : code;
}

// =============================================
// formatFieldLabel — Phase 2B polish
// =============================================
// HO/OP-paired fields in HR_OPS share a base label (e.g. "ID Cards Printed"
// for both new_employee_profiles_ho and new_employee_profiles_op). Without
// disambiguation the Add/Edit Field dropdown and the target list both show
// identical-looking pairs and the admin can't tell which is which.
//
// Each field config already carries dimensionCol ('ho' | 'op') for paired
// fields and nothing for the rest. Append "(HO)" / "(OP)" only when set.
// Single helper used by buildAllFields(), TargetRow, and labelForField so
// the dropdown, the list, and the delete-confirm summary stay consistent.
//
// SCOPE: this only changes DISPLAYED labels in the targets admin UI.
// hrOpsFields.js field defs are untouched (per spec).
// =============================================
function formatFieldLabel(f) {
  if (!f || !f.label) return '';
  const suffix = f.dimensionCol ? ` (${String(f.dimensionCol).toUpperCase()})` : '';
  return `${f.label}${suffix}`;
}

function labelForField(fieldKey, moduleCode) {
  const m = MODULES.find((x) => x.code === moduleCode);
  if (!m) return fieldKey;
  const f = (m.fields || []).find((x) => x.key === fieldKey);
  return f ? formatFieldLabel(f) : fieldKey;
}

function formatTargetValue(rawValue, field) {
  const n = Number(rawValue);
  if (!Number.isFinite(n)) return '—';
  const unit = field ? (field.unit || (field.dataType === 'percentage' ? '%' : '')) : '';
  const numStr = Number.isInteger(n)
    ? n.toLocaleString('en-US')
    : n.toLocaleString('en-US', { maximumFractionDigits: 1 });
  return `${numStr}${unit ? unit : ''}`;
}

function formatNum(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? n.toString() : n.toFixed(1);
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (_) { return '—'; }
}

// =============================================
// STYLES
// =============================================
const styles = {
  stage: {
    position: 'relative',
    minHeight: 400,
    padding: '8px 0 60px',
    background: 'linear-gradient(135deg, #1a1028 0%, #2d1f42 30%, #3d2856 60%, #4a3265 100%)',
    margin: '-16px -16px 0',
    borderRadius: 12,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    color: '#fff',
    overflow: 'visible',
    animation: 'tmFadeInUp 0.4s ease',
  },

  toolbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 16, flexWrap: 'wrap',
    padding: '20px 32px 14px',
  },
  toolbarLeft: {
    display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
  },
  toolbarHeading: {
    fontSize: 15, fontWeight: 700, color: '#fff', letterSpacing: '-0.1px',
  },
  toolbarCount: {
    fontSize: 12, fontWeight: 600,
    color: 'rgba(243,192,54,0.85)',
    background: 'rgba(243,192,54,0.10)',
    padding: '2px 9px',
    borderRadius: 12,
    marginLeft: 8,
  },
  toolbarFilterSlot: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11, fontStyle: 'italic',
  },

  toastSuccess: {
    margin: '0 32px 12px',
    padding: '10px 14px',
    background: 'rgba(34,197,94,0.10)',
    border: '1px solid rgba(34,197,94,0.3)',
    borderRadius: 8, color: '#bbf7d0', fontSize: 12,
  },
  toastError: {
    margin: '0 32px 12px',
    padding: '10px 14px',
    background: 'rgba(239,68,68,0.10)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 8, color: '#fca5a5', fontSize: 12,
  },
  errorBanner: {
    margin: '0 32px 12px',
    padding: '14px 18px',
    background: 'rgba(239,68,68,0.10)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 12,
    color: '#fca5a5', fontSize: 13,
  },

  loading: {
    minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  spinner: {
    width: 36, height: 36, border: '4px solid rgba(255,255,255,0.1)',
    borderTopColor: '#F3C036', borderRadius: '50%',
    animation: 'tmSpin 0.8s linear infinite',
  },

  // Module card
  moduleCard: {
    position: 'relative',
    background: 'rgba(255,255,255,0.03)',
    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16,
    overflow: 'hidden',
    margin: '0 32px 18px',
  },
  moduleCardDisabled: { opacity: 0.55 },
  moduleAccent: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: 3,
    background: 'linear-gradient(90deg, #F3C036, #ec4899, #a855f7)',
  },
  moduleHeader: {
    padding: '18px 22px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 14,
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  moduleHeaderLeft: { display: 'flex', alignItems: 'center', gap: 14 },
  moduleIcon: {
    width: 38, height: 38,
    background: 'rgba(243,192,54,0.12)',
    borderRadius: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#F3C036', flexShrink: 0,
  },
  moduleIconDisabled: {
    background: 'rgba(255,255,255,0.04)',
    color: 'rgba(255,255,255,0.35)',
  },
  moduleName: {
    fontSize: 15, fontWeight: 700, letterSpacing: '-0.2px', color: '#fff',
    display: 'flex', alignItems: 'center', gap: 10,
  },
  tagActive: {
    fontSize: 9.5, fontWeight: 700, letterSpacing: '1.2px',
    textTransform: 'uppercase',
    padding: '2px 7px', borderRadius: 4,
    background: 'rgba(34,197,94,0.15)', color: '#86efac',
  },
  tagPending: {
    fontSize: 9.5, fontWeight: 700, letterSpacing: '1.2px',
    textTransform: 'uppercase',
    padding: '2px 7px', borderRadius: 4,
    background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.45)',
  },
  moduleSummary: {
    fontSize: 11.5, color: 'rgba(255,255,255,0.55)', marginTop: 3,
  },
  moduleBody: { padding: '14px 22px 18px' },
  moduleBodyDisabled: {
    padding: '22px',
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12.5, textAlign: 'center', fontStyle: 'italic',
  },

  // Section group
  sectionGroup: { marginBottom: 14 },
  sectionLabel: {
    fontSize: 10, fontWeight: 700,
    letterSpacing: '1.5px', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 8, paddingBottom: 4,
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  },

  // Target row
  targetRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(180px, 1.6fr) 90px 1.1fr 1.4fr auto',
    alignItems: 'center',
    gap: 14,
    padding: '12px 14px',
    background: 'rgba(0,0,0,0.18)',
    border: '1px solid rgba(255,255,255,0.04)',
    borderRadius: 10,
    marginBottom: 6,
  },
  // POLISH — mobile: single column stack, tighter padding.
  targetRowMobile: {
    gridTemplateColumns: '1fr',
    gap: 8,
    padding: '12px',
  },
  targetValueMobile: {
    textAlign: 'left',
    fontSize: 18,
  },
  targetActionsMobile: {
    justifyContent: 'stretch',
    width: '100%',
    display: 'flex',
    gap: 8,
  },
  btnMiniMobile: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
    fontSize: 12.5,
  },
  toolbarMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    padding: '16px 16px 10px',
  },
  btnPrimaryMobile: {
    width: '100%',
    justifyContent: 'center',
    minHeight: 44,
  },
  moduleCardMobile: {
    margin: '0 16px 14px',
  },
  targetRowDeleted: {
    opacity: 0.55,
    background: 'rgba(0,0,0,0.10)',
  },
  targetFieldName: {
    fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.92)',
    letterSpacing: '-0.1px',
    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
  },
  fieldKey: {
    display: 'block',
    width: '100%',
    fontSize: 10.5, color: 'rgba(255,255,255,0.4)',
    fontWeight: 500, fontFamily: 'SF Mono, Menlo, monospace',
    marginTop: 2,
  },
  orphanTag: {
    fontSize: 9, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase',
    color: '#fca5a5', background: 'rgba(239,68,68,0.10)',
    padding: '1px 6px', borderRadius: 4,
  },
  targetValue: {
    fontSize: 16, fontWeight: 700, color: '#F3C036',
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
    letterSpacing: '-0.3px',
  },
  targetDirection: {
    fontSize: 12,
    display: 'inline-flex', alignItems: 'center', gap: 6,
  },
  directionGlyph: {
    width: 14, height: 14,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700,
  },
  targetLabel: {
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.55)',
    fontStyle: 'italic',
    lineHeight: 1.4,
  },
  noLabel: { fontStyle: 'normal', color: 'rgba(255,255,255,0.3)' },
  tolerance: {
    display: 'block',
    fontStyle: 'normal',
    fontSize: 10.5,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  targetActions: {
    display: 'inline-flex', gap: 6, justifyContent: 'flex-end',
  },

  // Empty state
  emptyState: {
    padding: '36px 22px',
    textAlign: 'center',
    background: 'rgba(0,0,0,0.12)',
    border: '1px dashed rgba(255,255,255,0.1)',
    borderRadius: 12,
  },
  emptyTitle: {
    fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.85)',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 12, color: 'rgba(255,255,255,0.5)',
    maxWidth: 480, margin: '0 auto 16px', lineHeight: 1.6,
  },
  btnPrimaryEmpty: {
    padding: '10px 18px',
    borderRadius: 10,
    fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
    border: 'none',
    background: 'linear-gradient(135deg, #ec4899 0%, #a855f7 100%)',
    color: '#fff',
    boxShadow: '0 6px 24px rgba(236,72,153,0.3)',
    cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  },

  // Buttons
  btnPrimary: {
    padding: '10px 16px',
    borderRadius: 10,
    fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
    border: 'none',
    background: 'linear-gradient(135deg, #ec4899 0%, #a855f7 100%)',
    color: '#fff',
    boxShadow: '0 6px 24px rgba(236,72,153,0.3)',
    cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  },
  btnMini: {
    padding: '6px 12px', fontSize: 11, fontWeight: 600,
    borderRadius: 6, cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)',
    color: 'rgba(255,255,255,0.75)',
    fontFamily: 'inherit',
    transition: 'all 0.15s ease',
    display: 'inline-flex', alignItems: 'center', gap: 5,
  },
  btnDanger: {},
  btnMiniDisabled: {
    opacity: 0.4, cursor: 'not-allowed',
  },
  btnRestore: {
    padding: '6px 12px', fontSize: 11, fontWeight: 600,
    borderRadius: 6, cursor: 'pointer',
    fontFamily: 'inherit',
    background: 'rgba(243,192,54,0.12)',
    color: '#F3C036',
    border: '1px solid rgba(243,192,54,0.3)',
    display: 'inline-flex', alignItems: 'center', gap: 5,
  },
};
