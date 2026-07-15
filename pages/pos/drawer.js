import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import { withAuth } from '../../lib/auth';
import { posApi, drawerApi } from '../../lib/api';
import { formatAmount } from '../../lib/format';

const fmt = (v) => formatAmount(v);

function VarianceCell({ value }) {
  if (value === null || value === undefined) return <span className="text-gray-400">—</span>;
  const n = Number(value);
  const cls = n === 0 ? 'text-green-700' : n > 0 ? 'text-blue-700' : 'text-red-700';
  return <span className={`font-semibold tabular-nums ${cls}`}>{n > 0 ? '+' : ''}{fmt(n)}</span>;
}

function PosDrawerPage() {
  const [page, setPage] = useState(0);
  const [cashierId, setCashierId] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data: cashiers = [] } = useQuery({
    queryKey: ['pos-report-cashiers'],
    queryFn: () => posApi.reportCashiers().then(r => r.data),
  });

  const params = {
    cashierId: cashierId || undefined,
    status: status || undefined,
    dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
    dateTo: dateTo ? new Date(dateTo + 'T23:59:59').toISOString() : undefined,
    page, size: 20,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['pos-drawer-sessions', params],
    queryFn: () => drawerApi.listSessions(params).then(r => r.data),
    keepPreviousData: true,
  });

  const columns = [
    { key: 'cashierName', label: 'Cashier' },
    { key: 'openedAt', label: 'Opened', render: (v) => v ? new Date(v).toLocaleString() : '—' },
    { key: 'closedAt', label: 'Closed', render: (v) => v ? new Date(v).toLocaleString() : '—' },
    { key: 'openingFloat', label: 'Opening Float', render: (v) => <span className="tabular-nums">LKR {fmt(v)}</span> },
    { key: 'expectedCash', label: 'Expected', render: (v) => <span className="tabular-nums">LKR {fmt(v)}</span> },
    { key: 'countedCash', label: 'Counted', render: (v) => v !== null && v !== undefined ? <span className="tabular-nums">LKR {fmt(v)}</span> : <span className="text-gray-400">—</span> },
    { key: 'variance', label: 'Variance', render: (v) => <VarianceCell value={v} /> },
    { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v} /> },
  ];

  return (
    <Layout title="Cash Drawer">
      <DataTable
        columns={columns}
        data={data?.content || []}
        loading={isLoading}
        totalPages={data?.totalPages || 1}
        currentPage={page}
        onPageChange={setPage}
        emptyMessage="No drawer sessions match the selected filters"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select className="input w-44" value={cashierId} onChange={e => { setCashierId(e.target.value); setPage(0); }}>
              <option value="">All Cashiers</option>
              {cashiers.map(c => <option key={c.id} value={c.id}>{c.fullName}</option>)}
            </select>

            <select className="input w-36" value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}>
              <option value="">All Status</option>
              <option value="OPEN">Open</option>
              <option value="CLOSED">Closed</option>
            </select>

            <input type="date" className="input w-40" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0); }} />
            <span className="text-gray-400 text-sm">to</span>
            <input type="date" className="input w-40" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0); }} />
          </div>
        }
      />
    </Layout>
  );
}

export default withAuth(PosDrawerPage, ['SUPER_ADMIN', 'SALES_MANAGER', 'FINANCE_USER'], 'MOD_POS_DRAWER', 'POS');
