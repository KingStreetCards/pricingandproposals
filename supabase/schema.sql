-- ═══════════════════════════════════════════════════════════════
-- MURAL HEALTH PRICING ENGINE — Database Schema
-- Run this in Supabase SQL Editor to set up all tables
-- ═══════════════════════════════════════════════════════════════

-- ── Enable UUID extension ──
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ═══════════════════════════════════════════════════════════════
-- PROFILES (extends Supabase auth.users)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'sales' CHECK (role IN ('admin', 'sales', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'sales'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ═══════════════════════════════════════════════════════════════
-- RATE CARDS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE rate_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fee_item TEXT NOT NULL,
  fee_type TEXT NOT NULL,
  standard_price NUMERIC(12,2) NOT NULL,
  bms_price NUMERIC(12,2) NOT NULL,
  unit TEXT,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES profiles(id)
);

CREATE INDEX idx_rate_cards_item ON rate_cards(fee_item);

-- ═══════════════════════════════════════════════════════════════
-- VOLUME DISCOUNTS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE volume_discounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category TEXT NOT NULL CHECK (category IN ('Countries', 'Sites', 'Patients', 'Screen Fails')),
  min_value INTEGER NOT NULL,
  max_value INTEGER NOT NULL,
  discount_rate NUMERIC(5,4) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES profiles(id)
);

CREATE INDEX idx_volume_discounts_category ON volume_discounts(category);

-- ═══════════════════════════════════════════════════════════════
-- PROPOSALS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE proposals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proposal_number TEXT NOT NULL UNIQUE,
  version INTEGER NOT NULL DEFAULT 1,
  parent_id UUID REFERENCES proposals(id),           -- points to previous version
  status TEXT NOT NULL DEFAULT 'Draft'
    CHECK (status IN ('Draft', 'Submitted', 'Negotiating', 'Won', 'Lost')),

  -- Study Profile
  sponsor TEXT,
  study_name TEXT,
  phase TEXT DEFAULT 'III',
  therapeutic_area TEXT,
  patients INTEGER NOT NULL DEFAULT 200,
  caregivers INTEGER NOT NULL DEFAULT 0,
  screen_fails INTEGER NOT NULL DEFAULT 50,
  countries_ex_us INTEGER NOT NULL DEFAULT 5,
  sites INTEGER NOT NULL DEFAULT 40,
  site_adoption_pct NUMERIC(5,2) NOT NULL DEFAULT 75.0,
  study_months INTEGER NOT NULL DEFAULT 36,
  visits_per_patient INTEGER NOT NULL DEFAULT 10,
  in_person_ims INTEGER NOT NULL DEFAULT 0,
  virtual_ims INTEGER NOT NULL DEFAULT 1,

  -- Add-Ons: Concierge Travel
  include_concierge BOOLEAN NOT NULL DEFAULT false,
  pct_ld_travel NUMERIC(5,2) NOT NULL DEFAULT 20.0,
  trips_per_patient INTEGER NOT NULL DEFAULT 10,
  visa_count INTEGER NOT NULL DEFAULT 0,

  -- Add-Ons: Patient Kindness
  include_pk BOOLEAN NOT NULL DEFAULT false,
  pk_hours_per_visit NUMERIC(5,2) NOT NULL DEFAULT 0.5,

  -- Pricing Schedule
  special_client TEXT NOT NULL DEFAULT 'None' CHECK (special_client IN ('None', 'BMS')),

  -- Calculated Totals (stored for reporting/filtering)
  setup_fees NUMERIC(14,2),
  monthly_fee NUMERIC(14,2),
  total_monthly_all NUMERIC(14,2),
  tcv NUMERIC(14,2),

  -- Notes
  notes TEXT,
  include_notes_in_proposal BOOLEAN NOT NULL DEFAULT false,

  -- Metadata
  created_by UUID REFERENCES profiles(id),
  updated_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_proposals_status ON proposals(status);
CREATE INDEX idx_proposals_sponsor ON proposals(sponsor);
CREATE INDEX idx_proposals_created_by ON proposals(created_by);
CREATE INDEX idx_proposals_updated_at ON proposals(updated_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- PROPOSAL VERSIONS (audit trail)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE proposal_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('Created', 'Updated', 'Status Change', 'Versioned', 'Deleted')),
  snapshot JSONB NOT NULL,                            -- full proposal data at time of save
  changed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_versions_proposal ON proposal_versions(proposal_id, version);
CREATE INDEX idx_versions_created ON proposal_versions(created_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- CONFIG (system settings)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════
-- AUTO-INCREMENT PROPOSAL NUMBERS
-- ═══════════════════════════════════════════════════════════════
CREATE SEQUENCE proposal_number_seq START WITH 1;

CREATE OR REPLACE FUNCTION generate_proposal_number()
RETURNS TEXT AS $$
BEGIN
  RETURN 'MH' || LPAD(nextval('proposal_number_seq')::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════
-- AUTO-UPDATE updated_at TRIGGER
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER proposals_updated_at
  BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER rate_cards_updated_at
  BEFORE UPDATE ON rate_cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════════════
-- ROW-LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE volume_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read all, update own
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Proposals: authenticated users can do everything
CREATE POLICY "proposals_select" ON proposals FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "proposals_insert" ON proposals FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "proposals_update" ON proposals FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "proposals_delete" ON proposals FOR DELETE USING (auth.uid() IS NOT NULL);

-- Versions: authenticated users can read; insert handled by system
CREATE POLICY "versions_select" ON proposal_versions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "versions_insert" ON proposal_versions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Rate cards: everyone reads, admins write
CREATE POLICY "rate_cards_select" ON rate_cards FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "rate_cards_update" ON rate_cards FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "rate_cards_insert" ON rate_cards FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Volume discounts: everyone reads, admins write
CREATE POLICY "discounts_select" ON volume_discounts FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "discounts_update" ON volume_discounts FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "discounts_insert" ON volume_discounts FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Config: everyone reads, admins write
CREATE POLICY "config_select" ON config FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "config_update" ON config FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ═══════════════════════════════════════════════════════════════
-- SEED DATA: Rate Card
-- ═══════════════════════════════════════════════════════════════
INSERT INTO rate_cards (fee_item, fee_type, standard_price, bms_price, unit, notes, sort_order) VALUES
  ('System Setup',              'Setup',              15000,  15000,  NULL,        'One-time',                           1),
  ('Tax Management',            'Setup',              5000,   5000,   NULL,        'One-time per study',                 2),
  ('Monthly Platform',          'Monthly (Fixed)',    1500,   1500,   '/mo',       '',                                   3),
  ('Monthly Country (ex-US)',   'Monthly (Variable)', 250,    50,     '/country/mo', 'Per country per month',           4),
  ('Monthly Site',              'Monthly (Variable)', 30,     50,     '/site/mo',  'Per supported site per month',       5),
  ('Monthly Participant',       'Monthly (Variable)', 10,     5,      '/pt/mo',    'Per supported participant per month', 6),
  ('Screen Fail Fee',           'Flat (Amortized)',   25,     25,     '/flat',     'Amortized across study months',      7),
  ('In-Person IM',              'Per Event',          3000,   1500,   '/event',    '',                                   8),
  ('Virtual IM',                'Per Event',          1000,   1000,   '/event',    '',                                   9),
  ('Concierge Setup',           'Setup',              15000,  15000,  NULL,        '',                                   10),
  ('Concierge Monthly Platform','Monthly (Fixed)',    1000,   1000,   '/mo',       '',                                   11),
  ('Concierge Per Booking',     'Per Booking',        75,     75,     '/booking',  '',                                   12),
  ('Concierge Per Visa',        'Per Visa',           1500,   750,    '/visa',     '',                                   13),
  ('PK Setup',                  'Setup',              12500,  12500,  NULL,        '',                                   14),
  ('PK Hourly Rate',            'Hourly',             250,    250,    '/hr',       '',                                   15),
  ('PK Monthly Platform',       'Monthly (Fixed)',    1500,   1500,   '/mo',       '',                                   16),
  ('Debit Card (per card)',     'Pass-Through',       5,      5,      '/card',     'No markup',                          17),
  ('Debit Card (per payment)',  'Pass-Through',       5,      5,      '/payment',  'No markup',                          18);

-- ═══════════════════════════════════════════════════════════════
-- SEED DATA: Volume Discounts
-- ═══════════════════════════════════════════════════════════════
INSERT INTO volume_discounts (category, min_value, max_value, discount_rate, sort_order) VALUES
  -- Countries
  ('Countries',     0,    3,    0.0000, 1),
  ('Countries',     4,    7,    0.0500, 2),
  ('Countries',     8,    11,   0.0600, 3),
  ('Countries',     12,   15,   0.0700, 4),
  ('Countries',     16,   19,   0.0800, 5),
  ('Countries',     20,   9999, 0.1000, 6),
  -- Sites
  ('Sites',         0,    49,   0.0000, 7),
  ('Sites',         50,   74,   0.0500, 8),
  ('Sites',         75,   99,   0.0750, 9),
  ('Sites',         100,  149,  0.1000, 10),
  ('Sites',         150,  249,  0.1250, 11),
  ('Sites',         250,  9999, 0.1500, 12),
  -- Patients
  ('Patients',      0,    99,   0.0000, 13),
  ('Patients',      100,  299,  0.0500, 14),
  ('Patients',      300,  499,  0.0750, 15),
  ('Patients',      500,  749,  0.1000, 16),
  ('Patients',      750,  999,  0.1250, 17),
  ('Patients',      1000, 9999, 0.1500, 18),
  -- Screen Fails
  ('Screen Fails',  0,    99,   0.0000, 19),
  ('Screen Fails',  100,  299,  0.0500, 20),
  ('Screen Fails',  300,  499,  0.0750, 21),
  ('Screen Fails',  500,  749,  0.1000, 22),
  ('Screen Fails',  750,  999,  0.1250, 23),
  ('Screen Fails',  1000, 9999, 0.1500, 24);

-- ═══════════════════════════════════════════════════════════════
-- SEED DATA: Config
-- ═══════════════════════════════════════════════════════════════
INSERT INTO config (key, value) VALUES
  ('default_site_adoption_pct', '75'),
  ('proposal_validity_months', '6'),
  ('company_name', 'Mural Health'),
  ('primary_contact_name', 'Paul Diercksen'),
  ('primary_contact_title', 'VP, Business Development'),
  ('primary_contact_phone', '732-966-5690'),
  ('primary_contact_email', 'paul@muralhealth.com');
