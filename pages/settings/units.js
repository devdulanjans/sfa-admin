import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import Layout from '../../components/Layout';
import { withAuth } from '../../lib/auth';
import { unitApi } from '../../lib/api';
import toast from 'react-hot-toast';

function UnitsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm();

  const { data: units, isLoading } = useQuery({
    queryKey: ['units'],
    queryFn: () => unitApi.list().then(r => r.data),
  });

  const saveMutation = useMutation({
    mutationFn: (body) => editing
      ? unitApi.update(editing.id, body)
      : unitApi.create(body),
    onSuccess: () => {
      toast.success(editing ? 'Unit updated' : 'Unit created');
      qc.invalidateQueries({ queryKey: ['units'] });
      closeForm();
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to save unit'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => unitApi.delete(id),
    onSuccess: () => {
      toast.success('Unit deleted');
      qc.invalidateQueries({ queryKey: ['units'] });
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Cannot delete — unit may be in use by products'),
  });

  function openCreate() {
    setEditing(null);
    reset({ name: '', abbreviation: '' });
    setShowForm(true);
  }

  function openEdit(unit) {
    setEditing(unit);
    setValue('name', unit.name);
    setValue('abbreviation', unit.abbreviation ?? '');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    reset();
  }

  function confirmDelete(unit) {
    if (window.confirm(`Delete unit "${unit.name}"? This will fail if any products are using it.`)) {
      deleteMutation.mutate(unit.id);
    }
  }

  return (
    <Layout title="Units of Measure">
      <div className="max-w-xl">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-500">
            Manage units of measure used when creating products.
          </p>
          <button className="btn-primary" onClick={openCreate}>
            + New Unit
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Loading…</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {!units?.length ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                No units yet. Click "New Unit" to add one.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Abbreviation</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {units.map(unit => (
                    <tr key={unit.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{unit.name}</td>
                      <td className="px-4 py-3">
                        {unit.abbreviation
                          ? <span className="font-mono text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{unit.abbreviation}</span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(unit)}
                            className="text-xs px-2 py-1 rounded font-medium bg-blue-50 text-blue-700 hover:bg-blue-100"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => confirmDelete(unit)}
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
              {editing ? 'Edit Unit' : 'New Unit of Measure'}
            </h2>
            <form onSubmit={handleSubmit(d => saveMutation.mutate(d))} className="space-y-3">
              <div>
                <label className="label">Name <span className="text-red-500">*</span></label>
                <input
                  {...register('name', { required: 'Name is required', maxLength: { value: 50, message: 'Max 50 characters' } })}
                  className="input"
                  placeholder="e.g. Kilogram"
                />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
              </div>
              <div>
                <label className="label">Abbreviation</label>
                <input
                  {...register('abbreviation', { maxLength: { value: 10, message: 'Max 10 characters' } })}
                  className="input"
                  placeholder="e.g. KG"
                />
                {errors.abbreviation && <p className="text-red-500 text-xs mt-1">{errors.abbreviation.message}</p>}
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

export default withAuth(UnitsPage, [], 'MOD_SETTINGS_UNITS');
