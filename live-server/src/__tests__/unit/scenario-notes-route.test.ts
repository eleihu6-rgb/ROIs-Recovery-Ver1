import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'

vi.mock('../../config/env.js', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    FILIALE: 'F8',
    LIVE_SCHEMA: 'f8',
    SCENARIO_SCHEMA: 'scenario',
    SCENARIO_GANTT_SOURCE: 'db',
  },
}))

vi.mock('../../services/scenario/scenario-note-store.js', () => ({
  getNotes: vi.fn(async () => []),
  addNote: vi.fn(async (_f: unknown, _id: number, input: { text: string; author: string; replyTo?: string | null }) => ({
    id: 'n_new1', author: input.author, text: input.text, at: '2026-08-07T00:00:00Z', editedAt: null, replyTo: input.replyTo ?? null,
  })),
  patchNote: vi.fn(async () => ({ id: 'n_a', author: 'admin', text: 'edited', at: '2026-08-07T00:00:00Z', editedAt: '2026-08-07T01:00:00Z', replyTo: null })),
  deleteNote: vi.fn(async () => undefined),
  clearNotes: vi.fn(async () => undefined),
}))

vi.mock('../../services/scenario/scenario-run-health-service.js', () => ({
  getScenarioRunHealth: vi.fn(async () => ({ overall: 'healthy', services: [], checkedAt: new Date().toISOString() })),
}))

vi.mock('../../services/scenario/scenario-service.js', () => ({
  scenarioService: {
    list: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 20 })),
    create: vi.fn(async () => ({ id: 901, status: 'DRAFT' })),
    getById: vi.fn(async () => null),
    update: vi.fn(async () => ({ id: 901, status: 'DRAFT' })),
    duplicate: vi.fn(async () => ({ id: 902, status: 'DRAFT' })),
    transition: vi.fn(async () => ({ id: 901, status: 'PUBLISHED' })),
    remove: vi.fn(async () => undefined),
  },
}))

vi.mock('../../services/scenario/s3-pairing-import-service.js', () => ({
  importS3PairingPrg: vi.fn(),
}))

vi.mock('../../services/base/dictionary-service.js', () => ({
  dictionaryService: { getByParentCode: vi.fn(async () => []) },
}))

vi.mock('../../services/manday/manday-tool.js', () => ({
  recompute: vi.fn(async () => undefined),
}))

import scenarioRoutes from '../../routes/scenario/scenario.js'
import {
  addNote, clearNotes, deleteNote, getNotes, patchNote,
} from '../../services/scenario/scenario-note-store.js'

let app: ReturnType<typeof Fastify>
beforeEach(async () => {
  vi.clearAllMocks()
  app = Fastify()
  await app.register(scenarioRoutes)
  await app.ready()
})

describe('scenario notes routes', () => {
  it('GET /:id/notes returns { items }', async () => {
    vi.mocked(getNotes).mockResolvedValue([{ id: 'n_a', author: 'admin', text: 'q', at: 't', editedAt: null, replyTo: null }])
    const res = await app.inject({ method: 'GET', url: '/7/notes' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.items).toHaveLength(1)
  })

  it('POST /:id/notes validates body and returns { item }', async () => {
    const res = await app.inject({ method: 'POST', url: '/7/notes', payload: { text: 'hello', author: 'admin', replyTo: null } })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.item.text).toBe('hello')
  })

  it('POST /:id/notes rejects empty author with 400 (app code)', async () => {
    const res = await app.inject({ method: 'POST', url: '/7/notes', payload: { text: 'hello', author: '' } })
    expect(res.json().code).toBe(400)
  })

  it('PATCH /:id/notes/:messageId updates text', async () => {
    const res = await app.inject({ method: 'PATCH', url: '/7/notes/n_a', payload: { text: 'edited' } })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.item.editedAt).not.toBeNull()
  })

  it('DELETE /:id/notes/:messageId returns { ok: true }', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/7/notes/n_a' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.ok).toBe(true)
  })

  it('DELETE /:id/notes clears all', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/7/notes' })
    expect(res.statusCode).toBe(200)
    expect(clearNotes).toHaveBeenCalled()
  })
})
