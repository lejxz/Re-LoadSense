'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useQuery as useReactQuery } from '@tanstack/react-query'
import { Search, Navigation, Clock, Footprints } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { TierPill } from '@/components/shared/tier-pill'
import { useUIStore } from '@/stores/ui-store'
import { postTripSuggestions, fetchPlaces, type TripSuggestion } from '../api'

export default function PlanPage() {
  const [originQuery, setOriginQuery] = useState('')
  const [destQuery, setDestQuery] = useState('')
  const [origin, setOrigin] = useState<{ lat: number; lon: number; name?: string } | null>(null)
  const [destination, setDestination] = useState<{ lat: number; lon: number; name?: string } | null>(null)
  const [suggestions, setSuggestions] = useState<TripSuggestion[]>([])
  const [planning, setPlanning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tripDestination = useUIStore((s) => s.tripDestination)

  // Pre-fill destination from Home search
  useEffect(() => {
    if (tripDestination) {
      setDestination(tripDestination)
      setDestQuery(tripDestination.name ?? '')
    }
  }, [tripDestination])

  // Place search for origin
  const { data: originResults } = useReactQuery({
    queryKey: ['places', originQuery],
    queryFn: () => fetchPlaces(originQuery),
    enabled: originQuery.length >= 2,
    staleTime: 300_000,
  })

  const planTrip = async () => {
    if (!origin || !destination) {
      setError('Please select both origin and destination.')
      return
    }
    setPlanning(true)
    setError(null)
    try {
      const result = await postTripSuggestions(origin, destination, origin.name, destination.name)
      setSuggestions(result.suggestions)
      if (result.suggestions.length === 0) {
        setError(result.message ?? 'No routes found between these points.')
      }
    } catch {
      setError('Trip planning failed. Please try again.')
    } finally {
      setPlanning(false)
    }
  }

  const useMyLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({ lat: pos.coords.latitude, lon: pos.coords.longitude, name: 'My location' })
        setOriginQuery('My location')
      },
      () => setError('Could not get your location.'),
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Plan Trip</h1>

      {/* Origin */}
      <div className="space-y-1">
        <label className="text-xs text-slate-400">From</label>
        <div className="flex gap-2">
          <Input
            placeholder="Search origin..."
            value={originQuery}
            onChange={(e) => setOriginQuery(e.target.value)}
            className="flex-1"
          />
          <Button onClick={useMyLocation} variant="outline" size="icon" className="shrink-0">
            <Navigation size={16} />
          </Button>
        </div>
        {originResults && originQuery !== 'My location' && (
          <div className="space-y-1 mt-1">
            {originResults.slice(0, 4).map((p, i) => (
              <button
                key={i}
                onClick={() => { setOrigin(p); setOriginQuery(p.name) }}
                className="block w-full text-left px-2 py-1 rounded text-sm hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
              >
                {p.name} <span className="text-xs text-slate-400">({p.placeType})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Destination */}
      <div className="space-y-1">
        <label className="text-xs text-slate-400">To</label>
        <Input
          placeholder="Search destination..."
          value={destQuery}
          onChange={(e) => { setDestQuery(e.target.value); setDestination(null) }}
        />
      </div>

      {/* Search button */}
      <Button onClick={planTrip} disabled={planning} className="w-full bg-teal-600 hover:bg-teal-700">
        {planning ? 'Planning...' : 'Find Routes'}
      </Button>

      {error && <p className="text-sm text-red-500 text-center">{error}</p>}

      {/* Results */}
      {suggestions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-slate-400 uppercase">{suggestions.length} Suggestions</h2>
          {suggestions.map((s, i) => (
            <Card key={s.id} className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 rounded-full bg-teal-100 dark:bg-teal-950 flex items-center justify-center text-xs font-bold text-teal-600 dark:text-teal-400">
                  {i + 1}
                </span>
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100 flex items-center gap-1">
                  <Clock size={14} /> {s.totalDurationMin} min
                </span>
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Footprints size={12} /> {s.totalWalkingM}m walk
                </span>
              </div>
              {/* Legs */}
              <div className="space-y-1 ml-8">
                {s.legs.map((leg, j) => (
                  <div key={j} className="text-xs">
                    {leg.type === 'walk' ? (
                      <span className="text-slate-400">
                        🚶 Walk {leg.distanceM}m ({leg.durationMin} min)
                      </span>
                    ) : (
                      <span className="text-slate-600 dark:text-slate-300">
                        🚌 Board <span className="font-mono font-semibold text-teal-600 dark:text-teal-400">{leg.routeCode}</span>
                        {leg.vehicleCode && ` (${leg.vehicleCode})`}
                        {leg.tier && <TierPill tier={leg.tier} className="ml-1 text-[10px]" />}
                        {leg.etaMin && ` • ${leg.etaMin} min ride`}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
