import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import Layout from '../../components/Layout';
import { withAuth } from '../../lib/auth';
import { reasonApi } from '../../lib/api';
import toast from 'react-hot-toast';

const TYPES = [
  { value: 'DAMAGE', label: 'Damage Reasons' },
  { value: 'RETURN', label: 'Return Reasons' },
];

function ReasonsPage() {
  const qc = useQueryClient();
  const [type, setType] = useState('DAMAGE');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm();

  const { data: reasons, isLoading } = useQuery({
    queryKey: ['reasons', type],
    queryFn: () => reasonApi.list(type).then(r => r.data),
  });

  const sorted = [...(reasons ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);

  const saveMutation = useMutation({
    mutationFn: (body) => editing
      ? reasonApi.update(editing.id, { ...body, type })
      : reasonApi.create({ ...body, type }),
    onSuccess: () => {
      toast.success(editing ? 'Reason updated' : 'Reason added');
      qc.invalidateQueries({ queryKey: ['reasons', type] });
      closeForm();
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to save reason'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => reasonApi.delete(id),
    onSuccess: () => {
      toast.success('Reason removed');
      qc.invalidateQueries({ queryKey: ['reasons', type] });
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to remove reason'),
  });

  function openCreate() {
    setEditing(null);
    reset({ label: '', allowFreeText: false });
    setShowForm(true);
  }

  function openEdit(reason) {
    setEditing(reason);
    setValue('label', reason.label);
    setValue('allowFreeText', reason.allowFreeText);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    reset();
  }

  function confirmDelete(reason) {
    if (window.confirm(
      `Remove reason "${reason.label}"? Reps will no longer be able to select it — existing damage/return records keep their saved text.`
    )) {
      deleteMutation.mutate(reason.id);
    }
  }

  // Swaps sortOrder with the neighbor in [direction] — simplest reorder UI that
  // fits the existing PUT /api/reasons/{id} shape without a dedicated reorder endpoint.
  async function move(reason, direction) {
    const idx = sorted.findIndex(r => r.id === reason.id);
    const swapWith = sorted[idx + direction];
    if (!swapWith) return;
    try {
      await Promise.all([
        reasonApi.update(reason.id, {
          type, label: reason.label, allowFreeText: reason.allowFreeText, sortOrder: swapWith.sortOrder,
        }),
        reasonApi.update(swapWith.id, {
          type, label: swapWith.label, allowFreeText: swapWith.allowFreeText, sortOrder: reason.sortOrder,
        }),
      ]);
      qc.invalidateQueries({ queryKey: ['reasons', type] });
    } catch (err) {
      toast.error(err.response?.data?.detail ?? 'Failed to reorder');
    }
  }

  return (
    <Layout title="Return & Damage Reasons">
      <div className="w-full">
        <p className="text-sm text-gray-500 mb-4">
          Manage the reason options reps pick from when recording a damage or return on the mobile app.
          Changes sync to devices automatically on their next login/sync — no app update required.
        </p>

        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {TYPES.map(t => (
              <button
                key={t.value}
                onClick={() => setType(t.value)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${
                  type === t.value ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button className="btn-primary" onClick={openCreate}>
            + New Reason
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Loading…</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {!sorted.length ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                No reasons yet. Click "New Reason" to add one.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 font-medium text-gray-600 w-20">Order</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Reason</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Free-text field</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sorted.map((reason, idx) => (
                    <tr key={reason.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => move(reason, -1)}
                            disabled={idx === 0}
                            className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:bg-gray-100 disabled:opacity-30"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => move(reason, 1)}
                            disabled={idx === sorted.length - 1}
                            className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:bg-gray-100 disabled:opacity-30"
                          >
                            ↓
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{reason.label}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {reason.allowFreeText ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">Yes</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(reason)}
                            className="text-xs px-2 py-1 rounded font-medium bg-blue-50 text-blue-700 hover:bg-blue-100"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => confirmDelete(reason)}
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
              {editing ? 'Edit Reason' : `New ${type === 'DAMAGE' ? 'Damage' : 'Return'} Reason`}
            </h2>
            <form
              onSubmit={handleSubmit(d => saveMutation.mutate({ label: d.label, allowFreeText: !!d.allowFreeText }))}
              className="space-y-3"
            >
              <div>
                <label className="label">Reason text <span className="text-red-500">*</span></label>
                <input
                  {...register('label', { required: 'Reason text is required', maxLength: 200 })}
                  className="input"
                  placeholder="e.g. Damaged in Transit"
                />
                {errors.label && <p className="text-red-500 text-xs mt-1">{errors.label.message}</p>}
              </div>
              <div className="flex items-start gap-2">
                <input type="checkbox" id="allowFreeText" {...register('allowFreeText')} className="mt-1" />
                <label htmlFor="allowFreeText" className="text-sm text-gray-700">
                  Show a free-text field when this reason is selected
                  <span className="block text-xs text-gray-400">Use this for an "Other" style option.</span>
                </label>
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

export default withAuth(ReasonsPage, [], 'MOD_SETTINGS_REASONS');
