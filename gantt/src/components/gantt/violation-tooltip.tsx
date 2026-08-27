import { useMemo, useState, useEffect, useRef } from 'react'
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
  crewFlyTasksOverlappingWindow,
  crewTasksOverlappingWindow,
  pairingTasksOverlapViolationWindow,
  resolveViolationPaintWindow,
} from '@/utils/violation-puck-window'
import { severityLabelFromNum } from '@/utils/severity-labels'
import type { DisplayViolation } from '@/stores/session-violation-store'
import type { RosterItem } from '@/types'
import type { RuleViolation } from '@/types/rule-check'

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
      if (v.targetType === 'crew' && !pairingTasksOverlapViolationWindow([task], v)) continue
      addEntry(v.ruleCode, v.ruleName, v.severity, v.message, undefined, { skipCrewBellOnly: true })
    }
  }
  if (task.pairingId != null) {
    const vs = displayViolations.get(task.pairingId)
    if (vs) {
      for (const v of vs) {
        if (v.crewId && String(task.crewId) && v.crewId !== String(task.crewId)) continue
        if (!pairingTasksOverlapViolationWindow([task], v)) continue
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
  if (scenarioViolations) {
    for (const [, vs] of scenarioViolations) {
      for (const v of vs) {
        const applies =
          (v.targetType === 'roster' && v.targetId === hoveredTaskId) ||
          (v.targetType === 'pairing' && v.targetId === task.pairingId) ||
          (v.targetType === 'crew' && String(v.targetId) === String(task.crewId))
        if (!applies) continue
        if (
          (v.targetType === 'pairing' || v.targetType === 'crew')
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
  }

  return result.sort((a, b) => b.severity - a.severity)
}

export const collectViolationTooltipEntriesForTest = collectViolationTooltipEntries

interface ViolationTooltipProps {
  scenarioId?: number
}

/**
 * Floating tooltip that shows violation details when hovering over
 * a task that has rule violations.
 *
 * The tooltip is always pointer-events:none so it never intercepts
 * mouse clicks or drags on the canvas beneath it.
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

  const hasTarget = hoveredTaskId !== null || hoveredCrewId !== null
  useEffect(() => {
    clearTimeout(hideTimerRef.current)

    if (hasTarget && taskViolations.length > 0) {
      posRef.current = { x: hoverPosition.x, y: hoverPosition.y }
      setVisible(true)
    } else if (!hasTarget && visible) {
      hideTimerRef.current = setTimeout(() => setVisible(false), HIDE_DELAY)
    } else if (hasTarget && taskViolations.length === 0) {
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
    40 + groups.reduce((h, g) => h + (compact ? 28 + g.messages.length * 20 : 36 + g.messages.length * 30), 0),
    compact ? 560 : 320,
  )
  const cx = posRef.current.x
  const cy = posRef.current.y

  const x = Math.min(cx + 12, window.innerWidth - tooltipW - 8)
  const y = isDragging
    ? Math.max(cy - tooltipH - 14, 8)
    : Math.min(cy + 16, window.innerHeight - tooltipH - 8)

  return (
    // pointer-events:none — tooltip is purely informational, never intercepts
    // mouse clicks or drags on the canvas below it.
    <div
      className="fixed z-40 animate-in fade-in-0 zoom-in-95 duration-150"
      style={{ left: x, top: y, width: tooltipW, pointerEvents: 'none' }}
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
                <div key={gi} className="px-2.5 py-1.5">
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
              <div key={gi} className="flex items-start gap-2 px-2.5 py-2">
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
      </div>
    </div>
  )
}
