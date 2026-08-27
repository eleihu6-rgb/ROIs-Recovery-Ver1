# 设计：code 定义表 division 字段改为逗号分隔多值（'P,C'）

> 状态：已确认设计，待实施
> 日期：2026-08-11
> 涉及模块：live-server（导入 worker、rank CRUD、数据质量检查）、gantt（rank 过滤）、sql（迁移）、engine-server（**延后**）

## 1. 背景与问题

F8 Crew 接口导入时，connector-server 把 crew 的 certificates/qualifications/teams 子级数据经
`connector.crew.inbound` 队列交给 live-server 的 `crew-inbound-worker` 落库，并自动补齐
`certificate` / `qualification` / `team` 三个 code 定义表（见 2026-08-10 已合入的
`ensureBatchCodeDefs`）。

当前这三个定义表的 `division` 字段是 `varchar(1)`（单值 `'P'` 或 `'C'`），`team` 还有
`uq_team (filiale, team, division)` 唯一索引。导致**同一个 code 在 P/C 两部门都用时，会拆成两行**
——SIT 已出现 14 个 team code（INB/INO/INT/LH/LOA/LR/N/NF/USMCL/22NF4/CRMI/DOMO/EQ737/FYFA）
在 P 和 C 下各一行。

目标：`division` 支持逗号分隔多值（如 `'P,C'`），一个 code 一行、可同时归属两个部门；
导入时遇到已有 code 做合并而不是新增一行。

## 2. 目标 / 非目标

### 目标
- `team` / `qualification` / `rank` 三张表的 `division` 字段（`certificate` 为 `divisions`）统一为
  逗号分隔多值，语义：`P`=飞行员 `C`=客舱 `A`=空中安全员，可组合如 `'P,C'`。
- `team` 唯一索引改为 `(filiale, team)`（一个 code 一行）。
- `qualification` 补唯一索引 `(qualification)`（配合合并逻辑，防并发重复）。
- 导入逻辑改为合并语义：code 已存在且不含当前 division → `UPDATE` 追加；已含 → 跳过。
- 一次性迁移折叠历史重复行。
- 为改动字段补充列注释（`COMMENT ON COLUMN`），供后续开发明确含义。

### 非目标
- **rank 不参与本次导入处理**，仅做字段类型 + 消费方联动修改；后续手工新增的 'P,C' rank 才能生效。
- **engine-server 的 ro_input reference（`F8/ro_input_builder/sections/reference.py`）暂不改**。
  目前没有任何 rank 的 `division='P,C'`，reference 文件里仍是单值；待真正出现 'P,C' rank 时再处理
  solver 侧。此项在 spec 中登记为 follow-up。
- 不改 `crew_rank.division`（保持 `varchar(1)` 单值——它是「该机组该职级记录」的 division，按机组解析）。
- 不改 `rank_position.division`、`division` 表、各筛选/业务侧 `division: max(1)`（均为无关字段）。

## 3. 数据模型变更

| 表 | 字段 | 现值 | 改为 | 唯一索引 |
|----|------|------|------|----------|
| `team` | `division` | varchar(1) not null | varchar(10) not null | 删 `uq_team (filiale,team,division)`，建 `uq_team (filiale,team)` |
| `qualification` | `division` | varchar(1) not null | varchar(10) not null | 新增 `uq_qualification (qualification)` |
| `rank` | `division` | varchar(1) not null | varchar(10) not null | `uq_rank_code (rank)` 不变 |
| `certificate` | `divisions` | varchar(10) not null | 不变（已够宽） | 无（保持现状） |

**规范：** 多值用逗号分隔，统一规范顺序 `P < C < A`（如 `'P,C'`，不是 `'C,P'`）。迁移折叠 SQL 与
导入合并逻辑使用同一顺序，保证确定性。

**列注释（新增/更新）：**
- `team.division`：`适用机组类型，逗号分隔可多值：P=飞行员 C=客舱 A=空中安全员，可组合如 'P,C'`
- `qualification.division`：`适用机组类型，逗号分隔可多值：P=飞行员 C=客舱，可组合如 'P,C'`
- `rank.division`：`该职级适用的机组类型，逗号分隔可多值：P=飞行员 C=客舱，可组合如 'P,C'`
- `certificate.divisions`：更新为 `适用机组类型，逗号分隔可多值：P=飞行员 C=客舱 A=空中安全员，可组合如 'P,C'`

## 4. 数据库迁移（`sql/migration/2026-08-11-code-def-divisions-multivalue.sql`）

顺序严格：**先折叠重复 → 再改索引**（否则新唯一索引在重复数据上建不出来）。

```sql
-- 1) 加宽列
ALTER TABLE team          ALTER COLUMN division TYPE varchar(10);
ALTER TABLE qualification ALTER COLUMN division TYPE varchar(10);
ALTER TABLE rank          ALTER COLUMN division TYPE varchar(10);

-- 2) 折叠重复行（通用逻辑，每表一段；顺序先 UPDATE 合并、再 DELETE 冗余行）
-- team 按 (filiale, team) 分组；qualification 按 qualification 分组；certificate 按 certificate 分组
UPDATE team t SET division = (
  SELECT string_agg(s.division, ',' ORDER BY CASE s.division WHEN 'P' THEN 0 WHEN 'C' THEN 1 WHEN 'A' THEN 2 ELSE 3 END)
  FROM (SELECT DISTINCT t2.division FROM team t2 WHERE t2.filiale = t.filiale AND t2.team = t.team) s
)
WHERE t.id IN (SELECT min(id) FROM team GROUP BY filiale, team HAVING count(*) > 1);

DELETE FROM team t
USING (SELECT min(id) AS keep_id, filiale, team FROM team GROUP BY filiale, team HAVING count(*) > 1) g
WHERE t.filiale = g.filiale AND t.team = g.team AND t.id <> g.keep_id;
-- 同法折叠 qualification（按 qualification）、certificate（按 certificate）

-- 3) 索引
DROP INDEX uq_team;
CREATE UNIQUE INDEX uq_team ON team (filiale, team);
CREATE UNIQUE INDEX uq_qualification ON qualification (qualification);

-- 4) 列注释
COMMENT ON COLUMN team.division IS '适用机组类型，逗号分隔可多值：P=飞行员 C=客舱 A=空中安全员，可组合如 ''P,C''';
COMMENT ON COLUMN qualification.division IS '适用机组类型，逗号分隔可多值：P=飞行员 C=客舱，可组合如 ''P,C''';
COMMENT ON COLUMN rank.division IS '该职级适用的机组类型，逗号分隔可多值：P=飞行员 C=客舱，可组合如 ''P,C''';
COMMENT ON COLUMN certificate.divisions IS '适用机组类型，逗号分隔可多值：P=飞行员 C=客舱 A=空中安全员，可组合如 ''P,C''';
```

注意：UPDATE 与 DELETE 分两句执行（PG 的 WITH 数据修改 CTE 并发执行顺序不可控，不能依赖）。折叠逻辑
对无重复的表是无害的（`HAVING count(*) > 1` 不命中）。

## 5. 导入合并逻辑（`live-server/src/workers/crew-inbound-worker.ts`）

### `loadCrewCodeDefs` 改为返回「code → divisions 字符串」的 Map
```ts
interface CrewCodeDefs {
  certificates: Map<string, string>   // certificate 代码 → divisions
  qualifications: Map<string, string> // qualification 代码 → division(s)
  teams: Map<string, string>          // `${filiale}|${team}` → division(s)
}
```
- certificate：`SELECT certificate, divisions FROM certificate`
- qualification：`SELECT qualification, division FROM qualification`
- team：`SELECT filiale, team, division FROM team`，key = `teamCodeKey(filiale, team)`（`${filiale}|${team}`，不再带 division）

### 合并工具
```ts
const DIVISION_ORDER: Record<string, number> = { P: 0, C: 1, A: 2 }
/** 合并两段 divisions，去重、按 P<C<A 排序，逗号连接。existing 为空视为空串。 */
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
```

### `ensureBatchCodeDefs` 改为合并语义（去掉原 `seen` 去重守卫）
对 certificate/qualification/team 三类，逐 code：
- **Map 无此 code** → `INSERT`（division = 机组 division）
- **Map 有且合并后 ≠ 现值** → `UPDATE divisions = 合并值`
- **Map 有且合并后 == 现值** → 跳过

`defs` Map 在 INSERT/UPDATE 后就地更新。**不依赖 `seen` 守卫**：同一 batch 内同一 code 出现在
P/C 两条 crew 记录时，第二条读取到已更新的 Map 值，自然触发 UPDATE 合并（如 `'P'` → `'P,C'`）；
第三条及以后读到 `'P,C'` 后合并结果不变 → 跳过。因此无需按 code 去重，Map 状态即是去重依据。

示例（batch 内 record A division=P、record B division=C，team code `LH`）：
1. A：Map 无 `F8|LH` → INSERT `(F8, LH, 'P')`，Map 置 `'P'`
2. B：Map 有 `'P'`，合并 `'P'+'C'` = `'P,C'` ≠ `'P'` → UPDATE `division='P,C'`，Map 置 `'P,C'`
3. （后续 C 记录的 `LH` 合并后仍 `'P,C'` → 跳过）

### crew_rank.division 解析
`rankDivMap`（rank → division）改存多值。`syncChildren` 中：
```ts
const division = resolveCrewDivision(rankDiv.get(r.rank.toUpperCase()) ?? '', rec.division)
```
单值 rank 行为不变（rank='P'、crew='P' → 'P'；rank='P'、crew='C' → 不包含则取列表首个 'P'）。

## 6. rank.division 消费方联动（rank 不在导入中，字段改动需统一）

| 位置 | 现值 | 改为 |
|------|------|------|
| `live-server/src/workers/crew-inbound-worker.ts` | 直接用 rank.division 写 crew_rank.division | `resolveCrewDivision`（见 §5） |
| `live-server/src/config/data-quality-checks.ts`（crew_rank_division_mismatch） | `cr.division != r.division` | `NOT (cr.division = ANY(string_to_array(r.division, ',')))` |
| `live-server/src/routes/base/rank.ts`（createRankSchema） | `division: z.string().max(1)` | `z.string().max(10)` |
| `live-server/src/models/base/rank.ts` | `division: varchar('division', { length: 1 })` | `length: 10` |
| `gantt/src/components/scenario/filter/use-rank-options.ts` | `.filter(r => r.division === normalizedDivision)` | 逗号拆分后包含判断：`r.division.split(',').map(d => d.trim().toUpperCase()).includes(normalizedDivision)` |
| `engine-server/F8/ro_input_builder/sections/reference.py` | 透传 rank.division | **不改**（非目标，登记 follow-up） |

**已核查不需要改的（`division: max(1)` 但属于无关字段）：**
`routes/crew/crew-history.ts`、`routes/crew/crew.ts`、`routes/pairing/pairing.ts`、
`routes/base/department.ts`、`routes/base/division.ts` —— 均为 crew_rank / 筛选 / department / division
表自身，与本次三个定义表无关。

**Drizzle model 更新：** `models/base/base.ts`（team.division → length 10、uq_team 改 (filiale, team)）、
`models/base/qualification.ts`（division → length 10、加 uq_qualification）、`models/base/rank.ts`、
`models/base/certificate.ts`（divisions 已是 10，仅注释口径）。

## 7. 测试与验证

### 单元测试（`live-server/src/__tests__/unit/crew-inbound-worker.test.ts`）
mock 改为返回 divisions（`certificates: [{certificate, divisions}]` 等）。覆盖：
1. **缺失 code** → INSERT（含原断言，columns 不变）
2. **已存在且已含该 division** → 无 INSERT/UPDATE
3. **已存在且不含该 division** → UPDATE 合并为 `'P,C'`
4. 同一 batch 内 P/C 两条 crew 记录引用同一新 code → 第二次走 UPDATE 合并（可并入用例 3）

### 其他
- `tsc --noEmit`（live-server + gantt）通过
- 改动到的 rank 消费方相关测试跑通
- 迁移在 SIT 执行：`team` 重复折叠为 122→108 行、`certificate`/`qualification` 无重复
- 迁移后重导 Crew：三表 + certificate 数据收敛、新 code 首次单 division 插入、跨 P/C 的 code 合并为 `'P,C'`
- 远端 `EXPLAIN` 校验新 INSERT / UPDATE SQL（§Remote-DB-Only）

## 8. 部署顺序（SIT）

1. 合入代码（worker 合并逻辑 + rank 消费方联动 + model/路由）
2. 执行迁移（折叠 + 索引 + 注释）
3. 重启 live-server（`service.sh restart live-server`，注意先清掉旧的 root 进程）
4. 重导 Crew，验证定义表数据收敛

## 9. Follow-up（不在本次范围）
- rank 出现 `'P,C'` 后：engine-server ro_input reference 与 solver 对 rank.division 的解析需要处理
  （`engine-server/F8/ro_input_builder/sections/reference.py` 及其下游）。
