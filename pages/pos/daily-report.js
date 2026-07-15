import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import StatCard from '../../components/StatCard';
import { withAuth } from '../../lib/auth';
import { posApi } from '../../lib/api';
import { formatAmount } from '../../lib/format';

const fmt = (v) => formatAmount(v);

const todayStr = () => new Date().toISOString().slice(0, 10);

const PAYMENT_BADGE = {
  CASH:   'bg-green-50 text-green-700 border-green-200',
  CARD:   'bg-blue-50  text-blue-700  border-blue-200',
  CREDIT: 'bg-amber-50 text-amber-700 border-amber-200',
};

function PaymentBadge({ method }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${PAYMENT_BADGE[method] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
      {method}
    </span>
  );
}

function SummaryTile({ label, value, tone = 'neutral', sub }) {
  const toneCls = {
    neutral: 'border-gray-200 bg-gray-50 text-gray-800',
    good:    'border-green-200 bg-green-50 text-green-700',
    warn:    'border-blue-200 bg-blue-50 text-blue-700',
    bad:     'border-red-200 bg-red-50 text-red-700',
  }[tone];
  return (
    <div className={`rounded-xl border p-4 ${toneCls}`}>
      <p className="text-xs font-medium uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs opacity-70">{sub}</p>}
    </div>
  );
}

function PaymentTile({ label, badgeClass, stat, extra }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${badgeClass}`}>{label}</span>
        <span className="text-xs text-gray-400">{stat?.count || 0} txn</span>
      </div>
      <p className="mt-2 text-xl font-bold tabular-nums text-gray-900">LKR {fmt(stat?.revenue)}</p>
      {extra}
    </div>
  );
}

function PosDailyReportPage() {
  const [date, setDate] = useState(todayStr());
  const [cashierId, setCashierId] = useState('');

  const { data: cashiers = [] } = useQuery({
    queryKey: ['pos-report-cashiers'],
    queryFn: () => posApi.reportCashiers().then(r => r.data),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['pos-daily-report', date, cashierId],
    queryFn: () => posApi.dailyReport({ date, cashierId: cashierId || undefined }).then(r => r.data),
    enabled: !!date,
    keepPreviousData: true,
  });

  const breakdown = data?.paymentBreakdown || [];
  const findStat = (method) => breakdown.find(b => b.method === method);

  const variance = data ? Number(data.totalVariance) : 0;
  const varianceTone = !data?.allSessionsClosed ? 'neutral' : variance === 0 ? 'good' : variance > 0 ? 'warn' : 'bad';

  const sessionColumns = [
    { key: 'cashierName', label: 'Cashier' },
    { key: 'openedAt', label: 'Opened', render: (v) => v ? new Date(v).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }) : '—' },
    { key: 'closedAt', label: 'Closed', render: (v) => v ? new Date(v).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }) : '—' },
    { key: 'openingFloat', label: 'Opening Float', render: (v) => <span className="tabular-nums">LKR {fmt(v)}</span> },
    { key: 'expectedCash', label: 'Expected', render: (v) => <span className="tabular-nums">LKR {fmt(v)}</span> },
    { key: 'countedCash', label: 'Counted', render: (v) => v !== null && v !== undefined ? <span className="tabular-nums">LKR {fmt(v)}</span> : <span className="text-gray-400">—</span> },
    {
      key: 'variance', label: 'Variance',
      render: (v) => v === null || v === undefined
        ? <span className="text-gray-400">—</span>
        : <span className={`font-semibold tabular-nums ${Number(v) === 0 ? 'text-green-700' : Number(v) > 0 ? 'text-blue-700' : 'text-red-700'}`}>
            {Number(v) > 0 ? '+' : ''}{fmt(v)}
          </span>,
    },
    { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v} /> },
  ];

  const txColumns = [
    { key: 'createdAt', label: 'Time', render: (v) => v ? new Date(v).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—' },
    { key: 'saleNumber', label: 'Sale #' },
    { key: 'cashierName', label: 'Cashier' },
    { key: 'customerName', label: 'Customer' },
    { key: 'paymentMethod', label: 'Payment', render: (v) => <PaymentBadge method={v} /> },
    { key: 'cardLast4', label: 'Card', render: (v) => v ? <span className="font-mono text-xs text-gray-600">•• {v}</span> : <span className="text-gray-400">—</span> },
    { key: 'total', label: 'Total', render: (v) => <span className="font-semibold tabular-nums">LKR {fmt(v)}</span> },
    {
      key: 'amountPaid', label: 'Paid / Due',
      render: (v, row) => row.paymentMethod === 'CREDIT'
        ? <span className="tabular-nums text-xs">
            <span className="text-green-700">{fmt(v)}</span> / <span className="text-amber-700">{fmt(row.balanceDue)}</span>
          </span>
        : <span className="text-gray-400">—</span>,
    },
    { key: 'creditStatus', label: 'Credit', render: (v) => v !== 'NOT_APPLICABLE' ? <StatusBadge status={v} /> : <span className="text-gray-400">—</span> },
    { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v} /> },
  ];

  return (
    <Layout title="Daily Report">
      <div className="space-y-6">
        {/* Filter bar */}
        <div className="card flex flex-wrap items-end gap-3 p-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">Date</label>
            <input
              type="date" className="input w-44" max={todayStr()}
              value={date} onChange={e => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">Cashier</label>
            <select className="input w-48" value={cashierId} onChange={e => setCashierId(e.target.value)}>
              <option value="">All Cashiers</option>
              {cashiers.map(c => <option key={c.id} value={c.id}>{c.fullName}</option>)}
            </select>
          </div>
        </div>

        {isLoading && !data ? (
          <div className="card p-12 text-center text-sm text-gray-400">Loading…</div>
        ) : !data ? null : (
          <>
            {/* Drawer reconciliation */}
            <div>
              <h2 className="mb-2 text-sm font-semibold text-gray-700">Drawer — Opening to Closing</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SummaryTile label="Opening Float" value={`LKR ${fmt(data.totalOpeningFloat)}`} />
                <SummaryTile label="Expected Cash" value={`LKR ${fmt(data.totalExpectedCash)}`} tone="neutral" />
                <SummaryTile
                  label="Counted Cash"
                  value={data.allSessionsClosed ? `LKR ${fmt(data.totalCountedCash)}` : '—'}
                  sub={data.allSessionsClosed ? undefined : 'Drawer not yet closed'}
                />
                <SummaryTile
                  label="Variance"
                  value={data.allSessionsClosed ? `${variance > 0 ? '+' : ''}LKR ${fmt(variance)}` : '—'}
                  tone={varianceTone}
                  sub={!data.allSessionsClosed ? undefined : variance === 0 ? 'Balanced' : variance > 0 ? 'Over' : 'Short'}
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SummaryTile label="Cash Deposits" value={`LKR ${fmt(data.depositsTotal)}`} />
                <SummaryTile label="Cash Withdrawals" value={`LKR ${fmt(data.withdrawalsTotal)}`} />
                <SummaryTile label="Gross Sales" value={`LKR ${fmt(data.grossSalesTotal)}`} />
                <SummaryTile label="Transactions" value={data.totalTransactionCount} />
              </div>
            </div>

            {/* Payment method breakdown */}
            <div>
              <h2 className="mb-2 text-sm font-semibold text-gray-700">Payment Method Breakdown</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <PaymentTile label="CASH" badgeClass={PAYMENT_BADGE.CASH} stat={findStat('CASH')} />
                <PaymentTile label="CARD" badgeClass={PAYMENT_BADGE.CARD} stat={findStat('CARD')} />
                <PaymentTile
                  label="CREDIT" badgeClass={PAYMENT_BADGE.CREDIT} stat={findStat('CREDIT')}
                  extra={
                    <p className="mt-1 text-xs text-gray-500">
                      Paid <span className="font-semibold text-green-700">LKR {fmt(data.creditAmountPaidTotal)}</span>
                      {' · '}Due <span className="font-semibold text-amber-700">LKR {fmt(data.creditBalanceDueTotal)}</span>
                    </p>
                  }
                />
              </div>
            </div>

            {/* Drawer sessions */}
            <div>
              <h2 className="mb-2 text-sm font-semibold text-gray-700">Drawer Sessions</h2>
              <DataTable columns={sessionColumns} data={data.sessions} emptyMessage="No drawer sessions opened on this date" />
            </div>

            {/* Transactions */}
            <div>
              <h2 className="mb-2 text-sm font-semibold text-gray-700">Transactions</h2>
              <DataTable columns={txColumns} data={data.transactions} emptyMessage="No transactions on this date" />
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default withAuth(PosDailyReportPage, ['SUPER_ADMIN', 'SALES_MANAGER', 'FINANCE_USER'], 'MOD_POS_DAILY_REPORT', 'POS');
