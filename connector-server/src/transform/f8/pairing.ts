import { TransformPlugin, StandardRecord } from '../base.js'
import { normalizeRank } from './utils.js'

interface F8PairingComposition {
  actingRank: string
  planValue: number
}

interface F8Pairing {
  pairingId: string
  pairingDt: string
  label?: string
  base?: string
  fleet?: string
  durationDays?: number
  pairingCompositions?: F8PairingComposition[]
}

export class F8PairingTransform implements TransformPlugin {
  toStandard(raw: unknown): StandardRecord {
    if (!raw || typeof raw !== 'object') {
      throw new Error('F8PairingTransform: invalid input')
    }
    const p = raw as F8Pairing
    if (!p.pairingId) {
      throw new Error('F8PairingTransform: missing pairingId')
    }

    // pairingDt may be "2026-02-23T00:00:00Z" or "2026-02-23 00:00:00" — extract date part
    const pairingDate = p.pairingDt?.slice(0, 10) ?? ''

    const compositions = (p.pairingCompositions ?? []).map(c => ({
      rank: normalizeRank(c.actingRank),
      planValue: c.planValue,
    }))

    return {
      recordType: 'pairing',
      data: {
        pairingId: String(p.pairingId),
        pairingDate,
        label: p.label,
        base: p.base,
        fleet: p.fleet,
        durationDays: p.durationDays,
        compositions,
      },
      metadata: { externalId: String(p.pairingId) },
    }
  }

  fromStandard(record: StandardRecord): unknown {
    return record.data
  }
}