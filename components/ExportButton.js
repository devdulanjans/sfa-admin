import { useState } from 'react';
import toast from 'react-hot-toast';
import { reportApi } from '../lib/api';

export default function ExportButton({ params = {}, filename = 'export', exportFn }) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function doExport(format) {
    setLoading(true);
    setOpen(false);
    try {
      const { data } = exportFn ? await exportFn(format) : await reportApi.export({ ...params, format });
      const url  = URL.createObjectURL(new Blob([data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch {
      toast.error('Export failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="btn-secondary"
      >
        {loading ? 'Exporting...' : '⬇ Export'}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-36 rounded-lg border border-gray-200 bg-white shadow-lg z-10">
          {['xlsx', 'csv', 'pdf'].map((fmt) => (
            <button
              key={fmt}
              onClick={() => doExport(fmt)}
              className="block w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
            >
              {fmt.toUpperCase()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
