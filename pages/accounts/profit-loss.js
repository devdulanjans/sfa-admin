import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import { withAuth } from '../../lib/auth';
import { accountsApi } from '../../lib/api';
import { formatAmount } from '../../lib/format';

const fmt = (v) => formatAmount(v);

const todayStr = () => new Date().toISOString().slice(0, 10);
const firstOfMonthStr = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

const CATEGORY_LABELS = {
  PURCHASES:   'Purchases / COGS',
  RENT:        'Rent',
  UTILITIES:   'Utilities',
  SALARIES:    'Salaries',
  TRANSPORT:   'Transport',
  MARKETING:   'Marketing',
  MAINTENANCE: 'Maintenance',
  OTHER:       'Other',
};

function SummaryTile({ label, value, tone = 'neutral', sub }) {
  const toneCls = {
    neutral: 'border-gray-200 bg-gray-50 text-gray-800',
    good:    'border-green-200 bg-green-50 text-green-700',
    bad:     'border-red-200 bg-red-50 text-red-700',
  }[tone];
  return (
    <div className={`rounded-xl border p-5 ${toneCls}`}>
      <p className="text-xs font-medium uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs opacity-70">{sub}</p>}
    </div>
  );
}

function ProfitLossPage() {
  const [dateFrom, setDateFrom] = useState(firstOfMonthStr());
  const [dateTo, setDateTo] = useState(todayStr());

  const { data, isLoading } = useQuery({
    queryKey: ['accounts-profit-loss', dateFrom, dateTo],
    queryFn: () => accountsApi.profitLoss({ dateFrom, dateTo }).then(r => r.data),
    enabled: !!dateFrom && !!dateTo,
    keepPreviousData: true,
  });

  const netProfit = data ? Number(data.netProfit) : 0;
  const grossProfit = data ? Number(data.grossProfit) : 0;
  const totalExpenses = data ? Number(data.totalExpenses) : 0;
  const categories = data?.expensesByCategory || [];

  return (
    <Layout title="Profit & Loss">
      <div className="space-y-6">
        <div className="card flex flex-wrap items-end gap-3 p-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">From</label>
            <input type="date" className="input w-40" value={dateFrom} onChange={e => setDateFrom(e.target.value)} max={dateTo} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">To</label>
            <input type="date" className="input w-40" value={dateTo} onChange={e => setDateTo(e.target.value)} min={dateFrom} max={todayStr()} />
          </div>
        </div>

        {isLoading && !data ? (
          <div className="card p-12 text-center text-sm text-gray-400">Loading…</div>
        ) : !data ? null : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <SummaryTile
                label="Total Income"
                value={`LKR ${fmt(data.totalIncome)}`}
                sub={`${data.incomeTransactionCount} POS sale${data.incomeTransactionCount === 1 ? '' : 's'}`}
              />
              <SummaryTile
                label="Cost of Goods Sold"
                value={`LKR ${fmt(data.totalCogs)}`}
                sub="FIFO batch cost of items sold"
              />
              <SummaryTile
                label={grossProfit >= 0 ? 'Gross Profit' : 'Gross Loss'}
                value={`LKR ${fmt(Math.abs(grossProfit))}`}
                tone={grossProfit >= 0 ? 'good' : 'bad'}
                sub="Income − COGS"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SummaryTile
                label="Total Expenses"
                value={`LKR ${fmt(data.totalExpenses)}`}
                sub={`${categories.length} categor${categories.length === 1 ? 'y' : 'ies'}`}
              />
              <SummaryTile
                label={netProfit >= 0 ? 'Net Profit' : 'Net Loss'}
                value={`LKR ${fmt(Math.abs(netProfit))}`}
                tone={netProfit >= 0 ? 'good' : 'bad'}
                sub={dateFrom === dateTo ? dateFrom : `${dateFrom} to ${dateTo}`}
              />
            </div>

            <div className="card p-5">
              <h2 className="mb-3 text-sm font-semibold text-gray-700">Expenses by Category</h2>
              {categories.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">No expenses recorded in this date range</p>
              ) : (
                <div className="space-y-2">
                  {categories
                    .slice()
                    .sort((a, b) => Number(b.amount) - Number(a.amount))
                    .map(c => {
                      const pct = totalExpenses > 0 ? (Number(c.amount) / totalExpenses) * 100 : 0;
                      return (
                        <div key={c.category} className="flex items-center gap-3">
                          <span className="w-40 flex-shrink-0 text-sm text-gray-600">{CATEGORY_LABELS[c.category] || c.category}</span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                            <div className="h-full rounded-full bg-red-400" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-28 flex-shrink-0 text-right text-sm font-semibold tabular-nums text-gray-800">LKR {fmt(c.amount)}</span>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default withAuth(ProfitLossPage, ['SUPER_ADMIN', 'SALES_MANAGER', 'FINANCE_USER'], 'MOD_ACC_PROFIT_LOSS', 'POS');
