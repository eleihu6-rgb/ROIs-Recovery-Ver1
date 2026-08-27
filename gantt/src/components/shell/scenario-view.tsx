// gantt/src/components/shell/scenario-view.tsx
import type { ReactNode } from 'react'
import { ScenarioListPanel } from '@/components/scenario/scenario-list-panel'
import { ScenarioDetailPanel } from '@/components/scenario/scenario-detail-panel'
import { CrewBidsView } from '@/components/scenario/crew-bids/crew-bids-view'
import { useShellStore } from '@/stores/shell-store'

export const ScenarioView = (): ReactNode => {
  const activeScenarioItem = useShellStore((s) => s.activeScenarioItem)

  if (activeScenarioItem === 'crew-bids') {
    return <CrewBidsView />
  }

  return (
    <div className="flex h-full overflow-hidden">
      <ScenarioListPanel />
      <div className="min-w-0 flex-1 overflow-hidden">
        <ScenarioDetailPanel />
      </div>
    </div>
  )
}
