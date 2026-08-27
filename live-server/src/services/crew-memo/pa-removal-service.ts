/**
 * PA-removal orchestration (read-only analysis + explicit execution).
 *
 *  Stage 1 — runPaRemoval:    classify duties → refresh type=3 memos (no roster mutation)
 *  Stage 3 — executePaRemoval: soft-delete (is_deleted=1) the roster rows behind the
 *                              approved (type=3, status='Y') memos. Explicit-call only.
 */
import { and, eq, inArray, gte, lt, gt } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { rosterFlight } from '../../models/roster/roster-flight.js'
import { crewBase } from '../../models/crew/crew-base.js'
import { crewMemo } from '../../models/crew/crew-memo.js'
import { auditUpdate } from '../../utils/audit.js'
import { loadCrewDuties, buildPlan } from './deassign-loader.js'
import { refreshSystemMemos } from './crew-memo-service.js'

export interface PaRemovalInput {
  bases?: string[]
  ranks?: string[]
  crewIds?: string[]
  from: string
  to: string
}

/** Resolve the target crew set: explicit ids, else prime-base ∈ bases & rank ∈ ranks with a roster in range. */
export const resolveCrewSet = async (
  fastify: FastifyInstance,
  input: PaRemovalInput,
): Promise<string[]> => {
  if (input.crewIds && input.crewIds.length) return [...new Set(input.crewIds)]
  const conds = [
    eq(rosterFlight.isDeleted, 0),
    gte(rosterFlight.schStrDtUtc, new Date(input.from)),
    lt(rosterFlight.schStrDtUtc, new Date(input.to)),
  ]
  if (input.bases?.length) conds.push(inArray(crewBase.base, input.bases))
  if (input.ranks?.length) conds.push(inArray(rosterFlight.rosterActingRank, input.ranks))
  const rows = await fastify.db
    .selectDistinct({ crewId: rosterFlight.crewId })
    .from(rosterFlight)
    .innerJoin(crewBase, and(
      eq(crewBase.crewId, rosterFlight.crewId),
      eq(crewBase.isPrimeBase, 1),
    ))
    .where(and(...conds))
  return rows.map((r) => r.crewId)
}

export interface PaRemovalResult {
  written: number
  crewCount: number
  byCrew: Record<string, number>
}

/** Stage 1: analyze and write the bot plan as type=3 memos. */
export const runPaRemoval = async (
  fastify: FastifyInstance,
  input: PaRemovalInput,
  userId: string,
): Promise<PaRemovalResult> => {
  const crewIds = await resolveCrewSet(fastify, input)
  if (crewIds.length === 0) return { written: 0, crewCount: 0, byCrew: {} }
  const byCrewDuties = await loadCrewDuties(fastify, crewIds, input.from, input.to)
  const plan = buildPlan(byCrewDuties, input.from, input.to)
  await refreshSystemMemos(fastify, crewIds, input.from, input.to, plan, userId)
  const byCrew: Record<string, number> = {}
  for (const p of plan) byCrew[p.crewId] = (byCrew[p.crewId] ?? 0) + 1
  return { written: plan.length, crewCount: crewIds.length, byCrew }
}

export interface ExecuteResult {
  deassigned: number
  byCrew: Record<string, number>
}

/** Stage 3: soft-delete the roster rows behind the approved memos. Explicit order only. */
export const executePaRemoval = async (
  fastify: FastifyInstance,
  input: { crewIds?: string[]; from: string; to: string },
  userId: string,
): Promise<ExecuteResult> => {
  const conds = [
    eq(crewMemo.type, 3),
    eq(crewMemo.status, 'Y'),
    lt(crewMemo.strDtLoc, new Date(input.to)),
    gt(crewMemo.endDtLoc, new Date(input.from)),
  ]
  if (input.crewIds?.length) conds.push(inArray(crewMemo.crewId, input.crewIds))
  const memos = await fastify.db.select().from(crewMemo).where(and(...conds))

  const byCrew: Record<string, number> = {}
  let deassigned = 0
  for (const m of memos) {
    if (!m.rosterId) continue
    const deleted = await fastify.db.transaction(async (tx) => {
      const [src] = await tx.select({ pairingId: rosterFlight.pairingId, isDeleted: rosterFlight.isDeleted })
        .from(rosterFlight).where(eq(rosterFlight.id, m.rosterId!))
      if (!src || src.isDeleted === 1) return 0
      if (src.pairingId) {
        const res = await tx.update(rosterFlight)
          .set({ isDeleted: 1, ...auditUpdate(userId) })
          .where(and(
            eq(rosterFlight.crewId, m.crewId),
            eq(rosterFlight.pairingId, src.pairingId),
            eq(rosterFlight.isDeleted, 0),
          ))
          .returning({ id: rosterFlight.id })
        return res.length
      }
      await tx.update(rosterFlight)
        .set({ isDeleted: 1, ...auditUpdate(userId) })
        .where(eq(rosterFlight.id, m.rosterId!))
      return 1
    })
    if (deleted > 0) {
      byCrew[m.crewId] = (byCrew[m.crewId] ?? 0) + deleted
      deassigned += deleted
    }
  }
  return { deassigned, byCrew }
}
