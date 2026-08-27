import { describe, expect, it, vi } from 'vitest'

import { __test, scenarioParameterService } from '../../services/scenario/scenario-parameter-service'
import type { ScenarioParameterItem } from '../../services/scenario/scenario-parameter-service'

interface MockQuery {
  text: string
  values: unknown[]
}

interface MockFastify {
  pgPool: {
    query: ReturnType<typeof vi.fn>
  }
  queries: MockQuery[]
}

const templateRow = (
  code: string,
  type: 'OBJ' | 'LIST',
  paramVal: Record<string, unknown>,
  idx = 10,
) => ({
  id: '1',
  scenario_id: '0',
  code,
  type,
  description: null,
  idx,
  param_val: paramVal,
})

const scenarioRow = (
  scenarioId: number,
  code: string,
  type: 'OBJ' | 'LIST',
  paramVal: Record<string, unknown>,
  idx = 10,
) => ({
  id: '2',
  scenario_id: String(scenarioId),
  code,
  type,
  description: null,
  idx,
  param_val: paramVal,
})

const makeFastify = (templateRows: unknown[], scenarioRows: unknown[] = []): MockFastify => {
  const queries: MockQuery[] = []
  const pgPool = {
    query: vi.fn(async (text: string, values: unknown[] = []) => {
      queries.push({ text, values })
      if (text.includes('select') && values[0] === 0) return { rows: templateRows }
      if (text.includes('select')) return { rows: scenarioRows }
      return { rows: [] }
    }),
  }
  return { pgPool, queries }
}

describe('scenarioParameterService', () => {
  it('upserts algorithm templates and merges template defaults without scenario rows', async () => {
    const fastify = makeFastify([
      templateRow('solver_limits', 'OBJ', {
        schema: { maxIterations: { type: 'number' } },
        defaultValue: { maxIterations: 100 },
      }),
    ])

    const result = await scenarioParameterService.getMerged(fastify as never, 42)

    expect(result.summary).toEqual({ templateCount: 1, configuredCount: 0 })
    expect(result.items[0]).toMatchObject({
      code: 'solver_limits',
      value: { maxIterations: 100 },
      hasScenarioValue: false,
    })
    expect(fastify.queries.some((query) => query.text.includes('insert into scenario_parameter'))).toBe(true)
    expect(fastify.queries.some((query) => query.values[0] === 42 && query.text.includes('insert into scenario_parameter'))).toBe(true)
  })

  it('overlays scenario values on matching template codes', async () => {
    const fastify = makeFastify(
      [
        templateRow('solver_limits', 'OBJ', {
          schema: { maxIterations: { type: 'number' } },
          defaultValue: { maxIterations: 100 },
        }),
      ],
      [
        scenarioRow(42, 'solver_limits', 'OBJ', {
          value: { maxIterations: 120 },
        }),
      ],
    )

    const result = await scenarioParameterService.getMerged(fastify as never, 42)

    expect(result.summary).toEqual({ templateCount: 1, configuredCount: 1 })
    expect(result.items[0]).toMatchObject({
      code: 'solver_limits',
      value: { maxIterations: 120 },
      hasScenarioValue: true,
    })
  })

  it('rejects an unknown code on save', async () => {
    const fastify = makeFastify([
      templateRow('solver_limits', 'OBJ', {
        schema: {},
        defaultValue: {},
      }),
    ])

    await expect(
      scenarioParameterService.saveValues(fastify as never, 42, [{ code: 'bad_code', value: {} }], 'Ryan'),
    ).rejects.toThrow('Unsupported scenario parameter code: bad_code')
  })

  it('stores only value JSON when saving scenario rows', async () => {
    const fastify = makeFastify([
      templateRow('solver_limits', 'OBJ', {
        schema: { maxIterations: { type: 'number' } },
        defaultValue: { maxIterations: 100 },
      }),
    ])

    await scenarioParameterService.saveValues(
      fastify as never,
      42,
      [{ code: 'solver_limits', value: { maxIterations: 120 } }],
      'Ryan',
    )

    const insert = fastify.queries.find((query) => query.text.includes('insert into scenario_parameter'))
    expect(insert?.values[2]).toEqual({ value: { maxIterations: 120 } })
  })

  it('accepts CSV LIST values declared by the template', async () => {
    const fastify = makeFastify([
      templateRow('solver_csv_overrides', 'LIST', {
        schema: { format: 'csv', label: 'CSV Overrides' },
        defaultValue: { csv: '' },
      }),
    ])

    await scenarioParameterService.saveValues(
      fastify as never,
      42,
      [{ code: 'solver_csv_overrides', value: { csv: 'a,b' } }],
      'Ryan',
    )

    const insert = fastify.queries.find((query) => query.text.includes('insert into scenario_parameter'))
    expect(insert?.values[2]).toEqual({ value: { csv: 'a,b' } })
  })

  it('builds report-compatible algorithm payload and hydra args', () => {
    const payload = __test.buildAlgorithmPayload([
      {
        code: 'credit_range',
        type: 'OBJ',
        description: null,
        idx: 10,
        schema: {},
        defaultValue: {},
        value: { max: { CA: 90 }, min: { IFD: 78.5 } },
        hasScenarioValue: true,
      },
      {
        code: 'reserve_weekday_priority',
        type: 'OBJ',
        description: null,
        idx: 20,
        schema: {},
        defaultValue: {},
        value: { mon: 3, tue: 1, wed: 1, thu: 3, fri: 2, sat: 2, sun: 2 },
        hasScenarioValue: true,
      },
      {
        code: 'min_reserve_covered_pct',
        type: 'OBJ',
        description: null,
        idx: 30,
        schema: {},
        defaultValue: {},
        value: { pct: 60 },
        hasScenarioValue: true,
      },
      {
        code: 'day_pressure_spread',
        type: 'OBJ',
        description: null,
        idx: 40,
        schema: {},
        defaultValue: {},
        value: { enabled: true },
        hasScenarioValue: true,
      },
    ])

    expect(payload.hydra_args).toContain('++solver.rank_groups.pilot.credit_targets.CA.max=90')
    expect(payload.hydra_args).toContain('++solver.rank_groups.cabin.credit_targets.IFD.min=78.5')
    expect(payload.hydra_args).toContain('++solver.min_reserve_covered_percentage=60')
    expect(payload.hydra_args).toContain('++solver.reserve_weekday_priority.tue=1')
    expect(payload.hydra_args).toContain('++solver.day_pressure_spread=true')
  })

  it('trims credit ranks and defaults reserve coverage to zero by division', () => {
    const item = (value: Record<string, unknown>): ScenarioParameterItem => ({
      code: 'credit_range',
      type: 'OBJ',
      description: null,
      idx: 10,
      schema: {},
      defaultValue: {},
      value,
      hasScenarioValue: true,
    })

    const pilot = __test.buildAlgorithmPayload([item({
      min: { CA: 75, FO: 80, IFD: 81, FA: 82 },
      max: { CA: 92, FO: 85, IFD: 86, FA: 87 },
    })], 'P')
    const cabin = __test.buildAlgorithmPayload([item({
      min: { CA: 75, FO: 80, IFD: 81, FA: 82 },
      max: { CA: 92, FO: 85, IFD: 86, FA: 87 },
    })], 'C')

    expect(Object.keys((pilot.meta as Record<string, unknown>).credit_min as object)).toEqual(['CA', 'FO'])
    expect(Object.keys((cabin.meta as Record<string, unknown>).credit_min as object)).toEqual(['IFD', 'FA'])
    const pilotArgs = pilot.hydra_args as string[]
    const cabinArgs = cabin.hydra_args as string[]
    expect(pilotArgs).toContain('++solver.min_reserve_covered_percentage=0')
    expect(pilotArgs.some((arg) => arg.includes('.IFD.') || arg.includes('.FA.'))).toBe(false)
    expect(cabinArgs.some((arg) => arg.includes('.CA.') || arg.includes('.FO.'))).toBe(false)
  })

  it('normalizes omitted credit ranks to the Report defaults for version comparison', () => {
    expect(__test.algorithmSnapshotFromPayload({
      meta: { credit_min: { CA: null }, credit_max: {} },
      floor_rescue_rules: {},
    })).toMatchObject({
      credit_range: {
        min: { CA: 75, FO: 80, IFD: 80, FA: 80 },
        max: { CA: 92, FO: 85, IFD: 85, FA: 85 },
      },
    })
  })
})
