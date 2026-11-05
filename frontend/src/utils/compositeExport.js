// Composite PDF Export — modeled on utils/pdfExport.js (Annual Plan family).
// Same jsPDF CDN load, same C palette, same ALJ header box + gold underline +
// month badge + category-header style + autotable. Generic over any module's
// sections/fields/values. Read-only over published data. No npm dependency.
import { resolveComputedValues, formatValue, formatRatio, parseList } from '../engine/computers';

export async function exportCompositeToPDF(period, modules) {
  // ---- load jsPDF + autotable via CDN (verbatim approach from pdfExport.js) ----
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
  const pageWidth = 297, pageHeight = 420;

  const { year, monthName } = period || {};
  const badgeText = `${monthName || ''} ${year || ''}`.trim();

  // ---- C palette (verbatim from pdfExport.js) ----
  const C = {
    PRIMARY_PURPLE: [55, 30, 84], GOLD: [243, 192, 54], LIGHT_PURPLE: [168, 136, 190],
    DARK_BG: [26, 16, 40], DARK_BG_3: [61, 40, 86], DARK_BG_4: [74, 50, 101],
    WHITE: [255, 255, 255], ROW_EVEN: [32, 23, 45], ROW_ODD: [36, 24, 53],
  };

  const L = { headerY: 4, headerHeight: 14, headerX: 7, headerRadius: 3.5, goldLineHeight: 0.7 };
  L.headerWidth = pageWidth - 14;

  // ---- page background + header (verbatim style) ----
  function drawChrome() {
    doc.setFillColor(...C.DARK_BG); doc.rect(0, 0, pageWidth, pageHeight, 'F');
    const hCY = L.headerY + L.headerHeight / 2;
    doc.setFillColor(...C.DARK_BG_3); doc.roundedRect(L.headerX, L.headerY, L.headerWidth, L.headerHeight, L.headerRadius, L.headerRadius, 'F');
    doc.setFillColor(...C.GOLD); doc.rect(L.headerX, L.headerY + L.headerHeight, L.headerWidth, L.goldLineHeight, 'F');

    const lsY = hCY - 3.5;
    doc.setTextColor(...C.WHITE); doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text('Abdul Latif Jameel', 12, lsY + 3.5);
    doc.setTextColor(...C.GOLD); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text('FINANCE', 12, lsY + 7);
    doc.setTextColor(...C.WHITE); doc.setFontSize(18); doc.setFont('helvetica', 'bold');
    doc.text('HR Composite Report', pageWidth / 2, hCY + 2, { align: 'center' });

    const bW = 42, bH = 9, bX = pageWidth - 7 - bW - 9, bY = hCY - bH / 2;
    if (badgeText) {
      doc.setFillColor(...C.GOLD); doc.roundedRect(bX, bY, bW, bH, 2, 2, 'F');
      doc.setTextColor(...C.PRIMARY_PURPLE); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
      doc.text(badgeText, bX + bW / 2, hCY + 1.5, { align: 'center' });
    }
  }

  function drawFooter() {
    const pageNum = doc.internal.getNumberOfPages();
    doc.setFillColor(...C.DARK_BG_3); doc.rect(0, pageHeight - 7.8, pageWidth, 7.8, 'F');
    doc.setTextColor(...C.LIGHT_PURPLE); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.text('Abdul Latif Jameel Finance — Human Capital · Confidential', 7, pageHeight - 2.8);
    doc.text(`Page ${pageNum}`, pageWidth - 7, pageHeight - 2.8, { align: 'right' });
  }

  drawChrome();
  const contentTop = L.headerY + L.headerHeight + L.goldLineHeight + 10;
  const bottomLimit = pageHeight - 14;
  let cursorY = contentTop;

  function ensureSpace(needed) {
    if (cursorY + needed > bottomLimit) {
      drawFooter();
      doc.addPage();
      drawChrome();
      cursorY = contentTop;
    }
  }

  // ---- display helpers (match the on-screen snapshot) ----
  const displayField = (f, v) => {
    if (v === undefined || v === null || v === '') return '—';
    if (f && f.type === 'ratio') return formatRatio(v);
    if (f && f.type === 'list') { const items = parseList(v); return items.length ? `${items.length} item(s)` : '—'; }
    return f ? formatValue(f, v) : String(v);
  };

  // ---- per module ----
  modules.forEach((mod) => {
    const sections = (mod.sections || []).filter((s) => s.is_active !== false);
    const allFields = [];
    sections.forEach((s) => (s.fields || []).forEach((f) => { if (f.is_active !== false) allFields.push({ ...f, section: s.key }); }));
    const resolved = resolveComputedValues(allFields, mod.values || {}, allFields);

    // SECTION HEADER (category-header style: dark rounded bar + gold text).
    ensureSpace(5.5 + 8);
    const tX = 5, tW = pageWidth - 10;
    doc.setFillColor(...C.DARK_BG_3); doc.roundedRect(tX, cursorY, tW, 6.5, 1.6, 1.6, 'F');
    doc.setTextColor(...C.GOLD); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text(mod.name || mod.code, tX + 4, cursorY + 4.4);
    cursorY += 6.5 + 4;

    // KPIs — featured (or first few) numeric/percentage/currency fields: big gold value + label.
    const kpiFields = allFields
      .filter((f) => ['number', 'percentage', 'currency'].includes(f.type))
      .sort((a, b) => (b.featured === true) - (a.featured === true) || (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .slice(0, 4);
    if (kpiFields.length > 0) {
      ensureSpace(16);
      const kGap = tW / kpiFields.length;
      kpiFields.forEach((f, i) => {
        const kx = tX + i * kGap + kGap / 2;
        doc.setTextColor(...C.GOLD); doc.setFontSize(20); doc.setFont('helvetica', 'bold');
        doc.text(displayField(f, resolved[f.key]), kx, cursorY + 6, { align: 'center' });
        doc.setTextColor(...C.LIGHT_PURPLE); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
        const lbl = (f.label || f.key).toUpperCase();
        doc.text(lbl.length > 26 ? lbl.slice(0, 24) + '…' : lbl, kx, cursorY + 11, { align: 'center' });
      });
      cursorY += 16;
    }

    // FIELDS TABLE via autotable, grouped by section (subheader rows). [Field, Value].
    const body = [];
    sections.forEach((s) => {
      const fields = (s.fields || []).filter((f) => f.is_active !== false);
      if (fields.length === 0) return;
      body.push([{ content: s.title || s.key, colSpan: 2, styles: { fillColor: C.DARK_BG_4, textColor: C.LIGHT_PURPLE, fontStyle: 'bold', fontSize: 8 } }]);
      fields.forEach((f) => body.push([f.label || f.key, displayField(f, resolved[f.key])]));
    });

    if (body.length > 0) {
      doc.autoTable({
        startY: cursorY,
        margin: { left: tX, right: tX, bottom: 14 },
        tableWidth: tW,
        head: [['Field', 'Value']],
        body,
        theme: 'plain',
        styles: { fontSize: 8, cellPadding: 1.6, textColor: C.WHITE, lineWidth: 0 },
        headStyles: { fillColor: C.DARK_BG_4, textColor: C.GOLD, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: C.ROW_ODD },
        bodyStyles: { fillColor: C.ROW_EVEN },
        columnStyles: { 0: { cellWidth: tW * 0.62, textColor: C.LIGHT_PURPLE }, 1: { cellWidth: tW * 0.38, textColor: C.WHITE, fontStyle: 'bold', halign: 'right' } },
        didDrawPage: () => { drawChrome(); },
      });
      cursorY = (doc.lastAutoTable ? doc.lastAutoTable.finalY : cursorY) + 8;
    } else {
      doc.setTextColor(...C.LIGHT_PURPLE); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      doc.text('No published data for this period.', tX + 2, cursorY + 2);
      cursorY += 8;
    }
  });

  drawFooter();

  const safeMonth = String(monthName || '').replace(/[^A-Za-z0-9]+/g, '_') || 'period';
  doc.save(`HR_Composite_${safeMonth}_${year || ''}.pdf`);
}
