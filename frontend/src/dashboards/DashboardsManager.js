import React, { useEffect, useMemo, useState } from 'react';
import { dashboardsAPI } from '../services/api';
import Dropdown from './Dropdown';
import { ICON_PATHS } from '../config/moduleConfig';

// =============================================
// DashboardsManager — admin UI to create / edit / (de)activate modules
// =============================================
// PHASE 8a-3. Lives inside AdminPage as the "Dashboards" tab. Uses the 8a-1
// endpoints (listModules / createModule / updateModule). Creating a module
// registers it only — structure, snapshot layout, and access are built next
// (the success panel links to those). Cosmic glass aesthetic (matches
// TargetsManager). Themed Dropdowns only (INC-7 — no native selects).
// =============================================

const CATEGORY_OPTIONS = [
  { value: 'hr_dashboards', label: 'HR Dashboards' },
];
const ICON_CHOICES = ['hrOps', 'ta', 'ld', 'hrSys', 'dashboards', 'annualPlan'];
const ACCENT_SWATCHES = [
  ['gold', '#F3C036'], ['magenta', '#ec4899'], ['purple', '#a855f7'], ['blue', '#3b82f6'], ['green', '#22c55e'],
];
const CODE_RE = /^[A-Z0-9_&]+$/;

const EMPTY_FORM = { code: '', name: '', description: '', category: 'hr_dashboards', icon_key: 'dashboards', accent: 'gold' };

export default function DashboardsManager() {
  const [modules, setModules] = useState(null); // null = loading
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);   // null = create, else module id
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErr, setFormErr] = useState(null);
  const [created, setCreated] = useState(null);  // { code } after a successful create → next-step panel

  const load = () => {
    setError(null);
    return dashboardsAPI.listModules()
      .then((rows) => setModules(Array.isArray(rows) ? rows : []))
      .catch((e) => { setError(e.message || 'Could not load modules.'); setModules([]); });
  };
  useEffect(() => { load(); }, []);

  const sorted = useMemo(
    () => (modules || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.name).localeCompare(String(b.name))),
    [modules]
  );

  function openCreate() {
    setEditId(null); setForm(EMPTY_FORM); setFormErr(null); setCreated(null); setShowForm(true);
  }
  function openEdit(m) {
    setEditId(m.id);
    setForm({ code: m.code, name: m.name || '', description: m.description || '', category: m.category || 'hr_dashboards', icon_key: m.icon_key || 'dashboards', accent: m.accent || 'gold' });
    setFormErr(null); setCreated(null); setShowForm(true);
  }
  function closeForm() { setShowForm(false); setFormErr(null); }

  async function submitForm() {
    setFormErr(null);
    if (!editId) {
      if (!form.code.trim()) return setFormErr('Code is required.');
      if (!CODE_RE.test(form.code.trim())) return setFormErr('Code must be uppercase letters, digits, _ or & (e.g. HR_OPS, L&D).');
    }
    if (!form.name.trim()) return setFormErr('Name is required.');
    if (!form.category) return setFormErr('Category is required.');
    setBusy(true);
    try {
      if (editId) {
        await dashboardsAPI.updateModule(editId, {
          name: form.name.trim(), description: form.description, category: form.category, icon_key: form.icon_key, accent: form.accent,
        });
        await load();
        setShowForm(false);
      } else {
        const row = await dashboardsAPI.createModule({
          code: form.code.trim(), name: form.name.trim(), description: form.description, category: form.category, icon_key: form.icon_key, accent: form.accent,
        });
        await load();
        setCreated({ code: row.code });   // keep modal open showing next steps
      }
    } catch (e) {
      // Surface the backend 409 / validation inline.
      setFormErr(e.message || 'Save failed.');
    } finally { setBusy(false); }
  }

  async function toggleActive(m) {
    setBusy(true); setError(null);
    try { await dashboardsAPI.updateModule(m.id, { is_active: !(m.is_active !== false) }); await load(); }
    catch (e) { setError(e.message || 'Could not change status.'); }
    finally { setBusy(false); }
  }

  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <div>
          <h2 style={S.h2}>Dashboard Modules</h2>
          <p style={S.sub}>Create, edit, and activate dashboards. Creating one registers it — build its structure, snapshot, and access next.</p>
        </div>
        <button type="button" style={S.primaryBtn} onClick={openCreate}>+ New Dashboard</button>
      </div>

      {error && <div style={S.alertErr}>{error}</div>}

      {modules === null ? (
        <div style={S.spinner} />
      ) : sorted.length === 0 ? (
        <div style={S.empty}>No modules yet.</div>
      ) : (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Name</th><th style={S.th}>Code</th><th style={S.th}>Category</th>
                <th style={S.th}>Order</th><th style={S.th}>Status</th><th style={S.thR}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((m) => {
                const active = m.is_active !== false;
                return (
                  <tr key={m.id} style={active ? S.tr : S.trInactive}>
                    <td style={S.td}>
                      <span style={S.iconCell} dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor">${ICON_PATHS[m.icon_key] || ICON_PATHS.dashboards}</svg>` }} />
                      {m.name}
                    </td>
                    <td style={S.tdMono}>{m.code}</td>
                    <td style={S.td}>{m.category || '—'}</td>
                    <td style={S.td}>{m.sort_order ?? 0}</td>
                    <td style={S.td}><span style={active ? S.badgeOn : S.badgeOff}>{active ? 'Active' : 'Inactive'}</span></td>
                    <td style={S.tdR}>
                      <a style={S.quickLink} href={`/hub/dashboards/${encodeURIComponent(m.code)}`} title="Build structure (Data Entry → ✎ Edit dashboard)">Build</a>
                      <a style={S.quickLink} href={`/hub/admin/designer/${encodeURIComponent(m.code)}`} title="Design the snapshot">Design</a>
                      <button type="button" style={S.linkBtn} disabled={busy} onClick={() => openEdit(m)}>Edit</button>
                      <button type="button" style={active ? S.deactBtn : S.actBtn} disabled={busy} onClick={() => toggleActive(m)}>
                        {active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div style={S.overlay} onClick={closeForm}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            {created ? (
              <>
                <h3 style={S.modalTitle}>✓ Dashboard created</h3>
                <p style={S.sub}>“{created.code}” is registered. It has no structure, snapshot, or access yet — set those up next:</p>
                <div style={S.nextList}>
                  <a style={S.nextLink} href={`/hub/dashboards/${encodeURIComponent(created.code)}`}>1 · Build structure <span style={S.nextHint}>(Data Entry → ✎ Edit dashboard)</span></a>
                  <a style={S.nextLink} href={`/hub/admin/designer/${encodeURIComponent(created.code)}`}>2 · Design snapshot <span style={S.nextHint}>(the snapshot designer)</span></a>
                  <a style={S.nextLink} href={`/admin?tab=users`}>3 · Grant access <span style={S.nextHint}>(Users tab)</span></a>
                </div>
                <div style={S.modalActions}>
                  <button type="button" style={S.primaryBtn} onClick={closeForm}>Done</button>
                </div>
              </>
            ) : (
              <>
                <h3 style={S.modalTitle}>{editId ? 'Edit dashboard' : '+ New Dashboard'}</h3>
                {formErr && <div style={S.alertErr}>{formErr}</div>}

                <label style={S.label}>Code {editId && <span style={S.immutable}>(immutable)</span>}</label>
                <input
                  type="text" style={{ ...S.input, ...(editId ? S.inputDisabled : {}) }}
                  value={form.code} disabled={!!editId}
                  placeholder="e.g. COMP_BEN"
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                />
                {!editId && <div style={S.hint}>Uppercase letters, digits, _ or & — e.g. HR_OPS, L&D.</div>}

                <label style={S.label}>Name</label>
                <input type="text" style={S.input} value={form.name} placeholder="e.g. Compensation & Benefits" onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />

                <label style={S.label}>Description <span style={S.immutable}>(optional)</span></label>
                <input type="text" style={S.input} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />

                <label style={S.label}>Category</label>
                <Dropdown label="Category" value={form.category} options={CATEGORY_OPTIONS} onChange={(v) => setForm((f) => ({ ...f, category: v }))} width={260} />

                <label style={S.label}>Icon</label>
                <div style={S.iconRow}>
                  {ICON_CHOICES.map((k) => (
                    <button key={k} type="button" title={k} style={{ ...S.iconPick, ...(form.icon_key === k ? S.iconPickSel : {}) }} onClick={() => setForm((f) => ({ ...f, icon_key: k }))}
                      dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor">${ICON_PATHS[k] || ICON_PATHS.dashboards}</svg>` }} />
                  ))}
                </div>

                <label style={S.label}>Accent</label>
                <div style={S.swatchRow}>
                  {ACCENT_SWATCHES.map(([token, hex]) => (
                    <button key={token} type="button" title={token} style={{ ...S.swatch, background: hex, ...(form.accent === token ? S.swatchSel : {}) }} onClick={() => setForm((f) => ({ ...f, accent: token }))} />
                  ))}
                </div>

                <div style={S.modalActions}>
                  <button type="button" style={S.ghostBtn} disabled={busy} onClick={closeForm}>Cancel</button>
                  <button type="button" style={S.primaryBtn} disabled={busy} onClick={submitForm}>{editId ? 'Save changes' : 'Create dashboard'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  wrap: { color: '#fff', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 16 },
  h2: { fontSize: 20, fontWeight: 800, margin: 0 },
  sub: { fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: '4px 0 0', maxWidth: 560, lineHeight: 1.5 },
  primaryBtn: { padding: '10px 18px', borderRadius: 9, background: 'linear-gradient(135deg, #F3C036 0%, #ec4899 100%)', border: 'none', color: '#1a1028', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700 },
  ghostBtn: { padding: '10px 16px', borderRadius: 9, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.85)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 },
  alertErr: { margin: '0 0 12px', padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5', fontSize: 13 },
  empty: { padding: '32px', textAlign: 'center', color: 'rgba(255,255,255,0.5)', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 12 },
  spinner: { width: 34, height: 34, margin: '48px auto', border: '4px solid rgba(255,255,255,0.1)', borderTopColor: '#F3C036', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  tableWrap: { overflowX: 'auto', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, background: 'rgba(255,255,255,0.03)' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 640 },
  th: { textAlign: 'left', padding: '12px 14px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgba(255,255,255,0.5)', borderBottom: '1px solid rgba(255,255,255,0.1)' },
  thR: { textAlign: 'right', padding: '12px 14px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgba(255,255,255,0.5)', borderBottom: '1px solid rgba(255,255,255,0.1)' },
  tr: { borderBottom: '1px solid rgba(255,255,255,0.05)' },
  trInactive: { borderBottom: '1px solid rgba(255,255,255,0.05)', opacity: 0.5 },
  td: { padding: '12px 14px', fontSize: 13, color: 'rgba(255,255,255,0.85)' },
  tdMono: { padding: '12px 14px', fontSize: 12.5, fontFamily: 'ui-monospace, monospace', color: 'rgba(255,255,255,0.7)' },
  tdR: { padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' },
  iconCell: { display: 'inline-flex', verticalAlign: 'middle', marginRight: 9, color: '#F3C036' },
  badgeOn: { padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#86efac' },
  badgeOff: { padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.55)' },
  quickLink: { display: 'inline-block', marginRight: 8, padding: '6px 11px', borderRadius: 7, background: 'rgba(243,192,54,0.1)', border: '1px solid rgba(243,192,54,0.35)', color: '#F3C036', textDecoration: 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 },
  linkBtn: { marginRight: 10, padding: '6px 12px', borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 },
  actBtn: { padding: '6px 12px', borderRadius: 7, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.4)', color: '#86efac', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 },
  deactBtn: { padding: '6px 12px', borderRadius: 7, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(10,6,20,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 },
  modal: { width: '100%', maxWidth: 460, maxHeight: '88vh', overflowY: 'auto', background: 'linear-gradient(135deg, #241839, #2d1f42)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 16, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' },
  modalTitle: { fontSize: 18, fontWeight: 800, margin: '0 0 14px' },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.75)', margin: '14px 0 5px' },
  immutable: { color: 'rgba(255,255,255,0.4)', fontWeight: 500 },
  input: { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontFamily: 'inherit', fontSize: 14, outline: 'none' },
  inputDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  hint: { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 5 },
  iconRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  iconPick: { width: 40, height: 40, borderRadius: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.7)', cursor: 'pointer' },
  iconPickSel: { borderColor: '#F3C036', color: '#F3C036', background: 'rgba(243,192,54,0.12)' },
  swatchRow: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  swatch: { width: 28, height: 28, borderRadius: 8, border: '2px solid transparent', cursor: 'pointer', padding: 0 },
  swatchSel: { border: '2px solid #fff', boxShadow: '0 0 0 2px rgba(255,255,255,0.25)' },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 },
  nextList: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 },
  nextLink: { display: 'block', padding: '12px 14px', borderRadius: 9, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 600 },
  nextHint: { color: 'rgba(255,255,255,0.5)', fontWeight: 500, marginLeft: 6 },
};
