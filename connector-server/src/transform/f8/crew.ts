import { TransformPlugin, StandardRecord } from '../base.js'
import { normalizeRank } from './utils.js'

const RANK_PRIORITY: Record<string, number> = { CA: 2, FO: 1 }

interface F8RankRecord {
  rank: string
  effDt: string
  expDt: string
}

interface F8Base {
  base: string
  isPrimary: boolean
}

interface F8Certificate {
  certificate: string
  isValid: boolean
  expDt: string
}

interface F8Crew {
  crewId: number
  firstName: string
  middleName?: string
  lastName: string
  bases: F8Base[]
  ranks: F8RankRecord[]
  certificates: F8Certificate[]
}

const isActive = (effDt: string, expDt: string): boolean => {
  const now = Date.now()
  return new Date(effDt).getTime() <= now && new Date(expDt).getTime() > now
}

export class F8CrewTransform implements TransformPlugin {
  toStandard(raw: unknown): StandardRecord {
    if (!raw || typeof raw !== 'object') {
      throw new Error('F8CrewTransform: invalid input')
    }
    const crew = raw as F8Crew
    if (typeof crew.crewId !== 'number') {
      throw new Error('F8CrewTransform: missing crewId')
    }

    // Determine effective rank (highest priority among active ranks)
    const activeRanks = (crew.ranks ?? [])
      .map(r => ({ ...r, normalized: normalizeRank(r.rank) }))
      .filter(r => isActive(r.effDt, r.expDt) && RANK_PRIORITY[r.normalized] !== undefined)
      .sort((a, b) => (RANK_PRIORITY[b.normalized] ?? 0) - (RANK_PRIORITY[a.normalized] ?? 0))

    const rank = activeRanks[0]?.normalized ?? null

    // Primary base
    const primaryBase = (crew.bases ?? []).find(b => b.isPrimary)?.base ?? crew.bases?.[0]?.base

    // RHS cert: isValid true AND not expired
    const hasRhs = (crew.certificates ?? []).some(
      c => c.certificate === 'RHS' && c.isValid && isActive('2000-01-01T00:00:00Z', c.expDt)
    )

    const crewCode = String(crew.crewId)

    return {
      recordType: 'crew',
      data: {
        crewCode,
        crewName: [crew.firstName, crew.lastName].filter(Boolean).join(' '),
        rank,
        base: primaryBase,
        status: 'active',
        hasRhs,
      },
      metadata: { externalId: crewCode },
    }
  }

  fromStandard(record: StandardRecord): unknown {
    return record.data
  }
}