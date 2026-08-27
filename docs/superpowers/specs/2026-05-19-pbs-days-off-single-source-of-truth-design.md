# PBS Days Off 单一真相源设计

日期：2026-05-19  
状态：已确认，前端 Phase 2 已实施  
范围：统一 `/days-off` 左侧日历 Off 与右侧 Existing Days Off Properties 的数据来源；当前已完成前端写入路径切换，后端统一读取 / projection 后续继续

## 背景

当前 `/days-off` 页面有两个看起来相关、但实际分裂的数据流：

1. 左侧 Bidding Calendar 点击某一天 Off。
2. 右侧 Existing Days Off Properties 添加 / 编辑 `Prefer Off` 等条件。

用户直觉上认为：左侧点了 Off，右侧应该出现对应的 Days Off 条件。这个直觉是对的。因为从业务语义看，左侧日历点某一天 Off，本质上就是创建一个 `Prefer Off` 日期条件，而不是创建另一套独立业务对象。

但当前实现中，二者不是同一个真相源。

## 当前实现事实

### 左侧日历 Off

前端：

- `DashboardSchedulePanel`
- 调用 `calendarDaysOffService.patchCurrentDraftDates`
- API：`PATCH /api/calendar-days-off/current/dates`

后端：

- `pbs-server/src/services/calendar/calendar-days-off-service.ts`
- 写入 `pbs_bid_day_off`

落库字段：

| 表 | 字段 |
|----|------|
| `pbs_bid_day_off` | `bid_id` |
| `pbs_bid_day_off` | `tier_id` |
| `pbs_bid_day_off` | `tier` |
| `pbs_bid_day_off` | `bid_date` |
| `pbs_bid_day_off` | `request_type = DAY_OFF` |

当前 schema 注释写明：

> `pbs_bid_day_off` 是“月历具体休息日请求明细，仅用于 Lineholder 月历具体日期休”。

### 右侧 Days Off Existing Properties

前端：

- `DaysOffPage`
- 调用 `daysOffService.addCurrentDraftProperty`
- API：`POST /api/days-off-bids/current/properties`
- 修改时调用 `PATCH /api/days-off-bids/current/properties/:propertyGroupKey`

后端：

- `pbs-server/src/services/days-off/days-off-property-write.ts`
- 写入 `pbs_bid_group`
- `bid_type = DaysOff`

`Prefer Off` 对应：

| 字段 | 值 |
|------|----|
| `property_code` | `201` |
| `name` | `Prefer Off` |
| `operator` | `In` 或 `Between` |
| `param_a` | 日期 / 星期 / Weekends / 日期列表 |
| `param_b` | Window From |
| `param_c` | Window To |

## 问题

当前页面同时维护两份 Days Off 事实：

| 用户动作 | 当前真相源 |
|----------|------------|
| 左侧日历点 Off | `pbs_bid_day_off` |
| 右侧添加 Prefer Off | `pbs_bid_group` |

这会导致：

- 左侧添加后，右侧 Existing 不显示。
- 右侧修改 `Prefer Off` 后，左侧日历不一定同步高亮。
- 提交 / 审核 / 算法读取时，不清楚应该读 `pbs_bid_day_off` 还是 `pbs_bid_group`。
- 后续做 Submit、Tier Review、Dashboard、Award 时会出现口径分裂。

因此必须统一一个真相源。

## 设计原则

1. Days Off 的业务真相源统一为 `pbs_bid_group` 中的 DaysOff property draft。
2. `Prefer Off` 是左侧日历 Off 的业务表达。
3. 左侧日历只是 `Prefer Off` 的快捷编辑入口，不是独立数据模型。
4. 右侧 Existing Properties 是用户可审查、可编辑、可提交的正式 bid 条件列表。
5. 前端不要做“假同步显示”；显示和保存必须来自同一套 draft。
6. 不为了短期 UI 方便制造第三份 projection 状态。

## 目标

1. 用户在左侧日历点 Off 后，右侧 Existing 显示对应 `Prefer Off` 条件。
2. 用户在右侧编辑 `Prefer Off` 后，左侧日历同步反映日期高亮。
3. 删除左侧某个日期 Off，应更新同一条 `Prefer Off` 条件。
4. 删除右侧 `Prefer Off` 条件，应移除左侧对应日期高亮。
5. Submit / Review / Algorithm 后续只读取 Days Off property draft。

## 不做范围

本 spec 不要求第一阶段完成以下事项：

- 不迁移历史生产数据。
- 不删除 `pbs_bid_day_off` 表。
- 不重构 Award / Dashboard。
- 不实现 Submit 闭环。
- 不改变 `Prefer Off` 业务含义。
- 不把 Reserve / Award 暂停模块重新纳入开发。

## 推荐方案

### 方案 A：后端统一真相源，前端只读 Days Off Draft

推荐。

核心：

- 左侧日历保存时，不再直接写 `pbs_bid_day_off`。
- 改为创建或更新 `propertyCode=201` 的 `Prefer Off`。
- `GET /api/days-off-bids/current` 返回完整 Existing Properties。
- 左侧日历高亮从 `GET /api/days-off-bids/current` 中的 `Prefer Off` 反推。
- `calendar-days-off` API 后续降级为兼容接口，或者内部也转写 `Prefer Off`。

优点：

- 真相源清晰。
- 右侧 Existing 自然显示。
- 后续 Submit / Review / Algorithm 只需要读一套 bid property。
- 符合 AA / 旧库 `Prefer Off` 的定位。

缺点：

- 需要改后端 calendar days off service。
- 需要重写部分 calendar day off tests。
- 需要处理旧 `pbs_bid_day_off` 已存在数据的兼容显示。

### 方案 B：保留 `pbs_bid_day_off`，GET Days Off 时合成 `Prefer Off`

不推荐作为长期方案。

核心：

- 左侧仍写 `pbs_bid_day_off`。
- `GET /api/days-off-bids/current` 时把 `pbs_bid_day_off` 合成为虚拟 `Prefer Off`。
- 右侧编辑后再反写 `pbs_bid_day_off`。

优点：

- 左侧写入路径改动小。

缺点：

- `pbs_bid_day_off` 仍然是事实来源之一。
- 合成和反写逻辑复杂。
- 容易出现双写不一致。
- 未来提交和算法仍要理解两套结构。

### 方案 C：前端同时读取两套 API 并合并显示

不推荐。

核心：

- 前端读取 `calendar-days-off` 和 `days-off-bids`。
- 在 UI 层合成右侧 Existing 显示。

优点：

- 后端短期改动少。

缺点：

- 这是“假统一”。
- UI 看到统一，数据库仍分裂。
- 保存、删除、并发版本、提交口径都会更复杂。

## 最终推荐

采用方案 A。

明确口径：

> Days Off bid 的真相源是 `pbs_bid_group` 中 `bid_type=DaysOff` 的 property draft。左侧日历 Off 是 `Prefer Off` 的快捷编辑器。

## 数据模型口径

### 单日期 Prefer Off

左侧选择：

```text
date = 2026-05-21
tiers = T1,T2
```

应保存为：

```text
propertyCode = 201
name = Prefer Off
bid.type = tag-list
bid.values = ["2026-05-21"]
tiers = ["T1", "T2"]
allOrNothing = false
minimumN = null
```

落库：

```text
pbs_bid_group.bid_type = DaysOff
pbs_bid_group.property_id / legacy_property_code = 201
pbs_bid_group.operator = In
pbs_bid_group.param_a = 2026-05-21
pbs_bid_group.param_b = null
pbs_bid_group.param_c = null
```

### 多日期 Prefer Off

同一组 tiers 下多个日期应合并为一条 `Prefer Off`：

```text
propertyCode = 201
bid.values = ["2026-05-21", "2026-05-22"]
tiers = ["T1", "T2"]
```

落库：

```text
operator = In
param_a = 2026-05-21,2026-05-22
```

### 不同 tier 集合

如果日期 A 适用 `T1,T2`，日期 B 只适用 `T3`，推荐拆成两条 `Prefer Off`：

```text
Prefer Off: 2026-05-21
tiers: T1,T2

Prefer Off: 2026-05-22
tiers: T3
```

原因：

- 当前 `pbs_bid_group` 每个 group 在不同 tier 下共享 `property_group_key`。
- 一条 property 的 `bid.values` 对所有 tiers 生效。
- 如果同一条 property 同时表达不同 tier/date 矩阵，会丢失精确关系。

## 左侧日历行为

### 添加日期 Off

用户在左侧点日期并选择 tiers 后：

1. 找到当前 draft 中是否已有 `Prefer Off` property。
2. 如果存在相同 tier 集合的 `Prefer Off`，把日期加入 `bid.values`。
3. 如果不存在相同 tier 集合的 `Prefer Off`，新增一条 `Prefer Off`。
4. 调用 Days Off property API 保存。
5. 刷新 / patch `days-off-bids/current` cache。
6. 左侧日历从更新后的 `Prefer Off` 反推高亮。
7. 右侧 Existing 显示更新后的 `Prefer Off`。

### 移除日期 Off

用户在左侧取消某日期 Off：

1. 找到包含该日期和对应 tiers 的 `Prefer Off` property。
2. 从 `bid.values` 中移除日期。
3. 如果 `bid.values` 为空，删除该 `Prefer Off` property。
4. 否则 patch 该 property。
5. 右侧 Existing 和左侧日历同时更新。

### Header 添加某星期所有 Off

用户点击 `Add day off bids for SAT`：

1. 计算本月所有 SAT 日期。
2. 按 selected tiers 和 pairing blocked tiers 过滤。
3. 把最终日期集合合并进相同 tier 集合的 `Prefer Off`。
4. 保存为 Days Off property draft。

## 右侧 Existing 行为

右侧 `Prefer Off` 编辑弹窗仍是正式编辑入口：

- 新增日期后，左侧日历高亮增加。
- 删除日期后，左侧日历高亮减少。
- 修改 tiers 后，左侧对应 tier/date 状态变化。
- 删除整条 property 后，左侧取消对应日期高亮。

## API 调整建议

### 短期 API

优先复用现有 Days Off property API：

- `POST /api/days-off-bids/current/properties`
- `PATCH /api/days-off-bids/current/properties/:propertyGroupKey`
- `DELETE /api/days-off-bids/current/properties/:propertyGroupKey`

前端 calendar action 可转为 property add / patch / delete。

### 中期 API

可以新增专用快捷接口，但内部必须写 `Prefer Off`：

```text
PATCH /api/days-off-bids/current/prefer-off-dates
```

输入：

```json
{
  "draftKey": "...",
  "periodCode": "May 2026",
  "draftVersion": 3,
  "changes": [
    { "date": "2026-05-21", "tier": "T1", "selected": true }
  ]
}
```

输出：

```json
{
  "draftKey": "...",
  "draftVersion": 4,
  "affectedProperties": [...]
}
```

这个接口只是快捷操作，不是新真相源。

### `calendar-days-off` API 去向

短期：

- 保留接口，避免破坏现有引用。
- 内部改为读写 `Prefer Off`，或者标记 deprecated。

中期：

- 左侧 calendar 组件不再依赖 `calendar-days-off/current`。
- `bidding-calendar/current` 的 day_off_bid event 来源改为 Days Off `Prefer Off`。

长期：

- `pbs_bid_day_off` 可保留为历史兼容 / projection 表，但不作为产品主写路径。

## 缓存与前端状态

需要统一以下 query：

| 当前 query | 建议 |
|-----------|------|
| `calendarDaysOffDraftQueryKey` | 从主写路径移除或改为 projection |
| `daysOffPageDataQueryKey` | Days Off 右侧主 query |
| `biddingCalendarQueryKey` | 从 `Prefer Off` 反推日历事件 |
| `tierPageDataQueryKey` | Days Off 变更后仍需 invalidate |

当左侧日历保存 Prefer Off 后，应至少更新 / invalidate：

- `daysOffPageDataQueryKey`
- `biddingCalendarQueryKey`
- `tierPageDataQueryKey`

如果短期仍保留 `calendarDaysOffDraftQueryKey`，它也必须由 `Prefer Off` 派生，不能独立写。

## 并发与 draftVersion

统一真相源后，左侧日历和右侧 Existing 都操作同一个 `pbs_bid.draft_version`。

要求：

- 左侧日历保存必须带当前 `days-off-bids/current` 的 `draftVersion`。
- 保存成功后递增版本。
- 如果版本冲突，提示用户刷新。
- 不再出现 calendar draft version 和 days off draft version 两套版本。

## 数据兼容策略

如果已有 `pbs_bid_day_off` 数据：

第一阶段可以做读取兼容：

1. `GET /api/days-off-bids/current` 读取 property draft。
2. 如果没有 `Prefer Off`，但存在 `pbs_bid_day_off`，可临时映射为 `Prefer Off` 显示。
3. 一旦用户保存 Days Off draft，将 `Prefer Off` 写入 `pbs_bid_group`。

第二阶段：

- 增加迁移脚本，把 `pbs_bid_day_off` 当前数据迁入 `Prefer Off` group。

第三阶段：

- 停止从 `pbs_bid_day_off` 读取产品主数据。

## 测试计划

### 后端测试

需要覆盖：

- calendar date add 写入 `Prefer Off`。
- same tiers 多日期合并到同一条 `Prefer Off`。
- different tiers 拆成不同 `Prefer Off`。
- 移除日期后 property values 变少。
- 移除最后一个日期后删除 property。
- draftVersion 冲突返回 409。
- pairing blocked tier/date 不写入。
- `GET /days-off-bids/current` 返回由日历添加产生的 `Prefer Off`。

### 前端测试

需要覆盖：

- 左侧点击日期 Off 后，右侧 Existing 出现 `Prefer Off`。
- 左侧添加多个日期后，右侧 `Prefer Off` values 合并显示。
- 右侧编辑 `Prefer Off` 删除日期后，左侧日历取消高亮。
- 右侧删除 `Prefer Off` 后，左侧对应日期全部取消高亮。
- Line 页面不受影响。

## 实施分阶段

### Phase 1：后端统一写路径

- 新增 Days Off Prefer Off date patch 逻辑。
- 让日历快捷操作写 `pbs_bid_group`。
- 保留旧 `/calendar-days-off/current/dates` route，但内部转写 Prefer Off 或先暂停前端调用。

### Phase 2：前端切换左侧日历保存

- `/days-off` 左侧日历不再调用 `calendarDaysOffService.patchCurrentDraftDates`。
- 改为调用 Days Off Prefer Off 保存逻辑。
- 保存后更新 `daysOffPageDataQueryKey`。

### Phase 3：日历高亮从 Prefer Off 派生

- `bidding-calendar/current` 的 day off event 改为读取 Days Off `Prefer Off`。
- 前端移除对独立 calendar draft 的主依赖。

### Phase 4：兼容清理

- 梳理 `pbs_bid_day_off` 是否仍有必要。
- 如果保留，明确它是 projection / legacy，不是产品真相源。
- 更新 docs 和 AGENTS 相关说明。

## Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: 该任务可拆为后端写路径、前端日历联动、测试与兼容梳理三个相对独立领域；但必须先确认数据口径，避免并行实现出多个版本。
- Suggested split:
  - Agent A：后端 Days Off / calendar service 写路径与测试。
  - Agent B：前端 `/days-off` 左侧日历保存与右侧 Existing cache 同步。
  - Agent C：兼容读取、文档与回归测试清单。
- Write boundaries:
  - Agent A：`pbs-server/src/services/calendar/`、`pbs-server/src/services/days-off/`、相关 route tests。
  - Agent B：`pbs-portal/src/features/dashboard/`、`pbs-portal/src/features/days-off/`、shared workbench tests。
  - Agent C：`docs/`、contracts review、migration notes。
- Conflict risk: Medium。`calendar-days-off` 与 `days-off-bids` 都会碰 draftVersion 和 query invalidation，必须由主 agent 统一集成。
- Execution gate: 必须先由用户确认本 spec；实现前再决定是否启用多 agent。

## 已确认口径

1. `pbs_bid_day_off` 仅保留为 legacy / projection，不再作为 Days Off 主写路径。
2. 接受“相同 tier 集合合并一条 Prefer Off，不同 tier 集合拆分多条 Prefer Off”。
3. 第一版复用现有 property API，不新增 `prefer-off-dates` 快捷 API。
4. 现有测试数据可以清理，不要求迁移。

## 本轮实施记录

本轮先完成前端 Phase 2：

- `/days-off` 左侧日历保存 Off 时，不再调用 `calendarDaysOffService.patchCurrentDraftDates`。
- 左侧日历将日期 / tier 矩阵转换为 `propertyCode=201` 的 `Prefer Off`，通过 `daysOffService.addCurrentDraftProperty`、`patchCurrentDraftProperty`、`removeCurrentDraftProperty` 保存。
- 左侧日历高亮从 `daysOffPageDataQueryKey` 的 `Prefer Off` 反推。
- 保存后同步更新 `daysOffPageDataQueryKey`，并 invalidate `biddingCalendarQueryKey`、`tierPageDataQueryKey`。
- Pairing 与 Line 页面保持原行为，不纳入本轮 Days Off 改动。

## 推荐确认口径

建议确认以下口径后进入实施：

1. Days Off 业务真相源统一为 `pbs_bid_group` / `Prefer Off`。
2. 左侧日历 Off 是 `Prefer Off` 快捷编辑器。
3. 后续 Submit / Review / Algorithm 不直接读取 `pbs_bid_day_off`。
4. 第一阶段允许保留 `calendar-days-off` API，但它不能再产生独立真相源。
