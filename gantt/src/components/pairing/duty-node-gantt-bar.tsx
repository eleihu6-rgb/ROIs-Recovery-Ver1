import React from 'react'
import type { DutyEditState, GanttBlock } from '@/utils/duty-node-utils'
import type { PairingSegment } from '@/types'
import { buildGanttBlocks } from '@/utils/duty-node-utils'
import { useTimezoneStore } from '@/stores/timezone-store'
import { ROSTER_FLIGHT_TOP, ROSTER_FLIGHT_BOTTOM } from '@/utils/puck-duty-color'
import {
  SEGMENT_BRIEF_COLOR,
  SEGMENT_DEBRIEF_COLOR,
  SEGMENT_PICKUP_DROP_COLOR,
  SEGMENT_REST_BG,
  DELAY_GHOST_FILL_COLOR,
  DELAY_GHOST_BORDER_COLOR,
  DELAY_GHOST_HATCH_ALPHA,
  DELAY_GHOST_LABEL_COLOR,
  DELAY_GHOST_ACTUAL_TIME_COLOR,
} from '@/components/gantt/gantt-constants'

interface Props {
  state:           DutyEditState
  segments:        PairingSegment[]
  firstSeg:        PairingSegment   // kept for interface compat — not used internally
  lastSeg:         PairingSegment   // kept for interface compat — not used internally
  restAfterSegSeq: number | null
  onAddDouble:     () => void
}

// Colors mirror the Pairing/Roster Segment-mode panes so the duty puck reads
// identically to the Gantt (item 5a). Hatched ghost = the STD→ATD delay slot (5b).
const GHOST_HATCH = `rgba(148,163,184,${DELAY_GHOST_HATCH_ALPHA})` // DELAY_GHOST_HATCH_COLOR @ alpha

const BLOCK_BG: Record<string, string> = {
  pickup:  SEGMENT_PICKUP_DROP_COLOR,
  brief:   SEGMENT_BRIEF_COLOR,
  flight:  `linear-gradient(135deg,${ROSTER_FLIGHT_TOP},${ROSTER_FLIGHT_BOTTOM})`,
  transit: SEGMENT_REST_BG,
  rest:    SEGMENT_REST_BG,
  hotel:   'rgba(110,64,201,0.18)',
  debrief: SEGMENT_DEBRIEF_COLOR,
  dropoff: SEGMENT_PICKUP_DROP_COLOR,
  ghost:   DELAY_GHOST_FILL_COLOR,
}

const BLOCK_TEXT_COLOR: Record<string, string> = {
  pickup:  'rgba(255,255,255,0.88)',
  brief:   '#3b2a05',                 // dark ink on amber, matches pane brief label
  flight:  'rgba(255,255,255,0.92)',
  debrief: '#1e293b',                 // dark ink on slate
  dropoff: 'rgba(255,255,255,0.88)',
  ghost:   DELAY_GHOST_LABEL_COLOR,
  hotel:   '#a78bfa',
  transit: 'transparent',
  rest:    'transparent',
}

const BLOCK_EXTRA: Record<string, React.CSSProperties> = {
  ghost: {
    backgroundImage: `repeating-linear-gradient(45deg, transparent 0, transparent 4px, ${GHOST_HATCH} 4px, ${GHOST_HATCH} 5px)`,
    border:          `1px dashed ${DELAY_GHOST_BORDER_COLOR}`,
    borderRight:     'none',
    fontSize:        9,
  },
  rest:  { borderLeft: '1px dashed rgba(100,116,139,0.5)', borderRight: '1px dashed rgba(100,116,139,0.5)' },
  hotel: { borderLeft: '1px dashed rgba(110,64,201,0.5)', borderRight: '1px dashed rgba(110,64,201,0.5)' },
}

function fmtDur(from: Date, to: Date): string {
  const mins = Math.round(Math.abs(to.getTime() - from.getTime()) / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}h${m.toString().padStart(2, '0')}m`
}

function fmtTz(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d)
}

function BlockSegment({ block, timezone }: { block: GanttBlock; timezone: string }) {
  const showLabel = block.widthPct >= 5
  const label = showLabel ? block.label : ''
  const tip = `${block.label || block.type}: ${fmtTz(block.start, timezone)} – ${fmtTz(block.end, timezone)} (${fmtDur(block.start, block.end)})`

  return (
    <div
      title={tip}
      style={{
        flex:           `0 0 ${block.widthPct}%`,
        height:         '100%',
        background:     BLOCK_BG[block.type] ?? '#374151',
        color:          BLOCK_TEXT_COLOR[block.type] ?? 'rgba(255,255,255,0.88)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        fontSize:       10,
        fontWeight:     600,
        fontFamily:     'var(--font-mono)',
        overflow:       'hidden',
        whiteSpace:     'nowrap',
        cursor:         'default',
        ...(BLOCK_EXTRA[block.type] ?? {}),
      }}
    >
      {label && (
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 4px' }}>
          {label}
        </span>
      )}
    </div>
  )
}

export function DutyNodeGanttBar({
  state, segments, restAfterSegSeq, onAddDouble,
}: Props) {
  const timezone = useTimezoneStore((s) => s.timezone)
  const { blocks, axisLabels, blockLabels, restGapPct } = buildGanttBlocks(
    state, segments, restAfterSegSeq, timezone,
  )
  const isDouble = state.double != null

  return (
    <div style={{ position: 'relative', overflow: 'visible', marginTop: 20, marginBottom: 4 }}>

      {/* Block labels (double mode only) — 18px above bar */}
      {blockLabels.map((bl) => (
        <span
          key={bl.kind}
          style={{
            position:      'absolute',
            top:           -18,
            left:          `${bl.pct}%`,
            fontSize:      9,
            fontFamily:    'var(--font-mono)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color:         bl.kind === 'b2' ? '#a78bfa' : '#8b949e',
            pointerEvents: 'none',
          }}
        >
          {bl.text}
        </span>
      ))}

      {/* ⊕ Add Double button — centered over REST gap, 22px above bar */}
      {!isDouble && restGapPct != null && (
        <button
          type="button"
          onClick={onAddDouble}
          title="Add second sign-in/out block"
          style={{
            position:     'absolute',
            top:          -22,
            left:         `${restGapPct}%`,
            transform:    'translateX(-50%)',
            height:       18,
            padding:      '0 8px',
            background:   '#6e40c9',
            color:        '#fff',
            border:       'none',
            borderRadius: 9,
            fontSize:     10,
            fontWeight:   600,
            cursor:       'pointer',
            whiteSpace:   'nowrap',
            display:      'flex',
            alignItems:   'center',
            gap:          3,
            boxShadow:    '0 2px 6px rgba(0,0,0,0.4)',
            zIndex:       10,
          }}
        >
          ⊕ Add Double
        </button>
      )}

      {/* Main bar — flexbox, height 30px */}
      <div
        style={{
          display:      'flex',
          height:       30,
          borderRadius: 5,
          overflow:     'hidden',
          background:   'rgba(0,0,0,0.25)',
        }}
      >
        {blocks.map((b) => <BlockSegment key={`${b.type}-${b.start.getTime()}`} block={b} timezone={timezone} />)}
      </div>

      {/* Time axis — 20px, below bar */}
      <div style={{ position: 'relative', height: 20, marginTop: 3 }}>
        {axisLabels.map((lp) => (
          <span
            key={`${lp.kind}-${lp.pct.toFixed(1)}`}
            style={{
              position:   'absolute',
              left:       `${lp.pct}%`,
              transform:  'translateX(-50%)',
              fontSize:   10,
              fontFamily: 'var(--font-mono)',
              whiteSpace: 'nowrap',
              userSelect: 'none',
              fontWeight: lp.kind === 'act' ? 600 : 400,
              color:
                lp.kind === 'edit'  ? '#2563eb' :
                lp.kind === 'act'   ? DELAY_GHOST_ACTUAL_TIME_COLOR :
                lp.kind === 'hotel' ? '#a78bfa' :
                '#94a3b8',
            }}
          >
            {lp.text}
          </span>
        ))}
      </div>

    </div>
  )
}
