import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import Layout from '../../components/Layout';
import { withAuth } from '../../lib/auth';
import { categoryApi } from '../../lib/api';
import toast from 'react-hot-toast';

function CategoriesPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm();

  const { data: categories, isLoading } = useQuery({
    queryKey: ['product-categories'],
    queryFn: () => categoryApi.list().then(r => r.data),
  });

  const saveMutation = useMutation({
    mutationFn: (body) => editing
      ? categoryApi.update(editing.id, body)
      : categoryApi.create(body),
    onSuccess: () => {
      toast.success(editing ? 'Category updated' : 'Category created');
      qc.invalidateQueries({ queryKey: ['product-categories'] });
      closeForm();
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to save category'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => categoryApi.delete(id),
    onSuccess: () => {
      toast.success('Category deleted');
      qc.invalidateQueries({ queryKey: ['product-categories'] });
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to delete category'),
  });

  function openCreate() {
    setEditing(null);
    reset({ name: '', description: '', code: '' });
    setShowForm(true);
  }

  function openEdit(cat) {
    setEditing(cat);
    setValue('name', cat.name);
    setValue('description', cat.description ?? '');
    setValue('code', cat.code ?? '');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    reset();
  }

  function confirmDelete(cat) {
    if (window.confirm(`Delete category "${cat.name}"? Products assigned to this category will lose their category.`)) {
      deleteMutation.mutate(cat.id);
    }
  }

  return (
    <Layout title="Product Categories">
      <div className="max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-500">
            Manage product categories. These appear in the product creation form.
          </p>
          <button className="btn-primary" onClick={openCreate}>
            + New Category
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Loading…</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {!categories?.length ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                No categories yet. Click "New Category" to add one.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Code</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Description</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {categories.map(cat => (
                    <tr key={cat.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{cat.name}</td>
                      <td className="px-4 py-3 text-gray-500 font-mono">{cat.code ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{cat.description ?? '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(cat)}
                            className="text-xs px-2 py-1 rounded font-medium bg-blue-50 text-blue-700 hover:bg-blue-100"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => confirmDelete(cat)}
                            className="text-xs px-2 py-1 rounded font-medium bg-red-50 text-red-700 hover:bg-red-100"
                            disabled={deleteMutation.isPending}
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

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">
              {editing ? 'Edit Category' : 'New Category'}
            </h2>
            <form onSubmit={handleSubmit(d => saveMutation.mutate(d))} className="space-y-3">
              <div>
                <label className="label">Name <span className="text-red-500">*</span></label>
                <input
                  {...register('name', { required: 'Name is required', maxLength: 100 })}
                  className="input"
                  placeholder="e.g. Beverages"
                />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
              </div>
              <div>
                <label className="label">
                  Code
                  <span className="ml-1 font-normal text-gray-400 text-xs">(used to build invoice numbers, e.g. "IT")</span>
                </label>
                <input
                  {...register('code', { maxLength: 10 })}
                  className="input font-mono uppercase"
                  placeholder="e.g. IT"
                  maxLength={10}
                />
                {errors.code && <p className="text-red-500 text-xs mt-1">Max 10 characters</p>}
              </div>
              <div>
                <label className="label">Description</label>
                <input
                  {...register('description')}
                  className="input"
                  placeholder="Optional short description"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn-primary flex-1" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? 'Saving…' : (editing ? 'Update' : 'Create')}
                </button>
                <button type="button" className="btn-secondary flex-1" onClick={closeForm}>
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

export default withAuth(CategoriesPage, [], 'MOD_SETTINGS_CATEGORIES');
