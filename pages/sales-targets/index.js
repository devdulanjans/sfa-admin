import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import { withAuth } from '../../lib/auth';
import { salesTargetApi, dashboardApi, productApi, settingsApi } from '../../lib/api';
import toast from 'react-hot-toast';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function fmtQty(v) {
  return v != null ? Number(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '—';
}

// ── Searchable single-product picker (mirrors promotions.js's free-product picker) ──

function ProductPicker({ value, onChange, allProducts }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const filtered = (search.trim()
    ? allProducts.filter(p =>
        p.name?.toLowerCase().includes(search.toLowerCase()) ||
        p.productCode?.toLowerCase().includes(search.toLowerCase()))
    : allProducts
  ).slice(0, 30);

  if (value) {
    return (
      <div className="flex items-center gap-2 p-2.5 rounded-lg border border-blue-200 bg-blue-50">
        <span className="flex-1 text-sm font-medium text-blue-800">{value.name}</span>
        {value.productCode && <span className="text-xs text-blue-600">{value.productCode}</span>}
        <button type="button" onClick={() => onChange(null)} className="text-blue-400 hover:text-blue-700 text-sm ml-1">×</button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input
        value={search}
        onChange={e => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search products…"
        className="input"
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.length === 0
            ? <p className="px-3 py-4 text-sm text-gray-400 text-center">{allProducts.length === 0 ? 'Loading…' : 'No matching products'}</p>
            : filtered.map(p => (
                <button key={p.id} type="button"
                  onMouseDown={() => { onChange(p); setSearch(''); setOpen(false); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between border-b border-gray-50 last:border-0">
                  <span className="font-medium text-gray-800">{p.name}</span>
                  {p.productCode && <span className="text-xs text-gray-400">{p.productCode}</span>}
                </button>
              ))}
        </div>
      )}
    </div>
  );
}

function DisabledNotice() {
  return (
    <div className="card p-8 text-center max-w-lg mx-auto mt-8">
      <p className="text-3xl mb-2">🎯</p>
      <h2 className="text-base font-semibold text-gray-900 mb-1">Sales Target feature is disabled</h2>
      <p className="text-sm text-gray-500">
        Enable it in <span className="font-medium">Settings → General</span> to assign monthly product targets to sales reps.
      </p>
    </div>
  );
}

function SalesTargetsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const today = new Date();
  const [filterYear, setFilterYear] = useState(today.getFullYear());
  const [filterMonth, setFilterMonth] = useState(today.getMonth() + 1);
  const [filterRepId, setFilterRepId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingTarget, setEditingTarget] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: { targetYear: today.getFullYear(), targetMonth: today.getMonth() + 1 },
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.list().then(r => r.data),
  });
  const enabled = settings?.find(s => s.key === 'sales_target_enabled')?.value === 'true';

  const { data, isLoading } = useQuery({
    queryKey: ['sales-targets', page, filterYear, filterMonth, filterRepId],
    queryFn: () => salesTargetApi.list({
      page, size: 20,
      year: filterYear || undefined,
      month: filterMonth || undefined,
      repId: filterRepId || undefined,
    }).then(r => r.data),
    enabled,
  });

  const { data: repsData } = useQuery({
    queryKey: ['dashboard-sales-reps'],
    queryFn: () => dashboardApi.salesReps().then(r => r.data),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
  const allReps = repsData ?? [];

  const { data: productsData } = useQuery({
    queryKey: ['products-picker'],
    queryFn: () => productApi.list({ page: 0, size: 500 }).then(r => r.data),
    enabled: enabled && showForm,
    staleTime: 60_000,
  });
  const allProducts = productsData?.content ?? [];

  function closeForm() {
    setShowForm(false);
    setEditingTarget(null);
    setSelectedProduct(null);
    reset({ targetYear: today.getFullYear(), targetMonth: today.getMonth() + 1, salesRepId: '', targetQty: '' });
  }

  function openCreate() {
    closeForm();
    setShowForm(true);
  }

  const createMutation = useMutation({
    mutationFn: (body) => salesTargetApi.create(body),
    onSuccess: () => { toast.success('Target created'); qc.invalidateQueries({ queryKey: ['sales-targets'] }); closeForm(); },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to create target'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }) => salesTargetApi.update(id, body),
    onSuccess: () => { toast.success('Target updated'); qc.invalidateQueries({ queryKey: ['sales-targets'] }); closeForm(); },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to update target'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => salesTargetApi.delete(id),
    onSuccess: () => { toast.success('Target deleted'); qc.invalidateQueries({ queryKey: ['sales-targets'] }); },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to delete target'),
  });

  function onSubmit(formData) {
    if (!editingTarget && !selectedProduct) {
      toast.error('Select a product');
      return;
    }
    if (editingTarget) {
      updateMutation.mutate({ id: editingTarget.id, body: { targetQty: Number(formData.targetQty) } });
      return;
    }
    createMutation.mutate({
      salesRepId: formData.salesRepId,
      productId: selectedProduct.id,
      targetYear: Number(formData.targetYear),
      targetMonth: Number(formData.targetMonth),
      targetQty: Number(formData.targetQty),
    });
  }

  function confirmDelete(row) {
    if (window.confirm(`Delete the ${MONTH_NAMES[row.targetMonth - 1]} ${row.targetYear} target for ${row.salesRepName} / ${row.productName}?`)) {
      deleteMutation.mutate(row.id);
    }
  }

  const columns = [
    { key: 'salesRepName', label: 'Sales Rep' },
    { key: 'productName', label: 'Product', render: (v, r) => <span>{v} <span className="text-xs text-gray-400">{r.productCode}</span></span> },
    { key: 'targetMonth', label: 'Month', render: (v, r) => `${MONTH_NAMES[v - 1]} ${r.targetYear}` },
    { key: 'targetQty', label: 'Target Qty', render: fmtQty },
    { key: 'achievedQty', label: 'Achieved', render: fmtQty },
    { key: 'remainingQty', label: 'Remaining', render: fmtQty },
    {
      key: 'todayTarget', label: "Today's Target",
      render: (v) => v != null ? fmtQty(v) : <span className="text-gray-400 text-xs">—</span>,
    },
    {
      key: 'progressPct', label: 'Progress',
      render: (v) => (
        <div className="flex items-center gap-2 w-28">
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${v >= 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(100, v)}%` }} />
          </div>
          <span className="text-xs text-gray-500 tabular-nums">{v.toFixed(0)}%</span>
        </div>
      ),
    },
    {
      key: '_actions', label: '',
      render: (_, row) => (
        <div className="flex items-center gap-1 justify-end">
          <button
            onClick={() => { setEditingTarget(row); setShowForm(true); reset({ targetQty: row.targetQty }); }}
            className="text-xs font-medium text-blue-600 hover:text-blue-800 px-2.5 py-1 rounded-lg hover:bg-blue-50"
          >
            Edit
          </button>
          <button
            onClick={() => confirmDelete(row)}
            className="text-xs font-medium text-red-600 hover:text-red-800 px-2.5 py-1 rounded-lg hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  if (settings && !enabled) {
    return (
      <Layout title="Sales Targets">
        <DisabledNotice />
      </Layout>
    );
  }

  return (
    <Layout title="Sales Targets">
      <div className="mb-3 flex items-center gap-3 flex-wrap">
        <select value={filterYear} onChange={e => { setFilterYear(Number(e.target.value)); setPage(0); }} className="input w-28 text-sm">
          {[today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select value={filterMonth} onChange={e => { setFilterMonth(Number(e.target.value)); setPage(0); }} className="input w-40 text-sm">
          {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={filterRepId} onChange={e => { setFilterRepId(e.target.value); setPage(0); }} className="input w-56 text-sm">
          <option value="">All sales reps</option>
          {allReps.map(r => <option key={r.id} value={r.id}>{r.fullName}</option>)}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={data?.content || []}
        loading={isLoading}
        totalPages={data?.totalPages || 1}
        currentPage={page}
        onPageChange={setPage}
        emptyMessage="No targets found for this month"
        actions={
          <button className="btn-primary" onClick={openCreate}>
            + New Target
          </button>
        }
      />

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-base font-semibold text-gray-900 mb-4">
              {editingTarget ? `Edit Target — ${editingTarget.salesRepName} / ${editingTarget.productName}` : 'New Sales Target'}
            </h2>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
              {!editingTarget && (
                <>
                  <div>
                    <label className="label">Sales Rep *</label>
                    <select {...register('salesRepId', { required: true })} className="input">
                      <option value="">Select a sales rep…</option>
                      {allReps.map(r => <option key={r.id} value={r.id}>{r.fullName}</option>)}
                    </select>
                    {errors.salesRepId && <p className="text-xs text-red-500 mt-1">Required</p>}
                  </div>

                  <div>
                    <label className="label">Product *</label>
                    <ProductPicker value={selectedProduct} onChange={setSelectedProduct} allProducts={allProducts} />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Year *</label>
                      <input type="number" {...register('targetYear', { required: true, valueAsNumber: true })} className="input" />
                    </div>
                    <div>
                      <label className="label">Month *</label>
                      <select {...register('targetMonth', { required: true, valueAsNumber: true })} className="input">
                        {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                      </select>
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="label">Target Quantity *</label>
                <input type="number" step="0.01" min="0.01" {...register('targetQty', { required: true, min: 0.01 })} className="input" />
                {errors.targetQty && <p className="text-xs text-red-500 mt-1">Must be greater than zero</p>}
              </div>

              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn-primary flex-1" disabled={createMutation.isPending || updateMutation.isPending}>
                  {(createMutation.isPending || updateMutation.isPending) ? 'Saving…' : editingTarget ? 'Save Changes' : 'Create Target'}
                </button>
                <button type="button" className="btn-secondary flex-1" onClick={closeForm}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}

export default withAuth(SalesTargetsPage, ['SUPER_ADMIN', 'SALES_MANAGER'], 'MOD_SALES_TARGETS', 'SFA');
