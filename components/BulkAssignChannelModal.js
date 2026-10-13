import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAccessibleTenants } from '../lib/hooks';
import ChannelMultiSelect from './ChannelMultiSelect';

const MODES = [
  { value: 'ADD',    label: 'Add to these channels',        help: 'Keeps their existing channels.' },
  { value: 'REMOVE', label: 'Remove from these channels',   help: 'Each must still be left in at least one channel.' },
  { value: 'SET',    label: 'Set to exactly these channels', help: 'Replaces their current channels.' },
];

// Shared by the Customers and Products list pages' "Channels…" bulk action —
// `assignFn(tenantIds, mode)` does the actual API call and must resolve to an axios response
// whose `data` is a BulkAssignResultDto ({totalCount, successCount, errorCount, errors}).
export default function BulkAssignChannelModal({ count, entityLabel, assignFn, onClose, onDone }) {
  const { tenants, isLoading: tenantsLoading } = useAccessibleTenants();
  const [tenantIds, setTenantIds] = useState([]);
  const [mode, setMode] = useState('ADD');
  const [result, setResult] = useState(null);

  const mutation = useMutation({
    mutationFn: () => assignFn(tenantIds, mode),
    onSuccess: (res) => {
      setResult(res.data);
      if (res.data.successCount > 0) onDone();
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to update channels'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="mb-1 text-base font-semibold text-gray-900">Channels</h2>
        <p className="mb-4 text-sm text-gray-500">
          Change which channels the {count} selected {entityLabel}{count === 1 ? ' is' : 's are'} available in.
        </p>

        {!result ? (
          <div className="space-y-4">
            <div>
              <label className="label">Action</label>
              <div className="space-y-1.5">
                {MODES.map(m => (
                  <label key={m.value} className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="radio"
                      name="bulk-channel-mode"
                      value={m.value}
                      checked={mode === m.value}
                      onChange={() => setMode(m.value)}
                      className="mt-0.5"
                    />
                    <span>
                      {m.label}
                      <span className="block text-xs text-gray-400">{m.help}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <ChannelMultiSelect
              label="Channels"
              tenants={tenants}
              isLoading={tenantsLoading}
              value={tenantIds}
              onChange={setTenantIds}
            />

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => mutation.mutate()}
                disabled={tenantIds.length === 0 || mutation.isPending}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {mutation.isPending ? 'Applying…' : 'Apply'}
              </button>
              <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className={`rounded-lg border px-3 py-2 text-sm ${
              result.errorCount === 0 ? 'border-green-200 bg-green-50 text-green-700' : 'border-amber-200 bg-amber-50 text-amber-700'
            }`}>
              Updated <strong>{result.successCount}</strong> of <strong>{result.totalCount}</strong> {entityLabel}{result.totalCount === 1 ? '' : 's'}.
              {result.errorCount > 0 && <> {result.errorCount} failed — see below.</>}
            </div>

            {result.errors.length > 0 && (
              <div className="max-h-60 overflow-y-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-semibold text-gray-500">Name</th>
                      <th className="px-2 py-1.5 text-left font-semibold text-gray-500">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {result.errors.map((e, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1.5">{e.label ?? e.id}</td>
                        <td className="px-2 py-1.5 text-red-600">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <button onClick={onClose} className="btn-primary w-full">Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
