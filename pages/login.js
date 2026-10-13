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
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #eefbf9 0%, #d7f2ee 50%, #eefbf9 100%)' }}
         className="flex items-center justify-center p-4">
      <div className="w-full" style={{ maxWidth: '380px' }}>

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center rounded-2xl mb-4 overflow-hidden"
               style={{ width: 72, height: 72, background: '#fff', boxShadow: '0 8px 24px rgba(46,150,144,0.35)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="SFA System" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e4d6b', margin: 0 }}>SFA System</h1>
          <p style={{ color: '#237a7d', fontSize: '0.875rem', marginTop: 4 }}>Admin Panel</p>
        </div>

        {/* Card */}
        <div style={{
          background: '#fff',
          borderRadius: 16,
          border: '1px solid #e5e7eb',
          padding: '2rem',
          boxShadow: '0 20px 48px rgba(30,77,107,0.14)',
        }}>
          {deactivated && (
            <div style={{
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: 10,
              padding: '0.875rem 1rem',
              marginBottom: '1.25rem',
              display: 'flex',
              gap: '0.625rem',
              alignItems: 'flex-start',
            }}>
              <svg style={{ width: 18, height: 18, color: '#d97706', flexShrink: 0, marginTop: 1 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01M5.07 19H19a2 2 0 001.74-2.97L13.74 4a2 2 0 00-3.48 0L3.26 16.03A2 2 0 005.07 19z" />
              </svg>
              <p style={{ color: '#92400e', fontSize: '0.8rem', lineHeight: 1.5, margin: 0 }}>
                Your account has been temporarily deactivated. Please contact your administrator to reactivate your account.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)}>
            {/* Username */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', color: '#374151', fontSize: '0.875rem', fontWeight: 500, marginBottom: 6 }}>
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
                  background: '#fff',
                  border: errors.username ? '1px solid #f87171' : '1px solid #d1d5db',
                  borderRadius: 8,
                  color: '#111827',
                  fontSize: '0.9rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => e.target.style.borderColor = '#2e9690'}
                onBlur={e => e.target.style.borderColor = errors.username ? '#f87171' : '#d1d5db'}
              />
              {errors.username && (
                <p style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: 4 }}>{errors.username.message}</p>
              )}
            </div>

            {/* Password */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', color: '#374151', fontSize: '0.875rem', fontWeight: 500, marginBottom: 6 }}>
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
                  background: '#fff',
                  border: errors.password ? '1px solid #f87171' : '1px solid #d1d5db',
                  borderRadius: 8,
                  color: '#111827',
                  fontSize: '0.9rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => e.target.style.borderColor = '#2e9690'}
                onBlur={e => e.target.style.borderColor = errors.password ? '#f87171' : '#d1d5db'}
              />
              {errors.password && (
                <p style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: 4 }}>{errors.password.message}</p>
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
                background: loading ? '#1b5f6b' : '#237a7d',
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
              onMouseEnter={e => { if (!loading) e.target.style.background = '#1b5f6b'; }}
              onMouseLeave={e => { if (!loading) e.target.style.background = '#237a7d'; }}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', color: '#6b7280', fontSize: '0.75rem', marginTop: '1.5rem' }}>
          SFA + Order &amp; Invoice Management
        </p>
      </div>
    </div>
  );
}
