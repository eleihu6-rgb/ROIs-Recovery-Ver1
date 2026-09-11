import { useMemo, useState, useEffect, useRef } from 'react'
import { ArrowRight } from 'lucide-react'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { useRuleCheckStore } from '@/stores/rule-check-store'
import { useSessionViolationStore } from '@/stores/session-violation-store'
import { useRosterStore } from '@/stores/roster-store'
import { getScenarioViolationStore } from '@/stores/scenario-violation-store'
import { getScenarioGanttStore } from '@/stores/scenario-gantt-store'
import { useDragStore } from '@/stores/drag-store'
import { buildScenarioRosterItems } from '@/components/scenario-gantt/build-scenario-roster-items'
import { VIOLATION_SEVERITY_COLORS } from './gantt-constants'
import { isCrewBellOnlyRule } from './crew-bell-only-rules'
import {
  crew7504GapEndpointTasks,
  crewFlyTasksOverlappingWindow,
  crewTasksOverlappingWindow,
  pairingTasksOverlapViolationWindow,
  resolveViolationPaintWindow,
} from '@/utils/violation-puck-window'
import { severityLabelFromNum } from '@/utils/severity-labels'
import type { DisplayViolation } from '@/stores/session-violation-store'
import type { RosterItem } from '@/types'
import type { RuleViolation } from '@/types/rule-check'
import { isRosterCompleted, type RecoveryAlertSnapshot } from '@/services/recovery-candidates'

/** Delay before tooltip hides after mouse leaves the task (ms) */
const HIDE_DELAY = 600

export type ViolationTooltipEntry = {
  ruleCode: string
  ruleName: string
  ruleInstance?: string | null
  severity: number
  message: string
}

/**
 * Tooltip / Alert-style rule id. Prefer ruleCode + ruleInstance so a baked
 * ruleName like "7505/001" is not appended again → "7505/001/001".
 * When ruleInstance is absent, keep ruleName (may already include instance).
 */
export const formatViolationRuleLabel = (v: {
  ruleCode: string
  ruleName: string
  ruleInstance?: string | null
}): string => (v.ruleInstance ? `${v.ruleCode}/${v.ruleInstance}` : v.ruleName)

interface CollectViolationTooltipEntriesInput {
  hoveredTaskId: number | null
  hoveredCrewId: string | null
  violations: Map<string, RuleViolation[]>
  displayViolations: Map<number, DisplayViolation[]>
  scenarioViolations?: Map<string, RuleViolation[]>
  items: RosterItem[]
}

const collectViolationTooltipEntries = ({
  hoveredTaskId,
  hoveredCrewId,
  violations,
  displayViolations,
  scenarioViolations,
  items,
}: CollectViolationTooltipEntriesInput): ViolationTooltipEntry[] => {
  const result: ViolationTooltipEntry[] = []
  const seen = new Set<string>()

  const addEntry = (
    ruleCode: string,
    ruleName: string,
    severity: number,
    message: string,
    ruleInstance?: string | null,
    opts?: { skipCrewBellOnly?: boolean },
  ): void => {
    if (opts?.skipCrewBellOnly && isCrewBellOnlyRule(ruleCode)) return
    const id = `${ruleCode}:${message}`
    if (!seen.has(id)) {
      seen.add(id)
      result.push({ ruleCode, ruleName, ruleInstance, severity, message })
    }
  }

  const addFromOldStore = (key: string): void => {
    const vs = violations.get(key)
    if (!vs) return
    for (const v of vs) addEntry(v.ruleCode, v.ruleName, v.severity, v.message)
  }

  const addFromPairingId = (pairingId: number, crewId?: string): void => {
    const vs = displayViolations.get(pairingId)
    if (!vs) return
    for (const v of vs) {
      if (v.crewId && crewId && v.crewId !== crewId) continue
      addEntry(v.ruleCode, v.ruleName, v.severity, v.message, v.ruleInstance)
    }
  }

  const addFromCrewDisplayViolations = (crewId: string): void => {
    for (const [, vs] of displayViolations) {
      for (const v of vs) {
        if (v.passed || v.crewId !== crewId) continue
        addEntry(v.ruleCode, v.ruleName, v.severity, v.message, v.ruleInstance)
      }
    }
  }

  const addFromScenarioCrewViolations = (crewId: string): void => {
    if (!scenarioViolations) return
    for (const [, vs] of scenarioViolations) {
      for (const v of vs) {
        if (v.crewId !== crewId) continue
        addEntry(v.ruleCode, v.ruleName, v.severity, v.message)
      }
    }
  }

  // Mode 1: hovered crew header.
  if (hoveredCrewId !== null) {
    addFromOldStore(`crew:${Number(hoveredCrewId) || 0}`)
    addFromCrewDisplayViolations(hoveredCrewId)
    addFromScenarioCrewViolations(hoveredCrewId)
    for (const item of items) {
      if (String(item.crewId) === hoveredCrewId) {
        if (item.pairingId) addFromOldStore(`pairing:${item.pairingId}`)
        if (item.pairingId != null) addFromPairingId(item.pairingId, hoveredCrewId)
      }
    }
    return result.sort((a, b) => b.severity - a.severity)
  }

  // Mode 2: hovered task puck — omit crew-bell-only rules (e.g. 7505 period GDO).
  if (hoveredTaskId === null) return []
  const task = items.find((i) => i.id === hoveredTaskId)
  if (!task) return []
  const crewTasks = items.filter((i) => String(i.crewId) === String(task.crewId))

  for (const [, vs] of violations) {
    for (const v of vs) {
      const applies =
        (v.targetType === 'roster' && v.targetId === hoveredTaskId) ||
        (v.targetType === 'pairing' && v.targetId === task.pairingId) ||
        (v.targetType === 'crew' && String(v.targetId) === String(task.crewId))
      if (!applies) continue
      // Direct attribution (Rule B): roster-targeted violations are anchored
      // to the exact task by design — always include. Pairing-targeted with
      // a matching crewId is also direct (the alert names both). Everything
      // else (crew-only, or pairing without crewId) needs window overlap.
      const directMatch =
        (v.targetType === 'roster' && v.targetId === hoveredTaskId) ||
        (v.targetType === 'pairing' &&
          v.targetId === task.pairingId &&
          v.crewId != null &&
          String(v.crewId) === String(task.crewId))
      if (!directMatch && !pairingTasksOverlapViolationWindow([task], v)) continue
      addEntry(v.ruleCode, v.ruleName, v.severity, v.message, undefined, { skipCrewBellOnly: true })
    }
  }
  if (task.pairingId != null) {
    const vs = displayViolations.get(task.pairingId)
    if (vs) {
      for (const v of vs) {
        if (v.crewId && String(task.crewId) && v.crewId !== String(task.crewId)) continue
        // Direct attribution (Rule B): when the alert already names both
        // `crewId` AND `pairingId` matching this task, the violation is
        // unambiguously about this roster entry — skip the window-overlap
        // fallback. Window overlap is the secondary signal used when the
        // alert only knows pairing/crew (no anchor on a specific task), and
        // it can drop the alert if the engine wrote the window at a slightly
        // different span than the task's sch*Dt (UTC vs local boundaries).
        const directMatch = v.crewId != null && String(task.crewId) === String(v.crewId)
          && task.pairingId != null && Number(task.pairingId) === Number(v.pairingId)
        if (!directMatch && !pairingTasksOverlapViolationWindow([task], v)) continue
        addEntry(v.ruleCode, v.ruleName, v.severity, v.message, v.ruleInstance, { skipCrewBellOnly: true })
      }
    }
  }
  // 7501: also surface rows keyed under other pairings when this FLY task overlaps the window.
  for (const [, vs] of displayViolations) {
    for (const v of vs) {
      if (v.passed || v.ruleCode !== '7501') continue
      if (v.crewId && v.crewId !== String(task.crewId)) continue
      if (!resolveViolationPaintWindow(v)) continue
      const paintable = crewFlyTasksOverlappingWindow(crewTasks, v)
      if (!paintable.some((t) => t.id === task.id)) continue
      addEntry(v.ruleCode, v.ruleName, v.severity, v.message, v.ruleInstance, { skipCrewBellOnly: true })
    }
  }
  // 7305: consecutive span — surface on every overlapping duty, not only the anchor pairing.
  for (const [, vs] of displayViolations) {
    for (const v of vs) {
      if (v.passed || v.ruleCode !== '7305') continue
      if (v.crewId && v.crewId !== String(task.crewId)) continue
      if (!resolveViolationPaintWindow(v)) continue
      const paintable = crewTasksOverlappingWindow(crewTasks, v)
      if (!paintable.some((t) => t.id === task.id)) continue
      addEntry(v.ruleCode, v.ruleName, v.severity, v.message, v.ruleInstance, { skipCrewBellOnly: true })
    }
  }
  // 7504: WOCL-spacing gap endpoints — the two WOCL duties straddle the gap, so an
  // individual duty segment never overlaps the gap window; surface on the duties
  // that bound it (mirrors mark7504GapDutyPucks).
  for (const [, vs] of displayViolations) {
    for (const v of vs) {
      if (v.passed || v.ruleCode !== '7504') continue
      if (v.crewId && v.crewId !== String(task.crewId)) continue
      const gapTasks = crew7504GapEndpointTasks(v, crewTasks)
      if (!gapTasks.some((t) => t.id === task.id)) continue
      addEntry(v.ruleCode, v.ruleName, v.severity, v.message, v.ruleInstance, { skipCrewBellOnly: true })
    }
  }
  if (scenarioViolations) {
    for (const [, vs] of scenarioViolations) {
      for (const v of vs) {
        const applies =
          (v.targetType === 'roster' && v.targetId === hoveredTaskId) ||
          (v.targetType === 'pairing' && v.targetId === task.pairingId) ||
          (v.targetType === 'crew' && String(v.targetId) === String(task.crewId))
        if (!applies) continue
        // Direct attribution (Rule B) — see main violations loop.
        const directMatch =
          (v.targetType === 'roster' && v.targetId === hoveredTaskId) ||
          (v.targetType === 'pairing' &&
            v.targetId === task.pairingId &&
            v.crewId != null &&
            String(v.crewId) === String(task.crewId))
        if (
          !directMatch
          && (v.targetType === 'pairing' || v.targetType === 'crew')
          && !pairingTasksOverlapViolationWindow([task], v)
        ) continue
        addEntry(v.ruleCode, v.ruleName, v.severity, v.message, undefined, { skipCrewBellOnly: true })
      }
    }
    for (const [, vs] of scenarioViolations) {
      for (const v of vs) {
        if (v.ruleCode !== '7501') continue
        if (v.crewId && v.crewId !== String(task.crewId)) continue
        if (!resolveViolationPaintWindow(v)) continue
        const paintable = crewFlyTasksOverlappingWindow(crewTasks, v)
        if (!paintable.some((t) => t.id === task.id)) continue
        addEntry(v.ruleCode, v.ruleName, v.severity, v.message, undefined, { skipCrewBellOnly: true })
      }
    }
    for (const [, vs] of scenarioViolations) {
      for (const v of vs) {
        if (v.ruleCode !== '7305') continue
        if (v.crewId && v.crewId !== String(task.crewId)) continue
        if (!resolveViolationPaintWindow(v)) continue
        const paintable = crewTasksOverlappingWindow(crewTasks, v)
        if (!paintable.some((t) => t.id === task.id)) continue
        addEntry(v.ruleCode, v.ruleName, v.severity, v.message, undefined, { skipCrewBellOnly: true })
      }
    }
    for (const [, vs] of scenarioViolations) {
      for (const v of vs) {
        if (v.ruleCode !== '7504') continue
        if (v.crewId && v.crewId !== String(task.crewId)) continue
        const gapTasks = crew7504GapEndpointTasks(v, crewTasks)
        if (!gapTasks.some((t) => t.id === task.id)) continue
        addEntry(v.ruleCode, v.ruleName, v.severity, v.message, undefined, { skipCrewBellOnly: true })
      }
    }
  }

  return result.sort((a, b) => b.severity - a.severity)
}

export const collectViolationTooltipEntriesForTest = collectViolationTooltipEntries

const recoveryAlertForHoveredTask = (
  task: RosterItem | undefined,
  entries: ViolationTooltipEntry[],
  items: RosterItem[],
): RecoveryAlertSnapshot | null => {
  if (!task || task.pairingId == null) return null
  const violation = entries.find((entry) => entry.ruleCode.trim().toUpperCase() === '8004')
  if (!violation || isRosterCompleted(items, task.crewId, task.pairingId)) return null
  const pairingItems = items
    .filter((item) => item.crewId === task.crewId && Number(item.pairingId) === Number(task.pairingId))
    .sort((a, b) => new Date(a.schStrDtUtc ?? 0).getTime() - new Date(b.schStrDtUtc ?? 0).getTime())
  const anchor = pairingItems[0] ?? task
  const label = anchor.label ?? anchor.assignment ?? ''
  return {
    id: `hover-${anchor.crewId}-${anchor.pairingId}-${violation.ruleCode}`,
    ruleCode: violation.ruleCode,
    severity: violation.severity,
    crewId: anchor.crewId,
    pairingId: Number(anchor.pairingId),
    flightDate: anchor.fltDt ?? anchor.schStrDtUtc?.slice(0, 10) ?? '—',
    flightNumber: label.split(/\s+/)[0] || '—',
    detail: violation.message,
    fleet: anchor.fleetCode ?? null,
    requiredRank: anchor.flightActingRank || null,
  }
}

export const recoveryAlertForHoveredTaskForTest = recoveryAlertForHoveredTask

interface ViolationTooltipProps {
  scenarioId?: number
}

/**
 * Floating tooltip that shows violation details when hovering over
 * a task that has rule violations.
 *
 * The tooltip is interactive only while the pointer is not dragging, so the
 * Recovery action can be clicked without interfering with Gantt drag behavior.
 */
export const ViolationTooltip = ({ scenarioId }: ViolationTooltipProps = {}) => {
  const hoveredTaskId = useGanttViewStore((s) => s.hoveredTaskId)
  const hoveredCrewId = useGanttViewStore((s) => s.hoveredCrewId)
  const hoverPosition = useGanttViewStore((s) => s.hoverPosition)
  const violations = useRuleCheckStore((s) => s.violations)
  const displayViolations = useSessionViolationStore((s) => s.displayViolations)
  const scenarioViolations = getScenarioViolationStore(scenarioId ?? -1)((s) => s.violations)
  const liveItems = useRosterStore((s) => s.main.rosterItems)
  const scenarioStore = getScenarioGanttStore(scenarioId ?? -1)
  const scenarioData = scenarioStore((s) => s.data)
  const scenarioPendingChanges = scenarioStore((s) => s.pendingChanges)
  const isDragging = useDragStore((s) => s.isDragging)

  const scenarioItems = useMemo(() => {
    if (scenarioId == null || !scenarioData) return []
    const pairingMap = new Map((scenarioData.pairings ?? []).map((p) => [p.pairingId, p]))
    return buildScenarioRosterItems({
      crew: scenarioData.crew,
      pairingMap,
      assignments: scenarioData.assignments ?? [],
      pairingSegments: scenarioData.pairingSegments ?? [],
      groundItems: scenarioData.groundItems ?? [],
      pendingChanges: scenarioPendingChanges,
    }).items
  }, [scenarioId, scenarioData, scenarioPendingChanges])

  const items = scenarioId != null ? scenarioItems : liveItems

  const [visible, setVisible] = useState(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(0)
  const posRef = useRef({ x: 0, y: 0 })
  const anchorRef = useRef<string | null>(null)

  /** Collect violations for the currently hovered task or crew header */
  const taskViolations = useMemo(
    () => collectViolationTooltipEntries({
      hoveredTaskId,
      hoveredCrewId,
      violations,
      displayViolations,
      scenarioViolations,
      items,
    }),
    [hoveredTaskId, hoveredCrewId, violations, displayViolations, scenarioViolations, items],
  )
  const hoveredTask = useMemo(() => items.find((item) => item.id === hoveredTaskId), [items, hoveredTaskId])
  const recoveryAlert = useMemo(
    () => scenarioId == null ? recoveryAlertForHoveredTask(hoveredTask, taskViolations, items) : null,
    [scenarioId, hoveredTask, taskViolations, items],
  )

  const hasTarget = hoveredTaskId !== null || hoveredCrewId !== null
  useEffect(() => {
    clearTimeout(hideTimerRef.current)

    if (hasTarget && taskViolations.length > 0) {
      // Freeze the tooltip at the first anchor point. Once the pointer leaves
      // the canvas for the tooltip action, the canvas hover position changes;
      // following it makes the Recovery button move away from the pointer.
      const targetKey = `${hoveredTaskId ?? ''}:${hoveredCrewId ?? ''}`
      if (!visible || anchorRef.current !== targetKey) {
        posRef.current = { x: hoverPosition.x, y: hoverPosition.y }
        anchorRef.current = targetKey
      }
      setVisible(true)
    } else if (!hasTarget && visible) {
      hideTimerRef.current = setTimeout(() => {
        anchorRef.current = null
        setVisible(false)
      }, HIDE_DELAY)
    } else if (hasTarget && taskViolations.length === 0) {
      anchorRef.current = null
      setVisible(false)
    }
  }, [hasTarget, hoveredTaskId, hoveredCrewId, taskViolations.length, hoverPosition, visible])

  if (!visible || taskViolations.length === 0) return null

  // Group violations by severity + ruleCode + ruleInstance.
  // A rule with multiple instances (e.g. 8056/006 fired 4 times) collapses into one
  // group header "8056/006 [×4]" with individual messages listed below.
  type ViolationGroup = {
    ruleCode: string
    ruleName: string
    ruleInstance?: string | null
    severity: number
    messages: string[]
  }
  const groups: ViolationGroup[] = (() => {
    const map = new Map<string, ViolationGroup>()
    for (const v of taskViolations) {
      const key = `${v.severity}:${v.ruleCode}:${v.ruleInstance ?? ''}`
      if (!map.has(key)) {
        map.set(key, {
          ruleCode: v.ruleCode,
          ruleName: v.ruleName,
          ruleInstance: v.ruleInstance,
          severity: v.severity,
          messages: [],
        })
      }
      map.get(key)!.messages.push(v.message)
    }
    return Array.from(map.values())
  })()

  // >5 raw violations: compact layout at 400px. ≤5: full layout at 300px.
  // pointer-events:none means the user cannot scroll, so all content must be visible.
  const compact = taskViolations.length > 5

  const tooltipW = compact ? 400 : 300
  // Height estimate: header (40px) + each group's header row + per-message rows
  const tooltipH = Math.min(
    40 + groups.reduce((h, g) => h + (compact ? 28 + g.messages.length * 20 : 36 + g.messages.length * 30), 0) + (recoveryAlert ? 48 : 0),
    compact ? 560 : 320,
  )
  const cx = posRef.current.x
  const cy = posRef.current.y

  const x = Math.min(cx + 12, window.innerWidth - tooltipW - 8)
  const y = isDragging
    ? Math.max(cy - tooltipH - 14, 8)
    : Math.min(cy + 16, window.innerHeight - tooltipH - 8)

  return (
    <div
      className="fixed z-40 animate-in fade-in-0 zoom-in-95 duration-150"
      style={{ left: x, top: y, width: tooltipW, pointerEvents: isDragging ? 'none' : 'auto' }}
      onMouseEnter={() => clearTimeout(hideTimerRef.current)}
      onMouseLeave={() => {
        clearTimeout(hideTimerRef.current)
        hideTimerRef.current = setTimeout(() => setVisible(false), HIDE_DELAY)
      }}
    >
      <div className="overflow-hidden rounded-md border border-border/60 bg-popover/95 shadow-[0_4px_16px_rgba(0,0,0,0.12)]">

        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border/40 bg-destructive/8 px-2.5 py-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-destructive shadow-[0_0_4px] shadow-destructive/40" />
          <span className="text-xs font-semibold text-popover-foreground">
            Rule Violations
          </span>
          <span className="ml-auto rounded-sm bg-destructive/15 px-1.5 py-0.5 text-2xs font-bold tabular-nums text-destructive">
            {taskViolations.length}
          </span>
        </div>

        {/* Grouped violation list */}
        <div className="divide-y divide-border/20">
          {groups.map((g, gi) => {
            const sevColor = VIOLATION_SEVERITY_COLORS[g.severity] ?? VIOLATION_SEVERITY_COLORS[3]
            const label = severityLabelFromNum(g.severity)
            // Prefer ruleCode+instance — ruleName may already be "7505/001"
            const ruleLabel = formatViolationRuleLabel(g)
            const multi = g.messages.length > 1

            if (compact) {
              return (
                <div
                  key={gi}
                  className="px-2.5 py-1.5"
                  data-rule-code={g.ruleCode}
                  data-rule-id={formatViolationRuleLabel(g)}
                >
                  {/* Group header: SEVERITY  8056/006  [×4] */}
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: sevColor }}
                    />
                    <span
                      className="text-2xs font-bold uppercase tracking-wide"
                      style={{ color: sevColor }}
                    >
                      {label}
                    </span>
                    <span className="text-2xs font-semibold text-popover-foreground">
                      {ruleLabel}
                    </span>
                    {multi && (
                      <span className="ml-auto rounded-sm bg-border/60 px-1 py-px text-2xs font-medium tabular-nums text-muted-foreground">
                        ×{g.messages.length}
                      </span>
                    )}
                  </div>
                  {/* Messages */}
                  <div className="mt-1 space-y-0.5 pl-3">
                    {g.messages.map((msg, mi) => (
                      <div key={mi} className="flex items-start gap-1">
                        {multi && (
                          <span className="mt-px shrink-0 text-2xs text-muted-foreground/50">·</span>
                        )}
                        <span className="text-2xs leading-relaxed text-muted-foreground">{msg}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            }

            return (
              <div
                key={gi}
                className="flex items-start gap-2 px-2.5 py-2"
                data-rule-code={g.ruleCode}
                data-rule-id={formatViolationRuleLabel(g)}
              >
                <span
                  className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: sevColor, boxShadow: `0 0 3px ${sevColor}40` }}
                />
                <div className="min-w-0 flex-1">
                  {/* Group header */}
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className="text-2xs font-bold uppercase tracking-wide"
                      style={{ color: sevColor }}
                    >
                      {label}
                    </span>
                    <span className="text-xs font-semibold text-popover-foreground">
                      {ruleLabel}
                    </span>
                    {multi && (
                      <span className="rounded-sm bg-border/60 px-1 py-px text-2xs font-medium tabular-nums text-muted-foreground">
                        ×{g.messages.length}
                      </span>
                    )}
                  </div>
                  {/* Messages */}
                  <div className="mt-0.5 space-y-0.5">
                    {g.messages.map((msg, mi) => (
                      <div key={mi} className="flex items-start gap-1">
                        {multi && (
                          <span className="mt-px shrink-0 text-2xs text-muted-foreground/40">·</span>
                        )}
                        <span className="text-2xs leading-snug text-muted-foreground">{msg}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        {recoveryAlert && (
          <div className="flex items-center justify-between gap-2 border-t border-border/40 bg-primary/[0.04] px-2.5 py-2">
            <span className="text-2xs text-muted-foreground">8004 supports Crew Roster Recovery</span>
            <button
              type="button"
              title="Recovery (Ctrl/Cmd+R)"
              aria-keyshortcuts="Control+R Meta+R"
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded border border-primary/40 bg-primary/10 px-2 text-2xs font-semibold text-primary hover:bg-primary/20"
              data-testid="violation-tooltip-recovery"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('recovery:open', { detail: recoveryAlert }))
                anchorRef.current = null
                setVisible(false)
              }}
            >
              <ArrowRight className="h-3 w-3" /><span><span className="underline underline-offset-2">R</span>ecovery</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
