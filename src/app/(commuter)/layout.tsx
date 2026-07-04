'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Map, Bus, MessageCircle, Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SimBadge } from '@/components/shared/sim-badge'

const TABS = [
  { id: 'home', label: 'Home', icon: Home, href: '/' },
  { id: 'map', label: 'Map', icon: Map, href: '/map' },
  { id: 'routes', label: 'Routes', icon: Bus, href: '/routes' },
  { id: 'chat', label: 'Chat', icon: MessageCircle, href: '/chat' },
  { id: 'menu', label: 'Menu', icon: Menu, href: '/menu' },
] as const

export default function CommuterLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isMapTab = pathname === '/map'

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #dce8e3, #e8f0ee)' }}>
      {/* Phone frame wrapper — looks like a phone on desktop, full-screen on mobile */}
      <div className="phone-frame-wrapper flex flex-col" style={{ background: 'var(--wash)' }}>
        {/* Header — hidden on map tab for full-screen map */}
        {!isMapTab && (
          <header className="flex items-center justify-between px-4 py-3 shrink-0" style={{ background: 'var(--panel)' }}>
            <div className="flex flex-col">
              <span className="text-xs text-slate-400">Good day,</span>
              <span className="text-xl font-extrabold tracking-tight" style={{ color: 'var(--teal)' }}>
                Re-LoadSense
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Cebu</span>
              <SimBadge />
            </div>
          </header>
        )}

        {/* Main content — flex-1 fills the space */}
        <main className="flex-1 overflow-hidden flex flex-col min-h-0">
          {children}
        </main>

        {/* Bottom nav — pill style, active = mint background */}
        <nav className="grid grid-cols-5 gap-1.5 px-3 py-2 shrink-0" style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)' }}>
          {TABS.map((tab) => {
            const isActive = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href)
            const Icon = tab.icon
            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={cn(
                  'flex flex-col items-center gap-0.5 py-2 rounded-full transition-all min-h-[44px] justify-center',
                  isActive ? 'font-bold' : 'font-medium',
                )}
                style={
                  isActive
                    ? { background: 'var(--mint)', color: 'var(--teal-dark)' }
                    : { color: '#64748b' }
                }
              >
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[10px]">{tab.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
