import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import { withAuth, useAuth } from '../../lib/auth';
import { damageApi } from '../../lib/api';
import toast from 'react-hot-toast';

const STATUS_OPTIONS = ['APPROVED', 'REJECTED', 'PROCESSED'];

const COLUMNS = [
  { key: 'damageNumber', label: 'Damage #',    render: (v) => <span className="font-mono text-xs">{v ?? '—'}</span> },
  { key: 'customer',     label: 'Customer',    render: (_, r) => r.customer?.name ?? '—' },
  { key: 'items',        label: 'Products',    render: (_, r) => (
      <div className="space-y-0.5">
        {(r.items ?? []).map((it, i) => (
          <div key={i} className="text-xs whitespace-nowrap">
            {it.product?.name ?? '—'} <span className="text-gray-400">× {Number(it.quantity).toLocaleString()}</span>
          </div>
        ))}
      </div>
    ) },
  { key: 'description',  label: 'Description', render: (v) => <span className="truncate max-w-xs block">{v}</span> },
  { key: 'reportedBy',   label: 'Reported By', render: (_, r) => r.reportedBy?.fullName ?? '—' },
  { key: 'status',       label: 'Status',      render: (v) => <StatusBadge status={v} /> },
  { key: 'damageDate',   label: 'Date',        render: (v) => v ? new Date(v).toLocaleDateString() : '—' },
];

function DamagesPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const canManage = hasRole('SUPER_ADMIN') || hasRole('SALES_MANAGER');

  const { data, isLoading } = useQuery({
    queryKey: ['damages', page],
    queryFn: () => damageApi.list({ page, size: 20 }).then(r => r.data),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => damageApi.updateStatus(id, status),
    onSuccess: () => { toast.success('Status updated'); qc.invalidateQueries({ queryKey: ['damages'] }); },
    onError: () => toast.error('Update failed'),
  });

  const columnsWithActions = canManage ? [
    ...COLUMNS,
    {
      key: 'actions', label: '',
      render: (_, row) => row.status === 'PENDING' ? (
        <div className="flex gap-1">
          {STATUS_OPTIONS.map(s => (
            <button key={s} onClick={() => statusMutation.mutate({ id: row.id, status: s })}
              className={`text-xs px-2 py-1 rounded font-medium ${
                s === 'APPROVED'  ? 'bg-green-100 text-green-700 hover:bg-green-200' :
                s === 'REJECTED'  ? 'bg-red-100 text-red-700 hover:bg-red-200' :
                'bg-blue-100 text-blue-700 hover:bg-blue-200'
              }`}>
              {s}
            </button>
          ))}
        </div>
      ) : null,
    },
  ] : COLUMNS;

  return (
    <Layout title="Damages">
      <DataTable
        columns={columnsWithActions}
        data={data?.content || []}
        loading={isLoading}
        totalPages={data?.totalPages || 1}
        currentPage={page}
        onPageChange={setPage}
        emptyMessage="No damages recorded"
      />
    </Layout>
  );
}

export default withAuth(DamagesPage, ['SUPER_ADMIN', 'SALES_MANAGER', 'FINANCE_USER'], 'MOD_DAMAGES', 'SFA');
