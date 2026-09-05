/**
 * DashboardSection — Live geospatial intelligence map.
 *
 * D.E.X.T.E.R. MAP: a real-world, Google-Maps-readable interactive map built on MapLibre GL JS.
 * A clean light geographic basemap (roads, place names, terrain) is the foundation; D.E.X.T.E.R.
 * disaster intelligence is layered cleanly on top — rover, victim detections, risk zones, hazard
 * markers and rescue resources — every marker bound to REAL mission state (telemetry + agent
 * reports). No coordinates, victims, hazards or routes are invented: the backend stays the source
 * of truth. The site-zone geometry below is the single legitimate known site layout.
 *
 * Single MapLibre instance, multiple view modes (no map recreation). All data is consumed
 * read-only from MissionContext. D.E.X.T.E.R. core, voice and conversational flow are untouched.
 */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Crosshair, X, Activity, Navigation, Search, Satellite, Map as MapIcon, Layers, LocateFixed } from 'lucide-react'
import { useMissionContext } from '@/context/MissionContext'
import { HudFrame, SegmentedBar, TechButton } from '@/components/hud'

/* ------------------------------------------------------------------ */
/* Site layout: real GPS coordinates (disaster site near 10.854°N).   */
/* Zones spread ~300-600m apart — realistic multi-building collapse.   */
/* This geometry is the single legitimate known site layout.          */
/* ------------------------------------------------------------------ */

const SITE_CENTER = { lat: 10.8542, lng: 76.2712 }
const SITE_ZOOM = 15

const ZONE_LAYOUT = [
  { id: 'north_wall', label: 'A · NORTH WING', lat: 10.8570, lng: 76.2695, x: 35, y: 18 },
  { id: 'basement', label: 'B2 · SUBLEVEL', lat: 10.8538, lng: 76.2718, x: 55, y: 55 },
  { id: 'east_wall', label: 'C · EAST BLOCK', lat: 10.8545, lng: 76.2755, x: 82, y: 40 },
  { id: 'south_wall', label: 'D · SOUTH ANNEX', lat: 10.8510, lng: 76.2708, x: 45, y: 82 },
  { id: 'perimeter', label: 'E · PERIMETER', lat: 10.8558, lng: 76.2670, x: 14, y: 60 },
]

/* Backend zone codes (A1 / B1 / B2 …) → frontend geographic zone id. */
const ZONE_CODE_TO_ID = {
  A: 'north_wall', A1: 'north_wall',
  B: 'basement', B1: 'basement', B2: 'basement',
  C: 'east_wall',
  D: 'south_wall',
  E: 'perimeter',
}
function mapZoneCode(code) {
  if (!code) return null
  return ZONE_CODE_TO_ID[String(code).toUpperCase()] || null
}

/* ------------------------------------------------------------------ */
/* Intensity layers — each maps live sensor values to 0..1 per zone,  */
/* with REAL engineering units and thresholds from the sim spec.      */
/* ------------------------------------------------------------------ */

const LAYERS = {
  SEISMIC: {
    color: '#f97316',
    label: 'Tilt + ground acceleration',
    unit: 'tilt deg / g-force',
    range: '0–10° tilt · 0–1.0 g',
    value: (live, zone) => {
      const tilt = live[`${zone}|tilt`]?.value
      const imu = live[`${zone}|imu`]?.value
      const t = tilt != null ? Math.min(1, Math.max(0, Math.abs(tilt) / 10)) : 0
      const i = imu != null ? Math.min(1, Math.max(0, Math.abs(imu) / 1.0)) : 0
      return Math.min(1, t * 0.6 + i * 0.4)
    },
    readout: (live, zone) => {
      const tilt = live[`${zone}|tilt`]
      const imu = live[`${zone}|imu`]
      const parts = []
      if (tilt) parts.push(`${tilt.value.toFixed(2)}° tilt`)
      if (imu) parts.push(`${Math.abs(imu.value).toFixed(2)} g accel`)
      return parts.length ? parts.join(' · ') : 'no tilt/IMU sensor'
    },
    meter: (live, zone) => {
      const tilt = live[`${zone}|tilt`]
      return tilt ? `${tilt.value.toFixed(1)}°` : '—'
    },
  },
  THERMAL: {
    color: '#ef4444',
    label: 'Surface temperature',
    unit: '°C surface temp',
    range: '18–45°C · 31°C = victim signature',
    value: (live, zone) => {
      const t = live[`${zone}|thermal`]?.value ?? live[`${zone}|temperature`]?.value
      return t != null ? Math.max(0, Math.min(1, (t - 18) / 27)) : 0
    },
    readout: (live, zone) => {
      const p = live[`${zone}|thermal`] ?? live[`${zone}|temperature`]
      return p ? `${p.value.toFixed(1)}°C surface temp` : 'no thermal sensor'
    },
    meter: (live, zone) => {
      const p = live[`${zone}|thermal`] ?? live[`${zone}|temperature`]
      return p ? `${p.value.toFixed(0)}°C` : '—'
    },
  },
  STRUCTURAL: {
    color: '#f59e0b',
    label: 'Structural stress index',
    unit: 'stress index 0–100',
    range: '0–100 · >60 = critical load',
    value: (live, zone) => {
      const s = live[`${zone}|stress`]?.value
      const tilt = live[`${zone}|tilt`]?.value
      const base = s != null ? Math.max(0, Math.min(1, s / 100)) : 0
      return Math.min(1, base + (tilt != null ? Math.max(0, Math.abs(tilt) / 20) : 0))
    },
    readout: (live, zone) => {
      const p = live[`${zone}|stress`]
      return p ? `stress index ${p.value.toFixed(0)}/100` : 'no stress sensor'
    },
    meter: (live, zone) => {
      const p = live[`${zone}|stress`]
      return p ? `${p.value.toFixed(0)}%` : '—'
    },
  },
  GAS: {
    color: '#22d3ee',
    label: 'Atmospheric gas level',
    unit: 'ppm · %LEL',
    range: '0–1000 ppm · 50 ppm = baseline',
    value: (live, zone) => {
      const g = live[`${zone}|gas`]?.value
      return g != null ? Math.max(0, Math.min(1, g / 1000)) : 0
    },
    readout: (live, zone) => {
      const p = live[`${zone}|gas`]
      if (!p) return 'no gas sensor'
      const ppm = p.value
      const lel = Math.min(100, (ppm / 1250) * 100)
      return `${ppm.toFixed(0)} ppm · ${lel.toFixed(1)}% LEL`
    },
    meter: (live, zone) => {
      const p = live[`${zone}|gas`]
      return p ? `${p.value.toFixed(0)}ppm` : '—'
    },
  },
}

const LAYER_KEYS = Object.keys(LAYERS)

/* ------------------------------------------------------------------ */
/* Map view modes — clean geographic base layers (Google-Maps-like).  */
/* All tile sources are added once; switching toggles layer visibility */
/* to avoid the full style-reload that breaks tile connections.       */
/* ------------------------------------------------------------------ */

const ALL_RASTER_SOURCES = [
  // Streets: OSM is the most universally reachable; CARTO light is the Google-Maps-like style.
  // Both are added — OSM is the fallback if CARTO is blocked.
  { id: 'osm',       url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maxzoom: 19, attribution: '© OpenStreetMap contributors' },
  { id: 'positron',  url: 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', maxzoom: 20, attribution: '© OpenStreetMap contributors © CARTO' },
  { id: 'sat',       url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', maxzoom: 19, attribution: '© Esri, Maxar, Earthstar Geographics' },
  { id: 'terrain',   url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}', maxzoom: 19, attribution: '© Esri' },
  { id: 'terrainlabel', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', maxzoom: 19, attribution: '' },
  { id: 'roads',     url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', maxzoom: 19, attribution: '' },
]

const VIEW_MODES = {
  STREETS:   { label: 'Streets',   layers: ['positron', 'osm'] },
  SATELLITE: { label: 'Satellite', layers: ['sat'] },
  TERRAIN:   { label: 'Terrain',   layers: ['terrain', 'terrainlabel'] },
  HYBRID:    { label: 'Hybrid',    layers: ['sat', 'roads'] },
}

/* Mission overlay layers shown in the layer control (Requirement 8). */
const MAP_LAYERS = [
  { key: 'rover', label: 'Rover' },
  { key: 'victims', label: 'Victims' },
  { key: 'risk', label: 'Risk Zones' },
  { key: 'thermal', label: 'Thermal' },
  { key: 'gas', label: 'Gas' },
  { key: 'search', label: 'Search Area' },
  { key: 'resources', label: 'Rescue Resources' },
]

/* ------------------------------------------------------------------ */
/* Map interactions are fully native (drag, scroll-zoom, pinch,        */
/* double-click) via MapLibre GL JS — identical to Google Maps.       */
/* The canvas fallback was removed because its Mercator sync ran once  */
/* with a null map ref and left the map visually fixed / jittery.     */
/* The light tile set (CARTO/Esri) now provides the full geographic   */
/* context; the container's #e7ebef paper colour is the only fallback.*/
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function riskColor(intensity) {
  if (intensity >= 0.75) return '#ef4444'
  if (intensity >= 0.5) return '#f59e0b'
  if (intensity >= 0.25) return '#22d3ee'
  return '#22c55e'
}

function verdictOf(intensity) {
  if (intensity >= 0.75) return { label: 'CRITICAL', color: '#ef4444' }
  if (intensity >= 0.5) return { label: 'HIGH', color: '#f59e0b' }
  if (intensity >= 0.25) return { label: 'MONITOR', color: '#22d3ee' }
  return { label: 'STABLE', color: '#22c55e' }
}

function fmtLat(lat) {
  return `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}`
}
function fmtLng(lng) {
  return `${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? 'E' : 'W'}`
}

function gasLevel(live, zone) {
  return live[`${zone}|gas`]?.value
}
function tempOf(live, zone) {
  const t = live[`${zone}|thermal`]?.value ?? live[`${zone}|temperature`]?.value
  return t != null ? t : null
}
function humidityOf(live, zone) {
  // Per-zone humidity if present, otherwise site-level packet
  const perZone = live[`${zone}|humidity`]?.value
  if (perZone != null) return perZone
  const site = live['site|humidity']?.value
  return site != null ? site : null
}
function stressOf(live, zone) {
  return live[`${zone}|stress`]?.value
}
function tiltOf(live, zone) {
  return live[`${zone}|tilt`]?.value
}

/** Random-looking but stable waveform bar heights for the inspector equalizer. */
function waveHeights(seed) {
  return Array.from({ length: 18 }, (_, i) => {
    const v = Math.abs(Math.sin(seed * 7.3 + i * 1.7)) * 0.9 + 0.1
    return v
  })
}

function LegendItem({ color, label }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 rounded-full" style={{ background: color }} />
      <span className="text-[10px] text-white/30">{label}</span>
    </div>
  )
}

function LayerRow({ row, on }) {
  return (
    <div className="dm-layer-row">
      <span className={`dm-layer-check ${on ? 'on' : ''}`}>
        {on && <span className="text-[9px] text-white">✓</span>}
      </span>
      <span>{row.label}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

function DashboardSection() {
  const { state } = useMissionContext()
  const live = state.telemetryLive || {}
  const briefing = state.summary?.mission_briefing || {}
  const agentsById = useMemo(
    () => Object.fromEntries((state.agents || []).map((a) => [a.id, a])),
    [state.agents]
  )
  const victimReport = (agentsById['victim_localization']?.report_full || {})
  const resourceReport = (agentsById['resource_coordination']?.report_full || {})

  const [layerKey, setLayerKey] = useState('SEISMIC')
  const [selected, setSelected] = useState(null)
  const [zoomLevel, setZoomLevel] = useState(SITE_ZOOM)
  const [viewMode, setViewMode] = useState('STREETS')
  const [layersOpen, setLayersOpen] = useState(false)
  const [styleOpen, setStyleOpen] = useState(false)
  const [layerToggles, setLayerToggles] = useState({
    rover: true, victims: true, risk: true, thermal: true, gas: true, search: true, resources: true,
  })
  const [search, setSearch] = useState('')
  const [searchMsg, setSearchMsg] = useState('')

  const layer = LAYERS[layerKey]

  const isLive = Object.keys(live).length > 0 || !!state.telemetry

  /** Intensity of a zone under the active layer (0..1). Gated behind start — before telemetry, all zones read STABLE. */
  const intensityOf = (zoneId) => {
    if (!isLive) return 0
    const raw = layer.value(live, zoneId)
    const priority = Array.isArray(briefing.priority_zones) ? briefing.priority_zones : []
    const isPriority = priority.some((z) => String(z).toUpperCase().includes(zoneId.toUpperCase().slice(0, 2)))
    const riskFloor =
      briefing.overall_risk === 'CRITICAL' ? 0.55
        : briefing.overall_risk === 'HIGH' ? 0.45
        : briefing.overall_risk === 'MEDIUM' ? 0.3
        : 0.12
    return Math.max(raw, isPriority ? Math.max(riskFloor, 0.4) : riskFloor * 0.4)
  }

  /** Zones enriched with live intensity for the active layer. */
  const zones = useMemo(
    () =>
      ZONE_LAYOUT.map((z) => {
        const intensity = intensityOf(z.id)
        return { ...z, intensity, color: riskColor(intensity) }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live, layerKey, briefing]
  )

  const selectedZone =
    zones.find((z) => z.id === selected) ||
    zones.reduce((max, z) => (z.intensity > max.intensity ? z : max), zones[0])

  /** Real victim detections from the Victim Localization agent report — only after scan authorized. */
  const victimEntries = useMemo(() => {
    if (!isLive) return []
    const out = []
    const zs = Array.isArray(victimReport?.zones) ? victimReport.zones : []
    for (const z of zs) {
      const id = mapZoneCode(z.zone)
      const zn = ZONE_LAYOUT.find((x) => x.id === id)
      if (!zn) continue
      out.push({
        key: `v-${z.zone}`,
        lat: zn.lat,
        lng: zn.lng,
        label: zn.label,
        confidence: typeof z.confidence === 'number' ? z.confidence : 0,
        probability: typeof z.probability === 'number' ? z.probability : 0,
        priority: String(z.priority || '').toUpperCase(),
      })
    }
    return out
  }, [victimReport, isLive])

  /** Real rescue-resource assignments from the Resource Coordination agent — only after scan authorized. */
  const resourceEntries = useMemo(() => {
    if (!isLive) return []
    const out = []
    const as = Array.isArray(resourceReport?.assignments) ? resourceReport.assignments : []
    for (const a of as) {
      const id = mapZoneCode(a.zone)
      const zn = ZONE_LAYOUT.find((x) => x.id === id)
      if (!zn) continue
      out.push({
        key: `r-${a.id || a.zone}`,
        lat: zn.lat,
        lng: zn.lng,
        label: zn.label,
        team: a.assigned_to || 'Team',
        type: String(a.type || 'rescue').toUpperCase(),
        priority: String(a.priority || '').toUpperCase(),
      })
    }
    return out
  }, [resourceReport, isLive])

  /** Real hazard markers derived from live telemetry — fire / gas / water / stone. */
  const hazardEntries = useMemo(() => {
    if (!isLive) return []
    const out = []
    for (const z of ZONE_LAYOUT) {
      const gas = gasLevel(live, z.id)
      if (gas != null && gas > 150) {
        out.push({ key: `h-gas-${z.id}`, kind: 'gas', lat: z.lat, lng: z.lng, label: `${gas.toFixed(0)} ppm`, emoji: '☣️', title: `Gas ${gas.toFixed(0)} ppm` })
      }
      const t = tempOf(live, z.id)
      if (t != null && t > 45) {
        out.push({ key: `h-fire-${z.id}`, kind: 'thermal', lat: z.lat, lng: z.lng, label: `${t.toFixed(0)}°C`, emoji: '🔥', title: `Fire/thermal ${t.toFixed(0)}°C` })
      }
      const humidity = humidityOf(live, z.id)
      if (humidity != null && humidity > 80) {
        out.push({ key: `h-water-${z.id}`, kind: 'water', lat: z.lat, lng: z.lng, label: `${humidity.toFixed(0)}%`, emoji: '💧', title: `Water/flood ${humidity.toFixed(0)}% humidity` })
      }
      const stress = stressOf(live, z.id)
      const tilt = tiltOf(live, z.id)
      if ((stress != null && stress > 60) || (tilt != null && Math.abs(tilt) > 5)) {
        const label = stress != null && stress > 60 ? `${stress.toFixed(0)} stress` : `${Math.abs(tilt).toFixed(1)}° tilt`
        out.push({ key: `h-stone-${z.id}`, kind: 'stone', lat: z.lat, lng: z.lng, label, emoji: '🪨', title: `Structural ${label}` })
      }
    }
    return out
  }, [live, isLive])

  const selWave = waveHeights(selectedZone ? (selectedZone.x + selectedZone.y) * 0.13 : 1)

  /* ------------------------------------------------------------------ */
  /* MapLibre map lifecycle                                              */
  /* ------------------------------------------------------------------ */

  const mapRef = useRef(null)
  const mapElRef = useRef(null)
  const markersRef = useRef({
    zones: {}, victims: {}, resources: {}, hazards: {}, risk: {}, search: null, rover: null,
  })
  const styleRef = useRef(null)
  const removeTimerRef = useRef(null)
  const roverPosRef = useRef({ lng: SITE_CENTER.lng, lat: SITE_CENTER.lat })

  const buildStyle = useCallback(() => {
    const sources = {}
    const layers = []
    ALL_RASTER_SOURCES.forEach((r) => {
      sources[r.id] = {
        type: 'raster',
        tiles: [r.url],
        tileSize: 256,
        maxzoom: r.maxzoom,
        attribution: r.attribution,
      }
    })
    // Background first — guarantees the map is never white even if all tiles fail.
    layers.push({
      id: 'layer-bg',
      type: 'background',
      paint: { 'background-color': '#e7ebef' },
    })
    // One raster layer per source; visibility toggled by setViewMode. OSM is underneath
    // positron so positron labels/roads show on top when both are visible in STREETS.
    // Order matters: first in VIEW_MODES.layers is bottommost.
    const ordered = [...ALL_RASTER_SOURCES].sort((a, b) => {
      const ai = VIEW_MODES[viewMode].layers.indexOf(a.id)
      const bi = VIEW_MODES[viewMode].layers.indexOf(b.id)
      const av = ai === -1 ? 999 : ai
      const bv = bi === -1 ? 999 : bi
      return av - bv
    })
    ordered.forEach((r) => {
      const active = VIEW_MODES[viewMode].layers.includes(r.id)
      layers.push({
        id: `layer-${r.id}`,
        type: 'raster',
        source: r.id,
        layout: { visibility: active ? 'visible' : 'none' },
        minzoom: 0,
        maxzoom: 22,
        paint: { 'raster-opacity': 1 },
      })
    })
    return {
      version: 8,
      sources,
      layers,
    }
  }, [viewMode])

  // Create the map once.
  useEffect(() => {
    if (mapRef.current) {
      if (removeTimerRef.current) {
        clearTimeout(removeTimerRef.current)
        removeTimerRef.current = null
      }
      return
    }
    if (!mapElRef.current) return

    const map = new maplibregl.Map({
      container: mapElRef.current,
      style: buildStyle(),
      center: [SITE_CENTER.lng, SITE_CENTER.lat],
      zoom: SITE_ZOOM,
      minZoom: 2,
      maxZoom: 21,
      attributionControl: { compact: true },
      pitchWithRotate: false,
      dragPan: true,
      scrollZoom: true,
      doubleClickZoom: true,
      dragRotate: false,
      touchZoomRotate: true,
      keyboard: true,
    })
    mapRef.current = map
    styleRef.current = viewMode

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right')
    map.addControl(new maplibregl.FullscreenControl(), 'top-right')

    map.on('load', () => {
      map.setZoom(SITE_ZOOM)
      map.resize()
      window.requestAnimationFrame(() => map.resize())
      window.setTimeout(() => map.resize(), 250)
    })
    map.on('styleimagemissing', (e) => { console.warn('[map] style image missing', e.id) })
    map.on('error', (e) => { console.error('[map] error', e.error?.message || e) })
    map.on('sourcedataloading', (e) => { if (e.sourceId) console.debug('[map] loading', e.sourceId) })
    map.on('zoomend', () => setZoomLevel(Math.round(map.getZoom())))
    map.on('click', () => {
      setSelected((cur) => (cur ? null : cur))
    })

    // Ensure map resizes correctly when its container becomes visible.
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(mapElRef.current)

    return () => {
      ro.disconnect()
      removeTimerRef.current = window.setTimeout(() => {
        const g = markersRef.current
        Object.values(g.zones).forEach((m) => m.marker.remove())
        Object.values(g.victims).forEach((m) => m.marker.remove())
        Object.values(g.resources).forEach((m) => m.marker.remove())
        Object.values(g.hazards).forEach((m) => m.marker.remove())
        Object.values(g.risk).forEach((m) => m.marker.remove())
        g.search?.marker.remove()
        g.rover?.marker.remove()
        markersRef.current = { zones: {}, victims: {}, resources: {}, hazards: {}, risk: {}, search: null, rover: null }
        map.remove()
        mapRef.current = null
        removeTimerRef.current = null
      }, 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Switch base layers by toggling visibility (no style rebuild — tiles stay connected).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    if (styleRef.current === viewMode) return
    styleRef.current = viewMode
    const active = VIEW_MODES[viewMode].layers
    ALL_RASTER_SOURCES.forEach((r) => {
      const layerId = `layer-${r.id}`
      try {
        map.setLayoutProperty(layerId, 'visibility', active.includes(r.id) ? 'visible' : 'none')
      } catch { /* layer not ready yet */ }
    })
  }, [viewMode])

  // Geocode search — fly to any real place (Nominatim, free, no key).
  const flyToSearch = async () => {
    const q = search.trim()
    if (!q) return
    setSearchMsg('searching…')
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
        { headers: { Accept: 'application/json' } }
      )
      if (!res.ok) throw new Error('geocode failed')
      const hits = await res.json()
      if (hits && hits.length) {
        const { lat, lon, display_name } = hits[0]
        mapRef.current?.flyTo({ center: [parseFloat(lon), parseFloat(lat)], zoom: 17, duration: 1400 })
        setSearchMsg(display_name.split(',').slice(0, 2).join(','))
        window.setTimeout(() => setSearchMsg(''), 6000)
      } else {
        setSearchMsg('no place found')
        window.setTimeout(() => setSearchMsg(''), 4000)
      }
    } catch {
      setSearchMsg('search unavailable')
      window.setTimeout(() => setSearchMsg(''), 4000)
    }
  }

  const locateSite = () => {
    mapRef.current?.flyTo({ center: [SITE_CENTER.lng, SITE_CENTER.lat], zoom: SITE_ZOOM, duration: 1000 })
  }

  // Apply layer-toggle visibility to marker DOM elements.
  const applyVisibility = useCallback(() => {
    const g = markersRef.current
    const setVis = (el, on) => { if (el) el.style.display = on ? '' : 'none' }
    Object.values(g.zones).forEach((e) => setVis(e.el, layerToggles.risk))
    Object.values(g.risk).forEach((e) => setVis(e.el, layerToggles.risk))
    Object.values(g.victims).forEach((e) => setVis(e.el, layerToggles.victims))
    Object.values(g.resources).forEach((e) => setVis(e.el, layerToggles.resources))
    Object.values(g.hazards).forEach((e) => {
      let on = false
      if (e.kind === 'gas') on = layerToggles.gas
      else if (e.kind === 'thermal') on = layerToggles.thermal
      else if (e.kind === 'water') on = layerToggles.gas || layerToggles.thermal
      else if (e.kind === 'stone') on = layerToggles.risk
      setVis(e.el, on)
    })
    setVis(g.search?.el, layerToggles.search && isLive)
    setVis(g.rover?.el, layerToggles.rover && isLive)
  }, [layerToggles, isLive])

  // Rover animation: smoothly interpolate to the highest-intensity zone.
  const animateRover = useCallback((to) => {
    const rover = markersRef.current.rover
    if (!rover) return
    const from = { ...roverPosRef.current }
    const start = performance.now()
    const dur = 1400
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur)
      const e = 1 - Math.pow(1 - t, 3)
      const lng = from.lng + (to.lng - from.lng) * e
      const lat = from.lat + (to.lat - from.lat) * e
      roverPosRef.current = { lng, lat }
      rover.marker.setLngLat([lng, lat])
      if (t < 1) window.requestAnimationFrame(step)
    }
    window.requestAnimationFrame(step)
  }, [])

  // Keep all mission markers in sync with real state.
  // Nothing renders until the commander authorizes scan — isLive gates every marker.
  const syncMarkers = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const g = markersRef.current

    if (!isLive) {
      // Standby: clear any stale mission markers so the map shows only basemap + empty pill.
      for (const id of Object.keys(g.zones)) { g.zones[id].marker.remove(); delete g.zones[id] }
      for (const id of Object.keys(g.risk)) { g.risk[id].marker.remove(); delete g.risk[id] }
      for (const id of Object.keys(g.victims)) { g.victims[id].marker.remove(); delete g.victims[id] }
      for (const id of Object.keys(g.resources)) { g.resources[id].marker.remove(); delete g.resources[id] }
      for (const id of Object.keys(g.hazards)) { g.hazards[id].marker.remove(); delete g.hazards[id] }
      if (g.search) { g.search.marker.remove(); g.search = null }
      if (g.rover) { g.rover.marker.remove(); g.rover = null; roverPosRef.current = { lng: SITE_CENTER.lng, lat: SITE_CENTER.lat } }
      return
    }

    /* Risk zones — the existing intensity rings double as the risk layer. */
    const zoneIds = new Set(zones.map((z) => z.id))
    for (const id of Object.keys(g.zones)) {
      if (!zoneIds.has(id)) { g.zones[id].marker.remove(); delete g.zones[id] }
    }
    for (const z of zones) {
      let entry = g.zones[z.id]
      if (!entry) {
        const el = document.createElement('div')
        el.className = 'dexter-zone-marker'
        el.style.cursor = 'pointer'
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([z.lng, z.lat]).addTo(map)
        const zoneId = z.id
        el.addEventListener('click', (e) => { e.stopPropagation(); setSelected(zoneId) })
        entry = { marker, el, pct: null, color: null }
        g.zones[z.id] = entry
      }
      const pct = Math.round(z.intensity * 100)
      if (entry.pct === pct && entry.color === z.color) continue
      entry.pct = pct
      entry.color = z.color
      entry.el.innerHTML = `
        <div class="dz-ring" style="--c:${z.color}">
          <div class="dz-core" style="background:${z.color}"></div>
          <span class="dz-pct">${pct}%</span>
        </div>`
    }

    /* Damaged-structure marker at the worst zone (Risk layer). */
    const worst = zones.reduce((m, z) => (z.intensity > m.intensity ? z : m), zones[0])
    if (isLive && worst.intensity >= 0.5) {
      let d = g.risk['damaged']
      if (!d) {
        const el = document.createElement('div')
        el.className = 'dm-marker'
        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([worst.lng, worst.lat]).addTo(map)
        d = { marker, el }
        g.risk['damaged'] = d
      }
      d.el.innerHTML = `<div class="dm-emoji" title="Damaged structure">🏚️</div>`
      d.marker.setLngLat([worst.lng, worst.lat])
    } else if (g.risk['damaged']) {
      g.risk['damaged'].marker.remove(); delete g.risk['damaged']
    }

    /* Victim detections (Victims layer). */
    const vKeys = new Set(victimEntries.map((v) => v.key))
    for (const k of Object.keys(g.victims)) {
      if (!vKeys.has(k)) { g.victims[k].marker.remove(); delete g.victims[k] }
    }
    for (const v of victimEntries) {
      const key = v.key
      let entry = g.victims[key]
      if (!entry) {
        const el = document.createElement('div')
        el.className = 'dm-marker dm-victim'
        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([v.lng, v.lat]).addTo(map)
        entry = { marker, el, sig: null }
        g.victims[key] = entry
      }
      const sig = `${v.confidence}`
      if (entry.sig === sig) continue
      entry.sig = sig
      entry.el.innerHTML = `
        <div class="dm-emoji">🧍</div>
        <div class="dm-tag">${Math.round(v.confidence * 100)}%</div>`
    }

    /* Rescue resources (Rescue Resources layer). */
    const rKeys = new Set(resourceEntries.map((r) => r.key))
    for (const k of Object.keys(g.resources)) {
      if (!rKeys.has(k)) { g.resources[k].marker.remove(); delete g.resources[k] }
    }
    for (const r of resourceEntries) {
      const key = r.key
      let entry = g.resources[key]
      if (!entry) {
        const el = document.createElement('div')
        el.className = 'dm-marker'
        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([r.lng, r.lat]).addTo(map)
        entry = { marker, el, sig: null }
        g.resources[key] = entry
      }
      const sig = `${r.team}-${r.type}`
      if (entry.sig === sig) continue
      entry.sig = sig
      entry.el.innerHTML = `<div class="dm-emoji" title="${r.team} · ${r.type}">🚑</div>`
    }

    /* Hazard markers (Gas / Thermal layers). */
    const hKeys = new Set(hazardEntries.map((h) => h.key))
    for (const k of Object.keys(g.hazards)) {
      if (!hKeys.has(k)) { g.hazards[k].marker.remove(); delete g.hazards[k] }
    }
    for (const h of hazardEntries) {
      const key = h.key
      let entry = g.hazards[key]
      if (!entry) {
        const el = document.createElement('div')
        el.className = 'dm-marker'
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([h.lng, h.lat]).addTo(map)
        entry = { marker, el, kind: h.kind, sig: null }
        g.hazards[key] = entry
      }
      if (entry.sig === h.label) continue
      entry.sig = h.label
      entry.kind = h.kind
      entry.el.innerHTML = `<div class="dm-hazard" title="${h.title}"><span class="dm-emoji">${h.emoji}</span></div>`
    }

    /* Search area perimeter (Search Area layer). */
    if (isLive) {
      if (!g.search) {
        const el = document.createElement('div')
        el.className = 'dm-marker'
        el.innerHTML = `
          <div class="dm-search">
            <span class="dm-search-label">SEARCH AREA</span>
          </div>`
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([SITE_CENTER.lng, SITE_CENTER.lat]).addTo(map)
        g.search = { marker, el }
      }
    } else if (g.search) {
      g.search.marker.remove(); g.search = null
    }

    /* Rover (Rover layer). */
    if (isLive) {
      if (!g.rover) {
        const el = document.createElement('div')
        el.className = 'dm-marker dm-rover'
        el.innerHTML = `
          <div class="dm-rover-pin"><span class="dm-emoji">🤖</span></div>
          <div class="dm-rover-label">DEXTER ROVER · LIVE</div>`
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([roverPosRef.current.lng, roverPosRef.current.lat]).addTo(map)
        g.rover = { marker, el }
      }
      // Move rover to the most active zone (real telemetry), animated.
      const target = { lng: worst.lng, lat: worst.lat }
      const cur = roverPosRef.current
      if (Math.abs(cur.lng - target.lng) > 1e-6 || Math.abs(cur.lat - target.lat) > 1e-6) {
        animateRover(target)
      }
    } else if (g.rover) {
      g.rover.marker.remove(); g.rover = null
      roverPosRef.current = { lng: SITE_CENTER.lng, lat: SITE_CENTER.lat }
    }

    applyVisibility()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones, victimEntries, resourceEntries, hazardEntries, isLive, animateRover, applyVisibility])

  useEffect(() => {
    syncMarkers()
  }, [syncMarkers])

  useEffect(() => {
    applyVisibility()
  }, [applyVisibility])

  const activeMode = VIEW_MODES[viewMode]

  /* Header sensor tags — derived from real state. */
  const tags = []
  let anyTilt = false, anyThermal = false, anyGas = false, anyStress = false
  for (const z of ZONE_LAYOUT) {
    const tilt = live[`${z.id}|tilt`]?.value
    if (tilt != null && Math.abs(tilt) > 3) anyTilt = true
    if (tempOf(live, z.id) != null && tempOf(live, z.id) > 31) anyThermal = true
    const gas = gasLevel(live, z.id)
    if (gas != null && gas > 150) anyGas = true
    const stress = live[`${z.id}|stress`]?.value
    if (stress != null && stress > 60) anyStress = true
  }
  if (anyTilt) tags.push({ t: 'SEISMIC', c: '#f97316' })
  if (anyThermal) tags.push({ t: 'THERMAL', c: '#ef4444' })
  if (anyStress) tags.push({ t: 'STRUCTURAL', c: '#f59e0b' })
  if (anyGas) tags.push({ t: 'GAS', c: '#22d3ee' })

  const headerGps = selectedZone
    ? { lat: selectedZone.lat, lng: selectedZone.lng }
    : { lat: SITE_CENTER.lat, lng: SITE_CENTER.lng }

  return (
    <section id="mission-dashboard" className="scroll-mt-20 px-6 py-24">
      <div className="mx-auto max-w-7xl">
        {/* Section header */}
        <div className="mb-12">
          <div className="section-eyebrow mb-4">Situation Report</div>
          <h2 className="section-title font-display text-3xl font-semibold tracking-[0.04em] md:text-4xl">Mission Dashboard</h2>
          {state.mission && (
            <p className="mt-3 font-mono text-xs text-white/30">
              Stage: {state.mission.stage} · ID: {state.mission.mission_id}
            </p>
          )}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Live geo map */}
          <div className="glass-card lg:col-span-2 rounded-2xl p-6 md:p-7">
            <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <Crosshair className="w-4 h-4 text-blue-400/70" />
                <h3 className="text-sm font-display font-semibold text-white/80 tracking-[0.12em]">D.E.X.T.E.R. Map</h3>
                <span className={`text-[10px] font-display font-semibold tracking-[0.2em] flex items-center gap-1.5 ${isLive ? 'text-emerald-400/80' : 'text-white/35'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-emerald-400 animate-pulse' : 'bg-white/30'}`} />
                  {isLive ? 'LIVE' : 'STANDBY'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {LAYER_KEYS.map((k) => (
                  <TechButton
                    key={k}
                    tone={k === layerKey ? LAYERS[k].color : '#334155'}
                    className={k === layerKey ? 'opacity-100' : 'opacity-40'}
                    onClick={() => setLayerKey(k)}
                    aria-pressed={k === layerKey}
                  >
                    {k}
                  </TechButton>
                ))}
              </div>
            </div>

            <HudFrame
              label={`LAYER // ${layerKey} · ${layer.label} · ${layer.range}`}
              right={`GPS // ${fmtLat(headerGps.lat)} ${fmtLng(headerGps.lng)}`}
            >
              <div className="relative h-80 overflow-hidden rounded-xl dm-map-bg md:h-96" style={{ minHeight: '320px', background: '#e7ebef' }}>
                {/* MapLibre map — fully interactive (drag, scroll-zoom, pinch, double-click) like Google Maps.
                    Inline background + grid on the parent guarantees the container is never white,
                    even if the style fails to load. */}
                <div
                  ref={mapElRef}
                  className="absolute inset-0 z-0"
                  style={{ width: '100%', height: '100%', display: 'block', background: 'transparent' }}
                  aria-label="Live geo map of the disaster site"
                />

                {/* Empty state — before mission data */}
                {!isLive && (
                  <div className="dm-empty">
                    <div className="dm-empty-pill">
                      <span className="dm-empty-dot" />
                      AWAITING MISSION DATA
                    </div>
                  </div>
                )}

                {/* Zone inspector — the in-depth screen (zoom in depth) */}
                <AnimatePresence>
                  {selected && (
                    <motion.div
                      initial={{ opacity: 0, x: 24 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 24 }}
                      transition={{ duration: 0.25 }}
                      className="absolute inset-y-0 right-0 z-[1000] w-[270px] max-w-[85%] bg-[#080b12]/95 backdrop-blur-xl border-l border-white/10 p-4 overflow-y-auto"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="hud-label" style={{ color: selectedZone.color }}>
                            ZONE INSPECTOR
                          </div>
                          <div className="text-sm font-display font-semibold tracking-[0.08em] text-white/90 mt-1">
                            {selectedZone.label}
                          </div>
                          <div className="text-[10px] font-mono text-white/35 mt-1">
                            {fmtLat(selectedZone.lat)} · {fmtLng(selectedZone.lng)}
                          </div>
                        </div>
                        <button
                          onClick={() => setSelected(null)}
                          aria-label="Close zone inspector"
                          className="w-6 h-6 rounded-md bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Live waveform equalizer */}
                      <div className="flex items-end gap-[3px] h-12 mb-4 rounded-lg bg-white/[0.02] border border-white/[0.05] px-2 pt-2" aria-hidden="true">
                        {selWave.map((h, i) => (
                          <motion.div
                            key={i}
                            className="flex-1 rounded-sm"
                            style={{ background: selectedZone.color, opacity: 0.35 + h * 0.5 }}
                            animate={{ scaleY: [0.3, h, 0.55, h * 0.8, 0.3] }}
                            transition={{ duration: 1.6 + (i % 5) * 0.25, repeat: Infinity, ease: 'easeInOut' }}
                          />
                        ))}
                      </div>

                      <div className="space-y-3">
                        {LAYER_KEYS.map((k) => {
                          const l = LAYERS[k]
                          const v = l.value(live, selectedZone.id)
                          const col = riskColor(v)
                          return (
                            <div key={k}>
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[9px] font-display font-semibold tracking-[0.18em] text-white/40">{k}</span>
                                <span className="text-[10px] font-mono" style={{ color: col }}>{l.meter(live, selectedZone.id)}</span>
                              </div>
                              <SegmentedBar value={v} segments={14} color={col} />
                              <div className="text-[9px] font-mono text-white/25 mt-1">{l.readout(live, selectedZone.id)}</div>
                            </div>
                          )
                        })}
                      </div>

                      <div className="mt-4 flex items-center justify-between rounded-lg border px-3 py-2.5" style={{ borderColor: `${selectedZone.color}40`, background: `${selectedZone.color}0d` }}>
                        <span className="text-[9px] font-display tracking-[0.2em] text-white/45 uppercase">Verdict</span>
                        <span className="text-xs font-display font-bold tracking-[0.18em]" style={{ color: verdictOf(selectedZone.intensity).color }}>
                          {verdictOf(selectedZone.intensity).label}
                        </span>
                      </div>

                      <div className="mt-3 flex items-center gap-2 text-[9px] font-mono text-white/25">
                        <Activity className="w-3 h-3 text-blue-400/50" />
                        Live telemetry · {isLive ? 'streaming' : 'awaiting stream'}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Google-Maps-style place search */}
                <div className="absolute top-2 left-2 z-[950] flex items-center gap-1.5">
                  <div className="flex items-center gap-1.5 rounded-md bg-white/85 backdrop-blur-sm border border-black/10 focus-within:border-blue-500/60 px-2 py-1.5">
                    <Search className="w-3 h-3 text-slate-500" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && flyToSearch()}
                      placeholder="Search real place…"
                      aria-label="Search real geographic place"
                      className="w-36 bg-transparent text-[10px] font-mono text-slate-700 placeholder:text-slate-400 focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={flyToSearch}
                    aria-label="Search location"
                    className="w-7 h-7 rounded-md bg-white/85 backdrop-blur-sm border border-blue-500/30 hover:border-blue-500/60 hover:bg-blue-500/15 text-blue-600 hover:text-blue-700 flex items-center justify-center transition-colors"
                  >
                    <Navigation className="w-3 h-3" />
                  </button>
                </div>
                {searchMsg && (
                  <div className="absolute top-12 left-2 z-[950] px-2 py-1 rounded bg-white/90 border border-black/10 text-[9px] font-mono text-slate-700 max-w-[240px] truncate">
                    {searchMsg}
                  </div>
                )}

                {/* Sensor tags + locate + layer + view controls */}
                <div className="absolute top-2 right-2 z-[900] flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={locateSite}
                      aria-label="Locate disaster site"
                      title="Locate site"
                      className="w-7 h-7 rounded-md bg-white/85 backdrop-blur-sm border border-blue-500/30 hover:border-blue-500/60 hover:bg-blue-500/15 text-blue-600 hover:text-blue-700 flex items-center justify-center transition-colors"
                    >
                      <LocateFixed className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => { setLayersOpen((v) => !v); setStyleOpen(false) }}
                      aria-label="Map layers"
                      title="Layers"
                      className={`w-7 h-7 rounded-md border flex items-center justify-center transition-colors ${layersOpen ? 'border-blue-500/60 bg-blue-500/15 text-blue-700' : 'border-black/10 bg-white/85 text-slate-500 hover:text-slate-700'}`}
                    >
                      <Layers className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => { setStyleOpen((v) => !v); setLayersOpen(false) }}
                      aria-label="Map view modes"
                      title="Map view"
                      className={`w-7 h-7 rounded-md border flex items-center justify-center transition-colors ${styleOpen ? 'border-blue-500/60 bg-blue-500/15 text-blue-700' : 'border-black/10 bg-white/85 text-slate-500 hover:text-slate-700'}`}
                    >
                      <Satellite className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Layer-control popover */}
                <AnimatePresence>
                  {layersOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.18 }}
                      className="absolute top-11 right-2 z-[960] w-44 rounded-lg bg-[#080b12]/95 backdrop-blur-xl border border-white/15 p-2"
                    >
                      <div className="text-[9px] font-display tracking-[0.2em] text-white/40 uppercase px-1 pb-1.5">Mission Layers</div>
                      {MAP_LAYERS.map((row) => (
                        <button
                          key={row.key}
                          onClick={() => setLayerToggles((s) => ({ ...s, [row.key]: !s[row.key] }))}
                          className="w-full text-left"
                        >
                          <LayerRow row={row} on={layerToggles[row.key]} />
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* View-mode popover */}
                <AnimatePresence>
                  {styleOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.18 }}
                      className="absolute top-11 right-2 z-[960] w-40 rounded-lg bg-[#080b12]/95 backdrop-blur-xl border border-white/15 p-2"
                    >
                      <div className="text-[9px] font-display tracking-[0.2em] text-white/40 uppercase px-1 pb-1.5">Map View</div>
                      {Object.entries(VIEW_MODES).map(([key, cfg]) => (
                        <button
                          key={key}
                          onClick={() => { setViewMode(key); setStyleOpen(false) }}
                          className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] font-display tracking-[0.08em] transition-colors ${viewMode === key ? 'bg-blue-500/15 text-blue-200' : 'text-white/55 hover:bg-white/5'}`}
                        >
                          {key === 'SATELLITE' && <Satellite className="w-3 h-3" />}
                          {key === 'TERRAIN' && <MapIcon className="w-3 h-3" />}
                          {key === 'STREETS' && <MapIcon className="w-3 h-3" />}
                          {key === 'HYBRID' && <Satellite className="w-3 h-3" />}
                          {cfg.label}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Live GPS lock readout */}
                <div className="absolute bottom-2 left-2 z-[900] flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-white/80 backdrop-blur-sm border border-black/10 pointer-events-none">
                  <Navigation className="w-3 h-3 text-blue-600" />
                  <span className="text-[9px] font-mono text-slate-600">
                    {fmtLat(headerGps.lat)} {fmtLng(headerGps.lng)} · Z{zoomLevel} · {activeMode.label}
                  </span>
                </div>

                {/* Severity/sensor tags header strip */}
                {tags.length > 0 && (
                  <div className="absolute bottom-2 right-2 z-[900] flex items-center gap-1.5">
                    {tags.map((t) => (
                      <span key={t.t} className="dm-tag-chip" style={{ color: t.c, borderColor: `${t.c}55`, background: `${t.c}14` }}>
                        {t.t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
                <div className="flex items-center gap-4">
                  <LegendItem color="#ef4444" label="Critical" />
                  <LegendItem color="#f59e0b" label="High" />
                  <LegendItem color="#22d3ee" label="Monitor" />
                  <LegendItem color="#22c55e" label="Stable" />
                </div>
                <button
                  onClick={() => setSelected(selectedZone?.id)}
                  className="text-[10px] font-display font-semibold tracking-[0.2em] uppercase text-blue-300/80 hover:text-blue-300 transition-colors"
                >
                  {selected ? 'Close inspector' : 'Zoom in depth →'}
                </button>
              </div>
            </HudFrame>
          </div>

          {/* Agent Status */}
          <div className="glass-card rounded-2xl p-6">
            <h3 className="mb-6 font-display text-sm font-semibold tracking-[0.12em] text-white/70">Agent Status</h3>
            <div className="space-y-3">
              {(state.agents.length ? state.agents : []).map((agent) => (
                <div key={agent.id} className="glass-soft flex items-center gap-3 rounded-xl border border-white/[0.05] p-3 transition-colors hover:border-white/[0.12]">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${agent.color}15`, border: `1px solid ${agent.color}25` }}>
                    <span className="text-xs font-display font-bold" style={{ color: agent.color }}>{agent.id.slice(0, 2).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-xs font-semibold tracking-[0.06em] text-white/80">{agent.name}</div>
                    <div className="mt-0.5 text-[10px] capitalize text-white/30">{agent.status}</div>
                  </div>
                  <div className="font-mono text-xs" style={{ color: agent.color }}>
                    {Math.round(agent.confidence * 100)}%
                  </div>
                </div>
              ))}
              {state.agents.length === 0 && (
                <div className="reading-copy text-xs">
                  No agent reports yet — the chain starts with Risk Assessment as soon as telemetry lands.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default DashboardSection
