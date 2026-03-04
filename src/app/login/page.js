'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('login'); // login | signup | forgot
  const [message, setMessage] = useState('');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setError(''); setMessage('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    else window.location.href = '/';
    setLoading(false);
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true); setError(''); setMessage('');
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin + '/auth/callback' }
    });
    if (error) setError(error.message);
    else setMessage('Check your email for a confirmation link.');
    setLoading(false);
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setLoading(true); setError(''); setMessage('');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/auth/callback?next=/reset-password',
    });
    if (error) setError(error.message);
    else setMessage('Check your email for a password reset link.');
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/auth/callback' },
    });
    if (error) setError(error.message);
  };

  const s = {
    page: { display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', fontFamily:'"Nunito Sans",system-ui,sans-serif', background:'#F4F7FA' },
    card: { background:'#fff', borderRadius:16, padding:'40px 36px', width:400, boxShadow:'0 4px 24px rgba(0,0,0,.08)', border:'1px solid #E2E8F0' },
    dots: { display:'flex', gap:2, justifyContent:'center', marginBottom:16 },
    dot: (c) => ({ width:6, height:20, borderRadius:3, background:c }),
    h1: { textAlign:'center', fontSize:22, fontWeight:800, color:'#1A2332', margin:'0 0 4px' },
    sub: { textAlign:'center', fontSize:13, color:'#718096', marginBottom:28 },
    googleBtn: { width:'100%', padding:'10px 16px', border:'1px solid #E2E8F0', borderRadius:8, background:'#fff', cursor:'pointer', fontSize:13, fontWeight:600, color:'#1A2332', display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginBottom:20 },
    divider: { display:'flex', alignItems:'center', gap:12, marginBottom:20 },
    divLine: { flex:1, height:1, background:'#E2E8F0' },
    divText: { fontSize:11, color:'#A0AEC0' },
    input: { width:'100%', padding:'10px 12px', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:13, marginBottom:10, outline:'none', boxSizing:'border-box', fontFamily:'inherit' },
    btn: { width:'100%', padding:'10px 16px', border:'none', borderRadius:8, background:'#00BCD4', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' },
    error: { color:'#E53E3E', fontSize:12, marginBottom:8, textAlign:'center' },
    success: { color:'#38A169', fontSize:12, marginBottom:8, textAlign:'center', background:'#C6F6D5', padding:'8px 12px', borderRadius:6 },
    link: { fontSize:12, color:'#00BCD4', cursor:'pointer', background:'none', border:'none', fontFamily:'inherit', textDecoration:'underline' },
    footer: { display:'flex', justifyContent:'center', gap:16, marginTop:16 },
  };

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.dots}>
          {['#FF6B6B','#F6AD55','#00BCD4','#805AD5'].map((c,i) => <div key={i} style={s.dot(c)} />)}
        </div>
        <h1 style={s.h1}>mural<span style={{fontWeight:400}}>health</span></h1>
        <p style={s.sub}>Pricing Engine</p>

        {/* Google SSO */}
        <button onClick={handleGoogleLogin} style={s.googleBtn}>
          <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Sign in with Google
        </button>

        <div style={s.divider}>
          <div style={s.divLine} />
          <span style={s.divText}>or use email</span>
          <div style={s.divLine} />
        </div>

        {error && <div style={s.error}>{error}</div>}
        {message && <div style={s.success}>{message}</div>}

        {mode === 'forgot' ? (
          <form onSubmit={handleForgotPassword}>
            <input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} style={s.input} required />
            <button type="submit" disabled={loading} style={s.btn}>
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
            <div style={s.footer}>
              <button type="button" onClick={() => { setMode('login'); setError(''); setMessage(''); }} style={s.link}>Back to sign in</button>
            </div>
          </form>
        ) : (
          <form onSubmit={mode === 'login' ? handleLogin : handleSignup}>
            <input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} style={s.input} required />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} style={s.input} required minLength={6} />
            <button type="submit" disabled={loading} style={s.btn}>
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
            <div style={s.footer}>
              {mode === 'login' ? (
                <>
                  <button type="button" onClick={() => { setMode('signup'); setError(''); setMessage(''); }} style={s.link}>Create account</button>
                  <button type="button" onClick={() => { setMode('forgot'); setError(''); setMessage(''); }} style={s.link}>Forgot password?</button>
                </>
              ) : (
                <button type="button" onClick={() => { setMode('login'); setError(''); setMessage(''); }} style={s.link}>Already have an account? Sign in</button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
