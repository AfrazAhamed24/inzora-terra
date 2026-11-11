import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { LocateFixed, Layers3, Maximize2, MapPinned, X } from 'lucide-react'

const DEFAULT_CENTER = [0, 0]
const DEFAULT_ZOOM = 2
const SEVERITIES = {
  critical: { label: 'Critical', color: '#dc2626' },
  high: { label: 'High', color: '#d97706' },
  monitor: { label: 'Monitor', color: '#0284c7' },
  unknown: { label: 'Unclassified', color: '#64748b' },
}

const MAP_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'osm',
      type: 'raster',
      source: 'osm',
      paint: { 'raster-saturation': -0.75, 'raster-contrast': 0.15, 'raster-brightness-max': 0.72 },
    },
  ],
}

maplibregl.setWorkerUrl(maplibreWorkerUrl)

function numeric(value) {
  const parsed = typeof value === 'string' ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null
}

function coordinatesOf(record) {
  if (!record || typeof record !== 'object') return null
  const latitude = numeric(record.latitude ?? record.lat ?? record.position?.latitude ?? record.position?.lat)
  const longitude = numeric(record.longitude ?? record.lng ?? record.lon ?? record.position?.longitude ?? record.position?.lng ?? record.position?.lon)
  if (latitude == null || longitude == null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null
  return [longitude, latitude]
}

function severityOf(record) {
  const text = String(record.severity ?? record.priority ?? record.likelihood ?? record.risk_level ?? '').toLowerCase()
  if (text.includes('critical')) return 'critical'
  if (text.includes('high')) return 'high'
  if (text.includes('monitor') || text.includes('medium')) return 'monitor'
  return 'unknown'
}

function categoryOf(record) {
  const text = String(record.kind ?? record.type ?? record.category ?? record.sensor_type ?? record.source ?? '').toLowerCase()
  if (text.includes('rover') || text === 'gps') return 'rover'
  if (text.includes('victim') || text.includes('survivor')) return 'victim'
  if (text.includes('resource') || text.includes('team')) return 'resource'
  if (text.includes('risk') || text.includes('tilt') || text.includes('stress') || text.includes('thermal') || text.includes('gas')) return 'risk'
  return 'telemetry'
}

function collectCoordinates(state) {
  const records = [
    ...(Array.isArray(state.telemetry?.telemetry) ? state.telemetry.telemetry : []),
    ...Object.values(state.telemetryLive || {}),
  ]
  const seen = new Set()
  const items = []

  for (const record of records) {
    const coordinates = coordinatesOf(record)
    if (!coordinates) continue
    const category = categoryOf(record)
    const id = String(record.packet_id ?? record.id ?? `${category}-${coordinates.join('-')}`)
    if (seen.has(id)) continue
    seen.add(id)
    items.push({
      id,
      category,
      coordinates,
      severity: severityOf(record),
      title: record.label ?? record.zone ?? (category === 'rover' ? 'Rover position' : 'Telemetry point'),
      source: record.source ?? record.sensor_type ?? 'mission telemetry',
      timestamp: record.ts ?? record.timestamp ?? null,
      confidence: numeric(record.confidence),
      heading: numeric(record.heading ?? record.bearing),
      evidence: record.evidence ?? record.metric ?? 'Coordinate-bearing telemetry',
    })
  }

  return items
}

function markerElement(item, selected) {
  const element = document.createElement('button')
  const severity = SEVERITIES[item.severity]
  const color = item.category === 'rover' ? '#0f766e' : severity.color
  element.type = 'button'
  element.title = item.title
  element.setAttribute('aria-label', `Show ${item.title} details`)
  element.style.cssText = [
    'width: 28px',
    'height: 28px',
    'border-radius: 50%',
    `background: ${color}`,
    'border: 3px solid rgba(255,255,255,0.95)',
    `box-shadow: 0 2px 8px rgba(15,23,42,0.35)`,
    'cursor: pointer',
    'display: flex',
    'align-items: center',
    'justify-content: center',
    'color: white',
    'font: 600 11px system-ui',
    'transition: transform 150ms ease, box-shadow 150ms ease',
  ].join(';')
  element.textContent = item.category === 'rover' ? 'R' : item.category === 'victim' ? 'V' : item.category === 'resource' ? 'T' : '!'
  if (selected) {
    element.style.transform = 'scale(1.18)'
    element.style.boxShadow = `0 0 0 5px rgba(15,118,110,0.16), 0 2px 8px rgba(15,23,42,0.35)`
  }
  return element
}

function timestampLabel(value) {
  if (!value) return 'Timestamp unavailable'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export default function RescueMap({ state }) {
  const mapContainer = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const didFitRef = useRef(false)
  const [mapReady, setMapReady] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [layersOpen, setLayersOpen] = useState(false)
  const [show, setShow] = useState({ rover: true, risk: true, victim: true, resource: true, telemetry: true })
  const [severityFilter, setSeverityFilter] = useState('all')
  const items = collectCoordinates(state)
  const selected = items.find((item) => item.id === selectedId) || null

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return undefined

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLE,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: true,
      dragRotate: false,
      touchPitch: false,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    map.on('load', () => setMapReady(true))
    mapRef.current = map

    return () => {
      markersRef.current.forEach(({ marker }) => marker.remove())
      markersRef.current = []
      map.remove()
      mapRef.current = null
    }
  }, [])

  const visibleItems = items.filter((item) => show[item.category] && (severityFilter === 'all' || item.severity === severityFilter || (item.category === 'rover' && severityFilter === 'all')))

  useEffect(() => {
    if (!mapReady || !mapRef.current) return undefined
    const map = mapRef.current
    markersRef.current.forEach(({ marker }) => marker.remove())
    markersRef.current = []

    visibleItems.forEach((item) => {
      const element = markerElement(item, item.id === selectedId)
      element.addEventListener('click', () => setSelectedId(item.id))
      const marker = new maplibregl.Marker({ element }).setLngLat(item.coordinates).addTo(map)
      markersRef.current.push({ marker, id: item.id })
    })

    if (!didFitRef.current && visibleItems.length > 0) {
      didFitRef.current = true
      const bounds = new maplibregl.LngLatBounds()
      visibleItems.forEach((item) => bounds.extend(item.coordinates))
      map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 0 })
    }

    return undefined
  }, [mapReady, visibleItems, selectedId])

  const fitToMarkers = () => {
    const map = mapRef.current
    if (!map || visibleItems.length === 0) return
    const bounds = new maplibregl.LngLatBounds()
    visibleItems.forEach((item) => bounds.extend(item.coordinates))
    map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 450 })
  }

  const recenterOnRover = () => {
    const rover = visibleItems.find((item) => item.category === 'rover')
    if (!mapRef.current || !rover) return
    mapRef.current.flyTo({ center: rover.coordinates, zoom: Math.max(mapRef.current.getZoom(), 14), duration: 500 })
    setSelectedId(rover.id)
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
      <div ref={mapContainer} className="h-[460px] w-full md:h-[540px]" aria-label="Interactive rescue map" />
      <div className="absolute left-4 top-4 max-w-[min(92%,28rem)] rounded-lg border border-white/70 bg-white/95 px-3 py-2.5 shadow-sm backdrop-blur">
        <div className="flex items-center gap-2">
          <MapPinned aria-hidden="true" className="h-4 w-4 text-slate-700" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-700">Rescue map</span>
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          {items.length ? `${visibleItems.length} coordinate-bearing point${visibleItems.length === 1 ? '' : 's'} · live telemetry` : 'Coordinates unavailable in current telemetry · map is shown for orientation only'}
        </p>
      </div>

      {!items.length && (
        <div className="pointer-events-none absolute inset-x-4 top-24 bottom-24 flex items-center justify-center md:inset-x-16">
          <div className="max-w-md rounded-xl border border-slate-200 bg-white/95 px-6 py-5 text-center shadow-sm backdrop-blur">
            <MapPinned aria-hidden="true" className="mx-auto h-6 w-6 text-slate-400" />
            <h4 className="mt-3 text-base font-semibold text-slate-900">Spatial layer unavailable</h4>
            <p className="mt-2 text-sm leading-6 text-slate-500">Current mission telemetry contains no latitude/longitude values. Map markers will appear when coordinate-bearing telemetry is received.</p>
            <p className="mt-3 text-xs font-medium text-slate-400">No location is being inferred or simulated.</p>
          </div>
        </div>
      )}

      <div className="absolute right-4 top-4 flex gap-2">
        <button type="button" onClick={() => setLayersOpen((value) => !value)} aria-expanded={layersOpen} aria-label="Toggle map layers" className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">
          <Layers3 aria-hidden="true" className="h-4 w-4" />
        </button>
        <button type="button" onClick={fitToMarkers} disabled={!visibleItems.length} aria-label="Fit map to mission markers" className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">
          <Maximize2 aria-hidden="true" className="h-4 w-4" />
        </button>
        <button type="button" onClick={recenterOnRover} disabled={!visibleItems.some((item) => item.category === 'rover')} aria-label="Recenter map on rover" className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">
          <LocateFixed aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

      {layersOpen && (
        <div className="absolute right-4 top-[4.5rem] z-10 w-56 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Visible layers</p>
          <div className="space-y-2">
            {Object.keys(show).map((key) => (
              <label key={key} className="flex items-center justify-between gap-3 text-xs capitalize text-slate-700">
                <span>{key}</span>
                <input type="checkbox" checked={show[key]} onChange={(event) => setShow((value) => ({ ...value, [key]: event.target.checked }))} className="h-4 w-4 accent-cyan-700" />
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-white/70 bg-white/95 p-1.5 shadow-sm">
          <span className="px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Severity</span>
          {['all', 'critical', 'high', 'monitor'].map((filter) => (
            <button key={filter} type="button" onClick={() => setSeverityFilter(filter)} aria-pressed={severityFilter === filter} className={`rounded-md px-2.5 py-1.5 text-[10px] font-semibold capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${severityFilter === filter ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {filter === 'all' ? 'All' : SEVERITIES[filter].label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-white/70 bg-white/95 px-3 py-2 shadow-sm">
          {Object.entries(SEVERITIES).filter(([key]) => key !== 'unknown').map(([key, severity]) => <span key={key} className="flex items-center gap-1.5 text-[10px] text-slate-600"><i aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: severity.color }} />{severity.label}</span>)}
          <span className="flex items-center gap-1.5 text-[10px] text-slate-600"><i aria-hidden="true" className="flex h-4 w-4 items-center justify-center rounded-full bg-teal-700 text-[8px] font-bold text-white">R</i>Rover</span>
        </div>
      </div>

      {selected && (
        <div className="absolute bottom-20 right-4 z-10 w-[min(90%,20rem)] rounded-lg border border-slate-200 bg-white p-4 shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Selected marker</p><h4 className="mt-1 text-sm font-semibold text-slate-900">{selected.title}</h4></div>
            <button type="button" onClick={() => setSelectedId(null)} aria-label="Close marker details" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"><X aria-hidden="true" className="h-4 w-4" /></button>
          </div>
          <dl className="mt-3 space-y-2 text-xs">
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Type</dt><dd className="capitalize text-slate-800">{selected.category}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Severity</dt><dd className="text-slate-800">{SEVERITIES[selected.severity].label}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Evidence</dt><dd className="max-w-[12rem] text-right text-slate-800">{String(selected.evidence)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Last update</dt><dd className="text-right text-slate-800">{timestampLabel(selected.timestamp)}</dd></div>
          </dl>
        </div>
      )}
    </div>
  )
}

