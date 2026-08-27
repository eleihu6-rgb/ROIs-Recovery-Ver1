# Crew Bid Import Playwright Parity 与后台性能优化设计

> 日期：2026-06-22  
> 状态：Implemented，阶段 1 已落地并通过聚焦测试  
> 范围：Gantt Admin Tools 调用的 `live-server` Crew Bid Import 后台导入、导入报告、与 Playwright 手工录入规则对齐

## 1. 背景

当前 `Crew Bid Import` 的管理入口在 Gantt：

- 前端入口：`gantt/src/components/pbs/pbs-admin-tools.tsx`
- 前端 API：`gantt/src/services/pbs-admin-tools-api.ts`
- API base：`/fpqe/live`
- 后端实际入口：`live-server/src/routes/admin/pbs-crew-bid-imports.ts`
- 后端服务：`live-server/src/services/crew-bid-import/crew-bid-import-service.ts`

用户已经用 Playwright 逐步点击 Portal 页面，按真实 UI 录入过 `CLASS-BidsReport_March2026.txt` 中的多个员工条件。Playwright 结果证明：多数条件可以按当前月份导入，失败主要来自当前 June pairing 数据里没有对应 Pairing Number 或机场，另有少量 `Limit N`、`Counting Deadhead Legs` 等语义无法完整表达。

现在需要让后台 Import 接口的最终效果和 Playwright 录入规则对齐，同时优化后台 run 长时间 `running` 的问题。

## 2. 当前实现差距

### 2.1 Tier 写入不对齐 Playwright

Playwright 规则：

- 忽略 `Pairing Bid Group`、`Award Pairings`、`Reserve Bid Group` 等分组文本。
- 真实 bid preference 按顺序映射到 `T1` 到 `T7`。
- 超过 7 条真实条件不录入，报告为 `ignored`。
- 组合条件拆成同一个 tier 下多条普通 condition row。

当前 Import 写库：

- 只创建一个 `pbs_bid_tier`，`tier = 1`。
- 所有 preference 以 `group_seq` 写入 T1。
- 没有“前 7 条真实条件映射 T1-T7，后续 ignored”的规则。
- 组合条件写成一个 main group + `pbs_bid_condition` AND 条件，页面表现不等同于 Playwright 添加的同 tier 多 row。

### 2.2 Pairing Number 缺失可以报告，但行为需要调整

当前实现已有 `unmatched_pairing_number`，但默认 `failOnUnmatchedPairing=true` 时，如果一个 preference 里有未匹配 pairing，可能导致该 preference 不导入。

Playwright 行为更接近：

- 能选中的值先录入。
- 当前 RP / 当前员工搜不到的 pairing 记录为 `value-not-available`。
- 不因为部分值缺失而阻断整条可部分录入的条件。

### 2.3 Airport 缺失目前不会报告

当前 mapper 对 `Any Landing In Airport` / `Any Layover In Airport` 只解析机场代码并写入 `paramA`，不会校验这些机场是否存在于当前 base + period 的 pairing 数据里。

Playwright 录入时，机场下拉只提供当前 pairing 数据里出现过的机场，因此会产生：

- 可选机场：录入成功。
- 不可选机场：报告 `value-not-available`。

接口需要补齐同样的机场可用性检查和报告。

### 2.4 部分语义报告不够

当前 mapper 能提取 `Limit N`，但导入报告没有明确区分 `partial-import`。`Any Landing In (Counting Deadhead Legs)` 当前 regex 会接受并丢掉括号语义，也没有报告“deadhead counting 未完整表达”。

需要让报告能明确告诉用户：

- 哪些条件完整导入。
- 哪些是 Pairing Number 找不到。
- 哪些是机场找不到。
- 哪些是条件缺失或不完整。
- 哪些因超过 T7 被忽略。

### 2.5 后台 Import 慢点

当前 Import 已经异步启动，不应再让浏览器等待完整写库。但后台完成仍慢，主要风险点：

- `prepareImportItems` 对每个 crew 单独 resolve Pairing Number。
- `loadPairingOccurrencesByNumber` 可能按 crew 重复查询相同 base/period/pairing labels。
- Airport 没有 resolver，后续补齐时若按 crew 查，会进一步变慢。
- 写库阶段逐 crew、逐 preference、逐 condition 执行 SQL。
- 每个 crew 都读取 snapshot、删除旧 bid、插入新 bid、再读取 imported snapshot。
- `insertRunItemsAndProblems` 逐 item / 逐 problem 插入。

## 3. 目标

1. `POST /api/admin/crew-bid-imports` 的后台导入结果与 Playwright 手工录入规则对齐。
2. 导入报告能准确分类：
   - 完整导入
   - Pairing Number 当前 period/base 找不到
   - Airport 当前 period/base 找不到
   - 条件缺失
   - 语义不完整
   - 超过 T1-T7 容量被忽略
3. 后台 Import run 完成速度提升，至少先消除明显重复查询。
4. 保持异步 run / rollback / run detail 现有工作流。
5. 不把缺失的机场或 pairing 当成接口失败；这些应进入报告，导入可导入的部分。

## 4. 非目标

- 不新增 Portal 页面。
- 不修改 pbs-portal 的手工配置 UI。
- 不新增业务条件类型来强行适配 NPBS 文本。
- 不改变 Gantt Admin Tools 的入口位置。
- 不在第一阶段重写整个导入写库为复杂 bulk loader。
- 不把 `CLASS-BidsReport_March2026.txt` 中所有历史 pairing/airport 强行 seed 到 June pairing 数据。

## 5. 推荐方案

采用分阶段方案。

### 阶段 1：Playwright parity mapping/report + 批量 resolver

本阶段必须完成，因为它同时解决“导入效果不一致”和“报告不清楚”。

主要内容：

1. 引入 source preference selection model：
   - `Current Bid` 优先。
   - 没有 Current 时 `Default Bid` 兜底。
   - 过滤分组文本。
   - 只取前 7 条真实条件，映射到 `T1` 到 `T7`。
   - 超过 7 条生成 `ignored` problem。
2. 组合条件拆分为同 tier 多个 ordinary group：
   - 例如 `Award Pairings If Departing On ... If Pairing Number ...`
   - 写成同一 tier 下两个 `pbs_bid_group`。
   - 两个 group 共享同一个 source preference id，报告里仍归为一条来源 preference。
3. 批量 Pairing Number resolver：
   - 收集所有待导入 item 的 Pairing Number references。
   - 按 `base + rank + periodCode` 分组。
   - 每组只查一次 live pairing occurrences。
   - 将结果分发回每个 mapped group。
4. 批量 Airport resolver：
   - 收集所有 airport criteria。
   - 按 `base + rank + periodCode + propertyCode` 分组。
   - 查询当前 pairing 数据里可用机场集合。
   - 可用值写入 `paramA`。
   - 缺失值写 `value-not-available: airport` problem。
5. 导入报告增强：
   - 增加清晰 problem code。
   - 保留 source line / source seq / rawText。
   - problem message 中明确哪些值缺失。
6. 性能日志：
   - parse
   - select
   - map
   - resolvePairings
   - resolveAirports
   - writeBids
   - writeRunItems
   - total

### 阶段 2：写库路径减 SQL 次数

如果阶段 1 后后台仍慢，再进入阶段 2。

候选优化：

- 批量读取所有 selected crew 的 existing current bid ids。
- 批量读取 previous snapshots，减少每 crew 多次 query。
- 批量删除旧 bids 的关联表。
- group / condition / occurrence 尽量批量 insert。
- run items / problems 批量 insert。
- 保留 per crew savepoint，避免一个 crew 失败影响整批。

阶段 2 风险更高，因为会触碰 rollback backup 的完整性。必须在阶段 1 报告正确之后再做。

## 6. 数据映射规则

### 6.1 Source preference 选择

对每个 employee：

1. 按 crew id 分组 source block。
2. 如果存在 `Current Bid`，选择 Current。
3. 否则如果允许 fallback，选择 Default。
4. 只处理第一个 Pairing Bid Group。
5. 以下文本不算真实条件，不占 tier：
   - `Pairing Bid Group`
   - `Award Pairings`
   - `Reserve Bid Group`
6. 真实条件按顺序编号：
   - 第 1 条 -> `T1`
   - 第 2 条 -> `T2`
   - ...
   - 第 7 条 -> `T7`
7. 第 8 条及之后不写入 bid，写入 problem：
   - code: `preference_ignored_tier_capacity`
   - category: `ignored`
   - message: `Ignored because only the first seven real bid preferences map to T1-T7.`

### 6.2 组合条件

对于 `If A If B`：

- 不新增嵌套条件类型。
- 拆成多个同 tier ordinary group。
- 每个 group 可独立被 Portal Existing list 显示。
- 报告里使用同一个 source preference id 聚合。

示例：

```text
Award Pairings If Departing On Mar 2, 2026 If Pairing Number T4506
```

导入为：

- `T3 / Departing On / Award / Jun 2, 2026`
- `T3 / Pairing Number / Award / T4506`

### 6.3 Pairing Number 缺失

解析后的 Pairing Number 必须批量匹配当前 `base + rank + periodCode` 的 live pairing。rank 优先取 `pbs_user.rank`，缺失时从 source `Category` 的最后一段兜底，例如 `YYZ-737-FO` -> `FO`。

规则：

- 全部匹配：完整导入。
- 部分匹配：导入匹配值，缺失值写 problem。
- 全部缺失：不写该 group，写 problem。

Problem：

- code: `unmatched_pairing_number`
- category: `value-not-available`
- valueType: `pairing`
- severity: 默认 `warning`

备注：现有 `failOnUnmatchedPairing` 如果继续保留，建议只影响 severity 或是否允许正式 import；不应阻止“已匹配部分”的写入，避免和 Playwright 行为不一致。

### 6.4 Airport 缺失

Airport criteria 必须按当前 live pairing 数据过滤，并使用同一个 `base + rank + periodCode` 口径，避免导入这个员工在页面 count/preview 中实际不可见的机场。

规则：

- 全部可用：完整导入。
- 部分可用：导入可用机场，缺失机场写 problem。
- 全部不可用：不写该 group，写 problem。

Problem：

- code: `airport_not_in_pairing_period`
- category: `value-not-available`
- valueType: `airport`
- severity: `warning`

机场可用性口径应和 Portal 下拉一致：

- `Any Landing In Airport` 使用当前 period/base pairings 内出现过的 landing airport。
- `Any/Every Layover In Airport` 使用当前 period/base pairings 内出现过的 layover airport。

### 6.5 部分导入

`Limit N`：

- 如果当前 bid schema / algorithm export 能使用 `limit_n`，则导入并报告为完整支持。
- 如果页面或 downstream 不完整支持，写 `partial-import` problem，但仍导入可表达部分。

`Counting Deadhead Legs`：

- 如果 airport criterion 没有独立参数表达 deadhead counting，则写 `partial-import`。
- 不应静默丢掉括号语义。

Problem：

- code: `partial_import`
- category: `partial-import`
- severity: `warning`

## 7. API 与报告设计

现有接口保持：

```text
POST /api/admin/crew-bid-imports/dry-run
POST /api/admin/crew-bid-imports
GET  /api/admin/crew-bid-imports
GET  /api/admin/crew-bid-imports/:runId
DELETE /api/admin/crew-bid-imports/:runId
```

报告继续通过 run detail 返回 `items[]` 和 `problems[]`。建议扩展 problem 字段，保持向后兼容：

```ts
type PbsCrewBidImportProblem = {
  crewId?: string
  category?: string
  bidContext?: "Current" | "Default"
  sourceLineNumber?: number
  sourceSeq?: number
  severity: "warning" | "error"
  code: string
  message: string
  rawText?: string
  valueType?: "pairing" | "airport" | "condition" | "tier"
  missingValues?: string[]
  importedValues?: string[]
  tier?: string
}
```

建议 summary 增加可选统计：

```ts
type PbsCrewBidImportSummary = {
  ...
  unmatchedPairingCount: number
  unmatchedAirportCount?: number
  partialPreferenceCount?: number
  ignoredPreferenceCount?: number
}
```

前端 Admin Tools 可以先不做复杂 UI，只要 existing JSON/detail 能展示新增字段即可。后续再做问题筛选。

## 8. 性能设计

### 8.1 阶段 1 必做优化

当前 resolver 是按 item 逐个查询。改成：

1. map 所有 selected blocks，得到待解析 references。
2. 构造：
   - `pairingResolveRequestsByBase`
   - `airportResolveRequestsByBase`
3. 每个 base/period 做一次 pairing query。
4. 每个 base/period/propertyCode 做一次 airport query。
5. 把结果写回 mapped groups。

预期收益：

- Dry Run 和 Import 都减少大量重复 pairing query。
- 对 YEG / YYZ / YVR 多 crew 文件更明显。

### 8.2 阶段 2 后续优化

如果阶段 1 后后台仍慢，再优化写库：

- batch existing bid lookup
- batch delete
- batch run item/problem insert
- batch group/condition/occurrence insert
- snapshot query 合并

此阶段需要额外设计 rollback snapshot 的完整性验证。

## 9. 错误处理

- 文件格式错误：请求失败或 run failed，保持现有行为。
- 单个 crew 写库失败：该 crew item 标记 failed，其他 crew 继续。
- Pairing/airport 不存在：不作为接口失败，写 warning problem。
- 超过 T7：不作为失败，写 ignored problem。
- Unsupported preference：写 error problem，不导入该 preference。
- 后台异常：run status = `failed`，写 `import_run_failed`。

## 10. 测试计划

### 10.1 单元测试

新增/更新 live-server 测试：

- parser 能保留 source seq / group index。
- selector 遵循 Current 优先、Default 兜底。
- 真实 preference 只取前 7 条，后续 ignored。
- group marker 不占 tier。
- composite preference 拆成同 tier 多 groups。
- Pairing Number 部分匹配时导入匹配值并报告缺失值。
- Airport 部分匹配时导入匹配值并报告缺失值。
- `Counting Deadhead Legs` 产生 partial-import。

### 10.2 Service 测试

用小 fixture 覆盖：

- Employee 19/73/96/113/169/106 类似 Playwright case。
- run detail 中 problems 分类与 Playwright report 一致。
- T1-T7 写入正确。
- rollback 仍恢复 previous bid。

### 10.3 性能验证

增加日志或测试输出：

- selected crew 数量
- mapped preferences 数量
- pairing resolver query 次数
- airport resolver query 次数
- writeBids 耗时
- total import 耗时

验收时用同一个 `CLASS-BidsReport_March2026.txt` 对比优化前后耗时。

### 10.4 命令

建议运行：

```bash
cd live-server
npx vitest run src/services/crew-bid-import src/routes/admin
npm run build
```

如触碰 Gantt 展示：

```bash
cd gantt
npx tsc --noEmit
```

## 11. 验收标准

1. `Import` 仍快速返回 runId。
2. 后台 run 完成后，run detail 能清楚列出：
   - imported
   - value-not-available: pairing
   - value-not-available: airport
   - partial-import
   - ignored
   - unsupported/error
3. Import 写入的 tier 与 Playwright 规则一致：真实条件按 `T1-T7`。
4. 组合条件在同 tier 下可表现为多条普通 group/row。
5. 缺失机场不会静默成功，必须在 problems 中出现。
6. 部分匹配的 Pairing Number / Airport 会导入可匹配部分。
7. 超过 7 条真实条件不会写入 bid，会记录 ignored。
8. 与当前 Playwright report 对比，缺失原因分类一致或更清晰。
9. 阶段 1 后 pairing/airport resolver query 次数明显减少。
10. rollback 仍可删除本次导入并恢复 previous bid。

## 12. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 关键改动集中在 `live-server/src/services/crew-bid-import/crew-bid-import-service.ts` 与 mapper 类型契约，mapping、resolver、写库、报告强耦合，拆分实现容易产生 API / 数据结构不一致。
- Suggested split: 不拆实现。可在实现前做只读 benchmark 或测试数据分析，但代码写入由一个 agent 串行完成。
- Write boundaries: `live-server/src/services/crew-bid-import/*`、`live-server/src/routes/admin/pbs-crew-bid-imports.ts`、`packages/contracts/pbs-crew-bid-imports.*`、必要的测试文件；只有触碰报告展示时才改 `gantt/src/components/pbs/pbs-admin-tools.tsx`。
- Conflict risk: 中高。当前 worktree 已有未提交改动，实施时必须只改本需求相关文件，不回滚其它改动。
- Execution gate: 用户 review 本 spec 并明确批准后，才能进入实现。

## 13. 实施记录

- 已实现阶段 1：
  - Current Bid 优先，Default Bid 兜底保持不变。
  - 真实 preference 按顺序映射到 `T1-T7`，超过 7 条写入 `preference_ignored_tier_capacity`。
  - `If A If B` 组合条件展开为同 tier 下多条 `pbs_bid_group`，不再写入 `pbs_bid_condition`。
  - Pairing Number reference 按 base/period 批量 resolve；未匹配值写入 `unmatched_pairing_number`，默认不阻断其它可导入条件。
  - Airport 按当前 base/period pairing 内实际出现过的 landing/layover airport 过滤；缺失值写入 `airport_not_in_pairing_period`。
  - `Counting Deadhead Legs` 不再静默丢弃，写入 `counting_deadhead_legs_not_supported` warning。
  - Gantt Admin Tools 默认 `failOnUnmatchedPairing=false`，使 UI 导入默认行为与 Playwright 手工录入一致。
- 已补充阶段 1.1：
  - Pairing Number 与 Airport resolver 改为按 `base + rank + period` 过滤。
  - rank 优先来自 `pbs_user.rank`，缺失时用 source `Category` 末段兜底。
  - 查询加入 `pairing_composition.acting_rank` 可见性条件，避免数据库存在但该员工 rank 不可见的 pairing/airport 被导入。
- 已新增聚焦服务测试：`live-server/src/services/crew-bid-import/__tests__/crew-bid-import-service.test.ts`。
- 已验证：
  - `npm test -- --run src/services/crew-bid-import/__tests__/crew-bid-property-mapper.test.ts src/services/crew-bid-import/__tests__/crew-bid-import-service.test.ts`
  - `npm run build` 仍被既有未改测试类型错误阻断：`src/__tests__/routes/base-cache-control.test.ts` 和 `src/routes/auth/auth.test.ts`。
