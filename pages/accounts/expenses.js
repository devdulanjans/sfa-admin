import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import { withAuth } from '../../lib/auth';
import { expenseApi } from '../../lib/api';
import toast from 'react-hot-toast';
import { formatAmount } from '../../lib/format';

const fmt = (v) => formatAmount(v);

const CATEGORY_LABELS = {
  PURCHASES:   'Purchases / COGS',
  RENT:        'Rent',
  UTILITIES:   'Utilities',
  SALARIES:    'Salaries',
  TRANSPORT:   'Transport',
  MARKETING:   'Marketing',
  MAINTENANCE: 'Maintenance',
  OTHER:       'Other',
};

const CATEGORY_BADGE = {
  PURCHASES:   'bg-blue-50 text-blue-700 border-blue-200',
  RENT:        'bg-purple-50 text-purple-700 border-purple-200',
  UTILITIES:   'bg-amber-50 text-amber-700 border-amber-200',
  SALARIES:    'bg-green-50 text-green-700 border-green-200',
  TRANSPORT:   'bg-cyan-50 text-cyan-700 border-cyan-200',
  MARKETING:   'bg-pink-50 text-pink-700 border-pink-200',
  MAINTENANCE: 'bg-orange-50 text-orange-700 border-orange-200',
  OTHER:       'bg-gray-50 text-gray-600 border-gray-200',
};

function CategoryBadge({ category }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${CATEGORY_BADGE[category] || CATEGORY_BADGE.OTHER}`}>
      {CATEGORY_LABELS[category] || category}
    </span>
  );
}

function ExpenseFormModal({ editing, categories, onSubmit, onClose, isPending }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: editing
      ? { category: editing.category, amount: editing.amount, expenseDate: editing.expenseDate, description: editing.description ?? '' }
      : { category: categories[0] ?? '', amount: '', expenseDate: new Date().toISOString().slice(0, 10), description: '' },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="mb-4 text-base font-semibold text-gray-900">{editing ? 'Edit Expense' : 'New Expense'}</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <label className="label">Category <span className="text-red-500">*</span></label>
            <select className="input" {...register('category', { required: true })}>
              {categories.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Amount (LKR) <span className="text-red-500">*</span></label>
            <input type="number" step="0.01" min="0.01" className="input"
              {...register('amount', { required: 'Amount is required', min: { value: 0.01, message: 'Must be greater than zero' } })} />
            {errors.amount && <p className="mt-1 text-xs text-red-500">{errors.amount.message}</p>}
          </div>
          <div>
            <label className="label">Date <span className="text-red-500">*</span></label>
            <input type="date" className="input" {...register('expenseDate', { required: 'Date is required' })} />
            {errors.expenseDate && <p className="mt-1 text-xs text-red-500">{errors.expenseDate.message}</p>}
          </div>
          <div>
            <label className="label">Description</label>
            <input className="input" placeholder="Optional note" {...register('description')} />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={isPending} className="btn-primary flex-1 disabled:opacity-50">
              {isPending ? 'Saving…' : (editing ? 'Update' : 'Create')}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ExpensesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const [category, setCategory] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const { data: categories = [] } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => expenseApi.categories().then(r => r.data),
  });

  const params = { category: category || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, page, size: 20 };
  const { data, isLoading } = useQuery({
    queryKey: ['expenses', params],
    queryFn: () => expenseApi.list(params).then(r => r.data),
    keepPreviousData: true,
  });

  const saveMutation = useMutation({
    mutationFn: (body) => editing ? expenseApi.update(editing.id, body) : expenseApi.create(body),
    onSuccess: () => {
      toast.success(editing ? 'Expense updated' : 'Expense recorded');
      qc.invalidateQueries({ queryKey: ['expenses'] });
      closeForm();
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? err.response?.data?.message ?? 'Failed to save expense'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => expenseApi.delete(id),
    onSuccess: () => {
      toast.success('Expense deleted');
      qc.invalidateQueries({ queryKey: ['expenses'] });
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to delete expense'),
  });

  function openCreate() { setEditing(null); setShowForm(true); }
  function openEdit(exp) { setEditing(exp); setShowForm(true); }
  function closeForm() { setShowForm(false); setEditing(null); }

  function confirmDelete(exp) {
    if (window.confirm(`Delete this ${CATEGORY_LABELS[exp.category] || exp.category} expense of LKR ${fmt(exp.amount)}?`)) {
      deleteMutation.mutate(exp.id);
    }
  }

  const columns = [
    { key: 'expenseDate', label: 'Date' },
    { key: 'category', label: 'Category', render: (v) => <CategoryBadge category={v} /> },
    { key: 'amount', label: 'Amount', render: (v) => <span className="font-semibold tabular-nums">LKR {fmt(v)}</span> },
    { key: 'description', label: 'Description', render: (v) => v || <span className="text-gray-400">—</span> },
    { key: 'recordedByName', label: 'Recorded By' },
    {
      key: 'id', label: '', render: (_, row) => (
        <div className="flex items-center justify-end gap-2">
          <button onClick={() => openEdit(row)} className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100">Edit</button>
          <button onClick={() => confirmDelete(row)} disabled={deleteMutation.isPending} className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100">Delete</button>
        </div>
      ),
    },
  ];

  return (
    <Layout title="Expenses">
      <DataTable
        columns={columns}
        data={data?.content || []}
        loading={isLoading}
        totalPages={data?.totalPages || 1}
        currentPage={page}
        onPageChange={setPage}
        emptyMessage="No expenses recorded for the selected filters"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select className="input w-44" value={category} onChange={e => { setCategory(e.target.value); setPage(0); }}>
              <option value="">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>)}
            </select>
            <input type="date" className="input w-40" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0); }} />
            <span className="text-sm text-gray-400">to</span>
            <input type="date" className="input w-40" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0); }} />
            <button onClick={openCreate} className="btn-primary ml-auto">+ New Expense</button>
          </div>
        }
      />

      {showForm && (
        <ExpenseFormModal
          editing={editing}
          categories={categories}
          isPending={saveMutation.isPending}
          onClose={closeForm}
          onSubmit={(d) => saveMutation.mutate({ ...d, amount: parseFloat(d.amount) })}
        />
      )}
    </Layout>
  );
}

export default withAuth(ExpensesPage, ['SUPER_ADMIN', 'SALES_MANAGER', 'FINANCE_USER'], 'MOD_ACC_EXPENSES', 'POS');
