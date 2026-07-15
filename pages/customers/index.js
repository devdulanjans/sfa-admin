import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import ExportButton from '../../components/ExportButton';
import { withAuth } from '../../lib/auth';
import { customerApi } from '../../lib/api';
import toast from 'react-hot-toast';

const COLUMNS = [
  { key: 'customerCode', label: 'Code',     width: 100 },
  { key: 'name',         label: 'Name' },
  { key: 'phone',        label: 'Phone' },
  { key: 'location',     label: 'Location', render: (v) => v ?? '—' },
  { key: 'categoryName', label: 'Category', render: (v) => v ?? '—' },
  { key: 'taxType',      label: 'Tax Type' },
  { key: 'status',       label: 'Status',   render: (v) => <StatusBadge status={v} /> },
  { key: 'actions',      label: '',         width: 80,
    render: (_, row) => <RowActions id={row.id} /> },
];

function RowActions({ id }) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(`/customers/${id}`)}
      className="text-blue-600 text-xs font-medium hover:text-blue-800"
    >
      Edit →
    </button>
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
  const [page, setPage]     = useState(0);
  const [search, setSearch] = useState('');
  const [showImport, setShowImport] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', page, search],
    queryFn:  () => customerApi.list({ page, size: 20, search }).then(r => r.data),
    keepPreviousData: true,
  });

  return (
    <Layout title="Customers">
      <DataTable
        columns={COLUMNS}
        data={data?.content || []}
        loading={isLoading}
        totalPages={data?.totalPages || 1}
        currentPage={page}
        onPageChange={setPage}
        onSearch={setSearch}
        actions={
          <>
            <ExportButton
              filename="customers"
              exportFn={(format) => customerApi.export(format, { search })}
            />
            <button className="btn-secondary" onClick={() => setShowImport(true)}>
              ⬆ Import
            </button>
            <button className="btn-primary" onClick={() => router.push('/customers/new')}>
              + New Customer
            </button>
          </>
        }
        emptyMessage="No customers found"
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
