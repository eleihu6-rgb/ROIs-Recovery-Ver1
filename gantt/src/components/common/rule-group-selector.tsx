import { useEffect } from 'react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, Tooltip, TooltipContent, TooltipTrigger,
} from '@rois/ui'
import { ShieldCheck } from 'lucide-react'
import { useLegalityStore } from '@/stores/legality-store'
import { useFilterStore } from '@/stores/filter-store'

/**
 * Dropdown selector for choosing the active rule set (法规集合).
 * Sources the legality rulesets (Model A RULE worksets — 103 + 433) from the live-server
 * on mount; the authoritative isDefault flags the gantt's default workset. The selected
 * value is the workset id (as a string), carried through to the WS set_rule_group message.
 *
 * Design: ui-ux-pro-max — matches toolbar button style.
 */
export const RuleGroupSelector = () => {
  const groups = useLegalityStore((s) => s.sets)
  const init = useLegalityStore((s) => s.init)
  const selectSet = useLegalityStore((s) => s.selectSet)
  const division = useFilterStore((s) => s.crew.divisions.length === 1 ? s.crew.divisions[0] : 'P')
  const setCrewFilter = useFilterStore((s) => s.setCrewFilter)
  const setPairingFilter = useFilterStore((s) => s.setPairingFilter)

  useEffect(() => {
    void init()
  }, [init])

  const current = groups.find((g) => g.type.split(',').includes('LIVE') && g.division === division && g.enabled)
  const selectDivision = (nextDivision: string) => {
    setCrewFilter({ divisions: [nextDivision] })
    setPairingFilter({ divisions: [nextDivision] })
    const next = groups.find((g) => g.type.split(',').includes('LIVE') && g.division === nextDivision && g.enabled)
    if (next) void selectSet(next.id)
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-2xs font-medium text-muted-foreground transition-all duration-100 hover:bg-accent/60 hover:text-foreground active:scale-95">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">
                {division} {current ? `· ${current.name}` : '· No enabled rule set'}
              </span>
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Rule Set</TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="end" className="w-56">
        {groups.length === 0 && (
          <DropdownMenuItem disabled className="text-xs text-muted-foreground">
            No rule sets available
          </DropdownMenuItem>
        )}
        {['P', 'C'].map((d) => {
          const g = groups.find((item) => item.type.split(',').includes('LIVE') && item.division === d && item.enabled)
          return (
          <DropdownMenuItem
            key={d}
            onClick={() => selectDivision(d)}
            className="gap-2 text-xs"
          >
            <ShieldCheck className={`h-3.5 w-3.5 ${d === division ? 'text-primary' : 'text-muted-foreground'}`} />
            <div className="min-w-0 flex-1">
              <div className="font-medium">Division {d}</div>
              <div className="text-2xs text-muted-foreground">{g?.name ?? 'No enabled rule set'}</div>
            </div>
            {d === division && (
              <span className="text-primary">&#10003;</span>
            )}
          </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
