import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import { withAuth } from '../../lib/auth';
import { productApi } from '../../lib/api';
import { formatAmount } from '../../lib/format';
import toast from 'react-hot-toast';

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

function ImportProductsModal({ onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const importMutation = useMutation({
    mutationFn: () => productApi.importProducts(file),
    onSuccess: (res) => {
      setResult(res.data);
      if (res.data.successCount > 0) onImported();
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? err.response?.data?.message ?? 'Import failed'),
  });

  async function handleDownloadTemplate() {
    setDownloading(true);
    try {
      const res = await productApi.downloadImportTemplate();
      downloadBlob(res.data, 'product-import-template.xlsx');
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
        <h2 className="mb-1 text-base font-semibold text-gray-900">Import Products</h2>
        <p className="mb-4 text-sm text-gray-500">
          Upload a stock sheet (No, Product Code, Description, Category, Unit, Stock, Purchase Price, MRP, Max Discount)
          to bulk-create products with their opening stock.
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
              Imported <strong>{result.successCount}</strong> of <strong>{result.totalRows}</strong> products.
              {result.errorCount > 0 && <> {result.errorCount} row{result.errorCount !== 1 ? 's' : ''} need attention — see below.</>}
            </div>

            {!result.stockTrackingEnabled && result.note && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {result.note}
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="max-h-60 overflow-y-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-semibold text-gray-500">Row</th>
                      <th className="px-2 py-1.5 text-left font-semibold text-gray-500">Product Code</th>
                      <th className="px-2 py-1.5 text-left font-semibold text-gray-500">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {result.errors.map((e, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1.5 font-mono">{e.rowNumber}</td>
                        <td className="px-2 py-1.5 font-mono">{e.productCode}</td>
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

function ProductsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [showImport, setShowImport] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['products', page, search],
    queryFn:  () => productApi.list({ page, size: 20, search }).then(r => r.data),
    keepPreviousData: true,
  });

  const columns = [
    { key: 'productCode',      label: 'Code',     render: (v) => <span className="font-mono text-xs">{v}</span> },
    { key: 'barcode',          label: 'Barcode',  render: (v) => v ? <span className="font-mono text-xs text-gray-500">{v}</span> : <span className="text-gray-400">—</span> },
    { key: 'name',             label: 'Name',     render: (v) => <span className="font-medium">{v}</span> },
    { key: 'categoryName',     label: 'Category', render: (v) => v ?? <span className="text-gray-400">—</span> },
    { key: 'unitAbbreviation', label: 'Unit',     render: (v) => v
        ? <span className="font-mono text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">{v}</span>
        : <span className="text-gray-400">—</span> },
    { key: 'purchasePrice', label: 'Cost (LKR)',   render: (v) => v != null ? `LKR ${formatAmount(v)}` : '—' },
    { key: 'defaultPrice', label: 'Price (LKR)',  render: (v) => v != null ? `LKR ${formatAmount(v)}` : '—' },
    {
      key: 'marginPct', label: 'Margin',
      render: (v, row) => v == null ? <span className="text-gray-400">—</span> : (
        <span className={`font-medium ${v < 0 ? 'text-red-600' : 'text-green-700'}`}>
          {Number(v).toFixed(1)}%
          {row.profitPerUnit != null && <span className="ml-1 text-xs text-gray-400">(LKR {formatAmount(row.profitPerUnit)})</span>}
        </span>
      ),
    },
    { key: 'taxRate',      label: 'Tax %',  render: (v) => v != null ? `${v}%` : '—' },
    { key: 'status',       label: 'Status', render: (v) => <StatusBadge status={v} /> },
    {
      key: 'id', label: '',
      render: (v) => (
        <button
          onClick={() => router.push(`/products/${v}`)}
          className="text-blue-600 text-xs font-medium hover:text-blue-800"
        >
          Edit →
        </button>
      ),
    },
  ];

  return (
    <Layout title="Products">
      <DataTable
        columns={columns}
        data={data?.content || []}
        loading={isLoading}
        totalPages={data?.totalPages || 1}
        currentPage={page}
        onPageChange={setPage}
        onSearch={setSearch}
        actions={
          <>
            <button className="btn-secondary" onClick={() => setShowImport(true)}>
              ⬆ Import
            </button>
            <button className="btn-primary" onClick={() => router.push('/products/new')}>
              + New Product
            </button>
          </>
        }
        emptyMessage="No products found"
      />

      {showImport && (
        <ImportProductsModal
          onClose={() => setShowImport(false)}
          onImported={() => qc.invalidateQueries({ queryKey: ['products'] })}
        />
      )}
    </Layout>
  );
}

export default withAuth(ProductsPage, [], 'MOD_PRODUCTS');
