import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import { withAuth } from '../../lib/auth';
import { bankAccountApi } from '../../lib/api';
import toast from 'react-hot-toast';
import { formatAmount } from '../../lib/format';

const fmt = (v) => formatAmount(v);

function NewBankAccountModal({ onClose, onSubmit, isPending }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { accountName: '', accountNumber: '', bankName: '', currency: 'LKR', openingBalance: '' },
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="mb-4 text-base font-semibold text-gray-900">New Bank Account</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <label className="label">Account Name <span className="text-red-500">*</span></label>
            <input className="input" {...register('accountName', { required: true })} />
            {errors.accountName && <p className="mt-1 text-xs text-red-500">Required</p>}
          </div>
          <div>
            <label className="label">Bank Name</label>
            <input className="input" {...register('bankName')} />
          </div>
          <div>
            <label className="label">Account Number</label>
            <input className="input" {...register('accountNumber')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Currency</label>
              <input className="input" {...register('currency')} />
            </div>
            <div>
              <label className="label">Opening Balance</label>
              <input type="number" step="0.01" min="0" className="input" {...register('openingBalance')} />
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

function TransactionsDrilldown({ account, onClose }) {
  const { data: lines = [], isLoading } = useQuery({
    queryKey: ['bank-account-transactions', account.id],
    queryFn: () => bankAccountApi.transactions(account.id).then(r => r.data),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl max-h-[80vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">{account.accountName}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : lines.length === 0 ? (
          <p className="text-sm text-gray-500">No transactions yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="py-1.5">Description</th>
                <th className="py-1.5 text-right">In</th>
                <th className="py-1.5 text-right">Out</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(l => (
                <tr key={l.id} className="border-b border-gray-50">
                  <td className="py-1.5">{l.description}</td>
                  <td className="py-1.5 text-right tabular-nums text-green-700">{l.debitAmount > 0 ? fmt(l.debitAmount) : ''}</td>
                  <td className="py-1.5 text-right tabular-nums text-red-700">{l.creditAmount > 0 ? fmt(l.creditAmount) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function BankManagementPage() {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [drilldown, setDrilldown] = useState(null);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => bankAccountApi.list().then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data) => bankAccountApi.create({ ...data, openingBalance: data.openingBalance ? parseFloat(data.openingBalance) : 0 }),
    onSuccess: () => {
      toast.success('Bank account created');
      qc.invalidateQueries({ queryKey: ['bank-accounts'] });
      setShowNew(false);
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? err.response?.data?.message ?? 'Failed to create bank account'),
  });

  const columns = [
    { key: 'accountName', label: 'Account', render: (v, row) => (
      <button className="text-brand-600 hover:underline" onClick={() => setDrilldown(row)}>{v}</button>
    ) },
    { key: 'bankName', label: 'Bank', render: (v) => v || <span className="text-gray-400">—</span> },
    { key: 'accountNumber', label: 'Account #', render: (v) => v || <span className="text-gray-400">—</span> },
    { key: 'currency', label: 'Currency' },
    { key: 'balance', label: 'Balance', render: (v) => <span className="font-semibold tabular-nums">{fmt(v)}</span> },
  ];

  return (
    <Layout title="Bank Management">
      <DataTable
        columns={columns}
        data={accounts}
        loading={isLoading}
        emptyMessage="No bank accounts yet"
        actions={<button onClick={() => setShowNew(true)} className="btn-primary ml-auto">+ New Bank Account</button>}
      />
      {showNew && (
        <NewBankAccountModal
          isPending={createMutation.isPending}
          onClose={() => setShowNew(false)}
          onSubmit={(d) => createMutation.mutate(d)}
        />
      )}
      {drilldown && <TransactionsDrilldown account={drilldown} onClose={() => setDrilldown(null)} />}
    </Layout>
  );
}

export default withAuth(BankManagementPage, ['SUPER_ADMIN', 'SALES_MANAGER', 'FINANCE_USER'], 'MOD_FIN_BANK', 'FINANCE');
