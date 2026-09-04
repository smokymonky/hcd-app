// =============================================
// engine/computers.js — Module Engine formula + target helpers
// =============================================
// MODULE ENGINE — Step 2b-2.
//
// This is a DELIBERATE DUPLICATE of the formula map (COMPUTERS), the
// computeField logic, evaluateTarget, and the format helpers from the
// live frontend/src/config/hrOpsFields.js. It exists so the generic
// renderer (ModuleDataEntry) can compute values + evaluate targets
// WITHOUT importing or touching the live HR Ops config — the live module
// must stay byte-identical during the side-by-side parity phase.
//
// Step 3 unifies: once parity is proven, the live module switches to read
// these engine helpers and this duplication is removed. For now, behavior
// here must match the live helpers EXACTLY (same formula keys, same
// tolerance default, same direction handling, same "below target"
// messaging) — parity depends on it.
//
// Formula keys match the config's `formula` names:
//   employee_pct, outsource_pct, female_pct, male_pct,
//   ho_pct, op_pct, total_handled_requests
// =============================================

// =============================================
// COMPUTERS — formula lookup (verbatim from hrOpsFields.js)
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
// formatNumber / formatValue (verbatim from hrOpsFields.js)
// =============================================
export function formatNumber(n) {
  const num = parseFloat(n);
  if (!Number.isFinite(num)) return '—';
  if (Number.isInteger(num)) return num.toLocaleString('en-US');
  return num.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

// Format a value per field type (percentage / currency / number).
// NOTE: the engine config uses `type`; the live config used `dataType`.
// This helper reads `field.type` first and falls back to `field.dataType`
// so it works with either shape (parity-safe).
export function formatValue(field, raw) {
  if (raw === null || raw === undefined || raw === '') return '—';
  const num = parseFloat(raw);
  if (!Number.isFinite(num)) return '—';
  const t = (field && (field.type || field.dataType)) || 'number';
  switch (t) {
    case 'percentage': return `${num.toFixed(1)}%`;
    case 'currency':   return num.toLocaleString('en-US');
    case 'number':
    default:           return Number.isInteger(num) ? num.toLocaleString('en-US') : num.toLocaleString('en-US', { maximumFractionDigits: 1 });
  }
}

// =============================================
// computeField — evaluate a computed field from the values map
// =============================================
// Engine version: reads field.formula (the config's formula name) with a
// fallback to field.computeFormula (live shape) so it's parity-safe.
// Returns the formatted display string ("25.3%", "1,247", "—").
export function computeField(field, values) {
  if (!field || field.source !== 'computed') return null;
  const formulaKey = field.formula || field.computeFormula;
  if (!formulaKey) return null;
  const fn = COMPUTERS[formulaKey];
  if (typeof fn !== 'function') return null;
  const raw = fn(values);
  return formatValue(field, raw);
}

// =============================================
// evaluateTarget (verbatim behavior from hrOpsFields.js)
// =============================================
// Returns one of:
//   { status: 'pass', message: 'Above 85% target' }
//   { status: 'soft-fail', message: '0.5% below 85% target' }
//   { status: 'hard-fail', message: '5% below 85% target' }
//   { status: 'info', message: 'target: 85%' }      (direction='exact')
//   null                                            (no target configured)
//
// tolerance is per-target (field.target.tolerance). When null/undefined,
// falls back to the canonical default 2.0 — identical to live so the
// Saudization indicator reads the same in the preview.
// =============================================
const DEFAULT_TOLERANCE = 2.0;

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
  const tol = (field.target.tolerance == null) ? DEFAULT_TOLERANCE : Number(field.target.tolerance);
  const band = Number.isFinite(tol) && tol >= 0 ? tol : DEFAULT_TOLERANCE;
  const status = magnitude <= band ? 'soft-fail' : 'hard-fail';
  const word = direction === 'above' ? 'below' : 'above';
  return {
    status,
    message: `${formatValue(field, magnitude)} ${word} ${formatValue(field, target)} target`,
  };
}

// =============================================
// Period option builders (verbatim from hrOpsFields.js)
// =============================================
export const SYSTEM_START_YEAR = 2026;

export function buildYearOptions(systemStart = SYSTEM_START_YEAR, refDate = new Date()) {
  const current = refDate.getFullYear();
  const top = current + 1;
  const floor = Math.min(systemStart, current);
  const years = [];
  for (let y = top; y >= floor; y--) years.push(String(y));
  return years.map((y) => ({ value: y, label: y }));
}

export const MONTH_NAMES_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function buildMonthOptions() {
  return MONTH_NAMES_FULL.map((label, i) => ({ value: String(i + 1), label }));
}
