import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import { withAuth } from '../../lib/auth';
import { taxManagementApi, bankAccountApi } from '../../lib/api';
import toast from 'react-hot-toast';
import { formatAmount } from '../../lib/format';

const fmt = (v) => formatAmount(v);

function RecordTaxPaymentModal({ outstanding, bankAccounts, onClose, onSubmit, isPending }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      bankAccountId: '', amount: outstanding, paymentDate: new Date().toISOString().slice(0, 10), referenceNumber: '',
    },
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="mb-1 text-base font-semibold text-gray-900">Record Tax Payment</h2>
        <p className="mb-4 text-xs text-gray-500">Outstanding Tax Payable: {fmt(outstanding)}</p>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <label className="label">Bank Account <span className="text-red-500">*</span></label>
            <select className="input" {...register('bankAccountId', { required: true })}>
              <option value="">Select bank account…</option>
              {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.accountName}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Amount <span className="text-red-500">*</span></label>
            <input type="number" step="0.01" min="0.01" max={outstanding} className="input"
              {...register('amount', { required: true, min: 0.01, max: outstanding })} />
            {errors.amount && <p className="mt-1 text-xs text-red-500">Must be between 0.01 and {fmt(outstanding)}</p>}
          </div>
          <div>
            <label className="label">Payment Date <span className="text-red-500">*</span></label>
            <input type="date" className="input" {...register('paymentDate', { required: true })} />
          </div>
          <div>
            <label className="label">Reference Number</label>
            <input className="input" {...register('referenceNumber')} />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={isPending} className="btn-primary flex-1 disabled:opacity-50">
              {isPending ? 'Recording…' : 'Record Payment'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TaxManagementPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('ledger');
  const [showPayment, setShowPayment] = useState(false);

  const { data: payable } = useQuery({
    queryKey: ['tax-payable'],
    queryFn: () => taxManagementApi.payable().then(r => r.data),
  });

  const { data: ledger = [], isLoading: ledgerLoading } = useQuery({
    queryKey: ['tax-ledger'],
    queryFn: () => taxManagementApi.ledger().then(r => r.data),
    enabled: tab === 'ledger',
  });

  const { data: payments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ['tax-payments'],
    queryFn: () => taxManagementApi.payments().then(r => r.data),
    enabled: tab === 'payments',
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => bankAccountApi.list().then(r => r.data),
    enabled: showPayment,
  });

  const paymentMutation = useMutation({
    mutationFn: (data) => taxManagementApi.recordPayment({ ...data, amount: parseFloat(data.amount) }),
    onSuccess: () => {
      toast.success('Tax payment recorded');
      qc.invalidateQueries({ queryKey: ['tax-payable'] });
      qc.invalidateQueries({ queryKey: ['tax-ledger'] });
      qc.invalidateQueries({ queryKey: ['tax-payments'] });
      qc.invalidateQueries({ queryKey: ['bank-accounts'] });
      setShowPayment(false);
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? err.response?.data?.message ?? 'Failed to record payment'),
  });

  const ledgerColumns = [
    { key: 'description', label: 'Description' },
    { key: 'debitAmount', label: 'Debit', render: (v) => v > 0 ? <span className="tabular-nums">{fmt(v)}</span> : '' },
    { key: 'creditAmount', label: 'Credit', render: (v) => v > 0 ? <span className="tabular-nums">{fmt(v)}</span> : '' },
  ];

  const paymentColumns = [
    { key: 'paymentDate', label: 'Date' },
    { key: 'bankAccountName', label: 'Bank Account' },
    { key: 'amount', label: 'Amount', render: (v) => <span className="font-semibold tabular-nums">{fmt(v)}</span> },
    { key: 'referenceNumber', label: 'Reference', render: (v) => v || <span className="text-gray-400">—</span> },
  ];

  return (
    <Layout title="Tax Management">
      <div className="mb-4 flex items-center gap-3">
        <div className="card px-4 py-3">
          <p className="text-xs text-gray-500">Outstanding Tax Payable</p>
          <p className="text-lg font-semibold tabular-nums">{payable ? fmt(payable.balance) : '—'}</p>
        </div>
        <button onClick={() => setShowPayment(true)} className="btn-primary">+ Record Tax Payment</button>
      </div>

      <div className="mb-4 flex gap-2">
        <button onClick={() => setTab('ledger')}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === 'ledger' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
          Tax Payable Ledger
        </button>
        <button onClick={() => setTab('payments')}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === 'payments' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
          Payments to Authority
        </button>
      </div>

      {tab === 'ledger' ? (
        <DataTable columns={ledgerColumns} data={ledger} loading={ledgerLoading} emptyMessage="No tax postings yet" />
      ) : (
        <DataTable columns={paymentColumns} data={payments} loading={paymentsLoading} emptyMessage="No tax payments recorded yet" />
      )}

      {showPayment && (
        <RecordTaxPaymentModal
          outstanding={payable?.balance ?? 0}
          bankAccounts={bankAccounts}
          isPending={paymentMutation.isPending}
          onClose={() => setShowPayment(false)}
          onSubmit={(d) => paymentMutation.mutate(d)}
        />
      )}
    </Layout>
  );
}

export default withAuth(TaxManagementPage, ['SUPER_ADMIN', 'SALES_MANAGER', 'FINANCE_USER'], 'MOD_FIN_TAX', 'FINANCE');
