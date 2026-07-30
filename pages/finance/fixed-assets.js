import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import { withAuth } from '../../lib/auth';
import { fixedAssetApi, bankAccountApi } from '../../lib/api';
import toast from 'react-hot-toast';
import { formatAmount } from '../../lib/format';

const fmt = (v) => formatAmount(v);

function NewAssetModal({ bankAccounts, onClose, onSubmit, isPending }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      assetCode: '', name: '', category: '', purchaseDate: new Date().toISOString().slice(0, 10),
      purchaseCost: '', salvageValue: 0, usefulLifeYears: 5, bankAccountId: '',
    },
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="mb-4 text-base font-semibold text-gray-900">New Fixed Asset</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Asset Code <span className="text-red-500">*</span></label>
              <input className="input" {...register('assetCode', { required: true })} />
            </div>
            <div>
              <label className="label">Name <span className="text-red-500">*</span></label>
              <input className="input" {...register('name', { required: true })} />
              {errors.name && <p className="mt-1 text-xs text-red-500">Required</p>}
            </div>
          </div>
          <div>
            <label className="label">Category</label>
            <input className="input" {...register('category')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Purchase Date <span className="text-red-500">*</span></label>
              <input type="date" className="input" {...register('purchaseDate', { required: true })} />
            </div>
            <div>
              <label className="label">Paid From <span className="text-red-500">*</span></label>
              <select className="input" {...register('bankAccountId', { required: true })}>
                <option value="">Select bank account…</option>
                {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.accountName}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Purchase Cost <span className="text-red-500">*</span></label>
              <input type="number" step="0.01" min="0.01" className="input"
                {...register('purchaseCost', { required: true, min: 0.01 })} />
              {errors.purchaseCost && <p className="mt-1 text-xs text-red-500">Required</p>}
            </div>
            <div>
              <label className="label">Salvage Value</label>
              <input type="number" step="0.01" min="0" className="input" {...register('salvageValue')} />
            </div>
            <div>
              <label className="label">Useful Life (yrs) <span className="text-red-500">*</span></label>
              <input type="number" min="1" className="input" {...register('usefulLifeYears', { required: true, min: 1 })} />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={isPending} className="btn-primary flex-1 disabled:opacity-50">
              {isPending ? 'Saving…' : 'Create'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RunDepreciationModal({ onClose, onSubmit, isPending }) {
  const [periodDate, setPeriodDate] = useState(new Date().toISOString().slice(0, 10));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Run Depreciation</h2>
        <p className="mb-3 text-xs text-gray-500">
          Posts one month's straight-line depreciation for every active asset that hasn't
          already been depreciated for this period. Safe to re-run — already-posted periods are skipped.
        </p>
        <label className="label">Period</label>
        <input type="date" className="input mb-4" value={periodDate} onChange={(e) => setPeriodDate(e.target.value)} />
        <div className="flex gap-2">
          <button disabled={isPending} onClick={() => onSubmit(periodDate)} className="btn-primary flex-1 disabled:opacity-50">
            {isPending ? 'Running…' : 'Run Depreciation'}
          </button>
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function DepreciationHistory({ asset, onClose }) {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['fixed-asset-depreciation', asset.id],
    queryFn: () => fixedAssetApi.depreciation(asset.id).then(r => r.data),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">{asset.assetCode} — {asset.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-gray-500">No depreciation posted yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="py-1.5">Period</th>
                <th className="py-1.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id} className="border-b border-gray-50">
                  <td className="py-1.5">{h.periodDate}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmt(h.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FixedAssetsPage() {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [showRun, setShowRun] = useState(false);
  const [historyAsset, setHistoryAsset] = useState(null);

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['fixed-assets'],
    queryFn: () => fixedAssetApi.list().then(r => r.data),
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => bankAccountApi.list().then(r => r.data),
    enabled: showNew,
  });

  const createMutation = useMutation({
    mutationFn: (data) => fixedAssetApi.create({
      ...data,
      purchaseCost: parseFloat(data.purchaseCost),
      salvageValue: data.salvageValue ? parseFloat(data.salvageValue) : 0,
      usefulLifeYears: parseInt(data.usefulLifeYears, 10),
    }),
    onSuccess: () => {
      toast.success('Asset recorded');
      qc.invalidateQueries({ queryKey: ['fixed-assets'] });
      qc.invalidateQueries({ queryKey: ['bank-accounts'] });
      setShowNew(false);
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? err.response?.data?.message ?? 'Failed to create asset'),
  });

  const runMutation = useMutation({
    mutationFn: (periodDate) => fixedAssetApi.runDepreciation(periodDate),
    onSuccess: (res) => {
      toast.success(`Depreciation posted for ${res.data.length} asset(s)`);
      qc.invalidateQueries({ queryKey: ['fixed-assets'] });
      setShowRun(false);
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? err.response?.data?.message ?? 'Failed to run depreciation'),
  });

  const columns = [
    { key: 'assetCode', label: 'Code' },
    { key: 'name', label: 'Name', render: (v, row) => (
      <button className="text-blue-600 hover:underline" onClick={() => setHistoryAsset(row)}>{v}</button>
    ) },
    { key: 'category', label: 'Category', render: (v) => v || <span className="text-gray-400">—</span> },
    { key: 'purchaseCost', label: 'Cost', render: (v) => <span className="tabular-nums">{fmt(v)}</span> },
    { key: 'accumulatedDepreciation', label: 'Accum. Depreciation', render: (v) => <span className="tabular-nums">{fmt(v)}</span> },
    { key: 'netBookValue', label: 'Net Book Value', render: (v) => <span className="font-semibold tabular-nums">{fmt(v)}</span> },
  ];

  return (
    <Layout title="Fixed Assets">
      <DataTable
        columns={columns}
        data={assets}
        loading={isLoading}
        emptyMessage="No fixed assets yet"
        actions={
          <div className="ml-auto flex gap-2">
            <button onClick={() => setShowRun(true)} className="btn-secondary">Run Depreciation</button>
            <button onClick={() => setShowNew(true)} className="btn-primary">+ New Asset</button>
          </div>
        }
      />

      {showNew && (
        <NewAssetModal
          bankAccounts={bankAccounts}
          isPending={createMutation.isPending}
          onClose={() => setShowNew(false)}
          onSubmit={(d) => createMutation.mutate(d)}
        />
      )}
      {showRun && (
        <RunDepreciationModal
          isPending={runMutation.isPending}
          onClose={() => setShowRun(false)}
          onSubmit={(periodDate) => runMutation.mutate(periodDate)}
        />
      )}
      {historyAsset && <DepreciationHistory asset={historyAsset} onClose={() => setHistoryAsset(null)} />}
    </Layout>
  );
}

export default withAuth(FixedAssetsPage, ['SUPER_ADMIN', 'FINANCE_USER'], 'MOD_FIN_ASSETS', 'FINANCE');
