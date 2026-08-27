# Rule Set 多类型（LIVE/PBS/RO）支持 — 设计 Spec

> 日期：2026-08-09 · 状态：Approved · 模块：gantt + live-server

## 背景与目标

Gantt Legality 的 Rule Set（`workset`，category `RULE`）目前 `type` 是单一代码
（`LIVE` / `RO` / `PBS`），一套法规集只能服务一个上下文。F8 因此要维护 6 套法规集
（P/C × LIVE/PBS/RO），维护成本高、易漂移。

目标：一套法规集可同时用于 **LIVE / PBS / RO**。Rule Set 添加/编辑时 Rule Type 改为
**多选按钮**（最少选一个）；LIVE 工具栏选择器与 RO 场景选择器按“包含”匹配多值。
像 F8 这样的客户只需维护 **P、C 两套法规集**，每套标记 `LIVE,PBS,RO`。

## 决策（已与用户确认）

1. **存储**：`workset.type` 扩宽为 `varchar(20)`，存逗号分隔的规范顺序串
   （`LIVE,PBS,RO`），而非数组列或子表。
2. **启用互斥**：维持现状——只有 **LIVE / PBS** 按 division 互斥（启用新集合按每个声称的
   type 停用旧的同 type+division 启用集）；**RO 不互斥**，旧 RO 集保持启用，由操作员手动处理。
3. **数据迁移**：仅扩宽列 + 更新代码/API。现有 6 套 F8 集合不动，操作员通过新的多选 UI
   手动改 type / 启用。不做自动合并。

## 术语

- **claimed types**：一套集合声称的类型集合，即 `type` 逗号串切分后的数组，如
  `['LIVE','PBS','RO']`。
- **规范顺序**：写入时统一按 `LIVE,PBS,RO` 顺序 join，去除重复与非法代码。

## 现状（数据 + 代码勘察）

远端 `f8` schema 当前 RULE worksets（10 行）：

| id | name | type | division | enabled |
|----|------|------|----------|---------|
| 103 | PBS Solver Ruleset FD | RO | P | t |
| 433 | F8 Full Ruleset | LIVE | P | f |
| 583 | Qiang - Test | RO | P | f |
| 637 | PBS Solver Ruleset CC | RO | C | t |
| 695 | test Add P | RO | P | f |
| 698 | test Add P (Copy) (Copy) | RO | P | f |
| 752 | Live Ruleset FD | LIVE | P | t |
| 753 | Live Ruleset CC | LIVE | C | t |
| 754 | Portal Ruleset FD | PBS | P | t |
| 755 | Portal Ruleset CC | PBS | C | t |

Schema：`workset.type varchar(4) not null`（`sql/schema/live/01-base.sql:1419`）；
部分唯一索引 `uq_workset_enabled_rule_type_division (type, division) WHERE category='RULE'
AND enabled AND type IN ('LIVE','PBS')`（`sql/migration/2026-08-04-...sql:18`）。
Dictionary `RULE_SET_TYPE`（LIVE/PBS/RO + 颜色）已存在，无需改动。

### 单一 type 的消费点（全部需要改为“包含”匹配）

后端 `live-server`：
- `routes/rule/legality.ts`
  - `refreshAllLiveRulesets`（L42）`type = 'LIVE'`
  - `POST /rulesets`（L449-466）：校验、启用互斥、live refresh
  - `PATCH /ruleset/:id`（L475-510）：校验、启用互斥、live refresh、rule_violations 清理
- `services/rule/legality-recheck.ts` L231、L237：`type = 'LIVE'`
- `services/rule-check/rule-check-trigger.ts` L16：`type = 'LIVE'`
- `routes/rule/workset.ts`：`GET /?type=` 过滤 `type = $1`

前端 `gantt`：
- `components/legality/rule-set-dialogs.tsx`：New/Edit 弹窗单一 `<select>`
- `components/legality/legality-rule-sets-view.tsx`：列表 type 徽章 + `missingRuleSetCoverage`
- `components/common/rule-group-selector.tsx`：LIVE 工具栏 `g.type === 'LIVE'`（3 处）
- `components/scenario/scenario-basic-info.tsx`：RO 场景选择器 `r.type === 'RO'` + type 徽章 + division 对齐逻辑
- `stores/legality-store.ts`：`s.type === 'LIVE'`（默认集 + live refresh 通知）
- `types/legality.ts`：`LegalityRulesetSummary.type`

## 设计

### 1. 迁移 `sql/migration/2026-08-09-rule-set-multi-type.sql`

```sql
-- Rule Set 支持多类型（LIVE/PBS/RO 逗号串）。
ALTER TABLE workset ALTER COLUMN type TYPE varchar(20);

-- 部分唯一索引对多值语义失效（如 LIVE 与 LIVE,PBS 都声称 LIVE 却不同字符串，索引拦不住；
-- 仍能挡住“同字符串同 division 两个启用集”反而造成误导）。互斥改由应用层逐 type 校验。
DROP INDEX IF EXISTS uq_workset_enabled_rule_type_division;
CREATE INDEX IF NOT EXISTS idx_workset_rule_type_division
  ON workset (type, division) WHERE category = 'RULE';
```

同步 `sql/schema/live/01-base.sql:1419` 的 workset 定义：`type varchar(20)`，注释改为
`法规类型：逗号分隔多值 LIVE / RO / PBS`。

不做任何数据 UPDATE（capability only）。

### 2. 后端 API 与逻辑（live-server）

**API 契约**：`POST /rulesets`、`PATCH /ruleset/:id` 的 `type` 改为
`string[]`（每项 ∈ `{LIVE,RO,PBS}`，`min(1)`，去重，规范化后按 `LIVE,PBS,RO` 顺序
join 成逗号串落库）。返回的 `type` 仍为逗号串。

- 校验失败（空数组 / 非法代码）→ 400。
- 规范化 helper（避免散落重复逻辑）：`normalizeRuleSetTypes(input: string[]): string`。
  - 过滤空白 → 校验合法性 → 去重 → 按 `['LIVE','PBS','RO']` 顺序 sort → join(',')。
  - `[]` 视为非法（调用方先校验 min(1)）。

**创建（POST）**：
- `types.includes('LIVE') || types.includes('PBS')` 时：对每个声称的 LIVE/PBS type，
  停用同 division 下旧启用集中 `type LIKE '%<type>%'` 的行，删除其 `rule_violations`
  （沿用现有逻辑，逐 type 执行）。
- 启用且 `types.includes('LIVE')` → `refreshLiveRuleset`。

**编辑（PATCH）**：
- `oldTypes` = 当前 `type.split(',')`，`newTypes` = `b.type ?? oldTypes`。
- `nextEnabled &&` 对每个声称的 LIVE/PBS type：停用同 division 下旧启用集
  `type LIKE '%<type>%'`（排除本 workset），删除其 `rule_violations`。
- 本集曾是 LIVE 启用（`oldTypes.includes('LIVE') && current.enabled`）且现在
  （`!nextEnabled || !newTypes.includes('LIVE') || division 变更`）→ 删除本集 `rule_violations`。
- live refresh 条件：`nextEnabled && newTypes.includes('LIVE')` 且发生状态迁移。

**SQL 匹配**：所有 `type = 'X'` → `type LIKE '%X%'`（`refreshAllLiveRulesets`、
`legality-recheck.ts` L231/L237、`rule-check-trigger.ts` L16、`routes/rule/workset.ts`）。
代码集受写入校验约束，`LIKE '%LIVE%'` 不会误伤其他代码。

**Copy**：原样拷贝逗号串，无需改。

### 3. Rule Sets 管理弹窗（gantt `rule-set-dialogs.tsx`）

- New/Edit 弹窗的 Rule Type 由 `<select>` 改为 **三个切换按钮**（LIVE / PBS / RO），
  数据源仍是 `legalityApi.listRulesetTypes()`。
- 状态为 `string[]`：
  - New 默认 `['RO']`（沿用当前默认）。
  - Edit 打开时 `set.type.split(',')`（过滤空）。
- **最少选一个**：无选中时 Create/Save 按钮 `disabled`，并显示提示
  “Select at least one rule type”。
- LIVE refresh 确认逻辑：`types.includes('LIVE') && enabled`。
- 底部提示文案保持说明 LIVE/PBS 互斥、启用停用旧集。
- 切换按钮样式沿用弹窗现有字段形态（`fieldInput` 同级），选中态用 `bg-primary`。

### 4. LIVE / RO 选择与展示（gantt）

- **LIVE 工具栏** `rule-group-selector.tsx`：3 处 `g.type === 'LIVE'`
  → `g.type.split(',').includes('LIVE')`。
- **RO 场景选择器** `scenario-basic-info.tsx`：
  - `visibleRulesets` 过滤 `r.type === 'RO'` → `.split(',').includes('RO')`。
  - division 对齐逻辑（L129-137）中所有 `r.type === 'RO' / 'PBS'` → includes 判断。
  - type 徽章：`ruleSetTypeStyle(type, division)` 对多值串显示中性色
    （`bg-muted text-muted-foreground`），文本仍显示完整逗号串。
- **Rule Sets 列表** `legality-rule-sets-view.tsx`：
  - 左侧列表 type 徽章改为按声称 type 各渲染一个小色块（每 type 一个，最多 3 个）。
  - `missingRuleSetCoverage`（L83-91）的 `s.type === type` → `.split(',').includes(type)`。
- **Store** `legality-store.ts`：
  - `init` 的 livePilot 默认（L74）`s.type === 'LIVE'` → `.split(',').includes('LIVE')`。
  - `createSet`/`editSet` 的 live refresh 通知（L129、L142-145）→ includes 判断。
  - `createSet`/`editSet` 入参 `type?: string` → `type?: string[]`。
- **API service** `legality-api.ts`：`createRuleset`/`updateRuleset` 的 `type` 改为 `string[]`。
- **类型定义** `types/legality.ts`：`LegalityRulesetSummary.type` 注释标明逗号多值。

### 5. 测试

后端 `live-server/src/__tests__/unit/legality-ruleset-crud.test.ts`：
- create 传 `type: ['LIVE','PBS','RO']` 成功，落库为 `LIVE,PBS,RO`。
- create 传空数组 → 400。
- 启用多 type 集后，同 division 的旧 LIVE 集与旧 PBS 集都被停用（RO 不停用）。
- 只声称 RO 的启用集不触发 live refresh / 不停用其他集。
- edit 改 type 数组、迁移 LIVE→非 LIVE 时 rule_violations 清理。
- `type LIKE '%LIVE%'` 匹配 `LIVE` 与 `LIVE,PBS,RO` 两条路径（recheck/trigger 相关单测如有 mock 断言同步更新）。

UI（§Playwright-Required）：
- `e2e/gantt/` 新增 legality rule-set 多选测试：打开 Rule Sets → New Rule Set →
  多选 LIVE+PBS+RO → Create 可用；单选取消到 0 → Create 禁用；创建后 LIVE 工具栏选择器
  与 RO 场景选择器可见该集合。具体可用性在实施计划中核实（gantt e2e 需真实后端）。

### 6. Help 文档

- `gantt/src/components/help/topics/legality/legality-rule-sets.tsx`、`live-rule-set.tsx`
  的 Rule Type 说明改为多选（Help Authoring 规则：文档必须与 UI 一致）。

## 影响面与风险

- **改动文件**：live-server 5 个（1 迁移 + legality 路由 + 2 服务 + workset 路由）+
  gantt 6 个（dialogs / view / selector / scenario-basic-info / store / legality-api + types）。
- **风险**：多值后部分唯一索引失效改由应用层保障互斥——写入口只有 POST/PATCH 两个，风险可控；
  若未来出现直写 SQL，需业务侧约定。
- **兼容**：存量单值集合（如 752 `LIVE`）在 includes 匹配下行为不变；`type` 长度上限 20
  足以容纳 `LIVE,PBS,RO`。
- **不做**：多航司参数化、RO 互斥、自动合并存量数据、`text[]` 列或子表（YAGNI）。
