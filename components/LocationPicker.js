import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';

// Sri Lanka — used only to frame the map when no point has been picked yet.
const DEFAULT_CENTER = [7.8731, 80.7718];
const DEFAULT_ZOOM   = 7;
const PICKED_ZOOM    = 16;

const round = (n) => Math.round(n * 1e7) / 1e7; // matches NUMERIC(10,7) on the backend

const toNum = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Click the map (or drag the pin) to pick coordinates, use the browser's current location,
 * or type them in. `onChange(lat, lng)` receives numbers, or (null, null) when cleared.
 */
export default function LocationPicker({ latitude, longitude, onChange, height = 260 }) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const markerRef    = useRef(null);
  const leafletRef   = useRef(null);
  const onChangeRef  = useRef(onChange);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState(null);

  onChangeRef.current = onChange;

  const lat = toNum(latitude);
  const lng = toNum(longitude);

  // Leaflet touches `window` on import, so it's loaded client-side only.
  useEffect(() => {
    let cancelled = false;
    import('leaflet').then((mod) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const L = mod.default ?? mod;
      leafletRef.current = L;
      const map = L.map(containerRef.current).setView(
        lat !== null && lng !== null ? [lat, lng] : DEFAULT_CENTER,
        lat !== null && lng !== null ? PICKED_ZOOM : DEFAULT_ZOOM,
      );
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);
      map.on('click', (e) => onChangeRef.current?.(round(e.latlng.lat), round(e.latlng.lng)));
      mapRef.current = map;
      syncMarker(lat, lng, false);
      // The map is often mounted inside a modal that's still animating in.
      setTimeout(() => map.invalidateSize(), 150);
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    syncMarker(lat, lng, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  function syncMarker(la, ln, pan) {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (la === null || ln === null) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      // divIcon avoids Leaflet's default marker PNGs, which bundlers don't resolve.
      const icon = L.divIcon({
        className: '',
        html: '<div style="width:18px;height:18px;border-radius:50%;background:#dc2626;border:3px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.35),0 2px 6px rgba(0,0,0,.35)"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      markerRef.current = L.marker([la, ln], { icon, draggable: true }).addTo(map);
      markerRef.current.on('dragend', (e) => {
        const p = e.target.getLatLng();
        onChangeRef.current?.(round(p.lat), round(p.lng));
      });
    } else {
      markerRef.current.setLatLng([la, ln]);
    }
    if (pan) map.setView([la, ln], Math.max(map.getZoom(), PICKED_ZOOM));
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setGeoError('Location is not supported by this browser');
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChange(round(pos.coords.latitude), round(pos.coords.longitude));
      },
      (err) => {
        setLocating(false);
        setGeoError(err.message || 'Could not get current location');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="space-y-2">
      <div ref={containerRef} style={{ height }} className="w-full rounded-lg border border-gray-200 overflow-hidden z-0" />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Latitude</label>
          <input type="number" step="any" min={-90} max={90} className="input"
            value={latitude ?? ''} placeholder="e.g. 6.9271"
            onChange={(e) => onChange(toNum(e.target.value), lng)} />
        </div>
        <div>
          <label className="label">Longitude</label>
          <input type="number" step="any" min={-180} max={180} className="input"
            value={longitude ?? ''} placeholder="e.g. 79.8612"
            onChange={(e) => onChange(lat, toNum(e.target.value))} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button type="button" className="btn-secondary text-xs" onClick={useMyLocation} disabled={locating}>
          {locating ? 'Locating…' : 'Use my current location'}
        </button>
        {lat !== null && lng !== null && (
          <>
            <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer"
              className="text-brand-600 hover:underline">Open in Google Maps</a>
            <button type="button" className="text-gray-500 hover:text-red-600" onClick={() => onChange(null, null)}>
              Clear
            </button>
          </>
        )}
        <span className="text-gray-400">Click the map or drag the pin to set the location.</span>
      </div>
      {geoError && <p className="text-red-500 text-xs">{geoError}</p>}
    </div>
  );
}
