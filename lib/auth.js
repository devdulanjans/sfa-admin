import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { authApi, accessLogApi } from './api';
import LicenseRequired from '../components/LicenseRequired';

function isAccessTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 - Date.now() < 30_000;
  } catch {
    return true;
  }
}

// Returns true if user has the given permission key.
// SUPER_ADMIN always returns true (their permissions array contains '*').
function checkPermission(user, key) {
  if (!user) return false;
  const perms = user.permissions || [];
  return perms.includes('*') || perms.includes(key);
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);
  const router                = useRouter();
  const queryClient           = useQueryClient();

  useEffect(() => {
    async function initAuth() {
      const stored       = localStorage.getItem('sfa_user');
      const accessToken  = localStorage.getItem('sfa_access_token');
      const refreshToken = localStorage.getItem('sfa_refresh_token');

      if (!stored || !refreshToken) {
        setLoading(false);
        return;
      }

      try { setUser(JSON.parse(stored)); } catch { /* ignore */ }

      if (!accessToken || isAccessTokenExpired(accessToken)) {
        try {
          const { data } = await axios.post('/api/auth/refresh', { refreshToken });
          const profile = buildProfile(data);
          localStorage.setItem('sfa_access_token',  data.accessToken);
          localStorage.setItem('sfa_refresh_token', data.refreshToken);
          localStorage.setItem('sfa_user', JSON.stringify(profile));
          setUser(profile);
        } catch {
          ['sfa_access_token', 'sfa_refresh_token', 'sfa_user'].forEach(k => localStorage.removeItem(k));
          setUser(null);
        }
      }

      setLoading(false);
    }
    initAuth();
  }, []);

  function buildProfile(data) {
    return {
      username:    data.username,
      email:       data.email,
      fullName:    data.fullName,
      role:        data.role,
      permissions: data.permissions || [],
      sfaEnabled:  data.sfaEnabled ?? true,
      posEnabled:  data.posEnabled ?? true,
    };
  }

  async function login(username, password) {
    const { data } = await authApi.login({ username, password });
    // Wipe any cached data from a previous account in this tab (e.g. another cashier's
    // open drawer session) before this account's own queries have a chance to run.
    queryClient.clear();
    localStorage.setItem('sfa_access_token',  data.accessToken);
    localStorage.setItem('sfa_refresh_token', data.refreshToken);
    const profile = buildProfile(data);
    localStorage.setItem('sfa_user', JSON.stringify(profile));
    setUser(profile);
    return profile;
  }

  async function logout() {
    try { await authApi.logout(); } catch { /* ignore */ }
    localStorage.removeItem('sfa_access_token');
    localStorage.removeItem('sfa_refresh_token');
    localStorage.removeItem('sfa_user');
    // Without this, cached query results (e.g. the POS current-drawer check) persist in
    // memory across accounts in the same tab — the next person to log in on this browser
    // can briefly see the previous user's cached data before anything refetches.
    queryClient.clear();
    setUser(null);
    router.push('/login');
  }

  // Refresh cached permissions (call after super admin changes another user's permissions)
  async function refreshPermissions() {
    const refreshToken = localStorage.getItem('sfa_refresh_token');
    if (!refreshToken) return;
    try {
      const { data } = await axios.post('/api/auth/refresh', { refreshToken });
      const profile = buildProfile(data);
      localStorage.setItem('sfa_access_token',  data.accessToken);
      localStorage.setItem('sfa_refresh_token', data.refreshToken);
      localStorage.setItem('sfa_user', JSON.stringify(profile));
      setUser(profile);
    } catch { /* ignore */ }
  }

  const hasRole       = (...roles) => user && roles.includes(user.role);
  const isAdmin       = () => hasRole('SUPER_ADMIN');
  const isManager     = () => hasRole('SUPER_ADMIN', 'SALES_MANAGER');
  const hasPermission = (key) => checkPermission(user, key);

  return (
    <AuthContext.Provider value={{
      user, loading, login, logout,
      hasRole, isAdmin, isManager,
      hasPermission, refreshPermissions,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Returns true if the current user has the given permission key. */
export function usePermission(key) {
  const { user } = useAuth();
  return checkPermission(user, key);
}

/**
 * HOC that guards a page.
 *
 * allowedRoles    — role-level gate (empty = any authenticated user)
 * permissionKey   — feature permission gate (undefined = skip check, SUPER_ADMIN always passes)
 * requiredPackage — 'SFA' | 'POS' | null — this install's license gate. Unlike the role/
 *                   permission checks above, this does NOT bypass for SUPER_ADMIN: a
 *                   license restricts the install, not a person. Renders LicenseRequired
 *                   in place (no redirect) so there's no redirect loop.
 */
export function withAuth(Component, allowedRoles = [], permissionKey = null, requiredPackage = null) {
  return function ProtectedPage(props) {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (loading) return;

      if (!user) {
        router.replace('/login');
        return;
      }

      // Role gate (SUPER_ADMIN bypasses)
      if (allowedRoles.length > 0
          && user.role !== 'SUPER_ADMIN'
          && !allowedRoles.includes(user.role)) {
        _logDenied(user, router.pathname, 'ROLE_DENIED');
        router.replace('/403');
        return;
      }

      // Permission gate (SUPER_ADMIN always has '*')
      if (permissionKey && !checkPermission(user, permissionKey)) {
        _logDenied(user, router.pathname, 'PERMISSION_DENIED');
        router.replace('/403');
        return;
      }

      // Log successful page access (fire-and-forget)
      accessLogApi.log({ action: 'PAGE_ACCESS', resource: router.pathname, status: 'SUCCESS' })
        .catch(() => {});

    }, [user, loading]); // eslint-disable-line react-hooks/exhaustive-deps

    if (loading) return <Spinner />;
    if (!user)   return null;

    // Block render until redirect completes
    if (allowedRoles.length > 0 && user.role !== 'SUPER_ADMIN' && !allowedRoles.includes(user.role))
      return null;
    if (permissionKey && !checkPermission(user, permissionKey))
      return null;

    // License gate — applies to every role, including SUPER_ADMIN of this install.
    if (requiredPackage === 'SFA' && !user.sfaEnabled) return <LicenseRequired licensePackage="SFA" />;
    if (requiredPackage === 'POS' && !user.posEnabled) return <LicenseRequired licensePackage="POS" />;

    return <Component {...props} />;
  };
}

/**
 * Guards the platform-owner-only license screen. Deliberately independent of withAuth:
 * withAuth's role gate always lets SUPER_ADMIN through, which must never apply here.
 */
export function withPlatformOwnerAuth(Component) {
  return function ProtectedPlatformPage(props) {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (loading) return;
      if (!user) { router.replace('/login'); return; }
      if (user.role !== 'PLATFORM_OWNER') { router.replace('/403'); return; }
    }, [user, loading]); // eslint-disable-line react-hooks/exhaustive-deps

    if (loading) return <Spinner />;
    if (!user || user.role !== 'PLATFORM_OWNER') return null;

    return <Component {...props} />;
  };
}

function _logDenied(user, path, action) {
  accessLogApi.log({ action, resource: path, status: 'DENIED' }).catch(() => {});
}

function Spinner() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
