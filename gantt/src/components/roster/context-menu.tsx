import { useEffect, useRef } from 'react'
import { useUiStore } from '@/stores/ui-store'
import { useRosterStore } from '@/stores/roster-store'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { usePaneStore } from '@/stores/pane-store'
import { usePairingStore } from '@/stores/pairing-store'
import { pairingApi } from '@/services/pairing-api'
import { Edit, Trash2, ArrowRightLeft, Crosshair, Link2, PackagePlus, PackageSearch, Pin, PinOff, Plane, SquarePlus, ClipboardEdit, Users, StickyNote, CalendarClock, CalendarDays, UserRound, CalendarArrowDown } from 'lucide-react'
import { notify } from '@/utils/notify'
import { useCrewMemoStore } from '@/stores/crew-memo-store'
import { findCrewToTop } from '@/utils/find-crew'
import { bringPairingIdToTop, bringFlightIdToTop, findPairingsByFlight, liveHasFlightPaneOpen } from '@/utils/bring-matches-to-top'
import { deletePairings, resolveSelectedPairingIds } from '@/utils/delete-gantt-selection'
import { applyPairingPaneScrollY } from '@/utils/scroll-pairing-row'

/**
 * Canvas context menu — shown on right-click a task block.
 *
 * Actions:
 * - Edit: open task detail dialog
 * - Swap: open swap dialog
 * - View pairing detail: open Pairing Info dialog (parity with Scenario)
 * - View flight detail: open Flight Detail dialog (parity with Scenario)
 * - Locate Pairing: scroll Pairing pane to highlight the task's pairing
 * - Locate Flight: float the flight to the top of the Flight pane (only when that pane is open)
 * - Delete: remove task (with confirmation)
 *
 * Design: ui-ux-pro-max — semantic colors, compact, active:scale-95
 */
export const ContextMenu = () => {
  const open = useUiStore((s) => s.contextMenuOpen)
  const position = useUiStore((s) => s.contextMenuPosition)
  const task = useUiStore((s) => s.contextMenuTask)
  const paneType = useUiStore((s) => s.contextMenuPane)
  const rowIndex = useUiStore((s) => s.contextMenuRowIndex)
  const scenarioId = useUiStore((s) => s.contextMenuScenarioId)
  const closeContextMenu = useUiStore((s) => s.closeContextMenu)
  const openTaskDetail = useUiStore((s) => s.openTaskDetail)
  const openSwapDialog = useUiStore((s) => s.openSwapDialog)
  const openFlightDetail = useUiStore((s) => s.openFlightDetail)
  const openDutyNodeDialog = useUiStore((s) => s.openDutyNodeDialog)
  const openGroundTaskCreate = useUiStore((s) => s.openGroundTaskCreate)
  const openGroundTaskEdit = useUiStore((s) => s.openGroundTaskEdit)
  const groundTaskPrefill = useUiStore((s) => s.groundTaskPrefill)
  const openMemoDialog = useUiStore((s) => s.openMemoDialog)
  const removeTask = useRosterStore((s) => s.removeTask)
  const removeTasksByPairingAndCrew = useRosterStore((s) => s.removeTasksByPairingAndCrew)
  const selectTask = useGanttViewStore((s) => s.selectTask)
  const clearSelection = useGanttViewStore((s) => s.clearSelection)
  const setVisible = usePaneStore((s) => s.setVisible)
  const jumpToDayScrollY = useUiStore((s) => s.contextMenuJumpToDayScrollY)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on click outside or Escape
  // Use a ref to track if we should handle clicks (avoid closing immediately from the same right-click)
  const canHandleClickRef = useRef(false)

  useEffect(() => {
    if (!open) {
      canHandleClickRef.current = false
      return
    }

    // Delay enabling click handling to avoid closing immediately from the same right-click event
    const timer = setTimeout(() => {
      canHandleClickRef.current = true
    }, 50)

    const handleClick = (e: MouseEvent) => {
      if (!canHandleClickRef.current) return
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeContextMenu()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu()
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)

    return () => {
      clearTimeout(timer)
      canHandleClickRef.current = false
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, closeContextMenu])

  // Scenario right-clicks carry a scenarioId — the ScenarioContextMenu handles those.
  // The Live menu only renders for Live mode (scenarioId === null).
  if (scenarioId != null) return null

  if (!open || !task) return null

  const handleEdit = () => {
    openTaskDetail(task)
    closeContextMenu()
  }

  const deleteOne = async (pane: 'main' | 'sub', t: { id: number; pairingId: number | null; crewId: string }) => {
    // A pairing puck deletes ALL of that pairing's segments for the crew; a standalone task by id.
    if (t.pairingId != null) {
      await removeTasksByPairingAndCrew(pane, t.pairingId, t.crewId)
    } else {
      await removeTask(pane, t.id)
    }
  }

  const handleDelete = async () => {
    const pane = paneType?.startsWith('roster') ? (paneType === 'roster-main' ? 'main' as const : 'sub' as const) : 'main' as const
    closeContextMenu()
    const selectedIds = useGanttViewStore.getState().selectedTaskIds
    // Box-selection multi-delete: when the right-clicked puck is part of a multi-selection,
    // delete every selected duty. Dedupe by pairing+crew so a pairing's segments aren't
    // deleted twice; standalone tasks delete by their own id.
    if (selectedIds.size > 1 && selectedIds.has(task.id)) {
      const byId = new Map(useRosterStore.getState()[pane].rosterItems.map((i) => [i.id, i]))
      const seenPairings = new Set<string>()
      const targets: { id: number; pairingId: number | null; crewId: string }[] = []
      for (const id of selectedIds) {
        const t = byId.get(id)
        if (!t) continue
        if (t.pairingId != null) {
          const key = `${t.pairingId}::${t.crewId}`
          if (seenPairings.has(key)) continue
          seenPairings.add(key)
        }
        targets.push({ id: t.id, pairingId: t.pairingId, crewId: t.crewId })
      }
      for (const t of targets) await deleteOne(pane, t)
      clearSelection()
      return
    }
    await deleteOne(pane, task)
    clearSelection()
  }

  const handleSwap = () => {
    openSwapDialog(task)
    closeContextMenu()
  }

  // Open the memo dialog for the right-clicked duty. If a memo already overlaps
  // this duty's date range, open it in edit mode; otherwise prefill a new one.
  const handleMemo = () => {
    if (!task.crewId) { closeContextMenu(); return }
    const start = task.schStrDtUtc ?? new Date().toISOString()
    const end = task.schEndDtUtc ?? start
    const startMs = Date.parse(start)
    const endMs = Date.parse(end)
    const existing = (useCrewMemoStore.getState().memosByCrew.get(task.crewId) ?? []).find((m) => {
      if (!m.strDtLoc || !m.endDtLoc) return false
      return Date.parse(m.strDtLoc) < endMs && Date.parse(m.endDtLoc) > startMs
    })
    const defaultText = task.pairingId != null
      ? `${task.label ?? `Pairing ${task.pairingId}`}${task.pairingId != null ? ` (${task.pairingId})` : ''}`
      : (task.assignment ?? 'Note')
    openMemoDialog(existing
      ? { id: existing.id, crewId: task.crewId, strDtLoc: existing.strDtLoc ?? start, endDtLoc: existing.endDtLoc ?? end, memo: existing.memo ?? '', name: existing.name ?? undefined }
      : { crewId: task.crewId, strDtLoc: start, endDtLoc: end, memo: defaultText, name: task.pairingId != null ? 'Pairing note' : 'Day note' })
    closeContextMenu()
  }

  const handleLocatePairing = () => {
    if (task.pairingId != null) {
      // Ensure Pairing pane is visible
      setVisible('pairing', true)
      // Select the pairing in the Gantt view
      selectTask(task.pairingId)
      // Float the pairing to the top row of the pairing pane and scroll there
      // (load it first if it isn't on screen) — otherwise selecting it alone leaves
      // it wherever the sort put it, often below the fold.
      void bringPairingIdToTop(task.pairingId)
    }
    closeContextMenu()
  }

  const handleLocateFlight = () => {
    const fltId = task.fltId ?? (task as unknown as { findFltId?: number | null }).findFltId
    if (fltId != null) void bringFlightIdToTop(fltId)
    closeContextMenu()
  }

  const handleScheduleDetails = () => {
    if (!task.crewId) { closeContextMenu(); return }
    useUiStore.getState().openScheduleDetailsDialog(task.crewId, undefined, paneType)
    closeContextMenu()
  }

  const handleDailyTaskCalendar = () => {
    if (!task.crewId) { closeContextMenu(); return }
    useUiStore.getState().openDailyTaskCalendarDialog(task.crewId, undefined, paneType)
    closeContextMenu()
  }

  // Build menu items based on context
  const items: { icon: typeof Edit; label: string; shortcut?: string; onClick: () => void; danger?: boolean; disabled?: boolean }[] = []

  const hasTask = task.id > 0

  // "Edit Memo" if a memo already overlaps this duty's date range, else "Add Memo".
  const memoLabel = (() => {
    if (!task.crewId || !task.schStrDtUtc || !task.schEndDtUtc) return 'Add Memo'
    const sMs = Date.parse(task.schStrDtUtc), eMs = Date.parse(task.schEndDtUtc)
    const has = (useCrewMemoStore.getState().memosByCrew.get(task.crewId) ?? []).some((m) =>
      m.strDtLoc && m.endDtLoc && Date.parse(m.strDtLoc) < eMs && Date.parse(m.endDtLoc) > sMs)
    return has ? 'Edit Memo' : 'Add Memo'
  })()

  // Extra fields stuffed onto the mock task by pairing/flight panes for "Find Crew".
  const findCtx = task as unknown as { findFltId?: number | null; findTargetPane?: 'main' | 'sub' }

  // IMP-sourced flying rows are immutable (no edit/move/swap); ground tasks open
  // the read-only Ground Editor and can still be deleted.
  const isImp = task.source === 'IMP'

  // Common items for roster tasks
  if (paneType?.startsWith('roster') && hasTask) {
    // Ground task (pairingId === null and id > 0) → show Edit Ground Task
    if (task.pairingId === null && task.id > 0) {
      items.push({
        icon: Edit,
        label: 'Edit Ground Task',
        shortcut: 'Enter',
        onClick: () => { openGroundTaskEdit(task); closeContextMenu() },
      })
    } else {
      items.push(
        { icon: Edit, label: 'Edit Task', shortcut: 'Enter', onClick: handleEdit, disabled: isImp },
        { icon: ArrowRightLeft, label: 'Swap Task', onClick: handleSwap, disabled: isImp },
      )
    }
    if (task.pairingId != null) {
      items.push({
        icon: Link2,
        label: 'View pairing detail',
        onClick: () => {
          useUiStore.getState().openPairingInfo(task.pairingId!, undefined, task.crewId)
          closeContextMenu()
        },
      })
      if (task.fltId != null) {
        items.push({
          icon: Plane,
          label: 'View flight detail',
          onClick: () => {
            openFlightDetail(task.fltId!)
            closeContextMenu()
          },
        })
      }
      items.push({ icon: Link2, label: 'Locate Pairing', onClick: handleLocatePairing })
      if (task.fltId != null && liveHasFlightPaneOpen()) {
        items.push({ icon: Plane, label: 'Locate Flight', onClick: handleLocateFlight })
      }
    }
    items.push({ icon: CalendarDays, label: 'Schedule Details', onClick: handleScheduleDetails })
    items.push({ icon: CalendarClock, label: 'Daily Task Calendar', onClick: handleDailyTaskCalendar })
    // When this puck is part of an active box-selection, Delete acts on the whole selection.
    const selectedIds = useGanttViewStore.getState().selectedTaskIds
    const multiCount = selectedIds.size > 1 && selectedIds.has(task.id) ? selectedIds.size : 0
    items.push(
      { icon: Trash2, label: multiCount > 0 ? `Delete ${multiCount} Tasks` : 'Delete', shortcut: 'Del', onClick: handleDelete, danger: true },
    )
    items.push({ icon: StickyNote, label: memoLabel, onClick: handleMemo })
  } else if (paneType?.startsWith('roster') && task.id === -1 && task.crewId) {
    // Background right-click on roster row (mockTask id = -1) → "Create Ground Task"
    items.push({
      icon: UserRound,
      label: 'Crew Info',
      onClick: () => {
        useUiStore.getState().openCrewInfo(task.crewId!)
        closeContextMenu()
      },
    })
    items.push({
      icon: SquarePlus,
      label: 'Create Ground Task',
      onClick: () => {
        openGroundTaskCreate(groundTaskPrefill ?? { crewId: task.crewId })
        closeContextMenu()
      },
    })
    items.push({ icon: StickyNote, label: 'Add Memo', onClick: handleMemo })
    items.push({ icon: CalendarDays, label: 'Schedule Details', onClick: handleScheduleDetails })
    items.push({ icon: CalendarClock, label: 'Daily Task Calendar', onClick: handleDailyTaskCalendar })
    items.push({
      icon: CalendarClock,
      label: 'Manday Info',
      onClick: () => {
        useUiStore.getState().openMandayInfoDialog(task.crewId!)
        closeContextMenu()
      },
    })
  } else if (paneType === 'pairing' && hasTask) {
    // Pairing pane actions — task.id is segment ID; task.pairingId is the actual pairing ID
    const pairingId = task.pairingId ?? task.id
    items.push(
      {
        icon: Link2,
        label: 'View pairing detail',
        onClick: () => {
          useUiStore.getState().openPairingInfo(pairingId)
          closeContextMenu()
        },
      },
    )
    // "Jump to this day's pairing" — only present when the right-click landed on a
    // canvas pixel whose day resolved to a matching pairing (pre-computed by
    // SharedPairingPane.onItemRightClick and stored on ui-store).
    if (jumpToDayScrollY != null) {
      items.push({
        icon: CalendarArrowDown,
        label: "Jump to this day's pairing",
        onClick: () => {
          applyPairingPaneScrollY('live', jumpToDayScrollY)
          closeContextMenu()
        },
      })
    }
    if (findCtx.findFltId != null) {
      items.push({
        icon: Plane,
        label: 'View flight detail',
        onClick: () => {
          openFlightDetail(findCtx.findFltId as number)
          closeContextMenu()
        },
      })
      if (liveHasFlightPaneOpen()) {
        items.push({ icon: Plane, label: 'Locate Flight', onClick: handleLocateFlight })
      }
      items.push({
        icon: Trash2,
        label: 'Remove flight from pairing',
        danger: true,
        onClick: () => {
          const fltId = findCtx.findFltId as number
          void (async () => {
            try {
              const res = await pairingApi.removeFlight(pairingId, fltId)
              usePairingStore.getState().removeItem(pairingId)
              if (!res.deleted) await bringPairingIdToTop(pairingId)
              notify.success(res.deleted ? 'Pairing removed (no flights left)' : 'Flight removed from pairing')
            } catch (e) {
              notify.error((e as Error).message || 'Failed to remove flight')
            }
          })()
          closeContextMenu()
        },
      })
    }
    items.push(
      {
        icon: ClipboardEdit,
        label: 'Edit Duty Nodes',
        onClick: () => {
          openDutyNodeDialog(pairingId)
          closeContextMenu()
        },
      },
      { icon: Crosshair, label: 'Select', onClick: () => { selectTask(pairingId); closeContextMenu() } },
      {
        icon: Trash2, label: 'Delete Pairing', onClick: () => {
          const selectedIds = useGanttViewStore.getState().selectedTaskIds
          const pairingIds = selectedIds.size > 1
            ? resolveSelectedPairingIds(selectedIds)
            : [pairingId]
          deletePairings(pairingIds.length > 0 ? pairingIds : [pairingId])
          clearSelection()
          closeContextMenu()
        }, danger: true,
      },
    )
    items.push({
      icon: Users,
      label: 'Find Crew by Pairing',
      onClick: () => {
        void findCrewToTop('pairing', pairingId, findCtx.findTargetPane ?? 'main')
        closeContextMenu()
      },
    })
    if (findCtx.findFltId != null) {
      items.push(
        {
          icon: Users,
          label: 'Find Crew by Flight',
          onClick: () => {
            void findCrewToTop('flight', findCtx.findFltId as number, findCtx.findTargetPane ?? 'main')
            closeContextMenu()
          },
        },
        {
          icon: PackageSearch,
          label: 'Find Pairing by Flight',
          onClick: () => {
            void findPairingsByFlight(findCtx.findFltId as number)
            closeContextMenu()
          },
        },
      )
    }
  } else if (paneType === 'flight' && hasTask) {
    // Flight pane actions — first item is Flight Detail
    const selectedIds = useGanttViewStore.getState().selectedTaskIds
    const flightIds = selectedIds.size > 0 ? [...selectedIds] : [task.id]

    items.push(
      { icon: Plane, label: 'Flight Detail', onClick: () => { openFlightDetail(task.id); closeContextMenu() } },
      { icon: Crosshair, label: 'Select', onClick: () => { selectTask(task.id); closeContextMenu() } },
      {
        icon: PackagePlus,
        label: `Create Pairing (${flightIds.length} flight${flightIds.length > 1 ? 's' : ''})`,
        onClick: () => {
          void (async () => {
            try {
              const res = await pairingApi.build(flightIds as number[])
              await bringPairingIdToTop(res.pairingId)
              notify.success(`Pairing ${res.label} created (${res.dutyCount} duty${res.dutyCount > 1 ? 's' : ''}, ${res.segCount} flight${res.segCount > 1 ? 's' : ''})`)
            } catch (e) {
              notify.error((e as Error).message || 'Failed to create pairing')
            }
          })()
          clearSelection()
          closeContextMenu()
        },
      },
      {
        icon: Users,
        label: 'Find Crew by Flight',
        onClick: () => {
          void findCrewToTop('flight', findCtx.findFltId ?? task.id, findCtx.findTargetPane ?? 'main')
          closeContextMenu()
        },
      },
      {
        icon: PackageSearch,
        label: 'Find Pairing by Flight',
        onClick: () => {
          void findPairingsByFlight(findCtx.findFltId ?? task.id)
          closeContextMenu()
        },
      },
    )
  } else if (hasTask) {
    items.push(
      { icon: Crosshair, label: 'Select', onClick: () => { selectTask(task.id); closeContextMenu() } },
    )
  }

  // Pin/Unpin selected rows — available in all panes
  if (paneType) {
    const paneState = usePaneStore.getState()
    const selectedRows = paneState.getSelectedRowIds(paneType)
    const frozenRows = paneState.getFrozenRowIds(paneType)

    // "Pin Selected Rows" — when there are selected rows
    if (selectedRows.length > 0) {
      const alreadyFrozen = selectedRows.every((id) => frozenRows.includes(id))
      if (!alreadyFrozen) {
        items.push({
          icon: Pin,
          label: `Pin ${selectedRows.length} Selected Row${selectedRows.length > 1 ? 's' : ''}`,
          onClick: () => {
            paneState.freezeSelectedRows(paneType)
            useGanttViewStore.getState().markDirty()
            closeContextMenu()
          },
        })
      }
    }

    // "Unpin All" — when there are frozen rows
    if (frozenRows.length > 0) {
      items.push({
        icon: PinOff,
        label: `Unpin All (${frozenRows.length})`,
        onClick: () => {
          paneState.unfreezeAll(paneType)
          useGanttViewStore.getState().markDirty()
          closeContextMenu()
        },
      })
    }
  }

  if (items.length === 0) return null

  // Clamp position to viewport
  const menuW = 200
  const menuH = items.length * 32 + 8
  const x = Math.min(position.x, window.innerWidth - menuW - 8)
  const y = Math.min(position.y, window.innerHeight - menuH - 8)

  return (
    <div
      ref={menuRef}
      data-roster-source={task.source ?? ''}
      className="fixed z-50 w-[200px] overflow-hidden rounded-md border border-border/60 bg-popover/98 p-1 shadow-[0_4px_16px_rgba(0,0,0,0.12)] animate-in fade-in-0 zoom-in-95 duration-100"
      style={{ left: x, top: y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => (
        <button
          key={item.label}
          disabled={item.disabled}
          onMouseDown={(e) => e.stopPropagation()} // Prevent document mousedown from closing menu
          className={[
            'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs transition-all duration-100',
            item.danger
              ? 'text-destructive hover:bg-destructive/10'
              : 'text-popover-foreground hover:bg-accent/60',
            item.disabled ? 'pointer-events-none opacity-40' : 'active:scale-95',
          ].join(' ')}
          onClick={item.onClick}
        >
          <item.icon className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 text-left">{item.label}</span>
          {item.shortcut && (
            <span className="text-2xs text-muted-foreground/50">{item.shortcut}</span>
          )}
        </button>
      ))}
    </div>
  )
}
