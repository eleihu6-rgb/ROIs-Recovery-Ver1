import {
  HEADER_HEIGHT,
  PAIRING_HEADER_HEIGHT,
  PAIRING_ROW_HEIGHT,
  MIN_TASK_WIDTH,
  getGanttColors,
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
  FLIGHT_COLOR_DH_TOP,
  FLIGHT_COLOR_DH_BOTTOM,
  FLIGHT_PUCK_AIRPORT_COLOR,
  FLIGHT_PUCK_TIME_COLOR,
  SEGMENT_FLIGHT_HEIGHT,
  SEGMENT_BAR_HEIGHT,
} from '../gantt-constants'
import { msToX, roundedRect, gradientFill, parseIsoMs, lightenColor, getContrastTextColor } from '../gantt-utils'
import { drawSelectionOutline } from '../selection-outline'
import type { BaseRenderContext } from './base-renderer'
import type { Pairing, PairingSegment, PairingItem } from '@/types/pairing'
import { formatTime } from '@/stores/timezone-store'
import { SESSION_COLORS } from '@/stores/pairing-store'
import { useAssignmentStore } from '@/stores/assignment-store'
import { isDeadheadSegAssignment, resolveSegmentDutyFill } from '@/utils/puck-duty-color'

/** Ground-type assignment groups — use task color instead of flight blue. */
const GROUND_GROUPS = new Set(['SBY', 'DO', 'VAC', 'SIM', 'TRN', 'ADM', 'OFF', 'SLV', 'GND', 'GRD', 'LVE'])


/** Font for puck layout */
const PUCK_FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
const PUCK_FONT_MONO = '"JetBrains Mono", "Fira Code", monospace'

/**
 * Calculate Y position for a row, accounting for frozen rows and custom row height.
 * Uses PAIRING_HEADER_HEIGHT (40px) for the header offset.
 */
const rowY = (rowIndex: number, scrollY: number, frozenRowCount: number, rowHeight = PAIRING_ROW_HEIGHT): number => {
  if (rowIndex < frozenRowCount) {
    return PAIRING_HEADER_HEIGHT + rowIndex * rowHeight
  }
  return PAIRING_HEADER_HEIGHT + rowIndex * rowHeight - scrollY
}

/**
 * Get visible row range for custom row height.
 * Uses PAIRING_HEADER_HEIGHT (40px) for the header offset.
 */
const getVisibleRowRangeCustom = (
  scrollY: number,
  canvasHeight: number,
  totalRows: number,
  rowHeight: number,
): { first: number; last: number } => {
  const first = Math.max(0, Math.floor(scrollY / rowHeight))
  const last = Math.min(totalRows - 1, Math.ceil((scrollY + canvasHeight - PAIRING_HEADER_HEIGHT) / rowHeight))
  return { first, last }
}

export interface PairingRenderContext extends BaseRenderContext {
  /** Pairing items with segment data */
  items: PairingItem[]
  selectedPairingIds: Set<number>
  hoveredPairingId: number | null
  /** IANA timezone ID for time display */
  timezone: string
  /**
   * Whether to draw the left-edge session tag bars. Session tags only distinguish
   * between multiple query batches (append mode); with a single session every row
   * carries the same tag, so the bars collapse into a meaningless solid color line
   * at x=0. Only show them when 2+ sessions exist.
   */
  showSessionTags: boolean
  /** V4-P02: prebuilt duty buckets keyed by pairing id (falls back to live grouping if absent). */
  dutyBuckets?: Map<number, PairingDutyGroup[]>
}

/**
 * Render all visible pairing blocks.
 * Each pairing occupies one row; rows are ordered by the items array index.
 * Always uses Segment Mode layout (42px rows).
 */
export const renderPairingTasks = (rc: PairingRenderContext): void => {
  const { ctx, canvasWidth, canvasHeight, scrollY, items, frozenRowCount } = rc

  for (let i = 0; i < frozenRowCount && i < items.length; i++) {
    drawSegmentRow(rc, items[i], i)
  }

  const scrollableCount = items.length - frozenRowCount
  const { first, last } = getVisibleRowRangeCustom(scrollY, canvasHeight, scrollableCount, PAIRING_ROW_HEIGHT)
  if (frozenRowCount > 0) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, PAIRING_HEADER_HEIGHT + frozenRowCount * PAIRING_ROW_HEIGHT, canvasWidth, canvasHeight)
    ctx.clip()
  }
  for (let idx = first; idx <= last; idx++) {
    const i = idx + frozenRowCount
    if (i < items.length) {
      drawSegmentRow(rc, items[i], i)
    }
  }
  if (frozenRowCount > 0) ctx.restore()
}

/**
 * Draw a pairing row using Segment Mode.
 * Renders: pickup → brief → [flight segments] → debrief → dropoff → layover → rest
 */
const drawSegmentRow = (
  rc: PairingRenderContext,
  item: PairingItem,
  rowIndex: number,
): void => {
  const { ctx, scrollX, scrollY, pxPerHour, rangeStart, canvasWidth, canvasHeight, timezone, frozenRowCount } = rc
  const colors = getGanttColors()

  // V4-P02: epoch-ms for pure arithmetic geometry (pixel-identical to timeToX UTC branch)
  const rangeStartMs = rangeStart.getTime()

  const segments = item.segments
  const pairing = item.pairing

  // Row Y position (42px rows for pairing pane)
  const baseY = rowY(rowIndex, scrollY, frozenRowCount, PAIRING_ROW_HEIGHT)
  const centerY = baseY + Math.floor(PAIRING_ROW_HEIGHT / 2)  // center for flight blocks

  // Flight block position (centered vertically, 20px height)
  const flightY = centerY - Math.floor(SEGMENT_FLIGHT_HEIGHT / 2)  // centerY - 10

  // All bars (Pickup/Brief/Layover/Debrief/Dropoff/Rest) height = half of flight puck (10px)
  // Position: aligned with flight puck BOTTOM edge
  const barY = centerY + Math.floor(SEGMENT_FLIGHT_HEIGHT / 2) - SEGMENT_BAR_HEIGHT  // centerY + 10 - 10 = centerY

  // Draw session tag bars (4px wide, left edge of row).
  // Skipped entirely for a single session — see PairingRenderContext.showSessionTags.
  if (rc.showSessionTags && item.sessionTags && item.sessionTags.length > 0) {
    const tagWidth = 4
    if (item.sessionTags.length === 1) {
      // Single session: solid bar
      ctx.fillStyle = SESSION_COLORS[item.sessionTags[0] - 1] ?? '#888'
      ctx.fillRect(0, baseY, tagWidth, PAIRING_ROW_HEIGHT)
    } else {
      // Multiple sessions: segmented bar
      const segHeight = PAIRING_ROW_HEIGHT / item.sessionTags.length
      item.sessionTags.forEach((tag, i) => {
        ctx.fillStyle = SESSION_COLORS[tag - 1] ?? '#888'
        ctx.fillRect(0, baseY + i * segHeight, tagWidth, segHeight)
      })
    }
  }

  // Clipping check
  if (baseY + PAIRING_ROW_HEIGHT < PAIRING_HEADER_HEIGHT) return
  if (baseY > canvasHeight) return

  // V4-P02: bucket miss should never happen in production — it means the bucket
  // build diverged from the rendered items (keying/filtering bug) and the
  // memoization win is silently lost. Warn in dev, fall back to live grouping.
  let duties = rc.dutyBuckets?.get(pairing.id)
  if (duties === undefined) {
    if (import.meta.env.DEV && rc.dutyBuckets) {
      console.warn(`[PairingRenderer] dutyBuckets miss for pairing ${pairing.id} — falling back to live grouping`)
    }
    duties = groupSegmentsByDuty(segments)
  }

  // Group-level selection: any segment of this pairing selected → draw ONE box at the end.
  const isGroupSelected = segments.some((s) => rc.selectedPairingIds.has(s.id))

  // Draw Layover bands (thick line aligned with puck bottom)

  for (let di = 0; di < duties.length - 1; di++) {
    const dutyEnd = duties[di].segments[duties[di].segments.length - 1]
    const nextDutyStart = duties[di + 1].segments[0]

    // Layover: from previous duty's dropoff_end_utc to next duty's pickup_start_utc
    const loStart = dutyEnd.dropoffEndUtc
    const loEnd = nextDutyStart.pickupStartUtc

    if (loStart && loEnd) {
      const loX = msToX(parseIsoMs(loStart), rangeStartMs, pxPerHour) - scrollX
      const loEndX = msToX(parseIsoMs(loEnd), rangeStartMs, pxPerHour) - scrollX
      const loWidth = Math.max(loEndX - loX, 1)

      if (loX < canvasWidth && loEndX > 0) {
        // Bar aligned with flight puck bottom
        ctx.fillStyle = SEGMENT_LAYOVER_BG
        ctx.fillRect(loX, barY, loWidth, SEGMENT_BAR_HEIGHT)

        // Dashed borders on left and right
        ctx.strokeStyle = SEGMENT_LAYOVER_BORDER
        ctx.setLineDash([4, 3])
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(loX, barY)
        ctx.lineTo(loX, barY + SEGMENT_BAR_HEIGHT)
        ctx.moveTo(loEndX, barY)
        ctx.lineTo(loEndX, barY + SEGMENT_BAR_HEIGHT)
        ctx.stroke()
        ctx.setLineDash([])

        // Label if wide enough (centered in the bar)
        if (loWidth > 40) {
          ctx.fillStyle = SEGMENT_LAYOVER_LABEL_COLOR
          ctx.font = `7px ${PUCK_FONT_FAMILY}`
          ctx.textBaseline = 'middle'
          ctx.textAlign = 'center'
          ctx.fillText('LAYOVER', loX + loWidth / 2, barY + SEGMENT_BAR_HEIGHT / 2)
        }
      }
    }
  }

  // Draw Rest band (bar aligned with flight puck bottom)
  if (duties.length > 0) {
    const lastDutyLastSeg = duties[duties.length - 1].segments[duties[duties.length - 1].segments.length - 1]
    // Rest starts from dropoff end time (sign-out)
    const restStart = lastDutyLastSeg.dropoffEndUtc
    // Rest ends = start + dutyActRestMin (actual rest minutes) — pure ms arithmetic avoids addMinutes round-trip
    const restMin = lastDutyLastSeg.dutyActRestMin ?? lastDutyLastSeg.dutySchRestMin ?? 0
    const restStartMs = restStart ? parseIsoMs(restStart) : null

    if (restStartMs !== null) {
      const restEndMs = restStartMs + restMin * 60_000
      const restX = msToX(restStartMs, rangeStartMs, pxPerHour) - scrollX
      const restEndX = msToX(restEndMs, rangeStartMs, pxPerHour) - scrollX
      const restWidth = Math.max(restEndX - restX, 1)

      if (restX < canvasWidth && restEndX > 0) {
        // Bar aligned with flight puck bottom
        ctx.fillStyle = SEGMENT_REST_BG
        ctx.fillRect(restX, barY, restWidth, SEGMENT_BAR_HEIGHT)

        // Dashed border on left
        ctx.strokeStyle = SEGMENT_REST_BORDER
        ctx.setLineDash([4, 3])
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(restX, barY)
        ctx.lineTo(restX, barY + SEGMENT_BAR_HEIGHT)
        ctx.stroke()
        ctx.setLineDash([])

        // Label if wide enough (centered in the bar)
        if (restWidth > 30) {
          ctx.fillStyle = SEGMENT_REST_LABEL_COLOR
          ctx.font = `7px ${PUCK_FONT_FAMILY}`
          ctx.textBaseline = 'middle'
          ctx.textAlign = 'center'
          ctx.fillText('REST', restX + restWidth / 2, barY + SEGMENT_BAR_HEIGHT / 2)
        }
      }
    }
  }

  for (const duty of duties) {
    const firstSeg = duty.segments[0]
    const lastSeg = duty.segments[duty.segments.length - 1]

    // Flight-duty background band (light grey): groups the flights in one duty,
    // spanning duty check-in (pickup start) → check-out (dropoff end). Drawn first
    // so pickup/brief/pucks/debrief/dropoff render on top. The inter-duty layover gap
    // is never covered. Pairings only contain flight duties (no ground tasks).
    {
      const dutyStartIso = firstSeg.pickupStartUtc ?? firstSeg.schStrDtUtc
      const dutyEndIso = lastSeg.dropoffEndUtc ?? lastSeg.schEndDtUtc
      if (dutyStartIso && dutyEndIso) {
        const bandX = msToX(parseIsoMs(dutyStartIso), rangeStartMs, pxPerHour) - scrollX
        const bandEndX = msToX(parseIsoMs(dutyEndIso), rangeStartMs, pxPerHour) - scrollX
        const bandWidth = Math.max(bandEndX - bandX, 1)
        if (bandX < canvasWidth && bandEndX > 0) {
          const bandY = flightY - 2
          const bandHeight = barY + SEGMENT_BAR_HEIGHT + 2 - bandY
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

    // Pickup bar (grey, aligned with puck bottom)
    if (firstSeg.pickupStartUtc && firstSeg.pickupEndUtc) {
      const puStart = msToX(parseIsoMs(firstSeg.pickupStartUtc), rangeStartMs, pxPerHour) - scrollX
      const puEnd = msToX(parseIsoMs(firstSeg.pickupEndUtc), rangeStartMs, pxPerHour) - scrollX
      const puWidth = Math.max(puEnd - puStart, 1)
      ctx.fillStyle = SEGMENT_PICKUP_DROP_COLOR
      ctx.globalAlpha = 0.7
      ctx.fillRect(puStart, barY, puWidth, SEGMENT_BAR_HEIGHT)
      ctx.globalAlpha = 1
    }

    // Brief bar (amber, aligned with puck bottom)
    // Brief ends at first flight's departure time (schStrDtUtc) to ensure continuity
    if (firstSeg.briefStartUtc && firstSeg.schStrDtUtc) {
      const brStart = msToX(parseIsoMs(firstSeg.briefStartUtc), rangeStartMs, pxPerHour) - scrollX
      const brEnd = msToX(parseIsoMs(firstSeg.schStrDtUtc), rangeStartMs, pxPerHour) - scrollX  // use flight start time
      const brWidth = Math.max(brEnd - brStart, 1)
      ctx.fillStyle = SEGMENT_BRIEF_COLOR
      ctx.fillRect(brStart, barY, brWidth, SEGMENT_BAR_HEIGHT)
    }

    // Flight segments (20px, green/blue gradient)
    for (const seg of duty.segments) {
      if (!seg.schStrDtUtc || !seg.schEndDtUtc) continue

      const segStart = msToX(parseIsoMs(seg.schStrDtUtc), rangeStartMs, pxPerHour) - scrollX
      const segEnd = msToX(parseIsoMs(seg.schEndDtUtc), rangeStartMs, pxPerHour) - scrollX
      const segWidth = Math.max(segEnd - segStart, MIN_TASK_WIDTH)

      // Skip if outside canvas
      if (segStart > canvasWidth || segEnd < 0) continue

      // Check if deadhead
      const isDH = isDeadheadSegAssignment(seg.segAssignment)

      // Check if this segment is hovered (segment-level hover)
      const isSegHovered = rc.hoveredPairingId === seg.id

      // Gradient fill — ground uses assignment color; FLY blue; Reserve light green.
      const isGround = GROUND_GROUPS.has(pairing.assignmentGroup)
      const groundBaseColor = isGround
        ? useAssignmentStore.getState().getAssignmentColor(pairing.assignment, pairing.assignmentGroup)
        : null
      let labelBaseColor: string | null = groundBaseColor
      if (groundBaseColor) {
        gradientFill(ctx, segStart, flightY, segWidth, SEGMENT_FLIGHT_HEIGHT, lightenColor(groundBaseColor, 0.15), groundBaseColor, 3)
        ctx.strokeStyle = groundBaseColor
      } else {
        const fill = resolveSegmentDutyFill({
          assignmentGroup: pairing.assignmentGroup,
          assignment: pairing.assignment,
          isDeadhead: isDH,
        })
        if (fill.kind === 'dhd') {
          gradientFill(ctx, segStart, flightY, segWidth, SEGMENT_FLIGHT_HEIGHT, FLIGHT_COLOR_DH_TOP, FLIGHT_COLOR_DH_BOTTOM, 3)
          ctx.strokeStyle = 'rgba(168, 85, 247, 0.35)'
        } else if (fill.kind === 'reserve') {
          labelBaseColor = fill.baseColor
          gradientFill(ctx, segStart, flightY, segWidth, SEGMENT_FLIGHT_HEIGHT, lightenColor(fill.baseColor, 0.15), fill.baseColor, 3)
          ctx.strokeStyle = fill.baseColor
        } else if (fill.kind === 'fly') {
          gradientFill(ctx, segStart, flightY, segWidth, SEGMENT_FLIGHT_HEIGHT, fill.top, fill.bottom, 3)
          ctx.strokeStyle = 'rgba(59, 130, 246, 0.45)'
        }
      }
      ctx.lineWidth = 1
      ctx.beginPath()
      roundedRect(ctx, segStart, flightY, segWidth, SEGMENT_FLIGHT_HEIGHT, 3)
      ctx.stroke()

      // Text content based on width
      if (segWidth >= 60) {
        drawFullFlightPuck(ctx, seg, segStart, flightY, segWidth, SEGMENT_FLIGHT_HEIGHT, timezone, isDH, labelBaseColor)
      } else if (segWidth >= 30) {
        drawPartialFlightPuck(ctx, seg, segStart, flightY, segWidth, SEGMENT_FLIGHT_HEIGHT, isDH, labelBaseColor)
      } else if (segWidth >= 16) {
        drawMinimalFlightPuck(ctx, seg, segStart, flightY, segWidth, SEGMENT_FLIGHT_HEIGHT, isDH, labelBaseColor)
      }

      // Hover overlay on individual segment (selection outline drawn at group level below)
      if (isSegHovered && !isGroupSelected) {
        ctx.strokeStyle = colors.hoverBorder
        ctx.lineWidth = 1
        ctx.beginPath()
        roundedRect(ctx, segStart, flightY, segWidth, SEGMENT_FLIGHT_HEIGHT, 3)
        ctx.stroke()
      }
    }

    // Debrief bar (slate, aligned with puck bottom)
    // Debrief starts at last flight's arrival time (schEndDtUtc) to ensure continuity
    if (lastSeg.schEndDtUtc && lastSeg.debriefEndUtc) {
      const dbStart = msToX(parseIsoMs(lastSeg.schEndDtUtc), rangeStartMs, pxPerHour) - scrollX  // use flight end time
      const dbEnd = msToX(parseIsoMs(lastSeg.debriefEndUtc), rangeStartMs, pxPerHour) - scrollX
      const dbWidth = Math.max(dbEnd - dbStart, 1)
      ctx.fillStyle = SEGMENT_DEBRIEF_COLOR
      ctx.fillRect(dbStart, barY, dbWidth, SEGMENT_BAR_HEIGHT)
    }

    // Dropoff bar (grey, aligned with puck bottom)
    if (lastSeg.dropoffStartUtc && lastSeg.dropoffEndUtc) {
      const doStart = msToX(parseIsoMs(lastSeg.dropoffStartUtc), rangeStartMs, pxPerHour) - scrollX
      const doEnd = msToX(parseIsoMs(lastSeg.dropoffEndUtc), rangeStartMs, pxPerHour) - scrollX
      const doWidth = Math.max(doEnd - doStart, 1)
      ctx.fillStyle = SEGMENT_PICKUP_DROP_COLOR
      ctx.globalAlpha = 0.7
      ctx.fillRect(doStart, barY, doWidth, SEGMENT_BAR_HEIGHT)
      ctx.globalAlpha = 1
    }
  }

  // Group-level selection outline: solid focus ring spanning the full pairing visual extent.
  // X: pickup start of first duty → rest end after last duty (mirrors roster drawSegmentGroup).
  if (isGroupSelected && duties.length > 0) {
    const firstSeg = duties[0].segments[0]
    const lastDuty = duties[duties.length - 1]
    const lastSeg  = lastDuty.segments[lastDuty.segments.length - 1]

    const startTime = firstSeg?.pickupStartUtc || firstSeg?.schStrDtUtc
    const restMin   = lastSeg?.dutyActRestMin ?? lastSeg?.dutySchRestMin ?? 0
    const restStart = lastSeg?.dropoffEndUtc
    const endTime   = restStart
      ? new Date(parseIsoMs(restStart) + restMin * 60_000).toISOString()
      : (lastSeg?.schEndDtUtc ?? null)

    if (startTime && endTime) {
      const selX    = msToX(parseIsoMs(startTime), rangeStartMs, pxPerHour) - scrollX
      const selEndX = msToX(parseIsoMs(endTime),   rangeStartMs, pxPerHour) - scrollX
      const selW    = selEndX - selX
      const selY    = flightY - 2
      const selH    = SEGMENT_FLIGHT_HEIGHT + 4

      if (selW > 0 && selEndX > 0 && selX < canvasWidth) {
        drawSelectionOutline(
          ctx, selX, selY, selW, selH,
          colors.selectionBorder, colors.selectionWash,
        )
      }
    }
  }
}

export interface PairingDutyGroup { dutySeq: number; segments: PairingSegment[] }

/**
 * Group segments by dutySeq for Segment Mode rendering.
 * Exported so the test hook can compare it against buildPairingDutyBuckets output.
 */
export const groupSegmentsByDuty = (segments: PairingSegment[]): PairingDutyGroup[] => {
  const groups = new Map<number, PairingSegment[]>()

  for (const seg of segments) {
    const dutySeq = seg.dutySeq ?? 1
    if (!groups.has(dutySeq)) {
      groups.set(dutySeq, [])
    }
    groups.get(dutySeq)!.push(seg)
  }

  // Sort segments within each duty by segSeq
  for (const [_, segs] of groups) {
    segs.sort((a, b) => (a.segSeq ?? 0) - (b.segSeq ?? 0))
  }

  // Return sorted by dutySeq
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([dutySeq, segments]) => ({ dutySeq, segments }))
}

/**
 * V4-P02: build duty buckets once when pairing items change (roster QW2 pattern —
 * see buildRosterRenderBuckets). Keyed by pairing id. The render loop consumes
 * this instead of regrouping/sorting per visible row per frame.
 * Output is exactly groupSegmentsByDuty(item.segments) per item.
 */
export const buildPairingDutyBuckets = (items: PairingItem[]): Map<number, PairingDutyGroup[]> => {
  const out = new Map<number, PairingDutyGroup[]>()
  for (const item of items) {
    out.set(item.pairing.id, groupSegmentsByDuty(item.segments))
  }
  return out
}

/**
 * Draw full flight puck (≥60px) with dep_arp + time | flt_num | arv_arp + time.
 */
const drawFullFlightPuck = (
  ctx: CanvasRenderingContext2D,
  seg: PairingSegment,
  x: number,
  y: number,
  width: number,
  height: number,
  timezone: string,
  isDH: boolean,
  groundBaseColor: string | null = null,
): void => {
  const groundText = groundBaseColor ? getContrastTextColor(groundBaseColor) : ''
  const textColor = groundText || (isDH ? '#d8b4fe' : '#86efac')
  const airportColor = groundText || (isDH ? '#d8b4fe' : '#93c5fd')
  const timeColor = groundText || (isDH ? '#c4b5fd' : '#7dd3fc')

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
  ctx.fillText(seg.depArp || '', x + 4, y + height / 2 - 4)

  // Left bottom: dep_time
  ctx.font = `8px ${PUCK_FONT_MONO}`
  ctx.fillStyle = timeColor
  const depTime = formatTime(seg.schStrDtUtc, timezone)
  ctx.fillText(depTime, x + 4, y + height / 2 + 4)

  // Center: flt_num
  ctx.textAlign = 'center'
  ctx.font = `bold 9px ${PUCK_FONT_FAMILY}`
  ctx.fillStyle = textColor
  ctx.fillText(seg.fltNum || '', centerX, y + height / 2)

  // Right: arv_arp
  ctx.textAlign = 'right'
  ctx.font = `bold 9px ${PUCK_FONT_FAMILY}`
  ctx.fillStyle = airportColor
  ctx.fillText(seg.arvArp || '', x + width - 4, y + height / 2 - 4)

  // Right bottom: arv_time
  ctx.font = `8px ${PUCK_FONT_MONO}`
  ctx.fillStyle = timeColor
  const arvTime = formatTime(seg.schEndDtUtc, timezone)
  ctx.fillText(arvTime, x + width - 4, y + height / 2 + 4)

  ctx.restore()
}

/**
 * Draw partial flight puck (30-59px) with dep_arp + flt_num.
 */
const drawPartialFlightPuck = (
  ctx: CanvasRenderingContext2D,
  seg: PairingSegment,
  x: number,
  y: number,
  width: number,
  height: number,
  isDH: boolean,
  groundBaseColor: string | null = null,
): void => {
  const groundText = groundBaseColor ? getContrastTextColor(groundBaseColor) : ''
  const textColor = groundText || (isDH ? '#d8b4fe' : '#86efac')
  const airportColor = groundText || (isDH ? '#d8b4fe' : '#93c5fd')

  ctx.save()
  ctx.beginPath()
  ctx.rect(x + 2, y + 1, width - 4, height - 2)
  ctx.clip()

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // Show flt_num centered
  ctx.font = `bold 9px ${PUCK_FONT_FAMILY}`
  ctx.fillStyle = textColor
  ctx.fillText(seg.fltNum || '', x + width / 2, y + height / 2)

  ctx.restore()
}

/**
 * Draw minimal flight puck (16-29px) with flt_num last 4 digits.
 */
const drawMinimalFlightPuck = (
  ctx: CanvasRenderingContext2D,
  seg: PairingSegment,
  x: number,
  y: number,
  width: number,
  height: number,
  isDH: boolean,
  groundBaseColor: string | null = null,
): void => {
  const groundText = groundBaseColor ? getContrastTextColor(groundBaseColor) : ''
  const textColor = groundText || (isDH ? '#d8b4fe' : '#86efac')
  const fltNum = seg.fltNum || ''
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
