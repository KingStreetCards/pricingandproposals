-- ═══════════════════════════════════════════════════════════════
-- MURAL HEALTH PRICING ENGINE — Admin Features Migration
-- Run this in Supabase SQL Editor AFTER the initial schema.sql
-- ═══════════════════════════════════════════════════════════════

-- ── Update profiles table to support admin features ──
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('pending', 'active', 'suspended'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES profiles(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;

-- ── User Invitations ──
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'sales' CHECK (role IN ('admin', 'sales', 'viewer')),
  invited_by UUID NOT NULL REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days')
);

CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(status);

-- ── Discount Requests (for approval workflow) ──
CREATE TABLE IF NOT EXISTS discount_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES profiles(id),
  category TEXT NOT NULL,
  current_rate NUMERIC(5,4) NOT NULL,
  requested_rate NUMERIC(5,4) NOT NULL,
  justification TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discount_requests_status ON discount_requests(status);
CREATE INDEX IF NOT EXISTS idx_discount_requests_proposal ON discount_requests(proposal_id);

-- ── Update the handle_new_user function to check invitations and admin_emails ──
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  admin_list TEXT;
  invite_record RECORD;
  user_role TEXT := 'sales';
  user_status TEXT := 'pending';
BEGIN
  -- Check if user is in the admin_emails config
  SELECT value INTO admin_list FROM public.config WHERE key = 'admin_emails';
  IF admin_list IS NOT NULL AND position(NEW.email IN admin_list) > 0 THEN
    user_role := 'admin';
    user_status := 'active';
  END IF;

  -- Check if there's a pending invitation for this email
  SELECT * INTO invite_record FROM public.invitations
    WHERE email = NEW.email AND status = 'pending' AND expires_at > now()
    ORDER BY created_at DESC LIMIT 1;

  IF invite_record IS NOT NULL THEN
    user_role := invite_record.role;
    user_status := 'active';  -- Invited users are auto-approved

    -- Mark invitation as accepted
    UPDATE public.invitations SET status = 'accepted' WHERE id = invite_record.id;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, status, invited_by, invited_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email),
    user_role,
    user_status,
    invite_record.invited_by,
    CASE WHEN invite_record IS NOT NULL THEN invite_record.created_at ELSE NULL END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── RLS Policies for new tables ──

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_requests ENABLE ROW LEVEL SECURITY;

-- Invitations: admins can manage, others can view their own
CREATE POLICY "invitations_admin_all" ON invitations FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "invitations_self_select" ON invitations FOR SELECT USING (
  email = (SELECT email FROM profiles WHERE id = auth.uid())
);

-- Discount requests: authenticated users can create, admins can manage
CREATE POLICY "discount_requests_select" ON discount_requests FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "discount_requests_insert" ON discount_requests FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "discount_requests_admin_update" ON discount_requests FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Update profiles policy: admins can update any profile
CREATE POLICY "profiles_admin_update" ON profiles FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ── Set Sam as initial admin ──
-- This will take effect when sam@muralhealth.com first signs in
INSERT INTO config (key, value) VALUES ('admin_emails', 'sam@muralhealth.com')
ON CONFLICT (key) DO UPDATE SET value = 'sam@muralhealth.com';

-- ── Allow admins to delete rate cards and volume discounts ──
CREATE POLICY "rate_cards_admin_delete" ON rate_cards FOR DELETE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "discounts_admin_delete" ON volume_discounts FOR DELETE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "discounts_admin_insert" ON volume_discounts FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
