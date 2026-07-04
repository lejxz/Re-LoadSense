import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * SIM badge — honest labeling. Amber pill "SIM" with tooltip.
 * Shown in the header on all apps.
 * See concept/04-features.md X-01.
 */
export function SimBadge() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className="bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800 text-xs font-medium cursor-help"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse mr-1" />
            SIM
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">Data is simulated for demo purposes.</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
