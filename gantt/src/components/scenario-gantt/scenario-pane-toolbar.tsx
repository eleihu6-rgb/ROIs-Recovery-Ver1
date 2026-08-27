// gantt/src/components/scenario-gantt/scenario-pane-toolbar.tsx
import { GripVertical, Clock } from 'lucide-react'
import { PANE_COLORS, PANE_NAMES, type ScenarioPaneType } from '@/stores/scenario-layout-store'
import { SPLITTER_WIDTH } from '@/components/gantt/gantt-constants'
import { ScenarioRpIndicator } from '@/components/panes/shared/rp-indicator'
import { ScenarioTimeAxis } from './scenario-time-axis'

interface ScenarioPaneToolbarProps {
  paneId: string
  paneType: ScenarioPaneType
  scenarioId: number
  /** Width of the left crew-list panel — timeline starts after this + splitter */
  leftPanelWidth: number
  rowCount: number
  /** Open/partial coverage total credit (HH:MM); pairing pane only, when narrowed. */
  openCredit?: string
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
}

export const ScenarioPaneToolbar = ({
  paneId,
  paneType,
  scenarioId,
  leftPanelWidth,
  rowCount,
  openCredit,
  draggable,
  onDragStart,
  onDragEnd,
}: ScenarioPaneToolbarProps) => {
  return (
    <div
      className="flex h-8 shrink-0 items-stretch border-b border-border bg-card"
      data-testid={`sg-pane-toolbar-${paneId}`}
    >
      {/* Left section — fixed width aligned with left crew panel + splitter */}
      <div
        className="flex shrink-0 items-center gap-1.5 overflow-hidden border-r border-border px-2"
        style={{ width: leftPanelWidth + SPLITTER_WIDTH }}
      >
        {draggable && (
          <div
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            className="flex cursor-grab items-center text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: PANE_COLORS[paneType] }} />
          <span className="text-xs font-semibold text-foreground">{PANE_NAMES[paneType]}</span>
        </div>

        <span className="rounded bg-muted px-1.5 py-0.5 text-2xs font-mono text-muted-foreground tabular-nums">
          {rowCount}
        </span>

        {openCredit && (
          <span
            className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 py-0.5 text-2xs font-mono text-primary tabular-nums"
            title="Open / partial coverage total credit (HH:MM)"
            data-testid="pane-open-credit"
          >
            <Clock className="h-3 w-3" />
            {openCredit}
          </span>
        )}

        <div className="flex-1" />
        <ScenarioRpIndicator scenarioId={scenarioId} />
      </div>

      {/* Timeline — fills the right portion, aligned with main canvas */}
      <ScenarioTimeAxis scenarioId={scenarioId} className="min-w-0 flex-1 self-stretch" />
    </div>
  )
}
