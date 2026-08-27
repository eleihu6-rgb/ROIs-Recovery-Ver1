// gantt/src/components/scenario-gantt/scenario-pairing-pane.tsx
//
// Phase 5B-1 thin wrapper: delegates all rendering to SharedPairingPane.
// Row-building, filtering, sort, and interaction logic now live in:
//   - buildPairingItems / pairingMatchesSharedFilter / makeScenarioPairingPaneSource:
//     scenario-gantt-source.ts
//   - SharedPairingPane: src/components/panes/shared/pairing-pane.tsx
//
// The GanttSourceProvider is mounted here (same as the flight pane) so that
// PaneHeaderCanvas / PaneCanvas continue to read viewport via useGanttSource(),
// and so source.pairing (assign-pairing drag, selection, sort) is available.
//
// The toolbar is passed as a render-prop so SharedPairingPane supplies the live
// rowCount without a second source.pairing.useRows() subscription here.

import { useScenarioGanttSource } from '@/components/gantt/source/scenario-gantt-source'
import { getScenarioLayoutStore } from '@/stores/scenario-layout-store'
import { GanttSourceProvider } from '@/components/gantt/source/gantt-source-context'
import { SharedPairingPane } from '@/components/panes/shared/pairing-pane'
import { ScenarioPaneToolbar } from './scenario-pane-toolbar'
import { ScenarioPanelSplitter } from './scenario-panel-splitter'

interface ScenarioPairingPaneProps {
  paneId: string
  scenarioId: number
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  onClose?: () => void
}

export const ScenarioPairingPane = ({
  paneId,
  scenarioId,
  draggable,
  onDragStart,
  onDragEnd,
  onClose,
}: ScenarioPairingPaneProps) => {
  const source = useScenarioGanttSource(scenarioId)
  const useLayout = getScenarioLayoutStore(scenarioId)
  const leftPanelWidth = useLayout((s) => s.leftPanelWidth)
  const setLeftPanelWidth = useLayout((s) => s.setLeftPanelWidth)

  return (
    <GanttSourceProvider value={source}>
      <SharedPairingPane
        paneId={paneId}
        contextId={scenarioId}
        leftPanelWidth={leftPanelWidth}
        onClose={onClose}
        toolbar={(rowCount, openCredit) => (
          <ScenarioPaneToolbar
            paneId={paneId}
            paneType="pairing"
            scenarioId={scenarioId}
            leftPanelWidth={leftPanelWidth}
            rowCount={rowCount}
            openCredit={openCredit}
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
