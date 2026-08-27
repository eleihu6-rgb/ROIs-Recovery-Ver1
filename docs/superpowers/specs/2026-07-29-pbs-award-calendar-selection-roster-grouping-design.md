# PBS Award 日历联动与 Roster Details 合并设计

> 日期：2026-07-29
> 状态：已批准并实施
> 范围：Award 日历色块选择、Roster Details 展示行合并、Selected Duty 联动
> 不包含：数据库结构、发布数据生成、Award Tier/原因等上游阻塞项

## 1. 背景

Award 月历已经把连续的 Pairing、VAC、ILL、CGS、CBT、DO 等任务绘制为连续时间条，但页面仍有两个体验缺口：

1. 月历时间条不能点击，Selected Duty 只能通过 Roster Details 表格行切换。
2. 月历已经合并的连续地面任务，在 Roster Details 中仍按每天一行重复展示。

例如 Jun 22–26 的 VAC 在月历中是一条连续黄色时间条，但 Roster Details 仍显示五行。用户希望点击月历时间条后，右侧直接选中并展示这一整段任务，同时 Roster Details 也只显示一条合并行。

## 2. 已确认需求

1. 点击 Award 月历色块，必须联动 Roster Details 和 Selected Duty。
2. Roster Details 使用与月历**已经生成的 Calendar Event 完全相同**的任务分段结果，本需求不新增或扩大任何合并资格：
   - 相同 `pairing_id` 的 Pairing 保持一个任务；
   - 当前月历已经合并的连续地面任务（包括 VAC、DO，以及满足既有规则的 ILL、CGS、CBT）在 Roster Details 中显示为同一个展示组；
   - 不同任务类型、不同 Pairing 或存在真实空档时不合并。
3. 点击月历中的任意跨周分段，均选中同一个完整任务。
4. Roster Details 合并只改变展示行，不改变原始业务数据或汇总。
5. Roster Details 右上角显示：
   - 原始业务数量，例如 `30 duties`；
   - 合并后的展示行数，例如 `21 rows`。
6. 合并后的 Selected Duty 显示完整日期范围、时间范围和累计 Credit。
7. 不新增数据库字段，不执行 migration。

## 3. 方案选择

### 采用方案：后端显式提供 Calendar Event 与原始 Item 的关系

`PbsAwardCalendarEvent` 增加可选字段：

```ts
sourceItemIds?: string[];
```

- 新版 pbs-server 对每个 Calendar Event 始终返回非空 `sourceItemIds`。
- Pairing Event 返回对应 Pairing Item 的单个 ID。
- 合并后的地面任务 Event 返回组成该连续任务的全部 Item ID。
- 单条或无法可靠合并的 Event 返回一个 Item ID。
- 字段保持可选，是为了 Portal 在前后端滚动部署期间兼容旧响应；缺失时按现有 Event ID 与 Item ID 做单条回退。

该关系使 Portal 不需要重复推断连续任务规则，Roster Details、Selected Duty 和 Calendar 可以共享同一个稳定选择身份。

### 未采用方案

1. **Portal 根据时间和任务类型重新推断合并关系**
   改动看似较少，但会复制 pbs-server 的连续任务算法，容易出现日历已经连接、表格却没有合并的差异。

2. **pbs-server 直接合并顶层 `items`**
   会改变 Duties、Days Off、Credit 和其他既有消费者的业务语义，不符合“只改变展示”的要求。

## 4. 数据模型与映射

### 4.1 保留原始 Items

`PbsAwardCurrentResponse.items` 保持不变，继续作为以下数据的依据。Roster Details 不自行运行新的任务连续性算法，只消费 pbs-server 已经确定的 Calendar Event 与 Item 关系：

- Duties；
- Days Off；
- Pairing 数量；
- Credit / Block 汇总；
- Reason Report；
- 原始发布排班追溯。

### 4.2 新增 Portal 展示组

Portal mapper 根据 `calendar.events[*].sourceItemIds` 生成 `rosterGroups`。每个展示组包含：

- 稳定选择 ID：Calendar Event ID；
- 原始 Item ID 集合；
- 用于表格和 Selected Duty 的合并后 `AwardDisplayItem`；
- 对应 Calendar Event ID。

Pairing 和单条任务保持原数据。多条地面任务合并时：

- `startDate/startTime` 使用 Calendar Event 起点；
- `endDate/endTime` 使用 Calendar Event 终点；
- `creditMinutes` 累加所有数值 Credit；
- 任意源 Item 存在 `creditMissingReason` 时，合并行显示 `Missing data`；
- 全部 Credit 为 `null` 且无缺失原因时显示 `--`，适用于 DO；
- `blockMinutes` 使用现有 nullable sum 规则；
- `dataNotices` 去重合并；
- 任务代码、类型、Assignment、Base 等稳定展示字段使用同组首条 Item；
- Pairing Legs、Award Explanation 和 Pairing 元数据不做合并或重写。

如果 Event 缺失有效 `sourceItemIds`，Portal 将对应 Item 作为独立展示行，不能丢行、重复或崩溃。

## 5. 交互设计

选择状态提升到 `AwardRightPanel`，由 Calendar 和 Roster Details 共同使用。

### 点击月历

1. 月历色块使用原生键盘可操作按钮。
2. 点击或通过键盘激活色块后，以 `sourceEventId` 选择对应 `rosterGroup`。
3. Roster Details 中对应合并行高亮并滚动到可见区域。
4. Selected Duty 立即显示该完整任务。
5. 同一 Event 的跨周色块分段同步保持选中样式。

### 点击 Roster Details

1. 点击或通过 Enter/Space 激活合并行后，Selected Duty 更新。
2. 月历中对应的一个或多个色块分段同步显示选中状态。

### 初始与刷新

- 初始默认选择最早的展示行。
- 数据刷新后，如果原选择仍存在则保留；否则回退到第一条展示行。
- 空数据保持现有 Award 空状态。

## 6. 页面展示

Roster Details 表头右侧使用：

```text
30 duties · 21 rows
```

- `duties` 来自未合并的 `items.length`；
- `rows` 来自合并后的 `rosterGroups.length`；
- 当两者相同时仍显示两项，明确区分业务数量和展示数量。

合并行示例：

```text
VAC | VAC | Jun 22 00:00 – Jun 27 00:00 | VAC | -- | 20:00 | VAC
```

Selected Duty 显示：

- Date：`Jun 22 - Jun 27`；
- Time：`00:00 - 00:00`；
- Credit：`20:00`；
- Type / Code：`VAC`。

结束时间沿用真实 Event 终点。Jun 22–26 五个自然日的 VAC，其连续区间结束于 Jun 27 00:00。

## 7. 无障碍与错误处理

- 月历色块必须可通过 Tab 聚焦，并支持 Enter/Space。
- 选中色块使用 `aria-pressed`，Roster 行继续使用 `aria-selected`。
- 选中状态不能只依赖颜色，需保留边框或 ring。
- Event 与 Item 关系异常时回退为独立展示行，不向用户显示内部异常或原始技术错误。
- 不增加 toast；该功能没有用户写入和异步操作。

## 8. 修改范围

预计涉及：

- `packages/contracts/pbs-award-results.d.ts`
- `pbs-server/src/services/award/award-results-mapper.ts`
- `pbs-server/src/services/award/award-results-mapper.test.ts`
- `pbs-portal/src/features/award/types.ts`
- `pbs-portal/src/features/award/award-mappers.ts`
- `pbs-portal/src/features/award/components/award-month-calendar.tsx`
- `pbs-portal/src/features/award/components/award-right-panel.tsx`
- `pbs-portal/src/features/award/components/award-trip-card.tsx`（仅在合并详情展示需要时）
- `pbs-portal/src/features/award/pages/award-page.test.tsx`
- `e2e/tests/pbs-portal/award-adaptive-layout.spec.ts`
- `docs/test-cases/pbs/award/`

不修改数据库、Live Server、PBS Engine 或发布流程。

## 9. 验收标准

1. Jun 22–26 五条连续 VAC：
   - Calendar 仍是一条连续黄色时间条；
   - Roster Details 只显示一条 VAC；
   - 表头保留原 duties，并显示合并后的 rows；
   - Selected Duty 显示完整区间和 `20:00` Credit。
2. 连续 DO 合并为一行，Credit 显示 `--`。
3. ILL、CGS、CBT 等任务是否合并严格跟随当前 Calendar Event；本需求不改变它们既有的合并边界。
4. 不同 Pairing ID 即使相邻也保持不同色块、不同 Roster 行。
5. 相同地面任务类型但存在真实空档时保持不同色块、不同 Roster 行。
6. 点击 Calendar 色块后，对应 Roster 行自动高亮、滚动可见，Selected Duty 正确更新。
7. 点击 Roster 行后，对应 Calendar 色块同步选中。
8. 跨周 Event 的任一分段都选择同一个完整任务。
9. Duties、Days Off、Pairings、Credit、Block 和 Reason Report 与合并前一致。
10. 旧响应缺少 `sourceItemIds` 时，页面仍可展示且无重复、丢行或运行时错误。

## 10. 测试计划

### pbs-server

- Calendar Event 正确返回 `sourceItemIds`。
- 合并 VAC/DO Event 包含全部源 Item ID。
- 不同 Pairing、真实空档和不可靠时间的回退关系正确。

### pbs-portal

- mapper 生成正确的合并展示组和累计 Credit。
- 缺失 Credit、DO 空 Credit、旧响应回退正确。
- 未知 ID、重复 ID、同一 Item 被多个 Event 引用时不重复、不丢行、不崩溃。
- Calendar 点击、键盘选择、跨周分段选择正确。
- Roster 行点击和双向选中样式正确。
- 表头显示原 duties 与合并 rows。

### Playwright

- 使用真实 Award 页面点击连续 VAC 色块。
- 验证 Roster Details 只有一条 VAC 合并行。
- 验证 Selected Duty 日期、时间、Credit。
- 验证不同 Pairing 不合并。

### QA

更新 Award 连续时间条人工测试文档，补充 Calendar、Roster Details、Selected Duty 三者联动和统计不变检查。

## 11. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: Contract、后端映射和 Portal 选择模型紧密串联，任务规模适中，拆分会增加契约冲突风险。
- Suggested split: 单 Agent 按 contract → server → portal → tests 顺序实施。
- Write boundaries: Award contract、Award 后端/前端、对应自动化与 QA 文档。
- Conflict risk: 低。
- Execution gate: 本 spec 经审查并由用户明确批准后开始实施。
