# Code Def Divisions 多值化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `team`/`qualification`/`rank` 的 `division` 与 `certificate.divisions` 支持逗号分隔多值（`'P,C'`），Crew 导入遇到跨部门 code 时合并而不是拆成多行。

**Architecture:** 一次 DB 迁移把四张表字段加宽、折叠历史重复行、重建唯一索引；改写 live-server 导入 worker 的 code 定义补齐逻辑为合并语义（Map 状态驱动，去掉 `seen` 守卫）；联动更新 `rank.division` 的全部 TS/前端消费方（导入时按机组解析单值、数据质量检查、rank CRUD Zod、gantt rank 过滤）。引擎 ro_input 侧按 spec 延后。

**Tech Stack:** PostgreSQL 16 / TypeScript / Drizzle ORM / Fastify / Vitest / React (gantt)

## Global Constraints

- 多值格式：逗号分隔，规范顺序 `P < C < A`（如 `'P,C'`，不是 `'C,P'`）。迁移折叠与导入合并使用同一顺序。
- 唯一索引：`team` → `(filiale, team)`；`qualification` → 新增 `(qualification)`；`rank` 保持 `(rank)`；`certificate` 不加。
- `crew_rank.division` 保持 `varchar(1)` 单值——按机组 division 从 rank 定义解析。
- 引擎侧（`engine-server/F8/ro_input_builder/sections/reference.py`）**本次不改**（spec 非目标）。
- 迁移顺序严格：加宽列 → 折叠重复 → 改索引 → 加注释。
- 所有 SQL 必须打远端 PostgreSQL（§Remote-DB-Only）。
- Spec：`docs/superpowers/specs/2026-08-11-code-def-divisions-comma-multivalue-design.md`

---

### Task 1: DB 迁移（加宽 + 折叠 + 索引 + 注释）

**Files:**
- Create: `sql/migration/2026-08-11-code-def-divisions-multivalue.sql`

**Interfaces:**
- Produces: 迁移文件，可安全在任意 f8* live schema 执行（幂等/可重复折叠，无重复时 HAVING 不命中）。

- [ ] **Step 1: 创建迁移文件**

`sql/migration/2026-08-11-code-def-divisions-multivalue.sql`：

```sql
-- 2026-08-11-code-def-divisions-multivalue.sql
-- team/qualification/rank.division 与 certificate.divisions 改为逗号分隔多值 ('P,C')
-- 顺序：加宽列 → 折叠重复 → 改索引 → 注释

-- 1) 加宽列
ALTER TABLE team          ALTER COLUMN division TYPE varchar(10);
ALTER TABLE qualification ALTER COLUMN division TYPE varchar(10);
ALTER TABLE rank          ALTER COLUMN division TYPE varchar(10);

-- 2) 折叠重复行为单行（先 UPDATE 合并到 keep 行，再 DELETE 冗余行；每表按各自 code 键分组）
UPDATE team t SET division = (
  SELECT string_agg(s.division, ',' ORDER BY CASE s.division WHEN 'P' THEN 0 WHEN 'C' THEN 1 WHEN 'A' THEN 2 ELSE 3 END)
  FROM (SELECT DISTINCT t2.division FROM team t2 WHERE t2.filiale = t.filiale AND t2.team = t.team) s
)
WHERE t.id IN (SELECT min(id) FROM team GROUP BY filiale, team HAVING count(*) > 1);

DELETE FROM team t
USING (SELECT min(id) AS keep_id, filiale, team FROM team GROUP BY filiale, team HAVING count(*) > 1) g
WHERE t.filiale = g.filiale AND t.team = g.team AND t.id <> g.keep_id;

UPDATE qualification t SET division = (
  SELECT string_agg(s.division, ',' ORDER BY CASE s.division WHEN 'P' THEN 0 WHEN 'C' THEN 1 WHEN 'A' THEN 2 ELSE 3 END)
  FROM (SELECT DISTINCT t2.division FROM qualification t2 WHERE t2.qualification = t.qualification) s
)
WHERE t.id IN (SELECT min(id) FROM qualification GROUP BY qualification HAVING count(*) > 1);

DELETE FROM qualification t
USING (SELECT min(id) AS keep_id, qualification FROM qualification GROUP BY qualification HAVING count(*) > 1) g
WHERE t.qualification = g.qualification AND t.id <> g.keep_id;

UPDATE certificate t SET divisions = (
  SELECT string_agg(s.divisions, ',' ORDER BY CASE s.divisions WHEN 'P' THEN 0 WHEN 'C' THEN 1 WHEN 'A' THEN 2 ELSE 3 END)
  FROM (SELECT DISTINCT t2.divisions FROM certificate t2 WHERE t2.certificate = t.certificate) s
)
WHERE t.id IN (SELECT min(id) FROM certificate GROUP BY certificate HAVING count(*) > 1);

DELETE FROM certificate t
USING (SELECT min(id) AS keep_id, certificate FROM certificate GROUP BY certificate HAVING count(*) > 1) g
WHERE t.certificate = g.certificate AND t.id <> g.keep_id;

-- 3) 索引
DROP INDEX uq_team;
CREATE UNIQUE INDEX uq_team ON team (filiale, team);
CREATE UNIQUE INDEX uq_qualification ON qualification (qualification);

-- 4) 注释
COMMENT ON COLUMN team.division IS '适用机组类型，逗号分隔可多值：P=飞行员 C=客舱 A=空中安全员，可组合如 ''P,C''';
COMMENT ON COLUMN qualification.division IS '适用机组类型，逗号分隔可多值：P=飞行员 C=客舱，可组合如 ''P,C''';
COMMENT ON COLUMN rank.division IS '该职级适用的机组类型，逗号分隔可多值：P=飞行员 C=客舱，可组合如 ''P,C''';
COMMENT ON COLUMN certificate.divisions IS '适用机组类型，逗号分隔可多值：P=飞行员 C=客舱 A=空中安全员，可组合如 ''P,C''';
```

- [ ] **Step 2: 远端 dry-run 校验（事务内执行 + 断言 + ROLLBACK，不留持久化）**

SSH 到 SIT（`yuan.z@10.15.12.4`），用 `~/rois/sit/live-server` 的 node + `~/rois/sit/env/live-server.env` 的 `DATABASE_URL`，在 `f8_sit_live` schema 上事务内跑完整个迁移，断言折叠结果后 ROLLBACK。

运行校验脚本（写入 `~/rois/sit/live-server/_mig_check.js`，跑完删除）：

```js
const { Client } = require("pg");
const fs = require("fs");
const env = {};
for (const line of fs.readFileSync("/home/yuan.z/rois/sit/env/live-server.env", "utf8").split("\n")) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const mig = fs.readFileSync("/home/yuan.z/rois/rois-ai/sql/migration/2026-08-11-code-def-divisions-multivalue.sql", "utf8");
const s = env.LIVE_SCHEMA || "f8_sit_live";
(async () => {
  const c = new Client({ connectionString: env.DATABASE_URL });
  await c.connect();
  await c.query("BEGIN");
  try {
    // 折叠前记基线
    const before = await c.query(`SELECT (SELECT count(*) FROM ${s}.team) AS team,
      (SELECT count(*) FROM ${s}.qualification) AS qual, (SELECT count(*) FROM ${s}.certificate) AS cert`);
    // 执行迁移（事务内，rollback 后无持久化）
    await c.query(mig);
    const after = await c.query(`SELECT (SELECT count(*) FROM ${s}.team) AS team,
      (SELECT count(*) FROM ${s}.qualification) AS qual, (SELECT count(*) FROM ${s}.certificate) AS cert,
      (SELECT count(*) FROM (SELECT 1 FROM ${s}.team GROUP BY filiale, team HAVING count(*) > 1) x) AS team_dup_groups,
      (SELECT count(*) FROM (SELECT 1 FROM ${s}.qualification GROUP BY qualification HAVING count(*) > 1) x) AS qual_dup_groups,
      (SELECT count(*) FROM (SELECT 1 FROM ${s}.certificate GROUP BY certificate HAVING count(*) > 1) x) AS cert_dup_groups`);
    const idx = await c.query(`SELECT indexname FROM pg_indexes WHERE schemaname='${s}' AND indexname IN ('uq_team','uq_qualification')`);
    const col = await c.query(`SELECT table_name, column_name, character_maximum_length FROM information_schema.columns
      WHERE table_schema='${s}' AND table_name IN ('team','qualification','rank','certificate')
        AND column_name IN ('division','divisions')`);
    console.log("before:", JSON.stringify(before.rows[0]));
    console.log("after:", JSON.stringify(after.rows[0]));
    console.log("indexes:", idx.rows.map(r => r.indexname).join(","));
    console.log("columns:", JSON.stringify(col.rows));
    await c.query("ROLLBACK");
    console.log("DRY-RUN OK, ROLLED BACK");
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("DRY-RUN FAIL:", e.message);
    process.exit(1);
  }
  await c.end();
})();
```

期望（SIT 基线 team≈122、qual≈7、cert≈44）：
- `after.team = before.team - 14`（SIT 有 14 个双部门 team code → 108）
- `team_dup_groups / qual_dup_groups / cert_dup_groups` 全为 0
- 索引含 `uq_team,uq_qualification`；四列 `character_maximum_length=10`

- [ ] **Step 3: 提交**

```bash
git add sql/migration/2026-08-11-code-def-divisions-multivalue.sql
git commit -m "feat(crew): migration for multi-value code-def divisions ('P,C')"
```

---

### Task 2: Drizzle model 同步 + rank CRUD Zod

**Files:**
- Modify: `live-server/src/models/base/base.ts`（team model：division 长度 + 唯一索引）
- Modify: `live-server/src/models/base/qualification.ts`（division 长度 + 唯一索引）
- Modify: `live-server/src/models/base/rank.ts`（division 长度）
- Modify: `live-server/src/routes/base/rank.ts:10`（createRankSchema）

**Interfaces:**
- Produces: model 与 DB 结构一致（Drizzle 类型/索引反映多值语义）；rank 创建接口允许 `division` 传 `'P,C'`。

- [ ] **Step 1: 更新 team model**

`live-server/src/models/base/base.ts`，把 `team` 表定义（约 31-46 行）改为：

```typescript
export const team = pgTable('team', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  filiale: varchar('filiale', { length: 6 }).notNull(),
  team: varchar('team', { length: 50 }).notNull(),
  description: varchar('description', { length: 100 }),
  displayOrder: integer('display_order'),
  headColor: varchar('head_color', { length: 20 }),
  division: varchar('division', { length: 10 }).notNull(),
  teamGroup: varchar('team_group', { length: 40 }),
}, (table) => [
  uniqueIndex('uq_team').on(table.filiale, table.team),
])
```

变更点：`division` length `1`→`10`；`uniqueIndex('uq_team').on(table.filiale, table.team, table.division)` → `.on(table.filiale, table.team)`（去掉 division）。

- [ ] **Step 2: 更新 qualification model**

`live-server/src/models/base/qualification.ts`：`division: varchar('division', { length: 1 }).notNull()` → `{ length: 10 }`；在 pgTable 末尾加唯一索引。当前文件结尾是 `})`，改为：

```typescript
  baseMonthFlag: integer('base_month_flag').notNull().default(0),
}, (table) => [
  uniqueIndex('uq_qualification').on(table.qualification),
])
```

并在文件头部 import 中加 `uniqueIndex`：

```typescript
import { pgTable, bigint, varchar, integer, smallint, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
```

- [ ] **Step 3: 更新 rank model**

`live-server/src/models/base/rank.ts`：`division: varchar('division', { length: 1 }).notNull()` → `{ length: 10 }`。

- [ ] **Step 4: 更新 rank CRUD Zod**

`live-server/src/routes/base/rank.ts:10`：

```typescript
division: z.string().max(1),
```
→
```typescript
division: z.string().max(10),
```

- [ ] **Step 5: Typecheck + 相关测试**

```bash
cd live-server && node_modules/.bin/tsc --noEmit
```
期望：EXIT 0。

- [ ] **Step 6: 提交**

```bash
git add live-server/src/models/base/base.ts live-server/src/models/base/qualification.ts live-server/src/models/base/rank.ts live-server/src/routes/base/rank.ts
git commit -m "refactor(crew): widen division models + rank Zod for multi-value 'P,C'"
```

---

### Task 3: 导入 worker 合并逻辑（核心，TDD）

**Files:**
- Modify: `live-server/src/workers/crew-inbound-worker.ts`
- Test: `live-server/src/__tests__/unit/crew-inbound-worker.test.ts`

**Interfaces:**
- Consumes: `processCrewImportJob`（现有导出，签名不变）。
- Produces:
  - `mergeDivisions(existing: string, incoming: string): string` —— 去重、按 P<C<A 排序、逗号连接。
  - `resolveCrewDivision(rankDivisions: string, crewDivision: string): string` —— 从多值解析机组单值。
  - `teamCodeKey(filiale: string, team: string): string` —— `'${filiale}|${team}'`。
  - `loadCrewCodeDefs(db)` 返回 `CrewCodeDefs`（三个 `Map<string,string>`）。
  - `ensureBatchCodeDefs(tx, records, defs)` 合并语义。
- 删除旧符号：`CrewCodeDefSets`、`teamKey(filiale, team, division)`、旧的 `loadCrewCodeDefs`/`ensureBatchCodeDefs`（`seen` 守卫版）。

- [ ] **Step 1: 写失败测试（更新 mock + 新增合并用例）**

重写 `live-server/src/__tests__/unit/crew-inbound-worker.test.ts` 的 `makeMockDb` 为查询感知 + 返回 divisions：

```typescript
const makeMockDb = (
  existing: {
    crewIds?: string[]
    certificates?: Array<{ certificate: string; divisions: string }>
    qualifications?: Array<{ qualification: string; division: string }>
    teams?: Array<{ filiale: string; team: string; division: string }>
  } = {},
) => {
  const execute = vi.fn(async (query: unknown) => {
    const q = sqlText(query)
    if (q.includes('SELECT crew_id FROM crew WHERE')) {
      return { rows: (existing.crewIds ?? []).map((crewId) => ({ crew_id: crewId })) }
    }
    if (q.includes('FROM certificate')) return { rows: existing.certificates ?? [] }
    if (q.includes('FROM qualification')) return { rows: existing.qualifications ?? [] }
    if (q.includes('FROM team')) return { rows: existing.teams ?? [] }
    return { rows: [] }
  })
  const db = {
    execute,
    transaction: async (cb: (tx: unknown) => unknown) => cb(db),
  }
  return db
}
```

保留 `crewRecord`，并新增两个辅助（本测试文件内）：

```typescript
const teamRecord = (team: string) => ({
  team, effDt: '2021-08-01T00:00:00.000Z', expDt: null, isValid: true, remarks: team,
})
const cabinRecord = { ...crewRecord, crewId: 'C002', division: 'C' }
```

原有两个用例（`upserts crew and its sub-entities` / `upserts PBS user projection`）断言不变，改调用 mock 参数不影响（`makeMockDb()` 空 defs）。第三个用例 `counts duplicate crew source rows` 改用 `makeMockDb({ crewIds: ['C001'] })`（已是该签名）。

更新「inserts missing certificate/qualification/team code definitions」的断言（保持 INSERT 存在，columns 不变）：

```typescript
expect(executedSql).toContain("INSERT INTO certificate (certificate, divisions, certificate_type, created_by, updated_by)\n        VALUES (RHS, P, 'O', 'F8_IMPORT', 'F8_IMPORT')")
expect(executedSql).toContain("INSERT INTO qualification (qualification, filiale, division, created_by, updated_by)\n        VALUES (737, F8, P, 'F8_IMPORT', 'F8_IMPORT')")
expect(executedSql).toContain("INSERT INTO team (filiale, team, division, created_by, updated_by)\n        VALUES (F8, EQ737, P, 'F8_IMPORT', 'F8_IMPORT')")
```

更新「does not re-insert code definitions that already exist」为「已存在且已含 → 无 INSERT/UPDATE」（mock 传 divisions='P'，crewRecord division='P'）：

```typescript
const mockDb = makeMockDb({
  certificates: [{ certificate: 'RHS', divisions: 'P' }],
  qualifications: [{ qualification: '737', division: 'P' }],
  teams: [{ filiale: 'F8', team: 'EQ737', division: 'P' }],
})
// ...
expect(executedSql).not.toContain('INSERT INTO certificate')
expect(executedSql).not.toContain('UPDATE certificate')
expect(executedSql).not.toContain('INSERT INTO qualification')
expect(executedSql).not.toContain('UPDATE qualification')
expect(executedSql).not.toContain('INSERT INTO team')
expect(executedSql).not.toContain('UPDATE team')
```

新增用例 1「已存在但不含该 division → UPDATE 合并」：

```typescript
it('merges an existing code definition that lacks the incoming division', async () => {
  const { processCrewImportJob } = await import('../../workers/crew-inbound-worker.js')
  const mockDb = makeMockDb({
    certificates: [{ certificate: 'RHS', divisions: 'P' }],
    qualifications: [{ qualification: '737', division: 'P' }],
    teams: [{ filiale: 'F8', team: 'EQ737', division: 'P' }],
  })
  const job = { syncId: 'test', filiale: 'F8', syncRangeDt: ['2026-06-01', '2026-06-30'] as [string, string], records: [cabinRecord] }
  const result = await processCrewImportJob(job, mockDb as never, processOptions)
  expect(result.failed).toBe(0)
  const executedSql = (mockDb.execute.mock.calls as unknown[][])
    .map((call) => sqlText(call[0])).join('\n')
  expect(executedSql).toContain("UPDATE certificate SET divisions = P,C, updated_by = 'F8_IMPORT', updated_at = now()\n        WHERE certificate = RHS")
  expect(executedSql).toContain("UPDATE qualification SET division = P,C, updated_by = 'F8_IMPORT', updated_at = now()\n        WHERE qualification = 737")
  expect(executedSql).toContain("UPDATE team SET division = P,C, updated_by = 'F8_IMPORT', updated_at = now()\n        WHERE filiale = F8 AND team = EQ737")
  expect(executedSql).not.toContain('INSERT INTO certificate')
  expect(executedSql).not.toContain('INSERT INTO qualification')
  expect(executedSql).not.toContain('INSERT INTO team')
})
```

新增用例 2「同一 batch 内 P/C 两条记录引用同一新 code → 第二次 UPDATE 合并」：

```typescript
it('merges a new team code referenced by both P and C records in one batch', async () => {
  const { processCrewImportJob } = await import('../../workers/crew-inbound-worker.js')
  const mockDb = makeMockDb() // empty defs → NEWTM is new
  const pilotRec = { ...crewRecord, crewId: 'P001', division: 'P', certificates: [], qualifications: [], teams: [teamRecord('NEWTM')] }
  const cabinRec2 = { ...crewRecord, crewId: 'C002', division: 'C', certificates: [], qualifications: [], teams: [teamRecord('NEWTM')] }
  const job = { syncId: 'test', filiale: 'F8', syncRangeDt: ['2026-06-01', '2026-06-30'] as [string, string], records: [pilotRec, cabinRec2] }
  const result = await processCrewImportJob(job, mockDb as never, processOptions)
  expect(result.failed).toBe(0)
  const executedSql = (mockDb.execute.mock.calls as unknown[][])
    .map((call) => sqlText(call[0])).join('\n')
  expect(executedSql).toContain("INSERT INTO team (filiale, team, division, created_by, updated_by)\n        VALUES (F8, NEWTM, P, 'F8_IMPORT', 'F8_IMPORT')")
  expect(executedSql).toContain("UPDATE team SET division = P,C, updated_by = 'F8_IMPORT', updated_at = now()\n        WHERE filiale = F8 AND team = NEWTM")
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd live-server && node_modules/.bin/vitest run src/__tests__/unit/crew-inbound-worker.test.ts
```
期望：新增用例 FAIL（当前是 `seen` 守卫 + Set 逻辑，无 UPDATE 合并 / 无 divisions Map）。

- [ ] **Step 3: 实现 worker 合并逻辑**

`live-server/src/workers/crew-inbound-worker.ts`。用以下代码**替换** `CrewCodeDefSets`/`teamKey`/`loadCrewCodeDefs`/`ensureBatchCodeDefs`（约 68-140 行，即 `currentRankForCrew` 与 `upsertCrew` 之间）：

```typescript
interface CrewCodeDefs {
  certificates: Map<string, string>   // certificate 代码 → divisions
  qualifications: Map<string, string> // qualification 代码 → division(s)
  teams: Map<string, string>          // `${filiale}|${team}` → division(s)
}

/** divisions 规范顺序：P < C < A */
const DIVISION_ORDER: Record<string, number> = { P: 0, C: 1, A: 2 }

/** 合并两段 divisions：去重、按 P<C<A 排序、逗号连接。existing 为空视为空串。 */
const mergeDivisions = (existing: string, incoming: string): string => {
  const set = new Set<string>()
  for (const part of `${existing},${incoming}`.split(',')) {
    const d = part.trim().toUpperCase()
    if (d) set.add(d)
  }
  return [...set].sort((a, b) => (DIVISION_ORDER[a] ?? 99) - (DIVISION_ORDER[b] ?? 99)).join(',')
}

/** rank 定义表 division 可能是 'P,C'，解析出该机组应写的单值 division。 */
const resolveCrewDivision = (rankDivisions: string, crewDivision: string): string => {
  const divs = rankDivisions.split(',').map((d) => d.trim()).filter(Boolean)
  if (divs.includes(crewDivision)) return crewDivision
  return divs[0] ?? crewDivision
}

/** team 唯一键：${filiale}|${team}（一个 code 一行，不再带 division）。 */
const teamCodeKey = (filiale: string, team: string): string => `${filiale}|${team}`

async function loadCrewCodeDefs(db: NodePgDatabase<Record<string, unknown>>): Promise<CrewCodeDefs> {
  const defs: CrewCodeDefs = {
    certificates: new Map(),
    qualifications: new Map(),
    teams: new Map(),
  }
  const certRows = await db.execute(sql`SELECT certificate, divisions FROM certificate`)
  for (const r of certRows.rows as Array<{ certificate: string; divisions: string }>) {
    defs.certificates.set(String(r.certificate), String(r.divisions))
  }
  const qualRows = await db.execute(sql`SELECT qualification, division FROM qualification`)
  for (const r of qualRows.rows as Array<{ qualification: string; division: string }>) {
    defs.qualifications.set(String(r.qualification), String(r.division))
  }
  const teamRows = await db.execute(sql`SELECT filiale, team, division FROM team`)
  for (const r of teamRows.rows as Array<{ filiale: string; team: string; division: string }>) {
    defs.teams.set(teamCodeKey(String(r.filiale), String(r.team)), String(r.division))
  }
  return defs
}

/**
 * 批量导入前补齐 code 定义表：certificate/qualification/team 中缺失的 code 插入，
 * 已存在但缺当前 division 的合并（UPDATE divisions='P,C'），已含则跳过。
 * 同一 batch 内同一 code 被 P/C 两条记录引用时，Map 状态就地更新，第二条自然触发 UPDATE 合并。
 * 置于每行 SAVEPOINT 之前，单行失败回滚不影响定义行。
 */
async function ensureBatchCodeDefs(
  tx: Tx,
  records: CrewImportRecord[],
  defs: CrewCodeDefs,
): Promise<void> {
  for (const rec of records) {
    for (const ct of rec.certificates) {
      const code = ct.certificate
      const existing = defs.certificates.get(code)
      const merged = existing === undefined ? rec.division : mergeDivisions(existing, rec.division)
      if (existing === undefined) {
        await tx.execute(sql`
          INSERT INTO certificate (certificate, divisions, certificate_type, created_by, updated_by)
          VALUES (${code}, ${merged}, 'O', 'F8_IMPORT', 'F8_IMPORT')
        `)
      } else if (merged !== existing) {
        await tx.execute(sql`
          UPDATE certificate SET divisions = ${merged}, updated_by = 'F8_IMPORT', updated_at = now()
          WHERE certificate = ${code}
        `)
      }
      defs.certificates.set(code, merged)
    }
    for (const q of rec.qualifications) {
      const code = q.qualification
      const existing = defs.qualifications.get(code)
      const merged = existing === undefined ? rec.division : mergeDivisions(existing, rec.division)
      if (existing === undefined) {
        await tx.execute(sql`
          INSERT INTO qualification (qualification, filiale, division, created_by, updated_by)
          VALUES (${code}, ${rec.filiale}, ${merged}, 'F8_IMPORT', 'F8_IMPORT')
        `)
      } else if (merged !== existing) {
        await tx.execute(sql`
          UPDATE qualification SET division = ${merged}, updated_by = 'F8_IMPORT', updated_at = now()
          WHERE qualification = ${code}
        `)
      }
      defs.qualifications.set(code, merged)
    }
    for (const t of rec.teams ?? []) {
      const key = teamCodeKey(rec.filiale, t.team)
      const existing = defs.teams.get(key)
      const merged = existing === undefined ? rec.division : mergeDivisions(existing, rec.division)
      if (existing === undefined) {
        await tx.execute(sql`
          INSERT INTO team (filiale, team, division, created_by, updated_by)
          VALUES (${rec.filiale}, ${t.team}, ${merged}, 'F8_IMPORT', 'F8_IMPORT')
        `)
      } else if (merged !== existing) {
        await tx.execute(sql`
          UPDATE team SET division = ${merged}, updated_by = 'F8_IMPORT', updated_at = now()
          WHERE filiale = ${rec.filiale} AND team = ${t.team}
        `)
      }
      defs.teams.set(key, merged)
    }
  }
}
```

再改 `syncChildren` 里 crew_rank 的 division 解析（约 285 行）：

```typescript
const division = resolveCrewDivision(rankDiv.get(r.rank.toUpperCase()) ?? '', rec.division)
```
（替换原来的 `const division = rankDiv.get(r.rank.toUpperCase()) ?? rec.division`。`rankDivMap` 的构建不变，`SELECT rank, division FROM rank` 现在拿到的就是多值。）

`processCrewImportJob` 中对 `loadCrewCodeDefs` / `ensureBatchCodeDefs` 的调用保持不变（`defs` 类型从 Sets 换成 Maps，调用点签名一致）。

- [ ] **Step 4: 运行测试确认通过**

```bash
cd live-server && node_modules/.bin/vitest run src/__tests__/unit/crew-inbound-worker.test.ts
```
期望：全部通过（含 2 个新合并用例）。

- [ ] **Step 5: Typecheck + 远端 EXPLAIN 校验新 SQL**

```bash
cd live-server && node_modules/.bin/tsc --noEmit
```
期望 EXIT 0。

对三条 UPDATE 与三条 INSERT（含 `'P,C'` 值）在远端 SIT schema 做 `EXPLAIN` 干跑（参照任务 1 的 ssh/node 方式），确认列引用与语法合法。

- [ ] **Step 6: 提交**

```bash
git add live-server/src/workers/crew-inbound-worker.ts live-server/src/__tests__/unit/crew-inbound-worker.test.ts
git commit -m "feat(crew): merge code-def divisions on import instead of duplicating"
```

---

### Task 4: rank.division 其余消费方（数据质量检查 + gantt 过滤）

**Files:**
- Modify: `live-server/src/config/data-quality-checks.ts`（crew_rank_division_mismatch SQL）
- Modify: `gantt/src/components/scenario/filter/use-rank-options.ts`
- Test: `gantt/src/components/scenario/filter/__tests__/use-rank-options.test.ts`

**Interfaces:**
- Consumes: 任务 3 已引入的多值语义（`rank.division` 可能是 `'P,C'`）。
- Produces: `rankAppliesToDivision(rankDivision: string, division: string): boolean`（gantt 导出，纯函数）。

- [ ] **Step 1: 更新数据质量检查 SQL**

`live-server/src/config/data-quality-checks.ts`，`crew_rank_division_mismatch` 的 sql 中：

```sql
WHERE cr.division != r.division
```
→
```sql
WHERE NOT (cr.division = ANY(string_to_array(r.division, ',')))
```

（`cr.division` 为 NULL 时 `NOT (NULL = ANY(...))` 为 NULL，行为与旧逻辑一致——不标记。）

- [ ] **Step 2: 写 gantt 失败测试**

`gantt/src/components/scenario/filter/__tests__/use-rank-options.test.ts`：

```typescript
import { describe, expect, it } from 'vitest'

import { rankAppliesToDivision } from '../use-rank-options'

describe('rankAppliesToDivision', () => {
  it('matches a single-division rank', () => {
    expect(rankAppliesToDivision('P', 'P')).toBe(true)
    expect(rankAppliesToDivision('P', 'C')).toBe(false)
  })

  it('matches a multi-division rank for either division', () => {
    expect(rankAppliesToDivision('P,C', 'P')).toBe(true)
    expect(rankAppliesToDivision('P,C', 'C')).toBe(true)
    expect(rankAppliesToDivision('P,C', 'A')).toBe(false)
  })

  it('matches regardless of non-canonical order', () => {
    expect(rankAppliesToDivision('C,P', 'P')).toBe(true)
  })

  it('keeps all ranks when no division filter is set', () => {
    expect(rankAppliesToDivision('P', '')).toBe(true)
    expect(rankAppliesToDivision('C', '')).toBe(true)
  })
})
```

- [ ] **Step 3: 运行确认失败**

```bash
cd gantt && node_modules/.bin/vitest run src/components/scenario/filter/__tests__/use-rank-options.test.ts
```
期望：FAIL（`rankAppliesToDivision` 未导出）。

- [ ] **Step 4: 实现 gantt 过滤**

`gantt/src/components/scenario/filter/use-rank-options.ts`，加导出纯函数并在 filter 里使用：

```typescript
/** True when a rank's comma-separated divisions include the given division ('' = any). */
export const rankAppliesToDivision = (rankDivision: string, division: string): boolean =>
  !division ||
  rankDivision.split(',').map((d) => d.trim().toUpperCase()).includes(division.trim().toUpperCase())
```

`useRankOptions` 的 useMemo 中，把：

```typescript
.filter((r) => !normalizedDivision || r.division.trim().toUpperCase() === normalizedDivision)
```
改为：
```typescript
.filter((r) => rankAppliesToDivision(r.division, normalizedDivision))
```

- [ ] **Step 5: 运行测试确认通过 + gantt typecheck**

```bash
cd gantt && node_modules/.bin/vitest run src/components/scenario/filter/__tests__/use-rank-options.test.ts
```
期望：PASS。
```bash
cd gantt && node_modules/.bin/tsc --noEmit
```
期望 EXIT 0。

- [ ] **Step 6: 提交**

```bash
git add live-server/src/config/data-quality-checks.ts gantt/src/components/scenario/filter/use-rank-options.ts gantt/src/components/scenario/filter/__tests__/use-rank-options.test.ts
git commit -m "fix(crew): rank division membership checks in quality check + gantt filter"
```

---

### Task 5: SIT 部署 + 重导验证（需用户确认，共享环境）

**Files:** 无（运维步骤）

**Interfaces:**
- Consumes: 任务 1 迁移、任务 3 worker 新代码。

- [ ] **Step 1: 确认当前 live-server 进程是含新代码的 build**

SSH SIT：`ls -l --time-style=full-iso ~/rois/sit/live-server/dist/workers/crew-inbound-worker.js` 确认 mtime 晚于本次构建；`ps aux | grep "node dist/index.js"` 确认 port 3000 持有者进程启动时间晚于 build。若仍是旧 root 进程：`sudo kill <pid>` 后 `bash ~/rois/sit/service.sh start live-server`（参照 2026-08-10 的 EADDRINUSE 教训）。

- [ ] **Step 2: 执行迁移**

在 SIT 事务内执行 `sql/migration/2026-08-11-code-def-divisions-multivalue.sql`（用任务 1 的 node/pg 方式，`COMMIT` 而非 ROLLBACK）。确认 team 108 行、无重复组、索引存在。

- [ ] **Step 3: 重导 Crew + 验证收敛**

重导 Crew 后查询：

```sql
SELECT team, division FROM team WHERE team IN ('INB','LH','EQ737');
SELECT certificate, divisions FROM certificate ORDER BY certificate;
-- 确认：无 P/C 双行；跨部门 code 为 'P,C'；新 code 首次插入为单值
```

期望：`team` 中 INB/LH/EQ737 各一行 `'P,C'`；`certificate` 无重复 code。

- [ ] **Step 4: 验证 rank 消费方**

`curl -s http://127.0.0.1:3000/api/rank` 返回正常；`/api/rank` POST 允许 `division: 'P,C'`（Zod max 10）。

---

## 自审记录

- **Spec 覆盖**：§3/§4 → Task 1、2；§5 → Task 3；§6 → Task 2（Zod/model）+ Task 4（quality-check/gantt）；§7 → 各任务测试；§8 → Task 5；§9 引擎延后 → 非目标，未建任务。
- **占位符**：无 TBD/TODO；每步含真实代码/命令。
- **类型一致性**：`mergeDivisions` / `resolveCrewDivision` / `teamCodeKey` / `CrewCodeDefs` / `ensureBatchCodeDefs(tx, records, defs)` 在 Task 3 定义并被 `processCrewImportJob` 调用（签名不变）；`rankAppliesToDivision` 在 Task 4 定义与测试同名同签名。
