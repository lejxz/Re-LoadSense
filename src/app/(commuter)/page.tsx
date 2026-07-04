'use client'

import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Search, MapPin, Navigation, MessageCircle, Bus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { TierPill } from '@/components/shared/tier-pill'
import { useUIStore } from '@/stores/ui-store'
import { fetchFleet, fetchPlaces, fetchRoutesNear } from './api'

export default function HomePage() {
  const [query, setQuery] = useState('')
  const router = useRouter()
  const setTripDestination = useUIStore((s) => s.setTripDestination)
  const setActiveTab = useUIStore((s) => s.setActiveTab)
  const setChatPreFill = useUIStore((s) => s.setChatPreFill)

  // Debounced place search
  const { data: places, isFetching: searching } = useQuery({
    queryKey: ['places', query],
    queryFn: () => fetchPlaces(query),
    enabled: query.length >= 2,
    staleTime: 300_000,
  })

  const onPlaceTap = useCallback(
    (place: { name: string; lat: number; lon: number; placeType: string | null }) => {
      setTripDestination({ lat: place.lat, lon: place.lon, name: place.name })
    },
    [setTripDestination],
  )

  const planTrip = (place: { lat: number; lon: number; name?: string }) => {
    setTripDestination({ lat: place.lat, lon: place.lon, name: place.name })
    router.push('/plan')
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <Input
          placeholder="Search places, landmarks, shops..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10"
        />
        {searching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
            searching...
          </div>
        )}
      </div>

      {/* Search results */}
      {places && places.length > 0 && (
        <div className="space-y-2">
          {places.map((p, i) => (
            <PlaceResultCard key={i} place={p} onTap={onPlaceTap} onPlanTrip={planTrip} />
          ))}
        </div>
      )}
      {places && places.length === 0 && query.length >= 2 && !searching && (
        <p className="text-sm text-slate-400 text-center py-4">No results found. Try a different search.</p>
      )}

      {/* Quick shortcuts */}
      {!query && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Quick Actions</h2>
          <div className="grid grid-cols-3 gap-2">
            <ShortcutCard
              icon={<MapPin size={20} />}
              label="Nearby stops"
              onClick={() => router.push('/map')}
            />
            <ShortcutCard
              icon={<MessageCircle size={20} />}
              label="Least crowded"
              onClick={() => {
                setChatPreFill('which jeepney is least crowded now?')
                router.push('/chat')
              }}
            />
            <ShortcutCard
              icon={<Bus size={20} />}
              label="Browse routes"
              onClick={() => router.push('/routes')}
            />
          </div>

          {/* Live fleet summary */}
          <LiveFleetSummary />
        </div>
      )}
    </div>
  )
}

function ShortcutCard({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-teal-400 dark:hover:border-teal-700 transition-colors"
    >
      <span className="text-teal-600 dark:text-teal-400">{icon}</span>
      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}</span>
    </button>
  )
}

function PlaceResultCard({
  place,
  onTap,
  onPlanTrip,
}: {
  place: { name: string; lat: number; lon: number; placeType: string | null }
  onTap: (p: { name: string; lat: number; lon: number; placeType: string | null }) => void
  onPlanTrip: (p: { lat: number; lon: number; name?: string }) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const { data: nearbyRoutes } = useQuery({
    queryKey: ['routes-near', place.lat, place.lon],
    queryFn: () => fetchRoutesNear(place.lat, place.lon),
    enabled: expanded,
  })

  return (
    <Card className="p-3 cursor-pointer hover:border-teal-400 transition-colors" onClick={() => { setExpanded(!expanded); onTap(place) }}>
      <div className="flex items-start gap-2">
        <MapPin size={16} className="text-teal-600 dark:text-teal-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">{place.name}</p>
          {place.placeType && (
            <p className="text-xs text-slate-400 capitalize">{place.placeType.replace(/_/g, ' ')}</p>
          )}
        </div>
      </div>
      {expanded && nearbyRoutes && (
        <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
          {nearbyRoutes.length > 0 ? (
            <>
              <p className="text-xs text-slate-400">Nearby routes:</p>
              {nearbyRoutes.slice(0, 3).map((r) => (
                <div key={r.routeId} className="flex items-center gap-2 text-xs">
                  <span className="font-mono font-semibold text-teal-600 dark:text-teal-400">{r.routeCode}</span>
                  <span className="text-slate-500 truncate">{r.routeName}</span>
                  <span className="text-slate-300 ml-auto">{Math.round(r.distanceM)}m</span>
                </div>
              ))}
              <button
                onClick={(e) => { e.stopPropagation(); onPlanTrip(place) }}
                className="mt-2 w-full text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline"
              >
                Plan trip to here →
              </button>
            </>
          ) : (
            <p className="text-xs text-slate-400">No routes near this place.</p>
          )}
        </div>
      )}
    </Card>
  )
}

function LiveFleetSummary() {
  const { data: fleet } = useQuery({
    queryKey: ['fleet', 'summary'],
    queryFn: () => fetchFleet(),
    refetchInterval: 5000,
    staleTime: 5000,
  })

  if (!fleet || fleet.vehicles.length === 0) return null

  const tiers = fleet.vehicles.reduce((acc, v) => {
    acc[v.tier] = (acc[v.tier] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Live Fleet</h2>
      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="text-2xl font-bold text-teal-600 dark:text-teal-400">{fleet.vehicles.length}</div>
          <div className="text-xs text-slate-400">Active vehicles</div>
        </div>
        <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap gap-1">
            {Object.entries(tiers).map(([tier, count]) => (
              <TierPill key={tier} tier={tier} className="text-[10px]" />
            ))}
          </div>
          <div className="text-xs text-slate-400 mt-1">Occupancy tiers</div>
        </div>
      </div>
    </div>
  )
}
