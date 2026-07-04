'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { fetchRoutes } from '../api'

export default function RoutesPage() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'hasLive'>('all')
  const router = useRouter()

  const { data, isLoading } = useQuery({
    queryKey: ['routes', filter],
    queryFn: () => fetchRoutes({ hasLive: filter === 'hasLive' }),
    staleTime: 30_000,
  })

  const filtered = data?.routes.filter(r => !query || r.code.toLowerCase().includes(query.toLowerCase()) || r.name.toLowerCase().includes(query.toLowerCase())) ?? []

  return (
    <div className="route-directory-sheet" style={{ padding: '4px 0 18px' }}>
      <div className="routes-header">
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#172027', fontFamily: 'Sora, Manrope, sans-serif' }}>Explore Routes</h2>
      </div>
      <div className="routes-search-container">
        <div className="routes-search-bar">
          <Search size={16} className="search-icon" />
          <input className="route-search-input" placeholder="Search for a route..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        {(['all', 'hasLive'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={filter === f ? 'button primary' : 'button'} style={{ fontSize: '12px', padding: '6px 14px', minHeight: 'auto' }}>
            {f === 'all' ? 'All routes' : 'Has live PUVs'}
          </button>
        ))}
      </div>
      <div className="route-list">
        {isLoading && <p className="muted">Loading routes...</p>}
        {filtered.map(r => (
          <div key={r.id} className="route-card" style={{ cursor: 'pointer' }} onClick={() => router.push(`/routes/${r.id}`)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#dff6ee', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#087b68' }}>{r.code}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '14px', fontWeight: 600, color: '#172027', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>{r.vehicleCount} live</span>
                  {r.allowedVehicleTypes.map(t => <span key={t} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: '#f3f7f6', color: '#4f616b', textTransform: 'capitalize' }}>{t}</span>)}
                </div>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && !isLoading && <p className="muted" style={{ textAlign: 'center', padding: '16px 0' }}>No routes found.</p>}
      </div>
    </div>
  )
}
