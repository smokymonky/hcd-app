import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { dashboardsAPI, workflowAPI } from '../services/api';

// =============================================
// ApprovalsManager — Phase 2C admin Approvals tab
// =============================================
// Single place for admin to move any module submission through its
// lifecycle. Lives inside AdminPage as the 4th tab (✅ Approvals).
//
// Queue source: GET /api/dashboards/admin-queue — all non-draft,
// non-rejected submissions across modules (submitted, head_reviewed,
// director_reviewed, approved, published).
//
// Three status groups per approved mockup v1:
//   Awaiting your review  → submitted / head_reviewed / director_reviewed
//   Ready to publish      → approved
//   Published             → published
//
// Per-row actions (admin OVERRIDE — no multi-role ladder, that's Phase 8):
//   awaiting  → [Approve] [Reject]
//   approved  → [Publish] [Reject]
//   published → [Reopen]
//
// Approve/Publish: small confirm modal (no reason).
// Reject/Reopen: modal with REQUIRED reason (backend enforces non-empty).
//
// BULK APPROVE (Phase 2C scope): checkboxes on "Awaiting your review"
// rows only + section select-all. Loops the selected ids through the
// EXISTING single workflowAPI.adminApprove sequentially — no bulk
// endpoint. Progress + per-item result summary. No bulk publish/reject.
//
// MODALS: all render via createPortal(document.body) per Principle
// 6B.11 — the cosmic backdrop-filter ancestors trap position:fixed
// (same lesson as EditTargetModal). X + Esc + backdrop-click + body
// scroll-lock, mirroring EditTargetModal's implementation.
// =============================================

const TARGET_TYPE = 'dashboard_submission';

const AWAITING_STATUSES = ['submitted', 'head_reviewed', 'director_reviewed'];

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Canonical status meta — Principle 6B.6 palette
const STATUS_META = {
  submitted: {
    label: 'Submitted',
    color: '#93c5fd', dot: '#60a5fa',
    bg: 'rgba(96,165,250,0.10)', border: 'rgba(96,165,250,0.35)',
  },
  head_reviewed: {
    label: 'Head reviewed',
    color: '#c4b5fd', dot: '#a78bfa',
    bg: 'rgba(168,85,247,0.10)', border: 'rgba(168,85,247,0.35)',
  },
  director_reviewed: {
    label: 'Director reviewed',
    color: '#fbcfe8', dot: '#ec4899',
    bg: 'rgba(236,72,153,0.10)', border: 'rgba(236,72,153,0.35)',
  },
  approved: {
    label: 'Approved',
    color: '#F3C036', dot: '#F3C036',
    bg: 'rgba(243,192,54,0.10)', border: 'rgba(243,192,54,0.40)',
  },
  published: {
    label: 'Published',
    color: '#86efac', dot: '#22c55e',
    bg: 'rgba(34,197,94,0.10)', border: 'rgba(34,197,94,0.40)',
  },
};

function periodLabel(row) {
  return `${MONTH_NAMES[row.month] || row.month} ${row.year}`;
}

function timeAgo(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const secs = Math.floor((Date.now() - then) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

// =============================================
// ApprovalsManager component
// =============================================
export default function ApprovalsManager() {
  const [queue, setQueue] = useState([]);
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

  // Single-row action modal: { kind: 'approve'|'publish'|'reject'|'reopen', row } | null
  const [action, setAction] = useState(null);

  // Bulk approve state
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkRun, setBulkRun] = useState(null);
  // bulkRun: { total, done, current: label|null, results: [{id,label,ok,error}] , finished: bool }

  // Toast
  const [toast, setToast] = useState(null);

  // ---------- LOAD ----------
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    dashboardsAPI.getAdminQueue()
      .then((rows) => {
        if (cancelled) return;
        setQueue(Array.isArray(rows) ? rows : []);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[ApprovalsManager] queue load failed:', err);
        setLoadError(err && err.message ? err.message : 'Could not load the approvals queue.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshTick]);

  // Prune selection when queue refreshes (rows may have left "awaiting")
  useEffect(() => {
    setSelectedIds((prev) => {
      const stillAwaiting = new Set(
        queue.filter((r) => AWAITING_STATUSES.includes(r.status)).map((r) => r.id)
      );
      const next = new Set([...prev].filter((id) => stillAwaiting.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [queue]);

  // ---------- DERIVED ----------
  const groups = useMemo(() => {
    const awaiting = queue.filter((r) => AWAITING_STATUSES.includes(r.status));
    const ready = queue.filter((r) => r.status === 'approved');
    const published = queue.filter((r) => r.status === 'published');
    return { awaiting, ready, published };
  }, [queue]);

  const actionableCount = groups.awaiting.length + groups.ready.length;
  const allAwaitingSelected = groups.awaiting.length > 0
    && groups.awaiting.every((r) => selectedIds.has(r.id));

  // ---------- HANDLERS ----------
  function showToast(type, text) {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4500);
  }

  function refresh() { setRefreshTick((n) => n + 1); }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      if (allAwaitingSelected) return new Set();
      return new Set(groups.awaiting.map((r) => r.id));
    });
  }

  // Single-row actions — commit against the workflow API then refresh.
  async function commitAction(kind, row, reason) {
    if (kind === 'approve') {
      await workflowAPI.adminApprove(TARGET_TYPE, row.id, reason || null);
      showToast('success', `Approved: ${row.module_code} ${periodLabel(row)}.`);
    } else if (kind === 'publish') {
      await workflowAPI.adminPublish(TARGET_TYPE, row.id, reason || null);
      showToast('success', `Published: ${row.module_code} ${periodLabel(row)} — now live on the Snapshot.`);
    } else if (kind === 'reject') {
      await workflowAPI.adminReject(TARGET_TYPE, row.id, reason);
      showToast('success', `Rejected: ${row.module_code} ${periodLabel(row)} — returned to owner.`);
    } else if (kind === 'reopen') {
      await workflowAPI.adminReopen(TARGET_TYPE, row.id, reason);
      showToast('success', `Reopened: ${row.module_code} ${periodLabel(row)} — rolled back for edits.`);
    }
    setAction(null);
    refresh();
  }

  // Bulk approve — sequential loop through the EXISTING single-approve
  // endpoint. Continues past failures, reports per-item results.
  async function runBulkApprove() {
    const rows = groups.awaiting.filter((r) => selectedIds.has(r.id));
    if (rows.length === 0) return;
    setBulkConfirmOpen(false);
    const run = { total: rows.length, done: 0, current: null, results: [], finished: false };
    setBulkRun({ ...run });
    for (const row of rows) {
      const label = `${row.module_code} ${periodLabel(row)}`;
      run.current = label;
      setBulkRun({ ...run });
      try {
        await workflowAPI.adminApprove(TARGET_TYPE, row.id, null);
        run.results.push({ id: row.id, label, ok: true });
      } catch (err) {
        run.results.push({
          id: row.id, label, ok: false,
          error: err && err.message ? err.message : 'Unknown error',
        });
      }
      run.done += 1;
      setBulkRun({ ...run });
    }
    run.current = null;
    run.finished = true;
    setBulkRun({ ...run });
    setSelectedIds(new Set());
    refresh();
  }

  function closeBulkResults() { setBulkRun(null); }

  // ---------- RENDER ----------
  return (
    <div style={styles.stage}>
      <style>{`
        @keyframes amFadeInUp { from { opacity:0; transform: translateY(20px);} to { opacity:1; transform: translateY(0);} }
        @keyframes amSpin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Toolbar */}
      <div style={{ ...styles.toolbar, ...(isMobile ? styles.toolbarMobile : {}) }}>
        <div style={styles.toolbarLeft}>
          <span style={styles.toolbarHeading}>
            Submission Approvals
            {!loading && !loadError && (
              <span style={styles.toolbarCount}>
                {queue.length} total · {actionableCount} actionable
              </span>
            )}
          </span>
          {!isMobile && <span style={styles.toolbarFilterSlot}>(filter / module · search — coming later)</span>}
        </div>
        {!isMobile && (
          <div style={styles.legend}>
            {Object.entries(STATUS_META).map(([key, meta]) => (
              <span key={key} style={styles.legendItem}>
                <span style={{ ...styles.legendDot, background: meta.dot }} />
                {meta.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={toast.type === 'success' ? styles.toastSuccess : styles.toastError}>
          {toast.text}
        </div>
      )}

      {/* Error */}
      {loadError && (
        <div style={styles.errorBanner}>
          {loadError}
          <button type="button" style={styles.retryBtn} onClick={refresh}>Retry</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={styles.loading}><div style={styles.spinner} /></div>
      )}

      {/* Full empty state */}
      {!loading && !loadError && queue.length === 0 && (
        <div style={styles.emptyStage}>
          <div style={styles.emptyIcon}>
            <svg width="30" height="30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <div style={styles.emptyTitle}>No submissions yet</div>
          <div style={styles.emptySub}>
            Months appear here once an owner submits data. New work lands in
            "Awaiting your review" automatically — no refresh needed beyond
            revisiting this tab.
          </div>
        </div>
      )}

      {/* Bulk selection bar (floats above the awaiting section when active) */}
      {!loading && !loadError && selectedIds.size > 0 && (
        <div style={{ ...styles.bulkBar, ...(isMobile ? styles.bulkBarMobile : {}) }}>
          <span style={styles.bulkBarText}>
            <strong>{selectedIds.size}</strong> selected
          </span>
          <div style={{ display: 'inline-flex', gap: 8, ...(isMobile ? { width: '100%' } : {}) }}>
            <button type="button" style={{ ...styles.bulkClearBtn, ...(isMobile ? styles.bulkBtnMobile : {}) }} onClick={() => setSelectedIds(new Set())}>
              Clear
            </button>
            <button type="button" style={{ ...styles.bulkApproveBtn, ...(isMobile ? styles.bulkBtnMobile : {}) }} onClick={() => setBulkConfirmOpen(true)}>
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
              Approve all
            </button>
          </div>
        </div>
      )}

      {/* Groups */}
      {!loading && !loadError && queue.length > 0 && (
        <>
          <SectionCard
            variant="awaiting"
            isMobile={isMobile}
            title="Awaiting your review"
            subtitle="Submitted by owners — admin can approve or reject directly (override)."
            icon={
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            }
            headerRight={groups.awaiting.length > 0 && (
              <label style={styles.selectAllLabel}>
                <input
                  type="checkbox"
                  checked={allAwaitingSelected}
                  onChange={toggleSelectAll}
                  style={styles.checkbox}
                />
                Select all
              </label>
            )}
          >
            {groups.awaiting.length === 0 ? (
              <div style={styles.sectionEmpty}>Nothing awaiting review right now.</div>
            ) : groups.awaiting.map((row) => (
              <QueueRow
                key={row.id}
                row={row}
                isMobile={isMobile}
                selectable
                selected={selectedIds.has(row.id)}
                onToggleSelect={() => toggleSelect(row.id)}
                actions={[
                  { kind: 'approve', label: 'Approve', style: styles.btnApprove, icon: CheckIcon },
                  { kind: 'reject', label: 'Reject', style: styles.btnReject, icon: XIcon },
                ]}
                onAction={(kind) => setAction({ kind, row })}
              />
            ))}
          </SectionCard>

          <SectionCard
            variant="ready"
            isMobile={isMobile}
            title="Ready to publish"
            subtitle="Approved by the workflow — one click + confirm sends it to the live Snapshot."
            icon={
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 12V4m0 0L8 12m8-8l8 8M3 20h18"/></svg>
            }
          >
            {groups.ready.length === 0 ? (
              <div style={styles.sectionEmpty}>Nothing approved and waiting to publish.</div>
            ) : groups.ready.map((row) => (
              <QueueRow
                key={row.id}
                row={row}
                isMobile={isMobile}
                actions={[
                  { kind: 'publish', label: 'Publish', style: styles.btnPublish, icon: PublishIcon },
                  { kind: 'reject', label: 'Reject', style: styles.btnReject, icon: XIcon },
                ]}
                onAction={(kind) => setAction({ kind, row })}
              />
            ))}
          </SectionCard>

          <SectionCard
            variant="published"
            isMobile={isMobile}
            title="Published"
            subtitle="Live on the Snapshot — viewers can see these periods. Reopen requires a reason."
            icon={
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
            }
          >
            {groups.published.length === 0 ? (
              <div style={styles.sectionEmpty}>Nothing published yet.</div>
            ) : groups.published.map((row) => (
              <QueueRow
                key={row.id}
                row={row}
                isMobile={isMobile}
                actions={[
                  { kind: 'reopen', label: 'Reopen', style: styles.btnReopen, icon: ReopenIcon },
                ]}
                onAction={(kind) => setAction({ kind, row })}
              />
            ))}
          </SectionCard>

          <div style={styles.infoNote}>
            <strong>Other modules:</strong> Talent Acquisition, Learning &amp;
            Development, and HR Systems have no submissions yet (modules ship
            in later phases). When they do, their submissions appear here
            automatically — same admin actions, same layout.
          </div>
        </>
      )}

      {/* Single-row action modal */}
      <ActionModal
        action={action}
        onClose={() => setAction(null)}
        onCommit={commitAction}
      />

      {/* Bulk confirm modal */}
      <BulkConfirmModal
        open={bulkConfirmOpen}
        count={selectedIds.size}
        onClose={() => setBulkConfirmOpen(false)}
        onConfirm={runBulkApprove}
      />

      {/* Bulk progress/results modal */}
      <BulkProgressModal run={bulkRun} onClose={closeBulkResults} />
    </div>
  );
}

// =============================================
// SectionCard
// =============================================
function SectionCard({ variant, title, subtitle, icon, headerRight, isMobile = false, children }) {
  const accentByVariant = {
    awaiting: 'linear-gradient(90deg, #60a5fa, #a78bfa, #ec4899)',
    ready: 'linear-gradient(90deg, #F3C036, #fbbf24, #ec4899)',
    published: 'linear-gradient(90deg, #22c55e, #34d399, #86efac)',
  };
  const iconStyleByVariant = {
    awaiting: { background: 'rgba(96,165,250,0.12)', color: '#93c5fd' },
    ready: { background: 'rgba(243,192,54,0.12)', color: '#F3C036' },
    published: { background: 'rgba(34,197,94,0.12)', color: '#86efac' },
  };
  return (
    <div style={{ ...styles.sectionCard, ...(isMobile ? styles.sectionCardMobile : {}) }}>
      <div style={{ ...styles.sectionAccent, background: accentByVariant[variant] }} />
      <div style={{ ...styles.sectionHeader, ...(isMobile ? styles.sectionHeaderMobile : {}) }}>
        <div style={styles.sectionHeaderLeft}>
          <div style={{ ...styles.sectionHeaderIcon, ...iconStyleByVariant[variant] }}>
            {icon}
          </div>
          <div>
            <div style={styles.sectionHeaderTitle}>{title}</div>
            <div style={styles.sectionHeaderSub}>{subtitle}</div>
          </div>
        </div>
        {headerRight || null}
      </div>
      <div style={styles.sectionBody}>{children}</div>
    </div>
  );
}

// =============================================
// QueueRow
// =============================================
function QueueRow({ row, isMobile = false, selectable = false, selected = false, onToggleSelect, actions, onAction }) {
  const meta = STATUS_META[row.status] || STATUS_META.submitted;
  const metaLine = buildMetaLine(row);

  // POLISH — mobile: stacked layout (module+period+checkbox header line /
  // status pill / owner+meta / actions full-width ≥40px). No horizontal scroll.
  if (isMobile) {
    return (
      <div style={{ ...styles.row, ...styles.rowMobile, ...(selected ? styles.rowSelected : {}) }}>
        <div style={styles.rowMobileHead}>
          {selectable && (
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              style={{ ...styles.checkbox, ...styles.checkboxMobile }}
              aria-label={`Select ${row.module_code} ${periodLabel(row)}`}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={styles.rowModuleCode}>
              {row.module_code}
              <span style={styles.rowMobilePeriod}>{periodLabel(row)}</span>
            </div>
            <div style={styles.rowModuleName}>{row.module_name || ''}</div>
          </div>
        </div>
        <div>
          <span style={{
            ...styles.statusPill,
            color: meta.color, background: meta.bg, borderColor: meta.border,
          }}>
            <span style={{ ...styles.statusDot, background: meta.dot }} />
            {meta.label}
          </span>
        </div>
        <div style={styles.rowOwner}>
          <div style={{ ...styles.rowOwnerWho, whiteSpace: 'normal' }}>
            {row.owner_name || `user #${row.created_by || '?'}`}
            {row.owner_role && <span style={styles.roleTag}>{row.owner_role}</span>}
          </div>
          <div style={styles.rowOwnerMeta}>{metaLine}</div>
        </div>
        <div style={styles.rowActionsMobile}>
          {actions.map((a) => (
            <button
              key={a.kind}
              type="button"
              style={{ ...styles.btnAct, ...a.style, ...styles.btnActMobile }}
              onClick={() => onAction(a.kind)}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...styles.row, ...(selected ? styles.rowSelected : {}) }}>
      {selectable ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          style={styles.checkbox}
          aria-label={`Select ${row.module_code} ${periodLabel(row)}`}
        />
      ) : (
        <span style={styles.checkboxSpacer} />
      )}
      <div style={styles.rowModule}>
        <div style={styles.rowModuleCode}>{row.module_code}</div>
        <div style={styles.rowModuleName}>{row.module_name || ''}</div>
      </div>
      <div style={styles.rowPeriod}>
        {MONTH_NAMES[row.month] || row.month}
        <span style={styles.rowPeriodYear}>{row.year}</span>
      </div>
      <div>
        <span style={{
          ...styles.statusPill,
          color: meta.color, background: meta.bg, borderColor: meta.border,
        }}>
          <span style={{ ...styles.statusDot, background: meta.dot }} />
          {meta.label}
        </span>
      </div>
      <div style={styles.rowOwner}>
        <div style={styles.rowOwnerWho}>
          {row.owner_name || `user #${row.created_by || '?'}`}
          {row.owner_role && <span style={styles.roleTag}>{row.owner_role}</span>}
        </div>
        <div style={styles.rowOwnerMeta}>{metaLine}</div>
      </div>
      <div style={styles.rowActions}>
        {actions.map((a) => (
          <button
            key={a.kind}
            type="button"
            style={{ ...styles.btnAct, ...a.style }}
            onClick={() => onAction(a.kind)}
          >
            {a.icon}
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function buildMetaLine(row) {
  const parts = [];
  if (row.last_action_at) {
    const who = row.last_action_by_name ? `by ${row.last_action_by_name} ` : '';
    parts.push(`Last action ${who}· ${timeAgo(row.last_action_at)}`);
  } else if (row.updated_at) {
    parts.push(`Updated ${timeAgo(row.updated_at)}`);
  }
  parts.push(`#SUB-${row.id}`);
  return parts.join(' · ');
}

// =============================================
// Icons (inline SVG helpers)
// =============================================
const CheckIcon = (
  <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
);
const XIcon = (
  <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
);
const PublishIcon = (
  <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16 12V4m0 0L8 12m8-8l8 8M3 20h18"/></svg>
);
const ReopenIcon = (
  <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
);

// =============================================
// MODAL SHELL — portal + Esc + backdrop-click + X + body lock.
// Mirrors EditTargetModal's implementation (Principle 6B.11).
// =============================================
function ModalShell({ open, busy, onClose, accent, maxWidth = 520, children }) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape' && !busy) {
        e.stopPropagation();
        onClose && onClose();
      }
    }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, busy, onClose]);

  if (!open) return null;

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget && !busy) onClose && onClose();
  }

  return createPortal(
    <div style={styles.backdrop} onClick={handleBackdropClick} role="dialog" aria-modal="true">
      <div style={{ ...styles.modalCard, maxWidth }}>
        <div style={{ ...styles.modalAccent, background: accent }} />
        {children}
      </div>
    </div>,
    document.body
  );
}

function ModalCloseButton({ onClose, busy }) {
  return (
    <button
      type="button"
      aria-label="Close"
      style={{ ...styles.modalClose, ...(busy ? styles.modalCloseDisabled : {}) }}
      onClick={onClose}
      disabled={busy}
      onMouseEnter={(e) => {
        if (busy) return;
        e.currentTarget.style.background = 'rgba(239,68,68,0.12)';
        e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)';
        e.currentTarget.style.color = '#fca5a5';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
        e.currentTarget.style.color = 'rgba(255,255,255,0.6)';
      }}
    >
      ✕
    </button>
  );
}

// =============================================
// ActionModal — single-row Approve / Publish / Reject / Reopen.
// Approve + Publish: small confirm, no reason.
// Reject + Reopen: REQUIRED reason textarea (backend enforces).
// =============================================
const ACTION_META = {
  approve: {
    title: (row) => `Approve ${row.module_code} · ${periodLabel(row)}?`,
    accent: 'linear-gradient(90deg, #22c55e, #4ade80, #86efac)',
    reasonRequired: false,
    confirmLabel: 'Approve',
    confirmStyle: { background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', color: '#fff', boxShadow: '0 6px 24px rgba(34,197,94,0.30)' },
    body: (row) => (
      <>
        <p style={styles.modalP}>
          <strong style={styles.modalStrong}>{row.module_name || row.module_code} — {periodLabel(row)}</strong>{' '}
          (currently <em>{(STATUS_META[row.status] || {}).label || row.status}</em>) will move to{' '}
          <strong style={styles.modalStrong}>approved</strong>. You can publish it from this same tab once approved.
        </p>
        <p style={styles.modalPFaint}>
          No reason needed — the action is recorded in the workflow history with your name automatically.
        </p>
      </>
    ),
  },
  publish: {
    title: (row) => `Publish ${row.module_code} · ${periodLabel(row)}?`,
    accent: 'linear-gradient(90deg, #22c55e, #4ade80, #86efac)',
    reasonRequired: false,
    confirmLabel: 'Publish',
    confirmStyle: { background: 'linear-gradient(135deg, #34d399 0%, #22c55e 100%)', color: '#fff', boxShadow: '0 6px 24px rgba(34,197,94,0.35)' },
    body: (row) => (
      <>
        <p style={styles.modalP}>
          Publishing makes <strong style={styles.modalStrong}>{row.module_name || row.module_code} — {periodLabel(row)}</strong>{' '}
          visible on the live Snapshot for all viewers. You can reverse this later with a Reopen (reason required).
        </p>
        <p style={styles.modalPFaint}>
          Action recorded in workflow history. Snapshot's latest-published period picks this up on the next page load.
        </p>
      </>
    ),
  },
  reject: {
    title: () => 'Reject submission',
    subtitle: 'Send this submission back to its owner for revision. The reason is recorded in the workflow history and visible to the owner.',
    accent: 'linear-gradient(90deg, #ef4444, #f87171, #fca5a5)',
    reasonRequired: true,
    reasonLabel: 'Reason for rejection',
    reasonPlaceholder: 'e.g. Saudization figure inconsistent with HRDF letter; please verify and resubmit.',
    reasonHelper: 'Required. The owner will see this reason when they reopen the submission for edits.',
    confirmLabel: 'Reject submission',
    confirmStyle: { background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', color: '#fff', boxShadow: '0 6px 24px rgba(239,68,68,0.30)' },
  },
  reopen: {
    title: () => 'Reopen published submission',
    subtitle: "Roll this period back for edits. The live Snapshot's latest-published view will revert to the prior published month.",
    accent: 'linear-gradient(90deg, #F3C036, #fbbf24, #ec4899)',
    reasonRequired: true,
    reasonLabel: 'Reason for reopening',
    reasonPlaceholder: 'e.g. Saudization correction needed after audit; reopening for owner to amend.',
    reasonHelper: 'Required. The reason is recorded in the workflow history and visible to the owner when they re-edit.',
    confirmLabel: 'Reopen submission',
    confirmStyle: { background: 'linear-gradient(135deg, #F3C036 0%, #ec4899 100%)', color: '#1a1028', boxShadow: '0 6px 24px rgba(243,192,54,0.30)', fontWeight: 700 },
  },
};

function ActionModal({ action, onClose, onCommit }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const textareaRef = useRef(null);

  const open = !!action;
  const meta = action ? ACTION_META[action.kind] : null;

  useEffect(() => {
    if (open) {
      setReason('');
      setBusy(false);
      setError(null);
      if (meta && meta.reasonRequired) {
        setTimeout(() => {
          if (textareaRef.current) textareaRef.current.focus();
        }, 50);
      }
    }
  }, [open, meta]);

  if (!open || !meta) return null;

  const { row } = action;
  const reasonOk = !meta.reasonRequired || reason.trim().length > 0;

  function handleConfirm() {
    if (!reasonOk || busy) return;
    setError(null);
    setBusy(true);
    Promise.resolve()
      .then(() => onCommit(action.kind, row, meta.reasonRequired ? reason.trim() : null))
      .catch((err) => {
        setError(err && err.message ? err.message : 'Action failed.');
        setBusy(false);
      });
  }

  return (
    <ModalShell
      open={open}
      busy={busy}
      onClose={onClose}
      accent={meta.accent}
      maxWidth={meta.reasonRequired ? 520 : 440}
    >
      <div style={styles.modalHeader}>
        <div style={styles.modalHeaderText}>
          <div style={styles.modalTitle}>{meta.title(row)}</div>
          {meta.subtitle && <div style={styles.modalSubtitle}>{meta.subtitle}</div>}
        </div>
        <ModalCloseButton onClose={onClose} busy={busy} />
      </div>

      <div style={styles.modalBody}>
        {meta.reasonRequired ? (
          <>
            <div style={styles.ctxPill}>
              <CtxBlock label="Module" value={row.module_name || row.module_code} />
              <div style={styles.ctxSep} />
              <CtxBlock label="Period" value={periodLabel(row)} />
              <div style={styles.ctxSep} />
              <CtxBlock label="Status" value={(STATUS_META[row.status] || {}).label || row.status} />
              <div style={styles.ctxSep} />
              <CtxBlock label="Owner" value={row.owner_name || `user #${row.created_by || '?'}`} />
            </div>
            <div style={styles.modalRow}>
              <label style={styles.modalLabel}>
                {meta.reasonLabel} <span style={styles.req}>*</span>
              </label>
              <textarea
                ref={textareaRef}
                style={styles.textarea}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={meta.reasonPlaceholder}
                rows={4}
              />
              <div style={styles.modalHelper}>{meta.reasonHelper}</div>
            </div>
          </>
        ) : (
          meta.body(row)
        )}
        {error && <div style={styles.errorBox}>{error}</div>}
      </div>

      <div style={styles.modalFooter}>
        <button type="button" style={styles.btnGhost} onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          style={{ ...styles.btnConfirm, ...meta.confirmStyle, ...((!reasonOk || busy) ? styles.btnConfirmDisabled : {}) }}
          onClick={handleConfirm}
          disabled={!reasonOk || busy}
        >
          {busy ? 'Working…' : meta.confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}

function CtxBlock({ label, value }) {
  return (
    <div style={styles.ctxBlock}>
      <div style={styles.ctxLabel}>{label}</div>
      <div style={styles.ctxValue}>{value}</div>
    </div>
  );
}

// =============================================
// BulkConfirmModal — "Approve N submissions?"
// =============================================
function BulkConfirmModal({ open, count, onClose, onConfirm }) {
  if (!open) return null;
  return (
    <ModalShell
      open={open}
      busy={false}
      onClose={onClose}
      accent="linear-gradient(90deg, #22c55e, #4ade80, #86efac)"
      maxWidth={440}
    >
      <div style={styles.modalHeader}>
        <div style={styles.modalHeaderText}>
          <div style={styles.modalTitle}>Approve {count} submission{count === 1 ? '' : 's'}?</div>
        </div>
        <ModalCloseButton onClose={onClose} busy={false} />
      </div>
      <div style={styles.modalBody}>
        <p style={styles.modalP}>
          Each selected submission will be approved one at a time through the
          standard workflow. You'll see progress and a per-item result summary.
        </p>
        <p style={styles.modalPFaint}>
          If one fails, the rest continue — nothing is rolled back.
        </p>
      </div>
      <div style={styles.modalFooter}>
        <button type="button" style={styles.btnGhost} onClick={onClose}>Cancel</button>
        <button
          type="button"
          style={{ ...styles.btnConfirm, background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', color: '#fff', boxShadow: '0 6px 24px rgba(34,197,94,0.30)' }}
          onClick={onConfirm}
        >
          {CheckIcon}
          Approve all
        </button>
      </div>
    </ModalShell>
  );
}

// =============================================
// BulkProgressModal — progress + per-item results.
// Not closable while running (no X/Esc/backdrop) — the loop is
// sequential and interrupting the UI mid-loop would orphan progress
// feedback. It's fast (one small API call per row).
// =============================================
function BulkProgressModal({ run, onClose }) {
  const open = !!run;
  if (!open) return null;

  const succeeded = run.results.filter((r) => r.ok).length;
  const failed = run.results.filter((r) => !r.ok);

  return (
    <ModalShell
      open={open}
      busy={!run.finished}
      onClose={run.finished ? onClose : () => {}}
      accent="linear-gradient(90deg, #22c55e, #4ade80, #86efac)"
      maxWidth={480}
    >
      <div style={styles.modalHeader}>
        <div style={styles.modalHeaderText}>
          <div style={styles.modalTitle}>
            {run.finished
              ? 'Bulk approve complete'
              : `Approving ${Math.min(run.done + 1, run.total)} of ${run.total}…`}
          </div>
        </div>
        {run.finished && <ModalCloseButton onClose={onClose} busy={false} />}
      </div>

      <div style={styles.modalBody}>
        {/* Progress bar */}
        <div style={styles.progressTrack}>
          <div style={{
            ...styles.progressFill,
            width: `${run.total === 0 ? 0 : Math.round((run.done / run.total) * 100)}%`,
          }} />
        </div>
        {!run.finished && run.current && (
          <p style={styles.modalPFaint}>Currently approving: {run.current}</p>
        )}

        {run.finished && (
          <>
            <p style={styles.modalP}>
              <strong style={styles.modalStrong}>{succeeded} approved</strong>
              {failed.length > 0 && <> · <strong style={{ color: '#fca5a5' }}>{failed.length} failed</strong></>}
            </p>
            {failed.length > 0 && (
              <div style={styles.failList}>
                {failed.map((f) => (
                  <div key={f.id} style={styles.failItem}>
                    <strong style={{ color: '#fca5a5' }}>{f.label}</strong> — {f.error}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {run.finished && (
        <div style={styles.modalFooter}>
          <button
            type="button"
            style={{ ...styles.btnConfirm, background: 'linear-gradient(135deg, #ec4899 0%, #a855f7 100%)', color: '#fff', boxShadow: '0 6px 24px rgba(236,72,153,0.3)' }}
            onClick={onClose}
          >
            Done
          </button>
        </div>
      )}
    </ModalShell>
  );
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
    animation: 'amFadeInUp 0.4s ease',
  },

  toolbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 16, flexWrap: 'wrap',
    padding: '20px 32px 14px',
  },
  toolbarLeft: { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  toolbarHeading: { fontSize: 15, fontWeight: 700, color: '#fff', letterSpacing: '-0.1px' },
  toolbarCount: {
    fontSize: 12, fontWeight: 600,
    color: 'rgba(243,192,54,0.85)',
    background: 'rgba(243,192,54,0.10)',
    padding: '2px 9px', borderRadius: 12, marginLeft: 8,
  },
  toolbarFilterSlot: { color: 'rgba(255,255,255,0.3)', fontSize: 11, fontStyle: 'italic' },
  legend: {
    display: 'inline-flex', alignItems: 'center', gap: 12,
    fontSize: 10.5, color: 'rgba(255,255,255,0.5)', flexWrap: 'wrap',
  },
  legendItem: { display: 'inline-flex', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: '50%', display: 'inline-block' },

  toastSuccess: {
    margin: '0 32px 12px', padding: '10px 14px',
    background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.3)',
    borderRadius: 8, color: '#bbf7d0', fontSize: 12,
  },
  toastError: {
    margin: '0 32px 12px', padding: '10px 14px',
    background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 8, color: '#fca5a5', fontSize: 12,
  },
  errorBanner: {
    margin: '0 32px 12px', padding: '14px 18px',
    background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 12, color: '#fca5a5', fontSize: 13,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  },
  retryBtn: {
    padding: '6px 14px', fontSize: 11.5, fontWeight: 600, borderRadius: 6,
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
    color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontFamily: 'inherit',
  },
  loading: { minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  spinner: {
    width: 36, height: 36, border: '4px solid rgba(255,255,255,0.1)',
    borderTopColor: '#F3C036', borderRadius: '50%',
    animation: 'amSpin 0.8s linear infinite',
  },

  // Empty state
  emptyStage: {
    margin: '0 32px',
    padding: '60px 20px',
    textAlign: 'center',
    background: 'rgba(0,0,0,0.12)',
    border: '1px dashed rgba(255,255,255,0.1)',
    borderRadius: 14,
  },
  emptyIcon: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 64, height: 64, borderRadius: '50%',
    background: 'rgba(34,197,94,0.12)', color: '#86efac',
    marginBottom: 18,
  },
  emptyTitle: { fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 8 },
  emptySub: {
    fontSize: 13, color: 'rgba(255,255,255,0.55)',
    maxWidth: 480, margin: '0 auto', lineHeight: 1.6,
  },

  // Bulk bar
  bulkBar: {
    margin: '0 32px 12px',
    padding: '10px 16px',
    background: 'rgba(34,197,94,0.08)',
    border: '1px solid rgba(34,197,94,0.30)',
    borderRadius: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  },
  bulkBarText: { fontSize: 13, color: '#bbf7d0' },
  bulkClearBtn: {
    padding: '7px 14px', fontSize: 11.5, fontWeight: 600, borderRadius: 8,
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.75)', cursor: 'pointer', fontFamily: 'inherit',
  },
  bulkApproveBtn: {
    padding: '7px 16px', fontSize: 11.5, fontWeight: 700, borderRadius: 8,
    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
    border: 'none', color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
    boxShadow: '0 4px 16px rgba(34,197,94,0.30)',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  },

  // Section card
  sectionCard: {
    position: 'relative',
    background: 'rgba(255,255,255,0.03)',
    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16,
    overflow: 'hidden',
    margin: '0 32px 18px',
  },
  sectionAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  sectionHeader: {
    padding: '16px 22px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  sectionHeaderLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  sectionHeaderIcon: {
    width: 32, height: 32, borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  sectionHeaderTitle: { fontSize: 14, fontWeight: 700, letterSpacing: '-0.1px' },
  sectionHeaderSub: { fontSize: 11.5, color: 'rgba(255,255,255,0.55)', marginTop: 2 },
  sectionBody: { padding: '8px 14px 16px' },
  sectionEmpty: {
    padding: '18px 14px',
    fontSize: 12.5, color: 'rgba(255,255,255,0.4)',
    fontStyle: 'italic', textAlign: 'center',
  },
  selectAllLabel: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,0.7)',
    cursor: 'pointer', userSelect: 'none',
  },
  checkbox: {
    width: 15, height: 15, cursor: 'pointer',
    accentColor: '#22c55e',
  },
  checkboxSpacer: { width: 15, display: 'inline-block' },

  // Rows
  row: {
    display: 'grid',
    gridTemplateColumns: '15px 120px 100px 160px 1fr auto',
    alignItems: 'center',
    gap: 14,
    padding: '14px 14px',
    background: 'rgba(0,0,0,0.18)',
    border: '1px solid rgba(255,255,255,0.04)',
    borderRadius: 10,
    marginTop: 8,
    transition: 'all 0.15s ease',
  },
  // POLISH — mobile: stacked single-column row, no horizontal scroll.
  rowMobile: {
    gridTemplateColumns: '1fr',
    gap: 10,
    padding: '14px 12px',
  },
  rowMobileHead: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
  },
  rowMobilePeriod: {
    marginLeft: 8,
    fontSize: 12,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.6)',
  },
  checkboxMobile: {
    width: 20, height: 20, marginTop: 2,
  },
  rowActionsMobile: {
    display: 'flex', gap: 8, width: '100%',
  },
  btnActMobile: {
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
  bulkBarMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 10,
    margin: '0 16px 12px',
  },
  bulkBtnMobile: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
    display: 'inline-flex',
    alignItems: 'center',
  },
  sectionCardMobile: {
    margin: '0 16px 14px',
  },
  sectionHeaderMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 10,
  },
  rowSelected: {
    background: 'rgba(34,197,94,0.06)',
    borderColor: 'rgba(34,197,94,0.25)',
  },
  rowModule: { display: 'flex', flexDirection: 'column', gap: 3 },
  rowModuleCode: { fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: '-0.1px' },
  rowModuleName: { fontSize: 10.5, color: 'rgba(255,255,255,0.45)', fontWeight: 500 },
  rowPeriod: {
    fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.92)',
    fontVariantNumeric: 'tabular-nums',
  },
  rowPeriodYear: { fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 500, marginLeft: 4 },
  statusPill: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '4px 10px', borderRadius: 14,
    fontSize: 11, fontWeight: 700, letterSpacing: '0.4px',
    textTransform: 'uppercase',
    border: '1px solid', width: 'fit-content',
  },
  statusDot: { width: 6, height: 6, borderRadius: '50%', display: 'inline-block' },
  rowOwner: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 },
  rowOwnerWho: {
    fontSize: 12.5, fontWeight: 600, color: 'rgba(255,255,255,0.85)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  roleTag: {
    display: 'inline-block', marginLeft: 6, padding: '1px 6px',
    background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)',
    fontSize: 9.5, fontWeight: 700, letterSpacing: '0.6px',
    textTransform: 'uppercase', borderRadius: 3, verticalAlign: 'middle',
  },
  rowOwnerMeta: { fontSize: 11, color: 'rgba(255,255,255,0.45)' },
  rowActions: { display: 'inline-flex', gap: 6, justifyContent: 'flex-end' },

  // Action buttons
  btnAct: {
    padding: '7px 14px', borderRadius: 8,
    fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600,
    border: '1px solid', cursor: 'pointer',
    transition: 'all 0.15s ease',
    display: 'inline-flex', alignItems: 'center', gap: 5,
    letterSpacing: '0.1px', whiteSpace: 'nowrap',
  },
  btnApprove: {
    background: 'rgba(34,197,94,0.10)', color: '#86efac', borderColor: 'rgba(34,197,94,0.35)',
  },
  btnPublish: {
    background: 'linear-gradient(135deg, rgba(34,197,94,0.20), rgba(134,239,172,0.15))',
    color: '#bbf7d0', borderColor: 'rgba(34,197,94,0.45)',
    boxShadow: '0 4px 12px rgba(34,197,94,0.15)',
  },
  btnReject: {
    background: 'rgba(239,68,68,0.08)', color: '#fca5a5', borderColor: 'rgba(239,68,68,0.35)',
  },
  btnReopen: {
    background: 'rgba(243,192,54,0.10)', color: '#F3C036', borderColor: 'rgba(243,192,54,0.40)',
  },

  infoNote: {
    margin: '0 32px',
    padding: '14px 18px',
    background: 'rgba(99,102,241,0.08)',
    border: '1px solid rgba(99,102,241,0.22)',
    borderRadius: 10,
    color: '#c7d2fe', fontSize: 12, lineHeight: 1.55,
  },

  // ===== Modals =====
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(14,8,32,0.72)',
    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    zIndex: 9999,
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    padding: '5vh 20px',
    overflowY: 'auto',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  modalCard: {
    position: 'relative',
    background: 'linear-gradient(135deg, #1a1028 0%, #2d1f42 60%, #3d2856 100%)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 18,
    width: '100%',
    overflow: 'visible',
    boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
    color: '#fff',
  },
  modalAccent: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: 3, borderRadius: '18px 18px 0 0',
  },
  modalHeader: {
    padding: '22px 26px 14px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
  },
  modalHeaderText: { flex: 1, minWidth: 0 },
  modalTitle: { fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px', marginBottom: 4, color: '#fff' },
  modalSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: 500, lineHeight: 1.5 },
  modalClose: {
    width: 32, height: 32, flexShrink: 0,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    color: 'rgba(255,255,255,0.6)',
    cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 14, lineHeight: 1, padding: 0,
    transition: 'all 0.15s ease',
  },
  modalCloseDisabled: { opacity: 0.35, cursor: 'not-allowed' },
  modalBody: { padding: '20px 26px' },
  modalFooter: {
    padding: '14px 26px 22px',
    display: 'flex', justifyContent: 'flex-end', gap: 10,
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  modalP: { fontSize: 13, color: 'rgba(255,255,255,0.78)', lineHeight: 1.55, marginBottom: 10 },
  modalPFaint: { fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 },
  modalStrong: { color: '#fff' },
  modalRow: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 },
  modalLabel: {
    fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,0.85)',
    display: 'inline-flex', alignItems: 'center', gap: 4,
  },
  req: { color: '#ef4444', fontWeight: 700 },
  modalHelper: { fontSize: 10.5, color: 'rgba(255,255,255,0.4)' },
  textarea: {
    width: '100%',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    color: '#fff',
    padding: '12px 14px',
    fontFamily: 'inherit', fontSize: 14, fontWeight: 500,
    resize: 'vertical', minHeight: 100,
    outline: 'none', boxSizing: 'border-box',
  },
  ctxPill: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '10px 14px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
    marginBottom: 18,
    flexWrap: 'wrap',
  },
  ctxBlock: { display: 'flex', flexDirection: 'column', gap: 2 },
  ctxLabel: {
    fontSize: 9.5, fontWeight: 700, letterSpacing: '1.2px',
    textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)',
  },
  ctxValue: { fontSize: 13, fontWeight: 600, color: '#fff' },
  ctxSep: { width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.08)', margin: '4px 6px' },
  errorBox: {
    marginTop: 12, padding: '10px 12px',
    background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 8, color: '#fca5a5', fontSize: 12, lineHeight: 1.4,
  },
  btnGhost: {
    padding: '10px 18px', borderRadius: 10,
    fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)',
    color: 'rgba(255,255,255,0.75)',
    cursor: 'pointer', transition: 'all 0.15s ease',
  },
  btnConfirm: {
    padding: '10px 18px', borderRadius: 10,
    fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
    border: 'none', cursor: 'pointer',
    transition: 'all 0.18s ease',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  },
  btnConfirmDisabled: { opacity: 0.45, cursor: 'not-allowed' },
  progressTrack: {
    width: '100%', height: 8, borderRadius: 4,
    background: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #22c55e, #4ade80)',
    borderRadius: 4,
    transition: 'width 0.25s ease',
  },
  failList: {
    marginTop: 10,
    padding: '10px 12px',
    background: 'rgba(239,68,68,0.06)',
    border: '1px solid rgba(239,68,68,0.2)',
    borderRadius: 8,
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  failItem: { fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 },
};
