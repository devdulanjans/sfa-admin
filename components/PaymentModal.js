import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { bankAccountApi } from '../lib/api';
import { formatAmount } from '../lib/format';

export const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'CARD', label: 'Card' },
  { value: 'OTHER', label: 'Other' },
];

export const methodLabel = (m) => PAYMENT_METHODS.find((x) => x.value === m)?.label || m;

/**
 * Records a full, part or balance payment. The bank account is optional: without one the
 * money is held as cash on hand. Bank accounts are listed only when the Finance module is
 * available to this user — otherwise the list just doesn't appear.
 *
 * @param maxAmount what's owed — the amount can't exceed it
 * @param onSubmit  receives { amount, paymentDate, paymentMethod, referenceNumber, bankAccountId, notes }
 */
export default function PaymentModal({ title, subtitle, maxAmount, onClose, onSubmit, isPending, children }) {
  const owed = Number(maxAmount || 0);
  const [amount, setAmount] = useState(owed ? owed.toFixed(2) : '');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [notes, setNotes] = useState('');

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => bankAccountApi.list().then((r) => r.data),
    retry: false,
    // A channel owner without the Finance module gets 403 here — that's fine, no list.
    meta: { silent: true },
  });

  const value = Number(amount);
  const tooMuch = value > owed + 0.0001;
  const invalid = !value || value <= 0 || tooMuch;
  const balanceAfter = Math.max(0, owed - (value || 0));
  const needsRef = paymentMethod === 'CHEQUE' || paymentMethod === 'BANK_TRANSFER';

  const submit = (e) => {
    e.preventDefault();
    if (invalid) return;
    onSubmit({
      amount: value,
      paymentDate,
      paymentMethod,
      referenceNumber: referenceNumber.trim() || null,
      bankAccountId: bankAccountId || null,
      notes: notes.trim() || null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}

        <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-3 text-sm">
          <div>
            <p className="text-xs text-gray-500">Owed</p>
            <p className="font-semibold tabular-nums">LKR {formatAmount(owed)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Balance after this payment</p>
            <p className={`font-semibold tabular-nums ${balanceAfter > 0 ? 'text-amber-700' : 'text-green-700'}`}>
              LKR {formatAmount(balanceAfter)}
            </p>
          </div>
        </div>

        {children}

        <form onSubmit={submit} className="mt-4 space-y-3">
          <div>
            <label className="label">Amount received <span className="text-red-500">*</span></label>
            <div className="flex gap-2">
              <input type="number" step="0.01" min="0.01" max={owed} className="input flex-1" autoFocus
                value={amount} onChange={(e) => setAmount(e.target.value)} />
              <button type="button" className="btn-secondary whitespace-nowrap text-xs"
                onClick={() => setAmount(owed.toFixed(2))}>Full balance</button>
            </div>
            {tooMuch && <p className="mt-1 text-xs text-red-600">More than the LKR {formatAmount(owed)} owed.</p>}
            {!tooMuch && value > 0 && value < owed && (
              <p className="mt-1 text-xs text-amber-700">Part payment — LKR {formatAmount(balanceAfter)} will still be owed.</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" value={paymentDate}
                max={new Date().toISOString().slice(0, 10)} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Method</label>
              <select className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">{paymentMethod === 'CHEQUE' ? 'Cheque number' : 'Reference'}{needsRef ? '' : ' (optional)'}</label>
            <input className="input" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder={paymentMethod === 'CHEQUE' ? 'e.g. 004512 — Sampath Bank' : 'Receipt or transfer reference'} />
          </div>
          {bankAccounts.length > 0 && (
            <div>
              <label className="label">Deposited to</label>
              <select className="input" value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
                <option value="">Cash on hand (not banked yet)</option>
                {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.accountName}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label">Note (optional)</label>
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={isPending || invalid} className="btn-primary flex-1 disabled:opacity-50">
              {isPending ? 'Recording…' : `Record LKR ${formatAmount(value || 0)}`}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Small "why?" prompt for cancelling an invoice / voiding a payment / closing a balance. */
export function ReasonModal({ title, message, confirmLabel, danger = true, requireReason = true, onClose, onConfirm, isPending }) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {message && <p className="mt-1 text-sm text-gray-600">{message}</p>}
        <label className="label mt-4">Reason{requireReason ? '' : ' (optional)'}</label>
        <input className="input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="mt-4 flex gap-2">
          <button disabled={isPending || (requireReason && !reason.trim())} onClick={() => onConfirm(reason.trim())}
            className={`${danger ? 'btn-danger' : 'btn-primary'} flex-1 disabled:opacity-50`}>
            {isPending ? 'Working…' : confirmLabel}
          </button>
          <button onClick={onClose} className="btn-secondary flex-1">Back</button>
        </div>
      </div>
    </div>
  );
}
