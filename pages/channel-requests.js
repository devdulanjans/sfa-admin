import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout';
import DataTable from '../components/DataTable';
import { withAuth } from '../lib/auth';
import { channelRequestApi } from '../lib/api';
import toast from 'react-hot-toast';

const TABS = [
  { key: 'PENDING',  label: 'Pending' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
];

const STATUS_STYLE = {
  PENDING:  'bg-amber-50 text-amber-700',
  APPROVED: 'bg-green-50 text-green-700',
  REJECTED: 'bg-red-50 text-red-700',
};

const money = (v) =>
  Number(v || 0) === 0 ? 'Free' : `LKR ${Number(v).toLocaleString('en-LK', { minimumFractionDigits: 2 })}`;
const when = (v) => (v ? new Date(v).toLocaleString('en-LK', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const errText = (err, fallback) => {
  const d = err.response?.data;
  if (d?.violations) return Object.values(d.violations).join(' ');
  return d?.detail ?? fallback;
};

function Detail({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900 break-words">{children || '—'}</dd>
    </div>
  );
}

function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto p-6`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          {onClose && <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg" aria-label="Close">✕</button>}
        </div>
        {children}
      </div>
    </div>
  );
}

function ChannelRequestsPage() {
  const qc = useQueryClient();
  const [status, setStatus]   = useState('PENDING');
  const [page, setPage]       = useState(0);
  const [viewing, setViewing] = useState(null);   // request shown in the detail modal
  const [approving, setApproving] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [approveForm, setApproveForm] = useState({ channelCode: '', channelName: '', username: '' });
  const [rejectNote, setRejectNote] = useState('');
  const [result, setResult] = useState(null);     // approval result with the one-time password

  const { data, isLoading } = useQuery({
    queryKey: ['channel-requests', status, page],
    queryFn:  () => channelRequestApi.list({ status, page, size: 20 }).then(r => r.data),
  });
  const { data: counts } = useQuery({
    queryKey: ['channel-requests-counts'],
    queryFn:  () => channelRequestApi.counts().then(r => r.data),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['channel-requests'] });
    qc.invalidateQueries({ queryKey: ['channel-requests-counts'] });
    qc.invalidateQueries({ queryKey: ['tenants'] });
  };

  const approveMutation = useMutation({
    mutationFn: ({ id, body }) => channelRequestApi.approve(id, body).then(r => r.data),
    onSuccess: (res) => {
      setApproving(null);
      setViewing(null);
      setResult(res);
      refresh();
    },
    onError: (err) => toast.error(errText(err, 'Failed to approve request')),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }) => channelRequestApi.reject(id, note),
    onSuccess: () => {
      toast.success('Request rejected');
      setRejecting(null);
      setViewing(null);
      setRejectNote('');
      refresh();
    },
    onError: (err) => toast.error(errText(err, 'Failed to reject request')),
  });

  function openApprove(row) {
    setApproveForm({ channelCode: '', channelName: '', username: '' });
    setApproving(row);
  }

  function submitApprove(e) {
    e.preventDefault();
    const body = {
      channelCode: approveForm.channelCode.trim() || null,
      channelName: approveForm.channelName.trim() || null,
      username:    approveForm.username.trim().toLowerCase() || null,
    };
    approveMutation.mutate({ id: approving.id, body });
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied');
    } catch {
      toast.error('Copy failed — select and copy it manually');
    }
  }

  const columns = [
    { key: 'referenceNo',  label: 'Reference', render: (v, row) => (
      <div>
        <p className="font-mono text-xs font-medium">{v}</p>
        <p className="text-xs text-gray-500">{when(row.createdAt)}</p>
      </div>
    ) },
    { key: 'businessName', label: 'Business',  render: (v, row) => (
      <div>
        <p className="font-medium text-gray-900">{v}</p>
        <p className="text-xs text-gray-500">{row.businessType} · {row.city}</p>
      </div>
    ) },
    { key: 'ownerName', label: 'Owner', render: (v, row) => (
      <div>
        <p className="text-gray-900">{v}</p>
        <p className="text-xs text-gray-500 break-all">{row.email}</p>
        <p className="text-xs text-gray-500">{row.phone}</p>
      </div>
    ) },
    { key: 'planName', label: 'Plan', render: (v, row) => (
      <div>
        <p className="text-gray-900">{v} · {row.userCount} user{row.userCount === 1 ? '' : 's'}</p>
        <p className="text-xs text-gray-500">{money(row.monthlyAmount)}{Number(row.monthlyAmount) > 0 ? ' / month' : ''}</p>
      </div>
    ) },
    { key: 'status', label: 'Status', render: (v, row) => (
      <div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[v] || ''}`}>{v}</span>
        {row.tenantCode && <p className="mt-1 font-mono text-xs text-gray-500">{row.tenantCode}</p>}
      </div>
    ) },
    { key: 'actions', label: '', render: (_, row) => (
      <div className="flex gap-2">
        <button onClick={() => setViewing(row)} className="text-xs px-2 py-1 rounded font-medium bg-gray-100 text-gray-700 hover:bg-gray-200">
          View
        </button>
        {row.status === 'PENDING' && (
          <>
            <button onClick={() => openApprove(row)} className="text-xs px-2 py-1 rounded font-medium bg-green-100 text-green-700 hover:bg-green-200">
              Approve
            </button>
            <button onClick={() => { setRejectNote(''); setRejecting(row); }} className="text-xs px-2 py-1 rounded font-medium bg-red-100 text-red-700 hover:bg-red-200">
              Reject
            </button>
          </>
        )}
      </div>
    ) },
  ];

  return (
    <Layout title="Channel Requests">
      <p className="mb-4 text-sm text-gray-600">
        Requests from the public website&apos;s &ldquo;Create your SFA&rdquo; form. Approving creates the business&apos;s
        channel, its Company Profile and an owner login. Collect payment for paid plans before approving.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => { setStatus(t.key); setPage(0); }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              status === t.key ? 'bg-brand-600 text-white' : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50'
            }`}
          >
            {t.label}
            {counts && <span className="ml-1.5 opacity-80">({counts[t.key.toLowerCase()] ?? 0})</span>}
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
        emptyMessage={`No ${status.toLowerCase()} requests`}
      />

      {viewing && (
        <Modal title={`${viewing.businessName} · ${viewing.referenceNo}`} onClose={() => setViewing(null)} wide>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Detail label="Business type">{viewing.businessType}</Detail>
            <Detail label="Registration no.">{viewing.businessRegNo}</Detail>
            <Detail label="Address">{[viewing.address, viewing.city].filter(Boolean).join(', ')}</Detail>
            <Detail label="Received">{when(viewing.createdAt)}</Detail>
            <Detail label="Owner">{viewing.ownerName}</Detail>
            <Detail label="Contact">
              <a href={`mailto:${viewing.email}`} className="text-brand-600 hover:underline">{viewing.email}</a>
              {' · '}
              <a href={`tel:${viewing.phone}`} className="text-brand-600 hover:underline">{viewing.phone}</a>
            </Detail>
            <Detail label="Plan">{viewing.planName} · {viewing.userCount} user{viewing.userCount === 1 ? '' : 's'}</Detail>
            <Detail label="Monthly amount">{money(viewing.monthlyAmount)}</Detail>
            <div className="sm:col-span-2"><Detail label="Message">{viewing.message}</Detail></div>
            {viewing.status !== 'PENDING' && (
              <>
                <Detail label="Status">{viewing.status}</Detail>
                <Detail label="Reviewed">{when(viewing.reviewedAt)}</Detail>
                {viewing.tenantCode && <Detail label="Channel">{viewing.tenantCode}</Detail>}
                {viewing.reviewNote && <div className="sm:col-span-2"><Detail label="Reason">{viewing.reviewNote}</Detail></div>}
              </>
            )}
          </dl>
          {viewing.status === 'PENDING' && (
            <div className="mt-6 flex gap-2">
              <button className="btn-primary flex-1" onClick={() => openApprove(viewing)}>Approve…</button>
              <button className="btn-secondary flex-1" onClick={() => { setRejectNote(''); setRejecting(viewing); }}>Reject…</button>
            </div>
          )}
        </Modal>
      )}

      {approving && (
        <Modal title={`Approve ${approving.businessName}`} onClose={() => setApproving(null)}>
          <p className="mb-4 text-sm text-gray-600">
            Creates the channel and an owner login for <strong>{approving.ownerName}</strong> ({approving.email}).
            Leave a field blank to generate it.
          </p>
          <form onSubmit={submitApprove} className="space-y-3">
            <div>
              <label className="label">Channel code</label>
              <input className="input uppercase" maxLength={30} placeholder="Generated from the business name"
                value={approveForm.channelCode} onChange={(e) => setApproveForm(f => ({ ...f, channelCode: e.target.value }))} />
            </div>
            <div>
              <label className="label">Channel name</label>
              <input className="input" maxLength={150} placeholder={approving.businessName}
                value={approveForm.channelName} onChange={(e) => setApproveForm(f => ({ ...f, channelName: e.target.value }))} />
            </div>
            <div>
              <label className="label">Owner username</label>
              <input className="input lowercase" maxLength={50} placeholder="Generated from the email"
                value={approveForm.username} onChange={(e) => setApproveForm(f => ({ ...f, username: e.target.value }))} />
            </div>
            {Number(approving.monthlyAmount) > 0 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Paid plan: {money(approving.monthlyAmount)} / month. Confirm the payment before approving.
              </p>
            )}
            <div className="flex gap-2 pt-2">
              <button type="submit" className="btn-primary flex-1" disabled={approveMutation.isPending}>
                {approveMutation.isPending ? 'Approving…' : 'Approve and create channel'}
              </button>
              <button type="button" className="btn-secondary flex-1" onClick={() => setApproving(null)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {rejecting && (
        <Modal title={`Reject ${rejecting.businessName}`} onClose={() => setRejecting(null)}>
          <form onSubmit={(e) => { e.preventDefault(); rejectMutation.mutate({ id: rejecting.id, note: rejectNote }); }} className="space-y-3">
            <div>
              <label className="label">Reason</label>
              <textarea className="input" rows={4} maxLength={1000} required value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)} placeholder="Kept with the request for your records" />
            </div>
            <div className="flex gap-2 pt-2">
              <button type="submit" className="btn-danger flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                disabled={rejectMutation.isPending || !rejectNote.trim()}>
                {rejectMutation.isPending ? 'Rejecting…' : 'Reject request'}
              </button>
              <button type="button" className="btn-secondary flex-1" onClick={() => setRejecting(null)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {result && (
        <Modal title="Channel created">
          <p className="text-sm text-gray-600">
            <strong>{result.request.businessName}</strong> is live as channel{' '}
            <span className="font-mono font-medium">{result.channelCode}</span>. Send the owner these sign-in details.
            They must choose a new password when they first sign in.
          </p>
          <div className="mt-4 space-y-2 rounded-lg bg-gray-50 p-4">
            {[
              ['Username', result.ownerUsername],
              ['Temporary password', result.temporaryPassword],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase text-gray-500">{label}</p>
                  <p className="font-mono text-sm font-semibold text-gray-900 select-all">{value}</p>
                </div>
                <button type="button" onClick={() => copy(value)} className="text-xs px-2 py-1 rounded font-medium bg-white ring-1 ring-gray-200 hover:bg-gray-100">
                  Copy
                </button>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-red-600">
            The password is shown only once. If it&apos;s lost, reset it from the Users page.
          </p>
          <div className="mt-5 text-right">
            <button className="btn-primary" onClick={() => setResult(null)}>Done</button>
          </div>
        </Modal>
      )}
    </Layout>
  );
}

export default withAuth(ChannelRequestsPage, ['SUPER_ADMIN'], null, 'MULTI_TENANT');
