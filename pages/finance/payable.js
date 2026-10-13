import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import { withAuth } from '../../lib/auth';
import { vendorApi, vendorBillApi, chartOfAccountsApi, bankAccountApi } from '../../lib/api';
import toast from 'react-hot-toast';
import { formatAmount } from '../../lib/format';

const fmt = (v) => formatAmount(v);

const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'OTHER'];

function NewVendorModal({ onClose, onSubmit, isPending }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { vendorCode: '', name: '', contactPerson: '', phone: '', email: '', address: '', taxNumber: '', paymentTermsDays: 30 },
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="mb-4 text-base font-semibold text-gray-900">New Vendor</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Vendor Code <span className="text-red-500">*</span></label>
              <input className="input" {...register('vendorCode', { required: true })} />
            </div>
            <div>
              <label className="label">Name <span className="text-red-500">*</span></label>
              <input className="input" {...register('name', { required: true })} />
              {errors.name && <p className="mt-1 text-xs text-red-500">Required</p>}
            </div>
          </div>
          <div>
            <label className="label">Contact Person</label>
            <input className="input" {...register('contactPerson')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Phone</label>
              <input className="input" {...register('phone')} />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" {...register('email')} />
            </div>
          </div>
          <div>
            <label className="label">Address</label>
            <input className="input" {...register('address')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Tax Number</label>
              <input className="input" {...register('taxNumber')} />
            </div>
            <div>
              <label className="label">Payment Terms (days)</label>
              <input type="number" className="input" {...register('paymentTermsDays')} />
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

function NewBillModal({ vendors, expenseAccounts, onClose, onSubmit, isPending }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      vendorId: '', billDate: new Date().toISOString().slice(0, 10), dueDate: '',
      total: '', expenseAccountId: '', description: '',
    },
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="mb-4 text-base font-semibold text-gray-900">New Vendor Bill</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <label className="label">Vendor <span className="text-red-500">*</span></label>
            <select className="input" {...register('vendorId', { required: true })}>
              <option value="">Select vendor…</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.vendorCode} — {v.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Bill Date <span className="text-red-500">*</span></label>
              <input type="date" className="input" {...register('billDate', { required: true })} />
            </div>
            <div>
              <label className="label">Due Date</label>
              <input type="date" className="input" {...register('dueDate')} />
            </div>
          </div>
          <div>
            <label className="label">Expense Account <span className="text-red-500">*</span></label>
            <select className="input" {...register('expenseAccountId', { required: true })}>
              <option value="">Select account…</option>
              {expenseAccounts.map(a => <option key={a.id} value={a.id}>{a.accountCode} — {a.accountName}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Total <span className="text-red-500">*</span></label>
            <input type="number" step="0.01" min="0.01" className="input"
              {...register('total', { required: true, min: 0.01 })} />
            {errors.total && <p className="mt-1 text-xs text-red-500">Must be greater than zero</p>}
          </div>
          <div>
            <label className="label">Description</label>
            <input className="input" {...register('description')} />
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

function RecordPaymentModal({ bill, bankAccounts, onClose, onSubmit, isPending }) {
  const outstanding = bill.balance;
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
        <p className="mb-4 text-xs text-gray-500">{bill.billNumber} — outstanding {fmt(outstanding)}</p>
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

const STATUS_BADGE = {
  OPEN: 'bg-amber-50 text-amber-700 border-amber-200',
  PARTIALLY_PAID: 'bg-brand-50 text-brand-700 border-brand-200',
  PAID: 'bg-green-50 text-green-700 border-green-200',
  CANCELLED: 'bg-gray-50 text-gray-500 border-gray-200',
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[status] || STATUS_BADGE.OPEN}`}>
      {status}
    </span>
  );
}

function PayablePage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('bills');
  const [showNewVendor, setShowNewVendor] = useState(false);
  const [showNewBill, setShowNewBill] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [page, setPage] = useState(0);

  const { data: vendorsPage } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => vendorApi.list({ size: 200 }).then(r => r.data),
  });
  const vendors = vendorsPage?.content || [];

  const { data: accounts = [] } = useQuery({
    queryKey: ['finance-accounts'],
    queryFn: () => chartOfAccountsApi.list().then(r => r.data),
  });
  const expenseAccounts = accounts.filter(a => a.accountType === 'EXPENSE');

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => bankAccountApi.list().then(r => r.data),
  });

  const { data: bills, isLoading } = useQuery({
    queryKey: ['vendor-bills', page],
    queryFn: () => vendorBillApi.list({ page, size: 20 }).then(r => r.data),
    keepPreviousData: true,
    enabled: tab === 'bills',
  });

  const createVendorMutation = useMutation({
    mutationFn: (data) => vendorApi.create(data),
    onSuccess: () => {
      toast.success('Vendor created');
      qc.invalidateQueries({ queryKey: ['vendors'] });
      setShowNewVendor(false);
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? err.response?.data?.message ?? 'Failed to create vendor'),
  });

  const createBillMutation = useMutation({
    mutationFn: (data) => vendorBillApi.create({ ...data, total: parseFloat(data.total), dueDate: data.dueDate || null }),
    onSuccess: () => {
      toast.success('Bill recorded');
      qc.invalidateQueries({ queryKey: ['vendor-bills'] });
      qc.invalidateQueries({ queryKey: ['finance-accounts'] });
      setShowNewBill(false);
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? err.response?.data?.message ?? 'Failed to create bill'),
  });

  const paymentMutation = useMutation({
    mutationFn: ({ billId, data }) => vendorBillApi.recordPayment(billId, { ...data, amount: parseFloat(data.amount) }),
    onSuccess: () => {
      toast.success('Payment recorded');
      qc.invalidateQueries({ queryKey: ['vendor-bills'] });
      qc.invalidateQueries({ queryKey: ['bank-accounts'] });
      qc.invalidateQueries({ queryKey: ['finance-accounts'] });
      setPaymentTarget(null);
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? err.response?.data?.message ?? 'Failed to record payment'),
  });

  const vendorColumns = [
    { key: 'vendorCode', label: 'Code' },
    { key: 'name', label: 'Name' },
    { key: 'contactPerson', label: 'Contact', render: (v) => v || <span className="text-gray-400">—</span> },
    { key: 'phone', label: 'Phone', render: (v) => v || <span className="text-gray-400">—</span> },
    { key: 'paymentTermsDays', label: 'Terms', render: (v) => `${v} days` },
  ];

  const billColumns = [
    { key: 'billNumber', label: 'Bill #' },
    { key: 'vendorName', label: 'Vendor' },
    { key: 'billDate', label: 'Date' },
    { key: 'total', label: 'Total', render: (v) => <span className="tabular-nums">{fmt(v)}</span> },
    { key: 'balance', label: 'Outstanding', render: (v) => <span className="font-semibold tabular-nums">{fmt(v)}</span> },
    { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v} /> },
    {
      key: 'id', label: '', render: (_, row) => (
        row.status !== 'PAID' && row.status !== 'CANCELLED' ? (
          <button onClick={() => setPaymentTarget(row)} className="rounded bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100">
            Record Payment
          </button>
        ) : null
      ),
    },
  ];

  return (
    <Layout title="Accounts Payable">
      <div className="mb-4 flex gap-2">
        <button onClick={() => setTab('bills')}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === 'bills' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
          Vendor Bills
        </button>
        <button onClick={() => setTab('vendors')}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === 'vendors' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
          Vendors
        </button>
      </div>

      {tab === 'bills' ? (
        <DataTable
          columns={billColumns}
          data={bills?.content || []}
          loading={isLoading}
          totalPages={bills?.totalPages || 1}
          currentPage={page}
          onPageChange={setPage}
          emptyMessage="No vendor bills yet"
          actions={<button onClick={() => setShowNewBill(true)} className="btn-primary ml-auto">+ New Bill</button>}
        />
      ) : (
        <DataTable
          columns={vendorColumns}
          data={vendors}
          loading={false}
          emptyMessage="No vendors yet"
          actions={<button onClick={() => setShowNewVendor(true)} className="btn-primary ml-auto">+ New Vendor</button>}
        />
      )}

      {showNewVendor && (
        <NewVendorModal
          isPending={createVendorMutation.isPending}
          onClose={() => setShowNewVendor(false)}
          onSubmit={(d) => createVendorMutation.mutate(d)}
        />
      )}
      {showNewBill && (
        <NewBillModal
          vendors={vendors}
          expenseAccounts={expenseAccounts}
          isPending={createBillMutation.isPending}
          onClose={() => setShowNewBill(false)}
          onSubmit={(d) => createBillMutation.mutate(d)}
        />
      )}
      {paymentTarget && (
        <RecordPaymentModal
          bill={paymentTarget}
          bankAccounts={bankAccounts}
          isPending={paymentMutation.isPending}
          onClose={() => setPaymentTarget(null)}
          onSubmit={(d) => paymentMutation.mutate({ billId: paymentTarget.id, data: d })}
        />
      )}
    </Layout>
  );
}

export default withAuth(PayablePage, ['SUPER_ADMIN', 'SALES_MANAGER', 'FINANCE_USER'], 'MOD_FIN_PAYABLE', 'FINANCE');
