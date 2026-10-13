import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import Layout from '../../components/Layout';
import { withAuth } from '../../lib/auth';
import { customerGroupApi, customerApi, productApi } from '../../lib/api';
import toast from 'react-hot-toast';

// ── Checkbox list: search + select-all + scrollable grid of checkboxes ─────────
// [getCascadeIds] is optional: given a checked item, returns extra ids to select
// alongside it (e.g. a parent company's branches). Only applied on check — never
// on uncheck, so unchecking the parent doesn't drag its branches back out, and
// the user can freely un-select individual branches afterwards.
function MemberCheckboxList({ allItems, selectedIds, setSelectedIds, getLabel, getSubLabel, searchPlaceholder, getCascadeIds }) {
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? allItems.filter(i =>
        getLabel(i)?.toLowerCase().includes(search.toLowerCase()) ||
        getSubLabel?.(i)?.toLowerCase().includes(search.toLowerCase()))
    : allItems;

  const allSelected = filtered.length > 0 && filtered.every(i => selectedIds.includes(i.id));

  function toggleOne(item) {
    const id = item.id;
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      const cascadeIds = getCascadeIds?.(item) ?? [];
      return [...prev, id, ...cascadeIds.filter(cid => !prev.includes(cid))];
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !filtered.find(i => i.id === id)));
    } else {
      setSelectedIds(prev => [...prev, ...filtered.filter(i => !prev.includes(i.id)).map(i => i.id)]);
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-gray-200 bg-gray-50">
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input max-w-xs"
        />
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer shrink-0">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded border-gray-300 text-brand-600" />
          {allSelected ? 'Deselect all' : 'Select all'} ({filtered.length})
        </label>
      </div>
      <div className="max-h-96 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-8">
            {allItems.length === 0 ? 'Loading…' : 'No matches'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
            {filtered.map(item => {
              const checked = selectedIds.includes(item.id);
              return (
                <label
                  key={item.id}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-50 ${checked ? 'bg-brand-50' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleOne(item)}
                    className="h-4 w-4 rounded border-gray-300 text-brand-600 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{getLabel(item)}</p>
                    {getSubLabel && <p className="text-xs text-gray-500 truncate">{getSubLabel(item)}</p>}
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function CustomerGroupsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['customer-groups'],
    queryFn: () => customerGroupApi.list({ size: 200 }).then(r => r.data),
  });
  const groups = data?.content ?? [];

  // The checkbox list (and its parent->branches cascade-select) needs the FULL
  // customer list loaded, not just a page — a fixed size cap here silently drops
  // customers past it from search once the real count grows past that number.
  // Probe the total first, then fetch exactly that many in one go.
  const { data: customersData } = useQuery({
    queryKey: ['customers-picker'],
    queryFn: async () => {
      const probe = await customerApi.list({ size: 1 }).then(r => r.data);
      const total = probe.totalElements ?? probe.content?.length ?? 1000;
      return customerApi.list({ size: Math.max(total, 1) }).then(r => r.data);
    },
    enabled: showForm,
    staleTime: 60_000,
  });
  const allCustomers = customersData?.content ?? [];

  const { data: productsData } = useQuery({
    queryKey: ['products-picker'],
    queryFn: () => productApi.list({ size: 1000 }).then(r => r.data),
    enabled: showForm,
    staleTime: 60_000,
  });
  const allProducts = productsData?.content ?? [];

  const saveMutation = useMutation({
    mutationFn: (body) => editing
      ? customerGroupApi.update(editing.id, body)
      : customerGroupApi.create(body),
    onSuccess: () => {
      toast.success(editing ? 'Customer group updated' : 'Customer group created');
      qc.invalidateQueries({ queryKey: ['customer-groups'] });
      closeForm();
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to save customer group'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => customerGroupApi.delete(id),
    onSuccess: () => {
      toast.success('Customer group deleted');
      qc.invalidateQueries({ queryKey: ['customer-groups'] });
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to delete customer group'),
  });

  function openCreate() {
    setEditing(null);
    setSelectedIds([]);
    setSelectedProductIds([]);
    reset({ name: '', description: '' });
    setShowForm(true);
  }

  async function openEdit(group) {
    setEditing(group);
    reset({ name: group.name, description: group.description ?? '' });
    setShowForm(true);
    const { data: full } = await customerGroupApi.get(group.id);
    setSelectedIds((full.members ?? []).map(m => m.id));
    setSelectedProductIds((full.assignedProducts ?? []).map(p => p.id));
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setSelectedIds([]);
    setSelectedProductIds([]);
    reset();
  }

  function confirmDelete(group) {
    if (window.confirm(`Delete customer group "${group.name}"? This cannot be undone.`)) {
      deleteMutation.mutate(group.id);
    }
  }

  function onSubmit(formData) {
    saveMutation.mutate({
      name: formData.name,
      description: formData.description,
      memberIds: selectedIds,
      productIds: selectedProductIds,
    });
  }

  return (
    <Layout title="Customer Groups">
      <div className="space-y-5 w-full">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Group customers together so a single batch price or promotion can apply to all of them at once.
            Membership is live — adding a customer to a group later automatically applies existing rules to them.
          </p>
          {!showForm && (
            <button className="btn-primary shrink-0 ml-4" onClick={openCreate}>
              + New Customer Group
            </button>
          )}
        </div>

        {/* ── Inline create/edit panel ────────────────────────────────────── */}
        {showForm && (
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">
                {editing ? `Edit: ${editing.name}` : 'New Customer Group'}
              </h2>
              <button type="button" onClick={closeForm} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Name <span className="text-red-500">*</span></label>
                  <input
                    {...register('name', { required: 'Name is required', maxLength: 100 })}
                    className="input"
                    placeholder="e.g. VIP Customers"
                  />
                  {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                </div>
                <div>
                  <label className="label">Description</label>
                  <input {...register('description')} className="input" placeholder="Optional short description" />
                </div>
              </div>

              <div>
                <label className="label">
                  Members <span className="text-gray-400 font-normal ml-1">({selectedIds.length} selected)</span>
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Selecting a parent company also selects all of its branches — you can then un-select individual branches if needed.
                </p>
                <MemberCheckboxList
                  allItems={allCustomers}
                  selectedIds={selectedIds}
                  setSelectedIds={setSelectedIds}
                  getLabel={c => c.name}
                  getSubLabel={c => c.branchCount > 0
                    ? `${c.customerCode} • ${c.branchCount} branch${c.branchCount === 1 ? '' : 'es'}`
                    : c.customerCode}
                  searchPlaceholder="Search customers…"
                  getCascadeIds={c => allCustomers
                    .filter(x => x.parentCustomerId === c.id)
                    .map(x => x.id)}
                />
              </div>

              <div>
                <label className="label">
                  Assigned Products <span className="text-gray-400 font-normal ml-1">({selectedProductIds.length} selected)</span>
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Every member of this group will see these products (in addition to any products assigned to them directly) when a sales rep builds an order for them.
                </p>
                <MemberCheckboxList
                  allItems={allProducts}
                  selectedIds={selectedProductIds}
                  setSelectedIds={setSelectedProductIds}
                  getLabel={p => p.name}
                  getSubLabel={p => p.productCode}
                  searchPlaceholder="Search products…"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button type="submit" className="btn-primary" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? 'Saving…' : (editing ? 'Save Changes' : 'Create Group')}
                </button>
                <button type="button" className="btn-secondary" onClick={closeForm}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── List ─────────────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Loading…</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {groups.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                No customer groups yet. Click &quot;New Customer Group&quot; to add one.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Description</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Members</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Products</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {groups.map(g => (
                    <tr key={g.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{g.name}</td>
                      <td className="px-4 py-3 text-gray-500">{g.description ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{g.memberCount}</td>
                      <td className="px-4 py-3 text-gray-500">{g.assignedProductCount}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(g)}
                            className="text-xs px-2 py-1 rounded font-medium bg-brand-50 text-brand-700 hover:bg-brand-100"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => confirmDelete(g)}
                            className="text-xs px-2 py-1 rounded font-medium bg-red-50 text-red-700 hover:bg-red-100"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}

export default withAuth(CustomerGroupsPage, ['SUPER_ADMIN', 'SALES_MANAGER'], 'MOD_CUSTOMER_GROUPS');
