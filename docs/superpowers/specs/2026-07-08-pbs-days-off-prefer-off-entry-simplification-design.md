# PBS Days Off Prefer Off 入口简化设计

日期：2026-07-08
状态：已确认，已实施
来源：
- Jenife 反馈文件：`/Users/lei/Downloads/Jenife_Bidding_Type_Clarification_20260707.docx`
- 现有导出逻辑：`pbs-server/src/services/algorithm-export/days-off-export.ts`
- 现有 line rules 导出逻辑：`pbs-server/src/services/algorithm-export/line-rules-*.ts`

## 背景

Jenife 希望 Days Off tab 不再暴露过多相似或偏 line-pattern 的条件。经过逐项确认后，产品方向进一步收敛为：

- Days Off 页面只表达“我要哪些具体休息日”。
- 连续工作/连续休息、commuter pattern、工作/休息 block 这类影响整条 line 结构的条件，不再放在 Days Off 页面。
- 当前 `Prefer Off` 已经会在算法导出时展开为具体日期，因此前端可以把用户入口拆清楚，而后端仍复用同一个 `201 Prefer Off` 能力。

现有 `days-off-export.ts` 已证明：

- `201 Prefer Off` 的 tag-list 具体日期会直接导出为 Days Off CSV 日期。
- `Monday` / `Tuesday` 等星期值会展开为 bid month 内所有对应日期。
- `Between YYYY-MM-DD - YYYY-MM-DD` 会展开为范围内所有日期。
- `Weekends` 当前只是展开为 Saturday + Sunday。
- `Window HH:MM-HH:MM` 在 Days Off CSV 导出中被跳过。
- `allOrNothing` / `minimumN` 会持久化，但 Days Off CSV 具体日期导出不使用它们。

因此，Days Off 前端继续展示 `Weekends`、time window、all-or-nothing、minimum required modifiers，会让用户误以为这些设置会直接影响算法的 days-off 日期导出，实际不够清晰。

## 目标

把 Days Off 页面收敛为三个清晰入口：

1. `Dates`
2. `Days of Week`
3. `Date Range`

这三个入口在前端分开展示和配置，但后端仍统一保存为 `propertyCode=201 Prefer Off`，保持算法导出和历史数据兼容。

同时，把 `203 Min Consecutive Days Off` 也从 Days Off Add Properties 隐藏。该条件表达“想要一段连续长休但不关心月内具体时间”，更接近 line / commuter pattern 语义。后续如需要保留，应在 Line / Commuter Pattern 里重新设计，而不是继续作为 Days Off 条件展示。

## 非目标

- 不新增数据库表。
- 不新增 `pbs_bid_property` 的三条真实 property。
- 不删除历史 bid 数据。
- 不改变算法 Days Off CSV 格式。
- 不在本阶段实现 Line / Commuter Pattern 新 UI。
- 不在本阶段实现 Jenife 提到的 `Long stretch off / Compressed flying`。
- 不保留 `Weekends` 作为单独入口，因为可用 `Days of Week = Saturday + Sunday` 覆盖。
- 不继续显示 `allOrNothing`、`minimumN`、time window modifiers。

## 当前条件处理

| property_code | 当前名称 | 当前处理 | 新设计处理 |
|---:|---|---|---|
| 201 | Prefer Off | 仍可见 | 保留，但前端拆成 `Dates / Days of Week / Date Range` 三个用户入口 |
| 202 | Max Consecutive Days On | 已隐藏 | 保持隐藏，归入 Line / Commuter Pattern 方向 |
| 203 | Min Consecutive Days Off | 当前仍可见 | 新增隐藏，不再作为 Days Off 入口 |
| 204 | Min Consecutive Days Off In Window | 已隐藏 | 保持隐藏 |
| 205 | Days Off / Days On Pattern | 已隐藏 | 保持隐藏，归入 Line / Commuter Pattern 方向 |
| 206 | Employee Schedule Preference | 已隐藏 | 保持隐藏，后续如需要单独设计 |

## 前端交互设计

### Add Properties 列表

Days Off 的 Add Properties 不再只显示一行 `Prefer Off`，而是显示三个入口：

- `Dates`
- `Days of Week`
- `Date Range`

这三个入口是 UI-level aliases，不是新的后端 property。它们都映射到 `propertyCode=201`。

### 配置弹窗

不同入口打开同一个配置弹窗组件的不同 mode：

- `Dates`
  - 只显示日期选择/输入。
  - 可添加多个具体日期。
  - 保存为 `bid.values = ["YYYY-MM-DD", ...]`。

- `Days of Week`
  - 只显示星期选择。
  - 可多选 Monday-Sunday。
  - 保存为 `bid.values = ["Monday", "Friday", ...]`。

- `Date Range`
  - 只显示 from / to。
  - 保存为 `bid.values = ["Between YYYY-MM-DD - YYYY-MM-DD"]`。

不显示：

- `PREFER OFF TYPE` / `Dates` / `Days of Week` / `Date Range` 二次切换控件
- `Weekends` segmented mode
- `Window HH:MM-HH:MM`
- `All or Nothing`
- `Minimum Required`

### Existing Properties 展示

已有 `Prefer Off` 数据继续显示为 `Prefer Off` 或更清晰的摘要。可选优化：

- 仅包含日期：展示为 `Dates: 2026-06-13, 2026-06-14`
- 仅包含星期：展示为 `Days of Week: Saturday, Sunday`
- 仅包含日期范围：展示为 `Date Range: 2026-06-13 - 2026-06-18`
- 混合历史数据：仍展示为 `Prefer Off: ...`，避免误分类。

## 后端设计

### 数据持久化

继续复用现有 `201 Prefer Off`：

- 不改 contract 的核心 bid type。
- 不改 `pbs_bid_group.property_id` / `property_definition_id` 语义。
- 不改 `days-off-export.ts` 展开具体日期的算法。

### Catalog 可见性

需要新增 migration：

- `203 Min Consecutive Days Off` 设置 `is_visible_in_portal=0`。
- `201 Prefer Off` 保持 `is_visible_in_portal=1`。

同时更新 seed：

- 新初始化环境中 `202, 203, 204, 205, 206` 默认隐藏。
- `201` 默认显示。

### 历史兼容

即使 `203` 隐藏，后端 `catalogByCode` 仍应保留 active supported property，历史 draft/import/existing bid 不应因为隐藏而无法解析。

## 风险与取舍

- 前端显示三个入口但后端同一个 property，可能导致同一个 tier 里出现多个 `201` property group。现有系统已经支持多个 `Prefer Off` property group，这符合当前模型。
- 如果历史 `Prefer Off` 同时包含日期、星期、范围、window、modifiers，新的 UI 不应强行丢弃；编辑历史混合数据时需要保守处理。
- 隐藏 `203` 会减少 Days Off 页面能力，但符合“Days Off 只给具体日期”的新产品边界。未来若需要“连续长休但不指定日期”，应在 Line / Commuter Pattern 中设计。

## 验收标准

- Days Off Add Properties 显示 `Dates`、`Days of Week`、`Date Range`。
- Days Off Add Properties 不再显示 `Min Consecutive Days Off`。
- `Weekends` 不再作为单独入口出现。
- 配置 `Dates` 后保存为 `201 Prefer Off` 的具体日期 tag-list。
- 配置 `Days of Week` 后保存为 `201 Prefer Off` 的星期 tag-list。
- 配置 `Date Range` 后保存为 `201 Prefer Off` 的 `Between ...` tag-list。
- Days Off CSV 导出仍把上述三种输入展开成具体日期。
- 历史包含隐藏 `203` 的 bid 仍可展示/解析，不因为隐藏而报 unsupported。

## 建议验证

自动化：

- `pbs-server` focused tests：
  - property catalog 不返回 `203`。
  - `extractPreferOffDates` 继续覆盖 dates / weekdays / date range。
- `pbs-portal` focused tests：
  - Add Properties 显示三个入口。
  - 三个入口保存 payload 均为 `propertyCode=201`。
  - 不再显示 weekends / modifiers。

人工 QA：

1. 登录 PBS Portal。
2. 进入 Days Off。
3. 打开 Add Properties。
4. 确认只看到 `Dates`、`Days of Week`、`Date Range`。
5. 分别新增三种 bid，确认 Existing Properties 展示清晰。
6. 导出算法包，确认 Days Off CSV 中三种 bid 都展开为具体日期。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 主要集中在 Days Off 前端组件、后端 catalog visibility、seed/migration 和 focused tests，范围可控，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/days-off/**`、`pbs-server/src/services/days-off/**`、`sql/migration/**`、`sql/seed/10-pbs-bid-property.sql`、`docs/test-cases/pbs/days-off/**`。
- Conflict risk: 中等；前端同一组件会同时涉及 dialog、列表、测试。
- Execution gate: 用户确认本 spec 后再实施。
