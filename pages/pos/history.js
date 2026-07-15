import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import { withAuth } from '../../lib/auth';
import { posApi } from '../../lib/api';
import toast from 'react-hot-toast';
import { formatAmount } from '../../lib/format';

const COLUMNS = [
  { key: 'saleNumber',  label: 'Sale #' },
  {
    key: 'customerName',
    label: 'Customer',
    render: (v) => v ?? <span className="text-gray-400">Walk-in</span>,
  },
  {
    key: 'paymentMethod',
    label: 'Payment',
    render: (v) => (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border
        ${v === 'CASH'   ? 'bg-green-50 text-green-700 border-green-200' :
          v === 'CARD'   ? 'bg-blue-50  text-blue-700  border-blue-200'  :
                           'bg-amber-50 text-amber-700 border-amber-200'}`}>
        {v}
      </span>
    ),
  },
  {
    key: 'total',
    label: 'Total',
    render: (v) => <span className="font-semibold">LKR {formatAmount(v)}</span>,
  },
  {
    key: 'status',
    label: 'Status',
    render: (v) => <StatusBadge status={v} />,
  },
  {
    key: 'createdAt',
    label: 'Date',
    render: (v) => v ? new Date(v).toLocaleString() : '—',
  },
];

const STATUS_OPTIONS = [
  { value: '',          label: 'All Statuses' },
  { value: 'COMPLETED', label: 'Completed'    },
  { value: 'VOIDED',    label: 'Voided'       },
];

function PosHistoryPage() {
  const qc = useQueryClient();
  const [page, setPage]     = useState(0);
  const [status, setStatus] = useState('');
  const [detail, setDetail] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['pos-sales', page, status],
    queryFn: () => posApi.listSales({ page, size: 20, status: status || undefined }).then(r => r.data),
    keepPreviousData: true,
  });

  const voidMutation = useMutation({
    mutationFn: (id) => posApi.voidSale(id),
    onSuccess: () => {
      toast.success('Sale voided');
      qc.invalidateQueries({ queryKey: ['pos-sales'] });
      setDetail(null);
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to void sale'),
  });

  const { data: detailData } = useQuery({
    queryKey: ['pos-sale', detail],
    queryFn: () => posApi.getSale(detail).then(r => r.data),
    enabled: !!detail,
  });

  const columns = [
    ...COLUMNS,
    {
      key: 'actions',
      label: '',
      render: (_, row) => (
        <button
          onClick={() => setDetail(row.id)}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium">
          View
        </button>
      ),
    },
  ];

  return (
    <Layout title="POS History">
      <DataTable
        columns={columns}
        data={data?.content || []}
        loading={isLoading}
        totalPages={data?.totalPages || 1}
        currentPage={page}
        onPageChange={setPage}
        emptyMessage="No POS sales yet"
        actions={
          <select
            className="input w-44"
            value={status}
            onChange={e => { setStatus(e.target.value); setPage(0); }}>
            {STATUS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        }
      />

      {/* Detail modal */}
      {detail && detailData && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">{detailData.saleNumber}</h2>
                <p className="text-sm text-gray-500">{new Date(detailData.createdAt).toLocaleString()}</p>
              </div>
              <StatusBadge status={detailData.status} />
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div><span className="text-gray-500">Customer:</span> {detailData.customerName ?? 'Walk-in'}</div>
              <div><span className="text-gray-500">Payment:</span> {detailData.paymentMethod}</div>
              {detailData.paymentMethod === 'CASH' && (
                <>
                  <div><span className="text-gray-500">Tendered:</span> LKR {formatAmount(detailData.amountTendered)}</div>
                  <div><span className="text-gray-500">Change:</span> LKR {formatAmount(detailData.changeAmount)}</div>
                </>
              )}
              {detailData.paymentMethod === 'CARD' && detailData.cardLast4 && (
                <div><span className="text-gray-500">Card:</span> **** {detailData.cardLast4}</div>
              )}
              {detailData.paymentMethod === 'CREDIT' && (
                <>
                  <div><span className="text-gray-500">Paid:</span> LKR {formatAmount(detailData.amountPaid)}</div>
                  <div><span className="text-gray-500">Balance Due:</span> LKR {formatAmount(detailData.balanceDue)}</div>
                  <div><span className="text-gray-500">Credit Status:</span> {detailData.creditStatus}</div>
                </>
              )}
            </div>

            {/* Items */}
            <div className="border rounded-lg overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Product</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Qty</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Unit Price</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(detailData.items || []).map(item => (
                    <tr key={item.id}>
                      <td className="px-3 py-2">{item.productName}</td>
                      <td className="px-3 py-2 text-right font-mono">{Number(item.quantity).toFixed(3)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatAmount(item.unitPrice)}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">{formatAmount(item.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="space-y-1 text-sm mb-4">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span><span>LKR {formatAmount(detailData.subtotal)}</span>
              </div>
              {Number(detailData.discountAmount) > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Discount</span><span>− LKR {formatAmount(detailData.discountAmount)}</span>
                </div>
              )}
              {Number(detailData.taxAmount) > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Tax</span><span>LKR {formatAmount(detailData.taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base border-t pt-2 mt-2">
                <span>Total</span><span>LKR {formatAmount(detailData.total)}</span>
              </div>
            </div>

            {detailData.notes && (
              <p className="text-sm text-gray-500 mb-4">Notes: {detailData.notes}</p>
            )}

            <div className="flex gap-2">
              {detailData.status === 'COMPLETED' && !(detailData.paymentMethod === 'CREDIT' && Number(detailData.amountPaid) > 0) && (
                <button
                  onClick={() => voidMutation.mutate(detailData.id)}
                  disabled={voidMutation.isPending}
                  className="btn-secondary flex-1 text-red-600 hover:text-red-700 border-red-200 hover:border-red-400">
                  {voidMutation.isPending ? 'Voiding…' : 'Void Sale'}
                </button>
              )}
              {detailData.status === 'COMPLETED' && detailData.paymentMethod === 'CREDIT' && Number(detailData.amountPaid) > 0 && (
                <p className="flex-1 text-xs text-gray-400 italic self-center">
                  Cannot void — payments already recorded against this credit sale
                </p>
              )}
              <button onClick={() => setDetail(null)} className="btn-secondary flex-1">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

export default withAuth(PosHistoryPage, ['SUPER_ADMIN', 'SALES_MANAGER'], 'MOD_POS_HISTORY', 'POS');
