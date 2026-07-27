import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import { withAuth } from '../../lib/auth';
import { mileageApi, dashboardApi } from '../../lib/api';

// ── SearchableSelect (copied from invoices/index.js — no shared component exists yet) ──

function SearchableSelect({ placeholder, loadOptions, value, onChange }) {
  const [inputVal, setInputVal] = useState('');
  const [options,  setOptions]  = useState([]);
  const [open,     setOpen]     = useState(false);
  const [busy,     setBusy]     = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const fn = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

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

// ── Formatters ─────────────────────────────────────────────────────────────────

function fmtTime(v) {
  if (!v) return '—';
  return new Date(v).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function fmtKm(v) {
  return v != null ? `${Number(v).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km` : '—';
}

// ── Page ──────────────────────────────────────────────────────────────────────

function MileageReportPage() {
  const [page, setPage] = useState(0);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [salesRep, setSalesRep] = useState(null);

  const { data: repsData } = useQuery({
    queryKey: ['dashboard-sales-reps'],
    queryFn:  () => dashboardApi.salesReps().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const allReps = repsData ?? [];

  const loadReps = async (q) => {
    if (!allReps.length) return [];
    const lower = q.toLowerCase();
    return allReps
      .filter((r) => !q || r.fullName.toLowerCase().includes(lower) || (r.username || '').toLowerCase().includes(lower))
      .map((r) => ({ value: r.id, label: r.fullName }));
  };

  const params = {
    page,
    size: 20,
    ...(dateFrom && { dateFrom }),
    ...(dateTo && { dateTo }),
    ...(salesRep?.value && { userId: salesRep.value }),
  };

  const { data, isLoading } = useQuery({
    queryKey: ['mileage-report', params],
    queryFn:  () => mileageApi.report(params).then((r) => r.data),
    keepPreviousData: true,
  });

  const COLUMNS = [
    { key: 'userFullName', label: 'Sales Rep' },
    { key: 'logDate', label: 'Date', render: (v) => v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' },
    { key: 'startMileage', label: 'Start Mileage', render: fmtKm },
    { key: 'startedAt', label: 'Start Time', render: fmtTime },
    { key: 'endMileage', label: 'End Mileage', render: (v) => v != null ? fmtKm(v) : <span className="text-amber-600 text-xs font-medium">In progress</span> },
    { key: 'endedAt', label: 'End Time', render: fmtTime },
    { key: 'distance', label: 'Distance', render: (v) => v != null ? fmtKm(v) : '—' },
  ];

  return (
    <Layout title="Mileage Report">
      <div className="space-y-4">
        <div className="card p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">From</label>
              <input type="date" className="input-base w-40" value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(0); }} max={dateTo || undefined} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">To</label>
              <input type="date" className="input-base w-40" value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(0); }} min={dateFrom || undefined} />
            </div>
            <div className="w-60">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">Sales Rep</label>
              <SearchableSelect
                placeholder="All sales reps…"
                loadOptions={loadReps}
                value={salesRep}
                onChange={(v) => { setSalesRep(v); setPage(0); }}
              />
            </div>
          </div>
        </div>

        <DataTable
          columns={COLUMNS}
          data={data?.content || []}
          loading={isLoading}
          totalPages={data?.totalPages || 1}
          currentPage={page}
          onPageChange={setPage}
          emptyMessage="No mileage records found"
        />
      </div>
    </Layout>
  );
}

export default withAuth(MileageReportPage, ['SUPER_ADMIN', 'SALES_MANAGER'], 'MOD_RPT_MILEAGE', 'SFA');
