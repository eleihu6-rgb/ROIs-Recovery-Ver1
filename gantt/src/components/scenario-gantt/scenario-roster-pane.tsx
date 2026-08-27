// gantt/src/components/scenario-gantt/scenario-roster-pane.tsx
//
// Phase R1.3/R2 thin wrapper: delegates all rendering to SharedRosterPane.
// Crew filtering/ordering, roster item build, panel-rows-with-violations,
// violationMap, selection, hit-test, and read-only interaction callbacks now live in:
//   - makeScenarioRosterPaneSource: scenario-gantt-source.ts
//   - SharedRosterPane: src/components/panes/shared/roster-pane.tsx
//
// The GanttSourceProvider is mounted here (same as the flight / pairing wrappers) so
// PaneHeaderCanvas / PaneCanvas read viewport via useGanttSource() and source.roster
// (selection, reassign drag, pre-check) is available. The roster source is paneId-bound,
// so this wrapper passes the paneId into useScenarioGanttSource.
//
// The toolbar + splitter are passed as render-props so SharedRosterPane supplies the
// live rowCount without a second source.roster.useRosterModel() subscription here, exactly
// as the flight / pairing wrappers do.

import { ListX } from 'lucide-react'
import { useScenarioGanttSource } from '@/components/gantt/source/scenario-gantt-source'
import { getScenarioGanttStore } from '@/stores/scenario-gantt-store'
import { ScenarioBulkDeleteDialog } from './scenario-bulk-delete-dialog'
import { useState } from 'react'
import { getScenarioLayoutStore } from '@/stores/scenario-layout-store'
import { GanttSourceProvider } from '@/components/gantt/source/gantt-source-context'
import { SharedRosterPane } from '@/components/panes/shared/roster-pane'
import { ScenarioPaneToolbar } from './scenario-pane-toolbar'
import { ScenarioPanelSplitter } from './scenario-panel-splitter'

interface ScenarioRosterPaneProps {
  paneId: string
  scenarioId: number
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  onClose?: () => void
}

export const ScenarioRosterPane = ({
  paneId,
  scenarioId,
  draggable,
  onDragStart,
  onDragEnd,
  onClose,
}: ScenarioRosterPaneProps) => {
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  // The roster source is paneId-bound (scrollY / frozen-found tiers / drop registration
  // are scoped to this concrete pane). Pass the paneId so source.roster is built.
  const source = useScenarioGanttSource(scenarioId, paneId)
  const useLayout = getScenarioLayoutStore(scenarioId)
  const leftPanelWidth = useLayout((s) => s.leftPanelWidth)
  const setLeftPanelWidth = useLayout((s) => s.setLeftPanelWidth)
  const scenarioData = getScenarioGanttStore(scenarioId)((s) => s.data)
  const lockStatus = getScenarioGanttStore(scenarioId)((s) => s.lockStatus)
  const bulkDeleteDisabled = !(lockStatus?.isOwner && scenarioData?.capabilities.roster.canRemove)

  return (
    <GanttSourceProvider value={source}>
      <SharedRosterPane
        paneId={paneId}
        contextId={scenarioId}
        leftPanelWidth={leftPanelWidth}
        onClose={onClose}
        canvasTestId="scenario-roster-canvas"
        toolbar={(rowCount) => (
          <ScenarioPaneToolbar
            paneId={paneId}
            paneType="roster"
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
        liveChrome={{
          onRosterBulkDeleteClick: () => setBulkDeleteOpen(true),
          rosterBulkDeleteDisabled: bulkDeleteDisabled,
          rosterBulkDeleteIcon: <ListX className="h-3 w-3" />,
          rosterBulkDeleteTitle: bulkDeleteDisabled ? 'Bulk delete unavailable in read-only mode' : 'Bulk delete scenario tasks',
        }}
      />
      {scenarioData && (
        <ScenarioBulkDeleteDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen} data={scenarioData} />
      )}
    </GanttSourceProvider>
  )
}
