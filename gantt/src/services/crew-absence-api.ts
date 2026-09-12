import { api } from './api'

/** Crew absence record (crew recovery story 101) — mirrors live-server CrewAbsenceDto. */
export interface CrewAbsence {
  id: number
  airline: string
  crewId: string
  crewName: string | null
  absenceType: string
  assignment: string
  fromDate: string
  toDate: string
  base: string
  note: string
  status: 'active' | 'cancelled' | string
  source: string
  removedPairingIds: number[]
  createdAt: string
}

export interface CrewAbsenceQuery {
  crewId?: string
  status?: 'active' | 'cancelled'
  fromDate?: string
  toDate?: string
}

const base = '/api/absence'

export const crewAbsenceApi = {
  list: (query: CrewAbsenceQuery = {}): Promise<CrewAbsence[]> => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value) params.set(key, value)
    }
    const qs = params.toString()
    return api.get(`${base}${qs ? `?${qs}` : ''}`) as Promise<CrewAbsence[]>
  },
}
