import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import { withAuth } from '../../lib/auth';
import { chartOfAccountsApi, journalEntryApi } from '../../lib/api';
import toast from 'react-hot-toast';
import { formatAmount } from '../../lib/format';

const fmt = (v) => formatAmount(v);

const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

function NewAccountModal({ accounts, onClose, onSubmit, isPending }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { accountCode: '', accountName: '', accountType: 'EXPENSE', parentAccountId: '' },
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="mb-4 text-base font-semibold text-gray-900">New Account</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <label className="label">Account Code <span className="text-red-500">*</span></label>
            <input className="input" {...register('accountCode', { required: true })} />
          </div>
          <div>
            <label className="label">Account Name <span className="text-red-500">*</span></label>
            <input className="input" {...register('accountName', { required: true })} />
            {errors.accountName && <p className="mt-1 text-xs text-red-500">Required</p>}
          </div>
          <div>
            <label className="label">Type <span className="text-red-500">*</span></label>
            <select className="input" {...register('accountType', { required: true })}>
              {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Parent Account</label>
            <select className="input" {...register('parentAccountId')}>
              <option value="">None</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.accountCode} — {a.accountName}</option>)}
            </select>
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

function NewJournalEntryModal({ accounts, onClose, onSubmit, isPending }) {
  const { register, control, handleSubmit } = useForm({
    defaultValues: {
      entryDate: new Date().toISOString().slice(0, 10),
      description: '',
      lines: [{ accountId: '', debit: '', credit: '', description: '' }, { accountId: '', debit: '', credit: '', description: '' }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="mb-4 text-base font-semibold text-gray-900">New Manual Journal Entry</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date <span className="text-red-500">*</span></label>
              <input type="date" className="input" {...register('entryDate', { required: true })} />
            </div>
            <div>
              <label className="label">Description</label>
              <input className="input" {...register('description')} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="label">Lines</label>
            {fields.map((field, idx) => (
              <div key={field.id} className="grid grid-cols-12 gap-2 items-center">
                <select className="input col-span-5" {...register(`lines.${idx}.accountId`, { required: true })}>
                  <option value="">Select account…</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.accountCode} — {a.accountName}</option>)}
                </select>
                <input type="number" step="0.01" placeholder="Debit" className="input col-span-2" {...register(`lines.${idx}.debit`)} />
                <input type="number" step="0.01" placeholder="Credit" className="input col-span-2" {...register(`lines.${idx}.credit`)} />
                <input placeholder="Note" className="input col-span-2" {...register(`lines.${idx}.description`)} />
                <button type="button" onClick={() => remove(idx)} className="col-span-1 text-red-500 text-xs">✕</button>
              </div>
            ))}
            <button type="button" onClick={() => append({ accountId: '', debit: '', credit: '', description: '' })}
              className="text-xs font-medium text-brand-600 hover:text-brand-700">+ Add line</button>
          </div>

          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={isPending} className="btn-primary flex-1 disabled:opacity-50">
              {isPending ? 'Posting…' : 'Post Entry'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LedgerDrilldown({ account, onClose }) {
  const { data: lines = [], isLoading } = useQuery({
    queryKey: ['finance-account-ledger', account.id],
    queryFn: () => chartOfAccountsApi.ledger(account.id).then(r => r.data),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl max-h-[80vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">{account.accountCode} — {account.accountName}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : lines.length === 0 ? (
          <p className="text-sm text-gray-500">No postings yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="py-1.5">Description</th>
                <th className="py-1.5 text-right">Debit</th>
                <th className="py-1.5 text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(l => (
                <tr key={l.id} className="border-b border-gray-50">
                  <td className="py-1.5">{l.description}</td>
                  <td className="py-1.5 text-right tabular-nums">{l.debitAmount > 0 ? fmt(l.debitAmount) : ''}</td>
                  <td className="py-1.5 text-right tabular-nums">{l.creditAmount > 0 ? fmt(l.creditAmount) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function GeneralLedgerPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('accounts');
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [showNewEntry, setShowNewEntry] = useState(false);
  const [drilldownAccount, setDrilldownAccount] = useState(null);
  const [page, setPage] = useState(0);

  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ['finance-accounts'],
    queryFn: () => chartOfAccountsApi.list().then(r => r.data),
  });

  const { data: entries, isLoading: entriesLoading } = useQuery({
    queryKey: ['finance-journal-entries', page],
    queryFn: () => journalEntryApi.list({ page, size: 20 }).then(r => r.data),
    keepPreviousData: true,
    enabled: tab === 'entries',
  });

  const createAccountMutation = useMutation({
    mutationFn: (data) => chartOfAccountsApi.create({ ...data, parentAccountId: data.parentAccountId || null }),
    onSuccess: () => {
      toast.success('Account created');
      qc.invalidateQueries({ queryKey: ['finance-accounts'] });
      setShowNewAccount(false);
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? err.response?.data?.message ?? 'Failed to create account'),
  });

  const createEntryMutation = useMutation({
    mutationFn: (data) => journalEntryApi.create({
      entryDate: data.entryDate,
      description: data.description,
      lines: data.lines
        .filter(l => l.accountId)
        .map(l => ({
          accountId: l.accountId,
          debit: l.debit ? parseFloat(l.debit) : null,
          credit: l.credit ? parseFloat(l.credit) : null,
          description: l.description,
        })),
    }),
    onSuccess: () => {
      toast.success('Journal entry posted');
      qc.invalidateQueries({ queryKey: ['finance-accounts'] });
      qc.invalidateQueries({ queryKey: ['finance-journal-entries'] });
      setShowNewEntry(false);
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? err.response?.data?.message ?? 'Journal entry does not balance'),
  });

  const accountColumns = [
    { key: 'accountCode', label: 'Code' },
    { key: 'accountName', label: 'Name', render: (v, row) => (
      <button className="text-brand-600 hover:underline" onClick={() => setDrilldownAccount(row)}>{v}</button>
    ) },
    { key: 'accountType', label: 'Type' },
    { key: 'balance', label: 'Balance', render: (v) => <span className="font-semibold tabular-nums">{fmt(v)}</span> },
    { key: 'active', label: 'Status', render: (v) => v
        ? <span className="text-xs text-green-700">Active</span>
        : <span className="text-xs text-gray-400">Inactive</span> },
  ];

  const entryColumns = [
    { key: 'entryNumber', label: 'Entry #' },
    { key: 'entryDate', label: 'Date' },
    { key: 'description', label: 'Description' },
    { key: 'sourceType', label: 'Source' },
    { key: 'status', label: 'Status' },
    { key: 'lines', label: 'Total', render: (lines) => (
      <span className="tabular-nums">{fmt((lines || []).reduce((sum, l) => sum + Number(l.debitAmount || 0), 0))}</span>
    ) },
  ];

  return (
    <Layout title="General Ledger">
      <div className="mb-4 flex gap-2">
        <button onClick={() => setTab('accounts')}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === 'accounts' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
          Chart of Accounts
        </button>
        <button onClick={() => setTab('entries')}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === 'entries' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
          Journal Entries
        </button>
      </div>

      {tab === 'accounts' ? (
        <DataTable
          columns={accountColumns}
          data={accounts}
          loading={accountsLoading}
          emptyMessage="No accounts yet"
          actions={<button onClick={() => setShowNewAccount(true)} className="btn-primary ml-auto">+ New Account</button>}
        />
      ) : (
        <DataTable
          columns={entryColumns}
          data={entries?.content || []}
          loading={entriesLoading}
          totalPages={entries?.totalPages || 1}
          currentPage={page}
          onPageChange={setPage}
          emptyMessage="No journal entries yet"
          actions={<button onClick={() => setShowNewEntry(true)} className="btn-primary ml-auto">+ New Journal Entry</button>}
        />
      )}

      {showNewAccount && (
        <NewAccountModal
          accounts={accounts}
          isPending={createAccountMutation.isPending}
          onClose={() => setShowNewAccount(false)}
          onSubmit={(d) => createAccountMutation.mutate(d)}
        />
      )}
      {showNewEntry && (
        <NewJournalEntryModal
          accounts={accounts}
          isPending={createEntryMutation.isPending}
          onClose={() => setShowNewEntry(false)}
          onSubmit={(d) => createEntryMutation.mutate(d)}
        />
      )}
      {drilldownAccount && (
        <LedgerDrilldown account={drilldownAccount} onClose={() => setDrilldownAccount(null)} />
      )}
    </Layout>
  );
}

export default withAuth(GeneralLedgerPage, ['SUPER_ADMIN', 'FINANCE_USER'], 'MOD_FIN_LEDGER', 'FINANCE');
