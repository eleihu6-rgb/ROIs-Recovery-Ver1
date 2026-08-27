import { useEffect, useState } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@rois/ui'
import { ShieldCheck } from 'lucide-react'
import { legalityApi } from '@/services/legality-api'

interface RuleGroupDisplayProps {
  rulesetId?: number | null
}

/**
 * Read-only Scenario counterpart of RuleGroupSelector.
 * It resolves the name from the scenario-owned ruleset id and deliberately
 * has no menu or mutation path, so opening a Scenario cannot change Live state.
 */
export const RuleGroupDisplay = ({ rulesetId }: RuleGroupDisplayProps) => {
  const [name, setName] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setName(null)

    if (rulesetId == null) return () => { active = false }

    void legalityApi.getRuleset(rulesetId)
      .then((data) => {
        if (active) setName(data.workset.name)
      })
      .catch(() => {
        if (active) setName(null)
      })

    return () => { active = false }
  }, [rulesetId])

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            data-testid="sg-rule-group-display"
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-2xs font-medium text-muted-foreground"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">{name ?? 'Rule Set'}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Rule Set (Scenario)</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
