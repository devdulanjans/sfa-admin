import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import { withAuth, useAuth } from '../../lib/auth';
import { useAccessibleTenants } from '../../lib/hooks';
import { userApi, distributorApi, customerApi, customerGroupApi } from '../../lib/api';
import toast from 'react-hot-toast';

function UsersPage() {
  const qc = useQueryClient();
  const { user: currentUser } = useAuth();
  const multiTenantEnabled = currentUser?.multiTenantEnabled ?? true;
  const [page, setPage] = useState(0);
  const [filterDistributorId, setFilterDistributorId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [resetPwUser, setResetPwUser] = useState(null);

  // ── Recovery accounts (platformowner / superadmin) — hidden from the list
  // above, view-only, revealed only with the correct recovery key ──────────
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryKeyInput, setRecoveryKeyInput] = useState('');
  const [recoveryAccounts, setRecoveryAccounts] = useState(null);
  const recoveryMutation = useMutation({
    mutationFn: (key) => userApi.recovery(key).then(r => r.data),
    onSuccess: (data) => setRecoveryAccounts(data),
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Invalid recovery key'),
  });

  // ── Create form ──────────────────────────────────────────────────────────
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm();
  const selectedRoleId       = watch('roleId');
  const selectedCustomerIds  = watch('customerIds') || [];
  const selectedGroupIds     = watch('customerGroupIds') || [];
  const selectedTenantIds    = watch('tenantIds') || [];

  // ── Edit form ────────────────────────────────────────────────────────────
  const {
    register: eReg,
    handleSubmit: eHandleSubmit,
    reset: eReset,
    watch: eWatch,
    formState: { errors: eErrors },
  } = useForm();
  const eSelectedRoleId      = eWatch('roleId');
  const eSelectedCustomerIds = eWatch('customerIds') || [];
  const eSelectedGroupIds    = eWatch('customerGroupIds') || [];
  const eSelectedTenantIds   = eWatch('tenantIds') || [];

  // ── Reset-password form (its own dedicated flow, not bundled into Edit User) ────
  const {
    register: pReg,
    handleSubmit: pHandleSubmit,
    reset: pReset,
    watch: pWatch,
    formState: { errors: pErrors },
  } = useForm({ defaultValues: { forceChangeOnNextLogin: true } });
  const pNewPassword = pWatch('newPassword');

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['users', page, filterDistributorId],
    queryFn: () => userApi.list({
      page,
      size: 20,
      ...(filterDistributorId ? { distributorId: filterDistributorId } : {}),
    }).then(r => r.data),
    keepPreviousData: true,
  });

  const { data: roles, isLoading: rolesLoading, isError: rolesError } = useQuery({
    queryKey: ['roles'],
    queryFn: () => userApi.roles().then(r => r.data),
    retry: 2,
    staleTime: 0,
  });

  const { data: distributorsData, isLoading: distLoading } = useQuery({
    queryKey: ['distributors-all'],
    queryFn: () => distributorApi.list({ size: 100 }).then(r => r.data),
    retry: 2,
    staleTime: 0,
  });

  // Own channels only for a non-Super-Admin actor (e.g. an ADMIN managing two channels
  // can only ever hand out those two) — GET /api/tenants (the full platform list) is
  // Super-Admin-only, so this must go through /api/tenants/my for anyone else.
  const { tenants: allTenants, isLoading: tenantsLoading } = useAccessibleTenants();

  const { data: customersData } = useQuery({
    queryKey: ['customers-all'],
    queryFn: () => customerApi.list({ size: 500, sort: 'name' }).then(r => r.data),
    enabled: showForm || !!editUser,
  });

  const { data: customerGroupsData } = useQuery({
    queryKey: ['customer-groups-all'],
    queryFn: () => customerGroupApi.list({ size: 200 }).then(r => r.data),
    enabled: showForm || !!editUser,
  });

  const allDistributors  = distributorsData?.content?.filter(d => d.status === 'ACTIVE') ?? [];
  const allCustomers     = customersData?.content?.filter(c => c.status === 'ACTIVE') ?? [];
  const allCustomerGroups = customerGroupsData?.content ?? [];

  // ── Role helpers (create form) ───────────────────────────────────────────
  const selectedRole   = (roles || []).find(r => r.id === selectedRoleId);
  const isSalesRole    = selectedRole?.name?.toUpperCase().includes('SALES');
  const isSalesRep     = selectedRole?.name === 'SALES_REP';

  const checkedCustomerIds = Array.isArray(selectedCustomerIds)
    ? selectedCustomerIds.filter(Boolean)
    : (selectedCustomerIds ? [selectedCustomerIds] : []);
  const hasCustomersSelected = checkedCustomerIds.length > 0;

  const checkedGroupIds = Array.isArray(selectedGroupIds)
    ? selectedGroupIds.filter(Boolean)
    : (selectedGroupIds ? [selectedGroupIds] : []);

  // A distributor can belong to several channels at once — once the rep's channel(s) are
  // picked above, only a distributor sharing at least one of those channels makes sense to
  // offer here. Before any channel is checked (a fresh Create form) there's nothing to
  // narrow by yet, so every active distributor stays available rather than showing a
  // confusing empty list.
  const checkedTenantIds = Array.isArray(selectedTenantIds)
    ? selectedTenantIds.filter(Boolean)
    : (selectedTenantIds ? [selectedTenantIds] : []);
  const formDistributors = checkedTenantIds.length > 0
    ? allDistributors.filter(d => d.tenants?.some(t => checkedTenantIds.includes(t.id)))
    : allDistributors;

  // ── Role helpers (edit form) ─────────────────────────────────────────────
  const eSelectedRole   = (roles || []).find(r => r.id === eSelectedRoleId);
  const eIsSalesRole    = eSelectedRole?.name?.toUpperCase().includes('SALES');
  const eIsSalesRep     = eSelectedRole?.name === 'SALES_REP';

  const eCheckedCustomerIds = Array.isArray(eSelectedCustomerIds)
    ? eSelectedCustomerIds.filter(Boolean)
    : (eSelectedCustomerIds ? [eSelectedCustomerIds] : []);
  const eHasCustomersSelected = eCheckedCustomerIds.length > 0;

  const eCheckedGroupIds = Array.isArray(eSelectedGroupIds)
    ? eSelectedGroupIds.filter(Boolean)
    : (eSelectedGroupIds ? [eSelectedGroupIds] : []);

  const eCheckedTenantIds = Array.isArray(eSelectedTenantIds)
    ? eSelectedTenantIds.filter(Boolean)
    : (eSelectedTenantIds ? [eSelectedTenantIds] : []);
  const eFormDistributors = eCheckedTenantIds.length > 0
    ? allDistributors.filter(d => d.tenants?.some(t => eCheckedTenantIds.includes(t.id)))
    : allDistributors;

  // ── Mutations ────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (body) => userApi.create(body),
    onSuccess: () => {
      toast.success('User created');
      qc.invalidateQueries({ queryKey: ['users'] });
      setShowForm(false);
      reset();
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to create user'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }) => userApi.update(id, body),
    onSuccess: () => {
      toast.success('User updated');
      qc.invalidateQueries({ queryKey: ['users'] });
      setEditUser(null);
      eReset();
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to update user'),
  });

  const toggleMutation = useMutation({
    mutationFn: (id) => userApi.toggleStatus(id),
    onSuccess: () => {
      toast.success('Status updated');
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, body }) => userApi.resetPassword(id, body),
    onSuccess: () => {
      toast.success('Password reset');
      qc.invalidateQueries({ queryKey: ['users'] });
      setResetPwUser(null);
      pReset({ forceChangeOnNextLogin: true });
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to reset password'),
  });

  // ── Submit handlers ──────────────────────────────────────────────────────
  function onSubmit(data) {
    const payload = {
      ...data,
      distributorIds: isSalesRole && data.distributorIds
        ? (Array.isArray(data.distributorIds) ? data.distributorIds : [data.distributorIds])
        : [],
      customerIds: isSalesRep && data.customerIds
        ? (Array.isArray(data.customerIds) ? data.customerIds.filter(Boolean) : [data.customerIds].filter(Boolean))
        : [],
      customerGroupIds: isSalesRep && data.customerGroupIds
        ? (Array.isArray(data.customerGroupIds) ? data.customerGroupIds.filter(Boolean) : [data.customerGroupIds].filter(Boolean))
        : [],
      tenantIds: data.tenantIds
        ? (Array.isArray(data.tenantIds) ? data.tenantIds.filter(Boolean) : [data.tenantIds].filter(Boolean))
        : [],
    };
    createMutation.mutate(payload);
  }

  function onEditSubmit(data) {
    const payload = {
      fullName: data.fullName,
      email: data.email,
      roleId: data.roleId,
      distributorIds: eIsSalesRole && data.distributorIds
        ? (Array.isArray(data.distributorIds) ? data.distributorIds : [data.distributorIds]).filter(Boolean)
        : [],
      customerIds: eIsSalesRep && data.customerIds
        ? (Array.isArray(data.customerIds) ? data.customerIds : [data.customerIds]).filter(Boolean)
        : [],
      customerGroupIds: eIsSalesRep && data.customerGroupIds
        ? (Array.isArray(data.customerGroupIds) ? data.customerGroupIds : [data.customerGroupIds]).filter(Boolean)
        : [],
      tenantIds: data.tenantIds
        ? (Array.isArray(data.tenantIds) ? data.tenantIds : [data.tenantIds]).filter(Boolean)
        : [],
    };
    updateMutation.mutate({ id: editUser.id, body: payload });
  }

  function openEdit(user) {
    setEditUser(user);
    eReset({
      fullName:       user.fullName,
      email:          user.email,
      roleId:         user.roleId,
      distributorIds:   user.distributors?.map(d => d.id) ?? [],
      customerIds:      user.assignedCustomerIds ?? [],
      customerGroupIds: user.customerGroupIds ?? [],
      tenantIds:        user.tenants?.map(t => t.id) ?? [],
    });
  }

  function onResetPasswordSubmit(data) {
    resetPasswordMutation.mutate({
      id: resetPwUser.id,
      body: {
        newPassword: data.newPassword,
        forceChangeOnNextLogin: !!data.forceChangeOnNextLogin,
      },
    });
  }

  function closeCreate()  { setShowForm(false);   reset(); }
  function closeEdit()    { setEditUser(null);     eReset(); }
  function closeResetPw() { setResetPwUser(null);  pReset({ forceChangeOnNextLogin: true }); }

  // ── Table columns ─────────────────────────────────────────────────────────
  const columns = [
    { key: 'username', label: 'Username', render: (v) => <span className="font-medium">{v}</span> },
    { key: 'fullName', label: 'Full Name' },
    { key: 'email',    label: 'Email' },
    { key: 'roleName', label: 'Role',    render: (v) => <span className="badge-blue">{v}</span> },
    {
      key: 'distributors',
      label: 'Distributors',
      render: (v) => {
        if (!v?.length) return <span className="text-gray-400 text-xs">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {v.map(d => (
              <span key={d.id} className="text-xs font-mono bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">
                {d.code}
              </span>
            ))}
          </div>
        );
      },
    },
    ...(multiTenantEnabled ? [{
      key: 'tenants',
      label: 'Channels',
      render: (v) => {
        if (!v?.length) return <span className="text-gray-400 text-xs">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {v.map(t => (
              <span key={t.id} className="text-xs font-medium bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">
                {t.name}
              </span>
            ))}
          </div>
        );
      },
    }] : []),
    {
      key: 'customerAccessAll',
      label: 'Customer Access',
      render: (v, row) => {
        if (row.roleName !== 'SALES_REP') return <span className="text-gray-400 text-xs">—</span>;
        if (v) return <span className="text-xs bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded font-medium">All customers</span>;
        const parts = [];
        if (row.assignedCustomerCount > 0) parts.push(`${row.assignedCustomerCount} customer${row.assignedCustomerCount !== 1 ? 's' : ''}`);
        if (row.customerGroupCount > 0) parts.push(`${row.customerGroupCount} group${row.customerGroupCount !== 1 ? 's' : ''}`);
        return (
          <span className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">
            {parts.join(' + ')}
          </span>
        );
      },
    },
    {
      key: 'status', label: 'Status',
      render: (v, row) => (
        <div className="flex items-center gap-1.5">
          <StatusBadge status={v} />
          {row.mustChangePassword && (
            <span
              className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-medium"
              title="Must set a new password at next login"
            >
              Pending reset
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'actions', label: '',
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => openEdit(row)}
            className="text-xs px-2 py-1 rounded font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            Edit
          </button>
          <button
            onClick={() => setResetPwUser(row)}
            className="text-xs px-2 py-1 rounded font-medium bg-teal-50 text-teal-700 hover:bg-teal-100"
          >
            Reset Password
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

  // ── Shared sub-components ─────────────────────────────────────────────────
  function RoleSelect({ reg, err, loading, error, roleList }) {
    if (loading) return (
      <div className="input text-gray-400 text-sm flex items-center gap-2">
        <svg className="animate-spin h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
        Loading roles…
      </div>
    );
    if (error) return (
      <div className="text-red-500 text-xs p-2 bg-red-50 border border-red-200 rounded-lg">
        Could not load roles — check that the backend is running.
      </div>
    );
    return (
      <select {...reg} className="input">
        <option value="">Select role…</option>
        {(roleList || []).map(r => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>
    );
  }

  function DistributorCheckboxes({ reg, list, loading, filteredByChannel }) {
    if (loading) return <p className="text-xs text-gray-400 mt-1">Loading distributors…</p>;
    if (!list.length) return (
      <p className="text-xs text-gray-400 mt-1">
        {filteredByChannel ? 'No active distributors under the selected channel(s).' : 'No active distributors available.'}
      </p>
    );
    return (
      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-44 overflow-y-auto">
        {list.map(d => (
          <label key={d.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50">
            <input type="checkbox" value={d.id} {...reg} className="rounded border-gray-300 text-indigo-600" />
            <div>
              <span className="text-sm font-medium text-gray-900">{d.name}</span>
              <span className="ml-2 text-xs font-mono text-gray-500">{d.code}</span>
            </div>
          </label>
        ))}
      </div>
    );
  }

  function TenantCheckboxes({ reg, list, loading }) {
    if (loading) return <p className="text-xs text-gray-400 mt-1">Loading channels…</p>;
    if (!list.length) return <p className="text-xs text-gray-400 mt-1">No active channels available.</p>;
    return (
      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-44 overflow-y-auto">
        {list.map(t => (
          <label key={t.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50">
            <input type="checkbox" value={t.id} {...reg} className="rounded border-gray-300 text-amber-600" />
            <div>
              <span className="text-sm font-medium text-gray-900">{t.name}</span>
              <span className="ml-2 text-xs font-mono text-gray-500">{t.code}</span>
            </div>
          </label>
        ))}
      </div>
    );
  }

  function CustomerCheckboxes({ reg, list, hasSelected, checkedCount }) {
    return (
      <div>
        {!hasSelected ? (
          <div className="flex items-start gap-2 mb-2 p-2.5 bg-yellow-50 border border-yellow-200 rounded-lg">
            <svg className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            <p className="text-xs text-yellow-800">
              <strong>No customers selected</strong> — this sales rep will have access to <strong>all customers</strong>.
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-2 mb-2 p-2.5 bg-brand-50 border border-brand-200 rounded-lg">
            <svg className="w-4 h-4 text-brand-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
            </svg>
            <p className="text-xs text-brand-800">
              <strong>{checkedCount} customer{checkedCount !== 1 ? 's' : ''} selected</strong> — restricted access.
            </p>
          </div>
        )}
        {list.length === 0 ? (
          <p className="text-xs text-gray-400">No active customers available.</p>
        ) : (
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-52 overflow-y-auto">
            {list.map(c => (
              <label key={c.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50">
                <input type="checkbox" value={c.id} {...reg} className="rounded border-gray-300 text-brand-600" />
                <div>
                  <span className="text-sm font-medium text-gray-900">{c.name}</span>
                  <span className="ml-2 text-xs font-mono text-gray-500">{c.customerCode}</span>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>
    );
  }

  function GroupCheckboxes({ reg, list, checkedCount }) {
    return (
      <div>
        <p className="text-xs text-gray-500 mb-2">
          Every customer in a selected group is added to this rep's access, on top of any customers selected above.
          {checkedCount > 0 && <strong> {checkedCount} group{checkedCount !== 1 ? 's' : ''} selected.</strong>}
        </p>
        {list.length === 0 ? (
          <p className="text-xs text-gray-400">No customer groups available.</p>
        ) : (
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-44 overflow-y-auto">
            {list.map(g => (
              <label key={g.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50">
                <input type="checkbox" value={g.id} {...reg} className="rounded border-gray-300 text-violet-600" />
                <div>
                  <span className="text-sm font-medium text-gray-900">{g.name}</span>
                  {g.memberCount != null && (
                    <span className="ml-2 text-xs text-gray-500">{g.memberCount} customer{g.memberCount !== 1 ? 's' : ''}</span>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Layout title="Users">
      {/* Distributor filter */}
      <div className="mb-3 flex items-center gap-3">
        <label className="text-sm text-gray-600 font-medium">Filter by distributor:</label>
        <select
          value={filterDistributorId}
          onChange={e => { setFilterDistributorId(e.target.value); setPage(0); }}
          className="input w-56 text-sm"
        >
          <option value="">All distributors</option>
          {allDistributors.map(d => (
            <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
          ))}
        </select>
        {filterDistributorId && (
          <button
            onClick={() => { setFilterDistributorId(''); setPage(0); }}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Clear
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={data?.content || []}
        loading={isLoading}
        totalPages={data?.totalPages || 1}
        currentPage={page}
        onPageChange={setPage}
        emptyMessage="No users found"
        actions={
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            + New User
          </button>
        }
      />

      {/* ── Recovery accounts (platformowner / superadmin) ───────────────────
          Not part of the normal Users list — view-only, key-gated. */}
      <div className="mt-4">
        <button
          className="text-xs text-gray-400 hover:text-gray-600 underline"
          onClick={() => setShowRecovery(v => !v)}
        >
          Recovery accounts
        </button>
        {showRecovery && (
          <div className="mt-2 card p-4 max-w-lg">
            <p className="text-xs text-gray-500 mb-3">
              View-only. These accounts are not editable here — enter the recovery key to reveal them.
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                className="input flex-1"
                placeholder="Recovery key"
                value={recoveryKeyInput}
                onChange={e => setRecoveryKeyInput(e.target.value)}
              />
              <button
                className="btn-secondary"
                disabled={!recoveryKeyInput || recoveryMutation.isPending}
                onClick={() => recoveryMutation.mutate(recoveryKeyInput)}
              >
                {recoveryMutation.isPending ? 'Checking…' : 'View'}
              </button>
            </div>
            {recoveryAccounts && (
              <div className="mt-3 border border-gray-200 rounded-lg divide-y divide-gray-100">
                {recoveryAccounts.map(u => (
                  <div key={u.id} className="px-3 py-2 flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium">{u.username}</span>
                      <span className="ml-2 text-xs text-gray-500">{u.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="badge-blue text-xs">{u.roleName}</span>
                      <StatusBadge status={u.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Create modal ───────────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Create User</h2>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Username *</label>
                  <input {...register('username', { required: true, minLength: 3 })} className="input" />
                  {errors.username && <p className="text-red-500 text-xs mt-1">Min 3 characters</p>}
                </div>
                <div>
                  <label className="label">Full Name *</label>
                  <input {...register('fullName', { required: true })} className="input" />
                  {errors.fullName && <p className="text-red-500 text-xs mt-1">Required</p>}
                </div>
              </div>

              <div>
                <label className="label">Email *</label>
                <input type="email" {...register('email', { required: true })} className="input" />
                {errors.email && <p className="text-red-500 text-xs mt-1">Required</p>}
              </div>

              <div>
                <label className="label">Password *</label>
                <input type="password" {...register('password', { required: true, minLength: 8 })} className="input" />
                {errors.password && <p className="text-red-500 text-xs mt-1">Min 8 characters</p>}
              </div>

              <div>
                <label className="label">Role *</label>
                <RoleSelect
                  reg={register('roleId', { required: true })}
                  err={errors.roleId}
                  loading={rolesLoading}
                  error={rolesError}
                  roleList={roles}
                />
                {errors.roleId && <p className="text-red-500 text-xs mt-1">Required</p>}
              </div>

              {multiTenantEnabled && (
                <div>
                  <label className="label">Assign Channels</label>
                  <TenantCheckboxes
                    reg={register('tenantIds')}
                    list={allTenants}
                    loading={tenantsLoading}
                  />
                </div>
              )}

              {isSalesRole && (
                <div>
                  <label className="label">Assign Distributors</label>
                  <DistributorCheckboxes
                    reg={register('distributorIds')}
                    list={formDistributors}
                    loading={distLoading}
                    filteredByChannel={checkedTenantIds.length > 0}
                  />
                </div>
              )}

              {isSalesRep && (
                <div>
                  <label className="label">Assign Customers</label>
                  <CustomerCheckboxes
                    reg={register('customerIds')}
                    list={allCustomers}
                    hasSelected={hasCustomersSelected}
                    checkedCount={checkedCustomerIds.length}
                  />
                </div>
              )}

              {isSalesRep && (
                <div>
                  <label className="label">Assign Customer Groups</label>
                  <GroupCheckboxes
                    reg={register('customerGroupIds')}
                    list={allCustomerGroups}
                    checkedCount={checkedGroupIds.length}
                  />
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn-primary flex-1" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating…' : 'Create User'}
                </button>
                <button type="button" className="btn-secondary flex-1" onClick={closeCreate}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit modal ─────────────────────────────────────────────────────── */}
      {editUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">Edit User</h2>
              <span className="text-xs font-mono text-gray-400">{editUser.username}</span>
            </div>
            <form onSubmit={eHandleSubmit(onEditSubmit)} className="space-y-3">
              <div>
                <label className="label">Full Name *</label>
                <input {...eReg('fullName', { required: true })} className="input" />
                {eErrors.fullName && <p className="text-red-500 text-xs mt-1">Required</p>}
              </div>

              <div>
                <label className="label">Email *</label>
                <input type="email" {...eReg('email', { required: true })} className="input" />
                {eErrors.email && <p className="text-red-500 text-xs mt-1">Required</p>}
              </div>

              <div>
                <label className="label">Role *</label>
                <RoleSelect
                  reg={eReg('roleId', { required: true })}
                  err={eErrors.roleId}
                  loading={rolesLoading}
                  error={rolesError}
                  roleList={roles}
                />
                {eErrors.roleId && <p className="text-red-500 text-xs mt-1">Required</p>}
              </div>

              {multiTenantEnabled && (
                <div>
                  <label className="label">Assign Channels</label>
                  <TenantCheckboxes
                    reg={eReg('tenantIds')}
                    list={allTenants}
                    loading={tenantsLoading}
                  />
                </div>
              )}

              {eIsSalesRole && (
                <div>
                  <label className="label">Assign Distributors</label>
                  <DistributorCheckboxes
                    reg={eReg('distributorIds')}
                    list={eFormDistributors}
                    loading={distLoading}
                    filteredByChannel={eCheckedTenantIds.length > 0}
                  />
                </div>
              )}

              {eIsSalesRep && (
                <div>
                  <label className="label">Assign Customers</label>
                  <CustomerCheckboxes
                    reg={eReg('customerIds')}
                    list={allCustomers}
                    hasSelected={eHasCustomersSelected}
                    checkedCount={eCheckedCustomerIds.length}
                  />
                </div>
              )}

              {eIsSalesRep && (
                <div>
                  <label className="label">Assign Customer Groups</label>
                  <GroupCheckboxes
                    reg={eReg('customerGroupIds')}
                    list={allCustomerGroups}
                    checkedCount={eCheckedGroupIds.length}
                  />
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn-primary flex-1" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
                </button>
                <button type="button" className="btn-secondary flex-1" onClick={closeEdit}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Reset Password modal — its own dedicated flow, separate from Edit User ── */}
      {resetPwUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">Reset Password</h2>
              <span className="text-xs font-mono text-gray-400">{resetPwUser.username}</span>
            </div>
            <form onSubmit={pHandleSubmit(onResetPasswordSubmit)} className="space-y-3">
              <div>
                <label className="label">New Password *</label>
                <input
                  type="password"
                  {...pReg('newPassword', { required: true, minLength: 8 })}
                  className="input"
                  autoComplete="new-password"
                />
                {pErrors.newPassword && <p className="text-red-500 text-xs mt-1">At least 8 characters</p>}
              </div>

              <div>
                <label className="label">Confirm New Password *</label>
                <input
                  type="password"
                  {...pReg('confirmPassword', {
                    required: true,
                    validate: (v) => v === pNewPassword || 'Passwords do not match',
                  })}
                  className="input"
                  autoComplete="new-password"
                />
                {pErrors.confirmPassword && <p className="text-red-500 text-xs mt-1">{pErrors.confirmPassword.message}</p>}
              </div>

              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" {...pReg('forceChangeOnNextLogin')} className="mt-0.5 rounded border-gray-300 text-teal-600" />
                <span className="text-xs text-gray-600">
                  Require this account to set its own new password at next login
                </span>
              </label>

              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn-primary flex-1" disabled={resetPasswordMutation.isPending}>
                  {resetPasswordMutation.isPending ? 'Resetting…' : 'Reset Password'}
                </button>
                <button type="button" className="btn-secondary flex-1" onClick={closeResetPw}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}

export default withAuth(UsersPage, [], 'MOD_USER_LIST');
