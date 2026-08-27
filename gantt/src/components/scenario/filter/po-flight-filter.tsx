import type { ReactNode } from 'react'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@rois/ui'
import type { PoFilterParams, FlightStatusFilter } from '@/types'
import { TagInput } from './tag-input'
import { CollapsibleSection } from './collapsible-section'

interface PoFlightFilterProps {
  params: PoFilterParams
  onChange: (params: PoFilterParams) => void
  disabled?: boolean
}

const FLIGHT_STATUS_OPTIONS: { value: FlightStatusFilter; label: string }[] = [
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'ACTUAL',    label: 'Actual' },
  { value: 'ALL',       label: 'All' },
]

export const PoFlightFilter = ({ params, onChange, disabled = false }: PoFlightFilterProps): ReactNode => {
  const patch = (partial: Partial<PoFilterParams>): void => onChange({ ...params, ...partial })

  const totalTags =
    params.flightNos.length +
    params.depAirports.length +
    params.arrAirports.length +
    params.fleets.length

  return (
    <CollapsibleSection title="Flight Filters" badgeCount={totalTags}>
      <div className="flex flex-col gap-3 text-xs">
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground">Flight Nos</label>
          <TagInput tags={params.flightNos} onChange={(flightNos) => patch({ flightNos })} placeholder="e.g. CA101" disabled={disabled} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground">Dep Airports</label>
          <TagInput tags={params.depAirports} onChange={(depAirports) => patch({ depAirports })} placeholder="e.g. PEK" disabled={disabled} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground">Arr Airports</label>
          <TagInput tags={params.arrAirports} onChange={(arrAirports) => patch({ arrAirports })} placeholder="e.g. SHA" disabled={disabled} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground">Fleets</label>
          <TagInput tags={params.fleets} onChange={(fleets) => patch({ fleets })} placeholder="e.g. B737" disabled={disabled} />
        </div>
        <div className="flex items-center gap-2">
          <label className="w-20 shrink-0 text-muted-foreground">Flight Status</label>
          <Select value={params.flightStatus} onValueChange={(v: string) => patch({ flightStatus: v as FlightStatusFilter })} disabled={disabled}>
            <SelectTrigger className="h-6 flex-1 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FLIGHT_STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </CollapsibleSection>
  )
}
