'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
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

  const filtered = data?.routes.filter(
    (r) =>
      !query ||
      r.code.toLowerCase().includes(query.toLowerCase()) ||
      r.name.toLowerCase().includes(query.toLowerCase()),
  ) ?? []

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Routes</h1>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <Input
          placeholder="Search route code or name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Filter chips */}
      <div className="flex gap-2">
        {(['all', 'hasLive'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-teal-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
            }`}
          >
            {f === 'all' ? 'All routes' : 'Has live vehicles'}
          </button>
        ))}
      </div>

      {/* Route list */}
      <div className="space-y-2">
        {isLoading && <p className="text-sm text-slate-400">Loading routes...</p>}
        {filtered.map((r) => (
          <Card
            key={r.id}
            className="p-3 cursor-pointer hover:border-teal-400 transition-colors"
            onClick={() => router.push(`/routes/${r.id}`)}
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-teal-100 dark:bg-teal-950 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-teal-600 dark:text-teal-400">{r.code}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{r.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-slate-400">{r.vehicleCount} live</span>
                  {r.allowedVehicleTypes.map((t) => (
                    <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 capitalize">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        ))}
        {filtered.length === 0 && !isLoading && (
          <p className="text-sm text-slate-400 text-center py-4">No routes found.</p>
        )}
      </div>
    </div>
  )
}
