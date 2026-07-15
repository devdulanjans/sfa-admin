import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useEffect } from 'react';
import Layout from '../../components/Layout';
import StatusBadge from '../../components/StatusBadge';
import { withAuth } from '../../lib/auth';
import { productApi, categoryApi, unitApi } from '../../lib/api';
import toast from 'react-hot-toast';
import { formatAmount } from '../../lib/format';

function ProductDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const qc = useQueryClient();
  const isNew = id === 'new';

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
    mutationFn: (body) => isNew
      ? productApi.create(body)
      : productApi.update(id, body),
    onSuccess: (res) => {
      toast.success(isNew ? 'Product created' : 'Product updated');
      qc.invalidateQueries({ queryKey: ['products'] });
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
      <div className="card p-6 max-w-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">
            {isNew ? 'New Product' : 'Edit Product'}
          </h2>
          {product && <StatusBadge status={product.status} />}
        </div>

        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-4">
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
              disabled={mutation.isPending || (!isNew && !isDirty)}>
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
