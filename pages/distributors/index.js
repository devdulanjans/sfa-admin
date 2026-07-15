import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import { withAuth } from '../../lib/auth';
import { distributorApi, userApi } from '../../lib/api';
import toast from 'react-hot-toast';

const COLUMNS = [
  { key: 'code',   label: 'Code',    render: (v) => <span className="font-mono font-medium">{v}</span> },
  { key: 'name',   label: 'Name',    render: (v) => <span className="font-medium">{v}</span> },
  { key: 'phone',  label: 'Phone',   render: (v) => v || '—' },
  { key: 'email',  label: 'Email',   render: (v) => v || '—' },
  { key: 'status', label: 'Status',  render: (v) => <StatusBadge status={v} /> },
];

function DistributorsPage() {
  const qc = useQueryClient();
  const [page, setPage]           = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState(null);   // distributor being edited
  const [assignTarget, setAssignTarget] = useState(null); // distributor for user assignment

  const { register: regCreate, handleSubmit: hsCreate, reset: resetCreate, formState: { errors: errCreate } } = useForm();
  const { register: regEdit,   handleSubmit: hsEdit,   reset: resetEdit,   formState: { errors: errEdit   } } = useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['distributors', page],
    queryFn:  () => distributorApi.list({ page, size: 20 }).then(r => r.data),
  });

  const { data: allUsers } = useQuery({
    queryKey: ['users-all'],
    queryFn:  () => userApi.list({ page: 0, size: 200 }).then(r => r.data?.content || []),
    enabled:  !!assignTarget,
  });

  const { data: assignedUsers, refetch: refetchAssigned } = useQuery({
    queryKey: ['distributor-users', assignTarget?.id],
    queryFn:  () => distributorApi.get(assignTarget.id).then(() =>
      userApi.list({ page: 0, size: 200 }).then(r =>
        (r.data?.content || []).filter(u =>
          u.distributors?.some(d => d.id === assignTarget.id)
        )
      )
    ),
    enabled: !!assignTarget,
  });

  const createMutation = useMutation({
    mutationFn: (body) => distributorApi.create(body),
    onSuccess: () => {
      toast.success('Distributor created');
      qc.invalidateQueries({ queryKey: ['distributors'] });
      setShowCreate(false);
      resetCreate();
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to create distributor'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => distributorApi.update(id, data),
    onSuccess: () => {
      toast.success('Distributor updated');
      qc.invalidateQueries({ queryKey: ['distributors'] });
      setEditTarget(null);
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to update distributor'),
  });

  const toggleMutation = useMutation({
    mutationFn: (id) => distributorApi.toggleStatus(id),
    onSuccess: () => { toast.success('Status updated'); qc.invalidateQueries({ queryKey: ['distributors'] }); },
  });

  const assignMutation = useMutation({
    mutationFn: ({ distId, userId }) => distributorApi.assignUser(distId, userId),
    onSuccess: () => { toast.success('User assigned'); refetchAssigned(); qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to assign user'),
  });

  const unassignMutation = useMutation({
    mutationFn: ({ distId, userId }) => distributorApi.unassignUser(distId, userId),
    onSuccess: () => { toast.success('User removed'); refetchAssigned(); qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to remove user'),
  });

  const openEdit = (row) => {
    setEditTarget(row);
    resetEdit({ code: row.code, name: row.name, address: row.address || '', phone: row.phone || '', email: row.email || '' });
  };

  const assignedIds = new Set((assignedUsers || []).map(u => u.id));
  const unassignedUsers = (allUsers || []).filter(u => !assignedIds.has(u.id));

  const columnsWithActions = [
    ...COLUMNS,
    {
      key: 'actions', label: '',
      render: (_, row) => (
        <div className="flex gap-2">
          <button onClick={() => openEdit(row)} className="text-xs px-2 py-1 rounded font-medium bg-blue-50 text-blue-700 hover:bg-blue-100">
            Edit
          </button>
          <button onClick={() => setAssignTarget(row)} className="text-xs px-2 py-1 rounded font-medium bg-purple-50 text-purple-700 hover:bg-purple-100">
            Users
          </button>
          <button
            onClick={() => toggleMutation.mutate(row.id)}
            className={`text-xs px-2 py-1 rounded font-medium ${
              row.status === 'ACTIVE'
                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                : 'bg-green-100 text-green-700 hover:bg-green-200'
            }`}
          >
            {row.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <Layout title="Distributors">
      <DataTable
        columns={columnsWithActions}
        data={data?.content || []}
        loading={isLoading}
        totalPages={data?.totalPages || 1}
        currentPage={page}
        onPageChange={setPage}
        emptyMessage="No distributors found"
        actions={
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            + New Distributor
          </button>
        }
      />

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Create Distributor</h2>
            <form onSubmit={hsCreate(d => createMutation.mutate(d))} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Code</label>
                  <input {...regCreate('code', { required: true, maxLength: 30 })} className="input uppercase" placeholder="e.g. DIST01" />
                  {errCreate.code && <p className="text-red-500 text-xs mt-1">Required, max 30 chars</p>}
                </div>
                <div>
                  <label className="label">Name</label>
                  <input {...regCreate('name', { required: true })} className="input" />
                  {errCreate.name && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>
              </div>
              <div>
                <label className="label">Address</label>
                <textarea {...regCreate('address')} className="input" rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Phone</label>
                  <input {...regCreate('phone')} className="input" />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input type="email" {...regCreate('email')} className="input" />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn-primary flex-1" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating…' : 'Create'}
                </button>
                <button type="button" className="btn-secondary flex-1" onClick={() => { setShowCreate(false); resetCreate(); }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Edit Distributor</h2>
            <form onSubmit={hsEdit(d => updateMutation.mutate({ id: editTarget.id, data: d }))} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Code</label>
                  <input {...regEdit('code', { required: true, maxLength: 30 })} className="input uppercase" />
                  {errEdit.code && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>
                <div>
                  <label className="label">Name</label>
                  <input {...regEdit('name', { required: true })} className="input" />
                  {errEdit.name && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>
              </div>
              <div>
                <label className="label">Address</label>
                <textarea {...regEdit('address')} className="input" rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Phone</label>
                  <input {...regEdit('phone')} className="input" />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input type="email" {...regEdit('email')} className="input" />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn-primary flex-1" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
                </button>
                <button type="button" className="btn-secondary flex-1" onClick={() => setEditTarget(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User assignment modal */}
      {assignTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">
                Manage Users — <span className="text-blue-600">{assignTarget.name}</span>
              </h2>
              <button onClick={() => setAssignTarget(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Assigned users */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase mb-2">Assigned ({(assignedUsers || []).length})</p>
                <div className="space-y-1 max-h-56 overflow-y-auto">
                  {(assignedUsers || []).map(u => (
                    <div key={u.id} className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{u.fullName || u.username}</p>
                        <p className="text-xs text-gray-500">{u.roleName}</p>
                      </div>
                      <button
                        onClick={() => unassignMutation.mutate({ distId: assignTarget.id, userId: u.id })}
                        className="text-xs text-red-600 hover:text-red-800 font-medium"
                        disabled={unassignMutation.isPending}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  {(assignedUsers || []).length === 0 && (
                    <p className="text-xs text-gray-400 py-4 text-center">No users assigned</p>
                  )}
                </div>
              </div>

              {/* Available users */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase mb-2">Available ({unassignedUsers.length})</p>
                <div className="space-y-1 max-h-56 overflow-y-auto">
                  {unassignedUsers.map(u => (
                    <div key={u.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{u.fullName || u.username}</p>
                        <p className="text-xs text-gray-500">{u.roleName}</p>
                      </div>
                      <button
                        onClick={() => assignMutation.mutate({ distId: assignTarget.id, userId: u.id })}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        disabled={assignMutation.isPending}
                      >
                        Add
                      </button>
                    </div>
                  ))}
                  {unassignedUsers.length === 0 && (
                    <p className="text-xs text-gray-400 py-4 text-center">All users assigned</p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 text-right">
              <button className="btn-secondary" onClick={() => setAssignTarget(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

export default withAuth(DistributorsPage, [], 'MOD_DISTRIBUTORS');
