// Regression: "Remove result" (transition DONE/FAILED/PUBLISHED -> DRAFT) and
// deleting a scenario must clear the optimization-result partitions in the scenario
// schema (scenario.roster_flight + crew_manday_*). Before these fixes the rows were
// left behind, so the gantt — which reads those tables directly (gated on loaded
// roster rows, not status) — kept showing the stale result. We assert the actual DB
// DELETE effect (implementation-agnostic: works whether the service deletes inline or
// via clearScenarioResult). The deletion itself is verified against a live DB in
// scenario-result-clear.test.ts.
import { describe, it, expect, vi } from 'vitest'
import { scenarioService } from '../scenario-service.js'

// Minimal fastify stub: chainable drizzle mock returning `current`, plus redis /
// pgPool / log stubs that satisfy cache invalidation + raw deletes + workset cascade.
const makeFastify = (current: { id: number; status: string; worksetId?: number }) => {
  const row = { worksetId: 1, ...current }
  // Support: select().from().where() AND select().from().innerJoin().leftJoin().where()
  // and select().from().where().limit() for orphan workset check.
  const whereResult = async () => [row]
  const chain: Record<string, unknown> = {}
  chain.from = () => chain
  chain.innerJoin = () => chain
  chain.leftJoin = () => chain
  chain.where = () => ({
    ...chain,
    limit: async () => [],
    then: (resolve: (v: unknown) => unknown) => Promise.resolve([row]).then(resolve),
    // drizzle await on where()
    [Symbol.toStringTag]: 'Promise',
  })
  // Make where() thenable so `await db.select()...where()` works
  const makeWhere = () => {
    const p = Promise.resolve([row]) as Promise<unknown[]> & Record<string, unknown>
    p.limit = async () => []
    p.orderBy = () => p
    return p
  }
  const db = {
    select: () => ({
      from: () => ({
        where: makeWhere,
        innerJoin: () => ({
          leftJoin: () => ({ where: makeWhere }),
          where: makeWhere,
        }),
        leftJoin: () => ({ where: makeWhere }),
      }),
    }),
    update: () => ({ set: (s: Record<string, unknown>) => ({ where: () => ({ returning: async () => [{ ...row, ...s }] }) }) }),
    delete: () => ({ where: async () => [] }),
    insert: () => ({ values: () => ({ returning: async () => [row] }) }),
  }
  const redis = { del: vi.fn(async () => {}), scan: vi.fn(async () => ({ cursor: 0, keys: [] as string[] })) }
  const pgPool = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) }
  const log = { warn: vi.fn() }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db, redis, pgPool, log } as any
}

// scenario-schema tables this scenario_id had a `delete from scenario.<t>` issued for.
const deletedTablesFor = (pgPool: { query: { mock: { calls: unknown[][] } } }, id: number): string[] =>
  pgPool.query.mock.calls
    .filter((c) => typeof c[0] === 'string' && /delete from "?scenario"?\./i.test(c[0] as string) && (c[1] as unknown[])?.[0] === id)
    .map((c) => /delete from "?scenario"?\.(\w+)/i.exec(c[0] as string)?.[1] as string)

describe('scenarioService result cleanup wiring', () => {
  it('clears roster_flight + crew_manday partitions on DONE -> DRAFT (Remove result)', async () => {
    const fastify = makeFastify({ id: 7, status: 'DONE' })
    await scenarioService.transition(fastify, 7, 'DRAFT', 'tester')
    const tables = deletedTablesFor(fastify.pgPool, 7)
    expect(tables).toContain('roster_flight')
    expect(tables).toContain('crew_manday_fd_period')
  })

  it('clears roster_flight on FAILED -> DRAFT', async () => {
    const fastify = makeFastify({ id: 8, status: 'FAILED' })
    await scenarioService.transition(fastify, 8, 'DRAFT', 'tester')
    expect(deletedTablesFor(fastify.pgPool, 8)).toContain('roster_flight')
  })

  it('does NOT clear partitions when transitioning to a non-DRAFT status (DRAFT -> RUNNING)', async () => {
    const fastify = makeFastify({ id: 9, status: 'DRAFT' })
    await scenarioService.transition(fastify, 9, 'RUNNING', 'tester')
    expect(deletedTablesFor(fastify.pgPool, 9)).toHaveLength(0)
  })

  it('clears roster_flight + crew_manday partitions when deleting the scenario', async () => {
    const fastify = makeFastify({ id: 10, status: 'DONE', worksetId: 99 })
    await scenarioService.remove(fastify, 10)
    const tables = deletedTablesFor(fastify.pgPool, 10)
    expect(tables).toContain('roster_flight')
    expect(tables).toContain('crew_manday_cc_am_yearly')
    // Also clears PO pairing tables and workset-related deletes may fire via drizzle
    expect(tables).toContain('pairing')
  })
})
