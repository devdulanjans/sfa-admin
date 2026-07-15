import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import Layout from '../../components/Layout';
import StatCard from '../../components/StatCard';
import { withAuth } from '../../lib/auth';
import { posApi } from '../../lib/api';
import { formatAmount } from '../../lib/format';

// ── Categorical palette — reused from the main dashboard for visual consistency ─
const BLUE   = '#3b82f6'; // primary / registered customers
const TEAL   = '#14b8a6'; // cash
const AMBER  = '#f59e0b'; // credit
const INDIGO = '#6366f1'; // card
const SLATE  = '#94a3b8'; // walk-in / neutral

const PAYMENT_COLORS = { CASH: TEAL, CARD: INDIGO, CREDIT: AMBER };

// ── Date range presets ────────────────────────────────────────────────────────
const RANGES = [
  { label: 'Last 7 Days', key: '7d' },
  { label: 'This Month',  key: 'month' },
  { label: 'Last Month',  key: 'prev' },
  { label: 'This Year',   key: 'year' },
];

function calcRange(key) {
  const now = new Date();
  const startOfDay = (d) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0)).toISOString();
  const endOfDay   = (d) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)).toISOString();
  if (key === '7d') {
    const from = new Date(now); from.setDate(from.getDate() - 6);
    return { from: startOfDay(from), to: endOfDay(now) };
  }
  if (key === 'month') {
    return { from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: endOfDay(now) };
  }
  if (key === 'prev') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last  = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: startOfDay(first), to: endOfDay(last) };
  }
  // year
  return { from: startOfDay(new Date(now.getFullYear(), 0, 1)), to: endOfDay(now) };
}

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtLKR  = (v) => v != null ? `LKR ${formatAmount(v)}` : '—';
const fmtK    = (v) => v != null ? `LKR ${(Number(v) / 1000).toFixed(1)}k` : '—';
const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en', { day: '2-digit', month: 'short' }) : d;

// ── Custom tooltips ───────────────────────────────────────────────────────────
function RevTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,.08)' }}>
      <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{fmtDate(label)}</p>
      <p style={{ fontSize: 13, fontWeight: 600, color: BLUE }}>{fmtLKR(p.revenue)}</p>
      <p style={{ fontSize: 11, color: '#9ca3af' }}>{p.saleCount} sale{p.saleCount !== 1 ? 's' : ''}</p>
    </div>
  );
}

function ProductTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,.08)' }}>
      <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{p.name}</p>
      <p style={{ fontSize: 13, fontWeight: 600, color: BLUE }}>{p.qty} units</p>
      <p style={{ fontSize: 11, color: '#9ca3af' }}>{fmtLKR(p.revenue)}</p>
    </div>
  );
}

function PieTip({ active, payload, unit }) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,.08)' }}>
      <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{d.name}</p>
      <p style={{ fontSize: 13, fontWeight: 600, color: d.payload.fill }}>
        {unit === 'currency' ? fmtLKR(d.value) : `${d.value} sales`}
      </p>
    </div>
  );
}

// ── Card wrapper ──────────────────────────────────────────────────────────────
function Card({ title, subtitle, children, className = '' }) {
  return (
    <div className={`card p-5 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        {subtitle && <span className="text-xs text-gray-400">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-gray-400 text-center py-8">No data for this period</p>;
}

function PaymentBadge({ method }) {
  const color = PAYMENT_COLORS[method] || SLATE;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {method}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
function PosDashboardPage() {
  const [rangeKey, setRangeKey] = useState('month');
  const range = useMemo(() => calcRange(rangeKey), [rangeKey]);

  const { data: dash, isLoading } = useQuery({
    queryKey: ['pos-dashboard', range],
    queryFn: () => posApi.dashboard(range).then(r => r.data),
  });

  const dailyRevenue     = dash?.dailyRevenue ?? [];
  const topProducts      = dash?.topProducts ?? [];
  const topCustomers     = dash?.topCustomers ?? [];
  const recentSales      = dash?.recentSales ?? [];
  const paymentBreakdown = dash?.paymentBreakdown ?? [];
  const walkIn           = dash?.walkIn ?? { revenue: 0, saleCount: 0 };
  const registered       = dash?.registered ?? { revenue: 0, saleCount: 0 };

  const walkinPieData = [
    { name: 'Registered', value: Number(registered.revenue), count: registered.saleCount, fill: BLUE },
    { name: 'Walk-in',    value: Number(walkIn.revenue),     count: walkIn.saleCount,      fill: SLATE },
  ].filter(d => d.value > 0 || d.count > 0);
  const walkinTotal = walkinPieData.reduce((s, d) => s + d.value, 0);

  const paymentPieData = paymentBreakdown.map(p => ({
    name: p.method,
    value: Number(p.revenue),
    count: p.saleCount,
    fill: PAYMENT_COLORS[p.method] || SLATE,
  }));
  const paymentTotal = paymentPieData.reduce((s, d) => s + d.value, 0);

  const productBarData = topProducts.slice(0, 8).map(p => ({
    name:    p.productName.length > 20 ? p.productName.slice(0, 18) + '…' : p.productName,
    qty:     Number(p.quantitySold),
    revenue: Number(p.revenue),
  }));

  const custBarData = topCustomers.slice(0, 8).map(c => ({
    name:    c.customerName.length > 20 ? c.customerName.slice(0, 18) + '…' : c.customerName,
    revenue: Number(c.revenue),
    count:   c.saleCount,
  }));

  return (
    <Layout title="POS Dashboard">

      {/* ── KPI tiles — always "as of now", not affected by the range picker ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard
          label="Today"
          value={isLoading ? '…' : fmtLKR(dash?.todayRevenue)}
          sub={`${dash?.todayCount ?? 0} sale${dash?.todayCount === 1 ? '' : 's'}`}
          icon="📅" color="green"
        />
        <StatCard
          label="This Week"
          value={isLoading ? '…' : fmtLKR(dash?.weekRevenue)}
          sub={`${dash?.weekCount ?? 0} sale${dash?.weekCount === 1 ? '' : 's'}`}
          icon="📈" color="blue"
        />
        <StatCard
          label="This Month"
          value={isLoading ? '…' : fmtLKR(dash?.monthRevenue)}
          sub={`${dash?.monthCount ?? 0} sale${dash?.monthCount === 1 ? '' : 's'}`}
          icon="🗓️" color="purple"
        />
        <Link href="/pos/credit">
          <StatCard
            label="Outstanding Credit"
            value={isLoading ? '…' : fmtLKR(dash?.outstandingCredit)}
            sub="View Customer Credit →"
            icon="🧾" color="amber"
          />
        </Link>
      </div>

      {/* ── Date range filter (controls the sections below) ─────────────────── */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {RANGES.map(r => (
          <button
            key={r.key}
            onClick={() => setRangeKey(r.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              rangeKey === r.key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* ── Row 1: Revenue trend + Walk-in vs Registered donut ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card title="Revenue Trend" className="lg:col-span-2">
          {dailyRevenue.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={dailyRevenue} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="posRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={BLUE} stopOpacity={0.18} />
                    <stop offset="95%" stopColor={BLUE} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f4f8" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={fmtDate} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} width={44} />
                <Tooltip content={<RevTooltip />} />
                <Area
                  type="monotone" dataKey="revenue"
                  stroke={BLUE} strokeWidth={2}
                  fill="url(#posRevGrad)"
                  dot={{ r: 2.5, fill: BLUE, strokeWidth: 0 }}
                  activeDot={{ r: 4, fill: BLUE }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </Card>

        <Card title="Walk-in vs Registered" subtitle={walkinTotal > 0 ? fmtK(walkinTotal) : undefined}>
          {walkinPieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie
                    data={walkinPieData}
                    cx="50%" cy="50%"
                    innerRadius={42} outerRadius={68}
                    paddingAngle={2}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {walkinPieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <Tooltip content={<PieTip unit="currency" />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-3">
                {walkinPieData.map(d => {
                  const pct = walkinTotal > 0 ? ((d.value / walkinTotal) * 100).toFixed(0) : 0;
                  return (
                    <div key={d.name} className="flex items-center gap-2 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.fill }} />
                      <span className="text-gray-600 flex-1">{d.name}</span>
                      <span className="text-gray-400 tabular-nums">{pct}%</span>
                      <span className="font-semibold text-gray-800 tabular-nums">{d.count}</span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : <Empty />}
        </Card>
      </div>

      {/* ── Row 2: Top products + Payment method breakdown ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card title="Top Selling Products" subtitle="by units sold">
          {productBarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={productBarData} layout="vertical" margin={{ left: 0, right: 12, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f4f8" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                <Tooltip content={<ProductTooltip />} cursor={{ fill: 'rgba(59,130,246,0.06)' }} />
                <Bar dataKey="qty" fill={BLUE} radius={[0, 4, 4, 0]} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </Card>

        <Card title="Payment Methods" subtitle={paymentTotal > 0 ? fmtK(paymentTotal) : undefined}>
          {paymentPieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie
                    data={paymentPieData}
                    cx="50%" cy="50%"
                    innerRadius={42} outerRadius={68}
                    paddingAngle={2}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {paymentPieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <Tooltip content={<PieTip unit="currency" />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-3">
                {paymentPieData.map(d => {
                  const pct = paymentTotal > 0 ? ((d.value / paymentTotal) * 100).toFixed(0) : 0;
                  return (
                    <div key={d.name} className="flex items-center gap-2 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.fill }} />
                      <span className="text-gray-600 flex-1">{d.name}</span>
                      <span className="text-gray-400 tabular-nums">{pct}%</span>
                      <span className="font-semibold text-gray-800 tabular-nums">{d.count}</span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : <Empty />}
        </Card>
      </div>

      {/* ── Row 3: Top registered customers ──────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 mb-4">
        <Card title="Top Registered Customers" subtitle="by revenue">
          {custBarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={custBarData} layout="vertical" margin={{ left: 0, right: 12, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f4f8" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                <Tooltip
                  content={({ active, payload, label }) => !active || !payload?.length ? null : (
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,.08)' }}>
                      <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{label}</p>
                      <p style={{ fontSize: 13, fontWeight: 600, color: BLUE }}>{fmtLKR(payload[0].value)}</p>
                      <p style={{ fontSize: 11, color: '#9ca3af' }}>{payload[0].payload.count} sale{payload[0].payload.count !== 1 ? 's' : ''}</p>
                    </div>
                  )}
                  cursor={{ fill: 'rgba(59,130,246,0.06)' }}
                />
                <Bar dataKey="revenue" fill={BLUE} radius={[0, 4, 4, 0]} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </Card>
      </div>

      {/* ── Recent sales table ───────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Recent Sales</h3>
          <span className="text-xs text-gray-400">Last 10</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['Sale #', 'Customer', 'Payment', 'Total', 'Date'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recentSales.length > 0 ? recentSales.map((s, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-blue-600">{s.saleNumber}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{s.customerName}</td>
                  <td className="px-4 py-3"><PaymentBadge method={s.paymentMethod} /></td>
                  <td className="px-4 py-3 text-sm font-medium tabular-nums">{fmtLKR(s.total)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{new Date(s.createdAt).toLocaleString()}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-sm text-center text-gray-400">No sales in this period</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}

export default withAuth(PosDashboardPage, ['SUPER_ADMIN', 'SALES_MANAGER'], 'MOD_POS_DASHBOARD', 'POS');
