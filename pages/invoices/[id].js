import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { withAuth } from '../../lib/auth';
import { invoiceApi } from '../../lib/api';

// A4 at 96dpi ≈ 794 x 1123px; we size in mm so print and screen agree exactly.
const PRINT_CSS = `
  @media print {
    .no-print { display: none !important; }
    body { margin: 0; background: white; }
    .pdf-frame-wrap { box-shadow: none !important; margin: 0 !important; width: 100% !important; }
  }
  body { background: #eee; }
  .pdf-frame-wrap {
    width: 210mm;
    max-width: 100%;
    height: 297mm;
    margin: 20px auto;
    background: white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.12);
  }
  .pdf-frame { width: 100%; height: 100%; border: none; }
`;

function InvoiceDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const iframeRef = useRef(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfError, setPdfError] = useState(null);

  const { data: invoice } = useQuery({
    queryKey: ['invoice-detail', id],
    queryFn: () => invoiceApi.get(id).then((r) => r.data),
    enabled: !!id,
  });

  // Fetch the same dynamic, item-inclusive A4 PDF the backend generates for
  // print/download, so this page always matches what actually gets printed.
  useEffect(() => {
    if (!id) return undefined;
    let url;
    let cancelled = false;
    setPdfError(null);
    invoiceApi
      .pdf(id)
      .then((res) => {
        if (cancelled) return;
        url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
        setPdfUrl(url);
      })
      .catch((err) => {
        if (!cancelled) setPdfError(err.response?.data?.message || err.message);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);

  const handlePrint = () => {
    iframeRef.current?.contentWindow?.print();
  };

  const handleDownload = () => {
    if (!pdfUrl || !invoice) return;
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = `${invoice.invoiceNumber}.pdf`;
    a.click();
  };

  return (
    <div style={{ minHeight: '100vh', background: '#eee' }}>
      <style>{PRINT_CSS}</style>

      {/* Action bar — hidden on print */}
      <div className="no-print" style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 16px', background: '#1976d2', color: '#fff',
      }}>
        <Link href="/invoices" style={{ color: '#fff', textDecoration: 'none', fontSize: 14 }}>
          ← Invoices
        </Link>
        <div style={{ flex: 1 }}>
          {invoice && <span style={{ fontWeight: 600 }}>{invoice.invoiceNumber}</span>}
        </div>
        <button onClick={handlePrint} disabled={!pdfUrl} style={{
          padding: '6px 14px', background: '#fff', color: '#1976d2',
          border: 'none', borderRadius: 4, cursor: pdfUrl ? 'pointer' : 'default',
          opacity: pdfUrl ? 1 : 0.6, fontWeight: 600, fontSize: 13,
        }}>🖨 Print (A4)</button>
        <button onClick={handleDownload} disabled={!pdfUrl} style={{
          padding: '6px 14px', background: '#388e3c', color: '#fff',
          border: 'none', borderRadius: 4, cursor: pdfUrl ? 'pointer' : 'default',
          opacity: pdfUrl ? 1 : 0.6, fontWeight: 600, fontSize: 13,
        }}>📄 Download</button>
      </div>

      {!pdfUrl && !pdfError && (
        <div style={{ textAlign: 'center', padding: 60, fontSize: 16, color: '#555' }}>
          Loading invoice...
        </div>
      )}

      {pdfError && (
        <div style={{ textAlign: 'center', padding: 60, color: '#c62828' }}>
          Failed to load invoice PDF: {pdfError}
        </div>
      )}

      {pdfUrl && (
        <div className="pdf-frame-wrap">
          <iframe ref={iframeRef} className="pdf-frame" src={pdfUrl} title="Invoice PDF" />
        </div>
      )}
    </div>
  );
}

export default withAuth(InvoiceDetailPage, [], 'MOD_INVOICES', 'SFA');
