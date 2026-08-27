import React, { useEffect, useState } from 'react'
import { Activity } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@rois/ui'
import { scenarioApi } from '@/services/scenario-api'
import type { ScenarioRunHealth } from '@/types'

const POLL_MS = 30_000

export const ScenarioRunHealthIndicator = (): React.ReactNode => {
  const [health, setHealth] = useState<ScenarioRunHealth | null>(null)

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const result = await scenarioApi.getRunHealth()
        if (!cancelled) setHealth(result)
      } catch {
        if (!cancelled) setHealth(null)
      }
    }
    void check()
    const id = setInterval(() => { void check() }, POLL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  const overall = health?.overall
  const dotColor =
    overall === 'healthy' ? 'bg-green-500' :
    overall === 'unhealthy' ? 'bg-red-500' :
    'bg-muted-foreground'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="relative inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground"
          data-testid="scenario-run-health-indicator"
        >
          <Activity className="h-3.5 w-3.5" />
          <span
            className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-background ${dotColor}`}
          />
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {health == null ? (
          <span>Service health: checking…</span>
        ) : (
          <div className="flex flex-col gap-1">
            <span className="font-medium">
              Services: {overall === 'healthy' ? 'All healthy' : 'Degraded'}
            </span>
            {health.services.map((s) => (
              <span key={s.key}>
                {s.label}: {s.status}
                {s.latencyMs != null ? ` (${s.latencyMs}ms)` : ''}
              </span>
            ))}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  )
}
