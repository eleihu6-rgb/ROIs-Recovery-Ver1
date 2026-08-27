# Pairing.tafb 统一为 PBS 日历日（删除 pbs_calendar_days）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `pairing.tafb` 统一为 PBS 口径日历日（签到开始→签到结束覆盖的日历日数，NOT NULL 最小值 1），删除 `pbs_calendar_days` 字段，`roster_publish.tafb_minutes` 改名 `tafb`，属性 113「TAFB」改为按天竞价、删除属性 138「Maximum TAFB-Credit Ratio」，让引擎天数过滤（`tafb >= duration_min/max`）与所有写路径、注释全部对齐读 `tafb`。

**Architecture:** `tafb` 作为唯一"天数口径"字段承载原 `pbs_calendar_days` 的计算逻辑（Base 当地时区 Brief→Debrief 日历日 + 兜底链 `sch 起止日历日 → duration_days → 1`）。live 侧把 `refreshPbsCalendarDays` 改名为 `refreshPairingTafb` 并保持写路径原调用点；scenario 侧新增 batch 版 `refreshScenarioPairingsTafb`（scenario 无 airport/base 时区表，用 UTC 墙钟日期差），在 PRG 导入事务末尾调用。搜索条件（live+pbs 对称）把所有 `p.pbs_calendar_days` 换成 `p.tafb` 并删除 `is not null` 守卫（tafb 恒非 NULL）；属性 113 从 `duration`（HH:MM 分钟）改为 `stepper`（天数）类型——portal 输入控件按类型驱动自动复用 131 的 stepper UI，无需 portal 路由 schema 改动。DB 迁移做一次性回填（live 用旧 `pbs_calendar_days` 对齐，scenario 段重算，`pbs_bid_group` 113 行 HH:MM→天，删 138 定义与存量 bid）。

**Tech Stack:** PostgreSQL 16（多 schema 隔离）、TypeScript（live-server / pbs-server / gantt / pbs-portal）、Drizzle ORM、Vitest（单测/集成）、Playwright（E2E）、Python（engine-server 验证）。

## Global Constraints

从 spec（`docs/superpowers/specs/2026-08-10-pairing-tafb-unify-days-design.md`）复制的项目级约束，所有任务隐式包含：

- `pairing.tafb`（live + scenario）= **PBS 口径日历日**：Base 当地时区 `brief_start`（签到开始）到 `debrief_end`（签到结束）覆盖的日历日数。
- `tafb` **NOT NULL，最小值 1**；计算失败兜底链：`sch_str_dt_utc→sch_end_dt_utc` 日历日 → `duration_days` → `1`。
- `duration_days`（自然天数）语义不变，与 tafb 并存。
- **属性 125「Credit Per Time Away From Base」保留不动**（day-based 比率，不在本次范围）；**只删除 138**。
- `roster_publish.tafb_minutes` → `tafb`，来源仍是 `pairing.tafb`；场景 PRG batch 表的 `tafb_minutes`（原始源值存档）**不在此改名范围**。
- 属性 113 按天竞价：bid 值由 HH:MM 分钟改为天数；存量 HH:MM bid 折叠为整天桶（`max(0, ceil(minutes/1440))`，预期语义损失，已获用户决策 A）。
- UI 默认语言英文；新代码禁止魔法字号/写死颜色/超档字重（`npm run check:ui` 门禁）。
- 远程 DB 查询（§Remote-DB-Only）：远端 PostgreSQL `47.253.173.207:55432`，database `rois`；DEV live schema `f8`、scenario schema `scenario`；密码只经环境变量注入，不得写入文档/代码。
- 每个 UI 变更必须有 Playwright 回归（§Playwright-Required）；测试输出为完成证明（§No-Illusion）。
- 只动任务要求的行（§Surgical）；不预埋投机抽象（§Minimal-First）。
- 提交格式：`<type>: <简要描述>` + `Co-Authored-By: Claude ...`。

---

### Task 1: DB 迁移 + seed（不可逆 DDL，先 SIT 演练）

**Files:**
- Create: `sql/migration/2026-08-10-pairing-tafb-unify-days.sql`
- Modify: `sql/seed/10-pbs-bid-property.sql:246`（113 的 validation_json）、`:329`（删除 138 行）
- Test: 远端库预检 + SIT 演练（§Remote-DB-Only）

**Interfaces:**
- Produces: `pairing.tafb`（天，NOT NULL min 1）已回填；`pairing.pbs_calendar_days` 已删除；`roster_publish.tafb` 新列名；`pbs_bid_property` 113 校验改为天数、138 定义已删；`pbs_bid_group` 113 行 param_a/param_b 已从 HH:MM 迁为天数。后续所有代码任务依赖此 schema。

- [ ] **Step 1: 写迁移 SQL**

创建 `sql/migration/2026-08-10-pairing-tafb-unify-days.sql`：

```sql
-- =====================================================================
-- 2026-08-10 Pairing.tafb 统一为 PBS 日历日，删除 pbs_calendar_days
-- 依据: docs/superpowers/specs/2026-08-10-pairing-tafb-unify-days-design.md
-- 顺序: SIT 演练 → 远端库预检 → 上线窗口执行。DROP COLUMN 不可逆。
-- =====================================================================

-- 0) 预检（执行前手工核对，§Remote-DB-Only 用远端库）:
--    SELECT min(tafb), max(tafb),
--           count(*) FILTER (WHERE tafb BETWEEN 1 AND 60) AS likely_days,
--           count(*) FILTER (WHERE tafb > 60) AS still_minutes
--    FROM pairing WHERE is_deleted = 0;
--    若 still_minutes 占比高，说明库中 tafb 仍是分钟口径，先停表人工核对再迁移。

-- 1) live pairing: 以旧 pbs_calendar_days 对齐，其余行兜底保留现值；min 1
UPDATE pairing
SET tafb      = GREATEST(1, COALESCE(pbs_calendar_days, tafb, duration_days, 1)),
    updated_by = 'tafb_unify',
    updated_at = now()
WHERE is_deleted = 0;

-- 2) 删除 pbs_calendar_days（不可逆，SIT 演练后执行）
ALTER TABLE pairing DROP COLUMN pbs_calendar_days;

COMMENT ON COLUMN pairing.tafb IS
  'PBS 口径日历日：Base 当地时区 Brief（签到开始）至 Debrief（签到结束）覆盖的日历日数，单位天，最小值 1';

-- 3) scenario pairing: 按段重算（UTC 墙钟；scenario 无 airport/base 时区表），兜底 sch 起止 / duration_days / 1
UPDATE scenario.pairing p
SET tafb = GREATEST(1, COALESCE(
        (SELECT (max(ps.debrief_end_utc)::date - min(ps.brief_start_utc)::date + 1)
         FROM scenario.pairing_segment ps
         WHERE ps.pairing_id = p.id
           AND coalesce(ps.is_deleted, 0) = 0
           AND ps.brief_start_utc IS NOT NULL
           AND ps.debrief_end_utc IS NOT NULL),
        (p.sch_end_dt_utc::date - p.sch_str_dt_utc::date + 1),
        p.duration_days,
        1
    )),
    updated_by = 'tafb_unify',
    updated_at = now()
WHERE p.is_deleted = 0;

COMMENT ON COLUMN scenario.pairing.tafb IS
  'PBS 口径日历日（UTC 墙钟 Brief→Debrief 覆盖日历日数），单位天，最小值 1';

-- 4) roster_publish: tafb_minutes → tafb（来源仍为 pairing.tafb）
ALTER TABLE roster_publish RENAME COLUMN tafb_minutes TO tafb;

COMMENT ON COLUMN roster_publish.tafb IS '发布快照：pairing.tafb（PBS 日历日，单位天）';

-- 5) pbs_bid_property 113 validation_json 改为天数（文档用途；portal 控件由 catalog 类型驱动）
UPDATE pbs_bid_property
SET validation_json = '{"type":"int","label":"Days","min":1,"max":14}'::json
WHERE property_code = 113;

-- 6) 删除 hidden AA 属性 138「Maximum TAFB-Credit Ratio」定义与存量 bid
DELETE FROM pbs_bid_group    WHERE property_id = 138;
DELETE FROM pbs_bid_property WHERE property_code = 138;

-- 7) pbs_bid_group 113 存量 HH:MM → 天（分钟粒度折叠为整天桶，预期语义损失）
UPDATE pbs_bid_group
SET param_a    = GREATEST(1, CEIL(((SPLIT_PART(param_a, ':', 1)::int * 60 + SPLIT_PART(param_a, ':', 2)::int)::numeric) / 1440.0))::text,
    updated_at = now()
WHERE property_id = 113
  AND param_a ~ '^[0-9]{1,3}:[0-9]{2}$';

UPDATE pbs_bid_group
SET param_b    = GREATEST(1, CEIL(((SPLIT_PART(param_b, ':', 1)::int * 60 + SPLIT_PART(param_b, ':', 2)::int)::numeric) / 1440.0))::text,
    updated_at = now()
WHERE property_id = 113
  AND param_b ~ '^[0-9]{1,3}:[0-9]{2}$';
```

- [ ] **Step 2: 更新 seed**

`sql/seed/10-pbs-bid-property.sql`：
- 行 246（113）：`'{"type":"duration","format":"HH:MM","label":"TAFB"}'` → `'{"type":"int","label":"Days","min":1,"max":14}'`。
- 删除行 329（138，「Maximum TAFB-Credit Ratio」）。

- [ ] **Step 3: 远端库预检 + 演练**

Run: 在远端库先跑 Step 1 的 `UPDATE pairing` + `UPDATE scenario.pairing` 两条语句的 SELECT 预演（把 UPDATE 改成等价的 SELECT 统计预期影响行数），确认 `tafb` 现值为天口径、`pbs_calendar_days` 覆盖度与预期一致。
Expected: 预检无异常；随后在 SIT schema（`f8_sit_live` / `f8_sit_scenario` / `f8_sit_pbs`）完整执行迁移文件，验证：`pairing` 无 `pbs_calendar_days` 列；`tafb` 全行 >= 1；`roster_publish.tafb` 存在；`pbs_bid_property` 无 138；113 的 param_a 为整数天。

- [ ] **Step 4: Commit**

```bash
git add sql/migration/2026-08-10-pairing-tafb-unify-days.sql sql/seed/10-pbs-bid-property.sql
git commit -m "feat(db): unify pairing.tafb to PBS calendar days, drop pbs_calendar_days

- backfill live tafb from pbs_calendar_days, scenario recompute by segment
- rename roster_publish.tafb_minutes -> tafb
- property 113 -> day bid, delete property 138
- convert pbs_bid_group 113 HH:MM bids to days"
```

---

### Task 2: live pairing 模型 + tafb 服务（改名 + 新兜底语义 + 全部 live 调用点）

**Files:**
- Modify: `live-server/src/models/pairing/pairing.ts:21-22`
- Rename: `live-server/src/services/pairing/pairing-calendar-days-service.ts` → `live-server/src/services/pairing/pairing-tafb-service.ts`
- Modify: `live-server/src/services/pairing/pairing-service.ts:25,490-521,703-722,797,965`
- Modify: `live-server/src/services/pairing/pairing-duty-node-service.ts:6,175`
- Modify: `live-server/src/workers/pairing-inbound-worker.ts:11,277,431`
- Test: rename `live-server/src/__tests__/services/pairing/pairing-calendar-days-service.test.ts` → `pairing-tafb-service.test.ts`；modify `live-server/src/__tests__/services/pairing/pairing-service.test.ts`、`pairing-duty-node-service.test.ts`、`live-server/src/__tests__/unit/pairing-inbound-worker.test.ts`

**Interfaces:**
- Produces: `refreshPairingTafb(db: { execute }, pairingId: number, updatedBy: string): Promise<void>`（Drizzle `db.execute`）；`refreshScenarioPairingsTafb(db: { query }, schema: string, pairingIds: number[], updatedBy: string): Promise<void>`（**raw pg `$n` 占位符**，因 scenario 导入用的是 raw `PoolClient.query`，无 Drizzle execute——Task 4 消费）。`pairing` 模型删除 `pbsCalendarDays`。
- Consumes: 无（Task 1 已把 `pairing.tafb` 语义定为天）。

- [ ] **Step 1: 写失败的测试**

把 `pairing-calendar-days-service.test.ts` 重命名为 `pairing-tafb-service.test.ts`，测试内容改为验证新语义（`tafb` 更新目标列、`GREATEST(1, ...)` 兜底链、scenario batch 版）：

```typescript
import { describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

import {
  refreshPairingTafb,
  refreshScenarioPairingsTafb,
} from '../../../services/pairing/pairing-tafb-service.js'

describe('refreshPairingTafb', () => {
  it('writes tafb as min-1 Base-local calendar span with sch/duration_days fallback', async () => {
    const execute = vi.fn().mockResolvedValue({ rowCount: 1 })
    await refreshPairingTafb({ execute } as never, 42, 'tester')

    const dialect = new PgDialect()
    const query = dialect.sqlToQuery(execute.mock.calls[0][0])
    const normalized = query.sql.replace(/\s+/g, ' ').trim()

    expect(normalized).toMatch(/min\(ps\.brief_start_utc\)/)
    expect(normalized).toMatch(/max\(ps\.debrief_end_utc\)/)
    expect(normalized).toMatch(/at time zone 'UTC'\) at time zone base_zone\.name\)::date/)
    expect(normalized).toMatch(/greatest\(1, coalesce\(/)
    expect(normalized).toMatch(/p\.sch_end_dt_utc/)
    expect(normalized).toMatch(/p\.duration_days/)
    expect(normalized).toMatch(/p\.tafb is distinct from calculated\.tafb/)
    expect(query.params).toEqual([42, 'tester'])
  })
})

describe('refreshScenarioPairingsTafb', () => {
  it('batch-recomputes scenario tafb with UTC wall-clock and sch/duration fallback', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    await refreshScenarioPairingsTafb({ query } as never, 'scenario', [1, 2, 3], 'tester')

    const [text, params] = query.mock.calls[0]

    expect(text).toMatch(/update scenario\.pairing p/)
    expect(text).toMatch(/max\(ps\.debrief_end_utc\)::date - min\(ps\.brief_start_utc\)::date \+ 1/)
    expect(text).toMatch(/p\.sch_end_dt_utc::date - p\.sch_str_dt_utc::date \+ 1/)
    expect(text).toMatch(/p\.duration_days/)
    expect(text).toMatch(/p\.id = any\(\$1::bigint\[\]\)/)
    expect(params).toEqual([[1, 2, 3], 'tester'])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd live-server && npx vitest run src/__tests__/services/pairing/pairing-tafb-service.test.ts`
Expected: FAIL —— `refreshPairingTafb` / `refreshScenarioPairingsTafb` not defined。

- [ ] **Step 3: 改模型 + 写 tafb 服务**

`live-server/src/models/pairing/pairing.ts`：
- 删除 `pbsCalendarDays: smallint('pbs_calendar_days'),`（行 21）。
- `tafb` 注释改为：`// PBS 口径日历日（Base 当地时区 Brief→Debrief 覆盖日历日数），单位天，最小值 1`。

用 `git mv` 改名服务文件后重写为 `pairing-tafb-service.ts`：

```typescript
import { sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

type TafbDb = Pick<NodePgDatabase<Record<string, unknown>>, 'execute'>

/**
 * 重算单个 live pairing 的 tafb 为 PBS 口径日历日：
 * Base 当地时区从 brief_start（签到开始）到 debrief_end（签到结束）覆盖的日历日数。
 * 兜底链：sch_str→sch_end 日历日 → duration_days → 1；tafb NOT NULL，最小值 1。
 */
export const refreshPairingTafb = async (
  db: TafbDb,
  pairingId: number,
  updatedBy: string,
): Promise<void> => {
  await db.execute(sql`
    with calculated as (
      select
        p.id,
        greatest(
          1,
          coalesce(
            case
              when base_zone.name is null
                or segment_bounds.brief_start_utc is null
                or segment_bounds.debrief_end_utc is null
              then null
              else (
                ((segment_bounds.debrief_end_utc at time zone 'UTC') at time zone base_zone.name)::date
                - ((segment_bounds.brief_start_utc at time zone 'UTC') at time zone base_zone.name)::date
                + 1
              )::smallint
            end,
            (
              ((p.sch_end_dt_utc at time zone 'UTC') at time zone coalesce(base_zone.name, 'UTC'))::date
              - ((p.sch_str_dt_utc at time zone 'UTC') at time zone coalesce(base_zone.name, 'UTC'))::date
              + 1
            ),
            p.duration_days,
            1
          )
        )::smallint as tafb
      from pairing p
      left join lateral (
        select valid_timezone.name
        from airport base_airport
        join pg_timezone_names valid_timezone
          on valid_timezone.name = nullif(btrim(base_airport.zone_id), '')
        where upper(btrim(base_airport.airport)) = upper(btrim(p.base))
        order by base_airport.id
        limit 1
      ) base_zone on true
      left join lateral (
        select
          min(ps.brief_start_utc) as brief_start_utc,
          max(ps.debrief_end_utc) as debrief_end_utc
        from pairing_segment ps
        where ps.pairing_id = p.id
          and coalesce(ps.is_deleted, 0) = 0
      ) segment_bounds on true
      where p.id = ${pairingId}
    )
    update pairing p
    set
      tafb       = calculated.tafb,
      updated_by = ${updatedBy},
      updated_at = now()
    from calculated
    where calculated.id = p.id
      and p.tafb is distinct from calculated.tafb
  `)
}

/**
 * 批量重算 scenario pairing 的 tafb 为 PBS 口径日历日（UTC 墙钟）：
 * scenario 无 airport/base 时区表，直接用 UTC 日期差（Brief→Debrief 覆盖日历日）。
 * 兜底链：sch_str→sch_end 日历日 → duration_days → 1。
 * 注意：scenario 导入走 raw pg PoolClient.query，因此本函数用 $n 占位符，不走 Drizzle。
 */
export const refreshScenarioPairingsTafb = async (
  db: { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  schema: string,
  pairingIds: number[],
  updatedBy: string,
): Promise<void> => {
  if (pairingIds.length === 0) return
  await db.query(
    `
    update ${schema}.pairing p
    set
      tafb       = greatest(
        1,
        coalesce(
          (
            select (max(ps.debrief_end_utc)::date - min(ps.brief_start_utc)::date + 1)
            from ${schema}.pairing_segment ps
            where ps.pairing_id = p.id
              and coalesce(ps.is_deleted, 0) = 0
              and ps.brief_start_utc is not null
              and ps.debrief_end_utc is not null
          ),
          (p.sch_end_dt_utc::date - p.sch_str_dt_utc::date + 1),
          p.duration_days,
          1
        )
      )::smallint,
      updated_by = $2,
      updated_at = now()
    where p.id = any($1::bigint[])
    `,
    [pairingIds, updatedBy],
  )
}
```

- [ ] **Step 4: 更新 live 调用点**

`pairing-service.ts`：
- 行 25 import → `import { refreshPairingTafb } from './pairing-tafb-service.js'`
- `create()`（490-497）：
  ```typescript
  async create(fastify: FastifyInstance, data: typeof pairing.$inferInsert, username: string) {
    const values = { ...data }
    // tafb NOT NULL 兜底：入参未带时按 sch 起止日历日
    if (values.tafb == null && values.schStrDtUtc && values.schEndDtUtc) {
      values.tafb = Math.max(1, Math.floor((values.schEndDtUtc.getTime() - values.schStrDtUtc.getTime()) / 86_400_000))
    }
    const [row] = await fastify.db
      .insert(pairing)
      .values({ ...values, ...auditCreate(username) })
      .returning()
    await invalidatePattern(fastify.redis, `${CACHE_PREFIX}:list:*`)
    return row
  },
  ```
- `update()`：删除 `delete updateData.pbsCalendarDays`（502 行）；行 511 → `await refreshPairingTafb(tx, id, username)`。
- `createFromFlights()`（703-706 改为分别维护 durationDays 自然天 / tafb 最小值 1）：
  ```typescript
  const rawSpanDays = Math.floor((lastFlt.schArvDtUtc.getTime() - firstFlt.schDepDtUtc.getTime()) / 86_400_000)
  const durationDays = Math.max(0, rawSpanDays) // 自然天，语义不变
  const tafbDays = Math.max(1, rawSpanDays)     // tafb 最小值 1，段建成后仍由 refresh 重算
  ```
  并在 `.values({ ... })` 中把行 721-722 `durationDays: tafbDays, tafb: tafbDays,` 改为 `durationDays, tafb: tafbDays,`；行 797 → `await refreshPairingTafb(tx, newPairing.id, username)`。
- `addSegment()` 行 965 → `await refreshPairingTafb(tx, pairingId, username)`。

`pairing-duty-node-service.ts`：
- 行 6 import → `import { refreshPairingTafb } from './pairing-tafb-service.js'`；行 175 → `await refreshPairingTafb(tx, pairingId, username)`。

`pairing-inbound-worker.ts`：
- 行 11 import → `import { refreshPairingTafb } from '../services/pairing/pairing-tafb-service.js'`。
- 行 277 `${pairing.durationDays}, ${pairing.tafb},` → `${pairing.durationDays}, ${pairing.durationDays},`（tafb 只放占位，分钟源值不再写入；后续 refresh 重算）。
- 行 431 → `await refreshPairingTafb(tx, pairingId, 'F8_IMPORT')`。

- [ ] **Step 5: 更新受影响测试**

`live-server/src/__tests__/services/pairing/pairing-service.test.ts`：
- 行 16/20 mock import → `refreshPairingTafb` from `'../../../services/pairing/pairing-tafb-service.js'`。
- 行 220 → `expect(refreshPairingTafb).toHaveBeenCalledWith(fastify.db, 42, 'admin')`。
- 行 242-245：把 `pairingService.update(fastify, 1, { base: 'YVR', pbsCalendarDays: 99 } as any, 'admin')` 改为 `{ base: 'YVR' }`，删除 `expect.not.objectContaining({ pbsCalendarDays: 99 })` 断言（字段已不存在），保留 `expect(refreshPairingTafb).toHaveBeenCalledWith(fastify.db, 1, 'admin')`。

`pairing-duty-node-service.test.ts`：行 13/17 mock import → `refreshPairingTafb`；行 146 → `expect(refreshPairingTafb).toHaveBeenCalledWith(fastify.db, 42, 'admin')`。

`live-server/src/__tests__/unit/pairing-inbound-worker.test.ts`：行 7/21 mock import → `refreshPairingTafb`；行 36-37 `mockReset`/`mockResolvedValue` 不变；行 95 → `expect(workerMocks.refreshPairingTafb).toHaveBeenCalledWith(mockDb, 101, 'F8_IMPORT')`。

- [ ] **Step 6: 运行测试确认通过**

Run: `cd live-server && npx vitest run src/__tests__/services/pairing/pairing-tafb-service.test.ts src/__tests__/services/pairing/pairing-service.test.ts src/__tests__/services/pairing/pairing-duty-node-service.test.ts src/__tests__/unit/pairing-inbound-worker.test.ts`
Expected: 4 个文件全 PASS（§No-Illusion 贴结果）。

- [ ] **Step 7: 全量 build 校验**

Run: `cd live-server && npx tsc --noEmit`
Expected: 0 error（确认无残留 `pbsCalendarDays` / `refreshPbsCalendarDays` 引用）。

- [ ] **Step 8: Commit**

```bash
git add live-server/src/models/pairing/pairing.ts live-server/src/services/pairing/pairing-tafb-service.ts live-server/src/services/pairing/pairing-service.ts live-server/src/services/pairing/pairing-duty-node-service.ts live-server/src/workers/pairing-inbound-worker.ts live-server/src/__tests__/
git commit -m "refactor(live): rename refreshPbsCalendarDays -> refreshPairingTafb, drop pbsCalendarDays
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: live 残余写路径（地面任务 tafb 1、raw 导入去分钟源、inbound 占位校验）

**Files:**
- Modify: `live-server/src/workers/roster-ground-inbound-worker.ts:500`
- Modify: `live-server/scripts/import-pairings-from-raw.ts:202-204,222`

**Interfaces:**
- Consumes: Task 2 的 `tafb`（天，min 1）语义。
- Produces: 地面任务环 `tafb=1`；raw 导入不再写分钟源值。

- [ ] **Step 1: 地面任务 tafb 0→1**

`roster-ground-inbound-worker.ts` 行 500：`1, 0, 1, 1,` → `1, 1, 1, 1,`（列序为 `duration_days, tafb, duty_count, seg_count`；地面任务=同日任务，tafb=1 个日历日）。

- [ ] **Step 2: raw 导入去掉分钟源**

`import-pairings-from-raw.ts`：
- 行 202-204 `computedTafbDays` 改为 min 1：
  ```typescript
  const computedTafbDays = schStr && schEnd
    ? Math.max(1, Math.floor((new Date(schEnd).getTime() - new Date(schStr).getTime()) / 86_400_000))
    : 1
  ```
- 行 222 `tafb: toInt(p['tafb']) || toInt(p['durationDays']) || computedTafbDays,` → `tafb: toInt(p['durationDays']) || computedTafbDays,`（不再取分钟源 `p['tafb']`；最终值由后续 `refreshPairingTafb` 重算）。

- [ ] **Step 3: 运行相关测试 + build**

Run: `cd live-server && npx tsc --noEmit && npx vitest run src/__tests__/unit/pairing-inbound-worker.test.ts`
Expected: PASS（ground worker / raw import 无对应单测，靠 build 保证不破坏）。

- [ ] **Step 4: Commit**

```bash
git add live-server/src/workers/roster-ground-inbound-worker.ts live-server/scripts/import-pairings-from-raw.ts
git commit -m "fix(live): ground pairing tafb=1, raw import drops minutes-source tafb
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Scenario PRG 导入后重算 tafb 为天数

**Files:**
- Modify: `live-server/src/services/scenario/s3-pairing-prg-parser.ts:348`
- Modify: `live-server/src/services/scenario/s3-pairing-import-service.ts:799-815`（insertParsedPairingData 末尾加 refresh 调用）
- Test: `live-server/src/services/scenario/__tests__/s3-pairing-prg-parser.test.ts`（若有 tafb 断言则更新）、`live-server/src/services/scenario/__tests__/scenario-export-pairing-division.test.ts`（预期保持不变）

**Interfaces:**
- Consumes: Task 2 的 `refreshScenarioPairingsTafb(db, schema, pairingIds, updatedBy)`。
- Produces: `scenario.pairing.tafb` 在 PRG 导入事务内被重算为日历日。
- Note: scenario PRG batch 表 `tafb_minutes`（`s3-pairing-prg-parser.ts:18,488` 的 `tafbMinutes`，`s3-pairing-import-service.ts:193/202/210/231`）是**原始源值存档列**，不在本次改名范围，保持不动。

- [ ] **Step 1: parser 的 tafb 改为占位天数**

`s3-pairing-prg-parser.ts` 行 347-348：
```typescript
durationDays: Math.max(1, Math.ceil((new Date(schEndDtUtc).getTime() - new Date(schStrDtUtc).getTime()) / 86_400_000)),
tafb: toNumber(trimSlice(line, 110, 112), 'tafb'),
```
改为（PRG 分钟值不再直接写入 `tafb`，与 durationDays 同为占位，导入后由 refresh 重算为准确日历日）：
```typescript
durationDays: Math.max(1, Math.ceil((new Date(schEndDtUtc).getTime() - new Date(schStrDtUtc).getTime()) / 86_400_000)),
tafb: Math.max(1, Math.ceil((new Date(schEndDtUtc).getTime() - new Date(schStrDtUtc).getTime()) / 86_400_000)),
```

- [ ] **Step 2: 导入事务末尾调 refresh**

`s3-pairing-import-service.ts`：
- 顶部 import：`import { refreshScenarioPairingsTafb } from '../pairing/pairing-tafb-service.js'`（注意该文件的相对路径：本文件在 `services/scenario/`，tafb 服务在 `services/pairing/`，即 `'../pairing/pairing-tafb-service.js'`）。
- `insertParsedPairingData`（799-815）在 `await insertSegments(...)` 之后加一行：
  ```typescript
  await refreshScenarioPairingsTafb(db, scenarioSchema(), [...pairingIds.values()], username)
  ```
  其中 `scenarioSchema` 为本文件/同目录已导出的 schema 解析函数（与 `scenarioSql` 使用同一来源）。

- [ ] **Step 3: 更新/验证测试**

- `s3-pairing-prg-parser.test.ts:105-106`：`durationDays: 1, tafb: 655,` → `durationDays: 1, tafb: 1,`（T4101 样例同日环，占位天数=1；PRG 分钟值 655 不再进 `tafb`）。
- `scenario-export-pairing-division.test.ts:57-58` 断言 `text.toContain('tafb >=')` / `tafb <=` —— scenario 导出/scope filter（`scenario-export-service.ts:106,109`、`pairing-scope-filter.ts:44,45`）本就是按天比较，预期保持 PASS，无需改动。

Run: `cd live-server && npx vitest run src/services/scenario/__tests__/`
Expected: PASS（贴结果）。

- [ ] **Step 4: Commit**

```bash
git add live-server/src/services/scenario/s3-pairing-prg-parser.ts live-server/src/services/scenario/s3-pairing-import-service.ts live-server/src/services/scenario/__tests__/
git commit -m "feat(scenario): recompute pairing.tafb as calendar days after PRG import
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: 搜索条件 pbs_calendar_days → tafb + 删除 is-not-null 守卫 + 删 case 138

**Files:**
- Modify: `live-server/src/services/pairing-search/pairing-search-core-conditions.ts:66,68,70,185,192,303,333-352`
- Modify: `pbs-server/src/services/pairing-search/pairing-search-core-conditions.ts:88,91,93,249,263,428,464-486`
- Modify: `live-server/src/services/pairing-search/pairing-search-condition-builder.ts:21,53-61`
- Modify: `pbs-server/src/services/pairing-search/pairing-search-condition-builder.ts:25,57-64`
- Test: `live-server/src/services/pairing-search/pairing-search-condition-builder.test.ts:104-105,161-162`；`pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts:324-325,350-351,379-380,408-409,2112-2114,2173-2174`；`live-server/src/services/algorithm-export/pairing-score-export.test.ts:491-492,671`

**Interfaces:**
- Produces: 所有配对长度类条件（112 length-preference / 112 stepper / 131 / 132）改读 `p.tafb`；`p.pbs_calendar_days is not null` 守卫删除（tafb 恒非 NULL）；case 138 删除（返回 null → 422「Search preview is not supported」——属性 138 定义已由 Task 1 删除）。
- Consumes: Task 1（138 已删）。

- [ ] **Step 1: live core-conditions 替换**

`live-server/src/services/pairing-search/pairing-search-core-conditions.ts`：
- 行 66/68/70 `p.pbs_calendar_days` → `p.tafb`（`buildPairingLengthPreferenceClause`）。
- 行 185（case 112 stepper）、行 192（case 131）：`buildCompareClause(sqlBuilder, "p.pbs_calendar_days", property.bid)` → `buildCompareClause(sqlBuilder, "p.tafb", property.bid)`。
- 行 303（case 132 stepper-date）：`buildCompareClause(sqlBuilder, "p.pbs_calendar_days", compareBid)` → `"p.tafb"`。
- 行 333-352（case 138）：整个 `case 138: { ... }` 块删除（含 `property.bid.type !== "percent"` 判断与 `p.tafb::numeric / nullif(...)` 表达式）。

- [ ] **Step 2: pbs core-conditions 对称替换**

`pbs-server/src/services/pairing-search/pairing-search-core-conditions.ts`：
- 行 88/91/93 → `p.tafb`；行 249（case 112）、行 263（case 131）、行 428（case 132）→ `p.tafb`。
- 行 464-486（case 138）整个块删除。

- [ ] **Step 3: 删除 is-not-null 守卫**

`live-server/src/services/pairing-search/pairing-search-condition-builder.ts`：
- 删除行 21 `const PAIRING_LENGTH_PROPERTY_CODES = new Set([112, 131, 132]);`。
- `wrapIntent`（53-61）改为直接返回 intentClause：
  ```typescript
  const wrapIntent = (positiveClause: string) => {
    const intentClause = intent === "avoid"
      ? `not (coalesce((${positiveClause}), false))`
      : positiveClause;
    return intentClause;
  };
  ```

`pbs-server/src/services/pairing-search/pairing-search-condition-builder.ts`：删除行 25 的 `PAIRING_LENGTH_PROPERTY_CODES`；`wrapIntent`（57-64）同上改为直接返回 `intentClause`。

- [ ] **Step 4: 更新条件 builder 测试**

`live-server/src/services/pairing-search/pairing-search-condition-builder.test.ts`：
- 行 104：`assert.match(normalized, /p\.pbs_calendar_days is not null/);` → `assert.doesNotMatch(normalized, /pbs_calendar_days/);`
- 行 105：`/p\.pbs_calendar_days between \$1 and \$2/` → `/p\.tafb between \$1 and \$2/`
- 行 161：`assert.match(normalized, /^\(p\.pbs_calendar_days is not null and /);` → `assert.doesNotMatch(normalized, /pbs_calendar_days/);`
- 行 162：`/not \(\(p\.pbs_calendar_days <= \$1\)\)/` → `/not \(\(p\.tafb <= \$1\)\)/`

`pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts`：同样的机械替换——所有 `p\.pbs_calendar_days` → `p\.tafb`，所有 `is not null` 守卫断言改为 `assert.doesNotMatch(normalizeSql(...), /pbs_calendar_days/)`（行 324、350、379、408、2173 为守卫断言；行 325、351、380、409、2112、2114、2174 为值断言改 `p\.tafb`）。

`live-server/src/services/algorithm-export/pairing-score-export.test.ts`：
- 行 491 `assert.match(queries[0]!.text, /p\.pbs_calendar_days is not null/);` → `assert.doesNotMatch(queries[0]!.text, /pbs_calendar_days/);`
- 行 492 `/p\.pbs_calendar_days between \$1 and \$2/` → `/p\.tafb between \$1 and \$2/`
- 行 671 `sqlPattern: /p\.pbs_calendar_days between \$1 and \$2/` → `/p\.tafb between \$1 and \$2/`（params `[1, 3, [...]]` 不变）

- [ ] **Step 5: 运行测试**

Run: `cd live-server && npx vitest run src/services/pairing-search/ src/services/algorithm-export/pairing-score-export.test.ts && cd ../pbs-server && npx vitest run src/services/pairing-search/`
Expected: 全部 PASS（§No-Illusion 贴结果）。

- [ ] **Step 6: Commit**

```bash
git add live-server/src/services/pairing-search/ pbs-server/src/services/pairing-search/ live-server/src/services/algorithm-export/pairing-score-export.test.ts
git commit -m "refactor(search): use pairing.tafb for length conditions, drop is-not-null guard, delete case 138
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: 属性 113「TAFB」改为按天竞价（stepper 天数）

**Files:**
- Modify: `packages/contracts/pbs-pairing-bids.js:346-351`（113 定义 defaultBid）
- Modify: `live-server/src/services/pairing-search/pairing-search-core-conditions.ts:285-291`（case 113）
- Modify: `pbs-server/src/services/pairing-search/pairing-search-core-conditions.ts:385-398`（case 113）
- Modify: `pbs-server/src/services/pairing/pairing-property-validation.ts:104-112,829-830`
- Test: `pbs-server/src/services/pairing/pairing-bid-service.test.ts:268-282`、`pbs-server/src/routes/pairing-bids.test.ts`（若无 113 用例则补一条）、`pbs-server/src/services/lineholder/rule-bid-value.test.ts:1290-1310`（**保持不动**——它自建 138 definition 测通用 percent 反序列化，不依赖 catalog）

**Interfaces:**
- Consumes: Task 1（113 的 validation_json 已改为天；`pbs_bid_group` 113 存量已迁为天）。
- Produces: 113 bid 类型为 `stepper`/`stepper-range`（天数），portal 输入控件按类型驱动自动复用 131 的 stepper UI；`buildCompareClause(sqlBuilder, "p.tafb", bid)` 生成 `p.tafb >= $n` 等整数比较。

- [ ] **Step 1: 改 catalog defaultBid**

`packages/contracts/pbs-pairing-bids.js` 行 348：
```js
defaultBid: Object.freeze({ type: "duration", value: "048:00" }),
```
→
```js
defaultBid: Object.freeze({ type: "stepper", value: 2, min: 1, max: 14 }),
```
（`supportedOperators: ["<", ">", "Between"]` 与 `awardAvoidActions` 不变。）

- [ ] **Step 2: live + pbs core-conditions case 113 改 stepper**

`live-server/src/services/pairing-search/pairing-search-core-conditions.ts`（285-291）：
```typescript
case 113: {
  if (property.bid.type !== "stepper" && property.bid.type !== "stepper-range") {
    break;
  }
  return buildCompareClause(sqlBuilder, "p.tafb", property.bid);
}
```
`pbs-server/src/services/pairing-search/pairing-search-core-conditions.ts`（385-398）同样替换（删除 `buildDurationCompareClause` 调用与 `"p.tafb::numeric"`）。

- [ ] **Step 3: pbs bid 校验改天数**

`pbs-server/src/services/pairing/pairing-property-validation.ts`：
- 行 104-107：
  ```typescript
  const hasInvalidTafbBid = (property: PairingPropertyPayload) =>
    property.propertyCode === PAIRING_TAFB_PROPERTY_CODE
    && property.bid.type !== "stepper"
    && property.bid.type !== "stepper-range";
  ```
- 行 109-112：
  ```typescript
  const hasUnsupportedTafbEqualsOperator = (property: PairingPropertyPayload) =>
    property.propertyCode === PAIRING_TAFB_PROPERTY_CODE
    && property.bid.type === "stepper"
    && property.bid.operator === "=";
  ```
- 行 829 消息：`"TAFB requires duration bid."` → `"TAFB requires a day value."`（行 830 `"TAFB supports <, >, or Between only."` 不变）。

- [ ] **Step 4: 更新 113 相关测试**

`pbs-server/src/services/pairing/pairing-bid-service.test.ts:268-282`：`bid: { type: "duration", value: "048:00", operator: "<", creditPriority: "higher" }` → `bid: { type: "stepper", value: 2, operator: "<", creditPriority: "higher" }`；断言 `normalizedUnsupportedRequest.bid` 改为 `{ type: "stepper", value: 2, operator: "<" }`（creditPriority 仍被丢弃、`buildPairingBidPreferenceJson(113, ...) === null` 不变）。

`pbs-server/src/routes/pairing-bids.test.ts`：
- 行 899 test 名 `"accepts TAFB duration bids"` → `"accepts TAFB day bids"`；payload `bid: { type: "duration", value: "020:00", operator: ">" }` → `bid: { type: "stepper", value: 2, operator: ">" }`。
- 行 932 test 名 `"accepts TAFB duration ranges"` → `"accepts TAFB day ranges"`；payload `bid: { type: "duration-range", from: "070:00", to: "090:00" }` → `bid: { type: "stepper-range", from: 1, to: 7 }`。

`pbs-server/src/services/lineholder/rule-bid-value.test.ts:1290-1310`：不改（自建 138 definition 测通用 percent 反序列化）。

- [ ] **Step 5: 运行测试**

Run: `cd pbs-server && npx vitest run src/services/pairing/ src/routes/pairing-bids.test.ts src/services/pairing-search/ && cd ../live-server && npx vitest run src/services/pairing-search/`
Expected: 全部 PASS（贴结果）。

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/pbs-pairing-bids.js live-server/src/services/pairing-search/pairing-search-core-conditions.ts pbs-server/src/services/pairing-search/pairing-search-core-conditions.ts pbs-server/src/services/pairing/pairing-property-validation.ts pbs-server/src/services/pairing/pairing-bid-service.test.ts pbs-server/src/routes/pairing-bids.test.ts
git commit -m "feat(bid): property 113 TAFB switches to day-based stepper bidding
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: roster_publish.tafb 改名 + award 查询/类型/mapper + portal + e2e mock

**Files:**
- Modify: `live-server/src/models/roster/roster-publish.ts:66`
- Modify: `live-server/src/services/roster/roster-publish-service.ts:562`
- Modify: `pbs-server/src/scripts/sync-roster-publish-from-roster-flight-core.ts:352,539,617,700`
- Modify: `pbs-server/src/services/award/award-results-service.ts:110`
- Modify: `pbs-server/src/services/award/types.ts:47`
- Modify: `pbs-server/src/services/award/award-results-mapper.ts:589,634,682`
- Modify: `packages/contracts/pbs-award-results.d.ts:117`
- Modify: `pbs-portal/src/features/award/award-mappers.ts:445`
- Test: `live-server/src/__tests__/services/roster/roster-publish-service.test.ts:461`、`pbs-server/src/scripts/sync-roster-publish-from-roster-flight.test.ts:101`、`pbs-server/src/services/award/award-results-service.test.ts:38`、`pbs-server/src/services/award/award-results-mapper.test.ts:29,59,77`、`e2e/tests/pbs-portal/award-published-data-completeness.spec.ts:91,148`、`e2e/tests/pbs-portal/award-adaptive-layout.spec.ts:98,171,228,252,669`、`e2e/scripts/pbs-portal-help-screenshot-mocks.ts:470,510`

**Interfaces:**
- Consumes: Task 1（`roster_publish.tafb` 新列名）。
- Produces: `roster_publish.tafb`（天）；award 侧字段名 `tafb_days`（避免与 `pairing.tafb` 混淆）。portal award 展示 `tafbLabel` 由 `formatTafbDays(startDate, endDate)` 从日期推导，**不读**该字段（`pbs-portal/src/features/award/award-mappers.ts:76-91,395`），故展示逻辑不变。

- [ ] **Step 1: live 模型 + 服务列名**

`live-server/src/models/roster/roster-publish.ts:66`：`tafbMinutes: integer('tafb_minutes')` → `tafb: integer('tafb')`。
`live-server/src/services/roster/roster-publish-service.ts:562`：INSERT 列清单 `tafb_minutes,` → `tafb,`（SELECT 侧行 623 的 `p.tafb,` 不变，位置对应即可）。

- [ ] **Step 2: pbs sync + award**

`pbs-server/src/scripts/sync-roster-publish-from-roster-flight-core.ts`：
- 行 352 `p.tafb as tafb_minutes` → `p.tafb as tafb`。
- 行 539、617 `tafb_minutes` → `tafb`。
- 行 700 `tafb_minutes = excluded.tafb_minutes` → `tafb = excluded.tafb`。

`pbs-server/src/services/award/award-results-service.ts:110`：`rp.tafb_minutes::text as tafb_minutes` → `rp.tafb::text as tafb_days`。
`pbs-server/src/services/award/types.ts:47`：`tafb_minutes: string | number | null` → `tafb_days: string | number | null`。
`pbs-server/src/services/award/award-results-mapper.ts`：
- 行 589 `tafbMinutes: parseNumericMinutes(firstRow.tafb_minutes)` → `tafbDays: firstRow.tafb_days == null ? null : Number.parseInt(firstRow.tafb_days, 10)`。
- 行 634、682 `tafbMinutes: null` → `tafbDays: null`。

- [ ] **Step 3: contract + portal**

`packages/contracts/pbs-award-results.d.ts:117`：`tafbMinutes: number | null` → `tafbDays: number | null`。
`pbs-portal/src/features/award/award-mappers.ts:445`：`tafbMinutes: sortedItems.length === 1 ? firstItem.tafbMinutes : null` → `tafbDays: sortedItems.length === 1 ? firstItem.tafbDays : null`（`formatTafbDays`/`tafbLabel` 不改）。

- [ ] **Step 4: 更新测试**

- `live-server/src/__tests__/services/roster/roster-publish-service.test.ts:461`：`tafb_minutes` 相关断言 → `tafb`。
- `pbs-server/src/scripts/sync-roster-publish-from-roster-flight.test.ts:101`：`sql.includes("tafb_minutes")` → `sql.includes("tafb")`（并 `assert.doesNotMatch(sql, /tafb_minutes/)`）。
- `pbs-server/src/services/award/award-results-service.test.ts:38`：`tafb_minutes: "640"` → `tafb_days: "2"`。
- `pbs-server/src/services/award/award-results-mapper.test.ts:29,59,77`：`tafbMinutes` → `tafbDays`。
- E2E mocks（值=分钟 → 天，`Math.max(1, ceil(min/1440))`，null 保持 null）：
  - `e2e/tests/pbs-portal/award-published-data-completeness.spec.ts:91` `tafbMinutes: 1440` → `tafbDays: 1`；`:148` → `tafbDays: null`。
  - `e2e/scripts/pbs-portal-help-screenshot-mocks.ts:470` `tafbMinutes: 480` → `tafbDays: 1`；`:510` → `tafbDays: null`。
  - `e2e/tests/pbs-portal/award-adaptive-layout.spec.ts:98` `640`→`tafbDays: 1`；`:171` `596`→`tafbDays: 1`；`:228/:252/:669` → `tafbDays: null`。

- [ ] **Step 5: 运行测试**

Run: `cd live-server && npx vitest run src/__tests__/services/roster/ && cd ../pbs-server && npx vitest run src/scripts/sync-roster-publish-from-roster-flight.test.ts src/services/award/ && cd ../.. && npx playwright test e2e/tests/pbs-portal/award-adaptive-layout.spec.ts e2e/tests/pbs-portal/award-published-data-completeness.spec.ts --reporter=list`
Expected: 全部 PASS（§No-Illusion 贴结果）。

- [ ] **Step 6: Commit**

```bash
git add live-server/src/models/roster/roster-publish.ts live-server/src/services/roster/roster-publish-service.ts pbs-server/src/scripts/sync-roster-publish-from-roster-flight-core.ts pbs-server/src/services/award/ packages/contracts/pbs-award-results.d.ts pbs-portal/src/features/award/award-mappers.ts e2e/
git commit -m "refactor(award): rename roster_publish.tafb_minutes -> tafb, award field tafb_days
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: gantt（TAFB 列=天、blh 兜底去 tafb、scenario adapter 映射真实天数）

**Files:**
- Modify: `gantt/src/components/panes/pairing-pane.tsx:492`
- Modify: `gantt/src/components/gantt/gantt-utils.ts:838`
- Modify: `gantt/src/utils/scenario-pairing-adapter.ts:159,255`
- Test: `gantt/src/utils/__tests__/scenario-pairing-adapter-refs.test.ts`（补 tafb 断言）；`e2e/tests/gantt/pairing-base-column.spec.ts:123`（mock tafb 改天 + 补 TAFB 单元格断言）

**Interfaces:**
- Consumes: `pairing.tafb`（天，min 1）语义。
- Produces: 配对面板 TAFB 列显示天数；`blh` 列无 blockMinutes 时显示 `-`（不再把 tafb 当分钟格式化）；scenario adapter 不再写死 `tafb: 0`。

- [ ] **Step 1: pairing-pane + gantt-utils**

`gantt/src/components/panes/pairing-pane.tsx:492`：
```typescript
blh: p.blockMinutes ? formatBlockMinutes(p.blockMinutes) : (p.tafb ? formatBlockMinutes(p.tafb) : '-'),
```
→
```typescript
blh: p.blockMinutes ? formatBlockMinutes(p.blockMinutes) : '-',
```
（tafb 现在是天数，不再是 block 分钟，不能作为 blh 兜底。）

`gantt/src/components/gantt/gantt-utils.ts:838`：
```typescript
case 'blh': return String(p.blockMinutes ?? p.tafb ?? 0)
```
→
```typescript
case 'blh': return String(p.blockMinutes ?? 0)
```

- [ ] **Step 2: scenario adapter 映射真实天数**

`gantt/src/utils/scenario-pairing-adapter.ts` 两处 `tafb: 0,`（行 159、255）→ 用 sch 起止计算日历日：
```typescript
tafb: Math.max(1, Math.ceil((new Date(p.schEndDtUtc).getTime() - new Date(p.schStrDtUtc).getTime()) / 86_400_000)),
```
（两处所在的局部作用域里 `p` 是 scenario gantt-data 的 pairing DTO，含 `schStrDtUtc`/`schEndDtUtc` ISO 串。`durationDays: 0` 保持不动——不在本次范围。）

- [ ] **Step 3: 更新 gantt 单测 + e2e**

`gantt/src/utils/__tests__/scenario-pairing-adapter-refs.test.ts`：在现有断言基础上，对两个 fixture（`schStrDtUtc: '2026-08-01T08:00:00Z'`, `schEndDtUtc: '2026-08-01T16:00:00Z'`）补：
```typescript
expect(mapped.tafb).toBe(1) // 同日环 = 1 个日历日
```
（若 fixture 是跨日则按 `Math.ceil(ms/86400000)` 期望。）

`e2e/tests/gantt/pairing-base-column.spec.ts:123`：mock `tafb: 480` → `tafb: 3`（改用天口径样例），并在 `renderedRow('pairing', 0)` 的断言里补一条 TAFB 单元格 = `'3'`：
```typescript
expect(row0!.tafb, 'Live pairing TAFB cell must show calendar days').toBe('3')
```

- [ ] **Step 4: 运行测试 + check:ui**

Run: `cd gantt && npx vitest run src/utils/__tests__/scenario-pairing-adapter-refs.test.ts && cd .. && npx playwright test e2e/tests/gantt/pairing-base-column.spec.ts --reporter=list && npm run check:ui`
Expected: 单测 + e2e PASS；`check:ui` 硬违规 0（§UI-Standard-Gate 贴结果）。

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components/panes/pairing-pane.tsx gantt/src/components/gantt/gantt-utils.ts gantt/src/utils/scenario-pairing-adapter.ts gantt/src/utils/__tests__/scenario-pairing-adapter-refs.test.ts e2e/tests/gantt/pairing-base-column.spec.ts
git commit -m "fix(gantt): TAFB column shows calendar days, blh no longer falls back to tafb
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: engine-server 验证（无代码改动）

**Files:**
- Test: `engine-server/tests/test_ro_input_context.py:220-281`（已覆盖，运行确认）

**Interfaces:**
- Consumes: `pairing.tafb`（天）语义。
- Produces: 验证引擎 coverage 过滤 `tafb >= duration_min/max` 单位已对齐（天）。

- [ ] **Step 1: 运行引擎既有测试确认**

`engine-server/F8/ro_input_builder/context.py:287,289` 的 `AND tafb >= %(duration_min)s` / `AND tafb <= %(duration_max)s` 本就是按天比较，`tafb` 统一为天后**自动正确**，无需改代码。既有测试 `engine-server/tests/test_ro_input_context.py::test_pairing_ids_applies_live_pairing_filters` 已断言 `"tafb >= %(duration_min)s" in pairing_sql`（行 270-281，`duration_min == 60.0` 即 60 天）。

Run: `cd engine-server && python -m pytest tests/test_ro_input_context.py::test_pairing_ids_applies_live_pairing_filters -v`
Expected: PASS（§No-Illusion 贴结果）。

- [ ] **Step 2: 结论记录**

无代码变更，不需要 commit。若 pytest 因 fixture 环境失败，记录原因并引用 `docs/modules/database` 的环境规范，不得静默跳过。

---

## Self-Review（写完后人工核对，由主 agent 执行）

**1. Spec coverage：**
- §4 DB 迁移 → Task 1（DROP pbs_calendar_days、注释、roster_publish 改名、bid 113 json、138 删除）。
- §5.1 模型与计算 → Task 2（refreshPairingTafb + 兜底链）。
- §5.2 调用点 → Task 2 + Task 3（create/update/createFromFlights/addSegment、duty-node、inbound-worker、ground、raw import）。
- §5.3 pairing-search → Task 5 + Task 6（pbs_calendar_days→tafb、守卫删除、113 天、138 删除、score-export）。
- §6 Scenario → Task 4（parser 占位 + 导入末尾 refresh）。
- §7 属性 113 → Task 6（catalog/条件/校验/迁移/portal 复用 stepper）。
- §8 award/portal → Task 7。
- §9 gantt → Task 8。
- §10 engine → Task 9（无改动，验证）。
- §11 测试策略 → 每任务含 TDD 步骤。

**2. Placeholder scan：** 全文无 "TBD"/"TODO"/"implement later"；所有代码步骤含真实可粘贴代码。

**3. Type consistency：** `refreshPairingTafb(db, pairingId, updatedBy)`、`refreshScenarioPairingsTafb(db, schema, pairingIds, updatedBy)` 在 Task 2 定义、Task 4 消费，签名一致；`tafb_days`（award）与 `pairing.tafb` 区分明确，无混淆；`p.tafb` 表达式在 Task 5/6 一致。

**4. 已知不变项：** `pbs_bid_condition` 是死模型（无代码引用），bid 持久化目标为 `pbs_bid_group`，迁移只动 `pbs_bid_group`；scenario PRG batch 表 `tafb_minutes` 为源值存档不改名；`rule-bid-value.test.ts:1290` 的 138 用例自建 definition 测试通用 percent 反序列化，保留。
