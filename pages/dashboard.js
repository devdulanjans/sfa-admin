import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import Layout from '../components/Layout';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import { withAuth } from '../lib/auth';
import api, { reportApi } from '../lib/api';
import { formatAmount } from '../lib/format';

// ── Categorical palette (fixed order, CVD-safe) ───────────────────────────────
const STATUS_COLORS = {
  SUBMITTED: '#f59e0b',
  APPROVED:  '#14b8a6',
  INVOICED:  '#6366f1',
  CANCELLED: '#ef4444',
  DRAFT:     '#94a3b8',
};
const STATUS_ORDER = ['SUBMITTED', 'APPROVED', 'INVOICED', 'CANCELLED', 'DRAFT'];

// ── Date range presets ────────────────────────────────────────────────────────
const RANGES = [
  { label: 'Last 7 Days',  key: '7d' },
  { label: 'This Month',   key: 'month' },
  { label: 'Last Month',   key: 'prev' },
  { label: 'This Year',    key: 'year' },
];

function calcRange(key) {
  const now  = new Date();
  const pad  = (n) => String(n).padStart(2, '0');
  const fmt  = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = fmt(now);
  if (key === '7d') {
    const d = new Date(now); d.setDate(d.getDate() - 6);
    return { from: fmt(d), to: today };
  }
  if (key === 'month') {
    return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
  }
  if (key === 'prev') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last  = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: fmt(first), to: fmt(last) };
  }
  if (key === 'year') {
    return { from: `${now.getFullYear()}-01-01`, to: today };
  }
}

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtLKR   = (v) => v != null ? `LKR ${formatAmount(v)}` : '—';
const fmtK     = (v) => v != null ? `LKR ${(Number(v) / 1000).toFixed(1)}k` : '—';
const fmtDate  = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en', { day: '2-digit', month: 'short' }) : d;

// ── Custom tooltips ───────────────────────────────────────────────────────────
function RevTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,.08)' }}>
      <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{fmtDate(label)}</p>
      <p style={{ fontSize: 13, fontWeight: 600, color: '#3b82f6' }}>{fmtLKR(payload[0]?.value)}</p>
    </div>
  );
}

function PieTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,.08)' }}>
      <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{d.name}</p>
      <p style={{ fontSize: 13, fontWeight: 600, color: d.payload.fill }}>{d.value} orders</p>
    </div>
  );
}

function BarTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,.08)' }}>
      <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{label}</p>
      <p style={{ fontSize: 13, fontWeight: 600, color: '#3b82f6' }}>{fmtLKR(payload[0]?.value)}</p>
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

// ── Dashboard page ────────────────────────────────────────────────────────────
function Dashboard() {
  const [rangeKey, setRangeKey] = useState('month');
  const range = useMemo(() => calcRange(rangeKey), [rangeKey]);

  const { data: dash } = useQuery({
    queryKey: ['dashboard', range],
    queryFn:  () => api.get('/dashboard', { params: range }).then(r => r.data),
  });

  const { data: summary } = useQuery({
    queryKey: ['report-sales', range],
    queryFn:  () => reportApi.salesSummary(range).then(r => r.data),
  });

  const { data: perf } = useQuery({
    queryKey: ['report-perf', range],
    queryFn:  () => reportApi.performanceStats(range).then(r => r.data),
  });

  // ── Data transforms ─────────────────────────────────────────────────────────
  const dailyRevenue  = dash?.dailyRevenue   ?? [];
  const topCustomers  = dash?.topCustomers   ?? [];
  const recentOrders  = dash?.recentOrders   ?? [];
  const statusMap     = dash?.statusBreakdown ?? {};
  const salesReps     = Array.isArray(perf) ? perf : [];

  const pieData = STATUS_ORDER
    .filter(s => statusMap[s] != null)
    .map(s => ({ name: s, value: statusMap[s], fill: STATUS_COLORS[s] }))
    .concat(
      Object.keys(statusMap)
        .filter(s => !STATUS_ORDER.includes(s))
        .map(s => ({ name: s, value: statusMap[s], fill: '#cbd5e1' }))
    );

  const custBarData = topCustomers.slice(0, 8).map(c => ({
    name:    c.name.length > 20 ? c.name.slice(0, 18) + '…' : c.name,
    revenue: Number(c.revenue),
    orders:  c.orderCount,
  }));

  const totalOrders    = pieData.reduce((s, d) => s + d.value, 0);
  const maxRepRevenue  = salesReps[0]?.revenue ? Number(salesReps[0].revenue) : 1;
  const medals         = ['🥇', '🥈', '🥉'];

  return (
    <Layout title="Dashboard">

      {/* ── Date range filter ─────────────────────────────────────────────── */}
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

      {/* ── KPI tiles ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard
          label="Today Revenue"
          value={fmtLKR(dash?.todayRevenue)}
          sub={`${dash?.todayOrders ?? 0} orders today`}
          icon="📅" color="green"
        />
        <StatCard
          label="Period Revenue"
          value={fmtLKR(dash?.totalRevenue)}
          sub={`${summary?.totalOrders ?? '—'} total orders`}
          icon="💰" color="blue"
        />
        <StatCard
          label="Avg Order Value"
          value={fmtLKR(summary?.avgOrderValue)}
          icon="📊" color="amber"
        />
        <StatCard
          label="Invoices Issued"
          value={summary?.invoicesCount ?? '—'}
          icon="🧾" color="purple"
        />
      </div>

      {/* ── Row 1: Revenue trend + Order status donut ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">

        <Card title="Revenue Trend" className="lg:col-span-2">
          {dailyRevenue.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={dailyRevenue} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f4f8" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={fmtDate} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} width={44} />
                <Tooltip content={<RevTooltip />} />
                <Area
                  type="monotone" dataKey="revenue"
                  stroke="#3b82f6" strokeWidth={2}
                  fill="url(#revGrad)"
                  dot={{ r: 2.5, fill: '#3b82f6', strokeWidth: 0 }}
                  activeDot={{ r: 4, fill: '#3b82f6' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </Card>

        <Card title="Order Status" subtitle={totalOrders > 0 ? `${totalOrders} total` : undefined}>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%" cy="50%"
                    innerRadius={42} outerRadius={68}
                    paddingAngle={2}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {pieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <Tooltip content={<PieTip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-3">
                {pieData.map(d => {
                  const pct = totalOrders > 0 ? ((d.value / totalOrders) * 100).toFixed(0) : 0;
                  return (
                    <div key={d.name} className="flex items-center gap-2 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.fill }} />
                      <span className="text-gray-600 flex-1">{d.name}</span>
                      <span className="text-gray-400 tabular-nums">{pct}%</span>
                      <span className="font-semibold text-gray-800 tabular-nums w-6 text-right">{d.value}</span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : <Empty />}
        </Card>
      </div>

      {/* ── Row 2: Top customers bar + Salesperson leaderboard ───────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

        <Card title="Top Customers" subtitle="by revenue">
          {custBarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={custBarData}
                layout="vertical"
                margin={{ left: 0, right: 12, top: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f4f8" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                <Tooltip content={<BarTip />} cursor={{ fill: 'rgba(59,130,246,0.06)' }} />
                <Bar dataKey="revenue" fill="#3b82f6" radius={[0, 4, 4, 0]} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </Card>

        <Card title="Sales Leaderboard" subtitle="top performers">
          {salesReps.length > 0 ? (
            <div className="space-y-3">
              {salesReps.slice(0, 7).map((rep, i) => {
                const pct = Math.round((Number(rep.revenue) / maxRepRevenue) * 100);
                return (
                  <div key={rep.repId ?? i}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm leading-none shrink-0">{medals[i] ?? `#${i + 1}`}</span>
                        <span className="text-gray-800 font-medium truncate">{rep.repName}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-2">
                        <span className="text-gray-400 tabular-nums">{rep.orderCount} orders</span>
                        <span className="font-semibold text-gray-800 tabular-nums">{fmtK(rep.revenue)}</span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <Empty />}
        </Card>
      </div>

      {/* ── Row 3: Ratio tiles ────────────────────────────────────────────── */}
      {(topCustomers.length > 0 || salesReps.length > 0) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <RatioTile
            label="Top Customer Share"
            value={topCustomers.length > 0 && dash?.totalRevenue
              ? `${((Number(topCustomers[0].revenue) / Number(dash.totalRevenue)) * 100).toFixed(1)}%`
              : '—'}
            sub={topCustomers[0]?.name ?? ''}
            color="#3b82f6"
          />
          <RatioTile
            label="Top Rep Share"
            value={salesReps.length > 0 && dash?.totalRevenue
              ? `${((Number(salesReps[0].revenue) / Number(dash.totalRevenue)) * 100).toFixed(1)}%`
              : '—'}
            sub={salesReps[0]?.repName ?? ''}
            color="#10b981"
          />
          <RatioTile
            label="Approval Rate"
            value={totalOrders > 0
              ? `${(((statusMap.APPROVED ?? 0) + (statusMap.INVOICED ?? 0)) / totalOrders * 100).toFixed(0)}%`
              : '—'}
            sub="Approved + Invoiced"
            color="#6366f1"
          />
          <RatioTile
            label="Cancellation Rate"
            value={totalOrders > 0
              ? `${((statusMap.CANCELLED ?? 0) / totalOrders * 100).toFixed(1)}%`
              : '—'}
            sub="of all orders"
            color="#ef4444"
          />
        </div>
      )}

      {/* ── Recent orders table ───────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Recent Orders</h3>
          <span className="text-xs text-gray-400">Last 10</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['Order #', 'Customer', 'Total', 'Status', 'Date'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recentOrders.length > 0 ? recentOrders.map((o, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-blue-600">{o.orderNumber}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{o.customerName}</td>
                  <td className="px-4 py-3 text-sm font-medium tabular-nums">{fmtLKR(o.total)}</td>
                  <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                  <td className="px-4 py-3 text-sm text-gray-500">{o.date}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-sm text-center text-gray-400">No orders in this period</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}

// ── Ratio tile ────────────────────────────────────────────────────────────────
function RatioTile({ label, value, sub, color }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2">{label}</p>
      <p className="text-3xl font-bold tabular-nums mb-1" style={{ color }}>{value}</p>
      {sub && <p className="text-xs text-gray-400 truncate">{sub}</p>}
    </div>
  );
}

export default withAuth(Dashboard, [], 'MOD_DASHBOARD');
