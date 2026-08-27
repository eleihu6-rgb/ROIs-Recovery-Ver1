import React from 'react'
import type { DutyEditState, GanttBlock } from '@/utils/duty-node-utils'
import type { PairingSegment } from '@/types'
import { buildGanttBlocks } from '@/utils/duty-node-utils'
import { useTimezoneStore } from '@/stores/timezone-store'

interface Props {
  state:           DutyEditState
  segments:        PairingSegment[]
  firstSeg:        PairingSegment   // kept for interface compat — not used internally
  lastSeg:         PairingSegment   // kept for interface compat — not used internally
  restAfterSegSeq: number | null
  onAddDouble:     () => void
}

const BLOCK_BG: Record<string, string> = {
  pickup:  'linear-gradient(135deg,#92400e,#b45309)',
  brief:   'linear-gradient(135deg,#1e3a8a,#2563eb)',
  flight:  'linear-gradient(135deg,#1f2937,#374151)',
  transit: 'repeating-linear-gradient(45deg,#1c2128 0,#1c2128 4px,#242d3c 4px,#242d3c 8px)',
  rest:    'repeating-linear-gradient(45deg,#1a1040 0,#1a1040 5px,#231651 5px,#231651 10px)',
  hotel:   'rgba(110,64,201,0.18)',
  debrief: 'linear-gradient(135deg,#164e63,#0891b2)',
  dropoff: 'linear-gradient(135deg,#92400e,#b45309)',
}

const BLOCK_TEXT_COLOR: Record<string, string> = {
  hotel:   '#a78bfa',
  flight:  'rgba(255,255,255,0.65)',
  transit: 'transparent',
  rest:    'transparent',
}

const BLOCK_BORDER: Record<string, React.CSSProperties> = {
  rest:  { borderLeft: '1px dashed rgba(110,64,201,0.4)', borderRight: '1px dashed rgba(110,64,201,0.4)' },
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
        ...(BLOCK_BORDER[block.type] ?? {}),
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
              color:
                lp.kind === 'edit'  ? '#2f81f7' :
                lp.kind === 'hotel' ? '#a78bfa' :
                '#4d5761',
            }}
          >
            {lp.text}
          </span>
        ))}
      </div>

    </div>
  )
}
