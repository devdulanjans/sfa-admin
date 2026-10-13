import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { addDays, endOfWeek, format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';
import Layout from '../../components/Layout';
import StatusBadge from '../../components/StatusBadge';
import RoutesDisabledNotice from '../../components/RoutesDisabledNotice';
import RouteMap, { hasPin } from '../../components/RouteMap';
import { withAuth } from '../../lib/auth';
import { salesRouteApi, dashboardApi } from '../../lib/api';

const ISO = 'yyyy-MM-dd';
const MAX_DAYS = 92;
// JS getDay(): 0 = Sunday. Listed Monday-first.
const WEEKDAYS = [
  { d: 1, label: 'Mon' }, { d: 2, label: 'Tue' }, { d: 3, label: 'Wed' }, { d: 4, label: 'Thu' },
  { d: 5, label: 'Fri' }, { d: 6, label: 'Sat' }, { d: 0, label: 'Sun' },
];

const iso = (d) => format(d, ISO);

function datesBetween(from, to, weekdays, minDate) {
  if (!from || !to || to < from) return [];
  const out = [];
  let d = parseISO(from);
  const end = parseISO(to);
  while (d <= end && out.length <= MAX_DAYS) {
    const s = iso(d);
    if (s >= minDate && weekdays.has(d.getDay())) out.push(s);
    d = addDays(d, 1);
  }
  return out;
}

function AssignRoutePage() {
  const qc = useQueryClient();
  const today = iso(new Date());

  // ── Assignment form ──
  const [routeId, setRouteId]     = useState('');
  const [salesRepId, setRepId]    = useState('');
  const [fromDate, setFromDate]   = useState(today);
  const [toDate, setToDate]       = useState(today);
  const [weekdays, setWeekdays]   = useState(() => new Set([0, 1, 2, 3, 4, 5, 6]));
  const [notes, setNotes]         = useState('');

  // ── Assignment list ──
  const [listFrom, setListFrom]   = useState(today);
  const [listTo, setListTo]       = useState(iso(addDays(new Date(), 6)));
  const [listRep, setListRep]     = useState('');

  // Which route the map previews: the form's route, or an assignment row the user clicked.
  const [previewRouteId, setPreviewRouteId] = useState('');
  const [previewAssignmentId, setPreviewAssignmentId] = useState(null);

  useEffect(() => { setPreviewRouteId(routeId); setPreviewAssignmentId(null); }, [routeId]);

  const { data: activeRoutes = [] } = useQuery({
    queryKey: ['sales-routes-active'],
    queryFn:  () => salesRouteApi.active().then(r => r.data ?? []),
  });

  // All routes (incl. inactive) — only for the stop counts in the assignment table.
  const { data: allRoutesPage } = useQuery({
    queryKey: ['sales-routes', 'all-for-counts'],
    queryFn:  () => salesRouteApi.list({ page: 0, size: 500 }).then(r => r.data),
    staleTime: 60_000,
  });
  const routeCounts = useMemo(() => {
    const m = new Map();
    (allRoutesPage?.content ?? []).forEach(r => m.set(r.id, r.customerCount));
    activeRoutes.forEach(r => m.set(r.id, r.customerCount));
    return m;
  }, [allRoutesPage, activeRoutes]);

  const { data: reps = [] } = useQuery({
    queryKey: ['dashboard-sales-reps'],
    queryFn:  () => dashboardApi.salesReps().then(r => r.data ?? []),
    staleTime: 5 * 60 * 1000,
  });

  const { data: previewRoute, isFetching: previewLoading } = useQuery({
    queryKey: ['sales-route', previewRouteId],
    queryFn:  () => salesRouteApi.get(previewRouteId).then(r => r.data),
    enabled:  !!previewRouteId,
  });

  const { data: channelCustomers = [] } = useQuery({
    queryKey: ['sales-route-customer-locations', previewRoute?.tenantId ?? 'own'],
    queryFn:  () => salesRouteApi.customerLocations(previewRoute?.tenantId).then(r => r.data ?? []),
    enabled:  !!previewRoute,
    staleTime: 60_000,
  });

  const listValid = listFrom && listTo && listTo >= listFrom;
  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ['sales-route-assignments', listFrom, listTo, listRep],
    queryFn:  () => salesRouteApi.assignments({ from: listFrom, to: listTo, salesRepId: listRep || undefined })
      .then(r => r.data ?? []),
    enabled:  !!listValid,
  });

  const sortedAssignments = useMemo(() => [...assignments].sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
    || String(a.salesRepName ?? '').localeCompare(String(b.salesRepName ?? ''))), [assignments]);

  const dates = useMemo(
    () => datesBetween(fromDate, toDate, weekdays, today), [fromDate, toDate, weekdays, today]);
  const tooMany = dates.length > MAX_DAYS;

  const assignMutation = useMutation({
    mutationFn: (body) => salesRouteApi.assign(body),
    onSuccess: (res) => {
      const n = res.data?.length ?? dates.length;
      toast.success(`Route assigned for ${n} day${n === 1 ? '' : 's'}`);
      setNotes('');
      qc.invalidateQueries({ queryKey: ['sales-route-assignments'] });
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Assignment failed', { duration: 6000 }),
  });

  const unassignMutation = useMutation({
    mutationFn: (aid) => salesRouteApi.unassign(aid),
    onSuccess: () => {
      toast.success('Assignment removed');
      qc.invalidateQueries({ queryKey: ['sales-route-assignments'] });
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to remove assignment'),
  });

  function quick(kind) {
    const now = new Date();
    if (kind === 'today') { setFromDate(today); setToDate(today); }
    if (kind === 'tomorrow') { const t = iso(addDays(now, 1)); setFromDate(t); setToDate(t); }
    if (kind === 'week') { setFromDate(today); setToDate(iso(endOfWeek(now, { weekStartsOn: 1 }))); }
    if (kind === 'next7') { setFromDate(today); setToDate(iso(addDays(now, 6))); }
  }

  function toggleWeekday(d) {
    setWeekdays(prev => {
      const next = new Set(prev);
      next.has(d) ? next.delete(d) : next.add(d);
      return next;
    });
  }

  function submit(e) {
    e.preventDefault();
    if (!routeId)    return toast.error('Select a route');
    if (!salesRepId) return toast.error('Select a sales rep');
    if (dates.length === 0) return toast.error('No days selected — check the date range and weekdays');
    if (tooMany) return toast.error(`Assign at most ${MAX_DAYS} days at a time`);
    assignMutation.mutate({ routeId, salesRepId, dates, notes: notes.trim() || null });
  }

  const stops = previewRoute?.customers ?? [];
  const stopsNoPin = stops.filter(s => !hasPin(s)).length;
  const previewAssignment = previewAssignmentId ? assignments.find(a => a.id === previewAssignmentId) : null;

  // Group rows by date for the table.
  let lastDate = null;

  return (
    <Layout title="Assign Route">
      <div className="space-y-5 w-full">
        <RoutesDisabledNotice />
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
          {/* ── Form ──────────────────────────────────────────── */}
          <form onSubmit={submit} className="card p-6 space-y-4 xl:col-span-2 self-start">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Assign a route</h2>
              <Link href="/routes" className="text-xs text-gray-500 hover:text-brand-600">Manage routes →</Link>
            </div>

            <div>
              <label className="label">Route *</label>
              <select className="input" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
                <option value="">Select a route…</option>
                {activeRoutes.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.customerCount} stop{r.customerCount === 1 ? '' : 's'}){r.tenantName ? ` — ${r.tenantName}` : ''}
                  </option>
                ))}
              </select>
              {activeRoutes.length === 0 && (
                <p className="text-xs text-gray-400 mt-1">No active routes. <Link href="/routes/new" className="text-brand-600 underline">Create one</Link>.</p>
              )}
            </div>

            <div>
              <label className="label">Sales Rep *</label>
              <select className="input" value={salesRepId} onChange={(e) => setRepId(e.target.value)}>
                <option value="">Select a sales rep…</option>
                {reps.map(r => <option key={r.id} value={r.id}>{r.fullName || r.username}</option>)}
              </select>
            </div>

            <div>
              <label className="label">Days *</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {[['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'This week'], ['next7', 'Next 7 days']].map(([k, l]) => (
                  <button key={k} type="button" onClick={() => quick(k)}
                    className="rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:border-brand-400 hover:text-brand-700">
                    {l}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="block text-xs text-gray-500 mb-1">From</span>
                  <input type="date" className="input" min={today} value={fromDate}
                    onChange={(e) => { setFromDate(e.target.value); if (toDate < e.target.value) setToDate(e.target.value); }} />
                </div>
                <div>
                  <span className="block text-xs text-gray-500 mb-1">To</span>
                  <input type="date" className="input" min={fromDate || today} value={toDate}
                    onChange={(e) => setToDate(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-wrap gap-3 mt-3">
                {WEEKDAYS.map(w => (
                  <label key={w.d} className="flex items-center gap-1.5 text-sm text-gray-700">
                    <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600"
                      checked={weekdays.has(w.d)} onChange={() => toggleWeekday(w.d)} />
                    {w.label}
                  </label>
                ))}
              </div>
              <p className={`text-xs mt-2 ${dates.length === 0 || tooMany ? 'text-red-600' : 'text-gray-500'}`}>
                {tooMany
                  ? `More than ${MAX_DAYS} days selected — shorten the range.`
                  : dates.length === 0
                    ? 'No days selected.'
                    : <>Will assign <span className="font-semibold text-gray-800">{dates.length}</span> day{dates.length === 1 ? '' : 's'}
                        {dates.length <= 7 && <>: {dates.map(d => format(parseISO(d), 'EEE d MMM')).join(', ')}</>}
                      </>}
              </p>
            </div>

            <div>
              <label className="label">Notes</label>
              <textarea rows={2} maxLength={500} className="input" value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional — shown with the assignment" />
            </div>

            <p className="text-xs text-gray-500">
              A rep has one route per day — assigning replaces any route they already have on those days.
            </p>

            <button type="submit" className="btn-primary w-full justify-center"
              disabled={assignMutation.isPending || dates.length === 0 || tooMany}>
              {assignMutation.isPending ? 'Assigning…' : `Assign${dates.length ? ` (${dates.length} day${dates.length === 1 ? '' : 's'})` : ''}`}
            </button>
          </form>

          {/* ── Map preview ───────────────────────────────────── */}
          <div className="card p-4 xl:col-span-3">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-gray-900 truncate">
                  {previewRoute ? previewRoute.name : 'Route preview'}
                  {previewRoute && <span className="ml-2 align-middle"><StatusBadge status={previewRoute.status} /></span>}
                </h3>
                {previewAssignment && (
                  <p className="text-xs text-gray-500">
                    Previewing {previewAssignment.salesRepName}&apos;s route on {format(parseISO(previewAssignment.date), 'EEE d MMM yyyy')}
                  </p>
                )}
              </div>
              {previewAssignmentId && routeId && previewRouteId !== routeId && (
                <button type="button" className="text-xs text-brand-600 hover:underline"
                  onClick={() => { setPreviewRouteId(routeId); setPreviewAssignmentId(null); }}>
                  Back to selected route
                </button>
              )}
            </div>

            {!previewRouteId ? (
              <div className="flex h-[440px] items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-sm text-gray-400">
                Select a route (or click an assignment below) to see its customers on the map.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <RouteMap customers={channelCustomers} stops={stops} fitKey={previewRouteId} faintOthers height={440} />
                </div>
                <div className="rounded-xl border border-gray-200">
                  <div className="px-3 py-2 border-b border-gray-200 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Stops ({stops.length})
                  </div>
                  {previewLoading && !previewRoute ? (
                    <p className="px-3 py-4 text-sm text-gray-400">Loading…</p>
                  ) : stops.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-gray-400">This route has no stops.</p>
                  ) : (
                    <ol className="divide-y divide-gray-100 max-h-[396px] overflow-y-auto">
                      {stops.map((s, i) => (
                        <li key={s.id} className="flex items-start gap-2 px-3 py-2">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
                            {s.stopNumber ?? i + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm text-gray-900">{s.name}</p>
                            <p className="truncate text-xs text-gray-500">
                              {[s.customerCode, s.location].filter(Boolean).join(' · ') || '—'}
                            </p>
                            {!hasPin(s) && <p className="text-[11px] text-amber-600">No location — not on map</p>}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                  {stopsNoPin > 0 && (
                    <p className="px-3 py-2 border-t border-gray-200 text-[11px] text-amber-700 bg-amber-50 rounded-b-xl">
                      {stopsNoPin} stop{stopsNoPin === 1 ? '' : 's'} without a location.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Assignments ─────────────────────────────────────── */}
        <div className="card overflow-hidden">
          <div className="flex items-end justify-between gap-3 flex-wrap px-4 py-3 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900 self-center">Assignments</h3>
            <div className="flex items-end gap-2 flex-wrap">
              <div>
                <span className="block text-xs text-gray-500 mb-1">From</span>
                <input type="date" className="input w-40" value={listFrom} onChange={(e) => setListFrom(e.target.value)} />
              </div>
              <div>
                <span className="block text-xs text-gray-500 mb-1">To</span>
                <input type="date" className="input w-40" min={listFrom} value={listTo} onChange={(e) => setListTo(e.target.value)} />
              </div>
              <div>
                <span className="block text-xs text-gray-500 mb-1">Sales Rep</span>
                <select className="input w-48" value={listRep} onChange={(e) => setListRep(e.target.value)}>
                  <option value="">All reps</option>
                  {reps.map(r => <option key={r.id} value={r.id}>{r.fullName || r.username}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {['Date', 'Sales Rep', 'Route', 'Stops', 'Notes', 'Assigned by', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {!listValid ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-red-500">&apos;To&apos; must not be before &apos;From&apos;.</td></tr>
                ) : assignmentsLoading ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">Loading…</td></tr>
                ) : sortedAssignments.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">No routes assigned in this period</td></tr>
                ) : sortedAssignments.map(a => {
                  const firstOfDate = a.date !== lastDate;
                  lastDate = a.date;
                  const removable = a.date >= today;
                  const selected = a.id === previewAssignmentId;
                  return (
                    <tr key={a.id}
                      onClick={() => { setPreviewRouteId(a.routeId); setPreviewAssignmentId(a.id); }}
                      className={`cursor-pointer transition-colors ${selected ? 'bg-brand-50' : 'hover:bg-gray-50'} ${firstOfDate ? 'border-t-2 border-gray-200' : ''}`}>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        {firstOfDate ? (
                          <span className={`font-medium ${a.date === today ? 'text-brand-700' : 'text-gray-900'}`}>
                            {format(parseISO(a.date), 'EEE d MMM yyyy')}{a.date === today && ' · Today'}
                          </span>
                        ) : <span className="text-gray-300">〃</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{a.salesRepName || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                        <span className="font-medium">{a.routeName}</span>
                        {a.routeStatus === 'INACTIVE' && <span className="ml-2"><StatusBadge status="INACTIVE" /></span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{routeCounts.get(a.routeId) ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {a.notes ? <span className="block max-w-[220px] truncate" title={a.notes}>{a.notes}</span> : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{a.assignedByName || '—'}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap space-x-3">
                        {a.date <= today && (
                          <Link
                            href={{ pathname: '/routes/visit-notes', query: { routeId: a.routeId, salesRepId: a.salesRepId, from: a.date, to: a.date } }}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-gray-600 hover:text-brand-600">
                            Visit notes
                          </Link>
                        )}
                        {removable && (
                          <button type="button" className="text-xs text-red-600 hover:text-red-700"
                            disabled={unassignMutation.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Remove ${a.routeName} from ${a.salesRepName} on ${a.date}?`)) unassignMutation.mutate(a.id);
                            }}>
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default withAuth(AssignRoutePage, [], 'MOD_ROUTE_ASSIGN', 'SFA');
