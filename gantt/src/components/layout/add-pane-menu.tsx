// gantt/src/components/layout/add-pane-menu.tsx

import { useUiStore } from '@/stores/ui-store'
import { useLayoutStore } from '@/stores/layout-store'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { PANE_COLORS, PANE_NAMES } from '@/types/layout'
import type { PaneType } from '@/types/layout'

export const AddPaneMenu = () => {
  const open = useUiStore(s => s.addPaneMenuOpen)
  const target = useUiStore(s => s.addPaneMenuTarget)
  const closeAddPaneMenu = useUiStore(s => s.closeAddPaneMenu)
  const addPane = useLayoutStore(s => s.addPane)
  const fetchPaneData = useGanttViewStore(s => s.fetchPaneData)
  const totalPanes = useLayoutStore(s => s.panes.size)
  const maxPanes = 4

  if (!open || !target) return null

  const handleAdd = (type: PaneType) => {
    addPane(type, target.row, target.col)
    closeAddPaneMenu()
    // Fetch data only for this pane type (skip if already loaded)
    fetchPaneData(type)
  }

  const types: PaneType[] = ['roster', 'pairing', 'flight']

  return (
    <div
      className="fixed bg-popover border border-border rounded-md p-2 shadow-lg z-50"
      style={{
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)'
      }}
    >
      {totalPanes >= maxPanes ? (
        <div className="text-sm text-muted-foreground p-2">
          Maximum {maxPanes} panes allowed
        </div>
      ) : (
        <>
          <div className="text-xs text-muted-foreground mb-2 px-1">
            Add pane to Row {target.row + 1}
          </div>
          {types.map(type => (
            <button
              key={type}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-muted text-sm"
              onClick={() => handleAdd(type)}
            >
              <div
                className="w-2.5 h-2.5 rounded"
                style={{ backgroundColor: PANE_COLORS[type] }}
              />
              <span>{PANE_NAMES[type]}</span>
            </button>
          ))}
        </>
      )}
      <button
        className="mt-2 w-full text-xs text-muted-foreground hover:text-foreground"
        onClick={closeAddPaneMenu}
      >
        Cancel
      </button>
    </div>
  )
}