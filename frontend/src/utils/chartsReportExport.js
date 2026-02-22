// chartsReportExport.js - HCD Performance Analytics Report — Direct PDF Download
// 4-page PDF report: Cover → YTD Progress → Function Scorecard → Key Insights
// Uses html2canvas + jsPDF auto-download (matches annual plan UX)
// SOURCE OF TRUTH: full_report_preview.html
// NO PREVIEW — click button → generates PDF → auto-downloads

const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fullMonths = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const funcNames = ['OP','D&C','T&A','OD','Com&Bn','SBM'];
const funcFullNames = { OP:'Operations', 'D&C':'Development & Career', 'T&A':'Talent Acquisition', OD:'Organization Design', 'Com&Bn':'Compensation & Benefits', SBM:'Strategy & Business Mgmt' };
const catDefs = [
  { key: 'Activities/Programs/Projects', label: 'Activities / Programs / Projects', shortLabel: 'Activities/Programs', icon: '📋', color: '#1e293b' },
  { key: 'Maintenance Projects', label: 'Maintenance Projects', shortLabel: 'Maintenance Projects', icon: '🔧', color: '#64748b' },
  { key: 'Reports', label: 'Reports', shortLabel: 'Reports', icon: '📊', color: '#cbd5e1' },
];
const ownerBadgeColors = { OP:{bg:'#dcfce7',c:'#16a34a'}, 'D&C':{bg:'#dbeafe',c:'#2563eb'}, 'T&A':{bg:'#fef3c7',c:'#92400e'}, OD:{bg:'#f3e8ff',c:'#7c3aed'}, 'Com&Bn':{bg:'#fee2e2',c:'#dc2626'}, SBM:{bg:'#cffafe',c:'#0e7490'}, ALL:{bg:'#f1f5f9',c:'#64748b'} };

function getOwnerBadge(owner) {
  const f = owner.split('/')[0].trim();
  const c = ownerBadgeColors[f] || ownerBadgeColors.ALL;
  return `<span style="display:inline-block;padding:2px 7px;border-radius:6px;font-size:9px;font-weight:600;background:${c.bg};color:${c.c}">${owner}</span>`;
}

// ============================
// DATA COMPUTATION (Logic A1)
// ============================
function computeData(allData) {
  const now = new Date();
  const cmi = now.getMonth();
  const cms = months[cmi];
  const cmf = fullMonths[cmi];
  const nms = months[(cmi + 1) % 12];

  const totalAct = allData.length;
  const compAct = allData.filter(i => i.status === 'Completed' || i.status === 'Completed Early').length;
  const overallRate = totalAct > 0 ? (compAct / totalAct) * 100 : 0;

  const catStats = catDefs.map(cat => {
    const items = allData.filter(i => i.category === cat.key);
    const t = items.length;
    const c = items.filter(i => i.status === 'Completed' || i.status === 'Completed Early').length;
    const d = items.filter(i => i.status === 'Delayed').length;
    return { ...cat, total: t, completed: c, delayed: d, rate: t > 0 ? (c / t) * 100 : 0 };
  });

  const monthData = months.map((m, mi) => {
    let due = 0, done = 0, delayed = 0;
    allData.forEach(item => {
      if (!(item.dueDates || []).includes(m)) return;
      due++;
      const ms = item.monthStatus || {};
      const st = ms[m] || ms[fullMonths[mi]] || '';
      if (st === 'Completed' || st === 'Completed Early') done++;
      else if (st === 'Delayed') delayed++;
    });
    return { m, due, done, delayed, past: mi < cmi, current: mi === cmi, future: mi > cmi };
  });

  const dueThroughCurrent = monthData.slice(0, cmi + 1).reduce((s, d) => s + d.due, 0);
  const totalDone = monthData.reduce((s, d) => s + d.done, 0);
  const totalDue = monthData.reduce((s, d) => s + d.due, 0);
  const actualPct = totalDue > 0 ? (totalDone / totalDue) * 100 : 0;
  const expectedPct = totalDue > 0 ? (dueThroughCurrent / totalDue) * 100 : 0;
  const gap = expectedPct - actualPct;

  // Risk Radar
  const highRisk = [], medRisk = [], watchRisk = [];
  allData.forEach(item => {
    const dd = item.dueDates || [];
    const ms = item.monthStatus || {};
    dd.forEach(m => {
      const mi = months.indexOf(m);
      if (mi < cmi && mi >= 0) {
        const st = ms[m] || ms[fullMonths[mi]] || '';
        if (st !== 'Completed' && st !== 'Completed Early' && !highRisk.find(r => r.id === item.id && r.dm === m))
          highRisk.push({ id: item.id, name: item.activity, owner: item.owner, dm: m });
      }
    });
    if (dd.includes(cms)) {
      const st = ms[cms] || ms[cmf] || '';
      if (!st || st === 'Scheduled') if (!medRisk.find(r => r.id === item.id))
        medRisk.push({ id: item.id, name: item.activity, owner: item.owner, dm: cms });
    }
    if (dd.includes(nms)) {
      const st = ms[nms] || ms[fullMonths[(cmi+1)%12]] || '';
      if (!st || st === 'Scheduled') if (!watchRisk.find(r => r.id === item.id))
        watchRisk.push({ id: item.id, name: item.activity, owner: item.owner, dm: nms });
    }
  });

  // Scorecard
  const scorecard = catDefs.map(cat => {
    const ci = allData.filter(i => i.category === cat.key);
    const fs = funcNames.map(fn => {
      const fi = ci.filter(i => i.owner.split('/').map(o => o.trim()).includes(fn));
      const t = fi.length, c = fi.filter(i => i.status === 'Completed' || i.status === 'Completed Early').length;
      const d = fi.filter(i => i.status === 'Delayed').length;
      return { fn, total: t, completed: c, delayed: d, rate: t > 0 ? (c / t) * 100 : 0 };
    }).filter(f => f.total > 0).sort((a, b) => b.rate - a.rate || b.completed - a.completed || a.total - b.total);
    return { ...cat, fs };
  });

  // Workload
  const wts = { 'Activities/Programs/Projects': 3, 'Maintenance Projects': 2, 'Reports': 1 };
  const workload = funcNames.map(fn => {
    let p = 0, m = 0, r = 0;
    allData.forEach(item => {
      if (!item.owner.split('/').map(o => o.trim()).includes(fn)) return;
      if (item.category === 'Activities/Programs/Projects') p++;
      else if (item.category === 'Maintenance Projects') m++;
      else if (item.category === 'Reports') r++;
    });
    return { fn, p, m, r, pw: p*3, mw: m*2, rw: r*1, w: p*3 + m*2 + r*1 };
  }).sort((a, b) => b.w - a.w);
  const totalW = workload.reduce((s, d) => s + d.w, 0);

  // Insights
  const funcOv = funcNames.map(fn => {
    const fi = allData.filter(i => i.owner.split('/').map(o => o.trim()).includes(fn));
    const t = fi.length, c = fi.filter(i => i.status === 'Completed' || i.status === 'Completed Early').length;
    let md = 0, mdu = 0;
    fi.forEach(item => { (item.dueDates||[]).forEach(m => { const mi=months.indexOf(m); if(mi<0) return; mdu++; const ms=item.monthStatus||{}; const st=ms[m]||ms[fullMonths[mi]]||''; if(st==='Completed'||st==='Completed Early') md++; }); });
    return { fn, total: t, completed: c, rate: t > 0 ? (c / t) * 100 : 0, md, mdu };
  });
  const top = [...funcOv].sort((a, b) => b.rate - a.rate || b.completed - a.completed)[0];
  const worst = [...funcOv].sort((a, b) => a.rate - b.rate || a.completed - b.completed)[0];

  const futureW = months.map((m, mi) => {
    if (mi <= cmi) return { m, w: 0 };
    let w = 0; allData.forEach(item => { if (!(item.dueDates||[]).includes(m)) return; w += wts[item.category]||1; });
    return { m, w };
  }).filter(d => d.w > 0).sort((a, b) => b.w - a.w);
  const busiest = futureW[0] || { m: 'N/A', w: 0 };

  const dueThroughNext = monthData.slice(0, cmi + 2).reduce((s, d) => s + d.due, 0);
  const needed = Math.max(0, Math.ceil(dueThroughNext * (expectedPct / 100)) - totalDone);

  return { cmi, cms, cmf, nms, totalAct, compAct, overallRate, catStats, monthData,
    dueThroughCurrent, totalDone, totalDue, actualPct, expectedPct, gap,
    highRisk, medRisk, watchRisk, scorecard, workload, totalW,
    funcOv, top, worst, busiest, needed };
}

// ============================
// GENERATE RECOMMENDATIONS
// ============================
function genRecs(d) {
  const recs = [];
  if (d.highRisk.length > 0) recs.push(`<strong>Close overdue items immediately.</strong> Month-level due dates from past months remain incomplete. Schedule a review meeting with responsible function heads to confirm status and update records.`);
  const cd = d.monthData[d.cmi]; if (cd && cd.due > 0 && cd.done < cd.due) recs.push(`<strong>Prioritize ${d.cmf} due dates.</strong> ${cd.due} month-level due dates are in ${d.cmf} with ${cd.done} completion${cd.done!==1?'s':''} recorded. Focus on quick wins that can be completed before month end.`);
  if (d.worst && d.worst.completed === 0) recs.push(`<strong>Activate ${d.worst.fn} function.</strong> ${funcFullNames[d.worst.fn]} has 0% progress with no activities completed. Identify blockers and assign accountability for upcoming deliverables.`);
  if (d.busiest.w > 0) { const bf = fullMonths[months.indexOf(d.busiest.m)]||d.busiest.m; recs.push(`<strong>Plan ahead for ${bf} peak.</strong> ${bf} has the highest weighted workload (${d.busiest.w} pts). Begin preparation early to distribute effort evenly and avoid a bottleneck.`); }
  if (recs.length < 2) recs.push(`<strong>Maintain momentum.</strong> Continue tracking month-level completions and ensure all teams are updating their progress regularly in the system.`);
  return recs.slice(0, 4);
}

// ============================
// BUILD HTML PAGES
// ============================
function buildPages(allData) {
  const d = computeData(allData);
  const now = new Date();
  const reportDate = now.toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
  const reportMonth = now.toLocaleDateString('en-US', { year:'numeric', month:'long' });
  const ringPct = d.overallRate;
  const ringCirc = 2 * Math.PI * 14;
  const ringOff = ringCirc - (ringPct / 100) * ringCirc;

  const fmtRate = (r) => r > 0 ? `<span style="font-weight:700;font-size:12px;color:#22c55e">${r.toFixed(r<10?1:0)}%</span>` : `<span style="font-weight:700;font-size:12px;color:#ccc">0%</span>`;
  const badge = (v, type) => `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:26px;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:${type==='g'?'#dcfce7':'#fee2e2'};color:${type==='g'?'#16a34a':'#dc2626'}">${v}</span>`;
  const rankStyle = (i) => i===0?'background:#FEF9C3;color:#A16207':i===1?'background:#F1F5F9;color:#475569':i===2?'background:#FED7AA;color:#9A3412':'background:#F3E8FF;color:#7C3AED';
  const rankEmoji = (i) => i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1);

  const pageStyle = `width:694px;min-height:980px;background:#fafafa;position:relative;overflow:hidden;font-family:'DM Sans','Inter',sans-serif;`;
  const footerStyle = `padding:16px 40px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #ece6f3;font-size:10px;color:#aaa;position:absolute;bottom:0;left:0;right:0;`;
  const sectionStyle = `padding:24px 32px;`;
  const sectionNextStyle = `padding:0 32px 24px;`;
  const labelStyle = `font-size:10px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;`;
  const subStyle = `font-size:12px;color:#999;margin-bottom:18px;line-height:1.4;`;
  const thStyle = `background:#1a0e2e;color:#fff;font-size:10px;font-weight:600;padding:10px 12px;text-align:left;`;
  const tdStyle = `padding:9px 12px;font-size:11px;color:#333;border-bottom:1px solid #f5f2f8;`;
  const tdEven = `background:#faf8fc;`;
  const tableStyle = `width:100%;border-collapse:separate;border-spacing:0;border-radius:10px;overflow:hidden;border:1px solid #ece6f3;`;

  // ═══════ PAGE 1: COVER ═══════
  const page1 = `<div style="${pageStyle}background:linear-gradient(160deg,#1a0e2e 0%,#2d1845 40%,#3d2460 70%,#4a3070 100%);min-height:980px;">
    <div style="position:absolute;top:-120px;right:-120px;width:500px;height:500px;background:radial-gradient(circle,rgba(243,192,54,0.12) 0%,transparent 70%);border-radius:50%;"></div>
    <div style="position:absolute;bottom:-100px;left:-100px;width:400px;height:400px;background:radial-gradient(circle,rgba(139,92,246,0.08) 0%,transparent 70%);border-radius:50%;"></div>
    <div style="padding:44px 50px 30px;display:flex;justify-content:space-between;align-items:flex-start;position:relative;z-index:1;">
      <div><div style="color:#fff;font-size:16px;font-weight:700;">AbdulLatif Jameel Finance</div><div style="color:#A888BE;font-size:12px;font-weight:500;margin-top:4px;">Human Capital Department</div></div>
      <div style="background:rgba(243,192,54,0.12);border:1px solid rgba(243,192,54,0.25);color:#F3C036;padding:5px 16px;border-radius:20px;font-size:9px;font-weight:600;letter-spacing:1.5px;">CONFIDENTIAL</div>
    </div>
    <div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:0 50px;position:relative;z-index:1;min-height:700px;">
      <div style="color:#F3C036;font-size:12px;font-weight:600;letter-spacing:4px;text-transform:uppercase;margin-bottom:18px;">Annual Plan 2026</div>
      <div style="color:#fff;font-size:44px;font-weight:700;line-height:1.1;margin-bottom:16px;">HCD Performance<br><span style="color:#F3C036;">Analytics Report</span></div>
      <div style="color:#A888BE;font-size:18px;font-weight:500;">${reportMonth}</div>
    </div>
    <div style="padding:24px 50px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid rgba(255,255,255,0.06);position:relative;z-index:1;">
      <div style="color:#A888BE;font-size:10px;">Generated from HCD Application • For internal use only</div>
      <div style="color:#fff;font-size:11px;font-weight:600;">${reportDate}</div>
    </div>
  </div>`;

  // ═══════ PAGE 2: YTD PROGRESS ═══════
  const monthTimeline = d.monthData.map(md => {
    const cellStyle = md.current ? `flex:1;display:flex;flex-direction:column;align-items:center;padding:12px 3px 10px;position:relative;background:#faf5ff;border:2px solid #8B5CF6;border-radius:10px;margin:-2px;z-index:2;box-shadow:0 4px 16px rgba(139,92,246,0.15);`
      : md.past ? `flex:1;display:flex;flex-direction:column;align-items:center;padding:12px 3px 10px;position:relative;background:#fafafa;border-radius:8px;`
      : `flex:1;display:flex;flex-direction:column;align-items:center;padding:12px 3px 10px;position:relative;border-radius:8px;`;
    const nameColor = md.current ? '#8B5CF6' : md.past ? '#555' : '#888';
    const countColor = md.future ? '#ccc' : '#1a0e2e';
    const doneText = md.future ? '—' : md.done > 0 ? `${md.done} done` : '0 done';
    const delText = md.future ? '—' : md.delayed > 0 ? `${md.delayed} delayed` : '0 delayed';
    const doneColor = md.done > 0 && !md.future ? '#22c55e' : '#ddd';
    const delColor = md.delayed > 0 && !md.future ? '#ef4444' : '#ddd';
    const barDone = md.due > 0 && !md.future ? `<div style="height:100%;background:#22c55e;width:${(md.done/md.due)*100}%"></div><div style="height:100%;background:#ef4444;width:${(md.delayed/md.due)*100}%"></div>` : '';
    return `<div style="${cellStyle}">
      ${md.current ? `<div style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:#8B5CF6;color:#fff;font-size:7px;font-weight:700;letter-spacing:1px;padding:2px 8px;border-radius:10px;text-transform:uppercase;">NOW</div>` : ''}
      <div style="font-size:10px;font-weight:600;color:${nameColor};margin-bottom:4px;">${md.m}</div>
      <div style="font-size:18px;font-weight:700;color:${countColor};line-height:1;margin-bottom:4px;">${md.due}</div>
      <div style="font-size:8px;font-weight:600;color:${doneColor};margin-bottom:1px;min-height:11px;">${doneText}</div>
      <div style="font-size:8px;font-weight:600;color:${delColor};margin-bottom:4px;min-height:11px;">${delText}</div>
      <div style="width:80%;height:4px;background:#eee;border-radius:3px;overflow:hidden;display:flex;">${barDone}<div style="height:100%;background:#eee;flex:1;"></div></div>
    </div>`;
  }).join('');

  const riskGroup = (items, icon, title, headerBg, borderColor, titleColor, countBg, countColor, overflowColor, maxItems) => {
    if (items.length === 0) return '';
    const shown = items.slice(0, maxItems);
    const overflow = items.length > maxItems ? `<div style="font-size:10px;color:${overflowColor};font-weight:600;margin-left:12px;margin-top:2px;">+ ${items.length - maxItems} more</div>` : '';
    return `<div style="margin-bottom:14px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;padding:7px 12px;border-radius:8px;background:${headerBg};border-left:4px solid ${borderColor};">
        <div style="font-size:13px;">${icon}</div><div style="font-size:11px;font-weight:700;color:${titleColor};flex:1;">${title}</div>
        <div style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:${countBg};color:${countColor};">${items.length}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;margin-left:16px;">
        ${shown.map(r => `<div style="display:flex;align-items:center;gap:8px;padding:7px 12px;background:#faf8fc;border:1px solid #ece6f3;border-radius:8px;font-size:10px;">
          <div style="flex:1;font-weight:600;color:#1a0e2e;">${r.name}</div>${getOwnerBadge(r.owner)}<div style="font-size:9px;color:#888;min-width:50px;text-align:right;">Due: ${r.dm}</div>
        </div>`).join('')}
        ${overflow}
      </div>
    </div>`;
  };

  const riskContent = (d.highRisk.length === 0 && d.medRisk.length === 0 && d.watchRisk.length === 0)
    ? `<div style="text-align:center;padding:24px;background:#f0fdf4;border-radius:12px;border:1px solid #bbf7d0;"><div style="font-size:24px;margin-bottom:8px;">✅</div><div style="font-size:13px;font-weight:600;color:#166534;">All Clear — No Risks Detected</div></div>`
    : riskGroup(d.highRisk, '🔴', 'High Risk — Overdue', '#fef2f2', '#ef4444', '#991b1b', '#fee2e2', '#dc2626', '#991b1b', 5)
      + riskGroup(d.medRisk, '🟡', 'Medium — Due This Month, Not Started', '#fffbeb', '#f59e0b', '#92400e', '#fef3c7', '#d97706', '#92400e', 5)
      + riskGroup(d.watchRisk, '🟠', 'Watch — Due Next Month, Not Started', '#fff7ed', '#f97316', '#9a3412', '#ffedd5', '#ea580c', '#9a3412', 5);

  const warningCallout = d.gap > 0
    ? `<div style="display:flex;align-items:flex-start;gap:10px;padding:12px 16px;border-radius:10px;border:1px solid #fed7aa;background:#fff7ed;margin-top:8px;">
        <div style="font-size:16px;flex-shrink:0;">⚠️</div>
        <div style="font-size:11px;line-height:1.5;color:#9a3412;"><strong style="color:#ea580c;">${d.gap.toFixed(1)}% below expected pace.</strong> Only <strong>${d.totalDone}</strong> month-level completion${d.totalDone!==1?'s':''} recorded out of <strong>${d.dueThroughCurrent}</strong> due dates through ${d.cmf}.</div>
      </div>`
    : `<div style="display:flex;align-items:flex-start;gap:10px;padding:12px 16px;border-radius:10px;border:1px solid #bbf7d0;background:#f0fdf4;margin-top:8px;">
        <div style="font-size:16px;flex-shrink:0;">✅</div>
        <div style="font-size:11px;line-height:1.5;color:#166534;"><strong style="color:#16a34a;">On track!</strong> Actual completion rate is meeting or exceeding the expected pace.</div>
      </div>`;

  const recoveryCallout = (d.needed > 0 && d.gap > 0)
    ? `<div style="display:flex;align-items:flex-start;gap:10px;padding:12px 16px;border-radius:10px;border:1px solid #bfdbfe;background:#f0f4ff;margin-top:8px;">
        <div style="font-size:16px;flex-shrink:0;">💡</div>
        <div style="font-size:11px;line-height:1.5;color:#1e40af;">To get back on track by end of ${fullMonths[(d.cmi+1)%12]}, <strong style="color:#2563eb;">approximately ${d.needed} more month-level completion${d.needed!==1?'s':''}</strong> need to be recorded.</div>
      </div>` : '';

  const page2 = `<div style="${pageStyle}">
    <div style="${sectionStyle}">
      <div style="${labelStyle}">Overall Completion Rate</div>
      <div style="display:flex;align-items:center;gap:24px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #f0ecf5;">
        <svg width="90" height="90" viewBox="0 0 36 36"><circle cx="18" cy="18" r="14" fill="none" stroke="#f0ecf5" stroke-width="5"/><circle cx="18" cy="18" r="14" fill="none" stroke="#22c55e" stroke-width="5" stroke-linecap="round" stroke-dasharray="${ringCirc}" stroke-dashoffset="${ringOff}" transform="rotate(-90 18 18)"/><text x="18" y="19" text-anchor="middle" font-size="7" font-weight="700" fill="#1a0e2e">${ringPct.toFixed(1)}%</text><text x="18" y="24" text-anchor="middle" font-size="3.5" fill="#888">Complete</text></svg>
        <div><div style="font-size:38px;font-weight:700;color:#22c55e;line-height:1;">${ringPct.toFixed(1)}%</div><div style="font-size:12px;color:#888;margin-top:4px;line-height:1.4;">${d.compAct} of ${d.totalAct} activities completed across all functions YTD</div></div>
      </div>
      <table style="${tableStyle}"><thead><tr><th style="${thStyle}">Category</th><th style="${thStyle}">Total</th><th style="${thStyle}">Completed</th><th style="${thStyle}">Delayed</th><th style="${thStyle}">Rate</th></tr></thead><tbody>
        ${d.catStats.map((c, i) => `<tr><td style="${tdStyle}${i%2===1?tdEven:''}"><span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:6px;font-size:13px;margin-right:8px;vertical-align:middle;background:#e2e8f0;">${c.icon}</span><span style="font-weight:600;color:#1a0e2e;vertical-align:middle;">${c.shortLabel}</span></td><td style="${tdStyle}${i%2===1?tdEven:''}"><strong>${c.total}</strong></td><td style="${tdStyle}${i%2===1?tdEven:''}">${badge(c.completed,'g')}</td><td style="${tdStyle}${i%2===1?tdEven:''}">${badge(c.delayed,'r')}</td><td style="${tdStyle}${i%2===1?tdEven:''}">${fmtRate(c.rate)}</td></tr>`).join('')}
      </tbody></table>
    </div>
    <div style="${sectionNextStyle}">
      <div style="${labelStyle}">Expected vs Actual (${reportMonth})</div>
      <div style="${subStyle}">Due date entries per month and how many were completed at month level — Activity Due Through <strong>${d.cms}</strong>: <strong>${d.dueThroughCurrent}</strong></div>
      <div style="display:flex;gap:0;margin-bottom:24px;">${monthTimeline}</div>
      <div style="margin-top:32px;">
        <div style="height:26px;background:#f0ecf5;border-radius:10px;position:relative;overflow:visible;">
          <div style="height:100%;border-radius:10px;display:flex;align-items:center;padding-left:10px;font-size:10px;font-weight:700;color:#fff;position:relative;z-index:1;min-width:44px;width:${Math.max(d.actualPct,3)}%;background:linear-gradient(90deg,#22c55e,#4ade80);">${d.actualPct.toFixed(1)}%</div>
          <div style="position:absolute;top:-26px;bottom:-6px;width:3px;background:#1a0e2e;border-radius:2px;z-index:2;left:${d.expectedPct}%;"><div style="position:absolute;top:0;left:50%;transform:translateX(-50%);background:#1a0e2e;color:#fff;font-size:8px;font-weight:600;padding:3px 8px;border-radius:4px;white-space:nowrap;">${d.expectedPct.toFixed(1)}%</div></div>
        </div>
        <div style="display:flex;gap:16px;margin-top:8px;font-size:10px;color:#888;">
          <div style="display:flex;align-items:center;gap:5px;"><div style="width:8px;height:8px;border-radius:3px;background:linear-gradient(90deg,#22c55e,#4ade80);"></div> Actual: ${d.actualPct.toFixed(1)}%</div>
          <div style="display:flex;align-items:center;gap:5px;"><div style="width:8px;height:8px;border-radius:3px;background:#1a0e2e;"></div> Expected pace</div>
          <div style="display:flex;align-items:center;gap:5px;"><div style="width:8px;height:8px;border-radius:3px;background:#f0ecf5;"></div> Remaining</div>
        </div>
      </div>
      ${warningCallout}${recoveryCallout}
    </div>
    <div style="${sectionNextStyle}">
      <div style="${labelStyle}">🚨 Risk Radar</div>
      <div style="${subStyle}">Activities requiring attention</div>
      ${riskContent}
    </div>
    <div style="${footerStyle}"><span>HCD Performance Analytics Report — ${reportMonth}</span><span>Page 2 of 4</span></div>
  </div>`;

  // ═══════ PAGE 3: FUNCTION SCORECARD ═══════
  const scorecardHTML = d.scorecard.map(cat => {
    const totalInCat = cat.fs.reduce((s, f) => s + f.total, 0);
    const countColor = cat.color === '#cbd5e1' ? '#64748b' : cat.color;
    return `<div style="margin-bottom:20px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:7px 12px;border-radius:8px;border-left:4px solid ${cat.color};background:#f1f5f9;">
        <div style="font-size:15px;">${cat.icon}</div><div style="font-size:12px;font-weight:700;color:#1a0e2e;flex:1;">${cat.label}</div>
        <div style="font-size:10px;font-weight:600;padding:2px 10px;border-radius:10px;background:#e2e8f0;color:${countColor};">${totalInCat} activities</div>
      </div>
      <table style="${tableStyle}"><thead><tr><th style="${thStyle}width:35px;">Rank</th><th style="${thStyle}">Function</th><th style="${thStyle}width:55px;">Total</th><th style="${thStyle}width:75px;">Completed</th><th style="${thStyle}width:65px;">Delayed</th><th style="${thStyle}width:60px;">Rate</th></tr></thead><tbody>
        ${cat.fs.map((f, i) => `<tr><td style="${tdStyle}${i%2===1?tdEven:''}"><span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;font-size:10px;font-weight:700;${rankStyle(i)};">${rankEmoji(i)}</span></td><td style="${tdStyle}${i%2===1?tdEven:''}"><strong>${f.fn}</strong></td><td style="${tdStyle}${i%2===1?tdEven:''}"><strong>${f.total}</strong></td><td style="${tdStyle}${i%2===1?tdEven:''}">${badge(f.completed,'g')}</td><td style="${tdStyle}${i%2===1?tdEven:''}">${badge(f.delayed,'r')}</td><td style="${tdStyle}${i%2===1?tdEven:''}">${fmtRate(f.rate)}</td></tr>`).join('')}
      </tbody></table>
    </div>`;
  }).join('');

  const page3 = `<div style="${pageStyle}">
    <div style="${sectionStyle}">
      <div style="${labelStyle}">🏆 Function Scorecard</div>
      <div style="${subStyle}">Functions ranked by completion rate — separated by category</div>
      ${scorecardHTML}
    </div>
    <div style="${footerStyle}"><span>HCD Performance Analytics Report — ${reportMonth}</span><span>Page 3 of 4</span></div>
  </div>`;

  // ═══════ PAGE 4: KEY INSIGHTS ═══════
  const insightCard = (icon, title, topColor, iconBg, badgeBg, badgeColor, badgeText, value, valueColor, detail) => `<div style="border:1px solid #ece6f3;border-radius:12px;padding:16px;position:relative;overflow:hidden;">
    <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,${topColor});"></div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;"><div style="width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;background:${iconBg};">${icon}</div><div style="font-size:9px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.3px;">${title}</div></div>
    ${badgeText ? `<div style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:7px;font-size:11px;font-weight:700;margin-bottom:6px;background:${badgeBg};color:${badgeColor};">${badgeText}</div>` : ''}
    <div style="font-size:18px;font-weight:700;line-height:1.2;margin-bottom:5px;color:${valueColor};">${value}</div>
    <div style="font-size:10px;color:#666;line-height:1.5;">${detail}</div>
  </div>`;

  const workloadBars = d.workload.map(w => `<div style="display:flex;align-items:center;gap:10px;">
    <div style="width:70px;font-size:10px;font-weight:600;color:#1a0e2e;display:flex;align-items:center;gap:5px;flex-shrink:0;">${w.fn}</div>
    <div style="flex:1;height:20px;background:#f0ecf5;border-radius:6px;overflow:hidden;display:flex;">
      ${w.pw>0?`<div style="height:100%;width:${(w.pw/w.w)*100}%;background:#1e293b;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;color:#fff;">${w.pw}</div>`:''}
      ${w.mw>0?`<div style="height:100%;width:${(w.mw/w.w)*100}%;background:#64748b;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;color:#fff;">${w.mw}</div>`:''}
      ${w.rw>0?`<div style="height:100%;width:${(w.rw/w.w)*100}%;background:#cbd5e1;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;color:#475569;">${w.rw}</div>`:''}
    </div>
    <div style="min-width:50px;text-align:right;font-size:11px;font-weight:700;color:#1a0e2e;">${w.w} <span style="font-size:9px;font-weight:500;color:#999;">pts</span></div>
  </div>`).join('');

  const recs = genRecs(d);
  const recsHTML = recs.map((r, i) => `<div style="display:flex;align-items:flex-start;gap:9px;padding:10px 12px;background:#faf8fc;border:1px solid #ece6f3;border-radius:9px;">
    <div style="width:20px;height:20px;border-radius:50%;background:#1a0e2e;color:#F3C036;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;">${i+1}</div>
    <div style="font-size:11px;color:#333;line-height:1.5;">${r}</div>
  </div>`).join('');

  const topPctStr = d.top.rate.toFixed(1);
  const worstPctStr = d.worst.rate.toFixed(0);
  const busiestFull = fullMonths[months.indexOf(d.busiest.m)] || d.busiest.m;
  const topWPct = d.totalW > 0 ? ((d.workload[0]?.w / d.totalW) * 100).toFixed(1) : '0';

  const page4 = `<div style="${pageStyle}">
    <div style="${sectionStyle}">
      <div style="${labelStyle}">💡 Key Insights & Recommendations</div>
      <div style="${subStyle}">Findings based on current data — highlights what's working, what's at risk, and recommended next steps</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px;">
        ${insightCard('🏆','Top Performer','#22c55e,#4ade80','#dcfce7','#dcfce7','#16a34a',`${funcFullNames[d.top.fn]} (${d.top.fn})`,`${topPctStr}% completion`,'#16a34a',`${d.top.completed>0?'Leading with':'Highest activity count:'} <strong style="color:#1a0e2e">${d.top.completed} of ${d.top.total}</strong> activities completed.`)}
        ${insightCard('⚠️','Most At Risk','#ef4444,#f87171','#fee2e2','#fee2e2','#dc2626',`${funcFullNames[d.worst.fn]} (${d.worst.fn})`,`${worstPctStr}% completion`,'#dc2626',`<strong style="color:#1a0e2e">${d.worst.completed} of ${d.worst.mdu}</strong> due dates completed. ${d.worst.completed===0?'No activities in progress.':''}`)}
        ${insightCard('📅','Busiest Month Ahead','#F3C036,#fbbf24','#fef9c3','','','',`${busiestFull} — ${d.busiest.w} weighted pts`,'#a16207',`Highest weighted workload ahead. Planning should begin early to avoid bottleneck.`)}
        ${insightCard('⚖️','Workload Distribution','#8B5CF6,#a78bfa','#f3e8ff','','','',`${d.workload[0]?.fn} carries ${topWPct}%`,'#7c3aed',`${d.workload[0]?.fn} has highest weighted workload: <strong style="color:#1a0e2e">${d.workload[0]?.w} pts</strong>. ${d.workload.length>1?`${d.workload[d.workload.length-1].fn} has lightest at ${d.workload[d.workload.length-1].w} pts.`:''}`)}
      </div>
      <div style="margin-bottom:18px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:3px;">
          <div style="font-size:12px;font-weight:700;color:#1a0e2e;display:flex;align-items:center;gap:6px;">⚖️ Function Workload Balance</div>
          <div style="font-size:8px;color:#bbb;background:#faf8fc;padding:3px 8px;border-radius:5px;border:1px solid #ece6f3;">Weights: 📋 ×3 · 🔧 ×2 · 📊 ×1</div>
        </div>
        <div style="font-size:10px;color:#999;margin-bottom:12px;">Weighted workload per function — showing category composition</div>
        <div style="display:flex;flex-direction:column;gap:8px;">${workloadBars}</div>
        <div style="display:flex;gap:14px;margin-top:10px;padding-top:8px;border-top:1px solid #f0ecf5;">
          <div style="display:flex;align-items:center;gap:5px;font-size:9px;color:#888;"><div style="width:8px;height:8px;border-radius:3px;background:#1e293b;"></div> 📋 Programs (×3)</div>
          <div style="display:flex;align-items:center;gap:5px;font-size:9px;color:#888;"><div style="width:8px;height:8px;border-radius:3px;background:#64748b;"></div> 🔧 Maintenance (×2)</div>
          <div style="display:flex;align-items:center;gap:5px;font-size:9px;color:#888;"><div style="width:8px;height:8px;border-radius:3px;background:#cbd5e1;"></div> 📊 Reports (×1)</div>
        </div>
      </div>
      <div style="background:#fff;border:1px solid #ece6f3;border-radius:12px;padding:20px 22px;">
        <div style="font-size:12px;font-weight:700;color:#1a0e2e;margin-bottom:3px;display:flex;align-items:center;gap:6px;">🎯 Action Recommendations</div>
        <div style="font-size:10px;color:#888;margin-bottom:14px;">Priority actions for this month based on current data</div>
        <div style="display:flex;flex-direction:column;gap:7px;">${recsHTML}</div>
      </div>
    </div>
    <div style="${footerStyle}"><span>HCD Performance Analytics Report — ${reportMonth}</span><span>Page 4 of 4</span></div>
  </div>`;

  return [page1, page2, page3, page4];
}

// ============================
// MAIN EXPORT FUNCTION
// ============================
export async function exportChartsReport(allData) {
  // Show loading toast
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;background:#1a0e2e;color:#F3C036;padding:14px 28px;border-radius:12px;font-family:Inter,sans-serif;font-size:14px;font-weight:600;box-shadow:0 8px 32px rgba(0,0,0,0.4);border:1px solid rgba(243,192,54,0.3);display:flex;align-items:center;gap:10px;';
  toast.innerHTML = '<div style="width:18px;height:18px;border:3px solid rgba(243,192,54,0.3);border-top-color:#F3C036;border-radius:50%;animation:crspin 0.8s linear infinite;"></div> Generating HCD Analytics PDF...';
  const style = document.createElement('style');
  style.textContent = '@keyframes crspin { to { transform: rotate(360deg); } }';
  document.head.appendChild(style);
  document.body.appendChild(toast);

  try {
    // Load DM Sans font
    if (!document.querySelector('link[href*="DM+Sans"]')) {
      const link = document.createElement('link');
      link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
      await new Promise(r => setTimeout(r, 500));
    }

    // Load html2canvas
    if (!window.html2canvas) {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      document.head.appendChild(s);
      await new Promise(r => s.onload = r);
    }

    // Load jsPDF
    if (!window.jspdf) {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      document.head.appendChild(s);
      await new Promise(r => s.onload = r);
    }

    // Build pages HTML
    const pages = buildPages(allData);

    // Create hidden container
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;';
    document.body.appendChild(container);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = 210;

    for (let i = 0; i < pages.length; i++) {
      // Create page div
      const pageDiv = document.createElement('div');
      pageDiv.innerHTML = pages[i];
      const pageEl = pageDiv.firstElementChild;
      container.appendChild(pageEl);

      // Wait for rendering
      await new Promise(r => setTimeout(r, 200));

      // Capture
      const canvas = await window.html2canvas(pageEl, {
        scale: 2, useCORS: true, backgroundColor: null,
        width: pageEl.offsetWidth, height: pageEl.offsetHeight,
      });

      const imgData = canvas.toDataURL('image/png');
      const imgHeight = (canvas.height * pageWidth) / canvas.width;

      if (i > 0) doc.addPage();
      doc.addImage(imgData, 'PNG', 0, 0, pageWidth, Math.min(imgHeight, 297));

      container.removeChild(pageEl);
    }

    // Clean up
    document.body.removeChild(container);

    // Auto-download
    const monthName = fullMonths[new Date().getMonth()];
    doc.save(`HCD_Analytics_${monthName}_2026.pdf`);

  } catch (err) {
    console.error('HCD Analytics PDF export error:', err);
    alert('Error generating PDF. Please try again.');
  }

  // Remove toast
  document.body.removeChild(toast);
  document.head.removeChild(style);
}
