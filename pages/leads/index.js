import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import { withAuth, useAuth, usePermission } from '../../lib/auth';
import { useAccessibleTenants } from '../../lib/hooks';
import { leadApi } from '../../lib/api';

const LocationPicker = dynamic(() => import('../../components/LocationPicker'), { ssr: false });

const STATUS_TABS = [
  { value: '',          label: 'All' },
  { value: 'PENDING',   label: 'Pending' },
  { value: 'CONVERTED', label: 'Converted' },
  { value: 'REJECTED',  label: 'Rejected' },
];

const EMPTY_LEAD = {
  name: '', contactPerson: '', phone: '', email: '', location: '', placeOfSupplier: '',
  addressLine: '', latitude: null, longitude: null, notes: '', tenantId: '',
};

function LeadsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const multiTenantEnabled = user?.multiTenantEnabled ?? true;
  const canManageRoutes = usePermission('MOD_ROUTES');
  const [page, setPage]     = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [formTarget, setFormTarget]       = useState(null); // {} for new, lead for edit
  const [convertTarget, setConvertTarget] = useState(null);
  const [rejectTarget, setRejectTarget]   = useState(null);

  const { data: config } = useQuery({
    queryKey: ['leads-config'],
    queryFn:  () => leadApi.config().then(r => r.data),
  });
  const canConvert = !!config?.canConvert;

  const { data, isLoading } = useQuery({
    queryKey: ['leads', page, search, status],
    queryFn:  () => leadApi.list({ page, size: 20, search, status: status || undefined }).then(r => r.data),
    keepPreviousData: true,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => leadApi.delete(id),
    onSuccess: () => { toast.success('Lead deleted'); qc.invalidateQueries({ queryKey: ['leads'] }); },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to delete lead'),
  });

  const columns = [
    { key: 'leadNumber', label: 'Lead #', render: (v) => <span className="font-mono font-medium">{v}</span> },
    {
      key: 'name', label: 'Name',
      render: (v, row) => (
        <div>
          <p className="font-medium">{v}</p>
          {row.contactPerson && <p className="text-xs text-gray-500">{row.contactPerson}</p>}
        </div>
      ),
    },
    { key: 'phone',    label: 'Phone',    render: (v) => v || '—' },
    { key: 'location', label: 'Location', render: (v) => v || '—' },
    {
      key: 'latitude', label: 'Coordinates',
      render: (_, row) => row.latitude != null && row.longitude != null ? (
        <a href={`https://www.google.com/maps?q=${row.latitude},${row.longitude}`} target="_blank" rel="noreferrer"
          className="text-brand-600 hover:underline font-mono text-xs">
          {row.latitude.toFixed(5)}, {row.longitude.toFixed(5)}
        </a>
      ) : <span className="text-gray-400">—</span>,
    },
    {
      key: 'suggestedRouteName', label: 'Suggested Route',
      render: (v, row) => {
        if (!row.suggestedRouteId) return <span className="text-gray-400">—</span>;
        const cls = 'inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 whitespace-nowrap';
        const tip = 'The rep was on this route when the lead was captured';
        return canManageRoutes ? (
          <Link href={`/routes/${row.suggestedRouteId}`} title={tip} className={`${cls} hover:bg-amber-100`}>{v || 'Route'}</Link>
        ) : <span title={tip} className={cls}>{v || 'Route'}</span>;
      },
    },
    { key: 'createdByName', label: 'Created By', render: (v) => v || '—' },
    { key: 'createdAt', label: 'Created', render: (v) => v ? format(new Date(v), 'dd MMM yyyy HH:mm') : '—' },
    ...(multiTenantEnabled ? [{ key: 'tenantName', label: 'Channel', render: (v) => v || '—' }] : []),
    {
      key: 'status', label: 'Status',
      render: (v, row) => (
        <div>
          <StatusBadge status={v} />
          {v === 'CONVERTED' && row.convertedCustomerId && (
            <Link href={`/customers/${row.convertedCustomerId}`} className="block text-xs text-brand-600 hover:underline mt-1">
              {row.convertedCustomerCode}
            </Link>
          )}
          {v === 'REJECTED' && row.rejectionReason && (
            <p className="text-xs text-gray-500 mt-1 max-w-[180px] truncate" title={row.rejectionReason}>{row.rejectionReason}</p>
          )}
        </div>
      ),
    },
    {
      key: 'actions', label: '',
      render: (_, row) => (
        <div className="flex items-center gap-2 justify-end whitespace-nowrap">
          {row.status !== 'CONVERTED' && (
            <button className="text-xs text-gray-600 hover:text-brand-600" onClick={() => setFormTarget(row)}>Edit</button>
          )}
          {canConvert && row.status !== 'CONVERTED' && (
            <button className="text-xs font-medium text-green-700 hover:text-green-800" onClick={() => setConvertTarget(row)}>
              Convert
            </button>
          )}
          {canConvert && row.status === 'PENDING' && (
            <button className="text-xs text-amber-700 hover:text-amber-800" onClick={() => setRejectTarget(row)}>Reject</button>
          )}
          {row.status !== 'CONVERTED' && (
            <button className="text-xs text-red-600 hover:text-red-700"
              onClick={() => { if (confirm(`Delete lead "${row.name}"?`)) deleteMutation.mutate(row.id); }}>
              Delete
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <Layout title="Leads">
      <div className="space-y-4">
        <div className={`rounded-lg border px-4 py-3 text-sm ${config?.autoConvert
          ? 'border-green-200 bg-green-50 text-green-800'
          : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
          {config?.autoConvert
            ? 'Automatic conversion is ON — new leads become customers as soon as they are created.'
            : 'Automatic conversion is OFF — new leads wait here until a user with the "Convert Leads" permission converts them.'}
          {' '}
          <Link href="/settings/general" className="underline">Change in General Settings</Link>
        </div>

        <div className="flex gap-1 border-b border-gray-200">
          {STATUS_TABS.map(t => (
            <button key={t.value}
              className={`px-4 py-2 text-sm -mb-px border-b-2 ${status === t.value
                ? 'border-brand-600 text-brand-700 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              onClick={() => { setStatus(t.value); setPage(0); }}>
              {t.label}
            </button>
          ))}
        </div>

        <DataTable
          columns={columns}
          data={data?.content || []}
          loading={isLoading}
          totalPages={data?.totalPages || 1}
          currentPage={page}
          onPageChange={setPage}
          onSearch={(v) => { setSearch(v); setPage(0); }}
          actions={<button className="btn-primary" onClick={() => setFormTarget({})}>+ New Lead</button>}
          emptyMessage="No leads found"
        />
      </div>

      {formTarget && (
        <LeadFormModal
          lead={formTarget.id ? formTarget : null}
          autoConvert={!!config?.autoConvert}
          onClose={() => setFormTarget(null)}
        />
      )}
      {convertTarget && <ConvertModal lead={convertTarget} onClose={() => setConvertTarget(null)} />}
      {rejectTarget && <RejectModal lead={rejectTarget} onClose={() => setRejectTarget(null)} />}
    </Layout>
  );
}

function LeadFormModal({ lead, autoConvert, onClose }) {
  const qc = useQueryClient();
  const isNew = !lead;
  const { tenants, needsPicker } = useAccessibleTenants({ enabled: isNew });
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    defaultValues: lead ? { ...EMPTY_LEAD, ...lead } : EMPTY_LEAD,
  });
  const latitude  = watch('latitude');
  const longitude = watch('longitude');

  const mutation = useMutation({
    mutationFn: (body) => isNew ? leadApi.create(body) : leadApi.update(lead.id, body),
    onSuccess: (res) => {
      const saved = res.data;
      if (isNew && saved.status === 'CONVERTED') {
        toast.success(`Lead created and converted to customer ${saved.convertedCustomerCode}`);
      } else {
        toast.success(isNew ? 'Lead created' : 'Lead updated');
      }
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Save failed'),
  });

  function onSubmit(d) {
    mutation.mutate({
      name: d.name, contactPerson: d.contactPerson, phone: d.phone, email: d.email,
      location: d.location, placeOfSupplier: d.placeOfSupplier, addressLine: d.addressLine,
      latitude: d.latitude, longitude: d.longitude, notes: d.notes,
      tenantId: d.tenantId || null,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">
          {isNew ? 'New Lead' : `Edit Lead ${lead.leadNumber}`}
        </h2>
        {isNew && autoConvert && (
          <p className="text-xs text-green-700 mb-3">This lead will be converted into a customer automatically.</p>
        )}
        {lead?.status === 'REJECTED' && (
          <p className="text-xs text-amber-700 mb-3">Saving will re-submit this rejected lead for review.</p>
        )}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 mt-3">
          {isNew && needsPicker && (
            <div>
              <label className="label">Channel *</label>
              <select {...register('tenantId', { required: true })} className="input">
                <option value="">Select channel…</option>
                {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {errors.tenantId && <p className="text-red-500 text-xs mt-1">Required</p>}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Name *</label>
              <input {...register('name', { required: true, maxLength: 200 })} className="input" />
              {errors.name && <p className="text-red-500 text-xs mt-1">Required</p>}
            </div>
            <div>
              <label className="label">Contact Person</label>
              <input {...register('contactPerson', { maxLength: 100 })} className="input" />
            </div>
            <div>
              <label className="label">Phone</label>
              <input {...register('phone', { maxLength: 20 })} className="input" />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" {...register('email', { maxLength: 120 })} className="input" />
            </div>
            <div>
              <label className="label">Location</label>
              <input {...register('location', { maxLength: 100 })} className="input" placeholder="e.g. Colombo" />
            </div>
            <div>
              <label className="label">Place of Supplier</label>
              <input {...register('placeOfSupplier', { maxLength: 150 })} className="input" />
            </div>
          </div>
          <div>
            <label className="label">Address</label>
            <input {...register('addressLine', { maxLength: 500 })} className="input" />
          </div>
          <div>
            <label className="label">Coordinates</label>
            <LocationPicker
              latitude={latitude}
              longitude={longitude}
              onChange={(la, ln) => {
                setValue('latitude', la, { shouldDirty: true });
                setValue('longitude', ln, { shouldDirty: true });
              }}
            />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea {...register('notes')} rows={2} className="input" />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" className="btn-primary flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : isNew ? 'Create Lead' : 'Save'}
            </button>
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConvertModal({ lead, onClose }) {
  const qc = useQueryClient();
  const { register, handleSubmit } = useForm({
    defaultValues: { customerCode: '', taxType: 'STANDARD', creditLimit: '', creditDays: '' },
  });

  const mutation = useMutation({
    mutationFn: (d) => leadApi.convert(lead.id, {
      customerCode: d.customerCode?.trim() || null,
      taxType: d.taxType || null,
      creditLimit: d.creditLimit === '' ? null : Number(d.creditLimit),
      creditDays:  d.creditDays  === '' ? null : Number(d.creditDays),
    }),
    onSuccess: (res) => {
      toast.success(`Converted to customer ${res.data.convertedCustomerCode}`);
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Conversion failed'),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-base font-semibold text-gray-900">Convert Lead to Customer</h2>
        <p className="text-sm text-gray-500 mt-1 mb-4">
          <span className="font-medium text-gray-700">{lead.name}</span> ({lead.leadNumber}) will be created as a customer
          with its contact details, address and coordinates.
        </p>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-3">
          <div>
            <label className="label">Customer Code</label>
            <input {...register('customerCode', { maxLength: 30 })} className="input" placeholder="Leave blank to auto-generate" />
          </div>
          <div>
            <label className="label">Tax Type</label>
            <select {...register('taxType')} className="input">
              <option value="STANDARD">Standard</option>
              <option value="EXEMPT">Exempt</option>
              <option value="ZERO_RATED">Zero Rated</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Credit Limit</label>
              <input type="number" step="0.01" min="0" {...register('creditLimit')} className="input" />
            </div>
            <div>
              <label className="label">Credit Days</label>
              <input type="number" min="0" {...register('creditDays')} className="input" />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" className="btn-primary flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? 'Converting…' : 'Convert'}
            </button>
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RejectModal({ lead, onClose }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => leadApi.reject(lead.id, reason),
    onSuccess: () => {
      toast.success('Lead rejected');
      qc.invalidateQueries({ queryKey: ['leads'] });
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to reject lead'),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Reject Lead {lead.leadNumber}</h2>
        <label className="label">Reason</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} className="input" />
        <div className="flex gap-2 pt-4">
          <button className="btn-primary flex-1 !bg-red-600 hover:!bg-red-700" disabled={mutation.isPending}
            onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Rejecting…' : 'Reject'}
          </button>
          <button className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default withAuth(LeadsPage, [], 'MOD_LEADS', 'SFA');
