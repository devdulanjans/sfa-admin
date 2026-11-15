import { useRouter } from 'next/router';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import StatusBadge, { InvoiceStatus } from '../../components/StatusBadge';
import { ReasonModal } from '../../components/PaymentModal';
import { withAuth, useAuth } from '../../lib/auth';
import { orderApi, invoiceApi } from '../../lib/api';
import toast from 'react-hot-toast';
import { formatAmount } from '../../lib/format';
import SendToCustomerModal from '../../components/SendToCustomerModal';

const qtyText = (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
const errText = (err, fallback) => err.response?.data?.detail ?? err.response?.data?.message ?? fallback;

/** Choose how much of each line to invoice now — the rest stays open for a later invoice. */
function CreateInvoiceModal({ order, onClose, onSubmit, isPending }) {
  const open = (order.items || []).filter((i) => Number(i.remainingQty) > 0);
  const [qty, setQty] = useState(() => Object.fromEntries(open.map((i) => [i.id, String(Number(i.remainingQty))])));
  const [notes, setNotes] = useState('');

  const lineAmount = (i) => {
    const q = Number(qty[i.id] || 0);
    return Number(i.quantity) ? (Number(i.lineTotal) * q) / Number(i.quantity) : 0;
  };
  const total = open.reduce((s, i) => s + lineAmount(i), 0);
  const errors = open.filter((i) => Number(qty[i.id] || 0) < 0 || Number(qty[i.id] || 0) > Number(i.remainingQty));
  const chosen = open.filter((i) => Number(qty[i.id] || 0) > 0);
  const everything = chosen.length === open.length && open.every((i) => Number(qty[i.id]) === Number(i.remainingQty));

  const setAll = (fn) => setQty(Object.fromEntries(open.map((i) => [i.id, fn(i)])));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-base font-semibold text-gray-900">Create invoice — {order.orderNumber}</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          Invoice what's being delivered now. Anything you leave out stays on the order to invoice later.
        </p>
        <div className="mt-3 flex gap-2 text-xs">
          <button className="btn-secondary !py-1 !px-2 text-xs" onClick={() => setAll((i) => String(Number(i.remainingQty)))}>All remaining</button>
          <button className="btn-secondary !py-1 !px-2 text-xs" onClick={() => setAll(() => '0')}>Clear</button>
        </div>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-gray-500">
              <th className="py-1.5">Product</th>
              <th className="py-1.5 text-right">Ordered</th>
              <th className="py-1.5 text-right">Invoiced</th>
              <th className="py-1.5 text-right">Left</th>
              <th className="py-1.5 text-right w-28">Invoice now</th>
              <th className="py-1.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {open.map((i) => {
              const bad = errors.includes(i);
              return (
                <tr key={i.id} className="border-b border-gray-50">
                  <td className="py-1.5">
                    {i.product?.name}
                    {i.priceSource === 'FREE_PRODUCT' && <span className="ml-1 badge-green">FREE</span>}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{qtyText(i.quantity)}</td>
                  <td className="py-1.5 text-right tabular-nums text-gray-500">{qtyText(i.invoicedQty)}</td>
                  <td className="py-1.5 text-right tabular-nums">{qtyText(i.remainingQty)}</td>
                  <td className="py-1.5 text-right">
                    <input type="number" min="0" max={Number(i.remainingQty)} step="any"
                      className={`input !py-1 text-right ${bad ? '!border-red-400' : ''}`}
                      value={qty[i.id] ?? ''} onChange={(e) => setQty((q) => ({ ...q, [i.id]: e.target.value }))} />
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{formatAmount(lineAmount(i))}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td colSpan={5} className="py-2 text-right text-gray-600">Invoice total (approx.)</td>
              <td className="py-2 text-right tabular-nums">LKR {formatAmount(total)}</td>
            </tr>
          </tfoot>
        </table>
        {errors.length > 0 && <p className="text-xs text-red-600">A quantity is more than what's left on that line.</p>}
        <label className="label mt-3">Note on the invoice (optional)</label>
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. First delivery" />
        <div className="mt-4 flex gap-2">
          <button className="btn-primary flex-1 disabled:opacity-50" disabled={isPending || errors.length > 0 || chosen.length === 0}
            onClick={() => onSubmit(everything && !notes.trim() ? undefined : {
              lines: chosen.map((i) => ({ orderItemId: i.id, quantity: Number(qty[i.id]) })),
              notes: notes.trim() || null,
            })}>
            {isPending ? 'Creating…' : everything ? 'Invoice everything left' : `Invoice ${chosen.length} line${chosen.length === 1 ? '' : 's'}`}
          </button>
          <button className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function OrderDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const [showClose, setShowClose] = useState(false);

  async function exportDetails() {
    setExporting(true);
    try {
      const { data } = await orderApi.exportDetails(id);
      const url = URL.createObjectURL(new Blob([data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `order-${order?.orderNumber || id}-details.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Exported order details');
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  }

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => orderApi.getById(id).then(r => r.data),
    enabled: !!id,
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['order-invoices', id],
    queryFn: () => invoiceApi.forOrder(id).then(r => r.data),
    enabled: !!id && !!order && !['DRAFT', 'SUBMITTED', 'CANCELLED'].includes(order.status),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['order', id] });
    qc.invalidateQueries({ queryKey: ['order-invoices', id] });
  };

  const approveMutation = useMutation({
    mutationFn: () => orderApi.approve(id),
    onSuccess: () => { toast.success('Order approved'); refresh(); },
    onError: (err) => toast.error(errText(err, 'Approval failed')),
  });

  const cancelMutation = useMutation({
    mutationFn: () => orderApi.cancel(id),
    onSuccess: () => { toast.success('Order cancelled'); refresh(); },
    onError: (err) => toast.error(errText(err, 'Cancel failed')),
  });

  const invoiceMutation = useMutation({
    mutationFn: (data) => invoiceApi.generate(id, data),
    onSuccess: (res) => {
      toast.success(`Invoice ${res.data.invoiceNumber} created`);
      setShowInvoice(false);
      refresh();
    },
    onError: (err) => toast.error(errText(err, 'Invoice generation failed')),
  });

  const closeMutation = useMutation({
    mutationFn: (reason) => orderApi.closeBalance(id, reason),
    onSuccess: () => { toast.success('Remaining balance closed'); setShowClose(false); refresh(); },
    onError: (err) => toast.error(errText(err, 'Could not close the balance')),
  });

  if (isLoading) {
    return (
      <Layout title="Order">
        <div className="card p-8 animate-pulse h-64" />
      </Layout>
    );
  }

  if (!order) return <Layout title="Order"><p className="text-gray-500">Order not found.</p></Layout>;

  // Channel owners (ADMIN) inherit SALES_MANAGER, as on the backend.
  const isManager = hasRole('SUPER_ADMIN', 'ADMIN', 'SALES_MANAGER');
  const canBill   = isManager || hasRole('FINANCE_USER');
  const canApprove = isManager && order.status === 'SUBMITTED';
  const canCancel  = isManager && ['SUBMITTED', 'APPROVED'].includes(order.status);
  const canInvoice = canBill && ['APPROVED', 'PARTIALLY_INVOICED'].includes(order.status);
  const canClose   = canBill && order.status === 'PARTIALLY_INVOICED';
  const showProgress = ['APPROVED', 'PARTIALLY_INVOICED', 'INVOICED'].includes(order.status);

  const live = invoices.filter((i) => i.status !== 'CANCELLED');
  const invoicedTotal = live.reduce((s, i) => s + Number(i.total), 0);
  const paidTotal = live.reduce((s, i) => s + Number(i.paidAmount || 0), 0);
  const balanceTotal = live.reduce((s, i) => s + Number(i.balance || 0), 0);
  const leftToInvoice = (order.items || []).reduce((s, i) =>
    s + (Number(i.quantity) ? Number(i.lineTotal) * Number(i.remainingQty) / Number(i.quantity) : 0), 0);

  return (
    <Layout title={`Order ${order.orderNumber}`}>
      <div className="max-w-4xl space-y-5">
        {/* Header card */}
        <div className="card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-500 mb-1">Order Number</p>
              <h2 className="text-xl font-bold text-gray-900 font-mono">{order.orderNumber}</h2>
            </div>
            <StatusBadge status={order.status} />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div><dt className="text-gray-500">Customer</dt><dd className="font-medium">{order.customer?.name}</dd></div>
            <div><dt className="text-gray-500">Sales Rep</dt><dd className="font-medium">{order.salesRep?.fullName}</dd></div>
            <div><dt className="text-gray-500">Order Date</dt><dd>{order.orderDate ? new Date(order.orderDate).toLocaleDateString() : '—'}</dd></div>
            {order.poNumber && <div><dt className="text-gray-500">PO Number</dt><dd className="font-mono">{order.poNumber}</dd></div>}
            {order.approvedBy && <div><dt className="text-gray-500">Approved By</dt><dd>{order.approvedBy?.fullName}</dd></div>}
            {order.notes && <div className="col-span-2"><dt className="text-gray-500">Notes</dt><dd>{order.notes}</dd></div>}
          </dl>
          {showProgress && (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Invoiced" value={invoicedTotal} />
              <Stat label="Left to invoice" value={leftToInvoice} tone={leftToInvoice > 0.004 ? 'amber' : undefined} />
              <Stat label="Paid" value={paidTotal} tone="green" />
              <Stat label="Balance due" value={balanceTotal} tone={balanceTotal > 0.004 ? 'red' : undefined} />
            </div>
          )}
        </div>

        {/* Line items */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700">Items</h3>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
                <th className="px-4 py-2 text-left">Product</th>
                <th className="px-4 py-2 text-right">Qty</th>
                {showProgress && <th className="px-4 py-2 text-right">Invoiced</th>}
                {showProgress && <th className="px-4 py-2 text-right">Left</th>}
                <th className="px-4 py-2 text-right">Unit Price</th>
                <th className="px-4 py-2 text-right">Discount</th>
                <th className="px-4 py-2 text-right">Tax</th>
                <th className="px-4 py-2 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(order.items || []).map(item => (
                <tr key={item.id} className="text-sm">
                  <td className="px-4 py-2.5 font-medium">
                    {item.product?.name}
                    {item.priceSource === 'FREE_PRODUCT' && <span className="ml-1 badge-green">FREE</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{qtyText(item.quantity)}</td>
                  {showProgress && <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{qtyText(item.invoicedQty)}</td>}
                  {showProgress && (
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {Number(item.remainingQty) > 0
                        ? <span className="font-medium text-amber-700">{qtyText(item.remainingQty)}</span>
                        : <span className="text-gray-400">0</span>}
                      {Number(item.closedQty) > 0 && (
                        <div className="text-[11px] text-gray-400">{qtyText(item.closedQty)} closed</div>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-right tabular-nums">LKR {formatAmount(item.unitPrice)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-amber-600">
                    {item.discountPct > 0 ? `${item.discountPct}%` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">LKR {formatAmount(item.taxAmount)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">LKR {formatAmount(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-gray-200 bg-gray-50">
              <tr className="text-sm font-semibold">
                <td colSpan={showProgress ? 7 : 5} className="px-4 py-2.5 text-right text-gray-600">Subtotal</td>
                <td className="px-4 py-2.5 text-right tabular-nums">LKR {formatAmount(order.subtotal)}</td>
              </tr>
              <tr className="text-sm font-semibold">
                <td colSpan={showProgress ? 7 : 5} className="px-4 py-2.5 text-right text-gray-600">Tax Total</td>
                <td className="px-4 py-2.5 text-right tabular-nums">LKR {formatAmount(order.taxAmount)}</td>
              </tr>
              <tr className="text-base font-bold text-brand-700">
                <td colSpan={showProgress ? 7 : 5} className="px-4 py-3 text-right">Total</td>
                <td className="px-4 py-3 text-right tabular-nums">LKR {formatAmount(order.total)}</td>
              </tr>
            </tfoot>
          </table>
          </div>
        </div>

        {/* Invoices raised for this order */}
        {invoices.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700">Invoices for this order</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
                  <th className="px-4 py-2 text-left">Invoice</th>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Due</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2 text-right">Paid</th>
                  <th className="px-4 py-2 text-right">Balance</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className={inv.status === 'CANCELLED' ? 'text-gray-400' : ''}>
                    <td className="px-4 py-2 font-mono">
                      <Link href={`/invoices/${inv.id}`} className="text-brand-600 hover:underline">{inv.invoiceNumber}</Link>
                    </td>
                    <td className="px-4 py-2">{inv.issuedDate}</td>
                    <td className="px-4 py-2">{inv.dueDate || '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatAmount(inv.total)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatAmount(inv.paidAmount)}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">{formatAmount(inv.balance)}</td>
                    <td className="px-4 py-2"><InvoiceStatus inv={inv} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3">
          {canApprove && (
            <button className="btn-primary" onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
              {approveMutation.isPending ? 'Approving…' : 'Approve Order'}
            </button>
          )}
          {canInvoice && (
            <button className="btn-primary" onClick={() => setShowInvoice(true)}>
              {order.status === 'PARTIALLY_INVOICED' ? 'Invoice remaining items' : 'Create Invoice'}
            </button>
          )}
          {canClose && (
            <button className="btn-secondary" onClick={() => setShowClose(true)}>Close remaining balance</button>
          )}
          {canCancel && (
            <button className="btn-danger" onClick={() => { if (confirm('Cancel this order?')) cancelMutation.mutate(); }}
              disabled={cancelMutation.isPending}>
              {cancelMutation.isPending ? 'Cancelling…' : 'Cancel Order'}
            </button>
          )}
          {order.status !== 'DRAFT' && order.status !== 'CANCELLED' && (
            <button className="btn-secondary" onClick={() => setShowSend(true)}>
              ✉ Send to Customer
            </button>
          )}
          <button className="btn-secondary" onClick={exportDetails} disabled={exporting}>
            {exporting ? 'Exporting…' : '⬇ Export Excel (full detail)'}
          </button>
          <button className="btn-secondary" onClick={() => router.back()}>Back</button>
        </div>
        {showSend && (
          <SendToCustomerModal
            type="order"
            id={id}
            number={order.orderNumber}
            onClose={() => setShowSend(false)}
          />
        )}
        {showInvoice && (
          <CreateInvoiceModal
            order={order}
            isPending={invoiceMutation.isPending}
            onClose={() => setShowInvoice(false)}
            onSubmit={(data) => invoiceMutation.mutate(data)}
          />
        )}
        {showClose && (
          <ReasonModal
            title="Close the remaining balance?"
            message="What's still left to invoice won't be supplied. It's taken off the order and its stock goes back. The invoices already raised aren't changed."
            confirmLabel="Close balance"
            requireReason={false}
            isPending={closeMutation.isPending}
            onClose={() => setShowClose(false)}
            onConfirm={(reason) => closeMutation.mutate(reason)}
          />
        )}
      </div>
    </Layout>
  );
}

function Stat({ label, value, tone }) {
  const color = tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : tone === 'green' ? 'text-green-700' : 'text-gray-900';
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`font-semibold tabular-nums ${color}`}>LKR {formatAmount(value)}</p>
    </div>
  );
}

export default withAuth(OrderDetailPage, [], 'MOD_ORDERS', 'SFA');
