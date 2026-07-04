'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Map as MapIcon, Bus, MessageCircle, Menu as MenuIcon } from 'lucide-react'
import { SimBadge } from '@/components/shared/sim-badge'

const TABS = [
  { id: 'home', label: 'Home', icon: Home, href: '/' },
  { id: 'map', label: 'Map', icon: MapIcon, href: '/map' },
  { id: 'routes', label: 'Routes', icon: Bus, href: '/routes' },
  { id: 'chat', label: 'Chat', icon: MessageCircle, href: '/chat' },
  { id: 'menu', label: 'Menu', icon: MenuIcon, href: '/menu' },
] as const

export default function CommuterLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isMapTab = pathname === '/map'

  return (
    <div className="mobile-page">
      <div className="phone-frame">
        <div className="app-screen" style={{ gridTemplateRows: isMapTab ? '1fr auto' : 'auto auto 1fr auto' }}>
          {/* Header — hidden on map tab */}
          {!isMapTab && (
            <header className="mobile-header">
              <div className="header-greeting">
                <span className="greeting-text">Good day,</span>
                <span className="brand-name">Re-LoadSense</span>
              </div>
              <div className="country-search-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: '#64748b' }}>Cebu</span>
                <SimBadge />
              </div>
            </header>
          )}

          {/* Content */}
          <div className="tab-panel active" style={{ display: 'flex', flexDirection: 'column', overflow: 'auto', padding: isMapTab ? '0' : '4px 18px 18px' }}>
            {children}
          </div>

          {/* Bottom nav */}
          <nav className="mobile-nav" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
            {TABS.map((tab) => {
              const isActive = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href)
              const Icon = tab.icon
              return (
                <Link
                  key={tab.id}
                  href={tab.href}
                  className={isActive ? 'active' : ''}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '2px',
                    textDecoration: 'none',
                  }}
                >
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 2} style={{ marginBottom: '2px' }} />
                  <span style={{ fontSize: '10px' }}>{tab.label}</span>
                </Link>
              )
            })}
          </nav>
        </div>
      </div>
    </div>
  )
}
