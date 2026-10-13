import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import Layout from '../../components/Layout';
import StatusBadge from '../../components/StatusBadge';
import RouteMap, { hasPin, ROUTE_BRAND } from '../../components/RouteMap';
import { withAuth } from '../../lib/auth';
import { useAccessibleTenants } from '../../lib/hooks';
import { salesRouteApi } from '../../lib/api';

const EMPTY = { name: '', description: '', status: 'ACTIVE', tenantId: '' };
const MAX_LIST = 300;   // customers rendered in the "add" list at once (search narrows it)
const SUGGESTED_COLOR = '#f59e0b';   // amber-500 — customers suggested for this route by reps
const MAP_LEGEND = [
  { color: ROUTE_BRAND, label: 'Route stop' },
  { color: '#9ca3af',   label: 'Other customer' },
  { color: SUGGESTED_COLOR, label: 'Suggested by rep' },
];

function fmtDate(v) {
  if (!v) return null;
  try { return format(new Date(v), 'dd MMM yyyy'); } catch { return null; }
}

function matches(c, q) {
  if (!q) return true;
  return [c.name, c.customerCode, c.location, c.phone]
    .some(v => v && String(v).toLowerCase().includes(q));
}

function RouteEditorPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = router.query;
  const isNew = id === 'new';

  const { tenants, needsPicker } = useAccessibleTenants({ enabled: isNew });
  const { register, handleSubmit, reset, watch, formState: { errors, isDirty } } = useForm({ defaultValues: EMPTY });

  const [stops, setStops]         = useState([]);
  const [stopsDirty, setStopsDirty] = useState(false);
  const [search, setSearch]       = useState('');
  const [showNoLocation, setShowNoLocation] = useState(false);
  const dragIndex = useRef(null);
  const [dragOver, setDragOver] = useState(null);

  const { data: route, isLoading } = useQuery({
    queryKey: ['sales-route', id],
    queryFn:  () => salesRouteApi.get(id).then(r => r.data),
    enabled:  !!id && !isNew,
  });

  useEffect(() => {
    if (!route) return;
    reset({ name: route.name ?? '', description: route.description ?? '', status: route.status ?? 'ACTIVE', tenantId: '' });
    setStops(route.customers ?? []);
    setStopsDirty(false);
  }, [route, reset]);

  // Which channel's customers to offer: the route's own channel when editing; on create the
  // picked channel, or the only accessible one.
  const pickedTenantId = watch('tenantId');
  const channelId = isNew
    ? (pickedTenantId || (tenants.length === 1 ? tenants[0].id : null))
    : route?.tenantId ?? null;
  const channelReady = isNew ? (!needsPicker || !!pickedTenantId) : !!route;

  const { data: customersData, isLoading: customersLoading } = useQuery({
    queryKey: ['sales-route-customer-locations', channelId ?? 'own'],
    queryFn:  () => salesRouteApi.customerLocations(channelId).then(r => r.data ?? []),
    enabled:  !!id && channelReady,
    staleTime: 60_000,
  });
  const customers = customersData ?? [];

  const stopIds = useMemo(() => new Set(stops.map(s => s.id)), [stops]);
  const q = search.trim().toLowerCase();
  const available = useMemo(
    () => customers.filter(c => !stopIds.has(c.id) && matches(c, q)),
    [customers, stopIds, q]);
  const noLocation = useMemo(() => customers.filter(c => !hasPin(c)), [customers]);

  function changeStops(next) { setStops(next); setStopsDirty(true); }
  function addStop(c) {
    if (stopIds.has(c.id)) return;
    changeStops([...stops, c]);
  }
  function removeStop(cid) { changeStops(stops.filter(s => s.id !== cid)); }
  function moveStop(from, to) {
    if (to < 0 || to >= stops.length || from === to) return;
    const next = [...stops];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    changeStops(next);
  }

  const mutation = useMutation({
    mutationFn: (body) => isNew ? salesRouteApi.create(body) : salesRouteApi.update(id, body),
    onSuccess: (res) => {
      toast.success(isNew ? 'Route created' : 'Route saved');
      qc.invalidateQueries({ queryKey: ['sales-routes'] });
      qc.invalidateQueries({ queryKey: ['sales-routes-active'] });
      qc.invalidateQueries({ queryKey: ['sales-route'] });
      // Saving a suggested customer as a stop clears its suggestion server-side.
      qc.invalidateQueries({ queryKey: ['sales-route-suggestions'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customer'] });
      if (isNew && res.data?.id) router.replace(`/routes/${res.data.id}`);
      else setStopsDirty(false);
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Save failed'),
  });

  // ── Suggestions: customers captured as leads by a rep while on this route ──
  const { data: suggestionsData } = useQuery({
    queryKey: ['sales-route-suggestions', id],
    queryFn:  () => salesRouteApi.suggestions(id).then(r => r.data ?? []),
    enabled:  !!id && !isNew,
  });
  const suggestions = suggestionsData ?? [];
  const suggestedPins = useMemo(() => suggestions
    .filter(s => s.customer && !stopIds.has(s.customer.id) && hasPin(s.customer))
    .map(s => ({
      id: `suggested-${s.customer.id}`,
      latitude: s.customer.latitude,
      longitude: s.customer.longitude,
      color: SUGGESTED_COLOR,
      title: s.customer.name,
      lines: [
        [s.customer.customerCode, s.customer.location].filter(Boolean).join(' · '),
        `Suggested${s.suggestedByName ? ` by ${s.suggestedByName}` : ''}${fmtDate(s.suggestedAt) ? ` on ${fmtDate(s.suggestedAt)}` : ''}`,
      ].filter(Boolean),
    })), [suggestions, stopIds]);

  // Jump to the panel when arriving from the routes list badge (/routes/{id}#suggestions).
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (scrolledRef.current || suggestions.length === 0) return;
    if (typeof window !== 'undefined' && window.location.hash === '#suggestions') {
      scrolledRef.current = true;
      document.getElementById('suggestions')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [suggestions.length]);

  function invalidateAfterSuggestion() {
    qc.invalidateQueries({ queryKey: ['sales-route-suggestions', id] });
    qc.invalidateQueries({ queryKey: ['sales-routes'] });
    qc.invalidateQueries({ queryKey: ['sales-routes-active'] });
    qc.invalidateQueries({ queryKey: ['customers'] });
    qc.invalidateQueries({ queryKey: ['customer'] });
  }

  const acceptMutation = useMutation({
    mutationFn: (customerId) => salesRouteApi.acceptSuggestion(id, customerId),
    onSuccess: (res, customerId) => {
      const name = suggestions.find(s => s.customer?.id === customerId)?.customer?.name;
      toast.success(name ? `${name} added as the last stop` : 'Customer added to route');
      if (res.data) qc.setQueryData(['sales-route', id], res.data);
      qc.invalidateQueries({ queryKey: ['sales-route', id] });
      invalidateAfterSuggestion();
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail ?? 'Failed to add customer to route', { duration: 6000 });
      qc.invalidateQueries({ queryKey: ['sales-route-suggestions', id] });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: (customerId) => salesRouteApi.dismissSuggestion(id, customerId),
    onSuccess: () => { toast.success('Suggestion dismissed'); invalidateAfterSuggestion(); },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to dismiss suggestion'),
  });

  // With unsaved edits, accepting server-side would refetch the route and wipe them, so the
  // customer is appended to the local stop list instead — the normal Save persists it and the
  // backend clears the suggestion when the route is saved with that customer as a stop.
  function addSuggested(s) {
    const c = s.customer;
    if (!c || stopIds.has(c.id)) return;
    if (isDirty || stopsDirty) {
      if (customersData && !customers.some(x => x.id === c.id)) {
        toast.error(`${c.name} isn't available in this route's channel`);
        return;
      }
      changeStops([...stops, c]);
      toast.success(`${c.name} added as the last stop — Save to apply`);
      return;
    }
    acceptMutation.mutate(c.id);
  }
  const suggestionBusy = acceptMutation.isPending || dismissMutation.isPending;

  function onSubmit(d) {
    mutation.mutate({
      name: d.name.trim(),
      description: d.description?.trim() || null,
      status: d.status,
      customerIds: stops.map(s => s.id),
      tenantId: isNew ? (channelId || null) : undefined,
    });
  }

  if (!isNew && isLoading) {
    return (
      <Layout title="Route">
        <div className="card p-6 text-sm text-gray-400">Loading…</div>
      </Layout>
    );
  }

  const stopsWithoutPin = stops.filter(s => !hasPin(s)).length;

  return (
    <Layout title={isNew ? 'New Route' : route?.name ?? 'Route'}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 w-full">
        {/* ── Route details ─────────────────────────────────────── */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <Link href="/routes" className="text-xs text-gray-500 hover:text-brand-600">← Routes</Link>
              <h2 className="text-base font-semibold text-gray-900 mt-1">{isNew ? 'New Route' : 'Edit Route'}</h2>
            </div>
            <div className="flex items-center gap-3">
              {route?.tenantName && <span className="text-xs text-gray-500">Channel: <span className="font-medium text-gray-700">{route.tenantName}</span></span>}
              {route && <StatusBadge status={route.status} />}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {isNew && needsPicker && (
              <div className="md:col-span-3 md:max-w-sm">
                <label className="label">Channel *</label>
                <select className="input"
                  {...register('tenantId', {
                    required: true,
                    onChange: () => { if (stops.length) { setStops([]); toast('Stops cleared — customers belong to one channel'); } },
                  })}>
                  <option value="">Select channel…</option>
                  {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                {errors.tenantId && <p className="text-red-500 text-xs mt-1">Required</p>}
              </div>
            )}
            <div>
              <label className="label">Route Name *</label>
              <input className="input" placeholder="e.g. Colombo North — Monday"
                {...register('name', { required: 'Required', maxLength: { value: 150, message: 'Max 150 characters' },
                  validate: v => !!v.trim() || 'Required' })} />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message || 'Required'}</p>}
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" {...register('status')}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="label">Description</label>
              <textarea rows={2} className="input"
                {...register('description', { maxLength: { value: 500, message: 'Max 500 characters' } })} />
              {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description.message}</p>}
            </div>
          </div>
        </div>

        {/* ── Customers & map ───────────────────────────────────── */}
        {!channelReady ? (
          <div className="card p-6 text-sm text-gray-500">Select a channel to choose the route&apos;s customers.</div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
            <div className="xl:col-span-2 space-y-5">
              {/* Suggested by reps */}
              {!isNew && suggestions.length > 0 && (
                <div id="suggestions" className="card border-amber-200 scroll-mt-4">
                  <div className="px-4 py-3 border-b border-amber-200 bg-amber-50 rounded-t-xl">
                    <h3 className="text-sm font-semibold text-amber-900">
                      Suggested by reps <span className="font-normal text-amber-700">({suggestions.length})</span>
                    </h3>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Customers captured as leads by a rep while working this route.
                      {(isDirty || stopsDirty) && ' You have unsaved changes — "Add" puts them in the stop list; Save to apply.'}
                    </p>
                  </div>
                  <ul className="divide-y divide-gray-100 max-h-[300px] overflow-y-auto">
                    {suggestions.map(s => {
                      const c = s.customer ?? {};
                      const pending = stopIds.has(c.id);
                      const when = fmtDate(s.suggestedAt);
                      return (
                        <li key={c.id} className="flex items-center gap-3 px-4 py-2">
                          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SUGGESTED_COLOR }} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-900">{c.name}</p>
                            <p className="truncate text-xs text-gray-500">
                              {[c.customerCode, c.location].filter(Boolean).join(' · ') || '—'}
                              {!hasPin(c) && <span className="ml-1 text-amber-600">· no location</span>}
                            </p>
                            <p className="truncate text-[11px] text-gray-400">
                              Suggested{s.suggestedByName ? ` by ${s.suggestedByName}` : ''}{when ? ` on ${when}` : ''}
                            </p>
                          </div>
                          {pending ? (
                            <span className="shrink-0 text-xs text-amber-700">In stops · save to apply</span>
                          ) : (
                            <div className="flex items-center gap-3 shrink-0">
                              <button type="button" className="text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-40"
                                disabled={suggestionBusy} onClick={() => addSuggested(s)}>
                                {acceptMutation.isPending && acceptMutation.variables === c.id ? 'Adding…' : '+ Add to route'}
                              </button>
                              <button type="button" className="text-xs text-gray-500 hover:text-red-600 disabled:opacity-40"
                                disabled={suggestionBusy}
                                onClick={() => { if (confirm(`Dismiss the suggestion for "${c.name}"?`)) dismissMutation.mutate(c.id); }}>
                                Dismiss
                              </button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Stops */}
              <div className="card">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-900">Route stops <span className="text-gray-400 font-normal">({stops.length})</span></h3>
                  {stops.length > 0 && (
                    <button type="button" className="text-xs text-red-600 hover:text-red-700"
                      onClick={() => { if (confirm('Remove all stops from this route?')) changeStops([]); }}>
                      Clear all
                    </button>
                  )}
                </div>
                {stops.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-gray-400">
                    No stops yet — add customers from the list below or click grey pins on the map.
                  </p>
                ) : (
                  <ol className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto">
                    {stops.map((s, i) => (
                      <li key={s.id}
                        draggable
                        onDragStart={() => { dragIndex.current = i; }}
                        onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
                        onDragLeave={() => setDragOver(null)}
                        onDrop={(e) => { e.preventDefault(); moveStop(dragIndex.current, i); dragIndex.current = null; setDragOver(null); }}
                        onDragEnd={() => { dragIndex.current = null; setDragOver(null); }}
                        className={`flex items-center gap-3 px-4 py-2 bg-white ${dragOver === i ? 'ring-2 ring-inset ring-brand-300' : ''}`}>
                        <span className="cursor-grab text-gray-300 select-none" title="Drag to reorder">⋮⋮</span>
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900">{s.name}</p>
                          <p className="truncate text-xs text-gray-500">
                            {[s.customerCode, s.location].filter(Boolean).join(' · ') || '—'}
                            {!hasPin(s) && <span className="ml-1 text-amber-600">· no location</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button type="button" className="px-1.5 py-0.5 text-xs text-gray-500 hover:text-brand-600 disabled:opacity-30"
                            disabled={i === 0} onClick={() => moveStop(i, i - 1)} title="Move up">▲</button>
                          <button type="button" className="px-1.5 py-0.5 text-xs text-gray-500 hover:text-brand-600 disabled:opacity-30"
                            disabled={i === stops.length - 1} onClick={() => moveStop(i, i + 1)} title="Move down">▼</button>
                          <button type="button" className="px-1.5 py-0.5 text-xs text-red-500 hover:text-red-700"
                            onClick={() => removeStop(s.id)} title="Remove">✕</button>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {/* Available customers */}
              <div className="card">
                <div className="px-4 py-3 border-b border-gray-200 space-y-2">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Customers <span className="text-gray-400 font-normal">({customers.length})</span>
                  </h3>
                  <input className="input" placeholder="Search name, code, location, phone…"
                    value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                {customersLoading ? (
                  <p className="px-4 py-6 text-sm text-gray-400">Loading customers…</p>
                ) : available.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-gray-400">
                    {customers.length === 0 ? 'This channel has no customers.' : 'No matching customers.'}
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100 max-h-[360px] overflow-y-auto">
                    {available.slice(0, MAX_LIST).map(c => (
                      <li key={c.id} className="flex items-center gap-3 px-4 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-gray-900">{c.name}</p>
                          <p className="truncate text-xs text-gray-500">
                            {[c.customerCode, c.location].filter(Boolean).join(' · ') || '—'}
                            {!hasPin(c) && <span className="ml-1 text-amber-600">· no location</span>}
                          </p>
                        </div>
                        <button type="button" className="text-xs font-medium text-brand-600 hover:text-brand-700 shrink-0"
                          onClick={() => addStop(c)}>
                          + Add
                        </button>
                      </li>
                    ))}
                    {available.length > MAX_LIST && (
                      <li className="px-4 py-2 text-xs text-gray-400">
                        Showing {MAX_LIST} of {available.length} — search to narrow the list.
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </div>

            {/* Map */}
            <div className="xl:col-span-3 space-y-3">
              <div className="card p-4">
                <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                  <h3 className="text-sm font-semibold text-gray-900">Map</h3>
                  <p className="text-xs text-gray-500">Click a grey pin to add it as the next stop · click a numbered pin to remove it</p>
                </div>
                <RouteMap
                  customers={customers}
                  stops={stops}
                  fitKey={`${channelId ?? 'own'}:${id}`}
                  height={560}
                  onPinClick={(c, stopNumber) => (stopNumber ? removeStop(c.id) : addStop(c))}
                  extraPins={suggestedPins}
                  legend={suggestions.length > 0 ? MAP_LEGEND : undefined}
                />
                {(noLocation.length > 0 || stopsWithoutPin > 0) && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {noLocation.length} customer{noLocation.length === 1 ? '' : 's'} in this channel ha{noLocation.length === 1 ? 's' : 've'} no
                    location and can&apos;t be pinned on the map
                    {stopsWithoutPin > 0 && <> ({stopsWithoutPin} of them on this route)</>}.{' '}
                    <button type="button" className="underline" onClick={() => setShowNoLocation(v => !v)}>
                      {showNoLocation ? 'Hide' : 'Show'}
                    </button>
                    {showNoLocation && (
                      <ul className="mt-2 max-h-40 overflow-y-auto space-y-0.5">
                        {noLocation.map(c => (
                          <li key={c.id} className="flex items-center justify-between gap-2">
                            <span className="truncate">{c.name}{c.customerCode ? ` (${c.customerCode})` : ''}</span>
                            {stopIds.has(c.id)
                              ? <span className="text-amber-600">on route</span>
                              : <button type="button" className="text-brand-700 underline" onClick={() => addStop(c)}>Add</button>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button type="submit" className="btn-primary"
            disabled={mutation.isPending || (!isNew && !isDirty && !stopsDirty)}>
            {mutation.isPending ? 'Saving…' : isNew ? 'Create Route' : 'Save Changes'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => router.push('/routes')}>Back</button>
          {(isDirty || stopsDirty) && !mutation.isPending && (
            <span className="self-center text-xs text-amber-600">Unsaved changes</span>
          )}
        </div>
      </form>
    </Layout>
  );
}

export default withAuth(RouteEditorPage, [], 'MOD_ROUTES', 'SFA');
