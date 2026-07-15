import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import { withAuth, useAuth } from '../../lib/auth';
import { posApi, productApi, customerApi, pricingApi, settingsApi, drawerApi, companyProfileApi } from '../../lib/api';
import toast from 'react-hot-toast';
import { formatAmount } from '../../lib/format';

// ── Debounce ──────────────────────────────────────────────────────────────────

function useDebounce(value, delay = 220) {
  const [dv, setDv] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return dv;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcItem(item) {
  const gross          = item.unitPrice * item.quantity;
  const discountAmount = gross * item.discountPct / 100;
  const afterDiscount  = gross - discountAmount;
  const taxAmount      = afterDiscount * item.taxPct / 100;
  return { discountAmount, taxAmount, lineTotal: afterDiscount + taxAmount };
}

const fmt = (v) => formatAmount(v);

// ── Print receipt ─────────────────────────────────────────────────────────────

function printReceipt(data, copies = 1, companyProfile = null) {
  const now = new Date().toLocaleString('en', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const companyHeader = companyProfile ? `
    ${companyProfile.logoUrl ? `<div class="c"><img src="${companyProfile.logoUrl}" style="max-height:40px;max-width:60mm;margin-bottom:2px" /></div>` : ''}
    <div class="c b" style="font-size:14px">${companyProfile.companyName || ''}</div>
    ${companyProfile.operatingAddress ? `<div class="c" style="font-size:9px">${companyProfile.operatingAddress}</div>` : ''}
    ${(companyProfile.phone || companyProfile.email) ? `<div class="c" style="font-size:9px">${[companyProfile.phone, companyProfile.email].filter(Boolean).join(' · ')}</div>` : ''}
    <hr class="hr">
  ` : '';

  const companyFooter = companyProfile && (companyProfile.taxId || companyProfile.vatRegistrationNumber) ? `
    <hr class="hr">
    <div class="c" style="font-size:9px">
      ${[
        companyProfile.taxId ? `TIN: ${companyProfile.taxId}` : '',
        companyProfile.vatRegistrationNumber ? `VAT Reg: ${companyProfile.vatRegistrationNumber}` : '',
      ].filter(Boolean).join(' · ')}
    </div>
  ` : '';
  const itemRows = data.items.map(item => {
    const gross          = item.unitPrice * item.quantity;
    const discountAmount = gross * (item.discountPct || 0) / 100;
    const afterDiscount  = gross - discountAmount;
    const name           = (item.productName || 'Item').slice(0, 28);
    const hasDiscount    = discountAmount > 0;
    return `
      <tr><td colspan="2">${name}</td></tr>
      <tr>
        <td style="padding-left:8px;color:#555">
          ${Number(item.quantity).toFixed(item.quantity % 1 === 0 ? 0 : 2)} × LKR ${formatAmount(item.unitPrice)}
        </td>
        <td class="r">${formatAmount(gross)}</td>
      </tr>
      ${hasDiscount ? `
      <tr>
        <td style="padding-left:8px;color:#555">Discount (${Number(item.discountPct).toFixed(1)}%)</td>
        <td class="r" style="color:#555">-${formatAmount(discountAmount)}</td>
      </tr>
      <tr>
        <td style="padding-left:8px;font-weight:bold">Item Total</td>
        <td class="r" style="font-weight:bold">${formatAmount(afterDiscount)}</td>
      </tr>` : ''}`;
  }).join('');

  const isCredit = data.paymentMethod === 'CREDIT';
  const paidLabel = isCredit ? 'Paid Now' : 'Tendered';
  const paidVal   = isCredit ? data.amountPaid : data.tendered;
  const balLabel  = isCredit ? 'Balance Due' : 'Balance';
  const balVal    = isCredit ? data.balanceDue : data.change;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Receipt ${data.saleNumber}</title>
    <style>
      @page { size: 80mm auto; margin: 4mm 3mm; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family:'Courier New',monospace; font-size:11px; width:72mm; line-height:1.5; }
      .c{text-align:center} .r{text-align:right} .b{font-weight:bold}
      .hr{border:none;border-top:1px dashed #000;margin:5px 0}
      table{width:100%;border-collapse:collapse} td{vertical-align:top}
      td:last-child{text-align:right;white-space:nowrap}
      .tr td{font-weight:bold;font-size:13px;padding-top:3px}
      .cb{border:2px solid #000;text-align:center;padding:6px 4px;margin:6px 0}
      .cb .l{font-size:10px;letter-spacing:2px;text-transform:uppercase}
      .cb .a{font-size:22px;font-weight:bold;line-height:1.2}
    </style>
  </head><body>
    ${companyHeader}
    <div class="c b" style="font-size:15px">RECEIPT</div>
    <div class="c">${now}</div>
    <div class="c">Sale # ${data.saleNumber}</div>
    <hr class="hr">
    <table>${itemRows}</table>
    <hr class="hr">
    <table>
      <tr class="tr"><td>TOTAL</td><td>LKR ${formatAmount(data.total)}</td></tr>
      <tr><td>${paidLabel}</td><td>LKR ${formatAmount(paidVal)}</td></tr>
      ${data.paymentMethod === 'CARD' && data.cardLast4 ? `<tr><td>Card</td><td>**** ${data.cardLast4}</td></tr>` : ''}
    </table>
    <div class="cb"><div class="l">${balLabel}</div><div class="a">LKR ${formatAmount(balVal)}</div></div>
    ${companyFooter}
    <hr class="hr"><div class="c">Thank you!</div>
  </body></html>`;

  for (let i = 0; i < copies; i++) {
    setTimeout(() => {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:80mm;height:200mm;visibility:hidden;';
      document.body.appendChild(iframe);
      iframe.contentDocument.open();
      iframe.contentDocument.write(html);
      iframe.contentDocument.close();
      setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => document.body.removeChild(iframe), 2000);
      }, 120);
    }, i * 400);
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

const PRICE_SOURCE_BADGES = {
  CUSTOMER_PRICE: { label: 'Customer Price', className: 'bg-purple-50 text-purple-700 border-purple-200' },
  BATCH_PRICE:    { label: 'Batch Price',    className: 'bg-teal-50 text-teal-700 border-teal-200' },
  PROMOTION:      { label: 'Promo',          className: 'bg-orange-50 text-orange-700 border-orange-200' },
};

function PriceSourceBadge({ item }) {
  const meta = PRICE_SOURCE_BADGES[item.priceSource];
  if (!meta) return null;
  const label = item.priceSource === 'PROMOTION' && item.promotionName
    ? `Promo: ${item.promotionName}`
    : meta.label;
  return (
    <span className={`ml-1.5 inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium ${meta.className}`}>
      {label}
    </span>
  );
}

function CartRow({ item, onChange, onRemove }) {
  const { lineTotal } = calcItem(item);
  const maxDiscountAmount = Number(item.maxDiscountAmount ?? 0);
  const currentDiscountAmt = item.unitPrice * (item.discountPct || 0) / 100;
  const [discountInput, setDiscountInput] = useState(
    currentDiscountAmt > 0 ? currentDiscountAmt.toFixed(2) : ''
  );

  function applyDiscount(rawValue) {
    if (rawValue === '') {
      setDiscountInput('');
      onChange({ ...item, discountPct: 0 });
      return;
    }
    let amt = parseFloat(rawValue);
    if (isNaN(amt) || amt < 0) amt = 0;
    if (amt > maxDiscountAmount) {
      amt = maxDiscountAmount;
      toast.error(`Max discount for this item is LKR ${formatAmount(maxDiscountAmount)}`);
    }
    setDiscountInput(amt === 0 ? '' : String(amt));
    const pct = item.unitPrice > 0 ? (amt / item.unitPrice) * 100 : 0;
    onChange({ ...item, discountPct: pct });
  }

  return (
    <div className="flex items-center gap-2 border-b border-gray-100 py-2.5 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-800">{item.productName}</p>
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-gray-400">
          <span>LKR {fmt(item.unitPrice)}</span>
          <PriceSourceBadge item={item} />
          <span className="flex items-center gap-1">
            <span className="text-gray-300">·</span>
            <span>Disc.</span>
            <input
              type="number" step="0.01" min="0" max={maxDiscountAmount || undefined}
              disabled={maxDiscountAmount <= 0}
              className="w-14 rounded border border-gray-300 px-1 py-0.5 text-right font-mono text-[11px] disabled:bg-gray-50 disabled:text-gray-300"
              value={discountInput}
              onChange={e => applyDiscount(e.target.value)}
              placeholder="0.00"
              title={maxDiscountAmount > 0
                ? `Max discount: LKR ${formatAmount(maxDiscountAmount)}`
                : 'No discount allowed for this item'}
            />
          </span>
          {currentDiscountAmt > 0 && (
            <span className="font-medium text-green-600">−LKR {fmt(currentDiscountAmt)}</span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button onClick={() => onChange({ ...item, quantity: Math.max(1, item.quantity - 1) })}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 text-sm font-bold text-gray-600 hover:bg-gray-100">−</button>
        <span className="w-8 text-center font-mono text-sm font-semibold">{item.quantity}</span>
        <button onClick={() => {
            if (item.stockAvailable != null && item.quantity + 1 > item.stockAvailable) {
              toast.error(`Insufficient stock for ${item.productName}. Available: ${item.stockAvailable}`);
              return;
            }
            onChange({ ...item, quantity: item.quantity + 1 });
          }}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 text-sm font-bold text-gray-600 hover:bg-gray-100">+</button>
      </div>
      <span className="w-24 shrink-0 text-right font-semibold tabular-nums text-gray-800">
        LKR {fmt(lineTotal)}
      </span>
      <button onClick={onRemove} className="ml-1 shrink-0 text-gray-300 transition-colors hover:text-red-500">
        <XIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Open Drawer Modal (blocking — no dismiss) ──────────────────────────────────

function OpenDrawerModal({ onSubmit, isPending }) {
  const [openingFloat, setOpeningFloat] = useState('');
  const [notes, setNotes] = useState('');

  function submit(e) {
    e.preventDefault();
    const amount = parseFloat(openingFloat);
    if (isNaN(amount) || amount < 0) { toast.error('Enter a valid opening float'); return; }
    onSubmit(amount, notes || null);
  }

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-900/70 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-2xl">💵</span>
          <h2 className="text-lg font-bold text-gray-900">Open Cash Drawer</h2>
        </div>
        <p className="mb-4 text-sm text-gray-500">
          Enter the starting cash float to begin your shift. You must open the drawer before processing sales.
          You can still use the sidebar to navigate away from this page.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">Opening Float (LKR)</label>
            <input
              type="number" step="0.01" min="0" autoFocus
              className="input w-full text-center font-mono text-lg"
              value={openingFloat} onChange={e => setOpeningFloat(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">Notes (optional)</label>
            <input className="input w-full text-sm" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <button type="submit" disabled={isPending} className="btn-primary w-full py-2.5 disabled:opacity-50">
            {isPending ? 'Opening…' : 'Open Drawer & Start Selling'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Cash Movement Modal ────────────────────────────────────────────────────────

function CashMovementModal({ balance, onSubmit, onClose, isPending }) {
  const [type, setType] = useState('DEPOSIT');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function submit(e) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { toast.error('Enter a valid amount'); return; }
    if (type === 'WITHDRAWAL' && amt > balance) { toast.error('Cannot exceed current drawer balance'); return; }
    onSubmit({ type, amount: amt, notes: notes || null });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="mb-1 text-base font-semibold text-gray-900">Cash Movement</h2>
        <p className="mb-4 text-xs text-gray-500">Current drawer balance: <span className="font-semibold text-gray-700">LKR {fmt(balance)}</span></p>
        <form onSubmit={submit} className="space-y-3">
          <div className="flex gap-2">
            {['DEPOSIT', 'WITHDRAWAL'].map(t => (
              <button key={t} type="button" onClick={() => setType(t)}
                className={`flex-1 rounded-lg border py-2 text-xs font-semibold transition-colors ${
                  type === t ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-600 hover:border-blue-400'
                }`}>
                {t === 'DEPOSIT' ? '⬇ Deposit' : '⬆ Withdrawal'}
              </button>
            ))}
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">Amount (LKR)</label>
            <input type="number" step="0.01" min="0.01" autoFocus
              className="input w-full text-center font-mono text-lg"
              value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">Notes (optional)</label>
            <input className="input w-full text-sm" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={isPending} className="btn-primary flex-1 disabled:opacity-50">
              {isPending ? 'Saving…' : 'Record'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Day End (Close Drawer) Modal ───────────────────────────────────────────────

function DayEndModal({ session, onSubmit, onClose, isPending }) {
  const [countedCash, setCountedCash] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const expected = Number(session.expectedCash || 0);
  const counted = parseFloat(countedCash);
  const variance = !isNaN(counted) ? counted - expected : null;

  function submit(e) {
    e.preventDefault();
    if (isNaN(counted) || counted < 0) { toast.error('Enter the counted cash amount'); return; }
    onSubmit({ countedCash: counted, notes: notes || null });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Day End — Close Drawer</h2>
        <div className="mb-4 space-y-1 text-sm">
          <div className="flex justify-between text-gray-500">
            <span>Opening Float</span><span className="tabular-nums text-gray-800">LKR {fmt(session.openingFloat)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span className="text-gray-600">Expected Cash</span><span className="tabular-nums text-blue-700">LKR {fmt(expected)}</span>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">Counted Cash (LKR)</label>
            <input type="number" step="0.01" min="0" autoFocus
              className="input w-full text-center font-mono text-lg"
              value={countedCash} onChange={e => setCountedCash(e.target.value)} />
          </div>
          {variance !== null && (
            <div className={`flex items-center justify-between rounded-lg border px-3 py-1.5 ${
              variance === 0 ? 'border-green-200 bg-green-50' : variance > 0 ? 'border-blue-200 bg-blue-50' : 'border-red-200 bg-red-50'
            }`}>
              <span className={`text-sm font-medium ${variance === 0 ? 'text-green-700' : variance > 0 ? 'text-blue-700' : 'text-red-700'}`}>
                {variance === 0 ? 'Balanced' : variance > 0 ? 'Over' : 'Short'}
              </span>
              <span className={`font-bold tabular-nums ${variance === 0 ? 'text-green-700' : variance > 0 ? 'text-blue-700' : 'text-red-700'}`}>
                LKR {fmt(Math.abs(variance))}
              </span>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">Notes (optional)</label>
            <input className="input w-full text-sm" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={isPending} className="btn-primary flex-1 disabled:opacity-50">
              {isPending ? 'Closing…' : 'Close Drawer'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Held Bills Modal ──────────────────────────────────────────────────────────

function HeldBillsModal({ bills, onRecall, onDelete, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl" style={{ maxHeight: '80vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <PauseIcon />
            <h2 className="font-semibold text-gray-900">Held Bills</h2>
            {bills.length > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-700">
                {bills.length}
              </span>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {bills.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-gray-400">
              <PauseIcon className="h-10 w-10 text-gray-200 mb-3" />
              <p className="text-sm">No held bills</p>
            </div>
          ) : (
            bills.map((b, i) => (
              <div key={b.id}
                className="flex items-center gap-4 border-b border-gray-100 px-5 py-3 last:border-0 hover:bg-gray-50 transition-colors">
                {/* Hold number */}
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-amber-50 text-sm font-bold text-amber-700">
                  {b.holdNumber}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">
                    {b.itemCount} item{b.itemCount !== 1 ? 's' : ''}
                    {b.customer && <span className="text-gray-500 font-normal"> · {b.customer.name}</span>}
                  </p>
                  <p className="text-xs text-gray-400">
                    {b.heldAt.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </p>
                </div>
                {/* Total */}
                <span className="font-bold tabular-nums text-gray-800 text-sm flex-shrink-0">
                  LKR {fmt(b.total)}
                </span>
                {/* Actions */}
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => onRecall(b.id)}
                    className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors">
                    <RecallIcon /> Recall
                  </button>
                  <button
                    onClick={() => onDelete(b.id)}
                    className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600 transition-colors">
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-5 py-3">
          <button onClick={onClose}
            className="w-full rounded-xl border border-gray-200 py-2.5 text-sm text-gray-500 hover:bg-gray-50 transition-colors">
            Close <span className="text-gray-400 text-xs">(Esc)</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Confirm / receipt modal ───────────────────────────────────────────────────

function ConfirmModal({ data, printCopies, onPrintCopiesChange, onClose, companyProfile }) {
  const isCredit = data.paymentMethod === 'CREDIT';
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative flex w-full max-w-xs flex-col rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600 text-lg font-bold">✓</div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900">Sale Complete</p>
            <p className="font-mono text-xs text-gray-500">{data.saleNumber}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <XIcon className="h-4 w-4" />
          </button>
        </div>
        {/* Summary */}
        <div className="space-y-2 px-5 pt-4 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Items</span>
            <span className="font-semibold">{data.itemCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Total</span>
            <span className="font-semibold tabular-nums">LKR {fmt(data.total)}</span>
          </div>
          {!isCredit && (
            <div className="flex justify-between">
              <span className="text-gray-500">Tendered</span>
              <span className="font-semibold tabular-nums">LKR {fmt(data.tendered)}</span>
            </div>
          )}
          {data.paymentMethod === 'CARD' && data.cardLast4 && (
            <div className="flex justify-between">
              <span className="text-gray-500">Card</span>
              <span className="font-semibold tabular-nums">**** {data.cardLast4}</span>
            </div>
          )}
          {isCredit && data.amountPaid > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">Paid Now</span>
              <span className="font-semibold tabular-nums">LKR {fmt(data.amountPaid)}</span>
            </div>
          )}
        </div>
        {/* Balance — BIG */}
        <div className={`mx-5 my-4 rounded-xl border-2 px-4 py-5 text-center ${
          isCredit ? 'border-amber-400 bg-amber-50' : 'border-green-400 bg-green-50'
        }`}>
          <p className={`mb-1 text-[10px] font-bold uppercase tracking-widest ${isCredit ? 'text-amber-600' : 'text-green-600'}`}>
            {isCredit ? 'Balance Due (Credit)' : 'Balance'}
          </p>
          <p className={`text-5xl font-extrabold tabular-nums leading-none ${isCredit ? 'text-amber-700' : 'text-green-700'}`}>
            LKR {fmt(isCredit ? data.balanceDue : data.change)}
          </p>
        </div>
        {/* Print */}
        <div className="space-y-2 px-5 pb-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Print copies</span>
            <div className="flex items-center gap-2">
              <button onClick={() => onPrintCopiesChange(printCopies - 1)}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 font-bold text-gray-600 hover:bg-gray-100">−</button>
              <span className="w-6 text-center font-mono text-sm font-bold">{printCopies}</span>
              <button onClick={() => onPrintCopiesChange(printCopies + 1)}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 font-bold text-gray-600 hover:bg-gray-100">+</button>
            </div>
          </div>
          <button onClick={() => printReceipt(data, printCopies, companyProfile)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 py-2.5 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100">
            <PrintIcon /> Print Receipt
          </button>
          <button onClick={onClose}
            className="w-full rounded-xl border border-gray-200 py-2.5 text-sm text-gray-500 transition-colors hover:bg-gray-50">
            Close <span className="text-xs text-gray-400">(Esc)</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function PosPage() {
  const qc = useQueryClient();
  const { user } = useAuth();

  // Cash drawer
  const [showCashMovement, setShowCashMovement] = useState(false);
  const [showDayEnd,       setShowDayEnd]       = useState(false);

  // Scoped by username (in addition to the cache being fully cleared on login/logout) so a
  // stale entry from a previously logged-in cashier/admin in this tab can never surface here.
  const { data: drawerSession, isLoading: drawerLoading, isError: drawerCheckFailed, refetch: refetchDrawer } = useQuery({
    queryKey: ['pos-current-drawer', user?.username],
    queryFn: () => drawerApi.current().then(r => r.data || null),
    enabled: !!user,
  });

  const openDrawerMutation = useMutation({
    mutationFn: (body) => drawerApi.openSession(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-current-drawer'] });
      toast.success('Drawer opened');
    },
    onError: (err) => {
      const message = err.response?.data?.detail ?? err.response?.data?.message ?? 'Failed to open drawer';
      toast.error(message);
      if (message.toLowerCase().includes('already have an open drawer session')) {
        // A session exists server-side but our cached "current drawer" check missed it (stale
        // load, race with another tab, etc). Re-sync instead of leaving the cashier stuck on
        // a blocking modal with no way forward.
        qc.invalidateQueries({ queryKey: ['pos-current-drawer'] });
      }
    },
  });

  const movementMutation = useMutation({
    mutationFn: ({ id, body }) => drawerApi.recordMovement(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-current-drawer'] });
      setShowCashMovement(false);
      toast.success('Cash movement recorded');
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? err.response?.data?.message ?? 'Failed to record movement'),
  });

  const closeDrawerMutation = useMutation({
    mutationFn: ({ id, body }) => drawerApi.closeSession(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-current-drawer'] });
      setShowDayEnd(false);
      toast.success('Drawer closed');
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? err.response?.data?.message ?? 'Failed to close drawer'),
  });

  // Entry
  const [query,        setQuery]        = useState('');
  const [selIdx,       setSelIdx]       = useState(-1);
  const [selectedProd, setSelectedProd] = useState(null);
  const [qty,          setQty]          = useState('1');
  const [discount,     setDiscount]     = useState(''); // Rs discount off the unit price, entered before adding to cart

  // Cart
  const [cart, setCart] = useState([]);

  // Held bills
  const [heldBills,     setHeldBills]     = useState([]);
  const [showHeldBills, setShowHeldBills] = useState(false);

  // Customer
  const [customer,         setCustomer]         = useState(null);
  const [customerSearch,   setCustomerSearch]   = useState('');
  const [customerDropdown, setCustomerDropdown] = useState(false);
  const [customerSelIdx,   setCustomerSelIdx]   = useState(-1);
  const [showQuickAdd,     setShowQuickAdd]     = useState(false);
  const [quickName,        setQuickName]        = useState('');
  const [quickPhone,       setQuickPhone]       = useState('');

  // Pricing (batch / customer-specific / promotion)
  const [customerPriceOverrides, setCustomerPriceOverrides] = useState({});
  const [selectedProdPricing, setSelectedProdPricing] = useState(null);
  // shape: { loading, customerPrice, generalTiers, fallbackPrice, fallbackSource, fallbackPromoName } | null
  const [manualTierId, setManualTierId] = useState(null); // cashier's explicit tier pick, when a product has multiple

  // Payment
  const [paymentMethod,  setPaymentMethod]  = useState('CASH');
  const [amountTendered, setAmountTendered] = useState('');
  const [amountPaidNow,  setAmountPaidNow]  = useState('');
  const [cardLast4,      setCardLast4]      = useState('');
  const [notes,          setNotes]          = useState('');

  // Sale confirm modal
  const [saleConfirm, setSaleConfirm] = useState(null);
  const [printCopies, setPrintCopies] = useState(1);

  // Refs
  const searchRef        = useRef(null);
  const qtyRef           = useRef(null);
  const discountRef      = useRef(null);
  const tenderedRef      = useRef(null);
  const listRef          = useRef(null);
  const customerListRef  = useRef(null);
  const printCopiesRef   = useRef(1);
  const holdCounterRef   = useRef(1);

  // Ref to always-current actions (avoids stale closures in global key handler)
  const actionsRef = useRef({});

  const debouncedQuery = useDebounce(query, 220);

  // Focus search on mount
  useEffect(() => { searchRef.current?.focus(); }, []);

  // ── Company profile (receipt branding) ────────────────────────────────────

  const { data: companyProfile } = useQuery({
    queryKey: ['company-profile'],
    queryFn: () => companyProfileApi.get().then(r => r.data),
    staleTime: 5 * 60_000,
  });

  // ── System settings ───────────────────────────────────────────────────────

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.list().then(r => r.data),
    staleTime: 60_000,
  });
  const taxEnabled = settingsData?.find(s => s.key === 'pos_tax_enabled')?.value !== 'false';
  const autoPrintEnabled = settingsData?.find(s => s.key === 'pos_auto_print_receipt')?.value !== 'false';
  const inventoryTrackingEnabled = settingsData?.find(s => s.key === 'inventory_tracking')?.value === 'true';
  const defaultPrintCopies = Math.max(1, Math.min(10,
    parseInt(settingsData?.find(s => s.key === 'pos_print_copies_default')?.value ?? '1', 10) || 1));

  // Adopt the admin-configured default copy count once settings load
  useEffect(() => {
    if (settingsData) {
      setPrintCopies(defaultPrintCopies);
      printCopiesRef.current = defaultPrintCopies;
    }
  }, [settingsData]);

  // ── Products query ────────────────────────────────────────────────────────

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['pos-products', debouncedQuery],
    queryFn: () =>
      productApi.list({ page: 0, size: 50, search: debouncedQuery || undefined }).then(r => r.data),
    staleTime: 30_000,
  });
  const products = productsData?.content ?? [];

  useEffect(() => { setSelIdx(products.length > 0 ? 0 : -1); }, [products]);

  useEffect(() => {
    if (selIdx >= 0 && listRef.current)
      listRef.current.children[selIdx]?.scrollIntoView({ block: 'nearest' });
  }, [selIdx]);

  // ── Customer search ───────────────────────────────────────────────────────

  const debouncedCustomerSearch = useDebounce(customerSearch, 220);

  const { data: customerData } = useQuery({
    queryKey: ['pos-customers', debouncedCustomerSearch],
    queryFn: () =>
      customerApi.listPos({ page: 0, size: 20, search: debouncedCustomerSearch }).then(r => r.data),
    enabled: customerDropdown,
    staleTime: 10_000,
  });
  const customerResults = customerData?.content ?? [];

  useEffect(() => { setCustomerSelIdx(customerResults.length > 0 ? 0 : -1); }, [customerResults]);

  useEffect(() => {
    if (customerSelIdx >= 0 && customerListRef.current)
      customerListRef.current.children[customerSelIdx]?.scrollIntoView({ block: 'nearest' });
  }, [customerSelIdx]);

  // ── Load batch/customer pricing for the selected product ────────────────────
  useEffect(() => {
    setManualTierId(null);
    if (!selectedProd) { setSelectedProdPricing(null); return; }
    let cancelled = false;

    async function load() {
      setSelectedProdPricing({
        loading: true, customerPrice: null, generalTiers: [],
        fallbackPrice: null, fallbackSource: null, fallbackPromoName: null,
      });

      if (customer && customerPriceOverrides[selectedProd.id] != null) {
        if (!cancelled) setSelectedProdPricing({
          loading: false, customerPrice: customerPriceOverrides[selectedProd.id],
          generalTiers: [], fallbackPrice: null, fallbackSource: null, fallbackPromoName: null,
        });
        return;
      }

      try {
        const tiersRes = await pricingApi.tiers(selectedProd.id, customer?.id);
        const tiers = tiersRes.data || [];
        const customerTier = tiers.find(t => t.customerSpecific);
        const generalTiers = tiers.filter(t => !t.customerSpecific)
          .slice().sort((a, b) => (Number(a.minQty) || 0) - (Number(b.minQty) || 0));

        let fallbackPrice = null, fallbackSource = null, fallbackPromoName = null;
        if (!customerTier && generalTiers.length === 0) {
          const resolveRes = await pricingApi.resolve(selectedProd.id, customer?.id ?? null);
          fallbackPrice = resolveRes.data.unitPrice;
          fallbackSource = resolveRes.data.priceSource;
          fallbackPromoName = resolveRes.data.promotionName;
        }

        if (!cancelled) setSelectedProdPricing({
          loading: false,
          customerPrice: customerTier ? customerTier.price : null,
          generalTiers, fallbackPrice, fallbackSource, fallbackPromoName,
        });
      } catch {
        if (!cancelled) setSelectedProdPricing({
          loading: false, customerPrice: null, generalTiers: [],
          fallbackPrice: selectedProd.defaultPrice, fallbackSource: 'DEFAULT_PRICE', fallbackPromoName: null,
        });
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProd?.id, customer?.id]);

  // Effective unit price for the selected product at the currently entered quantity —
  // recomputed instantly client-side as qty changes, no extra network calls.
  const effectivePricing = useMemo(() => {
    if (!selectedProd || !selectedProdPricing || selectedProdPricing.loading) return null;
    const q = parseFloat(qty) || 1;

    if (selectedProdPricing.customerPrice != null) {
      return { unitPrice: selectedProdPricing.customerPrice, priceSource: 'CUSTOMER_PRICE', promotionName: null };
    }
    // Cashier explicitly tapped a tier chip — that choice wins over the auto-picked one.
    const manualTier = manualTierId
      ? selectedProdPricing.generalTiers.find(t => t.id === manualTierId)
      : null;
    if (manualTier) {
      return { unitPrice: manualTier.price, priceSource: 'BATCH_PRICE', promotionName: null };
    }
    const eligible = selectedProdPricing.generalTiers.filter(t => !t.minQty || Number(t.minQty) <= q);
    if (eligible.length > 0) {
      const best = eligible.reduce((a, b) => (Number(b.minQty) || 0) > (Number(a.minQty) || 0) ? b : a);
      return { unitPrice: best.price, priceSource: 'BATCH_PRICE', promotionName: null };
    }
    if (selectedProdPricing.generalTiers.length > 0) {
      // Batch tiers exist but qty doesn't meet any threshold yet — plain default, not the bulk price.
      return { unitPrice: selectedProd.defaultPrice, priceSource: 'DEFAULT_PRICE', promotionName: null };
    }
    return {
      unitPrice: selectedProdPricing.fallbackPrice ?? selectedProd.defaultPrice,
      priceSource: selectedProdPricing.fallbackSource ?? 'DEFAULT_PRICE',
      promotionName: selectedProdPricing.fallbackPromoName,
    };
  }, [selectedProd, selectedProdPricing, qty, manualTierId]);

  // ── Totals ────────────────────────────────────────────────────────────────

  const totals = useMemo(() => {
    let subtotal = 0, discountTotal = 0, taxTotal = 0;
    cart.forEach(item => {
      const { discountAmount, taxAmount } = calcItem(item);
      subtotal      += item.unitPrice * item.quantity;
      discountTotal += discountAmount;
      taxTotal      += taxAmount;
    });
    return { subtotal, discountTotal, taxTotal, total: subtotal - discountTotal + taxTotal };
  }, [cart]);

  const change = paymentMethod === 'CASH'
    ? parseFloat(amountTendered || 0) - totals.total
    : 0;

  const paidNowNum   = parseFloat(amountPaidNow || 0) || 0;
  const creditBalance = totals.total - paidNowNum;
  const creditOverpaid = paymentMethod === 'CREDIT' && paidNowNum > totals.total;
  const cardLast4Valid = /^\d{4}$/.test(cardLast4);

  // ── Sale mutation ─────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (body) => posApi.createSale(body),
    onError: (err) =>
      toast.error(err.response?.data?.detail ?? err.response?.data?.message ?? 'Failed to process sale'),
  });

  const quickAddMutation = useMutation({
    mutationFn: (body) => customerApi.quickCreate(body),
    onSuccess: (res) => {
      setCustomer(res.data);
      setCustomerSearch('');
      setCustomerPriceOverrides({});
      setShowQuickAdd(false);
      setQuickName('');
      setQuickPhone('');
      toast.success(`Customer added — code ${res.data.customerCode}`);
    },
    onError: (err) =>
      toast.error(err.response?.data?.detail ?? err.response?.data?.message ?? 'Failed to add customer'),
  });

  function submitQuickAdd() {
    if (!quickName.trim()) { toast.error('Name is required'); return; }
    if (!quickPhone.trim()) { toast.error('Phone is required'); return; }
    quickAddMutation.mutate({ name: quickName.trim(), phone: quickPhone.trim() });
  }

  // ── Focus helpers ─────────────────────────────────────────────────────────

  const refocusSearch = useCallback(() => {
    setTimeout(() => searchRef.current?.focus(), 25);
  }, []);

  // ── Cart actions ──────────────────────────────────────────────────────────

  function clearCart(skipFocus = false) {
    setCart([]);
    setCustomer(null);
    setCustomerSearch('');
    setCustomerDropdown(false);
    setCustomerSelIdx(-1);
    setCustomerPriceOverrides({});
    setShowQuickAdd(false);
    setQuickName('');
    setQuickPhone('');
    setAmountTendered('');
    setAmountPaidNow('');
    setCardLast4('');
    setNotes('');
    setPaymentMethod('CASH');
    if (!skipFocus) refocusSearch();
  }

  function computeTaxPct(product) {
    if (!taxEnabled) return 0;
    // VAT only applies to customers who are actually VAT-registered (have a tax
    // number on file) and aren't explicitly marked EXEMPT/ZERO_RATED — mirrors
    // PricingEngine.resolveTaxPct() on the backend, which is authoritative.
    const taxable = !customer || (
      !!(customer.taxNumber && customer.taxNumber.trim()) &&
      (customer.taxType == null || customer.taxType === 'STANDARD')
    );
    return taxable ? Number(product.taxRate || 0) : 0;
  }

  function pushItemToCart(product, q, unitPrice, priceSource, promotionName, discountPct = 0) {
    setCart(prev => {
      const idx = prev.findIndex(i => i.productId === product.id);
      if (idx !== -1)
        return prev.map((i, j) =>
          j === idx ? { ...i, quantity: +(i.quantity + q).toFixed(3) } : i
        );
      return [...prev, {
        productId:         product.id,
        productName:       product.name,
        quantity:          q,
        unitPrice:         Number(unitPrice || 0),
        discountPct:       discountPct || 0,
        maxDiscountAmount: Number(product.maxDiscountAmount ?? 0),
        stockAvailable:    inventoryTrackingEnabled ? Number(product.stockAvailable ?? 0) : null,
        taxPct:            computeTaxPct(product),
        priceSource,
        promotionName: promotionName || null,
      }];
    });
    setQuery('');
    setSelectedProd(null);
    setQty('1');
    setDiscount('');
    refocusSearch();
  }

  function addToCart() {
    if (!selectedProd || !effectivePricing) return;
    const q = parseFloat(qty) || 1;

    if (inventoryTrackingEnabled) {
      const available = Number(selectedProd.stockAvailable ?? 0);
      const alreadyInCart = cart.find(i => i.productId === selectedProd.id)?.quantity || 0;
      const totalRequested = alreadyInCart + q;
      if (totalRequested > available) {
        toast.error(`Insufficient stock for ${selectedProd.name}. Available: ${available}, requested: ${totalRequested}`);
        return;
      }
    }

    const maxDiscountAmount = Number(selectedProd.maxDiscountAmount ?? 0);
    let discountAmt = parseFloat(discount) || 0;
    if (discountAmt < 0) discountAmt = 0;
    if (discountAmt > maxDiscountAmount) {
      toast.error(`Max discount for this item is LKR ${formatAmount(maxDiscountAmount)}`);
      discountAmt = maxDiscountAmount;
    }
    const discountPct = effectivePricing.unitPrice > 0 ? (discountAmt / effectivePricing.unitPrice) * 100 : 0;

    pushItemToCart(selectedProd, q, effectivePricing.unitPrice, effectivePricing.priceSource, effectivePricing.promotionName, discountPct);
  }

  function updateCartItem(productId, updated) {
    setCart(prev => prev.map(i => i.productId === productId ? updated : i));
  }

  function removeCartItem(productId) {
    setCart(prev => prev.filter(i => i.productId !== productId));
    refocusSearch();
  }

  // ── Hold / recall / cancel ────────────────────────────────────────────────

  function holdBill() {
    if (cart.length === 0) { toast.error('Cart is empty — nothing to hold'); return; }
    const num = `H${String(holdCounterRef.current++).padStart(3, '0')}`;
    setHeldBills(prev => [...prev, {
      id:          Date.now(),
      holdNumber:  num,
      heldAt:      new Date(),
      cart:        [...cart],
      customer,
      notes,
      paymentMethod,
      total:       totals.total,
      itemCount:   cart.reduce((s, i) => s + i.quantity, 0),
    }]);
    clearCart(false);
    toast(`Bill ${num} held`, { icon: '⏸️' });
  }

  function recallBill(id) {
    const held = heldBills.find(h => h.id === id);
    if (!held) return;

    setHeldBills(prev => {
      const without = prev.filter(h => h.id !== id);
      if (cart.length === 0) return without;
      // auto-hold the current cart
      const num = `H${String(holdCounterRef.current++).padStart(3, '0')}`;
      return [...without, {
        id:         Date.now(),
        holdNumber: num,
        heldAt:     new Date(),
        cart:       [...cart],
        customer,
        notes,
        paymentMethod,
        total:      totals.total,
        itemCount:  cart.reduce((s, i) => s + i.quantity, 0),
      }];
    });

    setCart(held.cart);
    setCustomer(held.customer || null);
    setNotes(held.notes || '');
    setPaymentMethod(held.paymentMethod || 'CASH');
    setAmountTendered('');
    setAmountPaidNow('');
    setShowHeldBills(false);
    toast(`Bill ${held.holdNumber} recalled`, { icon: '↩️' });
    refocusSearch();
  }

  function deleteHeldBill(id) {
    const held = heldBills.find(h => h.id === id);
    if (!held) return;
    if (!window.confirm(`Delete held bill ${held.holdNumber}? This cannot be undone.`)) return;
    setHeldBills(prev => prev.filter(h => h.id !== id));
  }

  function cancelBill() {
    if (cart.length === 0) { toast.error('Cart is already empty'); return; }
    if (!window.confirm('Cancel this bill and clear the cart?')) return;
    clearCart(false);
    toast('Bill cancelled', { icon: '🗑️' });
  }

  // ── Process sale ──────────────────────────────────────────────────────────

  function processSale() {
    if (cart.length === 0) { toast.error('Cart is empty'); return; }
    if (paymentMethod === 'CASH' && parseFloat(amountTendered || 0) < totals.total) {
      toast.error('Amount tendered is less than the total'); return;
    }
    if (paymentMethod === 'CREDIT' && !customer) {
      toast.error('Select a customer for credit sales'); return;
    }
    if (paymentMethod === 'CREDIT' && creditOverpaid) {
      toast.error('Amount paid cannot exceed the total'); return;
    }
    if (paymentMethod === 'CARD' && !cardLast4Valid) {
      toast.error('Enter the last 4 digits of the card'); return;
    }
    const tenderedNum = paymentMethod === 'CASH' ? parseFloat(amountTendered) || 0 : totals.total;
    const amountPaidNum = paymentMethod === 'CREDIT' ? paidNowNum : totals.total;
    const balanceDueNum = paymentMethod === 'CREDIT' ? Math.max(0, creditBalance) : 0;
    const capturedData = {
      itemCount:     cart.reduce((s, i) => s + i.quantity, 0),
      total:         totals.total,
      tendered:      tenderedNum,
      change:        Math.max(0, tenderedNum - totals.total),
      amountPaid:    amountPaidNum,
      balanceDue:    balanceDueNum,
      cardLast4:     paymentMethod === 'CARD' ? cardLast4 : null,
      items:         [...cart],
      paymentMethod,
    };
    createMutation.mutate(
      {
        customerId:     customer?.id ?? null,
        customerName:   customer?.name ?? null,
        paymentMethod,
        amountTendered: paymentMethod === 'CASH' ? tenderedNum : null,
        amountPaid:     paymentMethod === 'CREDIT' ? paidNowNum : null,
        cardLast4:      paymentMethod === 'CARD' ? cardLast4 : null,
        notes:          notes || null,
        items: cart.map(i => ({
          productId:   i.productId,
          productName: i.productName,
          quantity:    i.quantity,
          unitPrice:   i.unitPrice,
          discountPct: i.discountPct,
          taxPct:      i.taxPct,
        })),
      },
      {
        onSuccess: (res) => {
          const confirm = { ...capturedData, saleNumber: res.data.saleNumber };
          clearCart(true);
          setSaleConfirm(confirm);
          if (autoPrintEnabled) {
            printReceipt(confirm, printCopiesRef.current, companyProfile);
          }
          toast.success(`Sale ${res.data.saleNumber} completed!`);
        },
      }
    );
  }

  // ── Keep actionsRef current on every render ───────────────────────────────

  actionsRef.current = { holdBill, cancelBill, processSale };

  // ── Keyboard handlers ─────────────────────────────────────────────────────

  function selectProduct(p) {
    setSelectedProd(p);
    setQuery(p.name);
    setSelIdx(-1);
    setDiscount('');
    setTimeout(() => { qtyRef.current?.focus(); qtyRef.current?.select(); }, 25);
  }

  async function loadCustomerPriceOverrides(customerId) {
    try {
      const res = await pricingApi.customerOverrides(customerId);
      setCustomerPriceOverrides(res.data || {});
    } catch {
      setCustomerPriceOverrides({});
    }
  }

  function selectCustomer(c) {
    setCustomer(c);
    setCustomerSearch('');
    setCustomerDropdown(false);
    setCustomerSelIdx(-1);
    loadCustomerPriceOverrides(c.id);
  }

  function handleCustomerKey(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (customerResults.length) setCustomerSelIdx(i => Math.min(i + 1, customerResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (customerResults.length) setCustomerSelIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (customerResults.length > 0 && customerSelIdx >= 0) selectCustomer(customerResults[customerSelIdx]);
    } else if (e.key === 'Escape') {
      setCustomerDropdown(false);
    }
  }

  function jumpToTendered() {
    setPaymentMethod('CASH');
    setTimeout(() => { tenderedRef.current?.focus(); tenderedRef.current?.select(); }, 30);
  }

  function handleSearchKey(e) {
    if (e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      if (cart.length > 0) jumpToTendered();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (products.length) setSelIdx(i => Math.min(i + 1, products.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (products.length) setSelIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (products.length > 0 && selIdx >= 0) selectProduct(products[selIdx]);
    } else if (e.key === 'Tab') {
      if (products.length > 0 && selIdx >= 0) { e.preventDefault(); selectProduct(products[selIdx]); }
    } else if (e.key === 'Escape') {
      setQuery(''); setSelectedProd(null); setDiscount('');
    } else if (e.key === 'F4') {
      e.preventDefault(); holdBill();
    } else if (e.key === 'F6') {
      e.preventDefault(); setShowHeldBills(v => !v);
    } else if (e.key === 'F7') {
      e.preventDefault(); cancelBill();
    } else if (e.key === 'F9') {
      e.preventDefault(); processSale();
    }
  }

  function handleQtyKey(e) {
    if (e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      addToCart();
      setTimeout(() => jumpToTendered(), 60);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault(); addToCart();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      discountRef.current?.focus();
      discountRef.current?.select();
    } else if (e.key === 'Escape') {
      refocusSearch();
    } else if (e.key === 'F4') {
      e.preventDefault(); holdBill();
    } else if (e.key === 'F7') {
      e.preventDefault(); cancelBill();
    }
  }

  function handleDiscountKey(e) {
    if (e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      addToCart();
      setTimeout(() => jumpToTendered(), 60);
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault(); addToCart();
    } else if (e.key === 'Escape') {
      setDiscount('');
      refocusSearch();
    } else if (e.key === 'F4') {
      e.preventDefault(); holdBill();
    } else if (e.key === 'F7') {
      e.preventDefault(); cancelBill();
    }
  }

  function handleTenderedKey(e) {
    if (e.key === 'Enter' || e.key === 'F9') { e.preventDefault(); processSale(); }
    else if (e.key === 'Escape') { refocusSearch(); }
  }

  // Global keydown — catches F4/F6/F7 when focus is elsewhere (cart rows, customer field, etc.)
  useEffect(() => {
    function onGlobalKey(e) {
      if (saleConfirm || showHeldBills) return;
      const active = document.activeElement;
      const inSearch   = active === searchRef.current;
      const inQty      = active === qtyRef.current;
      const inDiscount = active === discountRef.current;
      const inTendered = active === tenderedRef.current;

      // Shift+Enter from tendered or anywhere else
      if (e.shiftKey && e.key === 'Enter' && !inSearch && !inQty && !inDiscount) {
        e.preventDefault();
        if (cart.length > 0) jumpToTendered();
        return;
      }
      if (inSearch || inQty || inDiscount || inTendered) return; // let the field handler deal with it

      if (e.key === 'F4') { e.preventDefault(); actionsRef.current.holdBill?.(); }
      if (e.key === 'F6') { e.preventDefault(); setShowHeldBills(v => !v); }
      if (e.key === 'F7') { e.preventDefault(); actionsRef.current.cancelBill?.(); }
      if (e.key === 'F9') { e.preventDefault(); actionsRef.current.processSale?.(); }
    }
    window.addEventListener('keydown', onGlobalKey);
    return () => window.removeEventListener('keydown', onGlobalKey);
  }, [saleConfirm, showHeldBills, cart.length]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const entryUnitPrice = effectivePricing
    ? effectivePricing.unitPrice
    : Number(selectedProd?.defaultPrice || 0);
  const entryMaxDiscountAmount = Number(selectedProd?.maxDiscountAmount ?? 0);
  const entryDiscountAmt = Math.min(Math.max(parseFloat(discount) || 0, 0), entryMaxDiscountAmount);
  const entryPreview = selectedProd ? (entryUnitPrice - entryDiscountAmt) * (parseFloat(qty) || 1) : 0;
  const entryHasSpecialPrice = effectivePricing
    && effectivePricing.priceSource !== 'DEFAULT_PRICE'
    && Number(effectivePricing.unitPrice) !== Number(selectedProd?.defaultPrice || 0);
  const entryAvailableStock = inventoryTrackingEnabled && selectedProd
    ? Number(selectedProd.stockAvailable ?? 0)
    : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Layout title="POS Terminal" fullWidth>

      {/* Modals */}
      {saleConfirm && (
        <ConfirmModal
          data={saleConfirm}
          printCopies={printCopies}
          onPrintCopiesChange={(v) => {
            const c = Math.max(1, Math.min(10, v));
            setPrintCopies(c);
            printCopiesRef.current = c;
          }}
          onClose={() => { setSaleConfirm(null); refocusSearch(); }}
          companyProfile={companyProfile}
        />
      )}
      {showHeldBills && (
        <HeldBillsModal
          bills={heldBills}
          onRecall={recallBill}
          onDelete={deleteHeldBill}
          onClose={() => { setShowHeldBills(false); refocusSearch(); }}
        />
      )}
      {drawerLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white">
          <SpinnerIcon className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      )}
      {!drawerLoading && drawerCheckFailed && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white p-4 text-center">
          <p className="text-sm text-red-600">Couldn't check your drawer status. Your connection to the server may have dropped.</p>
          <button onClick={() => refetchDrawer()} className="btn-primary">Retry</button>
        </div>
      )}
      {!drawerLoading && !drawerCheckFailed && !drawerSession && (
        <OpenDrawerModal
          isPending={openDrawerMutation.isPending}
          onSubmit={(openingFloat, notes) => openDrawerMutation.mutate({ openingFloat, notes })}
        />
      )}
      {showCashMovement && drawerSession && (
        <CashMovementModal
          balance={Number(drawerSession.expectedCash || 0)}
          isPending={movementMutation.isPending}
          onSubmit={(body) => movementMutation.mutate({ id: drawerSession.id, body })}
          onClose={() => setShowCashMovement(false)}
        />
      )}
      {showDayEnd && drawerSession && (
        <DayEndModal
          session={drawerSession}
          isPending={closeDrawerMutation.isPending}
          onSubmit={(body) => closeDrawerMutation.mutate({ id: drawerSession.id, body })}
          onClose={() => setShowDayEnd(false)}
        />
      )}

      {/* Keyboard shortcut hint bar */}
      <div className="flex flex-wrap items-center gap-3 bg-gray-900 px-4 py-1.5 text-[11px] text-gray-400 select-none">
        <span className="mr-1 font-semibold text-gray-300">⌨</span>
        {[
          ['↑↓',         'navigate'],
          ['Enter',      'select/add'],
          ['Tab',        '→ qty → discount'],
          ['Shift+↵',    '→ payment'],
          ['F4',         'hold'],
          ['F6',         'recall'],
          ['F7',         'cancel'],
          ['F9',         'process'],
        ].map(([key, label]) => (
          <span key={key} className="flex items-center gap-1">
            <kbd className="rounded bg-gray-700 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-gray-200">{key}</kbd>
            <span>{label}</span>
          </span>
        ))}
        {drawerSession && (
          <div className="ml-auto flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-gray-700 px-2.5 py-1 font-semibold text-gray-200">
              💵 Drawer: LKR {fmt(drawerSession.expectedCash)}
              <span className="font-normal text-gray-400">
                · opened {new Date(drawerSession.openedAt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </span>
            <button
              onClick={() => setShowCashMovement(true)}
              className="rounded-full bg-gray-700 px-2.5 py-1 font-semibold text-gray-200 hover:bg-gray-600"
            >
              Cash Movement
            </button>
            <button
              onClick={() => setShowDayEnd(true)}
              className="rounded-full bg-amber-600 px-2.5 py-1 font-semibold text-white hover:bg-amber-500"
            >
              Day End
            </button>
          </div>
        )}
      </div>

      <div className="flex overflow-hidden" style={{ height: 'calc(100vh - 96px)' }}>

        {/* ── LEFT: Product search ─────────────────────────────────────────── */}
        <div className="flex w-3/5 flex-col border-r border-gray-200">

          {/* Entry bar */}
          <div className="flex-shrink-0 space-y-2 border-b border-gray-200 bg-white px-4 py-3">
            <div className="flex items-end gap-2">
              <div className="relative flex-1">
                <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {productsLoading
                    ? <SpinnerIcon className="h-4 w-4 animate-spin" />
                    : <SearchIcon className="h-4 w-4" />}
                </div>
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    if (selectedProd && e.target.value !== selectedProd.name) setSelectedProd(null);
                  }}
                  onKeyDown={handleSearchKey}
                  placeholder="Search product by name or scan barcode…"
                  autoComplete="off"
                  spellCheck={false}
                  className={`input w-full pl-9 pr-8 text-base font-medium ${
                    selectedProd ? 'border-blue-300 bg-blue-50 text-blue-900' : ''
                  }`}
                />
                {query && (
                  <button tabIndex={-1}
                    onMouseDown={(e) => { e.preventDefault(); setQuery(''); setSelectedProd(null); setDiscount(''); refocusSearch(); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <XIcon className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="w-32 flex-shrink-0">
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">Qty</label>
                <div className="flex items-center gap-1">
                  <button type="button" tabIndex={-1}
                    onMouseDown={(e) => { e.preventDefault(); setQty(q => String(Math.max(1, (parseFloat(q) || 1) - 1))); }}
                    className="flex h-9 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-gray-300 text-sm font-bold text-gray-600 hover:bg-gray-100">−</button>
                  <input
                    ref={qtyRef}
                    type="number" min="0.001" step="any"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    onKeyDown={handleQtyKey}
                    onFocus={(e) => e.target.select()}
                    placeholder="1"
                    className="input w-full px-1 text-center text-base font-semibold"
                  />
                  <button type="button" tabIndex={-1}
                    onMouseDown={(e) => { e.preventDefault(); setQty(q => String((parseFloat(q) || 1) + 1)); }}
                    className="flex h-9 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-gray-300 text-sm font-bold text-gray-600 hover:bg-gray-100">+</button>
                </div>
              </div>

              <div className="w-28 flex-shrink-0">
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  Disc. (Rs)
                </label>
                <input
                  ref={discountRef}
                  type="number" min="0" step="0.01"
                  value={discount}
                  disabled={!selectedProd || entryMaxDiscountAmount <= 0}
                  onChange={(e) => setDiscount(e.target.value)}
                  onKeyDown={handleDiscountKey}
                  onFocus={(e) => e.target.select()}
                  placeholder="0.00"
                  title={selectedProd
                    ? (entryMaxDiscountAmount > 0
                        ? `Max discount: LKR ${formatAmount(entryMaxDiscountAmount)}`
                        : 'No discount allowed for this item')
                    : ''}
                  className="input w-full px-1 text-center text-base font-semibold disabled:bg-gray-50 disabled:text-gray-300"
                />
              </div>

              <button
                onMouseDown={(e) => { e.preventDefault(); addToCart(); }}
                disabled={!selectedProd || !effectivePricing}
                className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30">
                <PlusIcon /> Add
                <span className="hidden text-[10px] font-normal text-blue-300 sm:inline">↵</span>
              </button>
            </div>

            {selectedProd ? (
              <div className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs text-blue-700">
                <div className="flex items-center gap-2">
                  <span className="max-w-[10rem] truncate font-semibold">{selectedProd.name}</span>
                  <span className="text-blue-300">·</span>
                  {selectedProdPricing?.loading ? (
                    <span className="flex items-center gap-1 text-blue-400">
                      <SpinnerIcon className="h-3 w-3 animate-spin" /> pricing…
                    </span>
                  ) : (
                    <>
                      {entryHasSpecialPrice && (
                        <span className="text-blue-300 line-through">LKR {fmt(selectedProd.defaultPrice || 0)}</span>
                      )}
                      <span className="tabular-nums">LKR {fmt(entryUnitPrice)}</span>
                      <PriceSourceBadge item={{ priceSource: effectivePricing?.priceSource, promotionName: effectivePricing?.promotionName }} />
                      {entryDiscountAmt > 0 && (
                        <span className="font-semibold text-green-600">−LKR {fmt(entryDiscountAmt)}</span>
                      )}
                    </>
                  )}
                  <span className="text-blue-300">×</span><span>{qty || 1}</span>
                  <span className="text-blue-300">=</span>
                  <span className="font-bold tabular-nums">LKR {fmt(entryPreview)}</span>
                  {entryAvailableStock !== null && (
                    <span className={`font-semibold ${entryAvailableStock <= 0 ? 'text-red-600' : entryAvailableStock <= 10 ? 'text-amber-600' : 'text-blue-400'}`}>
                      {entryAvailableStock <= 0 ? 'Out of stock' : `${Number(entryAvailableStock).toFixed(entryAvailableStock % 1 === 0 ? 0 : 2)} left`}
                    </span>
                  )}
                  <span className="ml-auto whitespace-nowrap italic text-[10px] text-blue-400">Tab → discount · Enter to add</span>
                </div>
                {selectedProdPricing?.generalTiers?.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-blue-100 pt-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-blue-500">
                      Batch pricing {selectedProdPricing.generalTiers.length > 1 ? '(tap to choose)' : ''}:
                    </span>
                    {selectedProdPricing.generalTiers.map(t => {
                      const active = manualTierId
                        ? manualTierId === t.id
                        : (effectivePricing?.priceSource === 'BATCH_PRICE' && Number(t.price) === Number(effectivePricing.unitPrice));
                      return (
                        <button key={t.id} type="button"
                          onClick={() => setManualTierId(t.id)}
                          className={`rounded-full border-2 px-3 py-1 text-sm font-semibold transition-colors ${
                            active
                              ? 'border-teal-400 bg-teal-100 text-teal-800'
                              : 'border-gray-200 bg-white text-gray-600 hover:border-teal-300 hover:text-teal-700'
                          }`}>
                          {t.minQty && Number(t.minQty) > 0 ? `${t.minQty}+ units` : 'Any qty'} · LKR {fmt(t.price)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <p className="px-1 text-xs text-gray-400">
                {query && !productsLoading
                  ? 'Use ↑↓ to navigate, Enter to select'
                  : 'Type to search · F4 hold · F6 recall · F7 cancel · Shift+Enter → payment'}
              </p>
            )}
          </div>

          {/* Product list */}
          <div className="flex-1 overflow-y-auto bg-gray-50">
            {productsLoading && products.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-16 text-gray-400">
                <SpinnerIcon className="h-5 w-5 animate-spin" /><span className="text-sm">Loading…</span>
              </div>
            ) : products.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-gray-400">
                <SearchIcon className="h-8 w-8 text-gray-200" />
                <span className="text-sm">{query ? `No products matching "${query}"` : 'Start typing to search products'}</span>
              </div>
            ) : (
              <div ref={listRef}>
                {products.map((p, i) => {
                  const isActive = i === selIdx;
                  return (
                    <button key={p.id} tabIndex={-1}
                      onMouseDown={(e) => { e.preventDefault(); selectProduct(p); }}
                      className={`flex w-full items-center gap-4 border-b border-gray-100 px-5 py-3 text-left transition-colors ${
                        isActive ? 'border-l-2 border-l-blue-500 bg-blue-50' : 'hover:bg-white'
                      }`}>
                      <span className={`w-5 flex-shrink-0 text-xs font-mono ${isActive ? 'font-bold text-blue-600' : 'text-gray-300'}`}>
                        {isActive ? '▸' : String(i + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate font-medium ${isActive ? 'text-blue-900' : 'text-gray-800'}`}>{p.name}</p>
                        <p className="flex items-center gap-1.5">
                          {p.productCode && <span className="font-mono text-[11px] text-gray-400">{p.productCode}</span>}
                          {inventoryTrackingEnabled && (() => {
                            const avail = p.stockAvailable ?? 0;
                            return (
                              <span className={`text-[11px] font-semibold ${
                                avail <= 0 ? 'text-red-600' : avail <= 10 ? 'text-amber-600' : 'text-gray-400'
                              }`}>
                                {avail <= 0 ? 'Out of stock' : `Stock: ${Number(avail).toFixed(avail % 1 === 0 ? 0 : 2)}`}
                              </span>
                            );
                          })()}
                        </p>
                      </div>
                      {p.unit?.name && <span className="flex-shrink-0 text-xs text-gray-400">{p.unit.name}</span>}
                      <span className={`flex-shrink-0 text-sm font-bold tabular-nums ${isActive ? 'text-blue-700' : 'text-gray-700'}`}>
                        LKR {fmt(p.defaultPrice || 0)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Cart + payment ────────────────────────────────────────── */}
        <div className="flex w-2/5 flex-col bg-white">

          {/* Cart header */}
          <div className="flex flex-shrink-0 items-center gap-2 border-b border-gray-100 px-3 py-2.5">
            <h2 className="text-sm font-semibold text-gray-700 mr-auto">
              Cart <span className="font-normal text-gray-400">({cart.length})</span>
            </h2>

            {/* Hold */}
            <button
              onClick={holdBill}
              title="Hold bill (F4)"
              className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100">
              <PauseIcon className="h-3.5 w-3.5" /> Hold <kbd className="ml-0.5 font-mono text-[9px] opacity-60">F4</kbd>
            </button>

            {/* Recall */}
            <button
              onClick={() => setShowHeldBills(true)}
              title="Recall held bill (F6)"
              className="relative flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-100">
              <RecallIcon className="h-3.5 w-3.5" /> Recall <kbd className="ml-0.5 font-mono text-[9px] opacity-60">F6</kbd>
              {heldBills.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white">
                  {heldBills.length > 9 ? '9+' : heldBills.length}
                </span>
              )}
            </button>

            {/* Cancel */}
            {cart.length > 0 && (
              <button
                onClick={cancelBill}
                title="Cancel bill (F7)"
                className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100">
                <XIcon className="h-3.5 w-3.5" /> Cancel <kbd className="ml-0.5 font-mono text-[9px] opacity-60">F7</kbd>
              </button>
            )}
          </div>

          {/* Customer */}
          <div className="relative flex-shrink-0 border-b border-gray-100 px-4 pb-3 pt-3">
            {customer ? (
              <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                <span className="flex-1 text-sm font-medium text-blue-800">{customer.name}</span>
                <span className="text-xs text-blue-500">{customer.customerCode}</span>
                <button onClick={() => { setCustomer(null); setCustomerSearch(''); setCustomerPriceOverrides({}); }} className="ml-1 text-blue-400 hover:text-blue-700">
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : showQuickAdd ? (
              <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
                <p className="text-xs font-semibold text-blue-700">New Customer (POS)</p>
                <input className="input text-sm" placeholder="Name"
                  value={quickName} onChange={e => setQuickName(e.target.value)} autoFocus />
                <input className="input text-sm" placeholder="Phone"
                  value={quickPhone} onChange={e => setQuickPhone(e.target.value)} />
                <div className="flex gap-2">
                  <button type="button" onClick={submitQuickAdd} disabled={quickAddMutation.isPending}
                    className="btn-primary flex-1 py-1.5 text-xs disabled:opacity-50">
                    {quickAddMutation.isPending ? 'Adding…' : 'Add Customer'}
                  </button>
                  <button type="button" onClick={() => { setShowQuickAdd(false); setQuickName(''); setQuickPhone(''); }}
                    className="btn-secondary flex-1 py-1.5 text-xs">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative">
                <input className="input text-sm" placeholder="Customer (optional) — click to browse"
                  value={customerSearch}
                  onChange={e => { setCustomerSearch(e.target.value); setCustomerDropdown(true); }}
                  onFocus={() => setCustomerDropdown(true)}
                  onBlur={() => setTimeout(() => setCustomerDropdown(false), 150)}
                  onKeyDown={handleCustomerKey}
                />
                {customerDropdown && customerResults.length > 0 && (
                  <div ref={customerListRef} className="absolute z-20 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                    {customerResults.map((c, i) => {
                      const isActive = i === customerSelIdx;
                      return (
                        <button key={c.id} type="button"
                          onMouseEnter={() => setCustomerSelIdx(i)}
                          onMouseDown={() => selectCustomer(c)}
                          className={`flex w-full justify-between border-b border-gray-50 px-3 py-2 text-left text-sm last:border-0 ${
                            isActive ? 'bg-blue-50' : 'hover:bg-blue-50'
                          }`}>
                          <span className={`font-medium ${isActive ? 'text-blue-900' : 'text-gray-800'}`}>{c.name}</span>
                          <span className="text-xs text-gray-400">{c.customerCode}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <button type="button" onMouseDown={(e) => { e.preventDefault(); setShowQuickAdd(true); }}
                  className="mt-1 text-xs font-medium text-blue-600 hover:text-blue-800">
                  + New Customer
                </button>
              </div>
            )}
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto px-4 py-2">
            {cart.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-400">
                <span className="text-4xl">🛒</span>
                <span className="text-sm">Search and add products on the left</span>
                {heldBills.length > 0 && (
                  <button onClick={() => setShowHeldBills(true)}
                    className="mt-2 flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100">
                    <PauseIcon className="h-3.5 w-3.5" />
                    {heldBills.length} held bill{heldBills.length !== 1 ? 's' : ''} — click to recall
                  </button>
                )}
              </div>
            ) : (
              cart.map(item => (
                <CartRow
                  key={item.productId}
                  item={item}
                  onChange={(updated) => updateCartItem(item.productId, updated)}
                  onRemove={() => removeCartItem(item.productId)}
                />
              ))
            )}
          </div>

          {/* Payment panel */}
          <div className="flex-shrink-0 space-y-3 border-t border-gray-200 bg-gray-50 px-4 py-4">
            <div className="space-y-1 text-sm">
              {totals.discountTotal > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>Discount</span><span className="tabular-nums">− LKR {fmt(totals.discountTotal)}</span>
                </div>
              )}
              {totals.taxTotal > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>Tax</span><span className="tabular-nums">LKR {fmt(totals.taxTotal)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span className="tabular-nums text-blue-700">LKR {fmt(totals.total)}</span>
              </div>
            </div>

            <div className="flex gap-2">
              {['CASH', 'CARD', 'CREDIT'].map(pm => (
                <button key={pm}
                  onClick={() => { setPaymentMethod(pm); setAmountTendered(''); setAmountPaidNow(''); setCardLast4(''); }}
                  className={`flex-1 rounded-lg border py-2 text-xs font-semibold transition-colors ${
                    paymentMethod === pm
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-gray-300 bg-white text-gray-600 hover:border-blue-400'
                  }`}>
                  {pm === 'CASH' ? '💵 Cash' : pm === 'CARD' ? '💳 Card' : '🧾 Credit'}
                </button>
              ))}
            </div>

            {paymentMethod === 'CASH' && (
              <div>
                <input
                  ref={tenderedRef}
                  type="number" step="0.01" min="0"
                  className="input text-center font-mono text-base"
                  placeholder="Amount tendered (LKR)"
                  value={amountTendered}
                  onChange={e => setAmountTendered(e.target.value)}
                  onFocus={e => e.target.select()}
                  onKeyDown={handleTenderedKey}
                />
                {amountTendered && change >= 0 && (
                  <div className="mt-1.5 flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-3 py-1.5">
                    <span className="text-sm font-medium text-green-700">Change</span>
                    <span className="font-bold tabular-nums text-green-700">LKR {fmt(change)}</span>
                  </div>
                )}
                {amountTendered && change < 0 && (
                  <p className="mt-1 text-center text-xs text-red-500">Short by LKR {fmt(Math.abs(change))}</p>
                )}
              </div>
            )}

            {paymentMethod === 'CARD' && (
              <div>
                <input
                  type="text" inputMode="numeric" maxLength={4}
                  className="input text-center font-mono text-base tracking-widest"
                  placeholder="Last 4 digits of card"
                  value={cardLast4}
                  onChange={e => setCardLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  onFocus={e => e.target.select()}
                />
                {cardLast4 && !cardLast4Valid && (
                  <p className="mt-1 text-center text-xs text-red-500">Enter exactly 4 digits</p>
                )}
              </div>
            )}

            {paymentMethod === 'CREDIT' && (
              <div>
                {!customer ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-center text-xs font-medium text-amber-700">
                    Select a customer to enable credit sales
                  </p>
                ) : (
                  <>
                    <p className="mb-1.5 text-xs text-gray-500">
                      Current balance: <span className="font-semibold text-gray-700">LKR {fmt(customer.currentBalance)}</span>
                      {customer.creditLimit != null && (
                        <> · Limit: <span className="font-semibold text-gray-700">LKR {fmt(customer.creditLimit)}</span></>
                      )}
                    </p>
                    <input
                      type="number" step="0.01" min="0"
                      className="input text-center font-mono text-base"
                      placeholder="Amount paid now (optional)"
                      value={amountPaidNow}
                      onChange={e => setAmountPaidNow(e.target.value)}
                      onFocus={e => e.target.select()}
                    />
                    {!creditOverpaid ? (
                      <div className="mt-1.5 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5">
                        <span className="text-sm font-medium text-amber-700">Balance Due</span>
                        <span className="font-bold tabular-nums text-amber-700">LKR {fmt(creditBalance)}</span>
                      </div>
                    ) : (
                      <p className="mt-1 text-center text-xs text-red-500">Cannot exceed total</p>
                    )}
                    {customer.creditLimit != null &&
                      (Number(customer.currentBalance || 0) + Math.max(0, creditBalance)) > Number(customer.creditLimit) && (
                        <p className="mt-1 text-center text-xs text-amber-600">⚠ This sale will exceed the customer's credit limit</p>
                      )}
                  </>
                )}
              </div>
            )}

            <input className="input text-sm" placeholder="Notes (optional)"
              value={notes} onChange={e => setNotes(e.target.value)} />

            <button onClick={processSale}
              disabled={
                cart.length === 0 || createMutation.isPending ||
                (paymentMethod === 'CREDIT' && (!customer || creditOverpaid)) ||
                (paymentMethod === 'CARD' && !cardLast4Valid)
              }
              className="btn-primary w-full py-3 text-base font-bold disabled:opacity-50">
              {createMutation.isPending ? 'Processing…' : `Process Sale · LKR ${fmt(totals.total)}`}
            </button>
          </div>
        </div>

      </div>
    </Layout>
  );
}

export default withAuth(PosPage, [], 'MOD_POS_TERMINAL', 'POS');

// ── Icons ─────────────────────────────────────────────────────────────────────

function SearchIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
    </svg>
  );
}

function XIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

function PauseIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" />
      <rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function RecallIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
    </svg>
  );
}

function PrintIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" rx="1" />
    </svg>
  );
}

function SpinnerIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
