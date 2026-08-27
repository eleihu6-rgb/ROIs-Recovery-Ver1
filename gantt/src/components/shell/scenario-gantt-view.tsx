// gantt/src/components/shell/scenario-gantt-view.tsx
import { useEffect, useMemo, useRef, useCallback } from 'react'
import type { ReactNode } from 'react'
import {
  getScenarioGanttStore,
  destroyScenarioGanttStore,
  setActiveScenarioGanttVersion,
} from '@/stores/scenario-gantt-store'
import { useShellStore } from '@/stores/shell-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { calendarDateToUtcMidnight } from '@/components/gantt/gantt-utils'
import { getScenarioLayoutStore, destroyScenarioLayoutStore } from '@/stores/scenario-layout-store'
import type { ScenarioPaneType } from '@/stores/scenario-layout-store'
import { refreshScenarioLegality } from '@/services/scenario-legality-api'
import { useKeyboard } from '@/hooks/use-keyboard'
import { useScenarioWsUpdates } from '@/hooks/use-scenario-ws-updates'
import { GanttContextProvider } from '@/components/gantt/context/gantt-context'
import { ScenarioGanttToolbar } from '@/components/scenario-gantt/scenario-gantt-toolbar'
import { ScenarioLayoutGrid } from '@/components/scenario-gantt/scenario-layout-grid'
import { ScenarioDragProvider } from '@/components/scenario-gantt/scenario-drag-provider'
import { ScenarioHorizontalScrollbar } from '@/components/scenario-gantt/scenario-horizontal-scrollbar'
import { ScenarioStatusBar } from '@/components/scenario-gantt/scenario-status-bar'
import { ViolationTooltip } from '@/components/gantt/violation-tooltip'
import { CrossRankConfirmProvider } from '@/components/scenario-gantt/cross-rank-confirm-dialog'
import { scenarioTabLabel } from '@/utils/scenario-module'
import { scenarioGanttApi } from '@/services/scenario-gantt-api'
import { isScenarioNotFoundError } from './scenario-error-routing'
import { getScenarioRosterSelectionStore } from '@/stores/scenario-roster-selection-store'
import { buildScenarioRosterItems } from '@/components/scenario-gantt/build-scenario-roster-items'
import { buildScenarioRosterRemovePatch } from '@/utils/scenario-roster-edit'
import { notify } from '@/utils/notify'
import { getScenarioViolationStore } from '@/stores/scenario-violation-store'
import { useRuleCheckStore } from '@/stores/rule-check-store'

const LOCK_POLL_MS      = 30_000
const LOCK_KEEPALIVE_MS = 5 * 60_000

/**
 * StrictMode-safe store teardown. Destroying the per-scenario store directly in
 * the effect cleanup recreated it on the next render (new loadData identity),
 * which re-fired the load effect in an infinite request loop — hundreds of
 * /gantt-data calls per second when the endpoint fast-fails (502 flood incident,
 * 2026-06-05). Destroy is deferred one tick and cancelled by an immediate
 * remount, so the registry store stays stable for the whole mounted life.
 */
const pendingDestroy = new Map<string, number>()

const scenarioStoreKey = (scenarioId: number, version?: string): string =>
  `${scenarioId}@${version ?? 'current'}`

const cancelDeferredDestroy = (scenarioId: number, version?: string): void => {
  const key = scenarioStoreKey(scenarioId, version)
  const t = pendingDestroy.get(key)
  if (t !== undefined) {
    window.clearTimeout(t)
    pendingDestroy.delete(key)
  }
}

const scheduleDeferredDestroy = (scenarioId: number, version?: string): void => {
  const key = scenarioStoreKey(scenarioId, version)
  cancelDeferredDestroy(scenarioId, version)
  pendingDestroy.set(key, window.setTimeout(() => {
    pendingDestroy.delete(key)
    const s = getScenarioGanttStore(scenarioId, version).getState()
    if (s.lockStatus?.isOwner) void s.releaseLock(scenarioId)
    destroyScenarioGanttStore(scenarioId, version)
    if (version === undefined) destroyScenarioLayoutStore(scenarioId)
  }, 0))
}

export const ScenarioGanttView = ({ scenarioId, version }: { scenarioId: number; version?: string }): ReactNode => {
  const moduleKey = version ? `scenario-gantt:${scenarioId}@${version}` : `scenario-gantt:${scenarioId}`
  const activeModule = useShellStore((s) => s.activeModule)
  const active = activeModule === moduleKey
  const checking = getScenarioViolationStore(scenarioId)((s) => s.checking)
  // Block save/undo while a legality check (or its confirm dialog) is in flight for
  // this scenario's drag-drop. Scenario's roster-assign path goes through
  // checkLiveDraftLegality → useRuleCheckStore.showConfirmDialog, which is global —
  // not visible to getScenarioViolationStore(scenarioId).checking. Without this
  // subscription Save + Undo flicker enabled between addPatch and the dialog
  // appearing, and stay enabled through the whole violation confirm (regression
  // for "drag pairing → crew" in SIT: see scenario-save-gate-confirm-dialog spec).
  const ruleCheckActive = useRuleCheckStore((s) => s.checking || s.confirmDialog.open)
  if (active) setActiveScenarioGanttVersion(scenarioId, version)

  // Wire global keyboard shortcuts (ESC clear-all-selections, zoom, undo/redo) for the
  // scenario gantt. AppLayout is not mounted for scenario tabs, so useKeyboard must be
  // called here to ensure shortcuts work in the scenario context.
  // This hook runs before the provider is returned, so pass the Scenario context
  // explicitly instead of falling back to the Live default context.
  useKeyboard(scenarioId, active)

  // Targeted refresh on async recompute pushes (manday / KPI / legality). Save now does
  // a full gantt-data reload; this hook only handles background push-driven deltas.
  useScenarioWsUpdates(scenarioId)

  const containerRef   = useRef<HTMLDivElement>(null)
  const isFirstLoad    = useRef(true)
  const defaultViewportRef = useRef<{ pxPerHour: number; scrollX: number } | null>(null)
  const useStore       = getScenarioGanttStore(scenarioId)
  const useLayoutStore = getScenarioLayoutStore(scenarioId)
  const refreshToken   = useShellStore((s) => s.scenarioTabRefreshTokens[moduleKey] ?? 0)

  const data           = useStore((s) => s.data)
  const loading        = useStore((s) => s.loading)
  const error          = useStore((s) => s.error)
  const pendingChanges = useStore((s) => s.pendingChanges)
  const canUndo        = useStore((s) => s.pendingChanges.length > 0)
  const canRedo        = useStore((s) => s.redoStack.length > 0)
  const isDirty        = useStore((s) => s.isDirty)
  const saving         = useStore((s) => s.saving)
  const lockStatus     = useStore((s) => s.lockStatus)
  const acquiringLock  = useStore((s) => s.acquiringLock)
  const pxPerHour      = useStore((s) => s.pxPerHour)
  const zoomMin        = useStore((s) => s.zoomMin)
  const zoomMax        = useStore((s) => s.zoomMax)
  const scrollX        = useStore((s) => s.scrollX)
  const setZoomBounds   = useStore((s) => s.setZoomBounds)
  const setViewportWidth = useStore((s) => s.setViewportWidth)

  const acquireLock      = useStore((s) => s.acquireLock)
  const releaseLock      = useStore((s) => s.releaseLock)
  const refreshLock      = useStore((s) => s.refreshLock)
  const loadData         = useStore((s) => s.loadData)
  const save             = useStore((s) => s.save)
  const undo             = useStore((s) => s.undo)
  const redo             = useStore((s) => s.redo)
  const zoomIn           = useStore((s) => s.zoomIn)
  const zoomOut          = useStore((s) => s.zoomOut)
  const useRosterSelectionStore = getScenarioRosterSelectionStore(scenarioId)
  const selectedTaskIds = useRosterSelectionStore((s) => s.selectedTaskIds)

  const layoutPanes       = useLayoutStore((s) => s.panes)
  const sharedLeftPanelW  = useLayoutStore((s) => s.leftPanelWidth)
  const addPane           = useLayoutStore((s) => s.addPane)

  // Reset must re-apply capabilities: store.reset() restores the HARDCODED roster+pairing
  // default and clears capabilitiesApplied, which on a PO scenario would surface a
  // capability-FORBIDDEN roster pane. After reset, capabilitiesApplied is false again, so
  // applyCapabilityDefaults performs a fresh first-rebuild to caps.defaultPanes — Reset on
  // PO → pairing+flight, Reset on RO → roster+pairing. (The view-level capability effect
  // does not re-fire here because its deps [capabilities, scenarioId] are unchanged.)
  const handleResetLayout = useCallback(() => {
    const store = getScenarioLayoutStore(scenarioId).getState()
    store.reset()
    const caps = data?.capabilities
    if (caps) getScenarioLayoutStore(scenarioId).getState().applyCapabilityDefaults(caps)
  }, [scenarioId, data?.capabilities])

  const handleRefresh = useCallback(() => {
    if (isDirty) {
      notify.warning('Save or undo scenario changes before refreshing')
      return
    }
    void loadData(scenarioId, version)
  }, [isDirty, loadData, scenarioId, version])

  const handleDeleteSelected = useCallback(() => {
    if (!data || version || !lockStatus?.isOwner || !data.capabilities.roster.canRemove) return
    if (selectedTaskIds.size === 0) {
      notify.warning('Select a CR task first')
      return
    }

    const { items } = buildScenarioRosterItems({
      crew: data.crew,
      pairingMap: new Map(data.pairings.map((pairing) => [pairing.pairingId, pairing])),
      assignments: data.assignments,
      pairingSegments: data.pairingSegments,
      groundItems: data.groundItems,
      pendingChanges,
    })
    const selectedItems = items.filter((item) => selectedTaskIds.has(item.id))
    const patches = new Map<string, ReturnType<typeof buildScenarioRosterRemovePatch>>()
    for (const item of selectedItems) {
      const patch = buildScenarioRosterRemovePatch(item)
      if (!patch) continue
      const key = patch.pairingId != null
        ? `pairing:${patch.crewId}:${patch.pairingId}`
        : `ground:${patch.crewId}:${patch.startDtUtc}:${patch.endDtUtc}:${patch.assignmentGroup}:${patch.assignment}`
      patches.set(key, patch)
    }
    if (patches.size === 0) {
      notify.warning('Only source=CR scenario tasks can be deleted')
      return
    }
    for (const patch of patches.values()) {
      if (patch) getScenarioGanttStore(scenarioId).getState().addPatch(patch)
    }
    getScenarioRosterSelectionStore(scenarioId).getState().clear()
  }, [data, lockStatus?.isOwner, pendingChanges, scenarioId, selectedTaskIds, version])

  const openPaneTypes = useMemo(
    () => new Set([...layoutPanes.values()].map((p) => p.type)),
    [layoutPanes],
  )

  // Apply scenario-type capabilities to the layout: first time rebuilds to defaultPanes,
  // subsequent runs only enforce the allowed pane set (the store's flag guards the rebuild,
  // so a customized layout is never clobbered on data refresh / tab switch).
  useEffect(() => {
    const caps = data?.capabilities
    if (caps) getScenarioLayoutStore(scenarioId).getState().applyCapabilityDefaults(caps)
  }, [data?.capabilities, scenarioId])

  useEffect(() => {
    // Remount within the same tick (StrictMode) keeps the existing store alive.
    cancelDeferredDestroy(scenarioId, version)
    // Resolve the store at effect time (registry truth) — and only re-run when
    // this scenario is remounted or explicitly refreshed.
    void getScenarioGanttStore(scenarioId).getState().loadData(scenarioId, version)
    return () => scheduleDeferredDestroy(scenarioId, version)
  }, [scenarioId, version, refreshToken])

  // Load the persisted at-rest legality (Rust-computed, stored in scenario.rule_violation) so
  // the scenario gantt bells reflect the stored violations. Must apply into the violation store
  // — a bare fetch leaves Alert Center / crew bells on a stale snapshot. COMPUTING→READY after
  // a save also arrives via scenario-legality-updated WS (useScenarioWsUpdates).
  useEffect(() => {
    if (version || !data?.scenarioStrDt || !data?.scenarioEndDt) return
    void refreshScenarioLegality(scenarioId).catch(() => { /* next open / WS retries */ })
  }, [scenarioId, version, data?.scenarioStrDt, data?.scenarioEndDt])

  // Persist the tab label and type whenever scenario data loads so it survives page refresh.
  useEffect(() => {
    const moduleKey = version ? `scenario-gantt:${scenarioId}@${version}` : `scenario-gantt:${scenarioId}`
    if (data?.scenarioName) {
      useShellStore.getState().setScenarioTabLabel(moduleKey, scenarioTabLabel(scenarioId, data.scenarioName, version))
    }
    if (data?.fileType) {
      useShellStore.getState().setScenarioTabType(moduleKey, data.fileType)
    }
  }, [scenarioId, version, data?.scenarioName, data?.fileType])

  // Apply this scenario's saved timezone whenever its tab becomes the active module.
  // Whether THIS scenario tab is the foreground tab. AppShell keep-alive mounts every open
  // tab; `active` lets a hidden tab drop its heavy canvas tree (see the suspend block below)
  // and pause background polling, while staying mounted so its store/edits survive.

  useEffect(() => {
    if (!active || !isScenarioNotFoundError(error)) return
    useShellStore.getState().closeTabAndSetModule(moduleKey, 'scenario')
    destroyScenarioGanttStore(scenarioId, version)
    if (version === undefined) destroyScenarioLayoutStore(scenarioId)
  }, [active, error, moduleKey, scenarioId])

  useEffect(() => {
    if (active) {
      useTimezoneStore.getState().applyScenarioTimezone(scenarioId)
    }
  }, [active, scenarioId])

  // Pause lock-status polling while hidden — a background scenario tab does not need it.
  // (Owner keepalive below stays gated on isOwner so an edit lock is never silently lost.)
  useEffect(() => {
    if (!active || version) return
    const id = setInterval(() => void refreshLock(scenarioId), LOCK_POLL_MS)
    return () => clearInterval(id)
  }, [active, version, scenarioId, refreshLock])

  const isOwner = lockStatus?.isOwner ?? false
  useEffect(() => {
    if (!isOwner || version) return
    const id = setInterval(() => void scenarioGanttApi.keepaliveLock(scenarioId), LOCK_KEEPALIVE_MS)
    return () => clearInterval(id)
  }, [isOwner, version, scenarioId])

  // Dynamic zoom bounds — matching Live Gantt behavior
  const updateZoomBounds = useCallback(() => {
    if (!data || !containerRef.current) return
    const leftPanelW = sharedLeftPanelW
    const viewportWidth = Math.max(1, containerRef.current.clientWidth - leftPanelW - 14)
    setViewportWidth(viewportWidth)
    const totalHours = Math.max(1, (new Date(data.endDtLoc).getTime() - new Date(data.strDtLoc).getTime()) / 3_600_000)
    const min = viewportWidth / totalHours
    const max = viewportWidth
    setZoomBounds(min, max)

    // On first load, zoom viewport to the official scenario definition.
    // scenarioStrDt/EndDt are stored as local-time-as-UTC (Postgres timestamp without tz),
    // so we must convert the calendar date to display-tz midnight via calendarDateToUtcMidnight.
    if (isFirstLoad.current || defaultViewportRef.current) {
      const current = getScenarioGanttStore(scenarioId).getState()
      const previousDefault = defaultViewportRef.current
      const stillAtDefault = !previousDefault ||
        (Math.abs(current.pxPerHour - previousDefault.pxPerHour) < 0.5 &&
          Math.abs(current.scrollX - previousDefault.scrollX) < 2)
      if (!stillAtDefault) {
        defaultViewportRef.current = null
        return
      }
      isFirstLoad.current = false
      const tz = useTimezoneStore.getState().timezone
      const rangeStart  = new Date(data.strDtLoc)
      const startCal = data.scenarioStrDt.slice(0, 10)
      const officialStr = calendarDateToUtcMidnight(startCal, tz)
      // End date is a scenario calendar day, so use the following day as exclusive upper bound.
      const endCal  = data.scenarioEndDt.slice(0, 10)
      const endNext = new Date(endCal + 'T12:00:00Z')
      endNext.setUTCDate(endNext.getUTCDate() + 1)
      const officialEnd   = calendarDateToUtcMidnight(endNext.toISOString().slice(0, 10), tz)
      const store = getScenarioGanttStore(scenarioId).getState()
      store.zoomToRp(officialStr.getTime(), officialEnd.getTime(), rangeStart, viewportWidth)
      const next = getScenarioGanttStore(scenarioId).getState()
      defaultViewportRef.current = { pxPerHour: next.pxPerHour, scrollX: next.scrollX }
    }
  }, [data, scenarioId, setZoomBounds, setViewportWidth, sharedLeftPanelW])

  useEffect(() => {
    updateZoomBounds()
    const rafId = window.requestAnimationFrame(updateZoomBounds)
    const resizeObserver = new ResizeObserver(updateZoomBounds)
    if (containerRef.current) resizeObserver.observe(containerRef.current)
    window.addEventListener('resize', updateZoomBounds)
    return () => {
      window.cancelAnimationFrame(rafId)
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateZoomBounds)
    }
  }, [updateZoomBounds])

  // Suspend hidden tabs: all hooks above have run (store data + effects preserved), but we
  // drop the toolbar/grid/canvas tree so a backgrounded scenario tab stops its per-frame RAF
  // render loop and releases its canvas elements (whose hi-DPI backing stores are sizeable
  // native memory, not visible in JS heap). Reactivating re-renders the full view from the
  // still-loaded store data — no /gantt-data refetch. Measured per hidden tab: 6 canvases +
  // ~154 DOM nodes dropped (docs/superpowers/specs/2026-06-15-120419-gantt-memory-optimization-scenario-focus-ai-coding.md).
  if (!active) {
    return <div data-testid="scenario-gantt-suspended" data-scenario-id={scenarioId} className="hidden" />
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Loading scenario data…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-destructive">
        Error: {error}
      </div>
    )
  }

  if (!data) return null

  return (
    <CrossRankConfirmProvider>
    <GanttContextProvider contextId={scenarioId}>
    <div ref={containerRef} className="flex h-full flex-col overflow-hidden" data-testid="scenario-gantt-view">
      <ScenarioGanttToolbar
        data={data}
        historicalVersion={version}
        lockStatus={lockStatus}
        isDirty={isDirty}
        saving={saving}
        checking={checking || ruleCheckActive}
        acquiringLock={acquiringLock}
        pendingCount={pendingChanges.length}
        canDelete={selectedTaskIds.size > 0 && !!data?.capabilities.roster.canRemove && !version}
        canUndo={canUndo}
        canRedo={canRedo}
        pxPerHour={pxPerHour}
        zoomMin={zoomMin}
        zoomMax={zoomMax}
        openPaneTypes={openPaneTypes}
        allowedPanes={data?.capabilities?.panes ?? ['roster', 'pairing', 'flight']}
        onZoomIn={() => {
          const vw = (containerRef.current?.clientWidth ?? window.innerWidth) - sharedLeftPanelW - 14
          zoomIn(Math.max(100, vw))
        }}
        onZoomOut={() => {
          const vw = (containerRef.current?.clientWidth ?? window.innerWidth) - sharedLeftPanelW - 14
          zoomOut(Math.max(100, vw))
        }}
        onRefresh={handleRefresh}
        onDelete={handleDeleteSelected}
        onUndo={undo}
        onRedo={redo}
        onAcquireLock={() => { if (!version) void acquireLock(scenarioId) }}
        onReleaseLock={() => { if (!version) void releaseLock(scenarioId) }}
        onSave={() => { if (!version) void save(scenarioId) }}
        onAddPane={(type: ScenarioPaneType) => addPane(type)}
        onResetLayout={handleResetLayout}
      />
      <ScenarioDragProvider scenarioId={scenarioId}>
        <ScenarioLayoutGrid scenarioId={scenarioId} />
      </ScenarioDragProvider>
      <ScenarioHorizontalScrollbar
        scenarioId={scenarioId}
        leftSpacer={sharedLeftPanelW}
      />
      <ScenarioStatusBar scenarioId={scenarioId} />
      <ViolationTooltip scenarioId={scenarioId} />
      {/* PairingInfoDialog + FlightDetailDialog are shared and hoisted to app-shell
          root (one instance for Live + Scenario), driven via ui-store with scenarioId. */}
    </div>
    </GanttContextProvider>
    </CrossRankConfirmProvider>
  )
}
