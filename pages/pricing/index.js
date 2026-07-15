import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import { withAuth } from '../../lib/auth';
import { pricingApi, productApi, customerApi } from '../../lib/api';
import toast from 'react-hot-toast';
import { formatAmount } from '../../lib/format';

// ── Searchable combobox ────────────────────────────────────────────────────────
function Combobox({ items, value, onChange, placeholder, getLabel, getSubLabel, error }) {
  const [query, setQuery]       = useState('');
  const [open, setOpen]         = useState(false);
  const [selected, setSelected] = useState(null);
  const ref = useRef(null);

  // Sync selection when value changes (handles edit pre-fill + clear)
  useEffect(() => {
    if (!value) {
      setSelected(null);
      setQuery('');
    } else if (!selected || selected.id !== value) {
      const found = (items ?? []).find(i => i.id === value);
      if (found) setSelected(found);
    }
  }, [value, items]);

  // Close on outside click
  useEffect(() => {
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const q = query.toLowerCase();
  const filtered = (items ?? []).filter(item =>
    !q ||
    getLabel(item).toLowerCase().includes(q) ||
    (getSubLabel && getSubLabel(item).toLowerCase().includes(q))
  ).slice(0, 30);

  function select(item) {
    setSelected(item);
    setQuery('');
    setOpen(false);
    onChange(item.id);
  }

  function clear() {
    setSelected(null);
    setQuery('');
    onChange('');
  }

  return (
    <div ref={ref} className="relative">
      {selected ? (
        <div className={`input flex items-center justify-between gap-2 ${error ? 'border-red-400' : ''}`}>
          <span className="truncate text-sm">
            <span className="font-medium">{getLabel(selected)}</span>
            {getSubLabel && (
              <span className="text-gray-400 ml-1.5 text-xs">{getSubLabel(selected)}</span>
            )}
          </span>
          <button
            type="button"
            onClick={clear}
            className="shrink-0 text-gray-400 hover:text-gray-600 text-base leading-none"
          >
            ×
          </button>
        </div>
      ) : (
        <input
          className={`input ${error ? 'border-red-400' : ''}`}
          placeholder={placeholder}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          autoComplete="off"
        />
      )}

      {open && !selected && (
        <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-52 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-gray-400">No results</p>
          ) : (
            filtered.map(item => (
              <button
                key={item.id}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => select(item)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between gap-2"
              >
                <span className="text-sm font-medium text-gray-900 truncate">{getLabel(item)}</span>
                {getSubLabel && (
                  <span className="text-xs text-gray-400 shrink-0">{getSubLabel(item)}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Table column definitions ───────────────────────────────────────────────────
function buildColumns(onEdit, onDelete) {
  return [
    {
      key: 'product',
      label: 'Product',
      render: (_, r) => (
        <div>
          <p className="font-medium text-gray-900 text-sm">{r.product?.name ?? '—'}</p>
          {r.product?.productCode && (
            <p className="text-xs text-gray-400">{r.product.productCode}</p>
          )}
        </div>
      ),
    },
    {
      key: 'customer',
      label: 'Customer',
      render: (_, r) =>
        r.customer ? (
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wide">
              Special
            </span>
            <span className="text-sm text-gray-800">{r.customer.name}</span>
          </div>
        ) : (
          <span className="text-sm text-gray-400 italic">All customers</span>
        ),
    },
    {
      key: 'price',
      label: 'Price (LKR)',
      render: (v) => (
        <span className="font-semibold text-gray-900">
          {v != null ? `LKR ${formatAmount(v)}` : '—'}
        </span>
      ),
    },
    { key: 'minQty',    label: 'Min Qty',   render: (v) => v ?? <span className="text-gray-400">—</span> },
    { key: 'startDate', label: 'From',      render: (v) => v ?? '—' },
    { key: 'endDate',   label: 'To',        render: (v) => v ?? '—' },
    {
      key: 'id',
      label: '',
      render: (id, row) => (
        <div className="flex gap-1 justify-end">
          <button
            onClick={() => onEdit(row)}
            className="text-xs px-2 py-1 rounded text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 font-medium transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(id, row)}
            className="text-xs px-2 py-1 rounded text-red-600 hover:text-red-800 hover:bg-red-50 font-medium transition-colors"
          >
            Delete
          </button>
        </div>
      ),
    },
  ];
}

// ── Page ──────────────────────────────────────────────────────────────────────
function BatchPricingPage() {
  const qc = useQueryClient();
  const [page, setPage]             = useState(0);
  const [showForm, setShowForm]     = useState(false);
  const [editingRule, setEditingRule] = useState(null);  // null = create, object = edit
  const [deleteTarget, setDeleteTarget] = useState(null);  // { id, name }

  const [productId, setProductId]   = useState('');
  const [customerId, setCustomerId] = useState('');
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['batch-prices', page],
    queryFn: () => pricingApi.listBatchPrices({ page, size: 20 }).then(r => r.data),
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products-all'],
    queryFn: () => productApi.list({ size: 1000 }).then(r => {
      const d = r.data;
      return Array.isArray(d) ? d : (d.content ?? []);
    }),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers-all'],
    queryFn: () => customerApi.list({ size: 1000 }).then(r => {
      const d = r.data;
      return Array.isArray(d) ? d : (d.content ?? []);
    }),
  });

  const activeProducts = products.filter(p => p.status === 'ACTIVE');

  const createMutation = useMutation({
    mutationFn: (body) => pricingApi.createBatchPrice(body),
    onSuccess: () => {
      toast.success('Price rule created');
      qc.invalidateQueries({ queryKey: ['batch-prices'] });
      closeForm();
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to create'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }) => pricingApi.updateBatchPrice(id, body),
    onSuccess: () => {
      toast.success('Price rule updated');
      qc.invalidateQueries({ queryKey: ['batch-prices'] });
      closeForm();
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to update'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => pricingApi.deleteBatchPrice(id),
    onSuccess: () => {
      toast.success('Price rule deleted');
      qc.invalidateQueries({ queryKey: ['batch-prices'] });
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to delete'),
  });

  function openCreate() {
    const todayStr = new Date().toISOString().split('T')[0];
    setEditingRule(null);
    setProductId('');
    setCustomerId('');
    setSubmitAttempted(false);
    reset({ price: '', minQty: '', startDate: todayStr, endDate: '' });
    setShowForm(true);
  }

  function openEdit(rule) {
    setEditingRule(rule);
    const pid = rule.product?.id ?? '';
    const cid = rule.customer?.id ?? '';
    setProductId(pid);
    setCustomerId(cid);
    setSubmitAttempted(false);
    reset({
      price:     rule.price ?? '',
      minQty:    rule.minQty ?? '',
      startDate: rule.startDate ?? '',
      endDate:   rule.endDate ?? '',
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingRule(null);
    setProductId('');
    setCustomerId('');
    setSubmitAttempted(false);
    reset();
  }

  function onSubmit(data) {
    setSubmitAttempted(true);
    if (!productId) return;
    const body = {
      ...data,
      productId,
      customerId: customerId || undefined,
      minQty:    (data.minQty !== '' && data.minQty != null) ? data.minQty : undefined,
    };
    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, body });
    } else {
      createMutation.mutate(body);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const productError = submitAttempted && !productId;

  const columns = buildColumns(openEdit, (id, row) =>
    setDeleteTarget({ id, name: `${row.product?.name ?? 'Rule'} — ${row.customer?.name ?? 'All'}` })
  );

  return (
    <Layout title="Batch Pricing">
      <DataTable
        columns={columns}
        data={data?.content || []}
        loading={isLoading}
        totalPages={data?.totalPages || 1}
        currentPage={page}
        onPageChange={setPage}
        emptyMessage="No batch prices configured"
        actions={
          <button className="btn-primary" onClick={openCreate}>
            + New Price Rule
          </button>
        }
      />

      {/* ── Create / Edit modal ────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  {editingRule ? 'Edit Price Rule' : 'New Price Rule'}
                </h2>
                {!editingRule && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Leave Customer blank to apply to all customers.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

              {/* Product */}
              <div>
                <label className="label">Product *</label>
                <Combobox
                  items={activeProducts}
                  value={productId}
                  onChange={setProductId}
                  placeholder="Search by name or code…"
                  getLabel={p => p.name}
                  getSubLabel={p => p.productCode}
                  error={productError}
                />
                {productError && (
                  <p className="text-red-500 text-xs mt-1">Please select a product</p>
                )}
              </div>

              {/* Customer */}
              <div>
                <label className="label">
                  Customer{' '}
                  <span className="text-gray-400 font-normal text-xs">(leave blank = applies to all)</span>
                </label>
                <Combobox
                  items={customers}
                  value={customerId}
                  onChange={setCustomerId}
                  placeholder="Search customer…"
                  getLabel={c => c.name}
                  getSubLabel={c => c.customerCode}
                />
                {customerId && (
                  <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                    This will create a customer-specific price that overrides the default.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Price (LKR) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    {...register('price', { required: true, min: 0 })}
                    className="input"
                    placeholder="0.00"
                  />
                  {errors.price && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>
                <div>
                  <label className="label">
                    Min Qty{' '}
                    <span className="text-gray-400 font-normal text-xs">(optional)</span>
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    {...register('minQty')}
                    className="input"
                    placeholder="1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Start Date *</label>
                  <input
                    type="date"
                    {...register('startDate', { required: true })}
                    className="input"
                  />
                  {errors.startDate && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>
                <div>
                  <label className="label">End Date *</label>
                  <input
                    type="date"
                    {...register('endDate', { required: true })}
                    className="input"
                  />
                  {errors.endDate && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  className="btn-primary flex-1"
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving…' : editingRule ? 'Save Changes' : 'Create Rule'}
                </button>
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={closeForm}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ────────────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Delete price rule?</h2>
            <p className="text-sm text-gray-500 mb-5">
              <span className="font-medium text-gray-800">{deleteTarget.name}</span>
              {' '}will be removed. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-60"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
              <button
                className="flex-1 btn-secondary"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

export default withAuth(BatchPricingPage, ['SUPER_ADMIN', 'SALES_MANAGER'], 'MOD_BATCH_PRICE');
