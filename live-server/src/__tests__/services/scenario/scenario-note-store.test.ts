import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../services/scenario/scenario-result-store.js', () => ({
  ensureScenarioResultTable: vi.fn(async () => undefined),
}))

import { ensureScenarioResultTable } from '../../../services/scenario/scenario-result-store.js'
import {
  addNote, clearNotes, deleteNote, getNotes, patchNote,
  type ScenarioNoteMessage,
} from '../../../services/scenario/scenario-note-store.js'

const ensureMock = vi.mocked(ensureScenarioResultTable)

type QueryResult = { rows: unknown[] }
const queryMock = vi.fn<(text: string, params?: unknown[]) => Promise<QueryResult>>()

beforeEach(() => {
  vi.clearAllMocks()
  queryMock.mockResolvedValue({ rows: [] })
})

const fastifyLike = { pgPool: { query: queryMock } }

describe('scenario note store', () => {
  it('getNotes returns [] when no notes row exists', async () => {
    expect(await getNotes(fastifyLike, 1)).toEqual([])
    expect(ensureMock).toHaveBeenCalled()
  })

  it('getNotes parses the stored notes array', async () => {
    const stored: ScenarioNoteMessage = { id: 'n_a', author: 'admin', text: 'q', at: '2026-08-07T00:00:00Z', editedAt: null, replyTo: null }
    queryMock.mockResolvedValueOnce({ rows: [{ json: [stored] }] })
    expect(await getNotes(fastifyLike, 1)).toEqual([stored])
  })

  it('addNote appends a message with generated id and replyTo', async () => {
    const item = await addNote(fastifyLike, 7, { text: 'Hello', author: 'admin', replyTo: 'n_root' })
    expect(item.id).toMatch(/^n_[0-9a-f]{8}$/)
    expect(item.text).toBe('Hello')
    expect(item.author).toBe('admin')
    expect(item.replyTo).toBe('n_root')
    expect(item.editedAt).toBeNull()
    expect(typeof item.at).toBe('string')
    // atomic append SQL: INSERT ... ON CONFLICT
    const [sql, params] = queryMock.mock.calls[0]
    expect(String(sql)).toContain('on conflict')
    expect(params?.[0]).toBe(7)
    expect(params?.[2]).toContain('"replyTo":"n_root"')
  })

  it('addNote defaults replyTo to null', async () => {
    const item = await addNote(fastifyLike, 7, { text: 'Hi', author: 'a' })
    expect(item.replyTo).toBeNull()
  })

  it('addNote rejects empty text and empty author', async () => {
    await expect(addNote(fastifyLike, 7, { text: '   ', author: 'a' })).rejects.toThrow('cannot be empty')
    await expect(addNote(fastifyLike, 7, { text: 'ok', author: '  ' })).rejects.toThrow('cannot be empty')
  })

  it('patchNote updates text and editedAt but preserves author', async () => {
    const original: ScenarioNoteMessage = { id: 'n_a', author: 'admin', text: 'old', at: '2026-08-07T00:00:00Z', editedAt: null, replyTo: null }
    queryMock.mockResolvedValueOnce({ rows: [{ json: [original] }] })
    const updated = await patchNote(fastifyLike, 7, 'n_a', 'new text')
    expect(updated.text).toBe('new text')
    expect(updated.author).toBe('admin')
    expect(updated.editedAt).not.toBeNull()
    // write-back UPDATE contains the new text
    const updateCall = queryMock.mock.calls.at(-1)
    expect(String(updateCall?.[0])).toContain('update scenario_result set json')
    expect(String(updateCall?.[1])).toContain('new text')
  })

  it('patchNote throws for a missing message', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ json: [] }] })
    await expect(patchNote(fastifyLike, 7, 'n_missing', 'x')).rejects.toThrow('not found')
  })

  it('patchNote rejects empty text', async () => {
    await expect(patchNote(fastifyLike, 7, 'n_a', '   ')).rejects.toThrow('cannot be empty')
  })

  it('deleteNote removes the message and cascades descendants', async () => {
    const root: ScenarioNoteMessage = { id: 'n_r', author: 'a', text: 'root', at: 't', editedAt: null, replyTo: null }
    const child: ScenarioNoteMessage = { id: 'n_c', author: 'b', text: 'child', at: 't', editedAt: null, replyTo: 'n_r' }
    const grand: ScenarioNoteMessage = { id: 'n_g', author: 'c', text: 'grand', at: 't', editedAt: null, replyTo: 'n_c' }
    const other: ScenarioNoteMessage = { id: 'n_o', author: 'd', text: 'other', at: 't', editedAt: null, replyTo: null }
    queryMock.mockResolvedValueOnce({ rows: [{ json: [root, child, grand, other] }] })
    await deleteNote(fastifyLike.pgPool, 7, 'n_r')
    const updateCall = queryMock.mock.calls.at(-1)
    const written = JSON.parse(String(updateCall?.[1]?.[1]))
    expect(written.map((m: ScenarioNoteMessage) => m.id)).toEqual(['n_o'])
  })

  it('deleteNote removes a leaf without touching its parent', async () => {
    const root: ScenarioNoteMessage = { id: 'n_r', author: 'a', text: 'root', at: 't', editedAt: null, replyTo: null }
    const child: ScenarioNoteMessage = { id: 'n_c', author: 'b', text: 'child', at: 't', editedAt: null, replyTo: 'n_r' }
    queryMock.mockResolvedValueOnce({ rows: [{ json: [root, child] }] })
    await deleteNote(fastifyLike.pgPool, 7, 'n_c')
    const updateCall = queryMock.mock.calls.at(-1)
    const written = JSON.parse(String(updateCall?.[1]?.[1]))
    expect(written.map((m: ScenarioNoteMessage) => m.id)).toEqual(['n_r'])
  })

  it('deleteNote throws for a missing message', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ json: [] }] })
    await expect(deleteNote(fastifyLike.pgPool, 7, 'n_x')).rejects.toThrow('not found')
  })

  it('clearNotes issues a delete for the notes type', async () => {
    await clearNotes(fastifyLike.pgPool, 7)
    const [sql, params] = queryMock.mock.calls[0]
    expect(String(sql)).toContain('delete from scenario_result')
    expect(params?.[1]).toBe('notes')
  })
})
