import { cn } from '@/lib/utils'

const TIER_STYLES: Record<string, string> = {
  available: 'bg-green-100 text-green-700 border-green-300 dark:bg-green-950 dark:text-green-400 dark:border-green-800',
  filling: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800',
  at_capacity: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-400 dark:border-red-800',
  overloaded: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-400 dark:border-red-800 animate-pulse',
}

const TIER_LABELS: Record<string, string> = {
  available: 'Available',
  filling: 'Filling',
  at_capacity: 'At capacity',
  overloaded: 'Overloaded',
}

export function TierPill({ tier, className }: { tier: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
        TIER_STYLES[tier] ?? TIER_STYLES.available,
        className,
      )}
    >
      {TIER_LABELS[tier] ?? tier}
    </span>
  )
}
