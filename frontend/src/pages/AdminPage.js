import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { activitiesAPI, usersAPI } from '../services/api';
import hrPlanData from '../data/hrPlanData';
import '../styles/dashboard.css';

const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const statusOptions = ['Scheduled','Progressing','Completed','Delayed','On Hold','Canceled','Completed Early'];
const categoryOptions = ['Activities/Programs/Projects','Maintenance Projects','Reports'];
const ownerOptions = ['OP','D&C','T&A','OD','Com&Bn','SBM','ALL','T&A/D&C','OD/D&C','OD/SBM','OD/Com&Bn'];
const roleOptions = ['admin','viewer','hr_director','function_head','employee','esmd','ceo'];

// Sort: by category, then owner (OP→D&C→T&A→OD→Com&Bn→SBM→ALL), then earliest due date
const ownerOrder = {OP:0,'D&C':1,'T&A':2,OD:3,'Com&Bn':4,SBM:5,ALL:6};
function getOwnerOrder(o) { const f = o.split('/')[0].trim(); return ownerOrder[f] !== undefined ? ownerOrder[f] : 99; }
function getEarliestMonth(dd) { if (!dd || dd.length === 0) return 99; return Math.min(...dd.map(m => months.indexOf(m)).filter(i => i >= 0)); }
function sortActivities(items) {
  return [...items].sort((a, b) => {
    const catOrder = {'Activities/Programs/Projects':0,'Maintenance Projects':1,'Reports':2};
    const catDiff = (catOrder[a.category]||0) - (catOrder[b.category]||0);
    if (catDiff !== 0) return catDiff;
    const ownerDiff = getOwnerOrder(a.owner) - getOwnerOrder(b.owner);
    if (ownerDiff !== 0) return ownerDiff;
    return getEarliestMonth(a.dueDates) - getEarliestMonth(b.dueDates);
  });
}

const AdminPage = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('activities');
  const [activities, setActivities] = useState([...hrPlanData]);
  const [users, setUsers] = useState([]);
  const [editItem, setEditItem] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState('');
  const [message, setMessage] = useState({ text: '', type: '' });
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // Set theme on mount
  useEffect(() => {
    const theme = localStorage.getItem('hcd-theme') || 'dark';
    document.body.setAttribute('data-theme', theme);
  }, []);
  // Filters
  const [adminSearch, setAdminSearch] = useState('');
  const [adminFilterFunc, setAdminFilterFunc] = useState('all');
  const [adminFilterCat, setAdminFilterCat] = useState('all');
  const [adminFilterStatus, setAdminFilterStatus] = useState('all');

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Try to load from API, fallback to local data
  useEffect(() => {
    loadActivities();
    if (activeTab === 'users') loadUsers();
  }, [activeTab]);

  // Map API fields to frontend fields
  const mapActivity = (a) => ({
    ...a,
    activity: a.name || a.activity || '',
    dueDates: a.due_dates || a.dueDates || [],
    monthStatus: a.month_status || a.monthStatus || {},
  });

  const loadActivities = async () => {
    try {
      const data = await activitiesAPI.getAll();
      let items = [];
      if (data && data.activities) items = data.activities;
      else if (Array.isArray(data)) items = data;
      if (items.length > 0) setActivities(sortActivities(items.map(mapActivity)));
    } catch (e) {
      console.log('Using local data - API not available:', e.message);
    }
  };

  const loadUsers = async () => {
    try {
      const data = await usersAPI.getAll();
      if (data && data.users) setUsers(data.users);
      else if (Array.isArray(data)) setUsers(data);
    } catch (e) {
      console.log('Could not load users:', e.message);
    }
  };

  const showMessage = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 4000);
  };

  // Activity CRUD
  const handleCreateActivity = () => {
    setEditItem({
      activity: '', owner: 'OP', category: 'Activities/Programs/Projects',
      subcategory: '', status: 'Scheduled', dueDates: [], monthStatus: {}, description: '', notes: ''
    });
    setFormType('create-activity');
    setShowForm(true);
  };

  const handleEditActivity = (item) => {
    setEditItem({ ...item });
    setFormType('edit-activity');
    setShowForm(true);
  };

  const handleSaveActivity = async () => {
    if (!editItem.activity.trim()) { showMessage('Activity name is required', 'error'); return; }
    setLoading(true);
    // Map frontend fields back to API fields
    const apiData = {
      name: editItem.activity,
      owner: editItem.owner,
      category: editItem.category,
      status: editItem.status,
      due_dates: editItem.dueDates,
      month_status: editItem.monthStatus || {},
      description: editItem.description || '',
      notes: editItem.notes || '',
    };
    try {
      if (formType === 'create-activity') {
        await activitiesAPI.create(apiData);
        showMessage('Activity created successfully!');
      } else {
        await activitiesAPI.update(editItem.id, apiData);
        showMessage('Activity updated successfully!');
      }
      await loadActivities();
      setShowForm(false);
      setEditItem(null);
    } catch (e) {
      showMessage('Error: ' + e.message, 'error');
    }
    setLoading(false);
  };

  const handleDeleteActivity = async (id) => {
    if (!window.confirm('Are you sure you want to delete this activity?')) return;
    try {
      await activitiesAPI.delete(id);
      showMessage('Activity deleted successfully!');
      await loadActivities();
    } catch (e) {
      showMessage('Error: ' + e.message, 'error');
    }
  };

  const handleStatusChange = async (item, newStatus) => {
    // Update local state immediately
    setActivities(prev => prev.map(a => a.id === item.id ? { ...a, status: newStatus } : a));
    showMessage(`Status changed to ${newStatus}`);
    try {
      await activitiesAPI.updateStatus(item.id, newStatus, item.monthStatus || item.month_status || {});
    } catch (e) {
      console.log('API update failed:', e.message);
    }
  };

  const handleMonthToggle = async (item, month) => {
    const ms = { ...(item.monthStatus || item.month_status || {}) };
    const current = ms[month] || '';
    // Cycle: (empty/Scheduled) → Completed → Delayed → Completed Early → (empty)
    let newStatus;
    if (!current || current === 'Scheduled') {
      ms[month] = 'Completed';
      newStatus = 'Completed';
    } else if (current === 'Completed') {
      ms[month] = 'Delayed';
      newStatus = 'Delayed';
    } else if (current === 'Delayed') {
      ms[month] = 'Completed Early';
      newStatus = 'Completed Early';
    } else {
      delete ms[month];
      newStatus = 'Scheduled';
    }
    // Update local state immediately so UI reflects change
    setActivities(prev => prev.map(a => a.id === item.id ? { ...a, monthStatus: { ...ms }, month_status: { ...ms } } : a));
    showMessage(`${month} → ${newStatus}`);
    try {
      await activitiesAPI.updateStatus(item.id, item.status, ms);
    } catch (e) {
      console.log('API update failed:', e.message);
    }
  };

  // User CRUD
  const handleCreateUser = () => {
    setEditItem({ name: '', email: '', password: '', role: 'viewer', function_name: 'OP' });
    setFormType('create-user');
    setShowForm(true);
  };

  const handleEditUser = (u) => {
    setEditItem({ ...u, password: '' });
    setFormType('edit-user');
    setShowForm(true);
  };

  const handleSaveUser = async () => {
    if (!editItem.name?.trim() || !editItem.email?.trim()) { showMessage('Name and email are required', 'error'); return; }
    if (formType === 'create-user' && !editItem.password?.trim()) { showMessage('Password is required', 'error'); return; }
    setLoading(true);
    try {
      if (formType === 'create-user') {
        await usersAPI.create(editItem);
        showMessage('User created successfully!');
      } else {
        const data = { ...editItem };
        if (!data.password) delete data.password;
        await usersAPI.update(editItem.id, data);
        showMessage('User updated successfully!');
      }
      await loadUsers();
      setShowForm(false);
      setEditItem(null);
    } catch (e) {
      showMessage('Error: ' + e.message, 'error');
    }
    setLoading(false);
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      await usersAPI.delete(id);
      showMessage('User deleted successfully!');
      await loadUsers();
    } catch (e) {
      showMessage('Error: ' + e.message, 'error');
    }
  };

  const closeForm = () => { setShowForm(false); setEditItem(null); };

  // Due dates toggle
  const toggleDueDate = (month) => {
    if (!editItem) return;
    const dd = [...(editItem.dueDates || [])];
    const idx = dd.indexOf(month);
    if (idx >= 0) dd.splice(idx, 1); else dd.push(month);
    setEditItem({ ...editItem, dueDates: dd });
  };

  return (
    <div className="dashboard-container">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="header-logo">
            <svg viewBox="0 0 180 50" fill="currentColor">
              <text x="0" y="28" fontFamily="Inter, sans-serif" fontSize="18" fontWeight="600">Abdul Latif Jameel</text>
              <text x="0" y="44" fontFamily="Inter, sans-serif" fontSize="12" fontWeight="500" fill="var(--text-light)">FINANCE</text>
            </svg>
          </div>
          <div className="header-divider" />
          <div className="header-title"><h1>Admin Panel</h1></div>
        </div>
        <div className="header-right">
          <button className="btn-theme" onClick={() => navigate('/dashboard')} style={{fontSize:'14px',width:'auto',padding:'0 16px',gap:'8px',display:'flex',alignItems:'center'}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 19l-7-7 7-7"/></svg>
            Dashboard
          </button>
          <div style={{display:'flex',alignItems:'center',gap:'8px',paddingLeft:'16px',borderLeft:'1px solid var(--border-color)'}}>
            <span style={{color:'var(--text-secondary)',fontSize:'13px',fontWeight:500}}>{user?.name || 'Admin'}</span>
            <button onClick={() => { if(onLogout) onLogout(); navigate('/login'); }} style={S.logoutBtn}>Logout</button>
          </div>
        </div>
      </header>

      {/* Message */}
      {message.text && (
        <div style={{...S.message, background: message.type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', borderColor: message.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)', color: message.type === 'error' ? '#ef4444' : '#22c55e'}}>
          {message.type === 'error' ? '⚠️' : '✅'} {message.text}
        </div>
      )}

      {/* Tabs */}
      <div style={S.tabs}>
        <button style={{...S.tab, ...(activeTab==='activities'?S.tabActive:{})}} onClick={()=>setActiveTab('activities')}>📋 Activities ({activities.length})</button>
        <button style={{...S.tab, ...(activeTab==='users'?S.tabActive:{})}} onClick={()=>setActiveTab('users')}>👥 Users</button>
      </div>

      {/* Activities Tab */}
      {activeTab === 'activities' && (
        <div className="view-section">
          <div className="view-header" style={{justifyContent:'space-between'}}>
            <h3 style={{color:'var(--text-primary)',fontSize:'16px'}}>Manage Activities</h3>
            <button className="btn-export" onClick={handleCreateActivity}>+ New Activity</button>
          </div>
          {/* Admin Filters */}
          <div style={{display:'flex',gap:'8px',padding:'12px 16px',flexWrap:'wrap',alignItems:'center'}}>
            <input type="text" placeholder="🔍 Search activities..." value={adminSearch} onChange={e=>setAdminSearch(e.target.value)}
              style={{...S.adminFilter, flex:'1', minWidth:'180px'}} />
            <select value={adminFilterFunc} onChange={e=>setAdminFilterFunc(e.target.value)} style={S.adminFilter}>
              <option value="all">All Functions</option>
              {['OP','D&C','T&A','OD','Com&Bn','SBM','ALL'].map(f=><option key={f} value={f}>{f}</option>)}
            </select>
            <select value={adminFilterCat} onChange={e=>setAdminFilterCat(e.target.value)} style={S.adminFilter}>
              <option value="all">All Categories</option>
              {categoryOptions.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            <select value={adminFilterStatus} onChange={e=>setAdminFilterStatus(e.target.value)} style={S.adminFilter}>
              <option value="all">All Status</option>
              {statusOptions.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
            {(adminSearch||adminFilterFunc!=='all'||adminFilterCat!=='all'||adminFilterStatus!=='all') && (
              <button onClick={()=>{setAdminSearch('');setAdminFilterFunc('all');setAdminFilterCat('all');setAdminFilterStatus('all');}}
                style={{...S.adminFilter, background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', color:'#ef4444', cursor:'pointer', fontWeight:600}}>✕ Reset</button>
            )}
          </div>
          <div style={{padding:'16px',overflowX:isMobile?'hidden':'auto'}}>
            {(() => {
              const filtered = activities.filter(item => {
                if (adminSearch && !item.activity.toLowerCase().includes(adminSearch.toLowerCase())) return false;
                if (adminFilterFunc !== 'all' && !item.owner.split('/').map(o=>o.trim()).includes(adminFilterFunc)) return false;
                if (adminFilterCat !== 'all' && item.category !== adminFilterCat) return false;
                if (adminFilterStatus !== 'all' && item.status !== adminFilterStatus) return false;
                return true;
              });

              if (isMobile) {
                return (
                  <div style={{display:'flex',flexDirection:'column',gap:10}}>
                    {filtered.map((item, idx) => (
                      <div key={item.id} style={{background:'var(--card-bg)',border:'1px solid var(--border)',borderRadius:10,padding:'14px'}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                          <div style={{flex:1}}>
                            <div style={{fontSize:13,fontWeight:600,color:'var(--text)',lineHeight:1.3,marginBottom:6}}>{idx+1}. {item.activity}</div>
                            <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                              <span className={`owner-badge owner-${getOwnerClass(item.owner)}`} style={{fontSize:10,padding:'2px 8px'}}>{item.owner}</span>
                              <span style={{fontSize:11,color:'var(--text-light)'}}>{item.category.replace('Activities/Programs/Projects','Activities')}</span>
                            </div>
                          </div>
                          <div style={{display:'flex',gap:4}}>
                            <button onClick={() => handleEditActivity(item)} style={S.editBtn} title="Edit">✏️</button>
                            <button onClick={() => handleDeleteActivity(item.id)} style={S.deleteBtn} title="Delete">🗑️</button>
                          </div>
                        </div>
                        <div style={{marginTop:8,display:'flex',alignItems:'center',gap:8}}>
                          <span style={{fontSize:11,color:'var(--text-light)'}}>Status:</span>
                          <select value={item.status} onChange={e => handleStatusChange(item, e.target.value)}
                            style={{...S.statusSelect,fontSize:12,padding:'4px 8px'}}>
                            {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        {item.dueDates && item.dueDates.length > 0 && (
                          <div style={{marginTop:8}}>
                            <span style={{fontSize:11,color:'var(--text-light)',marginBottom:4,display:'block'}}>Due Dates (tap to cycle status):</span>
                            <div style={{display:'flex',flexWrap:'wrap',gap:3}}>
                              {months.map(m => {
                                const isDue = item.dueDates?.includes(m);
                                if (!isDue) return null;
                                const mStatus = item.monthStatus?.[m] || '';
                                const colors = {
                                  'Completed': { bg:'#22c55e', color:'#fff', icon:'✓' },
                                  'Delayed': { bg:'#ef4444', color:'#fff', icon:'!' },
                                  'Completed Early': { bg:'#a855f7', color:'#fff', icon:'★' },
                                };
                                const c = colors[mStatus];
                                return (
                                  <span key={m} onClick={() => handleMonthToggle(item, m)}
                                    style={{display:'inline-flex',alignItems:'center',justifyContent:'center',height:24,borderRadius:5,fontSize:10,fontWeight:700,background:c?c.bg:'#F3C036',color:c?c.color:'#371E54',padding:'0 8px',cursor:'pointer'}}>
                                    {c ? `${c.icon} ${m.substring(0,3)}` : m.substring(0,3)}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              }

              return (
                <table className="data-table">
                  <thead><tr>
                    <th>#</th><th>Activity</th><th>Owner</th><th>Category</th><th>Status</th><th>Due Dates</th><th>Actions</th>
                  </tr></thead>
                  <tbody>
                    {filtered.map((item, idx) => (
                      <tr key={item.id}>
                        <td>{idx + 1}</td>
                        <td className="activity-name">{item.activity}</td>
                        <td><span className={`owner-badge owner-${getOwnerClass(item.owner)}`}>{item.owner}</span></td>
                        <td style={{fontSize:'12px'}}>{item.category}</td>
                        <td>
                          <select value={item.status} onChange={e => handleStatusChange(item, e.target.value)}
                            style={S.statusSelect}>
                            {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td>
                          <div style={{display:'flex',flexWrap:'wrap',gap:'2px'}}>
                            {months.map(m => {
                              const isDue = item.dueDates?.includes(m);
                              const mStatus = item.monthStatus?.[m] || '';
                              if (!isDue) return <span key={m} style={S.monthDot}></span>;
                              const colors = {
                                'Completed': { bg:'#22c55e', color:'#fff', icon:'✓', next:'Delayed' },
                                'Delayed': { bg:'#ef4444', color:'#fff', icon:'!', next:'Completed Early' },
                                'Completed Early': { bg:'#a855f7', color:'#fff', icon:'★', next:'Scheduled (reset)' },
                              };
                              const c = colors[mStatus];
                              return (
                                <span key={m} onClick={() => handleMonthToggle(item, m)}
                                  style={{...S.monthTag, background: c ? c.bg : '#F3C036', color: c ? c.color : '#371E54', cursor:'pointer'}}
                                  title={`${m}: ${mStatus || 'Scheduled'} → Click for ${c ? c.next : 'Completed'}`}>
                                  {c ? c.icon : m.charAt(0)}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        <td>
                          <div style={{display:'flex',gap:'4px'}}>
                            <button onClick={() => handleEditActivity(item)} style={S.editBtn} title="Edit">✏️</button>
                            <button onClick={() => handleDeleteActivity(item.id)} style={S.deleteBtn} title="Delete">🗑️</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}
          </div>
        </div>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="view-section">
          <div className="view-header" style={{justifyContent:'space-between'}}>
            <h3 style={{color:'var(--text-primary)',fontSize:'16px'}}>Manage Users</h3>
            <button className="btn-export" onClick={handleCreateUser}>+ New User</button>
          </div>
          <div style={{padding:'16px',overflowX:isMobile?'hidden':'auto'}}>
            {isMobile ? (
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {users.length > 0 ? users.map((u, idx) => (
                  <div key={u.id} style={{background:'var(--card-bg)',border:'1px solid var(--border)',borderRadius:10,padding:'14px'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                      <div>
                        <div style={{fontSize:14,fontWeight:600,color:'var(--text)'}}>{u.name}</div>
                        <div style={{fontSize:12,color:'var(--text-light)',marginTop:2}}>{u.email}</div>
                      </div>
                      <div style={{display:'flex',gap:4}}>
                        <button onClick={() => handleEditUser(u)} style={S.editBtn} title="Edit">✏️</button>
                        <button onClick={() => handleDeleteUser(u.id)} style={S.deleteBtn} title="Delete">🗑️</button>
                      </div>
                    </div>
                    <div style={{display:'flex',gap:8,marginTop:8}}>
                      <span style={{...S.roleBadge, background: u.role === 'admin' ? 'rgba(243,192,54,0.2)' : 'rgba(168,136,190,0.2)', color: u.role === 'admin' ? '#F3C036' : '#A888BE'}}>{u.role}</span>
                      <span style={{fontSize:11,color:'var(--text-light)'}}>{u.function_name || u.function || '-'}</span>
                    </div>
                  </div>
                )) : <div style={{textAlign:'center',padding:'40px',color:'var(--text-light)'}}>Loading users or no users found...</div>}
              </div>
            ) : (
            <table className="data-table">
              <thead><tr>
                <th>#</th><th>Name</th><th>Email</th><th>Role</th><th>Function</th><th>Actions</th>
              </tr></thead>
              <tbody>
                {users.length > 0 ? users.map((u, idx) => (
                  <tr key={u.id}>
                    <td>{idx + 1}</td>
                    <td style={{fontWeight:500}}>{u.name}</td>
                    <td>{u.email}</td>
                    <td><span style={{...S.roleBadge, background: u.role === 'admin' ? 'rgba(243,192,54,0.2)' : 'rgba(168,136,190,0.2)', color: u.role === 'admin' ? '#F3C036' : '#A888BE'}}>{u.role}</span></td>
                    <td>{u.function_name || u.function || '-'}</td>
                    <td>
                      <div style={{display:'flex',gap:'4px'}}>
                        <button onClick={() => handleEditUser(u)} style={S.editBtn} title="Edit">✏️</button>
                        <button onClick={() => handleDeleteUser(u.id)} style={S.deleteBtn} title="Delete">🗑️</button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan="6" style={{textAlign:'center',padding:'40px',color:'var(--text-light)'}}>Loading users or no users found...</td></tr>
                )}
              </tbody>
            </table>
            )}
          </div>
        </div>
      )}

      {/* Modal Form */}
      {showForm && editItem && (
        <div style={S.overlay} onClick={closeForm}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={S.modalHeader}>
              <h2 style={{color:'#fff',fontSize:'18px',margin:0}}>
                {formType === 'create-activity' ? '➕ New Activity' :
                 formType === 'edit-activity' ? '✏️ Edit Activity' :
                 formType === 'create-user' ? '➕ New User' : '✏️ Edit User'}
              </h2>
              <button onClick={closeForm} style={S.closeBtn}>✕</button>
            </div>
            <div style={S.modalBody}>
              {(formType === 'create-activity' || formType === 'edit-activity') && (
                <>
                  <div style={S.field}>
                    <label style={S.fieldLabel}>Activity Name *</label>
                    <input style={S.fieldInput} value={editItem.activity || ''} onChange={e => setEditItem({...editItem, activity: e.target.value})} placeholder="Enter activity name" />
                  </div>
                  <div style={S.fieldRow}>
                    <div style={S.field}>
                      <label style={S.fieldLabel}>Owner *</label>
                      <select style={S.fieldInput} value={editItem.owner || 'OP'} onChange={e => setEditItem({...editItem, owner: e.target.value})}>
                        {ownerOptions.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div style={S.field}>
                      <label style={S.fieldLabel}>Category *</label>
                      <select style={S.fieldInput} value={editItem.category || ''} onChange={e => setEditItem({...editItem, category: e.target.value})}>
                        {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={S.field}>
                    <label style={S.fieldLabel}>Status</label>
                    <select style={S.fieldInput} value={editItem.status || 'Scheduled'} onChange={e => setEditItem({...editItem, status: e.target.value})}>
                      {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div style={S.field}>
                    <label style={S.fieldLabel}>Due Dates (click months)</label>
                    <div style={{display:'flex',flexWrap:'wrap',gap:'6px'}}>
                      {months.map(m => (
                        <button key={m} onClick={() => toggleDueDate(m)}
                          style={{...S.monthPicker, background: editItem.dueDates?.includes(m) ? '#F3C036' : 'rgba(255,255,255,0.05)', color: editItem.dueDates?.includes(m) ? '#371E54' : 'var(--text-secondary)'}}>
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={S.field}>
                    <label style={S.fieldLabel}>Description</label>
                    <textarea style={{...S.fieldInput,minHeight:'80px',resize:'vertical'}} value={editItem.description || ''} onChange={e => setEditItem({...editItem, description: e.target.value})} placeholder="Optional description" />
                  </div>
                </>
              )}

              {(formType === 'create-user' || formType === 'edit-user') && (
                <>
                  <div style={S.field}>
                    <label style={S.fieldLabel}>Full Name *</label>
                    <input style={S.fieldInput} value={editItem.name || ''} onChange={e => setEditItem({...editItem, name: e.target.value})} placeholder="e.g. Ahmed Al-Rashid" />
                  </div>
                  <div style={S.field}>
                    <label style={S.fieldLabel}>Email *</label>
                    <input style={S.fieldInput} type="email" value={editItem.email || ''} onChange={e => setEditItem({...editItem, email: e.target.value})} placeholder="e.g. ahmed@aljfinance.com" />
                  </div>
                  <div style={S.field}>
                    <label style={S.fieldLabel}>{formType === 'create-user' ? 'Password *' : 'Password (leave blank to keep current)'}</label>
                    <input style={S.fieldInput} type="password" value={editItem.password || ''} onChange={e => setEditItem({...editItem, password: e.target.value})} placeholder="••••••••" />
                  </div>
                  <div style={S.fieldRow}>
                    <div style={S.field}>
                      <label style={S.fieldLabel}>Role *</label>
                      <select style={S.fieldInput} value={editItem.role || 'viewer'} onChange={e => setEditItem({...editItem, role: e.target.value})}>
                        {roleOptions.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div style={S.field}>
                      <label style={S.fieldLabel}>Function</label>
                      <select style={S.fieldInput} value={editItem.function_name || editItem.function || 'OP'} onChange={e => setEditItem({...editItem, function_name: e.target.value})}>
                        {['OP','D&C','T&A','OD','Com&Bn','SBM','ALL'].map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div style={S.modalFooter}>
              <button onClick={closeForm} style={S.cancelBtn}>Cancel</button>
              <button onClick={formType.includes('activity') ? handleSaveActivity : handleSaveUser} disabled={loading}
                style={{...S.saveBtn, opacity: loading ? 0.7 : 1}}>
                {loading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function getOwnerClass(owner) {
  const map = {OP:'op','D&C':'dc','T&A':'ta',OD:'od','Com&Bn':'cb',SBM:'sbm',ALL:'all','T&A/D&C':'ta','OD/D&C':'od','OD/SBM':'od','OD/Com&Bn':'od'};
  return map[owner] || 'all';
}

// Styles
const S = {
  tabs: { display:'flex', gap:'4px', marginBottom:'24px', background:'var(--bg-card)', padding:'4px', borderRadius:'12px', border:'1px solid var(--border-color)', width:'fit-content' },
  tab: { padding:'10px 24px', background:'transparent', border:'none', borderRadius:'8px', fontFamily:'Inter,sans-serif', fontSize:'14px', fontWeight:600, color:'var(--text-secondary)', cursor:'pointer', transition:'all 0.15s ease', display:'flex', alignItems:'center', gap:'8px' },
  tabActive: { background:'linear-gradient(135deg, #ec4899 0%, #a855f7 100%)', color:'#fff' },
  message: { padding:'12px 20px', borderRadius:'12px', border:'1px solid', marginBottom:'16px', fontSize:'14px', fontWeight:500, display:'flex', alignItems:'center', gap:'8px' },
  logoutBtn: { padding:'8px 16px', background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:'8px', color:'#ef4444', fontFamily:'Inter,sans-serif', fontSize:'13px', fontWeight:600, cursor:'pointer' },
  statusSelect: { padding:'6px 8px', background:'#2d1f42', border:'1px solid var(--border-color)', borderRadius:'6px', color:'#ffffff', fontFamily:'Inter,sans-serif', fontSize:'12px', cursor:'pointer' },
  monthTag: { display:'inline-flex', alignItems:'center', justifyContent:'center', width:'22px', height:'22px', borderRadius:'4px', fontSize:'10px', fontWeight:700 },
  monthDot: { display:'inline-block', width:'22px', height:'22px' },
  editBtn: { padding:'4px 8px', background:'rgba(59,130,246,0.1)', border:'1px solid rgba(59,130,246,0.3)', borderRadius:'6px', cursor:'pointer', fontSize:'14px' },
  deleteBtn: { padding:'4px 8px', background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:'6px', cursor:'pointer', fontSize:'14px' },
  roleBadge: { padding:'4px 12px', borderRadius:'20px', fontSize:'12px', fontWeight:600, textTransform:'uppercase' },
  overlay: { position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'20px' },
  modal: { width:'100%', maxWidth:'560px', maxHeight:'90vh', background:'var(--bg-solid)', borderRadius:'16px', border:'1px solid var(--border-color)', overflow:'hidden', display:'flex', flexDirection:'column' },
  modalHeader: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'20px 24px', borderBottom:'1px solid var(--border-color)', background:'linear-gradient(135deg, #371E54 0%, #4a2970 100%)' },
  closeBtn: { width:'32px', height:'32px', display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(255,255,255,0.1)', border:'none', borderRadius:'8px', color:'#fff', fontSize:'16px', cursor:'pointer' },
  modalBody: { padding:'24px', overflowY:'auto', display:'flex', flexDirection:'column', gap:'16px' },
  modalFooter: { display:'flex', justifyContent:'flex-end', gap:'12px', padding:'16px 24px', borderTop:'1px solid var(--border-color)' },
  field: { display:'flex', flexDirection:'column', gap:'6px', flex:1 },
  fieldRow: { display:'flex', gap:'16px' },
  fieldLabel: { color:'var(--text-secondary)', fontSize:'13px', fontWeight:600 },
  fieldInput: { width:'100%', padding:'12px 16px', background:'#2d1f42', border:'1px solid var(--border-color)', borderRadius:'10px', fontFamily:'Inter,sans-serif', fontSize:'14px', color:'#ffffff', outline:'none', boxSizing:'border-box' },
  monthPicker: { padding:'6px 12px', borderRadius:'8px', border:'1px solid var(--border-color)', fontFamily:'Inter,sans-serif', fontSize:'12px', fontWeight:600, cursor:'pointer', transition:'all 0.15s ease' },
  cancelBtn: { padding:'10px 24px', background:'var(--bg-input)', border:'1px solid var(--border-color)', borderRadius:'8px', fontFamily:'Inter,sans-serif', fontSize:'14px', fontWeight:600, color:'var(--text-secondary)', cursor:'pointer' },
  saveBtn: { padding:'10px 24px', background:'linear-gradient(135deg, #ec4899 0%, #a855f7 100%)', border:'none', borderRadius:'8px', fontFamily:'Inter,sans-serif', fontSize:'14px', fontWeight:600, color:'#fff', cursor:'pointer', boxShadow:'0 4px 20px rgba(236,72,153,0.3)' },
  adminFilter: { padding:'8px 12px', background:'#2d1f42', border:'1px solid var(--border-color)', borderRadius:'8px', fontFamily:'Inter,sans-serif', fontSize:'13px', color:'#ffffff', outline:'none' },
};

export default AdminPage;
