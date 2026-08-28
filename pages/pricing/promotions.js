import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import { withAuth } from '../../lib/auth';
import { pricingApi, productApi, customerApi, customerGroupApi, productGroupApi } from '../../lib/api';
import toast from 'react-hot-toast';
import { formatAmount } from '../../lib/format';

const TYPE_LABELS = {
  PERCENTAGE:   'Percentage',
  FIXED_AMOUNT: 'Fixed Amount',
  FREE_PRODUCT: 'Free Product',
};

const FIELD_LABELS = {
  'Name':           'Name',
  'Type':           'Type',
  'Discount Value': 'Discount Value',
  'Max Free Units': 'Max Free Units',
  'Min Order Qty':  'Min Order Qty',
  'Start Date':     'Start Date',
  'End Date':       'End Date',
  'Active':         'Active',
  'Applies To':     'Applies To',
  'Free Product':   'Free Product',
  'Customer':       'Customer',
  'Customer Group': 'Customer Group',
  'Product Group':  'Product Group',
};

function useDebounce(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ── History modal ─────────────────────────────────────────────────────────────

function HistoryModal({ promo, onClose }) {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['promo-history', promo.id],
    queryFn: () => pricingApi.getPromotionHistory(promo.id).then(r => r.data),
    staleTime: 0,
  });

  function fmt(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-AU', {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Edit History</h2>
            <p className="text-xs text-gray-500 mt-0.5">{promo.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-light">✕</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5">
          {isLoading ? (
            <p className="text-center text-gray-400 text-sm py-10">Loading history…</p>
          ) : history.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-gray-400 text-sm">No edit history found.</p>
              <p className="text-gray-300 text-xs mt-1">Edits made through this interface are tracked here.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {history.map((entry, idx) => {
                const changes = entry.changes || {};
                const hasChanges = Object.keys(changes).length > 0;
                return (
                  <div key={entry.id} className="border border-gray-200 rounded-xl overflow-hidden">
                    {/* Entry header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center">
                          {history.length - idx}
                        </span>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {entry.editedByName || 'Unknown'}
                          </p>
                          <p className="text-xs text-gray-400 font-mono">{fmt(entry.createdAt)}</p>
                        </div>
                      </div>
                      {!hasChanges && (
                        <span className="text-xs text-gray-400 italic">No field changes</span>
                      )}
                    </div>

                    {/* Changes table */}
                    {hasChanges && (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 w-32">Field</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-red-500">Before</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-green-600">After</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {Object.entries(changes).map(([field, val]) => (
                            <tr key={field} className="hover:bg-gray-50">
                              <td className="px-4 py-2 text-xs font-medium text-gray-600">
                                {FIELD_LABELS[field] || field}
                              </td>
                              <td className="px-4 py-2 text-xs text-red-600 font-mono">
                                {String(val?.from ?? '—')}
                              </td>
                              <td className="px-4 py-2 text-xs text-green-700 font-mono">
                                {String(val?.to ?? '—')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 text-right">
          <button onClick={onClose} className="btn-secondary px-6">Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function PromotionsPage() {
  const qc = useQueryClient();
  const [page, setPage]                     = useState(0);
  const [showForm, setShowForm]             = useState(false);
  const [editingPromotion, setEditingPromo] = useState(null); // null = create mode
  const [historyPromo, setHistoryPromo]     = useState(null); // promotion to show history for

  // Products multi-select (applies-to)
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [productSearch,    setProductSearch]    = useState('');
  const [productDropdown,  setProductDropdown]  = useState(false);

  // Free product single-select
  const [freeProduct,  setFreeProduct]  = useState(null);
  const [freeSearch,   setFreeSearch]   = useState('');
  const [freeDropdown, setFreeDropdown] = useState(false);

  // Customer target: 'all' | 'customer' | 'group'
  const [customerTarget,    setCustomerTarget]    = useState('all');
  const [selectedCustomer,  setSelectedCustomer]  = useState(null);
  const [customerSearch,    setCustomerSearch]    = useState('');
  const [customerDropdown,  setCustomerDropdown]  = useState(false);
  const [selectedCustomerGroup, setSelectedCustomerGroup] = useState(null);
  const [customerGroupSearch,   setCustomerGroupSearch]   = useState('');
  const [customerGroupDropdown, setCustomerGroupDropdown] = useState(false);

  // Product group — additive to the explicit products multi-select above
  const [selectedProductGroup, setSelectedProductGroup] = useState(null);
  const [productGroupSearch,   setProductGroupSearch]   = useState('');
  const [productGroupDropdown, setProductGroupDropdown] = useState(false);

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm({
    defaultValues: { type: 'PERCENTAGE', isActive: true },
  });

  const promoType     = watch('type');
  const isFreeProduct = promoType === 'FREE_PRODUCT';

  // ── Data ────────────────────────────────────────────────────────────────────

  const { data, isLoading } = useQuery({
    queryKey: ['promotions', page],
    queryFn: () => pricingApi.listPromotions({ page, size: 20 }).then(r => r.data),
  });

  const { data: productsData } = useQuery({
    queryKey: ['products-picker'],
    queryFn: () => productApi.list({ page: 0, size: 300 }).then(r => r.data),
    enabled: showForm,
    staleTime: 60_000,
  });
  const allProducts = productsData?.content || [];

  const debouncedCustomerSearch = useDebounce(customerSearch);

  const { data: customersData } = useQuery({
    queryKey: ['customers-picker', debouncedCustomerSearch],
    queryFn: () => customerApi.list({ page: 0, size: 30, search: debouncedCustomerSearch || undefined }).then(r => r.data),
    enabled: showForm,
    staleTime: 60_000,
  });
  const allCustomers = customersData?.content || [];

  const { data: customerGroupsData } = useQuery({
    queryKey: ['customer-groups-picker'],
    queryFn: () => customerGroupApi.list({ size: 200 }).then(r => r.data),
    enabled: showForm,
    staleTime: 60_000,
  });
  const allCustomerGroups = customerGroupsData?.content || [];

  const { data: productGroupsData } = useQuery({
    queryKey: ['product-groups-picker'],
    queryFn: () => productGroupApi.list({ size: 200 }).then(r => r.data),
    enabled: showForm,
    staleTime: 60_000,
  });
  const allProductGroups = productGroupsData?.content || [];

  // ── Filtered product options ─────────────────────────────────────────────────

  const filteredAppliesTo = (productSearch.trim()
    ? allProducts.filter(p =>
        p.name?.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.productCode?.toLowerCase().includes(productSearch.toLowerCase()))
    : allProducts
  ).filter(p => !selectedProducts.find(s => s.id === p.id)).slice(0, 30);

  const filteredFree = (freeSearch.trim()
    ? allProducts.filter(p =>
        p.name?.toLowerCase().includes(freeSearch.toLowerCase()) ||
        p.productCode?.toLowerCase().includes(freeSearch.toLowerCase()))
    : allProducts
  ).filter(p => !freeProduct || p.id !== freeProduct.id).slice(0, 30);

  // Search is server-side (customersData already reflects debouncedCustomerSearch).
  const filteredCustomers = allCustomers;

  const filteredCustomerGroups = (customerGroupSearch.trim()
    ? allCustomerGroups.filter(g => g.name?.toLowerCase().includes(customerGroupSearch.toLowerCase()))
    : allCustomerGroups
  ).slice(0, 30);

  const filteredProductGroups = (productGroupSearch.trim()
    ? allProductGroups.filter(g => g.name?.toLowerCase().includes(productGroupSearch.toLowerCase()))
    : allProductGroups
  ).slice(0, 30);

  // ── Form helpers ─────────────────────────────────────────────────────────────

  const addAppliesTo    = (p) => { setSelectedProducts(prev => [...prev, p]); setProductSearch(''); setProductDropdown(false); };
  const removeAppliesTo = (id) => setSelectedProducts(prev => prev.filter(p => p.id !== id));

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingPromo(null);
    setSelectedProducts([]);
    setProductSearch('');
    setProductDropdown(false);
    setFreeProduct(null);
    setFreeSearch('');
    setFreeDropdown(false);
    setCustomerTarget('all');
    setSelectedCustomer(null);
    setCustomerSearch('');
    setCustomerDropdown(false);
    setSelectedCustomerGroup(null);
    setCustomerGroupSearch('');
    setCustomerGroupDropdown(false);
    setSelectedProductGroup(null);
    setProductGroupSearch('');
    setProductGroupDropdown(false);
    reset({ type: 'PERCENTAGE', isActive: true });
  }, [reset]);

  const openEdit = useCallback((promo) => {
    setEditingPromo(promo);
    setSelectedProducts(promo.products || []);
    setFreeProduct(promo.freeProduct || null);
    setSelectedProductGroup(promo.productGroup || null);
    if (promo.customerGroup) {
      setCustomerTarget('group');
      setSelectedCustomerGroup(promo.customerGroup);
      setSelectedCustomer(null);
    } else if (promo.customer) {
      setCustomerTarget('customer');
      setSelectedCustomer(promo.customer);
      setSelectedCustomerGroup(null);
    } else {
      setCustomerTarget('all');
      setSelectedCustomer(null);
      setSelectedCustomerGroup(null);
    }
    reset({
      name:          promo.name,
      type:          promo.type,
      discountValue: promo.discountValue,
      maxFreeCount:  promo.maxFreeCount ?? 1,
      minOrderQty:   promo.minOrderQty  ?? 1,
      startDate:     promo.startDate,
      endDate:       promo.endDate,
      isActive:      promo.isActive,
    });
    setShowForm(true);
  }, [reset]);

  // ── Mutations ────────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (body) => pricingApi.createPromotion(body),
    onSuccess: () => { toast.success('Promotion created'); qc.invalidateQueries({ queryKey: ['promotions'] }); closeForm(); },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to create'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }) => pricingApi.updatePromotion(id, body),
    onSuccess: () => { toast.success('Promotion updated'); qc.invalidateQueries({ queryKey: ['promotions'] }); closeForm(); },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to update'),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const onSubmit = (formData) => {
    if (!selectedProducts.length && !selectedProductGroup) {
      toast.error('Select at least one product (directly, or via a product group) this promotion applies to');
      return;
    }
    if (isFreeProduct && !freeProduct) { toast.error('Select the free product to give away'); return; }

    const body = {
      ...formData,
      customerId:      customerTarget === 'customer' ? selectedCustomer?.id || undefined : undefined,
      customerGroupId: customerTarget === 'group'    ? selectedCustomerGroup?.id || undefined : undefined,
      productIds:      selectedProducts.map(p => p.id),
      productGroupId:  selectedProductGroup?.id || undefined,
      freeProductId: isFreeProduct ? freeProduct.id : undefined,
      maxFreeCount:  isFreeProduct ? (formData.maxFreeCount || 1) : undefined,
      minOrderQty:   isFreeProduct ? (formData.minOrderQty  || 1) : undefined,
    };

    if (editingPromotion) {
      updateMutation.mutate({ id: editingPromotion.id, body });
    } else {
      createMutation.mutate(body);
    }
  };

  // ── Table columns ─────────────────────────────────────────────────────────────

  const columns = [
    { key: 'name', label: 'Name' },
    {
      key: 'products',
      label: 'Applies To',
      render: (_, r) => {
        const prods = r.products || [];
        const groupBadge = r.productGroup && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 uppercase tracking-wide mr-1">
            Group: {r.productGroup.name}
          </span>
        );
        if (!prods.length) return groupBadge || <span className="text-gray-400">—</span>;
        if (prods.length === 1) return <span>{groupBadge}{prods[0].name}</span>;
        return (
          <span title={prods.map(p => p.name).join(', ')}>
            {groupBadge}
            {prods[0].name}
            <span className="ml-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-full px-1.5 py-0.5">+{prods.length - 1}</span>
          </span>
        );
      },
    },
    {
      key: 'customer',
      label: 'Customer',
      render: (_, r) => r.customerGroup
        ? <span className="text-purple-700 font-medium">Group: {r.customerGroup.name}</span>
        : (r.customer?.name ?? 'All'),
    },
    {
      key: 'type',
      label: 'Type',
      render: (v) => (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
          ${v === 'FREE_PRODUCT' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-cyan-50 text-cyan-700 border border-cyan-200'}`}>
          {TYPE_LABELS[v] ?? v}
        </span>
      ),
    },
    {
      key: 'discountValue',
      label: 'Discount / Free Item',
      render: (v, r) => {
        if (r.type === 'FREE_PRODUCT')
          return r.freeProduct ? <span className="text-green-700 font-medium">🎁 {r.freeProduct.name}</span> : <span className="text-gray-400">—</span>;
        return r.type === 'PERCENTAGE' ? `${v}%` : `LKR ${formatAmount(v)}`;
      },
    },
    { key: 'startDate', label: 'From' },
    { key: 'endDate',   label: 'To' },
    { key: 'isActive',  label: 'Active', render: (v) => <StatusBadge status={v ? 'ACTIVE' : 'INACTIVE'} /> },
    {
      key: '_actions',
      label: '',
      render: (_, row) => (
        <div className="flex items-center gap-1 justify-end">
          <button
            onClick={(e) => { e.stopPropagation(); openEdit(row); }}
            className="text-xs font-medium text-blue-600 hover:text-blue-800 px-2.5 py-1 rounded-lg hover:bg-blue-50 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setHistoryPromo(row); }}
            className="text-xs font-medium text-gray-500 hover:text-gray-700 px-2.5 py-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            History
          </button>
        </div>
      ),
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <Layout title="Promotions">
      <DataTable
        columns={columns}
        data={data?.content || []}
        loading={isLoading}
        totalPages={data?.totalPages || 1}
        currentPage={page}
        onPageChange={setPage}
        emptyMessage="No promotions configured"
        actions={
          <button className="btn-primary" onClick={() => { closeForm(); setShowForm(true); }}>
            + New Promotion
          </button>
        }
      />

      {/* ── Create / Edit modal ──────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">
                {editingPromotion ? `Edit: ${editingPromotion.name}` : 'New Promotion'}
              </h2>
              {editingPromotion && (
                <span className="text-xs text-gray-400 font-mono truncate max-w-[180px]">ID: {editingPromotion.id}</span>
              )}
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

              {/* Name */}
              <div>
                <label className="label">Name</label>
                <input {...register('name', { required: true })} className="input" placeholder="e.g. Buy A Get B Free" />
                {errors.name && <p className="text-xs text-red-500 mt-1">Name is required</p>}
              </div>

              {/* Applies-to multi-select */}
              <div>
                <label className="label">
                  Applies To <span className="text-red-500">*</span>
                  <span className="text-gray-400 font-normal ml-1">(products that trigger this promotion)</span>
                </label>
                {selectedProducts.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {selectedProducts.map(p => (
                      <span key={p.id} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-medium px-2.5 py-1 rounded-full border border-blue-200">
                        {p.name}
                        <button type="button" onMouseDown={() => removeAppliesTo(p.id)} className="ml-0.5 text-blue-400 hover:text-blue-700">×</button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="relative">
                  <input
                    value={productSearch}
                    onChange={e => { setProductSearch(e.target.value); setProductDropdown(true); }}
                    onFocus={() => setProductDropdown(true)}
                    onBlur={() => setTimeout(() => setProductDropdown(false), 150)}
                    placeholder="Search products…"
                    className="input"
                  />
                  {productDropdown && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filteredAppliesTo.length === 0
                        ? <p className="px-3 py-4 text-sm text-gray-400 text-center">{allProducts.length === 0 ? 'Loading…' : 'No matching products'}</p>
                        : filteredAppliesTo.map(p => (
                            <button key={p.id} type="button" onMouseDown={() => addAppliesTo(p)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between border-b border-gray-50 last:border-0">
                              <span className="font-medium text-gray-800">{p.name}</span>
                              {p.productCode && <span className="text-xs text-gray-400">{p.productCode}</span>}
                            </button>
                          ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Product group — additive to the explicit list above */}
              <div>
                <label className="label">
                  Also Apply To Product Group
                  <span className="text-gray-400 font-normal ml-1">(optional — every current member is included too)</span>
                </label>
                {selectedProductGroup ? (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg border border-purple-200 bg-purple-50">
                    <span className="flex-1 text-sm font-medium text-purple-800">{selectedProductGroup.name}</span>
                    <span className="text-xs text-purple-600">{selectedProductGroup.memberCount} products</span>
                    <button type="button" onClick={() => setSelectedProductGroup(null)} className="text-purple-400 hover:text-purple-700 text-sm ml-1">×</button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      value={productGroupSearch}
                      onChange={e => { setProductGroupSearch(e.target.value); setProductGroupDropdown(true); }}
                      onFocus={() => setProductGroupDropdown(true)}
                      onBlur={() => setTimeout(() => setProductGroupDropdown(false), 150)}
                      placeholder="Search product groups…"
                      className="input"
                    />
                    {productGroupDropdown && (
                      <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {filteredProductGroups.length === 0
                          ? <p className="px-3 py-4 text-sm text-gray-400 text-center">{allProductGroups.length === 0 ? 'No product groups yet' : 'No matching groups'}</p>
                          : filteredProductGroups.map(g => (
                              <button key={g.id} type="button"
                                onMouseDown={() => { setSelectedProductGroup(g); setProductGroupSearch(''); setProductGroupDropdown(false); }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-purple-50 flex items-center justify-between border-b border-gray-50 last:border-0">
                                <span className="font-medium text-gray-800">{g.name}</span>
                                <span className="text-xs text-gray-400">{g.memberCount} products</span>
                              </button>
                            ))}
                      </div>
                    )}
                  </div>
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
                  selectedCustomer ? (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg border border-blue-200 bg-blue-50">
                      <span className="flex-1 text-sm font-medium text-blue-800">{selectedCustomer.name}</span>
                      {selectedCustomer.customerCode && <span className="text-xs text-blue-600">{selectedCustomer.customerCode}</span>}
                      <button type="button" onClick={() => setSelectedCustomer(null)} className="text-blue-400 hover:text-blue-700 text-sm ml-1">×</button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        value={customerSearch}
                        onChange={e => { setCustomerSearch(e.target.value); setCustomerDropdown(true); }}
                        onFocus={() => setCustomerDropdown(true)}
                        onBlur={() => setTimeout(() => setCustomerDropdown(false), 150)}
                        placeholder="Search customers…"
                        className="input"
                      />
                      {customerDropdown && (
                        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {filteredCustomers.length === 0
                            ? <p className="px-3 py-4 text-sm text-gray-400 text-center">{customersData === undefined ? 'Loading…' : 'No matching customers'}</p>
                            : filteredCustomers.map(c => (
                                <button key={c.id} type="button"
                                  onMouseDown={() => { setSelectedCustomer(c); setCustomerSearch(''); setCustomerDropdown(false); }}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between border-b border-gray-50 last:border-0">
                                  <span className="font-medium text-gray-800">{c.name}</span>
                                  {c.customerCode && <span className="text-xs text-gray-400">{c.customerCode}</span>}
                                </button>
                              ))}
                        </div>
                      )}
                    </div>
                  )
                )}
                {customerTarget === 'group' && (
                  selectedCustomerGroup ? (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg border border-purple-200 bg-purple-50">
                      <span className="flex-1 text-sm font-medium text-purple-800">{selectedCustomerGroup.name}</span>
                      <span className="text-xs text-purple-600">{selectedCustomerGroup.memberCount} customers</span>
                      <button type="button" onClick={() => setSelectedCustomerGroup(null)} className="text-purple-400 hover:text-purple-700 text-sm ml-1">×</button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        value={customerGroupSearch}
                        onChange={e => { setCustomerGroupSearch(e.target.value); setCustomerGroupDropdown(true); }}
                        onFocus={() => setCustomerGroupDropdown(true)}
                        onBlur={() => setTimeout(() => setCustomerGroupDropdown(false), 150)}
                        placeholder="Search customer groups…"
                        className="input"
                      />
                      {customerGroupDropdown && (
                        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {filteredCustomerGroups.length === 0
                            ? <p className="px-3 py-4 text-sm text-gray-400 text-center">{allCustomerGroups.length === 0 ? 'No customer groups yet' : 'No matching groups'}</p>
                            : filteredCustomerGroups.map(g => (
                                <button key={g.id} type="button"
                                  onMouseDown={() => { setSelectedCustomerGroup(g); setCustomerGroupSearch(''); setCustomerGroupDropdown(false); }}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-purple-50 flex items-center justify-between border-b border-gray-50 last:border-0">
                                  <span className="font-medium text-gray-800">{g.name}</span>
                                  <span className="text-xs text-gray-400">{g.memberCount} customers</span>
                                </button>
                              ))}
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>

              {/* Type */}
              <div>
                <label className="label">Promotion Type</label>
                <select {...register('type')} className="input">
                  <option value="PERCENTAGE">Percentage Discount</option>
                  <option value="FIXED_AMOUNT">Fixed Amount Discount</option>
                  <option value="FREE_PRODUCT">Free Product</option>
                </select>
              </div>

              {/* Discount value */}
              {!isFreeProduct && (
                <div>
                  <label className="label">{promoType === 'PERCENTAGE' ? 'Discount %' : 'Discount Amount (LKR)'}</label>
                  <input type="number" step="0.01" min="0"
                    {...register('discountValue', { required: !isFreeProduct })} className="input" />
                  {errors.discountValue && <p className="text-xs text-red-500 mt-1">Required</p>}
                </div>
              )}

              {/* Max free count + Min order qty */}
              {isFreeProduct && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Max Free Units <span className="text-gray-400 font-normal ml-1">(per order)</span></label>
                    <input type="number" min="1" step="1"
                      {...register('maxFreeCount', { required: isFreeProduct, min: 1, valueAsNumber: true })}
                      className="input" defaultValue={1} />
                    {errors.maxFreeCount && <p className="text-xs text-red-500 mt-1">Must be at least 1</p>}
                  </div>
                  <div>
                    <label className="label">Min Order Qty <span className="text-gray-400 font-normal ml-1">(to unlock)</span></label>
                    <input type="number" min="1" step="1"
                      {...register('minOrderQty', { required: isFreeProduct, min: 1, valueAsNumber: true })}
                      className="input" defaultValue={1} />
                    {errors.minOrderQty && <p className="text-xs text-red-500 mt-1">Must be at least 1</p>}
                  </div>
                </div>
              )}

              {/* Free product picker */}
              {isFreeProduct && (
                <div>
                  <label className="label">Free Product <span className="text-red-500">*</span></label>
                  {freeProduct ? (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg border border-green-200 bg-green-50">
                      <span className="text-green-600 text-lg">🎁</span>
                      <span className="flex-1 text-sm font-medium text-green-800">{freeProduct.name}</span>
                      {freeProduct.productCode && <span className="text-xs text-green-600">{freeProduct.productCode}</span>}
                      <button type="button" onClick={() => setFreeProduct(null)} className="text-green-400 hover:text-green-700 text-sm ml-1">×</button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        value={freeSearch}
                        onChange={e => { setFreeSearch(e.target.value); setFreeDropdown(true); }}
                        onFocus={() => setFreeDropdown(true)}
                        onBlur={() => setTimeout(() => setFreeDropdown(false), 150)}
                        placeholder="Search for the free product…"
                        className="input"
                      />
                      {freeDropdown && (
                        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {filteredFree.length === 0
                            ? <p className="px-3 py-4 text-sm text-gray-400 text-center">{allProducts.length === 0 ? 'Loading…' : 'No matching products'}</p>
                            : filteredFree.map(p => (
                                <button key={p.id} type="button"
                                  onMouseDown={() => { setFreeProduct(p); setFreeSearch(''); setFreeDropdown(false); }}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-green-50 flex items-center justify-between border-b border-gray-50 last:border-0">
                                  <span className="font-medium text-gray-800">{p.name}</span>
                                  {p.productCode && <span className="text-xs text-gray-400">{p.productCode}</span>}
                                </button>
                              ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Date range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Start Date</label>
                  <input type="date" {...register('startDate', { required: true })} className="input" />
                </div>
                <div>
                  <label className="label">End Date</label>
                  <input type="date" {...register('endDate', { required: true })} className="input" />
                </div>
              </div>

              {/* Active */}
              <label className="flex items-center gap-2 text-sm text-gray-700 select-none cursor-pointer">
                <input type="checkbox" {...register('isActive')} className="rounded" />
                Active immediately
              </label>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn-primary flex-1" disabled={isPending}>
                  {isPending ? 'Saving…' : editingPromotion ? 'Update Promotion' : 'Save Promotion'}
                </button>
                <button type="button" className="btn-secondary flex-1" onClick={closeForm}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── History modal ─────────────────────────────────────────────────────── */}
      {historyPromo && (
        <HistoryModal promo={historyPromo} onClose={() => setHistoryPromo(null)} />
      )}
    </Layout>
  );
}

export default withAuth(PromotionsPage, ['SUPER_ADMIN', 'SALES_MANAGER'], 'MOD_PROMOTIONS');
