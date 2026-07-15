import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useAuth } from '../lib/auth';

export default function LoginPage() {
  const { login, user } = useAuth();
  const router = useRouter();
  const [loading, setLoading]         = useState(false);
  const [deactivated, setDeactivated] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm();

  // Redirect if already logged in — go through index.js so smart redirect picks the right first page
  useEffect(() => {
    if (user) router.replace('/');
  }, [user]);

  async function onSubmit(data) {
    setLoading(true);
    setDeactivated(false);
    try {
      await login(data.username, data.password);
      // redirect handled by useEffect above once user state is applied
    } catch (err) {
      const detail = err.response?.data?.detail || '';
      if (detail === 'Account is inactive') {
        setDeactivated(true);
      } else {
        toast.error(detail || 'Invalid username or password');
      }
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)' }}
         className="flex items-center justify-center p-4">
      <div className="w-full" style={{ maxWidth: '380px' }}>

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center rounded-2xl mb-4"
               style={{ width: 56, height: 56, background: '#2563eb', boxShadow: '0 8px 24px rgba(37,99,235,0.4)' }}>
            <svg style={{ width: 28, height: 28, color: '#fff' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff', margin: 0 }}>SFA Admin</h1>
          <p style={{ color: '#93c5fd', fontSize: '0.875rem', marginTop: 4 }}>Sales Force Automation System</p>
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(255,255,255,0.07)',
          backdropFilter: 'blur(12px)',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.12)',
          padding: '2rem',
          boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
        }}>
          {deactivated && (
            <div style={{
              background: 'rgba(251,191,36,0.15)',
              border: '1px solid rgba(251,191,36,0.5)',
              borderRadius: 10,
              padding: '0.875rem 1rem',
              marginBottom: '1.25rem',
              display: 'flex',
              gap: '0.625rem',
              alignItems: 'flex-start',
            }}>
              <svg style={{ width: 18, height: 18, color: '#fbbf24', flexShrink: 0, marginTop: 1 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01M5.07 19H19a2 2 0 001.74-2.97L13.74 4a2 2 0 00-3.48 0L3.26 16.03A2 2 0 005.07 19z" />
              </svg>
              <p style={{ color: '#fde68a', fontSize: '0.8rem', lineHeight: 1.5, margin: 0 }}>
                Your account has been temporarily deactivated. Please contact your administrator to reactivate your account.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)}>
            {/* Username */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', color: '#bfdbfe', fontSize: '0.875rem', fontWeight: 500, marginBottom: 6 }}>
                Username
              </label>
              <input
                {...register('username', { required: 'Username is required' })}
                autoFocus
                placeholder="Enter username"
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '0.625rem 0.875rem',
                  background: 'rgba(255,255,255,0.08)',
                  border: errors.username ? '1px solid #f87171' : '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: '0.9rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => e.target.style.borderColor = '#60a5fa'}
                onBlur={e => e.target.style.borderColor = errors.username ? '#f87171' : 'rgba(255,255,255,0.15)'}
              />
              {errors.username && (
                <p style={{ color: '#f87171', fontSize: '0.75rem', marginTop: 4 }}>{errors.username.message}</p>
              )}
            </div>

            {/* Password */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', color: '#bfdbfe', fontSize: '0.875rem', fontWeight: 500, marginBottom: 6 }}>
                Password
              </label>
              <input
                type="password"
                {...register('password', { required: 'Password is required' })}
                placeholder="Enter password"
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '0.625rem 0.875rem',
                  background: 'rgba(255,255,255,0.08)',
                  border: errors.password ? '1px solid #f87171' : '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: '0.9rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => e.target.style.borderColor = '#60a5fa'}
                onBlur={e => e.target.style.borderColor = errors.password ? '#f87171' : 'rgba(255,255,255,0.15)'}
              />
              {errors.password && (
                <p style={{ color: '#f87171', fontSize: '0.75rem', marginTop: 4 }}>{errors.password.message}</p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                display: 'block',
                width: '100%',
                padding: '0.7rem',
                background: loading ? '#1d4ed8' : '#2563eb',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                transition: 'background 0.15s, opacity 0.15s',
                letterSpacing: '0.01em',
              }}
              onMouseEnter={e => { if (!loading) e.target.style.background = '#1d4ed8'; }}
              onMouseLeave={e => { if (!loading) e.target.style.background = '#2563eb'; }}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', color: 'rgba(147,197,253,0.5)', fontSize: '0.75rem', marginTop: '1.5rem' }}>
          SFA + Order &amp; Invoice Management
        </p>
      </div>
    </div>
  );
}
