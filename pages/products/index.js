import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import BulkAssignChannelModal from '../../components/BulkAssignChannelModal';
import { ChannelChips } from '../../components/ChannelMultiSelect';
import { useAccessibleTenants } from '../../lib/hooks';
import { withAuth, useAuth } from '../../lib/auth';
import { productApi } from '../../lib/api';
import { formatAmount } from '../../lib/format';

function ProductsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const multiTenantEnabled = user?.multiTenantEnabled ?? true;
  const canBulkAssign = isAdmin && multiTenantEnabled;
  const { tenants: channelTenants } = useAccessibleTenants({ enabled: multiTenantEnabled });
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkAssign, setShowBulkAssign] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['products', page, search],
    queryFn:  () => productApi.list({ page, size: 20, search }).then(r => r.data),
    keepPreviousData: true,
  });

  const columns = [
    { key: 'productCode',      label: 'Code',     render: (v) => <span className="font-mono text-xs">{v}</span> },
    { key: 'barcode',          label: 'Barcode',  render: (v) => v ? <span className="font-mono text-xs text-gray-500">{v}</span> : <span className="text-gray-400">—</span> },
    { key: 'name',             label: 'Name',     render: (v) => <span className="font-medium">{v}</span> },
    { key: 'categoryName',     label: 'Category', render: (v) => v ?? <span className="text-gray-400">—</span> },
    ...(multiTenantEnabled ? [{
      key: 'tenantName', label: 'Channels',
      render: (_, row) => <ChannelChips row={row} tenants={channelTenants} />,
    }] : []),
    { key: 'unitAbbreviation', label: 'Unit',     render: (v) => v
        ? <span className="font-mono text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">{v}</span>
        : <span className="text-gray-400">—</span> },
    { key: 'purchasePrice', label: 'Cost (LKR)',   render: (v) => v != null ? `LKR ${formatAmount(v)}` : '—' },
    { key: 'defaultPrice', label: 'Price (LKR)',  render: (v) => v != null ? `LKR ${formatAmount(v)}` : '—' },
    {
      key: 'marginPct', label: 'Margin',
      render: (v, row) => v == null ? <span className="text-gray-400">—</span> : (
        <span className={`font-medium ${v < 0 ? 'text-red-600' : 'text-green-700'}`}>
          {Number(v).toFixed(1)}%
          {row.profitPerUnit != null && <span className="ml-1 text-xs text-gray-400">(LKR {formatAmount(row.profitPerUnit)})</span>}
        </span>
      ),
    },
    { key: 'taxRate',      label: 'Tax %',  render: (v) => v != null ? `${v}%` : '—' },
    { key: 'status',       label: 'Status', render: (v) => <StatusBadge status={v} /> },
    {
      key: 'id', label: '',
      render: (v) => (
        <button
          onClick={() => router.push(`/products/${v}`)}
          className="text-brand-600 text-xs font-medium hover:text-brand-800"
        >
          Edit →
        </button>
      ),
    },
  ];

  return (
    <Layout title="Products">
      {canBulkAssign && selectedIds.size > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50 px-4 py-2.5">
          <p className="text-sm font-medium text-brand-800">{selectedIds.size} product{selectedIds.size === 1 ? '' : 's'} selected</p>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setSelectedIds(new Set())}>Clear</button>
            <button className="btn-primary" onClick={() => setShowBulkAssign(true)}>Channels…</button>
          </div>
        </div>
      )}
      <DataTable
        columns={columns}
        data={data?.content || []}
        loading={isLoading}
        totalPages={data?.totalPages || 1}
        currentPage={page}
        onPageChange={setPage}
        onSearch={setSearch}
        selectable={canBulkAssign}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        actions={
          <button className="btn-primary" onClick={() => router.push('/products/new')}>
            + New Product
          </button>
        }
        emptyMessage="No products found"
      />

      {showBulkAssign && (
        <BulkAssignChannelModal
          count={selectedIds.size}
          entityLabel="product"
          assignFn={(tenantIds, mode) => productApi.bulkAssignTenant(Array.from(selectedIds), tenantIds, mode)}
          onClose={() => setShowBulkAssign(false)}
          onDone={() => { setSelectedIds(new Set()); qc.invalidateQueries({ queryKey: ['products'] }); }}
        />
      )}
    </Layout>
  );
}

export default withAuth(ProductsPage, [], 'MOD_PRODUCTS');
