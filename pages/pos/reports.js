import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import { withAuth } from '../../lib/auth';
import { posApi, customerApi, productApi } from '../../lib/api';
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

function downloadBlob(data, filename) {
  const url = URL.createObjectURL(new Blob([data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function PosReportsPage() {
  const [page, setPage] = useState(0);
  const [cashierId, setCashierId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [customerId, setCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerDropdown, setCustomerDropdown] = useState(false);

  const [productId, setProductId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [productDropdown, setProductDropdown] = useState(false);

  const [exporting, setExporting] = useState(null); // 'xlsx' | 'pdf' | null

  const debouncedCustomerSearch = useDebounce(customerSearch, 220);
  const debouncedProductSearch  = useDebounce(productSearch, 220);

  const { data: cashiers = [] } = useQuery({
    queryKey: ['pos-report-cashiers'],
    queryFn: () => posApi.reportCashiers().then(r => r.data),
  });

  const { data: customerData } = useQuery({
    queryKey: ['pos-report-customer-search', debouncedCustomerSearch],
    queryFn: () => customerApi.list({ page: 0, size: 20, search: debouncedCustomerSearch }).then(r => r.data),
    enabled: debouncedCustomerSearch.trim().length >= 2,
    staleTime: 10_000,
  });
  const customerResults = customerData?.content ?? [];

  const { data: productData } = useQuery({
    queryKey: ['pos-report-product-search', debouncedProductSearch],
    queryFn: () => productApi.list({ page: 0, size: 20, search: debouncedProductSearch }).then(r => r.data),
    enabled: debouncedProductSearch.trim().length >= 2,
    staleTime: 10_000,
  });
  const productResults = productData?.content ?? [];

  const filterParams = {
    cashierId: cashierId || undefined,
    customerId: customerId || undefined,
    productId: productId || undefined,
    dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
    dateTo: dateTo ? new Date(dateTo + 'T23:59:59').toISOString() : undefined,
  };
  const params = { ...filterParams, page, size: 20 };

  const { data, isLoading } = useQuery({
    queryKey: ['pos-report', params],
    queryFn: () => posApi.report(params).then(r => r.data),
    keepPreviousData: true,
  });

  async function handleExport(format) {
    setExporting(format);
    try {
      const res = await posApi.reportExport(format, {
        ...filterParams,
        cashierLabel: cashiers.find(c => c.id === cashierId)?.fullName,
        customerLabel: customerId ? customerSearch : undefined,
        productLabel: productId ? productSearch : undefined,
      });
      downloadBlob(res.data, `pos-sales-report.${format}`);
    } catch (err) {
      toast.error('Export failed');
    } finally {
      setExporting(null);
    }
  }

  const columns = [
    { key: 'saleNumber', label: 'Sale #' },
    { key: 'createdAt', label: 'Date', render: (v) => v ? new Date(v).toLocaleString() : '—' },
    { key: 'cashierName', label: 'Cashier' },
    { key: 'customerName', label: 'Customer' },
    {
      key: 'paymentMethod', label: 'Payment',
      render: (v) => (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border
          ${v === 'CASH'   ? 'bg-green-50 text-green-700 border-green-200' :
            v === 'CARD'   ? 'bg-blue-50  text-blue-700  border-blue-200'  :
                             'bg-amber-50 text-amber-700 border-amber-200'}`}>
          {v}
        </span>
      ),
    },
    { key: 'total', label: 'Total', render: (v) => <span className="font-semibold">LKR {formatAmount(v)}</span> },
    { key: 'creditStatus', label: 'Credit', render: (v) => v !== 'NOT_APPLICABLE' ? <StatusBadge status={v} /> : <span className="text-gray-400">—</span> },
    { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v} /> },
  ];

  return (
    <Layout title="POS Reports">
      <DataTable
        columns={columns}
        data={data?.content || []}
        loading={isLoading}
        totalPages={data?.totalPages || 1}
        currentPage={page}
        onPageChange={setPage}
        emptyMessage="No sales match the selected filters"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select className="input w-44" value={cashierId} onChange={e => { setCashierId(e.target.value); setPage(0); }}>
              <option value="">All Cashiers</option>
              {cashiers.map(c => <option key={c.id} value={c.id}>{c.fullName}</option>)}
            </select>

            <div className="relative">
              {customerId ? (
                <div className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs">
                  <span className="font-medium text-blue-800">{customerSearch}</span>
                  <button onClick={() => { setCustomerId(''); setCustomerSearch(''); setPage(0); }} className="text-blue-400 hover:text-blue-700">✕</button>
                </div>
              ) : (
                <input
                  className="input w-44 text-sm"
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

            <div className="relative">
              {productId ? (
                <div className="flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-xs">
                  <span className="font-medium text-teal-800">{productSearch}</span>
                  <button onClick={() => { setProductId(''); setProductSearch(''); setPage(0); }} className="text-teal-400 hover:text-teal-700">✕</button>
                </div>
              ) : (
                <input
                  className="input w-44 text-sm"
                  placeholder="Filter by product…"
                  value={productSearch}
                  onChange={e => { setProductSearch(e.target.value); setProductDropdown(true); }}
                  onFocus={() => setProductDropdown(true)}
                  onBlur={() => setTimeout(() => setProductDropdown(false), 150)}
                />
              )}
              {productDropdown && !productId && productResults.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-40 w-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                  {productResults.map(p => (
                    <button key={p.id} type="button"
                      onMouseDown={() => { setProductId(p.id); setProductSearch(p.name); setProductDropdown(false); setPage(0); }}
                      className="flex w-full justify-between border-b border-gray-50 px-3 py-2 text-left text-sm last:border-0 hover:bg-teal-50">
                      <span className="font-medium text-gray-800">{p.name}</span>
                      <span className="text-xs text-gray-400">{p.productCode}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <input type="date" className="input w-40" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0); }} />
            <span className="text-gray-400 text-sm">to</span>
            <input type="date" className="input w-40" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0); }} />

            <button
              onClick={() => handleExport('xlsx')}
              disabled={exporting !== null}
              className="btn-secondary text-sm disabled:opacity-50"
            >
              {exporting === 'xlsx' ? 'Exporting…' : '⬇ Excel'}
            </button>
            <button
              onClick={() => handleExport('pdf')}
              disabled={exporting !== null}
              className="btn-secondary text-sm disabled:opacity-50"
            >
              {exporting === 'pdf' ? 'Exporting…' : '⬇ PDF'}
            </button>
          </div>
        }
      />
    </Layout>
  );
}

export default withAuth(PosReportsPage, ['SUPER_ADMIN', 'SALES_MANAGER'], 'MOD_POS_REPORTS', 'POS');
