import { useEffect, useMemo, useRef, useState } from 'react';

// Google Maps map for sales routes. Route stops are drawn as large brand-teal numbered pins
// joined by a polyline in visit order; every other customer is a small grey dot.
//
// The Maps JavaScript API is loaded on demand (once per page load) using
// NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. With no key, or if Google fails to load / rejects the
// key, a notice card is rendered instead — the surrounding page keeps working.

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const BRAND   = '#237A7D';
const CALLBACK = '__sfaRouteMapInit';

// Stable default so callers that don't pass extraPins don't trigger a redraw every render.
const NO_PINS = [];

let loadPromise = null;
let authFailed  = false;
const authListeners = new Set();

function loadGoogleMaps() {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    // Google calls this global when the key is invalid / not authorised for this referrer.
    window.gm_authFailure = () => {
      authFailed = true;
      authListeners.forEach(fn => fn());
    };
    window[CALLBACK] = () => resolve(window.google.maps);
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(API_KEY)}`
      + `&callback=${CALLBACK}&loading=async&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      loadPromise = null;       // allow a retry on the next mount
      script.remove();
      reject(new Error('Could not load Google Maps'));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}

function hasPin(c) {
  return c && c.latitude != null && c.longitude != null
    && !Number.isNaN(Number(c.latitude)) && !Number.isNaN(Number(c.longitude));
}

function toLatLng(c) {
  return { lat: Number(c.latitude), lng: Number(c.longitude) };
}

function stopIcon(maps, n) {
  const label = String(n);
  const fontSize = label.length > 2 ? 11 : 14;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">
    <path d="M18 1C8.6 1 1 8.4 1 17.6 1 30 18 47 18 47s17-17 17-29.4C35 8.4 27.4 1 18 1z"
      fill="${BRAND}" stroke="#ffffff" stroke-width="2"/>
    <text x="18" y="22" text-anchor="middle" dominant-baseline="middle"
      font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700" fill="#ffffff">${label}</text>
  </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new maps.Size(36, 48),
    anchor: new maps.Point(18, 47),
  };
}

function dotIcon(maps, faint) {
  return {
    path: maps.SymbolPath.CIRCLE,
    scale: 5,
    fillColor: '#9ca3af',
    fillOpacity: faint ? 0.5 : 0.9,
    strokeColor: '#ffffff',
    strokeWeight: 1.5,
  };
}

function infoContent(c, stopNumber) {
  const root = document.createElement('div');
  root.style.cssText = 'font-family:inherit;font-size:12px;line-height:1.45;min-width:160px;max-width:240px';
  const add = (text, css) => {
    if (!text) return;
    const el = document.createElement('div');
    el.textContent = text;
    if (css) el.style.cssText = css;
    root.appendChild(el);
  };
  if (stopNumber) add(`Stop ${stopNumber}`, `color:${BRAND};font-weight:700;margin-bottom:2px`);
  add(c.name, 'font-weight:600;font-size:13px;color:#111827');
  add(c.customerCode, 'color:#6b7280;font-family:monospace');
  add(c.location, 'color:#374151');
  add(c.phone, 'color:#374151');
  return root;
}

function Notice({ height, children }) {
  return (
    <div className="flex items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 text-center"
      style={{ height }}>
      <div className="max-w-sm">
        <svg className="mx-auto mb-2 h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
        <div className="text-sm text-gray-600">{children}</div>
      </div>
    </div>
  );
}

/**
 * @param customers    every customer that may be pinned (non-stops render as grey dots)
 * @param stops        route stops in visit order (highlighted, numbered)
 * @param onPinClick   (customer, stopNumber|null) => void
 * @param fitKey       bounds are re-fitted when this value changes (and on first data load)
 * @param faintOthers  render non-stop customers extra faint
 * @param height       CSS height of the map
 * @param extraPins    optional free-standing pins: [{ id, latitude, longitude, color, title, lines?: string[] }]
 *                     (e.g. where a visit note was recorded) — drawn as coloured dots, included in "Fit"
 * @param legend       optional [{ color, label }] replacing the default stop/customer legend
 */
export default function RouteMap({
  customers = [], stops = [], onPinClick, fitKey, faintOthers = false, height = 440,
  extraPins = NO_PINS, legend,
}) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const overlaysRef  = useRef([]);
  const infoRef      = useRef(null);
  const fittedKeyRef = useRef(undefined);
  const clickRef     = useRef(onPinClick);
  clickRef.current = onPinClick;

  const [status, setStatus] = useState(API_KEY ? 'loading' : 'no-key');

  useEffect(() => {
    if (!API_KEY) return undefined;
    let cancelled = false;
    const onAuthFail = () => { if (!cancelled) setStatus('auth-failed'); };
    authListeners.add(onAuthFail);
    if (authFailed) setStatus('auth-failed');
    loadGoogleMaps()
      .then(() => { if (!cancelled && !authFailed) setStatus('ready'); })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; authListeners.delete(onAuthFail); };
  }, []);

  // Create the map once the API is ready.
  useEffect(() => {
    if (status !== 'ready' || !containerRef.current || mapRef.current) return;
    const maps = window.google.maps;
    mapRef.current = new maps.Map(containerRef.current, {
      center: { lat: 7.8731, lng: 80.7718 },   // Sri Lanka — replaced by fitBounds once pins exist
      zoom: 7,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      clickableIcons: false,
    });
    infoRef.current = new maps.InfoWindow();
  }, [status]);

  // Drop the map when unmounting (the DOM node goes away with it).
  useEffect(() => () => {
    overlaysRef.current.forEach(o => o.setMap(null));
    overlaysRef.current = [];
    mapRef.current = null;
    fittedKeyRef.current = undefined;
  }, []);

  const stopIds = useMemo(() => new Set(stops.map(s => s.id)), [stops]);
  const pinnedStops = useMemo(() => stops.map((s, i) => ({ c: s, n: i + 1 })).filter(x => hasPin(x.c)), [stops]);
  const pinnedOthers = useMemo(() => customers.filter(c => hasPin(c) && !stopIds.has(c.id)), [customers, stopIds]);
  const pinnedExtras = useMemo(() => extraPins.filter(hasPin), [extraPins]);

  // (Re)draw pins and the route line whenever data changes.
  useEffect(() => {
    const map = mapRef.current;
    if (status !== 'ready' || !map) return;
    const maps = window.google.maps;

    overlaysRef.current.forEach(o => o.setMap(null));
    overlaysRef.current = [];

    const openInfo = (marker, c, n) => {
      infoRef.current.setContent(infoContent(c, n));
      infoRef.current.open({ map, anchor: marker });
    };

    pinnedOthers.forEach(c => {
      const m = new maps.Marker({
        map, position: toLatLng(c), icon: dotIcon(maps, faintOthers), title: c.name, zIndex: 1,
      });
      m.addListener('click', () => { openInfo(m, c, null); clickRef.current?.(c, null); });
      overlaysRef.current.push(m);
    });

    if (pinnedStops.length > 1) {
      overlaysRef.current.push(new maps.Polyline({
        map,
        path: pinnedStops.map(x => toLatLng(x.c)),
        strokeColor: BRAND,
        strokeOpacity: 0.85,
        strokeWeight: 3,
        zIndex: 5,
        icons: [{
          icon: { path: maps.SymbolPath.FORWARD_OPEN_ARROW, scale: 2.5, strokeColor: BRAND },
          offset: '50%', repeat: '120px',
        }],
      }));
    }

    pinnedStops.forEach(({ c, n }) => {
      const m = new maps.Marker({
        map, position: toLatLng(c), icon: stopIcon(maps, n), title: `${n}. ${c.name}`,
        zIndex: 1000 + (pinnedStops.length - n),
      });
      m.addListener('click', () => { openInfo(m, c, n); clickRef.current?.(c, n); });
      overlaysRef.current.push(m);
    });

    pinnedExtras.forEach(p => {
      const m = new maps.Marker({
        map, position: toLatLng(p), title: p.title || '', zIndex: 2000,
        icon: {
          path: maps.SymbolPath.CIRCLE, scale: 9, fillColor: p.color || BRAND, fillOpacity: 1,
          strokeColor: '#ffffff', strokeWeight: 2.5,
        },
      });
      m.addListener('click', () => {
        const root = document.createElement('div');
        root.style.cssText = 'font-family:inherit;font-size:12px;line-height:1.45;min-width:160px;max-width:240px';
        [p.title, ...(p.lines || [])].filter(Boolean).forEach((t, i) => {
          const el = document.createElement('div');
          el.textContent = t;
          el.style.cssText = i === 0 ? 'font-weight:600;font-size:13px;color:#111827' : 'color:#374151';
          root.appendChild(el);
        });
        infoRef.current.setContent(root);
        infoRef.current.open({ map, anchor: m });
      });
      overlaysRef.current.push(m);
    });

    const key = fitKey === undefined ? '__default' : String(fitKey);
    const hasData = pinnedStops.length > 0 || pinnedOthers.length > 0 || pinnedExtras.length > 0;
    if (hasData && fittedKeyRef.current !== key) {
      fittedKeyRef.current = key;
      fit();
    }
  }, [status, pinnedStops, pinnedOthers, pinnedExtras, faintOthers, fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function fit() {
    const map = mapRef.current;
    if (!map) return;
    const maps = window.google.maps;
    const pts = pinnedStops.length > 0
      ? [...pinnedStops.map(x => x.c), ...pinnedExtras]
      : [...pinnedOthers, ...pinnedExtras];
    if (pts.length === 0) return;
    if (pts.length === 1) {
      map.setCenter(toLatLng(pts[0]));
      map.setZoom(15);
      return;
    }
    const bounds = new maps.LatLngBounds();
    pts.forEach(c => bounds.extend(toLatLng(c)));
    map.fitBounds(bounds, 48);
  }

  if (status === 'no-key') {
    return (
      <Notice height={height}>
        <p className="font-medium text-gray-700">Map unavailable</p>
        <p className="mt-1">Add <code className="rounded bg-gray-200 px-1 text-xs">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to
          show the map (in <code className="text-xs">.env.local</code>, then restart / rebuild the admin app).</p>
      </Notice>
    );
  }
  if (status === 'error' || status === 'auth-failed') {
    return (
      <Notice height={height}>
        <p className="font-medium text-gray-700">Map unavailable</p>
        <p className="mt-1">
          {status === 'auth-failed'
            ? 'Google Maps rejected the API key. Check NEXT_PUBLIC_GOOGLE_MAPS_API_KEY and its allowed referrers.'
            : 'Google Maps could not be loaded. Check your connection and NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.'}
        </p>
      </Notice>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-200" style={{ height }}>
      <div ref={containerRef} className="h-full w-full" />
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 text-sm text-gray-400">
          Loading map…
        </div>
      )}
      {status === 'ready' && (pinnedStops.length > 0 || pinnedOthers.length > 0 || pinnedExtras.length > 0) && (
        <button type="button" onClick={fit}
          className="absolute left-2 top-2 rounded-md bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow ring-1 ring-black/10 hover:bg-gray-50">
          {pinnedStops.length > 0 ? 'Fit route' : 'Fit all'}
        </button>
      )}
      {status === 'ready' && legend && (
        <div className="absolute bottom-2 left-2 flex items-center gap-3 rounded-md bg-white/95 px-2.5 py-1 text-[11px] text-gray-600 shadow ring-1 ring-black/10">
          {legend.map(l => (
            <span key={l.label} className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: l.color }} /> {l.label}
            </span>
          ))}
        </div>
      )}
      {status === 'ready' && !legend && (
        <div className="absolute bottom-2 left-2 flex items-center gap-3 rounded-md bg-white/95 px-2.5 py-1 text-[11px] text-gray-600 shadow ring-1 ring-black/10">
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: BRAND }} /> Route stop
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-400" /> Other customer
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Shared loader state for other map components (e.g. TrackingMap) so the Maps script is
 * loaded once per page and key/auth failures are handled the same way as RouteMap.
 * @returns 'no-key' | 'loading' | 'ready' | 'error' | 'auth-failed'
 */
function useGoogleMaps() {
  const [status, setStatus] = useState(API_KEY ? 'loading' : 'no-key');
  useEffect(() => {
    if (!API_KEY) return undefined;
    let cancelled = false;
    const onAuthFail = () => { if (!cancelled) setStatus('auth-failed'); };
    authListeners.add(onAuthFail);
    if (authFailed) setStatus('auth-failed');
    loadGoogleMaps()
      .then(() => { if (!cancelled && !authFailed) setStatus('ready'); })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; authListeners.delete(onAuthFail); };
  }, []);
  return status;
}

/** The "Map unavailable" card RouteMap shows, for a non-ready useGoogleMaps() status. */
function MapUnavailable({ status, height = 440 }) {
  return (
    <Notice height={height}>
      <p className="font-medium text-gray-700">Map unavailable</p>
      <p className="mt-1">
        {status === 'no-key'
          ? <>Add <code className="rounded bg-gray-200 px-1 text-xs">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to
              show the map (in <code className="text-xs">.env.local</code>, then restart / rebuild the admin app).</>
          : status === 'auth-failed'
            ? 'Google Maps rejected the API key. Check NEXT_PUBLIC_GOOGLE_MAPS_API_KEY and its allowed referrers.'
            : 'Google Maps could not be loaded. Check your connection and NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.'}
      </p>
    </Notice>
  );
}

export { hasPin, BRAND as ROUTE_BRAND, useGoogleMaps, MapUnavailable };
