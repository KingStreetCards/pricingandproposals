'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-client';

/**
 * Landing page — redirects to proposals if logged in, login if not.
 * Replace this with the full PricingEngine component once built out.
 */
export default function Home() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', gap: 2, justifyContent: 'center', marginBottom: 12 }}>
            {['#FF6B6B','#F6AD55','#00BCD4','#805AD5'].map((c, i) =>
              <div key={i} style={{ width: 6, height: 20, borderRadius: 3, background: c }} />
            )}
          </div>
          <div style={{ fontSize: 14, color: '#718096' }}>Loading...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage supabase={supabase} />;
  }

  // Once authenticated, render the pricing engine
  // TODO: Import and render the full PricingEngine component
  return (
    <div style={{ padding: 40, textAlign: 'center', fontFamily: '"Nunito Sans", system-ui, sans-serif' }}>
      <div style={{ display: 'flex', gap: 2, justifyContent: 'center', marginBottom: 16 }}>
        {['#FF6B6B','#F6AD55','#00BCD4','#805AD5'].map((c, i) =>
          <div key={i} style={{ width: 6, height: 20, borderRadius: 3, background: c }} />
        )}
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1A2332', margin: '0 0 8px' }}>
        mural<span style={{ fontWeight: 400 }}>health</span> Pricing Engine
      </h1>
      <p style={{ color: '#718096', marginBottom: 20 }}>Welcome, {user.email}</p>
      <p style={{ color: '#A0AEC0', fontSize: 13 }}>
        ✅ Authentication working. Next step: wire up the proposal components.
      </p>
      <button
        onClick={() => supabase.auth.signOut().then(() => setUser(null))}
        style={{ marginTop: 20, padding: '8px 20px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#718096' }}
      >
        Sign Out
      </button>
    </div>
  );
}

function LoginPage({ supabase }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    else window.location.reload();
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/auth/callback' },
    });
    if (error) setError(error.message);
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: '"Nunito Sans", system-ui, sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '40px 36px', width: 380, boxShadow: '0 4px 24px rgba(0,0,0,.08)', border: '1px solid #E2E8F0' }}>
        <div style={{ display: 'flex', gap: 2, justifyContent: 'center', marginBottom: 16 }}>
          {['#FF6B6B','#F6AD55','#00BCD4','#805AD5'].map((c, i) =>
            <div key={i} style={{ width: 6, height: 20, borderRadius: 3, background: c }} />
          )}
        </div>
        <h1 style={{ textAlign: 'center', fontSize: 20, fontWeight: 800, color: '#1A2332', margin: '0 0 4px' }}>
          mural<span style={{ fontWeight: 400 }}>health</span>
        </h1>
        <p style={{ textAlign: 'center', fontSize: 13, color: '#718096', marginBottom: 24 }}>Pricing Engine</p>

        <button onClick={handleGoogleLogin} style={{
          width: '100%', padding: '10px 16px', border: '1px solid #E2E8F0', borderRadius: 8,
          background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#1A2332',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Sign in with Google
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
          <span style={{ fontSize: 11, color: '#A0AEC0' }}>or</span>
          <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
        </div>

        <form onSubmit={handleLogin}>
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 13, marginBottom: 8, outline: 'none', boxSizing: 'border-box' }} />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 13, marginBottom: 12, outline: 'none', boxSizing: 'border-box' }} />
          {error && <div style={{ color: '#E53E3E', fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '10px 16px', border: 'none', borderRadius: 8,
            background: '#00BCD4', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
