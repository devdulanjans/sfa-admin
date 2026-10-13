import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import RoutesDisabledNotice from '../../components/RoutesDisabledNotice';
import { withAuth, useAuth, usePermission } from '../../lib/auth';
import { salesRouteApi } from '../../lib/api';

const STATUS_TABS = [
  { value: '',         label: 'All' },
  { value: 'ACTIVE',   label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

function RoutesPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const { user } = useAuth();
  const multiTenantEnabled = user?.multiTenantEnabled ?? true;
  const canAssign = usePermission('MOD_ROUTE_ASSIGN');
  const [page, setPage]     = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['sales-routes', page, search, status],
    queryFn:  () => salesRouteApi.list({ page, size: 20, search, status: status || undefined }).then(r => r.data),
    keepPreviousData: true,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => salesRouteApi.delete(id),
    onSuccess: () => {
      toast.success('Route deleted');
      qc.invalidateQueries({ queryKey: ['sales-routes'] });
      qc.invalidateQueries({ queryKey: ['sales-routes-active'] });
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to delete route', { duration: 6000 }),
  });

  const columns = [
    {
      key: 'name', label: 'Route',
      render: (v, row) => (
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/routes/${row.id}`} className="font-medium text-gray-900 hover:text-brand-600">{v}</Link>
          {row.suggestionCount > 0 && (
            <Link href={`/routes/${row.id}#suggestions`}
              title="Customers suggested for this route by sales reps"
              className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100 whitespace-nowrap">
              {row.suggestionCount} suggested
            </Link>
          )}
        </div>
      ),
    },
    {
      key: 'description', label: 'Description',
      render: (v) => v
        ? <span className="block max-w-[320px] truncate text-gray-600" title={v}>{v}</span>
        : <span className="text-gray-400">—</span>,
    },
    {
      key: 'customerCount', label: 'Stops',
      render: (v) => <span className="font-medium">{v ?? 0}</span>,
    },
    ...(multiTenantEnabled ? [{ key: 'tenantName', label: 'Channel', render: (v) => v || '—' }] : []),
    { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v} /> },
    {
      key: 'actions', label: '',
      render: (_, row) => (
        <div className="flex items-center gap-3 justify-end whitespace-nowrap">
          <Link href={`/routes/${row.id}`} className="text-xs text-gray-600 hover:text-brand-600">Edit</Link>
          <button className="text-xs text-red-600 hover:text-red-700" disabled={deleteMutation.isPending}
            onClick={() => { if (confirm(`Delete route "${row.name}"?`)) deleteMutation.mutate(row.id); }}>
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <Layout title="Routes">
      <div className="space-y-4">
        <RoutesDisabledNotice />
        <div className="flex gap-1 border-b border-gray-200">
          {STATUS_TABS.map(t => (
            <button key={t.value}
              className={`px-4 py-2 text-sm -mb-px border-b-2 ${status === t.value
                ? 'border-brand-600 text-brand-700 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              onClick={() => { setStatus(t.value); setPage(0); }}>
              {t.label}
            </button>
          ))}
        </div>

        <DataTable
          columns={columns}
          data={data?.content || []}
          loading={isLoading}
          totalPages={data?.totalPages || 1}
          currentPage={page}
          onPageChange={setPage}
          onSearch={(v) => { setSearch(v); setPage(0); }}
          actions={(
            <>
              {canAssign && <Link href="/routes/assign" className="btn-secondary">Assign Route</Link>}
              <button className="btn-primary" onClick={() => router.push('/routes/new')}>+ New Route</button>
            </>
          )}
          emptyMessage="No routes found"
        />
      </div>
    </Layout>
  );
}

export default withAuth(RoutesPage, [], 'MOD_ROUTES', 'SFA');
