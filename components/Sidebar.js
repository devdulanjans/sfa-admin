import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';
import { APP_VERSION } from '../lib/version';
import clsx from 'clsx';

// Nested nav tree — groups have `children`, leaves have `href`
const NAV = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    permKey: 'MOD_DASHBOARD',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    href: '/customers',
    label: 'Customers',
    permKey: 'MOD_CUSTOMERS',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    href: '/products',
    label: 'Products',
    permKey: 'MOD_PRODUCTS',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  },
  {
    label: 'Pricing',
    childKeys: ['MOD_BATCH_PRICE', 'MOD_PROMOTIONS'],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    children: [
      { href: '/pricing',            label: 'Batch Pricing', permKey: 'MOD_BATCH_PRICE', exact: true },
      { href: '/pricing/promotions', label: 'Promotions',    permKey: 'MOD_PROMOTIONS' },
    ],
  },
  {
    href: '/orders',
    label: 'Orders',
    permKey: 'MOD_ORDERS',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
  },
  {
    href: '/invoices',
    label: 'Invoices',
    permKey: 'MOD_INVOICES',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    label: 'Inventory',
    childKeys: ['MOD_INV_STOCK', 'MOD_INV_MOVES'],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
    children: [
      { href: '/inventory',            label: 'Stock Levels',    permKey: 'MOD_INV_STOCK', exact: true },
      { href: '/inventory/movements',  label: 'Stock Movements', permKey: 'MOD_INV_MOVES' },
    ],
  },
  {
    label: 'Point of Sale',
    childKeys: ['MOD_POS_DASHBOARD', 'MOD_POS_TERMINAL', 'MOD_POS_HISTORY', 'MOD_POS_CUSTOMERS', 'MOD_POS_CREDIT', 'MOD_POS_REPORTS', 'MOD_POS_DAILY_REPORT', 'MOD_POS_DRAWER'],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    children: [
      { href: '/pos/dashboard', label: 'Dashboard',      permKey: 'MOD_POS_DASHBOARD' },
      { href: '/pos',           label: 'POS Terminal',   permKey: 'MOD_POS_TERMINAL', exact: true },
      { href: '/pos/history',   label: 'POS History',    permKey: 'MOD_POS_HISTORY' },
      { href: '/pos/customers', label: 'Customers',      permKey: 'MOD_POS_CUSTOMERS' },
      { href: '/pos/credit',    label: 'Customer Credit', permKey: 'MOD_POS_CREDIT' },
      { href: '/pos/reports',   label: 'Reports',        permKey: 'MOD_POS_REPORTS' },
      { href: '/pos/daily-report', label: 'Daily Report', permKey: 'MOD_POS_DAILY_REPORT' },
      { href: '/pos/drawer',    label: 'Cash Drawer',    permKey: 'MOD_POS_DRAWER' },
    ],
  },
  {
    label: 'Accounts',
    childKeys: ['MOD_ACC_EXPENSES', 'MOD_ACC_LEDGER', 'MOD_ACC_PROFIT_LOSS'],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M3 6h18M3 6v12a2 2 0 002 2h14a2 2 0 002-2V6M3 6l2.5-3h13L21 6" />
      </svg>
    ),
    children: [
      { href: '/accounts/expenses',     label: 'Expenses',       permKey: 'MOD_ACC_EXPENSES' },
      { href: '/accounts/ledger',       label: 'General Ledger', permKey: 'MOD_ACC_LEDGER' },
      { href: '/accounts/profit-loss',  label: 'Profit & Loss',  permKey: 'MOD_ACC_PROFIT_LOSS' },
    ],
  },
  {
    href: '/returns',
    label: 'Returns',
    permKey: 'MOD_RETURNS',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
      </svg>
    ),
  },
  {
    href: '/damages',
    label: 'Damages',
    permKey: 'MOD_DAMAGES',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
  {
    label: 'Reports',
    childKeys: ['MOD_RPT_SALES', 'MOD_RPT_PERF'],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    children: [
      { href: '/reports/sales',       label: 'Sales Reports', permKey: 'MOD_RPT_SALES' },
      { href: '/reports/performance', label: 'Performance',   permKey: 'MOD_RPT_PERF' },
    ],
  },
  {
    href: '/distributors',
    label: 'Distributors',
    permKey: 'MOD_DISTRIBUTORS',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    label: 'Users & Admin',
    childKeys: ['MOD_USER_LIST', 'MOD_USER_PERMS', 'MOD_USER_ACTIVITY'],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
    children: [
      { href: '/users',               label: 'User List',    permKey: 'MOD_USER_LIST' },
      { href: '/users/permissions',   label: 'Permissions',  permKey: 'MOD_USER_PERMS' },
      { href: '/users/activity-log',  label: 'Activity Log', permKey: 'MOD_USER_ACTIVITY' },
    ],
  },
  {
    label: 'Settings',
    childKeys: ['MOD_SETTINGS_COMPANY_PROFILE', 'MOD_SETTINGS_GENERAL', 'MOD_SETTINGS_CATEGORIES', 'MOD_SETTINGS_UNITS'],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    children: [
      { href: '/settings/company-profile', label: 'Company Profile',  permKey: 'MOD_SETTINGS_COMPANY_PROFILE' },
      { href: '/settings/general',         label: 'General',          permKey: 'MOD_SETTINGS_GENERAL' },
      { href: '/settings/categories',      label: 'Categories',       permKey: 'MOD_SETTINGS_CATEGORIES' },
      { href: '/settings/units',           label: 'Units of Measure', permKey: 'MOD_SETTINGS_UNITS' },
    ],
  },
];

function isActive(item, pathname) {
  if (!item.href) return false;
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(item.href + '/');
}

function groupHasActiveChild(group, pathname) {
  return group.children?.some(c => isActive(c, pathname)) ?? false;
}

// Modules gated by this install's SFA/POS license — checked ahead of every other
// permission check below, including the SUPER_ADMIN bypass, since a license restricts
// the install, not a person. Anything not listed here is CORE (always available).
const SFA_MODULES = new Set([
  'MOD_ORDERS', 'MOD_INVOICES', 'MOD_INV_STOCK', 'MOD_INV_MOVES',
  'MOD_RETURNS', 'MOD_DAMAGES', 'MOD_RPT_SALES', 'MOD_RPT_PERF',
]);
const POS_MODULES = new Set([
  'MOD_POS_TERMINAL', 'MOD_POS_HISTORY', 'MOD_POS_CUSTOMERS', 'MOD_POS_CREDIT',
  'MOD_POS_DASHBOARD', 'MOD_POS_REPORTS', 'MOD_POS_DAILY_REPORT', 'MOD_POS_DRAWER',
  'MOD_ACC_EXPENSES', 'MOD_ACC_LEDGER', 'MOD_ACC_PROFIT_LOSS',
]);

function packageAllowed(permKey, sfaEnabled, posEnabled) {
  if (!permKey) return true;
  if (SFA_MODULES.has(permKey)) return sfaEnabled;
  if (POS_MODULES.has(permKey)) return posEnabled;
  return true;
}

function PlatformOwnerSidebar({ onClose, active }) {
  return (
    <div className="flex h-full flex-col bg-slate-900 text-white">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center shadow-md">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-bold leading-tight">SFA System</div>
            <div className="text-xs text-slate-400 leading-tight">Platform Owner</div>
          </div>
        </div>
        <button onClick={onClose} className="lg:hidden text-slate-400 hover:text-white p-1 rounded">✕</button>
      </div>
      <nav className="flex-1 px-2.5 py-3">
        <Link
          href="/platform/license"
          onClick={onClose}
          className={clsx(
            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
            active ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
          )}
        >
          License
        </Link>
      </nav>
      <div className="border-t border-slate-700/60 px-4 py-3">
        <p className="text-xs text-slate-500 text-center">SFA v{APP_VERSION} · {new Date().getFullYear()}</p>
      </div>
    </div>
  );
}

export default function Sidebar({ onClose }) {
  const { pathname } = useRouter();
  const { user }     = useAuth();

  if (user?.role === 'PLATFORM_OWNER') {
    return <PlatformOwnerSidebar onClose={onClose} active={pathname === '/platform/license'} />;
  }

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const perms        = user?.permissions || [];
  const hasWildcard  = perms.includes('*');
  const sfaEnabled   = user?.sfaEnabled ?? true;
  const posEnabled   = user?.posEnabled ?? true;

  function canSee(permKey) {
    if (!packageAllowed(permKey, sfaEnabled, posEnabled)) return false;
    if (!permKey) return true;
    return isSuperAdmin || hasWildcard || perms.includes(permKey);
  }

  // Build the list of visible top-level items
  const visible = NAV.filter(item => {
    if (item.children) {
      if (!item.childKeys?.some(k => packageAllowed(k, sfaEnabled, posEnabled))) return false;
      if (isSuperAdmin || hasWildcard) return true;
      return item.childKeys?.some(k => perms.includes(k) && packageAllowed(k, sfaEnabled, posEnabled));
    }
    return canSee(item.permKey);
  }).map(item => {
    if (!item.children) return item;
    const visibleChildren = item.children.filter(c => canSee(c.permKey));
    return { ...item, children: visibleChildren };
  }).filter(item => !item.children || item.children.length > 0);

  // Track which groups are open; seed with groups that have an active child
  const [openGroups, setOpenGroups] = useState(() => {
    const initial = {};
    NAV.forEach(item => {
      if (item.children) {
        initial[item.label] = groupHasActiveChild(item, pathname);
      }
    });
    return initial;
  });

  // Auto-open the group that contains the current route when pathname changes
  useEffect(() => {
    setOpenGroups(prev => {
      const next = { ...prev };
      NAV.forEach(item => {
        if (item.children && groupHasActiveChild(item, pathname)) {
          next[item.label] = true;
        }
      });
      return next;
    });
  }, [pathname]);

  function toggleGroup(label) {
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }));
  }

  return (
    <div className="flex h-full flex-col bg-slate-900 text-white">
      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-md">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-bold leading-tight">SFA System</div>
            <div className="text-xs text-slate-400 leading-tight">Admin Panel</div>
          </div>
        </div>
        <button onClick={onClose} className="lg:hidden text-slate-400 hover:text-white p-1 rounded">✕</button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-0.5">
        {visible.map(item => {
          /* ── Leaf link ── */
          if (!item.children) {
            const active = isActive(item, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                )}
              >
                <span className={clsx('shrink-0', active ? 'text-white' : 'text-slate-400')}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          }

          /* ── Collapsible group ── */
          const open         = !!openGroups[item.label];
          const groupActive  = groupHasActiveChild(item, pathname);

          return (
            <div key={item.label}>
              {/* Group header — clickable */}
              <button
                type="button"
                onClick={() => toggleGroup(item.label)}
                className={clsx(
                  'w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left',
                  groupActive && !open
                    ? 'text-blue-400 hover:bg-slate-800'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                )}
              >
                <span className={clsx('shrink-0', groupActive ? 'text-blue-400' : 'text-slate-400')}>
                  {item.icon}
                </span>
                <span className="flex-1">{item.label}</span>
                {/* Chevron */}
                <svg
                  className={clsx(
                    'w-4 h-4 text-slate-500 transition-transform duration-200 shrink-0',
                    open && 'rotate-180'
                  )}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Children — slide in/out */}
              <div
                className={clsx(
                  'overflow-hidden transition-all duration-200',
                  open ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                )}
              >
                <div className="mt-0.5 ml-3 pl-3 border-l border-slate-700 space-y-0.5 pb-1">
                  {item.children.map(child => {
                    const active = isActive(child, pathname);
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={onClose}
                        className={clsx(
                          'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                          active
                            ? 'bg-blue-600/90 text-white font-medium'
                            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                        )}
                      >
                        <span className={clsx(
                          'w-1.5 h-1.5 rounded-full shrink-0',
                          active ? 'bg-white' : 'bg-slate-600'
                        )} />
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-700/60 px-4 py-3">
        <p className="text-xs text-slate-500 text-center">SFA v{APP_VERSION} · {new Date().getFullYear()}</p>
      </div>
    </div>
  );
}
