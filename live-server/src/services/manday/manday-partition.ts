/**
 * 工时数据时间分区工具 — Manday Time-Interval Partition
 *
 * crew_manday 六张表按三个时间粒度存储数据：
 *
 *   ┌─────────────────────────────────┬─────────────────┬─────────────────────────┐
 *   │ 表                              │ 时间键           │ 格式                    │
 *   ├─────────────────────────────────┼─────────────────┼─────────────────────────┤
 *   │ crew_manday_fd_daily            │ crew_base_dt    │ DATE  (YYYY-MM-DD)      │
 *   │ crew_manday_cc_am_daily         │ crew_base_dt    │ DATE  (YYYY-MM-DD)      │
 *   │ crew_manday_fd_period          │ roster_period      │ CHAR(7) YYYY-MM         │
 *   │ crew_manday_cc_am_period       │ roster_period      │ CHAR(7) YYYY-MM         │
 *   │ crew_manday_fd_yearly           │ year            │ CHAR(4) YYYY            │
 *   │ crew_manday_cc_am_yearly        │ year            │ CHAR(4) YYYY            │
 *   └─────────────────────────────────┴─────────────────┴─────────────────────────┘
 *
 * 本模块提供：
 *   1. mandayTimeKeys()      — 从任意日期推导三个时间键
 *   2. partitionManday()     — 将日级记录分拆聚合为 daily / monthly / yearly 三份
 *   3. MANDAY_FD_NUMERIC_FIELDS    — FD 表数值型字段列表（用于 SUM 聚合）
 *   4. MANDAY_CC_AM_NUMERIC_FIELDS — CC/AM 表数值型字段列表
 *
 * 适用场景：
 *   - connector-server 工时入向接口
 *   - rule-engine 计算结果回写
 *   - 其他需要一次写入全部三个粒度的调用方
 *
 * 调用方只需按各自 Drizzle schema 挑选字段上层 insert/upsert，
 * 本函数不直接操作数据库。
 */

// ---------------------------------------------------------------------------
// Time key helpers
// ---------------------------------------------------------------------------

/** 三个时间粒度的键，与数据库列一一对应 */
export interface MandayTimeKeys {
  /** 'YYYY-MM-DD' → crew_base_dt (DATE) */
  crewBaseDt: string
  /** 'YYYY-MM'    → roster_period   (CHAR 7) */
  yearMonth: string
  /** 'YYYY'       → year         (CHAR 4) */
  year: string
}

/**
 * 从一个日历日期推导全部三个时间分区键。
 * 接受 Date 对象或 'YYYY-MM-DD' / ISO 字符串，使用本地时区日期部分。
 */
export function mandayTimeKeys(date: Date | string): MandayTimeKeys {
  const d = typeof date === 'string' ? new Date(date) : date
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return {
    crewBaseDt: `${y}-${m}-${day}`,
    yearMonth: `${y}-${m}`,
    year: String(y),
  }
}

/**
 * A roster-period range, used to map a crew_base_dt to its RP for period-grain
 * aggregation. rpStart/rpEnd are 'YYYY-MM-DD' (date-only, UTC midnight).
 */
export interface RpRange {
  rosterPeriod: string
  rpStart: string
  rpEnd: string
}

/**
 * Resolve the roster period whose [rpStart, rpEnd] (UTC dates) contains the given
 * 'YYYY-MM-DD' crew_base_dt. Returns null if the date falls in no RP. RPs are
 * seeded contiguously, so a crew_base_dt maps to exactly one RP.
 */
export function rpForDate(ranges: readonly RpRange[] | undefined, ymd: string): RpRange | null {
  if (!ranges || ranges.length === 0) return null
  const ts = Date.parse(ymd + 'T00:00:00.000Z')
  for (const rp of ranges) {
    const s = Date.parse(rp.rpStart + 'T00:00:00.000Z')
    const e = Date.parse(rp.rpEnd + 'T23:59:59.999Z')
    if (ts >= s && ts <= e) return rp
  }
  return null
}

// ---------------------------------------------------------------------------
// Numeric field constants
// ---------------------------------------------------------------------------

/**
 * FD（飞行员）工时表的数值型字段（camelCase，与 Drizzle 模型字段名一致）。
 * 这些字段在月度/年度聚合时执行 SUM；其余字段（actingRank、fleet 等）
 * 取分组内第一条记录的值。
 */
export const MANDAY_FD_NUMERIC_FIELDS: readonly string[] = [
  'ft', 'augumentFt', 'doubleFt',
  'blh', 'augumentBlh', 'doubleBlh',
  'fdp', 'dp', 'nightDp',
  'travel', 'credit', 'fatigue',
  'isLeave', 'isDayOff', 'standby',
  'actTakeOffs', 'actLandings',
  'ground', 'perDiem', 'normalWp', 'extendWp',
  'csb', 'hsb', 'asb', 'isAl',
  'updowns', 'cat2Updowns', 'expBlh', 'quarantine',
  'highPlateau', 'takeoff', 'landing',
  'workingHour', 'pncCredit', 'simCredit',
  'alCredit', 'olCredit', 'freighterCredit',
  'layoverDay', 'lhPerDiem', 'sbyDp', 'dhdDp',
  'intBlh', 'fltNum', 'crossTzDutyCount',
  'layoverTimes', 'layoverDuration',
  'schCredit', 'schPerDiem', 'schLhPerDiem',
  'schPncCredit', 'schSimCredit', 'schAlCredit',
  'schOlCredit', 'schFreighterCredit',
] as const

/**
 * CC/AM（客舱乘务员）工时表的数值型字段。
 */
export const MANDAY_CC_AM_NUMERIC_FIELDS: readonly string[] = [
  'ft', 'blh', 'fdp', 'dp', 'custDp', 'nightDp',
  'travel', 'credit', 'fatigue',
  'isLeave', 'isDayOff', 'standby', 'ground',
  'perDiem', 'normalWp', 'extendWp',
  'csb', 'hsb', 'asb', 'isAl', 'quarantine',
  'highPlateau', 'workingHour',
  'pncCredit', 'simCredit', 'alCredit', 'olCredit', 'freighterCredit',
  'layoverDay', 'lhPerDiem', 'sbyDp', 'dhdDp',
  'intBlh', 'fltNum', 'crossTzDutyCount',
  'layoverTimes', 'layoverDuration',
  'custData1', 'custData2',
] as const

// ---------------------------------------------------------------------------
// Core partition function
// ---------------------------------------------------------------------------

/** 入参行的最小约束：必须包含 crewId 和 crewBaseDt */
export type MandaySourceRow = {
  crewId: string
  crewBaseDt: string | Date
  [field: string]: unknown
}

/** partitionManday 的返回类型 */
export interface MandayPartitioned {
  /**
   * 日级：一行对应一个 (crewId, crewBaseDt)。
   * crewBaseDt 已规范化为 'YYYY-MM-DD' 字符串。
   * 同一 (crewId, crewBaseDt) 出现多次时，后者覆盖前者。
   */
  daily: Array<Record<string, unknown> & { crewId: string; crewBaseDt: string }>

  /**
   * 月级：一行对应一个 (crewId, yearMonth)。
   * 数值型字段为该月所有日级记录的 SUM；非数值字段取分组第一条记录。
   * 调用方在 upsert 前应移除目标表没有的字段（如 crewBaseDt）。
   */
  monthly: Array<Record<string, unknown> & { crewId: string; rosterPeriod: string; rpStart?: string; rpEnd?: string }>

  /**
   * 年级：一行对应一个 (crewId, year)。
   * 同月级，数值字段累加；非数值字段取第一条。
   */
  yearly: Array<Record<string, unknown> & { crewId: string; year: string }>
}

/**
 * 将日级工时记录拆分并聚合为三个时间粒度。
 *
 * @param rows         日级源数据，每行必须包含 crewId + crewBaseDt。
 * @param numericFields 需要 SUM 聚合的字段名列表（camelCase）。
 *                     通常传入 MANDAY_FD_NUMERIC_FIELDS 或 MANDAY_CC_AM_NUMERIC_FIELDS。
 *                     列表外的字段在聚合时取该分组第一条记录的值。
 *
 * @example
 * const { daily, monthly, yearly } = partitionManday(fdRows, MANDAY_FD_NUMERIC_FIELDS)
 * // 分别 upsert 到对应的三张表
 * await db.insert(crewMandayFdDaily).values(daily).onConflictDoUpdate(...)
 * await db.insert(crewMandayFdPeriod).values(monthly.map(r => omit(r, 'crewBaseDt'))).onConflictDoUpdate(...)
 * await db.insert(crewMandayFdYearly).values(yearly.map(r => omit(r, 'crewBaseDt', 'yearMonth'))).onConflictDoUpdate(...)
 */
export function partitionManday(
  rows: MandaySourceRow[],
  numericFields: readonly string[],
  rpRanges?: readonly RpRange[],
): MandayPartitioned {
  const numericSet = new Set(numericFields)

  // 三个 Map，key = 分区键，value = 累积行
  const dailyMap   = new Map<string, Record<string, unknown>>()
  const monthlyMap = new Map<string, Record<string, unknown>>()
  const yearlyMap  = new Map<string, Record<string, unknown>>()

  for (const row of rows) {
    const { crewId, crewBaseDt, ...rest } = row
    const keys = mandayTimeKeys(crewBaseDt)

    // ── daily：(crewId, crewBaseDt) 重复时后者覆盖 ──────────────────────────
    const dk = `${crewId}\x00${keys.crewBaseDt}`
    dailyMap.set(dk, { ...rest, crewId, crewBaseDt: keys.crewBaseDt })

    // ── monthly(period)：(crewId, rosterPeriod) 分组累加 — RP 由 crew_base_dt 解析 ──
    const rp = rpForDate(rpRanges, keys.crewBaseDt)
    const rpKey = rp?.rosterPeriod ?? keys.yearMonth
    const mk = `${crewId}\x00${rpKey}`
    const existingM = monthlyMap.get(mk)
    if (!existingM) {
      monthlyMap.set(mk, { ...rest, crewId, rosterPeriod: rpKey, rpStart: rp?.rpStart, rpEnd: rp?.rpEnd })
    } else {
      for (const field of numericFields) {
        existingM[field] = Number(existingM[field] ?? 0) + Number(rest[field] ?? 0)
      }
    }

    // ── yearly：(crewId, year) 分组累加 ─────────────────────────────────────
    const yk = `${crewId}\x00${keys.year}`
    const existingY = yearlyMap.get(yk)
    if (!existingY) {
      yearlyMap.set(yk, { ...rest, crewId, year: keys.year })
    } else {
      for (const field of numericFields) {
        existingY[field] = Number(existingY[field] ?? 0) + Number(rest[field] ?? 0)
      }
    }
  }

  return {
    daily:   [...dailyMap.values()]   as MandayPartitioned['daily'],
    monthly: [...monthlyMap.values()] as MandayPartitioned['monthly'],
    yearly:  [...yearlyMap.values()]  as MandayPartitioned['yearly'],
  }
}
