import { useEffect, type ReactNode } from 'react'
import { Input } from '@rois/ui'
import { GanttEnglishDatePicker } from '@/components/common/gantt-date-fields'
import type { RoFilterParams } from '@/types'
import { MultiSelect } from '../multi-select'
import { useBaseOptions } from './use-base-options'
import { useFleetOptions } from './use-fleet-options'
import { useRankOptions } from './use-rank-options'
import { CollapsibleSection } from './collapsible-section'

interface RoCrewFilterProps {
  crew: RoFilterParams['crew']
  division: string
  onChange: (crew: RoFilterParams['crew']) => void
  disabled?: boolean
}

interface CompactDateInputProps {
  testId: string
  value: string
  placeholder: string
  disabled: boolean
  onChange: (value: string) => void
}

/** Compact summary string shown below the interactive controls */
const compileCrewFilter = (crew: RoFilterParams['crew']): string => {
  const bases  = crew.bases.length  > 0 ? crew.bases.join(',')  : '*'
  const ranks  = crew.ranks.length  > 0 ? crew.ranks.join(',')  : '*'
  const fleets = crew.fleets.length > 0 ? crew.fleets.join(',') : '*'
  const seniority = crew.seniority.min != null || crew.seniority.max != null
    ? `${crew.seniority.min ?? '*'}-${crew.seniority.max ?? '*'}`
    : '*'
  const birthday = crew.birthday.from || crew.birthday.to
    ? `${crew.birthday.from || '*'}-${crew.birthday.to || '*'}`
    : '*'
  return `${bases} / ${ranks} / ${fleets} / ${seniority} / ${birthday}`
}

const numericValue = (value: string): number | null => {
  if (value.trim() === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const CompactDateInput = ({ testId, value, placeholder, disabled, onChange }: CompactDateInputProps): ReactNode => {
  return (
    <GanttEnglishDatePicker
      ariaLabel={placeholder}
      buttonClassName="min-w-0 w-full px-1.5 text-2xs"
      disabled={disabled}
      placeholder={placeholder}
      testId={testId}
      value={value}
      onValueChange={onChange}
    />
  )
}

export const RoCrewFilter = ({ crew, division, onChange, disabled = false }: RoCrewFilterProps): ReactNode => {
  const patch = (partial: Partial<RoFilterParams['crew']>): void => onChange({ ...crew, ...partial })
  const { options: baseOptions, loading: basesLoading } = useBaseOptions()
  const { options: rankOptions, loading: ranksLoading } = useRankOptions(division)
  const { options: fleetOptions, loading: fleetsLoading } = useFleetOptions()

  const badgeCount =
    crew.bases.length +
    crew.ranks.length +
    crew.fleets.length +
    (crew.seniority.min != null || crew.seniority.max != null ? 1 : 0) +
    (crew.birthday.from || crew.birthday.to ? 1 : 0)
  const compiled = compileCrewFilter(crew)

  useEffect(() => {
    if (ranksLoading || crew.ranks.length === 0) return
    const validRanks = new Set(rankOptions.map((option) => option.value))
    const nextRanks = crew.ranks.filter((rank) => validRanks.has(rank))
    if (nextRanks.length !== crew.ranks.length) patch({ ranks: nextRanks })
  }, [crew.ranks, rankOptions, ranksLoading])

  return (
    <CollapsibleSection title="Crew Filters" badgeCount={badgeCount}>
      <div className="grid grid-cols-1 gap-x-2 gap-y-3 text-xs @[420px]:grid-cols-2 @[640px]:grid-cols-3 @[700px]:grid-cols-[minmax(5rem,0.7fr)_minmax(5rem,0.7fr)_minmax(5rem,0.7fr)_minmax(8rem,1fr)_minmax(13rem,1.6fr)]">
        <div className="flex flex-col gap-1 min-w-0">
          <label className="text-muted-foreground">Bases</label>
          <MultiSelect
            testId="scenario-crew-bases"
            options={baseOptions}
            selected={crew.bases}
            onChange={(bases) => patch({ bases })}
            placeholder="All"
            loading={basesLoading}
            disabled={disabled}
          />
        </div>

        <div className="flex flex-col gap-1 min-w-0">
          <label className="text-muted-foreground">Ranks</label>
          <MultiSelect
            testId="scenario-crew-ranks"
            options={rankOptions}
            selected={crew.ranks}
            onChange={(ranks) => patch({ ranks })}
            placeholder="All"
            loading={ranksLoading}
            disabled={disabled}
          />
        </div>

        <div className="flex flex-col gap-1 min-w-0">
          <label className="text-muted-foreground">Fleets</label>
          <MultiSelect
            testId="scenario-crew-fleets"
            options={fleetOptions}
            selected={crew.fleets}
            onChange={(fleets) => patch({ fleets })}
            placeholder="All"
            loading={fleetsLoading}
            disabled={disabled}
          />
        </div>

        <div className="flex flex-col gap-1 min-w-0">
          <label className="text-muted-foreground">Seniority</label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              data-testid="scenario-crew-seniority-min"
              className="h-7 text-xs"
              type="number"
              value={crew.seniority.min ?? ''}
              placeholder="Min"
              disabled={disabled}
              onChange={(e) => patch({ seniority: { ...crew.seniority, min: numericValue(e.target.value) } })}
            />
            <Input
              data-testid="scenario-crew-seniority-max"
              className="h-7 text-xs"
              type="number"
              value={crew.seniority.max ?? ''}
              placeholder="Max"
              disabled={disabled}
              onChange={(e) => patch({ seniority: { ...crew.seniority, max: numericValue(e.target.value) } })}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1 min-w-0">
          <label className="text-muted-foreground">Birthday</label>
          <div className="grid grid-cols-2 gap-2">
            <CompactDateInput
              testId="scenario-crew-birthday-from"
              value={crew.birthday.from}
              placeholder="Min Date"
              disabled={disabled}
              onChange={(from) => patch({ birthday: { ...crew.birthday, from } })}
            />
            <CompactDateInput
              testId="scenario-crew-birthday-to"
              value={crew.birthday.to}
              placeholder="Max Date"
              disabled={disabled}
              onChange={(to) => patch({ birthday: { ...crew.birthday, to } })}
            />
          </div>
        </div>
      </div>

      <div className="mt-2.5 rounded bg-muted/40 px-2 py-1">
        <span className="mr-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Filter:</span>
        <span className="font-mono text-2xs text-foreground/70">{compiled}</span>
      </div>
    </CollapsibleSection>
  )
}
