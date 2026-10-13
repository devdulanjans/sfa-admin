import { useEffect, useRef } from 'react';
import { useGoogleMaps, MapUnavailable, ROUTE_BRAND } from './RouteMap';

// Google map for Field Tracking: free-form markers (initials badges, numbered pins, dots) and
// polylines. Shares the Maps script loader with RouteMap.

const NO_ITEMS = [];

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[ch]));
}

function svgIcon(maps, svg, w, h, ax, ay) {
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new maps.Size(w, h),
    anchor: new maps.Point(ax, ay),
  };
}

function markerIcon(maps, m) {
  const color = m.color || ROUTE_BRAND;
  if (m.kind === 'badge') {
    const text = escapeXml(m.text || '');
    const op = m.faded ? 0.55 : 1;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
      <circle cx="18" cy="18" r="16" fill="${color}" fill-opacity="${op}" stroke="#ffffff" stroke-width="2.5"/>
      <text x="18" y="19" text-anchor="middle" dominant-baseline="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="700" fill="#ffffff">${text}</text>
    </svg>`;
    return svgIcon(maps, svg, 36, 36, 18, 18);
  }
  if (m.kind === 'number') {
    const label = escapeXml(m.text ?? '');
    const fontSize = String(m.text ?? '').length > 2 ? 10 : 13;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 36 48">
      <path d="M18 1C8.6 1 1 8.4 1 17.6 1 30 18 47 18 47s17-17 17-29.4C35 8.4 27.4 1 18 1z"
        fill="${color}" stroke="#ffffff" stroke-width="2"/>
      <text x="18" y="22" text-anchor="middle" dominant-baseline="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="${fontSize * 1.2}" font-weight="700" fill="#ffffff">${label}</text>
    </svg>`;
    return svgIcon(maps, svg, 30, 40, 15, 39);
  }
  return {
    path: maps.SymbolPath.CIRCLE,
    scale: m.size || 8,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 2.5,
  };
}

function infoContent(m) {
  const root = document.createElement('div');
  root.style.cssText = 'font-family:inherit;font-size:12px;line-height:1.5;min-width:170px;max-width:260px';
  const add = (text, css) => {
    if (!text) return;
    const el = document.createElement('div');
    el.textContent = text;
    if (css) el.style.cssText = css;
    root.appendChild(el);
  };
  add(m.kicker, `color:${m.color || ROUTE_BRAND};font-weight:700;margin-bottom:2px`);
  add(m.title, 'font-weight:600;font-size:13px;color:#111827');
  (m.lines || []).forEach(l => add(l, 'color:#374151'));
  return root;
}

/**
 * @param markers  [{ id, lat, lng, kind: 'badge'|'number'|'dot', text?, color?, size?, faded?, zIndex?,
 *                    kicker?, title, lines?: string[] }]
 * @param lines    [{ id, path: [{lat,lng}], color?, dashed?, arrows?, weight?, opacity? }]
 * @param fitKey   bounds are re-fitted when this changes (and on first data for a key)
 * @param focus    { id, nonce } — pan/zoom to that marker and open its info window
 * @param onMarkerClick (id) => void
 * @param legend   [{ color, label }]
 */
export default function TrackingMap({
  markers = NO_ITEMS, lines = NO_ITEMS, fitKey, focus, onMarkerClick, legend, height = 520,
}) {
  const status       = useGoogleMaps();
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const infoRef      = useRef(null);
  const overlaysRef  = useRef([]);
  const markerByIdRef = useRef(new Map());
  const openIdRef    = useRef(null);
  const fittedKeyRef = useRef(undefined);
  const dataRef      = useRef({ markers, lines });
  dataRef.current = { markers, lines };
  const clickRef = useRef(onMarkerClick);
  clickRef.current = onMarkerClick;

  useEffect(() => {
    if (status !== 'ready' || !containerRef.current || mapRef.current) return;
    const maps = window.google.maps;
    mapRef.current = new maps.Map(containerRef.current, {
      center: { lat: 7.8731, lng: 80.7718 },   // Sri Lanka — replaced by fitBounds once data exists
      zoom: 7,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      clickableIcons: false,
    });
    infoRef.current = new maps.InfoWindow();
    infoRef.current.addListener('closeclick', () => { openIdRef.current = null; });
  }, [status]);

  useEffect(() => () => {
    overlaysRef.current.forEach(o => o.setMap(null));
    overlaysRef.current = [];
    markerByIdRef.current = new Map();
    mapRef.current = null;
    fittedKeyRef.current = undefined;
  }, []);

  function openInfo(id) {
    const map = mapRef.current;
    const entry = markerByIdRef.current.get(id);
    if (!map || !entry) return;
    openIdRef.current = id;
    infoRef.current.setContent(infoContent(entry.data));
    infoRef.current.open({ map, anchor: entry.marker });
  }

  function fit() {
    const map = mapRef.current;
    if (!map) return;
    const maps = window.google.maps;
    const pts = [
      ...dataRef.current.markers.map(m => ({ lat: m.lat, lng: m.lng })),
      ...dataRef.current.lines.flatMap(l => l.path),
    ].filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    if (pts.length === 0) return;
    if (pts.length === 1) {
      map.setCenter(pts[0]);
      map.setZoom(15);
      return;
    }
    const bounds = new maps.LatLngBounds();
    pts.forEach(p => bounds.extend(p));
    map.fitBounds(bounds, 48);
  }

  // (Re)draw whenever data changes.
  useEffect(() => {
    const map = mapRef.current;
    if (status !== 'ready' || !map) return;
    const maps = window.google.maps;

    overlaysRef.current.forEach(o => o.setMap(null));
    overlaysRef.current = [];
    markerByIdRef.current = new Map();

    lines.forEach(l => {
      if (!l.path || l.path.length < 2) return;
      const color = l.color || ROUTE_BRAND;
      const icons = [];
      if (l.dashed) {
        icons.push({ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, strokeColor: color, scale: 3 }, offset: '0', repeat: '14px' });
      }
      if (l.arrows) {
        icons.push({ icon: { path: maps.SymbolPath.FORWARD_OPEN_ARROW, scale: 2.2, strokeColor: color }, offset: '50%', repeat: '140px' });
      }
      overlaysRef.current.push(new maps.Polyline({
        map,
        path: l.path,
        strokeColor: color,
        strokeOpacity: l.dashed ? 0 : (l.opacity ?? 0.85),
        strokeWeight: l.weight ?? 4,
        zIndex: 5,
        icons,
      }));
    });

    markers.forEach(m => {
      if (!Number.isFinite(m.lat) || !Number.isFinite(m.lng)) return;
      const marker = new maps.Marker({
        map, position: { lat: m.lat, lng: m.lng }, icon: markerIcon(maps, m),
        title: m.title || '', zIndex: m.zIndex ?? 100,
      });
      marker.addListener('click', () => { openInfo(m.id); clickRef.current?.(m.id); });
      markerByIdRef.current.set(m.id, { marker, data: m });
      overlaysRef.current.push(marker);
    });

    // Keep an open info window open (with fresh content) across data refreshes.
    if (openIdRef.current) {
      if (markerByIdRef.current.has(openIdRef.current)) openInfo(openIdRef.current);
      else { infoRef.current.close(); openIdRef.current = null; }
    }

    const key = fitKey === undefined ? '__default' : String(fitKey);
    const hasData = markers.length > 0 || lines.some(l => l.path?.length);
    if (hasData && fittedKeyRef.current !== key) {
      fittedKeyRef.current = key;
      fit();
    }
  }, [status, markers, lines, fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pan/zoom to a marker on request.
  useEffect(() => {
    const map = mapRef.current;
    if (status !== 'ready' || !map || !focus?.id) return;
    const entry = markerByIdRef.current.get(focus.id);
    if (!entry) return;
    map.panTo({ lat: entry.data.lat, lng: entry.data.lng });
    if ((map.getZoom() ?? 0) < 16) map.setZoom(16);
    openInfo(focus.id);
  }, [status, focus?.id, focus?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'no-key' || status === 'error' || status === 'auth-failed') {
    return <MapUnavailable status={status} height={height} />;
  }

  const hasData = markers.length > 0 || lines.some(l => l.path?.length);
  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-200" style={{ height }}>
      <div ref={containerRef} className="h-full w-full" />
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 text-sm text-gray-400">
          Loading map…
        </div>
      )}
      {status === 'ready' && hasData && (
        <button type="button" onClick={fit}
          className="absolute left-2 top-2 rounded-md bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow ring-1 ring-black/10 hover:bg-gray-50">
          Fit all
        </button>
      )}
      {status === 'ready' && legend && legend.length > 0 && (
        <div className="absolute bottom-2 left-2 flex flex-wrap items-center gap-3 rounded-md bg-white/95 px-2.5 py-1 text-[11px] text-gray-600 shadow ring-1 ring-black/10">
          {legend.map(l => (
            <span key={l.label} className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: l.color }} /> {l.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
