# PBS Pairing Mini Calendar Active Dates 修复设计

日期：2026-06-10  
范围：PBS Portal `/fpqe/pbs/pairing/search` 结果卡片 mini calendar

## 背景

任务环结果卡片右侧 mini calendar 当前使用 `activeDates: number[]`，只保存日期号，例如 `29`。前端日历又会同时渲染上月占位日期和当前月日期，因此当 `activeDates` 包含 `29` 时，上月 `29` 和本月 `29` 都会被点亮，造成“数据只有几天但亮了更多格子”的问题。

## 目标

- 后端不再返回裸日期号，改为返回完整 ISO 日期 `YYYY-MM-DD`。
- 前端 mini calendar 根据真实 bid period 渲染月份格子。
- 点亮时按完整日期匹配，避免上月占位和本月同日号同时命中。
- active dates 表示 pairing 在日历上的占用日期范围：从 active start date 开始，按 `duration_days` 展开。

## 非目标

- 不改变 duty KPI、leg 明细和统计字段口径。
- 不修改数据库 schema。
- 不改 Pairing 搜索条件逻辑。

## 方案

1. Contract 将 `PbsSearchPairingsResult.activeDates` 从 `number[]` 改为 `string[]`。
2. 后端 `pairing-search-preview-query` 为每个 pairing 计算 `active_start_date`：
   - 优先使用 pairing segment 的最早 `brief_start_utc / sch_str_dt_utc`。
   - fallback 到 pairing 自身 `sch_str_dt_utc`。
   - 当请求包含 `periodCode` 时，保留 `active_start_date` 的日号，并映射到该 bid period 的年月，避免把样例/模板数据的原始年月直接返回给当前日历。
   - 转成 `YYYY-MM-DD`。
3. 后端根据映射后的 `active_start_date + duration_days` 展开 active ISO dates。
4. 前端 `PairingMiniCalendar` 接收 `periodCode` 和 `activeDates: string[]`，按 period 年月生成包含上月/下月占位的完整日期格子。
5. 前端点亮逻辑改为 `activeDateSet.has(cell.isoDate)`。

## 验收标准

- 同一个日号出现在上月占位和当前月时，只点亮 active ISO date 对应的那个格子。
- P2 pairing 只点亮连续 2 天，P4 pairing 只点亮连续 4 天。
- Search Pairings、calendar pairing detail、Tier preview 相关测试通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是一个小范围 contract + mapper + mini calendar 修复，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: pairing search contract、后端 preview mapper、前端 pairing search 类型和测试数据。
- Conflict risk: 中低；需要同步 number[] -> string[]。
- Execution gate: 用户已要求修复。
