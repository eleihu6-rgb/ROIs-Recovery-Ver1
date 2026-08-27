import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import type { FastifyInstance } from 'fastify'
import { crewStatsService } from '../crew/crew-stats-service.js'
import type {
  ScenarioGanttData,
  ScenarioMonthStats,
} from './scenario-gantt-service.js'

export type { ScenarioMonthStats }

export async function loadLiveMandayStatsForScenario(
  fastify: FastifyInstance,
  crewIds: string[],
  rosterPeriod: string,
): Promise<Record<string, Record<string, ScenarioMonthStats>>> {
  const scopedCrewIds = [...new Set(crewIds.filter(Boolean))]
  if (scopedCrewIds.length === 0 || !/^\d{4}RP\d{2}$/.test(rosterPeriod)) return {}

  const liveStats = await crewStatsService.getStats(fastify, scopedCrewIds, rosterPeriod)
  const out: Record<string, Record<string, ScenarioMonthStats>> = {}
  for (const [crewId, stats] of Object.entries(liveStats)) {
    out[crewId] = {
      [rosterPeriod]: {
        credit: stats.mcred,
        dayOffCount: stats.mdo,
        alCount: stats.mal,
        leaveCount: stats.mal,
        ybh: stats.ybh,
        mbh: stats.mbh,
        mcred: stats.mcred,
        yal: stats.yal,
        mal: stats.mal,
        ydo: stats.ydo,
        mdo: stats.mdo,
      },
    }
  }
  return out
}

/**
 * Compute per-crew, per-month manday stats from scenario optimization data.
 *
 * Mirrors the logic of recalcMandayCredit but operates on in-memory scenario
 * data (pairingSegments from input.gz, assignments + groundItems from output.gz)
 * instead of live roster_flight rows.
 *
 * Credit: deduplicated per (pairingId, dutySeq) — MAX(dutyActCreditedMinutes)
 *   per duty, summed per local crew-base date.
 * Flags: DO/VAC/ILL assignments from groundItems, one flag per local date.
 * Date conversion: duty UTC → local via crew's effective base airport timezone.
 */
export async function computeScenarioCrewStats(
  db: ReturnType<typeof drizzle>,
  data: ScenarioGanttData,
): Promise<Record<string, Record<string, ScenarioMonthStats>>> {
  const { crew, assignments, pairingSegments, groundItems } = data

  if (crew.length === 0 && assignments.length === 0 && groundItems.length === 0) return {}

  // ── 1. Load airport timezones for all crew bases ─────────────────────────
  const bases = [...new Set(crew.map((c) => c.base).filter(Boolean))]
  const tzMap = new Map<string, string>()

  if (bases.length > 0) {
    const baseList = sql.join(bases.map((b) => sql`${b}`), sql`, `)
    const rows = await db.execute<{ airport: string; zone_id: string }>(sql`
      SELECT airport, zone_id FROM airport WHERE airport IN (${baseList})
    `)
    for (const r of rows.rows) {
      if (r.zone_id) tzMap.set(r.airport, r.zone_id)
    }
  }

  // ── 2. Build crew lookup: crewId → { base, zoneId, division } ──────────
  const crewMap = new Map<string, { zoneId: string; division: string }>(
    crew.map((c) => [
      c.crewId,
      {
        zoneId: tzMap.get(c.base) ?? 'UTC',
        division: c.division,
      },
    ]),
  )

  // ── 3. Build pairing-duty → max credit + duty UTC ────────────────────────
  // Key: `${pairingId}:${dutySeq}` → { maxCredit, dutyUtc (ISO) }
  const dutyMap = new Map<string, { maxCredit: number; dutyUtc: string }>()
  for (const seg of pairingSegments) {
    const key = `${seg.pairingId}:${seg.dutySeq}`
    const credit = seg.dutyActCreditedMinutes ?? 0
    const dutyUtc = seg.dutySchStrDtUtc
    const existing = dutyMap.get(key)
    if (!existing || credit > existing.maxCredit) {
      dutyMap.set(key, { maxCredit: credit, dutyUtc })
    }
  }

  // ── 4. Accumulate daily credit from pairing assignments ──────────────────
  // Key: `${crewId}|${localDate}` → running credit total
  const dailyCredit = new Map<string, number>()

  // Build pairing → set-of-dutySeq
  const pairingDuties = new Map<number, Set<number>>()
  for (const seg of pairingSegments) {
    const s = pairingDuties.get(seg.pairingId) ?? new Set()
    s.add(seg.dutySeq)
    pairingDuties.set(seg.pairingId, s)
  }

  for (const { crewId, pairingId } of assignments) {
    const meta = crewMap.get(crewId)
    if (!meta) continue
    const duties = pairingDuties.get(pairingId)
    if (!duties) continue

    for (const dutySeq of duties) {
      const duty = dutyMap.get(`${pairingId}:${dutySeq}`)
      if (!duty || !duty.dutyUtc) continue
      const localDate = toLocalDate(duty.dutyUtc, meta.zoneId)
      const k = `${crewId}|${localDate}`
      dailyCredit.set(k, (dailyCredit.get(k) ?? 0) + duty.maxCredit)
    }
  }

  // ── 5. Supplement ground item credit from DB when input.gz lacks roster_flight ─
  // New input.gz files (built by buildRoInputGz) include ## roster_flight with
  // act_credited_minutes, so groundItems already carry actCreditedMinutes for PA tasks.
  // For older stored snapshots that pre-date that section, query the DB as a fallback.
  const leadin = groundItems.filter((g) => g.source === 'PA' && g.actCreditedMinutes == null)
  const supplementCredit = new Map<string, number>() // `${crewId}|${schStrDtUtc}` → max credit
  if (leadin.length > 0) {
    const pairs = leadin.map((g) => sql`(${g.crewId}, ${g.schStrDtUtc}::timestamptz)`)
    const rows = await db.execute<{ crew_id: string; sch_str_dt_utc: string; max_credit: string }>(
      sql`SELECT crew_id, sch_str_dt_utc,
            MAX(act_credited_minutes) AS max_credit
          FROM roster_flight
          WHERE pairing_id IS NULL
            AND is_deleted = 0
            AND (crew_id, sch_str_dt_utc) IN (${sql.join(pairs, sql`, `)})
          GROUP BY crew_id, sch_str_dt_utc`
    )
    for (const r of rows.rows) {
      if (r.max_credit == null) continue
      const num = Number(r.max_credit)
      if (!Number.isFinite(num) || num <= 0) continue
      // Normalize timestamp to first 16 chars (YYYY-MM-DDTHH:MM) to match ground item format
      const ts = String(r.sch_str_dt_utc).replace(' ', 'T').slice(0, 16)
      supplementCredit.set(`${r.crew_id}|${ts}`, num)
    }
  }

  // ── 6. Accumulate daily flags + credit from ground items ─────────────────
  // Key: `${crewId}|${localDate}` → flags
  const dailyFlags = new Map<string, { do: boolean; vac: boolean; ill: boolean }>()

  for (const item of groundItems) {
    const { crewId, assignment, schStrDtUtc, source } = item
    if (!assignment || !schStrDtUtc) continue

    const meta = crewMap.get(crewId)
    const localDate = toLocalDate(schStrDtUtc, meta?.zoneId ?? 'UTC')
    const k = `${crewId}|${localDate}`

    // Credit: prefer actCreditedMinutes from ground item, fall back to DB supplement.
    // Only PA tasks have credit (optimizer-assigned source='CR' items don't have their
    // credit tracked per-row, only via pairing dutyActCreditedMinutes in step 4).
    // Normalize timestamp to YYYY-MM-DDTHH:MM to match the supplementCredit key format
    const schStrNorm = schStrDtUtc.replace(' ', 'T').slice(0, 16)
    const credit =
      item.actCreditedMinutes != null
        ? item.actCreditedMinutes
        : source === 'PA'
          ? (supplementCredit.get(`${crewId}|${schStrNorm}`) ?? 0)
          : 0
    if (credit > 0) {
      dailyCredit.set(k, (dailyCredit.get(k) ?? 0) + credit)
    }

    // Track DO/VAC/ILL flags for day-off/leave counts
    const asgn = assignment.toUpperCase()
    if (asgn === 'DO' || asgn === 'VAC' || asgn === 'ILL') {
      const prev = dailyFlags.get(k) ?? { do: false, vac: false, ill: false }
      dailyFlags.set(k, {
        do:  prev.do  || asgn === 'DO',
        vac: prev.vac || asgn === 'VAC',
        ill: prev.ill || asgn === 'ILL',
      })
    }
  }

  // ── 6. Resolve RP period for each local date (Live parity: manday stats are keyed by
  // ──    roster period, not calendar month). Dates outside any RP fall back to YYYY-MM.
  const localDates = new Set<string>()
  for (const k of dailyCredit.keys()) { const d = k.split('|')[1]; if (d) localDates.add(d) }
  for (const k of dailyFlags.keys())  { const d = k.split('|')[1]; if (d) localDates.add(d) }
  const rpByDate = new Map<string, string>()
  if (localDates.size > 0) {
    const sorted = [...localDates].sort()
    const rpRows = await db.execute<{ roster_period: string; rp_start: string; rp_end: string }>(sql`
      SELECT roster_period, to_char(rp_start, 'YYYY-MM-DD') AS rp_start,
             to_char(rp_end, 'YYYY-MM-DD') AS rp_end
        FROM roster_period
       WHERE rp_start::date <= ${sorted[sorted.length - 1]}
         AND rp_end::date   >= ${sorted[0]}
    `)
    for (const d of localDates) {
      const rp = rpRows.rows.find((r) => d >= r.rp_start && d <= r.rp_end)?.roster_period
      if (rp) rpByDate.set(d, rp)
    }
  }
  const periodFor = (localDate: string): string => rpByDate.get(localDate) ?? localDate.slice(0, 7)

  // ── 7. Roll up to RP-period stats ────────────────────────────────────────
  const result: Record<string, Record<string, ScenarioMonthStats>> = {}

  const ensurePeriod = (crewId: string, period: string): ScenarioMonthStats => {
    result[crewId] ??= {}
    result[crewId][period] ??= { credit: 0, dayOffCount: 0, alCount: 0, leaveCount: 0 }
    return result[crewId][period]
  }

  for (const [key, credit] of dailyCredit) {
    const [crewId, localDate] = key.split('|')
    if (!crewId || !localDate) continue
    const stats = ensurePeriod(crewId, periodFor(localDate))
    stats.credit += credit
  }

  for (const [key, flags] of dailyFlags) {
    const [crewId, localDate] = key.split('|')
    if (!crewId || !localDate) continue
    const stats = ensurePeriod(crewId, periodFor(localDate))
    if (flags.do)  stats.dayOffCount++
    if (flags.vac) stats.alCount++
    if (flags.ill) stats.leaveCount++
  }

  return result
}

/** Convert an ISO UTC timestamp to a local date string (YYYY-MM-DD) using an IANA timezone. */
function toLocalDate(utcIso: string, zoneId: string): string {
  try {
    const d = new Date(utcIso)
    // Intl.DateTimeFormat gives a locale-aware local date in the target timezone
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zoneId,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d).split('-') // en-CA gives YYYY-MM-DD
    return parts.join('-')
  } catch {
    // Fallback to UTC date if timezone is invalid
    return utcIso.slice(0, 10)
  }
}
