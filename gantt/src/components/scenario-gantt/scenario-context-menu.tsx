// gantt/src/components/scenario-gantt/scenario-context-menu.tsx
import { useEffect, useRef } from 'react'
import { Plane, Link2, Trash2, Users, PackageSearch, Pin, PinOff, CalendarClock, CalendarDays, UserRound, CalendarArrowDown } from 'lucide-react'
import { useUiStore } from '@/stores/ui-store'
import { getScenarioGanttStore } from '@/stores/scenario-gantt-store'
import { getScenarioLayoutStore } from '@/stores/scenario-layout-store'
import { getScenarioRosterSelectionStore } from '@/stores/scenario-roster-selection-store'
import { getPaneStore } from '@/stores/pane-store'
import {
  scenarioHasPaneType,
  scenarioLocatePairing,
  scenarioLocateFlight,
  scenarioFindCrewByPairing,
  scenarioFindCrewByFlight,
  scenarioFindPairingByFlight,
} from '@/utils/scenario-find-helpers'
import { buildScenarioRosterRemovePatch } from '@/utils/scenario-roster-edit'
import { applyPairingPaneScrollY } from '@/utils/scroll-pairing-row'

/**
 * Scenario-specific right-click context menu.
 *
 * Driven by the GLOBAL ui-store (same state as the Live ContextMenu) but distinguished
 * from Live via `contextMenuScenarioId` (mirrors the flight/pairing dialog pattern):
 * Live's ContextMenu renders null when scenarioId != null, this one renders null when
 * scenarioId == null — so exactly one menu handles any given right-click.
 *
 * Actions are context-dependent and capability/lock gated. No swap / ground-task / draft
 * actions — those are Live-only:
 *  - View pairing detail — when the clicked item carries a pairingId.
 *  - View flight detail  — when on a flight (flight pane itemId, or a segment fltId).
 *  - Remove from crew    — ONLY on the scenario roster pane, on a pairing task, when the
 *                          scenario grants roster.canRemove AND the user owns the edit lock.
 *  - Locate Pairing      — roster pane, pairing task; floats the pairing to the top of the
 *                          Pairing pane. Gated on a Pairing pane existing.
 *  - Locate Flight       — roster or pairing pane with a flight id; floats the flight's row
 *                          to the top of the Flight pane. Gated on a Flight pane existing.
 *  - Find Crew by Pairing — pairing pane; floats the assigned crew to the top of the Roster
 *                          pane. Gated on a Roster pane existing (hidden in PO).
 *  - Find Crew by Flight  — flight pane; floats the flight's crew to the top of the Roster
 *                          pane. Gated on a Roster pane existing (hidden in PO).
 *  - Find Pairing by Flight — flight pane; floats the flight's pairing(s) to the top of the
 *                          Pairing pane. Gated on a Pairing pane existing.
 *
 * Positioning / outside-click / Esc dismiss mirror the Live ContextMenu pattern.
 */
export const ScenarioContextMenu = () => {
  const open       = useUiStore((s) => s.contextMenuOpen)
  const position   = useUiStore((s) => s.contextMenuPosition)
  const task       = useUiStore((s) => s.contextMenuTask)
  const paneType   = useUiStore((s) => s.contextMenuPane)
  const scenarioId = useUiStore((s) => s.contextMenuScenarioId)
  const jumpToDayScrollY = useUiStore((s) => s.contextMenuJumpToDayScrollY)
  const closeContextMenu = useUiStore((s) => s.closeContextMenu)

  const menuRef = useRef<HTMLDivElement>(null)
  // Delay enabling outside-click handling so the same right-click doesn't immediately close it.
  const canHandleClickRef = useRef(false)

  useEffect(() => {
    if (!open) {
      canHandleClickRef.current = false
      return
    }
    const timer = setTimeout(() => { canHandleClickRef.current = true }, 50)
    const handleClick = (e: MouseEvent) => {
      if (!canHandleClickRef.current) return
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeContextMenu()
    }
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeContextMenu() }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      clearTimeout(timer)
      canHandleClickRef.current = false
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, closeContextMenu])

  // Only render for scenario right-clicks (Live's ContextMenu handles scenarioId == null).
  if (!open || scenarioId == null || !task) return null

  // Resolve scenario context (capabilities + lock ownership) from the per-scenario store.
  const store = getScenarioGanttStore(scenarioId).getState()
  const caps = store.data?.capabilities
  const isOwner = store.lockStatus?.isOwner ?? false
  const layoutStore = getScenarioLayoutStore(scenarioId).getState()
  const rosterPaneId = layoutStore.findPaneIdByType('roster')
  const scenarioRosterSelectionStore = getScenarioRosterSelectionStore(scenarioId).getState()

  // Read what each scenario pane stuffed onto the mock task.
  // pairing pane: { id, pairingId };  flight pane: { id, findFltId };
  // roster pane:  { id, pairingId, crewId, findFltId? }.
  const ctx = task as unknown as {
    id: number
    pairingId?: number | null
    crewId?: string
    findFltId?: number | null
    source?: string | null
    schStrDtUtc?: string | null
    schEndDtUtc?: string | null
    assignmentGroup?: string
    assignment?: string | null
  }
  const pairingId = ctx.pairingId ?? null
  const isScenarioRoster = paneType === 'scenario-roster'
  // Flight id: the flight pane's puck id, or a roster/pairing segment's fltId.
  const fltId = paneType === 'flight' && ctx.id > 0 ? ctx.id : (ctx.findFltId ?? null)

  const items: { icon: typeof Plane; label: string; onClick: () => void; danger?: boolean }[] = []

  // Pinning is a Scenario view aid, not an optimizer edit. It mirrors Live's
  // row-freeze affordance while writing only to scenario-layout local state.
  if (isScenarioRoster && rosterPaneId) {
    const selectedRows = Array.from(scenarioRosterSelectionStore.selectedCrewIds)
    const frozenRows = layoutStore.panes.get(rosterPaneId)?.frozenCrewIds ?? []
    const allSelectedFrozen = selectedRows.length > 0 && selectedRows.every((id) => frozenRows.includes(id))

    if (task.id === -1 && task.crewId) {
      items.push({
        icon: UserRound,
        label: 'Crew Info',
        onClick: () => {
          useUiStore.getState().openCrewInfo(task.crewId!)
          closeContextMenu()
        },
      })
      items.push({
        icon: CalendarClock,
        label: 'Manday Info',
        onClick: () => {
          useUiStore.getState().openMandayInfoDialog(task.crewId!, scenarioId)
          closeContextMenu()
        },
      })
    }

    if (ctx.crewId) {
      items.push({
        icon: CalendarDays,
        label: 'Schedule Details',
        onClick: () => {
          useUiStore.getState().openScheduleDetailsDialog(ctx.crewId!, scenarioId, 'scenario-roster')
          closeContextMenu()
        },
      })
      items.push({
        icon: CalendarClock,
        label: 'Daily Task Calendar',
        onClick: () => {
          useUiStore.getState().openDailyTaskCalendarDialog(ctx.crewId!, scenarioId, 'scenario-roster')
          closeContextMenu()
        },
      })
    }

    if (selectedRows.length > 0 && !allSelectedFrozen) {
      items.push({
        icon: Pin,
        label: `Pin ${selectedRows.length} Selected Row${selectedRows.length > 1 ? 's' : ''}`,
        onClick: () => {
          const st = getScenarioLayoutStore(scenarioId).getState()
          const current = st.panes.get(rosterPaneId)?.frozenCrewIds ?? []
          const seen = new Set(current)
          st.setFrozenCrewIds(rosterPaneId, [...current, ...selectedRows.filter((id) => !seen.has(id))])
          st.setScrollY(rosterPaneId, 0)
          getScenarioRosterSelectionStore(scenarioId).getState().clear()
          closeContextMenu()
        },
      })
    }

    if (frozenRows.length > 0) {
      items.push({
        icon: PinOff,
        label: `Unpin All (${frozenRows.length})`,
        onClick: () => {
          getScenarioLayoutStore(scenarioId).getState().setFrozenCrewIds(rosterPaneId, [])
          closeContextMenu()
        },
      })
    }
  }

  const paneStoreType = paneType === 'pairing'
    ? 'scenario-pairing'
    : paneType === 'flight'
      ? 'scenario-flight'
      : null
  if (paneStoreType) {
    const paneState = getPaneStore(scenarioId).getState()
    const selectedRows = paneState.getSelectedRowIds(paneStoreType)
    const frozenRows = paneState.getFrozenRowIds(paneStoreType)
    const allSelectedFrozen = selectedRows.length > 0 && selectedRows.every((id) => frozenRows.includes(id))

    if (selectedRows.length > 0 && !allSelectedFrozen) {
      items.push({
        icon: Pin,
        label: `Pin ${selectedRows.length} Selected Row${selectedRows.length > 1 ? 's' : ''}`,
        onClick: () => {
          paneState.freezeSelectedRows(paneStoreType)
          closeContextMenu()
        },
      })
    }

    if (frozenRows.length > 0) {
      items.push({
        icon: PinOff,
        label: `Unpin All (${frozenRows.length})`,
        onClick: () => {
          paneState.unfreezeAll(paneStoreType)
          closeContextMenu()
        },
      })
    }
  }

  if (pairingId != null) {
    items.push({
      icon: Link2,
      label: 'View pairing detail',
      onClick: () => {
        useUiStore.getState().openPairingInfo(pairingId, scenarioId, isScenarioRoster ? ctx.crewId : undefined)
        closeContextMenu()
      },
    })
  }

  if (fltId != null) {
    items.push({
      icon: Plane,
      label: 'View flight detail',
      onClick: () => {
        useUiStore.getState().openFlightDetail(fltId, scenarioId)
        closeContextMenu()
      },
    })
  }

  // Scenario roster deletion is restricted to MA/CR output tasks. Pairing data
  // remains read-only; the action only creates a roster remove patch.
  const removePatch = isScenarioRoster && ctx.crewId
    ? buildScenarioRosterRemovePatch({
      crewId: ctx.crewId,
      pairingId,
      source: ctx.source ?? null,
      schStrDtUtc: ctx.schStrDtUtc ?? null,
      schEndDtUtc: ctx.schEndDtUtc ?? null,
      assignmentGroup: ctx.assignmentGroup ?? '',
      assignment: ctx.assignment ?? null,
    })
    : null
  if (removePatch && isOwner && !!caps?.roster.canRemove) {
    items.push({
      icon: Trash2,
      label: pairingId != null ? 'Remove from crew' : 'Delete task',
      danger: true,
      onClick: () => {
        getScenarioGanttStore(scenarioId).getState().addPatch(removePatch)
        closeContextMenu()
      },
    })
  }

  // ── Cross-pane "find / locate" actions ──────────────────────────────────────
  // Each is gated on the TARGET pane existing in this scenario's layout
  // (scenarioHasPaneType) so PO scenarios (no roster pane) hide the Find-Crew items.
  // Labels match Live's ContextMenu wording exactly; helpers resolve ids from the
  // already-loaded scenario data and float the matched rows to the top of the target pane.

  // Roster pane → locate the pairing in the Pairing pane.
  if (isScenarioRoster && pairingId != null && scenarioHasPaneType(scenarioId, 'pairing')) {
    items.push({
      icon: Link2,
      label: 'Locate Pairing',
      onClick: () => {
        scenarioLocatePairing(scenarioId, pairingId)
        closeContextMenu()
      },
    })
  }

  // Roster or Pairing pane → locate the flight in the Flight pane.
  if (
    fltId != null &&
    (isScenarioRoster || paneType === 'pairing') &&
    scenarioHasPaneType(scenarioId, 'flight')
  ) {
    items.push({
      icon: Plane,
      label: 'Locate Flight',
      onClick: () => {
        scenarioLocateFlight(scenarioId, fltId)
        closeContextMenu()
      },
    })
  }

  // Pairing pane → find the crew assigned to that pairing in the Roster pane.
  if (paneType === 'pairing' && pairingId != null && scenarioHasPaneType(scenarioId, 'roster')) {
    items.push({
      icon: Users,
      label: 'Find Crew by Pairing',
      onClick: () => {
        scenarioFindCrewByPairing(scenarioId, pairingId)
        closeContextMenu()
      },
    })
  }

  // Pairing pane → jump to the pairing matching the right-clicked local day (or the
  // previous day's last pairing). Vertical scroll only — no horizontal scroll, no
  // zoom, no date range, no row selection. Pre-computed by SharedPairingPane.onItemRightClick
  // and stashed on ui-store.contextMenuJumpToDayScrollY.
  if (paneType === 'pairing' && jumpToDayScrollY != null) {
    items.push({
      icon: CalendarArrowDown,
      label: "Jump to this day's pairing",
      onClick: () => {
        applyPairingPaneScrollY('scenario', jumpToDayScrollY, scenarioId!)
        closeContextMenu()
      },
    })
  }

  // Flight pane → find crew on that flight (Roster pane) + the pairing(s) containing it (Pairing pane).
  if (paneType === 'flight' && fltId != null) {
    if (scenarioHasPaneType(scenarioId, 'roster')) {
      items.push({
        icon: Users,
        label: 'Find Crew by Flight',
        onClick: () => {
          scenarioFindCrewByFlight(scenarioId, fltId)
          closeContextMenu()
        },
      })
    }
    if (scenarioHasPaneType(scenarioId, 'pairing')) {
      items.push({
        icon: PackageSearch,
        label: 'Find Pairing by Flight',
        onClick: () => {
          scenarioFindPairingByFlight(scenarioId, fltId)
          closeContextMenu()
        },
      })
    }
  }

  if (items.length === 0) return null

  // Alphabetical, case-sensitive sort of the final menu items.
  items.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))

  // Clamp position to the viewport.
  const menuW = 200
  const menuH = items.length * 32 + 8
  const x = Math.min(position.x, window.innerWidth - menuW - 8)
  const y = Math.min(position.y, window.innerHeight - menuH - 8)

  return (
    <div
      ref={menuRef}
      data-testid="scenario-context-menu"
      className="fixed z-50 w-[200px] overflow-hidden rounded-md border border-border/60 bg-popover/98 p-1 shadow-[0_4px_16px_rgba(0,0,0,0.12)] animate-in fade-in-0 zoom-in-95 duration-100"
      style={{ left: x, top: y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          onMouseDown={(e) => e.stopPropagation()} // keep the document mousedown from closing the menu
          className={[
            'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs transition-all duration-100 active:scale-95',
            item.danger
              ? 'text-destructive hover:bg-destructive/10'
              : 'text-popover-foreground hover:bg-accent/60',
          ].join(' ')}
          onClick={item.onClick}
        >
          <item.icon className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 text-left">{item.label}</span>
        </button>
      ))}
    </div>
  )
}
