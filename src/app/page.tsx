import { db } from '@/lib/db'

/**
 * Root page — a simple status dashboard showing the sim is live.
 * This is a placeholder until Phase 4 (Commuter App) replaces it with the
 * 5-tab mobile interface (Home / Map / Routes / Chat / Menu).
 *
 * For now: shows fleet count + API endpoint links so you can verify the
 * backend is working in the Preview Panel.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function getStats() {
  try {
    const [vehicles, routes, alerts, telemetry] = await Promise.all([
      db.vehicle.count({ where: { status: 'active' } }),
      db.route.count({ where: { status: 'active' } }),
      db.operatorAlert.count({ where: { status: { in: ['open', 'acknowledged'] } } }),
      db.telemetryLog.count(),
    ])
    return { vehicles, routes, alerts, telemetry }
  } catch {
    return { vehicles: 0, routes: 0, alerts: 0, telemetry: 0 }
  }
}

export default async function Home() {
  const stats = await getStats()

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            SIM DATA
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
            Re-LoadSense
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            PUV occupancy intelligence — Cebu demo
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Vehicles" value={stats.vehicles} color="text-teal-600" />
          <StatCard label="Routes" value={stats.routes} color="text-teal-600" />
          <StatCard label="Telemetry Logs" value={stats.telemetry} color="text-slate-600" />
          <StatCard label="Open Alerts" value={stats.alerts} color={stats.alerts > 0 ? 'text-red-600' : 'text-slate-600'} />
        </div>

        {/* API endpoints */}
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-2">
          <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            API Endpoints
          </h2>
          <div className="space-y-1 text-sm font-mono">
            <EndpointLink method="GET" path="/api/health" label="Liveness" />
            <EndpointLink method="GET" path="/api/ready" label="Readiness" />
            <EndpointLink method="GET" path="/api/v1/fleet" label="Live fleet" />
            <EndpointLink method="GET" path="/api/v1/routes" label="Routes list" />
            <EndpointLink method="GET" path="/api/v1/alerts" label="Alerts" />
            <EndpointLink method="POST" path="/api/cron/sim-tick" label="Advance sim (needs secret)" />
            <EndpointLink method="POST" path="/api/v1/chatbot" label="Boarding assistant" />
          </div>
        </div>

        {/* Status */}
        <div className="text-center text-xs text-slate-400 dark:text-slate-500">
          <p>Phase 2 complete — Core API is live.</p>
          <p className="mt-1">Phase 4 will build the commuter map UI here.</p>
          <p className="mt-2">Login: commuter@demo.com / operator@demo.com (demo123)</p>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4">
      <div className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{label}</div>
    </div>
  )
}

function EndpointLink({ method, path, label }: { method: string; path: string; label: string }) {
  const methodColor = method === 'GET' ? 'text-teal-600' : 'text-amber-600'
  return (
    <div className="flex items-center gap-2">
      <span className={`${methodColor} font-bold w-10 text-xs`}>{method}</span>
      <a href={path} className="text-slate-700 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-400 transition-colors">
        {path}
      </a>
      <span className="text-slate-400 dark:text-slate-500 text-xs ml-auto">{label}</span>
    </div>
  )
}
