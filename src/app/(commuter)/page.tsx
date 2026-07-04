'use client'

import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Search, MapPin, Navigation, MessageCircle, Bus, Clock, Users, Shield } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { TierPill } from '@/components/shared/tier-pill'
import { useUIStore } from '@/stores/ui-store'
import { fetchFleet, fetchPlaces, fetchRoutesNear } from './api'

const C = {
  teal: '#087b68',
  tealDark: '#045c51',
  mint: '#dff6ee',
  ink: '#172027',
  wash: '#f3f7f6',
  panel: '#ffffff',
  border: 'rgba(0,0,0,0.05)',
  slate400: '#94a3b8',
  slate500: '#64748b',
}

export default function HomePage() {
  const [query, setQuery] = useState('')
  const router = useRouter()
  const setTripDestination = useUIStore((s) => s.setTripDestination)
  const setChatPreFill = useUIStore((s) => s.setChatPreFill)

  const { data: places, isFetching: searching } = useQuery({
    queryKey: ['places', query],
    queryFn: () => fetchPlaces(query),
    enabled: query.length >= 2,
    staleTime: 300_000,
  })

  const { data: fleet } = useQuery({
    queryKey: ['fleet', 'home'],
    queryFn: () => fetchFleet({ online: true }),
    refetchInterval: 5000,
    staleTime: 3000,
  })

  const bestVehicle = fleet?.vehicles
    ?.filter((v) => v.online)
    ?.sort((a, b) => {
      const tr: Record<string, number> = { available: 0, filling: 1, at_capacity: 2, overloaded: 3 }
      return (tr[a.tier] ?? 9) - (tr[b.tier] ?? 9) || a.occupancy - b.occupancy
    })?.[0]

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
    <div className="h-full overflow-y-auto px-4 py-4 space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2" size={18} style={{ color: C.slate400 }} />
        <Input
          placeholder="Search places, landmarks, shops..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10 rounded-xl"
        />
        {searching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: C.slate400 }}>searching...</div>
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
        <p className="text-sm text-center py-4" style={{ color: C.slate400 }}>No results found. Try a different search.</p>
      )}

      {/* Default content */}
      {!query && (
        <div className="space-y-4">
          {/* Hero card */}
          {bestVehicle && (
            <div
              className="p-4 space-y-3"
              style={{ background: C.panel, borderRadius: '20px', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
            >
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: C.teal }}>Best boarding option</p>
              <div>
                <h2 className="text-xl font-bold" style={{ color: C.ink }}>{bestVehicle.vehicleCode}</h2>
                <p className="text-sm" style={{ color: C.slate500 }}>Route {bestVehicle.routeCode} — {bestVehicle.routeName}</p>
              </div>
              <div className="flex items-center gap-2">
                <TierPill tier={bestVehicle.tier} />
                <span className="text-xs" style={{ color: C.slate400 }}>
                  {bestVehicle.occupancy}/{bestVehicle.capacity} riders • {bestVehicle.speedKph} kph
                </span>
              </div>
            </div>
          )}

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-2">
            <StatCard icon={<Clock size={14} />} label="ETA" value={bestVehicle ? '~5 min' : '--'} />
            <StatCard icon={<Users size={14} />} label="Load" value={bestVehicle ? `${bestVehicle.occupancy}/${bestVehicle.capacity}` : '--'} />
            <StatCard icon={<Shield size={14} />} label="Status" value={bestVehicle ? bestVehicle.tier.replace(/_/g, ' ') : '--'} />
          </div>

          {/* Quick shortcuts */}
          <div className="grid grid-cols-3 gap-2">
            <ShortcutCard icon={<MapPin size={20} />} label="Nearby stops" onClick={() => router.push('/map')} />
            <ShortcutCard icon={<MessageCircle size={20} />} label="Least crowded" onClick={() => { setChatPreFill('which jeepney is least crowded now?'); router.push('/chat') }} />
            <ShortcutCard icon={<Bus size={20} />} label="Browse routes" onClick={() => router.push('/routes')} />
          </div>

          {/* Live fleet summary */}
          {fleet && fleet.vehicles.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.slate400 }}>Live Fleet</h2>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-xl" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                  <div className="text-2xl font-bold" style={{ color: C.teal }}>{fleet.vehicles.length}</div>
                  <div className="text-xs" style={{ color: C.slate400 }}>Active vehicles</div>
                </div>
                <div className="p-3 rounded-xl" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(fleet.vehicles.reduce((acc, v) => { acc[v.tier] = (acc[v.tier] ?? 0) + 1; return acc }, {} as Record<string, number>)).map(([tier]) => (
                      <TierPill key={tier} tier={tier} className="text-[10px]" />
                    ))}
                  </div>
                  <div className="text-xs mt-1" style={{ color: C.slate400 }}>Occupancy tiers</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="p-3 rounded-xl" style={{ background: C.panel, border: `1px solid ${C.border}`, boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}>
      <span className="flex items-center gap-1 text-xs" style={{ color: C.slate400 }}>{icon} {label}</span>
      <strong className="block mt-1 text-lg" style={{ color: C.ink }}>{value}</strong>
    </div>
  )
}

function ShortcutCard({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 p-3 rounded-xl transition-colors hover:border-teal-400"
      style={{ background: C.panel, border: `1px solid ${C.border}`, boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}
    >
      <span style={{ color: C.teal }}>{icon}</span>
      <span className="text-xs font-medium" style={{ color: C.slate500 }}>{label}</span>
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
    <div
      className="p-3 cursor-pointer rounded-xl transition-colors hover:border-teal-400"
      style={{ background: C.panel, border: `1px solid ${C.border}`, boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}
      onClick={() => { setExpanded(!expanded); onTap(place) }}
    >
      <div className="flex items-start gap-2">
        <MapPin size={16} className="mt-0.5 shrink-0" style={{ color: C.teal }} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate" style={{ color: C.ink }}>{place.name}</p>
          {place.placeType && <p className="text-xs capitalize" style={{ color: C.slate400 }}>{place.placeType.replace(/_/g, ' ')}</p>}
        </div>
      </div>
      {expanded && nearbyRoutes && (
        <div className="mt-2 pt-2 space-y-1" style={{ borderTop: `1px solid ${C.border}` }}>
          {nearbyRoutes.length > 0 ? (
            <>
              <p className="text-xs" style={{ color: C.slate400 }}>Nearby routes:</p>
              {nearbyRoutes.slice(0, 3).map((r) => (
                <div key={r.routeId} className="flex items-center gap-2 text-xs">
                  <span className="font-mono font-semibold" style={{ color: C.teal }}>{r.routeCode}</span>
                  <span className="truncate" style={{ color: C.slate500 }}>{r.routeName}</span>
                  <span className="ml-auto" style={{ color: C.slate400 }}>{Math.round(r.distanceM)}m</span>
                </div>
              ))}
              <button
                onClick={(e) => { e.stopPropagation(); onPlanTrip(place) }}
                className="mt-2 w-full text-xs font-medium hover:underline"
                style={{ color: C.teal }}
              >
                Plan trip to here →
              </button>
            </>
          ) : (
            <p className="text-xs" style={{ color: C.slate400 }}>No routes near this place.</p>
          )}
        </div>
      )}
    </div>
  )
}
