import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Layout from '../../components/Layout';
import StatCard from '../../components/StatCard';
import ExportButton from '../../components/ExportButton';
import { withAuth } from '../../lib/auth';
import { reportApi } from '../../lib/api';
import { formatAmount } from '../../lib/format';

function SalesReportPage() {
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [to, setTo] = useState(() => new Date().toISOString().split('T')[0]);

  const { data, isLoading } = useQuery({
    queryKey: ['sales-report', from, to],
    queryFn:  () => reportApi.salesSummary({ from, to }).then(r => r.data),
    enabled:  !!from && !!to,
  });

  const { data: customerData } = useQuery({
    queryKey: ['customer-sales', from, to],
    queryFn:  () => reportApi.customerSales({ from, to, page: 0, size: 10 }).then(r => r.data),
    enabled:  !!from && !!to,
  });

  return (
    <Layout title="Sales Reports">
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
          <div className="mt-5">
            <ExportButton params={{ from, to }} filename="sales-report" />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Total Revenue"  value={fmt(data?.totalRevenue)}  icon="💰" color="green" />
        <StatCard label="Total Orders"   value={data?.totalOrders ?? '—'} icon="📋" color="blue"  />
        <StatCard label="Avg Order Value" value={fmt(data?.avgOrderValue)} icon="📊" color="amber" />
        <StatCard label="Invoices Issued" value={data?.invoicesCount ?? '—'} icon="🧾" color="purple" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Daily revenue chart */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Daily Revenue</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data?.dailyRevenue || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `LKR ${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => [`LKR ${formatAmount(v)}`, 'Revenue']} />
              <Bar dataKey="revenue" fill="#3b82f6" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top customers */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Top Customers</h3>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Customer</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Revenue</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Orders</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(customerData?.content || []).map(row => (
                <tr key={row.customerId} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-sm font-medium text-gray-800">{row.customerName}</td>
                  <td className="px-4 py-2.5 text-sm text-right tabular-nums">{fmt(row.revenue)}</td>
                  <td className="px-4 py-2.5 text-sm text-right tabular-nums">{row.orderCount}</td>
                </tr>
              ))}
              {(!customerData?.content?.length) && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-gray-400">No data</td></tr>
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

export default withAuth(SalesReportPage, ['SUPER_ADMIN', 'SALES_MANAGER', 'FINANCE_USER'], 'MOD_RPT_SALES', 'SFA');
