import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import ExportButton from '../../components/ExportButton';
import { withAuth } from '../../lib/auth';
import { invoiceApi, customerApi, dashboardApi } from '../../lib/api';
import { formatAmount } from '../../lib/format';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtLKR = (v) => 'LKR ' + formatAmount(v);

const fmtDate = (v) =>
  v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const fmtDateTime = (v) =>
  v ? new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

// Draft holds { value: uuid, label: string } | null for select fields
const EMPTY_DRAFT = {
  invoiceNo:   '',
  orderNo:     '',
  customer:    null,
  salesRep:    null,
  createdFrom: '',
  createdTo:   '',
  issuedFrom:  '',
  issuedTo:    '',
  dueFrom:     '',
  dueTo:       '',
};

function countActive(f) {
  return Object.values(f).filter((v) => v !== null && v !== '').length;
}

// ── SearchableSelect ──────────────────────────────────────────────────────────

function SearchableSelect({ placeholder, loadOptions, value, onChange }) {
  const [inputVal, setInputVal] = useState('');
  const [options,  setOptions]  = useState([]);
  const [open,     setOpen]     = useState(false);
  const [busy,     setBusy]     = useState(false);
  const containerRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const fn = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        setOptions(await loadOptions(inputVal));
      } catch {
        setOptions([]);
      } finally {
        setBusy(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [inputVal, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const select = (opt) => {
    onChange(opt);
    setInputVal('');
    setOpen(false);
  };

  const clear = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(null);
    setInputVal('');
    setOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {value ? (
        // Value selected — show label + clear button
        <div className="input-base flex items-center justify-between gap-1" style={{ cursor: 'default' }}>
          <span className="truncate text-gray-800" style={{ flex: 1 }}>{value.label}</span>
          <button
            onMouseDown={clear}
            className="text-gray-400 hover:text-gray-700 shrink-0 leading-none"
            style={{ fontSize: 14, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>
      ) : (
        // No value — show search input
        <input
          type="text"
          value={inputVal}
          placeholder={placeholder}
          className="input-base"
          onChange={(e) => setInputVal(e.target.value)}
          onFocus={() => setOpen(true)}
        />
      )}

      {open && (
        <div
          style={{
            position:    'absolute',
            top:         '100%',
            left:        0,
            right:       0,
            zIndex:      50,
            background:  '#fff',
            border:      '1px solid #d1d5db',
            borderRadius: '0.5rem',
            boxShadow:   '0 4px 12px rgba(0,0,0,0.1)',
            marginTop:   2,
            maxHeight:   200,
            overflowY:   'auto',
          }}
        >
          {busy && (
            <div style={{ padding: '8px 12px', fontSize: 12, color: '#9ca3af' }}>Loading…</div>
          )}
          {!busy && options.length === 0 && (
            <div style={{ padding: '8px 12px', fontSize: 12, color: '#9ca3af' }}>
              {inputVal.length < 1 ? 'Type to search…' : 'No results'}
            </div>
          )}
          {!busy && options.map((opt) => (
            <div
              key={opt.value}
              onMouseDown={() => select(opt)}
              style={{
                padding:  '8px 12px',
                fontSize: 13,
                cursor:   'pointer',
                color:    '#111827',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#eff6ff')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '')}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Filter panel ──────────────────────────────────────────────────────────────

function FilterPanel({ onApply, allReps }) {
  const [open,  setOpen]  = useState(true);
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }));

  const apply = () => onApply({ ...draft });

  const clear = () => {
    setDraft(EMPTY_DRAFT);
    onApply({ ...EMPTY_DRAFT });
  };

  const active = countActive(draft);

  // Customer: server-side search
  const loadCustomers = async (q) => {
    if (!q) return [];
    const res = await customerApi.list({ search: q, size: 20, page: 0 });
    const items = res.data?.content ?? res.data ?? [];
    return items.map((c) => ({ value: c.id, label: `${c.name}${c.customerCode ? ` (${c.customerCode})` : ''}` }));
  };

  // Salesperson: client-side filter on pre-loaded list
  const loadReps = async (q) => {
    if (!allReps || allReps.length === 0) return [];
    const lower = q.toLowerCase();
    return allReps
      .filter((r) => !q || r.fullName.toLowerCase().includes(lower) || (r.username || '').toLowerCase().includes(lower))
      .map((r) => ({ value: r.id, label: r.fullName }));
  };

  return (
    <div className="mb-4 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
          <span className="text-sm font-semibold text-gray-700">Filters</span>
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

      {/* Body */}
      {open && (
        <div className="p-4 space-y-4">
          {/* Row 1 — searches */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Invoice #">
              <input
                type="text" value={draft.invoiceNo} onChange={set('invoiceNo')}
                placeholder="Search…" className="input-base"
              />
            </Field>
            <Field label="Order #">
              <input
                type="text" value={draft.orderNo} onChange={set('orderNo')}
                placeholder="Search…" className="input-base"
              />
            </Field>
            <Field label="Customer">
              <SearchableSelect
                placeholder="Search customer…"
                loadOptions={loadCustomers}
                value={draft.customer}
                onChange={(v) => setDraft((d) => ({ ...d, customer: v }))}
              />
            </Field>
            <Field label="Salesperson">
              <SearchableSelect
                placeholder="Search salesperson…"
                loadOptions={loadReps}
                value={draft.salesRep}
                onChange={(v) => setDraft((d) => ({ ...d, salesRep: v }))}
              />
            </Field>
          </div>

          {/* Row 2 — date ranges */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <DateRangeField
              label="Created Date"
              fromValue={draft.createdFrom} onFromChange={set('createdFrom')}
              toValue={draft.createdTo}     onToChange={set('createdTo')}
            />
            <DateRangeField
              label="Invoice Date"
              fromValue={draft.issuedFrom}  onFromChange={set('issuedFrom')}
              toValue={draft.issuedTo}      onToChange={set('issuedTo')}
            />
            <DateRangeField
              label="Due Date"
              fromValue={draft.dueFrom}     onFromChange={set('dueFrom')}
              toValue={draft.dueTo}         onToChange={set('dueTo')}
            />
          </div>

          {/* Actions */}
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
            {active > 0 && (
              <span className="text-xs text-gray-400 ml-1">
                {active} filter{active !== 1 ? 's' : ''} applied
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
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

// ── Page ──────────────────────────────────────────────────────────────────────

function InvoicesPage() {
  const [page,    setPage]    = useState(0);
  const [filters, setFilters] = useState({ ...EMPTY_DRAFT });

  // Pre-load sales reps for the salesperson dropdown
  const { data: repsData } = useQuery({
    queryKey: ['dashboard-sales-reps'],
    queryFn:  () => dashboardApi.salesReps().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const allReps = repsData ?? [];

  const handleApply = (f) => {
    setFilters(f);
    setPage(0);
  };

  // Build query params — use UUID values for customer/salesRep; omit empty strings
  const params = {
    page,
    size: 20,
    ...(filters.invoiceNo              && { invoiceNo:   filters.invoiceNo }),
    ...(filters.orderNo                && { orderNo:     filters.orderNo }),
    ...(filters.customer?.value        && { customerId:  filters.customer.value }),
    ...(filters.salesRep?.value        && { salesRepId:  filters.salesRep.value }),
    ...(filters.createdFrom            && { createdFrom: filters.createdFrom }),
    ...(filters.createdTo              && { createdTo:   filters.createdTo }),
    ...(filters.issuedFrom             && { issuedFrom:  filters.issuedFrom }),
    ...(filters.issuedTo               && { issuedTo:    filters.issuedTo }),
    ...(filters.dueFrom                && { dueFrom:     filters.dueFrom }),
    ...(filters.dueTo                  && { dueTo:       filters.dueTo }),
  };

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', params],
    queryFn:  () => invoiceApi.list(params).then(r => r.data),
    keepPreviousData: true,
  });

  const COLUMNS = [
    { key: 'invoiceNumber', label: 'Invoice #',    width: 130 },
    { key: 'orderNumber',   label: 'Order #',      width: 120, render: (v) => v || '—' },
    {
      key: 'customer', label: 'Customer',
      render: (v) => v ? (
        <div>
          <div className="font-medium">{v.name}</div>
          {v.phone && <div className="text-xs text-gray-500">{v.phone}</div>}
          {v.email && <div className="text-xs text-gray-400">{v.email}</div>}
        </div>
      ) : '—',
    },
    { key: 'salesRepName', label: 'Salesperson',  render: (v) => v || '—' },
    { key: 'orderDate',    label: 'Order Date',   render: (v) => fmtDateTime(v) },
    { key: 'issuedDate',   label: 'Invoice Date', render: (v) => fmtDate(v) },
    { key: 'dueDate',      label: 'Due Date',     render: (v) => fmtDate(v) },
    { key: 'total',        label: 'Total (LKR)',  render: (v) => fmtLKR(v) },
    { key: 'printCount',   label: 'Prints',       width: 70 },
    { key: 'status',       label: 'Status',       render: (v) => <StatusBadge status={v} /> },
    {
      key: 'actions', label: '', width: 130,
      render: (_, row) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href={`/invoices/${row.id}`}
            className="text-blue-600 text-xs hover:text-blue-800 font-medium"
          >
            View
          </Link>
          <button
            onClick={async () => {
              try {
                const res = await invoiceApi.pdf(row.id);
                const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
                window.open(url, '_blank');
              } catch (err) {
                alert('Failed to load PDF: ' + (err.response?.data?.message || err.message));
              }
            }}
            className="text-green-600 text-xs hover:text-green-800 font-medium"
          >
            PDF ↗
          </button>
        </div>
      ),
    },
  ];

  return (
    <Layout title="Invoices">
      <FilterPanel onApply={handleApply} allReps={allReps} />
      <DataTable
        columns={COLUMNS}
        data={data?.content || []}
        loading={isLoading}
        totalPages={data?.totalPages || 1}
        currentPage={page}
        onPageChange={setPage}
        actions={<ExportButton filename="invoices" />}
        emptyMessage="No invoices found"
      />

      <style jsx global>{`
        .input-base {
          width: 100%;
          border: 1px solid #d1d5db;
          border-radius: 0.5rem;
          padding: 0.375rem 0.625rem;
          font-size: 0.8125rem;
          color: #111827;
          background: #fff;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .input-base:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 2px rgba(59,130,246,0.2);
        }
        .input-base::placeholder { color: #9ca3af; }
      `}</style>
    </Layout>
  );
}

export default withAuth(InvoicesPage, [], 'MOD_INVOICES', 'SFA');
