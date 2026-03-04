'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { calcFees, defaultStudy, fmt } from '@/lib/pricing';

const { usd, usd2, pct } = fmt;

// ── DB row <-> study object mapping ──
function rowToStudy(row) {
  return {
    sponsor: row.sponsor || '', studyName: row.study_name || '', phase: row.phase || 'III',
    ta: row.therapeutic_area || '', patients: row.patients || 200, caregivers: row.caregivers || 0,
    screenFails: row.screen_fails || 50, countriesExUS: row.countries_ex_us || 5,
    sites: row.sites || 40, siteAdoption: Number(row.site_adoption_pct) || 75,
    studyMonths: row.study_months || 36, visitsPerPatient: row.visits_per_patient || 10,
    inPersonIMs: row.in_person_ims || 0, virtualIMs: row.virtual_ims || 1,
    includeConcierge: row.include_concierge || false, pctLDTravel: Number(row.pct_ld_travel) || 20,
    tripsPerPatient: row.trips_per_patient || 10, visaCount: row.visa_count || 0,
    includePK: row.include_pk || false, pkHoursPerVisit: Number(row.pk_hours_per_visit) || 0.5,
    specialClient: row.special_client || 'None',
  };
}

function studyToRow(study, fees) {
  return {
    sponsor: study.sponsor, study_name: study.studyName, phase: study.phase,
    therapeutic_area: study.ta, patients: study.patients, caregivers: study.caregivers,
    screen_fails: study.screenFails, countries_ex_us: study.countriesExUS,
    sites: study.sites, site_adoption_pct: study.siteAdoption,
    study_months: study.studyMonths, visits_per_patient: study.visitsPerPatient,
    in_person_ims: study.inPersonIMs, virtual_ims: study.virtualIMs,
    include_concierge: study.includeConcierge, pct_ld_travel: study.pctLDTravel,
    trips_per_patient: study.tripsPerPatient, visa_count: study.visaCount,
    include_pk: study.includePK, pk_hours_per_visit: study.pkHoursPerVisit,
    special_client: study.specialClient,
    setup_fees: fees.totalSetup, monthly_fee: fees.totalMonthly,
    total_monthly_all: fees.totalMonthlyAll, tcv: fees.tcv,
  };
}

// ── Visual indicator colors ──
const FIELD_COLORS = {
  extracted: { color: '#0284C7', background: '#F0F9FF' },      // Sky blue — from protocol
  needsReview: { color: '#D97706', background: '#FFFBEB' },    // Amber — low confidence
  normal: { color: '#1A2332', background: '#fff' },             // Default
};

function fieldStyle(field, extractedFields, confidence) {
  if (!extractedFields || !extractedFields.includes(field)) return FIELD_COLORS.normal;
  const conf = confidence?.[field];
  if (conf === 'low' || conf === 'medium') return FIELD_COLORS.needsReview;
  return FIELD_COLORS.extracted;
}

// ═══════════════════════════════════════════════════════════════
// MAIN PROPOSAL ENGINE
// ═══════════════════════════════════════════════════════════════

export default function ProposalEngine({ supabase, profile }) {
  const [page, setPage] = useState('dashboard');
  const [proposals, setProposals] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [study, setStudy] = useState(defaultStudy());
  const [meta, setMeta] = useState({
    proposalNumber: '', proposalName: '', version: 1, status: 'Draft',
    notes: '', includeNotesInProposal: false,
    extractedFields: [], confidence: {}, suggestions: [],
  });
  const [view, setView] = useState('internal');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const nameRef = useRef(null);
  const saveTimer = useRef(null);

  useEffect(() => {
    supabase.from('proposals').select('*').order('updated_at', { ascending: false })
      .then(({ data }) => { setProposals(data || []); setLoaded(true); });
  }, [supabase]);

  const fees = calcFees(study);

  // ── CRUD ──
  const createProposal = async () => {
    const { data, error } = await supabase.rpc('generate_proposal_number');
    const num = error ? 'MH' + String(Date.now()).slice(-3) : data;
    const newRow = {
      proposal_number: num, proposal_name: '', version: 1, status: 'Draft',
      ...studyToRow(defaultStudy(), calcFees(defaultStudy())),
      notes: '', include_notes_in_proposal: false,
      extracted_fields: [], ai_suggestions: [],
      created_by: profile.id, updated_by: profile.id,
    };
    const { data: inserted, error: insErr } = await supabase.from('proposals').insert(newRow).select().single();
    if (insErr) { alert('Error: ' + insErr.message); return; }
    setProposals(prev => [inserted, ...prev]);
    openProposal(inserted);
  };

  const openProposal = (row) => {
    setActiveId(row.id);
    setStudy(rowToStudy(row));
    setMeta({
      proposalNumber: row.proposal_number, proposalName: row.proposal_name || '',
      version: row.version, status: row.status, notes: row.notes || '',
      includeNotesInProposal: row.include_notes_in_proposal || false,
      extractedFields: row.extracted_fields || [], confidence: {},
      suggestions: row.ai_suggestions || [],
    });
    setPage('editor'); setView('internal');
  };

  const saveProposal = useCallback(async (s, m) => {
    if (!activeId) return;
    setSaving(true);
    const f = calcFees(s || study);
    const updates = {
      ...studyToRow(s || study, f),
      proposal_name: (m || meta).proposalName,
      status: (m || meta).status, notes: (m || meta).notes,
      include_notes_in_proposal: (m || meta).includeNotesInProposal,
      extracted_fields: (m || meta).extractedFields,
      ai_suggestions: (m || meta).suggestions,
      updated_by: profile.id,
    };
    const { data, error } = await supabase.from('proposals').update(updates).eq('id', activeId).select().single();
    if (!error && data) setProposals(prev => prev.map(p => p.id === activeId ? data : p));
    setSaving(false);
  }, [activeId, study, meta, profile.id, supabase]);

  const triggerSave = useCallback((s, m) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveProposal(s, m), 1500);
  }, [saveProposal]);

  const updateStudy = (field, value) => {
    const next = { ...study, [field]: value };
    setStudy(next);
    triggerSave(next, meta);
  };

  const updateMeta = (field, value) => {
    const next = { ...meta, [field]: value };
    setMeta(next);
    triggerSave(study, next);
  };

  const deleteProposal = async (id, e) => {
    e?.stopPropagation();
    if (!confirm('Delete this proposal?')) return;
    await supabase.from('proposals').delete().eq('id', id);
    setProposals(prev => prev.filter(p => p.id !== id));
    if (activeId === id) { setPage('dashboard'); setActiveId(null); }
  };

  const duplicateProposal = async (id, e) => {
    e?.stopPropagation();
    const orig = proposals.find(p => p.id === id);
    if (!orig) return;
    const { data: num } = await supabase.rpc('generate_proposal_number');
    const dup = {
      ...studyToRow(rowToStudy(orig), calcFees(rowToStudy(orig))),
      proposal_number: num || 'MH' + Date.now().toString().slice(-3),
      proposal_name: (orig.proposal_name || orig.sponsor || '') + ' (Copy)',
      version: 1, status: 'Draft', notes: orig.notes,
      include_notes_in_proposal: orig.include_notes_in_proposal,
      extracted_fields: orig.extracted_fields || [],
      ai_suggestions: orig.ai_suggestions || [],
      created_by: profile.id, updated_by: profile.id,
    };
    const { data } = await supabase.from('proposals').insert(dup).select().single();
    if (data) setProposals(prev => [data, ...prev]);
  };

  const saveAsNewVersion = async () => {
    if (!activeId) return;
    const f = calcFees(study);
    const nv = {
      ...studyToRow(study, f),
      proposal_number: meta.proposalNumber, proposal_name: meta.proposalName,
      version: meta.version + 1, status: 'Draft',
      notes: meta.notes, include_notes_in_proposal: meta.includeNotesInProposal,
      extracted_fields: meta.extractedFields, ai_suggestions: meta.suggestions,
      parent_id: activeId, created_by: profile.id, updated_by: profile.id,
    };
    const { data } = await supabase.from('proposals').insert(nv).select().single();
    if (data) { setProposals(prev => [data, ...prev]); openProposal(data); }
  };

  // ── Protocol extraction ──
  const handleProtocolExtract = async (file) => {
    const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error: uploadErr } = await supabase.storage.from('protocols').upload(fileName, file);
    if (uploadErr) throw new Error('Upload failed: ' + uploadErr.message);

    const resp = await fetch('/api/extract', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storagePath: fileName }),
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error);

    // Track which fields were extracted
    const extracted = [];
    const next = { ...study };
    const fieldMap = { sponsor:'sponsor', studyName:'studyName', phase:'phase', ta:'ta',
      patients:'patients', caregivers:'caregivers', screenFails:'screenFails',
      countriesExUS:'countriesExUS', sites:'sites', studyMonths:'studyMonths',
      visitsPerPatient:'visitsPerPatient' };

    for (const [key, studyKey] of Object.entries(fieldMap)) {
      if (data[key] !== null && data[key] !== undefined) {
        next[studyKey] = typeof data[key] === 'number' ? data[key] : data[key];
        extracted.push(studyKey);
      }
    }

    setStudy(next);
    const nextMeta = {
      ...meta,
      extractedFields: [...new Set([...meta.extractedFields, ...extracted])],
      confidence: { ...meta.confidence, ...(data.confidence || {}) },
      suggestions: [...new Set([...(meta.suggestions || []), ...(data.suggestions || [])])],
    };
    if (data.notes) {
      nextMeta.notes = (meta.notes ? meta.notes + '\n\n--- Protocol Extract ---\n' : 'Protocol Extract: ') + data.notes;
    }
    if (!nextMeta.proposalName && data.studyName) {
      nextMeta.proposalName = data.studyName;
    }
    setMeta(nextMeta);
    triggerSave(next, nextMeta);
    return data;
  };

  // ── Discount footnotes ──
  function getDiscountFootnotes(s, f) {
    const notes = [];
    if (f.dC > 0) notes.push(`Country discount (${pct(f.dC)}): ${s.countriesExUS} countries qualifies for volume tier, reducing per-country rate from ${usd2(f.p.monthlyCountry)} to ${usd2(f.eC)}/mo.`);
    if (f.dS > 0) notes.push(`Site discount (${pct(f.dS)}): ${s.sites} sites qualifies for volume tier, reducing per-site rate from ${usd2(f.p.monthlySite)} to ${usd2(f.eS)}/mo.`);
    if (f.dP > 0) notes.push(`Participant discount (${pct(f.dP)}): ${s.patients} patients qualifies for volume tier, reducing per-participant rate from ${usd2(f.p.monthlyParticipant)} to ${usd2(f.eP)}/mo.`);
    if (f.dSF > 0) notes.push(`Screen fail discount (${pct(f.dSF)}): ${s.screenFails} screen fails qualifies for volume tier, reducing rate from ${usd2(f.p.flatScreenFail)} to ${usd2(f.eSF)}.`);
    return notes;
  }

  // ── Styled input helper ──
  const styledInput = (field, type, value, onChange, extra = {}) => {
    const fs = fieldStyle(field, meta.extractedFields, meta.confidence);
    const conf = meta.confidence?.[field];
    const isExtracted = meta.extractedFields?.includes(field);
    return (
      <div style={{ position: 'relative' }}>
        <input type={type} value={value} onChange={onChange}
          style={{ ...st.input, color: fs.color, background: fs.background, borderColor: conf === 'low' ? '#F59E0B' : conf === 'medium' ? '#60A5FA' : '#E2E8F0', ...extra }} />
        {isExtracted && (
          <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 9, fontWeight: 700,
            color: conf === 'low' || conf === 'medium' ? '#D97706' : '#0284C7',
            background: conf === 'low' || conf === 'medium' ? '#FFFBEB' : '#F0F9FF',
            padding: '1px 5px', borderRadius: 4 }}>
            {conf === 'low' ? '⚠ Review' : conf === 'medium' ? '~ Check' : '✓ AI'}
          </span>
        )}
      </div>
    );
  };

  if (!loaded) return <div style={{ padding: 40, textAlign: 'center', color: '#718096' }}>Loading proposals...</div>;

  // ═══════ DASHBOARD ═══════
  if (page === 'dashboard') {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px 60px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1A2332', margin: 0 }}>Proposals</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#718096' }}>{proposals.length} saved</p>
          </div>
          <button style={st.btnPrimary} onClick={createProposal}>+ New Proposal</button>
        </div>
        {proposals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 14, color: '#718096' }}>No proposals yet. Create your first one.</div>
          </div>
        ) : proposals.map(p => {
          const pStudy = rowToStudy(p);
          const pFees = calcFees(pStudy);
          const displayName = p.proposal_name || p.sponsor || 'Untitled';
          const sc = { Won: '#C6F6D5', Lost: '#FED7D7', Negotiating: '#FEFCBF', Draft: '#E0F7FA', Submitted: '#E0F7FA' };
          const tc = { Won: '#276749', Lost: '#C53030', Negotiating: '#975A16', Draft: '#00838F', Submitted: '#00838F' };
          return (
            <div key={p.id} style={st.proposalCard} onClick={() => openProposal(p)}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#1A2332' }}>{displayName}</span>
                  {p.sponsor && p.proposal_name && <><span style={{ color: '#A0AEC0' }}>·</span><span style={{ fontSize: 13, color: '#718096' }}>{p.sponsor}</span></>}
                  <span style={st.badge}>v{p.version}</span>
                  <span style={{ ...st.badge, background: sc[p.status] || '#E0F7FA', color: tc[p.status] || '#00838F' }}>{p.status}</span>
                </div>
                <div style={{ fontSize: 11, color: '#A0AEC0' }}>Phase {p.phase} · {p.patients} pts · {p.sites} sites · {p.countries_ex_us} countries · {p.study_months} mo</div>
                <div style={{ fontSize: 11, color: '#A0AEC0', marginTop: 3 }}>Updated {new Date(p.updated_at).toLocaleDateString()} · {p.proposal_number}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'Consolas,monospace', color: '#00838F' }}>{usd(pFees.tcv)}</div>
                <div style={{ fontSize: 10, color: '#A0AEC0', marginTop: 2 }}>TCV · {usd(pFees.totalMonthly)}/mo</div>
                <div style={{ display: 'flex', gap: 4, marginTop: 8, justifyContent: 'flex-end' }}>
                  <button style={st.btnGhostSm} onClick={e => duplicateProposal(p.id, e)}>Duplicate</button>
                  <button style={st.btnDangerSm} onClick={e => deleteProposal(p.id, e)}>Delete</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ═══════ EDITOR ═══════
  const s = study;
  const f = fees;
  const isProposalView = view === 'proposal';
  const discountFootnotes = getDiscountFootnotes(s, f);
  const displayName = meta.proposalName || s.sponsor || 'New Proposal';

  return (
    <div style={{ maxWidth: 1360, margin: '0 auto', padding: '20px 20px 60px' }}>
      {/* Toolbar with editable name */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button style={st.btnGhost} onClick={() => { saveProposal(); setPage('dashboard'); setActiveId(null); }}>← Back</button>
          {editingName ? (
            <input ref={nameRef} autoFocus value={meta.proposalName}
              onChange={e => updateMeta('proposalName', e.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={e => { if (e.key === 'Enter') setEditingName(false); }}
              style={{ fontSize: 16, fontWeight: 800, color: '#1A2332', border: '1.5px solid #00BCD4', borderRadius: 6, padding: '3px 8px', outline: 'none', minWidth: 200, fontFamily: 'inherit' }}
              placeholder="Name this opportunity..." />
          ) : (
            <span style={{ fontSize: 16, fontWeight: 800, color: '#1A2332', cursor: 'pointer', padding: '3px 8px', borderRadius: 6, border: '1.5px dashed transparent', transition: 'border .15s' }}
              onClick={() => setEditingName(true)}
              onMouseEnter={e => e.target.style.borderColor = '#CBD5E0'}
              onMouseLeave={e => e.target.style.borderColor = 'transparent'}
              title="Click to rename">
              {displayName}
            </span>
          )}
          <span style={st.badge}>v{meta.version}</span>
          <span style={{ fontSize: 11, color: '#A0AEC0' }}>{meta.proposalNumber}</span>
          {saving && <span style={{ fontSize: 10, color: '#00BCD4' }}>Saving...</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select value={meta.status} onChange={e => updateMeta('status', e.target.value)} style={{ ...st.input, width: 'auto', padding: '5px 8px', fontSize: 12 }}>
            {['Draft', 'Submitted', 'Negotiating', 'Won', 'Lost'].map(s => <option key={s}>{s}</option>)}
          </select>
          <button style={st.btnOutline} onClick={saveAsNewVersion}>Save as New Version</button>
          <button style={st.btnPrimary} onClick={() => saveProposal()}>Save Now</button>
        </div>
      </div>

      {/* Field legend */}
      {meta.extractedFields?.length > 0 && !isProposalView && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 10, fontSize: 10, color: '#718096' }}>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#0284C7', marginRight: 4 }}></span>Extracted from protocol</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#D97706', marginRight: 4 }}></span>Needs review (low confidence)</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#E2E8F0', marginRight: 4 }}></span>User entered</span>
        </div>
      )}

      {/* View Tabs */}
      <div style={{ display: 'inline-flex', background: '#fff', borderRadius: 8, padding: 2, border: '1px solid #E2E8F0', marginBottom: 14 }}>
        {[['internal', 'Internal'], ['customer', 'Customer'], ['proposal', 'Proposal Output']].map(([v, l]) => (
          <button key={v} onClick={() => setView(v)} style={{ padding: '7px 16px', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: view === v ? '#00BCD4' : 'transparent', color: view === v ? '#fff' : '#718096' }}>{l}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isProposalView ? '1fr' : '340px 1fr', gap: 16, alignItems: 'start' }}>
        {/* ── SIDEBAR ── */}
        {!isProposalView && (
          <div style={{ position: 'sticky', top: 16 }}>
            <ProtocolUploader onExtract={handleProtocolExtract} />

            {/* Study Profile */}
            <Card title="Study Profile" accent>
              <FG label="Sponsor">{styledInput('sponsor', 'text', s.sponsor, e => updateStudy('sponsor', e.target.value))}</FG>
              <FG label="Study Name">{styledInput('studyName', 'text', s.studyName, e => updateStudy('studyName', e.target.value))}</FG>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <FGs label="Phase">
                  <div style={{ position: 'relative' }}>
                    <select style={{ ...st.input, color: fieldStyle('phase', meta.extractedFields, meta.confidence).color, background: fieldStyle('phase', meta.extractedFields, meta.confidence).background }} value={s.phase} onChange={e => updateStudy('phase', e.target.value)}>
                      {['I','I/II','II','II/III','III','III/IV','IV'].map(o=><option key={o}>{o}</option>)}
                    </select>
                    {meta.extractedFields?.includes('phase') && <span style={{ position:'absolute',right:24,top:'50%',transform:'translateY(-50%)',fontSize:9,fontWeight:700,color:'#0284C7',background:'#F0F9FF',padding:'1px 5px',borderRadius:4 }}>✓ AI</span>}
                  </div>
                </FGs>
                <FGs label="Therapeutic Area">{styledInput('ta', 'text', s.ta, e => updateStudy('ta', e.target.value))}</FGs>
                <FGs label="Patients">{styledInput('patients', 'number', s.patients, e => updateStudy('patients', +e.target.value||0))}</FGs>
                <FGs label="Caregivers">{styledInput('caregivers', 'number', s.caregivers, e => updateStudy('caregivers', +e.target.value||0))}</FGs>
                <FGs label="Screen Fails">{styledInput('screenFails', 'number', s.screenFails, e => updateStudy('screenFails', +e.target.value||0))}</FGs>
                <FGs label="Countries (ex-US)">{styledInput('countriesExUS', 'number', s.countriesExUS, e => updateStudy('countriesExUS', +e.target.value||0))}</FGs>
                <FGs label="Sites">{styledInput('sites', 'number', s.sites, e => updateStudy('sites', +e.target.value||0))}</FGs>
                <FGs label="Adoption %"><input type="number" style={st.input} value={s.siteAdoption} min={0} max={100} onChange={e => updateStudy('siteAdoption', +e.target.value||0)} /></FGs>
                <FGs label="Study Mo.">{styledInput('studyMonths', 'number', s.studyMonths, e => updateStudy('studyMonths', +e.target.value||1))}</FGs>
                <FGs label="Visits/Pt">{styledInput('visitsPerPatient', 'number', s.visitsPerPatient, e => updateStudy('visitsPerPatient', +e.target.value||0))}</FGs>
                <FGs label="In-Person IMs"><input type="number" style={st.input} value={s.inPersonIMs} min={0} onChange={e => updateStudy('inPersonIMs', +e.target.value||0)} /></FGs>
                <FGs label="Virtual IMs"><input type="number" style={st.input} value={s.virtualIMs} min={0} onChange={e => updateStudy('virtualIMs', +e.target.value||0)} /></FGs>
              </div>
            </Card>

            <Card title="Add-Ons">
              <Toggle checked={s.includeConcierge} onChange={v => updateStudy('includeConcierge', v)} label="Concierge Travel" desc="24/7 travel booking & logistics" />
              {s.includeConcierge && (
                <div style={{ paddingLeft: 12, borderLeft: '2px solid #B2EBF2', marginBottom: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <FGs label="% LD Travel"><input type="number" style={st.input} value={s.pctLDTravel} min={0} onChange={e => updateStudy('pctLDTravel', +e.target.value||0)} /></FGs>
                    <FGs label="Trips/Patient"><input type="number" style={st.input} value={s.tripsPerPatient} min={0} onChange={e => updateStudy('tripsPerPatient', +e.target.value||0)} /></FGs>
                  </div>
                  <FGs label="Visas"><input type="number" style={st.input} value={s.visaCount} min={0} onChange={e => updateStudy('visaCount', +e.target.value||0)} /></FGs>
                </div>
              )}
              <Toggle checked={s.includePK} onChange={v => updateStudy('includePK', v)} label="Patient Kindness" desc="High-touch dedicated support" />
              {s.includePK && (
                <div style={{ paddingLeft: 12, borderLeft: '2px solid #B2EBF2', marginBottom: 10 }}>
                  <FGs label="Hrs/Visit"><input type="number" style={st.input} value={s.pkHoursPerVisit} min={0} step={0.25} onChange={e => updateStudy('pkHoursPerVisit', +e.target.value||0)} /></FGs>
                </div>
              )}
            </Card>

            <Card title="Pricing Schedule">
              <select style={st.input} value={s.specialClient} onChange={e => updateStudy('specialClient', e.target.value)}>
                <option value="None">Standard</option><option value="BMS">BMS</option>
              </select>
            </Card>

            <Card title="Internal Notes">
              <textarea style={{ ...st.input, minHeight: 100, resize: 'vertical', lineHeight: 1.6 }} value={meta.notes} onChange={e => updateMeta('notes', e.target.value)} placeholder="Pricing rationale, client conversations, exceptions..." />
              <div style={{ marginTop: 8 }}>
                <Toggle checked={meta.includeNotesInProposal} onChange={v => updateMeta('includeNotesInProposal', v)} label="Include in Proposal" desc="Notes appear in customer-facing output" />
              </div>
            </Card>
          </div>
        )}

        {/* ── MAIN CONTENT ── */}
        <div>
          {!isProposalView && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 12 }}>
                <KPI label="Setup" value={usd(f.totalSetup)} color="#00BCD4" />
                <KPI label="Monthly" value={usd(f.totalMonthly)} color="#00838F" />
                <KPI label={`${s.studyMonths} Mo. Fees`} value={usd(f.totalMonthlyAll)} color="#1A2332" />
                <KPI label="TCV" value={usd(f.tcv)} color="#00838F" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 0 }}>
                <AssumptionsPanel study={s} fees={f} />
                <UnitPricesPanel study={s} fees={f} />
              </div>
            </>
          )}
          {view === 'internal' && <InternalView study={s} fees={f} discountFootnotes={discountFootnotes} suggestions={meta.suggestions} extractedFields={meta.extractedFields} />}
          {view === 'customer' && <CustomerView study={s} fees={f} meta={meta} discountFootnotes={discountFootnotes} />}
          {view === 'proposal' && <ProposalView study={s} fees={f} meta={meta} discountFootnotes={discountFootnotes} />}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════

function Card({ title, accent, badge, children }) {
  return (
    <div style={st.card}>
      <div style={{ ...st.cardHeader, ...(accent ? { background: 'linear-gradient(135deg,rgba(0,188,212,.04),rgba(178,235,242,.12))' } : {}) }}>
        <h3 style={st.cardTitle}>{title}</h3>
        {badge && <span style={st.badge}>{badge}</span>}
      </div>
      <div style={st.cardBody}>{children}</div>
    </div>
  );
}
function FG({ label, children }) { return <div style={{ marginBottom: 10 }}><label style={st.label}>{label}</label>{children}</div>; }
function FGs({ label, children }) { return <div style={{ marginBottom: 6 }}><label style={st.label}>{label}</label>{children}</div>; }

function Toggle({ checked, onChange, label, desc }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10, cursor: 'pointer' }} onClick={() => onChange(!checked)}>
      <div style={{ width: 36, height: 20, borderRadius: 10, background: checked ? '#00BCD4' : '#CBD5E0', position: 'relative', flexShrink: 0, marginTop: 1 }}>
        <div style={{ width: 16, height: 16, borderRadius: 8, background: '#fff', position: 'absolute', top: 2, left: checked ? 18 : 2, transition: 'left .15s', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }} />
      </div>
      <div><div style={{ fontSize: 13, fontWeight: 700, color: '#1A2332' }}>{label}</div><div style={{ fontSize: 11, color: '#718096' }}>{desc}</div></div>
    </div>
  );
}

function KPI({ label, value, color }) {
  return (
    <div style={st.kpi}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color }} />
      <div style={{ fontSize: 10, fontWeight: 700, color: '#718096', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color: '#1A2332', fontFamily: 'Consolas,monospace' }}>{value}</div>
    </div>
  );
}

function Line({ label, sub, value }) { return <div style={st.line}><div><span style={st.lineLabel}>{label}</span>{sub && <span style={st.lineSub}>{sub}</span>}</div><span style={st.lineValue}>{value}</span></div>; }
function LineHL({ label, value }) { return <div style={st.line}><span style={{ ...st.lineLabel, fontWeight: 700, color: '#1A2332' }}>{label}</span><span style={{ ...st.lineValue, fontWeight: 700, color: '#00838F' }}>{value}</span></div>; }
function LineSub({ text }) { return <div style={{ ...st.line, paddingLeft: 14 }}><span style={st.lineSub}>{text}</span></div>; }
function Total({ label, value, large }) { return <div style={st.total}><span style={{ fontSize: large ? 15 : 13, fontWeight: 800, color: '#1A2332' }}>{label}</span><span style={{ fontSize: large ? 18 : 15, fontWeight: 800, fontFamily: 'Consolas,monospace', color: '#00838F' }}>{value}</span></div>; }

function Footnotes({ items, title }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginTop: 12, padding: '10px 12px', background: '#F8FAFC', borderRadius: 8, borderLeft: '3px solid #CBD5E0' }}>
      {title && <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>{title}</div>}
      {items.map((note, i) => (
        <div key={i} style={{ fontSize: 11, color: '#64748B', lineHeight: 1.6, marginBottom: 3 }}>
          <sup style={{ fontWeight: 700, color: '#94A3B8' }}>{i + 1}</sup> {note}
        </div>
      ))}
    </div>
  );
}

function AssumptionsPanel({ study: s, fees: f }) {
  const items = [
    { l: 'Sites Supported', v: Math.round(f.sitesS), n: `${s.sites} × ${s.siteAdoption}%` },
    { l: 'Patients Supported', v: Math.round(f.ptsS), n: `${s.patients} × ${s.siteAdoption}%` },
    { l: 'Caregivers Supported', v: Math.round(f.cgS), n: `${s.caregivers} × ${s.siteAdoption}%` },
    { l: 'Total Participants', v: Math.round(f.totalP), n: `${Math.round(f.ptsS)} + ${Math.round(f.cgS)}` },
    { l: 'Total Visits', v: Math.round(f.ptsS * s.visitsPerPatient), n: `${Math.round(f.ptsS)} × ${s.visitsPerPatient}` },
  ];
  if (s.includeConcierge) { items.push({ l: 'LD Travelers', v: Math.round(f.ldT), n: `${Math.round(f.ptsS)} × ${s.pctLDTravel}%` }); items.push({ l: 'Itineraries', v: Math.round(f.itin), n: `${Math.round(f.ldT)} × ${s.tripsPerPatient}` }); }
  if (s.includePK) items.push({ l: 'PK Hours', v: Math.round(f.pkHrs), n: `${Math.round(f.ptsS)} × ${s.visitsPerPatient} × ${s.pkHoursPerVisit}` });
  return (
    <Card title="Computed Assumptions" badge="Live">
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0', borderBottom: i < items.length - 1 ? '1px solid #F0F0F0' : 'none' }}>
          <div><span style={{ fontSize: 12, color: '#4A5568' }}>{it.l}</span><span style={{ fontSize: 10, color: '#A0AEC0', marginLeft: 6 }}>{it.n}</span></div>
          <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'Consolas,monospace', color: '#1A2332' }}>{it.v.toLocaleString()}</span>
        </div>
      ))}
    </Card>
  );
}

function UnitPricesPanel({ study: s, fees: f }) {
  const p = f.p;
  const sections = [
    { t: 'Setup', items: [{ l: 'System Setup', p: p.systemSetup }, { l: 'Tax Mgmt', p: p.taxMgmt }, { l: 'In-Person IM', p: p.ipIM, u: '/event' }, { l: 'Virtual IM', p: p.vIM, u: '/event' }] },
    { t: 'Monthly', items: [{ l: 'Platform', p: p.monthlyPlatform, u: '/mo' }, { l: 'Per Country', p: p.monthlyCountry, u: '/mo', d: f.dC, e: f.eC }, { l: 'Per Site', p: p.monthlySite, u: '/mo', d: f.dS, e: f.eS }, { l: 'Per Participant', p: p.monthlyParticipant, u: '/mo', d: f.dP, e: f.eP }, { l: 'Screen Fail', p: p.flatScreenFail, u: '/flat', d: f.dSF, e: f.eSF }] },
  ];
  if (s.includeConcierge) sections.push({ t: 'Concierge', items: [{ l: 'Setup', p: p.conciergeSetup }, { l: 'Monthly', p: p.conciergeMonthly, u: '/mo' }, { l: 'Booking', p: p.conciergeBooking, u: '/ea' }, { l: 'Visa', p: p.conciergeVisa, u: '/ea' }] });
  if (s.includePK) sections.push({ t: 'Patient Kindness', items: [{ l: 'Setup', p: p.pkSetup }, { l: 'Hourly', p: p.pkRate, u: '/hr' }, { l: 'Monthly', p: p.pkMonthly, u: '/mo' }] });
  return (
    <Card title="Unit Prices" badge={s.specialClient !== 'None' ? s.specialClient : 'Standard'}>
      {sections.map((sec, si) => (
        <div key={si} style={{ marginBottom: si < sections.length - 1 ? 12 : 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#A0AEC0', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>{sec.t}</div>
          {sec.items.map((it, ii) => (
            <div key={ii} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
              <span style={{ fontSize: 12, color: '#4A5568' }}>{it.l}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {it.d > 0 && <span style={{ fontSize: 10, color: '#38A169', fontWeight: 600 }}>-{pct(it.d)}</span>}
                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'Consolas,monospace', color: it.d > 0 ? '#38A169' : '#1A2332' }}>{usd2(it.e !== undefined ? it.e : it.p)}</span>
                {it.u && <span style={{ fontSize: 10, color: '#A0AEC0' }}>{it.u}</span>}
              </div>
            </div>
          ))}
        </div>
      ))}
    </Card>
  );
}

function ProtocolUploader({ onExtract }) {
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState('');
  const fileRef = useRef(null);
  const handleFile = async (file) => {
    if (!file) return;
    setProcessing(true); setStatus('Uploading & analyzing...');
    try { await onExtract(file); setStatus('✓ Extracted!'); setTimeout(() => setStatus(''), 4000); }
    catch (e) { setStatus('Error: ' + e.message); }
    setProcessing(false);
  };
  return (
    <Card title="Protocol Upload" badge="AI">
      <div style={{ border: `2px dashed ${dragging ? '#00BCD4' : '#E2E8F0'}`, borderRadius: 10, padding: 16, textAlign: 'center', background: dragging ? '#E0F7FA' : '#FAFBFC', cursor: processing ? 'wait' : 'pointer' }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => !processing && fileRef.current?.click()}>
        {processing ? <div style={{ fontSize: 12, color: '#4A5568' }}>{status}</div> : <>
          <div style={{ fontSize: 18, marginBottom: 2 }}>📄</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#4A5568' }}>Drop protocol PDF here</div>
          <div style={{ fontSize: 11, color: '#A0AEC0' }}>or click to browse · any size</div>
        </>}
      </div>
      <input ref={fileRef} type="file" accept=".pdf,.png,.jpg" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
      {status && !processing && <div style={{ marginTop: 6, fontSize: 11, fontWeight: 600, color: status.includes('✓') ? '#38A169' : '#E53E3E' }}>{status}</div>}
    </Card>
  );
}

// ── Fee Breakdown Views ──

function InternalView({ study: s, fees: f, discountFootnotes, suggestions, extractedFields }) {
  return (
    <div>
      <Card title="Mural Link Core" badge="Required" accent>
        <div style={st.secTitle}>Setup</div>
        <Line label="System Setup" value={usd(f.p.systemSetup)} />
        <Line label="Tax Management" value={usd(f.p.taxMgmt)} />
        {s.inPersonIMs > 0 && <Line label={`In-Person IM (×${s.inPersonIMs})`} value={usd(f.p.ipIM * s.inPersonIMs)} />}
        {s.virtualIMs > 0 && <Line label={`Virtual IM (×${s.virtualIMs})`} value={usd(f.p.vIM * s.virtualIMs)} />}
        <Total label="Core Setup" value={usd(f.setupCore)} />
        <div style={{ ...st.secTitle, marginTop: 14 }}>Monthly</div>
        <Line label="Platform" sub="fixed" value={usd(f.mPlat)} />
        <Line label="Country" sub={`${usd2(f.eC)} × ${s.countriesExUS}`} value={usd(f.mCountry)} />
        {f.dC > 0 && <LineSub text={`↳ ${pct(f.dC)} volume discount ¹`} />}
        <Line label="Site" sub={`${usd2(f.eS)} × ${f.sitesS.toFixed(1)}`} value={usd(f.mSite)} />
        {f.dS > 0 && <LineSub text={`↳ ${pct(f.dS)} volume discount ²`} />}
        <Line label="Participant" sub={`${usd2(f.eP)} × ${f.totalP.toFixed(1)}`} value={usd(f.mPt)} />
        {f.dP > 0 && <LineSub text={`↳ ${pct(f.dP)} volume discount ³`} />}
        <Line label="Screen Fail" sub={`${usd2(f.eSF)} × ${s.screenFails} ÷ ${s.studyMonths}mo`} value={usd2(f.mSF)} />
        {f.dSF > 0 && <LineSub text={`↳ ${pct(f.dSF)} volume discount ⁴`} />}
        <Total label="Monthly Core" value={usd(f.monthlyCore)} />
        <LineHL label={`× ${s.studyMonths} months`} value={usd(f.monthlyCore * s.studyMonths)} />
        <Footnotes items={discountFootnotes} title="Volume Discount Details" />
      </Card>

      {s.includeConcierge && (
        <Card title="Concierge Travel" badge="Add-On">
          <Line label="Setup" value={usd(f.cSetup)} /><Line label="Monthly Platform" value={usd(f.cMPlat)} />
          <Line label="Bookings" sub={`$75 × ${Math.round(f.itin)} itin ÷ ${s.studyMonths}mo`} value={usd2(f.cBook)} />
          <Total label="Monthly Concierge" value={usd(f.cMonthly)} />
          {s.visaCount > 0 && <Line label={`Visas (×${s.visaCount})`} value={usd(f.cVisa)} />}
          <div style={st.note}>{Math.round(f.ldT)} LD travelers · {Math.round(f.itin)} itineraries</div>
        </Card>
      )}

      {s.includePK && (
        <Card title="Patient Kindness" badge="Add-On">
          <Line label="Setup" value={usd(f.pkSetup)} /><Line label="Monthly Platform" value={usd(f.pkPlat)} />
          <Line label="PK Support" sub={`${Math.round(f.pkHrs)} hrs × $250/hr ÷ ${s.studyMonths}mo`} value={usd2(f.pkSupport)} />
          <Total label="Monthly PK" value={usd(f.pkMo)} />
        </Card>
      )}

      <Card title="Contract Summary">
        <LineHL label="Total Setup" value={usd(f.totalSetup)} />
        <LineHL label={`Monthly × ${s.studyMonths} mo`} value={usd(f.totalMonthlyAll)} />
        {f.cVisa > 0 && <Line label="Visa Support" value={usd(f.cVisa)} />}
        <Total label="Total Contract Value" value={usd(f.tcv)} large />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
          {[['Monthly', usd(f.totalMonthly)], ['Per Pt/Mo', f.ptsS > 0 ? usd2(f.totalMonthly / f.ptsS) : '—'], ['Per Site/Mo', f.sitesS > 0 ? usd2(f.totalMonthly / f.sitesS) : '—']].map(([l, v], i) => (
            <div key={i} style={{ padding: '8px 10px', background: '#F0F9FA', borderRadius: 6, textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#718096', textTransform: 'uppercase', marginBottom: 2 }}>{l}</div>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Consolas,monospace', color: '#1A2332' }}>{v}</div>
            </div>
          ))}
        </div>
      </Card>

      {extractedFields?.length > 0 && suggestions?.length > 0 && <CollapsibleSuggestions suggestions={suggestions} />}
    </div>
  );
}

function CollapsibleSuggestions({ suggestions }) {
  const [open, setOpen] = useState(false);
  if (!suggestions || suggestions.length === 0) return null;
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden', marginBottom: 12, boxShadow: '0 1px 2px rgba(0,0,0,.03)' }}>
      <div onClick={() => setOpen(!open)} style={{ padding: '12px 16px', borderBottom: open ? '1px solid #E2E8F0' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: 'linear-gradient(135deg,rgba(245,158,11,.04),rgba(254,243,199,.2))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1A2332', margin: 0 }}>Suggestions Based on Protocol Review</h3>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: '#FFFBEB', color: '#D97706' }}>{suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''}</span>
        </div>
        <span style={{ fontSize: 14, color: '#A0AEC0', transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }}>▼</span>
      </div>
      {open && (
        <div style={{ padding: '14px 16px' }}>
          {suggestions.map((sug, i) => (
            <div key={i} style={{ padding: '8px 10px', background: '#FFFBEB', borderRadius: 6, marginBottom: 6, fontSize: 12, color: '#92400E', lineHeight: 1.5, borderLeft: '3px solid #F59E0B' }}>
              💡 {sug}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomerView({ study: s, fees: f, meta, discountFootnotes }) {
  return (
    <Card title={`Budget Summary: ${s.sponsor || 'Client'} (${s.studyName || 'Study'})`} accent>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#00838F', marginBottom: 10 }}>Mural Link Core Offering</div>
      <LineHL label="Mural Link Setup · 1 time fee" value={usd(f.setupCore)} />
      <LineHL label={`Monthly License & Support · ${s.studyMonths} Months`} value={usd(f.monthlyCore * s.studyMonths)} />
      <Line label="Tax Compliance · 1 Per Study" value={usd(f.p.taxMgmt)} />
      {s.includeConcierge && <>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#00838F', marginTop: 14, marginBottom: 10 }}>Concierge Travel</div>
        <Line label="Concierge Travel Setup" value={usd(f.cSetup)} />
        <Line label={`Travel License · ${s.studyMonths} Months`} value={usd(f.cMonthly * s.studyMonths)} />
      </>}
      {s.includePK && <>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#00838F', marginTop: 14, marginBottom: 10 }}>Patient Kindness</div>
        <Line label="PK Setup" value={usd(f.pkSetup)} />
        <Line label={`24/7/365 Support · ${s.studyMonths} Months`} value={usd(f.pkMo * s.studyMonths)} />
      </>}
      <div style={{ marginTop: 14 }}>
        <LineHL label="Total Setup Expense" value={usd(f.totalSetup)} />
        <LineHL label="Total Support Fees" value={usd(f.totalMonthlyAll)} />
        <Total label="Total Mural Health Project Budget" value={usd(f.tcv)} large />
      </div>
      <div style={st.note}>
        <strong>Assumptions:</strong> Site Adoption: {s.siteAdoption}% · Sites: ~{Math.round(f.sitesS)} · Countries: {s.countriesExUS} · Patients: ~{Math.round(f.ptsS)} · Screen Fails: {s.screenFails}
        {s.includeConcierge && ` · LD Travelers: ~${Math.round(f.ldT)} (${s.pctLDTravel}%)`}
      </div>
      <Footnotes items={discountFootnotes} title="Applied Discounts" />
      {meta.includeNotesInProposal && meta.notes && <div style={{ ...st.note, marginTop: 10, background: '#FFFBEB', borderLeft: '3px solid #ECC94B' }}><strong>Notes:</strong> {meta.notes}</div>}
      <p style={{ marginTop: 10, fontSize: 10, color: '#A0AEC0', fontStyle: 'italic' }}>Valid for 6 months.</p>
    </Card>
  );
}

function ProposalView({ study: s, fees: f, meta, discountFootnotes }) {
  const R = ({ label, value, indent }) => (
    <tr><td style={{ padding: '6px 0 6px ' + (indent ? '12px' : '0'), color: '#4A5568', fontSize: 13 }}>{label}</td><td style={{ textAlign: 'right', fontFamily: 'Consolas,monospace', fontWeight: 600, fontSize: 13 }}>{value}</td></tr>
  );
  const Section = ({ label }) => (
    <tr><td colSpan="2" style={{ padding: '12px 0 4px', fontWeight: 700, color: '#00838F', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</td></tr>
  );
  const displayName = meta.proposalName || s.studyName || '[Study Name]';

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ background: 'linear-gradient(135deg,#1A2332,#00838F)', borderRadius: '14px 14px 0 0', padding: '32px 40px', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={st.dots}>{['#FF6B6B','#F6AD55','#00BCD4','#805AD5'].map((c, i) => <div key={i} style={{ ...st.dot, background: c }} />)}</div>
          <span style={{ fontSize: 16, fontWeight: 800 }}>mural<span style={{ fontWeight: 400 }}>health</span></span>
        </div>
        <h1 style={{ margin: '0 0 4px', fontSize: 28, fontWeight: 800 }}>Pricing Proposal</h1>
        <p style={{ margin: 0, fontSize: 14, opacity: .7 }}>Prepared for: <strong style={{ opacity: 1 }}>{s.sponsor || '[Client]'}</strong></p>
        <p style={{ margin: '4px 0 0', fontSize: 13, opacity: .6 }}>{displayName} · {meta.proposalNumber} · v{meta.version} · {new Date().toLocaleDateString()}</p>
      </div>
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderTop: 'none', borderRadius: '0 0 14px 14px', padding: '32px 40px' }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: '#1A2332', margin: '0 0 20px', paddingBottom: 10, borderBottom: '2px solid #00BCD4' }}>Budget Summary</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 700, color: '#1A2332', borderBottom: '2px solid #1A2332', fontSize: 13 }}>Fee Description</th><th style={{ textAlign: 'right', padding: '8px 0', fontWeight: 700, color: '#1A2332', borderBottom: '2px solid #1A2332', fontSize: 13 }}>Amount</th></tr></thead>
          <tbody>
            <Section label="Mural Link Core" />
            <R label="Mural Link Setup (one-time)" value={usd(f.setupCore)} indent />
            <R label={`Monthly License & Support (${s.studyMonths} months)`} value={usd(f.monthlyCore * s.studyMonths)} indent />
            <R label="Tax Compliance (per study)" value={usd(f.p.taxMgmt)} indent />
            {s.includeConcierge && <><Section label="Concierge Travel" /><R label="Setup (one-time)" value={usd(f.cSetup)} indent /><R label={`Travel License (${s.studyMonths} months)`} value={usd(f.cMonthly * s.studyMonths)} indent />{s.visaCount > 0 && <R label={`Visa Support (${s.visaCount})`} value={usd(f.cVisa)} indent />}</>}
            {s.includePK && <><Section label="Patient Kindness" /><R label="Setup (one-time)" value={usd(f.pkSetup)} indent /><R label={`24/7/365 Support (${s.studyMonths} months)`} value={usd(f.pkMo * s.studyMonths)} indent /></>}
            <tr style={{ borderTop: '2px solid #1A2332' }}><td style={{ padding: '10px 0', fontWeight: 700 }}>Total Setup</td><td style={{ textAlign: 'right', fontFamily: 'Consolas,monospace', fontWeight: 700, padding: '10px 0' }}>{usd(f.totalSetup)}</td></tr>
            <tr style={{ borderTop: '2px solid #1A2332' }}><td style={{ padding: '10px 0', fontWeight: 700 }}>Total Support Fees</td><td style={{ textAlign: 'right', fontFamily: 'Consolas,monospace', fontWeight: 700, padding: '10px 0' }}>{usd(f.totalMonthlyAll)}</td></tr>
            <tr><td style={{ padding: '14px 0', fontWeight: 800, fontSize: 16, color: '#00838F' }}>Total Project Budget</td><td style={{ textAlign: 'right', fontFamily: 'Consolas,monospace', fontWeight: 800, fontSize: 20, color: '#00838F', padding: '14px 0' }}>{usd(f.tcv)}</td></tr>
          </tbody>
        </table>

        <div style={{ marginTop: 28, paddingTop: 16, borderTop: '1px solid #E2E8F0' }}>
          <h3 style={{ fontSize: 12, fontWeight: 700, color: '#1A2332', margin: '0 0 10px', textTransform: 'uppercase' }}>Key Assumptions</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 20px', fontSize: 12, color: '#4A5568', lineHeight: 1.8 }}>
            <div>Site Adoption: {s.siteAdoption}%</div><div>Duration: {s.studyMonths} months</div>
            <div>Sites: ~{Math.round(f.sitesS)}</div><div>Visits: {s.visitsPerPatient}</div>
            <div>Countries (Ex-US): {s.countriesExUS}</div><div>Patients: ~{Math.round(f.ptsS)}</div>
            {s.includeConcierge && <><div>LD Travelers: ~{Math.round(f.ldT)}</div><div>Visas: {s.visaCount}</div></>}
          </div>
        </div>

        <Footnotes items={discountFootnotes} title="Applied Volume Discounts" />

        {meta.includeNotesInProposal && meta.notes && (
          <div style={{ marginTop: 16, padding: '12px 16px', background: '#F7FAFC', borderRadius: 8, borderLeft: '3px solid #00BCD4' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#1A2332', marginBottom: 4, textTransform: 'uppercase' }}>Additional Notes</div>
            <div style={{ fontSize: 12, color: '#4A5568', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{meta.notes}</div>
          </div>
        )}

        <div style={st.note}><strong>PMB Note:</strong> Participant Management Budget estimated separately. Unused funds returned at close out.</div>
        <p style={{ marginTop: 16, fontSize: 11, color: '#A0AEC0', fontStyle: 'italic' }}>Valid for 6 months.</p>
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={st.dots}>{['#FF6B6B','#F6AD55','#00BCD4','#805AD5'].map((c, i) => <div key={i} style={{ ...st.dot, width: 4, height: 14, background: c }} />)}</div>
          <div style={{ fontSize: 12, color: '#4A5568' }}><strong>Paul Diercksen</strong> · VP, Business Development · 732-966-5690 · paul@muralhealth.com</div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
const st = {
  btnPrimary: { padding: '8px 18px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, background: '#00BCD4', color: '#fff', cursor: 'pointer' },
  btnOutline: { padding: '7px 16px', border: '1px solid rgba(0,188,212,.4)', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'transparent', color: '#00BCD4', cursor: 'pointer' },
  btnGhost: { padding: '7px 16px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'transparent', color: '#718096', cursor: 'pointer' },
  btnGhostSm: { padding: '4px 10px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 10, fontWeight: 600, background: 'transparent', color: '#718096', cursor: 'pointer' },
  btnDangerSm: { padding: '4px 10px', border: '1px solid #FED7D7', borderRadius: 6, fontSize: 10, fontWeight: 600, background: 'transparent', color: '#E53E3E', cursor: 'pointer' },
  card: { background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,.03)', marginBottom: 12 },
  cardHeader: { padding: '12px 16px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 13, fontWeight: 700, color: '#1A2332', margin: 0 },
  cardBody: { padding: '14px 16px' },
  badge: { fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: '#E0F7FA', color: '#00838F' },
  label: { display: 'block', fontSize: 10, fontWeight: 700, color: '#718096', marginBottom: 3, letterSpacing: '.04em', textTransform: 'uppercase' },
  input: { width: '100%', padding: '7px 10px', border: '1.5px solid #E2E8F0', borderRadius: 7, fontSize: 13, background: '#fff', color: '#1A2332', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  kpi: { background: '#fff', borderRadius: 10, padding: '13px 14px', border: '1px solid #E2E8F0', position: 'relative', overflow: 'hidden' },
  line: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '5px 0' },
  lineLabel: { fontSize: 12, color: '#4A5568' },
  lineSub: { fontSize: 10, color: '#A0AEC0', marginLeft: 5 },
  lineValue: { fontSize: 12, fontWeight: 500, fontFamily: 'Consolas,monospace', color: '#1A2332' },
  total: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 0 3px', borderTop: '2px solid rgba(0,188,212,.2)', marginTop: 3 },
  secTitle: { fontSize: 10, fontWeight: 700, color: '#718096', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 },
  note: { marginTop: 8, padding: '8px 10px', background: '#F0F9FA', borderRadius: 6, fontSize: 10, color: '#718096', lineHeight: 1.6 },
  dots: { display: 'flex', gap: 2 },
  dot: { width: 5, height: 16, borderRadius: 2.5 },
  proposalCard: { background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'center', cursor: 'pointer', transition: 'box-shadow .15s', marginBottom: 8 },
};
