import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { success, fail } from '../../utils/response.js'
import { env } from '../../config/index.js'
import { asSafeIdentifier } from '../../utils/schema-identifier.js'

const querySchema = z.object({
  rosterPeriodId: z.coerce.number().int().positive(),
  bidContext: z.enum(['Default', 'Current', 'all']).default('all'),
  base:       z.string().optional(),   // comma-separated base codes
  rank:       z.string().optional(),   // comma-separated rank codes
  crewId:     z.string().max(30).optional(),
})

interface PeriodContextRow {
  id: string | number
  roster_period: string
  name: string | null
  pbs_period_code: string | null
  rp_start: string
  rp_end: string
}

export interface BidGroupDetail {
  tier: number
  groupSeq: number
  actionId: number | null
  propertyName: string | null
  operator: string | null
  paramA: string | null
  paramB: string | null
  limitN: number | null
  allOrNothing: number | null
  minimumN: number | null
}

export interface CrewBidTypeRow {
  bidType: string | null
  groupCount: number
  appliedTiers: number[]
  groupDetails: BidGroupDetail[]
}

export interface CrewBidCrewRow {
  crewId: string
  crewName: string
  seniorityNum: number | null
  base: string | null
  rank: string | null
  periodCode: string
  bidContext: string
  bidStatus: string
  totalTiers: number
  submittedAt: string | null
  bidTypes: CrewBidTypeRow[]
}

export default async function crewBidsRoutes(fastify: FastifyInstance) {
  // GET /api/pbs/periods — distinct period codes in pbs_bid
  fastify.get('/periods', async (_request, reply) => {
    const pbs = env.PBS_SCHEMA
    const client = await fastify.pgPool.connect()
    try {
      const result = await client.query(
        `SELECT period_code FROM (
           SELECT DISTINCT period_code,
             SPLIT_PART(period_code, ' ', 2)::int AS yr,
             CASE UPPER(SPLIT_PART(period_code, ' ', 1))
               WHEN 'JAN' THEN 1  WHEN 'FEB' THEN 2  WHEN 'MAR' THEN 3
               WHEN 'APR' THEN 4  WHEN 'MAY' THEN 5  WHEN 'JUN' THEN 6
               WHEN 'JUL' THEN 7  WHEN 'AUG' THEN 8  WHEN 'SEP' THEN 9
               WHEN 'OCT' THEN 10 WHEN 'NOV' THEN 11 WHEN 'DEC' THEN 12
               ELSE 0
             END AS mo
           FROM ${pbs}.pbs_bid
         ) t
         ORDER BY yr DESC, mo DESC`,
      )
      return success(reply, result.rows.map((r: { period_code: string }) => ({ periodCode: r.period_code })))
    } catch (err) {
      fastify.log.error({ err }, 'Failed to query period options')
      return fail(reply, 500, 'Failed to load period options')
    } finally {
      client.release()
    }
  })

  // GET /api/pbs/crew-bids
  fastify.get('/crew-bids', async (request, reply) => {
    const parsed = querySchema.safeParse(request.query)
    if (!parsed.success) {
      return fail(reply, 400, 'Invalid query parameters')
    }

    const { rosterPeriodId, bidContext, base, rank, crewId } = parsed.data
    const bases = base ? base.split(',').map((v) => v.trim()).filter(Boolean) : []
    const ranks = rank ? rank.split(',').map((v) => v.trim()).filter(Boolean) : []
    const pbs = asSafeIdentifier(env.PBS_SCHEMA)
    const liveSchema = asSafeIdentifier(request.authUser?.schema ?? env.LIVE_SCHEMA)

    const client = await fastify.pgPool.connect()
    try {
      const periodResult = await client.query<PeriodContextRow>(
        `select id, roster_period, name, pbs_period_code,
                rp_start::date::text as rp_start,
                rp_end::date::text as rp_end
         from ${liveSchema}.roster_period
         where id = $1::bigint`,
        [rosterPeriodId],
      )
      const period = periodResult.rows[0]
      if (!period) {
        return fail(reply, 404, 'Roster period was not found')
      }

      const conditions: string[] = ['b.roster_period_id = $1::bigint']
      const params: unknown[] = [rosterPeriodId, period.rp_start]
      let idx = 3

      if (bidContext !== 'all') {
        conditions.push(`b.bid_context = $${idx}`)
        params.push(bidContext)
        idx++
      }
      if (bases.length > 0) {
        conditions.push(`cb.base = ANY($${idx}::text[])`)
        params.push(bases)
        idx++
      }
      if (ranks.length > 0) {
        conditions.push(`cr.rank = ANY($${idx}::text[])`)
        params.push(ranks)
        idx++
      }
      if (crewId) {
        conditions.push(`b.crew_id ILIKE $${idx}`)
        params.push(`%${crewId}%`)
        idx++
      }

      const sql = `
        SELECT
          b.id                                         AS bid_id,
          b.crew_id,
          b.period_code,
          b.bid_context,
          b.status                                     AS bid_status,
          b.total_tiers,
          b.submitted_at,
          COALESCE(
            NULLIF(TRIM(CONCAT(
              c.first_name, ' ',
              COALESCE(c.middle_name || ' ', ''),
              c.last_name
            )), ''),
            b.crew_id
          )                                            AS crew_name,
          c.seniority_num,
          cb.base,
          cr.rank,
          g.bid_type,
          COUNT(DISTINCT g.id)::int                    AS group_count,
          ARRAY_AGG(DISTINCT t.tier ORDER BY t.tier)
              FILTER (WHERE t.tier IS NOT NULL)        AS applied_tiers,
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'tier',         t.tier,
              'groupSeq',     g.group_seq,
              'actionId',     g.action_id,
              'propertyName', p.property_name,
              'operator',     g.operator,
              'paramA',       g.param_a,
              'paramB',       g.param_b,
              'limitN',       g.limit_n,
              'allOrNothing', g.all_or_nothing,
              'minimumN',     g.minimum_n
            ) ORDER BY t.tier, g.group_seq
          ) FILTER (WHERE g.id IS NOT NULL)           AS group_details
        FROM ${pbs}.pbs_bid b
        LEFT JOIN ${liveSchema}.crew c ON c.crew_id = b.crew_id
        LEFT JOIN LATERAL (
          SELECT crew_base.base
          FROM ${liveSchema}.crew_base crew_base
          WHERE crew_base.crew_id = b.crew_id
            AND crew_base.eff_dt::date <= $2::date
            AND (crew_base.exp_dt IS NULL OR crew_base.exp_dt::date >= $2::date)
          ORDER BY crew_base.is_prime_base DESC NULLS LAST,
                   crew_base.eff_dt DESC NULLS LAST,
                   crew_base.id DESC
          LIMIT 1
        ) cb ON TRUE
        LEFT JOIN LATERAL (
          SELECT crew_rank.rank
          FROM ${liveSchema}.crew_rank crew_rank
          WHERE crew_rank.crew_id = b.crew_id
            AND crew_rank.eff_dt::date <= $2::date
            AND (crew_rank.exp_dt IS NULL OR crew_rank.exp_dt::date >= $2::date)
          ORDER BY crew_rank.eff_dt DESC NULLS LAST,
                   crew_rank.id DESC
          LIMIT 1
        ) cr ON TRUE
        LEFT JOIN ${pbs}.pbs_bid_group   g ON g.bid_id   = b.id
        LEFT JOIN ${pbs}.pbs_bid_tier    t ON t.id       = g.tier_id AND t.is_active = 1
        LEFT JOIN ${pbs}.pbs_bid_property p ON p.id      = g.property_definition_id
        WHERE ${conditions.join(' AND ')}
        GROUP BY
          b.id, b.crew_id, b.period_code, b.bid_context,
          b.status, b.total_tiers, b.submitted_at,
          c.first_name, c.middle_name, c.last_name, c.seniority_num,
          cb.base, cr.rank, g.bid_type
        ORDER BY
          c.seniority_num ASC NULLS LAST,
          b.crew_id ASC,
          CASE g.bid_type
            WHEN 'Line'    THEN 1
            WHEN 'DaysOff' THEN 2
            WHEN 'Reserve' THEN 3
            WHEN 'Pairing' THEN 4
            ELSE 5
          END NULLS LAST
      `

      const result = await client.query(sql, params)

      const crewMap = new Map<string, CrewBidCrewRow>()

      for (const row of result.rows) {
        const key = `${row.crew_id}::${row.bid_context}`
        if (!crewMap.has(key)) {
          crewMap.set(key, {
            crewId:       row.crew_id,
            crewName:     row.crew_name ?? row.crew_id,
            seniorityNum: row.seniority_num != null ? Number(row.seniority_num) : null,
            base:         row.base  ?? null,
            rank:         row.rank  ?? null,
            periodCode:  row.period_code,
            bidContext:  row.bid_context,
            bidStatus:   row.bid_status,
            totalTiers:  Number(row.total_tiers),
            submittedAt: row.submitted_at ? String(row.submitted_at) : null,
            bidTypes:    [],
          })
        }
        if (row.bid_type !== null && row.bid_type !== undefined) {
          crewMap.get(key)!.bidTypes.push({
            bidType:      row.bid_type,
            groupCount:   Number(row.group_count),
            appliedTiers: row.applied_tiers ?? [],
            groupDetails: row.group_details ?? [],
          })
        }
      }

      const rows = Array.from(crewMap.values())

      // For legacy bids that stored numeric pairing DB ids in paramA, resolve them
      // to human-readable labels (e.g. "11186" → "M4959"). New bids already store
      // labels directly, so only numeric tokens are looked up.
      const numericPairingIds = new Set<number>()
      for (const crew of rows) {
        for (const bidType of crew.bidTypes) {
          for (const detail of bidType.groupDetails) {
            if (detail.propertyName === 'Pairing Number' && detail.operator === 'In' && detail.paramA) {
              for (const token of detail.paramA.split(',')) {
                const trimmed = token.trim()
                if (/^\d+$/.test(trimmed)) numericPairingIds.add(Number(trimmed))
              }
            }
          }
        }
      }
      if (numericPairingIds.size > 0) {
        const labelRows = await client.query<{ id: string; label: string }>(
          `SELECT id::text,
                  coalesce(
                    nullif(trim(case
                      when upper(coalesce(interface_id, '')) ~ '^[A-Z]+[A-Z0-9]*[0-9][A-Z0-9]*$'
                        then interface_id else null end), ''),
                    nullif(trim(pairing_label), ''),
                    id::text
                  ) AS label
           FROM ${liveSchema}.pairing WHERE id = ANY($1::bigint[]) AND is_deleted = 0`,
          [Array.from(numericPairingIds)],
        )
        const labelMap = new Map(labelRows.rows.map((r) => [r.id, r.label]))
        for (const crew of rows) {
          for (const bidType of crew.bidTypes) {
            for (const detail of bidType.groupDetails) {
              if (detail.propertyName === 'Pairing Number' && detail.operator === 'In' && detail.paramA) {
                detail.paramA = detail.paramA
                  .split(',')
                  .map((token) => labelMap.get(token.trim()) ?? token.trim())
                  .join(',')
              }
            }
          }
        }
      }

      return success(reply, { rows, total: rows.length })
    } catch (err) {
      fastify.log.error({ err }, 'Failed to query crew bids')
      return fail(reply, 500, 'Failed to load crew bids data')
    } finally {
      client.release()
    }
  })
}
