import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import { withAuth } from '../../lib/auth';
import { pricingApi, productApi, customerApi, customerGroupApi, productGroupApi } from '../../lib/api';
import toast from 'react-hot-toast';

// Batch price rates can be defined down to 5 decimal places (very low per-unit prices
// round away to 0.00 at the usual 2dp) — a dedicated formatter, distinct from the app-wide
// formatAmount (used for money totals everywhere else), so this precision is actually visible.
function formatPrice(value) {
  const num = Number(value) || 0;
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 5 });
}

function useDebounced(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ── Searchable combobox ────────────────────────────────────────────────────────
// Pass `asyncSearch` (query string -> Promise<items>) for lists too large to load
// and filter client-side (e.g. all customers) — it's queried server-side, debounced,
// instead of filtering the `items` prop. `initialItem` pre-fills the label for an
// existing `value` (e.g. when editing) without needing it to appear in a search result.
function Combobox({ items, value, onChange, placeholder, getLabel, getSubLabel, error, asyncSearch, asyncKey, initialItem }) {
  const [query, setQuery]       = useState('');
  const [open, setOpen]         = useState(false);
  const [selected, setSelected] = useState(null);
  const ref = useRef(null);
  const debouncedQuery = useDebounced(query);

  const { data: asyncItems } = useQuery({
    queryKey: [asyncKey, debouncedQuery],
    queryFn: () => asyncSearch(debouncedQuery),
    enabled: !!asyncSearch,
    staleTime: 30_000,
  });

  const pool = asyncSearch ? (asyncItems ?? []) : (items ?? []);

  // Sync selection when value changes (handles edit pre-fill + external clear).
  // Only touches `selected`, never `query` — clearing the typed search text here
  // would wipe it out on every debounced re-fetch while asyncSearch is active and
  // no selection has been made yet (see select()/clear() for query resets).
  useEffect(() => {
    if (!value) {
      if (selected) setSelected(null);
    } else if (!selected || selected.id !== value) {
      const found = pool.find(i => i.id === value) ?? (initialItem?.id === value ? initialItem : null);
      if (found) setSelected(found);
    }
  }, [value, pool, initialItem]);

  // Close on outside click
  useEffect(() => {
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const q = query.toLowerCase();
  const filtered = asyncSearch
    ? pool.slice(0, 30)
    : pool.filter(item =>
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
      render: (_, r) =>
        r.productGroup ? (
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 uppercase tracking-wide">
              Group
            </span>
            <span className="text-sm text-gray-800">{r.productGroup.name}</span>
          </div>
        ) : (
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
        r.customerGroup ? (
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 uppercase tracking-wide">
              Group
            </span>
            <span className="text-sm text-gray-800">{r.customerGroup.name}</span>
          </div>
        ) : r.customer ? (
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
          {v != null ? `LKR ${formatPrice(v)}` : '—'}
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

// ── Filter panel ────────────────────────────────────────────────────────────────
const EMPTY_FILTERS = { customerId: '', customerGroupId: '', productId: '', startDate: '', endDate: '' };

function FilterPanel({ filters, onChange, onClear, searchCustomers, customerGroups, products }) {
  const active = Object.values(filters).filter(v => v !== '').length;

  return (
    <div className="card p-4 mb-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-700">Filters</span>
        {active > 0 && (
          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
            {active} active
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Customer</label>
          <Combobox
            asyncSearch={searchCustomers}
            asyncKey="customers-picker"
            value={filters.customerId}
            onChange={(v) => onChange({ ...filters, customerId: v })}
            placeholder="Any customer…"
            getLabel={c => c.name}
            getSubLabel={c => c.customerCode}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Customer Group</label>
          <Combobox
            items={customerGroups}
            value={filters.customerGroupId}
            onChange={(v) => onChange({ ...filters, customerGroupId: v })}
            placeholder="Any group…"
            getLabel={g => g.name}
            getSubLabel={g => `${g.memberCount} customer${g.memberCount === 1 ? '' : 's'}`}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Product</label>
          <Combobox
            items={products}
            value={filters.productId}
            onChange={(v) => onChange({ ...filters, productId: v })}
            placeholder="Any product…"
            getLabel={p => p.name}
            getSubLabel={p => p.productCode}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">From</label>
          <input
            type="date"
            value={filters.startDate}
            max={filters.endDate || undefined}
            onChange={(e) => onChange({ ...filters, startDate: e.target.value })}
            className="input"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">To</label>
          <input
            type="date"
            value={filters.endDate}
            min={filters.startDate || undefined}
            onChange={(e) => onChange({ ...filters, endDate: e.target.value })}
            className="input"
          />
        </div>
      </div>
      {active > 0 && (
        <button type="button" onClick={onClear} className="text-xs text-gray-500 hover:text-gray-700 font-medium">
          Clear filters
        </button>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
function BatchPricingPage() {
  const qc = useQueryClient();
  const [page, setPage]             = useState(0);
  const [showForm, setShowForm]     = useState(false);
  const [editingRule, setEditingRule] = useState(null);  // null = create, object = edit
  const [deleteTarget, setDeleteTarget] = useState(null);  // { id, name }

  const [productId, setProductId]           = useState('');
  const [productTarget, setProductTarget]   = useState('product'); // 'product' | 'group'
  const [productGroupId, setProductGroupId] = useState('');

  const [customerId, setCustomerId]           = useState('');
  const [customerTarget, setCustomerTarget]   = useState('all'); // 'all' | 'customer' | 'group'
  const [customerGroupId, setCustomerGroupId] = useState('');

  const [submitAttempted, setSubmitAttempted] = useState(false);

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const applyFilters = (f) => { setFilters(f); setPage(0); };
  const clearFilters = () => { setFilters(EMPTY_FILTERS); setPage(0); };

  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['batch-prices', page, filters],
    queryFn: () => pricingApi.listBatchPrices({
      page, size: 20,
      customerId:      filters.customerId      || undefined,
      customerGroupId: filters.customerGroupId || undefined,
      productId:       filters.productId       || undefined,
      startDate:       filters.startDate       || undefined,
      endDate:         filters.endDate         || undefined,
    }).then(r => r.data),
    keepPreviousData: true,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products-all'],
    queryFn: () => productApi.list({ size: 1000 }).then(r => {
      const d = r.data;
      return Array.isArray(d) ? d : (d.content ?? []);
    }),
  });

  // Customer list is too large to load and filter client-side — search it server-side instead.
  function searchCustomers(search) {
    return customerApi.list({ search: search || undefined, size: 30 }).then(r => {
      const d = r.data;
      return Array.isArray(d) ? d : (d.content ?? []);
    });
  }

  const { data: productGroups = [] } = useQuery({
    queryKey: ['product-groups-all'],
    queryFn: () => productGroupApi.list({ size: 200 }).then(r => r.data.content ?? []),
  });

  const { data: customerGroups = [] } = useQuery({
    queryKey: ['customer-groups-all'],
    queryFn: () => customerGroupApi.list({ size: 200 }).then(r => r.data.content ?? []),
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
    setProductTarget('product');
    setProductGroupId('');
    setCustomerId('');
    setCustomerTarget('all');
    setCustomerGroupId('');
    setSubmitAttempted(false);
    reset({ price: '', minQty: '', startDate: todayStr, endDate: '' });
    setShowForm(true);
  }

  function openEdit(rule) {
    setEditingRule(rule);
    if (rule.productGroup) {
      setProductTarget('group');
      setProductGroupId(rule.productGroup.id);
      setProductId('');
    } else {
      setProductTarget('product');
      setProductId(rule.product?.id ?? '');
      setProductGroupId('');
    }
    if (rule.customerGroup) {
      setCustomerTarget('group');
      setCustomerGroupId(rule.customerGroup.id);
      setCustomerId('');
    } else if (rule.customer) {
      setCustomerTarget('customer');
      setCustomerId(rule.customer.id);
      setCustomerGroupId('');
    } else {
      setCustomerTarget('all');
      setCustomerId('');
      setCustomerGroupId('');
    }
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
    setProductTarget('product');
    setProductGroupId('');
    setCustomerId('');
    setCustomerTarget('all');
    setCustomerGroupId('');
    setSubmitAttempted(false);
    reset();
  }

  function onSubmit(data) {
    setSubmitAttempted(true);
    if (productTarget === 'product' && !productId) return;
    if (productTarget === 'group' && !productGroupId) return;
    const body = {
      ...data,
      productId:      productTarget === 'product' ? productId : undefined,
      productGroupId: productTarget === 'group'   ? productGroupId : undefined,
      customerId:      customerTarget === 'customer' ? customerId : undefined,
      customerGroupId: customerTarget === 'group'    ? customerGroupId : undefined,
      minQty:    (data.minQty !== '' && data.minQty != null) ? data.minQty : undefined,
    };
    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, body });
    } else {
      createMutation.mutate(body);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const productError = submitAttempted &&
    ((productTarget === 'product' && !productId) || (productTarget === 'group' && !productGroupId));

  const columns = buildColumns(openEdit, (id, row) => {
    const productLabel  = row.productGroup  ? `Group: ${row.productGroup.name}`   : (row.product?.name ?? 'Rule');
    const customerLabel = row.customerGroup ? `Group: ${row.customerGroup.name}` : (row.customer?.name ?? 'All');
    setDeleteTarget({ id, name: `${productLabel} — ${customerLabel}` });
  });

  return (
    <Layout title="Batch Pricing">
      <FilterPanel
        filters={filters}
        onChange={applyFilters}
        onClear={clearFilters}
        searchCustomers={searchCustomers}
        customerGroups={customerGroups}
        products={activeProducts}
      />

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
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  {editingRule ? 'Edit Price Rule' : 'New Price Rule'}
                </h2>
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
                <div className="flex items-center justify-between mb-1">
                  <label className="label mb-0">Product *</label>
                  <div className="flex gap-3 text-xs">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="radio" checked={productTarget === 'product'}
                        onChange={() => setProductTarget('product')} />
                      Specific Product
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="radio" checked={productTarget === 'group'}
                        onChange={() => setProductTarget('group')} />
                      Product Group
                    </label>
                  </div>
                </div>
                {productTarget === 'product' ? (
                  <Combobox
                    items={activeProducts}
                    value={productId}
                    onChange={setProductId}
                    placeholder="Search by name or code…"
                    getLabel={p => p.name}
                    getSubLabel={p => p.productCode}
                    error={productError}
                  />
                ) : (
                  <Combobox
                    items={productGroups}
                    value={productGroupId}
                    onChange={setProductGroupId}
                    placeholder="Search product groups…"
                    getLabel={g => g.name}
                    getSubLabel={g => `${g.memberCount} product${g.memberCount === 1 ? '' : 's'}`}
                    error={productError}
                  />
                )}
                {productError && (
                  <p className="text-red-500 text-xs mt-1">
                    Please select a {productTarget === 'product' ? 'product' : 'product group'}
                  </p>
                )}
              </div>

              {/* Customer */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="label mb-0">Customer</label>
                  <div className="flex gap-3 text-xs">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="radio" checked={customerTarget === 'all'}
                        onChange={() => setCustomerTarget('all')} />
                      All Customers
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="radio" checked={customerTarget === 'customer'}
                        onChange={() => setCustomerTarget('customer')} />
                      Specific Customer
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="radio" checked={customerTarget === 'group'}
                        onChange={() => setCustomerTarget('group')} />
                      Customer Group
                    </label>
                  </div>
                </div>
                {customerTarget === 'customer' && (
                  <Combobox
                    asyncSearch={searchCustomers}
                    asyncKey="customers-picker"
                    initialItem={editingRule?.customer ?? null}
                    value={customerId}
                    onChange={setCustomerId}
                    placeholder="Search customer…"
                    getLabel={c => c.name}
                    getSubLabel={c => c.customerCode}
                  />
                )}
                {customerTarget === 'group' && (
                  <Combobox
                    items={customerGroups}
                    value={customerGroupId}
                    onChange={setCustomerGroupId}
                    placeholder="Search customer groups…"
                    getLabel={g => g.name}
                    getSubLabel={g => `${g.memberCount} customer${g.memberCount === 1 ? '' : 's'}`}
                  />
                )}
                {(customerTarget === 'customer' && customerId) && (
                  <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                    This will create a customer-specific price that overrides the default.
                  </p>
                )}
                {(customerTarget === 'group' && customerGroupId) && (
                  <p className="text-xs text-purple-600 mt-1 flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                    This applies to every current member of the group — live, including future additions.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Price (LKR) *</label>
                  <input
                    type="number"
                    step="0.00001"
                    min="0"
                    {...register('price', { required: true, min: 0 })}
                    className="input"
                    placeholder="0.00000"
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
