# Gantt Crew Bids Viewer 按 rosterPeriodId 查询修复设计

## 1. 背景

Scenario 下的 Crew Bids Viewer 当前在 `http://localhost:5566/altair/scenario` 搜索不到数据。表面现象是选择 `2026RP06` 后点击 Search，页面没有结果；实际排查发现不是六月没有 bid 数据，而是 Gantt 这块还在使用旧的 `periodCode / pbs_period_code` 查询模型。

已确认的问题：

- `GET /api/roster-periods` 返回的 `2026RP06` 缺少 `pbsPeriodCode`，前端 fallback 成 `May 2026`。
- 同一个接口把 `rp_start / rp_end` 通过 JS UTC 转换后返回，导致 `2026-06-01～2026-06-30` 被显示成 `2026-05-31～2026-06-29`。
- Crew Bids Viewer 搜索请求仍传 `periodCode=May 2026`，没有传稳定的 `rosterPeriodId`。
- `live-server` 的 `/api/pbs/crew-bids` route 用 `pbs_bid.period_code = $1` 查询 Current bid，并且假设 `pbs_user.base / pbs_user.rank` 存在。
- 当前 `pbs_user` 已没有 `base / rank` 字段，真实 base/rank 应从 Live 的 `crew_base / crew_rank` 有效记录解析。
- DEV 数据库中 `Jun 2026` 实际存在约 620 条 bid，因此这不是导入数据缺失问题。

这和之前 PBS Portal 已经完成的 Period 模型一致：Portal 现在不应该依赖 `pbs_period_code` 作为业务身份，真正的周期身份是 `roster_period.id`。`pbs_period_code` 可以继续作为 UI 展示值或历史标签，但不能再作为查询 Current bid 的主键。

## 2. 目标

1. Crew Bids Viewer 与 PBS Portal 的周期模型严格对齐：以 `rosterPeriodId` 作为 Current bid 查询身份。
2. `periodCode / pbs_period_code` 只用于展示、日志标签或历史文案，不参与 Current bid 业务筛选。
3. 修复 `GET /api/roster-periods` 的日期返回和 `pbsPeriodCode` 丢失问题，避免前端从错误日期 fallback 出错误月份。
4. 修复 `/api/pbs/crew-bids` 对旧 `pbs_user.base / pbs_user.rank` 字段的依赖，改为从 Live 有效 base/rank 表解析。
5. 搜索失败时显示正常错误状态，不把 SQL 错误伪装成“没有数据”。
6. 对没有 bid 的周期返回空结果，不返回 500。

## 3. 非目标

- 不修改 PBS Portal 的 bid 保存、draft、award 或 standing bid 逻辑。
- 不重新导入 bid 数据。
- 不为了兼容错误数据继续按 `periodCode` 猜 Current 周期。
- 不修改 `pbs_bid.period_code` 字段含义；它可以继续存在，但不作为 Current 查询身份。
- 不在本期重做 Crew Bids Viewer 的 UI 样式或功能范围。
- 不改 Scenario 优化流程本身。

## 4. 核心判断

当前应该按以下模型处理：

- 周期稳定身份：`live.roster_period.id`
- 周期业务键：`live.roster_period.roster_period`，例如 `2026RP06`
- Portal/PBS 展示标签：`live.roster_period.pbs_period_code`，例如 `Jun 2026`
- Current bid 业务关联：`pbs.pbs_bid.roster_period_id`
- Standing bid 仍是独立语义，不应该被 Current Crew Bids Viewer 用 `periodCode='STANDING'` 混进来

所以这次修复的主方向是：前端选择 RP 后把 `rosterPeriodId` 发给后端，后端用 `pbs_bid.roster_period_id` 查数据，再返回可展示的 `periodCode / rosterPeriod`。

## 5. 推荐方案

### 5.1 前端查询合同

调整 `gantt/src/services/crew-bids-api.ts`：

- 请求参数从必填 `periodCode` 改为必填 `rosterPeriodId`。
- `periodCode` 不再作为查询参数传给后端。
- `bidContext / bases / ranks / crewId` 保持现有语义。

调整 `gantt/src/components/scenario/crew-bids/crew-bids-view.tsx`：

- `handleSearch` 使用 `selectedPeriod.id` 或当前 filter 中的 `rosterPeriodId` 调用 API。
- UI 上仍可显示 `rosterPeriod`、`name` 或响应返回的 `periodCode`，但不能用它推导查询范围。
- 如果没有选中有效 `rosterPeriodId`，直接进入本地校验错误或禁用 Search。

### 5.2 `GET /api/roster-periods` 修复

调整 `live-server/src/routes/base/roster-periods.ts`：

- 普通分支 SQL 最终 select 必须包含 `pbs_period_code`。
- 日期字段返回数据库 date 文本，不走会受时区影响的 `toISOString()`。
- `rpStart / rpEnd` 应返回真实日期：
  - `2026RP06.rpStart = 2026-06-01`
  - `2026RP06.rpEnd = 2026-06-30`

这一步虽然会影响所有使用 roster periods 的页面，但它是修正基础周期 API 的错误，不是新增业务行为。

### 5.3 后端 Crew Bids 查询

调整 `live-server/src/routes/pbs/crew-bids.ts`：

- Query schema 新增并要求：

```ts
rosterPeriodId: z.coerce.number().int().positive()
```

- Current/Default 查询使用：

```sql
b.roster_period_id = :rosterPeriodId
```

- 后端先从 Live `roster_period` 读取周期上下文，用于返回展示字段和解析有效 base/rank。
- 不再用 `b.period_code = :periodCode` 查询 Current bid。
- base/rank 从 Live 表按选中 RP 的 roster start 生效日期解析，例如：
  - `crew_base` 取 `eff_dt <= rp_start` 且未过期的 prime/latest base。
  - `crew_rank` 取 `eff_dt <= rp_start` 且未过期的 latest rank。
- base/rank 过滤也使用解析后的 `base / rank`，不是 `pbs_user` 字段。

建议 SQL 结构：

- `period_context` CTE：按 `rosterPeriodId` 查 `roster_period`。
- `bid_rows` CTE：按 `pbs_bid.roster_period_id` 和可选 `bidContext` 过滤。
- `crew_context` CTE：对 bid 涉及 crew 解析有效 base/rank。
- 最终 select 返回 crew、base、rank、bid context、tier、property summary。

### 5.4 空结果与错误

- 有效周期但没有 bid：返回 200，`data.items=[]`，前端显示现有空态。
- 周期不存在：返回稳定业务错误，例如 `PERIOD_NOT_FOUND`。
- SQL/schema 错误：后端记录 sanitized log，前端只显示统一产品文案，不暴露 SQL 细节。

## 6. 备选方案与取舍

### 方案 A：按 rosterPeriodId 修复，推荐

优点：

- 与 Portal 当前模型一致。
- 不再受 `pbs_period_code` 缺失、展示文案变更、跨年同月份等问题影响。
- 能解决 `2026RP06` 被误算成 `May 2026` 的根因。

缺点：

- 前后端合同都要同步调整。
- 相关测试需要一起更新。

### 方案 B：只修 `pbsPeriodCode` 和日期偏移，继续按 periodCode 查

不推荐。

原因：

- 只能让 `Jun 2026` 暂时查到，但仍然依赖展示字段。
- 到第二年或历史数据变复杂时，仍可能出现同名/错绑/脏数据问题。
- 和 Portal 已迁移的周期模型不一致。

### 方案 C：给 `pbs_user` 补 base/rank 字段

不推荐。

原因：

- 这是绕过真实数据模型。
- base/rank 是有生效日期的业务事实，不应该复制到 `pbs_user` 上当静态字段。
- 后续人员调 base 或 rank 时会再次不一致。

## 7. 数据库与迁移影响

本期默认不做数据迁移。

需要在实现时检查索引：

- 如果 `pbs_bid(roster_period_id, bid_context)` 已有合适索引，不需要 migration。
- 如果没有索引，建议新增一个只读查询优化索引，避免 Crew Bids Viewer 随数据量变大变慢。
- `crew_base / crew_rank` 如果已有 `crew_id + eff_dt` 相关索引，可以复用；如果没有，再评估是否需要补索引。

数据原则：

- Current bid 必须有正确的 `roster_period_id`。
- 如果发现 Current bid 的 `roster_period_id` 为空，应修数据或导入逻辑，不在 Crew Bids Viewer 里做 periodCode fallback。

## 8. 验收标准

1. 打开 `http://localhost:5566/altair/scenario`，进入 Crew Bids Viewer。
2. 选择 `2026RP06` 后，日期显示为 `2026-06-01～2026-06-30`。
3. 点击 Search 时，请求使用 `rosterPeriodId=6`，不再发送 `periodCode=May 2026`。
4. `2026RP06` 搜索返回 200，并显示 bid rows。
5. 后端不再报 `column pu.base does not exist`。
6. Base / Rank filter 能按 Live 有效 base/rank 正常过滤。
7. 选择没有 bid 的周期时返回 200 空列表，页面显示空态，不报 500。
8. `periodCode` 只作为展示字段保留，不再作为 Current 查询身份。

## 9. 测试计划

后端：

- 为 `/api/pbs/crew-bids` 增加或更新 focused test：
  - `rosterPeriodId` 必填。
  - 使用 `pbs_bid.roster_period_id` 查询。
  - base/rank 过滤来自 Live effective base/rank。
  - 无数据周期返回 200 空结果。
- 为 `/api/roster-periods` 增加或更新测试：
  - `pbsPeriodCode` 正常返回。
  - `rpStart / rpEnd` 不因时区偏移。

前端：

- 更新 Crew Bids Viewer API client 测试或组件测试。
- 更新 Playwright：
  - 进入 Scenario > Crew Bids。
  - 选择 `2026RP06`。
  - 点击 Search。
  - 断言请求 query 包含 `rosterPeriodId`。
  - 断言页面显示 bid rows。
  - 断言没有 `Error loading data`。

验证命令以实现时实际 touched files 为准，至少包含：

```bash
cd live-server && npm test -- --run <crew-bids-or-roster-period-focused-test>
cd gantt && npm run check:ui
cd gantt && npx playwright test <crew-bids-viewer-focused-spec>
```

如果 route 改动触发类型合同变化，还需要补充：

```bash
cd live-server && npx tsc --noEmit
cd gantt && npx tsc --noEmit
```

## 10. 风险与待确认点

- `bidContext=Default` 在当前数据中是否全部 period-bound，需要实现时用数据库确认；如果存在历史 `period_code='STANDING'` 的 default-like 数据，不应混入本次 Current Viewer。
- 如果还有其他调用方直接调用 `/api/pbs/crew-bids?periodCode=...`，需要同步改为 `rosterPeriodId`，不建议保留长期兼容。
- 如果生产/SIT/UAT 的 Current bid 有 `roster_period_id` 为空，需要作为数据问题单独修复。

## 11. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这次改动虽跨前端、后端和测试，但核心是一个查询合同从 `periodCode` 切换到 `rosterPeriodId`，前后端耦合很紧，拆开容易造成临时不一致。
- Suggested split: 不拆分；由一个实现者顺序修改 route、API client、页面调用和测试。
- Write boundaries: `live-server` Crew Bids/roster-period route、`gantt` Crew Bids Viewer/API client、对应测试文件。
- Conflict risk: Medium，主要风险是其他页面复用 `roster-periods` 响应或旧 `crew-bids` API。
- Execution gate: 用户确认本 spec 后再开始改代码。
