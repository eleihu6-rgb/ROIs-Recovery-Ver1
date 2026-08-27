/**
 * crew_memo CRUD service (range-based notes; soft-delete via status).
 *
 *  - listMemos          — visible (status='Y') memos for a crew set over a range
 *  - upsertMemo         — insert a new memo or update an existing one by id
 *  - softDeleteMemo     — set status='N'
 *  - refreshSystemMemos — replace the type=3 (bot) plan in a window atomically
 */
import { and, eq, inArray, lt, gt } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { crewMemo } from '../../models/crew/crew-memo.js'
import { auditCreate, auditUpdate } from '../../utils/audit.js'

export interface MemoDTO {
  id: number
  crewId: string
  strDtLoc: string | null
  endDtLoc: string | null
  memo: string | null
  name: string | null
  type: number | null
  status: string
  rosterId: number | null
}

export interface MemoInput {
  id?: number
  crewId: string
  strDtLoc: string
  endDtLoc: string
  memo: string
  name?: string
  type?: number
  rosterId?: number | null
}

type MemoRow = typeof crewMemo.$inferSelect

/** Pure row → DTO mapper (ISO strings for dates). */
export const toMemoDTO = (r: MemoRow): MemoDTO => ({
  id: r.id,
  crewId: r.crewId,
  strDtLoc: r.strDtLoc ? new Date(r.strDtLoc).toISOString() : null,
  endDtLoc: r.endDtLoc ? new Date(r.endDtLoc).toISOString() : null,
  memo: r.memo,
  name: r.name,
  type: r.type,
  status: r.status,
  rosterId: r.rosterId,
})

export const listMemos = async (
  fastify: FastifyInstance,
  crewIds: string[],
  from: string,
  to: string,
): Promise<MemoDTO[]> => {
  if (crewIds.length === 0) return []
  const rows = await fastify.db
    .select()
    .from(crewMemo)
    .where(and(
      inArray(crewMemo.crewId, crewIds),
      eq(crewMemo.status, 'Y'),
      lt(crewMemo.strDtLoc, new Date(to)),
      gt(crewMemo.endDtLoc, new Date(from)),
    ))
    .orderBy(crewMemo.strDtLoc)
  return rows.map(toMemoDTO)
}

export const upsertMemo = async (
  fastify: FastifyInstance,
  input: MemoInput,
  userId: string,
): Promise<MemoDTO> => {
  if (input.id) {
    const [row] = await fastify.db
      .update(crewMemo)
      .set({
        memo: input.memo,
        name: input.name ?? null,
        strDtLoc: new Date(input.strDtLoc),
        endDtLoc: new Date(input.endDtLoc),
        rosterId: input.rosterId ?? null,
        userId,
        ...auditUpdate(userId),
      })
      .where(eq(crewMemo.id, input.id))
      .returning()
    return toMemoDTO(row)
  }
  const [row] = await fastify.db
    .insert(crewMemo)
    .values({
      crewId: input.crewId,
      strDtLoc: new Date(input.strDtLoc),
      endDtLoc: new Date(input.endDtLoc),
      memo: input.memo,
      name: input.name ?? null,
      type: input.type ?? 1,
      rosterId: input.rosterId ?? null,
      status: 'Y',
      userId,
      tmst: new Date(),
      ...auditCreate(userId),
    })
    .returning()
  return toMemoDTO(row)
}

export const softDeleteMemo = async (
  fastify: FastifyInstance,
  id: number,
  userId: string,
): Promise<number> => {
  await fastify.db
    .update(crewMemo)
    .set({ status: 'N', ...auditUpdate(userId) })
    .where(eq(crewMemo.id, id))
  return id
}

/** Atomically replace the bot plan (type=3) for a crew set in a date window. */
export const refreshSystemMemos = async (
  fastify: FastifyInstance,
  crewIds: string[],
  from: string,
  to: string,
  rows: Array<{ crewId: string; memo: string; name: string; start: string; end: string; rosterId: number | null }>,
  userId: string,
): Promise<number> => {
  if (crewIds.length === 0) return 0
  return fastify.db.transaction(async (tx) => {
    await tx
      .update(crewMemo)
      .set({ status: 'N', ...auditUpdate(userId) })
      .where(and(
        inArray(crewMemo.crewId, crewIds),
        eq(crewMemo.type, 3),
        eq(crewMemo.status, 'Y'),
        lt(crewMemo.strDtLoc, new Date(to)),
        gt(crewMemo.endDtLoc, new Date(from)),
      ))
    if (rows.length === 0) return 0
    await tx.insert(crewMemo).values(rows.map((r) => ({
      crewId: r.crewId,
      strDtLoc: new Date(r.start),
      endDtLoc: new Date(r.end),
      memo: r.memo,
      name: r.name,
      type: 3,
      rosterId: r.rosterId,
      status: 'Y',
      userId,
      tmst: new Date(),
      ...auditCreate(userId),
    })))
    return rows.length
  })
}
