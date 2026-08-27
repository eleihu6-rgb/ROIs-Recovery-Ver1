/**
 * Loads roster duties for the de-assignment classifier and turns the kept
 * (DE_ASSIGN) duties into crew_memo plan rows.
 *
 *  - `rowsToDuties`   — pure: collapse roster_flight rows into normalized Duty[]
 *                       (one Duty per flying pairing, one per ground row).
 *  - `loadCrewDuties` — query the DB over a context window (wider than the target
 *                       month) so adjacency rules see neighbouring sim/vac/leadin.
 *  - `buildPlan`      — pure: classify per crew, keep DE_ASSIGN, map to memo rows.
 */
import { and, inArray, gte, lt, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { rosterFlight } from '../../models/roster/roster-flight.js'
import { pairing as pairingTable } from '../../models/pairing/pairing.js'
import { classifyDuties } from './deassign-analyzer.js'
import type { Duty } from './deassign-types.js'

/** A roster_flight row reduced to the fields the classifier needs. */
export interface RosterRow {
  id: number
  crewId: string
  assignmentGroup: string
  assignment: string | null
  pairingId: number | null
  pairingLabel: string | null
  start: string
  end: string
}

export interface PlanRow {
  crewId: string
  memo: string
  name: string
  start: string
  end: string
  rosterId: number | null
  pairingId: number | null
}

/** Collapse roster rows into normalized duties (one per flying pairing). */
export const rowsToDuties = (rows: RosterRow[]): Duty[] => {
  const flyByPairing = new Map<number, Duty>()
  const duties: Duty[] = []
  for (const r of rows) {
    const kind: Duty['kind'] = r.assignmentGroup === 'FLY' ? 'FLY' : 'GRD'
    if (kind === 'FLY' && r.pairingId) {
      const existing = flyByPairing.get(r.pairingId)
      if (existing) {
        existing.rosterIds.push(r.id)
        existing.segCount += 1
        if (Date.parse(r.start) < Date.parse(existing.start)) existing.start = r.start
        if (Date.parse(r.end) > Date.parse(existing.end)) existing.end = r.end
      } else {
        const duty: Duty = {
          kind: 'FLY', assignment: r.assignment ?? 'FLY', pairingId: r.pairingId,
          pairingLabel: r.pairingLabel, segCount: 1, rosterIds: [r.id], start: r.start, end: r.end,
        }
        flyByPairing.set(r.pairingId, duty)
        duties.push(duty)
      }
    } else {
      duties.push({
        kind, assignment: r.assignment ?? '', pairingId: r.pairingId ?? null,
        pairingLabel: r.pairingLabel, segCount: 0, rosterIds: [r.id], start: r.start, end: r.end,
      })
    }
  }
  return duties
}

/** Load duties per crew over a context window padded around the target month. */
export const loadCrewDuties = async (
  fastify: FastifyInstance,
  crewIds: string[],
  monthStart: string,
  monthEnd: string,
): Promise<Map<string, Duty[]>> => {
  const ctxStart = new Date(Date.parse(monthStart) - 12 * 86_400_000)
  const ctxEnd = new Date(Date.parse(monthEnd) + 5 * 86_400_000)
  const rows = await fastify.db
    .select({
      id: rosterFlight.id,
      crewId: rosterFlight.crewId,
      assignmentGroup: rosterFlight.assignmentGroup,
      assignment: rosterFlight.assignment,
      pairingId: rosterFlight.pairingId,
      pairingLabel: pairingTable.pairingLabel,
      // The column stores UTC wall-clock in a `timestamp` (no tz). Format it as an
      // explicit UTC ISO string in SQL so the value never passes through drizzle's
      // local-time Date parsing (which shifts it by the machine offset).
      start: sql<string | null>`to_char(${rosterFlight.schStrDtUtc}, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
      end: sql<string | null>`to_char(${rosterFlight.schEndDtUtc}, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
    })
    .from(rosterFlight)
    .leftJoin(pairingTable, eq(rosterFlight.pairingId, pairingTable.id))
    .where(and(
      inArray(rosterFlight.crewId, crewIds),
      eq(rosterFlight.isDeleted, 0),
      gte(rosterFlight.schStrDtUtc, ctxStart),
      lt(rosterFlight.schStrDtUtc, ctxEnd),
    ))
    .orderBy(rosterFlight.crewId, rosterFlight.schStrDtUtc)

  const byCrew = new Map<string, RosterRow[]>()
  for (const r of rows) {
    if (!r.start || !r.end) continue
    const norm: RosterRow = {
      id: r.id, crewId: r.crewId, assignmentGroup: r.assignmentGroup, assignment: r.assignment,
      pairingId: r.pairingId, pairingLabel: r.pairingLabel,
      start: r.start, end: r.end,
    }
    const arr = byCrew.get(r.crewId) ?? []
    arr.push(norm)
    byCrew.set(r.crewId, arr)
  }

  const out = new Map<string, Duty[]>()
  for (const [crewId, rs] of byCrew) out.set(crewId, rowsToDuties(rs))
  return out
}

/** UTC calendar date (YYYY-MM-DD) of an ISO instant — duties are stored as true UTC. */
const ymd = (iso: string): string => iso.slice(0, 10)

/** Single date for same-day duties, or a `start→end` range for multi-day trips. */
const dateLabel = (start: string, end: string): string => {
  const s = ymd(start), e = ymd(end)
  return s === e ? s : `${s}→${e}`
}

/** Classify per crew, keep DE_ASSIGN, map to crew_memo plan rows. */
export const buildPlan = (
  byCrew: Map<string, Duty[]>,
  monthStart: string,
  monthEnd: string,
): PlanRow[] => {
  const plan: PlanRow[] = []
  for (const [crewId, duties] of byCrew) {
    for (const d of classifyDuties(duties, { monthStart, monthEnd })) {
      if (d.disposition !== 'DE_ASSIGN') continue
      const isFly = d.kind === 'FLY'
      // Record the to-be-de-assigned duty detail: flying → label + pairing id + date(s),
      // ground → assignment code + date. A multi-day trip shows its date range.
      const memo = isFly
        ? `${d.pairingLabel ?? '?'} (${d.pairingId}) · ${dateLabel(d.start, d.end)}`
        : `${d.assignment} · ${ymd(d.start)}`
      plan.push({
        crewId,
        name: isFly ? 'De-assign pairing' : 'De-assign day off',
        memo,
        start: d.start,
        end: d.end,
        rosterId: d.rosterIds[0] ?? null,
        pairingId: isFly ? d.pairingId : null,
      })
    }
  }
  return plan
}
