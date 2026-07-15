import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import { withAuth } from '../../lib/auth';
import { inventoryApi } from '../../lib/api';
import { formatAmount } from '../../lib/format';

const TYPE_COLORS = {
  ADJUSTMENT:      'bg-blue-50   text-blue-700  border-blue-200',
  ORDER_OUT:       'bg-red-50    text-red-700   border-red-200',
  ORDER_CANCEL_IN: 'bg-green-50  text-green-700 border-green-200',
  POS_OUT:         'bg-amber-50  text-amber-700 border-amber-200',
  POS_VOID_IN:     'bg-purple-50 text-purple-700 border-purple-200',
  STOCK_RECEIVE:   'bg-teal-50   text-teal-700  border-teal-200',
};

const TYPE_LABELS = {
  ADJUSTMENT:      'Adjustment',
  ORDER_OUT:       'Order Out',
  ORDER_CANCEL_IN: 'Order Restored',
  POS_OUT:         'POS Sale',
  POS_VOID_IN:     'POS Void',
  STOCK_RECEIVE:   'Stock Received',
};

const COLUMNS = [
  {
    key: 'createdAt',
    label: 'Date / Time',
    render: (v) => v ? new Date(v).toLocaleString() : '—',
  },
  { key: 'productName', label: 'Product' },
  {
    key: 'type',
    label: 'Type',
    render: (v) => (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${TYPE_COLORS[v] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
        {TYPE_LABELS[v] ?? v}
      </span>
    ),
  },
  {
    key: 'quantity',
    label: 'Quantity',
    render: (v) => (
      <span className={`font-mono font-semibold ${Number(v) < 0 ? 'text-red-600' : 'text-green-700'}`}>
        {Number(v) > 0 ? '+' : ''}{Number(v).toFixed(3)}
      </span>
    ),
  },
  {
    key: 'balanceAfter',
    label: 'Balance After',
    render: (v) => <span className="font-mono text-gray-700">{Number(v).toFixed(3)}</span>,
  },
  {
    key: 'totalCost',
    label: 'Cost',
    render: (v) => v != null ? <span className="font-mono text-gray-700">LKR {formatAmount(v)}</span> : <span className="text-gray-400">—</span>,
  },
  {
    key: 'referenceType',
    label: 'Reference',
    render: (v, r) => v ? (
      <span className="text-xs text-gray-500">
        {v}{r.referenceId ? ` #${r.referenceId.slice(0, 8)}…` : ''}
      </span>
    ) : '—',
  },
  { key: 'notes', label: 'Notes', render: (v) => v ?? '—' },
];

const MOVEMENT_TYPES = [
  { value: '',               label: 'All Types'       },
  { value: 'ADJUSTMENT',      label: 'Adjustment'      },
  { value: 'ORDER_OUT',       label: 'Order Out'       },
  { value: 'ORDER_CANCEL_IN', label: 'Order Restored'  },
  { value: 'POS_OUT',         label: 'POS Sale'        },
  { value: 'POS_VOID_IN',     label: 'POS Void'        },
  { value: 'STOCK_RECEIVE',   label: 'Stock Received'  },
];

function MovementsPage() {
  const [page, setPage]           = useState(0);
  const [productId, setProductId] = useState('');
  const [type, setType]           = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['stock-movements', page, productId, type],
    queryFn: () => inventoryApi.listMovements({
      page, size: 30,
      productId: productId || undefined,
      type: type || undefined,
    }).then(r => r.data),
    keepPreviousData: true,
  });

  return (
    <Layout title="Stock Movements">
      <DataTable
        columns={COLUMNS}
        data={data?.content || []}
        loading={isLoading}
        totalPages={data?.totalPages || 1}
        currentPage={page}
        onPageChange={setPage}
        emptyMessage="No movements recorded"
        actions={
          <div className="flex items-center gap-3">
            <select
              className="input w-44"
              value={type}
              onChange={e => { setType(e.target.value); setPage(0); }}>
              {MOVEMENT_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <input
              className="input w-64"
              placeholder="Filter by Product ID (UUID)…"
              value={productId}
              onChange={e => { setProductId(e.target.value.trim()); setPage(0); }}
            />
          </div>
        }
      />
    </Layout>
  );
}

export default withAuth(MovementsPage, ['SUPER_ADMIN', 'SALES_MANAGER'], 'MOD_INV_MOVES', 'SFA');
