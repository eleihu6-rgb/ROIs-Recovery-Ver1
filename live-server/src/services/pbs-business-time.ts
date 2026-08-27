const PBS_BUSINESS_TIME_MODE_KEY = 'PBS_BUSINESS_TIME_MODE'
const PBS_BUSINESS_TIME_ANCHOR_KEY = 'PBS_BUSINESS_TIME_ANCHOR'
const PBS_BUSINESS_TIME_ANCHOR_REAL_KEY = 'PBS_BUSINESS_TIME_ANCHOR_REAL'
const PBS_BUSINESS_TIME_KEYS = [
  PBS_BUSINESS_TIME_MODE_KEY,
  PBS_BUSINESS_TIME_ANCHOR_KEY,
  PBS_BUSINESS_TIME_ANCHOR_REAL_KEY,
] as const
const SHANGHAI_UTC_OFFSET_HOURS = 8

interface BusinessTimeQueryClient {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number | null }>
}

interface BusinessTimeConfig {
  mode: string
  anchor: string
  anchorReal: string
}

export interface PbsBusinessTimeStatus {
  mode: string
  source: 'system' | 'override'
  realNow: string
  businessNow: string
  anchor: string | null
  anchorReal: string | null
  warnings: string[]
}

export type PbsBusinessTimeUpdate =
  | { action: 'CLEAR' }
  | { action: 'SET'; businessTimeLocal: string }

const shanghaiDateTimeParts = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)

  return Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', string>
}

export const parseShanghaiBusinessTimeLocal = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim())
  if (!match) return null

  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw, secondRaw = '00'] = match
  const date = new Date(Date.UTC(
    Number(yearRaw),
    Number(monthRaw) - 1,
    Number(dayRaw),
    Number(hourRaw) - SHANGHAI_UTC_OFFSET_HOURS,
    Number(minuteRaw),
    Number(secondRaw),
  ))
  const parts = shanghaiDateTimeParts(date)

  if (
    parts.year !== yearRaw
    || parts.month !== monthRaw
    || parts.day !== dayRaw
    || parts.hour !== hourRaw
    || parts.minute !== minuteRaw
    || parts.second !== secondRaw
  ) {
    return null
  }

  return date
}

const parseConfigDate = (value: string): Date | null => {
  if (value.trim().length === 0) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export const buildPbsBusinessTimeStatus = (
  config: BusinessTimeConfig,
  realNow: Date,
): PbsBusinessTimeStatus => {
  const warnings: string[] = []
  const mode = config.mode.trim().toUpperCase() || 'ROLLING'
  const hasAnchor = config.anchor.trim().length > 0
  const hasAnchorReal = config.anchorReal.trim().length > 0
  const anchorBusinessTime = parseConfigDate(config.anchor)
  const anchorRealTime = parseConfigDate(config.anchorReal)

  if (mode !== 'ROLLING') {
    warnings.push(`Unsupported PBS business time mode: ${mode}.`)
  }
  if (hasAnchor && !anchorBusinessTime) {
    warnings.push('Invalid PBS business time anchor.')
  }
  if (hasAnchorReal && !anchorRealTime) {
    warnings.push('Invalid PBS business time real anchor.')
  }
  if (hasAnchor !== hasAnchorReal) {
    warnings.push('PBS business time override is incomplete.')
  }

  const canUseOverride = mode === 'ROLLING'
    && hasAnchor
    && hasAnchorReal
    && anchorBusinessTime !== null
    && anchorRealTime !== null
    && warnings.length === 0

  if (!canUseOverride) {
    return {
      mode,
      source: 'system',
      realNow: realNow.toISOString(),
      businessNow: realNow.toISOString(),
      anchor: config.anchor || null,
      anchorReal: config.anchorReal || null,
      warnings,
    }
  }

  const elapsedMs = realNow.getTime() - anchorRealTime.getTime()
  return {
    mode,
    source: 'override',
    realNow: realNow.toISOString(),
    businessNow: new Date(anchorBusinessTime.getTime() + elapsedMs).toISOString(),
    anchor: config.anchor,
    anchorReal: config.anchorReal,
    warnings,
  }
}

export const loadPbsBusinessTimeConfig = async (
  client: BusinessTimeQueryClient,
  liveSchema: string,
): Promise<BusinessTimeConfig> => {
  const result = await client.query(
    `select code, code_value
     from ${liveSchema}.dictionary
     where parent_code = 'SYS_PARAM'
       and code = any($1::text[])`,
    [PBS_BUSINESS_TIME_KEYS],
  )
  const values = new Map(
    (result.rows as Array<{ code: string; code_value: string | null }>)
      .map((row) => [row.code, row.code_value ?? '']),
  )

  return {
    mode: values.get(PBS_BUSINESS_TIME_MODE_KEY) ?? '',
    anchor: values.get(PBS_BUSINESS_TIME_ANCHOR_KEY) ?? '',
    anchorReal: values.get(PBS_BUSINESS_TIME_ANCHOR_REAL_KEY) ?? '',
  }
}

export const loadPbsBusinessTimeStatus = async (
  client: BusinessTimeQueryClient,
  liveSchema: string,
  realNow = new Date(),
): Promise<PbsBusinessTimeStatus> => {
  const config = await loadPbsBusinessTimeConfig(client, liveSchema)
  return buildPbsBusinessTimeStatus(config, realNow)
}

export const loadPbsBusinessNow = async (
  client: BusinessTimeQueryClient,
  liveSchema: string,
  realNow = new Date(),
): Promise<Date> => new Date((await loadPbsBusinessTimeStatus(client, liveSchema, realNow)).businessNow)

const upsertDictionaryValue = async (
  client: BusinessTimeQueryClient,
  liveSchema: string,
  code: string,
  name: string,
  value: string,
  userCode: string,
): Promise<void> => {
  const updateResult = await client.query(
    `update ${liveSchema}.dictionary
     set code_value = $1,
         name = $2,
         updated_by = $3,
         updated_at = now()
     where parent_code = 'SYS_PARAM'
       and code = $4`,
    [value, name, userCode, code],
  )

  if ((updateResult.rowCount ?? 0) > 0) return

  await client.query(
    `insert into ${liveSchema}.dictionary (
       created_by,
       updated_by,
       parent_code,
       code,
       name,
       idx,
       code_value
     )
     values ($1,$1,'SYS_PARAM',$2,$3,0,$4)`,
    [userCode, code, name, value],
  )
}

export const savePbsBusinessTimeConfig = async (
  client: BusinessTimeQueryClient,
  liveSchema: string,
  update: PbsBusinessTimeUpdate,
  userCode: string,
  realNow = new Date(),
): Promise<void> => {
  const anchor = update.action === 'SET'
    ? parseShanghaiBusinessTimeLocal(update.businessTimeLocal)
    : null

  if (update.action === 'SET' && !anchor) {
    throw new Error('INVALID_BUSINESS_TIME')
  }

  await upsertDictionaryValue(
    client,
    liveSchema,
    PBS_BUSINESS_TIME_MODE_KEY,
    'PBS business time mode / PBS业务时间模式',
    'ROLLING',
    userCode,
  )
  await upsertDictionaryValue(
    client,
    liveSchema,
    PBS_BUSINESS_TIME_ANCHOR_KEY,
    'PBS business time anchor / PBS业务时间锚点',
    anchor ? anchor.toISOString() : '',
    userCode,
  )
  await upsertDictionaryValue(
    client,
    liveSchema,
    PBS_BUSINESS_TIME_ANCHOR_REAL_KEY,
    'PBS real time anchor for business time / PBS业务时间对应真实锚点',
    anchor ? realNow.toISOString() : '',
    userCode,
  )
}
