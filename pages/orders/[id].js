import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import StatusBadge from '../../components/StatusBadge';
import { withAuth, useAuth } from '../../lib/auth';
import { orderApi, invoiceApi } from '../../lib/api';
import toast from 'react-hot-toast';
import { formatAmount } from '../../lib/format';

function OrderDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const qc = useQueryClient();
  const { hasRole } = useAuth();

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => orderApi.getById(id).then(r => r.data),
    enabled: !!id,
  });

  const approveMutation = useMutation({
    mutationFn: () => orderApi.approve(id),
    onSuccess: () => { toast.success('Order approved'); qc.invalidateQueries({ queryKey: ['order', id] }); },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Approval failed'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => orderApi.cancel(id),
    onSuccess: () => { toast.success('Order cancelled'); qc.invalidateQueries({ queryKey: ['order', id] }); },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Cancel failed'),
  });

  const invoiceMutation = useMutation({
    mutationFn: () => invoiceApi.generate(id),
    onSuccess: () => { toast.success('Invoice generated'); qc.invalidateQueries({ queryKey: ['order', id] }); },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Invoice generation failed'),
  });

  if (isLoading) {
    return (
      <Layout title="Order">
        <div className="card p-8 animate-pulse h-64" />
      </Layout>
    );
  }

  if (!order) return <Layout title="Order"><p className="text-gray-500">Order not found.</p></Layout>;

  const canApprove = (hasRole('SUPER_ADMIN') || hasRole('SALES_MANAGER')) && order.status === 'SUBMITTED';
  const canCancel  = (hasRole('SUPER_ADMIN') || hasRole('SALES_MANAGER')) && order.status === 'SUBMITTED';
  const canInvoice = (hasRole('SUPER_ADMIN') || hasRole('FINANCE_USER'))  && order.status === 'APPROVED';

  return (
    <Layout title={`Order ${order.orderNumber}`}>
      <div className="max-w-3xl space-y-5">
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
            {order.approvedBy && <div><dt className="text-gray-500">Approved By</dt><dd>{order.approvedBy?.fullName}</dd></div>}
            {order.notes && <div className="col-span-2"><dt className="text-gray-500">Notes</dt><dd>{order.notes}</dd></div>}
          </dl>
        </div>

        {/* Line items */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700">Items</h3>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
                <th className="px-4 py-2 text-left">Product</th>
                <th className="px-4 py-2 text-right">Qty</th>
                <th className="px-4 py-2 text-right">Unit Price</th>
                <th className="px-4 py-2 text-right">Discount</th>
                <th className="px-4 py-2 text-right">Tax</th>
                <th className="px-4 py-2 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(order.items || []).map(item => (
                <tr key={item.id} className="text-sm">
                  <td className="px-4 py-2.5 font-medium">{item.product?.name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{Number(item.quantity).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">${formatAmount(item.unitPrice)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-amber-600">
                    {item.discountPct > 0 ? `${item.discountPct}%` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">${formatAmount(item.taxAmount)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">${formatAmount(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-gray-200 bg-gray-50">
              <tr className="text-sm font-semibold">
                <td colSpan={5} className="px-4 py-2.5 text-right text-gray-600">Subtotal</td>
                <td className="px-4 py-2.5 text-right tabular-nums">${formatAmount(order.subtotal)}</td>
              </tr>
              <tr className="text-sm font-semibold">
                <td colSpan={5} className="px-4 py-2.5 text-right text-gray-600">Tax Total</td>
                <td className="px-4 py-2.5 text-right tabular-nums">${formatAmount(order.taxAmount)}</td>
              </tr>
              <tr className="text-base font-bold text-blue-700">
                <td colSpan={5} className="px-4 py-3 text-right">Total</td>
                <td className="px-4 py-3 text-right tabular-nums">${formatAmount(order.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          {canApprove && (
            <button className="btn-primary" onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
              {approveMutation.isPending ? 'Approving…' : 'Approve Order'}
            </button>
          )}
          {canInvoice && (
            <button className="btn-primary" onClick={() => invoiceMutation.mutate()} disabled={invoiceMutation.isPending}>
              {invoiceMutation.isPending ? 'Generating…' : 'Generate Invoice'}
            </button>
          )}
          {canCancel && (
            <button className="btn-danger" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
              {cancelMutation.isPending ? 'Cancelling…' : 'Cancel Order'}
            </button>
          )}
          <button className="btn-secondary" onClick={() => router.back()}>Back</button>
        </div>
      </div>
    </Layout>
  );
}

export default withAuth(OrderDetailPage, [], 'MOD_ORDERS', 'SFA');
