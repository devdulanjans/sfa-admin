import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import { addDays, format, parseISO } from 'date-fns';
import Layout from '../../components/Layout';
import TrackingMap from '../../components/TrackingMap';
import { ROUTE_BRAND } from '../../components/RouteMap';
import { withAuth } from '../../lib/auth';
import { trackingApi, settingsApi } from '../../lib/api';

const ISO = 'yyyy-MM-dd';
const LIVE_REFRESH_MS = 30_000;
const STALE_MIN = 15;
const GAP_MIN = 20;             // same gap that ends a geofence visit server-side
const MAX_MOCK_PINS = 300;

const START_COLOR = '#16a34a';
const END_COLOR   = '#dc2626';
const VISIT_COLOR = '#f59e0b';
const MOCK_COLOR  = '#7c3aed';
const STALE_COLOR = '#9ca3af';
const GAP_COLOR   = '#9ca3af';

const REP_COLORS = [
  ROUTE_BRAND, '#2563eb', '#9333ea', '#db2777', '#ea580c',
  '#0891b2', '#4f46e5', '#be123c', '#65a30d', '#b45309',
];

const TABS = [
  { value: 'live', label: 'Live' },
  { value: 'day',  label: 'Day view' },
];

const iso = (d) => format(d, ISO);

function repColor(id) {
  const s = String(id ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return REP_COLORS[Math.abs(h) % REP_COLORS.length];
}

function initials(name, fallback) {
  const words = String(name || fallback || '?').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const s = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[words.length - 1][0];
  return s.toUpperCase();
}

function toDate(v) {
  if (!v) return null;
  try { const d = parseISO(v); return Number.isNaN(d.getTime()) ? null : d; } catch { return null; }
}

function fmtTime(v) {
  const d = toDate(v);
  return d ? format(d, 'HH:mm') : '—';
}

function fmtDateTime(v) {
  const d = toDate(v);
  return d ? format(d, 'd MMM, HH:mm') : '—';
}

function minutesSince(v, now) {
  const d = toDate(v);
  return d ? (now - d.getTime()) / 60000 : null;
}

function timeAgo(v, now) {
  const mins = minutesSince(v, now);
  if (mins == null) return '—';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${Math.floor(mins)} min ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h ${Math.floor(mins % 60)} min ago`;
  return fmtDateTime(v);
}

function fmtDuration(mins) {
  const m = Math.max(0, Math.round(Number(mins) || 0));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

function fmtKm(km) {
  const n = Number(km) || 0;
  return `${n.toFixed(n < 10 ? 2 : 1)} km`;
}

const num = (v) => (v == null || v === '' ? NaN : Number(v));
const validLatLng = (lat, lng) => Number.isFinite(num(lat)) && Number.isFinite(num(lng));
const speedKmh = (mps) => (mps == null ? null : Math.max(0, Number(mps) * 3.6));

function visitOutcome(v) {
  if (v.orderNumbers?.length) {
    return { kind: 'ordered', label: 'Ordered', detail: `Ordered ${v.orderNumbers.join(', ')}`, cls: 'badge-green' };
  }
  if (v.visitNoteReason) {
    return { kind: 'note', label: `No order · ${v.visitNoteReason}`, detail: `No order · ${v.visitNoteReason}`, cls: 'badge-amber' };
  }
  return { kind: 'none', label: 'Visited only', detail: 'No order recorded', cls: 'badge-gray' };
}

// ─────────────────────────────────────────────────────────────────────────────

function TrackingDisabledNotice() {
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.list().then(r => r.data),
    staleTime: 60_000,
    retry: false,
  });
  const setting = (settings || []).find(s => s.key === 'location_tracking_enabled');
  if (!setting || setting.value !== 'false') return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <span className="font-semibold">Location tracking is switched off.</span>{' '}
      No new locations are being recorded. Turn on <span className="font-medium">Track Sales Rep Location</span> in{' '}
      <Link href="/settings/general" className="font-medium underline hover:text-amber-900">General Settings</Link>{' '}
      to resume.
    </div>
  );
}

function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

// ── Live ─────────────────────────────────────────────────────────────────────

function LiveView({ onOpenDay }) {
  const now = useNow();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [focus, setFocus] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const { data: reps = [], isLoading, isFetching, error, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['tracking-live'],
    queryFn: () => trackingApi.live().then(r => r.data ?? []),
    refetchInterval: autoRefresh ? LIVE_REFRESH_MS : false,
    refetchIntervalInBackground: false,
  });

  const sorted = useMemo(() => [...reps].sort((a, b) =>
    (toDate(b.lastSeen)?.getTime() ?? 0) - (toDate(a.lastSeen)?.getTime() ?? 0)), [reps]);

  const markers = useMemo(() => sorted
    .filter(r => validLatLng(r.lat, r.lng))
    .map((r, i) => {
      const stale = (minutesSince(r.lastSeen, now) ?? Infinity) > STALE_MIN;
      const kmh = speedKmh(r.speed);
      return {
        id: String(r.salesRepId),
        lat: num(r.lat), lng: num(r.lng),
        kind: 'badge',
        text: initials(r.salesRepName, r.username),
        color: stale ? STALE_COLOR : repColor(r.salesRepId),
        zIndex: 1000 - i,
        title: r.salesRepName || r.username,
        kicker: stale ? 'Not updated recently' : undefined,
        lines: [
          `Last seen ${timeAgo(r.lastSeen, now)} (${fmtDateTime(r.lastSeen)})`,
          r.currentCustomerName ? `At ${r.currentCustomerName}` : null,
          kmh != null ? `Speed ${kmh.toFixed(0)} km/h` : null,
          r.accuracy != null ? `Accuracy ±${Math.round(r.accuracy)} m` : null,
          r.battery != null ? `Battery ${r.battery}%` : null,
        ].filter(Boolean),
      };
    }), [sorted, now]);

  const activeCount = sorted.filter(r => (minutesSince(r.lastSeen, now) ?? Infinity) <= STALE_MIN).length;

  function select(r) {
    setSelectedId(String(r.salesRepId));
    setFocus({ id: String(r.salesRepId), nonce: Date.now() });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          <span className="font-semibold text-gray-900">{sorted.length}</span> rep{sorted.length === 1 ? '' : 's'} seen in the last 24 h
          {sorted.length > 0 && <> · <span className="font-semibold text-gray-900">{activeCount}</span> active in the last {STALE_MIN} min</>}
          {dataUpdatedAt > 0 && <span className="ml-2 text-xs text-gray-400">Updated {format(dataUpdatedAt, 'HH:mm:ss')}</span>}
          {isFetching && <span className="ml-2 text-xs text-gray-400">Updating…</span>}
        </p>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input type="checkbox" className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto-refresh (30 s)
          </label>
          <button type="button" className="btn-secondary text-xs" onClick={() => refetch()} disabled={isFetching}>
            Refresh now
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error.response?.data?.detail ?? 'Failed to load live positions'}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <TrackingMap markers={markers} fitKey="live" focus={focus} height={560}
            onMarkerClick={(id) => setSelectedId(id)}
            legend={[{ color: ROUTE_BRAND, label: 'Rep (colour per rep)' }, { color: STALE_COLOR, label: `No update > ${STALE_MIN} min` }]} />
        </div>

        <div className="card overflow-hidden flex flex-col" style={{ maxHeight: 560 }}>
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">Sales reps</h3>
            <p className="text-xs text-gray-500">Most recently seen first. Click to find on the map.</p>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="px-4 py-3"><div className="h-4 bg-gray-200 rounded animate-pulse" /></div>
              ))
            ) : sorted.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-gray-400">
                No sales rep has sent a location in the last 24 hours.
              </p>
            ) : sorted.map(r => {
              const id = String(r.salesRepId);
              const mins = minutesSince(r.lastSeen, now);
              const stale = (mins ?? Infinity) > STALE_MIN;
              const kmh = speedKmh(r.speed);
              const noPos = !validLatLng(r.lat, r.lng);
              return (
                <div key={id} role="button" tabIndex={0}
                  onClick={() => !noPos && select(r)}
                  onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !noPos) { e.preventDefault(); select(r); } }}
                  className={`px-4 py-3 transition-colors ${noPos ? '' : 'cursor-pointer'} ${selectedId === id ? 'bg-brand-50' : 'hover:bg-gray-50'}`}>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{ background: stale ? STALE_COLOR : repColor(r.salesRepId) }}>
                      {initials(r.salesRepName, r.username)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-gray-900">{r.salesRepName || r.username}</p>
                        <span className={`flex-shrink-0 inline-flex items-center gap-1 text-xs ${stale ? 'text-gray-400' : 'text-green-700'}`}>
                          <span className={`inline-block h-2 w-2 rounded-full ${stale ? 'bg-gray-300' : 'bg-green-500'}`} />
                          {timeAgo(r.lastSeen, now)}
                        </span>
                      </div>
                      {r.currentCustomerName && (
                        <p className="truncate text-xs text-brand-700">At {r.currentCustomerName}</p>
                      )}
                      <p className="text-xs text-gray-500">
                        {[
                          kmh != null ? `${kmh.toFixed(0)} km/h` : null,
                          r.accuracy != null ? `±${Math.round(r.accuracy)} m` : null,
                          r.battery != null ? `${r.battery}% battery` : null,
                        ].filter(Boolean).join(' · ') || '—'}
                        {r.battery != null && r.battery < 20 && <span className="ml-1 badge-red">Low battery</span>}
                      </p>
                      <button type="button" className="mt-1 text-xs text-brand-600 hover:underline"
                        onClick={(e) => { e.stopPropagation(); onOpenDay(id); }}>
                        Today&apos;s trail →
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Day view ─────────────────────────────────────────────────────────────────

function Stat({ label, value, sub }) {
  return (
    <div className="card px-4 py-3 min-w-[130px]">
      <p className="text-xs uppercase tracking-wider text-gray-500">{label}</p>
      <p className="text-xl font-semibold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function DayView({ date, setDate, repId, setRepId }) {
  const today = iso(new Date());
  const isToday = date === today;
  const [focus, setFocus] = useState(null);
  const [selectedVisit, setSelectedVisit] = useState(null);

  const { data: summary = [], isLoading: summaryLoading, error: summaryError } = useQuery({
    queryKey: ['tracking-summary', date],
    queryFn: () => trackingApi.summary(date).then(r => r.data ?? []),
    enabled: !!date,
    refetchInterval: isToday ? 60_000 : false,
  });

  const summaryRows = useMemo(() => [...summary].sort((a, b) =>
    ((b.pointCount > 0) - (a.pointCount > 0))
    || String(a.salesRepName || '').localeCompare(String(b.salesRepName || ''))), [summary]);

  // Pick the first rep with data when none is chosen (or the chosen one isn't visible).
  useEffect(() => {
    if (summaryLoading || summaryRows.length === 0) return;
    if (repId && summaryRows.some(r => String(r.salesRepId) === repId)) return;
    const first = summaryRows.find(r => r.pointCount > 0);
    if (!repId && first) setRepId(String(first.salesRepId));
  }, [summaryRows, summaryLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: day, isLoading: dayLoading, isFetching: dayFetching, error: dayError } = useQuery({
    queryKey: ['tracking-day', repId, date],
    queryFn: () => trackingApi.repDay(repId, date).then(r => r.data),
    enabled: !!repId && !!date,
    refetchInterval: isToday ? 60_000 : false,
  });

  useEffect(() => { setSelectedVisit(null); setFocus(null); }, [repId, date]);

  const points = useMemo(() => (day?.points ?? []).filter(p => validLatLng(p.lat, p.lng)), [day]);
  const visits = day?.visits ?? [];
  const mockPoints = useMemo(() => points.filter(p => p.mock), [points]);

  const lines = useMemo(() => {
    if (points.length < 2) return [];
    const out = [];
    let seg = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const cur = points[i];
      const gap = (toDate(cur.t)?.getTime() - toDate(prev.t)?.getTime()) / 60000;
      if (gap > GAP_MIN) {
        out.push({ path: seg, gap: false });
        out.push({ path: [prev, cur], gap: true });
        seg = [cur];
      } else {
        seg.push(cur);
      }
    }
    out.push({ path: seg, gap: false });
    return out.map((s, i) => ({
      id: `l${i}`,
      path: s.path.map(p => ({ lat: num(p.lat), lng: num(p.lng) })),
      color: s.gap ? GAP_COLOR : ROUTE_BRAND,
      dashed: s.gap,
      arrows: !s.gap,
    }));
  }, [points]);

  const markers = useMemo(() => {
    const out = [];
    mockPoints.slice(0, MAX_MOCK_PINS).forEach((p, i) => out.push({
      id: `m${i}`, lat: num(p.lat), lng: num(p.lng), kind: 'dot', size: 4, color: MOCK_COLOR, zIndex: 50,
      title: 'Mocked location', kicker: 'Warning',
      lines: [fmtDateTime(p.t), 'The phone reported this position as mocked (fake GPS).'],
    }));
    if (points.length > 0) {
      const first = points[0];
      const last = points[points.length - 1];
      const pointLines = (p) => [
        fmtDateTime(p.t),
        speedKmh(p.speed) != null ? `Speed ${speedKmh(p.speed).toFixed(0)} km/h` : null,
        p.accuracy != null ? `Accuracy ±${Math.round(p.accuracy)} m` : null,
        p.battery != null ? `Battery ${p.battery}%` : null,
        p.mock ? 'Mocked location' : null,
      ].filter(Boolean);
      out.push({
        id: 'start', lat: num(first.lat), lng: num(first.lng), kind: 'dot', size: 9, color: START_COLOR, zIndex: 900,
        title: 'Start of day', lines: pointLines(first),
      });
      if (points.length > 1) {
        out.push({
          id: 'end', lat: num(last.lat), lng: num(last.lng), kind: 'dot', size: 9, color: END_COLOR, zIndex: 950,
          title: isToday ? 'Latest position' : 'Last position of the day', lines: pointLines(last),
        });
      }
    }
    visits.forEach((v, i) => {
      if (!validLatLng(v.customerLat, v.customerLng)) return;
      const o = visitOutcome(v);
      const open = v.status === 'OPEN';
      out.push({
        id: `v-${v.id}`, lat: num(v.customerLat), lng: num(v.customerLng), kind: 'number', text: String(i + 1),
        color: VISIT_COLOR, zIndex: 2000 - i,
        kicker: `Visit ${i + 1}${open ? ' · there now' : ''}`,
        title: v.customerName || 'Customer',
        lines: [
          v.customerCode,
          `${fmtTime(v.arrivedAt)} – ${open ? 'now' : fmtTime(v.departedAt)} (${fmtDuration(v.durationMinutes)})`,
          o.detail,
        ].filter(Boolean),
      });
    });
    return out;
  }, [points, mockPoints, visits, isToday]);

  function focusVisit(v) {
    setSelectedVisit(v.id);
    setFocus({ id: `v-${v.id}`, nonce: Date.now() });
  }

  const selectedRep = summaryRows.find(r => String(r.salesRepId) === repId);
  const noData = day && points.length === 0 && visits.length === 0;
  const legend = [
    { color: ROUTE_BRAND, label: 'Path' },
    { color: START_COLOR, label: 'Start' },
    { color: END_COLOR, label: isToday ? 'Latest' : 'End' },
    { color: VISIT_COLOR, label: 'Customer visit' },
    ...(mockPoints.length ? [{ color: MOCK_COLOR, label: 'Mocked location' }] : []),
  ];

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div>
          <span className="block text-xs text-gray-500 mb-1">Date</span>
          <div className="flex items-center gap-1">
            <button type="button" className="btn-secondary px-2 py-1.5 text-xs" title="Previous day"
              onClick={() => setDate(iso(addDays(parseISO(date), -1)))}>←</button>
            <input type="date" className="input w-40" value={date} max={today}
              onChange={(e) => e.target.value && setDate(e.target.value)} />
            <button type="button" className="btn-secondary px-2 py-1.5 text-xs disabled:opacity-40" title="Next day"
              disabled={date >= today} onClick={() => setDate(iso(addDays(parseISO(date), 1)))}>→</button>
            {!isToday && (
              <button type="button" className="ml-1 rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:border-brand-400 hover:text-brand-700"
                onClick={() => setDate(today)}>Today</button>
            )}
          </div>
        </div>
        <div className="min-w-[220px]">
          <label className="label">Sales Rep</label>
          <select className="input" value={repId} onChange={(e) => setRepId(e.target.value)}>
            <option value="">Select a sales rep…</option>
            {summaryRows.map(r => (
              <option key={r.salesRepId} value={String(r.salesRepId)}>
                {r.salesRepName}{r.pointCount > 0 ? '' : ' (no data)'}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Selected rep's day */}
      {repId && (
        <div className="space-y-3">
          {dayError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {dayError.response?.data?.detail ?? 'Failed to load this rep\'s day'}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Stat label="Distance" value={day ? fmtKm(day.distanceKm) : '—'} />
                <Stat label="First seen" value={day ? fmtTime(day.firstSeen) : '—'} />
                <Stat label="Last seen" value={day ? fmtTime(day.lastSeen) : '—'} />
                <Stat label="Visits" value={day ? visits.length : '—'} />
                <Stat label="Points" value={day ? (day.pointCount ?? points.length) : '—'} />
                <div className="flex flex-col gap-1.5">
                  {mockPoints.length > 0 && (
                    <span className="badge-red" title="The phone reported these positions as mocked (fake GPS / developer tools).">
                      ⚠ {mockPoints.length} mocked location{mockPoints.length === 1 ? '' : 's'}
                    </span>
                  )}
                  {day && day.pointCount > points.length && (
                    <span className="badge-gray">Showing {points.length} of {day.pointCount} points</span>
                  )}
                  {dayFetching && <span className="text-xs text-gray-400">Updating…</span>}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  {dayLoading ? (
                    <div className="flex h-[520px] items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-400">
                      Loading…
                    </div>
                  ) : noData ? (
                    <div className="flex h-[520px] items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 text-center text-sm text-gray-500">
                      <div>
                        <p className="font-medium text-gray-700">No location data for this day</p>
                        <p className="mt-1">
                          {selectedRep?.salesRepName || 'This rep'} didn&apos;t send any locations on {format(parseISO(date), 'd MMM yyyy')}.
                          Locations are only recorded while the rep is logged in to the mobile app.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <TrackingMap markers={markers} lines={lines} fitKey={`${repId}|${date}`} focus={focus}
                      height={520} legend={legend}
                      onMarkerClick={(id) => { if (id.startsWith('v-')) setSelectedVisit(id.slice(2)); }} />
                  )}
                </div>

                <div className="card overflow-hidden flex flex-col" style={{ maxHeight: 520 }}>
                  <div className="px-4 py-3 border-b border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-900">Customer visits</h3>
                    <p className="text-xs text-gray-500">Detected from the rep&apos;s location. Click to show on the map.</p>
                  </div>
                  <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
                    {dayLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="px-4 py-3"><div className="h-4 bg-gray-200 rounded animate-pulse" /></div>
                      ))
                    ) : visits.length === 0 ? (
                      <p className="px-4 py-10 text-center text-sm text-gray-400">
                        {noData ? 'No location data for this day.' : 'No customer visits detected.'}
                      </p>
                    ) : visits.map((v, i) => {
                      const o = visitOutcome(v);
                      const open = v.status === 'OPEN';
                      const hasLoc = validLatLng(v.customerLat, v.customerLng);
                      return (
                        <div key={v.id} role="button" tabIndex={0}
                          onClick={() => hasLoc && focusVisit(v)}
                          onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && hasLoc) { e.preventDefault(); focusVisit(v); } }}
                          className={`px-4 py-3 transition-colors ${hasLoc ? 'cursor-pointer' : ''} ${selectedVisit === v.id ? 'bg-brand-50' : 'hover:bg-gray-50'}`}>
                          <div className="flex items-start gap-3">
                            <span className="mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                              style={{ background: VISIT_COLOR }}>{i + 1}</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs text-gray-500">
                                {fmtTime(v.arrivedAt)} – {open ? 'now' : fmtTime(v.departedAt)}
                                <span className="text-gray-400"> · {fmtDuration(v.durationMinutes)}</span>
                              </p>
                              <p className="truncate text-sm font-medium text-gray-900" title={v.customerName}>
                                {v.customerName || 'Customer'}
                                {v.customerCode && <span className="ml-1.5 font-mono text-xs font-normal text-gray-500">{v.customerCode}</span>}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                {open && <span className="badge-cyan">There now</span>}
                                <span className={o.cls} title={o.detail}>{o.label}</span>
                                {o.kind === 'ordered' && (
                                  <span className="font-mono text-[11px] text-gray-500">{v.orderNumbers.join(', ')}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* All reps for the day */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">All sales reps · {format(parseISO(date), 'd MMM yyyy')}</h3>
          <p className="text-xs text-gray-500">Click a row to see that rep&apos;s trail.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                {['Sales Rep', 'Points', 'Distance', 'First seen', 'Last seen', 'Visits'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {summaryError ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-red-500">
                  {summaryError.response?.data?.detail ?? 'Failed to load the day summary'}
                </td></tr>
              ) : summaryLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-200 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : summaryRows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">No sales reps found.</td></tr>
              ) : summaryRows.map(r => {
                const id = String(r.salesRepId);
                const sel = id === repId;
                const empty = !r.pointCount;
                return (
                  <tr key={id} onClick={() => setRepId(id)}
                    className={`cursor-pointer transition-colors ${sel ? 'bg-brand-50' : 'hover:bg-gray-50'}`}>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: empty ? STALE_COLOR : repColor(r.salesRepId) }} />
                        <span className={`font-medium ${empty ? 'text-gray-500' : 'text-gray-900'}`}>{r.salesRepName}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{empty ? <span className="text-gray-400">0</span> : r.pointCount}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{empty ? <span className="text-gray-400">—</span> : fmtKm(r.distanceKm)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{fmtTime(r.firstSeen)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{fmtTime(r.lastSeen)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{r.visitCount ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function FieldTrackingPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [tab, setTab]     = useState('live');
  const [date, setDate]   = useState(() => iso(new Date()));
  const [repId, setRepId] = useState('');

  // Initial state from the query string (?tab=day&rep=…&date=…).
  useEffect(() => {
    if (!router.isReady || ready) return;
    const q = router.query;
    const one = (k) => (typeof q[k] === 'string' ? q[k] : '');
    if (one('tab') === 'day' || one('tab') === 'live') setTab(one('tab'));
    if (/^\d{4}-\d{2}-\d{2}$/.test(one('date')) && one('date') <= iso(new Date())) setDate(one('date'));
    if (one('rep')) setRepId(one('rep'));
    setReady(true);
  }, [router.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the URL shareable.
  useEffect(() => {
    if (!ready) return;
    const query = tab === 'day' ? { tab, date, ...(repId ? { rep: repId } : {}) } : {};
    router.replace({ pathname: router.pathname, query }, undefined, { shallow: true, scroll: false });
  }, [ready, tab, date, repId]); // eslint-disable-line react-hooks/exhaustive-deps

  function openDay(id) {
    setRepId(id);
    setDate(iso(new Date()));
    setTab('day');
  }

  return (
    <Layout title="Field Tracking">
      <div className="space-y-4 w-full">
        <p className="text-sm text-gray-500">
          Sales rep locations are recorded by the mobile app while the rep is logged in — in the foreground and in the
          background. Customer visits are detected automatically when a rep stays near a customer&apos;s saved location.
          Tracking can be switched off, and the interval and geofence tuned, in{' '}
          <Link href="/settings/general" className="text-brand-600 hover:underline">General Settings</Link>.
        </p>

        <TrackingDisabledNotice />

        <div className="flex gap-1 border-b border-gray-200">
          {TABS.map(t => (
            <button key={t.value} type="button"
              className={`px-4 py-2 text-sm -mb-px border-b-2 ${tab === t.value
                ? 'border-brand-600 text-brand-700 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              onClick={() => setTab(t.value)}>
              {t.label}
            </button>
          ))}
        </div>

        {!ready ? null : tab === 'live'
          ? <LiveView onOpenDay={openDay} />
          : <DayView date={date} setDate={setDate} repId={repId} setRepId={setRepId} />}
      </div>
    </Layout>
  );
}

export default withAuth(FieldTrackingPage, [], 'MOD_TRACKING', 'SFA');
