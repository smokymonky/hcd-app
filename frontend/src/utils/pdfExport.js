// PDF Export - Exact v17 with Option 33 colors
import hrPlanData from '../data/hrPlanData';

const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export async function exportToPDF(monthFilter, dataFromDashboard) {
  if (!window.jspdf) {
    const s1 = document.createElement('script');
    s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    document.head.appendChild(s1);
    await new Promise(r => s1.onload = r);
    const s2 = document.createElement('script');
    s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js';
    document.head.appendChild(s2);
    await new Promise(r => s2.onload = r);
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a3');
  const pageWidth = 297, pageHeight = 420;
  const selectedMonth = monthFilter !== 'all' ? monthFilter : null;
  const monthFullNames = { Jan:'January',Feb:'February',Mar:'March',Apr:'April',May:'May',Jun:'June',Jul:'July',Aug:'August',Sep:'September',Oct:'October',Nov:'November',Dec:'December' };
  const badgeText = selectedMonth ? monthFullNames[selectedMonth] || selectedMonth : 'Full Year';
  const fileNameMonth = selectedMonth ? monthFullNames[selectedMonth] || selectedMonth : 'Full_Year';

  const C = {
    PRIMARY_PURPLE:[55,30,84], GOLD:[243,192,54], LIGHT_PURPLE:[168,136,190],
    DARK_BG:[26,16,40], DARK_BG_3:[61,40,86], DARK_BG_4:[74,50,101],
    WHITE:[255,255,255], ROW_EVEN:[32,23,45], ROW_ODD:[36,24,53],
    SCHEDULED:[59,130,246], PROGRESSING:[245,158,11], COMPLETED:[16,185,129],
    DELAYED:[239,68,68], ONHOLD:[107,114,128], CANCELED:[249,115,22], COMPLETED_EARLY:[139,92,246],
    OP:[59,130,246], DC:[16,185,129], TA:[139,92,246], OD:[245,158,11], ComBn:[236,72,153], SBM:[6,182,212], ALL:[107,114,128]
  };

  const getOwnerColor = (o) => {
    const f = o.split('/')[0].trim();
    return { OP:C.OP,'D&C':C.DC,'T&A':C.TA,OD:C.OD,'Com&Bn':C.ComBn,SBM:C.SBM,ALL:C.ALL }[f] || C.LIGHT_PURPLE;
  };

  const drawCheckmark = (d, cx, cy, sz, col) => {
    d.setDrawColor(col[0],col[1],col[2]); d.setLineWidth(sz*0.18); d.setLineCap('round');
    d.line(cx-sz*0.35,cy-sz*0.05,cx-sz*0.05,cy+sz*0.25);
    d.line(cx-sz*0.05,cy+sz*0.25,cx+sz*0.4,cy-sz*0.3);
  };

  const ownerOrder = {OP:0,'D&C':1,'T&A':2,OD:3,'Com&Bn':4,SBM:5,ALL:6};
  const getOwnerOrder = (o) => { const f=o.split('/')[0].trim(); return ownerOrder[f]!==undefined?ownerOrder[f]:99; };
  const getEarliestMonth = (dd) => { if(!dd||dd.length===0)return 99; return Math.min(...dd.map(m=>months.indexOf(m)).filter(i=>i>=0)); };
  const sortAct = (items) => [...items].sort((a,b) => { const od=getOwnerOrder(a.owner)-getOwnerOrder(b.owner); return od!==0?od:getEarliestMonth(a.dueDates)-getEarliestMonth(b.dueDates); });

  const allData = (dataFromDashboard && dataFromDashboard.length > 0) ? dataFromDashboard : hrPlanData;
  const ss = {
    total:allData.length, scheduled:allData.filter(i=>i.status==='Scheduled').length,
    progressing:allData.filter(i=>i.status==='Progressing').length,
    completed:allData.filter(i=>i.status==='Completed').length,
    delayed:allData.filter(i=>i.status==='Delayed').length,
    onHold:allData.filter(i=>i.status==='On Hold').length,
    canceled:allData.filter(i=>i.status==='Canceled').length,
    completedEarly:allData.filter(i=>i.status==='Completed Early').length
  };

  const L = { headerY:4,headerHeight:14,headerX:7,headerRadius:3.5,goldLineHeight:0.7,tableX:5,rowHeight:4.9,catHeaderHeight:5.5,tableHeaderHeight:3.8,spaceBetweenGoldAndTable:10 };
  L.headerWidth=pageWidth-14; L.tableWidth=pageWidth-10;
  L.goldLineBottom=L.headerY+L.headerHeight+L.goldLineHeight;
  L.firstCategoryTop=L.goldLineBottom+L.spaceBetweenGoldAndTable;
  L.statsCenterY=L.goldLineBottom+(L.spaceBetweenGoldAndTable/2);

  // Background
  doc.setFillColor(...C.DARK_BG); doc.rect(0,0,pageWidth,pageHeight,'F');

  // Header
  const hCY=L.headerY+L.headerHeight/2;
  doc.setFillColor(...C.DARK_BG_3); doc.roundedRect(L.headerX,L.headerY,L.headerWidth,L.headerHeight,L.headerRadius,L.headerRadius,'F');
  doc.setFillColor(...C.GOLD); doc.rect(L.headerX,L.headerY+L.headerHeight,L.headerWidth,L.goldLineHeight,'F');

  const lbH=7,lsY=hCY-lbH/2;
  doc.setTextColor(...C.WHITE); doc.setFontSize(12); doc.setFont('helvetica','bold');
  doc.text('Abdul Latif Jameel',12,lsY+3.5);
  doc.setTextColor(...C.GOLD); doc.setFontSize(8); doc.setFont('helvetica','normal');
  doc.text('FINANCE',12,lsY+7);
  doc.setTextColor(...C.WHITE); doc.setFontSize(18); doc.setFont('helvetica','bold');
  doc.text('HCD Annual Plan 2026',pageWidth/2,hCY+2,{align:'center'});

  const bW=35,bH=9,bX=pageWidth-7-bW-9,bY=hCY-bH/2;
  doc.setFillColor(...C.GOLD); doc.roundedRect(bX,bY,bW,bH,2,2,'F');
  doc.setTextColor(...C.PRIMARY_PURPLE); doc.setFontSize(10); doc.setFont('helvetica','bold');
  doc.text(badgeText,bX+bW/2,hCY+1.5,{align:'center'});

  // Stats
  const sY=L.statsCenterY;
  const sItems=[
    {color:null,label:'Total:',value:ss.total},{color:C.SCHEDULED,label:'Scheduled:',value:ss.scheduled},
    {color:C.PROGRESSING,label:'Progressing:',value:ss.progressing},{color:C.COMPLETED,label:'Completed:',value:ss.completed},
    {color:C.DELAYED,label:'Delayed:',value:ss.delayed},{color:C.ONHOLD,label:'On Hold:',value:ss.onHold},
    {color:C.CANCELED,label:'Canceled:',value:ss.canceled},{color:C.COMPLETED_EARLY,label:'Completed Early:',value:ss.completedEarly}
  ];
  doc.setFontSize(7); doc.setFont('helvetica','bold');
  let sX=7;
  sItems.forEach((item,idx)=>{
    if(item.color){doc.setFillColor(...item.color);doc.circle(sX+1.8,sY,1.4,'F');sX+=4.2;}
    doc.setTextColor(...C.WHITE);
    const t=item.label+' '+item.value; doc.text(t,sX,sY+1); sX+=doc.getTextWidth(t);
    if(idx<sItems.length-1){doc.setTextColor(...C.LIGHT_PURPLE);doc.text(' | ',sX,sY+1);sX+=doc.getTextWidth(' | ')+1;}
  });

  // Table
  const tX=L.tableX,tW=L.tableWidth;
  let cY=L.firstCategoryTop;
  const nC=6,aC=90,oC=19,sC=11,mA=tW-nC-aC-oC-sC,mC=mA/12,rH=L.rowHeight;
  const cats=['Activities/Programs/Projects','Maintenance Projects','Reports'];

  cats.forEach((catName,ci)=>{
    let cI=allData.filter(a=>a.category===catName); cI=sortAct(cI);
    if(cI.length===0)return;
    if(ci>0)cY+=2;

    doc.setFillColor(...C.DARK_BG_3); doc.roundedRect(tX,cY,tW,L.catHeaderHeight,1.4,1.4,'F');
    doc.setTextColor(...C.WHITE); doc.setFontSize(9); doc.setFont('helvetica','bold');
    doc.text(catName,tX+3.5,cY+3.8);
    doc.setTextColor(...C.LIGHT_PURPLE); doc.setFontSize(7); doc.setFont('helvetica','normal');
    doc.text(cI.length+' items',tX+tW-3.5,cY+3.8,{align:'right'});
    cY+=L.catHeaderHeight+1;

    doc.setFillColor(...C.DARK_BG_4); doc.rect(tX,cY,tW,L.tableHeaderHeight,'F');
    doc.setTextColor(...C.LIGHT_PURPLE); doc.setFontSize(6); doc.setFont('helvetica','bold');
    doc.text('#',tX+1.8,cY+2.6); doc.text('Activity',tX+nC+1,cY+2.6);
    doc.text('Owner',tX+nC+aC+oC/2,cY+2.6,{align:'center'});
    doc.text('Status',tX+nC+aC+oC+sC/2,cY+2.6,{align:'center'});
    months.forEach((m,mi)=>{const mx=tX+nC+aC+oC+sC+mi*mC;doc.text(m,mx+mC/2,cY+2.6,{align:'center'});});
    cY+=L.tableHeaderHeight;

    cI.forEach((item,idx)=>{
      const rcY=cY+rH/2;
      doc.setFillColor(...(idx%2===0?C.ROW_EVEN:C.ROW_ODD)); doc.rect(tX,cY,tW,rH-0.3,'F');

      doc.setTextColor(...C.LIGHT_PURPLE); doc.setFontSize(6); doc.setFont('helvetica','normal');
      doc.text(String(idx+1),tX+1.8,rcY+1);
      doc.setTextColor(...C.WHITE); doc.setFontSize(6);
      let an=item.activity; if(an.length>55)an=an.substring(0,53)+'..';
      doc.text(an,tX+nC+1,rcY+1);

      const oc=getOwnerColor(item.owner),obH=rH-1.2,obY=rcY-obH/2;
      doc.setFillColor(...oc); doc.roundedRect(tX+nC+aC+0.7,obY,oC-1.4,obH,0.7,0.7,'F');
      doc.setTextColor(...C.WHITE); doc.setFontSize(5); doc.setFont('helvetica','bold');
      doc.text(item.owner.substring(0,10),tX+nC+aC+oC/2,rcY+0.8,{align:'center'});

      const scMap={'Scheduled':C.SCHEDULED,'Progressing':C.PROGRESSING,'Completed':C.COMPLETED,'Delayed':C.DELAYED,'On Hold':C.ONHOLD,'Canceled':C.CANCELED,'Completed Early':C.COMPLETED_EARLY};
      doc.setFillColor(...(scMap[item.status]||C.LIGHT_PURPLE));
      doc.circle(tX+nC+aC+oC+sC/2,rcY,1.4,'F');

      const mSt = item.monthStatus || item.month_status || {};
      months.forEach((m,mi)=>{
        const mx=tX+nC+aC+oC+sC+mi*mC,bcx=mx+mC/2;
        if(item.dueDates&&item.dueDates.includes(m)){
          const bxH=rH-1.2,bxW=mC-0.7,bxY=rcY-bxH/2;
          const mStatus = mSt[m] || '';
          if(mStatus === 'Completed' || (!mStatus && (item.status === 'Completed'))){
            doc.setFillColor(...C.COMPLETED); doc.roundedRect(mx+0.35,bxY,bxW,bxH,0.7,0.7,'F');
            drawCheckmark(doc,bcx,rcY,2.5,C.WHITE);
          } else if(mStatus === 'Delayed'){
            doc.setFillColor(...C.DELAYED); doc.roundedRect(mx+0.35,bxY,bxW,bxH,0.7,0.7,'F');
            doc.setTextColor(...C.WHITE); doc.setFontSize(7); doc.setFont('helvetica','bold');
            doc.text('!',bcx,rcY+1,{align:'center'});
          } else if(mStatus === 'Completed Early' || (!mStatus && item.status === 'Completed Early')){
            doc.setFillColor(...C.COMPLETED_EARLY); doc.roundedRect(mx+0.35,bxY,bxW,bxH,0.7,0.7,'F');
            doc.setTextColor(...C.WHITE); doc.setFontSize(5); doc.setFont('helvetica','bold');
            doc.text('★',bcx,rcY+0.8,{align:'center'});
          } else {
            doc.setFillColor(...C.GOLD); doc.roundedRect(mx+0.35,bxY,bxW,bxH,0.7,0.7,'F');
            doc.setTextColor(...C.PRIMARY_PURPLE); doc.setFontSize(7); doc.setFont('helvetica','bold');
            doc.text(m[0],bcx,rcY+1,{align:'center'});
          }
        }
      });
      cY+=rH;
    });
    cY+=1;
  });

  // Footer
  doc.setFillColor(...C.DARK_BG_3); doc.rect(0,pageHeight-7.8,pageWidth,7.8,'F');
  doc.setTextColor(...C.LIGHT_PURPLE); doc.setFontSize(7); doc.setFont('helvetica','normal');
  doc.text('Abdul Latif Jameel Finance | Human Capital Department',7,pageHeight-2.8);
  const ft=selectedMonth?(monthFullNames[selectedMonth]||selectedMonth)+' 2026':'2026';
  doc.text(ft,pageWidth-7,pageHeight-2.8,{align:'right'});

  doc.save('HCD_Annual_Plan_2026_'+fileNameMonth+'.pdf');
}
