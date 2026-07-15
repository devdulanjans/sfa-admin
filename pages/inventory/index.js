import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import { withAuth } from '../../lib/auth';
import { inventoryApi, productApi } from '../../lib/api';
import toast from 'react-hot-toast';
import { formatAmount } from '../../lib/format';

const COLUMNS = [
  { key: 'name',        label: 'Product' },
  { key: 'productCode', label: 'Code' },
  {
    key: 'onHand',
    label: 'On Hand',
    render: (v) => (
      <span className={`font-mono font-semibold ${Number(v) <= 0 ? 'text-red-600' : Number(v) <= 10 ? 'text-amber-600' : 'text-green-700'}`}>
        {Number(v).toFixed(3)}
      </span>
    ),
  },
  {
    key: 'reserved',
    label: 'Reserved',
    render: (v) => <span className="font-mono text-gray-600">{Number(v).toFixed(3)}</span>,
  },
  {
    key: 'available',
    label: 'Available',
    render: (_, r) => {
      const avail = Number(r.onHand) - Number(r.reserved);
      return (
        <span className={`font-mono font-semibold ${avail <= 0 ? 'text-red-600' : 'text-gray-800'}`}>
          {avail.toFixed(3)}
        </span>
      );
    },
  },
  {
    key: 'updatedAt',
    label: 'Last Updated',
    render: (v) => v ? new Date(v).toLocaleString() : '—',
  },
];

const todayStr = () => new Date().toISOString().slice(0, 10);

function InventoryPage() {
  const qc = useQueryClient();
  const [page, setPage]         = useState(0);
  const [search, setSearch]     = useState('');
  const [adjusting, setAdjusting] = useState(null);  // product row being adjusted
  const [adjQty, setAdjQty]     = useState('');
  const [adjNotes, setAdjNotes] = useState('');
  const [adjType, setAdjType]   = useState('add');    // 'add' | 'remove' | 'set'

  const [receiving, setReceiving] = useState(null);  // product row receiving a new batch
  const [recvQty, setRecvQty]     = useState('');
  const [recvCost, setRecvCost]   = useState('');
  const [recvDate, setRecvDate]   = useState(todayStr());
  const [recvNotes, setRecvNotes] = useState('');

  const [viewingBatches, setViewingBatches] = useState(null); // product row whose batches are shown

  const { data, isLoading } = useQuery({
    queryKey: ['inventory-stock', page, search],
    queryFn: () => inventoryApi.listStock({ page, size: 20, search: search || undefined }).then(r => r.data),
    keepPreviousData: true,
  });

  const { data: batches, isLoading: batchesLoading } = useQuery({
    queryKey: ['stock-batches', viewingBatches?.id],
    queryFn: () => inventoryApi.listBatches(viewingBatches.id).then(r => r.data),
    enabled: !!viewingBatches,
  });

  const adjustMutation = useMutation({
    mutationFn: (body) => inventoryApi.adjustStock(body),
    onSuccess: () => {
      toast.success('Stock adjusted');
      qc.invalidateQueries({ queryKey: ['inventory-stock'] });
      closeAdjust();
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? err.response?.data?.message ?? 'Adjustment failed'),
  });

  const receiveMutation = useMutation({
    mutationFn: (body) => inventoryApi.receiveStock(body),
    onSuccess: () => {
      toast.success('Stock received');
      qc.invalidateQueries({ queryKey: ['inventory-stock'] });
      qc.invalidateQueries({ queryKey: ['stock-batches'] });
      closeReceive();
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? err.response?.data?.message ?? 'Failed to receive stock'),
  });

  const closeAdjust = () => {
    setAdjusting(null);
    setAdjQty('');
    setAdjNotes('');
    setAdjType('add');
  };

  const closeReceive = () => {
    setReceiving(null);
    setRecvQty('');
    setRecvCost('');
    setRecvDate(todayStr());
    setRecvNotes('');
  };

  const submitReceive = () => {
    const qty  = parseFloat(recvQty);
    const cost = parseFloat(recvCost);
    if (isNaN(qty) || qty <= 0) { toast.error('Enter a quantity greater than zero'); return; }
    if (isNaN(cost) || cost < 0) { toast.error('Enter a valid unit cost'); return; }
    if (!recvDate) { toast.error('Received date is required'); return; }

    receiveMutation.mutate({
      productId:    receiving.id,
      quantity:     qty,
      unitCost:     cost,
      receivedDate: recvDate,
      notes:        recvNotes,
    });
  };

  const submitAdjust = () => {
    const qty = parseFloat(adjQty);
    if (isNaN(qty) || qty === 0) { toast.error('Enter a non-zero quantity'); return; }

    let delta;
    if (adjType === 'set') {
      delta = qty - Number(adjusting.onHand);
    } else if (adjType === 'remove') {
      delta = -Math.abs(qty);
    } else {
      delta = Math.abs(qty);
    }

    adjustMutation.mutate({
      productId: adjusting.id,
      quantity:  delta,
      notes:     adjNotes,
    });
  };

  const columns = [
    ...COLUMNS,
    {
      key: 'actions',
      label: '',
      render: (_, row) => (
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={() => setViewingBatches(row)}
            className="text-xs text-gray-500 hover:text-gray-700 font-medium">
            Batches
          </button>
          <button
            onClick={() => setReceiving(row)}
            className="text-xs text-green-600 hover:text-green-800 font-medium">
            Receive
          </button>
          <button
            onClick={() => setAdjusting(row)}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium">
            Adjust
          </button>
        </div>
      ),
    },
  ];

  return (
    <Layout title="Inventory">
      <DataTable
        columns={columns}
        data={data?.content || []}
        loading={isLoading}
        totalPages={data?.totalPages || 1}
        currentPage={page}
        onPageChange={setPage}
        emptyMessage="No products found"
        actions={
          <div className="flex items-center gap-3">
            <input
              className="input w-56"
              placeholder="Search products…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
            />
          </div>
        }
      />

      {/* Adjust modal */}
      {adjusting && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Adjust Stock</h2>
            <p className="text-sm text-gray-500 mb-4">
              {adjusting.name}
              <span className="ml-2 font-mono text-xs bg-gray-100 rounded px-1.5 py-0.5">
                {adjusting.productCode}
              </span>
              <span className="ml-2 text-gray-700">Current: <strong>{Number(adjusting.onHand).toFixed(3)}</strong></span>
            </p>

            <div className="space-y-3">
              {/* Adjustment type */}
              <div>
                <label className="label">Adjustment Type</label>
                <div className="flex gap-2">
                  {[
                    { value: 'add',    label: '+ Add'    },
                    { value: 'remove', label: '− Remove' },
                    { value: 'set',    label: '= Set to' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAdjType(opt.value)}
                      className={`flex-1 text-sm py-1.5 rounded-lg border font-medium transition-colors
                        ${adjType === opt.value
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label className="label">
                  {adjType === 'set' ? 'New Stock Level' : 'Quantity'}
                </label>
                <input
                  type="number" step="0.001" min="0"
                  className="input"
                  value={adjQty}
                  onChange={e => setAdjQty(e.target.value)}
                  placeholder="0.000"
                  autoFocus
                />
                {adjType !== 'set' && adjQty && !isNaN(parseFloat(adjQty)) && (
                  <p className="text-xs text-gray-500 mt-1">
                    New balance will be{' '}
                    <strong>
                      {(Number(adjusting.onHand) + (adjType === 'remove' ? -1 : 1) * parseFloat(adjQty)).toFixed(3)}
                    </strong>
                  </p>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="label">Reason / Notes</label>
                <input
                  className="input"
                  placeholder="e.g. Stock count, Damaged goods, Purchase receipt…"
                  value={adjNotes}
                  onChange={e => setAdjNotes(e.target.value)}
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={submitAdjust}
                  disabled={adjustMutation.isPending}
                  className="btn-primary flex-1">
                  {adjustMutation.isPending ? 'Saving…' : 'Save Adjustment'}
                </button>
                <button onClick={closeAdjust} className="btn-secondary flex-1">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Receive Stock modal */}
      {receiving && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Receive Stock</h2>
            <p className="text-sm text-gray-500 mb-4">
              {receiving.name}
              <span className="ml-2 font-mono text-xs bg-gray-100 rounded px-1.5 py-0.5">
                {receiving.productCode}
              </span>
              <span className="ml-2 text-gray-700">Current: <strong>{Number(receiving.onHand).toFixed(3)}</strong></span>
            </p>
            <p className="text-xs text-gray-400 mb-4">
              Creates a new batch with its own cost, tracked separately from existing stock for FIFO costing.
            </p>

            <div className="space-y-3">
              <div>
                <label className="label">Quantity Received</label>
                <input
                  type="number" step="0.001" min="0"
                  className="input"
                  value={recvQty}
                  onChange={e => setRecvQty(e.target.value)}
                  placeholder="0.000"
                  autoFocus
                />
              </div>
              <div>
                <label className="label">Unit Cost (LKR)</label>
                <input
                  type="number" step="0.01" min="0"
                  className="input"
                  value={recvCost}
                  onChange={e => setRecvCost(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="label">Received Date</label>
                <input
                  type="date"
                  className="input"
                  value={recvDate}
                  onChange={e => setRecvDate(e.target.value)}
                  max={todayStr()}
                />
              </div>
              <div>
                <label className="label">Notes</label>
                <input
                  className="input"
                  placeholder="e.g. Supplier invoice #, purchase order…"
                  value={recvNotes}
                  onChange={e => setRecvNotes(e.target.value)}
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={submitReceive}
                  disabled={receiveMutation.isPending}
                  className="btn-primary flex-1">
                  {receiveMutation.isPending ? 'Saving…' : 'Receive Stock'}
                </button>
                <button onClick={closeReceive} className="btn-secondary flex-1">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Batches modal */}
      {viewingBatches && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setViewingBatches(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-gray-900 mb-1">Stock Batches</h2>
            <p className="text-sm text-gray-500 mb-4">
              {viewingBatches.name}
              <span className="ml-2 font-mono text-xs bg-gray-100 rounded px-1.5 py-0.5">
                {viewingBatches.productCode}
              </span>
            </p>

            <div className="max-h-80 overflow-y-auto">
              {batchesLoading ? (
                <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
              ) : !batches?.length ? (
                <p className="text-sm text-gray-400 text-center py-8">No batches received yet for this product.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      <th className="py-2 pr-2">Received</th>
                      <th className="py-2 pr-2">Qty Received</th>
                      <th className="py-2 pr-2">Remaining</th>
                      <th className="py-2 pr-2">Unit Cost</th>
                      <th className="py-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {batches.map(b => (
                      <tr key={b.id}>
                        <td className="py-2 pr-2">{b.receivedDate}</td>
                        <td className="py-2 pr-2 font-mono">{Number(b.receivedQty).toFixed(3)}</td>
                        <td className="py-2 pr-2 font-mono">
                          <span className={Number(b.remainingQty) <= 0 ? 'text-gray-400' : 'font-semibold text-green-700'}>
                            {Number(b.remainingQty).toFixed(3)}
                          </span>
                        </td>
                        <td className="py-2 pr-2 font-mono">LKR {formatAmount(b.unitCost)}</td>
                        <td className="py-2 text-gray-500">{b.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="pt-4">
              <button onClick={() => setViewingBatches(null)} className="btn-secondary w-full">Close</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

export default withAuth(InventoryPage, ['SUPER_ADMIN', 'SALES_MANAGER'], 'MOD_INV_STOCK', 'SFA');
