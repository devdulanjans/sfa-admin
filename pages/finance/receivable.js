import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import { withAuth } from '../../lib/auth';
import { receivableApi, bankAccountApi, invoiceApi } from '../../lib/api';
import toast from 'react-hot-toast';
import { formatAmount } from '../../lib/format';

const fmt = (v) => formatAmount(v);

const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'OTHER'];

function RecordPaymentModal({ invoice, bankAccounts, onClose, onSubmit, isPending }) {
  const outstanding = invoice.balance;
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      bankAccountId: '', amount: outstanding, paymentDate: new Date().toISOString().slice(0, 10),
      paymentMethod: 'BANK_TRANSFER', referenceNumber: '',
    },
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="mb-1 text-base font-semibold text-gray-900">Record Payment</h2>
        <p className="mb-4 text-xs text-gray-500">{invoice.invoiceNumber} — outstanding {fmt(outstanding)}</p>
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
            <label className="label">Method</label>
            <select className="input" {...register('paymentMethod')}>
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
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

function CustomerInvoicesDrilldown({ customer, bankAccounts, onClose, onRecordPayment }) {
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['receivable-customer-invoices', customer.customerId],
    queryFn: () => receivableApi.invoicesForCustomer(customer.customerId).then(r => r.data),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl max-h-[80vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">{customer.customerName}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : invoices.length === 0 ? (
          <p className="text-sm text-gray-500">No outstanding invoices.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="py-1.5">Invoice #</th>
                <th className="py-1.5">Issued</th>
                <th className="py-1.5 text-right">Total</th>
                <th className="py-1.5 text-right">Paid</th>
                <th className="py-1.5 text-right">Balance</th>
                <th className="py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id} className="border-b border-gray-50">
                  <td className="py-1.5">{inv.invoiceNumber}</td>
                  <td className="py-1.5">{inv.issuedDate}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmt(inv.total)}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmt(inv.paidAmount)}</td>
                  <td className="py-1.5 text-right tabular-nums font-semibold">{fmt(inv.balance)}</td>
                  <td className="py-1.5 text-right">
                    <button onClick={() => onRecordPayment(inv)}
                      className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100">
                      Record Payment
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ReceivablePage() {
  const qc = useQueryClient();
  const [drilldownCustomer, setDrilldownCustomer] = useState(null);
  const [paymentTarget, setPaymentTarget] = useState(null);

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['receivable-customers'],
    queryFn: () => receivableApi.byCustomer().then(r => r.data),
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => bankAccountApi.list().then(r => r.data),
  });

  const paymentMutation = useMutation({
    mutationFn: ({ invoiceId, data }) => invoiceApi.recordPayment(invoiceId, { ...data, amount: parseFloat(data.amount) }),
    onSuccess: () => {
      toast.success('Payment recorded');
      qc.invalidateQueries({ queryKey: ['receivable-customers'] });
      qc.invalidateQueries({ queryKey: ['receivable-customer-invoices'] });
      qc.invalidateQueries({ queryKey: ['bank-accounts'] });
      qc.invalidateQueries({ queryKey: ['finance-accounts'] });
      setPaymentTarget(null);
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? err.response?.data?.message ?? 'Failed to record payment'),
  });

  const columns = [
    { key: 'customerName', label: 'Customer', render: (v, row) => (
      <button className="text-blue-600 hover:underline" onClick={() => setDrilldownCustomer(row)}>{v}</button>
    ) },
    { key: 'outstandingBalance', label: 'Outstanding Balance', render: (v) => <span className="font-semibold tabular-nums">{fmt(v)}</span> },
  ];

  return (
    <Layout title="Accounts Receivable">
      <DataTable
        columns={columns}
        data={customers}
        loading={isLoading}
        emptyMessage="No outstanding customer balances"
      />

      {drilldownCustomer && (
        <CustomerInvoicesDrilldown
          customer={drilldownCustomer}
          bankAccounts={bankAccounts}
          onClose={() => setDrilldownCustomer(null)}
          onRecordPayment={(inv) => setPaymentTarget(inv)}
        />
      )}
      {paymentTarget && (
        <RecordPaymentModal
          invoice={paymentTarget}
          bankAccounts={bankAccounts}
          isPending={paymentMutation.isPending}
          onClose={() => setPaymentTarget(null)}
          onSubmit={(d) => paymentMutation.mutate({ invoiceId: paymentTarget.id, data: d })}
        />
      )}
    </Layout>
  );
}

export default withAuth(ReceivablePage, ['SUPER_ADMIN', 'SALES_MANAGER', 'FINANCE_USER'], 'MOD_FIN_RECEIVABLE', 'FINANCE');
