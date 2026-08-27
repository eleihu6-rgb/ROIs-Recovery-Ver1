import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.hoisted(() => {
  process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'
  process.env.FILIALE ||= 'F8'
})

const handlers: Record<string, (arg?: unknown) => void> = {}
const fakeChild = {
  on: vi.fn((evt: string, cb: (arg?: unknown) => void) => {
    handlers[evt] = cb
    return fakeChild
  }),
  unref: vi.fn(),
}
vi.mock('node:child_process', () => ({ spawn: vi.fn(() => fakeChild) }))

import { spawn } from 'node:child_process'
import { runLegalityOnStartup } from '../../../services/rule/legality-coldstart.js'

const createFastify = (worksets: Array<{ id: number; division: string }>) => ({
  pgPool: { query: vi.fn(async () => ({ rows: worksets })) },
  redis: { set: vi.fn().mockResolvedValue('OK'), get: vi.fn().mockResolvedValue('computing') },
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
} as any)

describe('runLegalityOnStartup', () => {
  beforeEach(() => {
    for (const k of Object.keys(handlers)) delete handlers[k]
    vi.clearAllMocks()
  })

  it('spawns one live-legality per enabled LIVE workset with its OWN --division', async () => {
    const fastify = createFastify([
      { id: 103, division: 'P' },
      { id: 637, division: 'C' },
    ])
    await runLegalityOnStartup(fastify, 'F8')
    expect(spawn).toHaveBeenCalledTimes(2)

    const calls = (spawn as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => c[1] as string[])
    const p = calls.find((a) => a.includes('--division') && a[a.indexOf('--division') + 1] === 'P')
    const c = calls.find((a) => a.includes('--division') && a[a.indexOf('--division') + 1] === 'C')
    expect(p?.[p.indexOf('--group') + 1]).toBe('103')
    expect(c?.[c.indexOf('--group') + 1]).toBe('637')
  })

  it('skips when no enabled LIVE workset exists', async () => {
    const fastify = createFastify([])
    await runLegalityOnStartup(fastify, 'F8')
    expect(spawn).not.toHaveBeenCalled()
    expect(fastify.log.warn).toHaveBeenCalled()
  })
})
