import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO, startOfMonth, startOfWeek, subDays } from 'date-fns';
import toast from 'react-hot-toast';
import Layout from '../../components/Layout';
import RouteMap, { hasPin, ROUTE_BRAND } from '../../components/RouteMap';
import { withAuth, useAuth } from '../../lib/auth';
import { useAccessibleTenants } from '../../lib/hooks';
import {
  visitNoteApi, salesRouteApi, dashboardApi, distributorApi, reasonApi,
} from '../../lib/api';

const ISO = 'yyyy-MM-dd';
const PAGE_SIZE = 20;
const EXPORT_PAGE_SIZE = 500;
const EXPORT_MAX_ROWS = 10000;
const NOTE_PIN = '#f59e0b';

const iso = (d) => format(d, ISO);
const FILTER_KEYS = ['tenantId', 'routeId', 'salesRepId', 'distributorId', 'reasonId'];

function fmtWhen(n) {
  try {
    if (n.visitedAt) return format(parseISO(n.visitedAt), 'd MMM yyyy, HH:mm');
    if (n.visitDate) return format(parseISO(n.visitDate), 'd MMM yyyy');
  } catch { /* fall through */ }
  return n.visitedAt || n.visitDate || '—';
}

function mapsUrl(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

// Great-circle distance in metres.
function distanceM(a, b) {
  const R = 6371000;
  const rad = (x) => (Number(x) * Math.PI) / 180;
  const dLat = rad(b.latitude) - rad(a.latitude);
  const dLng = rad(b.longitude) - rad(a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function fmtDistance(m) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
}

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function VisitNotesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const multiTenantEnabled = user?.multiTenantEnabled ?? true;
  const { tenants, needsPicker } = useAccessibleTenants();
  const showChannel = multiTenantEnabled && (needsPicker || isSuperAdmin);

  const today = iso(new Date());
  const [ready, setReady]   = useState(false);
  const [from, setFrom]     = useState(iso(subDays(new Date(), 6)));
  const [to, setTo]         = useState(today);
  const [filters, setFilters] = useState({ tenantId: '', routeId: '', salesRepId: '', distributorId: '', reasonId: '' });
  const [page, setPage]     = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [exporting, setExporting]   = useState(false);

  // Initial filters from the query string (e.g. the "Visit notes" link on Assign Route).
  useEffect(() => {
    if (!router.isReady || ready) return;
    const q = router.query;
    const one = (k) => (typeof q[k] === 'string' ? q[k] : '');
    const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
    if (isDate(one('from'))) setFrom(one('from'));
    if (isDate(one('to'))) setTo(one('to'));
    else if (isDate(one('from'))) setTo(one('from') > today ? one('from') : today);
    setFilters(f => {
      const next = { ...f };
      FILTER_KEYS.forEach(k => { if (one(k)) next[k] = one(k); });
      return next;
    });
    setReady(true);
  }, [router.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const setFilter = (k, v) => {
    setFilters(f => {
      const next = { ...f, [k]: v };
      // A route belongs to one channel — drop a route that isn't in the newly picked channel.
      if (k === 'tenantId' && v && f.routeId) {
        const r = allRoutes.find(x => x.id === f.routeId);
        if (r && r.tenantId && r.tenantId !== v) next.routeId = '';
      }
      return next;
    });
    setPage(0);
    setSelectedId(null);
  };
  const setRange = (f, t) => { setFrom(f); setTo(t); setPage(0); setSelectedId(null); };

  function quick(kind) {
    const now = new Date();
    if (kind === 'today') setRange(today, today);
    if (kind === 'yesterday') { const y = iso(subDays(now, 1)); setRange(y, y); }
    if (kind === 'week') setRange(iso(startOfWeek(now, { weekStartsOn: 1 })), today);
    if (kind === 'month') setRange(iso(startOfMonth(now)), today);
    if (kind === 'last7') setRange(iso(subDays(now, 6)), today);
  }

  // ── Filter options ──
  const { data: routesPage } = useQuery({
    queryKey: ['sales-routes', 'all-for-counts'],
    queryFn:  () => salesRouteApi.list({ page: 0, size: 500 }).then(r => r.data),
    staleTime: 60_000,
  });
  const allRoutes = useMemo(() => routesPage?.content ?? [], [routesPage]);
  const routeOptions = useMemo(() => [...allRoutes]
    .filter(r => !filters.tenantId || !r.tenantId || r.tenantId === filters.tenantId)
    .sort((a, b) => String(a.name).localeCompare(String(b.name))), [allRoutes, filters.tenantId]);

  const { data: reps = [] } = useQuery({
    queryKey: ['dashboard-sales-reps'],
    queryFn:  () => dashboardApi.salesReps().then(r => r.data ?? []),
    staleTime: 5 * 60 * 1000,
  });

  const { data: distributors = [] } = useQuery({
    queryKey: ['distributors', 'visit-notes-filter'],
    queryFn:  () => distributorApi.list({ page: 0, size: 500 }).then(r => r.data?.content ?? []),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const { data: reasons = [] } = useQuery({
    queryKey: ['reasons', 'VISIT'],
    queryFn:  () => reasonApi.list('VISIT').then(r => r.data ?? []),
    staleTime: 60_000,
  });
  const sortedReasons = useMemo(
    () => [...reasons].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)), [reasons]);

  // ── Data ──
  const rangeValid = !!from && !!to && to >= from;
  const baseParams = useMemo(() => {
    const p = { from, to };
    ['tenantId', 'routeId', 'salesRepId', 'distributorId'].forEach(k => { if (filters[k]) p[k] = filters[k]; });
    if (!showChannel) delete p.tenantId;
    return p;
  }, [from, to, filters, showChannel]);
  const listParams = useMemo(
    () => (filters.reasonId ? { ...baseParams, reasonId: filters.reasonId } : baseParams), [baseParams, filters.reasonId]);

  const { data: notesPage, isLoading, isFetching, error } = useQuery({
    queryKey: ['visit-notes', listParams, page],
    queryFn:  () => visitNoteApi.list({ ...listParams, page, size: PAGE_SIZE }).then(r => r.data),
    enabled:  ready && rangeValid,
    placeholderData: (prev) => prev,
  });

  const { data: summary = [] } = useQuery({
    queryKey: ['visit-notes-summary', baseParams],
    queryFn:  () => visitNoteApi.summary(baseParams).then(r => r.data ?? []),
    enabled:  ready && rangeValid,
  });

  const notes = notesPage?.content ?? [];
  const totalPages = notesPage?.totalPages ?? 1;
  const totalElements = notesPage?.totalElements ?? notes.length;
  const summaryTotal = summary.reduce((s, r) => s + (Number(r.count) || 0), 0);
  const selectedReason = sortedReasons.find(r => r.id === filters.reasonId);

  const selected = selectedId ? notes.find(n => n.id === selectedId) : null;

  // Customer pin for the selected note (from the channel's customer locations).
  const { data: channelCustomers = [], isFetching: customersLoading } = useQuery({
    queryKey: ['sales-route-customer-locations', selected?.tenantId ?? 'own'],
    queryFn:  () => salesRouteApi.customerLocations(selected?.tenantId).then(r => r.data ?? []),
    enabled:  !!selected,
    staleTime: 60_000,
  });
  const selectedCustomer = selected ? channelCustomers.find(c => c.id === selected.customerId) : null;

  const mapPins = useMemo(() => {
    if (!selected) return [];
    const pins = [];
    if (hasPin(selectedCustomer)) {
      pins.push({
        id: `c-${selectedCustomer.id}`, latitude: selectedCustomer.latitude, longitude: selectedCustomer.longitude,
        color: ROUTE_BRAND, title: selectedCustomer.name,
        lines: [selectedCustomer.customerCode, selectedCustomer.location, 'Customer location'],
      });
    }
    if (hasPin(selected)) {
      pins.push({
        id: `n-${selected.id}`, latitude: selected.latitude, longitude: selected.longitude,
        color: NOTE_PIN, title: 'Visit note recorded here',
        lines: [selected.salesRepName, fmtWhen(selected), selected.reasonLabel],
      });
    }
    return pins;
  }, [selected, selectedCustomer]);

  const distance = selected && hasPin(selected) && hasPin(selectedCustomer)
    ? distanceM(selectedCustomer, selected) : null;

  function resetFilters() {
    setFilters({ tenantId: '', routeId: '', salesRepId: '', distributorId: '', reasonId: '' });
    setRange(iso(subDays(new Date(), 6)), today);
  }

  function toggleReasonByLabel(label) {
    const r = sortedReasons.find(x => x.label === label);
    if (!r) return;
    setFilter('reasonId', filters.reasonId === r.id ? '' : r.id);
  }

  async function exportCsv() {
    if (!rangeValid) return;
    setExporting(true);
    try {
      const rows = [];
      let p = 0;
      let truncated = false;
      for (;;) {
        const res = await visitNoteApi.list({ ...listParams, page: p, size: EXPORT_PAGE_SIZE });
        const d = res.data ?? {};
        rows.push(...(d.content ?? []));
        if (rows.length >= EXPORT_MAX_ROWS) { truncated = (d.totalElements ?? 0) > EXPORT_MAX_ROWS; break; }
        if (d.last !== false || !(d.content?.length)) break;
        p += 1;
      }
      const out = rows.slice(0, EXPORT_MAX_ROWS);
      if (out.length === 0) { toast('Nothing to export for these filters'); return; }

      const header = ['Date', 'Time', 'Customer Code', 'Customer', 'Route', 'Sales Rep', 'Distributor',
        ...(showChannel ? ['Channel'] : []), 'Reason', 'Note', 'Latitude', 'Longitude', 'Map Link'];
      const lines = [header.map(csvCell).join(',')];
      out.forEach(n => {
        let date = n.visitDate ?? '';
        let time = '';
        try {
          if (n.visitedAt) { const d = parseISO(n.visitedAt); date = format(d, ISO); time = format(d, 'HH:mm'); }
        } catch { /* keep raw */ }
        const gps = hasPin(n);
        lines.push([
          date, time, n.customerCode, n.customerName, n.routeName || 'Off-route', n.salesRepName, n.distributorName,
          ...(showChannel ? [n.tenantName] : []), n.reasonLabel, n.note,
          gps ? n.latitude : '', gps ? n.longitude : '', gps ? mapsUrl(n.latitude, n.longitude) : '',
        ].map(csvCell).join(','));
      });
      const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `visit-notes_${from}_to_${to}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(truncated
        ? `Exported the first ${EXPORT_MAX_ROWS.toLocaleString()} notes — narrow the filters for the rest`
        : `Exported ${out.length} note${out.length === 1 ? '' : 's'}`);
    } catch (err) {
      toast.error(err.response?.data?.detail ?? 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  const colCount = 9 + (showChannel ? 1 : 0);
  const anyFilter = FILTER_KEYS.some(k => filters[k]);

  return (
    <Layout title="Visit Notes">
      <div className="space-y-4 w-full">
        <p className="text-sm text-gray-500">
          Notes reps record on the mobile app after visiting a customer who didn&apos;t place an order.
          Manage the reasons they pick from in{' '}
          <Link href="/settings/reasons" className="text-brand-600 hover:underline">Reasons</Link>.
        </p>

        {/* ── Filters ─────────────────────────────────────────── */}
        <div className="card p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <span className="block text-xs text-gray-500 mb-1">From</span>
              <input type="date" className="input w-40" value={from} max={to || undefined}
                onChange={(e) => setRange(e.target.value, to && e.target.value > to ? e.target.value : to)} />
            </div>
            <div>
              <span className="block text-xs text-gray-500 mb-1">To</span>
              <input type="date" className="input w-40" value={to} min={from || undefined}
                onChange={(e) => setRange(from, e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-1.5 pb-1.5">
              {[['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This week'], ['month', 'This month'], ['last7', 'Last 7 days']].map(([k, l]) => (
                <button key={k} type="button" onClick={() => quick(k)}
                  className="rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:border-brand-400 hover:text-brand-700">
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {showChannel && (
              <div>
                <label className="label">Channel</label>
                <select className="input" value={filters.tenantId} onChange={(e) => setFilter('tenantId', e.target.value)}>
                  <option value="">All channels</option>
                  {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="label">Route</label>
              <select className="input" value={filters.routeId} onChange={(e) => setFilter('routeId', e.target.value)}>
                <option value="">All routes</option>
                {routeOptions.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name}{r.status === 'INACTIVE' ? ' (inactive)' : ''}{showChannel && r.tenantName && !filters.tenantId ? ` — ${r.tenantName}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Sales Rep</label>
              <select className="input" value={filters.salesRepId} onChange={(e) => setFilter('salesRepId', e.target.value)}>
                <option value="">All reps</option>
                {reps.map(r => <option key={r.id} value={r.id}>{r.fullName || r.username}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Distributor</label>
              <select className="input" value={filters.distributorId} onChange={(e) => setFilter('distributorId', e.target.value)}>
                <option value="">All distributors</option>
                {distributors.map(d => <option key={d.id} value={d.id}>{d.name}{d.code ? ` (${d.code})` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Reason</label>
              <select className="input" value={filters.reasonId} onChange={(e) => setFilter('reasonId', e.target.value)}>
                <option value="">All reasons</option>
                {sortedReasons.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
          </div>

          {(anyFilter || from !== iso(subDays(new Date(), 6)) || to !== today) && (
            <button type="button" className="text-xs text-gray-500 hover:text-brand-600" onClick={resetFilters}>
              Reset filters
            </button>
          )}
        </div>

        {!rangeValid && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            &apos;To&apos; must not be before &apos;From&apos;.
          </div>
        )}

        {/* ── Summary ─────────────────────────────────────────── */}
        {rangeValid && (
          <div className="flex flex-wrap gap-3">
            <div className="card px-4 py-3 min-w-[140px]">
              <p className="text-xs uppercase tracking-wider text-gray-500">Total notes</p>
              <p className="text-2xl font-semibold text-gray-900">{summaryTotal}</p>
            </div>
            {summary.map(s => {
              const reason = sortedReasons.find(r => r.label === s.reason);
              const active = reason && reason.id === filters.reasonId;
              return (
                <button key={s.reason} type="button" disabled={!reason}
                  onClick={() => toggleReasonByLabel(s.reason)}
                  title={reason ? (active ? 'Clear reason filter' : 'Show only this reason') : undefined}
                  className={`card px-4 py-3 min-w-[140px] text-left transition ${active
                    ? 'ring-2 ring-brand-500 bg-brand-50'
                    : reason ? 'hover:ring-1 hover:ring-brand-300' : 'cursor-default'}`}>
                  <p className="text-xs text-gray-500 truncate max-w-[200px]" title={s.reason}>{s.reason || 'No reason'}</p>
                  <p className="text-xl font-semibold text-gray-900">
                    {s.count}
                    {summaryTotal > 0 && (
                      <span className="ml-1.5 text-xs font-normal text-gray-400">
                        {Math.round((Number(s.count) / summaryTotal) * 100)}%
                      </span>
                    )}
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Map for the selected note ───────────────────────── */}
        {selected && (
          <div className="card p-4">
            <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-gray-900 truncate">
                  {selected.customerName}
                  {selected.customerCode && <span className="ml-2 font-mono text-xs text-gray-500">{selected.customerCode}</span>}
                </h3>
                <p className="text-xs text-gray-500">
                  {selected.salesRepName || '—'} · {fmtWhen(selected)} · {selected.reasonLabel || '—'}
                </p>
                <p className="text-xs mt-1">
                  {!hasPin(selected)
                    ? <span className="text-amber-700">No GPS position was recorded with this note.</span>
                    : customersLoading && !selectedCustomer
                      ? <span className="text-gray-400">Loading customer location…</span>
                      : !hasPin(selectedCustomer)
                        ? <span className="text-amber-700">The customer has no saved location to compare against.</span>
                        : <span className="text-gray-700">Recorded <span className="font-semibold">{fmtDistance(distance)}</span> from the customer&apos;s saved location.</span>}
                </p>
              </div>
              <button type="button" className="btn-secondary text-xs" onClick={() => setSelectedId(null)}>Close map</button>
            </div>
            {mapPins.length > 0 ? (
              <RouteMap extraPins={mapPins} fitKey={selected.id} height={360}
                legend={[{ color: ROUTE_BRAND, label: 'Customer' }, { color: NOTE_PIN, label: 'Visit note' }]} />
            ) : (
              <div className="flex h-[120px] items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-sm text-gray-400">
                {customersLoading ? 'Loading…' : 'Nothing to show on the map for this note.'}
              </div>
            )}
          </div>
        )}

        {/* ── Table ───────────────────────────────────────────── */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-b border-gray-200">
            <p className="text-sm text-gray-600">
              {rangeValid && notesPage
                ? <><span className="font-semibold text-gray-900">{totalElements}</span> note{totalElements === 1 ? '' : 's'}
                    {selectedReason && <> · reason <span className="font-medium">{selectedReason.label}</span></>}
                    {isFetching && <span className="ml-2 text-xs text-gray-400">Updating…</span>}
                  </>
                : ' '}
            </p>
            <button type="button" className="btn-secondary" onClick={exportCsv}
              disabled={exporting || !rangeValid || !totalElements}>
              {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {['Date & time', 'Customer', 'Route', 'Sales Rep', 'Distributor', ...(showChannel ? ['Channel'] : []),
                    'Reason', 'Note', 'Location', ''].map((h, i) => (
                    <th key={h || `c${i}`} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {!rangeValid ? (
                  <tr><td colSpan={colCount + 1} className="px-4 py-12 text-center text-sm text-gray-400">Fix the date range to see notes.</td></tr>
                ) : error ? (
                  <tr><td colSpan={colCount + 1} className="px-4 py-12 text-center text-sm text-red-500">
                    {error.response?.data?.detail ?? 'Failed to load visit notes'}
                  </td></tr>
                ) : (isLoading || !ready) ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: colCount + 1 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-200 rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                ) : notes.length === 0 ? (
                  <tr><td colSpan={colCount + 1} className="px-4 py-12 text-center text-sm text-gray-400">
                    No visit notes match these filters{anyFilter ? '' : ' in this period'}.
                  </td></tr>
                ) : notes.map(n => {
                  const isSel = n.id === selectedId;
                  const gps = hasPin(n);
                  return (
                    <tr key={n.id} onClick={() => setSelectedId(isSel ? null : n.id)}
                      className={`cursor-pointer transition-colors ${isSel ? 'bg-brand-50' : 'hover:bg-gray-50'}`}>
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">{fmtWhen(n)}</td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        <span className="block font-medium text-gray-900">{n.customerName || '—'}</span>
                        {n.customerCode && <span className="block font-mono text-xs text-gray-500">{n.customerCode}</span>}
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        {n.routeName
                          ? <span className="text-gray-700">{n.routeName}</span>
                          : <span className="text-gray-400 italic">Off-route</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{n.salesRepName || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{n.distributorName || '—'}</td>
                      {showChannel && <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{n.tenantName || '—'}</td>}
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        {n.reasonLabel ? <span className="badge-amber">{n.reasonLabel}</span> : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {n.note ? <span className="block max-w-[280px] truncate" title={n.note}>{n.note}</span> : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        {gps ? (
                          <a href={mapsUrl(n.latitude, n.longitude)} target="_blank" rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-brand-600 hover:underline">
                            Google Maps ↗
                          </a>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button type="button" className="text-xs text-gray-600 hover:text-brand-600"
                          onClick={(e) => { e.stopPropagation(); setSelectedId(isSel ? null : n.id); }}>
                          {isSel ? 'Hide map' : 'Map'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {rangeValid && totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
              <p className="text-sm text-gray-500">Page {page + 1} of {totalPages}</p>
              <div className="flex gap-1">
                <button onClick={() => { setPage(page - 1); setSelectedId(null); }} disabled={page === 0}
                  className="btn-secondary px-3 py-1 text-xs disabled:opacity-40">← Prev</button>
                <button onClick={() => { setPage(page + 1); setSelectedId(null); }} disabled={page >= totalPages - 1}
                  className="btn-secondary px-3 py-1 text-xs disabled:opacity-40">Next →</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

export default withAuth(VisitNotesPage, [], 'MOD_VISIT_NOTES', 'SFA');
