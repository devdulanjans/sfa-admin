import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/router';
import toast from 'react-hot-toast';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import ExportButton from '../../components/ExportButton';
import { withAuth, useAuth } from '../../lib/auth';
import { orderApi } from '../../lib/api';
import { formatAmount } from '../../lib/format';

// ── Search / date filter panel ────────────────────────────────────────────────

const EMPTY_SEARCH_DRAFT = { orderNo: '', invoiceNo: '', dateFrom: '', dateTo: '' };

function countActive(f) {
  return Object.values(f).filter((v) => v !== '').length;
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  );
}

function DateRangeField({ label, fromValue, onFromChange, toValue, onToChange }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="date" value={fromValue} onChange={onFromChange}
          max={toValue || undefined}
          className="input-base flex-1 min-w-0"
        />
        <span className="text-gray-400 text-xs shrink-0">to</span>
        <input
          type="date" value={toValue} onChange={onToChange}
          min={fromValue || undefined}
          className="input-base flex-1 min-w-0"
        />
      </div>
    </div>
  );
}

function SearchFilterPanel({ onApply }) {
  const [open,  setOpen]  = useState(true);
  const [draft, setDraft] = useState(EMPTY_SEARCH_DRAFT);

  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }));

  const apply = () => onApply({ ...draft });
  const clear = () => {
    setDraft(EMPTY_SEARCH_DRAFT);
    onApply({ ...EMPTY_SEARCH_DRAFT });
  };

  const active = countActive(draft);

  return (
    <div className="mb-4 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
          <span className="text-sm font-semibold text-gray-700">Search &amp; Date Filters</span>
          {active > 0 && (
            <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
              {active} active
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? '' : 'rotate-180'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      </button>

      {open && (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Order #">
              <input
                type="text" value={draft.orderNo} onChange={set('orderNo')}
                placeholder="Search…" className="input-base"
              />
            </Field>
            <Field label="Invoice #">
              <input
                type="text" value={draft.invoiceNo} onChange={set('invoiceNo')}
                placeholder="Search…" className="input-base"
              />
            </Field>
            <DateRangeField
              label="Order Date"
              fromValue={draft.dateFrom} onFromChange={set('dateFrom')}
              toValue={draft.dateTo}     onToChange={set('dateTo')}
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={apply}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Apply Filters
            </button>
            {active > 0 && (
              <button
                onClick={clear}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function OrdersPage() {
  const router = useRouter();
  const qc     = useQueryClient();
  const { isManager } = useAuth();
  const [page, setPage]     = useState(0);
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [search, setSearch] = useState(EMPTY_SEARCH_DRAFT);

  const handleApplySearch = (f) => {
    setSearch(f);
    setPage(0);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['orders', page, status, source, search],
    queryFn:  () => orderApi.list({
      page,
      size: 20,
      status: status || undefined,
      source: source || undefined,
      orderNo:   search.orderNo   || undefined,
      invoiceNo: search.invoiceNo || undefined,
      dateFrom:  search.dateFrom  || undefined,
      dateTo:    search.dateTo    || undefined,
    }).then(r => r.data),
    keepPreviousData: true,
  });

  const approveMutation = useMutation({
    mutationFn: (id) => orderApi.approve(id),
    onSuccess: () => {
      qc.invalidateQueries(['orders']);
      toast.success('Order approved');
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Failed to approve'),
  });

  const COLUMNS = [
    { key: 'orderNumber', label: 'Order #',  width: 130 },
    { key: 'customer',    label: 'Customer', render: (v) => v?.name },
    {
      key: 'orderSource', label: 'Source', width: 120,
      render: (v) => v === 'CUSTOMER_APP'
        ? <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800">Customer App</span>
        : <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">Sales Rep</span>,
    },
    { key: 'salesRep',    label: 'Sales Rep', render: (v) => v?.fullName },
    { key: 'invoiceNumber', label: 'Invoice #', width: 130, render: (v) => v || '—' },
    { key: 'total',       label: 'Total (LKR)',    render: (v) => v != null ? `LKR ${formatAmount(v)}` : '—' },
    { key: 'status',      label: 'Status',   render: (v) => <StatusBadge status={v} /> },
    { key: 'orderDate',   label: 'Date',     render: (v) => v ? new Date(v).toLocaleDateString() : '—' },
    {
      key: 'actions', label: '', width: 160,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(`/orders/${row.id}`)}
            className="text-blue-600 text-xs hover:text-blue-800 font-medium"
          >
            View
          </button>
          {isManager() && row.status === 'SUBMITTED' && (
            <button
              onClick={() => approveMutation.mutate(row.id)}
              disabled={approveMutation.isPending}
              className="text-green-600 text-xs hover:text-green-800 font-medium"
            >
              Approve
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <Layout title="Orders">
      <SearchFilterPanel onApply={handleApplySearch} />

      {/* Filters */}
      <div className="flex flex-col gap-2 mb-4">
        {/* Status filter */}
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-gray-400 w-12 shrink-0">Status</span>
          {['', 'DRAFT', 'SUBMITTED', 'APPROVED', 'INVOICED', 'CANCELLED'].map((s) => (
            <button
              key={s}
              onClick={() => { setStatus(s); setPage(0); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                status === s
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {s || 'All'}
            </button>
          ))}
        </div>

        {/* Source filter */}
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-gray-400 w-12 shrink-0">Source</span>
          {[
            { value: '',             label: 'All' },
            { value: 'CUSTOMER_APP', label: '🛒 Customer App' },
            { value: 'SALES_REP',    label: 'Sales Rep' },
          ].map(({ value, label }) => (
            <button
              key={value}
              onClick={() => { setSource(value); setPage(0); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                source === value
                  ? value === 'CUSTOMER_APP'
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
          {source === 'CUSTOMER_APP' && (
            <span className="ml-1 text-xs text-purple-600 font-medium">
              Showing orders placed by customers via the Customer Portal app
            </span>
          )}
        </div>
      </div>

      <DataTable
        columns={COLUMNS}
        data={data?.content || []}
        loading={isLoading}
        totalPages={data?.totalPages || 1}
        currentPage={page}
        onPageChange={setPage}
        actions={<ExportButton params={{
          status, source,
          orderNo:   search.orderNo   || undefined,
          invoiceNo: search.invoiceNo || undefined,
          dateFrom:  search.dateFrom  || undefined,
          dateTo:    search.dateTo    || undefined,
        }} filename="orders" />}
        emptyMessage="No orders found"
      />
    </Layout>
  );
}

export default withAuth(OrdersPage, [], 'MOD_ORDERS', 'SFA');
