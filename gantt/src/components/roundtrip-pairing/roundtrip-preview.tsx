import { Check, Clock, Plane, Route } from 'lucide-react'
import type { ReactElement } from 'react'
import type { RoundtripFlight, RoundtripRotation, RoundtripRules } from '@/services/roundtrip-api'
import { formatBlockMinutes } from '@/components/gantt/gantt-utils'

export const RoundtripPreview = ({ rotation, flights, rules, timezone }: {
  rotation: RoundtripRotation
  flights: Map<number, RoundtripFlight>
  rules: RoundtripRules
  timezone: string
}): ReactElement => {
  const format = (date: string): string => new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(date))
  return <div data-testid="rt-preview" className="space-y-3">
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1"><Check className="h-3 w-3 text-primary" />Base return</span>
      <span>{rotation.flightIds.length} segments / {rotation.dutyFlightIds.length} {rotation.dutyFlightIds.length === 1 ? 'duty / No layover' : 'duties'}</span>
      <span>Block {formatBlockMinutes(rotation.blockMin)}</span>
    </div>
    {rotation.dutyFlightIds.map((ids, dutyIndex) => {
      const legs = ids.map((id) => flights.get(id)).filter((f): f is RoundtripFlight => Boolean(f))
      if (!legs.length) return null
      const nextGap = rotation.layoverMinutes[dutyIndex]
      return <div key={ids.join('-')} className="space-y-2">
        <div className="flex items-center gap-2 border-l-2 border-primary bg-primary/5 px-3 py-2 text-xs">
          <Plane className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <div className="text-muted-foreground">Duty {dutyIndex + 1} / {ids.length} segments</div>
            <div className="font-medium">{[legs[0].depArp, ...legs.map((f) => f.arvArp)].join(' → ')}</div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border text-muted-foreground"><tr>
              <th className="p-2 font-normal">Flight</th><th className="p-2 font-normal">Route</th>
              <th className="p-2 font-normal">Departure</th><th className="p-2 font-normal">Arrival</th>
            </tr></thead>
            <tbody>{legs.map((f) => <tr key={f.id} className="border-b border-border">
              <td className="p-2">{f.fltNum}</td><td className="p-2">{f.depArp} → {f.arvArp}</td>
              <td className="whitespace-nowrap p-2">{format(f.schDepDtUtc)}</td><td className="whitespace-nowrap p-2">{format(f.schArvDtUtc)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {dutyIndex < rotation.dutyFlightIds.length - 1 && <div className="flex flex-wrap items-center gap-3 border-y border-dashed border-border bg-accent/40 px-3 py-3 text-xs" data-testid="rt-layover">
          <Clock className="h-4 w-4 shrink-0" /><strong className="font-medium">Layover at {legs.at(-1)?.arvArp}</strong>
          <span>{formatBlockMinutes(nextGap + rules.checkinMin + rules.debriefMin)} ground interval</span>
          <span>{formatBlockMinutes(nextGap)} rest between duties</span>
        </div>}
      </div>
    })}
    <div className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Route className="h-3 w-3" />Times in {timezone}</div>
  </div>
}
