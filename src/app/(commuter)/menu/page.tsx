'use client'

import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Moon, Sun, Monitor, Info, Shield, ArrowRight } from 'lucide-react'
import { Card } from '@/components/ui/card'

export default function MenuPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  return (
    <div className="h-full overflow-y-auto p-4 space-y-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Menu</h1>

      {/* Profile */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold text-slate-400 uppercase">Profile</h2>
        <Card className="p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-teal-100 dark:bg-teal-950 flex items-center justify-center">
            <span className="text-teal-600 dark:text-teal-400 font-bold">C</span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Commuter</p>
            <p className="text-xs text-slate-400">Demo mode</p>
          </div>
          <button
            onClick={() => router.push('/operator')}
            className="flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400 hover:underline"
          >
            Switch to operator <ArrowRight size={12} />
          </button>
        </Card>
      </section>

      {/* Preferences */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold text-slate-400 uppercase">Preferences</h2>
        <Card className="p-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Theme</p>
            <div className="flex gap-2">
              {[
                { id: 'light', label: 'Light', icon: Sun },
                { id: 'dark', label: 'Dark', icon: Moon },
                { id: 'system', label: 'System', icon: Monitor },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTheme(id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    theme === id
                      ? 'bg-teal-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Language</p>
            <p className="text-xs text-slate-400">English (more languages coming soon)</p>
          </div>
        </Card>
      </section>

      {/* About */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold text-slate-400 uppercase">About</h2>
        <Card className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Info size={16} className="text-teal-600 dark:text-teal-400" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">What is Re-LoadSense?</p>
          </div>
          <p className="text-xs text-slate-400">
            Re-LoadSense is a PUV occupancy intelligence platform that tells commuters how full
            the next jeepney is, helps operators manage their fleet, and gives regulators
            city-wide compliance data.
          </p>
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 font-medium">
              SIM DATA
            </span>
            <p className="text-xs text-slate-400">
              All vehicle data is simulated for demo purposes.
            </p>
          </div>
        </Card>
      </section>

      {/* Data & Privacy */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold text-slate-400 uppercase">Data & Privacy</h2>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield size={16} className="text-teal-600 dark:text-teal-400" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Your Data</p>
          </div>
          <p className="text-xs text-slate-400">
            Chatbot queries are PII-redacted before storage. No personal data is collected in this demo.
          </p>
        </Card>
      </section>

      <p className="text-center text-xs text-slate-400 pb-4">Re-LoadSense v0.1.0 — Cebu Demo</p>
    </div>
  )
}
