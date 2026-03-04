'use client';

import { useState, useEffect, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';

// ═══════════════════════════════════════════════════════════════
// MURAL HEALTH PRICING ENGINE — Main Application Shell
// ═══════════════════════════════════════════════════════════════

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function HomePage() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('proposals');

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { window.location.href = '/login'; return; }
      setUser(user);
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(data);
      setLoading(false);
    });
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  if (loading) return <LoadingScreen />;
  if (!profile) return <PendingScreen user={user} onSignOut={handleSignOut} />;
  if (profile.status === 'pending') return <PendingScreen user={user} onSignOut={handleSignOut} />;

  const isAdmin = profile.role === 'admin';

  return (
    <div style={{ fontFamily:'"Nunito Sans",system-ui,sans-serif', background:'#F4F7FA', minHeight:'100vh' }}>
      <div style={st.topbar}>
        <div style={st.topbarLeft}>
          <div style={st.dots}>
            {['#FF6B6B','#F6AD55','#00BCD4','#805AD5'].map((c,i) => <div key={i} style={{...st.dot,background:c}} />)}
          </div>
          <span style={st.topbarTitle}>mural<span style={{fontWeight:400}}>health</span></span>
          <span style={st.topbarSub}>Pricing Engine</span>
        </div>
        <div style={st.topbarRight}>
          <div style={st.navTabs}>
            <button onClick={() => setTab('proposals')} style={{...st.navTab, ...(tab==='proposals' ? st.navTabActive : {})}}>Proposals</button>
            {isAdmin && <button onClick={() => setTab('admin')} style={{...st.navTab, ...(tab==='admin' ? st.navTabActive : {})}}>Admin</button>}
          </div>
          <div style={st.userInfo}>
            <span style={st.userName}>{profile.full_name || profile.email}</span>
            <span style={st.userRole}>{profile.role}</span>
          </div>
          <button onClick={handleSignOut} style={st.signOutBtn}>Sign Out</button>
        </div>
      </div>

      {tab === 'proposals' && <ProposalsPlaceholder profile={profile} />}
      {tab === 'admin' && isAdmin && <AdminPanel profile={profile} />}
    </div>
  );
}

function ProposalsPlaceholder({ profile }) {
  return (
    <div style={{ maxWidth:1100, margin:'0 auto', padding:'40px 20px', textAlign:'center' }}>
      <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E2E8F0', padding:'60px 40px' }}>
        <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
        <h2 style={{ fontSize:20, fontWeight:800, color:'#1A2332', margin:'0 0 8px' }}>Pricing Engine</h2>
        <p style={{ color:'#718096', fontSize:14 }}>Welcome, {profile.full_name || profile.email}!</p>
        <p style={{ color:'#A0AEC0', fontSize:13, marginTop:8 }}>
          ✅ Authentication & authorization working. Your role: <strong>{profile.role}</strong>
        </p>
        <p style={{ color:'#A0AEC0', fontSize:12, marginTop:16 }}>
          The proposal editor components will be wired in here next.
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ADMIN PANEL
// ═══════════════════════════════════════════════════════════════

function AdminPanel({ profile }) {
  const [adminTab, setAdminTab] = useState('users');
  return (
    <div style={{ maxWidth:1200, margin:'0 auto', padding:'20px 20px 60px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:20 }}>
        <h2 style={{ fontSize:20, fontWeight:800, color:'#1A2332', margin:0 }}>Admin</h2>
        <div style={{ display:'inline-flex', background:'#fff', borderRadius:8, padding:2, border:'1px solid #E2E8F0', marginLeft:12 }}>
          {[['users','Users'],['proposals','All Proposals'],['pricing','Rate Card'],['discounts','Discounts'],['requests','Discount Requests']].map(([k,l]) => (
            <button key={k} onClick={() => setAdminTab(k)}
              style={{padding:'6px 14px',border:'none',borderRadius:6,fontSize:12,fontWeight:600,cursor:'pointer',
                background: adminTab===k ? '#00BCD4' : 'transparent', color: adminTab===k ? '#fff' : '#718096'}}>{l}</button>
          ))}
        </div>
      </div>
      {adminTab === 'users' && <UsersAdmin profile={profile} />}
      {adminTab === 'proposals' && <ProposalsAdmin />}
      {adminTab === 'pricing' && <RateCardAdmin />}
      {adminTab === 'discounts' && <DiscountsAdmin />}
      {adminTab === 'requests' && <DiscountRequestsAdmin />}
    </div>
  );
}

function UsersAdmin({ profile }) {
  const [users, setUsers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('sales');
  const [actionMsg, setActionMsg] = useState('');

  const loadData = useCallback(async () => {
    const [usersRes, invRes] = await Promise.all([
      fetch('/api/admin?type=users'), fetch('/api/admin?type=invitations'),
    ]);
    setUsers(await usersRes.json());
    setInvitations(await invRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const adminAction = async (body) => {
    setActionMsg('');
    const res = await fetch('/api/admin', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
    const data = await res.json();
    if (data.error) setActionMsg('Error: ' + data.error);
    else { setActionMsg(data.message || 'Done!'); loadData(); }
    setTimeout(() => setActionMsg(''), 4000);
  };

  const handleInvite = async () => {
    if (!inviteEmail) return;
    await adminAction({ action:'invite', email:inviteEmail, role:inviteRole });
    setInviteEmail(''); setShowInvite(false);
  };

  if (loading) return <div style={{padding:20,color:'#718096'}}>Loading users...</div>;

  return (
    <div>
      {actionMsg && <div style={{...st.alert, background: actionMsg.startsWith('Error') ? '#FED7D7' : '#C6F6D5', color: actionMsg.startsWith('Error') ? '#C53030' : '#276749'}}>{actionMsg}</div>}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <h3 style={{ fontSize:15, fontWeight:700, color:'#1A2332', margin:0 }}>Team Members ({users.length})</h3>
        <button onClick={() => setShowInvite(!showInvite)} style={st.btnPrimary}>+ Invite User</button>
      </div>
      {showInvite && (
        <div style={st.card}>
          <div style={{ padding:16, display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
            <div style={{ flex:1, minWidth:200 }}>
              <label style={st.label}>Email Address</label>
              <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="user@muralhealth.com" style={st.input} />
            </div>
            <div style={{ width:140 }}>
              <label style={st.label}>Role</label>
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={st.input}>
                <option value="sales">Sales</option><option value="admin">Admin</option><option value="viewer">Viewer</option>
              </select>
            </div>
            <button onClick={handleInvite} style={{...st.btnPrimary,height:38}}>Send Invite</button>
            <button onClick={() => setShowInvite(false)} style={{...st.btnGhost,height:38}}>Cancel</button>
          </div>
        </div>
      )}
      <div style={st.card}>
        <table style={st.table}>
          <thead><tr><th style={st.th}>Name</th><th style={st.th}>Email</th><th style={st.th}>Role</th><th style={st.th}>Status</th><th style={st.th}>Joined</th><th style={st.th}>Actions</th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={st.tr}>
                <td style={st.td}><strong>{u.full_name||'—'}</strong></td>
                <td style={st.td}>{u.email}</td>
                <td style={st.td}>
                  <select value={u.role} onChange={e => adminAction({action:'update_role',userId:u.id,role:e.target.value})}
                    style={{...st.inputSm,width:80}} disabled={u.id===profile.id}>
                    <option value="admin">Admin</option><option value="sales">Sales</option><option value="viewer">Viewer</option>
                  </select>
                </td>
                <td style={st.td}>
                  <span style={{...st.badge, background:u.status==='active'?'#C6F6D5':u.status==='pending'?'#FEFCBF':'#FED7D7',
                    color:u.status==='active'?'#276749':u.status==='pending'?'#975A16':'#C53030'}}>{u.status}</span>
                </td>
                <td style={st.td}>{new Date(u.created_at).toLocaleDateString()}</td>
                <td style={st.td}>
                  <div style={{display:'flex',gap:4}}>
                    {u.status==='pending' && <button onClick={() => adminAction({action:'update_status',userId:u.id,status:'active'})} style={st.btnSmGreen}>Approve</button>}
                    {u.status==='active' && u.id!==profile.id && <button onClick={() => adminAction({action:'update_status',userId:u.id,status:'suspended'})} style={st.btnSmRed}>Suspend</button>}
                    {u.status==='suspended' && <button onClick={() => adminAction({action:'update_status',userId:u.id,status:'active'})} style={st.btnSmGreen}>Reactivate</button>}
                    <button onClick={() => adminAction({action:'reset_password',email:u.email})} style={st.btnSmGhost}>Reset PW</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {invitations.length > 0 && (
        <>
          <h3 style={{ fontSize:15, fontWeight:700, color:'#1A2332', margin:'24px 0 12px' }}>Invitations</h3>
          <div style={st.card}>
            <table style={st.table}>
              <thead><tr><th style={st.th}>Email</th><th style={st.th}>Role</th><th style={st.th}>Status</th><th style={st.th}>Invited By</th><th style={st.th}>Date</th></tr></thead>
              <tbody>
                {invitations.map(inv => (
                  <tr key={inv.id} style={st.tr}>
                    <td style={st.td}>{inv.email}</td><td style={st.td}>{inv.role}</td>
                    <td style={st.td}><span style={{...st.badge,background:inv.status==='accepted'?'#C6F6D5':'#FEFCBF',color:inv.status==='accepted'?'#276749':'#975A16'}}>{inv.status}</span></td>
                    <td style={st.td}>{inv.inviter?.full_name||inv.inviter?.email||'—'}</td>
                    <td style={st.td}>{new Date(inv.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function ProposalsAdmin() {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetch('/api/admin?type=proposals').then(r=>r.json()).then(d=>{setProposals(d);setLoading(false);}); }, []);
  if (loading) return <div style={{padding:20,color:'#718096'}}>Loading proposals...</div>;
  const sc = {Won:'#C6F6D5',Lost:'#FED7D7',Negotiating:'#FEFCBF',Draft:'#E0F7FA',Submitted:'#E0F7FA'};
  const tc = {Won:'#276749',Lost:'#C53030',Negotiating:'#975A16',Draft:'#00838F',Submitted:'#00838F'};
  return (
    <div style={st.card}>
      <table style={st.table}>
        <thead><tr><th style={st.th}>#</th><th style={st.th}>Sponsor</th><th style={st.th}>Study</th><th style={st.th}>Status</th><th style={st.th}>TCV</th><th style={st.th}>Created By</th><th style={st.th}>Updated</th></tr></thead>
        <tbody>
          {proposals.map(p => (
            <tr key={p.id} style={st.tr}>
              <td style={st.td}><strong>{p.proposal_number||'—'}</strong></td>
              <td style={st.td}>{p.sponsor||'—'}</td><td style={st.td}>{p.study_name||'—'}</td>
              <td style={st.td}><span style={{...st.badge,background:sc[p.status]||'#E0F7FA',color:tc[p.status]||'#00838F'}}>{p.status}</span></td>
              <td style={{...st.td,fontFamily:'Consolas,monospace',fontWeight:600}}>{p.tcv?'$'+Math.round(p.tcv).toLocaleString():'—'}</td>
              <td style={st.td}>{p.creator?.full_name||p.creator?.email||'—'}</td>
              <td style={st.td}>{new Date(p.updated_at).toLocaleDateString()}</td>
            </tr>
          ))}
          {proposals.length===0 && <tr><td colSpan={7} style={{...st.td,textAlign:'center',color:'#A0AEC0'}}>No proposals yet</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function RateCardAdmin() {
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  useEffect(() => { fetch('/api/admin?type=rate_cards').then(r=>r.json()).then(d=>{setRates(d);setLoading(false);}); }, []);
  const updateRate = async (id, field, value) => {
    setSaving(id);
    await fetch('/api/admin', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'update_rate_card',id,[field]:parseFloat(value)})});
    setRates(prev => prev.map(r => r.id===id ? {...r,[field]:parseFloat(value)} : r));
    setSaving(null);
  };
  if (loading) return <div style={{padding:20,color:'#718096'}}>Loading rate card...</div>;
  return (
    <div>
      <p style={{fontSize:13,color:'#718096',marginBottom:12}}>Edit prices inline. Changes take effect immediately for new calculations.</p>
      <div style={st.card}>
        <table style={st.table}>
          <thead><tr><th style={st.th}>Fee Item</th><th style={st.th}>Type</th><th style={{...st.th,textAlign:'right'}}>Standard</th><th style={{...st.th,textAlign:'right'}}>BMS</th><th style={st.th}>Unit</th><th style={st.th}>Notes</th></tr></thead>
          <tbody>
            {rates.map(r => (
              <tr key={r.id} style={{...st.tr,background:saving===r.id?'#E0F7FA':'transparent'}}>
                <td style={{...st.td,fontWeight:600}}>{r.fee_item}</td>
                <td style={st.td}><span style={{fontSize:10,color:'#718096'}}>{r.fee_type}</span></td>
                <td style={{...st.td,textAlign:'right'}}>
                  <input type="number" value={r.standard_price} step="0.01"
                    onChange={e => setRates(prev=>prev.map(x=>x.id===r.id?{...x,standard_price:e.target.value}:x))}
                    onBlur={e => updateRate(r.id,'standard_price',e.target.value)}
                    style={{...st.inputSm,textAlign:'right',width:100}} />
                </td>
                <td style={{...st.td,textAlign:'right'}}>
                  <input type="number" value={r.bms_price} step="0.01"
                    onChange={e => setRates(prev=>prev.map(x=>x.id===r.id?{...x,bms_price:e.target.value}:x))}
                    onBlur={e => updateRate(r.id,'bms_price',e.target.value)}
                    style={{...st.inputSm,textAlign:'right',width:100}} />
                </td>
                <td style={st.td}><span style={{fontSize:11,color:'#A0AEC0'}}>{r.unit||'—'}</span></td>
                <td style={st.td}><span style={{fontSize:11,color:'#A0AEC0'}}>{r.notes||''}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DiscountsAdmin() {
  const [discounts, setDiscounts] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetch('/api/admin?type=volume_discounts').then(r=>r.json()).then(d=>{setDiscounts(d);setLoading(false);}); }, []);
  const updateDiscount = async (id, value) => {
    await fetch('/api/admin', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'update_discount',id,discount_rate:parseFloat(value)})});
    setDiscounts(prev => prev.map(d => d.id===id ? {...d,discount_rate:parseFloat(value)} : d));
  };
  if (loading) return <div style={{padding:20,color:'#718096'}}>Loading discounts...</div>;
  return (
    <div>
      <p style={{fontSize:13,color:'#718096',marginBottom:12}}>Edit discount rates inline. Changes take effect immediately.</p>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        {['Countries','Sites','Patients','Screen Fails'].map(cat => (
          <div key={cat} style={st.card}>
            <div style={{padding:'10px 16px',borderBottom:'1px solid #E2E8F0',background:'linear-gradient(135deg,rgba(0,188,212,.04),rgba(178,235,242,.12))'}}>
              <h4 style={{fontSize:13,fontWeight:700,color:'#1A2332',margin:0}}>{cat}</h4>
            </div>
            <table style={st.table}>
              <thead><tr><th style={st.th}>Min</th><th style={st.th}>Max</th><th style={{...st.th,textAlign:'right'}}>Discount</th></tr></thead>
              <tbody>
                {discounts.filter(d=>d.category===cat).map(d => (
                  <tr key={d.id} style={st.tr}>
                    <td style={st.td}>{d.min_value}</td>
                    <td style={st.td}>{d.max_value===9999?'∞':d.max_value}</td>
                    <td style={{...st.td,textAlign:'right'}}>
                      <input type="number" value={(d.discount_rate*100).toFixed(1)} step="0.5" min="0" max="100"
                        onChange={e => setDiscounts(prev=>prev.map(x=>x.id===d.id?{...x,discount_rate:parseFloat(e.target.value)/100}:x))}
                        onBlur={e => updateDiscount(d.id,parseFloat(e.target.value)/100)}
                        style={{...st.inputSm,textAlign:'right',width:70}} />
                      <span style={{fontSize:11,color:'#A0AEC0',marginLeft:2}}>%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

function DiscountRequestsAdmin() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetch('/api/admin?type=discount_requests').then(r=>r.json()).then(d=>{setRequests(d);setLoading(false);}); }, []);
  const review = async (id, status) => {
    await fetch('/api/admin', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'review_discount',requestId:id,status})});
    setRequests(prev => prev.map(r => r.id===id ? {...r,status} : r));
  };
  if (loading) return <div style={{padding:20,color:'#718096'}}>Loading requests...</div>;
  if (requests.length===0) return (
    <div style={{background:'#fff',borderRadius:12,border:'1px solid #E2E8F0',padding:40,textAlign:'center'}}>
      <div style={{fontSize:30,marginBottom:8}}>✅</div>
      <p style={{color:'#718096'}}>No discount requests to review.</p>
    </div>
  );
  return (
    <div style={st.card}>
      <table style={st.table}>
        <thead><tr><th style={st.th}>Proposal</th><th style={st.th}>Category</th><th style={st.th}>Current</th><th style={st.th}>Requested</th><th style={st.th}>Justification</th><th style={st.th}>By</th><th style={st.th}>Status</th><th style={st.th}>Actions</th></tr></thead>
        <tbody>
          {requests.map(r => (
            <tr key={r.id} style={st.tr}>
              <td style={st.td}>{r.proposal?.proposal_number} — {r.proposal?.sponsor}</td>
              <td style={st.td}>{r.category}</td>
              <td style={st.td}>{(r.current_rate*100).toFixed(1)}%</td>
              <td style={{...st.td,fontWeight:600,color:'#00838F'}}>{(r.requested_rate*100).toFixed(1)}%</td>
              <td style={st.td}><span style={{fontSize:11}}>{r.justification||'—'}</span></td>
              <td style={st.td}>{r.requester?.full_name||r.requester?.email}</td>
              <td style={st.td}><span style={{...st.badge,background:r.status==='approved'?'#C6F6D5':r.status==='declined'?'#FED7D7':'#FEFCBF',color:r.status==='approved'?'#276749':r.status==='declined'?'#C53030':'#975A16'}}>{r.status}</span></td>
              <td style={st.td}>
                {r.status==='pending' && <div style={{display:'flex',gap:4}}>
                  <button onClick={() => review(r.id,'approved')} style={st.btnSmGreen}>Approve</button>
                  <button onClick={() => review(r.id,'declined')} style={st.btnSmRed}>Decline</button>
                </div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100vh',fontFamily:'"Nunito Sans",system-ui,sans-serif'}}>
      <div style={{textAlign:'center'}}>
        <div style={{display:'flex',gap:2,justifyContent:'center',marginBottom:12}}>
          {['#FF6B6B','#F6AD55','#00BCD4','#805AD5'].map((c,i) => <div key={i} style={{width:6,height:20,borderRadius:3,background:c}} />)}
        </div>
        <div style={{fontSize:14,color:'#718096'}}>Loading...</div>
      </div>
    </div>
  );
}

function PendingScreen({ user, onSignOut }) {
  return (
    <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100vh',fontFamily:'"Nunito Sans",system-ui,sans-serif'}}>
      <div style={{textAlign:'center',maxWidth:400}}>
        <div style={{display:'flex',gap:2,justifyContent:'center',marginBottom:16}}>
          {['#FF6B6B','#F6AD55','#00BCD4','#805AD5'].map((c,i) => <div key={i} style={{width:6,height:20,borderRadius:3,background:c}} />)}
        </div>
        <h2 style={{fontSize:20,fontWeight:800,color:'#1A2332',margin:'0 0 8px'}}>Account Pending</h2>
        <p style={{color:'#718096',fontSize:14,lineHeight:1.6}}>Your account ({user?.email}) is pending admin approval. You'll receive an email once approved.</p>
        <button onClick={onSignOut} style={{marginTop:20,padding:'8px 20px',border:'1px solid #E2E8F0',borderRadius:8,background:'#fff',cursor:'pointer',fontSize:13,color:'#718096'}}>Sign Out</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
const st = {
  topbar:{background:'#1A2332',padding:'10px 24px',display:'flex',alignItems:'center',justifyContent:'space-between'},
  topbarLeft:{display:'flex',alignItems:'center',gap:8},
  topbarRight:{display:'flex',alignItems:'center',gap:16},
  topbarTitle:{fontSize:16,fontWeight:800,color:'#fff'},
  topbarSub:{fontSize:12,color:'#A0AEC0',marginLeft:10},
  dots:{display:'flex',gap:2},
  dot:{width:5,height:16,borderRadius:2.5},
  navTabs:{display:'flex',background:'rgba(255,255,255,.08)',borderRadius:6,padding:2},
  navTab:{padding:'5px 14px',border:'none',borderRadius:5,fontSize:12,fontWeight:600,cursor:'pointer',background:'transparent',color:'#A0AEC0',transition:'all .15s'},
  navTabActive:{background:'#00BCD4',color:'#fff'},
  userInfo:{display:'flex',flexDirection:'column',alignItems:'flex-end'},
  userName:{fontSize:12,color:'#fff',fontWeight:600},
  userRole:{fontSize:10,color:'#A0AEC0',textTransform:'uppercase'},
  signOutBtn:{padding:'5px 12px',border:'1px solid rgba(255,255,255,.15)',borderRadius:6,background:'transparent',color:'#A0AEC0',fontSize:11,cursor:'pointer'},
  card:{background:'#fff',borderRadius:12,border:'1px solid #E2E8F0',overflow:'hidden',marginBottom:12},
  table:{width:'100%',borderCollapse:'collapse',fontSize:13},
  th:{textAlign:'left',padding:'10px 14px',fontSize:10,fontWeight:700,color:'#718096',textTransform:'uppercase',letterSpacing:'.04em',borderBottom:'2px solid #E2E8F0',background:'#FAFBFC'},
  tr:{borderBottom:'1px solid #F0F0F0'},
  td:{padding:'10px 14px',color:'#4A5568'},
  badge:{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:12,display:'inline-block'},
  label:{display:'block',fontSize:10,fontWeight:700,color:'#718096',marginBottom:3,textTransform:'uppercase',letterSpacing:'.04em'},
  input:{width:'100%',padding:'8px 10px',border:'1.5px solid #E2E8F0',borderRadius:7,fontSize:13,background:'#fff',color:'#1A2332',outline:'none',boxSizing:'border-box',fontFamily:'inherit'},
  inputSm:{padding:'4px 8px',border:'1.5px solid #E2E8F0',borderRadius:5,fontSize:12,background:'#fff',color:'#1A2332',outline:'none',fontFamily:'inherit'},
  btnPrimary:{padding:'8px 18px',border:'none',borderRadius:8,fontSize:13,fontWeight:600,background:'#00BCD4',color:'#fff',cursor:'pointer'},
  btnGhost:{padding:'8px 18px',border:'1px solid #E2E8F0',borderRadius:8,fontSize:13,fontWeight:600,background:'transparent',color:'#718096',cursor:'pointer'},
  btnSmGreen:{padding:'3px 10px',border:'1px solid #C6F6D5',borderRadius:5,fontSize:10,fontWeight:600,background:'#F0FFF4',color:'#276749',cursor:'pointer'},
  btnSmRed:{padding:'3px 10px',border:'1px solid #FED7D7',borderRadius:5,fontSize:10,fontWeight:600,background:'#FFF5F5',color:'#C53030',cursor:'pointer'},
  btnSmGhost:{padding:'3px 10px',border:'1px solid #E2E8F0',borderRadius:5,fontSize:10,fontWeight:600,background:'transparent',color:'#718096',cursor:'pointer'},
  alert:{padding:'10px 16px',borderRadius:8,fontSize:13,fontWeight:600,marginBottom:12},
};
