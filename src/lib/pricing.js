// ═══════════════════════════════════════════════════════════════
// MURAL HEALTH — Pricing Calculation Engine
// Pure functions — no side effects, no dependencies
// Used by both client components and server API routes
// ═══════════════════════════════════════════════════════════════

/**
 * Standard rate card (hardcoded fallback if DB unavailable)
 * In production, these are loaded from the rate_cards table
 */
export const DEFAULT_RATES = {
  standard: {
    systemSetup: 15000, taxMgmt: 5000, monthlyPlatform: 1500,
    monthlyCountry: 250, monthlySite: 30, monthlyParticipant: 10, flatScreenFail: 25,
    ipIM: 3000, vIM: 1000,
    conciergeSetup: 15000, conciergeMonthly: 1000, conciergeBooking: 75, conciergeVisa: 1500,
    pkSetup: 12500, pkRate: 250, pkMonthly: 1500,
  },
  bms: {
    systemSetup: 15000, taxMgmt: 5000, monthlyPlatform: 1500,
    monthlyCountry: 50, monthlySite: 50, monthlyParticipant: 5, flatScreenFail: 25,
    ipIM: 1500, vIM: 1000,
    conciergeSetup: 15000, conciergeMonthly: 1000, conciergeBooking: 75, conciergeVisa: 750,
    pkSetup: 12500, pkRate: 250, pkMonthly: 1500,
  },
};

/**
 * Default volume discount schedules (fallback if DB unavailable)
 */
export const DEFAULT_DISCOUNTS = {
  Countries:      [[0,3,0],[4,7,.05],[8,11,.06],[12,15,.07],[16,19,.08],[20,9999,.1]],
  Sites:          [[0,49,0],[50,74,.05],[75,99,.075],[100,149,.1],[150,249,.125],[250,9999,.15]],
  Patients:       [[0,99,0],[100,299,.05],[300,499,.075],[500,749,.1],[750,999,.125],[1000,9999,.15]],
  'Screen Fails': [[0,99,0],[100,299,.05],[300,499,.075],[500,749,.1],[750,999,.125],[1000,9999,.15]],
};

/**
 * Look up the discount rate for a given value in a tiered schedule
 */
export function getDiscountRate(schedule, value) {
  const tier = schedule.find(([lo, hi]) => value >= lo && value <= hi);
  return tier ? tier[2] : 0;
}

/**
 * Convert rate_cards DB rows into the rates object used by calcFees
 * Maps fee_item names to the internal key names
 */
export function dbRatesToPricing(rows) {
  const map = {
    'System Setup': 'systemSetup',
    'Tax Management': 'taxMgmt',
    'Monthly Platform': 'monthlyPlatform',
    'Monthly Country (ex-US)': 'monthlyCountry',
    'Monthly Site': 'monthlySite',
    'Monthly Participant': 'monthlyParticipant',
    'Screen Fail Fee': 'flatScreenFail',
    'In-Person IM': 'ipIM',
    'Virtual IM': 'vIM',
    'Concierge Setup': 'conciergeSetup',
    'Concierge Monthly Platform': 'conciergeMonthly',
    'Concierge Per Booking': 'conciergeBooking',
    'Concierge Per Visa': 'conciergeVisa',
    'PK Setup': 'pkSetup',
    'PK Hourly Rate': 'pkRate',
    'PK Monthly Platform': 'pkMonthly',
  };

  const standard = { ...DEFAULT_RATES.standard };
  const bms = { ...DEFAULT_RATES.bms };

  rows.forEach(row => {
    const key = map[row.fee_item];
    if (key) {
      standard[key] = Number(row.standard_price);
      bms[key] = Number(row.bms_price);
    }
  });

  return { standard, bms };
}

/**
 * Convert volume_discounts DB rows into the schedules object
 */
export function dbDiscountsToPricing(rows) {
  const schedules = {};
  rows.forEach(row => {
    if (!schedules[row.category]) schedules[row.category] = [];
    schedules[row.category].push([row.min_value, row.max_value, Number(row.discount_rate)]);
  });
  // Sort each schedule by min_value
  Object.values(schedules).forEach(s => s.sort((a, b) => a[0] - b[0]));
  return schedules;
}

/**
 * Default study parameters for a new proposal
 */
export function defaultStudy() {
  return {
    sponsor: '', studyName: '', phase: 'III', ta: '',
    patients: 200, caregivers: 0, screenFails: 50,
    countriesExUS: 5, sites: 40, siteAdoption: 75,
    studyMonths: 36, visitsPerPatient: 10,
    inPersonIMs: 0, virtualIMs: 1,
    includeConcierge: false, pctLDTravel: 20, tripsPerPatient: 10, visaCount: 0,
    includePK: false, pkHoursPerVisit: 0.5,
    specialClient: 'None',
  };
}

/**
 * Core pricing calculation
 *
 * @param {Object} study - Study parameters
 * @param {Object} rates - { standard: {...}, bms: {...} } from DB or defaults
 * @param {Object} discounts - { Countries: [...], Sites: [...], ... } from DB or defaults
 * @returns {Object} Full fee breakdown
 */
export function calcFees(study, rates = DEFAULT_RATES, discounts = DEFAULT_DISCOUNTS) {
  const s = study;
  const p = s.specialClient === 'BMS' ? rates.bms : rates.standard;
  const noDisc = s.specialClient !== 'None';

  // Adoption-adjusted volumes
  const sitesS = s.sites * (s.siteAdoption / 100);
  const ptsS = s.patients * (s.siteAdoption / 100);
  const cgS = s.caregivers * (s.siteAdoption / 100);
  const totalP = ptsS + cgS;

  // Volume discounts (disabled for special clients)
  const dC  = noDisc ? 0 : getDiscountRate(discounts.Countries || [], s.countriesExUS);
  const dS  = noDisc ? 0 : getDiscountRate(discounts.Sites || [], s.sites);
  const dP  = noDisc ? 0 : getDiscountRate(discounts.Patients || [], s.patients);
  const dSF = noDisc ? 0 : getDiscountRate(discounts['Screen Fails'] || [], s.screenFails);

  // Effective unit prices after discounts
  const eC  = p.monthlyCountry * (1 - dC);
  const eS  = p.monthlySite * (1 - dS);
  const eP  = p.monthlyParticipant * (1 - dP);
  const eSF = p.flatScreenFail * (1 - dSF);

  // ── Core Setup ──
  const setupCore = p.systemSetup + p.taxMgmt + p.ipIM * s.inPersonIMs + p.vIM * s.virtualIMs;

  // ── Core Monthly ──
  const mPlat    = p.monthlyPlatform;
  const mCountry = eC * s.countriesExUS;
  const mSite    = eS * sitesS;
  const mPt      = eP * totalP;
  const mSF      = (eSF * s.screenFails) / (s.studyMonths || 1);
  const monthlyCore = mPlat + mCountry + mSite + mPt + mSF;

  // ── Concierge Travel ──
  const ldT  = ptsS * (s.pctLDTravel / 100);
  const itin = ldT * s.tripsPerPatient;

  const cSetup = s.includeConcierge ? p.conciergeSetup : 0;
  const cMPlat = s.includeConcierge ? p.conciergeMonthly : 0;
  const cBook  = s.includeConcierge ? (p.conciergeBooking * itin) / (s.studyMonths || 1) : 0;
  const cMonthly = cMPlat + cBook;
  const cVisa  = s.includeConcierge ? p.conciergeVisa * s.visaCount : 0;

  // ── Patient Kindness ──
  const pkHrs     = ptsS * s.visitsPerPatient * s.pkHoursPerVisit;
  const pkSupport = s.includePK ? (pkHrs * p.pkRate) / (s.studyMonths || 1) : 0;
  const pkPlat    = s.includePK ? p.pkMonthly : 0;
  const pkMo      = pkSupport + pkPlat;
  const pkSetup   = s.includePK ? p.pkSetup : 0;

  // ── Totals ──
  const totalSetup      = setupCore + cSetup + pkSetup;
  const totalMonthly    = monthlyCore + cMonthly + pkMo;
  const totalMonthlyAll = totalMonthly * s.studyMonths;
  const tcv             = totalSetup + totalMonthlyAll + cVisa;

  return {
    // Rate card used
    p,

    // Adjusted volumes
    sitesS, ptsS, cgS, totalP,

    // Discounts
    dC, dS, dP, dSF,

    // Effective unit prices
    eC, eS, eP, eSF,

    // Core
    setupCore, mPlat, mCountry, mSite, mPt, mSF, monthlyCore,

    // Concierge
    ldT, itin, cSetup, cMPlat, cBook, cMonthly, cVisa,

    // PK
    pkHrs, pkSupport, pkPlat, pkMo, pkSetup,

    // Totals
    totalSetup, totalMonthly, totalMonthlyAll, tcv,
  };
}

// ── Formatting helpers ──
export const fmt = {
  usd:  n => n === 0 ? '$0' : '$' + Math.round(n).toLocaleString('en-US'),
  usd2: n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  pct:  n => (n * 100).toFixed(1) + '%',
};
