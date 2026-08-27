import { describe, it, expect, vi } from 'vitest'
import { gunzipSync } from 'node:zlib'
import { buildRoInputGz, countScenarioRunScope, __test } from '../../../services/scenario/scenario-export-service.js'
import { scenarioParameterService } from '../../../services/scenario/scenario-parameter-service.js'

function makeFastify(rowsByTable: Record<string, Record<string, unknown>[]>) {
  const calls: string[] = []
  return {
    calls,
    db: {
      execute: vi.fn(async (q: { __table?: string }) => {
        const table = q.__table ?? 'unknown'
        calls.push(table)
        return { rows: rowsByTable[table] ?? [] }
      }),
    },
    pgPool: {
      query: vi.fn(async () => ({ rows: [] })),
    },
  } as never
}

const scenario = {
  id: 7,
  worksetId: 70,
  strDtLoc: new Date('2026-06-01T00:00:00Z'),
  endDtLoc: new Date('2026-06-30T00:00:00Z'),
  filterParams: {},
  rulesetId: 103,
}

describe('scenario export', () => {
  it('toCsvSection renders ## header + CSV with escaping', () => {
    const section = __test.toCsvSection('crew', [
      { id: 1, name: 'A,B', note: 'x"y' },
      { id: 2, name: 'C', note: '' },
    ])
    expect(section).toContain('## crew')
    expect(section).toContain('id,name,note')
    expect(section).toContain('1,"A,B","x""y"')
    expect(section).toContain('2,C,')
  })

  it('empty table still emits its ## header', () => {
    const section = __test.toCsvSection('rank', [])
    expect(section.trim()).toBe('## rank')
  })

  it('buildRoInputGz issues exactly one query per table (no N+1) and gzips all sections', async () => {
    const fastify = makeFastify({
      crew: [{ crew_id: 'F8001', first_name: 'Amy' }],
      pairing: [{ id: 5001, pairing_no: 'P1' }],
      // Model A `workset` is the only kept rule-related section; the RUST solver
      // reads legality params from rule.param_json directly.
      workset: [{ id: 103, name: 'PBS Solver Ruleset' }],
    })
    const buf = await buildRoInputGz(fastify, scenario as never)
    const text = gunzipSync(buf).toString('utf-8')

    expect(text).toContain('## crew')
    expect(text).toContain('F8001')
    expect(text).toContain('## pairing')
    expect(text).toContain('## workset')
    expect(text).toContain('PBS Solver Ruleset')

    // The dead Model B sections are gone (dropped with the rule_parameter table).
    expect(text).not.toContain('## rule_group')
    expect(text).not.toContain('## rule_group_instance')
    expect(text).not.toContain('## rule_instance')
    expect(text).not.toContain('## rule_template')
    expect(__test.TABLE_NAMES).not.toContain('rule_group')
    expect(__test.TABLE_NAMES).not.toContain('rule_template')

    const calls = (fastify as unknown as { calls: string[] }).calls
    // one query per table, no duplicates, count == spec size
    expect(new Set(calls).size).toBe(calls.length)
    expect(calls.length).toBe(__test.TABLE_COUNT)
    // every spec table queried exactly once
    expect(new Set(calls)).toEqual(new Set(__test.TABLE_NAMES))
  })

  it('buildRoInputGz includes effective scenario_parameter rows', async () => {
    const exportSpy = vi.spyOn(scenarioParameterService, 'getEffectiveExportRows').mockResolvedValueOnce([
      {
        scenario_id: 7,
        code: 'solver_limits',
        param_val: JSON.stringify({ value: { maxIterations: 120 } }),
        description: 'Limits',
        idx: 10,
        type: 'OBJ',
      },
    ])
    const algorithmSpy = vi.spyOn(scenarioParameterService, 'getEffectiveAlgorithmPayload').mockResolvedValueOnce({
      hydra_args: ['++solver.day_pressure_spread=true'],
    })
    const fastify = makeFastify({})

    const buf = await buildRoInputGz(fastify, scenario as never)
    const text = gunzipSync(buf).toString('utf-8')

    expect(exportSpy).toHaveBeenCalledWith(fastify, 7)
    expect(text).toContain('## scenario_parameter')
    expect(text).toContain('solver_limits')
    expect(text).toContain('{""value"":{""maxIterations"":120}}')
    expect(text).toContain('## algorithm_parameters')
    expect(text).toContain('++solver.day_pressure_spread=true')
    expect(algorithmSpy).toHaveBeenCalledWith(fastify, 7)
    exportSpy.mockRestore()
    algorithmSpy.mockRestore()
  })

  it('buildRoInputGz includes scoped live manday sections', async () => {
    const fastify = makeFastify({
      crew_manday_fd_period: [{ crew_id: 'F8001', roster_period: '2026-06', credit: 1200 }],
      crew_manday_fd_yearly: [{ crew_id: 'F8001', year: '2026', blh: 3000 }],
      crew_manday_cc_am_period: [{ crew_id: 'F8002', roster_period: '2026-06', credit: 900 }],
      crew_manday_cc_am_yearly: [{ crew_id: 'F8002', year: '2026', blh: 2400 }],
    })

    const buf = await buildRoInputGz(fastify, scenario as never)
    const text = gunzipSync(buf).toString('utf-8')

    expect(text).toContain('## crew_manday_fd_period')
    expect(text).toContain('F8001,2026-06,1200')
    expect(text).toContain('## crew_manday_fd_yearly')
    expect(text).toContain('F8001,2026,3000')
    expect(text).toContain('## crew_manday_cc_am_period')
    expect(text).toContain('F8002,2026-06,900')
    expect(text).toContain('## crew_manday_cc_am_yearly')
    expect(text).toContain('F8002,2026,2400')
  })

  it('buildRoInputGz accepts string scenario dates when adding manday sections', async () => {
    const fastify = makeFastify({
      crew_manday_fd_period: [{ crew_id: 'F8001', roster_period: '2026-07', credit: 1200 }],
    })

    const buf = await buildRoInputGz(fastify, {
      ...scenario,
      strDtLoc: '2026-07-01T00:00:00.000Z',
      endDtLoc: '2026-07-31T00:00:00.000Z',
    } as never)
    const text = gunzipSync(buf).toString('utf-8')

    expect(text).toContain('## crew_manday_fd_period')
    expect(text).toContain('F8001,2026-07,1200')
  })

  it('resolveRulesetId returns scenario.rulesetId directly', () => {
    expect(__test.resolveRulesetId(scenario as never)).toBe(103)
    expect(__test.resolveRulesetId({ ...scenario, rulesetId: 433 } as never)).toBe(433)
  })

  it('countScenarioRunScope returns crew and pairing counts from exporter scopes', async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({ rows: [{ count: 4 }] })
      .mockResolvedValueOnce({ rows: [{ count: 9 }] })
    const fastify = { db: { execute } } as never

    await expect(countScenarioRunScope(fastify, scenario as never)).resolves.toEqual({
      crewCount: 4,
      pairingCount: 9,
    })
    expect(execute).toHaveBeenCalledTimes(2)
  })
})
