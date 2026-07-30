import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import { withAuth } from '../../lib/auth';
import { financeReportApi } from '../../lib/api';
import { formatAmount } from '../../lib/format';

const fmt = (v) => formatAmount(v);

function ReportLines({ lines }) {
  if (lines.length === 0) {
    return <p className="py-2 text-sm text-gray-400">None</p>;
  }
  return (
    <table className="w-full text-sm">
      <tbody>
        {lines.map((l, i) => (
          <tr key={l.accountId ?? i} className="border-b border-gray-50">
            <td className="py-1.5 text-gray-600">{l.accountCode ? `${l.accountCode} — ${l.accountName}` : l.accountName}</td>
            <td className="py-1.5 text-right tabular-nums">{fmt(l.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BalanceSheetPage() {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));

  const { data, isLoading } = useQuery({
    queryKey: ['finance-balance-sheet', asOfDate],
    queryFn: () => financeReportApi.balanceSheet({ asOfDate }).then(r => r.data),
    enabled: !!asOfDate,
  });

  return (
    <Layout title="Balance Sheet">
      <div className="card mb-4 flex flex-wrap items-center gap-3 p-4">
        <label className="text-sm text-gray-600">As of</label>
        <input type="date" className="input w-40" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
        {data && (
          <span className={`ml-auto rounded-full px-3 py-1 text-xs font-medium ${data.balanced ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {data.balanced ? 'Balanced' : 'Out of Balance'}
          </span>
        )}
      </div>

      {isLoading || !data ? (
        <div className="card p-8 text-center text-sm text-gray-500">Loading…</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card p-6">
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Assets</h3>
            <ReportLines lines={data.assets} />
            <div className="mt-2 flex justify-between border-t border-gray-200 pt-2 text-sm font-bold">
              <span>Total Assets</span>
              <span className="tabular-nums">{fmt(data.totalAssets)}</span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="card p-6">
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Liabilities</h3>
              <ReportLines lines={data.liabilities} />
              <div className="mt-2 flex justify-between border-t border-gray-200 pt-2 text-sm font-bold">
                <span>Total Liabilities</span>
                <span className="tabular-nums">{fmt(data.totalLiabilities)}</span>
              </div>
            </div>

            <div className="card p-6">
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Equity</h3>
              <ReportLines lines={data.equity} />
              <div className="mt-2 flex justify-between border-t border-gray-200 pt-2 text-sm font-bold">
                <span>Total Equity</span>
                <span className="tabular-nums">{fmt(data.totalEquity)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

export default withAuth(BalanceSheetPage, ['SUPER_ADMIN', 'FINANCE_USER'], 'MOD_FIN_BS', 'FINANCE');
