import { create } from 'zustand'
import type { RosterItem, PaneType } from '@/types'

export interface GroundTaskPrefill {
  crewId?: string
  startDate?: string
  startTime?: string
  depArp?: string
  arvArp?: string
}

interface UiStore {
  /** Sidebar collapsed state */
  sidebarCollapsed: boolean

  /** Task detail dialog */
  taskDetailOpen: boolean
  taskDetailItem: RosterItem | null

  /** Add task dialog */
  addTaskOpen: boolean
  addTaskCrewId: string | null
  addTaskPaneId: 'main' | 'sub'

  /** Swap dialog */
  swapDialogOpen: boolean
  swapSourceTask: RosterItem | null

  /** Context menu */
  contextMenuOpen: boolean
  contextMenuPosition: { x: number; y: number }
  contextMenuTask: RosterItem | null
  contextMenuPane: PaneType | null
  contextMenuRowIndex: number
  /** Scenario context for the right-click menu — null = Live mode (Live ContextMenu handles it). */
  contextMenuScenarioId: number | null
  /**
   * Pre-computed target `scrollY` for the "Jump to this day's pairing" action on the
   * Pairing Pane right-click menu. The right-click handler computes the target day +
   * row index + clamped scrollY at the moment of the click and stores it here, so the
   * menu handler only needs to dispatch `setViewport` / `setScrollY`. null on every
   * other context (roster pane, flight pane, non-pairing right-clicks).
   */
  contextMenuJumpToDayScrollY: number | null

  /** Global loading overlay */
  globalLoading: boolean

  /** Status bar info text (from hover) */
  statusBarText: string

  /** Keyboard shortcuts dialog */
  shortcutsOpen: boolean
  openShortcuts: () => void
  closeShortcuts: () => void

  /** Flight detail dialog */
  flightDetailOpen: boolean
  flightDetailId: number | null
  /** Scenario context for the flight detail dialog — null = Live mode (read flight-store). */
  flightDetailScenarioId: number | null
  openFlightDetail: (id: number, scenarioId?: number) => void
  closeFlightDetail: () => void

  /** Flight Navi dialog (table navigator over the loaded flights) */
  flightNaviOpen: boolean
  /** Scenario context for the navi (null = Live). Picks the data source + navigation targets. */
  flightNaviScenarioId: number | null
  openFlightNavi: (scenarioId?: number) => void
  closeFlightNavi: () => void

  /** Pairing info dialog (double-click a pairing) */
  pairingInfoOpen: boolean
  pairingInfoId: number | null
  /** Scenario context for the pairing info dialog — null = Live mode. */
  pairingInfoScenarioId: number | null
  /** Selected crew for crew-specific duty values in Pairing Detail. */
  pairingInfoCrewId: string | null
  /** Roster-pane entry locks the selected crew; pairing-pane entry leaves it selectable. */
  pairingInfoCrewLocked: boolean
  openPairingInfo: (id: number, scenarioId?: number, crewId?: string) => void
  setPairingInfoCrewId: (crewId: string) => void
  closePairingInfo: () => void

  /** Add pane menu */
  addPaneMenuOpen: boolean
  addPaneMenuTarget: { row: number; col: number } | null
  openAddPaneMenu: (row: number, col: number) => void
  closeAddPaneMenu: () => void

  /** Duty node editor dialog */
  dutyNodeDialogOpen: boolean
  dutyNodeDialogPairingId: number | null

  openDutyNodeDialog: (pairingId: number) => void
  closeDutyNodeDialog: () => void

  /** Ground task dialog */
  groundTaskDialogOpen: boolean
  groundTaskMode: 'create' | 'edit'
  groundTaskEditItem: RosterItem | null
  groundTaskPrefill: GroundTaskPrefill | null
  /** When set, dialog is Scenario view-only (no write API). Live callers leave this null. */
  groundTaskScenarioId: number | null

  openGroundTaskCreate: (prefill?: GroundTaskPrefill) => void
  openGroundTaskEdit: (item: RosterItem, scenarioId?: number) => void
  closeGroundTaskDialog: () => void
  setGroundTaskPrefill: (prefill: GroundTaskPrefill | null) => void

  /** Crew memo dialog (add / edit / delete a range-based note). */
  memoDialogOpen: boolean
  memoDialogPrefill: { id?: number; crewId: string; strDtLoc: string; endDtLoc: string; memo: string; name?: string } | null
  openMemoDialog: (prefill: { id?: number; crewId: string; strDtLoc: string; endDtLoc: string; memo: string; name?: string }) => void
  closeMemoDialog: () => void

  /** Manday Info dialog (daily credit + BH for viewport calendar month). */
  mandayInfoOpen: boolean
  mandayInfoCrewId: string | null
  mandayInfoScenarioId: number | null
  openMandayInfoDialog: (crewId: string, scenarioId?: number) => void
  closeMandayInfoDialog: () => void

  /** Schedule Details dialog (crew schedule rows for one roster period). */
  scheduleDetailsOpen: boolean
  scheduleDetailsCrewId: string | null
  scheduleDetailsScenarioId: number | null
  scheduleDetailsPane: PaneType | null
  openScheduleDetailsDialog: (crewId: string, scenarioId?: number, pane?: PaneType | null) => void
  closeScheduleDetailsDialog: () => void

  /** Daily Task Calendar dialog (crew day calendar for Live month / Scenario RP period). */
  dailyTaskCalendarOpen: boolean
  dailyTaskCalendarCrewId: string | null
  dailyTaskCalendarScenarioId: number | null
  dailyTaskCalendarPane: PaneType | null
  openDailyTaskCalendarDialog: (crewId: string, scenarioId?: number, pane?: PaneType | null) => void
  closeDailyTaskCalendarDialog: () => void

  /** Crew Info dialog (read-only master data + history tabs). */
  crewInfoOpen: boolean
  crewInfoCrewId: string | null
  openCrewInfo: (crewId: string) => void
  closeCrewInfo: () => void

  /** Timeline day statistics dialog. */
  ganttDayStatisticsOpen: boolean
  ganttDayStatisticsDate: string | null
  ganttDayStatisticsScenarioId: number | null
  openGanttDayStatistics: (date: string, scenarioId?: number) => void
  closeGanttDayStatistics: () => void

  // Sidebar
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void

  // Task detail dialog
  openTaskDetail: (item: RosterItem) => void
  closeTaskDetail: () => void

  // Add task dialog
  openAddTask: (crewId: string | null, paneId?: 'main' | 'sub') => void
  closeAddTask: () => void

  // Swap dialog
  openSwapDialog: (task: RosterItem) => void
  closeSwapDialog: () => void

  // Context menu
  openContextMenu: (x: number, y: number, task: RosterItem, pane: PaneType, rowIndex?: number, scenarioId?: number, jumpToDayScrollY?: number | null) => void
  closeContextMenu: () => void

  // Global loading
  setGlobalLoading: (loading: boolean) => void

  // Status bar
  setStatusBarText: (text: string) => void
}

export const useUiStore = create<UiStore>((set) => ({
  sidebarCollapsed: false,
  taskDetailOpen: false,
  taskDetailItem: null,
  addTaskOpen: false,
  addTaskCrewId: null,
  addTaskPaneId: 'main',
  swapDialogOpen: false,
  swapSourceTask: null,
  contextMenuOpen: false,
  contextMenuPosition: { x: 0, y: 0 },
  contextMenuTask: null,
  contextMenuPane: null,
  contextMenuRowIndex: -1,
  contextMenuScenarioId: null,
  contextMenuJumpToDayScrollY: null,
  globalLoading: false,
  statusBarText: '',
  addPaneMenuOpen: false,
  addPaneMenuTarget: null,
  flightDetailOpen: false,
  flightDetailId: null,
  flightDetailScenarioId: null,
  groundTaskDialogOpen: false,
  groundTaskMode: 'create',
  groundTaskEditItem: null,
  groundTaskPrefill: null,
  groundTaskScenarioId: null,

  dutyNodeDialogOpen: false,
  dutyNodeDialogPairingId: null,

  openDutyNodeDialog:  (pairingId) => set({ dutyNodeDialogOpen: true,  dutyNodeDialogPairingId: pairingId }),
  closeDutyNodeDialog: ()          => set({ dutyNodeDialogOpen: false, dutyNodeDialogPairingId: null }),

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  openTaskDetail: (item) => set({ taskDetailOpen: true, taskDetailItem: item }),
  closeTaskDetail: () => set({ taskDetailOpen: false, taskDetailItem: null }),

  openAddTask: (crewId, paneId = 'main') =>
    set({ addTaskOpen: true, addTaskCrewId: crewId, addTaskPaneId: paneId }),
  closeAddTask: () => set({ addTaskOpen: false, addTaskCrewId: null }),

  openSwapDialog: (task) => set({ swapDialogOpen: true, swapSourceTask: task }),
  closeSwapDialog: () => set({ swapDialogOpen: false, swapSourceTask: null }),

  openContextMenu: (x, y, task, pane, rowIndex = -1, scenarioId, jumpToDayScrollY = null) =>
    set({
      contextMenuOpen: true,
      contextMenuPosition: { x, y },
      contextMenuTask: task,
      contextMenuPane: pane,
      contextMenuRowIndex: rowIndex,
      contextMenuScenarioId: scenarioId ?? null,
      contextMenuJumpToDayScrollY: jumpToDayScrollY ?? null,
    }),
  closeContextMenu: () =>
    set({ contextMenuOpen: false, contextMenuTask: null, contextMenuPane: null, contextMenuRowIndex: -1, contextMenuScenarioId: null, contextMenuJumpToDayScrollY: null }),

  setGlobalLoading: (loading) => set({ globalLoading: loading }),
  setStatusBarText: (text) => set({ statusBarText: text }),

  shortcutsOpen: false,
  openShortcuts: () => set({ shortcutsOpen: true }),
  closeShortcuts: () => set({ shortcutsOpen: false }),

  openFlightDetail: (id, scenarioId) =>
    set({ flightDetailOpen: true, flightDetailId: id, flightDetailScenarioId: scenarioId ?? null }),
  closeFlightDetail: () => set({ flightDetailOpen: false, flightDetailId: null, flightDetailScenarioId: null }),

  flightNaviOpen: false,
  flightNaviScenarioId: null,
  openFlightNavi: (scenarioId) => set({ flightNaviOpen: true, flightNaviScenarioId: scenarioId ?? null }),
  closeFlightNavi: () => set({ flightNaviOpen: false, flightNaviScenarioId: null }),

  pairingInfoOpen: false,
  pairingInfoId: null,
  pairingInfoScenarioId: null,
  pairingInfoCrewId: null,
  pairingInfoCrewLocked: false,
  openPairingInfo: (id, scenarioId, crewId) =>
    set({
      pairingInfoOpen: true,
      pairingInfoId: id,
      pairingInfoScenarioId: scenarioId ?? null,
      pairingInfoCrewId: crewId ?? null,
      pairingInfoCrewLocked: crewId != null,
    }),
  setPairingInfoCrewId: (crewId) =>
    set((state) => state.pairingInfoCrewLocked ? state : { pairingInfoCrewId: crewId }),
  closePairingInfo: () => set({
    pairingInfoOpen: false,
    pairingInfoId: null,
    pairingInfoScenarioId: null,
    pairingInfoCrewId: null,
    pairingInfoCrewLocked: false,
  }),

  openAddPaneMenu: (row, col) => set({ addPaneMenuOpen: true, addPaneMenuTarget: { row, col } }),
  closeAddPaneMenu: () => set({ addPaneMenuOpen: false, addPaneMenuTarget: null }),

  openGroundTaskCreate: (prefill) => set({
    groundTaskDialogOpen: true,
    groundTaskMode: 'create',
    groundTaskEditItem: null,
    groundTaskPrefill: prefill ?? null,
    groundTaskScenarioId: null,
  }),
  openGroundTaskEdit: (item, scenarioId) => set({
    groundTaskDialogOpen: true,
    groundTaskMode: 'edit',
    groundTaskEditItem: item,
    groundTaskPrefill: null,
    groundTaskScenarioId: scenarioId ?? null,
  }),
  closeGroundTaskDialog: () => set({
    groundTaskDialogOpen: false,
    groundTaskEditItem: null,
    groundTaskPrefill: null,
    groundTaskScenarioId: null,
  }),
  setGroundTaskPrefill: (prefill) => set({ groundTaskPrefill: prefill }),

  memoDialogOpen: false,
  memoDialogPrefill: null,
  openMemoDialog: (prefill) => set({ memoDialogOpen: true, memoDialogPrefill: prefill }),
  closeMemoDialog: () => set({ memoDialogOpen: false, memoDialogPrefill: null }),

  mandayInfoOpen: false,
  mandayInfoCrewId: null,
  mandayInfoScenarioId: null,
  openMandayInfoDialog: (crewId, scenarioId) =>
    set({ mandayInfoOpen: true, mandayInfoCrewId: crewId, mandayInfoScenarioId: scenarioId ?? null }),
  closeMandayInfoDialog: () =>
    set({ mandayInfoOpen: false, mandayInfoCrewId: null, mandayInfoScenarioId: null }),

  scheduleDetailsOpen: false,
  scheduleDetailsCrewId: null,
  scheduleDetailsScenarioId: null,
  scheduleDetailsPane: null,
  openScheduleDetailsDialog: (crewId, scenarioId, pane = null) =>
    set({
      scheduleDetailsOpen: true,
      scheduleDetailsCrewId: crewId,
      scheduleDetailsScenarioId: scenarioId ?? null,
      scheduleDetailsPane: pane,
    }),
  closeScheduleDetailsDialog: () =>
    set({
      scheduleDetailsOpen: false,
      scheduleDetailsCrewId: null,
      scheduleDetailsScenarioId: null,
      scheduleDetailsPane: null,
    }),

  dailyTaskCalendarOpen: false,
  dailyTaskCalendarCrewId: null,
  dailyTaskCalendarScenarioId: null,
  dailyTaskCalendarPane: null,
  openDailyTaskCalendarDialog: (crewId, scenarioId, pane = null) =>
    set({
      dailyTaskCalendarOpen: true,
      dailyTaskCalendarCrewId: crewId,
      dailyTaskCalendarScenarioId: scenarioId ?? null,
      dailyTaskCalendarPane: pane,
    }),
  closeDailyTaskCalendarDialog: () =>
    set({
      dailyTaskCalendarOpen: false,
      dailyTaskCalendarCrewId: null,
      dailyTaskCalendarScenarioId: null,
      dailyTaskCalendarPane: null,
    }),

  crewInfoOpen: false,
  crewInfoCrewId: null,
  openCrewInfo: (crewId) => set({ crewInfoOpen: true, crewInfoCrewId: crewId }),
  closeCrewInfo: () => set({ crewInfoOpen: false, crewInfoCrewId: null }),

  ganttDayStatisticsOpen: false,
  ganttDayStatisticsDate: null,
  ganttDayStatisticsScenarioId: null,
  openGanttDayStatistics: (date, scenarioId) =>
    set({
      ganttDayStatisticsOpen: true,
      ganttDayStatisticsDate: date,
      ganttDayStatisticsScenarioId: scenarioId ?? null,
    }),
  closeGanttDayStatistics: () =>
    set({
      ganttDayStatisticsOpen: false,
      ganttDayStatisticsDate: null,
      ganttDayStatisticsScenarioId: null,
    }),
}))
