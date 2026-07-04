'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Layers, Locate } from 'lucide-react'
import { fetchFleet, type FleetVehicle } from '../api'
import { useFleetSocket } from '@/hooks/use-fleet-socket'
import { useUIStore } from '@/stores/ui-store'
import { MAP_THEMES, getThemeById } from '@/lib/map-themes'
import { TierPill } from '@/components/shared/tier-pill'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

export default function MapPage() {
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletMap = useRef<any>(null)
  const markerRefs = useRef<Map<string, any>>(new Map())
  const clusterRef = useRef<any>(null)
  const tileLayerRef = useRef<any>(null)
  const [selectedVehicle, setSelectedVehicle] = useState<FleetVehicle | null>(null)
  const { mapTheme, setMapTheme, selectedRouteId } = useUIStore()

  useFleetSocket()

  const { data: fleet } = useQuery({
    queryKey: ['fleet', 'map'],
    queryFn: () => fetchFleet({ online: true }),
    refetchInterval: 5000,
    staleTime: 3000,
  })

  const { data: routeDetail } = useQuery({
    queryKey: ['route-detail', selectedRouteId],
    queryFn: () => fetch(`/api/v1/routes/${selectedRouteId}`).then((r) => r.json()),
    enabled: !!selectedRouteId,
    staleTime: 60_000,
  })

  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return
    const L = require('leaflet')
    require('leaflet.markercluster')

    const map = L.map(mapRef.current, { center: [10.3157, 123.8854], zoom: 13, zoomControl: false })
    leafletMap.current = map

    const tc = getThemeById(mapTheme)
    tileLayerRef.current = L.tileLayer(tc.url, { attribution: tc.attribution, maxZoom: tc.maxZoom }).addTo(map)
    L.control.zoom({ position: 'topright' }).addTo(map)

    clusterRef.current = L.markerClusterGroup({ maxClusterRadius: 40, iconCreateFunction: (c: any) => L.divIcon({ html: `<div style="background:#087b68;color:#fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:12px;">${c.getChildCount()}</div>`, className: 'fleet-cluster', iconSize: [32, 32] }) })
    map.addLayer(clusterRef.current)

    return () => { map.remove(); leafletMap.current = null }
  }, [])

  useEffect(() => {
    if (!leafletMap.current || !tileLayerRef.current) return
    const L = require('leaflet')
    leafletMap.current.removeLayer(tileLayerRef.current)
    const tc = getThemeById(mapTheme)
    tileLayerRef.current = L.tileLayer(tc.url, { attribution: tc.attribution, maxZoom: tc.maxZoom }).addTo(leafletMap.current)
  }, [mapTheme])

  useEffect(() => {
    if (!clusterRef.current || !fleet) return
    const L = require('leaflet')
    const ids = new Set<string>()
    for (const v of fleet.vehicles) {
      ids.add(v.vehicleId)
      const icon = createIcon(v)
      const existing = markerRefs.current.get(v.vehicleId)
      if (existing) { existing.setLatLng([v.lat, v.lon]); existing.setIcon(icon) }
      else { const m = L.marker([v.lat, v.lon], { icon }); m.on('click', () => setSelectedVehicle(v)); clusterRef.current.addLayer(m); markerRefs.current.set(v.vehicleId, m) }
    }
    for (const [id, m] of markerRefs.current) { if (!ids.has(id)) { clusterRef.current.removeLayer(m); markerRefs.current.delete(id) } }
  }, [fleet])

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div ref={mapRef} style={{ flex: 1, minHeight: 0 }} />

      {/* Legend */}
      <div className="map-legend">
        <span><i className="dot green-dot"></i>Available</span>
        <span><i className="dot yellow-dot"></i>Filling</span>
        <span><i className="dot red-dot"></i>Full</span>
      </div>

      {/* Controls */}
      <div style={{ position: 'absolute', bottom: '16px', right: '16px', display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 1000 }}>
        <button onClick={() => leafletMap.current?.locate({ setView: true, maxZoom: 16 })} style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#fff', border: '1px solid #d9e4e7', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <Locate size={18} style={{ color: '#087b68' }} />
        </button>
        <div style={{ position: 'relative' }}>
          <button onClick={() => { const idx = MAP_THEMES.findIndex(t => t.id === mapTheme); const next = MAP_THEMES[(idx + 1) % MAP_THEMES.length]!; setMapTheme(next.id) }} style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#fff', border: '1px solid #d9e4e7', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Layers size={18} style={{ color: '#087b68' }} />
          </button>
        </div>
      </div>

      {/* Vehicle detail */}
      {selectedVehicle && <VehicleSheet vehicle={selectedVehicle} onClose={() => setSelectedVehicle(null)} />}
    </div>
  )
}

function createIcon(v: FleetVehicle) {
  const L = require('leaflet')
  const colors: Record<string, string> = { available: '#16a34a', filling: '#eab308', at_capacity: '#dc2626', overloaded: '#dc2626' }
  const color = colors[v.tier] ?? colors.available
  const arrow = v.direction === 'forward' ? '▲' : '▼'
  const blink = v.tier === 'overloaded' ? 'animation:blink 1s infinite;' : ''
  return L.divIcon({ html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;"><div style="background:${color};color:#fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.3);${blink}">${v.routeCode}</div><div style="position:absolute;bottom:-2px;right:-2px;background:#fff;color:${color};border-radius:50%;width:14px;height:14px;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:bold;border:1px solid ${color}">${arrow}</div></div>`, className: 'vehicle-marker', iconSize: [32, 32], iconAnchor: [16, 16] })
}

function VehicleSheet({ vehicle, onClose }: { vehicle: FleetVehicle; onClose: () => void }) {
  const { data: eta } = useQuery({ queryKey: ['eta', vehicle.vehicleId], queryFn: () => fetch(`/api/v1/eta/${vehicle.vehicleId}`).then((r) => r.json()), staleTime: 30_000 })
  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 1001, background: '#fff', borderRadius: '20px 20px 0 0', boxShadow: '0 -8px 32px rgba(0,0,0,0.16)', padding: '18px', maxHeight: '60%', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 700, fontSize: '18px', color: '#172027' }}>{vehicle.vehicleCode}</span>
            <TierPill tier={vehicle.tier} />
          </div>
          <p style={{ fontSize: '14px', color: '#4f616b', margin: '4px 0 0' }}>Route {vehicle.routeCode} — {vehicle.routeName}</p>
          <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0' }}>{vehicle.vehicleType} • {vehicle.occupancy}/{vehicle.capacity} riders • {vehicle.speedKph} kph • {vehicle.direction}</p>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', color: '#94a3b8', cursor: 'pointer' }}>×</button>
      </div>
      {eta?.stops?.length > 0 && (
        <div>
          <p className="eyebrow" style={{ marginBottom: '8px' }}>Next stops</p>
          {eta.stops.slice(0, 3).map((s: any) => (
            <div key={s.seq} className="boarding-detail-row"><span>{s.stopName ?? `Stop ${s.seq}`}</span><span style={{ color: '#4f616b' }}>{s.etaFormatted}</span></div>
          ))}
        </div>
      )}
    </div>
  )
}
