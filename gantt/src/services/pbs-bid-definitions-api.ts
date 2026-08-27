import { api } from './api'

export type PbsBidDefinitionWeekday = {
  code: string
  name: string
  isoDay: number
}

export type PbsRedeyeDefinitionValue =
  | { available: false }
  | {
      available: true
      startTime: string
      endTime: string
      crossesMidnight: boolean
      version: string
    }

export type PbsWeekendDefinitionValue =
  | { available: false }
  | {
      available: true
      startDayCode: string
      startDayName: string
      startTime: string
      endDayCode: string
      endDayName: string
      endTime: string
      durationMinutes: number
      version: string
    }

export type PbsCreditWindowDefinitionValue =
  | { available: false }
  | { available: true; deltaHours: number; version: string }

export type PbsMinimumBaseLayoverDefinitionValue =
  | { available: false }
  | { available: true; minDuration: string }

export type PbsEfficientFlyingPercentileDefinitionValue =
  | { available: false }
  | { available: true; percentile: number }

export type PbsMinimumTimeBetweenFlightsDefinitionValue =
  | { available: false }
  | { available: true; minimumMinutes: number }

type DefinitionBase = {
  name: string
  displayValue: string
  description: string
  updatedBy: string
  updatedAt: string | null
}

export type PbsBidDefinition =
  | DefinitionBase & { code: 'redeye'; value: PbsRedeyeDefinitionValue }
  | DefinitionBase & { code: 'weekend'; value: PbsWeekendDefinitionValue }
  | DefinitionBase & { code: 'credit-window'; value: PbsCreditWindowDefinitionValue }
  | DefinitionBase & { code: 'minimum-base-layover'; value: PbsMinimumBaseLayoverDefinitionValue }
  | DefinitionBase & { code: 'efficient-flying-percentile'; value: PbsEfficientFlyingPercentileDefinitionValue }
  | DefinitionBase & { code: 'minimum-time-between-flights'; value: PbsMinimumTimeBetweenFlightsDefinitionValue }

export type PbsBidDefinitionsResponse = {
  rows: PbsBidDefinition[]
  weekdays: PbsBidDefinitionWeekday[]
}

export const fetchPbsBidDefinitions = async (): Promise<PbsBidDefinitionsResponse> => {
  const query = new URLSearchParams({ _ts: String(Date.now()) })
  return api.get(`/api/pbs/bid-definitions?${query.toString()}`) as Promise<PbsBidDefinitionsResponse>
}

export const savePbsRedeyeDefinition = async (input: {
  startTime: string
  endTime: string
}): Promise<PbsBidDefinition> =>
  api.patch('/api/pbs/bid-definitions/redeye', input) as Promise<PbsBidDefinition>

export const savePbsWeekendDefinition = async (input: {
  startDayCode: string
  startTime: string
  endDayCode: string
  endTime: string
}): Promise<PbsBidDefinition> =>
  api.patch('/api/pbs/bid-definitions/weekend', input) as Promise<PbsBidDefinition>

export const savePbsCreditWindowDefinition = async (input: {
  deltaHours: number
}): Promise<PbsBidDefinition> =>
  api.patch('/api/pbs/bid-definitions/credit-window', input) as Promise<PbsBidDefinition>

export const savePbsMinimumBaseLayoverDefinition = async (input: {
  minDuration: string
}): Promise<PbsBidDefinition> =>
  api.patch('/api/pbs/bid-definitions/minimum-base-layover', input) as Promise<PbsBidDefinition>

export const savePbsEfficientFlyingPercentileDefinition = async (input: {
  percentile: number
}): Promise<PbsBidDefinition> =>
  api.patch('/api/pbs/bid-definitions/efficient-flying-percentile', input) as Promise<PbsBidDefinition>

export const savePbsMinimumTimeBetweenFlightsDefinition = async (input: {
  minimumMinutes: number
}): Promise<PbsBidDefinition> =>
  api.patch('/api/pbs/bid-definitions/minimum-time-between-flights', input) as Promise<PbsBidDefinition>
