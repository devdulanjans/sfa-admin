import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import Layout from '../../components/Layout';
import { withPlatformOwnerAuth } from '../../lib/auth';
import { licenseApi } from '../../lib/api';
import toast from 'react-hot-toast';

function Toggle({ enabled, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      disabled={disabled}
      className={[
        'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent',
        'transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
        enabled ? 'bg-blue-600' : 'bg-gray-200',
      ].join(' ')}
      role="switch"
      aria-checked={enabled}
    >
      <span
        className={[
          'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0',
          'transition-transform duration-200',
          enabled ? 'translate-x-5' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  );
}

function PackageRow({ label, description, enabled, onChange, disabled }) {
  return (
    <div className="flex items-start justify-between gap-6 px-5 py-4">
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <Toggle enabled={enabled} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function LicensePage() {
  const qc = useQueryClient();

  const { data: license, isLoading } = useQuery({
    queryKey: ['platform-license'],
    queryFn: () => licenseApi.get().then(r => r.data),
  });

  const { register, handleSubmit, reset, setValue, watch, formState: { isDirty } } = useForm();
  const sfaEnabled = watch('sfaEnabled');
  const posEnabled = watch('posEnabled');

  useEffect(() => {
    if (license) {
      reset({
        sfaEnabled: license.sfaEnabled,
        posEnabled: license.posEnabled,
        clientName: license.clientName ?? '',
        note:       license.note ?? '',
      });
    }
  }, [license, reset]);

  const saveMutation = useMutation({
    mutationFn: (body) => licenseApi.update(body),
    onSuccess: () => {
      toast.success('License updated');
      qc.invalidateQueries({ queryKey: ['platform-license'] });
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to update license'),
  });

  if (isLoading) {
    return (
      <Layout title="License">
        <div className="card p-8 animate-pulse h-64" />
      </Layout>
    );
  }

  return (
    <Layout title="License">
      <form onSubmit={handleSubmit(d => saveMutation.mutate(d))} className="max-w-2xl space-y-6">
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-gray-900">This Installation</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Controls which packages this specific install has access to. Changes take effect immediately —
            for every user, including that install's own Super Admin.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <label className="label">Client Name</label>
              <input {...register('clientName')} className="input" placeholder="e.g. Iceman Cold Chain Services" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-50">
          <PackageRow
            label="SFA"
            description="Customers, Products, Pricing, Orders, Invoices, Inventory, Returns, Damages, Reports."
            enabled={!!sfaEnabled}
            onChange={(v) => setValue('sfaEnabled', v, { shouldDirty: true })}
            disabled={saveMutation.isPending}
          />
          <PackageRow
            label="POS"
            description="Point of Sale terminal and reporting, Accounts (Expenses, Ledger, Profit &amp; Loss)."
            enabled={!!posEnabled}
            onChange={(v) => setValue('posEnabled', v, { shouldDirty: true })}
            disabled={saveMutation.isPending}
          />
        </div>

        <div className="card p-6">
          <label className="label">Note</label>
          <textarea {...register('note')} rows={3} className="input resize-none" placeholder="Optional — e.g. plan tier, contract reference" />
        </div>

        <div className="flex gap-3">
          <button type="submit" className="btn-primary" disabled={saveMutation.isPending || !isDirty}>
            {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Layout>
  );
}

export default withPlatformOwnerAuth(LicensePage);
