import { eq, and, asc, inArray, or, isNull, notInArray } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { pairing } from '../../models/pairing/pairing.js'
import { pairingSegment } from '../../models/pairing/pairing-segment.js'
import { pairingComposition } from '../../models/pairing/pairing-composition.js'
import { flight as flightTable } from '../../models/flight/flight.js'
import { rosterFlight } from '../../models/roster/roster-flight.js'
import { auditCreate } from '../../utils/audit.js'
import { invalidate, invalidatePattern } from '../../utils/cache.js'
import { notDeleted } from '../../utils/db.js'
import { refreshPairingTafb } from './pairing-tafb-service.js'
import { computeDutyFdpMin } from './pairing-fdp.js'
import { computeDutyCreditMin } from './pairing-credit.js'
import { isRoundtripFlightCancelled, roundtripError, toRoundtripFlight, validateRotation, type RoundtripScope } from './roundtrip-chooser.js'

const CACHE_PREFIX = 'pairing'

// ─── Phase-1 pairing-build rules (temp constants) ────────────────────────────
// TODO(param): these business constants should migrate to the `dictionary` table
// (see CLAUDE.md §参数化). They are centralised here so the move is a one-file change.
export const CHECKIN_MIN = 120 // check-in: brief starts 120m (2h) before first departure (Ryan 2026-09-09; aligns with the "check-in (dep−2h)" duty-period convention)
export const CHECKOUT_MIN = 0 // check-out: 0 buffer for duty accounting (duty ends at arrival)
export const DEBRIEF_MIN = 15 // debrief/dropoff timestamps sit 15m after last arrival (F8 render convention)
export const REST_FLOOR_MIN = 720 // post-duty rest floor / minimum rest: 12h. Also the duty boundary: a new duty only begins after a real rest of at least this long.
export const MAX_DUTY_BLOCK_MIN = 480 // max total block for a duty with MORE THAN ONE segment: 8h (single-seg long-haul exempt — augmented crew). A VALIDATION rule, never a duty-splitter (see planDuties).
const DIVISION_FLIGHT_CREW = 'P' // composition division for flight crew (CA/FO)

/** Airline → home base. EK returns to DXB, ET to ADD. */
const AIRLINE_HOME_BASE: Record<string, string> = { EK: 'DXB', ET: 'ADD' }

/**
 * Invalidate every cache key a single pairing owns, mirroring pairing-service mutators:
 * the per-id detail (`pairing:<id>`) that getDetail reads, its composition/crew derivatives,
 * and the whole list namespace. Without the per-id key, getDetail replays stale segments.
 */
const invalidatePairing = async (redis: FastifyInstance['redis'], pairingId: number): Promise<void> => {
  await invalidate(
    redis,
    `${CACHE_PREFIX}:${pairingId}`,
    `${CACHE_PREFIX}:comp:${pairingId}`,
    `${CACHE_PREFIX}:crewids:${pairingId}`,
    `${CACHE_PREFIX}:crewdetail:${pairingId}`,
  )
  await invalidatePattern(redis, `${CACHE_PREFIX}:list:*`)
}

type FlightRow = typeof flightTable.$inferSelect

/** B737 family (738/73W/7M8/737…) is narrow-body → 1CA+1FO; everything else is wide → 2CA+2FO. */
const isNarrowBody = (fleet: string): boolean => /^73/.test(fleet) || /7M/.test(fleet)

/** Flight-crew composition for a fleet: narrow → CA1/FO1, wide → CA2/FO2. */
const bodyComposition = (fleet: string): { rank: string; plan: number }[] => {
  const n = isNarrowBody(fleet) ? 1 : 2
  return [{ rank: 'CA', plan: n }, { rank: 'FO', plan: n }]
}

const homeBaseFor = (airline: string, fallback: string): string => AIRLINE_HOME_BASE[airline] ?? fallback

/** Rule 2 — one pairing must not mix airlines or fleets (shared by build + legacy create/add paths). */
export const assertHomogeneousFlights = (flights: ReadonlyArray<{ airline: string; fleet: string }>): void => {
  if (flights.length === 0) return
  const airlines = new Set(flights.map((f) => f.airline))
  if (airlines.size > 1) throw new Error(`Cannot mix airlines in one pairing: ${[...airlines].join(', ')}`)
  const fleets = new Set(flights.map((f) => f.fleet))
  if (fleets.size > 1) throw new Error(`Cannot mix fleets in one pairing: ${[...fleets].join(', ')}`)
}

export const minutesBetween = (a: Date, b: Date): number => (b.getTime() - a.getTime()) / 60000
export const addMinutes = (d: Date, min: number): Date => new Date(d.getTime() + min * 60000)

/** Rust `calculateDutyFdp` minutes for one planned duty (NULL when the binary is missing). */
export const dutySchFdpMinForDuty = (duty: FlightRow[], rules?: RoundtripScope['rules']): number | null => {
  if (duty.length === 0) return null
  const dutyFirst = duty[0]
  const dutyLast = duty[duty.length - 1]
  return computeDutyFdpMin({
    assignmentGroup: 'FLY',
    segments: duty.map((flt) => ({
      dbId: flt.id,
      assignment: flt.flightAssignment ?? 'FLY',
      startAct: flt.actDepDtUtc ?? flt.schDepDtUtc,
      endAct: flt.actArvDtUtc ?? flt.schArvDtUtc,
      startSch: flt.schDepDtUtc,
      endSch: flt.schArvDtUtc,
      dep: flt.depArp,
      arr: flt.arvArp,
      fleet: flt.fleet,
    })),
    briefStart: addMinutes(dutyFirst.schDepDtUtc, -(rules?.checkinMin ?? CHECKIN_MIN)),
    briefEnd: dutyFirst.schDepDtUtc,
    debriefStart: dutyLast.schArvDtUtc,
    debriefEnd: addMinutes(dutyLast.schArvDtUtc, rules?.debriefMin ?? DEBRIEF_MIN),
  })
}

/**
 * Split flights (already sorted by scheduled departure) into duties.
 *
 * A duty is a continuous run of flights separated only by short ground turns; a NEW duty
 * begins ONLY after a real rest — a ground gap of at least the defined minimum rest
 * (REST_FLOOR_MIN = 12h). A shorter sit stays inside ONE duty (one check-in), even a
 * multi-hour hub connection or a same-flight-number tag stop (e.g. ET861 ADD-BZV-PNR-ADD's
 * 60-min turn at PNR).
 *
 * The 8h block cap and station continuity are duty CONSTRAINTS, not duty-splitters — an
 * over-block or discontinuous duty is a legality violation surfaced downstream ("build
 * as-is, surface violations"). They must NEVER manufacture a duty boundary here, because a
 * boundary stamps a max(12h, DP) post-duty rest (see dutyRestMin), and stamping that rest
 * over a gap the crew can't rest in is a fiction. (Ryan: pairing #150707 recorded a 12h rest
 * after duty 1 over PNR's 60-min turn — a rest the crew never actually got. The fix: only a
 * ≥12h gap opens a new duty, so a fabricated rest can never sit over a short turn again.)
 */
export const planDuties = (flights: FlightRow[]): FlightRow[][] => {
  const duties: FlightRow[][] = [[flights[0]]]
  for (let i = 1; i < flights.length; i++) {
    const prev = flights[i - 1]
    const cur = flights[i]
    const gapMin = minutesBetween(prev.schArvDtUtc, cur.schDepDtUtc)
    if (gapMin >= REST_FLOOR_MIN) {
      duties.push([cur])
    } else {
      duties[duties.length - 1].push(cur)
    }
  }
  return duties
}

/**
 * Validate a planned duty layout against the pairing build rules and return human-readable
 * warnings. "Build as-is, surface violations" (Ryan, Option A 2026-08-31): the build NEVER
 * blocks on these — the caller (UI toast, scripts) surfaces them so an over-cap same-day weld
 * (#150717) or a stranded non-base chain (#150497) is visible the moment it is created,
 * instead of sitting silently until the next audit run
 * (live-server/scripts/audit-pairing-build-rules.mjs).
 * The rest floor cannot be violated by construction — planDuties only splits on >= REST_FLOOR_MIN.
 */
export const validateBuildRules = (duties: FlightRow[][], base: string): string[] => {
  const warnings: string[] = []
  const firstLeg = duties[0][0]
  const lastDuty = duties[duties.length - 1]
  const lastLeg = lastDuty[lastDuty.length - 1]
  if (firstLeg.depArp !== base || lastLeg.arvArp !== base) {
    warnings.push(`not a ${base} base loop (starts at ${firstLeg.depArp}, ends at ${lastLeg.arvArp})`)
  }
  duties.forEach((duty, i) => {
    const blk = duty.reduce((n, f) => n + (f.blkMin ?? minutesBetween(f.schDepDtUtc, f.schArvDtUtc)), 0)
    if (duty.length > 1 && blk > MAX_DUTY_BLOCK_MIN) {
      warnings.push(`duty ${i + 1}: ${duty.length} legs, ${Math.round(blk)}min block exceeds the ${MAX_DUTY_BLOCK_MIN}min multi-segment cap`)
    }
    for (let s = 1; s < duty.length; s++) {
      if (duty[s].depArp !== duty[s - 1].arvArp) {
        warnings.push(`duty ${i + 1}: station break — ${duty[s - 1].fltNum} arrives ${duty[s - 1].arvArp} but ${duty[s].fltNum} departs ${duty[s].depArp}`)
      }
      if (duty[s].schDepDtUtc < duty[s - 1].schArvDtUtc) {
        warnings.push(`duty ${i + 1}: ${duty[s].fltNum} departs before ${duty[s - 1].fltNum} arrives (time overlap)`)
      }
    }
  })
  return warnings
}

/** Duty period (minutes): check-in (dep−checkin) → check-out (last arrival + checkout). */
const dutyDpMin = (duty: FlightRow[], rules?: RoundtripScope['rules']): number => {
  const checkInStart = addMinutes(duty[0].schDepDtUtc, -(rules?.checkinMin ?? CHECKIN_MIN))
  const checkOutEnd = addMinutes(duty[duty.length - 1].schArvDtUtc, CHECKOUT_MIN)
  return Math.round(minutesBetween(checkInStart, checkOutEnd))
}

/** Σ scheduled block minutes across a duty's flight legs (block time, dep→arv fallback). */
const dutyBlkMin = (duty: FlightRow[]): number =>
  Math.round(duty.reduce((n, f) => n + (f.blkMin ?? minutesBetween(f.schDepDtUtc, f.schArvDtUtc)), 0))

/** Post-duty rest = max(12h, duty period). DP = duty check-in (dep−2h) → check-out (last arrival). */
const dutyRestMin = (duty: FlightRow[], rules?: RoundtripScope['rules']): number =>
  Math.max(rules?.restMin ?? REST_FLOOR_MIN, dutyDpMin(duty, rules))

type DrizzleTx = Parameters<Parameters<FastifyInstance['db']['transaction']>[0]>[0]

/**
 * Insert all pairing_segment + pairing_composition rows for a set of flights under an
 * existing pairing id. Applies the Phase-1 rules: check-in 2h, check-out 0, per-duty
 * trailing rest = max(12h, DP), composition by body type. Returns header aggregates.
 */
const writePairingContents = async (
  tx: DrizzleTx,
  pairingId: number,
  flights: FlightRow[],
  username: string,
  scope?: RoundtripScope,
): Promise<{ dutyCount: number; segCount: number; schStr: Date; schEnd: Date; actStr: Date; actEnd: Date }> => {
  const rules = scope?.rules
  const checkin = rules?.checkinMin ?? CHECKIN_MIN
  const debrief = rules?.debriefMin ?? DEBRIEF_MIN
  const byId = new Map(flights.map(f => [f.id, f]))
  const duties = scope ? validateRotation(flights.map(toRoundtripFlight), scope).dutyFlightIds.map(ids => ids.map(id => byId.get(id)!)) : planDuties(flights)
  const firstDuty = duties[0]
  const lastDuty = duties[duties.length - 1]
  const lastRest = dutyRestMin(lastDuty, rules)

  const schStr = addMinutes(firstDuty[0].schDepDtUtc, -checkin)
  const schEnd = addMinutes(lastDuty[lastDuty.length - 1].schArvDtUtc, lastRest)
  const actStr = addMinutes(firstDuty[0].actDepDtUtc, -checkin)
  const actEnd = addMinutes(lastDuty[lastDuty.length - 1].actArvDtUtc, lastRest)

  // Duty credit from the Rust rule-7502 CARS engine: max(minCH-floor, Σblk×FT, DP×DP-ratio).
  // One spawn for all duties; keyed d1..dN. Written to duty_(sch|act)_credited_minutes below so
  // the crew-head RpCred (manday COALESCE(act,sch)) and the Pairing Info Total Credit
  // (sumPairingCreditMinutes reads duty_act_credited_minutes) both populate at build time —
  // without it a freshly-built/assigned pairing reads 0 / "—". Null map (binary missing / engine
  // error) leaves the columns NULL, same graceful fallback as computeDutyFdpMin.
  const creditByDuty = computeDutyCreditMin(
    duties.map((duty, i) => ({ key: `d${i + 1}`, group: 'FLY', blkMin: dutyBlkMin(duty), dpMin: dutyDpMin(duty, rules) })),
  )

  const audit = auditCreate(username)

  for (let d = 0; d < duties.length; d++) {
    const duty = duties[d]
    const dutySeq = d + 1
    const dutyFirst = duty[0]
    const dutyLast = duty[duty.length - 1]
    const restMin = dutyRestMin(duty, rules)
    const isFinalDuty = d === duties.length - 1

    // Duty-level check-in / check-out anchors, denormalised onto EVERY segment of the duty
    // to match existing F8 pairings (e.g. VB4025): pickup == brief start (= first dep − 2h
    // brief); brief ends at first departure; debrief starts at last arrival; debrief/dropoff
    // end 15m later. These are the timestamps the gantt canvas reads to draw the light-gray
    // duty box, the inter-duty layover puck, and the back-to-base REST puck.
    const dutyBriefStart = addMinutes(dutyFirst.schDepDtUtc, -checkin)
    const dutyBriefEnd = dutyFirst.schDepDtUtc
    const dutyDebriefStart = dutyLast.schArvDtUtc
    const dutyDebriefEnd = addMinutes(dutyLast.schArvDtUtc, debrief)
    const dutySchFdpMin = dutySchFdpMinForDuty(duty, rules)
    // Rule-7502 credit for this duty (same value on every seg of the duty, F8 convention).
    // numeric columns are string-typed in Drizzle → serialise (NULL stays NULL).
    const creditVal = creditByDuty?.get(`d${dutySeq}`) ?? null
    const dutyCreditMin = creditVal == null ? null : String(creditVal)
    // A duty with a layover after it carries one overnight night; the final duty (back at base) 0.
    const layoverNits = isFinalDuty ? 0 : 1

    for (let s = 0; s < duty.length; s++) {
      const flt = duty[s]

      await tx.insert(pairingSegment).values({
        pairingId,
        dutySeq,
        segSeq: s + 1,
        // Duty-level (denormalised on every seg of the duty)
        dutyStrArp: dutyFirst.depArp,
        dutyEndArp: dutyLast.arvArp,
        dutySchStrDtUtc: dutyFirst.schDepDtUtc,
        dutySchEndDtUtc: dutyLast.schArvDtUtc,
        dutyActStrDtUtc: dutyFirst.actDepDtUtc,
        dutyActEndDtUtc: dutyLast.actArvDtUtc,
        dutyAccState: 'D',
        // Flight segment
        fltId: flt.id,
        fltDt: flt.fltDt,
        fltNum: flt.fltNum,
        airline: flt.airline,
        depArp: flt.depArp,
        arvArp: flt.arvArp,
        fleetSeg: flt.fleet,
        schStrDtUtc: flt.schDepDtUtc,
        schEndDtUtc: flt.schArvDtUtc,
        actStrDtUtc: flt.actDepDtUtc,
        actEndDtUtc: flt.actArvDtUtc,
        segAssignment: flt.flightAssignment ?? 'FLY',
        // Duty check-in / check-out — denormalised onto every seg of the duty (F8 convention).
        pickupStartUtc: dutyBriefStart,
        pickupEndUtc: dutyBriefStart,
        briefStartUtc: dutyBriefStart,
        briefEndUtc: dutyBriefEnd,
        debriefStartUtc: dutyDebriefStart,
        debriefEndUtc: dutyDebriefEnd,
        dropoffStartUtc: dutyDebriefEnd,
        dropoffEndUtc: dutyDebriefEnd,
        // Post-duty rest + overnight nights — denormalised onto every seg of the duty (F8
        // convention). Mid-rotation duty = layover puck; final duty = back-to-base REST puck.
        dutySchFdpMin,
        // Scheduled == actual credit at build (on-schedule plan); actual/rule pass may overwrite later.
        dutySchCreditedMinutes: dutyCreditMin,
        dutyActCreditedMinutes: dutyCreditMin,
        dutySchRestMin: restMin,
        dutyActRestMin: restMin,
        dutyLayoverNits: layoverNits,
        doublePickupStartUtc: null, doublePickupEndUtc: null,
        doubleBriefStartUtc: null, doubleBriefEndUtc: null,
        doubleDebriefStartUtc: null, doubleDebriefEndUtc: null,
        doubleDropoffStartUtc: null, doubleDropoffEndUtc: null,
        ...audit,
      })
    }
  }

  // Composition — flight crew (division P), CA/FO count by body type.
  const comp = (scope?.composition ?? bodyComposition(flights[0].fleet))
    .filter((c) => c.plan > 0)
    .map((c) => ({
      pairingId,
      division: DIVISION_FLIGHT_CREW,
      actingRank: c.rank,
      plan: c.plan,
      fill: 0,
      isDeleted: 0 as const,
      ...audit,
    }))
  if (comp.length > 0) await tx.insert(pairingComposition).values(comp)

  return { dutyCount: duties.length, segCount: flights.length, schStr, schEnd, actStr, actEnd }
}

/** Fetch flights by id (ordered by scheduled departure) inside a tx. */
const fetchFlights = async (tx: DrizzleTx, ids: number[]): Promise<FlightRow[]> => {
  if (ids.length === 0) return []
  return tx
    .select()
    .from(flightTable)
    .where(inArray(flightTable.id, ids))
    .orderBy(asc(flightTable.schDepDtUtc), asc(flightTable.id))
    .for('update')
}

export const pairingBuildService = {
  /**
   * Build a pairing from selected open flight sectors (immediate write).
   * Rules: single airline + single fleet (no mixing), home base by airline, check-in 2h /
   * check-out 0, per-duty rest max(12h, DP), 8h multi-flight duty cap, composition by body type.
   * Returns the new pairing id so the UI can float it to the top row.
   */
  async build(fastify: FastifyInstance, flightIds: number[], username: string, scope?: RoundtripScope) {
    if (!Array.isArray(flightIds) || flightIds.length === 0) throw new Error('No flights provided')
    const uniqueIds = [...new Set(flightIds)]

    const result = await fastify.db.transaction(async (tx) => {
      const flights = await fetchFlights(tx, uniqueIds)
      if (flights.length === 0) throw roundtripError('No matching flights found', scope ? 409 : 400)
      if (scope) {
        if (uniqueIds.length !== flightIds.length || flights.length !== flightIds.length || flights.some(isRoundtripFlightCancelled)) throw roundtripError('Flights changed or are no longer available', 409)
        validateRotation(flights.map(toRoundtripFlight), scope)
      }

      assertHomogeneousFlights(flights)

      // Guard — refuse flights already covered by a (non-deadhead) segment of a live pairing.
      const covered = await tx
        .select({ fltId: pairingSegment.fltId, fltNum: pairingSegment.fltNum })
        .from(pairingSegment)
        .innerJoin(pairing, and(eq(pairing.id, pairingSegment.pairingId), notDeleted(pairing.isDeleted)))
        .where(and(
          inArray(pairingSegment.fltId, flights.map((f) => f.id)),
          notDeleted(pairingSegment.isDeleted),
          scope ? eq(pairing.division, DIVISION_FLIGHT_CREW) : undefined,
          or(isNull(pairingSegment.segAssignment), notInArray(pairingSegment.segAssignment, ['DH', 'DHD'])),
        ))
      if (covered.length > 0) {
        const nums = [...new Set(covered.map((c) => c.fltNum))].join(', ')
        throw roundtripError(`Flight(s) already in a pairing: ${nums}`, 409)
      }

      const airline = flights[0].airline
      const fleet = flights[0].fleet
      const base = scope?.base ?? homeBaseFor(airline, flights[0].depArp)
      const label = flights.map((f) => f.fltNum).join('/')

      // Insert header first (placeholder aggregates), then contents, then patch aggregates.
      const [hdr] = await tx
        .insert(pairing)
        .values({
          pairingLabel: label,
          division: DIVISION_FLIGHT_CREW,
          base,
          fleet,
          assignmentGroup: 'FLY',
          assignment: 'FLY',
          schStrDtUtc: flights[0].schDepDtUtc,
          schEndDtUtc: flights[flights.length - 1].schArvDtUtc,
          actStrDtUtc: flights[0].actDepDtUtc,
          actEndDtUtc: flights[flights.length - 1].actArvDtUtc,
          durationDays: 1,
          tafb: 1,
          dutyCount: 1,
          segCount: flights.length,
          source: 'MANUAL',
          ...auditCreate(username),
        })
        .returning({ id: pairing.id })

      const agg = await writePairingContents(tx, hdr.id, flights, username, scope)

      const durationDays = Math.max(0, Math.floor(minutesBetween(agg.schStr, agg.schEnd) / 1440))
      await tx
        .update(pairing)
        .set({
          schStrDtUtc: agg.schStr,
          schEndDtUtc: agg.schEnd,
          actStrDtUtc: agg.actStr,
          actEndDtUtc: agg.actEnd,
          durationDays,
          dutyCount: agg.dutyCount,
          segCount: agg.segCount,
        })
        .where(eq(pairing.id, hdr.id))

      await refreshPairingTafb(tx, hdr.id, username)
      // Option A — surface (never block): rule warnings ride along in the response for the UI toast.
      const warnings = scope ? [] : validateBuildRules(planDuties(flights), base)
      return { pairingId: hdr.id, label, dutyCount: agg.dutyCount, segCount: agg.segCount, base, fleet, airline, warnings }
    })

    await invalidatePairing(fastify.redis, result.pairingId)
    return result
  },

  /**
   * Remove one flight from a pairing. If it was the only flight, the whole pairing is
   * deleted; otherwise the remaining flights are re-laid into duties (rest/check-in/
   * composition recomputed). Blocked (409) when the pairing already has rostered crew.
   */
  async removeFlight(fastify: FastifyInstance, pairingId: number, fltId: number, username: string) {
    const [rostered] = await fastify.db
      .select({ id: rosterFlight.id })
      .from(rosterFlight)
      .where(eq(rosterFlight.pairingId, pairingId))
      .limit(1)
    if (rostered) {
      throw Object.assign(new Error('Pairing has rostered crew and cannot be edited'), { statusCode: 409 })
    }

    const result = await fastify.db.transaction(async (tx) => {
      const [pair] = await tx
        .select({ id: pairing.id })
        .from(pairing)
        .where(and(eq(pairing.id, pairingId), notDeleted(pairing.isDeleted)))
      if (!pair) throw new Error(`Pairing #${pairingId} not found`)

      const segs = await tx
        .select({ fltId: pairingSegment.fltId })
        .from(pairingSegment)
        .where(and(eq(pairingSegment.pairingId, pairingId), notDeleted(pairingSegment.isDeleted)))
      const remainingIds = [...new Set(segs.map((s) => s.fltId).filter((id): id is number => id !== null && id !== fltId))]

      // Clear current contents (physical delete, matching pairingService.remove semantics).
      await tx.delete(pairingComposition).where(eq(pairingComposition.pairingId, pairingId))
      await tx.delete(pairingSegment).where(eq(pairingSegment.pairingId, pairingId))

      if (remainingIds.length === 0) {
        await tx.delete(pairing).where(eq(pairing.id, pairingId))
        return { pairingId, deleted: true }
      }

      const flights = await fetchFlights(tx, remainingIds)
      const agg = await writePairingContents(tx, pairingId, flights, username)
      const durationDays = Math.max(0, Math.floor(minutesBetween(agg.schStr, agg.schEnd) / 1440))
      await tx
        .update(pairing)
        .set({
          pairingLabel: flights.map((f) => f.fltNum).join('/'),
          schStrDtUtc: agg.schStr,
          schEndDtUtc: agg.schEnd,
          actStrDtUtc: agg.actStr,
          actEndDtUtc: agg.actEnd,
          durationDays,
          dutyCount: agg.dutyCount,
          segCount: agg.segCount,
        })
        .where(eq(pairing.id, pairingId))
      await refreshPairingTafb(tx, pairingId, username)
      return { pairingId, deleted: false, dutyCount: agg.dutyCount, segCount: agg.segCount }
    })

    await invalidatePairing(fastify.redis, result.pairingId)
    return result
  },
}
