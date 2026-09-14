/**
 * crew_control_handover service — shared, persisted shift-handover log for
 * the Dashboard.
 *
 *  - listRecent — most recent visible (is_deleted=0) handover entries
 *  - addEntry   — insert a new handover note
 */
import { desc, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { crewControlHandover } from '../../models/dashboard/crew-control-handover.js'
import { auditCreate } from '../../utils/audit.js'

export interface HandoverEntry {
  id: number
  shiftLabel: string
  author: string
  severity: string
  caseRef: string | null
  note: string
  createdAt: string
}

export interface HandoverInput {
  shiftLabel: string
  author: string
  severity?: string
  caseRef?: string
  note: string
}

type HandoverRow = typeof crewControlHandover.$inferSelect

/** Pure row → DTO mapper (ISO string for createdAt). */
const toHandoverDTO = (r: HandoverRow): HandoverEntry => ({
  id: r.id,
  shiftLabel: r.shiftLabel,
  author: r.author,
  severity: r.severity,
  caseRef: r.caseRef,
  note: r.note,
  createdAt: new Date(r.createdAt).toISOString(),
})

export const handoverService = {
  async listRecent(fastify: FastifyInstance, limit = 20): Promise<HandoverEntry[]> {
    const rows = await fastify.db
      .select()
      .from(crewControlHandover)
      .where(eq(crewControlHandover.isDeleted, 0))
      .orderBy(desc(crewControlHandover.createdAt))
      .limit(limit)
    return rows.map(toHandoverDTO)
  },

  async addEntry(
    fastify: FastifyInstance,
    input: HandoverInput,
    userId: string,
  ): Promise<HandoverEntry> {
    const [row] = await fastify.db
      .insert(crewControlHandover)
      .values({
        shiftLabel: input.shiftLabel,
        author: input.author,
        severity: input.severity ?? 'info',
        caseRef: input.caseRef ?? null,
        note: input.note,
        ...auditCreate(userId),
      })
      .returning()
    return toHandoverDTO(row)
  },
}
