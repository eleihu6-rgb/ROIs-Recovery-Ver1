import type { FastifyInstance } from 'fastify'
import { scenarioSchema } from '../../utils/db-schema.js'

export interface MandayDailyDay {
  date: string
  creditMin: number
  blhMin: number
  dpMin: number
}

export interface MandayDailyResult {
  crewId: string
  base: string
  zoneId: string
  days: MandayDailyDay[]
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const isYmd = (value: string): boolean => DATE_RE.test(value)

/**
 * Read per-day credit + blh + dp for one crew in [start, end] (inclusive crew_base_dt).
 * FD vs CC table chosen from crew.division (P → fd, else cc_am).
 */
export async function getCrewMandayDaily(
  fastify: FastifyInstance,
  opts: {
    crewId: string
    start: string
    end: string
    scenarioId?: number
  },
): Promise<MandayDailyResult | null> {
  const { crewId, start, end, scenarioId } = opts

  const meta = await fastify.pgPool.query<{
    crew_id: string
    division: string | null
    base: string | null
    zone_id: string | null
  }>(
    `SELECT c.crew_id, c.division, cb.base, a.zone_id
       FROM crew c
       LEFT JOIN LATERAL (
         SELECT base FROM crew_base
          WHERE crew_id = c.crew_id
          ORDER BY eff_dt DESC NULLS LAST
          LIMIT 1
       ) cb ON true
       LEFT JOIN airport a ON a.airport = cb.base
      WHERE c.crew_id = $1`,
    [crewId],
  )
  if (meta.rows.length === 0) return null

  const row = meta.rows[0]
  const isFd = row.division === 'P'
  const days = scenarioId == null
    ? await queryLiveDays(fastify, crewId, start, end, isFd)
    : await queryScenarioDays(fastify, scenarioId, crewId, start, end, isFd)

  return {
    crewId,
    base: row.base ?? '',
    zoneId: row.zone_id ?? 'UTC',
    days,
  }
}

async function queryLiveDays(
  fastify: FastifyInstance,
  crewId: string,
  start: string,
  end: string,
  isFd: boolean,
): Promise<MandayDailyDay[]> {
  const table = isFd ? 'crew_manday_fd_daily' : 'crew_manday_cc_am_daily'
  const { rows } = await fastify.pgPool.query<{
    crew_base_dt: Date | string
    credit: number | string | null
    blh: number | string | null
    dp: number | string | null
  }>(
    `SELECT crew_base_dt, credit, blh, dp
       FROM ${table}
      WHERE crew_id = $1
        AND crew_base_dt >= $2::date
        AND crew_base_dt <= $3::date
      ORDER BY crew_base_dt`,
    [crewId, start, end],
  )
  return rows.map(mapDay)
}

async function queryScenarioDays(
  fastify: FastifyInstance,
  scenarioId: number,
  crewId: string,
  start: string,
  end: string,
  isFd: boolean,
): Promise<MandayDailyDay[]> {
  const sch = scenarioSchema()
  const table = isFd ? 'crew_manday_fd_daily' : 'crew_manday_cc_am_daily'
  const { rows } = await fastify.pgPool.query<{
    crew_base_dt: Date | string
    credit: number | string | null
    blh: number | string | null
    dp: number | string | null
  }>(
    `SELECT crew_base_dt, credit, blh, dp
       FROM ${sch}.${table}
      WHERE scenario_id = $1
        AND crew_id = $2
        AND crew_base_dt >= $3::date
        AND crew_base_dt <= $4::date
      ORDER BY crew_base_dt`,
    [scenarioId, crewId, start, end],
  )
  return rows.map(mapDay)
}

const mapDay = (r: {
  crew_base_dt: Date | string
  credit: number | string | null
  blh: number | string | null
  dp: number | string | null
}): MandayDailyDay => {
  const date =
    typeof r.crew_base_dt === 'string'
      ? r.crew_base_dt.slice(0, 10)
      : r.crew_base_dt.toISOString().slice(0, 10)
  return {
    date,
    creditMin: Number(r.credit ?? 0),
    blhMin: Number(r.blh ?? 0),
    dpMin: Number(r.dp ?? 0),
  }
}
