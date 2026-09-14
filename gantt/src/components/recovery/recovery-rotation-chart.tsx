import type { ReactElement } from 'react'
import { formatBlockMinutes } from '@/components/gantt/gantt-utils'
import type { RoundtripFlight, RoundtripRotation } from '@/services/roundtrip-api'

interface RecoveryRotationChartProps {
  rotation: RoundtripRotation
  flights: Map<number, RoundtripFlight>
  timezone: string
}

const dateTime = (value: string, timezone: string): string => new Intl.DateTimeFormat('en-GB', {
  timeZone: timezone, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(value))

/** Duty-local scales keep flight labels readable without hiding long layovers. */
export const RecoveryRotationChart = ({ rotation, flights, timezone }: RecoveryRotationChartProps): ReactElement => {
  const duties = rotation.dutyFlightIds.map((ids) => ids.map((id) => flights.get(id)).filter((flight): flight is RoundtripFlight => Boolean(flight)))
  if (!duties.some((legs) => legs.length)) return <div role="img" aria-label="No flights available for this rotation" className="rounded border border-border p-3 text-xs text-muted-foreground">No flights available for this rotation.</div>

  return <div role="img" aria-label={`Selected recovery rotation timeline in ${timezone}`} className="space-y-2 rounded border border-border bg-muted/20 p-3">
    <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-2xs text-muted-foreground">
      <span className="font-medium text-foreground">Rotation timeline</span>
      <span>Independent time scale per duty · Scheduled times in {timezone}</span>
    </div>
    <div className="max-h-80 space-y-2 overflow-y-auto">
      {duties.map((legs, dutyIndex) => {
        if (!legs.length) return null
        const start = Math.min(...legs.map((flight) => Date.parse(flight.schDepDtUtc)))
        const end = Math.max(...legs.map((flight) => Date.parse(flight.schArvDtUtc)))
        const span = Math.max(end - start, 1)
        const nextFlight = duties[dutyIndex + 1]?.[0]
        const groundMinutes = nextFlight ? Math.round((Date.parse(nextFlight.schDepDtUtc) - end) / 60000) : null
        const restMinutes = rotation.layoverMinutes[dutyIndex]
        return <div key={dutyIndex} className="space-y-2">
          <div data-testid="recovery-chart-duty" className="space-y-2 rounded-sm border border-border bg-background p-2">
            <div className="flex flex-wrap items-center justify-between gap-1 text-2xs">
              <strong className="font-medium">Duty {dutyIndex + 1} · {legs[0].depArp} → {legs[legs.length - 1].arvArp}</strong>
              <span className="text-muted-foreground">Block {formatBlockMinutes(legs.reduce((total, flight) => total + flight.blockMin, 0))}</span>
            </div>
            <div className="flex justify-between gap-2 text-2xs text-muted-foreground">
              <span>{dateTime(new Date(start).toISOString(), timezone)}</span>
              <span className="text-right">{dateTime(new Date(end).toISOString(), timezone)}</span>
            </div>
            {legs.map((flight) => {
              const left = Math.max(0, Math.min(100, ((Date.parse(flight.schDepDtUtc) - start) / span) * 100))
              const width = Math.max(0, Math.min(100 - left, ((Date.parse(flight.schArvDtUtc) - Date.parse(flight.schDepDtUtc)) / span) * 100))
              return <div key={flight.id} data-testid="recovery-chart-flight" className="space-y-1">
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-2xs">
                  <span><strong className="font-medium">{flight.fltNum}</strong> · {flight.depArp} → {flight.arvArp}</span>
                  <span className="text-muted-foreground">{dateTime(flight.schDepDtUtc, timezone)} – {dateTime(flight.schArvDtUtc, timezone)} · Block {formatBlockMinutes(flight.blockMin)}</span>
                </div>
                <div aria-hidden="true" className="relative h-3 overflow-hidden rounded-sm border border-border bg-muted/30">
                  <div className="absolute inset-y-0 rounded-sm border border-primary/60 bg-primary/20" style={{ left: `${left}%`, width: `${width}%` }} />
                </div>
              </div>
            })}
          </div>
          {groundMinutes !== null && <div data-testid="recovery-chart-layover" className="flex flex-wrap gap-x-3 gap-y-1 border-l-2 border-dashed border-border px-2 py-1 text-2xs text-muted-foreground">
            <span className="font-medium text-foreground">Layover at {legs[legs.length - 1].arvArp}</span>
            <span>{formatBlockMinutes(groundMinutes)} ground interval</span>
            {restMinutes !== undefined && <span>{formatBlockMinutes(restMinutes)} rest between duties</span>}
            <span>Not drawn to scale</span>
          </div>}
        </div>
      })}
    </div>
  </div>
}

export default RecoveryRotationChart
