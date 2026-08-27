import type { FastifyInstance } from 'fastify'

export type ScenarioParameterType = 'OBJ' | 'LIST'

export interface ScenarioParameterItem {
  code: string
  type: ScenarioParameterType
  description: string | null
  idx: number | null
  schema: Record<string, unknown>
  defaultValue: unknown
  value: unknown
  hasScenarioValue: boolean
}

export interface ScenarioParameterSaveItem {
  code: string
  value: unknown
}

interface ScenarioParameterRow {
  id: string | number
  scenario_id: string | number
  code: string
  param_val: Record<string, unknown>
  description: string | null
  idx: number | null
  type: string | null
}

export const ALGORITHM_RANKS = ['CA', 'FO', 'IFD', 'FA'] as const
export const DEFAULT_CREDIT_MIN: Record<string, number> = { CA: 75, FO: 80, IFD: 80, FA: 80 }
export const DEFAULT_CREDIT_MAX: Record<string, number> = { CA: 92, FO: 85, IFD: 85, FA: 85 }
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

const ranksForDivision = (division: unknown): readonly string[] => {
  const code = String(division ?? '').trim().toUpperCase()
  if (code === 'P' || code.startsWith('PILOT')) return ['CA', 'FO']
  if (code === 'C' || code.startsWith('CABIN')) return ['IFD', 'FA']
  return ALGORITHM_RANKS
}

const DEFAULT_ALGORITHM_PARAMETER_TEMPLATES = [
  {
    code: 'credit_range',
    type: 'OBJ',
    idx: 10,
    description: 'Credit Range',
    paramVal: {
      schema: { editor: 'credit_range' },
      defaultValue: {
        min: DEFAULT_CREDIT_MIN,
        max: DEFAULT_CREDIT_MAX,
      },
    },
  },
  {
    code: 'floor_rescue_rules',
    type: 'OBJ',
    idx: 20,
    description: 'Floor Rescue',
    paramVal: {
      schema: { editor: 'floor_rescue' },
      defaultValue: {
        reserve_single_days: false,
        reserve_day_balance: true,
        avoid_pairing_bids: true,
        requested_days_off: true,
        avoid_reserve_bids: true,
        avoid_reserve_line_rules: true,
        award_reserve_and_commuter_blocks: true,
        min_base_layover_bids: true,
      },
    },
  },
  {
    code: 'reserve_weekday_priority',
    type: 'OBJ',
    idx: 30,
    description: 'Reserve Priority',
    paramVal: {
      schema: { editor: 'reserve_priority' },
      defaultValue: { mon: 2, tue: 3, wed: 3, thu: 1, fri: 1, sat: 1, sun: 2 },
    },
  },
  {
    code: 'min_reserve_covered_pct',
    type: 'OBJ',
    idx: 40,
    description: 'Min Reserve Coverage %',
    paramVal: {
      schema: { editor: 'min_reserve_coverage' },
      defaultValue: { pct: 0 },
    },
  },
  {
    code: 'day_pressure_spread',
    type: 'OBJ',
    idx: 50,
    description: 'Day Pressure Spread',
    paramVal: {
      schema: { editor: 'day_pressure_spread' },
      defaultValue: { enabled: false },
    },
  },
  {
    code: 'team_rules',
    type: 'LIST',
    idx: 60,
    description: 'Team Rules',
    paramVal: {
      schema: { editor: 'team_rules' },
      defaultValue: { teams: [], rules: [] },
    },
  },
  {
    code: 'crew_bids',
    type: 'OBJ',
    idx: 70,
    description: 'Crew Bid',
    paramVal: {
      schema: { editor: 'crew_bids' },
      defaultValue: { enabled: true },
    },
  },
] as const

const normalizeParamVal = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

const ensureDefaultTemplates = async (fastify: FastifyInstance): Promise<void> => {
  await fastify.pgPool.query(
    `
      delete from scenario_parameter
      where scenario_id = 0
        and code in ('floor_rescue', 'reserve_priority', 'min_reserve_coverage_pct')
    `,
  )
  for (const template of DEFAULT_ALGORITHM_PARAMETER_TEMPLATES) {
    await fastify.pgPool.query(
      `
        insert into scenario_parameter
          (scenario_id, code, param_val, description, idx, type, created_by, updated_by)
        values (0, $1, $2::jsonb, $3, $4, $5, 'system', 'system')
        on conflict (scenario_id, code) do update set
          param_val = excluded.param_val,
          description = excluded.description,
          idx = excluded.idx,
          type = excluded.type,
          updated_by = excluded.updated_by,
          updated_at = now()
      `,
      [template.code, JSON.stringify(template.paramVal), template.description, template.idx, template.type],
    )
  }
}

const ensureScenarioDefaults = async (
  fastify: FastifyInstance,
  scenarioId: number,
  username = 'system',
): Promise<void> => {
  if (scenarioId <= 0) return
  await fastify.pgPool.query(
    `
      insert into scenario_parameter
        (scenario_id, code, param_val, description, idx, type, created_by, updated_by)
      select $1, template.code,
             jsonb_build_object('value', template.param_val->'defaultValue'),
             template.description, template.idx, template.type, $2, $2
        from scenario_parameter template
       where template.scenario_id = 0
      on conflict (scenario_id, code) do nothing
    `,
    [scenarioId, username],
  )
}

const readRows = async (fastify: FastifyInstance, scenarioId: number): Promise<ScenarioParameterRow[]> => {
  const result = await fastify.pgPool.query<ScenarioParameterRow>(
    `
      select id, scenario_id, code, param_val, description, idx, type
      from scenario_parameter
      where scenario_id = $1
      order by idx nulls last, code
    `,
    [scenarioId],
  )
  return result.rows.map((row) => ({ ...row, param_val: normalizeParamVal(row.param_val) }))
}

const templateType = (row: ScenarioParameterRow): ScenarioParameterType => (row.type === 'LIST' ? 'LIST' : 'OBJ')

const mergeRow = (template: ScenarioParameterRow, scenarioRow?: ScenarioParameterRow): ScenarioParameterItem => {
  const templateVal = normalizeParamVal(template.param_val)
  const scenarioVal = normalizeParamVal(scenarioRow?.param_val)
  return {
    code: template.code,
    type: templateType(template),
    description: template.description,
    idx: template.idx,
    schema: normalizeParamVal(templateVal.schema),
    defaultValue: templateVal.defaultValue ?? {},
    value: scenarioRow ? scenarioVal.value ?? {} : templateVal.defaultValue ?? {},
    hasScenarioValue: Boolean(scenarioRow),
  }
}

const validateListValue = (template: ScenarioParameterRow, value: unknown): void => {
  const obj = normalizeParamVal(value)
  const schema = normalizeParamVal(template.param_val.schema)
  const format = schema.format
  if (schema.editor === 'team_rules' && Array.isArray(obj.teams) && Array.isArray(obj.rules)) return
  if (format === 'csv' && typeof obj.csv === 'string') return
  if (format === 'rows' && Array.isArray(obj.rows)) return
  throw new Error(`Invalid LIST value for scenario parameter code: ${template.code}`)
}

const validateObjValue = (template: ScenarioParameterRow, value: unknown): void => {
  const obj = normalizeParamVal(value)
  const schema = normalizeParamVal(template.param_val.schema) as Record<string, { type?: string; optional?: boolean }>

  if (typeof schema.editor === 'string') return

  for (const [field, def] of Object.entries(schema)) {
    const fieldValue = obj[field]
    if (fieldValue == null && def.optional !== true) {
      throw new Error(`Missing parameter field: ${template.code}.${field}`)
    }
    if (fieldValue == null) continue
    if (def.type === 'number' && typeof fieldValue !== 'number') {
      throw new Error(`Invalid number field: ${template.code}.${field}`)
    }
    if (def.type === 'boolean' && typeof fieldValue !== 'boolean') {
      throw new Error(`Invalid boolean field: ${template.code}.${field}`)
    }
    if ((def.type === 'string' || def.type === 'select') && typeof fieldValue !== 'string') {
      throw new Error(`Invalid string field: ${template.code}.${field}`)
    }
  }

  for (const key of Object.keys(obj)) {
    if (!(key in schema)) throw new Error(`Unknown parameter field: ${template.code}.${key}`)
  }
}

const validateValue = (template: ScenarioParameterRow, value: unknown): void => {
  if (templateType(template) === 'LIST') {
    validateListValue(template, value)
    return
  }
  validateObjValue(template, value)
}

const optionalPositiveNumber = (value: unknown): number | null => {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

const optionalPercent = (value: unknown): number | null => {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null
}

const completeReservePriority = (value: unknown): Record<string, number> | null => {
  const obj = normalizeParamVal(value)
  const out: Record<string, number> = {}
  for (const day of WEEKDAYS) {
    const n = Number(obj[day])
    if (!Number.isInteger(n) || n < 1 || n > 9) return null
    out[day] = n
  }
  return out
}

const boolMap = (value: unknown, defaults: Record<string, boolean>): Record<string, boolean> => {
  const obj = normalizeParamVal(value)
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [
    key,
    typeof obj[key] === 'boolean' ? obj[key] : fallback,
  ]))
}

const cleanTeamRules = (value: unknown): { teams: unknown[]; rules: unknown[] } => {
  const obj = normalizeParamVal(value)
  return {
    teams: Array.isArray(obj.teams) ? obj.teams : [],
    rules: Array.isArray(obj.rules) ? obj.rules : [],
  }
}

const buildAlgorithmPayload = (items: ScenarioParameterItem[], division?: string | null): Record<string, unknown> => {
  const byCode = new Map(items.map((item) => [item.code, normalizeParamVal(item.value)]))
  const credit = byCode.get('credit_range') ?? {}
  const creditMin = normalizeParamVal(credit.min)
  const creditMax = normalizeParamVal(credit.max)
  const credit_min: Record<string, number> = {}
  const credit_max: Record<string, number> = {}
  for (const rank of ranksForDivision(division)) {
    const min = optionalPositiveNumber(creditMin[rank])
    const max = optionalPositiveNumber(creditMax[rank])
    credit_min[rank] = min ?? DEFAULT_CREDIT_MIN[rank]
    credit_max[rank] = max ?? DEFAULT_CREDIT_MAX[rank]
  }

  const floorDefaults = normalizeParamVal(
    DEFAULT_ALGORITHM_PARAMETER_TEMPLATES.find((item) => item.code === 'floor_rescue_rules')?.paramVal.defaultValue,
  ) as Record<string, boolean>
  const floor_rescue_rules = boolMap(byCode.get('floor_rescue_rules'), floorDefaults)
  const reserve_weekday_priority = completeReservePriority(byCode.get('reserve_weekday_priority'))
  const pct = optionalPercent(normalizeParamVal(byCode.get('min_reserve_covered_pct')).pct) ?? 0
  const dayPressure = normalizeParamVal(byCode.get('day_pressure_spread')).enabled === true
  const team_rules = cleanTeamRules(byCode.get('team_rules'))

  const hydra_args: string[] = []
  const rankGroup = (rank: string): 'pilot' | 'cabin' => (rank === 'CA' || rank === 'FO' ? 'pilot' : 'cabin')
  for (const [rank, value] of Object.entries(credit_max)) {
    hydra_args.push(`++solver.rank_groups.${rankGroup(rank)}.credit_targets.${rank}.max=${value}`)
  }
  for (const [rank, value] of Object.entries(credit_min)) {
    hydra_args.push(`++solver.rank_groups.${rankGroup(rank)}.credit_targets.${rank}.min=${value}`)
  }
  hydra_args.push(`++solver.min_reserve_covered_percentage=${pct}`)
  if (reserve_weekday_priority) {
    for (const day of WEEKDAYS) hydra_args.push(`++solver.reserve_weekday_priority.${day}=${reserve_weekday_priority[day]}`)
  }
  if (dayPressure) hydra_args.push('++solver.day_pressure_spread=true')

  return {
    meta: {
      credit_max,
      credit_min,
      ...(reserve_weekday_priority ? { reserve_weekday_priority } : {}),
      min_reserve_covered_pct: pct,
      ...(dayPressure ? { day_pressure_spread: true } : {}),
      ...(team_rules.teams.length || team_rules.rules.length ? { team_rules } : {}),
    },
    floor_rescue_rules,
    hydra_args,
  }
}

/** Shape used by version Differences; it matches algorithm_meta.json semantics. */
export const algorithmSnapshotFromPayload = (payload: Record<string, unknown>, division?: string | null): Record<string, unknown> => {
  const meta = normalizeParamVal(payload.meta)
  const creditMin = normalizeParamVal(meta.credit_min)
  const creditMax = normalizeParamVal(meta.credit_max)
  return {
    credit_range: {
      min: Object.fromEntries(ranksForDivision(division).map((rank) => [rank, optionalPositiveNumber(creditMin[rank]) ?? DEFAULT_CREDIT_MIN[rank]])),
      max: Object.fromEntries(ranksForDivision(division).map((rank) => [rank, optionalPositiveNumber(creditMax[rank]) ?? DEFAULT_CREDIT_MAX[rank]])),
    },
    floor_rescue_rules: normalizeParamVal(payload.floor_rescue_rules),
    reserve_weekday_priority: meta.reserve_weekday_priority ?? {},
    min_reserve_covered_pct: { pct: meta.min_reserve_covered_pct ?? 0 },
    day_pressure_spread: { enabled: meta.day_pressure_spread === true },
    team_rules: meta.team_rules ?? { teams: [], rules: [] },
  }
}

export const scenarioParameterService = {
  async getDivision(fastify: FastifyInstance, scenarioId: number): Promise<string | null> {
    const result = await fastify.pgPool.query<{ division: string | null }>(
      `select w.division
         from scenario s
         join workset w on w.id = s.workset_id
        where s.id = $1`,
      [scenarioId],
    )
    return result.rows[0]?.division ?? null
  },

  async ensureDefaults(fastify: FastifyInstance, scenarioId: number, username = 'system'): Promise<void> {
    await ensureDefaultTemplates(fastify)
    await ensureScenarioDefaults(fastify, scenarioId, username)
  },

  async getMerged(
    fastify: FastifyInstance,
    scenarioId: number,
  ): Promise<{ items: ScenarioParameterItem[]; summary: { templateCount: number; configuredCount: number } }> {
    await this.ensureDefaults(fastify, scenarioId)
    const templates = await readRows(fastify, 0)
    const scenarioRows = scenarioId > 0 ? await readRows(fastify, scenarioId) : []
    const scenarioByCode = new Map(scenarioRows.map((row) => [row.code, row]))
    const items = templates.map((template) => mergeRow(template, scenarioByCode.get(template.code)))
    return {
      items,
      summary: {
        templateCount: items.length,
        configuredCount: items.filter((item) => item.hasScenarioValue).length,
      },
    }
  },

  async saveValues(
    fastify: FastifyInstance,
    scenarioId: number,
    items: ScenarioParameterSaveItem[],
    username: string,
  ): Promise<void> {
    if (scenarioId <= 0) throw new Error('Scenario parameter templates cannot be edited here')
    const templates = await readRows(fastify, 0)
    const templateByCode = new Map(templates.map((row) => [row.code, row]))

    for (const item of items) {
      const template = templateByCode.get(item.code)
      if (!template) throw new Error(`Unsupported scenario parameter code: ${item.code}`)
      validateValue(template, item.value)
      await fastify.pgPool.query(
        `
          insert into scenario_parameter
            (scenario_id, code, param_val, description, idx, type, created_by, updated_by)
          values ($1, $2, $3::jsonb, $4, $5, $6, $7, $7)
          on conflict (scenario_id, code) do update set
            param_val = excluded.param_val,
            description = excluded.description,
            idx = excluded.idx,
            type = excluded.type,
            updated_by = excluded.updated_by,
            updated_at = now()
        `,
        [
          scenarioId,
          template.code,
          { value: item.value },
          template.description,
          template.idx,
          template.type,
          username,
        ],
      )
    }
  },

  async copyValues(
    fastify: FastifyInstance,
    sourceScenarioId: number,
    targetScenarioId: number,
    username: string,
  ): Promise<void> {
    const sourceRows = await readRows(fastify, sourceScenarioId)
    for (const row of sourceRows) {
      await fastify.pgPool.query(
        `
          insert into scenario_parameter
            (scenario_id, code, param_val, description, idx, type, created_by, updated_by)
          values ($1, $2, $3::jsonb, $4, $5, $6, $7, $7)
          on conflict (scenario_id, code) do update set
            param_val = excluded.param_val,
            description = excluded.description,
            idx = excluded.idx,
            type = excluded.type,
            updated_by = excluded.updated_by,
            updated_at = now()
        `,
        [
          targetScenarioId,
          row.code,
          row.param_val,
          row.description,
          row.idx,
          row.type,
          username,
        ],
      )
    }
  },

  async getEffectiveExportRows(
    fastify: FastifyInstance,
    scenarioId: number,
  ): Promise<Record<string, unknown>[]> {
    const merged = await this.getMerged(fastify, scenarioId)
    return merged.items.map((item) => ({
      scenario_id: scenarioId,
      code: item.code,
      param_val: JSON.stringify({ value: item.value }),
      description: item.description,
      idx: item.idx,
      type: item.type,
    }))
  },

  async getEffectiveAlgorithmPayload(
    fastify: FastifyInstance,
    scenarioId: number,
  ): Promise<Record<string, unknown>> {
    const merged = await this.getMerged(fastify, scenarioId)
    const division = await this.getDivision(fastify, scenarioId)
    return buildAlgorithmPayload(merged.items, division)
  },
}

export const __test = {
  buildAlgorithmPayload,
  algorithmSnapshotFromPayload,
  ensureScenarioDefaults,
}
