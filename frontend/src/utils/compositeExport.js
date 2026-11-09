// Composite PDF Export — "Ledger" redesign.
// Same entry point, CDN loading, C palette, read-only data contract and file
// name as before. Layout is driven by each section's `layout` and each field's
// `type` / `dimension_*` / `formula_*`, so any dashboard renders without
// special-casing:
//   kpi / labeled_grid / other -> 3-column field rows (count + its % on one row)
//   labeled_grid computed sum  -> total band
//   ho_op                      -> HO | OP | TOTAL table (paired side by side)
//   matrix                     -> row x column table, "total" row in gold
//   group                      -> one column per subsection, ratios as bars
//   list fields                -> bullet list
// Each dashboard starts on a new page; long dashboards continue with a
// "CONTINUED" header. Footer reads "Page X of N".
import { resolveComputedValues, formatValue, formatRatio, parseList } from '../engine/computers';

export async function exportCompositeToPDF(period, modules) {
  // ---- load jsPDF + autotable via CDN (unchanged) ----
  if (!window.jspdf) {
    const s1 = document.createElement('script');
    s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    document.head.appendChild(s1);
    await new Promise((r) => { s1.onload = r; });
    const s2 = document.createElement('script');
    s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js';
    document.head.appendChild(s2);
    await new Promise((r) => { s2.onload = r; });
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a3');
  doc.setLineHeightFactor(1.45);

  // ---- C palette (unchanged) ----
  const C = {
    PRIMARY_PURPLE: [55, 30, 84], GOLD: [243, 192, 54], LIGHT_PURPLE: [168, 136, 190],
    DARK_BG: [26, 16, 40], DARK_BG_3: [61, 40, 86], DARK_BG_4: [74, 50, 101],
    WHITE: [255, 255, 255], ROW_EVEN: [32, 23, 45], ROW_ODD: [36, 24, 53],
  };

  // ---- geometry (mm, A3 portrait) ----
  const W = 297, H = 420, M = 15, CW = W - 2 * M;
  const FOOT_Y = H - 15;        // footer rule
  const LIMIT = FOOT_Y - 4;     // content must end above this
  const ROW = 9;                // field / table row height
  const GAP = 9.5;              // space above each section
  const COLGAP = 10.5;          // gutter between columns
  const FLAT_COLS = 3;
  const FLAT_COL_W = (CW - COLGAP * (FLAT_COLS - 1)) / FLAT_COLS;
  const HALF_W = (CW - COLGAP) / 2;
  const TABLE_COL_W = 20.6;

  const { year, monthName } = period || {};
  const periodText = `${monthName || ''} ${year || ''}`.trim();

  // ---- drawing helpers ----
  const font = (size, style = 'normal', color = C.WHITE) => {
    doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...color);
  };
  const fill = (c) => doc.setFillColor(...c);
  const line = (x1, y1, x2, y2, c = C.DARK_BG_4, w = 0.26) => {
    doc.setDrawColor(...c); doc.setLineWidth(w); doc.line(x1, y1, x2, y2);
  };
  const fit = (t, maxW) => {
    let s = String(t ?? '');
    if (maxW <= 0) return '';
    if (doc.getTextWidth(s) <= maxW) return s;
    while (s.length > 1 && doc.getTextWidth(s + '…') > maxW) s = s.slice(0, -1);
    return s + '…';
  };
  const spacedWidth = (t, cs) => doc.getTextWidth(t) + cs * Math.max(0, t.length - 1);
  const spaced = (t, x, y, cs = 0.5) => doc.text(t, x, y, { charSpace: cs });
  const plus = (x, y, color, size = 10) => {
    font(size, 'normal', color); doc.text('+', x, y, { align: 'center', baseline: 'middle' });
  };

  // ---- data helpers ----
  const isEmpty = (v) => v === undefined || v === null || v === '';
  const bySort = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0);
  const fType = (f) => f.formula_type ?? f.formulaType ?? null;
  const fArgs = (f) => {
    let a = f.formula_args ?? f.formulaArgs;
    if (typeof a === 'string') { try { a = JSON.parse(a); } catch (e) { a = null; } }
    return a || {};
  };
  const dimRow = (f) => f.dimension_row || f.dimensionRow || null;
  const dimCol = (f) => f.dimension_col || f.dimensionCol || null;
  const subKey = (f) => f.subsection || f.subsection_key || f.subsectionKey || null;
  const num = (v) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };
  const clamp01 = (n) => Math.max(0, Math.min(1, n));
  const ratioFrac = (v) => {
    const m = String(v ?? '').match(/(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)/);
    return m && Number(m[2]) ? clamp01(Number(m[1]) / Number(m[2])) : 0;
  };
  const humanize = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const show = (f, v) => {
    if (isEmpty(v)) return '—';
    if (f && f.type === 'ratio') return formatRatio(v);
    return f ? String(formatValue(f, v)) : String(v);
  };
  const listItems = (v) => (parseList(v) || []).map((it) =>
    (typeof it === 'string' ? it : (it && (it.text || it.title || it.label || it.value)) || '')).filter(Boolean);

  // ---- page chrome ----
  let pageNo = 0, y = 0, cur = null;

  function newPage(mod, cont) {
    if (pageNo > 0) doc.addPage();
    pageNo++;
    fill(C.DARK_BG); doc.rect(0, 0, W, H, 'F');
    [[6.5, 6.5], [W - 6.5, 6.5], [6.5, H - 6.5], [W - 6.5, H - 6.5]].forEach(([px, py]) => plus(px, py, C.DARK_BG_4, 12));

    font(14, 'bold'); doc.text('Abdul Latif Jameel', M, 20);
    font(8, 'bold', C.GOLD); spaced('FINANCE', M, 25, 1.4);
    font(7, 'bold', C.LIGHT_PURPLE); doc.text('REPORTING PERIOD', W - M, 19, { align: 'right' });
    if (periodText) { font(17, 'bold', C.GOLD); doc.text(periodText, W - M, 26.5, { align: 'right' }); }

    let ruleY = 31;
    if (pageNo === 1) { font(46, 'bold'); doc.text('HR Composite Report', M, 47); ruleY = 53; }
    fill(C.GOLD); doc.rect(M, ruleY, CW, 0.55, 'F');

    const ty = ruleY + 15;
    font(12, 'bold', C.GOLD); doc.text(mod.num, M, ty);
    const nx = M + doc.getTextWidth(mod.num) + 4;
    font(24, 'bold'); doc.text(fit(mod.name, CW - 40), nx, ty);
    if (cont) {
      const cx = nx + doc.getTextWidth(fit(mod.name, CW - 40)) + 5;
      font(8, 'bold', C.LIGHT_PURPLE); spaced('CONTINUED', cx, ty, 1.2);
    }
    y = ty + 5;
  }

  function contPage() { newPage(cur, true); y += GAP; }

  function sectionHeader(title, x = M, w = CW, top = y) {
    font(9, 'bold', C.GOLD);
    const t = fit(String(title || '').toUpperCase(), w - 20);
    spaced(t, x, top + 3.2, 0.5);
    line(x + spacedWidth(t, 0.5) + 4, top + 2.2, x + w, top + 2.2);
  }

  // ---- KPI strip ----
  function kpiStrip(kpis) {
    if (!kpis.length) return;
    const top = y + 1, h = 34, cw = CW / kpis.length;
    doc.setDrawColor(...C.DARK_BG_4); doc.setLineWidth(0.26);
    kpis.forEach((k, i) => doc.rect(M + i * cw, top, cw, h));
    kpis.forEach((k, i) => {
      const x = M + i * cw;
      plus(x, top, C.GOLD, 10);
      font(34, 'bold', C.GOLD); doc.text(fit(k.value, cw - 12), x + 6.5, top + 17);
      font(7.5, 'bold', C.LIGHT_PURPLE); spaced(fit(k.label, cw - 18), x + 6.5, top + 26, 0.5);
    });
    y = top + h;
  }

  // ---- one field row: label ......... [bar] value [share] ----
  function rowItem(x, top, w, r) {
    const right = x + w, base = top + 5.8;
    let vx = right;
    if (r.share) { font(9, 'bold', C.GOLD); doc.text(r.share, right, base, { align: 'right' }); vx = right - 13; }
    font(10.5, 'bold', C.WHITE); doc.text(r.value, vx, base, { align: 'right' });
    let lx = vx - doc.getTextWidth(r.value) - 3;
    if (r.bar != null) {
      const bw = 11.6;
      fill(C.DARK_BG_3); doc.rect(lx - bw, top + 4.4, bw, 0.8, 'F');
      const fw = bw * clamp01(r.bar);
      if (fw > 0.05) { fill(C.GOLD); doc.rect(lx - bw, top + 4.4, fw, 0.8, 'F'); }
      lx -= bw + 3;
    }
    font(9.75, 'normal', C.LIGHT_PURPLE); doc.text(fit(r.label, lx - x - 1), x, base);
    line(x, top + ROW, right, top + ROW, C.DARK_BG_3);
  }

  // ---- flat block: 3 columns, column-major; splits across pages if needed ----
  function flatBlock(title, rows, total) {
    if (!rows.length && !total) return;
    y += GAP;
    let rest = rows.slice(), label = title;
    while (rest.length) {
      let perCol = Math.ceil(rest.length / FLAT_COLS);
      const headH = 8;
      if (y + headH + perCol * ROW > LIMIT) {
        const avail = Math.floor((LIMIT - y - headH) / ROW);
        if (avail < 3) { contPage(); continue; }
        perCol = Math.min(perCol, avail);
      }
      const chunk = rest.splice(0, perCol * FLAT_COLS);
      perCol = Math.ceil(chunk.length / FLAT_COLS);
      sectionHeader(label); y += headH;
      chunk.forEach((r, i) => {
        const c = Math.floor(i / perCol), ri = i % perCol;
        rowItem(M + c * (FLAT_COL_W + COLGAP), y + ri * ROW, FLAT_COL_W, r);
      });
      y += perCol * ROW;
      if (rest.length) { contPage(); label = `${title} (cont.)`; }
    }
    if (total) {
      if (!rows.length) { sectionHeader(title); y += 8; }
      if (y + 15 > LIMIT) contPage();
      y += 3;
      fill(C.DARK_BG_3); doc.rect(M, y, CW, 12, 'F');
      font(9, 'bold', C.WHITE); spaced(fit(total.label.toUpperCase(), CW - 60), M + 5, y + 7.4, 0.6);
      font(21, 'bold', C.GOLD); doc.text(total.value, W - M - 5, y + 8.8, { align: 'right' });
      y += 12;
    }
  }

  // ---- tables (HO/OP and matrix), up to two side by side ----
  function drawTable(x, top, w, t, rows, cont) {
    sectionHeader(cont ? `${t.title} (cont.)` : t.title, x, w, top);
    const hy = top + 8, n = t.cols.length;
    font(7.5, 'bold', C.LIGHT_PURPLE);
    t.cols.forEach((c, ci) => doc.text(fit(c, TABLE_COL_W - 1), x + w - (n - 1 - ci) * TABLE_COL_W, hy + 5.2, { align: 'right' }));
    line(x, hy + 8, x + w, hy + 8);
    rows.forEach((r, ri) => {
      const ry = hy + 8 + ri * ROW;
      font(9.75, 'normal', C.LIGHT_PURPLE); doc.text(fit(r.label, w - n * TABLE_COL_W - 2), x, ry + 5.8);
      r.cells.forEach((c, ci) => {
        if (c.gold) font(10.5, 'bold', C.GOLD); else font(10.5, 'normal', C.WHITE);
        doc.text(fit(c.value, TABLE_COL_W - 1), x + w - (n - 1 - ci) * TABLE_COL_W, ry + 5.8, { align: 'right' });
      });
      line(x, ry + ROW, x + w, ry + ROW, C.DARK_BG_3);
    });
  }

  function tablesBlock(tables) {
    if (!tables.length) return;
    y += GAP;
    const offs = tables.map(() => 0);
    const left = () => tables.some((t, i) => offs[i] < t.rows.length);
    let cont = false;
    while (left()) {
      let n = Math.max(...tables.map((t, i) => t.rows.length - offs[i]));
      const avail = Math.floor((LIMIT - y - 16) / ROW);
      if (avail < n) { if (avail < 3) { contPage(); continue; } n = avail; }
      tables.forEach((t, i) => {
        drawTable(M + i * (HALF_W + COLGAP), y, HALF_W, t, t.rows.slice(offs[i], offs[i] + n), cont);
        offs[i] += n;
      });
      y += 16 + n * ROW;
      if (left()) { contPage(); cont = true; }
    }
  }

  // ---- group: one column per subsection ----
  function cardsBlock(title, cards) {
    if (!cards.length) return;
    y += GAP;
    if (y + 16 + 2 * ROW > LIMIT) contPage();
    sectionHeader(title); y += 8;
    for (let i = 0; i < cards.length; i += 2) {
      const pair = cards.slice(i, i + 2);
      const h = 8 + Math.max(...pair.map((c) => c.rows.length)) * ROW;
      if (y + h > LIMIT) contPage();
      pair.forEach((cd, j) => {
        const x = M + j * (HALF_W + COLGAP);
        font(7.5, 'bold', C.LIGHT_PURPLE); spaced(fit(cd.title.toUpperCase(), HALF_W - 10), x, y + 5.2, 0.5);
        line(x, y + 8, x + HALF_W, y + 8);
        cd.rows.forEach((r, ri) => rowItem(x, y + 8 + ri * ROW, HALF_W, r));
      });
      y += h + 4;
    }
  }

  // ---- list fields: bullets ----
  function listBlock(title, items) {
    if (!items.length) return;
    y += GAP;
    font(9.75);
    const wrapped = items.map((t) => doc.splitTextToSize(String(t), CW - 6));
    if (y + 8 + Math.min(wrapped[0].length * 5 + 2.5, 30) > LIMIT) contPage();
    sectionHeader(title); y += 9;
    wrapped.forEach((ln) => {
      if (y + ln.length * 5 > LIMIT) contPage();
      fill(C.GOLD); doc.rect(M, y - 2.6, 1.6, 1.6, 'F');
      font(9.75, 'normal', C.WHITE); doc.text(ln, M + 5, y);
      y += ln.length * 5 + 2.5;
    });
  }

  // ---- data → rows ----
  // A percent_of field whose numerator is a count in the same section is shown
  // beside that count ("863  96.2%") instead of on its own row.
  function buildRows(fields, resolved) {
    const byKey = {}; fields.forEach((f) => { byKey[f.key] = f; });
    const shareOf = {}, used = new Set();
    fields.forEach((f) => {
      if (f.type !== 'percentage' || fType(f) !== 'percent_of') return;
      const n = fArgs(f).numerator;
      if (n && byKey[n] && byKey[n].type !== 'percentage' && !shareOf[n]) { shareOf[n] = f; used.add(f.key); }
    });
    return fields.filter((f) => !used.has(f.key) && f.type !== 'list').map((f) => {
      const v = resolved[f.key], label = f.label || f.key, sh = shareOf[f.key];
      if (sh) { const sv = resolved[sh.key]; return { label, value: show(f, v), share: show(sh, sv), bar: num(sv) / 100 }; }
      if (f.type === 'percentage') return { label, value: show(f, v), bar: num(v) / 100 };
      if (f.type === 'ratio') return { label, value: show(f, v), bar: ratioFrac(v) };
      return { label, value: show(f, v) };
    });
  }

  function hoopTable(s, fields, resolved) {
    const rows = {}, order = [], leftovers = [];
    fields.forEach((f) => {
      let r = dimRow(f), c = dimCol(f);
      if (!r || !c) { const m = String(f.key).match(/^(.*)_(ho|op)$/i); if (m) { r = r || m[1]; c = c || m[2]; } }
      if (!r || !c) { leftovers.push(f); return; }
      c = String(c).toLowerCase();
      if (!rows[r]) { rows[r] = { label: f.label || f.key }; order.push(r); }
      rows[r][c] = resolved[f.key]; rows[r][`${c}F`] = f;
    });
    const t = {
      title: s.title || s.key, cols: ['HO', 'OP', 'TOTAL'],
      rows: order.map((r) => {
        const x = rows[r], f = x.hoF || x.opF;
        const additive = !f.unit && (f.type === 'number' || f.type === 'currency');
        const tot = additive && (!isEmpty(x.ho) || !isEmpty(x.op)) ? show(f, num(x.ho) + num(x.op)) : '—';
        return { label: x.label, cells: [{ value: show(x.hoF || f, x.ho) }, { value: show(x.opF || f, x.op) }, { value: tot, gold: true }] };
      }),
    };
    return { table: t, leftovers };
  }

  function matrixTable(s, fields, resolved) {
    const rows = {}, ro = [], co = [], leftovers = [];
    fields.forEach((f) => {
      const r = dimRow(f), c = dimCol(f);
      if (!r || !c) { leftovers.push(f); return; }
      if (!rows[r]) {
        const lbl = String(f.label || '').includes(' · ') ? String(f.label).split(' · ')[0] : humanize(r);
        rows[r] = { label: lbl, c: {}, f: {} }; ro.push(r);
      }
      if (!co.includes(c)) co.push(c);
      rows[r].c[c] = resolved[f.key]; rows[r].f[c] = f;
    });
    const t = {
      title: s.title || s.key, cols: co.map((c) => humanize(c).toUpperCase()),
      rows: ro.map((r) => ({
        label: rows[r].label,
        cells: co.map((c) => ({ value: show(rows[r].f[c], rows[r].c[c]), gold: String(r).toLowerCase() === 'total' })),
      })),
    };
    return { table: t, leftovers };
  }

  // ---- per module ----
  modules.forEach((mod, mi) => {
    const sections = (mod.sections || []).filter((s) => s.is_active !== false).slice().sort(bySort);
    const allFields = [];
    sections.forEach((s) => (s.fields || []).forEach((f) => { if (f.is_active !== false) allFields.push({ ...f, section: s.key }); }));
    const resolved = resolveComputedValues(allFields, mod.values || {}, allFields);

    cur = { name: mod.name || mod.code, num: String(mi + 1).padStart(2, '0') };
    newPage(cur, false);

    if (!mod.values || Object.keys(mod.values).length === 0) {
      y += GAP; font(10, 'normal', C.LIGHT_PURPLE); doc.text('No published data for this period.', M, y + 4);
      return;
    }

    // KPIs — featured first, then sort order (same rule as before).
    const kpis = allFields
      .filter((f) => ['number', 'percentage', 'currency'].includes(f.type))
      .sort((a, b) => (b.featured === true) - (a.featured === true) || bySort(a, b))
      .slice(0, 4)
      .map((f) => ({ value: show(f, resolved[f.key]), label: String(f.label || f.key).replace(/\s*%$/, '').toUpperCase() }));
    kpiStrip(kpis);

    let pending = [];
    const flush = () => { while (pending.length) tablesBlock(pending.splice(0, 2)); };

    sections.forEach((s) => {
      const fields = allFields.filter((f) => f.section === s.key).sort(bySort);
      if (!fields.length) return;
      const title = s.title || s.key;

      if (s.layout === 'ho_op' || s.layout === 'matrix') {
        const { table, leftovers } = s.layout === 'ho_op' ? hoopTable(s, fields, resolved) : matrixTable(s, fields, resolved);
        if (table.rows.length) pending.push(table);
        if (pending.length === 2) flush();
        if (leftovers.length) { flush(); flatBlock(title, buildRows(leftovers, resolved), null); }
        return;
      }
      flush();

      const lists = fields.filter((f) => f.type === 'list');
      const others = fields.filter((f) => f.type !== 'list');

      if (s.layout === 'group') {
        const subs = s.subsections || [];
        const groups = {}, order = [];
        others.forEach((f) => { const k = subKey(f) || '_'; if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(f); });
        const cards = order.map((k) => {
          const sub = subs.find((ss) => ss.key === k);
          return { title: (sub && sub.title) || (k === '_' ? '' : humanize(k)), rows: buildRows(groups[k], resolved) };
        });
        cardsBlock(title, cards);
      } else if (others.length) {
        let total = null, rowFields = others;
        if (s.layout === 'labeled_grid') {
          const tf = others.find((f) => fType(f) === 'sum' && (f.source === 'computed' || f.source == null));
          if (tf) { total = { label: tf.label || tf.key, value: show(tf, resolved[tf.key]) }; rowFields = others.filter((f) => f !== tf); }
        }
        flatBlock(title, buildRows(rowFields, resolved), total);
      }

      if (lists.length) {
        listBlock(others.length ? `${title} — ${lists[0].label || 'List'}` : title,
          lists.flatMap((f) => listItems(resolved[f.key])));
      }
    });
    flush();
  });

  // ---- footer on every page: "Page X of N" ----
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    line(M, FOOT_Y, W - M, FOOT_Y);
    font(7.5, 'normal', C.LIGHT_PURPLE);
    doc.text('Abdul Latif Jameel Finance — Human Capital · Confidential', M, FOOT_Y + 7.5);
    doc.text(`Page ${i} of ${total}`, W - M, FOOT_Y + 7.5, { align: 'right' });
  }

  const safeMonth = String(monthName || '').replace(/[^A-Za-z0-9]+/g, '_') || 'period';
  doc.save(`HR_Composite_${safeMonth}_${year || ''}.pdf`);
}
