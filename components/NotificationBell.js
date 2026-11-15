import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminNotificationApi } from '../lib/api';

// Header bell for owners and managers (V122): alerts such as payments reps collected on a visit.
// Polls every minute; opening an alert marks it read and goes to its page.
function timeAgo(iso) {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  return days < 7 ? `${days} d ago` : new Date(iso).toLocaleDateString();
}

export default function NotificationBell() {
  const qc = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  const { data } = useQuery({
    queryKey: ['admin-notifications'],
    queryFn: () => adminNotificationApi.feed(30).then((r) => r.data),
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const unread = data?.unread ?? 0;
  const items = data?.items ?? [];

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-notifications'] });
  const readOne = useMutation({ mutationFn: (id) => adminNotificationApi.read(id), onSuccess: refresh });
  const readAll = useMutation({ mutationFn: () => adminNotificationApi.readAll(), onSuccess: refresh });

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  function openItem(n) {
    if (!n.read) readOne.mutate(n.id);
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        title="Notifications"
        aria-label={unread ? `${unread} unread notifications` : 'Notifications'}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 00-4-5.7V5a2 2 0 10-4 0v.3C7.7 6.2 6 8.4 6 11v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-[18px] text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-14 z-50 rounded-xl border border-gray-200 bg-white shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
            <p className="text-sm font-semibold text-gray-900">Notifications</p>
            {unread > 0 && (
              <button onClick={() => readAll.mutate()} className="text-xs text-brand-600 hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-400">No notifications yet.</p>
            ) : items.map((n) => (
              <button
                key={n.id}
                onClick={() => openItem(n)}
                className={`block w-full border-b border-gray-50 px-4 py-3 text-left hover:bg-gray-50 ${n.read ? '' : 'bg-brand-50/40'}`}
              >
                <div className="flex items-start gap-2">
                  {!n.read && <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-brand-600" />}
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${n.read ? 'text-gray-700' : 'font-semibold text-gray-900'}`}>{n.title}</p>
                    {n.message && <p className="mt-0.5 text-xs text-gray-600">{n.message}</p>}
                    <p className="mt-1 text-[11px] text-gray-400">
                      {timeAgo(n.createdAt)}{n.channelName ? ` · ${n.channelName}` : ''}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
