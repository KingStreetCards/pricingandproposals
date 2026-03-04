'use client';

/**
 * Data Dictionary — explains every field in the pricing engine database.
 * Used in the Admin panel to help users understand the data model.
 */

export const DATA_DICTIONARY = [
  { category: 'Study Profile', fields: [
    { name: 'proposal_name', label: 'Proposal Name', type: 'Text', description: 'A user-defined name for the opportunity/proposal. Can be different from the sponsor or study name. Used as the primary display name in the dashboard.' },
    { name: 'proposal_number', label: 'Proposal Number', type: 'Auto-generated', description: 'Unique identifier assigned automatically (e.g., MH001). Used for tracking and reference in communications with sponsors.' },
    { name: 'sponsor', label: 'Sponsor', type: 'Text', description: 'The pharmaceutical or biotech company commissioning the clinical trial. This is the customer who will be billed for Mural Health services.' },
    { name: 'study_name', label: 'Study Name', type: 'Text', description: 'The protocol name or number assigned to the clinical trial (e.g., "KEYNOTE-789" or "Phase III NSCLC Study"). Typically provided in the protocol document.' },
    { name: 'phase', label: 'Phase', type: 'Selection', description: 'The clinical trial phase (I, I/II, II, II/III, III, III/IV, IV). Determines study complexity and typical duration. Earlier phases tend to have fewer patients and sites; Phase III studies are typically the largest.' },
    { name: 'therapeutic_area', label: 'Therapeutic Area', type: 'Text', description: 'The disease area being studied (e.g., Oncology, Cardiology, Rare Disease). Affects patient burden, visit complexity, and likelihood of needing concierge travel or Patient Kindness support.' },
  ]},
  { category: 'Study Parameters', fields: [
    { name: 'patients', label: 'Patients', type: 'Number', description: 'The total number of patients (subjects) planned for enrollment in the study. This is the contracted/target enrollment, not the number currently enrolled. Drives per-participant monthly fees and volume discounts.' },
    { name: 'caregivers', label: 'Caregivers', type: 'Number', description: 'The number of caregivers who will be supported through the platform. Common in pediatric studies, rare disease, or studies involving elderly patients. Each caregiver counts as a participant for billing purposes.' },
    { name: 'screen_fails', label: 'Screen Fails', type: 'Number', description: 'Expected number of patients who will be screened but not enrolled (fail screening criteria). Screen fails incur a flat fee that is amortized (spread evenly) across the study duration as a monthly cost.' },
    { name: 'countries_ex_us', label: 'Countries (ex-US)', type: 'Number', description: 'Number of countries outside the United States where the trial will run. Each additional country incurs a monthly per-country fee for localization, compliance, and support. Does not include the US.' },
    { name: 'sites', label: 'Sites', type: 'Number', description: 'A "site" is a clinical research center — typically a hospital, clinic, or academic medical center — where patients are seen and treated as part of the trial. Total number of contracted sites, before adoption rate adjustment.' },
    { name: 'site_adoption_pct', label: 'Site Adoption %', type: 'Percentage', description: 'The percentage of contracted sites expected to actually onboard and use the Mural Link platform. Not all contracted sites will adopt — some may use alternative processes. A 75% adoption rate on 100 sites means 75 sites are "supported" for billing.' },
    { name: 'study_months', label: 'Study Months', type: 'Number', description: 'Total duration of the study in months, from first patient enrolled to last patient last visit. This is the billing period for all monthly fees. Longer studies generate more monthly revenue but also more patient burden.' },
    { name: 'visits_per_patient', label: 'Visits per Patient', type: 'Number', description: 'The average number of clinical visits each patient will complete during the study. Drives Patient Kindness (PK) hours calculation. Found in the protocol\'s Schedule of Assessments or visit schedule.' },
  ]},
  { category: 'Investigator Meetings', fields: [
    { name: 'in_person_ims', label: 'In-Person IMs', type: 'Number', description: 'Number of in-person Investigator Meetings. These are large training events where all site investigators gather to review the protocol. Charged as a one-time setup fee per meeting. Typically 0-2 per study.' },
    { name: 'virtual_ims', label: 'Virtual IMs', type: 'Number', description: 'Number of virtual Investigator Meetings conducted remotely. Lower cost than in-person but still a setup fee. Used for protocol training, system demos, or mid-study updates.' },
  ]},
  { category: 'Concierge Travel (Add-On)', fields: [
    { name: 'include_concierge', label: 'Include Concierge', type: 'Boolean', description: 'Whether to include the Concierge Travel add-on service. Provides 24/7/365 travel booking for patients who need to travel for trial visits — flights, hotels, rental cars, rail, and black car services.' },
    { name: 'pct_ld_travel', label: '% Long-Distance Travel', type: 'Percentage', description: 'Percentage of supported patients who require long-distance (LD) travel to reach their clinical site. These patients need flights, hotels, etc. rather than just rideshare. A 20% LD rate on 150 patients = 30 LD travelers.' },
    { name: 'trips_per_patient', label: 'Trips per Patient', type: 'Number', description: 'Average number of round-trip travel itineraries per LD traveler across the full study. Each trip = one booking through the concierge service. 10 trips × 30 LD travelers = 300 total itineraries.' },
    { name: 'visa_count', label: 'Visa Count', type: 'Number', description: 'Number of travel visas that need to be arranged for patients traveling internationally. Each visa incurs a one-time fee for processing and coordination. Common in global oncology studies.' },
  ]},
  { category: 'Patient Kindness (Add-On)', fields: [
    { name: 'include_pk', label: 'Include PK', type: 'Boolean', description: 'Whether to include the Patient Kindness add-on. Provides dedicated, high-touch support with a single point of contact for patients and caregivers who need extra assistance — available 24/7.' },
    { name: 'pk_hours_per_visit', label: 'PK Hours per Visit', type: 'Number', description: 'Estimated hours of Patient Kindness support needed per patient visit. Typical range is 0.25-1.0 hours. Higher for complex visits, rare disease, or pediatric studies. Total PK hours = patients × visits × hours/visit.' },
  ]},
  { category: 'Pricing & Discounts', fields: [
    { name: 'special_client', label: 'Pricing Schedule', type: 'Selection', description: 'Which pricing schedule to use. "Standard" uses the default rate card with volume discounts. "BMS" uses a custom rate card negotiated specifically for Bristol-Myers Squibb with different per-unit rates. Volume discounts are disabled for special client pricing.' },
    { name: 'setup_fees', label: 'Setup Fees', type: 'Calculated', description: 'Total one-time fees including system setup, tax management, investigator meetings, and any add-on setup fees. Charged at contract signing.' },
    { name: 'monthly_fee', label: 'Monthly Fee', type: 'Calculated', description: 'Total recurring monthly fee including platform, per-country, per-site, per-participant, amortized screen fails, and any add-on monthly fees.' },
    { name: 'tcv', label: 'Total Contract Value', type: 'Calculated', description: 'The total value of the contract: Setup Fees + (Monthly Fee × Study Months) + Visa Fees. This is the headline number presented to the sponsor in the proposal.' },
  ]},
  { category: 'Metadata', fields: [
    { name: 'status', label: 'Status', type: 'Selection', description: 'Pipeline stage: Draft (in progress), Submitted (sent to sponsor), Negotiating (in discussions), Won (contract signed), Lost (not awarded). Used for pipeline tracking and reporting.' },
    { name: 'version', label: 'Version', type: 'Auto-incremented', description: 'Version number of this proposal. "Save as New Version" creates v2, v3, etc. while preserving the previous version for audit trail purposes.' },
    { name: 'notes', label: 'Internal Notes', type: 'Text', description: 'Free-form notes for the internal team — pricing rationale, client conversations, exceptions, special considerations. Can optionally be included in the customer-facing proposal output.' },
    { name: 'extracted_fields', label: 'Extracted Fields', type: 'JSON Array', description: 'Tracks which study parameters were auto-populated by the AI protocol extraction feature. Used to display visual indicators showing which values came from the protocol vs. manual entry.' },
    { name: 'ai_suggestions', label: 'AI Suggestions', type: 'JSON Array', description: 'Recommendations generated by AI during protocol analysis — e.g., suggesting caregivers for pediatric studies, flagging high dropout risk, recommending concierge travel for multi-country studies.' },
  ]},
];

export default function DataDictionary() {
  return (
    <div>
      <p style={{ fontSize: 13, color: '#718096', marginBottom: 16 }}>
        Complete reference for every data field in the pricing engine. Use this to understand what each field means and how it affects pricing.
      </p>
      {DATA_DICTIONARY.map((cat, ci) => (
        <div key={ci} style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #E2E8F0', background: 'linear-gradient(135deg,rgba(0,188,212,.04),rgba(178,235,242,.12))' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1A2332', margin: 0 }}>{cat.category}</h3>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 14px', fontSize: 10, fontWeight: 700, color: '#718096', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0', background: '#FAFBFC', width: 160 }}>Field</th>
                <th style={{ textAlign: 'left', padding: '8px 14px', fontSize: 10, fontWeight: 700, color: '#718096', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0', background: '#FAFBFC', width: 100 }}>Type</th>
                <th style={{ textAlign: 'left', padding: '8px 14px', fontSize: 10, fontWeight: 700, color: '#718096', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0', background: '#FAFBFC' }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {cat.fields.map((f, fi) => (
                <tr key={fi} style={{ borderBottom: '1px solid #F0F0F0' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: '#1A2332' }}>{f.label}<div style={{ fontSize: 10, color: '#A0AEC0', fontWeight: 400, fontFamily: 'Consolas,monospace' }}>{f.name}</div></td>
                  <td style={{ padding: '10px 14px' }}><span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: '#F0F9FA', color: '#00838F' }}>{f.type}</span></td>
                  <td style={{ padding: '10px 14px', color: '#4A5568', lineHeight: 1.6 }}>{f.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
