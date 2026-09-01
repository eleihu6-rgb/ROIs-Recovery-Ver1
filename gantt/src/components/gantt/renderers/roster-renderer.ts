/**
 * Roster bar renderer — paints roster pucks onto a shared Canvas element.
 *
 * Because bars are drawn on Canvas (no per-bar DOM element), a per-bar
 * `data-roster-source` attribute is not applicable here.  IMP immutability
 * is enforced at the *interaction* layer:
 *   - Context menu: Edit/Swap disabled, Delete enabled (context-menu.tsx)
 *   - Drag-move: blocked for IMP rows (live-gantt-source.ts)
 *   - Ground-task double-click: blocked for IMP rows
 *   - Backend: 409 on any write to IMP-sourced roster rows
 * Tests locate IMP bars via canvas coordinates + the `__ganttTest` hook.
 */
import { addMinutes } from 'date-fns'
import {
  ROW_HEIGHT,
  HEADER_HEIGHT,
  TASK_PADDING,
  TASK_HEIGHT,
  MIN_TASK_WIDTH,
  FONT_FAMILY,
  FONT_SIZE_TASK,
  getGanttColors,
  getCssVar,
  FLIGHT_COLOR_DH_TOP,
  FLIGHT_COLOR_DH_BOTTOM,
  FLIGHT_PUCK_AIRPORT_COLOR,
  FLIGHT_PUCK_TIME_COLOR,
  SEGMENT_BRIEF_COLOR,
  SEGMENT_DEBRIEF_COLOR,
  SEGMENT_PICKUP_DROP_COLOR,
  SEGMENT_LAYOVER_BG,
  SEGMENT_LAYOVER_BORDER,
  SEGMENT_LAYOVER_LABEL_COLOR,
  SEGMENT_REST_BG,
  SEGMENT_REST_BORDER,
  SEGMENT_REST_LABEL_COLOR,
  SEGMENT_DUTY_BG,
  SEGMENT_DUTY_BORDER,
  SEGMENT_FLIGHT_HEIGHT,
  SEGMENT_BAR_HEIGHT,
  DELAY_GHOST_THRESHOLD_MIN,
  DELAY_GHOST_ACTUAL_TIME_COLOR,
} from '../gantt-constants'
import { timeToX, msToX, parseIsoMs, getVisibleRowRange, roundedRect, gradientFill, getContrastTextColor, lightenColor, darkenColor, parseIsoCached } from '../gantt-utils'
import { isDeadheadRosterPuck, resolveSegmentDutyFill } from '@/utils/puck-duty-color'
import { drawDelayGhost } from './flight-renderer'
import { deltaMinutes } from '@/components/flight/derive-flight-ops-status'
import { drawViolationBadge, violationBadgePosition } from '../violation-overlay'
import { drawMemoBadge, memoBadgePosition } from '../memo-overlay'
import {
  drawOptimizerBadge,
  optimizerBadgePositionTopLeftOutside,
  optimizerBadgePositionTopRightOutside,
  shouldDrawOptimizerBadge,
  shouldDrawOptimizerOutline,
  isOptimizerRosterSource,
} from '../optimizer-overlay'
import { drawOptimizerOutline, drawPendingOutline, drawSelectionOutline } from '../selection-outline'
import { drawLockIndicator } from '../lock-overlay'
import { useAssignmentStore } from '@/stores/assignment-store'
import { formatTime } from '@/stores/timezone-store'
import { SESSION_COLORS } from '@/stores/pairing-store'
import { rowY } from './base-renderer'
import type { BaseRenderContext } from './base-renderer'
import type { RosterItem } from '@/types'

/** Hover overlay color */
const HOVER_OVERLAY = 'rgba(255, 255, 255, 0.18)'

export const getRosterRestMinutes = (item: RosterItem | null | undefined): number => {
  const minutes = item?.actRestMin ?? item?.dutyActRestMin ?? item?.dutySchRestMin ?? 0
  return Math.max(0, minutes)
}

interface PairingOutlineRect {
  x: number
  y: number
  w: number
  h: number
}

/** One dashed rect bounds per pairing group (matches selection + optimizer outline). */
const computePairingGroupOutlineRect = (
  dutyGroups: { dutySeq: number | null; items: RosterItem[] }[],
  flightY: number,
  flightHeight: number,
  rangeStart: Date,
  pxPerHour: number,
  scrollX: number,
  canvasWidth: number,
): PairingOutlineRect | null => {
  if (dutyGroups.length === 0) return null

  const firstDutyFirst = dutyGroups[0].items[0]
  const lastDutyLast = dutyGroups[dutyGroups.length - 1].items[dutyGroups[dutyGroups.length - 1].items.length - 1]

  const firstSchStr = firstDutyFirst?.schStrDtUtc ?? null
  const pickup = firstDutyFirst?.pickupStartUtc ?? null
  const startTime = (pickup && firstSchStr && pickup < firstSchStr) ? pickup : firstSchStr

  const lastSchEnd = lastDutyLast?.schEndDtUtc ?? null
  const dropoffEnd = lastDutyLast?.dropoffEndUtc ?? null
  const lastRestMin = getRosterRestMinutes(lastDutyLast)
  const effectiveEnd = (dropoffEnd && lastSchEnd && dropoffEnd > lastSchEnd) ? dropoffEnd : lastSchEnd
  const endTime = (effectiveEnd && lastRestMin > 0)
    ? addMinutes(parseIsoCached(effectiveEnd), lastRestMin).toISOString()
    : effectiveEnd

  if (!startTime || !endTime) return null

  const selX = timeToX(parseIsoCached(startTime), rangeStart, pxPerHour, 'UTC') - scrollX
  const selEndX = timeToX(parseIsoCached(endTime), rangeStart, pxPerHour, 'UTC') - scrollX
  const selW = selEndX - selX

  if (selW <= 0 || selEndX <= 0 || selX >= canvasWidth) return null

  return {
    x: selX,
    y: flightY - 2,
    w: selW,
    h: flightHeight + 4,
  }
}

/**
 * P2-2（ver3）：每个 base color 的派生色（顶/底/边/文字）都是纯函数运算
 * （hex 解析 + 明暗 + 对比度），但每帧每个块都会重算。按 base color 缓存，
 * 仅在出现新颜色时计算一次；唯一颜色数 ≈ assignment 数（数十个），缓存上界很小。
 */
interface TaskColorVariant {
  colorTop: string
  colorBottom: string
  borderColor: string
  textColor: string
}
const taskColorVariantCache = new Map<string, TaskColorVariant>()
const getTaskColorVariant = (baseColor: string): TaskColorVariant => {
  let v = taskColorVariantCache.get(baseColor)
  if (!v) {
    v = {
      colorTop: lightenColor(baseColor, 0.15),
      colorBottom: baseColor,
      borderColor: darkenColor(baseColor, 0.15),
      textColor: getContrastTextColor(baseColor),
    }
    taskColorVariantCache.set(baseColor, v)
  }
  return v
}

/** Font for puck layout */
const PUCK_FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
const PUCK_FONT_MONO = '"JetBrains Mono", "Fira Code", monospace'

/** QW2: 渲染就绪的配对分组（已按时间排序；多航段配对预先 groupByDuty）。 */
export interface RosterPairingGroup {
  key: string
  pairingId: number | null
  /** 已按 schStrDtUtc 排序 */
  items: RosterItem[]
  /** 仅多航段飞行配对（Segment Mode）预建 duty 分组；单任务/地面任务为 null。 */
  dutyGroups: { dutySeq: number | null; items: RosterItem[] }[] | null
  startMs: number
  endMs: number
  laneIndex: number
  laneCount: number
}

export interface RosterLaneItemLayout {
  laneIndex: number
  laneCount: number
}

export interface RosterRenderContext extends BaseRenderContext {
  crewIds: string[]
  items: RosterItem[]
  /**
   * R2 性能：items 预先按 crewId 分桶（在数据变化时 memo 一次，而非每帧重建）。
   * 提供时，每帧只取可见行对应的桶（O(可见行)），避免每帧遍历全部 items（O(总数)）。
   */
  itemsByCrew?: Map<string, RosterItem[]>
  /**
   * QW2 性能：在 items 变化时一次性构建的「已排序 + 已分组」渲染桶（按 crewId）。
   * 提供时渲染循环直接消费，省去每帧的 sort / groupByPairing / groupByDuty 与 Map 分配。
   */
  renderBuckets?: Map<string, RosterPairingGroup[]>
  overlapLanes?: boolean
  selectedTaskIds: Set<number>
  hoveredTaskId: number | null
  /** Map of taskId -> max severity for that task */
  violationMap: Map<number, number>
  /** Set of roster_flight ids that have a visible crew memo (anchors the note icon) */
  memoRosterIds?: Set<number>
  /** Map of taskId -> 'mine' | 'other' for lock indicators */
  lockMap: Map<number, 'mine' | 'other'>
  /** IANA timezone ID for time display */
  timezone: string
  /** Map of crewId -> sessionTags for session tag bars */
  crewSessionTags: Map<string, number[]>
  /**
   * Whether to draw the left-edge session tag bars. Session tags only distinguish
   * between multiple query batches (append mode); with a single session every row
   * carries the same tag, so the bars collapse into a meaningless solid color line
   * at x=0. Only show them when 2+ sessions exist.
   */
  showSessionTags: boolean
  /** crewId → 窗口内首个 rank/base 覆盖断档时刻（ms）；有此值的行画红色虚线段（失效后不可派任务）。 */
  crewValidityBlock?: Map<string, number>
}

interface RosterLaneGeometry {
  y: number
  height: number
}

/** Get the base color for a roster task.
 * Ground tasks: uses individual assignment.color_hex, falls back to group color.
 * Flight tasks: uses group color.
 */
const getTaskBaseColor = (assignmentGroup: string, assignment?: string | null): string => {
  const store = useAssignmentStore.getState()
  if (assignment !== undefined) {
    return store.getAssignmentColor(assignment, assignmentGroup)
  }
  return store.getColor(assignmentGroup)
}

/**
 * Render all visible roster task blocks (flight + ground tasks).
 * For flight tasks belonging to the same pairing, uses Segment Mode layout.
 */
export const renderRosterTasks = (rc: RosterRenderContext): void => {
  const { ctx, canvasWidth, canvasHeight, scrollX, scrollY, pxPerHour, rangeStart, crewIds, items, frozenRowCount, timezone, crewSessionTags } = rc

  const scrollableClipTop = HEADER_HEIGHT + frozenRowCount * ROW_HEIGHT
  const withScrollableClip = (fn: () => void): void => {
    if (frozenRowCount <= 0) {
      fn()
      return
    }
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, scrollableClipTop, canvasWidth, canvasHeight)
    ctx.clip()
    fn()
    ctx.restore()
  }

  // Build crew -> row index map for all visible rows (frozen + scrollable)
  const crewRowMap = new Map<string, number>()
  const frozenCrewRowMap = new Map<string, number>()
  const scrollableCrewRowMap = new Map<string, number>()

  // Frozen rows are always visible
  for (let i = 0; i < frozenRowCount && i < crewIds.length; i++) {
    crewRowMap.set(crewIds[i], i)
    frozenCrewRowMap.set(crewIds[i], i)
  }

  // Scrollable rows
  const scrollableCount = crewIds.length - frozenRowCount
  const { first, last } = getVisibleRowRange(scrollY, canvasHeight, scrollableCount)
  for (let idx = first; idx <= last; idx++) {
    const i = idx + frozenRowCount
    if (i < crewIds.length) {
      crewRowMap.set(crewIds[i], i)
      scrollableCrewRowMap.set(crewIds[i], i)
    }
  }

  const drawSessionTags = (rowMap: Map<string, number>): void => {
    if (!rc.showSessionTags) return
    for (const [crewId, rowIndex] of rowMap) {
      const sessionTags = crewSessionTags.get(crewId)
      if (!sessionTags || sessionTags.length === 0) continue

      const baseY = rowY(rowIndex, scrollY, frozenRowCount)
      const tagWidth = 4

      if (sessionTags.length === 1) {
        // Single session: solid bar
        ctx.fillStyle = SESSION_COLORS[sessionTags[0] - 1] ?? '#888'
        ctx.fillRect(0, baseY, tagWidth, ROW_HEIGHT)
      } else {
        // Multiple sessions: segmented bar
        const segHeight = ROW_HEIGHT / sessionTags.length
        sessionTags.forEach((tag, i) => {
          ctx.fillStyle = SESSION_COLORS[tag - 1] ?? '#888'
          ctx.fillRect(0, baseY + i * segHeight, tagWidth, segHeight)
        })
      }
    }
  }

  // Draw session tag bars (4px wide, left edge of row) for visible rows.
  // Skipped entirely for a single session — see RosterRenderContext.showSessionTags.
  drawSessionTags(frozenCrewRowMap)
  withScrollableClip(() => drawSessionTags(scrollableCrewRowMap))

  const drawBucketsForRows = (rowMap: Map<string, number>): void => {
    for (const [crewId, rowIndex] of rowMap) {
      const groups = rc.renderBuckets?.get(crewId)
      if (!groups) continue
      for (const group of groups) {
        const lane = rc.overlapLanes
          ? rosterLaneGeometry(rowIndex, scrollY, frozenRowCount, group.laneIndex, group.laneCount)
          : null
        if (group.dutyGroups) {
          drawSegmentGroup(rc, group.items, rowIndex, timezone, group.dutyGroups, lane)
        } else {
          for (const item of group.items) {
            drawRosterTask(rc, item, rowIndex, timezone, lane)
          }
        }
      }
    }
  }

  // 失效红线：从该机组 rank/base 覆盖断档时刻画一条横向红色虚线段，延伸到窗口最后一天
  // （rangeEnd）。晋升链（后续覆盖记录）不会产生 crewValidityBlock 条目，故不会误画。
  const drawValidityLines = (rowMap: Map<string, number>): void => {
    const blocks = rc.crewValidityBlock
    if (!blocks || blocks.size === 0) return
    for (const [crewId, rowIndex] of rowMap) {
      const blockMs = blocks.get(crewId)
      if (blockMs == null) continue
      const x = timeToX(new Date(blockMs), rc.rangeStart, rc.pxPerHour, 'UTC') - rc.scrollX
      const endX = timeToX(rc.rangeEnd, rc.rangeStart, rc.pxPerHour, 'UTC') - rc.scrollX
      if (endX <= 0 || x >= rc.canvasWidth) continue
      const y = rowY(rowIndex, rc.scrollY, rc.frozenRowCount) + ROW_HEIGHT / 2
      ctx.save()
      ctx.strokeStyle = '#ef4444' // 与 drawNowLine 的 nowLineColor 同红
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(Math.min(endX, rc.canvasWidth), y)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()
    }
  }

  // QW2 快路径：消费上层预建的「已排序 + 已分组」渲染桶，渲染循环不再每帧排序/分组。
  if (rc.renderBuckets) {
    drawBucketsForRows(frozenCrewRowMap)
    withScrollableClip(() => drawBucketsForRows(scrollableCrewRowMap))
    drawValidityLines(frozenCrewRowMap)
    withScrollableClip(() => drawValidityLines(scrollableCrewRowMap))
    return
  }

  // Fallback（无预建桶）：按 crewId 取可见行的 items，并每帧排序/分组。
  // R2: 优先用 itemsByCrew（O(可见行)），否则遍历全部 items（O(总数)）。
  const crewItemsMap = new Map<string, RosterItem[]>()
  if (rc.itemsByCrew) {
    for (const crewId of crewRowMap.keys()) {
      const list = rc.itemsByCrew.get(crewId)
      if (list && list.length > 0) crewItemsMap.set(crewId, list)
    }
  } else {
    for (const item of items) {
      if (!crewRowMap.has(item.crewId)) continue
      if (!crewItemsMap.has(item.crewId)) {
        crewItemsMap.set(item.crewId, [])
      }
      crewItemsMap.get(item.crewId)!.push(item)
    }
  }

  const drawCrewItems = (rowMap: Map<string, number>): void => {
    for (const [crewId, crewItems] of crewItemsMap) {
      const rowIndex = rowMap.get(crewId)
      if (rowIndex == null) continue

      const sortedItems = sortByStart(crewItems)
      const pairingGroups = groupByPairing(sortedItems)

      for (const group of pairingGroups) {
        // Segment Mode: any flight pairing where at least one item has dutySeq set
        // (handles both multi-segment pairings and single-segment pairings from scenario gantt)
        const isSegmentMode =
          group.pairingId !== null &&
          group.items.length >= 1 &&
          group.items.some((i) => i.dutySeq !== null)
        if (isSegmentMode) {
          drawSegmentGroup(rc, group.items, rowIndex, timezone)
        } else {
          // Ground task or pairing fallback block (no dutySeq) → individual block
          for (const item of group.items) {
            drawRosterTask(rc, item, rowIndex, timezone)
          }
        }
      }
    }
  }

  // Render each crew's tasks
  drawCrewItems(frozenCrewRowMap)
  withScrollableClip(() => drawCrewItems(scrollableCrewRowMap))
  drawValidityLines(frozenCrewRowMap)
  withScrollableClip(() => drawValidityLines(scrollableCrewRowMap))
}

/** Sort roster items by scheduled start (stable, null-safe). */
const sortByStart = (items: RosterItem[]): RosterItem[] =>
  [...items].sort((a, b) => (a.schStrDtUtc ?? '').localeCompare(b.schStrDtUtc ?? ''))

/**
 * Group items by pairingId for Segment Mode rendering.
 */
const groupByPairing = (items: RosterItem[]): { pairingId: number | null; items: RosterItem[] }[] => {
  const groups = new Map<number | null, RosterItem[]>()

  for (const item of items) {
    const key = item.pairingId
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(item)
  }

  return [...groups.entries()].map(([pairingId, items]) => ({ pairingId, items }))
}

const groupByRosterLaneUnit = (items: RosterItem[]): { key: string; pairingId: number | null; items: RosterItem[] }[] => {
  const pairingGroups = new Map<number, RosterItem[]>()
  const groups: { key: string; pairingId: number | null; items: RosterItem[] }[] = []

  for (const item of items) {
    if (item.pairingId === null) {
      groups.push({ key: `ground:${item.id}`, pairingId: null, items: [item] })
      continue
    }
    if (!pairingGroups.has(item.pairingId)) pairingGroups.set(item.pairingId, [])
    pairingGroups.get(item.pairingId)!.push(item)
  }

  for (const [pairingId, groupItems] of pairingGroups) {
    groups.push({ key: `pairing:${pairingId}`, pairingId, items: groupItems })
  }

  return groups
}

const itemStartMs = (item: RosterItem): number => {
  const start = item.pickupStartUtc ?? item.briefStartUtc ?? item.schStrDtUtc
  return start ? parseIsoMs(start) : Number.MAX_SAFE_INTEGER
}

const itemEndMs = (item: RosterItem): number => {
  const end = item.dropoffEndUtc ?? item.debriefEndUtc ?? item.schEndDtUtc
  if (!end) return Number.MIN_SAFE_INTEGER
  return parseIsoMs(end) + getRosterRestMinutes(item) * 60_000
}

const groupBounds = (items: RosterItem[]): { startMs: number; endMs: number } => {
  let startMs = Number.MAX_SAFE_INTEGER
  let endMs = Number.MIN_SAFE_INTEGER
  for (const item of items) {
    startMs = Math.min(startMs, itemStartMs(item))
    endMs = Math.max(endMs, itemEndMs(item))
  }
  return {
    startMs: startMs === Number.MAX_SAFE_INTEGER ? 0 : startMs,
    endMs: endMs === Number.MIN_SAFE_INTEGER ? 0 : endMs,
  }
}

const assignOverlapLanes = (groups: RosterPairingGroup[]): RosterPairingGroup[] => {
  const ordered = [...groups].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || a.key.localeCompare(b.key))
  const laneEndMs: number[] = []
  let laneCount = 0

  for (const group of ordered) {
    let laneIndex = laneEndMs.findIndex((endMs) => endMs <= group.startMs)
    if (laneIndex === -1) {
      laneIndex = laneEndMs.length
      laneEndMs.push(group.endMs)
    } else {
      laneEndMs[laneIndex] = group.endMs
    }
    group.laneIndex = laneIndex
    laneCount = Math.max(laneCount, laneIndex + 1)
  }

  for (const group of groups) group.laneCount = laneCount
  return groups
}

const rosterLaneGeometry = (
  rowIndex: number,
  scrollY: number,
  frozenRowCount: number,
  laneIndex: number,
  laneCount: number,
): RosterLaneGeometry => {
  if (laneCount <= 1) {
    const baseY = rowY(rowIndex, scrollY, frozenRowCount)
    return {
      y: baseY + Math.floor(ROW_HEIGHT / 2) - Math.floor(SEGMENT_FLIGHT_HEIGHT / 2),
      height: SEGMENT_FLIGHT_HEIGHT,
    }
  }

  const gap = laneCount >= 4 ? 1 : 2
  const topPadding = 3
  const availableHeight = ROW_HEIGHT - topPadding * 2 - gap * (laneCount - 1)
  const laneHeight = Math.max(6, Math.floor(availableHeight / laneCount))
  const baseY = rowY(rowIndex, scrollY, frozenRowCount)
  return {
    y: baseY + topPadding + laneIndex * (laneHeight + gap),
    height: laneHeight,
  }
}

/**
 * Draw a group of flight tasks as segments (Segment Mode).
 * Shows pickup → brief → flights → debrief → dropoff → layover/rest with bars aligned with puck bottom.
 * Uses same layout as pairing-renderer.ts for visual consistency.
 */
const drawSegmentGroup = (
  rc: RosterRenderContext,
  items: RosterItem[],
  rowIndex: number,
  timezone: string,
  // QW2: 上层预建的 duty 分组；提供时跳过每帧 sort + groupByDuty。
  prebuiltDutyGroups?: { dutySeq: number | null; items: RosterItem[] }[],
  lane?: RosterLaneGeometry | null,
): void => {
  const { ctx, scrollX, scrollY, pxPerHour, rangeStart, canvasWidth, frozenRowCount, selectedTaskIds, hoveredTaskId, violationMap, lockMap } = rc
  const colors = getGanttColors()

  const baseY = rowY(rowIndex, scrollY, frozenRowCount)
  const flightHeight = lane?.height ?? SEGMENT_FLIGHT_HEIGHT
  const barHeight = lane ? Math.max(3, Math.min(SEGMENT_BAR_HEIGHT, Math.floor(flightHeight / 2))) : SEGMENT_BAR_HEIGHT
  const centerY = lane ? lane.y + Math.floor(flightHeight / 2) : baseY + Math.floor(ROW_HEIGHT / 2)

  // Flight puck position (centered vertically, 20px height)
  const flightY = lane?.y ?? centerY - Math.floor(SEGMENT_FLIGHT_HEIGHT / 2)

  // All bars height = half of flight puck (10px), aligned with puck bottom
  const barY = centerY + Math.floor(flightHeight / 2) - barHeight

  // Pre-compute group-level selection state only (bounds are derived later from duty groups).
  const isGroupSelected = items.some((item) => selectedTaskIds.has(item.id))

  // Group by dutySeq for layover/rest calculation (items already filtered by pairingId).
  // QW2: 用预建分组，否则每帧排序 + 分组（回退路径，产出等价）。
  const dutyGroups = prebuiltDutyGroups ?? groupByDuty(sortByStart(items))

  // Draw Layover bands between duties
  for (let di = 0; di < dutyGroups.length - 1; di++) {
    const dutyEnd = dutyGroups[di].items[dutyGroups[di].items.length - 1]
    const nextDutyStart = dutyGroups[di + 1].items[0]

    // Layover: from previous duty's dropoff_end_utc to next duty's pickup_start_utc
    const loStart = dutyEnd.dropoffEndUtc
    const loEnd = nextDutyStart.pickupStartUtc

    if (loStart && loEnd) {
      const loX = timeToX(parseIsoCached(loStart), rangeStart, pxPerHour, 'UTC') - scrollX
      const loEndX = timeToX(parseIsoCached(loEnd), rangeStart, pxPerHour, 'UTC') - scrollX
      const loWidth = Math.max(loEndX - loX, 1)

      if (loX < canvasWidth && loEndX > 0) {
        ctx.fillStyle = SEGMENT_LAYOVER_BG
        ctx.fillRect(loX, barY, loWidth, barHeight)

        ctx.strokeStyle = SEGMENT_LAYOVER_BORDER
        ctx.setLineDash([4, 3])
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(loX, barY)
        ctx.lineTo(loX, barY + barHeight)
        ctx.moveTo(loEndX, barY)
        ctx.lineTo(loEndX, barY + barHeight)
        ctx.stroke()
        ctx.setLineDash([])

        // Label centered in the bar (both X and Y)
        if (loWidth > 40) {
          ctx.fillStyle = SEGMENT_LAYOVER_LABEL_COLOR
          ctx.font = `7px ${PUCK_FONT_FAMILY}`
          ctx.textBaseline = 'middle'
          ctx.textAlign = 'center'
          ctx.fillText('LAYOVER', loX + loWidth / 2, barY + barHeight / 2)
        }
      }
    }
  }

  // Draw Rest band after last duty
  if (dutyGroups.length > 0) {
    const lastDutyLastItem = dutyGroups[dutyGroups.length - 1].items[dutyGroups[dutyGroups.length - 1].items.length - 1]
    const restStart = lastDutyLastItem.dropoffEndUtc
    const restMin = getRosterRestMinutes(lastDutyLastItem)
    const restEnd = restStart ? addMinutes(parseIsoCached(restStart), restMin).toISOString() : null

    if (restStart && restEnd) {
      const restX = timeToX(parseIsoCached(restStart), rangeStart, pxPerHour, 'UTC') - scrollX
      const restEndX = timeToX(parseIsoCached(restEnd), rangeStart, pxPerHour, 'UTC') - scrollX
      const restWidth = Math.max(restEndX - restX, 1)

      if (restX < canvasWidth && restEndX > 0) {
        ctx.fillStyle = SEGMENT_REST_BG
        ctx.fillRect(restX, barY, restWidth, barHeight)

        ctx.strokeStyle = SEGMENT_REST_BORDER
        ctx.setLineDash([4, 3])
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(restX, barY)
        ctx.lineTo(restX, barY + barHeight)
        ctx.stroke()
        ctx.setLineDash([])

        // Label centered in the bar (both X and Y)
        if (restWidth > 30) {
          ctx.fillStyle = SEGMENT_REST_LABEL_COLOR
          ctx.font = `7px ${PUCK_FONT_FAMILY}`
          ctx.textBaseline = 'middle'
          ctx.textAlign = 'center'
          ctx.fillText('REST', restX + restWidth / 2, barY + barHeight / 2)
        }
      }
    }
  }

  // Draw duty bars and flight segments for each duty
  for (const duty of dutyGroups) {
    const firstItem = duty.items[0]
    const lastItem = duty.items[duty.items.length - 1]

    // Flight-duty background band (light grey): groups the flights in one duty,
    // spanning duty check-in (pickup start) → check-out (dropoff end). Drawn first
    // so pickup/brief/pucks/debrief/dropoff render on top. Flight duties only —
    // ground tasks (dutySeq === null) are skipped, and so is the inter-duty layover gap.
    if (duty.dutySeq !== null) {
      const dutyStartIso = firstItem.pickupStartUtc ?? firstItem.schStrDtUtc
      const dutyEndIso = lastItem.dropoffEndUtc ?? lastItem.schEndDtUtc
      if (dutyStartIso && dutyEndIso) {
        const bandX = timeToX(parseIsoCached(dutyStartIso), rangeStart, pxPerHour, 'UTC') - scrollX
        const bandEndX = timeToX(parseIsoCached(dutyEndIso), rangeStart, pxPerHour, 'UTC') - scrollX
        const bandWidth = Math.max(bandEndX - bandX, 1)
        if (bandX < canvasWidth && bandEndX > 0) {
          const bandY = flightY - 2
          const bandHeight = barY + barHeight + 2 - bandY
          ctx.fillStyle = SEGMENT_DUTY_BG
          ctx.beginPath()
          roundedRect(ctx, bandX, bandY, bandWidth, bandHeight, 4)
          ctx.fill()
          ctx.strokeStyle = SEGMENT_DUTY_BORDER
          ctx.lineWidth = 1
          ctx.beginPath()
          roundedRect(ctx, bandX, bandY, bandWidth, bandHeight, 4)
          ctx.stroke()
        }
      }
    }

    // Pickup bar (grey)
    if (firstItem.pickupStartUtc && firstItem.pickupEndUtc) {
      const puStart = timeToX(parseIsoCached(firstItem.pickupStartUtc), rangeStart, pxPerHour, 'UTC') - scrollX
      const puEnd = timeToX(parseIsoCached(firstItem.pickupEndUtc), rangeStart, pxPerHour, 'UTC') - scrollX
      const puWidth = Math.max(puEnd - puStart, 1)
      ctx.fillStyle = SEGMENT_PICKUP_DROP_COLOR
      ctx.globalAlpha = 0.7
      ctx.fillRect(puStart, barY, puWidth, barHeight)
      ctx.globalAlpha = 1
    }

    // Brief bar (amber), ends at first flight's departure time
    if (firstItem.briefStartUtc && firstItem.schStrDtUtc) {
      const brStart = timeToX(parseIsoCached(firstItem.briefStartUtc), rangeStart, pxPerHour, 'UTC') - scrollX
      const brEnd = timeToX(parseIsoCached(firstItem.schStrDtUtc), rangeStart, pxPerHour, 'UTC') - scrollX
      const brWidth = Math.max(brEnd - brStart, 1)
      ctx.fillStyle = SEGMENT_BRIEF_COLOR
      ctx.fillRect(brStart, barY, brWidth, barHeight)
    }

    // Flight segments
    for (const item of duty.items) {
      if (!item.schStrDtUtc || !item.schEndDtUtc) continue

      const schStart = timeToX(parseIsoCached(item.schStrDtUtc), rangeStart, pxPerHour, 'UTC') - scrollX
      const schEnd = timeToX(parseIsoCached(item.schEndDtUtc), rangeStart, pxPerHour, 'UTC') - scrollX

      // Same anchor-swap as the Flight pane: once an item's actual time has drifted from
      // schedule past the threshold, the solid box tracks ACTUAL and a hatched ghost is drawn
      // behind it at the ORIGINAL SCHEDULED position (Ryan: "same style" ghost across
      // Flight/Pairing/Roster).
      let hasDelayGhost = false
      let segStart = schStart
      let segEnd = schEnd
      if (item.actStrDtUtc && item.actEndDtUtc) {
        const depDelta = deltaMinutes(item.actStrDtUtc, item.schStrDtUtc)
        const arvDelta = deltaMinutes(item.actEndDtUtc, item.schEndDtUtc)
        const maxDelta = Math.max(Math.abs(depDelta ?? 0), Math.abs(arvDelta ?? 0))
        if (maxDelta >= DELAY_GHOST_THRESHOLD_MIN) {
          hasDelayGhost = true
          segStart = timeToX(parseIsoCached(item.actStrDtUtc), rangeStart, pxPerHour, 'UTC') - scrollX
          segEnd = timeToX(parseIsoCached(item.actEndDtUtc), rangeStart, pxPerHour, 'UTC') - scrollX
        }
      }
      const segWidth = Math.max(segEnd - segStart, MIN_TASK_WIDTH)

      if (Math.min(segStart, schStart) > canvasWidth || Math.max(segEnd, schEnd) < 0) continue

      if (hasDelayGhost) {
        // Ghost width = delay duration (schStart -> actual segStart), not scheduled flight
        // duration — so the ghost's right edge always touches the solid puck's left edge,
        // even when the delay exceeds the flight's own scheduled duration.
        const schWidth = Math.max(segStart - schStart, MIN_TASK_WIDTH)
        if (segStart >= 0 && schStart <= canvasWidth) {
          drawDelayGhost(ctx, item.schStrDtUtc, schStart, flightY, schWidth, flightHeight, timezone)
        }
      }

      const isSelected = selectedTaskIds.has(item.id)
      const isHovered = hoveredTaskId === item.id
      const isDH = isDeadheadRosterPuck(item)
      const isSBY = item.assignmentGroup === 'SBY'
      const severity = violationMap.get(item.id) ?? 0

      // Gradient fill: purple DH, SBY/Reserve assignment color, blue for normal FLY
      let puckTextColor: string | undefined
      if (isDH) {
        gradientFill(ctx, segStart, flightY, segWidth, flightHeight, FLIGHT_COLOR_DH_TOP, FLIGHT_COLOR_DH_BOTTOM, 3)
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.35)'
      } else if (isSBY) {
        const { colorTop, colorBottom, borderColor, textColor } = getTaskColorVariant(getTaskBaseColor(item.assignmentGroup, item.assignment))
        gradientFill(ctx, segStart, flightY, segWidth, flightHeight, colorTop, colorBottom, 3)
        ctx.strokeStyle = borderColor
        puckTextColor = textColor
      } else {
        const fill = resolveSegmentDutyFill({
          assignmentGroup: item.assignmentGroup,
          assignment: item.assignment,
          isDeadhead: false,
        })
        if (fill.kind === 'reserve') {
          const { colorTop, colorBottom, borderColor, textColor } = getTaskColorVariant(fill.baseColor)
          gradientFill(ctx, segStart, flightY, segWidth, flightHeight, colorTop, colorBottom, 3)
          ctx.strokeStyle = borderColor
          puckTextColor = textColor
        } else if (fill.kind === 'fly') {
          gradientFill(ctx, segStart, flightY, segWidth, flightHeight, fill.top, fill.bottom, 3)
          ctx.strokeStyle = 'rgba(59, 130, 246, 0.45)'
        }
      }
      ctx.lineWidth = 1
      ctx.beginPath()
      roundedRect(ctx, segStart, flightY, segWidth, flightHeight, 3)
      ctx.stroke()

      // Text content based on width
      if (segWidth >= 60) {
        drawRosterPuck(ctx, item, segStart, flightY, segWidth, flightHeight, timezone, isDH, puckTextColor, hasDelayGhost)
      } else if (segWidth >= 30) {
        drawPartialRosterPuck(ctx, item, segStart, flightY, segWidth, flightHeight, isDH, puckTextColor)
      } else if (segWidth >= 16) {
        drawMinimalRosterPuck(ctx, item, segStart, flightY, segWidth, flightHeight, isDH, puckTextColor)
      }

      // Hover overlay (per-segment)
      if (isHovered && !isGroupSelected) {
        ctx.fillStyle = HOVER_OVERLAY
        ctx.beginPath()
        roundedRect(ctx, segStart, flightY, segWidth, flightHeight, 3)
        ctx.fill()
      }

      // Violation badge — centered in the puck so it never overlaps the
      // edge-anchored time/airport text.
      if (severity > 0) {
        const bp = violationBadgePosition(segStart, flightY, segWidth, flightHeight)
        drawViolationBadge(ctx, bp.x, bp.y, severity)
      }

      // Crew-memo note icon — anchored to the puck's top-left corner.
      if (rc.memoRosterIds?.has(item.id)) {
        const mp = memoBadgePosition(segStart, flightY, segWidth, flightHeight, true)
        drawMemoBadge(ctx, mp.x, mp.y)
      }

      // Lock indicator
      const lockStatus = lockMap.get(item.id)
      if (lockStatus) {
        drawLockIndicator(ctx, segStart, flightY, segWidth, flightHeight, lockStatus)
      }

    }

    // Debrief bar (slate), starts at the last flight's ARRIVAL time — debriefStartUtc already
    // reflects actual arrival when delayed; schEndDtUtc (scheduled) is only a fallback for
    // legacy rows that never had it live-joined. Using schEndDtUtc unconditionally made this
    // bar start hours too early for a delayed flight, overlapping the still-in-progress puck.
    const dbStartIso = lastItem.debriefStartUtc ?? lastItem.schEndDtUtc
    if (dbStartIso && lastItem.debriefEndUtc) {
      const dbStart = timeToX(parseIsoCached(dbStartIso), rangeStart, pxPerHour, 'UTC') - scrollX
      const dbEnd = timeToX(parseIsoCached(lastItem.debriefEndUtc), rangeStart, pxPerHour, 'UTC') - scrollX
      const dbWidth = Math.max(dbEnd - dbStart, 1)
      ctx.fillStyle = SEGMENT_DEBRIEF_COLOR
      ctx.fillRect(dbStart, barY, dbWidth, barHeight)
    }

    // Dropoff bar (grey)
    if (lastItem.dropoffStartUtc && lastItem.dropoffEndUtc) {
      const doStart = timeToX(parseIsoCached(lastItem.dropoffStartUtc), rangeStart, pxPerHour, 'UTC') - scrollX
      const doEnd = timeToX(parseIsoCached(lastItem.dropoffEndUtc), rangeStart, pxPerHour, 'UTC') - scrollX
      const doWidth = Math.max(doEnd - doStart, 1)
      ctx.fillStyle = SEGMENT_PICKUP_DROP_COLOR
      ctx.globalAlpha = 0.7
      ctx.fillRect(doStart, barY, doWidth, barHeight)
      ctx.globalAlpha = 1
    }
  }

  // Optimizer badge — once per pairing at first duty check-in left (pickup start)
  if (items.some((i) => isOptimizerRosterSource(i.source)) && dutyGroups.length > 0) {
    const firstItem = dutyGroups[0].items[0]
    const checkInIso = firstItem?.pickupStartUtc ?? firstItem?.schStrDtUtc
    const checkInEndIso = firstItem?.pickupEndUtc ?? firstItem?.schStrDtUtc
    if (checkInIso) {
      const blockX = timeToX(parseIsoCached(checkInIso), rangeStart, pxPerHour, 'UTC') - scrollX
      const blockEndX = checkInEndIso
        ? timeToX(parseIsoCached(checkInEndIso), rangeStart, pxPerHour, 'UTC') - scrollX
        : blockX + MIN_TASK_WIDTH
      const blockWidth = Math.max(blockEndX - blockX, MIN_TASK_WIDTH)
      if (blockX + blockWidth > 0 && blockX < canvasWidth && shouldDrawOptimizerBadge('CR', blockWidth)) {
        const op = optimizerBadgePositionTopLeftOutside(blockX, flightY, blockWidth, flightHeight)
        drawOptimizerBadge(ctx, op.x, op.y, op.textAlign, op.textBaseline)
      }
    }
  }

  // Group-level outline: solid selection focus vs amber dashed pending (unsaved) vs
  // thin green dashed CR identity.
  const outlineRect = computePairingGroupOutlineRect(
    dutyGroups,
    flightY,
    flightHeight,
    rangeStart,
    pxPerHour,
    scrollX,
    canvasWidth,
  )
  if (outlineRect) {
    if (isGroupSelected) {
      drawSelectionOutline(
        ctx, outlineRect.x, outlineRect.y, outlineRect.w, outlineRect.h,
        colors.selectionBorder, colors.selectionWash,
      )
    } else if (items.some((i) => i.isPending)) {
      drawPendingOutline(ctx, outlineRect.x, outlineRect.y, outlineRect.w, outlineRect.h, colors.pendingBorder)
    } else if (items.some((i) => isOptimizerRosterSource(i.source))) {
      drawOptimizerOutline(ctx, outlineRect.x, outlineRect.y, outlineRect.w, outlineRect.h, colors.optimizerBorder)
    }
  }
}

/**
 * Group items by dutySeq for Segment Mode rendering.
 * Items within each group are sorted by segSeq to ensure correct first/last item detection.
 * Note: items passed to this function are already from the same pairingId (filtered by groupByPairing).
 */
const groupByDuty = (items: RosterItem[]): { dutySeq: number | null; items: RosterItem[] }[] => {
  const groups = new Map<number | null, RosterItem[]>()

  for (const item of items) {
    const key = item.dutySeq ?? null
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(item)
  }

  // Sort items within each group by segSeq
  for (const [, groupItems] of groups) {
    groupItems.sort((a, b) => (a.segSeq ?? 0) - (b.segSeq ?? 0))
  }

  // Return sorted by dutySeq
  return [...groups.entries()]
    .sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0))
    .map(([dutySeq, groupItems]) => ({ dutySeq, items: groupItems }))
}

/**
 * QW2: 在 items 变化时一次性构建渲染就绪桶（按 crewId 分组 → 排序 → groupByPairing →
 * 多航段配对再 groupByDuty）。渲染循环消费它即可，无需每帧排序/分组/分配。
 * 产出与 renderRosterTasks 的回退路径完全等价。
 */
export const buildRosterRenderBuckets = (
  itemsByCrew: Map<string, RosterItem[]>,
): Map<string, RosterPairingGroup[]> => {
  const out = new Map<string, RosterPairingGroup[]>()
  for (const [crewId, crewItems] of itemsByCrew) {
    const sorted = sortByStart(crewItems)
    const groups: RosterPairingGroup[] = groupByRosterLaneUnit(sorted).map((g) => {
      const bounds = groupBounds(g.items)
      return {
        key: g.key,
        pairingId: g.pairingId,
        items: g.items,
        dutyGroups: g.pairingId !== null && g.items.length >= 1 && g.items.some((i) => i.dutySeq !== null) ? groupByDuty(g.items) : null,
        startMs: bounds.startMs,
        endMs: bounds.endMs,
        laneIndex: 0,
        laneCount: 1,
      }
    })
    assignOverlapLanes(groups)
    groups.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || a.key.localeCompare(b.key))
    out.set(crewId, groups)
  }
  return out
}

export const buildRosterLaneItemLayout = (
  buckets: Map<string, RosterPairingGroup[]>,
): Map<number, RosterLaneItemLayout> => {
  const out = new Map<number, RosterLaneItemLayout>()
  for (const groups of buckets.values()) {
    for (const group of groups) {
      for (const item of group.items) {
        out.set(item.id, { laneIndex: group.laneIndex, laneCount: group.laneCount })
      }
    }
  }
  return out
}

/**
 * Parse label "fltNum depArp-arvArp" into components.
 * Example: "F8001 HKG-TPE" → { fltNum: "F8001", depArp: "HKG", arvArp: "TPE" }
 *
 * P0-4: memoized by label string — called per puck per frame in the draw loop.
 */
const EMPTY_LABEL_PARTS = { fltNum: '', depArp: '', arvArp: '' }
const flightLabelCache = new Map<string, { fltNum: string; depArp: string; arvArp: string }>()
const parseFlightLabel = (label: string | null): { fltNum: string; depArp: string; arvArp: string } => {
  if (!label) return EMPTY_LABEL_PARTS
  let cached = flightLabelCache.get(label)
  if (cached === undefined) {
    if (flightLabelCache.size >= 200_000) flightLabelCache.clear()
    const parts = label.split(' ')
    if (parts.length >= 2) {
      const route = parts[1].split('-')
      cached = { fltNum: parts[0], depArp: route[0] || '', arvArp: route[1] || '' }
    } else {
      cached = { fltNum: label, depArp: '', arvArp: '' }
    }
    flightLabelCache.set(label, cached)
  }
  return cached
}

/**
 * Draw full roster puck (≥60px) - same layout as pairing puck:
 * Left: dep_arp + dep_time | Center: flt_num | Right: arv_arp + arv_time
 */
const drawRosterPuck = (
  ctx: CanvasRenderingContext2D,
  item: RosterItem,
  x: number,
  y: number,
  width: number,
  height: number,
  timezone: string,
  isDH: boolean,
  overrideTextColor?: string,
  showActualTimes = false,
): void => {
  const textColor = overrideTextColor ?? (isDH ? '#d8b4fe' : '#bfdbfe')
  const airportColor = overrideTextColor ?? (isDH ? '#d8b4fe' : FLIGHT_PUCK_AIRPORT_COLOR)
  const timeColor = overrideTextColor ?? (isDH ? '#c4b5fd' : FLIGHT_PUCK_TIME_COLOR)

  // Parse label to get flt_num and airports
  const { fltNum, depArp, arvArp } = parseFlightLabel(item.label)

  ctx.save()
  ctx.beginPath()
  ctx.rect(x + 2, y + 1, width - 4, height - 2)
  ctx.clip()

  const centerX = x + width / 2

  // Left: dep_arp
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.font = `bold 9px ${PUCK_FONT_FAMILY}`
  ctx.fillStyle = airportColor
  ctx.fillText(depArp, x + 4, y + height / 2 - 4)

  // Left bottom: dep_time — flagged amber with a "→" suffix once it reflects the ACTUAL
  // (shifted) time, same treatment as the Flight pane (drawFullPuck in flight-renderer.ts).
  const depSrc = showActualTimes ? item.actStrDtUtc : item.schStrDtUtc
  if (depSrc) {
    ctx.font = `8px ${PUCK_FONT_MONO}`
    ctx.fillStyle = showActualTimes ? DELAY_GHOST_ACTUAL_TIME_COLOR : timeColor
    const depTime = formatTime(depSrc, timezone) + (showActualTimes ? ' →' : '')
    ctx.fillText(depTime, x + 4, y + height / 2 + 4)
  }

  // Center: flt_num
  ctx.textAlign = 'center'
  ctx.font = `bold 9px ${PUCK_FONT_FAMILY}`
  ctx.fillStyle = textColor
  ctx.fillText(fltNum, centerX, y + height / 2)

  // Right: arv_arp
  ctx.textAlign = 'right'
  ctx.font = `bold 9px ${PUCK_FONT_FAMILY}`
  ctx.fillStyle = airportColor
  ctx.fillText(arvArp, x + width - 4, y + height / 2 - 4)

  // Right bottom: arv_time
  if (item.schEndDtUtc) {
    ctx.font = `8px ${PUCK_FONT_MONO}`
    ctx.fillStyle = timeColor
    const arvTime = formatTime(item.schEndDtUtc, timezone)
    ctx.fillText(arvTime, x + width - 4, y + height / 2 + 4)
  }

  ctx.restore()
}

/**
 * Draw partial roster puck (30-59px) - show flt_num centered.
 */
const drawPartialRosterPuck = (
  ctx: CanvasRenderingContext2D,
  item: RosterItem,
  x: number,
  y: number,
  width: number,
  height: number,
  isDH: boolean,
  overrideTextColor?: string,
): void => {
  const textColor = overrideTextColor ?? (isDH ? '#d8b4fe' : '#bfdbfe')
  const { fltNum } = parseFlightLabel(item.label)

  ctx.save()
  ctx.beginPath()
  ctx.rect(x + 2, y + 1, width - 4, height - 2)
  ctx.clip()

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `bold 9px ${PUCK_FONT_FAMILY}`
  ctx.fillStyle = textColor
  ctx.fillText(fltNum, x + width / 2, y + height / 2)

  ctx.restore()
}

/**
 * Draw minimal roster puck (16-29px) - show flt_num last 4 chars.
 */
const drawMinimalRosterPuck = (
  ctx: CanvasRenderingContext2D,
  item: RosterItem,
  x: number,
  y: number,
  width: number,
  height: number,
  isDH: boolean,
  overrideTextColor?: string,
): void => {
  const textColor = overrideTextColor ?? (isDH ? '#d8b4fe' : '#bfdbfe')
  const { fltNum } = parseFlightLabel(item.label)
  const last4 = fltNum.length > 4 ? fltNum.slice(-4) : fltNum

  ctx.save()
  ctx.beginPath()
  ctx.rect(x + 2, y + 1, width - 4, height - 2)
  ctx.clip()

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `bold 8px ${PUCK_FONT_FAMILY}`
  ctx.fillStyle = textColor
  ctx.fillText(last4, x + width / 2, y + height / 2)

  ctx.restore()
}

/**
 * Draw a single roster task block (ground tasks or isolated single flights).
 * Ground tasks (pairingId === null): match flight puck height (SEGMENT_FLIGHT_HEIGHT),
 *   centered in the row, with assignment code centered and start/end times on the sides.
 * Flight tasks: full TASK_HEIGHT block with left-aligned label text.
 */
const drawRosterTask = (
  rc: RosterRenderContext,
  task: RosterItem,
  rowIndex: number,
  timezone: string,
  lane?: RosterLaneGeometry | null,
): void => {
  const { ctx, scrollX, scrollY, pxPerHour, rangeStart, selectedTaskIds, hoveredTaskId, violationMap, lockMap, frozenRowCount, memoRosterIds } = rc
  const colors = getGanttColors()

  if (!task.schStrDtUtc || !task.schEndDtUtc) return

  const isGroundTask = task.pairingId === null
  const taskH = lane?.height ?? (isGroundTask ? SEGMENT_FLIGHT_HEIGHT : TASK_HEIGHT)

  // P0-3: UTC 几何用 epoch-ms 纯算术（与 timeToX 'UTC' 分支逐像素等价）。
  const rangeStartMs = rangeStart.getTime()
  const x = msToX(parseIsoMs(task.schStrDtUtc), rangeStartMs, pxPerHour) - scrollX
  const endX = msToX(parseIsoMs(task.schEndDtUtc), rangeStartMs, pxPerHour) - scrollX
  const width = Math.max(endX - x, MIN_TASK_WIDTH)

  const baseY = rowY(rowIndex, scrollY, frozenRowCount)
  const y = lane ? lane.y : isGroundTask
    ? baseY + Math.floor(ROW_HEIGHT / 2) - Math.floor(SEGMENT_FLIGHT_HEIGHT / 2)
    : baseY + TASK_PADDING

  if (y + taskH < HEADER_HEIGHT) return

  const baseColor = isGroundTask
    ? getTaskBaseColor(task.assignmentGroup, task.assignment)
    : getTaskBaseColor(task.assignmentGroup)
  const isSelected = selectedTaskIds.has(task.id)
  const isHovered = hoveredTaskId === task.id
  const severity = violationMap.get(task.id) ?? 0
  const { colorTop, colorBottom, borderColor, textColor } = getTaskColorVariant(baseColor)

  // Background with gradient
  gradientFill(ctx, x, y, width, taskH, colorTop, colorBottom, 3)

  // 1px border
  ctx.strokeStyle = borderColor
  ctx.lineWidth = 1
  ctx.beginPath()
  roundedRect(ctx, x, y, width, taskH, 3)
  ctx.stroke()

  // Hover overlay
  if (isHovered && !isSelected) {
    ctx.fillStyle = HOVER_OVERLAY
    ctx.beginPath()
    roundedRect(ctx, x, y, width, taskH, 3)
    ctx.fill()
  }

  // Selection (solid focus) / pending unsaved edit (amber dashed) / optimizer CR (green dashed)
  if (isSelected) {
    drawSelectionOutline(ctx, x, y, width, taskH, colors.selectionBorder, colors.selectionWash)
  } else if (task.isPending) {
    drawPendingOutline(ctx, x, y, width, taskH, colors.pendingBorder)
  } else if (shouldDrawOptimizerOutline(task.source, isSelected)) {
    drawOptimizerOutline(ctx, x, y, width, taskH, colors.optimizerBorder)
  }

  const lockStatus = lockMap.get(task.id)
  if (lockStatus) {
    drawLockIndicator(ctx, x, y, width, taskH, lockStatus)
  }

  if (isGroundTask) {
    // Ground task puck layout — mirrors flight puck style.
    const label = buildGroundTaskPuckLabel(task)
    const midY = y + taskH / 2

    ctx.save()
    ctx.beginPath()
    ctx.rect(x + 2, y, width - 4, taskH)
    ctx.clip()

    if (width >= 70) {
      // Center: assignment code (bold)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `bold 9px ${PUCK_FONT_FAMILY}`
      ctx.fillStyle = textColor
      ctx.fillText(label, x + width / 2, midY - 3)

      // Left: start time (mono)
      ctx.textAlign = 'left'
      ctx.font = `8px ${PUCK_FONT_MONO}`
      ctx.fillText(formatTime(task.schStrDtUtc, timezone), x + 4, midY + 4)

      // Right: end time (mono)
      ctx.textAlign = 'right'
      ctx.fillText(formatTime(task.schEndDtUtc, timezone), x + width - 4, midY + 4)
    } else if (width >= 30) {
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `bold 9px ${PUCK_FONT_FAMILY}`
      ctx.fillStyle = textColor
      ctx.fillText(label, x + width / 2, midY)
    } else if (width >= 16) {
      const abbr = label.length > 3 ? label.slice(0, 3) : label
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `8px ${PUCK_FONT_FAMILY}`
      ctx.fillStyle = textColor
      ctx.fillText(abbr, x + width / 2, midY)
    }

    ctx.restore()
  } else {
    // Flight task: left-aligned label
    if (width > 20) {
      const label = buildRosterTaskLabel(task)
      ctx.fillStyle = textColor
      ctx.font = `${FONT_SIZE_TASK}px ${FONT_FAMILY}`
      ctx.textBaseline = 'middle'

      ctx.save()
      ctx.beginPath()
      ctx.rect(x + 3, y, width - 6, taskH)
      ctx.clip()
      ctx.fillText(label, x + 4, y + taskH / 2)
      ctx.restore()
    }
  }

  // Violation badge — drawn last (on top of puck text) and centered in the
  // puck so it never overlaps the edge-anchored text.
  if (severity > 0) {
    const bp = violationBadgePosition(x, y, width, taskH)
    drawViolationBadge(ctx, bp.x, bp.y, severity)
  }

  // Crew-memo note icon — anchored to the puck's top-left corner.
  if (memoRosterIds?.has(task.id)) {
    const mp = memoBadgePosition(x, y, width, taskH, true)
    drawMemoBadge(ctx, mp.x, mp.y)
  }

  // Optimizer badge — text-only ⚡ outside puck top-right (standalone ground duties only)
  if (isGroundTask && shouldDrawOptimizerBadge(task.source, width)) {
    const op = optimizerBadgePositionTopRightOutside(x, y, width, taskH)
    drawOptimizerBadge(ctx, op.x, op.y, op.textAlign, op.textBaseline)
  }

  // REST block after ground task
  if (isGroundTask && task.actRestMin && task.actRestMin > 0) {
    const restStartX = endX
    const restEndX = msToX(parseIsoMs(task.schEndDtUtc) + task.actRestMin * 60_000, rangeStartMs, pxPerHour) - scrollX
    const restWidth = Math.max(restEndX - restStartX, 1)

    if (restStartX < rc.canvasWidth && restEndX > 0) {
      ctx.fillStyle = SEGMENT_REST_BG
      ctx.fillRect(restStartX, y, restWidth, taskH)

      ctx.strokeStyle = SEGMENT_REST_BORDER
      ctx.setLineDash([4, 3])
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(restStartX, y)
      ctx.lineTo(restStartX, y + taskH)
      ctx.stroke()
      ctx.setLineDash([])

      if (restWidth > 30) {
        ctx.fillStyle = SEGMENT_REST_LABEL_COLOR
        ctx.font = `7px ${PUCK_FONT_FAMILY}`
        ctx.textBaseline = 'middle'
        ctx.textAlign = 'center'
        ctx.fillText('REST', restStartX + restWidth / 2, y + taskH / 2)
      }
    }
  }
}

/**
 * Build the display text for a NON-FLYING (ground) puck.
 *
 * Prefers the specific `label` (e.g. DO → GDO/MLOA/VGDO, RES → CRAM/CRPM…) over the
 * generic `assignment` code, falling back to `assignment` then `assignmentGroup` when
 * `label` is null.
 *
 * Exception: DHD (deadhead) keeps its `assignment` code — its `label` holds a flight
 * number, which would make the puck look like a real flight.
 */
export const buildGroundTaskPuckLabel = (task: RosterItem): string => {
  if (task.assignment === 'DHD') return task.assignment || task.assignmentGroup
  return task.label || task.assignment || task.assignmentGroup
}

/**
 * Build the display label for a roster task.
 * Flight: "BR071 SIN/SHA 08:30-15:20"
 * Ground: type code like "TRN", "SBY", etc.
 */
const buildRosterTaskLabel = (task: RosterItem): string => {
  if (task.assignmentGroup === 'FLT' || task.assignmentGroup === 'DHD') {
    const parts: string[] = []
    if (task.label) parts.push(task.label)
    if (task.assignment) parts.push(task.assignment)
    // Append formatted times if space allows
    if (task.schStrDtUtc && task.schEndDtUtc) {
      const start = parseIsoCached(task.schStrDtUtc)
      const end = parseIsoCached(task.schEndDtUtc)
      const startTime = `${String(start.getUTCHours()).padStart(2, '0')}:${String(start.getUTCMinutes()).padStart(2, '0')}`
      const endTime = `${String(end.getUTCHours()).padStart(2, '0')}:${String(end.getUTCMinutes()).padStart(2, '0')}`
      parts.push(`${startTime}-${endTime}`)
    }
    return parts.join(' ')
  }
  return task.label || task.assignment || task.assignmentGroup
}
