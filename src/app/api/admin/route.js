import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// Admin client with service_role key (bypasses RLS)
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Get the current user and verify they're admin
async function requireAdmin() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) { return cookieStore.get(name)?.value; },
        set(name, value, options) { cookieStore.set({ name, value, ...options }); },
        remove(name, options) { cookieStore.set({ name, value: '', ...options }); },
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = getAdminClient();
  const { data: profile } = await admin.from('profiles').select('*').eq('id', user.id).single();
  if (!profile || profile.role !== 'admin') return null;

  return { user, profile };
}

// ── GET: List users, invitations, or discount requests ──
export async function GET(request) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'users';
  const admin = getAdminClient();

  if (type === 'users') {
    const { data, error } = await admin.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (type === 'invitations') {
    const { data, error } = await admin.from('invitations').select('*, inviter:invited_by(full_name, email)').order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (type === 'discount_requests') {
    const { data, error } = await admin.from('discount_requests')
      .select('*, requester:requested_by(full_name, email), reviewer:reviewed_by(full_name, email), proposal:proposal_id(sponsor, study_name, proposal_number)')
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (type === 'proposals') {
    const { data, error } = await admin.from('proposals')
      .select('*, creator:created_by(full_name, email)')
      .order('updated_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (type === 'rate_cards') {
    const { data, error } = await admin.from('rate_cards').select('*').order('sort_order');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (type === 'volume_discounts') {
    const { data, error } = await admin.from('volume_discounts').select('*').order('sort_order');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
}

// ── POST: Invite user, approve/decline, update role, reset password ──
export async function POST(request) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const body = await request.json();
  const { action } = body;
  const admin = getAdminClient();

  // ── Invite a new user ──
  if (action === 'invite') {
    const { email, role } = body;
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

    // Create invitation record
    const { data: invitation, error: invErr } = await admin.from('invitations').insert({
      email,
      role: role || 'sales',
      invited_by: auth.user.id,
    }).select().single();

    if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 });

    // Send invitation via Supabase auth (creates user + sends email)
    const { data: inviteData, error: authErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SUPABASE_URL ? request.headers.get('origin') : 'http://localhost:3000'}/auth/callback`,
    });

    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });

    return NextResponse.json({ success: true, invitation, message: `Invitation sent to ${email}` });
  }

  // ── Update user role ──
  if (action === 'update_role') {
    const { userId, role } = body;
    if (!userId || !role) return NextResponse.json({ error: 'userId and role required' }, { status: 400 });

    const { error } = await admin.from('profiles').update({ role }).eq('id', userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  }

  // ── Approve or suspend a user ──
  if (action === 'update_status') {
    const { userId, status } = body;
    if (!userId || !status) return NextResponse.json({ error: 'userId and status required' }, { status: 400 });

    const { error } = await admin.from('profiles').update({ status }).eq('id', userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  }

  // ── Reset a user's password (sends reset email) ──
  if (action === 'reset_password') {
    const { email } = body;
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

    // Use admin API to generate a password reset link
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${request.headers.get('origin')}/auth/callback?next=/reset-password` },
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, message: `Password reset sent to ${email}` });
  }

  // ── Approve/decline discount request ──
  if (action === 'review_discount') {
    const { requestId, status, review_notes } = body;
    if (!requestId || !status) return NextResponse.json({ error: 'requestId and status required' }, { status: 400 });

    const { error } = await admin.from('discount_requests').update({
      status,
      reviewed_by: auth.user.id,
      reviewed_at: new Date().toISOString(),
      review_notes: review_notes || null,
    }).eq('id', requestId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  }

  // ── Update rate card ──
  if (action === 'update_rate_card') {
    const { id, standard_price, bms_price } = body;
    if (!id) return NextResponse.json({ error: 'Rate card id required' }, { status: 400 });

    const updates = {};
    if (standard_price !== undefined) updates.standard_price = standard_price;
    if (bms_price !== undefined) updates.bms_price = bms_price;
    updates.updated_by = auth.user.id;

    const { error } = await admin.from('rate_cards').update(updates).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  }

  // ── Update volume discount ──
  if (action === 'update_discount') {
    const { id, discount_rate } = body;
    if (!id) return NextResponse.json({ error: 'Discount id required' }, { status: 400 });

    const { error } = await admin.from('volume_discounts').update({
      discount_rate,
      updated_by: auth.user.id,
    }).eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
