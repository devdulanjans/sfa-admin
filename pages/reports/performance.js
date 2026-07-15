import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Layout from '../../components/Layout';
import StatCard from '../../components/StatCard';
import { withAuth } from '../../lib/auth';
import { reportApi } from '../../lib/api';
import { formatAmount } from '../../lib/format';

const BAR_COLOR = '#3b82f6';

function PerformancePage() {
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [to, setTo] = useState(() => new Date().toISOString().split('T')[0]);

  const { data, isLoading } = useQuery({
    queryKey: ['sales-rep-performance', from, to],
    queryFn:  () => reportApi.performanceStats({ from, to }).then(r => r.data),
    enabled:  !!from && !!to,
  });

  const reps = data || [];
  const totalRevenue = reps.reduce((sum, r) => sum + Number(r.revenue || 0), 0);
  const totalOrders  = reps.reduce((sum, r) => sum + Number(r.orderCount || 0), 0);
  const topRep       = reps[0];

  const chartData = [...reps].reverse(); // highest revenue at the top of a horizontal bar chart

  return (
    <Layout title="Performance">
      {/* Date range filter */}
      <div className="card p-4 mb-5">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <label className="label">From</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input" />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input" />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Team Revenue"  value={fmt(totalRevenue)}                icon="💰" color="green" />
        <StatCard label="Team Orders"   value={totalOrders}                      icon="📋" color="blue"  />
        <StatCard label="Active Reps"   value={reps.length}                      icon="👥" color="purple" />
        <StatCard label="Top Performer" value={topRep?.repName ?? '—'}           icon="🏆" color="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Revenue by rep */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Revenue by Sales Rep</h3>
          {!isLoading && chartData.length === 0 ? (
            <div className="flex h-[220px] items-center justify-center text-sm text-gray-400">
              No orders in this date range
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 36)}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `LKR ${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="repName" tick={{ fontSize: 11 }} width={110} />
                <Tooltip formatter={v => [`LKR ${formatAmount(v)}`, 'Revenue']} />
                <Bar dataKey="revenue" fill={BAR_COLOR} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Leaderboard table */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Leaderboard</h3>
            <span className="text-xs text-gray-400">Top 10 by revenue</span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">#</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Sales Rep</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Revenue</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Orders</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Avg Order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reps.map((rep, i) => (
                <tr key={rep.repId} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-sm text-gray-400 tabular-nums">{i + 1}</td>
                  <td className="px-4 py-2.5 text-sm font-medium text-gray-800">{rep.repName}</td>
                  <td className="px-4 py-2.5 text-sm text-right tabular-nums">{fmt(rep.revenue)}</td>
                  <td className="px-4 py-2.5 text-sm text-right tabular-nums">{rep.orderCount}</td>
                  <td className="px-4 py-2.5 text-sm text-right tabular-nums">{fmt(rep.avgOrderValue)}</td>
                </tr>
              ))}
              {!isLoading && reps.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">No data for this date range</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}

function fmt(v) {
  return v != null ? `LKR ${formatAmount(v)}` : '—';
}

export default withAuth(PerformancePage, ['SUPER_ADMIN', 'SALES_MANAGER', 'FINANCE_USER'], 'MOD_RPT_PERF', 'SFA');
