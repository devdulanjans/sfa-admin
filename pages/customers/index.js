import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import ExportButton from '../../components/ExportButton';
import { withAuth, useAuth } from '../../lib/auth';
import { customerApi } from '../../lib/api';
import toast from 'react-hot-toast';

function branchColumns(router) {
  return [
    { key: 'customerCode',     label: 'Code',     width: 100 },
    { key: 'name',             label: 'Name', render: (v, row) => (
      <>
        {v}
        {row.branchCount > 0 && (
          <button
            onClick={() => router.push(`/customers?parentId=${row.id}`)}
            className="ml-2 inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
          >
            {row.branchCount} branch{row.branchCount === 1 ? '' : 'es'}
          </button>
        )}
      </>
    ) },
    { key: 'phone',            label: 'Phone' },
    { key: 'location',         label: 'Location', render: (v) => v ?? '—' },
    { key: 'placeOfSupplier',  label: 'Place of Supplier', render: (v) => v ?? '—' },
    { key: 'categoryName',     label: 'Category', render: (v) => v ?? '—' },
    { key: 'taxType',          label: 'Tax Type' },
    { key: 'status',           label: 'Status',   render: (v) => <StatusBadge status={v} /> },
    { key: 'actions',          label: '',         width: 140,
      render: (_, row) => <RowActions row={row} /> },
  ];
}

function RowActions({ row }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'SUPER_ADMIN';

  const deleteMutation = useMutation({
    mutationFn: () => customerApi.delete(row.id),
    onSuccess: () => {
      toast.success('Customer deleted');
      qc.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to delete customer'),
  });

  const restoreMutation = useMutation({
    mutationFn: () => customerApi.restore(row.id),
    onSuccess: () => {
      toast.success('Customer restored');
      qc.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to restore customer'),
  });

  function confirmDelete() {
    if (window.confirm(`Delete customer "${row.name}"? This can be restored later by a super admin.`)) {
      deleteMutation.mutate();
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <button
        onClick={() => router.push(`/customers/${row.id}`)}
        className="text-blue-600 text-xs font-medium hover:text-blue-800"
      >
        Edit →
      </button>
      {isAdmin && (
        row.deletedAt ? (
          <button
            onClick={() => restoreMutation.mutate()}
            disabled={restoreMutation.isPending}
            className="text-xs px-2 py-1 rounded font-medium bg-green-50 text-green-700 hover:bg-green-100"
          >
            Restore
          </button>
        ) : (
          <button
            onClick={confirmDelete}
            disabled={deleteMutation.isPending}
            className="text-xs px-2 py-1 rounded font-medium bg-red-50 text-red-700 hover:bg-red-100"
          >
            Delete
          </button>
        )
      )}
    </div>
  );
}

function downloadBlob(data, filename) {
  const url = URL.createObjectURL(new Blob([data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function ImportCustomersModal({ onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const importMutation = useMutation({
    mutationFn: () => customerApi.importCustomers(file),
    onSuccess: (res) => {
      setResult(res.data);
      if (res.data.successCount > 0) onImported();
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? err.response?.data?.message ?? 'Import failed'),
  });

  async function handleDownloadTemplate() {
    setDownloading(true);
    try {
      const res = await customerApi.downloadImportTemplate();
      downloadBlob(res.data, 'customer-import-template.xlsx');
    } catch {
      toast.error('Failed to download template');
    } finally {
      setDownloading(false);
    }
  }

  function reset() {
    setFile(null);
    setResult(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="mb-1 text-base font-semibold text-gray-900">Import Customers</h2>
        <p className="mb-4 text-sm text-gray-500">
          Download the template, send it to your client to fill in, then upload the completed file here.
        </p>

        {!result ? (
          <div className="space-y-4">
            <button
              onClick={handleDownloadTemplate}
              disabled={downloading}
              className="btn-secondary w-full disabled:opacity-50"
            >
              {downloading ? 'Downloading…' : '⬇ Download Template'}
            </button>

            <div>
              <label className="label">Completed Excel File</label>
              <input
                type="file" accept=".xlsx,.xls"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
                className="input"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => importMutation.mutate()}
                disabled={!file || importMutation.isPending}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {importMutation.isPending ? 'Importing…' : 'Upload & Import'}
              </button>
              <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className={`rounded-lg border px-3 py-2 text-sm ${
              result.errorCount === 0 ? 'border-green-200 bg-green-50 text-green-700' : 'border-amber-200 bg-amber-50 text-amber-700'
            }`}>
              Imported <strong>{result.successCount}</strong> of <strong>{result.totalRows}</strong> customers.
              {result.errorCount > 0 && <> {result.errorCount} row{result.errorCount !== 1 ? 's' : ''} failed — see below.</>}
            </div>

            {result.errors.length > 0 && (
              <div className="max-h-60 overflow-y-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-semibold text-gray-500">Row</th>
                      <th className="px-2 py-1.5 text-left font-semibold text-gray-500">Name</th>
                      <th className="px-2 py-1.5 text-left font-semibold text-gray-500">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {result.errors.map((e, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1.5 font-mono">{e.rowNumber}</td>
                        <td className="px-2 py-1.5">{e.customerName}</td>
                        <td className="px-2 py-1.5 text-red-600">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={reset} className="btn-secondary flex-1">Import Another File</button>
              <button onClick={onClose} className="btn-primary flex-1">Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CustomersPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const [page, setPage]     = useState(0);
  const [search, setSearch] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [includeDeleted, setIncludeDeleted] = useState(false);

  // Viewing a parent's branches (via the "N branches" pill) — a separate, scoped view
  // rather than the general list, so it only ever shows that parent's rows.
  const parentId = router.query.parentId;

  const { data: parentCustomer } = useQuery({
    queryKey: ['customer', parentId],
    queryFn: () => customerApi.getById(parentId).then(r => r.data),
    enabled: !!parentId,
  });

  const { data, isLoading } = useQuery({
    queryKey: parentId ? ['customer-branches-list', parentId, page, search] : ['customers', page, search, includeDeleted],
    queryFn: () => parentId
      ? customerApi.branches(parentId, { page, size: 20, search }).then(r => r.data)
      // topLevelOnly only while search is blank — typing a name/code still finds a branch directly.
      : customerApi.list({ page, size: 20, search, includeDeleted, topLevelOnly: !search }).then(r => r.data),
    keepPreviousData: true,
  });

  const columns = branchColumns(router);

  return (
    <Layout title={parentId ? `Branches of ${parentCustomer?.name ?? '…'}` : 'Customers'}>
      {parentId && (
        <button
          onClick={() => router.push('/customers')}
          className="mb-3 text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          ← All customers
        </button>
      )}
      <DataTable
        columns={columns}
        data={data?.content || []}
        loading={isLoading}
        totalPages={data?.totalPages || 1}
        currentPage={page}
        onPageChange={setPage}
        onSearch={(v) => { setSearch(v); setPage(0); }}
        actions={
          <>
            {!parentId && isAdmin && (
              <label className="flex items-center gap-1.5 text-xs text-gray-600 font-medium px-1">
                <input
                  type="checkbox"
                  checked={includeDeleted}
                  onChange={(e) => { setIncludeDeleted(e.target.checked); setPage(0); }}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
                />
                Show deleted
              </label>
            )}
            {!parentId && (
              <ExportButton
                filename="customers"
                exportFn={(format) => customerApi.export(format, { search })}
              />
            )}
            {!parentId && (
              <button className="btn-secondary" onClick={() => setShowImport(true)}>
                ⬆ Import
              </button>
            )}
            <button
              className="btn-primary"
              onClick={() => router.push(parentId ? `/customers/new?parentId=${parentId}` : '/customers/new')}
            >
              + New {parentId ? 'Branch' : 'Customer'}
            </button>
          </>
        }
        emptyMessage={parentId ? 'No branches yet' : 'No customers found'}
      />

      {showImport && (
        <ImportCustomersModal
          onClose={() => setShowImport(false)}
          onImported={() => qc.invalidateQueries({ queryKey: ['customers'] })}
        />
      )}
    </Layout>
  );
}

export default withAuth(CustomersPage, [], 'MOD_CUSTOMERS');
