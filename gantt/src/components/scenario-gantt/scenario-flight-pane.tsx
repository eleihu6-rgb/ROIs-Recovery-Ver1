// gantt/src/components/scenario-gantt/scenario-flight-pane.tsx
//
// Phase 5A thin wrapper: delegates all rendering to SharedFlightPane.
// Row-building, filtering, and interaction logic now live in:
//   - buildScenarioFlightItems / scenarioFlightRowMatchesFilter: scenario-gantt-source.ts
//   - SharedFlightPane: src/components/panes/shared/flight-pane.tsx
//
// The GanttSourceProvider is still mounted here (same as before) so that
// PaneHeaderCanvas / PaneCanvas continue to read viewport via useGanttSource().
//
// C2 fix: the toolbar is passed as a render-prop so SharedFlightPane can supply
// the live rowCount without a second source.flight.useRows() subscription here.

import { useCallback } from 'react'
import { useScenarioGanttSource } from '@/components/gantt/source/scenario-gantt-source'
import { getScenarioLayoutStore } from '@/stores/scenario-layout-store'
import { useUiStore } from '@/stores/ui-store'
import { GanttSourceProvider } from '@/components/gantt/source/gantt-source-context'
import { SharedFlightPane } from '@/components/panes/shared/flight-pane'
import { ScenarioPaneToolbar } from './scenario-pane-toolbar'
import { ScenarioPanelSplitter } from './scenario-panel-splitter'

interface ScenarioFlightPaneProps {
  paneId: string
  scenarioId: number
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  onClose?: () => void
}

export const ScenarioFlightPane = ({
  paneId,
  scenarioId,
  draggable,
  onDragStart,
  onDragEnd,
  onClose,
}: ScenarioFlightPaneProps) => {
  const source = useScenarioGanttSource(scenarioId)
  const useLayout = getScenarioLayoutStore(scenarioId)
  const leftPanelWidth = useLayout((s) => s.leftPanelWidth)
  const setLeftPanelWidth = useLayout((s) => s.setLeftPanelWidth)
  // Flight Navi — same shared button + dialog as Live; opens scenario-scoped (client-derived
  // rows + scenario navigation) via the scenarioId on ui-store (§Gantt-Unify).
  const handleNaviClick = useCallback(() => useUiStore.getState().openFlightNavi(scenarioId), [scenarioId])

  return (
    <GanttSourceProvider value={source}>
      <SharedFlightPane
        paneId={paneId}
        contextId={scenarioId}
        leftPanelWidth={leftPanelWidth}
        onClose={onClose}
        onNaviClick={handleNaviClick}
        toolbar={(rowCount) => (
          <ScenarioPaneToolbar
            paneId={paneId}
            paneType="flight"
            scenarioId={scenarioId}
            leftPanelWidth={leftPanelWidth}
            rowCount={rowCount}
            draggable={draggable}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        )}
        splitter={
          <ScenarioPanelSplitter onDrag={(dx) => setLeftPanelWidth(leftPanelWidth + dx)} />
        }
      />
    </GanttSourceProvider>
  )
}
