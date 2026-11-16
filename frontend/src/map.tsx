/**
 * INZORA TERRA — TerrainMap
 * Zero-dependency slippy map for the Operational Overview panel.
 * Renders real Web-Mercator raster tiles (topographic, satellite or dark
 * cartography), supports drag-pan and anchored wheel/button zoom, and
 * overlays georeferenced region anchors + incident markers.
 * No 3D, no fake data — tile providers are attributed in the corner chip.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import type { RegionAnchor } from './api';

/* ------------------------------------------------------------------ */
/* Web Mercator helpers (EPSG:3857 tile space, 256px tiles)             */
/* ------------------------------------------------------------------ */

const TILE = 256;
const MIN_ZOOM = 3;

function lonToWorldX(lon: number, z: number): number {
  return ((lon + 180) / 360) * TILE * 2 ** z;
}

function latToWorldY(lat: number, z: number): number {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** z;
}

function worldXToLon(x: number, z: number): number {
  return (x / (TILE * 2 ** z)) * 360 - 180;
}

function worldYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / (TILE * 2 ** z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/* ------------------------------------------------------------------ */
/* Tile layers (free, attribution-required providers)                   */
/* ------------------------------------------------------------------ */

type LayerId = 'terrain' | 'satellite' | 'dark';

interface LayerDef {
  id: LayerId;
  label: string;
  maxZoom: number;
  subdomains: string;
  url: (sub: string, x: number, y: number, z: number) => string;
  attribution: string;
}

const LAYERS: Record<LayerId, LayerDef> = {
  terrain: {
    id: 'terrain',
    label: 'Terrain',
    maxZoom: 17,
    subdomains: 'abc',
    url: (sub, x, y, z) => `https://${sub}.tile.opentopomap.org/${z}/${x}/${y}.png`,
    attribution: '© OpenStreetMap contributors · © OpenTopoMap (CC-BY-SA)',
  },
  satellite: {
    id: 'satellite',
    label: 'Satellite',
    maxZoom: 19,
    subdomains: '',
    url: (_sub, x, y, z) =>
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
  },
  dark: {
    id: 'dark',
    label: 'Dark',
    maxZoom: 19,
    subdomains: 'abcd',
    url: (sub, x, y, z) => `https://${sub}.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`,
    attribution: '© OpenStreetMap contributors · © CARTO',
  },
};

function tileUrl(layer: LayerDef, x: number, y: number, z: number): string {
  const sub =
    layer.subdomains.length > 0
      ? layer.subdomains[Math.abs(x + y) % layer.subdomains.length]
      : '';
  return layer.url(sub, ((x % 2 ** z) + 2 ** z) % 2 ** z, y, z);
}

/* ------------------------------------------------------------------ */
/* Public types                                                        */
/* ------------------------------------------------------------------ */

export interface MapMarker {
  id: string;
  lat: number;
  lon: number;
  label: string;
  sublabel?: string;
  tone: 'red' | 'orange' | 'blue' | 'green' | 'muted';
}

export interface MapView {
  lat: number;
  lon: number;
  zoom: number;
}

/** Tamil Nadu operational overview (bbox ≈ 76–80.4°E, 8.1–13.5°N). */
export const TN_OVERVIEW: MapView = { lat: 10.85, lon: 78.3, zoom: 7 };

interface TerrainMapProps {
  /** Real geographical reference anchors (backend/geography.py mirror). */
  anchors?: RegionAnchor[];
  /** Georeferenced incident markers (only real mission matches are passed in). */
  incidents?: MapMarker[];
  /** View used by the reset button and the initial render. */
  defaultView?: MapView;
  /** Auto-centre once per unique focus id (e.g. latest georeferenced mission). */
  focus?: { id: string; lat: number; lon: number; zoom?: number } | null;
  /** One-line status note rendered in the bottom-left overlay. */
  note?: string;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function TerrainMap({
  anchors = [],
  incidents = [],
  defaultView = TN_OVERVIEW,
  focus = null,
  note,
}: TerrainMapProps) {
  const [view, setView] = useState<MapView>(defaultView);
  const [layerId, setLayerId] = useState<LayerId>('terrain');
  const [dragging, setDragging] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; start: MapView } | null>(null);
  const focusKey = focus?.id ?? '';
  const lastFocusRef = useRef('');

  const layer = LAYERS[layerId];

  /* ---- viewport size (panel is flexible) ---- */
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---- auto-focus once per unique focus id ---- */
  useEffect(() => {
    if (focus && focus.id && focus.id !== lastFocusRef.current) {
      lastFocusRef.current = focus.id;
      setView({ lat: focus.lat, lon: focus.lon, zoom: focus.zoom ?? 11 });
    }
  }, [focusKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- non-passive wheel zoom (anchored at cursor) ---- */
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setView((v) => {
        const max = LAYERS[layerId].maxZoom;
        const z1 = clamp(v.zoom + (e.deltaY < 0 ? 1 : -1), MIN_ZOOM, max);
        if (z1 === v.zoom) return v;
        const rect = el.getBoundingClientRect();
        const mx = e.clientX - rect.left - rect.width / 2;
        const my = e.clientY - rect.top - rect.height / 2;
        const geoLon = worldXToLon(lonToWorldX(v.lon, v.zoom) + mx, v.zoom);
        const geoLat = worldYToLat(latToWorldY(v.lat, v.zoom) + my, v.zoom);
        const px1 = lonToWorldX(geoLon, z1);
        const py1 = latToWorldY(geoLat, z1);
        return {
          lat: clamp(worldYToLat(py1 - my, z1), -85, 85),
          lon: worldXToLon(px1 - mx, z1),
          zoom: z1,
        };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [layerId]);

  /* ---- drag pan ---- */
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    viewportRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, start: view };
    setDragging(true);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const z = d.start.zoom;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    setView({
      lon: worldXToLon(lonToWorldX(d.start.lon, z) - dx, z),
      lat: clamp(worldYToLat(latToWorldY(d.start.lat, z) - dy, z), -85, 85),
      zoom: z,
    });
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
  };

  /* ---- anchored zoom around viewport centre ---- */
  const zoomBy = (dz: number) => {
    setView((v) => {
      const z1 = clamp(v.zoom + dz, MIN_ZOOM, layer.maxZoom);
      return z1 === v.zoom ? v : { ...v, zoom: z1 };
    });
  };

  const zoomAnchored = (mx: number, my: number, dz: number) => {
    setView((v) => {
      const z1 = clamp(v.zoom + dz, MIN_ZOOM, layer.maxZoom);
      if (z1 === v.zoom) return v;
      const geoLon = worldXToLon(lonToWorldX(v.lon, v.zoom) + mx, v.zoom);
      const geoLat = worldYToLat(latToWorldY(v.lat, v.zoom) + my, v.zoom);
      const px1 = lonToWorldX(geoLon, z1);
      const py1 = latToWorldY(geoLat, z1);
      return {
        lat: clamp(worldYToLat(py1 - my, z1), -85, 85),
        lon: worldXToLon(px1 - mx, z1),
        zoom: z1,
      };
    });
  };

  const onDoubleClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoomAnchored(e.clientX - rect.left - rect.width / 2, e.clientY - rect.top - rect.height / 2, 1);
  };

  /* ---- tile grid ---- */
  const { tiles, cx, cy } = useMemo(() => {
    const w = size.w || 0;
    const h = size.h || 0;
    const z = view.zoom;
    const n = 2 ** z;
    const ccx = lonToWorldX(view.lon, z);
    const ccy = latToWorldY(view.lat, z);
    const left = ccx - w / 2;
    const top = ccy - h / 2;
    const x0 = Math.floor(left / TILE) - 1;
    const x1 = Math.floor((left + w) / TILE) + 1;
    const y0 = Math.floor(top / TILE) - 1;
    const y1 = Math.floor((top + h) / TILE) + 1;
    const list: Array<{ key: string; x: number; y: number; url: string }> = [];
    for (let x = x0; x <= x1; x += 1) {
      for (let y = Math.max(y0, 0); y <= Math.min(y1, n - 1); y += 1) {
        list.push({
          key: `${layerId}-${z}-${x}-${y}`,
          x: x * TILE - left,
          y: y * TILE - top,
          url: tileUrl(layer, x, y, z),
        });
      }
    }
    return { tiles: list, cx: ccx, cy: ccy };
  }, [view, size, layerId, layer]);

  const project = (lat: number, lon: number): { x: number; y: number } => ({
    x: lonToWorldX(lon, view.zoom) - cx,
    y: latToWorldY(lat, view.zoom) - cy,
  });

  /* ---- scale bar ---- */
  const metersPerPx = (156543.03392 * Math.cos((view.lat * Math.PI) / 180)) / 2 ** view.zoom;
  const scaleBar = useMemo(() => {
    const nice = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000];
    const best = nice.filter((m) => m / metersPerPx <= 120).pop() ?? 10;
    const px = Math.max(30, Math.round(best / metersPerPx));
    const label = best >= 1000 ? `${(best / 1000).toLocaleString()} km` : `${best} m`;
    return { px, label };
  }, [metersPerPx]);

  const fmtCoord = (v: number, pos: string, neg: string) =>
    `${Math.abs(v).toFixed(4)}° ${v >= 0 ? pos : neg}`;

  const markers = useMemo(
    () => [
      ...anchors.map((a) => ({ kind: 'anchor' as const, a })),
      ...incidents.map((i) => ({ kind: 'incident' as const, i })),
    ],
    [anchors, incidents]
  );

  return (
    <div className={`terrain-map${dragging ? ' terrain-map-dragging' : ''}`}>
      <div
        ref={viewportRef}
        className="terrain-viewport"
        role="application"
        aria-label="Operational terrain map"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={onDoubleClick}
      >
        <div className="terrain-tiles" aria-hidden="true">
          {tiles.map((t) => (
            <img
              key={t.key}
              className="terrain-tile"
              src={t.url}
              alt=""
              draggable={false}
              style={{ left: t.x, top: t.y }}
            />
          ))}
        </div>

        <div
          className={`terrain-markers${view.zoom < 9 ? ' terrain-markers-out' : ''}`}
          aria-hidden="true"
        >
          {markers.map((m) => {
            const p =
              m.kind === 'anchor'
                ? project(m.a.lat, m.a.lon)
                : project(m.i.lat, m.i.lon);
            if (p.x < -60 || p.y < -60 || p.x > size.w + 60 || p.y > size.h + 60) return null;
            if (m.kind === 'anchor') {
              return (
                <div
                  key={`anchor-${m.a.id}`}
                  className="map-zone"
                  style={{ left: p.x, top: p.y }}
                  title={`${m.a.name} — ${m.a.district} district · ${m.a.hazardType} zone (${m.a.terrain} reference anchor)`}
                >
                  <span className="map-zone-symbol">{m.a.hazardSymbol}</span>
                  <span className="map-zone-label">
                    <strong>{m.a.hazardType}</strong>
                    {m.a.name}
                  </span>
                </div>
              );
            }
            return (
              <div
                key={`incident-${m.i.id}`}
                className={`map-incident marker-${m.i.tone}`}
                style={{ left: p.x, top: p.y }}
                title={`${m.i.label}${m.i.sublabel ? ` — ${m.i.sublabel}` : ''}`}
              >
                <span className="map-incident-pulse" />
                <span className="map-incident-dot" />
              </div>
            );
          })}
        </div>

        {/* layer switcher */}
        <div
          className="terrain-layer-switch"
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {(Object.keys(LAYERS) as LayerId[]).map((id) => (
            <button
              key={id}
              type="button"
              className={`map-btn map-btn-sm${layerId === id ? ' map-btn-active' : ''}`}
              aria-pressed={layerId === id}
              title={`${LAYERS[id].label} tiles (max Z${LAYERS[id].maxZoom})`}
              onClick={() => {
                setLayerId(id);
                // Clamp zoom to the new layer's native max to avoid 404 tiles.
                setView((v) => ({ ...v, zoom: Math.min(v.zoom, LAYERS[id].maxZoom) }));
              }}
            >
              {LAYERS[id].label}
            </button>
          ))}
        </div>

        {/* zoom controls */}
        <div
          className="terrain-zoom"
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <button
            className="map-btn"
            type="button"
            aria-label="Zoom in"
            disabled={view.zoom >= layer.maxZoom}
            onClick={() => zoomBy(1)}
          >
            +
          </button>
          <button
            className="map-btn"
            type="button"
            aria-label="Zoom out"
            disabled={view.zoom <= MIN_ZOOM}
            onClick={() => zoomBy(-1)}
          >
            −
          </button>
          <button
            className="map-btn"
            type="button"
            aria-label="Reset view to Tamil Nadu overview"
            title="Reset view"
            onClick={() => setView(defaultView)}
          >
            ⌂
          </button>
        </div>

        {/* bottom-left telemetry: coords, scale, note */}
        <div className="terrain-overlay-left">
          <span className="terrain-readout">
            {fmtCoord(view.lat, 'N', 'S')} · {fmtCoord(view.lon, 'E', 'W')} · Z{view.zoom}
          </span>
          <span className="terrain-scalebar">
            <span style={{ width: scaleBar.px }} />
            {scaleBar.label}
          </span>
          {note && <span className="terrain-note">{note}</span>}
        </div>

        {/* attribution (license requirement) */}
        <span className="terrain-attribution">{layer.attribution}</span>
      </div>
    </div>
  );
}
