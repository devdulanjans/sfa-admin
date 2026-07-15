import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import { withAuth } from '../../lib/auth';
import axios from '../../lib/api';

const auditApi = {
  list: (p) => axios.get('/audit-logs', { params: p }),
};

const ACTION_COLORS = {
  CREATE: 'badge-green',
  UPDATE: 'badge-amber',
  DELETE: 'badge-red',
  LOGIN:  'badge-blue',
  LOGOUT: 'badge-gray',
};

const COLUMNS = [
  { key: 'createdAt',   label: 'Time',        render: (v) => v ? new Date(v).toLocaleString() : '—' },
  { key: 'username',    label: 'User',         render: (v) => v ?? '—' },
  { key: 'action',      label: 'Action',
    render: (v) => <span className={ACTION_COLORS[v] ?? 'badge-gray'}>{v}</span> },
  { key: 'entityType',  label: 'Entity' },
  { key: 'entityId',    label: 'Entity ID',   render: (v) => <span className="font-mono text-xs">{String(v ?? '').slice(0,8)}</span> },
  { key: 'ipAddress',   label: 'IP',           render: (v) => v ?? '—' },
];

function AuditLogPage() {
  const [page, setPage] = useState(0);
  const [entityType, setEntityType] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page, entityType],
    queryFn: () => auditApi.list({ page, size: 30, entityType: entityType || undefined }).then(r => r.data),
  });

  return (
    <Layout title="Audit Log">
      <div className="card p-4 mb-4 flex items-center gap-3">
        <div>
          <label className="label">Filter by Entity</label>
          <select value={entityType} onChange={e => { setEntityType(e.target.value); setPage(0); }} className="input w-44">
            <option value="">All entities</option>
            {['User','Customer','Product','Order','Invoice','Return','Damage','BatchPrice','Promotion'].map(e => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>
        <p className="text-xs text-gray-500 mt-5">Read-only view of all system changes</p>
      </div>

      <DataTable
        columns={COLUMNS}
        data={data?.content || []}
        loading={isLoading}
        totalPages={data?.totalPages || 1}
        currentPage={page}
        onPageChange={setPage}
        emptyMessage="No audit log entries"
      />
    </Layout>
  );
}

export default withAuth(AuditLogPage, ['SUPER_ADMIN']);
