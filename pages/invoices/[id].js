import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { withAuth, useAuth } from '../../lib/auth';
import { invoiceApi } from '../../lib/api';
import { formatAmount } from '../../lib/format';
import SendToCustomerModal from '../../components/SendToCustomerModal';
import PaymentModal, { ReasonModal, methodLabel } from '../../components/PaymentModal';
import { InvoiceStatus } from '../../components/StatusBadge';

const errText = (err, fallback) => err.response?.data?.detail ?? err.response?.data?.message ?? fallback;

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
  const [exportingSecondary, setExportingSecondary] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [voiding, setVoiding] = useState(null);
  const { hasRole } = useAuth();
  // Owners (ADMIN) inherit SALES_MANAGER, as on the backend.
  const canManage = hasRole('SUPER_ADMIN', 'ADMIN', 'SALES_MANAGER', 'FINANCE_USER');

  const { data: invoice } = useQuery({
    queryKey: ['invoice-detail', id],
    queryFn: () => invoiceApi.get(id).then((r) => r.data),
    enabled: !!id,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['invoice-payments', id],
    queryFn: () => invoiceApi.payments(id).then((r) => r.data),
    enabled: !!id && canManage,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['invoice-detail', id] });
    qc.invalidateQueries({ queryKey: ['invoice-payments', id] });
    qc.invalidateQueries({ queryKey: ['invoices'] });
    qc.invalidateQueries({ queryKey: ['balances'] });
  };

  const paymentMutation = useMutation({
    mutationFn: (data) => invoiceApi.recordPayment(id, data),
    onSuccess: (res) => {
      toast.success(`Payment recorded — receipt ${res.data.receiptNumber}`);
      refresh();
      setShowPayment(false);
    },
    onError: (err) => toast.error(errText(err, 'Failed to record payment')),
  });

  const voidMutation = useMutation({
    mutationFn: ({ paymentId, reason }) => invoiceApi.voidPayment(paymentId, reason),
    onSuccess: () => { toast.success('Payment voided'); refresh(); setVoiding(null); },
    onError: (err) => toast.error(errText(err, 'Could not void the payment')),
  });

  const cancelMutation = useMutation({
    mutationFn: (reason) => invoiceApi.cancel(id, reason),
    onSuccess: () => {
      toast.success('Invoice cancelled — its items can be invoiced again from the order');
      refresh();
      setShowCancel(false);
    },
    onError: (err) => toast.error(errText(err, 'Could not cancel the invoice')),
  });

  const canRecordPayment = canManage && invoice && ['ISSUED', 'PARTIALLY_PAID'].includes(invoice.status);
  const canCancel = canManage && invoice && invoice.status !== 'CANCELLED' && Number(invoice.paidAmount || 0) === 0;

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

  const handleExportSecondarySales = async () => {
    setExportingSecondary(true);
    try {
      const { data } = await invoiceApi.exportSecondarySales(id);
      const url = URL.createObjectURL(new Blob([data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoice?.invoiceNumber || id}-secondary-sales.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Exported secondary sales data');
    } catch {
      toast.error('Export failed');
    } finally {
      setExportingSecondary(false);
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
        <button onClick={handleExportSecondarySales} disabled={!invoice || exportingSecondary} style={{
          padding: '6px 14px', background: '#455a64', color: '#fff',
          border: 'none', borderRadius: 4, cursor: (invoice && !exportingSecondary) ? 'pointer' : 'default',
          opacity: (invoice && !exportingSecondary) ? 1 : 0.6, fontWeight: 600, fontSize: 13,
        }}>{exportingSecondary ? 'Exporting…' : '⬇ Export Excel (secondary sales)'}</button>
        <button onClick={() => setShowSend(true)} disabled={!invoice} style={{
          padding: '6px 14px', background: '#25d366', color: '#fff',
          border: 'none', borderRadius: 4, cursor: invoice ? 'pointer' : 'default',
          opacity: invoice ? 1 : 0.6, fontWeight: 600, fontSize: 13,
        }}>✉ Send to Customer</button>
        {canRecordPayment && (
          <button onClick={() => setShowPayment(true)} style={{
            padding: '6px 14px', background: '#00897b', color: '#fff',
            border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 13,
          }}>💰 Record Payment</button>
        )}
        {canCancel && (
          <button onClick={() => setShowCancel(true)} style={{
            padding: '6px 14px', background: '#c62828', color: '#fff',
            border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 13,
          }}>Cancel Invoice</button>
        )}
      </div>

      {invoice && (
        <div className="no-print" style={{ maxWidth: '210mm', margin: '16px auto 0', padding: '0 8px' }}>
          <div className="card p-4">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
              <div>
                <p className="text-xs text-gray-500">Status</p>
                <InvoiceStatus inv={invoice} />
              </div>
              <Figure label="Total" value={invoice.total} />
              <Figure label="Paid" value={invoice.paidAmount} tone="green" />
              <Figure label="Balance" value={invoice.balance} tone={Number(invoice.balance) > 0 ? 'red' : undefined} />
              <div>
                <p className="text-xs text-gray-500">Due date</p>
                <p className={`font-medium ${invoice.overdue ? 'text-red-700' : ''}`}>{invoice.dueDate || '—'}</p>
              </div>
              {invoice.order && (
                <div>
                  <p className="text-xs text-gray-500">Order</p>
                  <Link href={`/orders/${invoice.order.id}`} className="font-mono text-brand-600 hover:underline">
                    {invoice.order.orderNumber}
                  </Link>
                  {invoice.order.status === 'PARTIALLY_INVOICED' && (
                    <span className="ml-2 badge-amber">part of order</span>
                  )}
                </div>
              )}
            </div>
            {invoice.notes && <p className="mt-3 text-sm text-gray-600">Note: {invoice.notes}</p>}
            {invoice.status === 'CANCELLED' && (
              <p className="mt-3 text-sm text-red-700">
                Cancelled{invoice.cancelReason ? ` — ${invoice.cancelReason}` : ''}. Its items went back to the order.
              </p>
            )}

            {canManage && (
              <div className="mt-4 border-t border-gray-100 pt-3">
                <h3 className="mb-2 text-sm font-semibold text-gray-700">Payments</h3>
                {payments.length === 0 ? (
                  <p className="text-sm text-gray-500">No payments yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-gray-500">
                        <th className="py-1.5">Date</th>
                        <th className="py-1.5">Receipt</th>
                        <th className="py-1.5">Method</th>
                        <th className="py-1.5">Reference</th>
                        <th className="py-1.5">To</th>
                        <th className="py-1.5 text-right">Amount</th>
                        <th className="py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.id} className={`border-b border-gray-50 ${p.voided ? 'text-gray-400 line-through' : ''}`}>
                          <td className="py-1.5">{p.paymentDate}</td>
                          <td className="py-1.5 font-mono text-xs">{p.receiptNumber || '—'}</td>
                          <td className="py-1.5">{methodLabel(p.paymentMethod)}</td>
                          <td className="py-1.5">{p.referenceNumber || '—'}</td>
                          <td className="py-1.5">{p.bankAccountName}</td>
                          <td className="py-1.5 text-right tabular-nums">{formatAmount(p.amount)}</td>
                          <td className="py-1.5 text-right no-underline">
                            {p.voided ? (
                              <span className="text-xs no-underline" title={p.voidReason}>void</span>
                            ) : (
                              <button className="text-xs text-red-600 hover:underline" onClick={() => setVoiding(p)}>Void</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      )}

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

      {showSend && invoice && (
        <SendToCustomerModal
          type="invoice"
          id={id}
          number={invoice.invoiceNumber}
          onClose={() => setShowSend(false)}
        />
      )}

      {showPayment && invoice && (
        <PaymentModal
          title="Record payment"
          subtitle={`${invoice.invoiceNumber} — ${invoice.customer?.name ?? ''}`}
          maxAmount={invoice.balance}
          isPending={paymentMutation.isPending}
          onClose={() => setShowPayment(false)}
          onSubmit={(d) => paymentMutation.mutate(d)}
        />
      )}
      {showCancel && invoice && (
        <ReasonModal
          title={`Cancel ${invoice.invoiceNumber}?`}
          message="The invoice is reversed in the accounts and its items go back to the order, ready to invoice again."
          confirmLabel="Cancel invoice"
          isPending={cancelMutation.isPending}
          onClose={() => setShowCancel(false)}
          onConfirm={(reason) => cancelMutation.mutate(reason)}
        />
      )}
      {voiding && (
        <ReasonModal
          title={`Void payment of LKR ${formatAmount(voiding.amount)}?`}
          message="Use this for a payment recorded by mistake. The amount becomes owed again; the record is kept, marked void."
          confirmLabel="Void payment"
          isPending={voidMutation.isPending}
          onClose={() => setVoiding(null)}
          onConfirm={(reason) => voidMutation.mutate({ paymentId: voiding.id, reason })}
        />
      )}
    </div>
  );
}

function Figure({ label, value, tone }) {
  const color = tone === 'red' ? 'text-red-700' : tone === 'green' ? 'text-green-700' : 'text-gray-900';
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`font-semibold tabular-nums ${color}`}>LKR {formatAmount(value)}</p>
    </div>
  );
}

export default withAuth(InvoiceDetailPage, [], 'MOD_INVOICES', 'SFA');
