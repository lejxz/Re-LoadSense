'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Search, MapPin, Navigation, MessageCircle, Bus, Clock, Users, Shield, RefreshCw } from 'lucide-react'
import { TierPill } from '@/components/shared/tier-pill'
import { useUIStore } from '@/stores/ui-store'
import { fetchFleet, fetchPlaces, fetchRoutesNear, type FleetVehicle } from './api'

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

  const { data: fleet, refetch } = useQuery({
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

  const planTrip = (place: { lat: number; lon: number; name?: string }) => {
    setTripDestination({ lat: place.lat, lon: place.lon, name: place.name })
    router.push('/plan')
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '4px 18px 18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Search bar */}
      <div style={{ position: 'relative' }}>
        <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
        <input
          placeholder="Search places, landmarks, shops..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 12px 12px 40px',
            borderRadius: '12px',
            border: '1px solid #d9e4e7',
            background: '#fff',
            fontSize: '14px',
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />
        {searching && <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: '#94a3b8' }}>searching...</span>}
      </div>

      {/* Search results */}
      {places && places.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {places.map((p, i) => (
            <PlaceResultCard key={i} place={p} onTap={(place) => setTripDestination({ lat: place.lat, lon: place.lon, name: place.name })} onPlanTrip={planTrip} />
          ))}
        </div>
      )}
      {places && places.length === 0 && query.length >= 2 && !searching && (
        <p style={{ fontSize: '14px', color: '#94a3b8', textAlign: 'center', padding: '16px 0' }}>No results found. Try a different search.</p>
      )}

      {/* Default content */}
      {!query && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Hero card */}
          <div style={{
            background: '#fff',
            border: '1px solid rgba(0,0,0,0.05)',
            borderRadius: '24px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.04)',
            padding: '18px',
            display: 'grid',
            gap: '10px',
          }}>
            <p style={{ color: '#087b68', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', margin: 0 }}>Best boarding option</p>
            {bestVehicle ? (
              <>
                <h2 style={{ fontSize: '25px', lineHeight: 1.1, margin: 0, color: '#172027', fontFamily: 'Sora, Manrope, sans-serif' }}>
                  {bestVehicle.vehicleCode}
                </h2>
                <p style={{ fontSize: '14px', color: '#4f616b', margin: 0 }}>Route {bestVehicle.routeCode} — {bestVehicle.routeName}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <TierPill tier={bestVehicle.tier} />
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                    {bestVehicle.occupancy}/{bestVehicle.capacity} riders • {bestVehicle.speedKph} kph
                  </span>
                </div>
              </>
            ) : (
              <p style={{ fontSize: '14px', color: '#4f616b', margin: 0 }}>Waiting for telemetry...</p>
            )}
          </div>

          {/* Quick stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            <QuickStat icon={<Clock size={14} />} label="ETA" value={bestVehicle ? '~5 min' : '--'} />
            <QuickStat icon={<Users size={14} />} label="Load" value={bestVehicle ? `${bestVehicle.occupancy}/${bestVehicle.capacity}` : '--'} />
            <QuickStat icon={<Shield size={14} />} label="Status" value={bestVehicle ? bestVehicle.tier.replace(/_/g, ' ') : '--'} />
          </div>

          {/* Quick shortcuts */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            <ShortcutButton icon={<MapPin size={20} />} label="Nearby" onClick={() => router.push('/map')} />
            <ShortcutButton icon={<MessageCircle size={20} />} label="Least crowded" onClick={() => { setChatPreFill('which jeepney is least crowded now?'); router.push('/chat') }} />
            <ShortcutButton icon={<Bus size={20} />} label="Routes" onClick={() => router.push('/routes')} />
          </div>

          {/* Approaching PUVs */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#172027', margin: 0, fontFamily: 'Sora, Manrope, sans-serif' }}>Approaching PUVs</h3>
              <button onClick={() => refetch()} style={{ background: 'none', border: 'none', color: '#087b68', fontSize: '12px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <RefreshCw size={12} /> Refresh
              </button>
            </div>
            <div style={{ display: 'grid', gap: '10px' }}>
              {fleet?.vehicles?.filter((v) => v.online).slice(0, 5).map((v) => (
                <VehicleCard key={v.vehicleId} vehicle={v} />
              )) ?? (
                <p style={{ fontSize: '14px', color: '#94a3b8' }}>No live vehicles.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function QuickStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid rgba(0,0,0,0.05)',
      borderRadius: '16px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.02)',
      padding: '12px',
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#4f616b', fontSize: '12px' }}>{icon} {label}</span>
      <strong style={{ display: 'block', marginTop: '4px', fontSize: '20px', color: '#172027' }}>{value}</strong>
    </div>
  )
}

function ShortcutButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '8px',
      padding: '12px',
      borderRadius: '16px',
      background: '#fff',
      border: '1px solid rgba(0,0,0,0.05)',
      boxShadow: '0 4px 12px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.02)',
      cursor: 'pointer',
      transition: 'border-color 0.2s',
    }}>
      <span style={{ color: '#087b68' }}>{icon}</span>
      <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>{label}</span>
    </button>
  )
}

function VehicleCard({ vehicle }: { vehicle: FleetVehicle }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid rgba(0,0,0,0.05)',
      borderRadius: '24px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.04)',
      padding: '13px',
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      gap: '10px',
      alignItems: 'center',
    }}>
      <div>
        <h4 style={{ fontSize: '15px', margin: 0, color: '#172027' }}>
          {vehicle.vehicleCode} <span style={{ color: '#4f616b', fontWeight: 700 }}>• {vehicle.routeCode}</span>
        </h4>
        <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>
          {vehicle.occupancy}/{vehicle.capacity} riders • {vehicle.speedKph} kph • {vehicle.direction}
        </p>
      </div>
      <TierPill tier={vehicle.tier} />
    </div>
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
      onClick={() => { setExpanded(!expanded); onTap(place) }}
      style={{
        background: '#fff',
        border: '1px solid rgba(0,0,0,0.05)',
        borderRadius: '16px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.02)',
        padding: '13px',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <MapPin size={16} style={{ color: '#087b68', marginTop: '2px', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 600, fontSize: '14px', color: '#172027', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{place.name}</p>
          {place.placeType && <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0, textTransform: 'capitalize' }}>{place.placeType.replace(/_/g, ' ')}</p>}
        </div>
      </div>
      {expanded && nearbyRoutes && (
        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #d9e4e7' }}>
          {nearbyRoutes.length > 0 ? (
            <>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 4px' }}>Nearby routes:</p>
              {nearbyRoutes.slice(0, 3).map((r) => (
                <div key={r.routeId} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#087b68' }}>{r.routeCode}</span>
                  <span style={{ color: '#4f616b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.routeName}</span>
                  <span style={{ color: '#cbd5e1', marginLeft: 'auto' }}>{Math.round(r.distanceM)}m</span>
                </div>
              ))}
              <button onClick={(e) => { e.stopPropagation(); onPlanTrip(place) }} style={{ marginTop: '8px', width: '100%', fontSize: '12px', fontWeight: 600, color: '#087b68', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                Plan trip to here →
              </button>
            </>
          ) : (
            <p style={{ fontSize: '12px', color: '#94a3b8' }}>No routes near this place.</p>
          )}
        </div>
      )}
    </div>
  )
}
