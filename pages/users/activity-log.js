import { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import { withAuth } from '../../lib/auth';
import { accessLogApi, userApi } from '../../lib/api';

const STATUS_COLORS = {
  SUCCESS: 'bg-green-100 text-green-700',
  DENIED:  'bg-red-100 text-red-700',
  ERROR:   'bg-yellow-100 text-yellow-700',
};

const ACTION_LABELS = {
  PAGE_ACCESS:       'Page Access',
  PERMISSION_DENIED: 'Permission Denied',
  ROLE_DENIED:       'Role Denied',
};

function ActivityLogPage() {
  const [logs, setLogs]         = useState([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(0);
  const [loading, setLoading]   = useState(false);
  const [users, setUsers]       = useState([]);

  const [filters, setFilters] = useState({
    userId: '',
    status: '',
    action: '',
  });

  useEffect(() => {
    userApi.list({ size: 200 }).then(({ data }) => {
      setUsers(data.content || data);
    }).catch(() => {});
  }, []);

  const fetchLogs = useCallback(async (pg = 0) => {
    setLoading(true);
    try {
      const params = { page: pg, size: 30 };
      if (filters.userId) params.userId = filters.userId;
      if (filters.status) params.status = filters.status;
      if (filters.action) params.action = filters.action;

      const { data } = await accessLogApi.list(params);
      setLogs(data.content || []);
      setTotal(data.totalElements || 0);
      setPage(pg);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchLogs(0);
  }, [fetchLogs]);

  function handleFilterChange(key, val) {
    setFilters(prev => ({ ...prev, [key]: val }));
  }

  function fmt(isoString) {
    if (!isoString) return '—';
    const d = new Date(isoString);
    return d.toLocaleString('en-AU', {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }

  const totalPages = Math.ceil(total / 30);

  return (
    <Layout title="Activity Log">
      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">User</label>
          <select
            value={filters.userId}
            onChange={e => handleFilterChange('userId', e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Users</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.fullName || u.username}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
          <select
            value={filters.status}
            onChange={e => handleFilterChange('status', e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All</option>
            <option value="SUCCESS">Success</option>
            <option value="DENIED">Denied</option>
            <option value="ERROR">Error</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Action Type</label>
          <select
            value={filters.action}
            onChange={e => handleFilterChange('action', e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Actions</option>
            <option value="PAGE_ACCESS">Page Access</option>
            <option value="PERMISSION_DENIED">Permission Denied</option>
            <option value="ROLE_DENIED">Role Denied</option>
          </select>
        </div>

        <div className="ml-auto flex items-end">
          <span className="text-sm text-gray-500">{total.toLocaleString()} events</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {['Timestamp', 'User', 'Action', 'Resource', 'Status', 'IP'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-gray-400 text-sm">Loading...</td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-gray-400 text-sm">No logs found</td>
                </tr>
              ) : logs.map(log => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap font-mono">
                    {fmt(log.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{log.username}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {ACTION_LABELS[log.action] || log.action}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 font-mono max-w-xs truncate">
                    {log.resource || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[log.status] || 'bg-gray-100 text-gray-600'}`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 font-mono">
                    {log.ipAddress || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Page {page + 1} of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => fetchLogs(page - 1)}
                disabled={page === 0}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Previous
              </button>
              <button
                onClick={() => fetchLogs(page + 1)}
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default withAuth(ActivityLogPage, [], 'MOD_USER_ACTIVITY');
