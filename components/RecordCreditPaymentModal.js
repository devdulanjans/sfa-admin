import { useState } from 'react';
import { formatAmount } from '../lib/format';

const METHOD_OPTIONS = [
  { value: 'CASH',          label: 'Cash' },
  { value: 'CARD',          label: 'Card' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CHEQUE',        label: 'Cheque' },
  { value: 'OTHER',         label: 'Other' },
];

/**
 * Shared "record a settlement payment" modal, used by both the Customer Credit
 * page (per-bill) and the customer detail page's Credit Bills section.
 */
export default function RecordCreditPaymentModal({ bill, onSubmit, onClose, isPending }) {
  const balanceDue = Number(bill.balanceDue || 0);
  const [amount, setAmount] = useState(balanceDue.toFixed(2));
  const [method, setMethod] = useState('CASH');
  const [notes, setNotes]   = useState('');

  const amountNum = parseFloat(amount) || 0;
  const invalid = amountNum <= 0 || amountNum > balanceDue;

  function handleSubmit(e) {
    e.preventDefault();
    if (invalid) return;
    onSubmit({ amount: amountNum, paymentMethod: method, notes: notes || null });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Record Payment</h2>
        <p className="text-sm text-gray-500 mb-4">
          {bill.saleNumber} · {bill.customerName}
        </p>

        <div className="space-y-1 text-sm mb-4">
          <div className="flex justify-between text-gray-600">
            <span>Total</span><span>LKR {formatAmount(bill.total)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Paid so far</span><span>LKR {formatAmount(bill.amountPaid)}</span>
          </div>
          <div className="flex justify-between font-semibold text-amber-700 border-t pt-1 mt-1">
            <span>Balance Due</span><span>LKR {formatAmount(balanceDue)}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">Amount</label>
            <input
              type="number" step="0.01" min="0.01" max={balanceDue}
              className="input w-full font-mono"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              autoFocus
            />
            {invalid && (
              <p className="mt-1 text-xs text-red-500">
                {amountNum <= 0 ? 'Amount must be greater than zero' : `Cannot exceed balance due (LKR ${formatAmount(balanceDue)})`}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">Payment Method</label>
            <select className="input w-full" value={method} onChange={e => setMethod(e.target.value)}>
              {METHOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">Notes (optional)</label>
            <input className="input w-full" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={invalid || isPending} className="btn-primary flex-1 disabled:opacity-50">
              {isPending ? 'Recording…' : 'Record Payment'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
