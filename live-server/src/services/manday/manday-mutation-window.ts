import type { FastifyInstance } from 'fastify'
import { liveSchema } from '../../utils/db-schema.js'

const toCrewBaseLocalDate = (value: Date, zoneId: string): string => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: zoneId,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value)
  } catch {
    return value.toISOString().slice(0, 10)
  }
}

interface ZonePeriod {
  zoneId: string
  effMs: number
  expMs: number | null
  isPrime: boolean
}

const loadCrewZoneIds = async (
  fastify: FastifyInstance,
  crewIds: string[],
): Promise<Map<string, ZonePeriod[]>> => {
  const live = liveSchema()
  const res = await fastify.pgPool.query<{
    crew_id: string
    zone_id: string | null
    eff_dt: Date | string
    exp_dt: Date | string | null
    is_prime_base: number | string | null
  }>(
    `SELECT cb.crew_id, a.zone_id, cb.eff_dt, cb.exp_dt, cb.is_prime_base
       FROM ${live}.crew_base cb
       LEFT JOIN ${live}.airport a ON a.airport = cb.base
      WHERE cb.crew_id = ANY($1)
      ORDER BY cb.crew_id, cb.eff_dt DESC, cb.is_prime_base DESC`,
    [crewIds],
  )
  const result = new Map<string, ZonePeriod[]>()
  for (const row of res.rows) {
    const periods = result.get(row.crew_id) ?? []
    periods.push({
      zoneId: row.zone_id ?? 'UTC',
      effMs: new Date(row.eff_dt).getTime(),
      expMs: row.exp_dt == null ? null : new Date(row.exp_dt).getTime(),
      isPrime: Number(row.is_prime_base ?? 1) === 1,
    })
    result.set(row.crew_id, periods)
  }
  return result
}

export const mandayMutationWindow = async (
  fastify: FastifyInstance,
  crewIds: string[],
  dates: Date[],
  padding: { backDays: number; forwardDays: number },
): Promise<{ startDt: string; endDt: string } | null> => {
  if (!crewIds.length || !dates.length) return null
  const zonePeriods = await loadCrewZoneIds(fastify, crewIds)
  const localDates = crewIds.flatMap((crewId) =>
    dates.map((date) => {
      const atMs = date.getTime()
      const periods = zonePeriods.get(crewId) ?? []
      const effective = periods
        .filter((p) => p.effMs <= atMs && (p.expMs == null || atMs < p.expMs))
        .sort((a, b) => Number(b.isPrime) - Number(a.isPrime) || b.effMs - a.effMs)[0]
      return toCrewBaseLocalDate(date, effective?.zoneId ?? periods[0]?.zoneId ?? 'UTC')
    }),
  )
  const startLocal = localDates.reduce((min, date) => date < min ? date : min, localDates[0])
  const endLocal = localDates.reduce((max, date) => date > max ? date : max, localDates[0])
  const start = new Date(`${startLocal}T00:00:00Z`)
  start.setUTCDate(start.getUTCDate() - padding.backDays)
  const end = new Date(`${endLocal}T00:00:00Z`)
  end.setUTCDate(end.getUTCDate() + padding.forwardDays)
  return {
    startDt: start.toISOString().slice(0, 10),
    endDt: end.toISOString().slice(0, 10),
  }
}
