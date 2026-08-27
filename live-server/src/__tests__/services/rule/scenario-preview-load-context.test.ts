import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Regression: preview-draft imports scenario-legality.mjs as a library. loadContext must
 * accept a caller-provided connected db — the module-level Client is only connected in CLI
 * main(), so omitting the arg hangs forever on an unconnected Client (SIT scenario assign).
 */
describe('scenario-legality loadContext db injection', () => {
  it('loadContext signature documents optional queryDb and preview passes a client', () => {
    const root = process.cwd()
    const script = readFileSync(path.join(root, 'scripts/scenario-legality.mjs'), 'utf8')
    const preview = readFileSync(
      path.join(root, 'src/services/rule/legality-preview.ts'),
      'utf8',
    )
    expect(script).toMatch(/export async function loadContext\(scenarioId,\s*queryDb\s*=\s*db\)/)
    expect(preview).toMatch(/loadContext\(input\.scenarioId,\s*catalogDb\)/)
    expect(preview).toMatch(/applySchemas/)
  })

  it('loadContext uses the injected queryDb for both catalog queries', async () => {
    const calls: string[] = []
    const queryDb = {
      query: vi.fn(async (text: string) => {
        calls.push(text)
        if (text.includes('from f8.scenario')) {
          return {
            rows: [{
              ruleset_id: 103,
              workset_id: 1,
              status: 'DONE',
              file_type: 'RO',
              str_dt_loc: new Date('2026-08-01T00:00:00Z'),
              end_dt_loc: new Date('2026-08-31T00:00:00Z'),
              filter_params: {},
              division: 'P',
            }],
          }
        }
        return { rows: [{ n: 12 }] }
      }),
    }
    // @ts-expect-error scenario-legality.mjs is a runtime script without generated declarations.
    const mod = await import('../../../../scripts/scenario-legality.mjs') as {
      loadContext: (id: number, db?: { query: typeof queryDb.query }) => Promise<{
        rulesetId: number
        loadedRosterCount: number
      } | null>
    }
    const ctx = await mod.loadContext(698, queryDb)
    expect(ctx?.rulesetId).toBe(103)
    expect(ctx?.loadedRosterCount).toBe(12)
    expect(queryDb.query).toHaveBeenCalledTimes(2)
    expect(calls.some((t) => t.includes('f8.scenario'))).toBe(true)
    expect(calls.some((t) => t.includes('scenario.roster_flight'))).toBe(true)
  })
})
