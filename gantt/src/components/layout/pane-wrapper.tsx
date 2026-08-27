// gantt/src/components/layout/pane-wrapper.tsx

import { useMemo } from 'react'
import { RosterPane } from '@/components/panes/roster-pane'
import { PairingPane } from '@/components/panes/pairing-pane'
import { FlightPane } from '@/components/panes/flight-pane'
import { useLayoutStore } from '@/stores/layout-store'
import type { PaneType } from '@/types/layout'

interface PaneWrapperProps {
  paneId: string
  row: number  // kept for caller compatibility; unused after PaneHeader removal
}

export interface PaneDragProps {
  draggable: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onClose: () => void
}

const renderPaneContent = (type: PaneType, paneId: string, dragProps: PaneDragProps) => {
  switch (type) {
    case 'roster':  return <RosterPane  paneId={paneId} {...dragProps} />
    case 'pairing': return <PairingPane paneId={paneId} {...dragProps} />
    case 'flight':  return <FlightPane  paneId={paneId} {...dragProps} />
  }
}

export const PaneWrapper = ({ paneId }: PaneWrapperProps) => {
  // F54-P03: subscribe to the pane TYPE (string), not the pane object — the pane object's
  // identity changes on every viewport (scroll) update, which would re-render this wrapper
  // each wheel tick and hand fresh drag/close closures to the pane (breaking chrome memo).
  const paneType   = useLayoutStore((s) => s.panes.get(paneId)?.type)
  const draggable  = useLayoutStore((s) => s.panes.size > 1)
  const startDrag  = useLayoutStore((s) => s.startDrag)
  const endDrag    = useLayoutStore((s) => s.endDrag)
  const closePane  = useLayoutStore((s) => s.closePane)

  const dragProps = useMemo((): PaneDragProps => ({
    draggable,
    onDragStart: (e: React.DragEvent) => startDrag(paneId, e as unknown as DragEvent),
    onDragEnd: endDrag,
    onClose: () => closePane(paneId),
  }), [paneId, draggable, startDrag, endDrag, closePane])

  if (!paneType) return null

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-background">
      {renderPaneContent(paneType, paneId, dragProps)}
    </div>
  )
}
