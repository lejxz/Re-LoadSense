'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Layers, Locate } from 'lucide-react'
import { fetchFleet, type FleetVehicle } from '../api'
import { useFleetSocket } from '@/hooks/use-fleet-socket'
import { useUIStore } from '@/stores/ui-store'
import { useTheme } from 'next-themes'
import { MAP_THEMES, getThemeById } from '@/lib/map-themes'
import { TierPill } from '@/components/shared/tier-pill'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

// Dynamic import Leaflet to avoid SSR issues
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

export default function MapPage() {
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletMap = useRef<L.Map | null>(null)
  const markerRefs = useRef<Map<string, L.Marker>>(new Map())
  const clusterRef = useRef<any>(null)
  const polylineRef = useRef<L.Polyline | null>(null)
  const [selectedVehicle, setSelectedVehicle] = useState<FleetVehicle | null>(null)
  const { mapTheme, setMapTheme, selectedRouteId } = useUIStore()
  const { theme } = useTheme()
  const tileLayerRef = useRef<L.TileLayer | null>(null)

  // Connect socket for live updates
  useFleetSocket()

  // Auto-switch to dark theme in dark mode (unless user manually selected)
  const effectiveTheme = (theme === 'dark' && mapTheme === 'carto-light') ? 'carto-dark' : mapTheme

  // Fetch fleet data
  const { data: fleet } = useQuery({
    queryKey: ['fleet', 'map'],
    queryFn: () => fetchFleet({ online: true }),
    refetchInterval: 5000,
    staleTime: 3000,
  })

  // Fetch route detail if a route is selected (for polyline)
  const { data: routeDetail } = useQuery({
    queryKey: ['route-detail', selectedRouteId],
    queryFn: () => fetch(`/api/v1/routes/${selectedRouteId}`).then((r) => r.json()),
    enabled: !!selectedRouteId,
    staleTime: 60_000,
  })

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return

    const L = require('leaflet')
    require('leaflet.markercluster')

    const map = L.map(mapRef.current, {
      center: [10.3157, 123.8854], // Cebu City
      zoom: 13,
      zoomControl: false,
    })
    leafletMap.current = map

    // Tile layer
    const tileConfig = getThemeById(effectiveTheme)
    tileLayerRef.current = L.tileLayer(tileConfig.url, {
      attribution: tileConfig.attribution,
      maxZoom: tileConfig.maxZoom,
    }).addTo(map)

    // Zoom control (top-right)
    L.control.zoom({ position: 'topright' }).addTo(map)

    // Cluster group
    clusterRef.current = L.markerClusterGroup({
      maxClusterRadius: 40,
      iconCreateFunction: (cluster: any) => {
        const count = cluster.getChildCount()
        return L.divIcon({
          html: `<div style="background: teal; color: white; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px;">${count}</div>`,
          className: 'fleet-cluster',
          iconSize: [32, 32],
        })
      },
    })
    map.addLayer(clusterRef.current)

    return () => {
      map.remove()
      leafletMap.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update tile layer when theme changes
  useEffect(() => {
    if (!leafletMap.current || !tileLayerRef.current) return
    const L = require('leaflet')
    const tileConfig = getThemeById(effectiveTheme)
    leafletMap.current.removeLayer(tileLayerRef.current)
    tileLayerRef.current = L.tileLayer(tileConfig.url, {
      attribution: tileConfig.attribution,
      maxZoom: tileConfig.maxZoom,
    }).addTo(leafletMap.current)
  }, [effectiveTheme])

  // Update markers (in-place, no flicker)
  useEffect(() => {
    if (!clusterRef.current || !fleet) return
    const L = require('leaflet')

    const currentIds = new Set<string>()

    for (const v of fleet.vehicles) {
      currentIds.add(v.vehicleId)
      const existing = markerRefs.current.get(v.vehicleId)

      const icon = createVehicleIcon(v)

      if (existing) {
        // Update in place (no flicker)
        existing.setLatLng([v.lat, v.lon])
        existing.setIcon(icon)
      } else {
        // Create new marker
        const marker = L.marker([v.lat, v.lon], { icon })
        marker.on('click', () => setSelectedVehicle(v))
        clusterRef.current!.addLayer(marker)
        markerRefs.current.set(v.vehicleId, marker)
      }
    }

    // Remove markers for vehicles no longer in the fleet
    for (const [id, marker] of markerRefs.current) {
      if (!currentIds.has(id)) {
        clusterRef.current!.removeLayer(marker)
        markerRefs.current.delete(id)
      }
    }
  }, [fleet])

  // Draw route polyline when selected
  useEffect(() => {
    if (!leafletMap.current) return
    const L = require('leaflet')

    // Remove existing polyline
    if (polylineRef.current) {
      leafletMap.current.removeLayer(polylineRef.current)
      polylineRef.current = null
    }

    if (routeDetail?.polyline?.length >= 2) {
      const latlngs = routeDetail.polyline.map((p: any) => [p.lat, p.lon])
      polylineRef.current = L.polyline(latlngs, {
        color: '#0d9488', // teal
        weight: 5,
        opacity: 0.8,
      }).addTo(leafletMap.current)

      // Fit bounds to the polyline
      leafletMap.current.fitBounds(polylineRef.current!.getBounds(), { padding: [40, 40] })
    }
  }, [routeDetail])

  // Locate me
  const locateMe = () => {
    if (!leafletMap.current) return
    leafletMap.current.locate({ setView: true, maxZoom: 16 })
  }

  return (
    <div className="relative h-full">
      {/* Map container */}
      <div ref={mapRef} className="absolute inset-0 z-0" />

      {/* Legend (bottom-left) */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-200 dark:border-slate-800 p-2 space-y-1">
        {[
          { tier: 'available', color: 'bg-green-500' },
          { tier: 'filling', color: 'bg-amber-500' },
          { tier: 'at_capacity', color: 'bg-red-500' },
          { tier: 'overloaded', color: 'bg-red-500 animate-pulse' },
        ].map(({ tier, color }) => (
          <div key={tier} className="flex items-center gap-2">
            <span className={cn('w-3 h-3 rounded-full', color)} />
            <span className="text-xs text-slate-600 dark:text-slate-300 capitalize">
              {tier.replace(/_/g, ' ')}
            </span>
          </div>
        ))}
      </div>

      {/* Theme switcher + Locate (bottom-right) */}
      <div className="absolute bottom-4 right-4 z-[1000] flex flex-col gap-2">
        <button
          onClick={locateMe}
          className="w-10 h-10 rounded-lg bg-white dark:bg-slate-900 shadow-lg border border-slate-200 dark:border-slate-800 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <Locate size={18} className="text-teal-600 dark:text-teal-400" />
        </button>
        <Popover>
          <PopoverTrigger asChild>
            <button className="w-10 h-10 rounded-lg bg-white dark:bg-slate-900 shadow-lg border border-slate-200 dark:border-slate-800 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              <Layers size={18} className="text-teal-600 dark:text-teal-400" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-48">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Map Theme</p>
              {MAP_THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setMapTheme(t.id)}
                  className={cn(
                    'w-full text-left px-2 py-1.5 rounded text-sm transition-colors',
                    mapTheme === t.id
                      ? 'bg-teal-50 dark:bg-teal-950 text-teal-600 dark:text-teal-400 font-medium'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300',
                  )}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Vehicle detail sheet (bottom) */}
      {selectedVehicle && (
        <VehicleDetailSheet
          vehicle={selectedVehicle}
          onClose={() => setSelectedVehicle(null)}
        />
      )}
    </div>
  )
}

function createVehicleIcon(v: FleetVehicle) {
  const L = require('leaflet')
  const colors: Record<string, string> = {
    available: '#16a34a',
    filling: '#eab308',
    at_capacity: '#dc2626',
    overloaded: '#dc2626',
  }
  const color = colors[v.tier] ?? colors.available
  const arrow = v.direction === 'forward' ? '▲' : '▼'
  const blink = v.tier === 'overloaded' ? 'animation: blink 1s infinite;' : ''

  return L.divIcon({
    html: `
      <div style="position: relative; display: flex; align-items: center; justify-content: center;">
        <div style="
          background: ${color};
          color: white;
          border-radius: 50%;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 9px;
          font-weight: bold;
          border: 2px solid white;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          ${blink}
        ">
          ${v.routeCode}
        </div>
        <div style="
          position: absolute;
          bottom: -2px;
          right: -2px;
          background: white;
          color: ${color};
          border-radius: 50%;
          width: 14px;
          height: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 8px;
          font-weight: bold;
          border: 1px solid ${color};
        ">
          ${arrow}
        </div>
      </div>
    `,
    className: 'vehicle-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  })
}

function VehicleDetailSheet({ vehicle, onClose }: { vehicle: FleetVehicle; onClose: () => void }) {
  const { data: eta } = useQuery({
    queryKey: ['eta', vehicle.vehicleId],
    queryFn: () => fetch(`/api/v1/eta/${vehicle.vehicleId}`).then((r) => r.json()),
    staleTime: 30_000,
  })

  return (
    <div className="absolute bottom-0 left-0 right-0 z-[1001] bg-white dark:bg-slate-900 rounded-t-xl shadow-2xl border-t border-slate-200 dark:border-slate-800 p-4 max-h-[60%] overflow-y-auto">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg text-slate-900 dark:text-slate-100">{vehicle.vehicleCode}</span>
            <TierPill tier={vehicle.tier} />
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Route {vehicle.routeCode} — {vehicle.routeName}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {vehicle.vehicleType} • {vehicle.occupancy}/{vehicle.capacity} riders • {vehicle.speedKph} kph • {vehicle.direction}
          </p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
      </div>

      {eta?.stops?.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-slate-400 uppercase">Next Stops</p>
          {eta.stops.slice(0, 3).map((s: any) => (
            <div key={s.seq} className="flex items-center justify-between text-sm py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
              <span className="text-slate-600 dark:text-slate-300">{s.stopName ?? `Stop ${s.seq}`}</span>
              <span className="text-slate-400">{s.etaFormatted}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
