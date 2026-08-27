import type { ReactNode } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rois/ui'
import { MultiSelect } from '@/components/scenario/multi-select'
import { TagInput } from '@/components/scenario/filter/tag-input'
import { useBaseOptions } from '@/components/scenario/filter/use-base-options'
import type {
  PbsAlgorithmExportDivision,
  PbsAlgorithmExportFilters,
  PbsAlgorithmExportStatus,
} from '@/services/pbs-admin-tools-api'

interface AlgorithmExportScopeFiltersProps {
  value: PbsAlgorithmExportFilters
  onChange: (value: PbsAlgorithmExportFilters) => void
}

const compileFilter = (value: PbsAlgorithmExportFilters): string => {
  const division = value.division === 'ALL' ? '*' : value.division
  const bases = value.bases.length > 0 ? value.bases.join(',') : '*'
  const fleets = value.fleetQuals.length > 0 ? value.fleetQuals.join(',') : '*'

  return `${division} / ${bases} / ${fleets} / ${value.status}`
}

export const AlgorithmExportScopeFilters = ({
  value,
  onChange,
}: AlgorithmExportScopeFiltersProps): ReactNode => {
  const { options: baseOptions, loading: basesLoading } = useBaseOptions()

  const patch = (partial: Partial<PbsAlgorithmExportFilters>): void => {
    onChange({ ...value, ...partial })
  }

  return (
    <>
      <div className="flex min-w-0 flex-col gap-1 text-xs">
        <label className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Division</label>
        <Select
          value={value.division}
          onValueChange={(division: PbsAlgorithmExportDivision) => patch({ division })}
        >
          <SelectTrigger data-testid="pbs-export-division" className="h-8 min-w-0 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL" className="text-xs">All</SelectItem>
            <SelectItem value="P" className="text-xs">Pilots</SelectItem>
            <SelectItem value="C" className="text-xs">Cabin</SelectItem>
            <SelectItem value="A" className="text-xs">Airmarshal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-w-0 flex-col gap-1 text-xs">
        <label className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Status</label>
        <Select
          value={value.status}
          onValueChange={(status: PbsAlgorithmExportStatus) => patch({ status })}
        >
          <SelectTrigger data-testid="pbs-export-status" className="h-8 min-w-0 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE" className="text-xs">Active</SelectItem>
            <SelectItem value="ALL" className="text-xs">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-w-0 flex-col gap-1 text-xs">
        <label className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Bases</label>
        <MultiSelect
          testId="pbs-export-bases"
          options={baseOptions}
          selected={value.bases}
          onChange={(bases) => patch({ bases })}
          placeholder="All bases"
          loading={basesLoading}
          className="min-h-8"
        />
      </div>

      <div className="flex min-w-0 flex-col gap-1 text-xs">
        <label className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Fleet Quals</label>
        <div
          data-testid="pbs-export-fleet-quals"
          className="flex min-h-8 w-full items-center rounded-sm border border-input bg-background px-2 py-1"
        >
          <TagInput
            testId="pbs-export-fleet-quals-tags"
            tags={value.fleetQuals}
            onChange={(fleetQuals) => patch({ fleetQuals: fleetQuals.map((fleet) => fleet.trim().toUpperCase()) })}
            placeholder="e.g. B737"
          />
        </div>
      </div>

      <div className="rounded bg-muted/30 px-2 py-1 md:col-span-2 xl:col-span-5">
        <span className="mr-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Filter:</span>
        <span className="font-mono text-2xs text-foreground/70">{compileFilter(value)}</span>
      </div>
    </>
  )
}
