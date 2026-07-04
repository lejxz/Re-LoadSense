'use client'

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchRouteDetail, fetchFleet } from '../../api'
import { TierPill } from '@/components/shared/tier-pill'

export default function RouteDetailPage({ params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = use(params)

  const { data: route, isLoading } = useQuery({
    queryKey: ['route-detail', routeId],
    queryFn: () => fetchRouteDetail(routeId),
    staleTime: 60_000,
  })

  const { data: fleet } = useQuery({
    queryKey: ['fleet', 'route', routeId],
    queryFn: () => fetchFleet({ routeId }),
    refetchInterval: 5000,
  })

  if (isLoading) return <div className="p-4 text-slate-400">Loading route...</div>
  if (!route) return null

  const vehiclesOnRoute = fleet?.vehicles ?? []

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Route header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          <span className="text-teal-600 dark:text-teal-400">{route.code}</span>
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{route.name}</p>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-slate-400">{route.distanceKm?.toFixed(1)} km</span>
          <span className="text-xs text-slate-400">•</span>
          <span className="text-xs text-slate-400 capitalize">{route.routeType}</span>
          <span className="text-xs text-slate-400">•</span>
          <span className="text-xs text-slate-400">{vehiclesOnRoute.length} live</span>
        </div>
      </div>

      {/* Live vehicles on this route */}
      <div className="space-y-2">
        <h2 className="text-xs font-semibold text-slate-400 uppercase">Live Vehicles</h2>
        {vehiclesOnRoute.length === 0 ? (
          <p className="text-sm text-slate-400">No live vehicles on this route right now.</p>
        ) : (
          vehiclesOnRoute.map((v) => (
            <div key={v.vehicleId} className="flex items-center gap-3 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="font-mono text-sm font-semibold text-teal-600 dark:text-teal-400">{v.vehicleCode}</span>
              <TierPill tier={v.tier} />
              <span className="text-xs text-slate-400 ml-auto">
                {v.occupancy}/{v.capacity} • {v.speedKph} kph
              </span>
            </div>
          ))
        )}
      </div>

      {/* Stops list */}
      <div className="space-y-2">
        <h2 className="text-xs font-semibold text-slate-400 uppercase">Stops ({route.stops.length})</h2>
        <div className="space-y-1">
          {route.stops.map((s, i) => (
            <div key={s.seq} className="flex items-center gap-3 py-2">
              <div className="flex flex-col items-center">
                <div className={`w-3 h-3 rounded-full ${i === 0 ? 'bg-teal-600' : i === route.stops.length - 1 ? 'bg-red-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                {i < route.stops.length - 1 && <div className="w-0.5 h-8 bg-slate-200 dark:bg-slate-700" />}
              </div>
              <span className="text-sm text-slate-600 dark:text-slate-300">{s.stopName ?? `Stop ${s.seq}`}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
