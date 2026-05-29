// =============================================
// hrOpsFields.js — HR Operations Field Config
// =============================================
// Phase 2A — single source of truth for HR Operations module.
//
// Rule 13 patterns:
//   - Field definitions DATA-DRIVEN (this file), not hardcoded in JSX.
//   - Computed formulas reference functions by KEY, not by inlining
//     calculation logic in form components. The form component knows
//     nothing about which formulas exist.
//   - Optional `target` property (Item 6) — field-by-field, hidden
//     when absent, status-aware (pass/soft-fail/hard-fail) when present.
//   - Optional `dimension` grouping for HO/OP table layouts.
//   - Adding/editing/removing a field = touching THIS file only.
//
// Phase 8 migration path (future):
//   When admin UI ships, FIELDS + COMPUTERS + TARGETS each get
//   replaced by API fetches against backend tables. Form components
//   stay unchanged because they read from these exports either way.
// =============================================

// =============================================
// COMPUTERS — formula lookup (Rule 13)
// =============================================
// Each key in COMPUTERS is referenced by `field.computeFormula`.
// Each function receives the full values object `{ field_key: value }`
// and returns either a number, a string (already formatted), or null
// if inputs are insufficient (renders as "—").
//
// All math here. The form never knows what's being computed.
// =============================================
export const COMPUTERS = {
  // Headcount composition
  employee_pct: (v) => pctOfSum(v.total_employees, v.outsource_count),
  outsource_pct: (v) => pctOfSum(v.outsource_count, v.total_employees),

  // Gender breakdown
  female_pct: (v) => pctOfSum(v.female_count, v.male_count),
  male_pct: (v) => pctOfSum(v.male_count, v.female_count),

  // Location breakdown
  ho_pct: (v) => pctOfSum(v.ho_count, v.op_count),
  op_pct: (v) => pctOfSum(v.op_count, v.ho_count),

  // Services total — sum of all 17 service counts
  total_handled_requests: (v) => {
    const keys = [
      'contract_renewal', 'help_desk_request', 'iqama_renewal',
      'flight_ticket_booking', 'letters', 'transfer',
      'disciplinary_actions', 'probation_period_confirmation',
      'termination', 'exit_re_entry', 'letter_attestation',
      'professional_license', 'dependent_medical', 'family_visit',
      'business_visit', 'exit_interviews', 'resignation',
    ];
    let total = 0;
    let allEmpty = true;
    for (const k of keys) {
      const n = toNumber(v[k]);
      if (n !== null) {
        total += n;
        allEmpty = false;
      }
    }
    return allEmpty ? null : total;
  },
};

// Helper: returns pct (numeric) of a / (a+b), or null if either is missing.
function pctOfSum(a, b) {
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na === null || nb === null) return null;
  const total = na + nb;
  if (total === 0) return null;
  return (na / total) * 100;
}

// Helper: parse any input to number or null.
function toNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// =============================================
// FIELDS — field config (the spine of the form)
// =============================================
// Field shape:
//   key            string — DB key, sent to backend as field_key
//   label          string — display label
//   section        string — section.key it belongs to
//   dataType       'number' | 'percentage' | 'currency'
//   required       boolean
//   source         'manual' | 'oracle_fusion' | 'computed'
//   computeFormula string — key in COMPUTERS (only for source='computed')
//   dimension      string | null — 'ho_op' marks HO/OP dimension rows
//   dimensionRow   string | null — parent dimension group row label
//   dimensionCol   'ho' | 'op' | null — column within a dimension row
//   helper         string — small helper text inline with label
//   unit           string — unit shown inside input (%, SR, etc.)
//   step           string — input step attribute (e.g., '0.1')
//   target         object | undefined — see Item 6 Target Indicator
//                  { value, direction: 'above'|'below'|'exact', label }
//   displayOrder   integer — sort order within section
//   active         boolean — show in form
// =============================================
export const FIELDS = [
  // ==========================================
  // SECTION 1 — Head Count & Saudization
  // ==========================================

  // Headcount Composition
  { key: 'total_employees', label: 'Total Employees', section: 'headcount',
    subsection: 'composition',
    dataType: 'number', required: true, source: 'manual',
    displayOrder: 10, active: true },
  { key: 'employee_pct', label: 'Employee %', section: 'headcount',
    subsection: 'composition',
    dataType: 'percentage', source: 'computed', computeFormula: 'employee_pct',
    helper: 'auto-computed',
    displayOrder: 11, active: true },
  { key: 'outsource_count', label: 'Outsource Count', section: 'headcount',
    subsection: 'composition',
    dataType: 'number', required: true, source: 'manual',
    displayOrder: 12, active: true },
  { key: 'outsource_pct', label: 'Outsource %', section: 'headcount',
    subsection: 'composition',
    dataType: 'percentage', source: 'computed', computeFormula: 'outsource_pct',
    helper: 'auto-computed',
    displayOrder: 13, active: true },

  // Gender Breakdown
  { key: 'female_count', label: 'Female Count', section: 'headcount',
    subsection: 'gender',
    dataType: 'number', required: true, source: 'manual',
    displayOrder: 20, active: true },
  { key: 'female_pct', label: 'Female %', section: 'headcount',
    subsection: 'gender',
    dataType: 'percentage', source: 'computed', computeFormula: 'female_pct',
    helper: 'auto-computed',
    displayOrder: 21, active: true },
  { key: 'male_count', label: 'Male Count', section: 'headcount',
    subsection: 'gender',
    dataType: 'number', required: true, source: 'manual',
    displayOrder: 22, active: true },
  { key: 'male_pct', label: 'Male %', section: 'headcount',
    subsection: 'gender',
    dataType: 'percentage', source: 'computed', computeFormula: 'male_pct',
    helper: 'auto-computed',
    displayOrder: 23, active: true },

  // Location Breakdown
  { key: 'ho_count', label: 'Head Office (HO) Count', section: 'headcount',
    subsection: 'location',
    dataType: 'number', required: true, source: 'manual',
    displayOrder: 30, active: true },
  { key: 'ho_pct', label: 'HO %', section: 'headcount',
    subsection: 'location',
    dataType: 'percentage', source: 'computed', computeFormula: 'ho_pct',
    helper: 'auto-computed',
    displayOrder: 31, active: true },
  { key: 'op_count', label: 'Operations (OP) Count', section: 'headcount',
    subsection: 'location',
    dataType: 'number', required: true, source: 'manual',
    displayOrder: 32, active: true },
  { key: 'op_pct', label: 'OP %', section: 'headcount',
    subsection: 'location',
    dataType: 'percentage', source: 'computed', computeFormula: 'op_pct',
    helper: 'auto-computed',
    displayOrder: 33, active: true },

  // Turnover
  { key: 'turnover_overall_pct', label: 'Overall Turnover', section: 'headcount',
    subsection: 'turnover',
    dataType: 'percentage', required: true, source: 'manual', unit: '%', step: '0.1',
    displayOrder: 40, active: true },
  { key: 'turnover_ho_pct', label: 'HO Turnover', section: 'headcount',
    subsection: 'turnover',
    dataType: 'percentage', required: true, source: 'manual', unit: '%', step: '0.1',
    displayOrder: 41, active: true },
  { key: 'turnover_op_pct', label: 'OP Turnover', section: 'headcount',
    subsection: 'turnover',
    dataType: 'percentage', required: true, source: 'manual', unit: '%', step: '0.1',
    displayOrder: 42, active: true },

  // Compliance & HRDF
  // Saudization has the only INITIAL target configured in Phase 2A.
  { key: 'saudization_pct', label: 'Saudization', section: 'headcount',
    subsection: 'compliance',
    dataType: 'percentage', required: true, source: 'manual', unit: '%', step: '0.1',
    target: { value: 85.0, direction: 'above', label: 'KSA labor compliance' },
    displayOrder: 50, active: true },
  { key: 'hrdf_employee_count', label: 'HRDF Employee Count', section: 'headcount',
    subsection: 'compliance',
    dataType: 'number', required: true, source: 'manual',
    displayOrder: 51, active: true },
  { key: 'hrdf_amount_sr', label: 'HRDF Amount', section: 'headcount',
    subsection: 'compliance',
    dataType: 'currency', required: true, source: 'manual', unit: 'SR',
    displayOrder: 52, active: true },

  // ==========================================
  // SECTION 2 — On-Boarding (HO/OP dimension)
  // ==========================================
  { key: 'new_employee_profiles_ho', label: 'New Employee Profile Creation', section: 'onboarding',
    dimension: 'ho_op', dimensionRow: 'new_employee_profiles', dimensionCol: 'ho',
    dataType: 'number', source: 'manual',
    displayOrder: 10, active: true },
  { key: 'new_employee_profiles_op', label: 'New Employee Profile Creation', section: 'onboarding',
    dimension: 'ho_op', dimensionRow: 'new_employee_profiles', dimensionCol: 'op',
    dataType: 'number', source: 'manual',
    displayOrder: 11, active: true },
  { key: 'id_cards_printed_ho', label: 'ID Cards Printed', section: 'onboarding',
    dimension: 'ho_op', dimensionRow: 'id_cards_printed', dimensionCol: 'ho',
    dataType: 'number', source: 'manual',
    displayOrder: 20, active: true },
  { key: 'id_cards_printed_op', label: 'ID Cards Printed', section: 'onboarding',
    dimension: 'ho_op', dimensionRow: 'id_cards_printed', dimensionCol: 'op',
    dataType: 'number', source: 'manual',
    displayOrder: 21, active: true },
  { key: 'insurance_enrolled_ho', label: 'Insurance Enrolled', section: 'onboarding',
    dimension: 'ho_op', dimensionRow: 'insurance_enrolled', dimensionCol: 'ho',
    dataType: 'number', source: 'manual',
    displayOrder: 30, active: true },
  { key: 'insurance_enrolled_op', label: 'Insurance Enrolled', section: 'onboarding',
    dimension: 'ho_op', dimensionRow: 'insurance_enrolled', dimensionCol: 'op',
    dataType: 'number', source: 'manual',
    displayOrder: 31, active: true },
  { key: 'gosi_qiwa_enrolled_ho', label: 'Gosi / Qiwa Enrolled', section: 'onboarding',
    dimension: 'ho_op', dimensionRow: 'gosi_qiwa_enrolled', dimensionCol: 'ho',
    dataType: 'number', source: 'manual',
    rowHelper: 'KSA labor + social insurance registration',
    displayOrder: 40, active: true },
  { key: 'gosi_qiwa_enrolled_op', label: 'Gosi / Qiwa Enrolled', section: 'onboarding',
    dimension: 'ho_op', dimensionRow: 'gosi_qiwa_enrolled', dimensionCol: 'op',
    dataType: 'number', source: 'manual',
    rowHelper: 'KSA labor + social insurance registration',
    displayOrder: 41, active: true },

  // ==========================================
  // SECTION 3 — Off-Boarding (HO/OP dimension)
  // ==========================================
  { key: 'clearance_ho', label: 'Clearance', section: 'offboarding',
    dimension: 'ho_op', dimensionRow: 'clearance', dimensionCol: 'ho',
    dataType: 'number', source: 'manual',
    displayOrder: 10, active: true },
  { key: 'clearance_op', label: 'Clearance', section: 'offboarding',
    dimension: 'ho_op', dimensionRow: 'clearance', dimensionCol: 'op',
    dataType: 'number', source: 'manual',
    displayOrder: 11, active: true },
  { key: 'medical_removal_ho', label: 'Medical Removal', section: 'offboarding',
    dimension: 'ho_op', dimensionRow: 'medical_removal', dimensionCol: 'ho',
    dataType: 'number', source: 'manual',
    displayOrder: 20, active: true },
  { key: 'medical_removal_op', label: 'Medical Removal', section: 'offboarding',
    dimension: 'ho_op', dimensionRow: 'medical_removal', dimensionCol: 'op',
    dataType: 'number', source: 'manual',
    displayOrder: 21, active: true },
  { key: 'gosi_qiwa_removal_ho', label: 'Gosi / Qiwa Removal', section: 'offboarding',
    dimension: 'ho_op', dimensionRow: 'gosi_qiwa_removal', dimensionCol: 'ho',
    dataType: 'number', source: 'manual',
    displayOrder: 30, active: true },
  { key: 'gosi_qiwa_removal_op', label: 'Gosi / Qiwa Removal', section: 'offboarding',
    dimension: 'ho_op', dimensionRow: 'gosi_qiwa_removal', dimensionCol: 'op',
    dataType: 'number', source: 'manual',
    displayOrder: 31, active: true },
  { key: 'sponsorship_transfer_ho', label: 'Sponsorship Transfer', section: 'offboarding',
    dimension: 'ho_op', dimensionRow: 'sponsorship_transfer', dimensionCol: 'ho',
    dataType: 'number', source: 'manual',
    displayOrder: 40, active: true },
  { key: 'sponsorship_transfer_op', label: 'Sponsorship Transfer', section: 'offboarding',
    dimension: 'ho_op', dimensionRow: 'sponsorship_transfer', dimensionCol: 'op',
    dataType: 'number', source: 'manual',
    displayOrder: 41, active: true },

  // ==========================================
  // SECTION 4 — Services (17 + 1 computed)
  // ==========================================
  { key: 'contract_renewal', label: 'Contract Renewal', section: 'services',
    dataType: 'number', source: 'manual', displayOrder: 10, active: true },
  { key: 'help_desk_request', label: 'Help Desk Request', section: 'services',
    dataType: 'number', source: 'manual', displayOrder: 20, active: true },
  { key: 'iqama_renewal', label: 'Iqama Renewal', section: 'services',
    helper: 'KSA residency',
    dataType: 'number', source: 'manual', displayOrder: 30, active: true },
  { key: 'flight_ticket_booking', label: 'Flight Ticket Booking', section: 'services',
    dataType: 'number', source: 'manual', displayOrder: 40, active: true },
  { key: 'letters', label: 'Letters', section: 'services',
    helper: 'official HR letters',
    dataType: 'number', source: 'manual', displayOrder: 50, active: true },
  { key: 'transfer', label: 'Transfer', section: 'services',
    dataType: 'number', source: 'manual', displayOrder: 60, active: true },
  { key: 'disciplinary_actions', label: 'Disciplinary Actions', section: 'services',
    dataType: 'number', source: 'manual', displayOrder: 70, active: true },
  { key: 'probation_period_confirmation', label: 'Probation Confirmation', section: 'services',
    dataType: 'number', source: 'manual', displayOrder: 80, active: true },
  { key: 'termination', label: 'Termination', section: 'services',
    dataType: 'number', source: 'manual', displayOrder: 90, active: true },
  { key: 'exit_re_entry', label: 'Exit / Re-Entry', section: 'services',
    helper: 'KSA visa',
    dataType: 'number', source: 'manual', displayOrder: 100, active: true },
  { key: 'letter_attestation', label: 'Letter Attestation', section: 'services',
    dataType: 'number', source: 'manual', displayOrder: 110, active: true },
  { key: 'professional_license', label: 'Professional License', section: 'services',
    dataType: 'number', source: 'manual', displayOrder: 120, active: true },
  { key: 'dependent_medical', label: 'Dependent Medical', section: 'services',
    dataType: 'number', source: 'manual', displayOrder: 130, active: true },
  { key: 'family_visit', label: 'Family Visit Visa', section: 'services',
    dataType: 'number', source: 'manual', displayOrder: 140, active: true },
  { key: 'business_visit', label: 'Business Visit Visa', section: 'services',
    dataType: 'number', source: 'manual', displayOrder: 150, active: true },
  { key: 'exit_interviews', label: 'Exit Interviews', section: 'services',
    dataType: 'number', source: 'manual', displayOrder: 160, active: true },
  { key: 'resignation', label: 'Resignation', section: 'services',
    dataType: 'number', source: 'manual', displayOrder: 170, active: true },
  // Computed total — section footer (Q4 pattern a) + collapsed header (Q4 pattern c)
  { key: 'total_handled_requests', label: 'Total Handled Requests', section: 'services',
    dataType: 'number', source: 'computed', computeFormula: 'total_handled_requests',
    isFooterTotal: true,
    displayOrder: 999, active: true },
];

// =============================================
// SECTIONS — section metadata + icon SVG paths
// =============================================
// Section icon paths are wrapped at render time inside
// <svg viewBox="0 0 24 24" stroke="currentColor" ...>.
//
// `headerTotalKey` points to the field whose value renders inside the
// section header pill (Q4 bonus pattern: collapsed header totals).
// For aggregate sections without a single computed total field, a
// computed expression is provided via `headerTotalCompute`.
// =============================================
export const SECTIONS = [
  {
    key: 'headcount',
    title: 'Head Count & Saudization',
    iconPath: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>',
    // Header total = total_employees + outsource_count (the 900)
    headerTotalCompute: (v) => sumOrNull([v.total_employees, v.outsource_count]),
    headerTotalLabel: 'total',
  },
  {
    key: 'onboarding',
    title: 'On-Boarding',
    iconPath: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/>',
    // Header total = sum of all 8 onboarding fields
    headerTotalCompute: (v) => sumOrNull([
      v.new_employee_profiles_ho, v.new_employee_profiles_op,
      v.id_cards_printed_ho, v.id_cards_printed_op,
      v.insurance_enrolled_ho, v.insurance_enrolled_op,
      v.gosi_qiwa_enrolled_ho, v.gosi_qiwa_enrolled_op,
    ]),
    headerTotalLabel: 'total',
    dimensionLayout: 'ho_op',                      // signals dimension-grid render
  },
  {
    key: 'offboarding',
    title: 'Off-Boarding',
    iconPath: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>',
    // Header total = sum of all 8 offboarding fields
    headerTotalCompute: (v) => sumOrNull([
      v.clearance_ho, v.clearance_op,
      v.medical_removal_ho, v.medical_removal_op,
      v.gosi_qiwa_removal_ho, v.gosi_qiwa_removal_op,
      v.sponsorship_transfer_ho, v.sponsorship_transfer_op,
    ]),
    headerTotalLabel: 'total',
    dimensionLayout: 'ho_op',
  },
  {
    key: 'services',
    title: 'Services',
    iconPath: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>',
    // Header total = total_handled_requests (computed via COMPUTERS)
    headerTotalKey: 'total_handled_requests',
    headerTotalLabel: 'total',
    servicesLayout: true,                          // 3-col grid render mode
  },
];

// Helper: sum of values, null if all are missing.
function sumOrNull(arr) {
  let total = 0;
  let allEmpty = true;
  for (const v of arr) {
    const n = parseFloat(v);
    if (Number.isFinite(n)) { total += n; allEmpty = false; }
  }
  return allEmpty ? null : total;
}

// =============================================
// Convenience getters used by the form
// =============================================
export function getFieldsForSection(sectionKey) {
  return FIELDS
    .filter((f) => f.active && f.section === sectionKey)
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

export function getSection(sectionKey) {
  return SECTIONS.find((s) => s.key === sectionKey);
}

// Compute a single computed field's value from the current values map.
// Returns the formatted display string ("25.3%", "1,247", "—") or the raw value.
export function computeField(field, values) {
  if (field.source !== 'computed' || !field.computeFormula) return null;
  const fn = COMPUTERS[field.computeFormula];
  if (typeof fn !== 'function') return null;
  const raw = fn(values);
  return formatValue(field, raw);
}

// Compute a section's header total (the collapsed-header pill).
// Returns formatted string or null if not computable.
export function computeSectionHeaderTotal(section, values) {
  if (section.headerTotalKey) {
    // Header total comes from a real field's computed value
    const field = FIELDS.find((f) => f.key === section.headerTotalKey);
    if (field && field.source === 'computed') {
      const fn = COMPUTERS[field.computeFormula];
      const raw = fn ? fn(values) : null;
      return raw == null ? null : formatNumber(raw);
    }
    // Or it's a manual field — return that value as-is
    const v = values[section.headerTotalKey];
    return v == null || v === '' ? null : formatNumber(v);
  }
  if (typeof section.headerTotalCompute === 'function') {
    const raw = section.headerTotalCompute(values);
    return raw == null ? null : formatNumber(raw);
  }
  return null;
}

// Format any number for display.
export function formatNumber(n) {
  const num = parseFloat(n);
  if (!Number.isFinite(num)) return '—';
  if (Number.isInteger(num)) return num.toLocaleString('en-US');
  return num.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

// Format a value per field dataType (percentage / currency / number).
export function formatValue(field, raw) {
  if (raw === null || raw === undefined || raw === '') return '—';
  const num = parseFloat(raw);
  if (!Number.isFinite(num)) return '—';
  switch (field.dataType) {
    case 'percentage': return `${num.toFixed(1)}%`;
    case 'currency':   return num.toLocaleString('en-US');
    case 'number':
    default:           return Number.isInteger(num) ? num.toLocaleString('en-US') : num.toLocaleString('en-US', { maximumFractionDigits: 1 });
  }
}

// =============================================
// Target evaluation (Item 6 — Phase 2A scope)
// =============================================
// Returns one of:
//   { status: 'pass', message: 'Above 85% target' }
//   { status: 'soft-fail', message: '0.5% below 85% target' }
//   { status: 'hard-fail', message: '5% below 85% target' }
//   { status: 'info', message: 'target: 85%' }      (direction='exact')
//   null                                            (no target configured)
//
// Threshold for soft-fail vs hard-fail: within 2% of target = soft, beyond = hard.
// This is intentionally a magic number (2.0) for Phase 2A simplicity;
// Phase 2B admin UI may surface this as a per-target setting later.
// =============================================
const SOFT_FAIL_BAND = 2.0;

export function evaluateTarget(field, rawValue) {
  if (!field || !field.target) return null;
  const actual = parseFloat(rawValue);
  if (!Number.isFinite(actual)) return null;
  const { value: target, direction } = field.target;
  const delta = actual - target;

  if (direction === 'exact') {
    return { status: 'info', message: `target: ${formatValue(field, target)}` };
  }

  // direction === 'above'  → pass when actual >= target
  // direction === 'below'  → pass when actual <= target
  const pass = direction === 'above' ? delta >= 0 : delta <= 0;
  if (pass) {
    const word = direction === 'above' ? 'Above' : 'Below';
    return { status: 'pass', message: `${word} ${formatValue(field, target)} target` };
  }

  const magnitude = Math.abs(delta);
  const status = magnitude <= SOFT_FAIL_BAND ? 'soft-fail' : 'hard-fail';
  const word = direction === 'above' ? 'below' : 'above';
  return {
    status,
    message: `${formatValue({ ...field, dataType: field.dataType }, magnitude)} ${word} ${formatValue(field, target)} target`,
  };
}

// =============================================
// SYSTEM_START_YEAR + buildYearOptions (Phase 2A Extension)
// =============================================
// The HR Dashboards system began operating in 2026. There is no data
// for any prior year, and no legitimate workflow requires entering
// data for years before the system existed. The Year dropdown floors
// here, preventing phantom historical entry.
//
// Rule 13: declared as a constant so future modules (TA, L&D, HR_SYS)
// inherit the same floor without redeclaring. When Phase 8 admin UI
// allows per-module overrides, this becomes a default that can be
// shadowed by per-module config — but the FORM components still call
// buildYearOptions() with whatever floor applies.
// =============================================
export const SYSTEM_START_YEAR = 2026;

// Returns descending list of year strings: [currentYear+1, currentYear, ..., systemStart].
// Always includes one year forward so users can prep next year's first
// submission in late December without the dropdown blocking them.
export function buildYearOptions(systemStart = SYSTEM_START_YEAR, refDate = new Date()) {
  const current = refDate.getFullYear();
  const top = current + 1;
  const floor = Math.min(systemStart, current);   // safety if system start ever falls after current
  const years = [];
  for (let y = top; y >= floor; y--) years.push(String(y));
  return years.map((y) => ({ value: y, label: y }));
}

// Month options — all 12 months, always selectable in Entry view.
// (Snapshot view applies its own "Not yet published" mask on top of this.)
export const MONTH_NAMES_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function buildMonthOptions() {
  return MONTH_NAMES_FULL.map((label, i) => ({ value: String(i + 1), label }));
}
