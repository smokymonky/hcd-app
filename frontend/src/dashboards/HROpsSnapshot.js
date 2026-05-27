import React, { useEffect, useMemo, useState } from 'react';
import {
  FIELDS,
  SECTIONS,
  computeField,
  computeSectionHeaderTotal,
  formatNumber,
  evaluateTarget,
} from '../config/hrOpsFields';
import { dashboardsAPI } from '../services/api';
import Dropdown from './Dropdown';
import TargetIndicator from './TargetIndicator';

// =============================================
// HROpsSnapshot
// =============================================
// Phase 2A: read-only display of published HR Ops data.
//
// Rule 13:
//   - variant prop ('full'|'mini') — Phase 6.5 composite uses 'mini'.
//   - Field rendering data-driven from FIELDS config + same COMPUTERS
//     formulas as the Entry form. Single source of truth.
//   - Year + Month split selectors use shared Dropdown component.
//   - TargetIndicator renders inline only when field.target exists.
//     Hidden cleanly otherwise.
// =============================================

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function HROpsSnapshot({ user, variant = 'full' }) {
  // Available published periods: { year: [1..12 month numbers] }
  const [available, setAvailable] = useState({});
  const [selectedYear, setSelectedYear] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);   // 1..12

  // Published submission detail
  const [snapshot, setSnapshot] = useState(null);
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ---------- DISCOVER PUBLISHED PERIODS ----------
  // List all published submissions to populate Year + Month dropdowns.
  useEffect(() => {
    let cancelled = false;
    dashboardsAPI.listSubmissions('HR_OPS', { status: 'published' })
      .then((rows) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        const byYear = {};
        for (const r of list) {
          if (!byYear[r.year]) byYear[r.year] = [];
          byYear[r.year].push(r.month);
        }
        setAvailable(byYear);
        // Default selection: most recent year + month
        const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);
        if (years.length === 0) {
          setSelectedYear(null);
          setSelectedMonth(null);
          setLoading(false);
          return;
        }
        const y = years[0];
        const months = byYear[y].slice().sort((a, b) => b - a);
        setSelectedYear(y);
        setSelectedMonth(months[0]);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[HROpsSnapshot] listSubmissions failed:', err);
        setError(err.message || 'Could not load published submissions.');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // ---------- LOAD SELECTED PUBLISHED MONTH ----------
  useEffect(() => {
    if (!selectedYear || !selectedMonth) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    dashboardsAPI.getPublished('HR_OPS', selectedYear, selectedMonth)
      .then((data) => {
        if (cancelled) return;
        setSnapshot(data);
        // The published endpoint shape is { submission, data, ... } or similar.
        // Defensively map data → values keyed by field_key.
        const arr = data?.data || data?.values || [];
        const v = {};
        if (Array.isArray(arr)) {
          arr.forEach((row) => {
            if (row && row.field_key !== undefined) v[row.field_key] = row.value ?? '';
          });
        } else if (arr && typeof arr === 'object') {
          Object.assign(v, arr);
        }
        setValues(v);
      })
      .catch((err) => {
        if (cancelled) return;
        // 404 here means "no published submission for this period" — handle softly
        console.warn('[HROpsSnapshot] getPublished:', err);
        if (err && /not found|no published/i.test(err.message || '')) {
          setSnapshot(null);
          setValues({});
        } else {
          setError(err.message || 'Could not load snapshot.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedYear, selectedMonth]);

  // ---------- DROPDOWN OPTIONS ----------
  const yearOptions = useMemo(() => {
    const years = Object.keys(available).map(Number).sort((a, b) => b - a);
    if (years.length === 0) {
      return [{ value: String(new Date().getFullYear()), label: String(new Date().getFullYear()) }];
    }
    return years.map((y) => ({ value: String(y), label: String(y) }));
  }, [available]);

  const monthOptions = useMemo(() => {
    const publishedMonths = new Set((available[selectedYear] || []).map(Number));
    return MONTH_NAMES.map((label, idx) => {
      const month = idx + 1;
      const disabled = !publishedMonths.has(month);
      return {
        value: String(month),
        label,
        disabled,
        hint: disabled ? 'Not yet published' : undefined,
      };
    });
  }, [available, selectedYear]);

  // ---------- DERIVED ----------
  const periodLabel = selectedMonth && selectedYear
    ? `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`
    : '—';

  // Top hero KPIs (4 headline numbers)
  const hero = useMemo(() => {
    const totalHc = num(values.total_employees) + num(values.outsource_count);
    const totalServ = (FIELDS
      .filter((f) => f.section === 'services' && f.source !== 'computed')
      .map((f) => num(values[f.key]))
      .reduce((a, b) => a + b, 0)) || 0;
    return {
      headcount: totalHc || null,
      employees: values.total_employees,
      outsource: values.outsource_count,
      saudization: values.saudization_pct,
      turnover: values.turnover_overall_pct,
      turnover_ho: values.turnover_ho_pct,
      turnover_op: values.turnover_op_pct,
      services_total: totalServ || null,
    };
  }, [values]);

  // ---------- RENDER ----------
  return (
    <div style={styles.canvas}>
      {/* Year/Month selector + published stamp */}
      <div style={styles.selector}>
        <span style={styles.selectorLabel}>VIEWING</span>
        <Dropdown
          label="Year"
          value={selectedYear ? String(selectedYear) : ''}
          options={yearOptions}
          onChange={(v) => setSelectedYear(Number(v))}
          width={120}
        />
        <Dropdown
          label="Month"
          value={selectedMonth ? String(selectedMonth) : ''}
          options={monthOptions}
          onChange={(v) => setSelectedMonth(Number(v))}
          width={150}
        />
        {snapshot?.submission && (
          <span style={styles.publishedStamp}>
            <span style={styles.publishedDot} />
            Published {snapshot.submission.updated_at
              ? new Date(snapshot.submission.updated_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
              : ''}
          </span>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div style={styles.errorBanner}>
          {error}
        </div>
      )}

      {/* Empty state — no submissions or no data for period */}
      {!loading && !error && (!snapshot || Object.keys(values).length === 0) && (
        <div style={styles.emptyState}>
          <div style={styles.emptyTitle}>No published submission for {periodLabel}</div>
          <div style={styles.emptySub}>
            {Object.keys(available).length === 0
              ? 'No HR Operations submissions have been published yet. Once an admin publishes a submission, it will appear here.'
              : 'Try selecting a different month or year from the dropdowns above.'}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={styles.loading}>
          <div style={styles.spinner} />
          <style>{`@keyframes hrSnapSpin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Hero KPIs */}
      {!loading && !error && snapshot && Object.keys(values).length > 0 && (
        <>
          <div style={styles.heroGrid}>
            <HeroKpi
              label="Total Headcount"
              value={hero.headcount != null ? formatNumber(hero.headcount) : '—'}
              sub={(
                <>
                  <strong>{formatNumber(hero.employees) || '—'}</strong> employees +{' '}
                  <strong>{formatNumber(hero.outsource) || '—'}</strong> outsource
                </>
              )}
            />
            <HeroKpi
              label="Saudization"
              value={hero.saudization != null ? `${formatNumber(hero.saudization)}%` : '—'}
              valueGold
              extra={
                <TargetIndicator
                  evaluation={evaluateTarget(
                    FIELDS.find((f) => f.key === 'saudization_pct'),
                    hero.saudization,
                  )}
                  style={{ marginTop: 4 }}
                />
              }
            />
            <HeroKpi
              label="Turnover (Overall)"
              value={hero.turnover != null ? `${formatNumber(hero.turnover)}%` : '—'}
              sub={
                <>
                  HO {hero.turnover_ho ? `${formatNumber(hero.turnover_ho)}%` : '—'} ·{' '}
                  OP {hero.turnover_op ? `${formatNumber(hero.turnover_op)}%` : '—'}
                </>
              }
            />
            <HeroKpi
              label="Total Service Requests"
              value={hero.services_total != null ? formatNumber(hero.services_total) : '—'}
              sub="17 service categories"
            />
          </div>

          {/* Section: Composition */}
          {renderCompositionSection(values)}

          {/* Section: Compliance & HRDF */}
          {renderComplianceSection(values)}

          {/* Section: On-Boarding / Off-Boarding (HO/OP side-by-side) */}
          {renderOnOffSection(values)}

          {/* Section: Services (3-col grid) */}
          {renderServicesSection(values)}
        </>
      )}
    </div>
  );
}

// =============================================
// HeroKpi — single big card
// =============================================
function HeroKpi({ label, value, sub, extra, valueGold }) {
  return (
    <div style={styles.heroKpi}>
      <div style={styles.heroAccent} />
      <div style={styles.heroLabel}>{label}</div>
      <div style={{ ...styles.heroValue, ...(valueGold ? { color: '#F3C036' } : {}) }}>{value}</div>
      {sub && <div style={styles.heroSub}>{sub}</div>}
      {extra}
    </div>
  );
}

// =============================================
// Section renderers
// =============================================
function renderCompositionSection(values) {
  return (
    <div style={styles.snapSection}>
      <div style={styles.snapAccent} />
      <div style={styles.snapTitle}>Composition</div>

      <div style={{ ...styles.miniRow, gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <MiniKpi label="Employees" value={formatNumber(values.total_employees)} pct={pctStr(values.total_employees, values.outsource_count)} />
        <MiniKpi label="Outsource" value={formatNumber(values.outsource_count)} pct={pctStr(values.outsource_count, values.total_employees)} />
        <MiniKpi label="Female" value={formatNumber(values.female_count)} pct={pctStr(values.female_count, values.male_count)} />
        <MiniKpi label="Male" value={formatNumber(values.male_count)} pct={pctStr(values.male_count, values.female_count)} />
      </div>

      <div style={styles.hoOpHeader}>
        <div />
        <div style={styles.hoOpColHead}>HO</div>
        <div style={styles.hoOpColHead}>OP</div>
      </div>
      <div style={styles.hoOpRow}>
        <div style={styles.hoOpLabel}>Location count</div>
        <div style={styles.hoOpNum}>
          {formatNumber(values.ho_count)} <span style={styles.hoOpPct}>{pctStr(values.ho_count, values.op_count)}</span>
        </div>
        <div style={styles.hoOpNum}>
          {formatNumber(values.op_count)} <span style={styles.hoOpPct}>{pctStr(values.op_count, values.ho_count)}</span>
        </div>
      </div>
      <div style={styles.hoOpRow}>
        <div style={styles.hoOpLabel}>Turnover</div>
        <div style={styles.hoOpNum}>{values.turnover_ho_pct ? `${formatNumber(values.turnover_ho_pct)}%` : '—'}</div>
        <div style={styles.hoOpNum}>{values.turnover_op_pct ? `${formatNumber(values.turnover_op_pct)}%` : '—'}</div>
      </div>
    </div>
  );
}

function renderComplianceSection(values) {
  const saudField = FIELDS.find((f) => f.key === 'saudization_pct');
  const evaluation = evaluateTarget(saudField, values.saudization_pct);
  return (
    <div style={styles.snapSection}>
      <div style={styles.snapAccent} />
      <div style={styles.snapTitle}>
        Compliance &amp; HRDF
        <span style={styles.snapTitleAccent}>Saudi labor + Gov programs</span>
      </div>
      <div style={{ ...styles.miniRow, gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {/* Saudization — with inline TargetIndicator (Item 6) */}
        <div style={styles.miniKpi}>
          <div style={styles.miniLabel}>Saudization</div>
          <div style={{ ...styles.miniValue, color: '#F3C036' }}>
            {values.saudization_pct ? `${formatNumber(values.saudization_pct)}%` : '—'}
          </div>
          <TargetIndicator evaluation={evaluation} />
        </div>
        {/* HRDF Employees */}
        <MiniKpi label="HRDF Employees" value={formatNumber(values.hrdf_employee_count)} />
        {/* HRDF Amount */}
        <div style={styles.miniKpi}>
          <div style={styles.miniLabel}>HRDF Amount</div>
          <div style={{ ...styles.miniValue, color: '#F3C036' }}>
            {formatNumber(values.hrdf_amount_sr)} <span style={{ ...styles.miniValuePct, color: 'rgba(255,255,255,0.5)' }}>SR</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderOnOffSection(values) {
  const onboardRows = [
    { key: 'new_employee_profiles', label: 'New profiles' },
    { key: 'id_cards_printed', label: 'ID cards printed' },
    { key: 'insurance_enrolled', label: 'Insurance enrolled' },
    { key: 'gosi_qiwa_enrolled', label: 'Gosi / Qiwa enrolled' },
  ];
  const offboardRows = [
    { key: 'clearance', label: 'Clearance' },
    { key: 'medical_removal', label: 'Medical removal' },
    { key: 'gosi_qiwa_removal', label: 'Gosi / Qiwa removal' },
    { key: 'sponsorship_transfer', label: 'Sponsorship transfer' },
  ];
  const onboardTotal = computeSectionHeaderTotal(SECTIONS.find((s) => s.key === 'onboarding'), values);
  const offboardTotal = computeSectionHeaderTotal(SECTIONS.find((s) => s.key === 'offboarding'), values);

  return (
    <div style={styles.snapSection}>
      <div style={styles.snapAccent} />
      <div style={styles.snapTitle}>On-Boarding / Off-Boarding</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div>
          <div style={styles.subSnapTitle}>On-Boarding {onboardTotal != null && `· ${onboardTotal} total`}</div>
          <div style={styles.hoOpHeader}>
            <div />
            <div style={styles.hoOpColHead}>HO</div>
            <div style={styles.hoOpColHead}>OP</div>
          </div>
          {onboardRows.map((r) => (
            <div key={r.key} style={styles.hoOpRow}>
              <div style={styles.hoOpLabel}>{r.label}</div>
              <div style={styles.hoOpNum}>{formatNumber(values[`${r.key}_ho`])}</div>
              <div style={styles.hoOpNum}>{formatNumber(values[`${r.key}_op`])}</div>
            </div>
          ))}
        </div>
        <div>
          <div style={styles.subSnapTitle}>Off-Boarding {offboardTotal != null && `· ${offboardTotal} total`}</div>
          <div style={styles.hoOpHeader}>
            <div />
            <div style={styles.hoOpColHead}>HO</div>
            <div style={styles.hoOpColHead}>OP</div>
          </div>
          {offboardRows.map((r) => (
            <div key={r.key} style={styles.hoOpRow}>
              <div style={styles.hoOpLabel}>{r.label}</div>
              <div style={styles.hoOpNum}>{formatNumber(values[`${r.key}_ho`])}</div>
              <div style={styles.hoOpNum}>{formatNumber(values[`${r.key}_op`])}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function renderServicesSection(values) {
  const fields = FIELDS.filter((f) => f.section === 'services' && f.source !== 'computed')
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const totalField = FIELDS.find((f) => f.key === 'total_handled_requests');
  const totalDisplay = totalField ? computeField(totalField, values) : '—';
  return (
    <div style={styles.snapSection}>
      <div style={styles.snapAccent} />
      <div style={styles.snapTitle}>
        Services
        <span style={styles.snapTitleAccent}>{totalDisplay} total</span>
      </div>
      <div style={styles.servicesGrid}>
        {fields.map((f) => (
          <div key={f.key} style={styles.snapService}>
            <span style={styles.snapServiceLabel}>{f.label}</span>
            <span style={styles.snapServiceValue}>{formatNumber(values[f.key])}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================
// Small components + helpers
// =============================================
function MiniKpi({ label, value, pct }) {
  return (
    <div style={styles.miniKpi}>
      <div style={styles.miniLabel}>{label}</div>
      <div style={styles.miniValue}>
        {value}
        {pct && <span style={styles.miniValuePct}>{pct}</span>}
      </div>
    </div>
  );
}

function num(x) {
  const n = parseFloat(x);
  return Number.isFinite(n) ? n : 0;
}

function pctStr(a, b) {
  const na = num(a);
  const nb = num(b);
  const total = na + nb;
  if (total === 0) return null;
  return `${((na / total) * 100).toFixed(1)}%`;
}

// =============================================
// STYLES
// =============================================
const styles = {
  canvas: {
    position: 'relative', zIndex: 5,
    maxWidth: 1100, margin: '24px auto 0',
    padding: '0 48px',
    animation: 'hrFadeInUp 0.5s 0.05s ease both',
  },

  selector: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.1)',
    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    borderRadius: 16,
    padding: '16px 20px',
    marginBottom: 22,
    display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
  },
  selectorLabel: {
    fontSize: 11, fontWeight: 700,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: '1.5px', textTransform: 'uppercase',
  },
  publishedStamp: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontSize: 11, color: 'rgba(255,255,255,0.5)',
    marginLeft: 'auto',
  },
  publishedDot: {
    width: 6, height: 6, borderRadius: '50%', background: '#22c55e',
  },

  errorBanner: {
    padding: '14px 18px', marginBottom: 14,
    background: 'rgba(239,68,68,0.10)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 12,
    color: '#fca5a5', fontSize: 13,
  },

  emptyState: {
    padding: '60px 32px', textAlign: 'center',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16,
  },
  emptyTitle: {
    fontSize: 18, fontWeight: 600, color: 'rgba(255,255,255,0.85)',
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 13, color: 'rgba(255,255,255,0.5)',
    maxWidth: 500, margin: '0 auto', lineHeight: 1.6,
  },

  loading: {
    minHeight: 300,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  spinner: {
    width: 40, height: 40, border: '4px solid rgba(255,255,255,0.1)',
    borderTopColor: '#F3C036', borderRadius: '50%',
    animation: 'hrSnapSpin 0.8s linear infinite',
  },

  heroGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 14, marginBottom: 22,
  },
  heroKpi: {
    position: 'relative',
    background: 'rgba(255,255,255,0.03)',
    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 14,
    padding: '18px 18px 16px',
    overflow: 'hidden',
  },
  heroAccent: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: 2,
    background: 'linear-gradient(90deg, #F3C036, #ec4899, #a855f7)',
  },
  heroLabel: {
    fontSize: 10, fontWeight: 700,
    letterSpacing: '1.5px', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.55)', marginBottom: 8,
  },
  heroValue: {
    fontSize: 32, fontWeight: 700,
    letterSpacing: '-1px', color: '#fff',
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.05, marginBottom: 4,
  },
  heroSub: {
    fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 500,
  },

  snapSection: {
    background: 'rgba(255,255,255,0.03)',
    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: '22px 24px',
    marginBottom: 18,
    position: 'relative', overflow: 'hidden',
  },
  snapAccent: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: 3,
    background: 'linear-gradient(90deg, #F3C036, #ec4899, #a855f7)',
  },
  snapTitle: {
    fontSize: 14, fontWeight: 700, letterSpacing: '-0.1px',
    marginBottom: 16,
    display: 'flex', alignItems: 'center', gap: 10,
  },
  snapTitleAccent: {
    fontSize: 12, color: '#F3C036', fontWeight: 600,
    background: 'rgba(243,192,54,0.10)',
    padding: '2px 9px', borderRadius: 12,
    marginLeft: 6,
  },
  subSnapTitle: {
    fontSize: 11, fontWeight: 700,
    letterSpacing: '1.5px', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)', marginBottom: 10,
  },

  miniRow: {
    display: 'grid', gap: 12, marginBottom: 14,
  },
  miniKpi: {
    padding: '12px 14px',
    background: 'rgba(0,0,0,0.2)',
    border: '1px solid rgba(255,255,255,0.05)',
    borderRadius: 10,
  },
  miniLabel: {
    fontSize: 10, fontWeight: 700,
    letterSpacing: '1.2px', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.45)', marginBottom: 6,
  },
  miniValue: {
    fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px',
    color: '#fff', fontVariantNumeric: 'tabular-nums',
  },
  miniValuePct: {
    fontSize: 12, fontWeight: 600,
    color: 'rgba(243,192,54,0.85)',
    marginLeft: 6,
  },

  hoOpHeader: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: 12,
    padding: '4px 14px',
  },
  hoOpRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: 12,
    padding: '10px 14px',
    background: 'rgba(0,0,0,0.15)',
    border: '1px solid rgba(255,255,255,0.04)',
    borderRadius: 10, marginBottom: 6, alignItems: 'center',
  },
  hoOpLabel: {
    fontSize: 12.5, fontWeight: 500, color: 'rgba(255,255,255,0.85)',
  },
  hoOpNum: {
    fontSize: 14, fontWeight: 700, color: '#fff',
    textAlign: 'center', fontVariantNumeric: 'tabular-nums',
  },
  hoOpPct: {
    color: 'rgba(243,192,54,0.7)', fontSize: 11, fontWeight: 600,
    marginLeft: 4,
  },
  hoOpColHead: {
    fontSize: 10, fontWeight: 700,
    letterSpacing: '1.5px', textTransform: 'uppercase',
    color: 'rgba(243,192,54,0.6)', textAlign: 'center',
  },

  servicesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 10,
  },
  snapService: {
    background: 'rgba(0,0,0,0.18)',
    border: '1px solid rgba(255,255,255,0.05)',
    borderRadius: 8,
    padding: '10px 12px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 10,
  },
  snapServiceLabel: {
    fontSize: 11.5, color: 'rgba(255,255,255,0.7)',
    fontWeight: 500, lineHeight: 1.3,
  },
  snapServiceValue: {
    fontSize: 15, fontWeight: 700, color: '#fff',
    fontVariantNumeric: 'tabular-nums', flexShrink: 0,
  },
};
