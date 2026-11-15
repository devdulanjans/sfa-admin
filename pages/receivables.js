import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import PaymentModal, { methodLabel } from '../components/PaymentModal';
import { InvoiceStatus } from '../components/StatusBadge';
import { withAuth } from '../lib/auth';
import { balanceApi } from '../lib/api';
import { formatAmount } from '../lib/format';

const lkr = (v) => 'LKR ' + formatAmount(v);
const errText = (err, fallback) => err.response?.data?.detail ?? err.response?.data?.message ?? fallback;

function daysOverdue(due) {
  if (!due) return 0;
  const d = Math.floor((Date.now() - new Date(due + 'T00:00:00').getTime()) / 86400000);
  return d > 0 ? d : 0;
}

/** One customer's open invoices and payment history, with "Receive payment". */
function Statement({ customerId, onClose }) {
  const qc = useQueryClient();
  const [paying, setPaying] = useState(false);
  const [selected, setSelected] = useState([]);

  const { data: st, isLoading } = useQuery({
    queryKey: ['balances', 'statement', customerId],
    queryFn: () => balanceApi.statement(customerId).then((r) => r.data),
  });

  const receive = useMutation({
    mutationFn: (data) => balanceApi.receive(customerId, { ...data, invoiceIds: selected.length ? selected : null }),
    onSuccess: (res) => {
      const r = res.data;
      toast.success(`Receipt ${r.receiptNumber}: LKR ${formatAmount(r.amount)} applied to ${r.allocations.length} invoice${r.allocations.length === 1 ? '' : 's'}`);
      setPaying(false);
      setSelected([]);
      qc.invalidateQueries({ queryKey: ['balances'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (err) => toast.error(errText(err, 'Failed to record the payment')),
  });

  const open = st?.openInvoices ?? [];
  const owedSelected = selected.length
    ? open.filter((i) => selected.includes(i.id)).reduce((s, i) => s + Number(i.balance), 0)
    : Number(st?.balance ?? 0);
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{st?.customerName ?? 'Customer'}</h2>
            <p className="text-xs text-gray-500">
              {[st?.customerCode, st?.phone].filter(Boolean).join(' · ')}
              {st?.creditDays ? ` · ${st.creditDays} days credit` : ''}
              {st?.creditLimit ? ` · limit ${lkr(st.creditLimit)}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        {isLoading ? (
          <p className="mt-6 text-sm text-gray-500">Loading…</p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-end gap-6">
              <div>
                <p className="text-xs text-gray-500">Balance owed</p>
                <p className="text-xl font-bold tabular-nums">{lkr(st.balance)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Overdue</p>
                <p className={`text-xl font-bold tabular-nums ${Number(st.overdue) > 0 ? 'text-red-700' : 'text-gray-400'}`}>{lkr(st.overdue)}</p>
              </div>
              <div className="flex-1" />
              {open.length > 0 && (
                <button className="btn-primary" onClick={() => setPaying(true)}>
                  {selected.length ? `Receive payment for ${selected.length} selected` : 'Receive payment'}
                </button>
              )}
            </div>

            <h3 className="mt-6 mb-2 text-sm font-semibold text-gray-700">Open invoices</h3>
            {open.length === 0 ? (
              <p className="text-sm text-gray-500">Nothing owed.</p>
            ) : (
              <>
                <p className="mb-2 text-xs text-gray-500">
                  A payment is applied to the oldest due first. Tick invoices to pay only those.
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-gray-500">
                      <th className="py-1.5 w-6"></th>
                      <th className="py-1.5">Invoice</th>
                      <th className="py-1.5">Order</th>
                      <th className="py-1.5">Issued</th>
                      <th className="py-1.5">Due</th>
                      <th className="py-1.5 text-right">Total</th>
                      <th className="py-1.5 text-right">Paid</th>
                      <th className="py-1.5 text-right">Balance</th>
                      <th className="py-1.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {open.map((i) => (
                      <tr key={i.id} className="border-b border-gray-50">
                        <td className="py-1.5"><input type="checkbox" checked={selected.includes(i.id)} onChange={() => toggle(i.id)} /></td>
                        <td className="py-1.5 font-mono"><Link href={`/invoices/${i.id}`} className="text-brand-600 hover:underline">{i.invoiceNumber}</Link></td>
                        <td className="py-1.5 font-mono text-xs">{i.orderId ? <Link href={`/orders/${i.orderId}`} className="hover:underline">{i.orderNumber}</Link> : '—'}</td>
                        <td className="py-1.5">{i.issuedDate}</td>
                        <td className={`py-1.5 ${i.overdue ? 'text-red-700' : ''}`}>
                          {i.dueDate || '—'}
                          {i.overdue && <span className="ml-1 text-[11px]">({daysOverdue(i.dueDate)}d)</span>}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{formatAmount(i.total)}</td>
                        <td className="py-1.5 text-right tabular-nums">{formatAmount(i.paidAmount)}</td>
                        <td className="py-1.5 text-right tabular-nums font-semibold">{formatAmount(i.balance)}</td>
                        <td className="py-1.5"><InvoiceStatus inv={i} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <h3 className="mt-6 mb-2 text-sm font-semibold text-gray-700">Payments received</h3>
            {st.payments.length === 0 ? (
              <p className="text-sm text-gray-500">No payments yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-gray-500">
                    <th className="py-1.5">Date</th>
                    <th className="py-1.5">Receipt</th>
                    <th className="py-1.5">Invoice</th>
                    <th className="py-1.5">Method</th>
                    <th className="py-1.5">Reference</th>
                    <th className="py-1.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {st.payments.map((p) => (
                    <tr key={p.id} className={`border-b border-gray-50 ${p.voided ? 'text-gray-400 line-through' : ''}`} title={p.voided ? `Void: ${p.voidReason}` : undefined}>
                      <td className="py-1.5">{p.paymentDate}</td>
                      <td className="py-1.5 font-mono text-xs">{p.receiptNumber || '—'}</td>
                      <td className="py-1.5 font-mono text-xs"><Link href={`/invoices/${p.invoiceId}`} className="hover:underline">{p.invoiceNumber}</Link></td>
                      <td className="py-1.5">{methodLabel(p.paymentMethod)}</td>
                      <td className="py-1.5">{p.referenceNumber || '—'}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatAmount(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {paying && st && (
          <PaymentModal
            title={`Receive payment — ${st.customerName}`}
            subtitle={selected.length ? `For ${selected.length} selected invoice${selected.length === 1 ? '' : 's'}` : 'Applied to the oldest due invoices first'}
            maxAmount={owedSelected}
            isPending={receive.isPending}
            onClose={() => setPaying(false)}
            onSubmit={(d) => receive.mutate(d)}
          />
        )}
      </div>
    </div>
  );
}

function ReceivablesPage() {
  const [customerId, setCustomerId] = useState(null);
  const [search, setSearch] = useState('');
  const [onlyOverdue, setOnlyOverdue] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['balances', 'customers'],
    queryFn: () => balanceApi.customers().then((r) => r.data),
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.customers ?? []).filter((c) =>
      (!onlyOverdue || Number(c.overdue) > 0)
      && (!q || [c.customerName, c.customerCode, c.phone].some((v) => v && v.toLowerCase().includes(q))));
  }, [data, search, onlyOverdue]);

  const t = data?.totals;

  return (
    <Layout title="Customer Balances">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="Total owed" value={t ? lkr(t.balance) : '—'} />
        <Card label="Overdue" value={t ? lkr(t.overdue) : '—'} tone={t && Number(t.overdue) > 0 ? 'red' : undefined} />
        <Card label="Customers owing" value={t?.customers ?? '—'} />
        <Card label="Unpaid invoices" value={t?.openInvoices ?? '—'} />
      </div>

      <div className="mt-4 card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 px-4 py-3">
          <input className="input-base max-w-xs" placeholder="Search customer, code or phone…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} />
            Overdue only
          </label>
        </div>
        {isLoading ? (
          <p className="p-6 text-sm text-gray-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">{data?.customers?.length ? 'No customers match.' : 'No customer owes anything right now.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs font-semibold uppercase text-gray-500">
                  <th className="px-4 py-2">Customer</th>
                  <th className="px-4 py-2 text-right">Unpaid invoices</th>
                  <th className="px-4 py-2">Oldest due</th>
                  <th className="px-4 py-2 text-right">Overdue</th>
                  <th className="px-4 py-2 text-right">Balance</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((c) => (
                  <tr key={c.customerId} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <button className="font-medium text-brand-700 hover:underline" onClick={() => setCustomerId(c.customerId)}>{c.customerName}</button>
                      <div className="text-xs text-gray-500">{[c.customerCode, c.phone].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{c.openInvoices}</td>
                    <td className="px-4 py-2.5">
                      {c.oldestDue || '—'}
                      {daysOverdue(c.oldestDue) > 0 && <span className="ml-1 text-xs text-red-700">{daysOverdue(c.oldestDue)} days late</span>}
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${Number(c.overdue) > 0 ? 'text-red-700 font-medium' : 'text-gray-400'}`}>{formatAmount(c.overdue)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{formatAmount(c.balance)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button className="rounded bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100"
                        onClick={() => setCustomerId(c.customerId)}>Statement / receive</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {customerId && <Statement customerId={customerId} onClose={() => setCustomerId(null)} />}
    </Layout>
  );
}

function Card({ label, value, tone }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${tone === 'red' ? 'text-red-700' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

export default withAuth(ReceivablesPage, ['SALES_MANAGER', 'FINANCE_USER'], 'MOD_INVOICES', 'SFA');
