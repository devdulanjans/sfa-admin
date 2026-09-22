import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import StatusBadge from '../../components/StatusBadge';
import { withAuth, useAuth } from '../../lib/auth';
import { useAccessibleTenants } from '../../lib/hooks';
import { productApi, categoryApi, unitApi, productGroupApi } from '../../lib/api';
import toast from 'react-hot-toast';
import { formatAmount } from '../../lib/format';

// ── Checkbox list: search + select-all + scrollable grid of checkboxes ─────────
function GroupCheckboxList({ allItems, selectedIds, setSelectedIds, getLabel, getSubLabel, searchPlaceholder }) {
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? allItems.filter(i =>
        getLabel(i)?.toLowerCase().includes(search.toLowerCase()) ||
        getSubLabel?.(i)?.toLowerCase().includes(search.toLowerCase()))
    : allItems;

  const allSelected = filtered.length > 0 && filtered.every(i => selectedIds.includes(i.id));

  function toggleOne(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !filtered.find(i => i.id === id)));
    } else {
      setSelectedIds(prev => [...prev, ...filtered.filter(i => !prev.includes(i.id)).map(i => i.id)]);
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-gray-200 bg-gray-50">
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input max-w-xs"
        />
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer shrink-0">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
          {allSelected ? 'Deselect all' : 'Select all'} ({filtered.length})
        </label>
      </div>
      <div className="max-h-64 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-8">
            {allItems.length === 0 ? 'No product groups yet' : 'No matches'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
            {filtered.map(item => {
              const checked = selectedIds.includes(item.id);
              return (
                <label
                  key={item.id}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-50 ${checked ? 'bg-blue-50' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleOne(item.id)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{getLabel(item)}</p>
                    {getSubLabel && <p className="text-xs text-gray-500 truncate">{getSubLabel(item)}</p>}
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ProductDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const qc = useQueryClient();
  const isNew = id === 'new';
  const { user } = useAuth();
  // A single-channel actor never needs to be asked — their one channel is implied
  // either way. Anyone managing more than one (SUPER_ADMIN sees every channel; an
  // ADMIN over several channels sees just its own) picks which this product belongs to.
  const { tenants: accessibleTenants, isLoading: tenantsLoading, needsPicker: needsChannelPicker } =
    useAccessibleTenants({ enabled: isNew });
  const [selectedGroupIds, setSelectedGroupIds] = useState([]);
  const [initialGroupIds, setInitialGroupIds] = useState([]);

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => productApi.get(id).then(r => r.data),
    enabled: !!id && !isNew,
  });

  const { data: categories } = useQuery({
    queryKey: ['product-categories'],
    queryFn:  () => categoryApi.list().then(r => r.data),
  });

  const { data: units } = useQuery({
    queryKey: ['units'],
    queryFn:  () => unitApi.list().then(r => r.data),
  });

  const { data: allGroupsData } = useQuery({
    queryKey: ['product-groups-picker'],
    queryFn: () => productGroupApi.list({ size: 200 }).then(r => r.data),
  });
  const allGroups = allGroupsData?.content ?? [];

  useEffect(() => {
    if (!isNew && id) {
      productGroupApi.byProduct(id).then(r => {
        const ids = r.data.map(g => g.id);
        setSelectedGroupIds(ids);
        setInitialGroupIds(ids);
      });
    }
  }, [id, isNew]);

  const groupsDirty = selectedGroupIds.length !== initialGroupIds.length
    || selectedGroupIds.some(gid => !initialGroupIds.includes(gid));

  const { register, handleSubmit, reset, watch, formState: { errors, isDirty } } = useForm({
    defaultValues: { taxRate: '15.00', maxDiscountAmount: '0.00' },
  });

  useEffect(() => {
    if (product) {
      reset({
        productCode:       product.productCode,
        barcode:           product.barcode ?? '',
        name:              product.name,
        description:       product.description ?? '',
        categoryId:        product.categoryId  ?? '',
        unitId:            product.unitId      ?? '',
        defaultPrice:      product.defaultPrice,
        purchasePrice:     product.purchasePrice,
        taxRate:           product.taxRate,
        maxDiscountAmount: product.maxDiscountAmount,
      });
    }
  }, [product, reset]);

  const purchasePrice = parseFloat(watch('purchasePrice'));
  const defaultPrice  = parseFloat(watch('defaultPrice'));
  const hasMargin = !isNaN(purchasePrice) && !isNaN(defaultPrice) && defaultPrice > 0;
  const profitPerUnit = hasMargin ? defaultPrice - purchasePrice : null;
  const marginPct = hasMargin ? (profitPerUnit / defaultPrice) * 100 : null;

  const mutation = useMutation({
    mutationFn: async (body) => {
      const res = isNew
        ? await productApi.create(body)
        : await productApi.update(id, body);
      await productGroupApi.setForProduct(res.data.id, selectedGroupIds);
      return res;
    },
    onSuccess: (res) => {
      toast.success(isNew ? 'Product created' : 'Product updated');
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['product-groups'] });
      if (isNew) router.push(`/products/${res.data.id}`);
      else qc.invalidateQueries({ queryKey: ['product', id] });
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Save failed'),
  });

  if (!isNew && isLoading) {
    return (
      <Layout title="Product">
        <div className="card p-8 animate-pulse h-64" />
      </Layout>
    );
  }

  return (
    <Layout title={isNew ? 'New Product' : product?.name ?? 'Product'}>
      <div className="card p-6 w-full">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">
            {isNew ? 'New Product' : 'Edit Product'}
          </h2>
          <div className="flex items-center gap-2">
            {!isNew && product?.tenantName && (
              <span className="text-xs font-medium bg-amber-50 text-amber-700 px-2 py-0.5 rounded">
                {product.tenantName}
              </span>
            )}
            {product && <StatusBadge status={product.status} />}
          </div>
        </div>

        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-4">
          {needsChannelPicker && (
            <div>
              <label className="label">Channel *</label>
              <select {...register('tenantId', { required: true })} className="input" disabled={tenantsLoading}>
                <option value="">{tenantsLoading ? 'Loading channels…' : 'Select a channel…'}</option>
                {accessibleTenants.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {errors.tenantId && <p className="text-red-500 text-xs mt-1">Required — which channel does this product belong to?</p>}
              <p className="text-xs text-gray-500 mt-1">
                You manage more than one channel — pick which one this product belongs to.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Product Code *</label>
              <input {...register('productCode', { required: true })} className="input" placeholder="e.g. PRD001" />
              {errors.productCode && <p className="text-red-500 text-xs mt-1">Required</p>}
            </div>
            <div>
              <label className="label">Name *</label>
              <input {...register('name', { required: true })} className="input" />
              {errors.name && <p className="text-red-500 text-xs mt-1">Required</p>}
            </div>
          </div>

          <div>
            <label className="label">
              Barcode <span className="font-normal text-gray-400 text-xs">(optional — scanned at POS)</span>
            </label>
            <input {...register('barcode')} className="input font-mono" placeholder="e.g. 8901234567890" />
          </div>

          <div>
            <label className="label">Description</label>
            <textarea {...register('description')} rows={2} className="input resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Category</label>
              <select {...register('categoryId')} className="input">
                <option value="">— No category —</option>
                {(categories || []).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Unit of Measure</label>
              <select {...register('unitId')} className="input">
                <option value="">— No unit —</option>
                {(units || []).map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name}{u.abbreviation ? ` (${u.abbreviation})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">
              Product Groups <span className="text-gray-400 font-normal ml-1">({selectedGroupIds.length} selected)</span>
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Adding this product to a group applies any batch price or promotion rule targeting that group, and makes it visible to every customer in a customer group that has this product assigned.
            </p>
            <GroupCheckboxList
              allItems={allGroups}
              selectedIds={selectedGroupIds}
              setSelectedIds={setSelectedGroupIds}
              getLabel={g => g.name}
              getSubLabel={g => g.description}
              searchPlaceholder="Search product groups…"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Purchase Price *</label>
              <input type="number" step="0.01" min="0"
                {...register('purchasePrice', { required: true })} className="input" />
              {errors.purchasePrice && <p className="text-red-500 text-xs mt-1">Required</p>}
            </div>
            <div>
              <label className="label">Default Price *</label>
              <input type="number" step="0.01" min="0"
                {...register('defaultPrice', { required: true })} className="input" />
              {errors.defaultPrice && <p className="text-red-500 text-xs mt-1">Required</p>}
            </div>
          </div>

          {hasMargin && (
            <div className={`flex items-center gap-4 rounded-lg border px-3 py-2 text-sm ${
              profitPerUnit >= 0 ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'
            }`}>
              <span>Profit/Unit: <span className="font-semibold tabular-nums">LKR {formatAmount(profitPerUnit)}</span></span>
              <span>Margin: <span className="font-semibold tabular-nums">{marginPct.toFixed(1)}%</span></span>
              {profitPerUnit < 0 && <span className="text-xs font-medium">⚠ Selling below cost</span>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Tax Rate %</label>
              <input type="number" step="0.01" min="0" max="100"
                {...register('taxRate')} className="input" />
            </div>
            <div>
              <label className="label">Max Discount (Rs)</label>
              <input type="number" step="0.01" min="0"
                {...register('maxDiscountAmount', {
                  validate: (v) => {
                    const amt = parseFloat(v);
                    if (isNaN(amt) || amt <= 0) return true;
                    const price = parseFloat(watch('defaultPrice'));
                    return isNaN(price) || amt < price || 'Must be less than the selling price';
                  },
                })}
                className="input" />
              {errors.maxDiscountAmount && <p className="text-red-500 text-xs mt-1">{errors.maxDiscountAmount.message}</p>}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn-primary"
              disabled={mutation.isPending || (!isNew && !isDirty && !groupsDirty)}>
              {mutation.isPending ? 'Saving…' : isNew ? 'Create Product' : 'Save Changes'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => router.back()}>
              Back
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}

export default withAuth(ProductDetailPage, ['SUPER_ADMIN', 'SALES_MANAGER']);
