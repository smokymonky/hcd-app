import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { workflowAPI } from '../services/api';

// =============================================
// WorkflowInbox — "My Inbox" + Audit Trail (Round 2b)
// =============================================
// Route /hub/inbox (any authed user). Lists submissions awaiting THIS user's
// action (GET /my-inbox — allowedActions computed server-side via
// validateTransition). Each allowed action is a button that calls
// workflowAPI.transition then refreshes. Each row expands to its audit trail
// (workflowAPI.getHistory). Admins also get an "All Pending" link to the
// existing admin surface (ApprovalsManager) — not rebuilt here.
// =============================================

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const STATUS_LABEL = {
  draft: 'Draft', submitted: 'Submitted', head_reviewed: 'Head Reviewed',
  director_reviewed: 'Director Reviewed', approved: 'Approved', rejected: 'Rejected', published: 'Published',
};
// to_state → action button label.
const ACTION_LABEL = {
  head_reviewed: 'Mark Head-Reviewed',
  director_reviewed: 'Mark Director-Reviewed',
  approved: 'Approve',
  published: 'Publish',
  rejected: 'Reject',
  draft: 'Resume editing',
  submitted: 'Submit',
};
// to_states that need a reason (rejection).
const REASON_REQUIRED = new Set(['rejected']);

function timeAgo(ts) {
  if (!ts) return '';
  const then = new Date(ts).getTime();
  if (!Number.isFinite(then)) return '';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export default function WorkflowInbox({ user }) {
  const navigate = useNavigate();
  const isAdmin = user && String(user.role || '').toLowerCase() === 'admin';

  const [rows, setRows] = useState(null);     // null = loading
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [expanded, setExpanded] = useState(null);  // submission id whose trail is open
  const [history, setHistory] = useState({});      // id → { loading, rows, error }

  const load = useCallback(() => {
    setError(null);
    return workflowAPI.getMyInbox()
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch((e) => { setError(e.message || 'Could not load your inbox.'); setRows([]); });
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(row, toState) {
    let reason = null;
    if (REASON_REQUIRED.has(toState)) {
      reason = window.prompt('Reason (required):', '');
      if (reason === null) return;             // cancelled
      if (!reason.trim()) { setError('A reason is required to reject.'); return; }
    }
    setBusyId(row.id); setError(null);
    try {
      await workflowAPI.transition(row.target_type, row.id, toState, reason || undefined);
      if (expanded === row.id) loadHistory(row);  // refresh open trail
      await load();
    } catch (e) {
      setError(e.message || 'Action failed.');
    } finally { setBusyId(null); }
  }

  function loadHistory(row) {
    setHistory((h) => ({ ...h, [row.id]: { loading: true, rows: [], error: null } }));
    workflowAPI.getHistory(row.target_type, row.id)
      .then((data) => setHistory((h) => ({ ...h, [row.id]: { loading: false, rows: Array.isArray(data) ? data : (data.rows || []), error: null } })))
      .catch((e) => setHistory((h) => ({ ...h, [row.id]: { loading: false, rows: [], error: e.message || 'Could not load history.' } })));
  }
  function toggleTrail(row) {
    if (expanded === row.id) { setExpanded(null); return; }
    setExpanded(row.id);
    if (!history[row.id]) loadHistory(row);
  }

  return (
    <div style={S.shell}>
      <div style={S.topBar}>
        <button type="button" style={S.backBtn} onClick={() => navigate('/hub')}>← Hub</button>
        <div style={S.title}>My Inbox</div>
        {isAdmin && (
          <button type="button" style={S.allPending} onClick={() => navigate('/admin?tab=approvals')}>All Pending →</button>
        )}
      </div>

      <div style={S.body}>
        {error && <div style={S.alertErr}>{error}</div>}

        {rows === null ? (
          <div style={S.spinner} />
        ) : rows.length === 0 ? (
          <div style={S.empty}>Nothing awaiting you right now.</div>
        ) : (
          <div style={S.list}>
            {rows.map((row) => {
              const open = expanded === row.id;
              const h = history[row.id];
              return (
                <div key={row.id} style={S.card}>
                  <div style={S.cardAccent} />
                  <div style={S.cardMain}>
                    <div style={S.cardInfo}>
                      <div style={S.moduleName}>{row.module_name || row.module_code}</div>
                      <div style={S.meta}>
                        {MONTHS[row.month] || row.month} {row.year} · <span style={S.statusChip}>{STATUS_LABEL[row.status] || row.status}</span>
                        {row.owner_name ? <> · owner {row.owner_name}</> : null}
                        {row.updated_at ? <> · updated {timeAgo(row.updated_at)}</> : null}
                      </div>
                    </div>
                    <div style={S.actions}>
                      {(row.allowedActions || []).map((to) => (
                        <button
                          key={to} type="button"
                          style={{ ...S.actionBtn, ...(to === 'rejected' ? S.actionDanger : {}), ...(to === 'draft' ? S.actionNeutral : {}) }}
                          disabled={busyId === row.id}
                          onClick={() => act(row, to)}
                        >
                          {ACTION_LABEL[to] || `→ ${STATUS_LABEL[to] || to}`}
                        </button>
                      ))}
                      <button type="button" style={S.trailBtn} onClick={() => toggleTrail(row)}>
                        {open ? 'Hide trail' : 'Audit trail'}
                      </button>
                    </div>
                  </div>

                  {open && (
                    <div style={S.trail}>
                      {!h || h.loading ? (
                        <div style={S.trailNote}>Loading history…</div>
                      ) : h.error ? (
                        <div style={S.trailNote}>{h.error}</div>
                      ) : h.rows.length === 0 ? (
                        <div style={S.trailNote}>No history yet.</div>
                      ) : (
                        h.rows.map((ev, i) => (
                          <div key={ev.id || i} style={S.trailRow}>
                            <span style={S.trailDot} />
                            <div style={S.trailText}>
                              <span style={S.trailStates}>
                                {ev.from_state ? (STATUS_LABEL[ev.from_state] || ev.from_state) : '—'} → {STATUS_LABEL[ev.to_state] || ev.to_state}
                              </span>
                              <span style={S.trailMeta}>
                                {ev.action_by_name ? ` by ${ev.action_by_name}` : ''}{ev.created_at ? ` · ${new Date(ev.created_at).toLocaleString()}` : ''}
                              </span>
                              {ev.reason ? <div style={S.trailReason}>“{ev.reason}”</div> : null}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <style>{`@keyframes hrSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const S = {
  shell: { minHeight: '100vh', background: 'linear-gradient(135deg, #1a1028 0%, #2d1f42 30%, #3d2856 60%, #4a3265 100%)', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", color: '#fff', paddingBottom: 60 },
  topBar: { display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '20px 48px 0' },
  backBtn: { padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 },
  title: { fontSize: 22, fontWeight: 800, letterSpacing: '-0.4px' },
  allPending: { marginLeft: 'auto', padding: '8px 14px', borderRadius: 8, background: 'rgba(243,192,54,0.1)', border: '1px solid rgba(243,192,54,0.35)', color: '#F3C036', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600 },
  body: { maxWidth: 900, margin: '0 auto', padding: '22px 48px 0' },
  alertErr: { marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5', fontSize: 13 },
  spinner: { width: 36, height: 36, margin: '80px auto', border: '4px solid rgba(255,255,255,0.1)', borderTopColor: '#F3C036', borderRadius: '50%', animation: 'hrSpin 0.8s linear infinite' },
  empty: { padding: '48px 24px', textAlign: 'center', color: 'rgba(255,255,255,0.55)', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 14, fontSize: 15 },
  list: { display: 'flex', flexDirection: 'column', gap: 12 },
  card: { position: 'relative', overflow: 'hidden', background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, boxShadow: '0 6px 24px rgba(0,0,0,0.2)' },
  cardAccent: { position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, background: 'linear-gradient(180deg, #F3C036, #ec4899, #a855f7)' },
  cardMain: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', padding: '16px 20px' },
  cardInfo: { minWidth: 0 },
  moduleName: { fontSize: 16, fontWeight: 700 },
  meta: { fontSize: 12.5, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  statusChip: { padding: '2px 9px', borderRadius: 11, background: 'rgba(243,192,54,0.14)', border: '1px solid rgba(243,192,54,0.35)', color: '#F3C036', fontSize: 11, fontWeight: 700 },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  actionBtn: { padding: '8px 14px', borderRadius: 8, background: 'linear-gradient(135deg, rgba(243,192,54,0.9), rgba(236,72,153,0.9))', border: 'none', color: '#1a1028', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700 },
  actionDanger: { background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5' },
  actionNeutral: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.18)', color: '#fff' },
  trailBtn: { padding: '8px 12px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 },
  trail: { borderTop: '1px solid rgba(255,255,255,0.08)', padding: '14px 20px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 },
  trailNote: { fontSize: 12.5, color: 'rgba(255,255,255,0.5)' },
  trailRow: { display: 'flex', gap: 10, alignItems: 'flex-start' },
  trailDot: { width: 8, height: 8, borderRadius: '50%', background: '#F3C036', marginTop: 5, flexShrink: 0, boxShadow: '0 0 8px rgba(243,192,54,0.6)' },
  trailText: { fontSize: 13, color: 'rgba(255,255,255,0.82)' },
  trailStates: { fontWeight: 700 },
  trailMeta: { color: 'rgba(255,255,255,0.5)', fontWeight: 500 },
  trailReason: { fontSize: 12.5, color: 'rgba(255,255,255,0.6)', marginTop: 2, fontStyle: 'italic' },
};
