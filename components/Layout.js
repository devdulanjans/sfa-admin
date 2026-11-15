import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth, ADMIN_APP_ROLES, roleLabel } from '../lib/auth';
import Sidebar from './Sidebar';
import PosCalculatorModal from './PosCalculatorModal';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed';

export default function Layout({ children, title, fullWidth = false }) {
  const { user, logout, switchTenant, switchMembership } = useAuth();
  const [sidebarOpen, setSidebarOpen]           = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [exiting, setExiting]     = useState(false);
  const [switching, setSwitching] = useState(false);
  const router = useRouter();

  // Remember the user's collapse preference across visits — per-device convenience,
  // never anything the server needs to know about.
  useEffect(() => {
    try {
      setDesktopCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true');
    } catch {}
  }, []);

  function toggleDesktopSidebar() {
    setDesktopCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next)); } catch {}
      return next;
    });
  }

  if (!user) return null;

  const viewingAsChannel = user.role === 'SUPER_ADMIN' && !!user.activeTenant;
  // Every other role (ADMIN, SALES_MANAGER, ...) that's been given more than one channel
  // needs a way to move between them too — SUPER_ADMIN's own switch is the banner above,
  // entered from the Channels page, since its "tenants" list is the whole platform rather
  // than a personal set of memberships.
  // One account, many roles: every admin-panel workspace (role in a business) of this account.
  const adminWorkspaces = (user.memberships || []).filter(m => ADMIN_APP_ROLES.includes(m.role));
  const canSwitchWorkspaces = user.role !== 'SUPER_ADMIN' && adminWorkspaces.length > 1;

  async function exitChannelView() {
    setExiting(true);
    try {
      await switchTenant(null);
      toast.success('Back to platform view');
      router.push('/tenants');
    } catch (err) {
      toast.error(err.response?.data?.detail ?? 'Failed to exit channel view');
    } finally {
      setExiting(false);
    }
  }

  async function handleWorkspaceSwitch(e) {
    const membershipId = e.target.value;
    if (!membershipId || membershipId === user.activeMembershipId) return;
    if (membershipId === '__all') { router.push('/workspaces'); return; }
    setSwitching(true);
    try {
      const target = adminWorkspaces.find(m => m.id === membershipId);
      await switchMembership(membershipId);
      toast.success(`Working as ${roleLabel(target?.role).toLowerCase()} at ${target?.tenantName ?? 'business'}`);
      router.push('/');
    } catch (err) {
      toast.error(err.response?.data?.detail ?? 'Failed to switch workspace');
    } finally {
      setSwitching(false);
    }
  }

  const isPos = router.pathname === '/pos';
  const isCashier = user?.role === 'CASHIER';
  const hideSidebar = isPos && isCashier;

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Mobile overlay */}
      {!hideSidebar && sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      {!hideSidebar && (
        <div className={clsx(
          'fixed inset-y-0 left-0 z-30 w-64 flex-shrink-0 transform transition-transform duration-200 lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          desktopCollapsed && 'lg:hidden'
        )}>
          <Sidebar onClose={() => setSidebarOpen(false)} />
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 shadow-sm flex-shrink-0">
          <div className="flex items-center gap-3">
            {!hideSidebar && (
              <>
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 lg:hidden"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
                <button
                  onClick={toggleDesktopSidebar}
                  className="hidden lg:block rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
                  title={desktopCollapsed ? 'Show sidebar' : 'Hide sidebar'}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              </>
            )}
            {title && <h1 className="text-base font-semibold text-gray-900">{title}</h1>}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 hidden sm:block">{user.fullName || user.username}</span>
            {canSwitchWorkspaces ? (
              <select
                value={user.activeMembershipId ?? ''}
                onChange={handleWorkspaceSwitch}
                disabled={switching}
                className="text-xs font-medium rounded-full border border-amber-200 bg-amber-50 text-amber-800 pl-2 pr-6 py-0.5 disabled:opacity-50"
                title="Switch workspace"
              >
                {!user.activeMembershipId && <option value="">Choose a workspace…</option>}
                {adminWorkspaces.map(m => (
                  <option key={m.id} value={m.id}>{m.tenantName} · {roleLabel(m.role)}</option>
                ))}
                <option value="__all">All workspaces & invitations…</option>
              </select>
            ) : (
              <span className="hidden sm:inline-flex items-center rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-800">
                {user.activeTenant && user.role !== 'SUPER_ADMIN' ? `${user.activeTenant.name} · ${roleLabel(user.role)}` : user.role?.replace('_', ' ')}
              </span>
            )}
            {user.invitationCount > 0 && (
              <Link href="/workspaces"
                className="inline-flex items-center rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white hover:bg-amber-600"
                title="Invitations waiting for you">
                {user.invitationCount} invitation{user.invitationCount === 1 ? '' : 's'}
              </Link>
            )}
            <Link
              href="/account/change-password"
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              title="Change Password"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </Link>
            <button
              onClick={logout}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              title="Logout"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </header>

        {/* Viewing-as-channel banner — only shown to Super Admin while it has entered a channel */}
        {viewingAsChannel && (
          <div className="flex items-center justify-between gap-3 bg-amber-50 border-b border-amber-200 px-4 py-1.5 flex-shrink-0">
            <p className="text-xs text-amber-800">
              <span className="font-semibold">Viewing as channel:</span> {user.activeTenant.name}
              <span className="text-amber-600"> — Super Admin</span>
            </p>
            <button
              onClick={exitChannelView}
              disabled={exiting}
              className="text-xs font-medium text-amber-800 hover:text-amber-950 underline underline-offset-2 disabled:opacity-50"
            >
              {exiting ? 'Exiting…' : 'Exit → Platform view'}
            </button>
          </div>
        )}

        {/* Page content */}
        <main className={fullWidth ? 'relative flex-1 overflow-hidden' : 'relative flex-1 overflow-y-auto p-6'}>
          {children}
        </main>
      </div>

      {/* POS Calculator — only on the /pos page */}
      {router.pathname === '/pos' && <PosCalculatorModal />}
    </div>
  );
}
