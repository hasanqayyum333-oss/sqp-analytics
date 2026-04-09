'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Use fetch-based client that sets cookies properly for middleware
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Invalid email or password');
        setLoading(false);
      } else {
        router.push('/dashboard');
        router.refresh();
      }
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#18181b',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#27272a', border: '1px solid #3f3f46', borderRadius: 12,
        padding: '40px 48px', width: 380, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' }}>
            SQP <span style={{ color: '#f97316' }}>Analytics</span>
          </div>
          <div style={{ color: '#a1a1aa', fontSize: 13, marginTop: 6 }}>
            Sign in to your account
          </div>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', color: '#a1a1aa', fontSize: 12, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Email
            </label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              required placeholder="you@company.com"
              style={{ width: '100%', background: '#18181b', border: '1px solid #52525b', borderRadius: 6, color: '#fff', fontSize: 14, padding: '10px 12px', outline: 'none', boxSizing: 'border-box' }}
              onFocus={e => e.target.style.borderColor = '#f97316'}
              onBlur={e => e.target.style.borderColor = '#52525b'}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', color: '#a1a1aa', fontSize: 12, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Password
            </label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              required placeholder="••••••••"
              style={{ width: '100%', background: '#18181b', border: '1px solid #52525b', borderRadius: 6, color: '#fff', fontSize: 14, padding: '10px 12px', outline: 'none', boxSizing: 'border-box' }}
              onFocus={e => e.target.style.borderColor = '#f97316'}
              onBlur={e => e.target.style.borderColor = '#52525b'}
            />
          </div>
          {error && (
            <div style={{ background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: 6, color: '#fca5a5', fontSize: 13, padding: '10px 12px', marginBottom: 16 }}>
              {error}
            </div>
          )}
          <button type="submit" disabled={loading}
            style={{ width: '100%', background: loading ? '#7c3a1a' : '#f97316', border: 'none', borderRadius: 6, color: '#fff', fontSize: 14, fontWeight: 700, padding: '11px', cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}