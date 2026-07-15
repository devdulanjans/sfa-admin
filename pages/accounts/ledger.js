import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import { withAuth } from '../../lib/auth';
import { accountsApi } from '../../lib/api';
import { formatAmount } from '../../lib/format';

const fmt = (v) => formatAmount(v);

const todayStr = () => new Date().toISOString().slice(0, 10);
const firstOfMonthStr = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

function TypeBadge({ type }) {
  return type === 'INCOME'
    ? <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">Income</span>
    : <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Expense</span>;
}

function AccountsLedgerPage() {
  const [dateFrom, setDateFrom] = useState(firstOfMonthStr());
  const [dateTo, setDateTo] = useState(todayStr());

  const { data, isLoading } = useQuery({
    queryKey: ['accounts-ledger', dateFrom, dateTo],
    queryFn: () => accountsApi.ledger({ dateFrom, dateTo }).then(r => r.data),
    enabled: !!dateFrom && !!dateTo,
    keepPreviousData: true,
  });

  const columns = [
    { key: 'date', label: 'Date', render: (v) => v ? new Date(v).toLocaleString('en', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—' },
    { key: 'type', label: 'Type', render: (v) => <TypeBadge type={v} /> },
    { key: 'reference', label: 'Reference' },
    { key: 'description', label: 'Description' },
    { key: 'debit', label: 'Debit', render: (v) => Number(v) > 0 ? <span className="tabular-nums text-red-700">{fmt(v)}</span> : <span className="text-gray-400">—</span> },
    { key: 'credit', label: 'Credit', render: (v) => Number(v) > 0 ? <span className="tabular-nums text-green-700">{fmt(v)}</span> : <span className="text-gray-400">—</span> },
    { key: 'balance', label: 'Balance', render: (v) => <span className={`font-semibold tabular-nums ${Number(v) < 0 ? 'text-red-700' : 'text-gray-900'}`}>{fmt(v)}</span> },
  ];

  const entries = data || [];
  const finalBalance = entries.length ? entries[entries.length - 1].balance : 0;

  return (
    <Layout title="General Ledger">
      <div className="space-y-4">
        <div className="card flex flex-wrap items-end justify-between gap-3 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">From</label>
              <input type="date" className="input w-40" value={dateFrom} onChange={e => setDateFrom(e.target.value)} max={dateTo} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">To</label>
              <input type="date" className="input w-40" value={dateTo} onChange={e => setDateTo(e.target.value)} min={dateFrom} max={todayStr()} />
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Closing Balance</p>
            <p className={`text-xl font-bold tabular-nums ${Number(finalBalance) < 0 ? 'text-red-700' : 'text-gray-900'}`}>LKR {fmt(finalBalance)}</p>
          </div>
        </div>

        <DataTable columns={columns} data={entries} loading={isLoading} emptyMessage="No income or expense entries in this date range" />
      </div>
    </Layout>
  );
}

export default withAuth(AccountsLedgerPage, ['SUPER_ADMIN', 'SALES_MANAGER', 'FINANCE_USER'], 'MOD_ACC_LEDGER', 'POS');
