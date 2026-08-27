# PBS Days Off 可见条件第一批删减设计

日期：2026-07-07
作者：Codex
状态：已获用户确认，进入实施
范围：PBS Portal `Days Off` 页面 Add Properties 可见条件；只调整 `pbs_bid_property.is_visible_in_portal` 配置，不删除 property，不改变历史草稿数据结构。

## 背景

Jenife 的反馈核心是：Days Off tab 不应该暴露过多细碎条件。第一步先处理没有明显争议、用户明确倾向不再作为 Days Off 主入口展示的条件，降低 Add Properties 列表复杂度。

当前数据库已经有显示开关：

```sql
pbs_bid_property.is_visible_in_portal
```

后端 `resolveLineholderPropertyCatalog` 已按该字段过滤 Portal 返回的 property catalog，因此本轮不需要改业务 service 逻辑。

## 本轮目标

1. `Days Off` 页面 Add Properties 第一批只保留更核心的休息偏好入口。
2. 隐藏没有歧义、后续会并入其它能力或不应属于 Current Days Off 主页面的条件。
3. 不删除 property，避免破坏已有 draft / favorite / import 回显。
4. 同时提供 migration 和 seed 调整，保证当前库和新初始化库一致。

## 本轮隐藏清单

| Code | 当前名称 | 本轮处理 | 原因 |
| ---: | --- | --- | --- |
| 202 | `Max Consecutive Days On` | 隐藏 | 更像 compressed flying / commuter pattern / line 层面的约束，不是直接 Days Off 主入口。 |
| 204 | `Min Consecutive Days Off In Window` | 隐藏 | 用户认为可以由 `Prefer Off` 加 modifiers 表达；完整等价能力后续再设计。 |
| 205 | `Days Off / Days On Pattern` | 隐藏 | Pattern 类能力更适合后续并入 `Commuter Pattern`。 |
| 206 | `Employee Schedule Preference` | 隐藏 | 涉及另一个员工的 schedule matching，业务/HR 语义特殊，不属于第一版简化后的 Days Off 主入口。 |
| 218 | `Day of Week Off` | 隐藏 | 这是 Standing Bid day-of-week off preference，不应在 Current Days Off 主页面显示。 |

## 本轮保留清单

| Code | 当前名称 | 说明 |
| ---: | --- | --- |
| 201 | `Prefer Off` | 保留为主入口，继续承载 dates / days of week / weekends / date range / time window / modifiers。 |
| 203 | `Min Consecutive Days Off` | 暂时保留。后续可单独改名为 `Long Stretch Off / Compressed Flying`，本轮不改名。 |

## 非目标

- 不删除数据库 property row。
- 不修改 `PbsDaysOffBidValue` contract。
- 不把 204 的“窗口内连续 N 天”能力真正合并进 201。
- 不改 203 显示名。
- 不调整 `Commuter Pattern` / Line bidding。
- 不改变已有 draft、favorite、crew bid import 的存储和回显语义。

## 实施方案

1. 新增 SQL migration：
   - 将 `DaysOff` 的 `202,204,205,206,218` 设置为 `is_visible_in_portal = 0`。
   - 保持 `is_active = 1`，让历史数据仍可解析。
   - 确保 `201,203` 仍为 `is_visible_in_portal = 1`。
2. 更新 `sql/seed/10-pbs-bid-property.sql`：
   - 新初始化库中，legacy Days Off 的 `202,204,205,206` 默认隐藏。
   - `201,203` 默认可见。
3. 不改 `filterVisibleDaysOffPropertyCatalog`，因为 DB resolver 已经过滤可见项。
4. 实施后需要清 Redis catalog cache 或重启 `pbs-server`，否则旧 catalog 可能在 TTL 内继续显示。

## 验收标准

1. 数据库中 `DaysOff` 的 `202,204,205,206,218` 为 `is_visible_in_portal = 0`。
2. 数据库中 `DaysOff` 的 `201,203` 为 `is_visible_in_portal = 1`。
3. Portal `Days Off` 的 Add Properties 不再显示：
   - `Max Consecutive Days On`
   - `Min Consecutive Days Off In Window`
   - `Days Off / Days On Pattern`
   - `Employee Schedule Preference`
   - `Day of Week Off`
4. 已有草稿中如果存在隐藏 property，后端仍能通过 `catalogByCode` 解析和保存，不因为隐藏而报 unsupported。
5. Standing Bid 后续如仍需要 `Day of Week Off`，应通过 Standing Bid 自己的 catalog / context 处理，而不是依赖 Current Days Off 页面展示。

## 测试计划

- SQL 级验证：
  - 查询 `pbs_bid_property`，确认目标 property code 的 `is_visible_in_portal`。
- 后端验证：
  - 运行 Days Off catalog / route 相关测试，确认 hidden property 不影响 `catalogByCode` 解析。
- 前端验证：
  - Days Off 页面测试或手工打开 Add Properties，确认列表只显示 `Prefer Off` 与 `Min Consecutive Days Off`。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本轮是小范围配置可见性调整，主要写 SQL migration / seed / 留痕文档，拆分会增加协调成本。
- Suggested split: 不拆。
- Write boundaries: `docs/superpowers/specs/`、`sql/migration/`、`sql/seed/10-pbs-bid-property.sql`，必要时补充 Days Off 相关测试。
- Conflict risk: 低。需要注意当前工作区可能有 unrelated 文档或用户改动，不要 stage。
- Execution gate: 用户已确认“写一个文档留痕，然后开始实现”。
