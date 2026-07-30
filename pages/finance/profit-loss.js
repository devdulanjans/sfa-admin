import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import { withAuth } from '../../lib/auth';
import { financeReportApi } from '../../lib/api';
import { formatAmount } from '../../lib/format';

const fmt = (v) => formatAmount(v);

function firstOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

function ReportLines({ lines }) {
  if (lines.length === 0) {
    return <p className="py-2 text-sm text-gray-400">None</p>;
  }
  return (
    <table className="w-full text-sm">
      <tbody>
        {lines.map(l => (
          <tr key={l.accountId} className="border-b border-gray-50">
            <td className="py-1.5 text-gray-600">{l.accountCode} — {l.accountName}</td>
            <td className="py-1.5 text-right tabular-nums">{fmt(l.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ProfitLossPage() {
  const [dateFrom, setDateFrom] = useState(firstOfMonth());
  const [dateTo, setDateTo] = useState(today());

  const { data, isLoading } = useQuery({
    queryKey: ['finance-profit-loss', dateFrom, dateTo],
    queryFn: () => financeReportApi.profitLoss({ dateFrom, dateTo }).then(r => r.data),
    enabled: !!dateFrom && !!dateTo,
  });

  return (
    <Layout title="Profit & Loss">
      <div className="card mb-4 flex flex-wrap items-center gap-3 p-4">
        <label className="text-sm text-gray-600">From</label>
        <input type="date" className="input w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <label className="text-sm text-gray-600">To</label>
        <input type="date" className="input w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
      </div>

      {isLoading || !data ? (
        <div className="card p-8 text-center text-sm text-gray-500">Loading…</div>
      ) : (
        <div className="card p-6 max-w-2xl space-y-6">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Revenue</h3>
            <ReportLines lines={data.revenue} />
            <div className="mt-2 flex justify-between border-t border-gray-200 pt-2 text-sm font-semibold">
              <span>Total Revenue</span>
              <span className="tabular-nums">{fmt(data.totalRevenue)}</span>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Expenses</h3>
            <ReportLines lines={data.expenses} />
            <div className="mt-2 flex justify-between border-t border-gray-200 pt-2 text-sm font-semibold">
              <span>Total Expenses</span>
              <span className="tabular-nums">{fmt(data.totalExpenses)}</span>
            </div>
          </div>

          <div className={`flex justify-between rounded-lg p-3 text-base font-bold ${data.netProfit >= 0 ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            <span>Net Profit</span>
            <span className="tabular-nums">{fmt(data.netProfit)}</span>
          </div>
        </div>
      )}
    </Layout>
  );
}

export default withAuth(ProfitLossPage, ['SUPER_ADMIN', 'SALES_MANAGER', 'FINANCE_USER'], 'MOD_FIN_PL', 'FINANCE');
