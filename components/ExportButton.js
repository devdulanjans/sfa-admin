import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { reportApi } from '../lib/api';

export default function ExportButton({ params = {}, filename = 'export', exportFn, detailedExportFn, detailedLabel = 'XLSX — Full Detail' }) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, right: 0 });
  const btnRef  = useRef(null);
  const menuRef = useRef(null);

  // Close on outside click. The dropdown itself is rendered via createPortal
  // into document.body (see below), so it is NOT a DOM descendant of btnRef —
  // checking only btnRef.contains(e.target) treats every click on a format
  // option as an "outside" click, closing (unmounting) the menu on mousedown
  // before the option's own onClick ever gets to fire. Must also check menuRef.
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (btnRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function toggleOpen() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + 4,
        right: document.documentElement.clientWidth - rect.right,
      });
    }
    setOpen((o) => !o);
  }

  async function doExport(format) {
    setLoading(true);
    setOpen(false);
    try {
      const isDetailed = format === 'detailed';
      const { data } = isDetailed
        ? await detailedExportFn()
        : exportFn ? await exportFn(format) : await reportApi.export({ ...params, format });
      const url  = URL.createObjectURL(new Blob([data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = isDetailed ? `${filename}-details.xlsx` : `${filename}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(isDetailed ? 'Exported full details' : `Exported as ${format.toUpperCase()}`);
    } catch {
      toast.error('Export failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative" ref={btnRef}>
      <button
        onClick={toggleOpen}
        disabled={loading}
        className="btn-secondary"
      >
        {loading ? 'Exporting...' : '⬇ Export'}
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        // Portaled to <body> and positioned via fixed viewport coordinates so this
        // panel can never be clipped or out-stacked by an ancestor's overflow/z-index
        // (e.g. a page-level layout sidebar) — see the invoices page export bug.
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: coords.top, right: coords.right, width: 176, zIndex: 9999 }}
          className="rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden"
        >
          {['xlsx', 'csv', 'pdf'].map((fmt) => (
            <button
              key={fmt}
              onClick={() => doExport(fmt)}
              className="block w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
            >
              {fmt.toUpperCase()}
            </button>
          ))}
          {detailedExportFn && (
            <button
              onClick={() => doExport('detailed')}
              className="block w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 border-t border-gray-100 last:rounded-b-lg"
            >
              {detailedLabel}
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
