// live-server/src/services/scenario/scenario-note-store.ts
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { ensureScenarioResultTable } from './scenario-result-store.js'

export interface ScenarioNoteMessage {
  id: string
  author: string
  text: string
  at: string
  editedAt: string | null
  replyTo: string | null
}

export interface AddNoteInput {
  text: string
  author: string
  replyTo?: string | null
}

type Queryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }
type FastifyLike = { pgPool: Queryable }

const NOTES_TYPE = 'notes'

const nowIso = (): string => new Date().toISOString()

const newNoteId = (): string => `n_${randomUUID().replaceAll('-', '').slice(0, 8)}`

const asMessages = (value: unknown): ScenarioNoteMessage[] =>
  Array.isArray(value) ? value as ScenarioNoteMessage[] : []

const ensureTable = async (fastify: FastifyLike): Promise<void> => {
  await ensureScenarioResultTable(fastify as unknown as FastifyInstance)
}

const readMessages = async (fastify: FastifyLike, scenarioId: number): Promise<ScenarioNoteMessage[]> => {
  const { rows } = await fastify.pgPool.query(
    `select json from scenario_result where scenario_id = $1 and type = $2`,
    [scenarioId, NOTES_TYPE],
  )
  return rows.length > 0 ? asMessages((rows[0] as { json: unknown }).json) : []
}

const writeMessages = async (pool: Queryable, scenarioId: number, messages: ScenarioNoteMessage[]): Promise<void> => {
  await pool.query(
    `update scenario_result set json = $2::jsonb, updated_at = now() where scenario_id = $1 and type = $3`,
    [scenarioId, JSON.stringify(messages), NOTES_TYPE],
  )
}

export const getNotes = async (fastify: FastifyLike, scenarioId: number): Promise<ScenarioNoteMessage[]> => {
  await ensureTable(fastify)
  return readMessages(fastify, scenarioId)
}

export const addNote = async (
  fastify: FastifyLike,
  scenarioId: number,
  input: AddNoteInput,
  username = 'system',
): Promise<ScenarioNoteMessage> => {
  const text = input.text.trim()
  const author = input.author.trim()
  if (!text) throw new Error('Note text cannot be empty')
  if (!author) throw new Error('Note author cannot be empty')
  await ensureTable(fastify)
  const message: ScenarioNoteMessage = {
    id: newNoteId(),
    author,
    text,
    at: nowIso(),
    editedAt: null,
    replyTo: input.replyTo ?? null,
  }
  await fastify.pgPool.query(
    `
    insert into scenario_result (scenario_id, type, json, created_by, updated_by)
    values ($1, $2, jsonb_build_array($3::jsonb), $4, $4)
    on conflict (scenario_id, type) do update set
      json = scenario_result.json || excluded.json,
      updated_by = excluded.updated_by,
      updated_at = now()
    `,
    [scenarioId, NOTES_TYPE, JSON.stringify(message), username],
  )
  return message
}

export const patchNote = async (
  fastify: FastifyLike,
  scenarioId: number,
  messageId: string,
  text: string,
): Promise<ScenarioNoteMessage> => {
  const clean = text.trim()
  if (!clean) throw new Error('Note text cannot be empty')
  await ensureTable(fastify)
  const messages = await readMessages(fastify, scenarioId)
  const message = messages.find((m) => m.id === messageId)
  if (!message) throw new Error(`Note message not found: ${messageId}`)
  const updated: ScenarioNoteMessage = { ...message, text: clean, editedAt: nowIso() }
  await writeMessages(fastify.pgPool, scenarioId, messages.map((m) => (m.id === messageId ? updated : m)))
  return updated
}

export const deleteNote = async (pool: Queryable, scenarioId: number, messageId: string): Promise<void> => {
  const messages = await readMessages({ pgPool: pool } as FastifyLike, scenarioId)
  const removed = new Set<string>([messageId])
  let changed = true
  while (changed) {
    changed = false
    for (const m of messages) {
      if (m.replyTo && removed.has(m.replyTo) && !removed.has(m.id)) {
        removed.add(m.id)
        changed = true
      }
    }
  }
  const kept = messages.filter((m) => !removed.has(m.id))
  if (kept.length === messages.length) throw new Error(`Note message not found: ${messageId}`)
  await writeMessages(pool, scenarioId, kept)
}

export const clearNotes = async (pool: Queryable, scenarioId: number): Promise<void> => {
  await pool.query(
    `delete from scenario_result where scenario_id = $1 and type = $2`,
    [scenarioId, NOTES_TYPE],
  )
}
