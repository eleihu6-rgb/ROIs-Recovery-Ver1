import type { ReactNode } from 'react'
import type { ScenarioDetail, PoFilterParams, RoFilterParams, ToFilterParams } from '@/types'
import { useScenarioStore } from '@/stores/scenario-store'
import { normalizeCrewDivision, normalizePoFilterParams, normalizeRoCrewFilter, normalizeRoPairingFilter } from '@/utils/scenario-filter-params'
import { PoFlightFilter } from './filter/po-flight-filter'
import { RoCrewFilter } from './filter/ro-crew-filter'
import { RoPairingFilter } from './filter/ro-pairing-filter'
import { ToTrainingFilter } from './filter/to-training-filter'

const DEFAULT_RO_PAIRING: RoFilterParams['pairing'] = {
  bases: [],
  fleets: [],
  ranks: [],
  types: [],
  duration: { min: null, max: null },
}

const DEFAULT_TO_TRAINING: ToFilterParams['training'] = {
  courseTypes: [],
  expiryFilter: 'ALL',
  priorities: [],
}

interface ScenarioFilterSectionProps {
  detail: ScenarioDetail
  disabled?: boolean
}

export const ScenarioFilterSection = ({ detail, disabled = false }: ScenarioFilterSectionProps): ReactNode => {
  const patchDraft = useScenarioStore((s) => s.patchDraft)
  const division = normalizeCrewDivision(detail.division)

  if (detail.fileType === 'PO') {
    // Division / Bases live in Basic Info; Scope Filters only edit flight facets.
    // Always normalize so legacy { base } and missing division stay consistent.
    const params: PoFilterParams = normalizePoFilterParams(detail.filterParams)
    return (
      <div className="flex flex-col">
        <PoFlightFilter params={params} onChange={(p) => patchDraft({ filterParams: p })} disabled={disabled} />
      </div>
    )
  }

  if (detail.fileType === 'RO') {
    const raw = (detail.filterParams ?? {}) as Partial<RoFilterParams>
    const params: RoFilterParams = {
      crew: normalizeRoCrewFilter(raw.crew),
      pairing: normalizeRoPairingFilter({ ...DEFAULT_RO_PAIRING, ...(raw.pairing ?? {}) }),
    }
    return (
      <div className="flex flex-col">
        <RoCrewFilter crew={params.crew} division={division} onChange={(crew) => patchDraft({ filterParams: { ...params, crew: normalizeRoCrewFilter(crew) } })} disabled={disabled} />
        <RoPairingFilter pairing={params.pairing} division={division} onChange={(pairing) => patchDraft({ filterParams: { ...params, pairing: normalizeRoPairingFilter(pairing) } })} disabled={disabled} />
      </div>
    )
  }

  if (detail.fileType === 'TO') {
    const raw = (detail.filterParams ?? {}) as Partial<ToFilterParams>
    const params: ToFilterParams = {
      crew: normalizeRoCrewFilter(raw.crew),
      pairing: normalizeRoPairingFilter({ ...DEFAULT_RO_PAIRING, ...(raw.pairing ?? {}) }),
      training: { ...DEFAULT_TO_TRAINING, ...(raw.training ?? {}) },
    }
    return (
      <div className="flex flex-col">
        <RoCrewFilter crew={params.crew} division={division} onChange={(crew) => patchDraft({ filterParams: { ...params, crew: normalizeRoCrewFilter(crew) } })} disabled={disabled} />
        <RoPairingFilter pairing={params.pairing} division={division} onChange={(pairing) => patchDraft({ filterParams: { ...params, pairing: normalizeRoPairingFilter(pairing) } })} disabled={disabled} />
        <ToTrainingFilter training={params.training} onChange={(training) => patchDraft({ filterParams: { ...params, training } })} disabled={disabled} />
      </div>
    )
  }

  return null
}
