import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { withAuth } from '../../lib/auth';
import { invoiceApi, bankAccountApi } from '../../lib/api';
import { formatAmount } from '../../lib/format';

const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'OTHER'];

function RecordPaymentModal({ invoice, bankAccounts, onClose, onSubmit, isPending }) {
  const outstanding = invoice.total - (invoice.paidAmount || 0);
  const [bankAccountId, setBankAccountId] = useState('');
  const [amount, setAmount] = useState(outstanding);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER');
  const [referenceNumber, setReferenceNumber] = useState('');

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }}>
      <div style={{ width: '100%', maxWidth: 360, background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Record Payment</h2>
        <p style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>
          {invoice.invoiceNumber} — outstanding {formatAmount(outstanding)}
        </p>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit({ bankAccountId, amount, paymentDate, paymentMethod, referenceNumber }); }}>
          <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>Bank Account *</label>
          <select required value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}
            style={{ width: '100%', marginBottom: 12, padding: 8, borderRadius: 6, border: '1px solid #ccc' }}>
            <option value="">Select bank account…</option>
            {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.accountName}</option>)}
          </select>

          <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>Amount *</label>
          <input required type="number" step="0.01" min="0.01" max={outstanding} value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ width: '100%', marginBottom: 12, padding: 8, borderRadius: 6, border: '1px solid #ccc' }} />

          <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>Payment Date *</label>
          <input required type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)}
            style={{ width: '100%', marginBottom: 12, padding: 8, borderRadius: 6, border: '1px solid #ccc' }} />

          <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>Method</label>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}
            style={{ width: '100%', marginBottom: 12, padding: 8, borderRadius: 6, border: '1px solid #ccc' }}>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>

          <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>Reference Number</label>
          <input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)}
            style={{ width: '100%', marginBottom: 16, padding: 8, borderRadius: 6, border: '1px solid #ccc' }} />

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={isPending} style={{
              flex: 1, padding: '8px 0', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 6,
              fontWeight: 600, cursor: isPending ? 'default' : 'pointer', opacity: isPending ? 0.6 : 1,
            }}>{isPending ? 'Recording…' : 'Record Payment'}</button>
            <button type="button" onClick={onClose} style={{
              flex: 1, padding: '8px 0', background: '#eee', color: '#333', border: 'none', borderRadius: 6, fontWeight: 600,
            }}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

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
  const qc = useQueryClient();
  const { id } = router.query;
  const iframeRef = useRef(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfError, setPdfError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [showPayment, setShowPayment] = useState(false);

  const { data: invoice } = useQuery({
    queryKey: ['invoice-detail', id],
    queryFn: () => invoiceApi.get(id).then((r) => r.data),
    enabled: !!id,
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => bankAccountApi.list().then((r) => r.data),
    enabled: showPayment,
  });

  const paymentMutation = useMutation({
    mutationFn: (data) => invoiceApi.recordPayment(id, { ...data, amount: parseFloat(data.amount) }),
    onSuccess: () => {
      toast.success('Payment recorded');
      qc.invalidateQueries({ queryKey: ['invoice-detail', id] });
      setShowPayment(false);
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? err.response?.data?.message ?? 'Failed to record payment'),
  });

  const canRecordPayment = invoice && ['ISSUED', 'PARTIALLY_PAID'].includes(invoice.status);

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

  const handleExportDetails = async () => {
    setExporting(true);
    try {
      const { data } = await invoiceApi.exportDetails(id);
      const url = URL.createObjectURL(new Blob([data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoice?.invoiceNumber || id}-details.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Exported invoice details');
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
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
        <button onClick={handleExportDetails} disabled={!invoice || exporting} style={{
          padding: '6px 14px', background: '#6d4fe0', color: '#fff',
          border: 'none', borderRadius: 4, cursor: (invoice && !exporting) ? 'pointer' : 'default',
          opacity: (invoice && !exporting) ? 1 : 0.6, fontWeight: 600, fontSize: 13,
        }}>{exporting ? 'Exporting…' : '⬇ Export Excel (full detail)'}</button>
        {canRecordPayment && (
          <button onClick={() => setShowPayment(true)} style={{
            padding: '6px 14px', background: '#00897b', color: '#fff',
            border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 13,
          }}>💰 Record Payment</button>
        )}
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

      {showPayment && invoice && (
        <RecordPaymentModal
          invoice={invoice}
          bankAccounts={bankAccounts}
          isPending={paymentMutation.isPending}
          onClose={() => setShowPayment(false)}
          onSubmit={(d) => paymentMutation.mutate(d)}
        />
      )}
    </div>
  );
}

export default withAuth(InvoiceDetailPage, [], 'MOD_INVOICES', 'SFA');
