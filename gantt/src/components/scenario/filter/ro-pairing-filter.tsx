import { useEffect, type ReactNode } from 'react'
import { Input } from '@rois/ui'
import type { RoFilterParams } from '@/types'
import { MultiSelect } from '../multi-select'
import { useBaseOptions } from './use-base-options'
import { useFleetOptions } from './use-fleet-options'
import { useRankOptions } from './use-rank-options'
import { usePairingTypeOptions } from './use-pairing-type-options'
import { CollapsibleSection } from './collapsible-section'

interface RoPairingFilterProps {
  pairing: RoFilterParams['pairing']
  division: string
  onChange: (pairing: RoFilterParams['pairing']) => void
  disabled?: boolean
}

/** Compact summary string shown below the interactive controls */
const compilePairingFilter = (pairing: RoFilterParams['pairing']): string => {
  const bases   = pairing.bases.length  > 0 ? pairing.bases.join(',')  : '*'
  const ranks   = pairing.ranks.length  > 0 ? pairing.ranks.join(',')  : '*'
  const fleets  = pairing.fleets.length > 0 ? pairing.fleets.join(',') : '*'
  const types   = pairing.types.length  > 0 ? pairing.types.join(',')  : '*'
  const duration = pairing.duration.min != null || pairing.duration.max != null
    ? `${pairing.duration.min ?? '*'}-${pairing.duration.max ?? '*'}`
    : '*'
  return `${bases} / ${ranks} / ${fleets} / ${types} / ${duration}`
}

const numericValue = (value: string): number | null => {
  if (value.trim() === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

export const RoPairingFilter = ({ pairing, division, onChange, disabled = false }: RoPairingFilterProps): ReactNode => {
  const patch = (partial: Partial<RoFilterParams['pairing']>): void => onChange({ ...pairing, ...partial })
  const { options: baseOptions, loading: basesLoading } = useBaseOptions()
  const { options: rankOptions, loading: ranksLoading } = useRankOptions(division)
  const { options: fleetOptions, loading: fleetsLoading } = useFleetOptions()
  const { options: typeOptions, loading: typesLoading } = usePairingTypeOptions()

  // Count non-default scope selections.
  const badgeCount =
    pairing.bases.length +
    pairing.ranks.length +
    pairing.fleets.length +
    pairing.types.length +
    (pairing.duration.min != null || pairing.duration.max != null ? 1 : 0)

  const compiled = compilePairingFilter(pairing)

  useEffect(() => {
    if (ranksLoading || pairing.ranks.length === 0) return
    const validRanks = new Set(rankOptions.map((option) => option.value))
    const nextRanks = pairing.ranks.filter((rank) => validRanks.has(rank))
    if (nextRanks.length !== pairing.ranks.length) patch({ ranks: nextRanks })
  }, [pairing.ranks, rankOptions, ranksLoading])

  return (
    <CollapsibleSection title="Pairing Filters" badgeCount={badgeCount}>
      <div className="grid grid-cols-1 gap-x-2 gap-y-3 text-xs @[420px]:grid-cols-2 @[640px]:grid-cols-3 @[700px]:grid-cols-[minmax(5rem,0.7fr)_minmax(5rem,0.7fr)_minmax(5rem,0.7fr)_minmax(7rem,0.85fr)_minmax(9rem,1.15fr)]">
        <div className="flex flex-col gap-1 min-w-0">
          <label className="text-muted-foreground">Bases</label>
          <MultiSelect
            testId="scenario-pairing-bases"
            options={baseOptions}
            selected={pairing.bases}
            onChange={(bases) => patch({ bases })}
            placeholder="All"
            loading={basesLoading}
            disabled={disabled}
          />
        </div>

        <div className="flex flex-col gap-1 min-w-0">
          <label className="text-muted-foreground">Ranks</label>
          <MultiSelect
            testId="scenario-pairing-ranks"
            options={rankOptions}
            selected={pairing.ranks}
            onChange={(ranks) => patch({ ranks })}
            placeholder="All"
            loading={ranksLoading}
            disabled={disabled}
          />
        </div>

        <div className="flex flex-col gap-1 min-w-0">
          <label className="text-muted-foreground">Fleets</label>
          <MultiSelect
            testId="scenario-pairing-fleets"
            options={fleetOptions}
            selected={pairing.fleets}
            onChange={(fleets) => patch({ fleets })}
            placeholder="All"
            loading={fleetsLoading}
            disabled={disabled}
          />
        </div>

        <div className="flex flex-col gap-1 min-w-0">
          <label className="text-muted-foreground">Type</label>
          <MultiSelect
            testId="scenario-pairing-types"
            options={typeOptions}
            selected={pairing.types}
            onChange={(types) => patch({ types })}
            placeholder="All types"
            loading={typesLoading}
            disabled={disabled}
          />
        </div>

        <div className="flex flex-col gap-1 min-w-0">
          <label className="text-muted-foreground">Duration (days)</label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              data-testid="scenario-pairing-duration-min"
              className="h-7 text-xs"
              type="number"
              value={pairing.duration.min ?? ''}
              placeholder="Min"
              disabled={disabled}
              onChange={(e) => patch({ duration: { ...pairing.duration, min: numericValue(e.target.value) } })}
            />
            <Input
              data-testid="scenario-pairing-duration-max"
              className="h-7 text-xs"
              type="number"
              value={pairing.duration.max ?? ''}
              placeholder="Max"
              disabled={disabled}
              onChange={(e) => patch({ duration: { ...pairing.duration, max: numericValue(e.target.value) } })}
            />
          </div>
        </div>
      </div>

      {/* 2nd-level: compiled filter definition */}
      <div className="mt-2.5 rounded bg-muted/40 px-2 py-1">
        <span className="mr-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Filter:</span>
        <span className="font-mono text-2xs text-foreground/70">{compiled}</span>
      </div>
    </CollapsibleSection>
  )
}
