import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCenter, useDraggable, useDroppable,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { dashboardsAPI, targetsAPI } from '../services/api';
import { resolveComputedValues, buildMonthOptions } from '../engine/computers';
import { renderBlock, GRADIENT_DEFS, COMPONENT_TYPES } from '../engine/snapshotComponents';
import Dropdown from '../dashboards/Dropdown';

// =============================================
// SnapshotDesigner — admin 3-pane snapshot layout editor (Y-2a)
// =============================================
// Route: /hub/admin/designer/:moduleCode (admin only). Loads the module's
// active layout (or an empty canvas), lets an admin add/select/move/delete
// blocks across a rows→12-col-columns→blocks grid, set each block's bound
// field(s) + title, and Save-draft / Publish (snapshot_layouts only). Live
// snapshot is UNAFFECTED until snapshot_mode is flipped (Y-3). Canvas renders
// via the Y-1 registry against latest-published data.
// =============================================

const MODULE_NAME_BY_CODE = {
  HR_OPS: 'HR Operations', TA: 'Talent Acquisition',
  'L&D': 'Learning & Development', HR_SYS: 'HR Systems',
};
// Components that take a single field / multiple fields / none.
const MULTI_FIELD = new Set(['donut']);
const NO_BIND = new Set(['section_header', 'status_light']);

const PALETTE_LABELS = {
  section_header: 'Section header', hero_kpi: 'Hero KPI', stat_tile: 'Stat tile',
  ratio: 'Ratio', ring_gauge: 'Ring gauge', donut: 'Donut', status_light: 'Status light',
};

let _uid = 0;
const nextId = (p) => `${p}_${Date.now()}_${_uid++}`;

// ---- DnD location helpers (pure, on a config) ----
function findBlockLoc(config, blockId) {
  const rows = config.rows || [];
  for (let ri = 0; ri < rows.length; ri++) {
    const cols = rows[ri].columns || [];
    for (let ci = 0; ci < cols.length; ci++) {
      const blocks = cols[ci].blocks || [];
      for (let bi = 0; bi < blocks.length; bi++) {
        if (blocks[bi].id === blockId) return { ri, ci, bi };
      }
    }
  }
  return null;
}
function findColumnLoc(config, colId) {
  const rows = config.rows || [];
  for (let ri = 0; ri < rows.length; ri++) {
    const cols = rows[ri].columns || [];
    for (let ci = 0; ci < cols.length; ci++) {
      if (cols[ci].id === colId) return { ri, ci };
    }
  }
  return null;
}

// Palette item — click to add (kept) + draggable (new).
function PaletteItem({ type, label, onClick }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette:${type}`, data: { kind: 'palette', type } });
  return (
    <button
      ref={setNodeRef} type="button" style={{ ...DS.palItem, ...(isDragging ? DS.dragging : {}) }}
      onClick={onClick} {...listeners} {...attributes}
    >
      ⠿ {label}
    </button>
  );
}

// Column droppable wrapper — highlights when a drag is over it (empty cols too).
function ColumnDroppable({ colId, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${colId}`, data: { kind: 'column', colId } });
  return (
    <div ref={setNodeRef} style={{ ...DS.colDrop, ...(isOver ? DS.colDropOver : {}) }}>
      {children}
    </div>
  );
}

// A sortable canvas block — renders the block + selection + ↑/↓/✕ controls.
function SortableBlock({ block, isSel, onSelect, onMoveUp, onMoveDown, onDelete, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id, data: { kind: 'block', blockId: block.id } });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={{ ...style, ...DS.blockWrap, ...(isSel ? DS.blockWrapSel : {}) }}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      {isSel && (
        <div style={DS.blockControls} onClick={(e) => e.stopPropagation()}>
          <span style={DS.dragHandle} title="Drag to move" {...listeners} {...attributes}>⠿</span>
          <button type="button" style={DS.ctrlBtn} title="Move up" onClick={onMoveUp}>↑</button>
          <button type="button" style={DS.ctrlBtn} title="Move down" onClick={onMoveDown}>↓</button>
          <button type="button" style={{ ...DS.ctrlBtn, ...DS.ctrlDanger }} title="Delete" onClick={onDelete}>✕</button>
        </div>
      )}
      {children}
    </div>
  );
}

// Styles used by the DnD helper components (kept in sync with the main S below).
const DS = {
  palItem: { textAlign: 'left', padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', cursor: 'grab', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, width: '100%' },
  dragging: { opacity: 0.5 },
  colDrop: { display: 'flex', flexDirection: 'column', gap: 10, minHeight: 40, borderRadius: 8, transition: 'background 0.12s ease' },
  colDropOver: { background: 'rgba(243,192,54,0.08)', outline: '1px dashed rgba(243,192,54,0.5)' },
  blockWrap: { position: 'relative', borderRadius: 10, border: '1px solid transparent', cursor: 'pointer', padding: 2 },
  blockWrapSel: { border: '1px solid rgba(243,192,54,0.6)', boxShadow: '0 0 0 2px rgba(243,192,54,0.15)' },
  blockControls: { position: 'absolute', top: -12, right: 6, display: 'flex', gap: 4, zIndex: 5, alignItems: 'center' },
  dragHandle: { width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, background: '#2d1f42', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.7)', cursor: 'grab', fontSize: 12 },
  ctrlBtn: { width: 26, height: 24, borderRadius: 6, background: '#2d1f42', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' },
  ctrlDanger: { background: 'rgba(239,68,68,0.3)', borderColor: 'rgba(239,68,68,0.5)' },
};

export default function SnapshotDesigner({ user }) {
  const { moduleCode } = useParams();
  const navigate = useNavigate();

  const isAdmin = user && String(user.role || '').toLowerCase() === 'admin';
  const moduleName = MODULE_NAME_BY_CODE[moduleCode] || moduleCode;

  const [config, setConfig] = useState({ module_code: moduleCode, rows: [] });
  const [structure, setStructure] = useState(null);   // sections+fields for bind dropdown + value resolution
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);     // { r, c, b } indices | null
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [activeVersion, setActiveVersion] = useState(null);

  // Load structure + published + active layout.
  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const structureRes = await dashboardsAPI.getStructure(moduleCode);
        const layoutRes = await dashboardsAPI.getSnapshotLayout(moduleCode).catch(() => ({ config: null }));
        const targets = await targetsAPI.list(moduleCode).catch(() => []);
        // latest published month (fallback: blanks)
        let vals = {};
        try {
          const versions = []; // not needed for values; use getPublished on latest known published
          void versions;
          // Try current + a small walk back for a published month.
          const now = new Date();
          let found = null;
          for (let i = 0; i < 18 && !found; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            // eslint-disable-next-line no-await-in-loop
            const pub = await dashboardsAPI.getPublished(moduleCode, d.getFullYear(), d.getMonth() + 1).catch(() => null);
            if (pub && pub.data) { found = pub; }
          }
          if (found) { found.data.forEach((row) => { vals[row.field_key] = row.value ?? ''; }); }
        } catch (e) { vals = {}; }

        if (cancelled) return;
        const targetByKey = {};
        (Array.isArray(targets) ? targets : []).forEach((t) => {
          if (t.is_active === false) return;
          targetByKey[t.field_key] = {
            value: Number(t.target_value), direction: t.direction,
            tolerance: (t.tolerance == null) ? null : Number(t.tolerance),
            label: (t.label && String(t.label).trim() !== '') ? String(t.label) : undefined,
          };
        });
        const sections = (structureRes.sections || []).map((s) => ({
          id: s.id, key: s.key, title: s.title, layout: s.layout, is_active: s.is_active,
          subsections: (s.subsections || []),
          fields: (s.fields || []).map((f) => ({ ...f, section: s.key, target: targetByKey[f.key] || undefined })),
        }));
        setStructure({ code: moduleCode, name: moduleName, sections });
        setValues(vals);
        const loaded = layoutRes && layoutRes.config ? layoutRes.config : { module_code: moduleCode, rows: [] };
        setConfig(normalizeConfig(loaded, moduleCode));
        setActiveVersion(layoutRes && layoutRes.version ? layoutRes.version : null);
      } catch (err) {
        if (!cancelled) setMsg({ type: 'error', text: `Load failed: ${err.message || 'unknown'}` });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [moduleCode, isAdmin, moduleName]);

  // Unsaved-changes guard.
  useEffect(() => {
    function onBeforeUnload(e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // Field options for the bind dropdown.
  const fieldOptions = useMemo(() => {
    const out = [];
    for (const s of ((structure && structure.sections) || [])) {
      for (const f of (s.fields || [])) {
        if (f.is_active !== false) out.push({ key: f.key, label: `${f.label} (${f.key})` });
      }
    }
    return out;
  }, [structure]);

  const fieldByKey = useMemo(() => {
    const m = {};
    for (const s of ((structure && structure.sections) || [])) for (const f of (s.fields || [])) m[f.key] = f;
    return m;
  }, [structure]);

  const resolved = useMemo(
    () => resolveComputedValues(
      Object.values(fieldByKey), values, Object.values(fieldByKey)
    ),
    [fieldByKey, values]
  );

  // ---- config mutation helpers (immutable) ----
  function mutate(fn) {
    setConfig((prev) => {
      const draft = JSON.parse(JSON.stringify(prev));
      fn(draft);
      return draft;
    });
    setDirty(true);
  }
  function addRow() {
    mutate((d) => { d.rows.push({ id: nextId('r'), columns: [{ id: nextId('c'), width: 12, blocks: [] }] }); });
  }
  function addColumn(ri) {
    mutate((d) => {
      const row = d.rows[ri]; if (!row) return;
      const n = row.columns.length + 1;
      const w = Math.max(1, Math.floor(12 / n));
      row.columns.forEach((c) => { c.width = w; });
      row.columns.push({ id: nextId('c'), width: w, blocks: [] });
    });
  }
  function addBlock(type) {
    mutate((d) => {
      // target: selected column, else last column of last row, else new row.
      let ri = selected ? selected.r : d.rows.length - 1;
      if (ri < 0) { d.rows.push({ id: nextId('r'), columns: [{ id: nextId('c'), width: 12, blocks: [] }] }); ri = 0; }
      const row = d.rows[ri];
      const ci = selected ? selected.c : row.columns.length - 1;
      const col = row.columns[ci] || row.columns[0];
      const block = { id: nextId('b'), component: type, title: '', bind: {}, style: {} };
      col.blocks.push(block);
    });
  }
  function selectBlock(r, c, b) { setSelected({ r, c, b }); }
  function moveBlock(dir) {
    if (!selected) return;
    mutate((d) => {
      const col = d.rows[selected.r].columns[selected.c];
      const i = selected.b; const j = i + dir;
      if (j < 0 || j >= col.blocks.length) return;
      const [m] = col.blocks.splice(i, 1); col.blocks.splice(j, 0, m);
      setSelected({ ...selected, b: j });
    });
  }
  function deleteBlock() {
    if (!selected) return;
    mutate((d) => { d.rows[selected.r].columns[selected.c].blocks.splice(selected.b, 1); });
    setSelected(null);
  }
  function updateSelected(patch) {
    if (!selected) return;
    mutate((d) => {
      const blk = d.rows[selected.r].columns[selected.c].blocks[selected.b];
      Object.assign(blk, patch);
    });
  }
  function setSelectedBind(bind) {
    if (!selected) return;
    mutate((d) => {
      const blk = d.rows[selected.r].columns[selected.c].blocks[selected.b];
      blk.bind = bind;
    });
  }

  // ---- drag & drop (dnd-kit) ----
  // Buttons above remain the reliable fallback; DnD is additive.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [activeDrag, setActiveDrag] = useState(null); // { kind:'palette'|'block', type?, block? }

  function handleDragStart(event) {
    const data = event.active && event.active.data && event.active.data.current;
    if (!data) return;
    if (data.kind === 'palette') setActiveDrag({ kind: 'palette', type: data.type });
    else if (data.kind === 'block') {
      const loc = findBlockLoc(config, data.blockId);
      const blk = loc ? config.rows[loc.ri].columns[loc.ci].blocks[loc.bi] : null;
      setActiveDrag({ kind: 'block', block: blk });
    }
  }

  // Resolve the drop target (column + index) from the `over` element.
  function resolveTarget(draft, over) {
    const od = over && over.data && over.data.current;
    if (!od) return null;
    if (od.kind === 'column') {
      const loc = findColumnLoc(draft, od.colId);
      if (!loc) return null;
      const col = draft.rows[loc.ri].columns[loc.ci];
      return { ri: loc.ri, ci: loc.ci, index: (col.blocks || []).length };
    }
    if (od.kind === 'block') {
      const loc = findBlockLoc(draft, od.blockId);
      if (!loc) return null;
      return { ri: loc.ri, ci: loc.ci, index: loc.bi };
    }
    return null;
  }

  function handleDragEnd(event) {
    const { active, over } = event;
    setActiveDrag(null);
    if (!over) return; // dropped outside any droppable → no-op (don't lose it)
    const ad = active.data && active.data.current;
    if (!ad) return;

    mutate((d) => {
      const target = resolveTarget(d, over);
      if (!target) return;
      const destCol = d.rows[target.ri].columns[target.ci];

      if (ad.kind === 'palette') {
        const block = { id: nextId('b'), component: ad.type, title: '', bind: {}, style: {} };
        destCol.blocks.splice(target.index, 0, block);
        setSelected({ r: target.ri, c: target.ci, b: target.index });
        return;
      }
      if (ad.kind === 'block') {
        const src = findBlockLoc(d, ad.blockId);
        if (!src) return;
        const srcCol = d.rows[src.ri].columns[src.ci];
        const [moved] = srcCol.blocks.splice(src.bi, 1);
        // If same column and removing shifted the target index, adjust.
        let idx = target.index;
        if (src.ri === target.ri && src.ci === target.ci && src.bi < target.index) idx -= 1;
        destCol.blocks.splice(idx, 0, moved);
        setSelected({ r: target.ri, c: target.ci, b: idx });
      }
    });
  }

  // ---- save / publish ----
  async function handleSave() {
    setBusy(true); setMsg(null);
    try {
      const row = await dashboardsAPI.saveSnapshotLayout(moduleCode, config);
      setMsg({ type: 'success', text: `Draft saved (version ${row.version}).` });
      setDirty(false);
    } catch (err) { setMsg({ type: 'error', text: `Save failed: ${err.message || 'unknown'}` }); }
    finally { setBusy(false); }
  }
  async function handlePublish() {
    setBusy(true); setMsg(null);
    try {
      const row = await dashboardsAPI.publishSnapshotLayout(moduleCode, { config });
      setActiveVersion(row.version);
      setMsg({ type: 'success', text: `Published version ${row.version}. (Live snapshot still bespoke until mode flip.)` });
      setDirty(false);
    } catch (err) { setMsg({ type: 'error', text: `Publish failed: ${err.message || 'unknown'}` }); }
    finally { setBusy(false); }
  }

  const selectedBlock = selected
    ? (((config.rows[selected.r] || {}).columns || [])[selected.c] || {}).blocks?.[selected.b]
    : null;

  if (!isAdmin) {
    return <div style={S.shell}><div style={S.notice}>Admins only. <span style={S.link} onClick={() => navigate('/admin')}>Go to Admin</span></div></div>;
  }
  if (loading) {
    return <div style={S.shell}><div style={S.spinner} /><style>{`@keyframes hrSpin{to{transform:rotate(360deg)}}`}</style></div>;
  }

  return (
    <div style={S.shell}>
      {/* hidden gradient defs so canvas gauges/donuts resolve */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true"><defs>
        {GRADIENT_DEFS.map((g) => (
          <linearGradient key={g.id} id={g.id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={g.stops[0]} /><stop offset="1" stopColor={g.stops[1]} />
          </linearGradient>
        ))}
      </defs></svg>

      {/* top bar */}
      <div style={S.topBar}>
        <button type="button" style={S.backBtn} onClick={() => navigate(`/hub/dashboards/${moduleCode}`)}>← {moduleName}</button>
        <div style={S.title}>Snapshot Designer — {moduleName}</div>
        <span style={S.versionTag}>{activeVersion ? `active v${activeVersion}` : 'no published layout'}{dirty ? ' · unsaved' : ''}</span>
        <div style={S.topActions}>
          <button type="button" style={S.btnGhost} disabled={busy} onClick={handleSave}>Save draft</button>
          <button type="button" style={S.btnPrimary} disabled={busy} onClick={handlePublish}>Publish</button>
        </div>
      </div>
      {msg && <div style={msg.type === 'error' ? S.alertErr : S.alertOk}>{msg.text}</div>}

      {/* 3 panes (wrapped in DndContext; buttons remain the fallback) */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveDrag(null)}>
      <div style={S.panes}>
        {/* LEFT — palette (draggable + click-to-add) */}
        <div style={S.palette}>
          <div style={S.paneTitle}>Components</div>
          {COMPONENT_TYPES.map((t) => (
            <PaletteItem key={t} type={t} label={PALETTE_LABELS[t] || t} onClick={() => addBlock(t)} />
          ))}
          <div style={S.paneHint}>Drag a component onto a column, or click to add to the selected column.</div>
        </div>

        {/* CENTER — canvas */}
        <div style={S.canvas}>
          <div style={S.paneTitle}>Canvas <span style={S.paneHintInline}>— live preview (latest published)</span></div>
          {config.rows.length === 0 && <div style={S.empty}>Empty canvas. Add a row, then add components.</div>}
          {config.rows.map((row, ri) => (
            <div key={row.id || ri} style={S.canvasRow}>
              <div style={S.rowGrid}>
                {(row.columns || []).map((col, ci) => (
                  <div key={col.id || ci} style={{ ...S.canvasCol, gridColumn: `span ${Math.max(1, Math.min(12, col.width || 12))}` }}>
                    <ColumnDroppable colId={col.id}>
                      <SortableContext items={(col.blocks || []).map((b) => b.id)} strategy={verticalListSortingStrategy}>
                        {(col.blocks || []).length === 0 && (
                          <div style={S.dropHint} onClick={() => setSelected({ r: ri, c: ci, b: -1 })}>drop here / empty column</div>
                        )}
                        {(col.blocks || []).map((block, bi) => {
                          const isSel = selected && selected.r === ri && selected.c === ci && selected.b === bi;
                          return (
                            <SortableBlock
                              key={block.id || bi}
                              block={block}
                              isSel={isSel}
                              onSelect={() => selectBlock(ri, ci, bi)}
                              onMoveUp={() => moveBlock(-1)}
                              onMoveDown={() => moveBlock(1)}
                              onDelete={deleteBlock}
                            >
                              {renderBlock(block, resolved, fieldByKey)}
                            </SortableBlock>
                          );
                        })}
                      </SortableContext>
                    </ColumnDroppable>
                  </div>
                ))}
              </div>
              <button type="button" style={S.addColBtn} onClick={() => addColumn(ri)}>+ column</button>
            </div>
          ))}
          <button type="button" style={S.addRowBtn} onClick={addRow}>+ Add row</button>
        </div>

        {/* RIGHT — properties */}
        <div style={S.props}>
          <div style={S.paneTitle}>Properties</div>
          {!selectedBlock ? (
            <div style={S.paneHint}>Select a block to edit its field + title.</div>
          ) : (
            <>
              <div style={S.propType}>{PALETTE_LABELS[selectedBlock.component] || selectedBlock.component}</div>
              <label style={S.propLabel}>Title</label>
              <input type="text" style={S.propInput} value={selectedBlock.title || ''} onChange={(e) => updateSelected({ title: e.target.value })} />

              {NO_BIND.has(selectedBlock.component) ? (
                <div style={S.paneHint}>This component needs no field binding.</div>
              ) : MULTI_FIELD.has(selectedBlock.component) ? (
                <>
                  <label style={S.propLabel}>Bound fields (donut segments)</label>
                  <div style={S.multiBox}>
                    {fieldOptions.map((o) => {
                      const cur = (selectedBlock.bind && selectedBlock.bind.fields) || [];
                      const on = cur.includes(o.key);
                      return (
                        <label key={o.key} style={S.multiOpt}>
                          <input type="checkbox" checked={on} onChange={() => {
                            const next = on ? cur.filter((k) => k !== o.key) : [...cur, o.key];
                            setSelectedBind({ fields: next });
                          }} /> {o.label}
                        </label>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  <label style={S.propLabel}>Bound field</label>
                  <Dropdown
                    label="Field"
                    value={(selectedBlock.bind && selectedBlock.bind.field) || ''}
                    options={[{ value: '', label: '— none —' }, ...fieldOptions.map((o) => ({ value: o.key, label: o.label }))]}
                    onChange={(v) => setSelectedBind({ field: v })}
                    width={248}
                  />
                </>
              )}
              <div style={S.paneHint}>Color + variant options come later.</div>
            </>
          )}
        </div>
      </div>

      {/* drag ghost */}
      <DragOverlay>
        {activeDrag ? (
          <div style={S.dragGhost}>
            {activeDrag.kind === 'palette'
              ? `＋ ${PALETTE_LABELS[activeDrag.type] || activeDrag.type}`
              : (activeDrag.block ? (PALETTE_LABELS[activeDrag.block.component] || activeDrag.block.component) : 'block')}
          </div>
        ) : null}
      </DragOverlay>
      </DndContext>
    </div>
  );
}

// Ensure loaded config has ids on everything (older saves / seed may omit).
function normalizeConfig(cfg, moduleCode) {
  const rows = (cfg.rows || []).map((r) => ({
    id: r.id || nextId('r'),
    columns: (r.columns || []).map((c) => ({
      id: c.id || nextId('c'),
      width: c.width || 12,
      blocks: (c.blocks || []).map((b) => ({ id: b.id || nextId('b'), component: b.component, title: b.title || '', bind: b.bind || {}, style: b.style || {} })),
    })),
  }));
  return { module_code: cfg.module_code || moduleCode, rows };
}

const S = {
  shell: { minHeight: '100vh', background: 'linear-gradient(135deg, #1a1028 0%, #2d1f42 30%, #3d2856 60%, #4a3265 100%)', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", color: '#fff', paddingBottom: 40 },
  topBar: { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '18px 28px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' },
  backBtn: { padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 },
  title: { fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px' },
  versionTag: { fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600 },
  topActions: { marginLeft: 'auto', display: 'flex', gap: 10 },
  btnGhost: { padding: '9px 16px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.85)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 },
  btnPrimary: { padding: '9px 18px', borderRadius: 8, background: 'linear-gradient(135deg, #F3C036 0%, #ec4899 100%)', border: 'none', color: '#1a1028', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700 },
  alertErr: { margin: '10px 28px 0', padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5', fontSize: 13 },
  alertOk: { margin: '10px 28px 0', padding: '10px 14px', borderRadius: 8, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', color: '#86efac', fontSize: 13 },

  panes: { display: 'grid', gridTemplateColumns: '210px 1fr 280px', gap: 16, padding: '16px 28px', alignItems: 'start' },
  paneTitle: { fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: 12 },
  paneHint: { fontSize: 11.5, color: 'rgba(255,255,255,0.45)', marginTop: 12, lineHeight: 1.5 },
  paneHintInline: { fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'none', letterSpacing: 0, fontWeight: 500 },

  palette: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 16, position: 'sticky', top: 16, display: 'flex', flexDirection: 'column', gap: 8 },
  palItem: { textAlign: 'left', padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 },

  canvas: { minHeight: 300 },
  empty: { padding: '40px 20px', textAlign: 'center', color: 'rgba(255,255,255,0.4)', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 12 },
  canvasRow: { marginBottom: 14, padding: 10, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, background: 'rgba(0,0,0,0.12)' },
  rowGrid: { display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 12 },
  canvasCol: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 40 },
  dropHint: { padding: '16px', textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.35)', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 8, cursor: 'pointer' },
  blockWrap: { position: 'relative', borderRadius: 10, border: '1px solid transparent', cursor: 'pointer', padding: 2 },
  blockWrapSel: { border: '1px solid rgba(243,192,54,0.6)', boxShadow: '0 0 0 2px rgba(243,192,54,0.15)' },
  blockControls: { position: 'absolute', top: -12, right: 6, display: 'flex', gap: 4, zIndex: 5 },
  ctrlBtn: { width: 26, height: 24, borderRadius: 6, background: '#2d1f42', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' },
  ctrlDanger: { background: 'rgba(239,68,68,0.3)', borderColor: 'rgba(239,68,68,0.5)' },
  addColBtn: { marginTop: 10, padding: '6px 12px', borderRadius: 7, background: 'transparent', border: '1px dashed rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5 },
  addRowBtn: { padding: '10px 16px', borderRadius: 8, background: 'rgba(243,192,54,0.1)', border: '1px solid rgba(243,192,54,0.3)', color: '#F3C036', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 },

  props: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 16, position: 'sticky', top: 16 },
  propType: { fontSize: 14, fontWeight: 700, color: '#F3C036', marginBottom: 12 },
  propLabel: { display: 'block', fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,0.75)', margin: '12px 0 5px' },
  propInput: { width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontFamily: 'inherit', fontSize: 13, outline: 'none' },
  multiBox: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto', padding: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 },
  multiOpt: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'rgba(255,255,255,0.8)', cursor: 'pointer' },

  notice: { maxWidth: 520, margin: '80px auto', padding: '20px 24px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.75)' },
  link: { color: '#F3C036', cursor: 'pointer', fontWeight: 600 },
  spinner: { width: 36, height: 36, margin: '120px auto', border: '4px solid rgba(255,255,255,0.1)', borderTopColor: '#F3C036', borderRadius: '50%', animation: 'hrSpin 0.8s linear infinite' },
  dragGhost: { padding: '8px 14px', borderRadius: 8, background: 'rgba(45,31,66,0.95)', border: '1px solid rgba(243,192,54,0.5)', color: '#F3C036', fontSize: 13, fontWeight: 700, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', fontFamily: "'Inter', sans-serif" },
};
