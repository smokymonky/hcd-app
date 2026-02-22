// chartsReportExport.js — HCD Performance Analytics Report
// 4-page A4 PDF: Cover → YTD Progress → Function Scorecard → Key Insights
// Uses html2canvas + jsPDF (exact HTML from full_report_preview.html)
// Always uses current month + allData (unfiltered)

const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fullMonths = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const funcNames = ['OP','D&C','T&A','OD','Com&Bn','SBM'];
const funcFullNames = { OP:'Operations', 'D&C':'Development & Career', 'T&A':'Talent Acquisition', OD:'Organization Design', 'Com&Bn':'Compensation & Benefits', SBM:'Strategy & Business Mgmt' };
const ownerBadgeMap = { OP:'green', 'D&C':'blue', 'T&A':'amber', OD:'purple', 'Com&Bn':'red', SBM:'cyan', ALL:'purple' };

function getOwnerBadgeClass(owner) {
  const f = owner.split('/')[0].trim();
  return ownerBadgeMap[f] || 'purple';
}

function computeData(allData) {
  const now = new Date();
  const cmi = now.getMonth();
  const cms = months[cmi], cmf = fullMonths[cmi], nms = months[(cmi+1)%12];
  const totalAct = allData.length;
  const compAct = allData.filter(i => i.status==='Completed'||i.status==='Completed Early').length;
  const overallRate = totalAct > 0 ? (compAct/totalAct)*100 : 0;

  const catKeys = ['Activities/Programs/Projects','Maintenance Projects','Reports'];
  const catStats = catKeys.map(key => {
    const items = allData.filter(i => i.category===key);
    const t=items.length, c=items.filter(i=>i.status==='Completed'||i.status==='Completed Early').length;
    const del=items.filter(i=>i.status==='Delayed').length;
    return { key, total:t, completed:c, delayed:del, rate: t>0?(c/t)*100:0 };
  });

  const monthData = months.map((m,mi) => {
    let due=0,done=0,delayed=0;
    allData.forEach(item => {
      if(!(item.dueDates||[]).includes(m)) return;
      due++;
      const ms=item.monthStatus||{};
      const st=ms[m]||ms[fullMonths[mi]]||'';
      if(st==='Completed'||st==='Completed Early') done++;
      else if(st==='Delayed') delayed++;
    });
    return {m,due,done,delayed,past:mi<cmi,current:mi===cmi,future:mi>cmi};
  });

  const dueThroughCurrent = monthData.slice(0,cmi+1).reduce((s,d)=>s+d.due,0);
  const totalDone = monthData.reduce((s,d)=>s+d.done,0);
  const totalDue = monthData.reduce((s,d)=>s+d.due,0);
  const actualPct = totalDue>0?(totalDone/totalDue)*100:0;
  const expectedPct = totalDue>0?(dueThroughCurrent/totalDue)*100:0;
  const gap = expectedPct - actualPct;

  // Risk Radar
  const highRisk=[],medRisk=[],watchRisk=[];
  allData.forEach(item => {
    const dd=item.dueDates||[], ms=item.monthStatus||{};
    dd.forEach(m => {
      const mi=months.indexOf(m);
      if(mi>=0 && mi<cmi) {
        const st=ms[m]||ms[fullMonths[mi]]||'';
        if(st!=='Completed'&&st!=='Completed Early'&&!highRisk.find(r=>r.id===item.id&&r.dm===m))
          highRisk.push({id:item.id,name:item.activity,owner:item.owner,dm:m});
      }
    });
    if(dd.includes(cms)){const st=ms[cms]||ms[cmf]||'';if(!st||st==='Scheduled')if(!medRisk.find(r=>r.id===item.id))medRisk.push({id:item.id,name:item.activity,owner:item.owner,dm:cms});}
    if(dd.includes(nms)){const st=ms[nms]||ms[fullMonths[(cmi+1)%12]]||'';if(!st||st==='Scheduled')if(!watchRisk.find(r=>r.id===item.id))watchRisk.push({id:item.id,name:item.activity,owner:item.owner,dm:nms});}
  });

  // Scorecard — count activities per category (not per-function to avoid double-count)
  const scorecard = catKeys.map((key,ki) => {
    const ci = allData.filter(i=>i.category===key);
    const totalInCat = ci.length;
    const fs = funcNames.map(fn=>{
      const fi=ci.filter(i=>i.owner.split('/').map(o=>o.trim()).includes(fn));
      const t=fi.length,c=fi.filter(i=>i.status==='Completed'||i.status==='Completed Early').length;
      const del=fi.filter(i=>i.status==='Delayed').length;
      return {fn,total:t,completed:c,delayed:del,rate:t>0?(c/t)*100:0};
    }).filter(f=>f.total>0).sort((a,b)=>b.rate-a.rate||b.completed-a.completed||a.total-b.total);
    return {key,totalInCat,fs};
  });

  // Workload (weighted)
  const wts={'Activities/Programs/Projects':3,'Maintenance Projects':2,'Reports':1};
  const workload=funcNames.map(fn=>{
    let p=0,m=0,r=0;
    allData.forEach(item=>{if(!item.owner.split('/').map(o=>o.trim()).includes(fn))return;
      if(item.category==='Activities/Programs/Projects')p++;else if(item.category==='Maintenance Projects')m++;else if(item.category==='Reports')r++;});
    return {fn,p,m,r,pw:p*3,mw:m*2,rw:r*1,w:p*3+m*2+r*1};
  }).sort((a,b)=>b.w-a.w);
  const totalW=workload.reduce((s,d)=>s+d.w,0);

  // Function-level insights
  const funcOv=funcNames.map(fn=>{
    const fi=allData.filter(i=>i.owner.split('/').map(o=>o.trim()).includes(fn));
    const t=fi.length,c=fi.filter(i=>i.status==='Completed'||i.status==='Completed Early').length;
    let md=0,mdu=0;
    fi.forEach(item=>{(item.dueDates||[]).forEach(m=>{const mi=months.indexOf(m);if(mi<0)return;mdu++;const ms=item.monthStatus||{};const st=ms[m]||ms[fullMonths[mi]]||'';if(st==='Completed'||st==='Completed Early')md++;});});
    return {fn,total:t,completed:c,rate:t>0?(c/t)*100:0,md,mdu};
  });

  // Top performer: highest rate, then most completed; if all 0%, pick highest total (most responsibilities = best positioned)
  const top=[...funcOv].sort((a,b)=>b.rate-a.rate||b.completed-a.completed||b.total-a.total)[0];
  // Worst: lowest rate, least completed; if all 0%, pick one with most due dates not done (most behind)
  const worst=[...funcOv].sort((a,b)=>{
    if(a.rate!==b.rate) return a.rate-b.rate;
    if(a.completed!==b.completed) return a.completed-b.completed;
    // Tie at 0%: most overdue due dates = most at risk
    const aOverdue=allData.filter(i=>i.owner.split('/').map(o=>o.trim()).includes(a.fn)).reduce((s,item)=>{
      let ov=0;(item.dueDates||[]).forEach(m=>{const mi=months.indexOf(m);if(mi>=0&&mi<cmi){const ms=item.monthStatus||{};const st=ms[m]||ms[fullMonths[mi]]||'';if(st!=='Completed'&&st!=='Completed Early')ov++;}});return s+ov;
    },0);
    const bOverdue=allData.filter(i=>i.owner.split('/').map(o=>o.trim()).includes(b.fn)).reduce((s,item)=>{
      let ov=0;(item.dueDates||[]).forEach(m=>{const mi=months.indexOf(m);if(mi>=0&&mi<cmi){const ms=item.monthStatus||{};const st=ms[m]||ms[fullMonths[mi]]||'';if(st!=='Completed'&&st!=='Completed Early')ov++;}});return s+ov;
    },0);
    return bOverdue-aOverdue;
  })[0];

  // Ensure top and worst are different
  let actualWorst = worst;
  if(top.fn === worst.fn) {
    const others = funcOv.filter(f=>f.fn!==top.fn);
    actualWorst = others.sort((a,b)=>{if(a.rate!==b.rate)return a.rate-b.rate;return a.completed-b.completed;})[0] || worst;
  }

  const futureW=months.map((m,mi)=>{if(mi<=cmi)return{m,w:0};let w=0;allData.forEach(item=>{if(!(item.dueDates||[]).includes(m))return;w+=wts[item.category]||1;});return{m,w};}).filter(d=>d.w>0).sort((a,b)=>b.w-a.w);
  const busiest=futureW[0]||{m:'Dec',w:0};

  // Busiest month detail
  const bmi = months.indexOf(busiest.m);
  let bPrograms=0,bMaint=0,bReports=0;
  allData.forEach(item=>{if(!(item.dueDates||[]).includes(busiest.m))return;
    if(item.category==='Activities/Programs/Projects')bPrograms++;else if(item.category==='Maintenance Projects')bMaint++;else bReports++;});

  const dueThroughNext=monthData.slice(0,cmi+2).reduce((s,d)=>s+d.due,0);
  const needed=Math.max(0,Math.ceil(dueThroughNext*(expectedPct/100))-totalDone);

  return {cmi,cms,cmf,nms,totalAct,compAct,overallRate,catStats,monthData,
    dueThroughCurrent,totalDone,totalDue,actualPct,expectedPct,gap,
    highRisk,medRisk,watchRisk,scorecard,workload,totalW,
    funcOv,top,worst:actualWorst,busiest,bPrograms,bMaint,bReports,needed};
}

function genRecs(d) {
  const recs=[];
  if(d.highRisk.length>0) recs.push(`<strong>Close overdue items immediately.</strong> Month-level due dates from past months remain incomplete. Schedule a review meeting with responsible function heads to confirm status and update records.`);
  const cd=d.monthData[d.cmi];
  if(cd&&cd.due>0&&cd.done<cd.due) recs.push(`<strong>Prioritize ${d.cmf} due dates.</strong> ${cd.due} month-level due dates are in ${d.cmf} with ${cd.done} completion${cd.done!==1?'s':''} recorded. Focus on quick wins that can be completed before month end.`);
  if(d.worst&&d.worst.completed===0&&d.top.fn!==d.worst.fn) recs.push(`<strong>Activate ${d.worst.fn} function.</strong> ${funcFullNames[d.worst.fn]} has 0% progress with no activities completed. Identify blockers and assign accountability for upcoming deliverables.`);
  if(d.busiest.w>0){const bf=fullMonths[months.indexOf(d.busiest.m)]||d.busiest.m;recs.push(`<strong>Plan ahead for ${bf} peak.</strong> ${bf} has the highest weighted workload (${d.busiest.w} pts). Begin preparation by ${fullMonths[Math.max(0,months.indexOf(d.busiest.m)-2)]} to distribute effort evenly and avoid a bottleneck.`);}
  if(recs.length<2) recs.push(`<strong>Maintain momentum.</strong> Continue tracking month-level completions and ensure all teams are updating their progress regularly in the system.`);
  return recs.slice(0,4);
}

// ════════════════════════════════════════
// CSS — copied exactly from full_report_preview.html
// ════════════════════════════════════════
function getCSS() {
  return `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  .pdf-page { width: 694px; min-height: 980px; background: #fafafa; overflow: hidden; position: relative; font-family: 'DM Sans', sans-serif; }
  .page-footer { padding: 16px 40px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #ece6f3; font-size: 10px; color: #aaa; position: absolute; bottom: 0; left: 0; right: 0; }
  .cover { height: 980px; display: flex; flex-direction: column; background: linear-gradient(160deg, #1a0e2e 0%, #2d1845 40%, #3d2460 70%, #4a3070 100%); position: relative; overflow: hidden; }
  .cover::before { content: ''; position: absolute; top: -120px; right: -120px; width: 500px; height: 500px; background: radial-gradient(circle, rgba(243,192,54,0.12) 0%, transparent 70%); border-radius: 50%; }
  .cover::after { content: ''; position: absolute; bottom: -100px; left: -100px; width: 400px; height: 400px; background: radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%); border-radius: 50%; }
  .cover-top { padding: 44px 50px 30px; display: flex; justify-content: space-between; align-items: flex-start; position: relative; z-index: 1; }
  .cover-logo { color: #fff; font-size: 16px; font-weight: 700; }
  .cover-logo span { display: block; color: #A888BE; font-size: 12px; font-weight: 500; margin-top: 4px; }
  .cover-badge { background: rgba(243,192,54,0.12); border: 1px solid rgba(243,192,54,0.25); color: #F3C036; padding: 5px 16px; border-radius: 20px; font-size: 9px; font-weight: 600; letter-spacing: 1.5px; }
  .cover-main { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 0 50px; position: relative; z-index: 1; }
  .cover-eyebrow { color: #F3C036; font-size: 12px; font-weight: 600; letter-spacing: 4px; text-transform: uppercase; margin-bottom: 18px; }
  .cover-title { color: #fff; font-size: 44px; font-weight: 700; line-height: 1.1; margin-bottom: 16px; }
  .cover-title em { font-style: normal; color: #F3C036; }
  .cover-date { color: #A888BE; font-size: 18px; font-weight: 500; }
  .cover-footer { padding: 24px 50px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.06); position: relative; z-index: 1; }
  .cover-footer-text { color: #A888BE; font-size: 10px; }
  .cover-footer-date { color: #fff; font-size: 11px; font-weight: 600; }
  .section { padding: 24px 32px; }
  .section + .section { padding-top: 0; }
  .label { font-size: 10px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
  .section-sub { font-size: 12px; color: #999; margin-bottom: 18px; line-height: 1.4; }
  .top-row { display: flex; align-items: center; gap: 24px; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid #f0ecf5; }
  .ring-svg { width: 90px; height: 90px; flex-shrink: 0; }
  .ring-bg { fill: none; stroke: #f0ecf5; stroke-width: 5; }
  .ring-fill { fill: none; stroke-width: 5; stroke-linecap: round; }
  .big-val { font-size: 38px; font-weight: 700; color: #22c55e; line-height: 1; }
  .sub-text { font-size: 12px; color: #888; margin-top: 4px; line-height: 1.4; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; border-radius: 10px; overflow: hidden; border: 1px solid #ece6f3; }
  th { background: #1a0e2e; color: #fff; font-size: 10px; font-weight: 600; padding: 10px 12px; text-align: left; }
  td { padding: 9px 12px; font-size: 11px; color: #333; border-bottom: 1px solid #f5f2f8; }
  tr:last-child td { border-bottom: none; }
  tr:nth-child(even) td { background: #faf8fc; }
  .cat-icon { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 6px; font-size: 13px; margin-right: 8px; vertical-align: middle; background: #e2e8f0; }
  .cat-name { font-weight: 600; color: #1a0e2e; vertical-align: middle; }
  .badge { display: inline-flex; align-items: center; justify-content: center; min-width: 26px; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .badge.green { background: #dcfce7; color: #16a34a; }
  .badge.red { background: #fee2e2; color: #dc2626; }
  .rate { font-weight: 700; font-size: 12px; }
  .rate.green { color: #22c55e; }
  .rate.gray { color: #ccc; }
  .func-dot { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: middle; }
  .rank { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; font-size: 10px; font-weight: 700; }
  .rank.gold { background: #FEF9C3; color: #A16207; }
  .rank.silver { background: #F1F5F9; color: #475569; }
  .rank.bronze { background: #FED7AA; color: #9A3412; }
  .rank.default { background: #F3E8FF; color: #7C3AED; }
  .month-timeline { display: flex; gap: 0; margin-bottom: 24px; }
  .month-cell { flex: 1; display: flex; flex-direction: column; align-items: center; padding: 12px 3px 10px; position: relative; border-radius: 8px; }
  .month-cell.current { background: #faf5ff; border: 2px solid #8B5CF6; border-radius: 10px; margin: -2px; z-index: 2; box-shadow: 0 4px 16px rgba(139,92,246,0.15); }
  .month-cell.past { background: #fafafa; }
  .month-now-badge { position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background: #8B5CF6; color: #fff; font-size: 7px; font-weight: 700; letter-spacing: 1px; padding: 2px 8px; border-radius: 10px; text-transform: uppercase; }
  .month-name { font-size: 10px; font-weight: 600; color: #888; margin-bottom: 4px; }
  .month-cell.current .month-name { color: #8B5CF6; }
  .month-cell.past .month-name { color: #555; }
  .month-count { font-size: 18px; font-weight: 700; color: #1a0e2e; line-height: 1; margin-bottom: 4px; }
  .month-cell.future .month-count { color: #ccc; }
  .month-done { font-size: 8px; font-weight: 600; color: #22c55e; margin-bottom: 1px; min-height: 11px; }
  .month-delayed { font-size: 8px; font-weight: 600; color: #ef4444; margin-bottom: 4px; min-height: 11px; }
  .month-done.none, .month-delayed.none { color: #ddd; }
  .month-bar { width: 80%; height: 4px; background: #eee; border-radius: 3px; overflow: hidden; display: flex; }
  .month-bar-done { height: 100%; background: #22c55e; }
  .month-bar-delayed { height: 100%; background: #ef4444; }
  .month-bar-remaining { height: 100%; background: #eee; flex: 1; }
  .bar-track { height: 26px; background: #f0ecf5; border-radius: 10px; position: relative; overflow: visible; }
  .bar-fill { height: 100%; border-radius: 10px; display: flex; align-items: center; padding-left: 10px; font-size: 10px; font-weight: 700; color: #fff; position: relative; z-index: 1; min-width: 44px; }
  .bar-expected-marker { position: absolute; top: -26px; bottom: -6px; width: 3px; background: #1a0e2e; border-radius: 2px; z-index: 2; }
  .bar-expected-flag { position: absolute; top: 0; left: 50%; transform: translateX(-50%); background: #1a0e2e; color: #fff; font-size: 8px; font-weight: 600; padding: 3px 8px; border-radius: 4px; white-space: nowrap; }
  .bar-legend { display: flex; gap: 16px; margin-top: 8px; font-size: 10px; color: #888; }
  .bar-legend-item { display: flex; align-items: center; gap: 5px; }
  .bar-legend-item .dot { width: 8px; height: 8px; border-radius: 3px; }
  .callout { display: flex; align-items: flex-start; gap: 10px; padding: 12px 16px; border-radius: 10px; border: 1px solid; margin-top: 8px; }
  .callout.warning { background: #fff7ed; border-color: #fed7aa; }
  .callout.info { background: #f0f4ff; border-color: #bfdbfe; }
  .callout-icon { font-size: 16px; flex-shrink: 0; }
  .callout-text { font-size: 11px; line-height: 1.5; }
  .callout.warning .callout-text { color: #9a3412; }
  .callout.warning .callout-text strong { color: #ea580c; }
  .callout.info .callout-text { color: #1e40af; }
  .callout.info .callout-text strong { color: #2563eb; }
  .risk-group { margin-bottom: 14px; }
  .risk-group:last-child { margin-bottom: 0; }
  .risk-group-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; padding: 7px 12px; border-radius: 8px; }
  .risk-group-header.high { background: #fef2f2; border-left: 4px solid #ef4444; }
  .risk-group-header.medium { background: #fffbeb; border-left: 4px solid #f59e0b; }
  .risk-group-header.watch { background: #fff7ed; border-left: 4px solid #f97316; }
  .risk-group-icon { font-size: 13px; }
  .risk-group-title { font-size: 11px; font-weight: 700; flex: 1; }
  .risk-group-header.high .risk-group-title { color: #991b1b; }
  .risk-group-header.medium .risk-group-title { color: #92400e; }
  .risk-group-header.watch .risk-group-title { color: #9a3412; }
  .risk-group-count { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 10px; }
  .risk-group-header.high .risk-group-count { background: #fee2e2; color: #dc2626; }
  .risk-group-header.medium .risk-group-count { background: #fef3c7; color: #d97706; }
  .risk-group-header.watch .risk-group-count { background: #ffedd5; color: #ea580c; }
  .risk-items { display: flex; flex-direction: column; gap: 4px; margin-left: 16px; }
  .risk-item { display: flex; align-items: center; gap: 8px; padding: 7px 12px; background: #faf8fc; border: 1px solid #ece6f3; border-radius: 8px; font-size: 10px; }
  .risk-item-name { flex: 1; font-weight: 600; color: #1a0e2e; }
  .owner-badge { display: inline-block; padding: 2px 7px; border-radius: 6px; font-size: 9px; font-weight: 600; }
  .owner-badge.green { background: #dcfce7; color: #16a34a; }
  .owner-badge.blue { background: #dbeafe; color: #2563eb; }
  .owner-badge.amber { background: #fef3c7; color: #92400e; }
  .owner-badge.purple { background: #f3e8ff; color: #7c3aed; }
  .owner-badge.red { background: #fee2e2; color: #dc2626; }
  .owner-badge.cyan { background: #cffafe; color: #0e7490; }
  .risk-item-due { font-size: 9px; color: #888; min-width: 50px; text-align: right; }
  .cat-section { margin-bottom: 20px; }
  .cat-section:last-child { margin-bottom: 0; }
  .cat-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; padding: 7px 12px; border-radius: 8px; border-left: 4px solid; }
  .cat-header.purple-h { background: #f1f5f9; border-left-color: #1e293b; }
  .cat-header.blue-h { background: #f1f5f9; border-left-color: #64748b; }
  .cat-header.gold-h { background: #f1f5f9; border-left-color: #cbd5e1; }
  .cat-header-icon { font-size: 15px; }
  .cat-header-title { font-size: 12px; font-weight: 700; color: #1a0e2e; flex: 1; }
  .cat-header-count { font-size: 10px; font-weight: 600; padding: 2px 10px; border-radius: 10px; }
  .cat-header.purple-h .cat-header-count { background: #e2e8f0; color: #1e293b; }
  .cat-header.blue-h .cat-header-count { background: #e2e8f0; color: #64748b; }
  .cat-header.gold-h .cat-header-count { background: #e2e8f0; color: #64748b; }
  .insights-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 18px; }
  .insight-card { border: 1px solid #ece6f3; border-radius: 12px; padding: 16px; position: relative; overflow: hidden; }
  .insight-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; }
  .insight-card.green-c::before { background: linear-gradient(90deg, #22c55e, #4ade80); }
  .insight-card.red-c::before { background: linear-gradient(90deg, #ef4444, #f87171); }
  .insight-card.gold-c::before { background: linear-gradient(90deg, #F3C036, #fbbf24); }
  .insight-card.purple-c::before { background: linear-gradient(90deg, #8B5CF6, #a78bfa); }
  .insight-card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .insight-card-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
  .insight-card.green-c .insight-card-icon { background: #dcfce7; }
  .insight-card.red-c .insight-card-icon { background: #fee2e2; }
  .insight-card.gold-c .insight-card-icon { background: #fef9c3; }
  .insight-card.purple-c .insight-card-icon { background: #f3e8ff; }
  .insight-card-title { font-size: 9px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.3px; }
  .func-badge-lg { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 7px; font-size: 11px; font-weight: 700; margin-bottom: 6px; }
  .insight-card-value { font-size: 18px; font-weight: 700; line-height: 1.2; margin-bottom: 5px; }
  .insight-card-detail { font-size: 10px; color: #666; line-height: 1.5; }
  .insight-card-detail strong { color: #1a0e2e; }
  .workload-section { margin-bottom: 18px; }
  .workload-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 3px; }
  .workload-title { font-size: 12px; font-weight: 700; color: #1a0e2e; display: flex; align-items: center; gap: 6px; }
  .workload-sub { font-size: 10px; color: #999; margin-bottom: 12px; }
  .workload-weight-note { font-size: 8px; color: #bbb; background: #faf8fc; padding: 3px 8px; border-radius: 5px; border: 1px solid #ece6f3; }
  .workload-bars { display: flex; flex-direction: column; gap: 8px; }
  .workload-row { display: flex; align-items: center; gap: 10px; }
  .workload-label { width: 70px; font-size: 10px; font-weight: 600; color: #1a0e2e; display: flex; align-items: center; gap: 5px; flex-shrink: 0; }
  .workload-bar { flex: 1; height: 20px; background: #f0ecf5; border-radius: 6px; overflow: hidden; display: flex; }
  .workload-seg { height: 100%; display: flex; align-items: center; justify-content: center; font-size: 8px; font-weight: 700; color: #fff; }
  .workload-seg.programs { background: #1e293b; }
  .workload-seg.maintenance { background: #64748b; }
  .workload-seg.reports { background: #cbd5e1; color: #475569; }
  .workload-score { min-width: 50px; text-align: right; font-size: 11px; font-weight: 700; color: #1a0e2e; }
  .workload-score span { font-size: 9px; font-weight: 500; color: #999; }
  .workload-legend { display: flex; gap: 14px; margin-top: 10px; padding-top: 8px; border-top: 1px solid #f0ecf5; }
  .workload-legend-item { display: flex; align-items: center; gap: 5px; font-size: 9px; color: #888; }
  .workload-legend-item .swatch { width: 8px; height: 8px; border-radius: 3px; }
  .reco-section { background: #fff; border: 1px solid #ece6f3; border-radius: 12px; padding: 20px 22px; }
  .reco-title { font-size: 12px; font-weight: 700; color: #1a0e2e; margin-bottom: 3px; display: flex; align-items: center; gap: 6px; }
  .reco-sub { font-size: 10px; color: #888; margin-bottom: 14px; }
  .reco-list { display: flex; flex-direction: column; gap: 7px; }
  .reco-item { display: flex; align-items: flex-start; gap: 9px; padding: 10px 12px; background: #faf8fc; border: 1px solid #ece6f3; border-radius: 9px; }
  .reco-num { width: 20px; height: 20px; border-radius: 50%; background: #1a0e2e; color: #F3C036; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
  .reco-text { font-size: 11px; color: #333; line-height: 1.5; }
  .reco-text strong { color: #1a0e2e; }
  `;
}

// ════════════════════════════════════════
// HTML BUILDERS — exact structure from preview
// ════════════════════════════════════════
function buildPage1(d, reportMonth, reportDate) {
  return `<div class="pdf-page"><div class="cover">
    <div class="cover-top"><div class="cover-logo">AbdulLatif Jameel Finance<span>Human Capital Department</span></div><div class="cover-badge">CONFIDENTIAL</div></div>
    <div class="cover-main"><div class="cover-eyebrow">Annual Plan 2026</div><div class="cover-title">HCD Performance<br><em>Analytics Report</em></div><div class="cover-date">${reportMonth}</div></div>
    <div class="cover-footer"><div class="cover-footer-text">Generated from HCD Application \u2022 For internal use only</div><div class="cover-footer-date">${reportDate}</div></div>
  </div></div>`;
}

function buildPage2(d, reportMonth) {
  const ringCirc = 2 * Math.PI * 14;
  const ringOff = ringCirc - (d.overallRate / 100) * ringCirc;
  const fmtRate = (r) => r > 0 ? `<span class="rate green">${r.toFixed(r<10?1:0)}%</span>` : `<span class="rate gray">0%</span>`;

  const catLabels = ['Activities/Programs','Maintenance Projects','Reports'];
  const catIcons = ['\uD83D\uDCCB','\uD83D\uDD27','\uD83D\uDCCA'];

  const catRows = d.catStats.map((c,i) => `<tr><td><span class="cat-icon">${catIcons[i]}</span><span class="cat-name">${catLabels[i]}</span></td><td><strong>${c.total}</strong></td><td><span class="badge green">${c.completed}</span></td><td><span class="badge red">${c.delayed}</span></td><td>${fmtRate(c.rate)}</td></tr>`).join('');

  const monthCells = d.monthData.map(md => {
    const cls = md.current ? 'current' : md.past ? 'past' : 'future';
    const nowBadge = md.current ? '<div class="month-now-badge">NOW</div>' : '';
    const doneText = md.future ? '\u2014' : md.done > 0 ? `${md.done} done` : '0 done';
    const delText = md.future ? '\u2014' : md.delayed > 0 ? `${md.delayed} delayed` : '0 delayed';
    const doneCls = (md.future || md.done === 0) ? ' none' : '';
    const delCls = (md.future || md.delayed === 0) ? ' none' : '';
    const barDone = md.due > 0 && !md.future && md.done > 0 ? `<div class="month-bar-done" style="width:${(md.done/md.due)*100}%"></div>` : '';
    const barDel = md.due > 0 && !md.future && md.delayed > 0 ? `<div class="month-bar-delayed" style="width:${(md.delayed/md.due)*100}%"></div>` : '';
    return `<div class="month-cell ${cls}">${nowBadge}<div class="month-name">${md.m}</div><div class="month-count">${md.due}</div><div class="month-done${doneCls}">${doneText}</div><div class="month-delayed${delCls}">${delText}</div><div class="month-bar">${barDone}${barDel}<div class="month-bar-remaining"></div></div></div>`;
  }).join('');

  const warningCallout = d.gap > 0
    ? `<div class="callout warning"><div class="callout-icon">\u26A0\uFE0F</div><div class="callout-text"><strong>${d.gap.toFixed(1)}% below expected pace.</strong> Only <strong>${d.totalDone}</strong> month-level completion${d.totalDone!==1?'s':''} recorded out of <strong>${d.dueThroughCurrent}</strong> due dates through ${d.cmf}. At current rate, year-end projection is approximately <strong>~${d.totalDue > 0 ? Math.round((d.totalDone / Math.max(d.dueThroughCurrent, 1)) * 100) : 0}% completion</strong>.</div></div>`
    : `<div class="callout" style="background:#f0fdf4;border-color:#bbf7d0;"><div class="callout-icon">\u2705</div><div class="callout-text" style="color:#166534;"><strong style="color:#16a34a;">On track!</strong> Actual completion rate is meeting or exceeding the expected pace.</div></div>`;

  const infoCallout = (d.needed > 0 && d.gap > 0)
    ? `<div class="callout info"><div class="callout-icon">\uD83D\uDCA1</div><div class="callout-text">To get back on track by end of ${fullMonths[(d.cmi+1)%12]}, <strong>approximately ${d.needed} more month-level completion${d.needed!==1?'s':''}</strong> need to be recorded \u2014 bringing total to ${d.totalDone + d.needed} of ${d.monthData.slice(0,d.cmi+2).reduce((s,dd)=>s+dd.due,0)} due dates through ${fullMonths[(d.cmi+1)%12]}.</div></div>` : '';

  const riskGroup = (items, cls, icon, title, max) => {
    if (!items.length) return '';
    const shown = items.slice(0, max).map(r => `<div class="risk-item"><div class="risk-item-name">${r.name}</div><span class="owner-badge ${getOwnerBadgeClass(r.owner)}">${r.owner}</span><div class="risk-item-due">Due: ${r.dm}</div></div>`).join('');
    const overflow = items.length > max ? `<div style="font-size:10px;font-weight:600;color:${cls==='high'?'#991b1b':cls==='medium'?'#92400e':'#9a3412'};margin-left:16px;margin-top:4px;">+ ${items.length - max} more</div>` : '';
    return `<div class="risk-group"><div class="risk-group-header ${cls}"><div class="risk-group-icon">${icon}</div><div class="risk-group-title">${title}</div><div class="risk-group-count">${items.length}</div></div><div class="risk-items">${shown}</div>${overflow}</div>`;
  };

  const riskContent = (!d.highRisk.length && !d.medRisk.length && !d.watchRisk.length)
    ? `<div style="text-align:center;padding:24px;background:#f0fdf4;border-radius:12px;border:1px solid #bbf7d0;"><div style="font-size:24px;margin-bottom:8px;">\u2705</div><div style="font-size:13px;font-weight:600;color:#166534;">All Clear \u2014 No Risks Detected</div></div>`
    : riskGroup(d.highRisk,'high','\uD83D\uDD34','High Risk \u2014 Overdue',5)
      + riskGroup(d.medRisk,'medium','\uD83D\uDFE1','Medium \u2014 Due This Month, Not Started',5)
      + riskGroup(d.watchRisk,'watch','\uD83D\uDFE0','Watch \u2014 Due Next Month, Not Started',5);

  return `<div class="pdf-page">
    <div class="section"><div class="label">Overall Completion Rate</div>
      <div class="top-row">
        <svg class="ring-svg" viewBox="0 0 36 36"><circle class="ring-bg" cx="18" cy="18" r="14"/><circle class="ring-fill" cx="18" cy="18" r="14" stroke="#22c55e" stroke-dasharray="${ringCirc.toFixed(1)}" stroke-dashoffset="${ringOff.toFixed(1)}" transform="rotate(-90 18 18)"/><text x="18" y="19" text-anchor="middle" font-size="7" font-weight="700" fill="#1a0e2e">${d.overallRate.toFixed(1)}%</text><text x="18" y="24" text-anchor="middle" font-size="3.5" fill="#888">Complete</text></svg>
        <div><div class="big-val">${d.overallRate.toFixed(1)}%</div><div class="sub-text">${d.compAct} of ${d.totalAct} activities completed across all functions YTD</div></div>
      </div>
      <table><thead><tr><th>Category</th><th>Total</th><th>Completed</th><th>Delayed</th><th>Rate</th></tr></thead><tbody>${catRows}</tbody></table>
    </div>
    <div class="section"><div class="label">Expected vs Actual (${d.cmf} 2026)</div>
      <div class="section-sub">Due date entries per month and how many were completed at month level \u2014 Activity Due Through <strong>${d.cms}</strong>: <strong>${d.dueThroughCurrent}</strong></div>
      <div class="month-timeline">${monthCells}</div>
      <div style="margin-top:32px"><div class="bar-track"><div class="bar-fill" style="width:${Math.max(d.actualPct,3)}%;background:linear-gradient(90deg,#22c55e,#4ade80)">${d.actualPct.toFixed(1)}%</div><div class="bar-expected-marker" style="left:${d.expectedPct}%"><div class="bar-expected-flag">${d.expectedPct.toFixed(1)}%</div></div></div>
      <div class="bar-legend"><div class="bar-legend-item"><div class="dot" style="background:linear-gradient(90deg,#22c55e,#4ade80)"></div> Actual: ${d.actualPct.toFixed(1)}%</div><div class="bar-legend-item"><div class="dot" style="background:#1a0e2e"></div> Expected pace</div><div class="bar-legend-item"><div class="dot" style="background:#f0ecf5"></div> Remaining</div></div></div>
      ${warningCallout}${infoCallout}
    </div>
    <div class="section"><div class="label">\uD83D\uDEA8 Risk Radar</div><div class="section-sub">Activities requiring attention</div>${riskContent}</div>
    <div class="page-footer"><span>HCD Performance Analytics Report \u2014 ${reportMonth}</span><span>Page 2 of 4</span></div>
  </div>`;
}

function buildPage3(d, reportMonth) {
  const catMeta = [
    { icon:'\uD83D\uDCCB', label:'Activities / Programs / Projects', cls:'purple-h' },
    { icon:'\uD83D\uDD27', label:'Maintenance Projects', cls:'blue-h' },
    { icon:'\uD83D\uDCCA', label:'Reports', cls:'gold-h' },
  ];
  const rankCls = (i) => i===0?'gold':i===1?'silver':i===2?'bronze':'default';
  const fmtRate = (r) => r > 0 ? `<span class="rate green">${r.toFixed(r<10?1:0)}%</span>` : `<span class="rate gray">0%</span>`;

  const sections = d.scorecard.map((cat,ci) => {
    const rows = cat.fs.map((f,i) => `<tr><td><span class="rank ${rankCls(i)}">${i+1}</span></td><td><strong>${f.fn}</strong></td><td><strong>${f.total}</strong></td><td><span class="badge green">${f.completed}</span></td><td><span class="badge red">${f.delayed}</span></td><td>${fmtRate(f.rate)}</td></tr>`).join('');
    return `<div class="cat-section"><div class="cat-header ${catMeta[ci].cls}"><div class="cat-header-icon">${catMeta[ci].icon}</div><div class="cat-header-title">${catMeta[ci].label}</div><div class="cat-header-count">${cat.totalInCat} activities</div></div>
    <table><thead><tr><th style="width:35px">Rank</th><th>Function</th><th style="width:55px">Total</th><th style="width:75px">Completed</th><th style="width:65px">Delayed</th><th style="width:60px">Rate</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }).join('');

  return `<div class="pdf-page"><div class="section"><div class="label">\uD83C\uDFC6 Function Scorecard</div><div class="section-sub">Functions ranked by completion rate \u2014 separated by category</div>${sections}</div>
    <div class="page-footer"><span>HCD Performance Analytics Report \u2014 ${reportMonth}</span><span>Page 3 of 4</span></div></div>`;
}

function buildPage4(d, reportMonth) {
  const topPct = d.top.rate.toFixed(1);
  const worstPct = d.worst.rate.toFixed(0);
  const bFull = fullMonths[months.indexOf(d.busiest.m)] || d.busiest.m;
  const twPct = d.totalW > 0 ? ((d.workload[0]?.w / d.totalW) * 100).toFixed(1) : '0';

  const wRows = d.workload.map(w => {
    const pPct = w.w > 0 ? (w.pw/w.w)*100 : 0;
    const mPct = w.w > 0 ? (w.mw/w.w)*100 : 0;
    const rPct = w.w > 0 ? (w.rw/w.w)*100 : 0;
    return `<div class="workload-row"><div class="workload-label">${w.fn}</div><div class="workload-bar">${w.pw>0?`<div class="workload-seg programs" style="width:${pPct}%">${w.pw}</div>`:''}${w.mw>0?`<div class="workload-seg maintenance" style="width:${mPct}%">${w.mw}</div>`:''}${w.rw>0?`<div class="workload-seg reports" style="width:${rPct}%">${w.rw}</div>`:''}</div><div class="workload-score">${w.w} <span>pts</span></div></div>`;
  }).join('');

  const recs = genRecs(d);
  const recsHTML = recs.map((r,i) => `<div class="reco-item"><div class="reco-num">${i+1}</div><div class="reco-text">${r}</div></div>`).join('');

  const planMonth = months.indexOf(d.busiest.m) >= 2 ? fullMonths[months.indexOf(d.busiest.m) - 2] : 'soon';

  return `<div class="pdf-page"><div class="section"><div class="label">\uD83D\uDCA1 Key Insights & Recommendations</div>
    <div class="section-sub">Findings based on current data \u2014 highlights what's working, what's at risk, and recommended next steps</div>
    <div class="insights-grid">
      <div class="insight-card green-c"><div class="insight-card-header"><div class="insight-card-icon">\uD83C\uDFC6</div><div class="insight-card-title">Top Performer</div></div><div class="func-badge-lg" style="background:#dcfce7;color:#16a34a">${funcFullNames[d.top.fn]} (${d.top.fn})</div><div class="insight-card-value" style="color:#16a34a">${topPct}% completion</div><div class="insight-card-detail">${d.top.completed > 0 ? 'Only function with completed activities.' : 'Highest activity count.'} <strong>${d.top.completed} of ${d.top.total}</strong> activities. ${d.top.mdu > 0 ? `<strong>${d.top.md}</strong> of <strong>${d.top.mdu}</strong> month-level due dates completed.` : ''}</div></div>
      <div class="insight-card red-c"><div class="insight-card-header"><div class="insight-card-icon">\u26A0\uFE0F</div><div class="insight-card-title">Most At Risk</div></div><div class="func-badge-lg" style="background:#fee2e2;color:#dc2626">${funcFullNames[d.worst.fn]} (${d.worst.fn})</div><div class="insight-card-value" style="color:#dc2626">${worstPct}% completion</div><div class="insight-card-detail"><strong>${d.worst.completed} of ${d.worst.mdu}</strong> due dates completed. ${d.worst.completed===0?'No activities in progress.':''} ${d.highRisk.filter(r=>r.owner.includes(d.worst.fn)).length > 0 ? `<strong>${d.highRisk.filter(r=>r.owner.includes(d.worst.fn)).length}</strong> overdue items.` : ''}</div></div>
      <div class="insight-card gold-c"><div class="insight-card-header"><div class="insight-card-icon">\uD83D\uDCC5</div><div class="insight-card-title">Busiest Month Ahead</div></div><div class="insight-card-value" style="color:#a16207">${bFull} \u2014 ${d.busiest.w} weighted pts</div><div class="insight-card-detail">Highest weighted workload: <strong>${d.bPrograms}</strong> Programs (\u00D73), <strong>${d.bMaint}</strong> Maintenance (\u00D72), <strong>${d.bReports}</strong> Reports (\u00D71). Planning should begin by <strong>${planMonth}</strong>.</div></div>
      <div class="insight-card purple-c"><div class="insight-card-header"><div class="insight-card-icon">\u2696\uFE0F</div><div class="insight-card-title">Workload Distribution</div></div><div class="insight-card-value" style="color:#7c3aed">${d.workload[0]?.fn} carries ${twPct}%</div><div class="insight-card-detail">${d.workload[0]?.fn} has highest weighted workload: <strong>${d.workload[0]?.w} pts</strong> (${d.workload[0]?.p}\u00D73 + ${d.workload[0]?.m}\u00D72 + ${d.workload[0]?.r}\u00D71). <strong>${d.workload[d.workload.length-1]?.fn}</strong> has lightest at <strong>${d.workload[d.workload.length-1]?.w} pts</strong>.</div></div>
    </div>
    <div class="workload-section">
      <div class="workload-header"><div class="workload-title">\u2696\uFE0F Function Workload Balance</div><div class="workload-weight-note">Weights: \uD83D\uDCCB \u00D73 \u00B7 \uD83D\uDD27 \u00D72 \u00B7 \uD83D\uDCCA \u00D71</div></div>
      <div class="workload-sub">Weighted workload per function \u2014 showing category composition</div>
      <div class="workload-bars">${wRows}</div>
      <div class="workload-legend"><div class="workload-legend-item"><div class="swatch" style="background:#1e293b"></div> \uD83D\uDCCB Programs (\u00D73)</div><div class="workload-legend-item"><div class="swatch" style="background:#64748b"></div> \uD83D\uDD27 Maintenance (\u00D72)</div><div class="workload-legend-item"><div class="swatch" style="background:#cbd5e1"></div> \uD83D\uDCCA Reports (\u00D71)</div></div>
    </div>
    <div class="reco-section"><div class="reco-title">\uD83C\uDFAF Action Recommendations</div><div class="reco-sub">Priority actions for this month based on current data</div><div class="reco-list">${recsHTML}</div></div>
  </div>
  <div class="page-footer"><span>HCD Performance Analytics Report \u2014 ${reportMonth}</span><span>Page 4 of 4</span></div></div>`;
}

// ════════════════════════════════════════
// MAIN EXPORT FUNCTION
// ════════════════════════════════════════
export async function exportChartsReport(allData) {
  // Show loading toast
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;background:#1a0e2e;color:#F3C036;padding:14px 28px;border-radius:12px;font-family:Inter,sans-serif;font-size:14px;font-weight:600;box-shadow:0 8px 32px rgba(0,0,0,0.4);border:1px solid rgba(243,192,54,0.3);display:flex;align-items:center;gap:10px;';
  toast.innerHTML = '<div style="width:18px;height:18px;border:3px solid rgba(243,192,54,0.3);border-top-color:#F3C036;border-radius:50%;animation:crspin 0.8s linear infinite;"></div> Generating HCD Analytics...';
  const spinStyle = document.createElement('style');
  spinStyle.textContent = '@keyframes crspin { to { transform: rotate(360deg); } }';
  document.head.appendChild(spinStyle);
  document.body.appendChild(toast);

  try {
    // Load DM Sans font
    if (!document.querySelector('link[href*="DM+Sans"]')) {
      const link = document.createElement('link');
      link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
      await new Promise(r => setTimeout(r, 800));
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

    const d = computeData(allData);
    const now = new Date();
    const reportDate = now.toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
    const reportMonth = now.toLocaleDateString('en-US', { year:'numeric', month:'long' });

    const pagesHTML = [
      buildPage1(d, reportMonth, reportDate),
      buildPage2(d, reportMonth),
      buildPage3(d, reportMonth),
      buildPage4(d, reportMonth),
    ];

    // Create hidden container
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;';
    const styleTag = document.createElement('style');
    styleTag.textContent = getCSS();
    container.appendChild(styleTag);
    document.body.appendChild(container);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = 210;

    for (let i = 0; i < pagesHTML.length; i++) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = pagesHTML[i];
      const pageEl = wrapper.firstElementChild;
      container.appendChild(pageEl);

      // Wait for rendering
      await new Promise(r => setTimeout(r, 300));

      const canvas = await window.html2canvas(pageEl, {
        scale: 2,
        useCORS: true,
        backgroundColor: null,
        width: 694,
        height: 980,
        windowWidth: 694,
      });

      const imgData = canvas.toDataURL('image/png');
      const imgHeight = (canvas.height * pageWidth) / canvas.width;

      if (i > 0) doc.addPage();
      doc.addImage(imgData, 'PNG', 0, 0, pageWidth, Math.min(imgHeight, 297));

      container.removeChild(pageEl);
    }

    document.body.removeChild(container);

    const monthName = fullMonths[now.getMonth()];
    doc.save(`HCD_Analytics_${monthName}_2026.pdf`);

  } catch (err) {
    console.error('HCD Analytics PDF export error:', err);
    alert('Error generating PDF. Please try again.');
  }

  document.body.removeChild(toast);
  document.head.removeChild(spinStyle);
}
