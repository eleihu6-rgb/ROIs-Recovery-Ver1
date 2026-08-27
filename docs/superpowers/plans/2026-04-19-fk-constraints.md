# FK 约束实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在核心业务表之间建立 FK RESTRICT 约束，并将哨兵值 `pairing_id=0`/`flt_id=0` 改为 `NULL`，让数据库成为数据一致性的最后防线。

**Architecture:** 通过一个 SQL migration 脚本清空业务数据并添加约束；Drizzle 模型同步更新字段可空性和 `.references()`；pairing-service.remove 从软删除改为硬删除并添加应用层预校验。

**Tech Stack:** PostgreSQL 16, Drizzle ORM (pgTable), Fastify, Vitest

---

## 涉及文件

| 操作 | 文件 |
|------|------|
| 新建 | `sql/migration/2026-04-19-add-fk-constraints.sql` |
| 修改 | `sql/schema/02-crew_roster_pg.sql` |
| 修改 | `live-server/src/models/pairing/pairing-segment.ts` |
| 修改 | `live-server/src/models/pairing/pairing-composition.ts` |
| 修改 | `live-server/src/models/pairing/pairing-template.ts` |
| 修改 | `live-server/src/models/roster/roster-flight.ts` |
| 修改 | `live-server/src/models/roster/roster-publish.ts` |
| 修改 | `live-server/src/models/flight/flight-composition.ts` |
| 修改 | `live-server/src/services/pairing/pairing-service.ts` |
| 修改 | `live-server/src/services/flight/flight-service.ts` |
| 修改 | `live-server/src/services/roster/roster-service.ts` |
| 修改 | `live-server/src/__tests__/services/pairing/pairing-service.test.ts` |

---

## Task 1: 编写 SQL 迁移脚本

**Files:**
- Create: `sql/migration/2026-04-19-add-fk-constraints.sql`

- [ ] **Step 1: 创建迁移脚本文件**

```sql
-- sql/migration/2026-04-19-add-fk-constraints.sql
-- 目的：
--   1. 清空核心业务表（保留主数据如 crew/aircraft/airport）
--   2. 将 pairing_id/flt_id 的哨兵值 0 语义改为 NULL（支持 FK）
--   3. 添加 FK RESTRICT 约束
-- 注意：在同一事务内执行，失败自动回滚

BEGIN;

-- ── Step 1: 清空业务数据 ──────────────────────────────────────
-- 顺序：先清子表，再清父表（避免触发潜在的已有约束）
TRUNCATE TABLE
  roster_publish,
  roster_flight,
  pairing_segment,
  pairing_composition,
  pairing,
  flight_composition,
  flight;

-- ── Step 2: 修改字段定义（哨兵值 0 → NULL）────────────────────
-- roster_flight.pairing_id：0=地面任务 → NULL=地面任务
ALTER TABLE roster_flight
  ALTER COLUMN pairing_id DROP NOT NULL,
  ALTER COLUMN pairing_id DROP DEFAULT;

-- roster_publish.pairing_id：0=地面任务 → NULL=地面任务
ALTER TABLE roster_publish
  ALTER COLUMN pairing_id DROP NOT NULL,
  ALTER COLUMN pairing_id DROP DEFAULT;

-- pairing_segment.flt_id：0=地面任务段 → NULL=地面任务段
ALTER TABLE pairing_segment
  ALTER COLUMN flt_id DROP NOT NULL;

-- ── Step 3: 添加 FK RESTRICT 约束 ─────────────────────────────
-- pairing 内部结构（子表随父表存在）
ALTER TABLE pairing_segment
  ADD CONSTRAINT fk_ps_pairing
  FOREIGN KEY (pairing_id) REFERENCES pairing(id) ON DELETE RESTRICT;

ALTER TABLE pairing_composition
  ADD CONSTRAINT fk_pc_pairing
  FOREIGN KEY (pairing_id) REFERENCES pairing(id) ON DELETE RESTRICT;

-- 航班结构
ALTER TABLE flight_composition
  ADD CONSTRAINT fk_fc_flight
  FOREIGN KEY (flt_id) REFERENCES flight(id) ON DELETE RESTRICT;

ALTER TABLE pairing_segment
  ADD CONSTRAINT fk_ps_flight
  FOREIGN KEY (flt_id) REFERENCES flight(id) ON DELETE RESTRICT;

-- 排班关联
ALTER TABLE roster_flight
  ADD CONSTRAINT fk_rf_crew
  FOREIGN KEY (crew_id) REFERENCES crew(crew_id) ON DELETE RESTRICT;

ALTER TABLE roster_flight
  ADD CONSTRAINT fk_rf_pairing
  FOREIGN KEY (pairing_id) REFERENCES pairing(id) ON DELETE RESTRICT;

-- 模板结构
ALTER TABLE pairing_template_detail
  ADD CONSTRAINT fk_ptd_template
  FOREIGN KEY (template_id) REFERENCES pairing_template(id) ON DELETE RESTRICT;

COMMIT;
```

- [ ] **Step 2: 执行迁移脚本**

```bash
psql "postgresql://f8:Pier2026AIf8@localhost:5432/rois?options=-c%20search_path%3Df8" \
  -f sql/migration/2026-04-19-add-fk-constraints.sql
```

期望输出：
```
BEGIN
TRUNCATE TABLE
ALTER TABLE
ALTER TABLE
ALTER TABLE
ALTER TABLE
ALTER TABLE
ALTER TABLE
ALTER TABLE
ALTER TABLE
ALTER TABLE
COMMIT
```

- [ ] **Step 3: 验证约束已建立**

```bash
psql "postgresql://f8:Pier2026AIf8@localhost:5432/rois?options=-c%20search_path%3Df8" \
  -c "SELECT conname, conrelid::regclass, confrelid::regclass FROM pg_constraint WHERE contype='f' ORDER BY conrelid::regclass::text;"
```

期望输出包含：
```
fk_ps_pairing        | pairing_segment       | pairing
fk_ps_flight         | pairing_segment       | flight
fk_pc_pairing        | pairing_composition   | pairing
fk_fc_flight         | flight_composition    | flight
fk_rf_crew           | roster_flight         | crew
fk_rf_pairing        | roster_flight         | pairing
fk_ptd_template      | pairing_template_detail | pairing_template
```

- [ ] **Step 4: 提交**

```bash
git add sql/migration/2026-04-19-add-fk-constraints.sql
git commit -m "feat(sql): 添加 FK RESTRICT 约束迁移脚本"
```

---

## Task 2: 更新 schema 源文件（02-crew_roster_pg.sql）

**Files:**
- Modify: `sql/schema/02-crew_roster_pg.sql`

schema 源文件是新环境建库的权威来源，需与迁移脚本保持一致。

- [ ] **Step 1: 修改 roster_flight.pairing_id 字段定义**

找到（约第 1351 行）：
```sql
    pairing_id                   bigint        not null default 0, -- 环业务 id，0=地面任务
```

替换为：
```sql
    pairing_id                   bigint,                           -- 环业务 id，null=地面任务
```

- [ ] **Step 2: 修改 roster_publish.pairing_id 字段定义**

找到（约第 1437 行）：
```sql
    pairing_id                    bigint        not null default 0, -- 环业务 id
```

替换为：
```sql
    pairing_id                    bigint,                           -- 环业务 id，null=地面任务
```

- [ ] **Step 3: 修改 pairing_segment.flt_id 字段定义**

找到（约第 1209 行）：
```sql
    flt_id                       bigint        not null,  -- 关联 flight 表 id
```

替换为：
```sql
    flt_id                       bigint,                  -- 关联 flight 表 id，null=地面任务段
```

- [ ] **Step 4: 在文件末尾追加 FK 约束声明**

在 `02-crew_roster_pg.sql` 末尾追加：

```sql
-- ============================================================
-- 外键约束（FK RESTRICT）
-- 在 CREATE TABLE 之后统一添加，避免循环依赖问题
-- ============================================================
alter table pairing_segment
  add constraint fk_ps_pairing foreign key (pairing_id) references pairing(id) on delete restrict,
  add constraint fk_ps_flight  foreign key (flt_id)     references flight(id)  on delete restrict;

alter table pairing_composition
  add constraint fk_pc_pairing foreign key (pairing_id) references pairing(id) on delete restrict;

alter table flight_composition
  add constraint fk_fc_flight  foreign key (flt_id)     references flight(id)  on delete restrict;

alter table roster_flight
  add constraint fk_rf_crew    foreign key (crew_id)    references crew(crew_id) on delete restrict,
  add constraint fk_rf_pairing foreign key (pairing_id) references pairing(id)  on delete restrict;

alter table pairing_template_detail
  add constraint fk_ptd_template foreign key (template_id) references pairing_template(id) on delete restrict;
```

- [ ] **Step 5: 提交**

```bash
git add sql/schema/02-crew_roster_pg.sql
git commit -m "feat(sql): schema 源文件同步 FK 约束和字段可空性变更"
```

---

## Task 3: 更新 Drizzle 模型

**Files:**
- Modify: `live-server/src/models/pairing/pairing-segment.ts`
- Modify: `live-server/src/models/pairing/pairing-composition.ts`
- Modify: `live-server/src/models/pairing/pairing-template.ts`
- Modify: `live-server/src/models/roster/roster-flight.ts`
- Modify: `live-server/src/models/roster/roster-publish.ts`
- Modify: `live-server/src/models/flight/flight-composition.ts`

- [ ] **Step 1: 更新 pairing-segment.ts**

```typescript
import { pgTable, bigint, varchar, integer, smallint, numeric, date, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { pairing } from './pairing.js'
import { flight } from '../flight/flight.js'

export const pairingSegment = pgTable('pairing_segment', {
  // ... 其他字段不变 ...

  // 归属 — 必须关联到存在的 pairing
  pairingId: bigint('pairing_id', { mode: 'number' }).notNull().references(() => pairing.id, { onDelete: 'restrict' }),

  // ... duty 层字段不变 ...

  // 航班段信息 — null 表示地面任务段
  fltId: bigint('flt_id', { mode: 'number' }).references(() => flight.id, { onDelete: 'restrict' }),

  // ... 其余字段不变 ...
}, (table) => [
  // 索引不变
])
```

具体改动（只改这两行，其余保持原样）：

将第 11 行：
```typescript
  pairingId: bigint('pairing_id', { mode: 'number' }).notNull(),
```
改为：
```typescript
  pairingId: bigint('pairing_id', { mode: 'number' }).notNull().references(() => pairing.id, { onDelete: 'restrict' }),
```

将第 90 行：
```typescript
  fltId: bigint('flt_id', { mode: 'number' }).notNull(),
```
改为：
```typescript
  fltId: bigint('flt_id', { mode: 'number' }).references(() => flight.id, { onDelete: 'restrict' }),
```

同时在文件顶部 import 行后追加：
```typescript
import { pairing } from './pairing.js'
import { flight } from '../flight/flight.js'
```

- [ ] **Step 2: 更新 pairing-composition.ts**

将第 9 行：
```typescript
  pairingId: bigint('pairing_id', { mode: 'number' }).notNull(),
```
改为：
```typescript
  pairingId: bigint('pairing_id', { mode: 'number' }).notNull().references(() => pairing.id, { onDelete: 'restrict' }),
```

在文件顶部追加 import：
```typescript
import { pairing } from './pairing.js'
```

- [ ] **Step 3: 更新 pairing-template.ts（pairingTemplateDetail）**

将 `templateId` 字段：
```typescript
  templateId: bigint('template_id', { mode: 'number' }).notNull(),
```
改为：
```typescript
  templateId: bigint('template_id', { mode: 'number' }).notNull().references(() => pairingTemplate.id, { onDelete: 'restrict' }),
```

> 注：`pairingTemplate` 在同一文件中定义于 `pairingTemplateDetail` 之前，直接引用即可，无需额外 import。

- [ ] **Step 4: 更新 roster-flight.ts**

将第 12 行：
```typescript
  pairingId: bigint('pairing_id', { mode: 'number' }).notNull().default(0),
```
改为：
```typescript
  pairingId: bigint('pairing_id', { mode: 'number' }).references(() => pairing.id, { onDelete: 'restrict' }),
```

在文件顶部追加 import：
```typescript
import { pairing } from '../pairing/pairing.js'
```

> 注：`crew_id` FK 引用的是 `crew.crew_id`（varchar 业务键，非 PK），Drizzle `.references()` 仅支持 PK 列，因此 `crewId` 的 FK 只在 DB 层由迁移脚本保障，Drizzle 模型不声明。

- [ ] **Step 5: 更新 roster-publish.ts**

将第 13 行：
```typescript
  pairingId: bigint('pairing_id', { mode: 'number' }).notNull().default(0),
```
改为：
```typescript
  pairingId: bigint('pairing_id', { mode: 'number' }),
```

不要为 `roster_publish.pairing_id` 声明 Drizzle `.references()`；发布快照允许保留已被清理的 pairing id。

- [ ] **Step 6: 更新 flight-composition.ts**

将第 9 行：
```typescript
  fltId: bigint('flt_id', { mode: 'number' }).notNull(),
```
改为：
```typescript
  fltId: bigint('flt_id', { mode: 'number' }).notNull().references(() => flight.id, { onDelete: 'restrict' }),
```

在文件顶部追加 import：
```typescript
import { flight } from './flight.js'
```

- [ ] **Step 7: TypeScript 编译检查**

```bash
cd live-server && npx tsc --noEmit
```

期望：无错误输出。

- [ ] **Step 8: 提交**

```bash
git add live-server/src/models/
git commit -m "feat(live-server): Drizzle 模型同步 FK references 和字段可空性"
```

---

## Task 4: 更新 pairing-service.remove（软删除 → 硬删除 + 预校验）

**Files:**
- Modify: `live-server/src/services/pairing/pairing-service.ts`

当前 `remove` 方法将 pairing 软删除（`isDeleted=1`）。按业务规则，用户从 Gantt 删除环时应真实删除，删除前需校验是否有 roster_flight 关联。

- [ ] **Step 1: 在 pairing-service.ts 顶部补充导入**

在现有 imports 后追加：
```typescript
import { rosterFlight } from '../../models/roster/roster-flight.js'
```

- [ ] **Step 2: 替换 remove 方法**

将原有（约第 105-116 行）：
```typescript
  async remove(fastify: FastifyInstance, id: number, username: string) {
    const [row] = await fastify.db
      .update(pairing)
      .set({ isDeleted: 1, ...auditUpdate(username) })
      .where(eq(pairing.id, id))
      .returning()
    await Promise.all([
      invalidate(fastify.redis, `${CACHE_PREFIX}:${id}`),
      invalidatePattern(fastify.redis, `${CACHE_PREFIX}:list:*`),
    ])
    return row
  },
```

替换为：
```typescript
  async remove(fastify: FastifyInstance, id: number) {
    // 业务预校验：有排班记录时禁止删除
    const [rostered] = await fastify.db
      .select({ id: rosterFlight.id })
      .from(rosterFlight)
      .where(eq(rosterFlight.pairingId, id))
      .limit(1)
    if (rostered) {
      throw Object.assign(new Error('Pairing has rostered crew and cannot be deleted'), { statusCode: 409 })
    }

    // 事务：先删子表，再删父表（顺序与 FK RESTRICT 要求一致）
    await fastify.db.transaction(async (tx) => {
      await tx.delete(pairingComposition).where(eq(pairingComposition.pairingId, id))
      await tx.delete(pairingSegment).where(eq(pairingSegment.pairingId, id))
      await tx.delete(pairing).where(eq(pairing.id, id))
    })

    await Promise.all([
      invalidate(fastify.redis, `${CACHE_PREFIX}:${id}`),
      invalidatePattern(fastify.redis, `${CACHE_PREFIX}:list:*`),
    ])
  },
```

- [ ] **Step 3: 检查调用 pairing-service.remove 的路由，移除已不需要的 username 参数**

```bash
grep -rn "pairingService.remove\|pairing.*remove" live-server/src/routes/
```

找到调用处，将 `pairingService.remove(fastify, id, username)` 改为 `pairingService.remove(fastify, id)`。

- [ ] **Step 4: 提交**

```bash
git add live-server/src/services/pairing/pairing-service.ts
git commit -m "feat(live-server): pairing 删除改为硬删除，添加 roster 预校验"
```

---

## Task 5: 更新 flight-service（添加删除预校验）

**Files:**
- Modify: `live-server/src/services/flight/flight-service.ts`

- [ ] **Step 1: 查看当前 flight-service.remove 实现**

```bash
grep -A 10 "async remove" live-server/src/services/flight/flight-service.ts
```

- [ ] **Step 2: 在 flight-service.ts 顶部补充导入**

```typescript
import { pairingSegment } from '../../models/pairing/pairing-segment.js'
import { flightComposition } from '../../models/flight/flight-composition.js'
```

- [ ] **Step 3: 在 remove 方法的第一行（update 之前）插入预校验**

找到 `async remove` 方法内 `await fastify.db.update(flight)` 这一行，在**之前**插入：

```typescript
    // 预校验：航班已组环时禁止删除
    const [inPairing] = await fastify.db
      .select({ id: pairingSegment.id })
      .from(pairingSegment)
      .where(eq(pairingSegment.fltId, id))
      .limit(1)
    if (inPairing) {
      throw Object.assign(new Error('Flight is part of a pairing and cannot be deleted'), { statusCode: 409 })
    }

    // 预校验：有编组配置时禁止删除
    const [hasComp] = await fastify.db
      .select({ id: flightComposition.id })
      .from(flightComposition)
      .where(eq(flightComposition.fltId, id))
      .limit(1)
    if (hasComp) {
      throw Object.assign(new Error('Flight has composition config and cannot be deleted'), { statusCode: 409 })
    }
```

`update` 语句本身及其后的缓存失效逻辑不做任何改动。

- [ ] **Step 4: 提交**

```bash
git add live-server/src/services/flight/flight-service.ts
git commit -m "feat(live-server): flight 删除前校验是否已组环或有编组配置"
```

---

## Task 6: 修正 roster-service 中的哨兵值注释

**Files:**
- Modify: `live-server/src/services/roster/roster-service.ts`

- [ ] **Step 1: 更新注释**

将第 22 行：
```typescript
   * Returns both flight tasks (pairingId > 0) and ground tasks (pairingId = 0).
```
改为：
```typescript
   * Returns both flight tasks (pairingId IS NOT NULL) and ground tasks (pairingId IS NULL).
```

- [ ] **Step 2: 提交**

```bash
git add live-server/src/services/roster/roster-service.ts
git commit -m "style(live-server): 更新地面任务判断注释 (0 → null)"
```

---

## Task 7: 集成测试

**Files:**
- Modify: `live-server/src/__tests__/services/pairing/pairing-service.test.ts`

- [ ] **Step 1: 在测试文件中添加 FK 校验相关用例**

打开 `live-server/src/__tests__/services/pairing/pairing-service.test.ts`，在现有测试之后追加：

```typescript
describe('pairing FK constraints', () => {
  it('should reject delete when roster_flight references the pairing', async () => {
    // 先创建一个 pairing
    const pairingRow = await pairingService.create(fastify, {
      division: 'P',
      base: 'PEK',
      fleet: 'B738',
      assignmentGroup: 'FLT',
      assignment: 'FLT',
      schStrDtUtc: new Date('2026-05-01T00:00:00Z'),
      schEndDtUtc: new Date('2026-05-02T00:00:00Z'),
      actStrDtUtc: new Date('2026-05-01T00:00:00Z'),
      actEndDtUtc: new Date('2026-05-02T00:00:00Z'),
      durationDays: 1,
      tafb: 120,
      dutyCount: 1,
      segCount: 1,
    }, 'test')

    // 创建 roster_flight 关联到该 pairing
    await fastify.db.insert(rosterFlight).values({
      crewId: 'TEST001',
      pairingId: pairingRow.id,
      base: 'PEK',
      assignmentGroup: 'FLT',
      actingRank: 'CA',
      createdBy: 'test',
      updatedBy: 'test',
    })

    // 删除应抛出 409
    await expect(pairingService.remove(fastify, pairingRow.id))
      .rejects.toMatchObject({ statusCode: 409, message: /rostered crew/ })
  })

  it('should allow delete when no roster_flight references the pairing', async () => {
    const pairingRow = await pairingService.create(fastify, {
      division: 'P',
      base: 'PEK',
      fleet: 'B738',
      assignmentGroup: 'FLT',
      assignment: 'FLT',
      schStrDtUtc: new Date('2026-06-01T00:00:00Z'),
      schEndDtUtc: new Date('2026-06-02T00:00:00Z'),
      actStrDtUtc: new Date('2026-06-01T00:00:00Z'),
      actEndDtUtc: new Date('2026-06-02T00:00:00Z'),
      durationDays: 1,
      tafb: 120,
      dutyCount: 1,
      segCount: 1,
    }, 'test')

    // 无 roster 关联，应成功删除
    await expect(pairingService.remove(fastify, pairingRow.id)).resolves.not.toThrow()

    // 确认 pairing 已从 DB 真实删除
    const [deleted] = await fastify.db
      .select()
      .from(pairing)
      .where(eq(pairing.id, pairingRow.id))
    expect(deleted).toBeUndefined()
  })

  it('should insert roster_flight with null pairingId for ground tasks', async () => {
    const [row] = await fastify.db.insert(rosterFlight).values({
      crewId: 'TEST001',
      pairingId: null,  // 地面任务
      base: 'PEK',
      assignmentGroup: 'SBY',
      actingRank: 'CA',
      createdBy: 'test',
      updatedBy: 'test',
    }).returning()

    expect(row.pairingId).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认通过**

```bash
cd live-server && npx vitest run src/__tests__/services/pairing/pairing-service.test.ts
```

期望：所有测试 PASS，无 FAIL。

- [ ] **Step 3: 提交**

```bash
git add live-server/src/__tests__/services/pairing/pairing-service.test.ts
git commit -m "test(live-server): 添加 FK 约束和 null 地面任务集成测试"
```

---

## 完成验收标准

- [ ] `pg_constraint` 查询可见全部 8 条 FK 约束
- [ ] 向 `pairing_segment` 插入不存在的 `pairing_id` → DB 报 FK 错误
- [ ] 向 `roster_flight` 插入不存在的 `crew_id` → DB 报 FK 错误
- [ ] 插入地面任务 `roster_flight(pairing_id=NULL)` → 成功
- [ ] 插入地面任务段 `pairing_segment(flt_id=NULL)` → 成功
- [ ] 有 `roster_flight` 记录时调用 `pairingService.remove` → 409 错误
- [ ] 无 `roster_flight` 记录时调用 `pairingService.remove` → pairing 从 DB 真实删除
- [ ] `npx tsc --noEmit` 无错误
- [ ] 全部集成测试通过
