'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Search, Navigation, Clock, Footprints } from 'lucide-react'
import { TierPill } from '@/components/shared/tier-pill'
import { useUIStore } from '@/stores/ui-store'
import { postTripSuggestions, fetchPlaces, type TripSuggestion } from '../api'

export default function PlanPage() {
  const [originQuery, setOriginQuery] = useState('')
  const [destQuery, setDestQuery] = useState('')
  const [origin, setOrigin] = useState<any>(null)
  const [destination, setDestination] = useState<any>(null)
  const [suggestions, setSuggestions] = useState<TripSuggestion[]>([])
  const [planning, setPlanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const tripDestination = useUIStore(s => s.tripDestination)

  useState(() => { if (tripDestination) { setDestination(tripDestination); setDestQuery(tripDestination.name ?? '') } })

  const { data: originResults } = useQuery({ queryKey: ['places', originQuery], queryFn: () => fetchPlaces(originQuery), enabled: originQuery.length >= 2, staleTime: 300_000 })

  const planTrip = async () => {
    if (!origin || !destination) { setError('Please select both origin and destination.'); return }
    setPlanning(true); setError(null)
    try {
      const r = await postTripSuggestions(origin, destination, origin.name, destination.name)
      setSuggestions(r.suggestions)
      if (r.suggestions.length === 0) setError(r.message ?? 'No routes found.')
    } catch { setError('Trip planning failed.') } finally { setPlanning(false) }
  }

  const useMyLocation = () => { navigator.geolocation.getCurrentPosition(p => { setOrigin({ lat: p.coords.latitude, lon: p.coords.longitude, name: 'My location' }); setOriginQuery('My location') }, () => setError('Could not get your location.')) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%', overflow: 'auto', padding: '14px 18px 18px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#172027', fontFamily: 'Sora, Manrope, sans-serif', margin: 0 }}>Plan Trip</h2>

      <div>
        <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>From</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div className="routes-search-bar" style={{ flex: 1 }}>
            <Search size={16} className="search-icon" />
            <input className="route-search-input" placeholder="Search origin..." value={originQuery} onChange={e => setOriginQuery(e.target.value)} />
          </div>
          <button onClick={useMyLocation} className="icon-button" style={{ flexShrink: 0 }}><Navigation size={16} /></button>
        </div>
        {originResults && originQuery !== 'My location' && (
          <div style={{ marginTop: '4px' }}>
            {originResults.slice(0, 4).map((p, i) => <button key={i} onClick={() => { setOrigin(p); setOriginQuery(p.name) }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', fontSize: '13px', background: 'none', border: 'none', color: '#4f616b', cursor: 'pointer' }}>{p.name} <span style={{ fontSize: '11px', color: '#94a3b8' }}>({p.placeType})</span></button>)}
          </div>
        )}
      </div>

      <div>
        <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>To</label>
        <div className="routes-search-bar"><Search size={16} className="search-icon" /><input className="route-search-input" placeholder="Search destination..." value={destQuery} onChange={e => { setDestQuery(e.target.value); setDestination(null) }} /></div>
      </div>

      <button onClick={planTrip} className="button primary" disabled={planning} style={{ width: '100%' }}>{planning ? 'Planning...' : 'Find Routes'}</button>
      {error && <p style={{ fontSize: '13px', color: '#c93b31', textAlign: 'center' }}>{error}</p>}

      {suggestions.length > 0 && (
        <div className="mobile-list">
          <h3 className="eyebrow">{suggestions.length} Suggestions</h3>
          {suggestions.map((s, i) => (
            <div key={s.id} className="vehicle-card" style={{ display: 'block' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#dff6ee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#087b68' }}>{i + 1}</span>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#172027', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={14} /> {s.totalDurationMin} min</span>
                <span style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}><Footprints size={12} /> {s.totalWalkingM}m walk</span>
              </div>
              <div className="multi-leg-itinerary">
                {s.legs.map((leg, j) => (
                  <div key={j} className={`leg ${leg.type === 'walk' ? 'transfer-leg' : ''}`}>
                    <div className="leg-step">{leg.type === 'walk' ? '🚶' : '🚌'}</div>
                    <div>
                      {leg.type === 'walk' ? <span>Walk {leg.distanceM}m ({leg.durationMin} min)</span> : <span>Board <strong style={{ color: '#087b68' }}>{leg.routeCode}</strong>{leg.vehicleCode ? ` (${leg.vehicleCode})` : ''}{leg.tier ? <TierPill tier={leg.tier} className="text-[10px]" /> : null}{leg.etaMin ? ` • ${leg.etaMin} min` : ''}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
