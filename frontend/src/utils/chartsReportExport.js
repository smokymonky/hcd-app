// chartsReportExport.js — HCD Performance Analytics Report
// 4-page A4 PDF: Cover → YTD Progress → Function Scorecard → Key Insights
// Uses jsPDF direct drawing (same mechanics as pdfExport.js — instant download)
// SOURCE OF TRUTH: full_report_preview.html
// Always uses current month + allData (unfiltered)

const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fullMonths = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const funcNames = ['OP','D&C','T&A','OD','Com&Bn','SBM'];
const funcFullNames = { OP:'Operations', 'D&C':'Development & Career', 'T&A':'Talent Acquisition', OD:'Organization Design', 'Com&Bn':'Compensation & Benefits', SBM:'Strategy & Business Mgmt' };
const catDefs = [
  { key: 'Activities/Programs/Projects', label: 'Activities / Programs / Projects', shortLabel: 'Activities/Programs', icon: 'P', color: [30,41,59] },
  { key: 'Maintenance Projects', label: 'Maintenance Projects', shortLabel: 'Maintenance', icon: 'M', color: [100,116,139] },
  { key: 'Reports', label: 'Reports', shortLabel: 'Reports', icon: 'R', color: [203,213,225] },
];
const ownerColors = {
  OP:{bg:[220,252,231],c:[22,163,74]}, 'D&C':{bg:[219,234,254],c:[37,99,235]}, 'T&A':{bg:[254,243,199],c:[146,64,14]},
  OD:{bg:[243,232,255],c:[124,58,237]}, 'Com&Bn':{bg:[254,226,226],c:[220,38,38]}, SBM:{bg:[207,250,254],c:[14,116,144]},
  ALL:{bg:[241,245,249],c:[100,116,139]}
};

function computeData(allData) {
  const now = new Date();
  const cmi = now.getMonth();
  const cms = months[cmi], cmf = fullMonths[cmi], nms = months[(cmi+1)%12];
  const totalAct = allData.length;
  const compAct = allData.filter(i => i.status==='Completed'||i.status==='Completed Early').length;
  const overallRate = totalAct > 0 ? (compAct/totalAct)*100 : 0;

  const catStats = catDefs.map(cat => {
    const items = allData.filter(i => i.category===cat.key);
    const t=items.length, c=items.filter(i=>i.status==='Completed'||i.status==='Completed Early').length, dd=items.filter(i=>i.status==='Delayed').length;
    return {...cat, total:t, completed:c, delayed:dd, rate: t>0?(c/t)*100:0};
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

  const highRisk=[],medRisk=[],watchRisk=[];
  allData.forEach(item => {
    const dd=item.dueDates||[], ms=item.monthStatus||{};
    dd.forEach(m => {
      const mi=months.indexOf(m);
      if(mi<cmi&&mi>=0) {
        const st=ms[m]||ms[fullMonths[mi]]||'';
        if(st!=='Completed'&&st!=='Completed Early'&&!highRisk.find(r=>r.id===item.id&&r.dm===m))
          highRisk.push({id:item.id,name:item.activity,owner:item.owner,dm:m});
      }
    });
    if(dd.includes(cms)){const st=ms[cms]||ms[cmf]||'';if(!st||st==='Scheduled')if(!medRisk.find(r=>r.id===item.id))medRisk.push({id:item.id,name:item.activity,owner:item.owner,dm:cms});}
    if(dd.includes(nms)){const st=ms[nms]||ms[fullMonths[(cmi+1)%12]]||'';if(!st||st==='Scheduled')if(!watchRisk.find(r=>r.id===item.id))watchRisk.push({id:item.id,name:item.activity,owner:item.owner,dm:nms});}
  });

  const scorecard = catDefs.map(cat => {
    const ci=allData.filter(i=>i.category===cat.key);
    const fs=funcNames.map(fn=>{
      const fi=ci.filter(i=>i.owner.split('/').map(o=>o.trim()).includes(fn));
      const t=fi.length,c=fi.filter(i=>i.status==='Completed'||i.status==='Completed Early').length,dd=fi.filter(i=>i.status==='Delayed').length;
      return {fn,total:t,completed:c,delayed:dd,rate:t>0?(c/t)*100:0};
    }).filter(f=>f.total>0).sort((a,b)=>b.rate-a.rate||b.completed-a.completed||a.total-b.total);
    return {...cat,fs};
  });

  const wts={'Activities/Programs/Projects':3,'Maintenance Projects':2,'Reports':1};
  const workload=funcNames.map(fn=>{
    let p=0,m=0,r=0;
    allData.forEach(item=>{if(!item.owner.split('/').map(o=>o.trim()).includes(fn))return;if(item.category==='Activities/Programs/Projects')p++;else if(item.category==='Maintenance Projects')m++;else if(item.category==='Reports')r++;});
    return {fn,p,m,r,pw:p*3,mw:m*2,rw:r*1,w:p*3+m*2+r*1};
  }).sort((a,b)=>b.w-a.w);
  const totalW=workload.reduce((s,d)=>s+d.w,0);

  const funcOv=funcNames.map(fn=>{
    const fi=allData.filter(i=>i.owner.split('/').map(o=>o.trim()).includes(fn));
    const t=fi.length,c=fi.filter(i=>i.status==='Completed'||i.status==='Completed Early').length;
    let md=0,mdu=0;
    fi.forEach(item=>{(item.dueDates||[]).forEach(m=>{const mi=months.indexOf(m);if(mi<0)return;mdu++;const ms=item.monthStatus||{};const st=ms[m]||ms[fullMonths[mi]]||'';if(st==='Completed'||st==='Completed Early')md++;});});
    return {fn,total:t,completed:c,rate:t>0?(c/t)*100:0,md,mdu};
  });
  const top=[...funcOv].sort((a,b)=>b.rate-a.rate||b.completed-a.completed)[0];
  const worst=[...funcOv].sort((a,b)=>a.rate-b.rate||a.completed-b.completed)[0];

  const futureW=months.map((m,mi)=>{if(mi<=cmi)return{m,w:0};let w=0;allData.forEach(item=>{if(!(item.dueDates||[]).includes(m))return;w+=wts[item.category]||1;});return{m,w};}).filter(d=>d.w>0).sort((a,b)=>b.w-a.w);
  const busiest=futureW[0]||{m:'N/A',w:0};

  const dueThroughNext=monthData.slice(0,cmi+2).reduce((s,d)=>s+d.due,0);
  const needed=Math.max(0,Math.ceil(dueThroughNext*(expectedPct/100))-totalDone);

  return {cmi,cms,cmf,nms,totalAct,compAct,overallRate,catStats,monthData,dueThroughCurrent,totalDone,totalDue,actualPct,expectedPct,gap,highRisk,medRisk,watchRisk,scorecard,workload,totalW,funcOv,top,worst,busiest,needed};
}

function genRecs(d) {
  const recs=[];
  if(d.highRisk.length>0) recs.push({b:'Close overdue items immediately.',t:' Month-level due dates from past months remain incomplete. Schedule a review with function heads.'});
  const cd=d.monthData[d.cmi];
  if(cd&&cd.due>0&&cd.done<cd.due) recs.push({b:`Prioritize ${d.cmf} due dates.`,t:` ${cd.due} due dates in ${d.cmf} with ${cd.done} completed. Focus on quick wins before month end.`});
  if(d.worst&&d.worst.completed===0) recs.push({b:`Activate ${d.worst.fn} function.`,t:` ${funcFullNames[d.worst.fn]} has 0% progress. Identify blockers and assign accountability.`});
  if(d.busiest.w>0){const bf=fullMonths[months.indexOf(d.busiest.m)]||d.busiest.m;recs.push({b:`Plan ahead for ${bf} peak.`,t:` ${bf} has the highest weighted workload (${d.busiest.w} pts). Begin preparation early.`});}
  if(recs.length<2) recs.push({b:'Maintain momentum.',t:' Continue tracking month-level completions and ensure all teams update progress regularly.'});
  return recs.slice(0,4);
}

function rr(doc,x,y,w,h,r,fc,sc){if(fc)doc.setFillColor(...fc);if(sc){doc.setDrawColor(...sc);doc.setLineWidth(0.3);}doc.roundedRect(x,y,w,h,r,r,fc&&sc?'FD':fc?'F':'S');}

export async function exportChartsReport(allData) {
  if(!window.jspdf){const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';document.head.appendChild(s);await new Promise(r=>s.onload=r);}

  const d=computeData(allData);
  const{jsPDF}=window.jspdf;
  const doc=new jsPDF('p','mm','a4');
  const pw=210,ph=297;
  const now=new Date();
  const reportDate=now.toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
  const reportMonth=now.toLocaleDateString('en-US',{year:'numeric',month:'long'});

  const C={
    DARK:[26,14,46],DARK2:[45,24,69],DARK3:[61,36,96],DARK4:[74,48,112],
    WHITE:[255,255,255],GOLD:[243,192,54],PURPLE_L:[168,136,190],
    BG:[250,250,250],CBG:[250,248,252],BDR:[236,230,243],
    GRN:[34,197,94],GRN_BG:[220,252,231],GRN_D:[22,163,74],
    RED:[239,68,68],RED_BG:[254,226,226],RED_D:[220,38,38],
    AMB:[245,158,11],AMB_BG:[255,251,235],AMB_D:[146,64,14],
    ORG:[249,115,22],ORG_BG:[255,247,237],ORG_D:[154,52,18],
    VIO:[139,92,246],VIO_BG:[243,232,255],VIO_D:[124,58,237],
    SLT:[100,116,139],GRY:[136,136,136],GRY_L:[204,204,204],
    TXT:[26,14,46],TXS:[102,102,102],TXL:[153,153,153],
    TH:[26,14,46],TE:[250,248,252],
    NAV:[30,41,59],STL:[100,116,139],SIL:[203,213,225],
  };

  const oc=(o)=>{const f=o.split('/')[0].trim();return ownerColors[f]||ownerColors.ALL;};
  const mx=14,mw=pw-28;

  // ═══════ PAGE 1: COVER ═══════
  doc.setFillColor(...C.DARK);doc.rect(0,0,pw,ph,'F');
  doc.setFillColor(45,24,69);doc.rect(0,ph*0.35,pw,ph*0.25,'F');
  doc.setFillColor(61,36,96);doc.rect(0,ph*0.55,pw,ph*0.2,'F');
  doc.setFillColor(74,48,112);doc.rect(0,ph*0.7,pw,ph*0.3,'F');

  doc.setTextColor(...C.WHITE);doc.setFontSize(13);doc.setFont('helvetica','bold');
  doc.text('AbdulLatif Jameel Finance',22,28);
  doc.setTextColor(...C.PURPLE_L);doc.setFontSize(9);doc.setFont('helvetica','normal');
  doc.text('Human Capital Department',22,34);

  rr(doc,pw-55,22,38,10,5,[50,30,70],[243,192,54]);
  doc.setTextColor(...C.GOLD);doc.setFontSize(6.5);doc.setFont('helvetica','bold');
  doc.text('CONFIDENTIAL',pw-36,28.5,{align:'center'});

  doc.setTextColor(...C.GOLD);doc.setFontSize(9);doc.setFont('helvetica','bold');
  doc.text('ANNUAL PLAN 2026',22,115,{charSpace:2});
  doc.setTextColor(...C.WHITE);doc.setFontSize(30);doc.setFont('helvetica','bold');
  doc.text('HCD Performance',22,133);
  doc.setTextColor(...C.GOLD);
  doc.text('Analytics Report',22,148);
  doc.setTextColor(...C.PURPLE_L);doc.setFontSize(14);doc.setFont('helvetica','normal');
  doc.text(reportMonth,22,162);

  doc.setDrawColor(...C.PURPLE_L);doc.setLineWidth(0.1);doc.line(22,ph-22,pw-22,ph-22);
  doc.setTextColor(...C.PURPLE_L);doc.setFontSize(7.5);doc.setFont('helvetica','normal');
  doc.text('Generated from HCD Application \u2022 For internal use only',22,ph-14);
  doc.setTextColor(...C.WHITE);doc.setFontSize(8);doc.setFont('helvetica','bold');
  doc.text(reportDate,pw-22,ph-14,{align:'right'});

  // ═══════ PAGE 2: YTD PROGRESS ═══════
  doc.addPage();doc.setFillColor(...C.BG);doc.rect(0,0,pw,ph,'F');
  let y=14;

  // Overall Completion
  doc.setTextColor(...C.GRY);doc.setFontSize(7.5);doc.setFont('helvetica','bold');
  doc.text('OVERALL COMPLETION RATE',mx,y);y+=5;

  // Ring placeholder
  doc.setDrawColor(240,236,245);doc.setLineWidth(2.2);doc.circle(mx+11,y+10,9,'S');
  if(d.overallRate>0){doc.setDrawColor(...C.GRN);doc.setLineWidth(2.2);/* arc not supported, show text */}
  doc.setTextColor(...C.TXT);doc.setFontSize(7.5);doc.setFont('helvetica','bold');
  doc.text(`${d.overallRate.toFixed(1)}%`,mx+11,y+11,{align:'center'});
  doc.setTextColor(...C.GRY);doc.setFontSize(4.5);doc.setFont('helvetica','normal');
  doc.text('Complete',mx+11,y+14.5,{align:'center'});

  doc.setTextColor(...C.GRN);doc.setFontSize(22);doc.setFont('helvetica','bold');
  doc.text(`${d.overallRate.toFixed(1)}%`,mx+28,y+9);
  doc.setTextColor(...C.GRY);doc.setFontSize(8);doc.setFont('helvetica','normal');
  doc.text(`${d.compAct} of ${d.totalAct} activities completed across all functions YTD`,mx+28,y+15);
  y+=23;
  doc.setDrawColor(...C.BDR);doc.setLineWidth(0.3);doc.line(mx,y,mx+mw,y);y+=3;

  // Category table
  const cW=[mw*0.38,mw*0.14,mw*0.18,mw*0.15,mw*0.15];
  const cX=[mx,mx+cW[0],mx+cW[0]+cW[1],mx+cW[0]+cW[1]+cW[2],mx+cW[0]+cW[1]+cW[2]+cW[3]];

  rr(doc,mx,y,mw,6.5,2,C.TH);
  doc.setTextColor(...C.WHITE);doc.setFontSize(6.5);doc.setFont('helvetica','bold');
  doc.text('Category',cX[0]+3,y+4.2);doc.text('Total',cX[1]+cW[1]/2,y+4.2,{align:'center'});
  doc.text('Completed',cX[2]+cW[2]/2,y+4.2,{align:'center'});doc.text('Delayed',cX[3]+cW[3]/2,y+4.2,{align:'center'});
  doc.text('Rate',cX[4]+cW[4]/2,y+4.2,{align:'center'});y+=6.5;

  d.catStats.forEach((cat,i)=>{
    const rh=6.5;
    if(i%2===1){doc.setFillColor(...C.TE);doc.rect(mx,y,mw,rh,'F');}
    doc.setDrawColor(...C.BDR);doc.setLineWidth(0.15);doc.line(mx,y+rh,mx+mw,y+rh);

    rr(doc,cX[0]+2,y+1.2,4,4,1,[226,232,240]);
    doc.setTextColor(...C.TXT);doc.setFontSize(5);doc.setFont('helvetica','bold');
    doc.text(cat.icon,cX[0]+4,y+4,{align:'center'});
    doc.setFontSize(7);doc.setFont('helvetica','bold');
    doc.text(cat.shortLabel,cX[0]+8,y+4.2);

    doc.setTextColor(...C.TXT);doc.setFontSize(7.5);doc.setFont('helvetica','bold');
    doc.text(String(cat.total),cX[1]+cW[1]/2,y+4.2,{align:'center'});

    rr(doc,cX[2]+cW[2]/2-6,y+1,12,4.5,2,C.GRN_BG);
    doc.setTextColor(...C.GRN_D);doc.setFontSize(7);doc.setFont('helvetica','bold');
    doc.text(String(cat.completed),cX[2]+cW[2]/2,y+4,{align:'center'});

    rr(doc,cX[3]+cW[3]/2-5,y+1,10,4.5,2,C.RED_BG);
    doc.setTextColor(...C.RED_D);doc.setFontSize(7);
    doc.text(String(cat.delayed),cX[3]+cW[3]/2,y+4,{align:'center'});

    const rc=cat.rate>0?C.GRN:C.GRY_L;
    doc.setTextColor(...rc);doc.setFontSize(7.5);doc.setFont('helvetica','bold');
    doc.text(`${cat.rate>0?cat.rate.toFixed(cat.rate<10?1:0):'0'}%`,cX[4]+cW[4]/2,y+4.2,{align:'center'});
    y+=rh;
  });
  y+=6;

  // Expected vs Actual
  doc.setTextColor(...C.GRY);doc.setFontSize(7.5);doc.setFont('helvetica','bold');
  doc.text(`EXPECTED VS ACTUAL (${d.cmf.toUpperCase()} 2026)`,mx,y);y+=4;
  doc.setTextColor(...C.TXS);doc.setFontSize(6.5);doc.setFont('helvetica','normal');
  doc.text(`Due date entries per month — Activity Due Through `,mx,y);
  const tw1=doc.getTextWidth(`Due date entries per month — Activity Due Through `);
  doc.setFont('helvetica','bold');doc.text(`${d.cms}: ${d.dueThroughCurrent}`,mx+tw1,y);
  y+=5;

  // Monthly timeline
  const mcW=mw/12;
  d.monthData.forEach((md,mi)=>{
    const cx=mx+mi*mcW,ccx=cx+mcW/2;
    if(md.current){
      doc.setDrawColor(...C.VIO);doc.setLineWidth(0.4);doc.setFillColor(250,245,255);
      doc.roundedRect(cx+0.3,y,mcW-0.6,26,1.5,1.5,'FD');
      rr(doc,ccx-4.5,y-2,9,3.5,1.5,C.VIO);
      doc.setTextColor(...C.WHITE);doc.setFontSize(3.5);doc.setFont('helvetica','bold');
      doc.text('NOW',ccx,y,{align:'center'});
    } else if(md.past){
      doc.setFillColor(250,250,250);doc.rect(cx+0.3,y,mcW-0.6,26,'F');
    }

    doc.setTextColor(md.current?139:md.past?85:136,md.current?92:md.past?85:136,md.current?246:md.past?85:136);
    doc.setFontSize(5.5);doc.setFont('helvetica','bold');doc.text(md.m,ccx,y+4.5,{align:'center'});

    doc.setTextColor(md.future?204:26,md.future?204:14,md.future?204:46);
    doc.setFontSize(10);doc.setFont('helvetica','bold');doc.text(String(md.due),ccx,y+11,{align:'center'});

    if(!md.future){
      doc.setTextColor(md.done>0?34:221,md.done>0?197:221,md.done>0?94:221);
      doc.setFontSize(4);doc.setFont('helvetica','bold');
      doc.text(md.done>0?`${md.done} done`:'0 done',ccx,y+14.5,{align:'center'});
      doc.setTextColor(md.delayed>0?239:221,md.delayed>0?68:221,md.delayed>0?68:221);
      doc.text(md.delayed>0?`${md.delayed} delayed`:'0 delayed',ccx,y+17.5,{align:'center'});
    } else {
      doc.setTextColor(221,221,221);doc.setFontSize(4);doc.setFont('helvetica','bold');
      doc.text('\u2014',ccx,y+14.5,{align:'center'});doc.text('\u2014',ccx,y+17.5,{align:'center'});
    }

    const bY=y+20,bW=mcW-3,bH=1.2;
    rr(doc,cx+1.5,bY,bW,bH,0.4,[238,238,238]);
    if(md.due>0&&!md.future){
      if(md.done>0){doc.setFillColor(...C.GRN);doc.rect(cx+1.5,bY,bW*(md.done/md.due),bH,'F');}
      if(md.delayed>0){doc.setFillColor(...C.RED);doc.rect(cx+1.5+bW*(md.done/md.due),bY,bW*(md.delayed/md.due),bH,'F');}
    }
  });
  y+=30;

  // Progress bar
  rr(doc,mx,y,mw,5.5,2,[240,236,245]);
  const aW=Math.max(mw*d.actualPct/100,7);
  doc.setFillColor(34,197,94);doc.roundedRect(mx,y,aW,5.5,2,2,'F');
  doc.setTextColor(...C.WHITE);doc.setFontSize(5.5);doc.setFont('helvetica','bold');
  doc.text(`${d.actualPct.toFixed(1)}%`,mx+2.5,y+3.8);
  const eX=mx+mw*d.expectedPct/100;
  doc.setFillColor(...C.TXT);doc.rect(eX-0.4,y-4.5,0.8,5.5+5.5,'F');
  rr(doc,eX-7,y-6,14,3.5,1,C.TXT);
  doc.setTextColor(...C.WHITE);doc.setFontSize(4.5);doc.setFont('helvetica','bold');
  doc.text(`${d.expectedPct.toFixed(1)}%`,eX,y-3.5,{align:'center'});
  y+=8;

  let lx=mx;
  [[C.GRN,`Actual: ${d.actualPct.toFixed(1)}%`],[C.TXT,'Expected pace'],[[240,236,245],'Remaining']].forEach(([c,t])=>{
    rr(doc,lx,y,2,2,0.5,c);doc.setTextColor(...C.GRY);doc.setFontSize(5.5);doc.setFont('helvetica','normal');
    doc.text(t,lx+3.5,y+1.5);lx+=doc.getTextWidth(t)+7;
  });
  y+=5;

  // Callouts
  if(d.gap>0){
    rr(doc,mx,y,mw,10,2,[255,247,237],[254,215,170]);
    doc.setTextColor(234,88,12);doc.setFontSize(6.5);doc.setFont('helvetica','bold');
    doc.text(`${d.gap.toFixed(1)}% below expected pace.`,mx+4,y+4);
    doc.setTextColor(154,52,18);doc.setFont('helvetica','normal');
    doc.text(`Only ${d.totalDone} completion${d.totalDone!==1?'s':''} recorded out of ${d.dueThroughCurrent} due dates through ${d.cmf}.`,mx+4,y+8);
    y+=12;
  } else {
    rr(doc,mx,y,mw,8,2,[240,253,244],[187,247,208]);
    doc.setTextColor(22,163,74);doc.setFontSize(6.5);doc.setFont('helvetica','bold');
    doc.text('On track!',mx+4,y+4);
    doc.setFont('helvetica','normal');doc.text('Completion rate is meeting or exceeding expected pace.',mx+4,y+7);
    y+=10;
  }

  if(d.needed>0&&d.gap>0){
    rr(doc,mx,y,mw,10,2,[240,244,255],[191,219,254]);
    doc.setTextColor(30,64,175);doc.setFontSize(6.5);doc.setFont('helvetica','normal');
    doc.text(`To get back on track by end of ${fullMonths[(d.cmi+1)%12]},`,mx+4,y+4);
    doc.setFont('helvetica','bold');
    doc.text(`approximately ${d.needed} more completion${d.needed!==1?'s':''} need to be recorded.`,mx+4,y+8);
    y+=12;
  }
  y+=2;

  // Risk Radar
  doc.setTextColor(...C.GRY);doc.setFontSize(7.5);doc.setFont('helvetica','bold');
  doc.text('RISK RADAR',mx,y);y+=3.5;
  doc.setTextColor(...C.TXS);doc.setFontSize(6.5);doc.setFont('helvetica','normal');
  doc.text('Activities requiring attention',mx,y);y+=4;

  const drawRG=(items,bgC,bdC,ttC,cBg,cC,title,maxS)=>{
    if(!items.length)return;
    rr(doc,mx,y,mw,5.5,1.5,bgC);doc.setFillColor(...bdC);doc.rect(mx,y,1,5.5,'F');
    doc.setTextColor(...ttC);doc.setFontSize(6.5);doc.setFont('helvetica','bold');doc.text(title,mx+4,y+3.7);
    rr(doc,mx+mw-10,y+0.8,8,3.8,2,cBg);doc.setTextColor(...cC);doc.setFontSize(6);doc.setFont('helvetica','bold');
    doc.text(String(items.length),mx+mw-6,y+3.5,{align:'center'});
    y+=7;
    items.slice(0,maxS).forEach(r=>{
      rr(doc,mx+3,y,mw-3,5,1.5,C.CBG,C.BDR);
      doc.setTextColor(...C.TXT);doc.setFontSize(6);doc.setFont('helvetica','bold');
      let nm=r.name;if(nm.length>40)nm=nm.substring(0,38)+'..';
      doc.text(nm,mx+6,y+3.3);
      const occ=oc(r.owner);const ol=r.owner.length>10?r.owner.substring(0,10):r.owner;
      const ow=doc.getTextWidth(ol)+3;
      rr(doc,mx+mw-18-ow,y+0.8,ow+2,3.4,1.2,occ.bg);
      doc.setTextColor(...occ.c);doc.setFontSize(5);doc.setFont('helvetica','bold');
      doc.text(ol,mx+mw-17-ow/2,y+3.2,{align:'center'});
      doc.setTextColor(...C.GRY);doc.setFontSize(5);doc.setFont('helvetica','normal');
      doc.text(`Due: ${r.dm}`,mx+mw-4,y+3.2,{align:'right'});
      y+=5.5;
    });
    if(items.length>maxS){doc.setTextColor(...ttC);doc.setFontSize(5.5);doc.setFont('helvetica','bold');doc.text(`+ ${items.length-maxS} more`,mx+6,y+1);y+=3;}
    y+=2;
  };

  if(!d.highRisk.length&&!d.medRisk.length&&!d.watchRisk.length){
    rr(doc,mx,y,mw,12,3,[240,253,244],[187,247,208]);
    doc.setTextColor(22,101,52);doc.setFontSize(8);doc.setFont('helvetica','bold');
    doc.text('All Clear \u2014 No Risks Detected',mx+mw/2,y+7.5,{align:'center'});
  } else {
    drawRG(d.highRisk,[254,242,242],C.RED,[153,27,27],C.RED_BG,C.RED_D,'High Risk \u2014 Overdue',5);
    drawRG(d.medRisk,C.AMB_BG,C.AMB,[146,64,14],[254,243,199],[217,119,6],'Medium \u2014 Due This Month, Not Started',5);
    drawRG(d.watchRisk,C.ORG_BG,C.ORG,[154,52,18],[255,237,213],[234,88,12],'Watch \u2014 Due Next Month, Not Started',4);
  }

  doc.setTextColor(...C.GRY_L);doc.setFontSize(6.5);doc.setFont('helvetica','normal');
  doc.setDrawColor(...C.BDR);doc.line(mx,ph-11,mx+mw,ph-11);
  doc.text(`HCD Performance Analytics Report \u2014 ${reportMonth}`,mx,ph-7);
  doc.text('Page 2 of 4',mx+mw,ph-7,{align:'right'});

  // ═══════ PAGE 3: FUNCTION SCORECARD ═══════
  doc.addPage();doc.setFillColor(...C.BG);doc.rect(0,0,pw,ph,'F');
  y=14;
  doc.setTextColor(...C.GRY);doc.setFontSize(7.5);doc.setFont('helvetica','bold');
  doc.text('FUNCTION SCORECARD',mx,y);y+=3.5;
  doc.setTextColor(...C.TXS);doc.setFontSize(6.5);doc.setFont('helvetica','normal');
  doc.text('Functions ranked by completion rate \u2014 separated by category',mx,y);y+=6;

  d.scorecard.forEach(cat=>{
    const tot=cat.fs.reduce((s,f)=>s+f.total,0);
    rr(doc,mx,y,mw,6,1.5,[241,245,249]);doc.setFillColor(...cat.color);doc.rect(mx,y,1,6,'F');
    doc.setTextColor(...C.TXT);doc.setFontSize(7.5);doc.setFont('helvetica','bold');doc.text(cat.label,mx+4,y+4);
    rr(doc,mx+mw-20,y+1,18,4,2,[226,232,240]);
    doc.setTextColor(...C.SLT);doc.setFontSize(5.5);doc.setFont('helvetica','bold');
    doc.text(`${tot} activities`,mx+mw-11,y+3.7,{align:'center'});
    y+=8;

    rr(doc,mx,y,mw,6,1.2,C.TH);
    doc.setTextColor(...C.WHITE);doc.setFontSize(6);doc.setFont('helvetica','bold');
    doc.text('Rank',mx+5,y+4);doc.text('Function',mx+18,y+4);
    doc.text('Total',mx+65,y+4,{align:'center'});doc.text('Completed',mx+90,y+4,{align:'center'});
    doc.text('Delayed',mx+115,y+4,{align:'center'});doc.text('Rate',mx+140,y+4,{align:'center'});
    y+=6.5;

    cat.fs.forEach((f,i)=>{
      const rh=6;
      if(i%2===1){doc.setFillColor(...C.TE);doc.rect(mx,y,mw,rh,'F');}
      doc.setDrawColor(...C.BDR);doc.setLineWidth(0.1);doc.line(mx,y+rh,mx+mw,y+rh);

      const rc=i===0?[[254,249,195],[161,98,7]]:i===1?[[241,245,249],[71,85,105]]:i===2?[[254,215,170],[154,52,18]]:[[243,232,255],[124,58,237]];
      doc.setFillColor(...rc[0]);doc.circle(mx+5,y+3,2.3,'F');
      doc.setTextColor(...rc[1]);doc.setFontSize(5.5);doc.setFont('helvetica','bold');
      doc.text(String(i+1),mx+5,y+3.8,{align:'center'});

      doc.setTextColor(...C.TXT);doc.setFontSize(7);doc.setFont('helvetica','bold');doc.text(f.fn,mx+18,y+4);
      doc.text(String(f.total),mx+65,y+4,{align:'center'});

      rr(doc,mx+82,y+0.7,14,4.2,2,C.GRN_BG);doc.setTextColor(...C.GRN_D);doc.setFontSize(6.5);
      doc.text(String(f.completed),mx+89,y+3.6,{align:'center'});

      rr(doc,mx+108,y+0.7,12,4.2,2,C.RED_BG);doc.setTextColor(...C.RED_D);doc.setFontSize(6.5);
      doc.text(String(f.delayed),mx+114,y+3.6,{align:'center'});

      const clr=f.rate>0?C.GRN:C.GRY_L;doc.setTextColor(...clr);doc.setFontSize(7);
      doc.text(`${f.rate>0?f.rate.toFixed(f.rate<10?1:0):'0'}%`,mx+140,y+4,{align:'center'});
      y+=rh;
    });
    y+=5;
  });

  doc.setTextColor(...C.GRY_L);doc.setFontSize(6.5);doc.setFont('helvetica','normal');
  doc.setDrawColor(...C.BDR);doc.line(mx,ph-11,mx+mw,ph-11);
  doc.text(`HCD Performance Analytics Report \u2014 ${reportMonth}`,mx,ph-7);
  doc.text('Page 3 of 4',mx+mw,ph-7,{align:'right'});

  // ═══════ PAGE 4: KEY INSIGHTS ═══════
  doc.addPage();doc.setFillColor(...C.BG);doc.rect(0,0,pw,ph,'F');
  y=14;
  doc.setTextColor(...C.GRY);doc.setFontSize(7.5);doc.setFont('helvetica','bold');
  doc.text('KEY INSIGHTS & RECOMMENDATIONS',mx,y);y+=3.5;
  doc.setTextColor(...C.TXS);doc.setFontSize(6.5);doc.setFont('helvetica','normal');
  doc.text("What's working, what's at risk, and recommended next steps",mx,y);y+=6;

  const cW2=(mw-4)/2,cH2=32;
  const drawIC=(x,yy,topC,title,badgeC,badgeTxt,val,valC,detail)=>{
    rr(doc,x,yy,cW2,cH2,2,[255,255,255],C.BDR);
    doc.setFillColor(...topC);doc.rect(x,yy,cW2,0.8,'F');
    doc.setTextColor(...C.GRY);doc.setFontSize(5);doc.setFont('helvetica','bold');
    doc.text(title.toUpperCase(),x+4,yy+6);
    if(badgeTxt){rr(doc,x+4,yy+8,Math.min(doc.getTextWidth(badgeTxt)+5,cW2-8),4,1.2,badgeC);
    doc.setTextColor(...valC);doc.setFontSize(5.5);doc.setFont('helvetica','bold');doc.text(badgeTxt,x+6.5,yy+10.8);}
    doc.setTextColor(...valC);doc.setFontSize(10);doc.setFont('helvetica','bold');
    doc.text(val,x+4,yy+(badgeTxt?18:14));
    doc.setTextColor(...C.TXS);doc.setFontSize(5.5);doc.setFont('helvetica','normal');
    const dl=doc.splitTextToSize(detail,cW2-8);doc.text(dl.slice(0,3),x+4,yy+(badgeTxt?22:18));
  };

  const bFull=fullMonths[months.indexOf(d.busiest.m)]||d.busiest.m;
  const twPct=d.totalW>0?((d.workload[0]?.w/d.totalW)*100).toFixed(1):'0';

  drawIC(mx,y,C.GRN,'Top Performer',C.GRN_BG,`${funcFullNames[d.top.fn]} (${d.top.fn})`,`${d.top.rate.toFixed(1)}% completion`,C.GRN_D,`${d.top.completed} of ${d.top.total} activities completed.`);
  drawIC(mx+cW2+4,y,C.RED,'Most At Risk',C.RED_BG,`${funcFullNames[d.worst.fn]} (${d.worst.fn})`,`${d.worst.rate.toFixed(0)}% completion`,C.RED_D,`${d.worst.completed} of ${d.worst.mdu} due dates completed. ${d.worst.completed===0?'No activities in progress.':''}`);
  y+=cH2+3;
  drawIC(mx,y,C.GOLD,'Busiest Month Ahead',null,null,`${bFull} \u2014 ${d.busiest.w} wt pts`,C.AMB_D,'Highest weighted workload ahead. Planning should begin early to avoid bottleneck.');
  drawIC(mx+cW2+4,y,C.VIO,'Workload Distribution',null,null,`${d.workload[0]?.fn} carries ${twPct}%`,C.VIO_D,`${d.workload[0]?.fn}: ${d.workload[0]?.w} pts highest. ${d.workload[d.workload.length-1]?.fn}: ${d.workload[d.workload.length-1]?.w} pts lightest.`);
  y+=cH2+5;

  // Workload bars
  doc.setTextColor(...C.TXT);doc.setFontSize(7.5);doc.setFont('helvetica','bold');
  doc.text('Function Workload Balance',mx,y);
  doc.setTextColor(...C.TXL);doc.setFontSize(5);doc.setFont('helvetica','normal');
  doc.text('Weights: Programs x3 | Maintenance x2 | Reports x1',mx+mw,y,{align:'right'});
  y+=3;doc.setTextColor(...C.TXS);doc.setFontSize(6);doc.text('Weighted workload per function',mx,y);y+=4;

  const mxW=d.workload[0]?.w||1;
  d.workload.forEach(w=>{
    doc.setTextColor(...C.TXT);doc.setFontSize(6);doc.setFont('helvetica','bold');doc.text(w.fn,mx,y+2.8);
    const bX=mx+20,bWt=mw-40,bH=4.5;
    rr(doc,bX,y,bWt,bH,1.2,[240,236,245]);
    const tbW=bWt*(w.w/mxW);let bxx=bX;
    if(w.pw>0){const sw=tbW*(w.pw/w.w);doc.setFillColor(...C.NAV);doc.rect(bxx,y,sw,bH,'F');if(sw>5){doc.setTextColor(...C.WHITE);doc.setFontSize(4);doc.setFont('helvetica','bold');doc.text(String(w.pw),bxx+sw/2,y+3,{align:'center'});}bxx+=sw;}
    if(w.mw>0){const sw=tbW*(w.mw/w.w);doc.setFillColor(...C.STL);doc.rect(bxx,y,sw,bH,'F');if(sw>5){doc.setTextColor(...C.WHITE);doc.setFontSize(4);doc.setFont('helvetica','bold');doc.text(String(w.mw),bxx+sw/2,y+3,{align:'center'});}bxx+=sw;}
    if(w.rw>0){const sw=tbW*(w.rw/w.w);doc.setFillColor(...C.SIL);doc.rect(bxx,y,sw,bH,'F');if(sw>5){doc.setTextColor(71,85,105);doc.setFontSize(4);doc.setFont('helvetica','bold');doc.text(String(w.rw),bxx+sw/2,y+3,{align:'center'});}}
    doc.setTextColor(...C.TXT);doc.setFontSize(6.5);doc.setFont('helvetica','bold');
    doc.text(`${w.w}`,mx+mw-4,y+3,{align:'right'});
    doc.setTextColor(...C.TXL);doc.setFontSize(5);doc.setFont('helvetica','normal');
    doc.text('pts',mx+mw,y+3,{align:'right'});
    y+=6;
  });

  y+=1;doc.setDrawColor(...C.BDR);doc.line(mx,y,mx+mw,y);y+=2.5;
  lx=mx;
  [[C.NAV,'Programs (x3)'],[C.STL,'Maintenance (x2)'],[C.SIL,'Reports (x1)']].forEach(([c,t])=>{
    rr(doc,lx,y,2,2,0.5,c);doc.setTextColor(...C.GRY);doc.setFontSize(5);doc.setFont('helvetica','normal');
    doc.text(t,lx+3.5,y+1.5);lx+=doc.getTextWidth(t)+9;
  });
  y+=6;

  // Recommendations
  doc.setDrawColor(...C.BDR);doc.line(mx,y,mx+mw,y);y+=4;
  doc.setTextColor(...C.TXT);doc.setFontSize(7.5);doc.setFont('helvetica','bold');
  doc.text('Action Recommendations',mx,y);y+=3;
  doc.setTextColor(...C.GRY);doc.setFontSize(5.5);doc.setFont('helvetica','normal');
  doc.text('Priority actions for this month based on current data',mx,y);y+=4;

  genRecs(d).forEach((rec,i)=>{
    rr(doc,mx,y,mw,10,2,C.CBG,C.BDR);
    doc.setFillColor(...C.TXT);doc.circle(mx+4.5,y+5,2.5,'F');
    doc.setTextColor(...C.GOLD);doc.setFontSize(6);doc.setFont('helvetica','bold');
    doc.text(String(i+1),mx+4.5,y+5.8,{align:'center'});
    doc.setTextColor(...C.TXT);doc.setFontSize(6.5);doc.setFont('helvetica','bold');
    doc.text(rec.b,mx+10,y+4);
    doc.setTextColor(51,51,51);doc.setFontSize(6);doc.setFont('helvetica','normal');
    const rl=doc.splitTextToSize(rec.t.trim(),mw-13);doc.text(rl.slice(0,2),mx+10,y+7.5);
    y+=11;
  });

  doc.setTextColor(...C.GRY_L);doc.setFontSize(6.5);doc.setFont('helvetica','normal');
  doc.setDrawColor(...C.BDR);doc.line(mx,ph-11,mx+mw,ph-11);
  doc.text(`HCD Performance Analytics Report \u2014 ${reportMonth}`,mx,ph-7);
  doc.text('Page 4 of 4',mx+mw,ph-7,{align:'right'});

  // SAVE
  doc.save(`HCD_Analytics_${fullMonths[now.getMonth()]}_2026.pdf`);
}
