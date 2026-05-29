import React, { useEffect, useMemo, useState } from 'react';
import {
  FIELDS,
  SECTIONS,
  getFieldsForSection,
  computeField,
  computeSectionHeaderTotal,
  formatValue,
  buildYearOptions,
  buildMonthOptions,
} from '../config/hrOpsFields';
import { dashboardsAPI } from '../services/api';
import StatusBadge from './StatusBadge';
import Dropdown from './Dropdown';

// =============================================
// HROpsDataEntry
// =============================================
// Phase 2A: the data entry form for HR Operations.
//
// Rule 13 patterns:
//   - variant prop ('full'|'mini') — Phase 6.5 will use 'mini' inside
//     composite views from this same source. Phase 2A uses 'full' only.
//   - Field rendering iterates over FIELDS config; no hardcoded JSX
//     per field. Adding/editing fields = touching hrOpsFields.js only.
//   - Section render mode reads from SECTIONS[i].dimensionLayout /
//     servicesLayout — extensible to future layout types.
//   - Computed fields evaluated via COMPUTERS map; this component
//     knows nothing about which calculations exist.
//
// Workflow state machine (read-only states gray out inputs):
//   empty     → editable, no submission ID yet
//   draft     → editable, Save Draft + Submit for Review
//   submitted → read-only, info banner
//   rejected  → editable, red banner with reason, "Save Draft will resume"
//   approved  → read-only, gold banner
//   published → read-only, green banner
//
// Edit lockout (Option C from audit Section 6.7.4):
//   Backend enforces. UI reflects by disabling inputs when status is
//   in {submitted, head_reviewed, director_reviewed, approved, published}.
// =============================================

export default function HROpsDataEntry({
  user,
  year,
  month,
  variant = 'full',
  onStatusChange,   // (newStatus) → void — parent updates its state badge
  onPeriodChange,   // (year, month) → void — parent navigates via URL (Phase 2A Extension)
}) {
  // Submission state
  const [submission, setSubmission] = useState(null);
  const [values, setValues] = useState({});           // { field_key: stringValue }
  const [lastSaved, setLastSaved] = useState({});     // snapshot of values at last save
  const [history, setHistory] = useState([]);          // workflow_history rows
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);        // { type: 'success'|'error', text }
  const [expandedSections, setExpandedSections] = useState(
    () => Object.fromEntries(SECTIONS.map((s) => [s.key, true]))
  );

  const status = submission?.status || 'empty';
  const isReadOnly = isStatusReadOnly(status);
  const isRejected = status === 'rejected';

  // ---------- LOAD ----------
  // Load any existing submission for this (HR_OPS, year, month).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessage(null);

    dashboardsAPI.listSubmissions('HR_OPS', { year })
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
        // Found one — fetch detail to get values + history
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
        // Rule 5: visible error
        console.error('[HROpsDataEntry] load failed:', err);
        setMessage({ type: 'error', text: `Could not load submission: ${err.message || 'unknown error'}` });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [year, month, onStatusChange]);

  // ---------- DERIVED ----------
  // Unsaved-changes indicator: compare values vs lastSaved
  const hasUnsavedChanges = useMemo(
    () => valuesDiffer(values, lastSaved),
    [values, lastSaved]
  );

  // Latest rejection reason (for the rejected banner)
  const latestRejection = useMemo(() => {
    if (!isRejected) return null;
    // History is ordered DESC; first 'admin_rejected' or 'rejected' action wins
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

  // Save Draft. Hits POST /dashboards/HR_OPS/submissions which upserts.
  // When status is 'rejected', backend auto-transitions to 'draft' via
  // resumed_editing action (Phase 0 Option C contract).
  async function handleSaveDraft() {
    setSaving(true);
    setMessage(null);
    try {
      // Build payload: only manual fields with non-empty values
      const data = FIELDS
        .filter((f) => f.active && f.source !== 'computed')
        .map((f) => ({
          section: f.section,
          field_key: f.key,
          value: values[f.key] === undefined || values[f.key] === '' ? null : String(values[f.key]),
        }));

      const resp = await dashboardsAPI.saveSubmission('HR_OPS', { year, month, data });
      // resp = { submission, data, created }
      const sub = resp.submission;
      setSubmission(sub);
      // Refresh from server response — handles auto-resume rejected→draft
      const v = {};
      (resp.data || []).forEach((row) => { v[row.field_key] = row.value ?? ''; });
      setValues(v);
      setLastSaved(v);
      // Refresh history to surface the resumed_editing event if applicable
      const detail = await dashboardsAPI.getSubmission(sub.id);
      setHistory(detail.history || []);
      if (onStatusChange) onStatusChange(sub.status);
      setMessage({ type: 'success', text: resp.created ? 'Draft created.' : 'Draft saved.' });
    } catch (err) {
      console.error('[HROpsDataEntry] save failed:', err);
      setMessage({ type: 'error', text: `Save failed: ${err.message || 'unknown error'}` });
    } finally {
      setSaving(false);
    }
  }

  // Submit for Review. Requires an existing submission ID.
  async function handleSubmit() {
    if (!submission || !submission.id) {
      setMessage({ type: 'error', text: 'Save a draft first before submitting for review.' });
      return;
    }
    if (hasUnsavedChanges) {
      // Save before submitting so reviewer sees latest
      await handleSaveDraft();
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const resp = await dashboardsAPI.submitSubmission(submission.id);
      const sub = resp.submission;
      setSubmission(sub);
      // Refresh history
      const detail = await dashboardsAPI.getSubmission(sub.id);
      setHistory(detail.history || []);
      if (onStatusChange) onStatusChange(sub.status);
      setMessage({ type: 'success', text: 'Submitted for review.' });
    } catch (err) {
      console.error('[HROpsDataEntry] submit failed:', err);
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

  // Build a synthetic numeric values map for computed fields (parse-once)
  // Note: we pass the raw string map to computeField; helpers in COMPUTERS
  // parse to number themselves. This keeps the form simple.

  // Period selector options — Rule 13 (config-driven year list with
  // SYSTEM_START_YEAR floor). Month list is always all 12 — Entry view
  // allows submission for any month within the floor.
  const yearOptions = buildYearOptions();
  const monthOptions = buildMonthOptions();

  function handlePeriodChange(nextYear, nextMonth) {
    if (typeof onPeriodChange === 'function') {
      onPeriodChange(Number(nextYear), Number(nextMonth));
    }
  }

  return (
    <div style={styles.canvas}>
      {/* Period selector (Phase 2A Extension) — historical entry */}
      <div style={styles.periodSelector}>
        <span style={styles.periodSelectorLabel}>ENTERING</span>
        <Dropdown
          label="Year"
          value={String(year)}
          options={yearOptions}
          onChange={(v) => handlePeriodChange(v, month)}
          width={120}
        />
        <Dropdown
          label="Month"
          value={String(month)}
          options={monthOptions}
          onChange={(v) => handlePeriodChange(year, v)}
          width={150}
        />
      </div>

      {/* Status banners */}
      {renderStatusBanner(status, latestRejection)}

      {/* Inline message (success/error) */}
      {message && (
        <div style={message.type === 'error' ? styles.alertError : styles.alertSuccess}>
          {message.text}
        </div>
      )}

      {/* Sections */}
      {SECTIONS.map((section) => {
        const expanded = expandedSections[section.key];
        const fields = getFieldsForSection(section.key);
        const filledCount = countFilledManual(fields, values);
        const totalManual = fields.filter((f) => f.source !== 'computed').length;
        const headerTotal = computeSectionHeaderTotal(section, values);

        return (
          <div
            key={section.key}
            style={{ ...styles.section, ...(expanded ? {} : styles.sectionCollapsed) }}
          >
            <div style={styles.sectionAccent} />
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggleSection(section.key)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSection(section.key); } }}
              style={{
                ...styles.sectionHeader,
                ...(expanded ? styles.sectionHeaderExpanded : {}),
              }}
            >
              <div style={styles.sectionHeaderLeft}>
                <div style={styles.sectionIcon}>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                       dangerouslySetInnerHTML={{ __html: section.iconPath }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={styles.sectionTitle}>
                    {section.title}
                    {headerTotal != null && (
                      <span style={styles.headerTotal}>
                        {headerTotal} {section.headerTotalLabel || ''}
                      </span>
                    )}
                  </div>
                  <div style={styles.sectionMeta}>
                    <span style={styles.progressMini}>
                      <span style={styles.progressBar}>
                        <span
                          style={{
                            ...styles.progressBarFill,
                            width: totalManual === 0 ? '0%' : `${(filledCount / totalManual) * 100}%`,
                          }}
                        />
                      </span>
                      {filledCount}/{totalManual} fields
                    </span>
                  </div>
                </div>
              </div>
              <svg
                width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
                style={{
                  color: 'rgba(255,255,255,0.5)',
                  flexShrink: 0,
                  transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.25s ease',
                }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
              </svg>
            </div>

            {expanded && (
              <div style={styles.sectionBody}>
                {section.dimensionLayout === 'ho_op'
                  ? renderDimensionGrid(section, fields, values, handleFieldChange, isReadOnly)
                  : section.servicesLayout
                    ? renderServicesGrid(fields, values, handleFieldChange, isReadOnly)
                    : renderHeadcountGrid(fields, values, handleFieldChange, isReadOnly)
                }
                {/* Section footer for computed totals (Q4 pattern a) */}
                {renderSectionFooter(section, fields, values)}
              </div>
            )}
          </div>
        );
      })}

      {/* Form actions */}
      <div style={styles.formActions}>
        <div style={styles.saveState}>
          {hasUnsavedChanges && !isReadOnly ? (
            <>
              <span style={styles.dotUnsaved}>•</span>
              Unsaved changes
            </>
          ) : isReadOnly ? (
            <>Locked while under review.</>
          ) : submission && submission.updated_at ? (
            <>
              <span style={styles.dotSaved} />
              All changes saved
            </>
          ) : (
            <>No draft saved yet</>
          )}
        </div>
        {!isReadOnly && (
          <div style={styles.actionsRight}>
            <button
              type="button"
              style={styles.btnGhost}
              onClick={handleSaveDraft}
              disabled={saving || submitting}
            >
              {saving ? 'Saving…' : 'Save Draft'}
            </button>
            <button
              type="button"
              style={styles.btnPrimary}
              onClick={handleSubmit}
              disabled={submitting || saving || !submission}
              title={!submission ? 'Save a draft first' : ''}
            >
              {submitting ? 'Submitting…' : (isRejected ? 'Re-submit for Review →' : 'Submit for Review →')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================
// Helpers
// =============================================
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
        <div>
          <strong style={styles.bannerStrong}>Approved.</strong> Your submission was approved and will appear in dashboards shortly. The form is locked.
        </div>
      </div>
    );
  }
  if (status === 'published') {
    return (
      <div style={styles.bannerPublished}>
        <span style={styles.bannerIcon}>✓</span>
        <div>
          <strong style={styles.bannerStrong}>Published.</strong> Data is visible across HR Dashboards. To make changes, contact an administrator to reopen the submission.
        </div>
      </div>
    );
  }
  return null;
}

function renderHeadcountGrid(fields, values, onChange, readOnly) {
  // Group by subsection; render 2-col rows (manual + computed pairs).
  const bySubsection = {};
  for (const f of fields) {
    const sub = f.subsection || 'default';
    if (!bySubsection[sub]) bySubsection[sub] = [];
    bySubsection[sub].push(f);
  }
  const labels = {
    composition: 'Headcount Composition',
    gender: 'Gender Breakdown',
    location: 'Location Breakdown (HO / OP)',
    turnover: 'Turnover',
    compliance: 'Compliance & HRDF',
  };
  return Object.entries(bySubsection).map(([subKey, subFields]) => (
    <div key={subKey} style={styles.subsection}>
      <div style={styles.subsectionLabel}>{labels[subKey] || subKey}</div>
      <div style={styles.fieldGrid}>
        {subFields.map((f) => (
          <FieldCell key={f.key} field={f} values={values} onChange={onChange} readOnly={readOnly} />
        ))}
      </div>
    </div>
  ));
}

function renderDimensionGrid(section, fields, values, onChange, readOnly) {
  // Group fields by dimensionRow; render as rows with HO/OP columns.
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
            {row.helper && (
              <div style={styles.dimensionRowHelper}>{row.helper}</div>
            )}
          </div>
          {[row.ho, row.op].map((f, i) => (
            f ? (
              <input
                key={f.key}
                type="number"
                style={styles.dimensionInput}
                value={values[f.key] ?? ''}
                onChange={(e) => onChange(f.key, e.target.value)}
                readOnly={readOnly}
                disabled={readOnly}
                inputMode="numeric"
              />
            ) : <div key={i} />
          ))}
        </div>
      ))}
    </>
  );
}

function renderServicesGrid(fields, values, onChange, readOnly) {
  const manualFields = fields.filter((f) => f.source !== 'computed');
  return (
    <div style={styles.servicesGrid}>
      {manualFields.map((f) => (
        <div key={f.key} style={styles.serviceField}>
          <label style={styles.fieldLabel}>
            {f.label}
            {f.helper && <span style={styles.fieldHelper}>{f.helper}</span>}
          </label>
          <input
            type="number"
            style={styles.serviceInput}
            value={values[f.key] ?? ''}
            onChange={(e) => onChange(f.key, e.target.value)}
            readOnly={readOnly}
            disabled={readOnly}
            inputMode="numeric"
          />
        </div>
      ))}
    </div>
  );
}

function renderSectionFooter(section, fields, values) {
  // Find an explicit footer-total field
  const footerField = fields.find((f) => f.isFooterTotal);
  if (!footerField) {
    // Sections without an explicit footer total: render nothing
    return null;
  }
  const computedDisplay = computeField(footerField, values);
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

// =============================================
// FieldCell — single field render (manual or computed)
// =============================================
function FieldCell({ field, values, onChange, readOnly }) {
  const isComputed = field.source === 'computed';
  const display = isComputed ? computeField(field, values) : null;
  const isEmptyComputed = isComputed && display === '—';

  // Build Entry-view inline target helper: "(target: 85%)" per Q3
  const targetHelper = field.target
    ? `(target: ${formatValue(field, field.target.value)})`
    : null;

  return (
    <div style={styles.field}>
      <label style={styles.fieldLabel}>
        {field.label}
        {field.required && <span style={styles.req}>*</span>}
        {targetHelper && (
          <span style={styles.fieldHelper}>{targetHelper}</span>
        )}
        {field.helper && !targetHelper && (
          <span style={styles.fieldHelper}>{field.helper}</span>
        )}
      </label>
      <div style={styles.inputWrap}>
        {isComputed ? (
          <input
            type="text"
            readOnly
            value={display}
            style={{
              ...styles.input,
              ...styles.inputComputed,
              ...(isEmptyComputed ? styles.inputComputedEmpty : {}),
            }}
          />
        ) : (
          <input
            type="number"
            step={field.step || (field.dataType === 'percentage' ? '0.1' : '1')}
            value={values[field.key] ?? ''}
            onChange={(e) => onChange(field.key, e.target.value)}
            readOnly={readOnly}
            disabled={readOnly}
            inputMode="decimal"
            style={styles.input}
          />
        )}
        {field.unit && (
          <span style={styles.unit}>{field.unit}</span>
        )}
      </div>
    </div>
  );
}

// =============================================
// STYLES
// =============================================
const styles = {
  canvas: {
    position: 'relative',
    maxWidth: 1100,
    margin: '24px auto 0',
    padding: '0 48px',
    animation: 'hrFadeInUp 0.5s 0.05s ease both',
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
