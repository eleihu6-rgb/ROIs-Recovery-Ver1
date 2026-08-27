import { api } from './api'

export interface PbsBusinessTimeStatus {
  mode: string
  source: 'system' | 'override'
  realNow: string
  businessNow: string
  anchor: string | null
  anchorReal: string | null
  warnings: string[]
}

export type PbsBusinessTimeInput =
  | { action: 'CLEAR' }
  | { action: 'SET'; businessTimeLocal: string }

export const fetchPbsBusinessTimeStatus = async (): Promise<PbsBusinessTimeStatus> => {
  const search = new URLSearchParams({ _ts: String(Date.now()) })
  return api.get(`/api/admin/pbs-business-time?${search.toString()}`) as Promise<PbsBusinessTimeStatus>
}

export const savePbsBusinessTime = async (
  input: PbsBusinessTimeInput,
): Promise<PbsBusinessTimeStatus> =>
  api.put('/api/admin/pbs-business-time', input) as Promise<PbsBusinessTimeStatus>
