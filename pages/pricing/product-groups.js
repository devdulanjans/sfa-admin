import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import Layout from '../../components/Layout';
import { withAuth } from '../../lib/auth';
import { productGroupApi, productApi } from '../../lib/api';
import toast from 'react-hot-toast';

// ── Checkbox list: search + select-all + scrollable grid of checkboxes ─────────
function MemberCheckboxList({ allItems, selectedIds, setSelectedIds, getLabel, getSubLabel, searchPlaceholder }) {
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? allItems.filter(i =>
        getLabel(i)?.toLowerCase().includes(search.toLowerCase()) ||
        getSubLabel?.(i)?.toLowerCase().includes(search.toLowerCase()))
    : allItems;

  const allSelected = filtered.length > 0 && filtered.every(i => selectedIds.includes(i.id));

  function toggleOne(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
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
          <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
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
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-50 ${checked ? 'bg-blue-50' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleOne(item.id)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 shrink-0"
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

function ProductGroupsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['product-groups'],
    queryFn: () => productGroupApi.list({ size: 200 }).then(r => r.data),
  });
  const groups = data?.content ?? [];

  const { data: productsData } = useQuery({
    queryKey: ['products-picker'],
    queryFn: () => productApi.list({ size: 1000 }).then(r => r.data),
    enabled: showForm,
    staleTime: 60_000,
  });
  const allProducts = productsData?.content ?? [];

  const saveMutation = useMutation({
    mutationFn: (body) => editing
      ? productGroupApi.update(editing.id, body)
      : productGroupApi.create(body),
    onSuccess: () => {
      toast.success(editing ? 'Product group updated' : 'Product group created');
      qc.invalidateQueries({ queryKey: ['product-groups'] });
      closeForm();
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to save product group'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => productGroupApi.delete(id),
    onSuccess: () => {
      toast.success('Product group deleted');
      qc.invalidateQueries({ queryKey: ['product-groups'] });
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to delete product group'),
  });

  function openCreate() {
    setEditing(null);
    setSelectedIds([]);
    reset({ name: '', description: '' });
    setShowForm(true);
  }

  async function openEdit(group) {
    setEditing(group);
    reset({ name: group.name, description: group.description ?? '' });
    setShowForm(true);
    const { data: full } = await productGroupApi.get(group.id);
    setSelectedIds((full.members ?? []).map(m => m.id));
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setSelectedIds([]);
    reset();
  }

  function confirmDelete(group) {
    if (window.confirm(`Delete product group "${group.name}"? This cannot be undone.`)) {
      deleteMutation.mutate(group.id);
    }
  }

  function onSubmit(formData) {
    saveMutation.mutate({
      name: formData.name,
      description: formData.description,
      memberIds: selectedIds,
    });
  }

  return (
    <Layout title="Product Groups">
      <div className="space-y-5 w-full">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Group products together so a single batch price or promotion can apply to all of them at once.
            Membership is live — adding a product to a group later automatically applies existing rules to it.
          </p>
          {!showForm && (
            <button className="btn-primary shrink-0 ml-4" onClick={openCreate}>
              + New Product Group
            </button>
          )}
        </div>

        {/* ── Inline create/edit panel ────────────────────────────────────── */}
        {showForm && (
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">
                {editing ? `Edit: ${editing.name}` : 'New Product Group'}
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
                    placeholder="e.g. Dairy Products"
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
                <MemberCheckboxList
                  allItems={allProducts}
                  selectedIds={selectedIds}
                  setSelectedIds={setSelectedIds}
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
                No product groups yet. Click &quot;New Product Group&quot; to add one.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Description</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Members</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {groups.map(g => (
                    <tr key={g.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{g.name}</td>
                      <td className="px-4 py-3 text-gray-500">{g.description ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{g.memberCount}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(g)}
                            className="text-xs px-2 py-1 rounded font-medium bg-blue-50 text-blue-700 hover:bg-blue-100"
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

export default withAuth(ProductGroupsPage, ['SUPER_ADMIN', 'SALES_MANAGER'], 'MOD_PRODUCT_GROUPS');
