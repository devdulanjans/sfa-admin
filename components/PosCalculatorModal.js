import { useState, useRef, useEffect, useCallback } from 'react';
import { posApi } from '../lib/api';
import toast from 'react-hot-toast';
import { formatAmount } from '../lib/format';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (v) => formatAmount(v);

// ── Print receipt ─────────────────────────────────────────────────────────────

function printReceipt(data, copies = 1) {
  const now = new Date().toLocaleString('en', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const itemRows = data.items.map(item => {
    const total = item.unitPrice * item.quantity;
    return `
      <tr><td colspan="2">${(item.productName || 'Item').slice(0, 28)}</td></tr>
      <tr>
        <td style="padding-left:8px;color:#555">
          ${Number(item.quantity).toFixed(item.quantity % 1 === 0 ? 0 : 2)} × LKR ${formatAmount(item.unitPrice)}
        </td>
        <td class="r">${formatAmount(total)}</td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Receipt ${data.saleNumber}</title>
    <style>
      @page{size:80mm auto;margin:4mm 3mm}
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Courier New',monospace;font-size:11px;width:72mm;line-height:1.5}
      .c{text-align:center}.r{text-align:right}.b{font-weight:bold}
      .hr{border:none;border-top:1px dashed #000;margin:5px 0}
      table{width:100%;border-collapse:collapse}td{vertical-align:top}
      td:last-child{text-align:right;white-space:nowrap}
      .tr td{font-weight:bold;font-size:13px;padding-top:3px}
      .cb{border:2px solid #000;text-align:center;padding:6px 4px;margin:6px 0}
      .cb .l{font-size:10px;letter-spacing:2px;text-transform:uppercase}
      .cb .a{font-size:22px;font-weight:bold;line-height:1.2}
    </style>
  </head><body>
    <div class="c b" style="font-size:15px">RECEIPT</div>
    <div class="c">${now}</div>
    <div class="c">Sale # ${data.saleNumber}</div>
    <hr class="hr">
    <table>${itemRows}</table>
    <hr class="hr">
    <table>
      <tr class="tr"><td>TOTAL</td><td>LKR ${formatAmount(data.total)}</td></tr>
      <tr><td>Tendered</td><td>LKR ${formatAmount(data.tendered)}</td></tr>
    </table>
    <div class="cb">
      <div class="l">Balance</div>
      <div class="a">LKR ${formatAmount(data.change)}</div>
    </div>
    <hr class="hr"><div class="c">Thank you!</div>
  </body></html>`;

  for (let i = 0; i < copies; i++) {
    setTimeout(() => {
      const iframe = document.createElement('iframe');
      iframe.style.cssText =
        'position:fixed;top:-9999px;left:-9999px;width:80mm;height:200mm;visibility:hidden;';
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

// ── Confirm modal ─────────────────────────────────────────────────────────────

function ConfirmModal({ data, printCopies, onPrintCopiesChange, onClose }) {
  const isCredit = data.paymentMethod === 'CREDIT';

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative flex w-full max-w-xs flex-col rounded-2xl bg-white shadow-2xl">

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600 text-lg font-bold">
            ✓
          </div>
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
        </div>

        {/* Balance — BIG */}
        <div className="mx-5 my-4 rounded-xl border-2 border-green-400 bg-green-50 px-4 py-5 text-center">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-green-600">
            {isCredit ? 'Credit' : 'Balance'}
          </p>
          <p className="text-5xl font-extrabold tabular-nums text-green-700 leading-none">
            LKR {fmt(isCredit ? data.total : data.change)}
          </p>
        </div>

        {/* Print copies */}
        <div className="space-y-2 px-5 pb-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Print copies</span>
            <div className="flex items-center gap-2">
              <button onClick={() => onPrintCopiesChange(printCopies - 1)}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 font-bold text-gray-600 hover:bg-gray-100">
                −
              </button>
              <span className="w-6 text-center font-mono text-sm font-bold">{printCopies}</span>
              <button onClick={() => onPrintCopiesChange(printCopies + 1)}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 font-bold text-gray-600 hover:bg-gray-100">
                +
              </button>
            </div>
          </div>
          <button onClick={() => printReceipt(data, printCopies)}
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

// ── Root component ────────────────────────────────────────────────────────────

export default function PosCalculatorModal() {
  const [open, setOpen]   = useState(false);
  const [lines, setLines] = useState([]);
  const [step, setStep]   = useState('calc'); // 'calc' | 'pay'

  // Entry — Amount is PRIMARY field
  const [amount, setAmount] = useState('');
  const [qty,    setQty]    = useState('1');
  const [desc,   setDesc]   = useState('');

  // Payment
  const [method,     setMethod]     = useState('CASH');
  const [tendered,   setTendered]   = useState('');
  const [custName,   setCustName]   = useState('');
  const [notes,      setNotes]      = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Sale confirm modal
  const [saleConfirm, setSaleConfirm] = useState(null);
  const [printCopies, setPrintCopies] = useState(1);
  const printCopiesRef = useRef(1);

  // Refs — amount is primary focus target
  const amountRef  = useRef(null);
  const qtyRef     = useRef(null);
  const tenderedRef = useRef(null);

  // Focus amount on open
  useEffect(() => {
    if (open && step === 'calc') setTimeout(() => { amountRef.current?.focus(); amountRef.current?.select(); }, 80);
  }, [open, step]);

  // Focus tendered when entering pay step
  useEffect(() => {
    if (open && step === 'pay' && method === 'CASH') {
      setTimeout(() => { tenderedRef.current?.focus(); tenderedRef.current?.select(); }, 80);
    }
  }, [step, open, method]);

  // Global Shift+Enter → jump to pay step when inside the open modal
  useEffect(() => {
    if (!open || saleConfirm) return;
    function onKey(e) {
      if (e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        if (step === 'calc' && lines.length > 0) setStep('pay');
        if (step === 'pay') submitSale();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, saleConfirm, step, lines.length]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const refocusAmount = useCallback(() => {
    setTimeout(() => { amountRef.current?.focus(); amountRef.current?.select(); }, 25);
  }, []);

  const grandTotal   = lines.reduce((s, l) => s + l.lineTotal, 0);
  const entryPreview = (parseFloat(amount) || 0) * (parseFloat(qty) || 1);
  const tenderedNum  = parseFloat(tendered) || 0;
  const change       =
    method === 'CASH' && tenderedNum > 0 && tenderedNum >= grandTotal
      ? tenderedNum - grandTotal : null;

  // ── Actions ───────────────────────────────────────────────────────────────

  function addLine() {
    const p = parseFloat(amount);
    const q = parseFloat(qty) || 1;
    if (!p || p <= 0) { amountRef.current?.focus(); return; }
    setLines(prev => [...prev, {
      id:        Date.now(),
      desc:      desc.trim(),
      unitPrice: p,
      qty:       q,
      lineTotal: +(p * q).toFixed(2),
    }]);
    setAmount('');
    setQty('1');
    setDesc('');
    refocusAmount();
  }

  function removeLine(id) {
    setLines(prev => prev.filter(l => l.id !== id));
    refocusAmount();
  }

  function clearAll() {
    if (!lines.length) return;
    if (window.confirm('Clear all items?')) { setLines([]); refocusAmount(); }
  }

  function closeModal() {
    setOpen(false);
    setStep('calc');
    setAmount(''); setQty('1'); setDesc('');
    setLines([]);
    setMethod('CASH'); setTendered(''); setCustName(''); setNotes('');
    setSaleConfirm(null);
  }

  async function submitSale() {
    if (lines.length === 0) { toast.error('No items added'); return; }
    if (method === 'CASH' && tenderedNum < grandTotal) {
      toast.error('Amount tendered must be ≥ total'); return;
    }
    setSubmitting(true);
    try {
      const resp = await posApi.createSale({
        customerName:   custName.trim() || undefined,
        paymentMethod:  method,
        amountTendered: method === 'CASH' ? tenderedNum : undefined,
        notes:          notes.trim() || undefined,
        items: lines.map(l => ({
          productName: l.desc || 'Item',
          quantity:    l.qty,
          unitPrice:   l.unitPrice,
          discountPct: 0,
          taxPct:      0,
        })),
      });

      const confirmData = {
        saleNumber: resp.data.saleNumber,
        itemCount:  lines.reduce((s, l) => s + l.qty, 0),
        total:      grandTotal,
        tendered:   method === 'CASH' ? tenderedNum : grandTotal,
        change:     method === 'CASH' ? Math.max(0, tenderedNum - grandTotal) : 0,
        items:      lines.map(l => ({
          productName: l.desc || 'Item',
          quantity:    l.qty,
          unitPrice:   l.unitPrice,
        })),
        paymentMethod: method,
      };

      setLines([]);
      setStep('calc');
      setMethod('CASH'); setTendered(''); setCustName(''); setNotes('');

      setSaleConfirm(confirmData);
      printReceipt(confirmData, printCopiesRef.current);
      toast.success(`Sale ${resp.data.saleNumber} recorded`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to record sale');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Keyboard handlers ─────────────────────────────────────────────────────

  function handleAmountKey(e) {
    if (e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      if (lines.length > 0) setStep('pay');
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      qtyRef.current?.focus();
      qtyRef.current?.select();
    } else if (e.key === 'Escape') {
      closeModal();
    }
  }

  function handleQtyKey(e) {
    if (e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      // Add current item first (if amount is filled), then go to payment
      const p = parseFloat(amount);
      if (p > 0) {
        const q = parseFloat(qty) || 1;
        setLines(prev => [...prev, {
          id: Date.now(), desc: desc.trim(),
          unitPrice: p, qty: q, lineTotal: +(p * q).toFixed(2),
        }]);
        setAmount(''); setQty('1'); setDesc('');
      }
      setTimeout(() => {
        if (lines.length > 0 || parseFloat(amount) > 0) setStep('pay');
      }, 30);
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      addLine();
    } else if (e.key === 'Escape') {
      refocusAmount();
    }
  }

  function handleDescKey(e) {
    if (e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      if (lines.length > 0) setStep('pay');
      return;
    }
    if (e.key === 'Enter') { e.preventDefault(); addLine(); }
    else if (e.key === 'Escape') { refocusAmount(); }
  }

  function handleTenderedKey(e) {
    if (e.key === 'Enter' || e.key === 'F9') { e.preventDefault(); submitSale(); }
    else if (e.key === 'Escape') { setStep('calc'); }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen(true)}
        title="Quick Calculator"
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg ring-1 ring-blue-700/20 transition hover:bg-blue-700 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        <CalcIcon />
        {lines.length > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
            {lines.length > 9 ? '9+' : lines.length}
          </span>
        )}
      </button>

      {/* Confirm modal (z above calc modal) */}
      {saleConfirm && (
        <ConfirmModal
          data={saleConfirm}
          printCopies={printCopies}
          onPrintCopiesChange={(v) => {
            const c = Math.max(1, Math.min(10, v));
            setPrintCopies(c);
            printCopiesRef.current = c;
          }}
          onClose={() => { setSaleConfirm(null); closeModal(); }}
        />
      )}

      {/* Calculator modal */}
      {open && !saleConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) { e.preventDefault(); refocusAmount(); }
          }}
        >
          <div className="absolute inset-0 bg-black/50"
            onMouseDown={(e) => { e.preventDefault(); refocusAmount(); }} />

          <div className="relative flex w-full max-w-xl flex-col rounded-2xl bg-white shadow-2xl"
            style={{ maxHeight: '92vh' }}>

            {step === 'calc' ? (
              <CalcStep
                lines={lines}
                amount={amount}      setAmount={setAmount}
                qty={qty}            setQty={setQty}
                desc={desc}          setDesc={setDesc}
                entryPreview={entryPreview}
                grandTotal={grandTotal}
                amountRef={amountRef}
                qtyRef={qtyRef}
                onAmountKey={handleAmountKey}
                onQtyKey={handleQtyKey}
                onDescKey={handleDescKey}
                onAddLine={addLine}
                onRemoveLine={removeLine}
                onClearAll={clearAll}
                onClose={closeModal}
                onComplete={() => setStep('pay')}
              />
            ) : (
              <PayStep
                grandTotal={grandTotal}
                method={method}         setMethod={(m) => { setMethod(m); setTendered(''); }}
                tendered={tendered}     setTendered={setTendered}
                custName={custName}     setCustName={setCustName}
                notes={notes}           setNotes={setNotes}
                change={change}
                tenderedRef={tenderedRef}
                submitting={submitting}
                onBack={() => { setStep('calc'); refocusAmount(); }}
                onSubmit={submitSale}
                onTenderedKey={handleTenderedKey}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── Calculator step ───────────────────────────────────────────────────────────

function CalcStep({
  lines, amount, setAmount, qty, setQty, desc, setDesc,
  entryPreview, grandTotal,
  amountRef, qtyRef,
  onAmountKey, onQtyKey, onDescKey,
  onAddLine, onRemoveLine, onClearAll, onClose, onComplete,
}) {
  const hasPreview  = entryPreview > 0;
  const isPriceSet  = parseFloat(amount) > 0;

  return (
    <>
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-100 px-5 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalcIcon className="h-5 w-5 text-blue-600" />
            <span className="text-base font-semibold text-gray-900">Quick Calculator</span>
          </div>
          <div className="flex items-center gap-1">
            {lines.length > 0 && (
              <button onMouseDown={(e) => { e.preventDefault(); onClearAll(); }}
                className="rounded-lg px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-50">
                Clear all
              </button>
            )}
            <button onMouseDown={(e) => { e.preventDefault(); onClose(); }}
              className="ml-1 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
              <XIcon />
            </button>
          </div>
        </div>

        {/* Keyboard hints */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[
            ['Amount', 'primary field'],
            ['Tab / Enter', '→ qty'],
            ['Enter in qty', 'add item'],
            ['Shift+↵', 'save & pay'],
          ].map(([key, label]) => (
            <span key={key}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-500">
              <kbd className="font-mono font-semibold text-gray-700">{key}</kbd>
              <span>{label}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Entry form */}
      <div className="flex-shrink-0 border-b border-gray-100 bg-gray-50 px-5 py-4 space-y-3">

        {/* PRIMARY row: Amount × Qty = preview + Add */}
        <div className="flex items-end gap-2">
          {/* Amount — PRIMARY */}
          <div className="flex-1">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Amount (LKR) <span className="text-blue-500 normal-case font-normal">← start here</span>
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 select-none">Rs</span>
              <input
                ref={amountRef}
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={onAmountKey}
                onFocus={(e) => e.target.select()}
                placeholder="0.00"
                className="input w-full pl-8 text-base font-semibold"
              />
            </div>
          </div>

          <span className="mb-2.5 text-gray-400 font-medium select-none">×</span>

          {/* Qty */}
          <div className="w-24 flex-shrink-0">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">Qty</label>
            <input
              ref={qtyRef}
              type="number"
              min="0.001"
              step="any"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onKeyDown={onQtyKey}
              onFocus={(e) => e.target.select()}
              placeholder="1"
              className="input w-full text-center font-semibold"
            />
          </div>

          {/* Preview + Add */}
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className={`text-[10px] font-semibold whitespace-nowrap ${hasPreview ? 'text-green-600' : 'text-gray-200'}`}>
              {hasPreview ? `= ${fmt(entryPreview)}` : '= —'}
            </span>
            <button
              onMouseDown={(e) => { e.preventDefault(); onAddLine(); }}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 active:scale-95 transition-all">
              <PlusIcon /> Add <span className="text-blue-300 text-[10px] font-normal">↵</span>
            </button>
          </div>
        </div>

        {/* Description — optional, secondary */}
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Description <span className="normal-case font-normal">(optional)</span>
          </label>
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onKeyDown={onDescKey}
            placeholder="e.g. Bread, Milk, General items…"
            className="input w-full text-sm"
          />
        </div>
      </div>

      {/* Line items */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center select-none">
            <div className="text-5xl text-gray-100 mb-3">🧮</div>
            <p className="text-sm text-gray-400">No items yet</p>
            <p className="text-xs text-gray-300 mt-1">Enter amount above and press Enter</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 border-b border-gray-100 bg-gray-50/90 backdrop-blur">
              <tr>
                <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-400 w-7">#</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-400">Description</th>
                <th className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-400 w-14">Qty</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-gray-400 w-24">Price</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-gray-400 w-24">Total</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lines.map((line, i) => (
                <tr key={line.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-2.5 text-xs text-gray-400 font-mono">{i + 1}</td>
                  <td className="px-2 py-2.5">
                    <p className="font-medium text-gray-900 truncate max-w-[180px]">
                      {line.desc || <span className="italic text-gray-400">—</span>}
                    </p>
                  </td>
                  <td className="px-2 py-2.5 text-center text-gray-700 font-medium">
                    {line.qty % 1 === 0 ? line.qty : line.qty.toFixed(2)}
                  </td>
                  <td className="px-2 py-2.5 text-right text-gray-400 text-xs tabular-nums">
                    {fmt(line.unitPrice)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold text-gray-900 tabular-nums">
                    {fmt(line.lineTotal)}
                  </td>
                  <td className="pr-3 py-2.5">
                    <button
                      tabIndex={-1}
                      onMouseDown={(e) => { e.preventDefault(); onRemoveLine(line.id); }}
                      className="text-gray-300 hover:text-red-400 transition-colors">
                      <XIcon className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Total + Complete */}
      <div className="flex-shrink-0 border-t border-gray-200 bg-white px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400">{lines.length} item{lines.length !== 1 ? 's' : ''}</p>
            <p className="text-2xl font-extrabold text-gray-900 leading-tight tracking-tight tabular-nums">
              LKR {fmt(grandTotal)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 italic hidden sm:block">Shift+↵ to pay</span>
            <button
              onMouseDown={(e) => { e.preventDefault(); onComplete(); }}
              disabled={lines.length === 0}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95">
              Complete Sale →
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Payment step ──────────────────────────────────────────────────────────────

function PayStep({
  grandTotal, method, setMethod, tendered, setTendered,
  custName, setCustName, notes, setNotes,
  change, tenderedRef, submitting, onBack, onSubmit, onTenderedKey,
}) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
        <button onClick={onBack}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <BackIcon />
        </button>
        <div>
          <h2 className="text-base font-semibold text-gray-900">Complete Sale</h2>
          <p className="text-xs text-gray-500">
            Total: LKR {fmt(grandTotal)}
            <span className="ml-2 text-gray-400">· Shift+↵ or Enter to save</span>
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4 min-h-0">
        {/* Payment method */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Payment Method</p>
          <div className="grid grid-cols-3 gap-2">
            {['CASH', 'CARD', 'CREDIT'].map((m) => (
              <button key={m} onClick={() => setMethod(m)}
                className={`rounded-xl py-2.5 text-sm font-bold transition-all border ${
                  method === m
                    ? 'bg-blue-600 text-white border-blue-600 shadow'
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                }`}>
                {m === 'CASH' ? '💵 Cash' : m === 'CARD' ? '💳 Card' : '🧾 Credit'}
              </button>
            ))}
          </div>
        </div>

        {/* Cash tendered */}
        {method === 'CASH' && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Amount Tendered (LKR)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 select-none">Rs</span>
              <input
                ref={tenderedRef}
                type="number" min={grandTotal} step="0.01"
                value={tendered}
                onChange={(e) => setTendered(e.target.value)}
                onFocus={(e) => e.target.select()}
                onKeyDown={onTenderedKey}
                placeholder={fmt(grandTotal)}
                className="input w-full pl-8"
              />
            </div>
            {change !== null && change >= 0 && (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                <span>💵</span>
                <span className="text-sm font-bold text-green-700">Change: LKR {fmt(change)}</span>
              </div>
            )}
          </div>
        )}

        {/* Customer */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
            Customer Name <span className="normal-case font-normal text-gray-400">(optional)</span>
          </label>
          <input value={custName} onChange={(e) => setCustName(e.target.value)}
            placeholder="Walk-in customer" className="input w-full" />
        </div>

        {/* Notes */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
            Notes <span className="normal-case font-normal text-gray-400">(optional)</span>
          </label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
            rows={2} className="input w-full resize-none" />
        </div>
      </div>

      {/* Submit */}
      <div className="border-t border-gray-100 px-5 py-4">
        <button onClick={onSubmit} disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white shadow hover:bg-blue-700 disabled:opacity-50 transition-all">
          {submitting
            ? <><SpinnerIcon className="h-4 w-4 animate-spin" /> Saving…</>
            : 'Record Sale'
          }
        </button>
        <p className="mt-2 text-center text-[10px] text-gray-400">Shift+↵ or Enter in tendered to save</p>
      </div>
    </>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function CalcIcon({ className = 'h-6 w-6' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path strokeLinecap="round" d="M8 7h8M8 12h2m4 0h2M8 17h2m4 0h2" />
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

function BackIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function PrintIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
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
