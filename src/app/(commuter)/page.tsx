'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Search, MapPin, MessageCircle, Bus, Clock, Users, Shield, RefreshCw } from 'lucide-react'
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
      {/* Search */}
      <div className="routes-search-bar" style={{ marginTop: '14px' }}>
        <Search size={16} className="search-icon" />
        <input
          className="route-search-input"
          placeholder="Search places, landmarks, shops..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {searching && <span style={{ fontSize: '12px', color: '#94a3b8', flexShrink: 0 }}>...</span>}
      </div>

      {/* Search results */}
      {places && places.length > 0 && (
        <div className="mobile-list">
          {places.map((p, i) => (
            <PlaceResultCard key={i} place={p} onTap={(place) => setTripDestination({ lat: place.lat, lon: place.lon, name: place.name })} onPlanTrip={(place) => { setTripDestination({ lat: place.lat, lon: place.lon, name: place.name }); router.push('/plan') }} />
          ))}
        </div>
      )}
      {places && places.length === 0 && query.length >= 2 && !searching && (
        <p className="muted" style={{ textAlign: 'center', padding: '16px 0' }}>No results found.</p>
      )}

      {/* Default content */}
      {!query && (
        <>
          {/* Hero card */}
          <div className="hero-card">
            <p className="eyebrow">Best boarding option</p>
            {bestVehicle ? (
              <>
                <h2>{bestVehicle.vehicleCode}</h2>
                <p style={{ fontSize: '14px' }}>Route {bestVehicle.routeCode} — {bestVehicle.routeName}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <TierPill tier={bestVehicle.tier} />
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>{bestVehicle.occupancy}/{bestVehicle.capacity} riders • {bestVehicle.speedKph} kph</span>
                </div>
              </>
            ) : (
              <p>Waiting for telemetry...</p>
            )}
          </div>

          {/* Quick stats */}
          <div className="quick-grid">
            <article>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={14} /> ETA</span>
              <strong>{bestVehicle ? '~5 min' : '--'}</strong>
            </article>
            <article>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Users size={14} /> Load</span>
              <strong>{bestVehicle ? `${bestVehicle.occupancy}/${bestVehicle.capacity}` : '--'}</strong>
            </article>
            <article>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Shield size={14} /> Status</span>
              <strong>{bestVehicle ? bestVehicle.tier.replace(/_/g, ' ') : '--'}</strong>
            </article>
          </div>

          {/* Quick shortcuts */}
          <div className="quick-grid">
            <article onClick={() => router.push('/map')} style={{ cursor: 'pointer', textAlign: 'center' }}>
              <MapPin size={20} style={{ color: '#087b68' }} />
              <strong style={{ fontSize: '12px' }}>Nearby stops</strong>
            </article>
            <article onClick={() => { setChatPreFill('which jeepney is least crowded now?'); router.push('/chat') }} style={{ cursor: 'pointer', textAlign: 'center' }}>
              <MessageCircle size={20} style={{ color: '#087b68' }} />
              <strong style={{ fontSize: '12px' }}>Least crowded</strong>
            </article>
            <article onClick={() => router.push('/routes')} style={{ cursor: 'pointer', textAlign: 'center' }}>
              <Bus size={20} style={{ color: '#087b68' }} />
              <strong style={{ fontSize: '12px' }}>Routes</strong>
            </article>
          </div>

          {/* Approaching PUVs */}
          <div className="section-head">
            <h3>Approaching PUVs</h3>
            <button onClick={() => refetch()} className="text-button"><RefreshCw size={12} /> Refresh</button>
          </div>
          <div className="mobile-list">
            {fleet?.vehicles?.filter((v) => v.online).slice(0, 6).map((v) => (
              <div key={v.vehicleId} className="vehicle-card">
                <div>
                  <h4>{v.vehicleCode} <span>• {v.routeCode}</span></h4>
                  <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>{v.occupancy}/{v.capacity} riders • {v.speedKph} kph • {v.direction}</p>
                </div>
                <TierPill tier={v.tier} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function PlaceResultCard({ place, onTap, onPlanTrip }: { place: { name: string; lat: number; lon: number; placeType: string | null }, onTap: (p: any) => void, onPlanTrip: (p: any) => void }) {
  const [expanded, setExpanded] = useState(false)
  const { data: nearbyRoutes } = useQuery({
    queryKey: ['routes-near', place.lat, place.lon],
    queryFn: () => fetchRoutesNear(place.lat, place.lon),
    enabled: expanded,
  })

  return (
    <div className="route-card" style={{ cursor: 'pointer' }} onClick={() => { setExpanded(!expanded); onTap(place) }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <MapPin size={16} style={{ color: '#087b68', marginTop: '2px', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 600, fontSize: '14px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{place.name}</p>
          {place.placeType && <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0, textTransform: 'capitalize' }}>{place.placeType.replace(/_/g, ' ')}</p>}
        </div>
      </div>
      {expanded && nearbyRoutes && (
        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #d9e4e7' }}>
          {nearbyRoutes.length > 0 ? (
            <>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 4px' }}>Nearby routes:</p>
              {nearbyRoutes.slice(0, 3).map((r: any) => (
                <div key={r.routeId} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#087b68' }}>{r.routeCode}</span>
                  <span style={{ color: '#4f616b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.routeName}</span>
                  <span style={{ color: '#cbd5e1', marginLeft: 'auto' }}>{Math.round(r.distanceM)}m</span>
                </div>
              ))}
              <button onClick={(e) => { e.stopPropagation(); onPlanTrip(place) }} className="text-button" style={{ marginTop: '8px', width: '100%', textAlign: 'left' }}>Plan trip to here →</button>
            </>
          ) : (
            <p style={{ fontSize: '12px', color: '#94a3b8' }}>No routes near this place.</p>
          )}
        </div>
      )}
    </div>
  )
}
