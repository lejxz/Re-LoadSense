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

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-teal-600 dark:text-teal-400">Re-LoadSense</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">Cebu</span>
          <SimBadge />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">{children}</main>

      {/* Bottom nav — 5 tabs */}
      <nav className="flex items-center justify-around px-2 py-2 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0 safe-area-bottom">
        {TABS.map((tab) => {
          const isActive =
            tab.href === '/'
              ? pathname === '/'
              : pathname.startsWith(tab.href)
          const Icon = tab.icon
          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={cn(
                'flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg transition-colors min-w-[56px]',
                isActive
                  ? 'text-teal-600 dark:text-teal-400'
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300',
              )}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              <span className={cn('text-[10px] font-medium', isActive && 'font-semibold')}>
                {tab.label}
              </span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
