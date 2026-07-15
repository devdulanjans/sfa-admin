import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import RecordCreditPaymentModal from '../../components/RecordCreditPaymentModal';
import { withAuth } from '../../lib/auth';
import { posApi, customerApi } from '../../lib/api';
import toast from 'react-hot-toast';
import { formatAmount } from '../../lib/format';

function useDebounce(value, delay = 220) {
  const [dv, setDv] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return dv;
}

const STATUS_OPTIONS = [
  { value: '',               label: 'Open (Unpaid + Partial)' },
  { value: 'UNPAID',         label: 'Unpaid' },
  { value: 'PARTIALLY_PAID', label: 'Partially Paid' },
  { value: 'PAID',           label: 'Paid (Settled)' },
  { value: 'ALL',            label: 'All' },
];

function CustomerCreditPage() {
  const qc = useQueryClient();
  const [page, setPage]           = useState(0);
  const [status, setStatus]       = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerDropdown, setCustomerDropdown] = useState(false);
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState('');
  const [payBill, setPayBill]     = useState(null);

  const debouncedCustomerSearch = useDebounce(customerSearch, 220);

  const { data: customerData } = useQuery({
    queryKey: ['credit-customer-search', debouncedCustomerSearch],
    queryFn: () => customerApi.list({ page: 0, size: 20, search: debouncedCustomerSearch }).then(r => r.data),
    enabled: debouncedCustomerSearch.trim().length >= 2,
    staleTime: 10_000,
  });
  const customerResults = customerData?.content ?? [];

  const filterParams = {
    status: status && status !== 'ALL' ? status : undefined,
    customerId: customerId || undefined,
    dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
    dateTo: dateTo ? new Date(dateTo + 'T23:59:59').toISOString() : undefined,
  };
  const params = { ...filterParams, page, size: 20 };

  const { data, isLoading } = useQuery({
    queryKey: ['pos-credit-bills', params],
    queryFn: () => posApi.listCreditBills(params).then(r => r.data),
    keepPreviousData: true,
  });

  const { data: totalDueData, isLoading: totalDueLoading } = useQuery({
    queryKey: ['pos-credit-total-due', filterParams],
    queryFn: () => posApi.creditTotalDue(filterParams).then(r => r.data),
    keepPreviousData: true,
  });

  const payMutation = useMutation({
    mutationFn: ({ saleId, body }) => posApi.recordSalePayment(saleId, body),
    onSuccess: () => {
      toast.success('Payment recorded');
      qc.invalidateQueries({ queryKey: ['pos-credit-bills'] });
      qc.invalidateQueries({ queryKey: ['pos-credit-total-due'] });
      setPayBill(null);
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? err.response?.data?.message ?? 'Failed to record payment'),
  });

  const columns = [
    { key: 'saleNumber', label: 'Sale #' },
    { key: 'customerName', label: 'Customer' },
    { key: 'createdAt', label: 'Date', render: (v) => v ? new Date(v).toLocaleDateString() : '—' },
    { key: 'total', label: 'Total', render: (v) => <span className="font-semibold">LKR {formatAmount(v)}</span> },
    { key: 'amountPaid', label: 'Paid', render: (v) => `LKR ${formatAmount(v)}` },
    {
      key: 'balanceDue', label: 'Balance Due',
      render: (v) => <span className={Number(v) > 0 ? 'font-semibold text-amber-700' : 'text-gray-400'}>LKR {formatAmount(v)}</span>,
    },
    { key: 'creditStatus', label: 'Status', render: (v) => <StatusBadge status={v} /> },
    {
      key: 'actions', label: '',
      render: (_, row) => row.creditStatus !== 'PAID' ? (
        <button onClick={() => setPayBill(row)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
          Record Payment
        </button>
      ) : null,
    },
  ];

  const statusLabel = STATUS_OPTIONS.find(o => o.value === status)?.label ?? 'All';

  return (
    <Layout title="Customer Credit">
      <div className="mb-4 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">
            Total Due · {statusLabel}
            {customerId && customerSearch ? ` · ${customerSearch}` : ''}
            {(dateFrom || dateTo) ? ` · ${dateFrom || '…'} to ${dateTo || '…'}` : ''}
          </p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums text-amber-800">
            {totalDueLoading ? '…' : `LKR ${formatAmount(totalDueData?.totalDue)}`}
          </p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data?.content || []}
        loading={isLoading}
        totalPages={data?.totalPages || 1}
        currentPage={page}
        onPageChange={setPage}
        emptyMessage="No credit bills found"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select className="input w-52" value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            <div className="relative">
              {customerId ? (
                <div className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs">
                  <span className="font-medium text-blue-800">{customerSearch}</span>
                  <button onClick={() => { setCustomerId(''); setCustomerSearch(''); setPage(0); }} className="text-blue-400 hover:text-blue-700">✕</button>
                </div>
              ) : (
                <input
                  className="input w-48 text-sm"
                  placeholder="Filter by customer…"
                  value={customerSearch}
                  onChange={e => { setCustomerSearch(e.target.value); setCustomerDropdown(true); }}
                  onFocus={() => setCustomerDropdown(true)}
                  onBlur={() => setTimeout(() => setCustomerDropdown(false), 150)}
                />
              )}
              {customerDropdown && !customerId && customerResults.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-40 w-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                  {customerResults.map(c => (
                    <button key={c.id} type="button"
                      onMouseDown={() => { setCustomerId(c.id); setCustomerSearch(c.name); setCustomerDropdown(false); setPage(0); }}
                      className="flex w-full justify-between border-b border-gray-50 px-3 py-2 text-left text-sm last:border-0 hover:bg-blue-50">
                      <span className="font-medium text-gray-800">{c.name}</span>
                      <span className="text-xs text-gray-400">{c.customerCode}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <input type="date" className="input w-40" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0); }} />
            <span className="text-gray-400 text-sm">to</span>
            <input type="date" className="input w-40" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0); }} />
          </div>
        }
      />

      {payBill && (
        <RecordCreditPaymentModal
          bill={payBill}
          isPending={payMutation.isPending}
          onSubmit={(body) => payMutation.mutate({ saleId: payBill.id, body })}
          onClose={() => setPayBill(null)}
        />
      )}
    </Layout>
  );
}

export default withAuth(CustomerCreditPage, ['SUPER_ADMIN', 'SALES_MANAGER'], 'MOD_POS_CREDIT', 'POS');
