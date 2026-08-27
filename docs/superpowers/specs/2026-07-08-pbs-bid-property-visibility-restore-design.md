# PBS Bid Property 可见性恢复设计

日期：2026-07-08
状态：已实施，远端 DB 变更已执行
范围：PBS Portal `DaysOff` / `Pairing` property catalog 的数据库可见性恢复。

## 背景

用户收到最新反馈：先暂停关于 bid 条件精简 / 合并方向的下线动作。当前不要求回滚已经完成的名称调整、UI 行为调整或新增能力，只要求把“只是通过数据库字段隐藏、但没有做其它能力替换”的旧条件先显示回来。

本轮必须继续遵守 PBS Property Catalog 规则：

- Portal 展示必须由 `pbs_bid_property.is_visible_in_portal` 控制。
- 不在前端或后端写 code-level 黑名单 / 白名单。
- 不删除 property row。
- 不回滚 `107 Flight Legs per Duty` 的新名称。
- 不回滚 `201 Prefer Off` 的 Dates / Days of Week / Date Range UI 行为。
- 不删除或隐藏新增的 `168 Airport Preference`。

## 目标

恢复以下 property 在 PBS Portal catalog 中可见：

### DaysOff

| code | name |
|---:|---|
| 202 | Max Consecutive Days On |
| 203 | Min Consecutive Days Off |
| 204 | Min Consecutive Days Off In Window |
| 205 | Days Off / Days On Pattern |
| 206 | Employee Schedule Preference |
| 218 | Day of Week Off |

### Pairing

| code | name |
|---:|---|
| 101 | Any Landing In Airport |
| 104 | Any/Every Layover In Airport |
| 119 | Any/Every Layover Duration |
| 123 | Any/Every Layover On Date / Day |
| 108 | Total Legs In Pairing |
| 124 | Total Legs In First Duty |
| 130 | Total Legs In Last Duty |

继续保持以下结果：

| code | 处理 |
|---:|---|
| 107 | 继续显示为 `Flight Legs per Duty`，不改回旧名 |
| 168 | 继续显示 `Airport Preference` |
| 201 | 继续由现有 UI 拆成 Dates / Days of Week / Date Range 入口 |

## 非目标

- 不恢复之前 migration 已删除的旧 configured favorite / simple favorite / generic favorite。
- 不恢复之前 migration 已删除的旧 `pbs_bid_group` / `pbs_bid_condition` rule group。
- 不把 `168 Airport Preference` 自动转换或下线。
- 不改 Pairing Search / Current Rules / algorithm export 的新旧条件逻辑。
- 不改前端弹窗、mapper、contract 或 runtime 代码。
- 不调整 `recommended_order` / `recommended_usage_count`，除非未来产品明确要求恢复 Top Used 排序。

## 方案

采用最小 DB 配置恢复：

1. 新增 SQL migration：
   - 对目标 `DaysOff` / `Pairing` property 设置 `is_visible_in_portal = 1`。
   - 只更新 `updated_at`。
   - 不改 `property_name`、`source_type`、`display_order`、`recommended_*`、`is_active`。
2. 更新 `sql/seed/10-pbs-bid-property.sql`：
   - legacy DaysOff `202-206` 不再默认隐藏。
   - Pairing `101 / 104 / 119 / 123 / 108 / 124 / 130` 不再在 seed 末尾被隐藏。
   - `107` 名称继续保持 `Flight Legs per Duty`。
   - `168 Airport Preference` 继续保持可见。
3. 执行远端 PBS DB migration。
4. 清理 PBS Redis property catalog cache：
   - `pbs:<schema>:days-off:property-catalog:v1`
   - `pbs:<schema>:pairing:property-catalog:v2`

## 预期结果

远端 `f8_pbs` 中：

- `DaysOff` visible count 从 `1` 恢复到 `7`。
- `Pairing` visible count 从 `22` 恢复到 `29`。
- `107` 仍为 `Flight Legs per Duty`。
- `168` 仍可见。

## 验收标准

1. SQL 查询目标 13 个 property，`is_visible_in_portal` 全部为 `1`。
2. SQL 查询 `107`，名称仍为 `Flight Legs per Duty` 且可见。
3. SQL 查询 `168`，仍可见。
4. Portal catalog cache 已清理，服务下一次读取应拿到 DB 新状态。
5. 不存在前端 / 后端 hard-code 控制显示的新增代码。

## 执行记录

执行时间：2026-07-08

远端 schema：`f8_pbs`

执行结果：

- `DaysOff` visible count：`1 -> 7`
- `Pairing` visible count：`22 -> 29`
- 目标 13 个恢复 property 的 `is_visible_in_portal` 均已更新为 `1`
- `107` 仍为 `Flight Legs per Duty`，且 `is_visible_in_portal = 1`
- `168 Airport Preference` 仍为 `is_visible_in_portal = 1`
- PBS Redis 中以下 catalog key 不存在，因此无需删除：
  - `pbs:f8_pbs:days-off:property-catalog:v1`
  - `pbs:f8_pbs:pairing:property-catalog:v2`

注意：`pbs-server` 服务进程内还有 5 分钟 property catalog memory cache。如果页面刚刚访问过旧 catalog，可能需要等 TTL 过期或重启服务进程后才立即反映 DB 最新状态。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本轮是小范围 DB 配置恢复、seed 同步和留痕文档，拆分会增加协调成本。
- Suggested split: 不拆。
- Write boundaries: `docs/superpowers/specs/`、`sql/migration/`、`sql/seed/10-pbs-bid-property.sql`。
- Conflict risk: 低；主要风险是误把 107 改回旧名、误隐藏 168、或误以为恢复可见性会恢复已删除旧数据。
- Execution gate: 用户已明确确认范围，并要求“写一个文档，然后把他们恢复显示”。
