import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import { withAuth } from '../lib/auth';
import { collectionApi } from '../lib/api';
import { formatAmount } from '../lib/format';
import { methodLabel } from '../components/PaymentModal';

// Payments sales reps collected on visits (V122): previous bills paid in full or in part.
// Owners check each one against the cash or cheque handed in and tick it off.
const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

function Stat({ label, value, tone }) {
  const color = tone === 'amber' ? 'text-amber-700' : tone === 'red' ? 'text-red-700' : 'text-gray-900';
  return (
    <div className="card p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function CollectionsPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const focusId = typeof router.query.id === 'string' ? router.query.id : null;
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(iso(new Date()));
  const [unreviewed, setUnreviewed] = useState(false);
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['collections', from, to, unreviewed],
    queryFn: () => collectionApi.list({ from: from || undefined, to: to || undefined, unreviewed }).then((r) => r.data),
  });

  // An alert links here with ?id= — make sure that collection is in range and visible.
  const { data: focused } = useQuery({
    queryKey: ['collection', focusId],
    queryFn: () => collectionApi.get(focusId).then((r) => r.data),
    enabled: !!focusId,
  });
  useEffect(() => {
    if (focused?.paymentDate && from && focused.paymentDate < from) setFrom(focused.paymentDate);
  }, [focused]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!focusId || !data) return;
    document.getElementById(`col-${focusId}`)?.scrollIntoView({ block: 'center' });
  }, [focusId, data]);

  const review = useMutation({
    mutationFn: ({ id, reviewed }) => collectionApi.review(id, reviewed),
    onSuccess: (_, v) => {
      toast.success(v.reviewed ? 'Marked as checked' : 'Unmarked');
      qc.invalidateQueries({ queryKey: ['collections'] });
      qc.invalidateQueries({ queryKey: ['collection'] });
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Could not update'),
  });

  const q = search.trim().toLowerCase();
  const items = (data?.items ?? []).filter((c) => !q
    || c.customerName?.toLowerCase().includes(q)
    || c.collectedByName?.toLowerCase().includes(q)
    || c.receiptNumber?.toLowerCase().includes(q)
    || c.referenceNumber?.toLowerCase().includes(q));
  const totals = data?.totals;

  return (
    <Layout title="Rep Collections">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Payments sales reps collected from customers on their visits. Each one has already been applied to
          the customer&apos;s oldest unpaid invoices. Tick it off once the cash or cheque has been handed in.
        </p>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Collections" value={totals?.count ?? '—'} />
          <Stat label="Amount collected" value={totals ? `LKR ${formatAmount(totals.amount)}` : '—'} />
          <Stat label="Not yet checked" value={totals?.unreviewed ?? '—'} tone={totals?.unreviewed ? 'amber' : undefined} />
          <Stat label="Held as advance" value={totals ? `LKR ${formatAmount(totals.unapplied)}` : '—'}
                tone={Number(totals?.unapplied) > 0 ? 'red' : undefined} />
        </div>

        <div className="card flex flex-wrap items-end gap-3 p-4">
          <div>
            <label className="label">From</label>
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="min-w-[200px] flex-1">
            <label className="label">Search</label>
            <input className="input" placeholder="Customer, rep, receipt or cheque no." value={search}
                   onChange={(e) => setSearch(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm text-gray-700">
            <input type="checkbox" checked={unreviewed} onChange={(e) => setUnreviewed(e.target.checked)} />
            Not checked only
          </label>
        </div>

        <div className="card overflow-x-auto">
          {isLoading ? (
            <p className="py-12 text-center text-gray-400">Loading…</p>
          ) : isError ? (
            <p className="py-12 text-center text-sm text-red-600">
              {error?.response?.data?.detail ?? 'Could not load collections'}
            </p>
          ) : items.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-400">No collections in this period.</p>
          ) : (
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="px-4 py-2">Collected</th>
                  <th className="px-4 py-2">Customer</th>
                  <th className="px-4 py-2">Rep</th>
                  <th className="px-4 py-2">Method</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2">Applied to</th>
                  <th className="px-4 py-2 text-right">Balance left</th>
                  <th className="px-4 py-2">Checked</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id} id={`col-${c.id}`}
                      className={`border-b border-gray-50 align-top ${c.id === focusId ? 'bg-amber-50' : ''}`}>
                    <td className="px-4 py-2.5">
                      <div>{new Date(c.collectedAt).toLocaleString()}</div>
                      <div className="font-mono text-xs text-gray-500">{c.receiptNumber}</div>
                      {c.latitude != null && c.longitude != null && (
                        <a className="text-xs text-brand-600 hover:underline" target="_blank" rel="noreferrer"
                           href={`https://www.google.com/maps?q=${c.latitude},${c.longitude}`}>Where</a>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-900">{c.customerName}</div>
                      {c.customerCode && <div className="text-xs text-gray-500">{c.customerCode}</div>}
                    </td>
                    <td className="px-4 py-2.5">{c.collectedByName}</td>
                    <td className="px-4 py-2.5">
                      {methodLabel(c.paymentMethod)}
                      {c.referenceNumber && <div className="text-xs text-gray-500">No. {c.referenceNumber}</div>}
                      {c.notes && <div className="text-xs text-gray-500">{c.notes}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="font-semibold tabular-nums">LKR {formatAmount(c.amount)}</div>
                      {c.partial && <span className="badge-amber whitespace-nowrap">part payment</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {c.invoiceNumbers || <span className="text-gray-400">—</span>}
                      {Number(c.unappliedAmount) > 0 && (
                        <div className="mt-1 text-red-700">
                          LKR {formatAmount(c.unappliedAmount)} more than owed — held as advance
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      <div className={Number(c.balanceAfter) > 0 ? 'text-amber-700' : 'text-gray-400'}>
                        LKR {formatAmount(c.balanceAfter)}
                      </div>
                      <div className="text-[11px] text-gray-400">owed now</div>
                    </td>
                    <td className="px-4 py-2.5">
                      {c.reviewedAt ? (
                        <div>
                          <span className="badge-green">Checked</span>
                          <div className="mt-0.5 text-[11px] text-gray-500">{c.reviewedByName}</div>
                          <button className="text-[11px] text-gray-500 underline"
                                  onClick={() => review.mutate({ id: c.id, reviewed: false })}>Undo</button>
                        </div>
                      ) : (
                        <button className="btn-secondary px-2.5 py-1 text-xs" disabled={review.isPending}
                                onClick={() => review.mutate({ id: c.id, reviewed: true })}>
                          Mark checked
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Layout>
  );
}

export default withAuth(CollectionsPage, ['SALES_MANAGER', 'FINANCE_USER'], 'MOD_INVOICES', 'SFA');
