import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';
import Sidebar from './Sidebar';
import PosCalculatorModal from './PosCalculatorModal';
import clsx from 'clsx';

export default function Layout({ children, title, fullWidth = false }) {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();

  if (!user) return null;

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
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
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
              <button
                onClick={() => setSidebarOpen(true)}
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 lg:hidden"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}
            {title && <h1 className="text-base font-semibold text-gray-900">{title}</h1>}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 hidden sm:block">{user.fullName || user.username}</span>
            <span className="hidden sm:inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
              {user.role?.replace('_', ' ')}
            </span>
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
