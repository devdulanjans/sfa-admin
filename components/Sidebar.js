import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth, ADMIN_IMPLICIT_PERMISSIONS } from '../lib/auth';
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
    href: '/tenants',
    label: 'Channels',
    permKey: 'MOD_TENANTS',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2M19 21H5m0 0H3m8-16h.01M11 9h.01M11 13h.01M11 17h.01M7 9h.01M7 13h.01M7 17h.01M15 9h.01M15 13h.01M15 17h.01" />
      </svg>
    ),
  },
  {
    label: 'Sales Management',
    childKeys: [
      'MOD_CUSTOMERS', 'MOD_PRODUCTS',
      'MOD_BATCH_PRICE', 'MOD_PROMOTIONS', 'MOD_CUSTOMER_GROUPS', 'MOD_PRODUCT_GROUPS',
      'MOD_ORDERS', 'MOD_INVOICES',
      'MOD_INV_STOCK', 'MOD_INV_MOVES',
      'MOD_RETURNS', 'MOD_DAMAGES',
      'MOD_SALES_TARGETS', 'MOD_TARGET_CALENDAR',
      'MOD_DISTRIBUTORS',
    ],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    children: [
      {
        href: '/customers',
        label: 'Customers',
        permKey: 'MOD_CUSTOMERS',
      },
      {
        href: '/products',
        label: 'Products',
        permKey: 'MOD_PRODUCTS',
      },
      {
        label: 'Pricing',
        childKeys: ['MOD_BATCH_PRICE', 'MOD_PROMOTIONS', 'MOD_CUSTOMER_GROUPS', 'MOD_PRODUCT_GROUPS'],
        children: [
          { href: '/pricing',                  label: 'Batch Pricing',   permKey: 'MOD_BATCH_PRICE', exact: true },
          { href: '/pricing/promotions',       label: 'Promotions',     permKey: 'MOD_PROMOTIONS' },
          { href: '/pricing/customer-groups',  label: 'Customer Groups', permKey: 'MOD_CUSTOMER_GROUPS' },
          { href: '/pricing/product-groups',   label: 'Product Groups',  permKey: 'MOD_PRODUCT_GROUPS' },
        ],
      },
      {
        href: '/orders',
        label: 'Orders',
        permKey: 'MOD_ORDERS',
      },
      {
        href: '/invoices',
        label: 'Invoices',
        permKey: 'MOD_INVOICES',
      },
      {
        label: 'Inventory',
        childKeys: ['MOD_INV_STOCK', 'MOD_INV_MOVES'],
        children: [
          { href: '/inventory',            label: 'Stock Levels',    permKey: 'MOD_INV_STOCK', exact: true },
          { href: '/inventory/movements',  label: 'Stock Movements', permKey: 'MOD_INV_MOVES' },
        ],
      },
      {
        href: '/returns',
        label: 'Returns',
        permKey: 'MOD_RETURNS',
      },
      {
        href: '/damages',
        label: 'Damages',
        permKey: 'MOD_DAMAGES',
      },
      {
        label: 'Sales Targets',
        childKeys: ['MOD_SALES_TARGETS', 'MOD_TARGET_CALENDAR'],
        children: [
          { href: '/sales-targets',          label: 'Targets',          permKey: 'MOD_SALES_TARGETS' },
          { href: '/sales-targets/calendar', label: 'Working Calendar', permKey: 'MOD_TARGET_CALENDAR' },
        ],
      },
      {
        href: '/distributors',
        label: 'Distributors',
        permKey: 'MOD_DISTRIBUTORS',
      },
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
    label: 'Financial Management',
    childKeys: [
      'MOD_FIN_LEDGER', 'MOD_FIN_PAYABLE', 'MOD_FIN_RECEIVABLE', 'MOD_FIN_BANK',
      'MOD_FIN_TAX', 'MOD_FIN_ASSETS', 'MOD_FIN_PL', 'MOD_FIN_BS',
    ],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M12 3a9 9 0 100 18 9 9 0 000-18z" />
      </svg>
    ),
    children: [
      { href: '/finance/general-ledger', label: 'General Ledger',      permKey: 'MOD_FIN_LEDGER' },
      { href: '/finance/payable',        label: 'Accounts Payable',    permKey: 'MOD_FIN_PAYABLE' },
      { href: '/finance/receivable',     label: 'Accounts Receivable', permKey: 'MOD_FIN_RECEIVABLE' },
      { href: '/finance/bank',           label: 'Bank Management',     permKey: 'MOD_FIN_BANK' },
      { href: '/finance/tax',            label: 'Tax Management',      permKey: 'MOD_FIN_TAX' },
      { href: '/finance/fixed-assets',   label: 'Fixed Assets',        permKey: 'MOD_FIN_ASSETS' },
      { href: '/finance/profit-loss',    label: 'Profit & Loss',       permKey: 'MOD_FIN_PL' },
      { href: '/finance/balance-sheet',  label: 'Balance Sheet',       permKey: 'MOD_FIN_BS' },
    ],
  },
  {
    label: 'Reports',
    childKeys: ['MOD_RPT_SALES', 'MOD_RPT_PERF', 'MOD_RPT_MILEAGE'],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    children: [
      { href: '/reports/sales',       label: 'Sales Reports', permKey: 'MOD_RPT_SALES' },
      { href: '/reports/performance', label: 'Performance',   permKey: 'MOD_RPT_PERF' },
      { href: '/reports/mileage',     label: 'Mileage',       permKey: 'MOD_RPT_MILEAGE' },
    ],
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

// Recursive — a group is "active" if any leaf link at any nesting depth is active
// (e.g. Sales Management > Pricing > Batch Pricing marks all three ancestors active).
function groupHasActiveChild(group, pathname) {
  return group.children?.some(c => c.children ? groupHasActiveChild(c, pathname) : isActive(c, pathname)) ?? false;
}

// Recursive — a group is visible if it has at least one visible descendant leaf;
// canSee() already applies the license/permission check per leaf permKey.
function filterVisible(items, canSee) {
  return items
    .map(item => {
      if (item.children) {
        const visibleChildren = filterVisible(item.children, canSee);
        return visibleChildren.length ? { ...item, children: visibleChildren } : null;
      }
      return canSee(item.permKey) ? item : null;
    })
    .filter(Boolean);
}

// Recursive — seeds open/closed state for every group at every depth, keyed by a
// slash-joined path (not bare label) so nested groups can't collide with top-level ones.
function collectOpenGroups(items, pathname, parentPath = '') {
  let acc = {};
  items.forEach(item => {
    if (!item.children) return;
    const path = parentPath ? `${parentPath}/${item.label}` : item.label;
    if (groupHasActiveChild(item, pathname)) acc[path] = true;
    acc = { ...acc, ...collectOpenGroups(item.children, pathname, path) };
  });
  return acc;
}

// Modules gated by this install's SFA/POS license — checked ahead of every other
// permission check below, including the SUPER_ADMIN bypass, since a license restricts
// the install, not a person. Anything not listed here is CORE (always available).
const SFA_MODULES = new Set([
  'MOD_ORDERS', 'MOD_INVOICES', 'MOD_INV_STOCK', 'MOD_INV_MOVES',
  'MOD_RETURNS', 'MOD_DAMAGES', 'MOD_RPT_SALES', 'MOD_RPT_PERF', 'MOD_RPT_MILEAGE',
  'MOD_SALES_TARGETS', 'MOD_TARGET_CALENDAR',
]);
const POS_MODULES = new Set([
  'MOD_POS_TERMINAL', 'MOD_POS_HISTORY', 'MOD_POS_CUSTOMERS', 'MOD_POS_CREDIT',
  'MOD_POS_DASHBOARD', 'MOD_POS_REPORTS', 'MOD_POS_DAILY_REPORT', 'MOD_POS_DRAWER',
  'MOD_ACC_EXPENSES', 'MOD_ACC_LEDGER', 'MOD_ACC_PROFIT_LOSS',
]);
const FINANCE_MODULES = new Set([
  'MOD_FIN_LEDGER', 'MOD_FIN_PAYABLE', 'MOD_FIN_RECEIVABLE', 'MOD_FIN_BANK',
  'MOD_FIN_TAX', 'MOD_FIN_ASSETS', 'MOD_FIN_PL', 'MOD_FIN_BS',
]);
const MULTI_TENANT_MODULES = new Set(['MOD_TENANTS']);

function packageAllowed(permKey, sfaEnabled, posEnabled, financeEnabled, multiTenantEnabled) {
  if (!permKey) return true;
  if (SFA_MODULES.has(permKey)) return sfaEnabled;
  if (POS_MODULES.has(permKey)) return posEnabled;
  if (FINANCE_MODULES.has(permKey)) return financeEnabled;
  if (MULTI_TENANT_MODULES.has(permKey)) return multiTenantEnabled;
  return true;
}

// Renders one NAV node at any depth — a leaf Link, or a collapsible group that
// recurses into its own children. depth 0 gets the full icon + label treatment;
// depth >= 1 (nested under any group, one level or two) gets the smaller dot-bullet
// treatment, matching the sidebar's original single-level nested style.
function NavNode({ item, path, pathname, openGroups, toggleGroup, onClose, depth }) {
  if (!item.children) {
    const active = isActive(item, pathname);
    return (
      <Link
        href={item.href}
        onClick={onClose}
        className={clsx(
          'flex items-center rounded-lg transition-colors',
          depth === 0
            ? 'gap-3 px-3 py-2.5 text-sm font-medium'
            : 'gap-2 px-3 py-2 text-sm',
          active
            ? depth === 0 ? 'bg-blue-600 text-white shadow-sm' : 'bg-blue-600/90 text-white font-medium'
            : depth === 0 ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
        )}
      >
        {depth === 0 ? (
          <span className={clsx('shrink-0', active ? 'text-white' : 'text-slate-400')}>{item.icon}</span>
        ) : (
          <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', active ? 'bg-white' : 'bg-slate-600')} />
        )}
        {item.label}
      </Link>
    );
  }

  const open = !!openGroups[path];
  const groupActive = groupHasActiveChild(item, pathname);

  return (
    <div>
      <button
        type="button"
        onClick={() => toggleGroup(path)}
        className={clsx(
          'w-full flex items-center rounded-lg text-left transition-colors',
          depth === 0
            ? 'gap-3 px-3 py-2.5 text-sm font-medium'
            : 'gap-2 px-3 py-2 text-sm',
          groupActive && !open
            ? 'text-blue-400 hover:bg-slate-800'
            : (depth === 0 ? 'text-slate-300' : 'text-slate-400') + ' hover:bg-slate-800 hover:text-white'
        )}
      >
        {depth === 0 ? (
          <span className={clsx('shrink-0', groupActive ? 'text-blue-400' : 'text-slate-400')}>{item.icon}</span>
        ) : (
          <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', groupActive ? 'bg-blue-400' : 'bg-slate-600')} />
        )}
        <span className="flex-1">{item.label}</span>
        <svg
          className={clsx('w-4 h-4 text-slate-500 transition-transform duration-200 shrink-0', open && 'rotate-180')}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div className={clsx('overflow-hidden transition-all duration-200', open ? 'max-h-[999px] opacity-100' : 'max-h-0 opacity-0')}>
        <div className="mt-0.5 ml-3 pl-3 border-l border-slate-700 space-y-0.5 pb-1">
          {item.children.map(child => (
            <NavNode
              key={child.href || child.label}
              item={child}
              path={`${path}/${child.label}`}
              pathname={pathname}
              openGroups={openGroups}
              toggleGroup={toggleGroup}
              onClose={onClose}
              depth={depth + 1}
            />
          ))}
        </div>
      </div>
    </div>
  );
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
  const sfaEnabled         = user?.sfaEnabled ?? true;
  const posEnabled         = user?.posEnabled ?? true;
  const financeEnabled     = user?.financeEnabled ?? false;
  const multiTenantEnabled = user?.multiTenantEnabled ?? true;

  function canSee(permKey) {
    if (!packageAllowed(permKey, sfaEnabled, posEnabled, financeEnabled, multiTenantEnabled)) return false;
    if (!permKey) return true;
    if (user?.role === 'ADMIN' && ADMIN_IMPLICIT_PERMISSIONS.has(permKey)) return true;
    return isSuperAdmin || hasWildcard || perms.includes(permKey);
  }

  // Build the list of visible items — recursive, so nested groups (e.g. Sales
  // Management > Pricing) are filtered the same way as top-level ones.
  const visible = filterVisible(NAV, canSee);

  // Track which groups are open (keyed by slash-joined path, not bare label, so
  // nested groups can't collide with top-level ones); seed with groups on the active route.
  const [openGroups, setOpenGroups] = useState(() => collectOpenGroups(NAV, pathname));

  // Auto-open the group(s) containing the current route when pathname changes
  useEffect(() => {
    setOpenGroups(prev => ({ ...prev, ...collectOpenGroups(NAV, pathname) }));
  }, [pathname]);

  function toggleGroup(path) {
    setOpenGroups(prev => ({ ...prev, [path]: !prev[path] }));
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
        {visible.map(item => (
          <NavNode
            key={item.href || item.label}
            item={item}
            path={item.label}
            pathname={pathname}
            openGroups={openGroups}
            toggleGroup={toggleGroup}
            onClose={onClose}
            depth={0}
          />
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-700/60 px-4 py-3">
        <p className="text-xs text-slate-500 text-center">SFA v{APP_VERSION} · {new Date().getFullYear()}</p>
      </div>
    </div>
  );
}
