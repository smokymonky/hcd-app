import React, { useState, useEffect, useCallback } from 'react';
import hrPlanData from '../data/hrPlanData';
import { activitiesAPI } from '../services/api';
import { exportToPDF } from '../utils/pdfExport';
import { useNavigate } from 'react-router-dom';
import '../styles/dashboard.css';

const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const quarters = { Q1:['Jan','Feb','Mar'], Q2:['Apr','May','Jun'], Q3:['Jul','Aug','Sep'], Q4:['Oct','Nov','Dec'] };
const statusIcons = { Scheduled:'🔶', Progressing:'⏳', Completed:'✅', Delayed:'🔴', 'On Hold':'⏸️', Canceled:'❌', 'Completed Early':'⭐' };
const ownerClassMap = { OP:'op','D&C':'dc','T&A':'ta',OD:'od','Com&Bn':'cb',SBM:'sbm',ALL:'all','T&A/D&C':'ta','OD/D&C':'od','OD/SBM':'od','OD/Com&Bn':'od' };

// Sort order: by function (OP→D&C→T&A→OD→Com&Bn→SBM→ALL) then by earliest due date
const ownerOrder = {OP:0,'D&C':1,'T&A':2,OD:3,'Com&Bn':4,SBM:5,ALL:6};
function getOwnerOrder(o) { const f = o.split('/')[0].trim(); return ownerOrder[f] !== undefined ? ownerOrder[f] : 99; }
function getEarliestMonth(dd) { if (!dd || dd.length === 0) return 99; return Math.min(...dd.map(m => months.indexOf(m)).filter(i => i >= 0)); }
function sortActivities(items) {
  return [...items].sort((a, b) => {
    // First sort by category (Activities → Maintenance → Reports)
    const catOrder = {'Activities/Programs/Projects':0,'Maintenance Projects':1,'Reports':2};
    const catDiff = (catOrder[a.category]||0) - (catOrder[b.category]||0);
    if (catDiff !== 0) return catDiff;
    // Then by owner function order
    const ownerDiff = getOwnerOrder(a.owner) - getOwnerOrder(b.owner);
    if (ownerDiff !== 0) return ownerDiff;
    // Then by earliest due date
    return getEarliestMonth(a.dueDates) - getEarliestMonth(b.dueDates);
  });
}

// Map API fields to frontend fields
function mapActivity(a) {
  return {
    ...a,
    activity: a.name || a.activity || '',
    dueDates: a.due_dates || a.dueDates || [],
    monthStatus: a.month_status || a.monthStatus || {},
  };
}

function getMonthDisplay(item, month) {
  if (!item.dueDates.includes(month)) return null;
  const ms = item.monthStatus?.[month] || '';
  // Check month-level status first
  if (ms === 'Completed') return { icon: '✅', isIcon: true };
  if (ms === 'Delayed') return { icon: '🔴', isIcon: true };
  if (ms === 'Completed Early') return { icon: '⭐', isIcon: true };
  // Then check overall status
  if (item.status === 'Completed Early') return { icon: '⭐', isIcon: true };
  if (item.status === 'Completed') return { icon: '✅', isIcon: true };
  // Default: scheduled (gold box with letter)
  return { letter: month.charAt(0), isIcon: false };
}

const DashboardPage = ({ user, onLogout }) => {
  const [theme, setTheme] = useState(() => localStorage.getItem('hcd-theme') || 'dark');
  const [allData, setAllData] = useState([...hrPlanData]);
  const [filteredData, setFilteredData] = useState([...hrPlanData]);
  const [currentView, setCurrentView] = useState('timeline');
  const [filters, setFilters] = useState({ function:'all', category:'all', status:'all', month:'all' });
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const [activeCard, setActiveCard] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [collapsedCats, setCollapsedCats] = useState({});

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load data from API on mount
  useEffect(() => {
    const loadFromAPI = async () => {
      try {
        const data = await activitiesAPI.getAll();
        let items = [];
        if (data && data.activities) items = data.activities;
        else if (Array.isArray(data)) items = data;
        if (items.length > 0) {
          const mapped = sortActivities(items.map(mapActivity));
          setAllData(mapped);
          setFilteredData(mapped);
          setDataLoaded(true);
        }
      } catch (e) {
        console.log('Using local data - API not available:', e.message);
        setDataLoaded(true);
      }
    };
    loadFromAPI();
  }, []);

  useEffect(() => { document.body.setAttribute('data-theme', theme); localStorage.setItem('hcd-theme', theme); }, [theme]);

  const applyFilters = useCallback(() => {
    let data = allData.filter(item => {
      if (filters.function !== 'all') {
        const owners = item.owner.split('/').map(o => o.trim());
        if (!owners.includes(filters.function)) return false;
      }
      if (filters.category !== 'all' && item.category !== filters.category) return false;
      if (filters.status !== 'all' && item.status !== filters.status) return false;
      if (filters.month !== 'all') {
        if (quarters[filters.month]) {
          if (!item.dueDates.some(d => quarters[filters.month].includes(d))) return false;
        } else {
          if (!item.dueDates.includes(filters.month)) return false;
        }
      }
      if (searchQuery && !item.activity.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
    setFilteredData(data);
  }, [filters, searchQuery, allData]);

  useEffect(() => { applyFilters(); }, [applyFilters]);

  const resetFilters = () => { setFilters({ function:'all', category:'all', status:'all', month:'all' }); setSearchQuery(''); setActiveCard(null); };

  const filterByCard = (type) => {
    const base = { function:'all', category:'all', month:'all' };
    setSearchQuery('');
    if (type === 'total') { setFilters({ ...base, status:'all' }); setActiveCard('total'); }
    else if (type === 'upcoming') {
      setActiveCard('upcoming');
      const cm = months[new Date().getMonth()], nm = months[(new Date().getMonth()+1)%12];
      setFilteredData(allData.filter(i => i.dueDates.includes(cm) || i.dueDates.includes(nm)));
      return;
    } else { setFilters({ ...base, status: type }); setActiveCard(type); }
  };

  // Stats
  const total = filteredData.length;
  const completed = filteredData.filter(i => i.status === 'Completed' || i.status === 'Completed Early').length;
  const progress = filteredData.filter(i => i.status === 'Progressing').length;
  const delayed = filteredData.filter(i => i.status === 'Delayed').length;
  const onhold = filteredData.filter(i => i.status === 'On Hold').length;
  const cm = months[new Date().getMonth()], nm = months[(new Date().getMonth()+1)%12];
  const upcoming = filteredData.filter(i => i.dueDates.includes(cm) || i.dueDates.includes(nm)).length;

  const canExportPDF = user && ['admin','Admin','hr_director','HR Director','esmd','ceo'].includes(user.role);

  // Mobile: format due dates with status icons
  const getMobileDue = (item) => {
    if (!item.dueDates || item.dueDates.length === 0) return <span style={{color:'var(--text-light)',fontSize:11}}>TBD</span>;
    const ms = item.monthStatus || {};
    const short3 = {'January':'Jan','February':'Feb','March':'Mar','April':'Apr','May':'May','June':'Jun','July':'Jul','August':'Aug','September':'Sep','October':'Oct','November':'Nov','December':'Dec'};
    return (
      <div style={{display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:'2px',maxWidth:110}}>
        {item.dueDates.map(m => {
          const s = ms[m] || '';
          let bg = '#F3C036', color = '#371E54', text = short3[m] || m.substring(0,3);
          if (s === 'Completed' || (!s && item.status === 'Completed')) { bg = '#22c55e'; color = '#fff'; text = '✓'; }
          else if (s === 'Delayed') { bg = '#ef4444'; color = '#fff'; text = '!'; }
          else if (s === 'Completed Early' || (!s && item.status === 'Completed Early')) { bg = '#8B5CF6'; color = '#fff'; text = '✓'; }
          return <span key={m} title={m} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',height:18,borderRadius:3,fontSize:8,fontWeight:700,background:bg,color,padding:'0 2px'}}>{text}</span>;
        })}
      </div>
    );
  };

  // Cards view helpers
  const funcDefs = [
    { code:'OP', name:'Operations', cls:'op', icon:'🏢' },
    { code:'D&C', name:'Development & Career', cls:'dc', icon:'📚' },
    { code:'T&A', name:'Talent Acquisition', cls:'ta', icon:'👥' },
    { code:'OD', name:'Organization Design', cls:'od', icon:'🏗️' },
    { code:'Com&Bn', name:'Compensation & Benefits', cls:'cb', icon:'💰' },
    { code:'SBM', name:'Strategy Business Management', cls:'sbm', icon:'📊' }
  ];

  const getStatusColor = (s) => ({
    Scheduled:'var(--status-scheduled)', Progressing:'var(--status-progressing)',
    Completed:'var(--status-completed)', Delayed:'var(--status-delayed)',
    'On Hold':'var(--status-onhold)', Canceled:'var(--status-notcompleted)',
    'Completed Early':'var(--status-completedearly)'
  }[s] || 'var(--text-light)');

  return (
    <div className="dashboard-container">
      {/* ===== HEADER ===== */}
      <header className="header">
        <div className="header-left">
          <div className="header-logo">
            <svg viewBox="0 0 180 50" fill="currentColor">
              <text x="0" y="28" fontFamily="Inter, sans-serif" fontSize="18" fontWeight="600">Abdul Latif Jameel</text>
              <text x="0" y="44" fontFamily="Inter, sans-serif" fontSize="12" fontWeight="500" fill="var(--text-light)">FINANCE</text>
            </svg>
          </div>
          <div className="header-divider" />
          <div className="header-title"><h1>HCD Annual Plan 2026</h1></div>
        </div>
        <div className="header-right">
          {canExportPDF && (
            <button className="btn-theme" onClick={() => navigate('/admin')} style={{fontSize:'13px',width:'auto',padding:'0 16px',gap:'6px',display:'flex',alignItems:'center'}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
              Admin
            </button>
          )}
          <button className="btn-theme" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? '🌙' : '☀️'}
          </button>
          {canExportPDF && (
            <button className="btn-export" onClick={() => exportToPDF(filters.month, allData)}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export PDF
            </button>
          )}
          <div style={{display:'flex',alignItems:'center',gap:'8px',marginLeft:'8px',paddingLeft:'16px',borderLeft:'1px solid var(--border-color)'}}>
            <span style={{color:'var(--text-secondary)',fontSize:'13px',fontWeight:500}}>{user?.name || user?.email || 'User'}</span>
            <button onClick={() => { localStorage.removeItem('hcd_token'); localStorage.removeItem('hcd_user'); localStorage.removeItem('hcd_permissions'); if(onLogout) onLogout(); navigate('/login'); }} style={{padding:'8px 16px',background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:'8px',color:'#ef4444',fontFamily:'Inter,sans-serif',fontSize:'13px',fontWeight:600,cursor:'pointer',transition:'all 0.15s ease'}}>Logout</button>
          </div>
        </div>
      </header>

      {/* ===== FILTERS ===== */}
      {isMobile && (
        <button onClick={() => setCollapsedCats(prev => ({...prev, _filters: !prev._filters}))} style={{width:'100%',padding:'12px',background:'var(--card-bg)',border:'1px solid var(--border)',borderRadius:10,color:'var(--text)',fontSize:14,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:collapsedCats._filters ? 0 : 8}}>
          <span>🔍 Filters</span>
          <span style={{transition:'transform 0.3s',transform:collapsedCats._filters?'rotate(-90deg)':'rotate(0)'}}>▼</span>
        </button>
      )}
      <div className="filters-bar" style={isMobile && collapsedCats._filters ? {display:'none'} : {}}>
        <select className="filter-select" value={filters.function} onChange={e => setFilters(f => ({...f, function: e.target.value}))}>
          <option value="all">All Functions</option>
          <option value="OP">Operations (OP)</option>
          <option value="D&C">Development &amp; Career (D&amp;C)</option>
          <option value="T&A">Talent Acquisition (T&amp;A)</option>
          <option value="OD">Organization Design (OD)</option>
          <option value="Com&Bn">Compensation &amp; Benefits (Com&amp;Bn)</option>
          <option value="SBM">Strategy Business Management (SBM)</option>
          <option value="ALL">Cross-Functional (ALL)</option>
        </select>
        <select className="filter-select" value={filters.category} onChange={e => setFilters(f => ({...f, category: e.target.value}))}>
          <option value="all">All Categories</option>
          <option value="Activities/Programs/Projects">Activities/Programs/Projects</option>
          <option value="Maintenance Projects">Maintenance Projects</option>
          <option value="Reports">Reports</option>
        </select>
        <select className="filter-select" value={filters.status} onChange={e => setFilters(f => ({...f, status: e.target.value}))}>
          <option value="all">All Status</option>
          <option value="Scheduled">Scheduled</option><option value="Progressing">Progressing</option>
          <option value="Completed">Completed</option><option value="Delayed">Delayed</option>
          <option value="On Hold">On Hold</option><option value="Canceled">Canceled</option>
          <option value="Completed Early">Completed Early</option>
        </select>
        <select className="filter-select" value={filters.month} onChange={e => setFilters(f => ({...f, month: e.target.value}))}>
          <option value="all">All Year 2026</option>
          <option value="Q1">Q1 (Jan-Mar)</option><option value="Q2">Q2 (Apr-Jun)</option>
          <option value="Q3">Q3 (Jul-Sep)</option><option value="Q4">Q4 (Oct-Dec)</option>
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <button className="filter-reset" onClick={resetFilters} title="Reset Filters">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
          </svg>
        </button>
      </div>

      {/* ===== SUMMARY CARDS ===== */}
      <div className="summary-cards">
        {[
          { key:'total', cls:'card-total', val:total, label:'Total Activities', icon:<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/> },
          { key:'Completed', cls:'card-completed', val:completed, label:'Completed', icon:<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/> },
          { key:'Progressing', cls:'card-progress', val:progress, label:'In Progress', icon:<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/> },
          { key:'Delayed', cls:'card-delayed', val:delayed, label:'Delayed', icon:<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/> },
          { key:'upcoming', cls:'card-upcoming', val:upcoming, label:'Upcoming (30 days)', icon:<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/> },
          { key:'On Hold', cls:'card-onhold', val:onhold, label:'On Hold', icon:<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"/> },
        ].map(c => (
          <div key={c.key} className={`summary-card ${c.cls} ${activeCard===c.key?'active':''}`} onClick={()=>filterByCard(c.key)}>
            <div className="card-icon"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">{c.icon}</svg></div>
            <div className="card-value">{c.val}</div>
            <div className="card-label">{c.label}</div>
          </div>
        ))}
      </div>

      {/* ===== STATUS LEGEND ===== */}
      <div className="status-legend">
        {Object.entries(statusIcons).map(([s, icon]) => (
          <div key={s} className="legend-item"><span className="legend-icon">{icon}</span><span>{s}</span></div>
        ))}
      </div>

      {/* ===== VIEW SECTION ===== */}
      <div className="view-section">
        <div className="view-header">
          <div className="view-toggle">
            {[{v:'timeline',label:'Timeline',d:'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'},
              {v:'table',label:'Table',d:'M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z'},
              {v:'cards',label:'Cards',d:'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z'}
            ].filter(({v}) => !isMobile || v !== 'table').map(({v,label,d}) => (
              <button key={v} className={`view-btn ${currentView===v?'active':''}`} onClick={()=>setCurrentView(v)}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={d}/></svg>
                {label}
              </button>
            ))}
          </div>
          <div className="search-box">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <input type="text" placeholder="Search activities..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
        </div>

        <div className="view-content">
          {/* TIMELINE VIEW */}
          <div className={`view-panel ${currentView==='timeline'?'active':''}`}>
            <div className="timeline-container">
              {['Activities/Programs/Projects','Maintenance Projects','Reports'].map(cat => {
                const items = filteredData.filter(i => i.category === cat);
                if (!items.length) return null;

                {/* MOBILE: Card-based layout */}
                if (isMobile) {
                  const isCollapsed = collapsedCats[cat];
                  return (
                    <div key={cat} className="category-section">
                      <div className="category-header" onClick={() => setCollapsedCats(prev => ({...prev, [cat]: !prev[cat]}))} style={{cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}><h3>{cat}</h3><span className="category-count">{items.length} items</span></div>
                        <span style={{fontSize:18,color:'var(--text-light)',transition:'transform 0.3s',transform:isCollapsed?'rotate(-90deg)':'rotate(0)'}}> ▼</span>
                      </div>
                      {!isCollapsed && (
                        <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:8}}>
                          {items.map((item, idx) => {
                            const ms = item.monthStatus || {};
                            const short3 = {'January':'Jan','February':'Feb','March':'Mar','April':'Apr','May':'May','June':'Jun','July':'Jul','August':'Aug','September':'Sep','October':'Oct','November':'Nov','December':'Dec'};
                            return (
                              <div key={item.id} style={{background:'var(--card-bg)',border:'1px solid var(--border)',borderRadius:10,padding:'12px 14px'}}>
                                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                                  <div style={{flex:1}}>
                                    <div style={{fontSize:13,fontWeight:600,color:'var(--text)',lineHeight:1.3}}>{idx+1}. {item.activity}</div>
                                    <div style={{display:'flex',alignItems:'center',gap:8,marginTop:6}}>
                                      <span className={`owner-badge owner-${ownerClassMap[item.owner]||'all'}`} style={{fontSize:10,padding:'2px 8px'}}>{item.owner}</span>
                                      <span style={{fontSize:11,color:'var(--text-light)'}}>{item.status}</span>
                                    </div>
                                  </div>
                                  <span className={`status-icon status-${item.status.toLowerCase().replace(/\s+/g,'')}`} style={{fontSize:18}}>{statusIcons[item.status]}</span>
                                </div>
                                {item.dueDates && item.dueDates.length > 0 && (
                                  <div style={{display:'flex',flexWrap:'wrap',gap:3,marginTop:8}}>
                                    {item.dueDates.map(m => {
                                      const s = ms[m] || '';
                                      let bg = '#F3C036', clr = '#371E54', text = short3[m] || m.substring(0,3);
                                      if (s === 'Completed' || (!s && item.status === 'Completed')) { bg = '#22c55e'; clr = '#fff'; text = '✓ ' + (short3[m]||m.substring(0,3)); }
                                      else if (s === 'Delayed') { bg = '#ef4444'; clr = '#fff'; text = '! ' + (short3[m]||m.substring(0,3)); }
                                      else if (s === 'Completed Early' || (!s && item.status === 'Completed Early')) { bg = '#8B5CF6'; clr = '#fff'; text = '✓ ' + (short3[m]||m.substring(0,3)); }
                                      return <span key={m} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',height:22,borderRadius:5,fontSize:10,fontWeight:600,background:bg,color:clr,padding:'0 8px'}}>{text}</span>;
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                {/* DESKTOP: Original table layout */}
                return (
                  <div key={cat} className="category-section">
                    <div className="category-header"><h3>{cat}</h3><span className="category-count">{items.length} items</span></div>
                    <table className="timeline-table">
                      <thead><tr>
                        <th style={{width:30}}>#</th><th>Activity</th>
                        <th style={{width:60}}>Owner</th>
                        <th style={{width:60}}>Status</th>
                        {months.map(m=><th key={m} className="month-col">{m}</th>)}
                      </tr></thead>
                      <tbody>
                        {items.map((item, idx) => (
                          <tr key={item.id}>
                            <td>{idx+1}</td>
                            <td className="activity-name">{item.activity}</td>
                            <td className="owner-cell"><span className={`owner-badge owner-${ownerClassMap[item.owner]||'all'}`}>{item.owner}</span></td>
                            <td className="status-cell"><span className={`status-icon status-${item.status.toLowerCase().replace(/\s+/g,'')}`} title={item.status}>{statusIcons[item.status]}</span></td>
                            {months.map(m => {
                              const d = getMonthDisplay(item, m);
                              if (!d) return <td key={m} className="month-cell"></td>;
                              if (d.isIcon) return <td key={m} className="month-cell"><span className="month-status-icon">{d.icon}</span></td>;
                              return <td key={m} className="month-cell"><span className="month-marker scheduled">{d.letter}</span></td>;
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
              {filteredData.length === 0 && <div className="empty-state"><p>No activities found matching your filters.</p></div>}
            </div>
          </div>

          {/* TABLE VIEW */}
          <div className={`view-panel ${currentView==='table'?'active':''}`}>
            <div className="table-view-container">
              <table className="data-table">
                <thead><tr>
                  <th>#</th><th>Activity</th><th>Owner</th><th>Category</th><th>Status</th><th>Due Dates</th>
                </tr></thead>
                <tbody>
                  {filteredData.map((item, idx) => (
                    <tr key={item.id}>
                      <td>{idx+1}</td>
                      <td className="activity-name">{item.activity}</td>
                      <td><span className={`owner-badge owner-${ownerClassMap[item.owner]||'all'}`}>{item.owner}</span></td>
                      <td>{item.category}</td>
                      <td><span className={`status-icon status-${item.status.toLowerCase().replace(' ','')}`}>{statusIcons[item.status]}</span> {item.status}</td>
                      <td><div className="due-dates">{item.dueDates.length>0?item.dueDates.map(d=><span key={d} className="due-date-tag">{d}</span>):<span className="due-date-tag">TBD</span>}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* CARDS VIEW */}
          <div className={`view-panel ${currentView==='cards'?'active':''}`}>
            <div className="cards-grid">
              {funcDefs.map(func => {
                const fItems = filteredData.filter(i => i.owner.split('/').map(o=>o.trim()).includes(func.code))
                  .sort((a,b) => { const ai=a.dueDates.length>0?months.indexOf(a.dueDates[0]):99; const bi=b.dueDates.length>0?months.indexOf(b.dueDates[0]):99; return ai-bi; });
                const t=fItems.length, c=fItems.filter(i=>i.status==='Completed'||i.status==='Completed Early').length;
                const dl=fItems.filter(i=>i.status==='Delayed').length, pp=t>0?Math.round((c/t)*100):0;
                return (
                  <div key={func.code} className={`function-card function-${func.cls}`}>
                    <div className="function-card-header"><h3>{func.icon} {func.name}</h3><p>{func.code}</p></div>
                    <div className="function-stats">
                      <div className="function-stat"><div className="function-stat-value">{t}</div><div className="function-stat-label">Total</div></div>
                      <div className="function-stat"><div className="function-stat-value stat-done">{c}</div><div className="function-stat-label">Done</div></div>
                      <div className="function-stat"><div className="function-stat-value stat-delayed">{dl}</div><div className="function-stat-label">Delayed</div></div>
                    </div>
                    <div className="function-progress">
                      <div className="function-progress-bar"><div className="function-progress-fill" style={{width:`${pp}%`}}/></div>
                      <div className="function-progress-text"><span>Progress</span><span><strong>{pp}%</strong> Complete</span></div>
                    </div>
                    <div className="function-items">
                      {fItems.length>0 ? fItems.slice(0,6).map(item => (
                        <div key={item.id} className="function-item">
                          <div className="function-item-status" style={{background:getStatusColor(item.status),'--item-status-color':getStatusColor(item.status)}}/>
                          <div className="function-item-name" title={item.activity}>{item.activity}</div>
                          <div className={`function-item-date ${item.dueDates.length===0?'tbd':''}`}>{item.dueDates.length>0?item.dueDates[0]:'TBD'}</div>
                        </div>
                      )) : <div className="function-empty"><div className="function-empty-icon">📭</div><p>No activities match your filters</p></div>}
                      {fItems.length>6 && <div className="function-more">+{fItems.length-6} more activities</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
