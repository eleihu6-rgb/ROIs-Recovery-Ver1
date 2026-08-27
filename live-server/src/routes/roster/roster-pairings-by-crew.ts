import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { success, fail } from '../../utils/response.js'

interface SegmentRow {
  pairingId: number
  dutySeq: number
  reportUtc: Date | null
  releaseUtc: Date | null
  restAfterMinutes: number | null
  baseUtcOffset: number | null
  fltNum: string
  depArp: string
  arvArp: string
  stdUtc: Date | null
  staUtc: Date | null
  fleetCode: string
}

interface PairingSegment {
  fltNo: string
  depPort: string
  arrPort: string
  stdUtc: string
  staUtc: string
  blockMinutes: number
  isNight: boolean
  fleetCode: string | null
}

interface PairingDuty {
  dutySeq: number
  reportUtc: string
  releaseUtc: string
  restAfterMinutes: number | null
  reportLocal: string | null
  baseUtcOffset: number | null
  segments: PairingSegment[]
}

interface PairingData {
  pairingId: number
  crewBase: string
  duties: PairingDuty[]
}

function computeBlockMinutes(std: Date | null, sta: Date | null): number {
  if (!std || !sta) return 0
  return Math.round((sta.getTime() - std.getTime()) / 60000)
}

function isNightDeparture(std: Date | null): boolean {
  if (!std) return false
  const hour = std.getUTCHours()
  return hour >= 22 || hour < 6
}

export default async function rosterPairingsByCrewRoutes(fastify: FastifyInstance) {
  fastify.post('/roster/pairings/by-crew', async (request, reply) => {
    const body = z.object({
      crewIds: z.array(z.string()).min(1).max(100),
      airline: z.string().length(2),
    }).safeParse(request.body)
    if (!body.success) return fail(reply, 400, body.error.message)

    const { crewIds } = body.data

    const rfResult = await fastify.pgPool.query<{ crewId: string; pairingId: number; base: string }>(
      `SELECT DISTINCT crew_id AS "crewId", pairing_id AS "pairingId", base
       FROM roster_flight
       WHERE crew_id = ANY($1) AND is_deleted = 0 AND pairing_id IS NOT NULL`,
      [crewIds]
    )

    if (rfResult.rows.length === 0) {
      return success(reply, Object.fromEntries(crewIds.map(id => [id, []])))
    }

    const pairingIds = [...new Set(rfResult.rows.map(r => r.pairingId))]

    const psResult = await fastify.pgPool.query<SegmentRow>(
      `SELECT
         pairing_id       AS "pairingId",
         duty_seq         AS "dutySeq",
         duty_sch_str_dt_utc AS "reportUtc",
         duty_sch_end_dt_utc AS "releaseUtc",
         duty_sch_rest_min   AS "restAfterMinutes",
         duty_ref_tz         AS "baseUtcOffset",
         flt_num          AS "fltNum",
         dep_arp          AS "depArp",
         arv_arp          AS "arvArp",
         sch_str_dt_utc   AS "stdUtc",
         sch_end_dt_utc   AS "staUtc",
         fleet_seg        AS "fleetCode"
       FROM pairing_segment
       WHERE pairing_id = ANY($1)
       ORDER BY pairing_id, duty_seq, seg_seq`,
      [pairingIds]
    )

    const crewToPairings = new Map<string, { pairingId: number; base: string }[]>()
    for (const r of rfResult.rows) {
      const arr = crewToPairings.get(r.crewId) ?? []
      arr.push({ pairingId: r.pairingId, base: r.base })
      crewToPairings.set(r.crewId, arr)
    }

    const pairingDutyMap = new Map<number, Map<number, SegmentRow[]>>()
    for (const seg of psResult.rows) {
      let duties = pairingDutyMap.get(seg.pairingId)
      if (!duties) {
        duties = new Map()
        pairingDutyMap.set(seg.pairingId, duties)
      }
      const segs = duties.get(seg.dutySeq) ?? []
      segs.push(seg)
      duties.set(seg.dutySeq, segs)
    }

    const result: Record<string, PairingData[]> = {}
    for (const crewId of crewIds) {
      const pairings = crewToPairings.get(crewId) ?? []
      result[crewId] = pairings.map(({ pairingId, base }) => {
        const duties = pairingDutyMap.get(pairingId) ?? new Map<number, SegmentRow[]>()
        return {
          pairingId,
          crewBase: base ?? '',
          duties: ([...duties.entries()] as [number, SegmentRow[]][])
            .sort(([a], [b]) => a - b)
            .map(([dutySeq, segs]) => {
              const first = segs[0]
              return {
                dutySeq,
                reportUtc: first.reportUtc?.toISOString() ?? '',
                releaseUtc: first.releaseUtc?.toISOString() ?? '',
                restAfterMinutes: first.restAfterMinutes ?? null,
                reportLocal: null,
                baseUtcOffset: first.baseUtcOffset ?? null,
                segments: segs.map(s => ({
                  fltNo: s.fltNum,
                  depPort: s.depArp,
                  arrPort: s.arvArp,
                  stdUtc: s.stdUtc?.toISOString() ?? '',
                  staUtc: s.staUtc?.toISOString() ?? '',
                  blockMinutes: computeBlockMinutes(s.stdUtc, s.staUtc),
                  isNight: isNightDeparture(s.stdUtc),
                  fleetCode: s.fleetCode ?? null,
                })),
              }
            }),
        }
      })
    }

    return success(reply, result)
  })
}
