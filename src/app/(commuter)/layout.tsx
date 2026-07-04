'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Map, Bus, MessageCircle, Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SimBadge } from '@/components/shared/sim-badge'

// Hardcoded brand colors (not CSS vars — Tailwind 4 strips unused :root vars)
const COLORS = {
  teal: '#087b68',
  tealDark: '#045c51',
  mint: '#dff6ee',
  ink: '#172027',
  wash: '#f3f7f6',
  panel: '#ffffff',
  washDark: '#0a0f14',
  panelDark: '#0f172a',
  inkDark: '#e2e8f0',
  mintDark: '#0d2823',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate600: '#475569',
}

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
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

  const c = isDark
    ? { ...COLORS, wash: COLORS.washDark, panel: COLORS.panelDark, ink: COLORS.inkDark, mint: COLORS.mintDark }
    : COLORS

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #dce8e3, #e8f0ee)' }}
    >
      <div
        className="phone-frame-wrapper flex flex-col"
        style={{ background: c.wash }}
      >
        {/* Header — hidden on map tab for full-screen map */}
        {!isMapTab && (
          <header
            className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{ background: c.panel }}
          >
            <div className="flex flex-col">
              <span className="text-xs" style={{ color: COLORS.slate500 }}>Good day,</span>
              <span className="text-xl font-extrabold tracking-tight" style={{ color: c.teal }}>
                Re-LoadSense
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: COLORS.slate500 }}>Cebu</span>
              <SimBadge />
            </div>
          </header>
        )}

        {/* Main content */}
        <main className="flex-1 overflow-hidden flex flex-col min-h-0">
          {children}
        </main>

        {/* Bottom nav — pill style */}
        <nav
          className="grid grid-cols-5 gap-1.5 px-3 py-2 shrink-0"
          style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)' }}
        >
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
                    ? { background: c.mint, color: c.tealDark }
                    : { color: COLORS.slate500 }
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
