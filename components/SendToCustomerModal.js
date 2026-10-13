import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { orderApi, invoiceApi, notificationSettingsApi } from '../lib/api';

const CHANNEL_LABEL = { EMAIL: 'Email', WHATSAPP: 'WhatsApp' };

/**
 * Sends an order's or invoice's details to the customer by email and/or WhatsApp.
 * Recipients default to the customer record; the override fields are for a one-off address.
 */
export default function SendToCustomerModal({ type, id, number, onClose }) {
  const [selected, setSelected] = useState({ EMAIL: false, WHATSAPP: false });
  const [email, setEmail] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [results, setResults] = useState(null);

  const { data: channels, isLoading } = useQuery({
    queryKey: ['notification-channels'],
    queryFn:  () => notificationSettingsApi.channels().then(r => r.data),
  });

  const usable = (ch) => {
    const c = channels?.find(x => x.channel === ch);
    return !!c && c.enabled && c.configured;
  };
  const reason = (ch) => {
    const c = channels?.find(x => x.channel === ch);
    if (!c) return '';
    if (!c.enabled) return 'Turned off for this channel in Settings → Notifications';
    if (!c.configured) return 'Not set up for this channel in Settings → Notifications';
    return '';
  };

  // Pre-tick every channel that can actually send once the status arrives.
  useEffect(() => {
    if (channels) setSelected({ EMAIL: usable('EMAIL'), WHATSAPP: usable('WHATSAPP') });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels]);

  const sendMutation = useMutation({
    mutationFn: () => {
      const body = {
        channels: Object.keys(selected).filter(k => selected[k]),
        email: email.trim() || null,
        whatsappNumber: whatsappNumber.trim() || null,
      };
      return (type === 'invoice' ? invoiceApi.share(id, body) : orderApi.share(id, body)).then(r => r.data);
    },
    onSuccess: (data) => {
      setResults(data);
      const sent = data.filter(r => r.sent);
      if (sent.length === data.length) {
        toast.success(`Sent via ${sent.map(r => CHANNEL_LABEL[r.channel]).join(' & ')}`);
        onClose();
      } else if (sent.length > 0) {
        toast('Sent partially — see details', { icon: '⚠️' });
      } else {
        toast.error('Nothing was sent — see details');
      }
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to send'),
  });

  const anySelected = selected.EMAIL || selected.WHATSAPP;
  const label = type === 'invoice' ? 'Invoice' : 'Order';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 no-print">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 text-gray-900">
        <h3 className="text-lg font-semibold">Send {label} to Customer</h3>
        <p className="text-sm text-gray-500 mt-1">
          {label} {number} details (items and totals) will be sent to the customer.
        </p>

        {isLoading ? (
          <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
        ) : (
          <div className="mt-4 space-y-4">
            {['EMAIL', 'WHATSAPP'].map(ch => (
              <div key={ch}>
                <label className={`flex items-center gap-2 text-sm font-medium ${usable(ch) ? '' : 'text-gray-400'}`}>
                  <input
                    type="checkbox"
                    checked={selected[ch]}
                    disabled={!usable(ch)}
                    onChange={e => setSelected(s => ({ ...s, [ch]: e.target.checked }))}
                  />
                  {CHANNEL_LABEL[ch]}
                  {!usable(ch) && <span className="text-xs font-normal text-amber-600">({reason(ch)})</span>}
                </label>
                {selected[ch] && (
                  ch === 'EMAIL' ? (
                    <input
                      type="email"
                      className="input mt-2"
                      placeholder="Customer's saved email (or type another)"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                    />
                  ) : (
                    <input
                      type="tel"
                      className="input mt-2"
                      placeholder="Customer's saved WhatsApp number (or type another)"
                      value={whatsappNumber}
                      onChange={e => setWhatsappNumber(e.target.value)}
                    />
                  )
                )}
              </div>
            ))}

            {results && (
              <ul className="text-sm space-y-1 border-t pt-3">
                {results.map(r => (
                  <li key={r.channel} className={r.sent ? 'text-green-700' : 'text-red-600'}>
                    {r.sent ? '✓' : '✗'} {CHANNEL_LABEL[r.channel]}{r.recipient ? ` (${r.recipient})` : ''}: {r.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button className="btn-secondary" onClick={onClose}>Close</button>
          <button
            className="btn-primary"
            onClick={() => sendMutation.mutate()}
            disabled={!anySelected || sendMutation.isPending}
          >
            {sendMutation.isPending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
