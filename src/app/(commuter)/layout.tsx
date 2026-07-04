'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Map, Bus, MessageCircle, Menu as MenuIcon } from 'lucide-react'
import { SimBadge } from '@/components/shared/sim-badge'

const TABS = [
  { id: 'home', label: 'Home', icon: Home, href: '/' },
  { id: 'map', label: 'Map', icon: Map, href: '/map' },
  { id: 'routes', label: 'Routes', icon: Bus, href: '/routes' },
  { id: 'chat', label: 'Chat', icon: MessageCircle, href: '/chat' },
  { id: 'menu', label: 'Menu', icon: MenuIcon, href: '/menu' },
] as const

export default function CommuterLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isMapTab = pathname === '/map'

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #dce8e3, #e8f0ee)',
      fontFamily: 'Manrope, "Segoe UI", system-ui, -apple-system, sans-serif',
    }}>
      {/* Phone frame */}
      <div style={{
        width: 'min(430px, 100%)',
        height: 'min(900px, calc(100vh - 48px))',
        minHeight: '700px',
        border: '10px solid #182229',
        borderRadius: '34px',
        overflow: 'hidden',
        background: '#f3f7f6',
        boxShadow: '0 18px 60px rgba(24, 37, 45, 0.16)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Header — hidden on map tab */}
        {!isMapTab && (
          <header style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '15px 15px 10px',
            background: '#ffffff',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '13px', color: '#64748b', lineHeight: 1 }}>Good day,</span>
              <span style={{
                fontSize: '22px',
                fontWeight: 800,
                color: '#087b68',
                lineHeight: 1,
                letterSpacing: '-0.5px',
                fontFamily: 'Sora, Manrope, sans-serif',
              }}>Re-LoadSense</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: '#64748b' }}>Cebu</span>
              <SimBadge />
            </div>
          </header>
        )}

        {/* Main content */}
        <main style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}>
          {children}
        </main>

        {/* Bottom nav */}
        <nav style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '6px',
          padding: '6px 12px 8px',
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 -8px 24px rgba(0, 0, 0, 0.04)',
          flexShrink: 0,
        }}>
          {TABS.map((tab) => {
            const isActive = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href)
            const Icon = tab.icon
            return (
              <Link
                key={tab.id}
                href={tab.href}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '2px',
                  padding: '6px',
                  borderRadius: '999px',
                  minHeight: '44px',
                  justifyContent: 'center',
                  background: isActive ? '#dff6ee' : 'transparent',
                  color: isActive ? '#045c51' : '#64748b',
                  fontWeight: isActive ? 800 : 600,
                  fontSize: '12px',
                  textDecoration: 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                <span style={{ fontSize: '10px' }}>{tab.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
