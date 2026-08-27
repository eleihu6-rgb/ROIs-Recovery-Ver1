# PBS Pairing 卡片 Base 本地开始日期修复

## 目标

Pairing 搜索结果卡片的 `Start` 日期必须与 Date Range 筛选和右侧日历使用同一日期口径：Pairing Base 本地日期。

## 现状与原因

- Date Range 使用后端计算的 `active_start_date`，其来源为 Pairing 起始时间按 Base 时区转换后的本地日期。
- 卡片 `Start` 当前优先格式化 `pairing.sch_str_dt_utc`，因此在 UTC 日期与 Base 本地日期跨日时会晚一天。

## 方案

- 保留数据库字段、查询条件和 API contract 不变。
- `mapPairingResult` 继续以现有 `originDate` 作为 Base 本地日期，并让 `startDateLabel` 直接格式化该值。
- 不修改航段时刻、Report/Release、日历覆盖日期或原始 UTC 数据。
- `active_start_date` 缺失时继续使用 mapper 已解析的 `activeDates[0]` 作为 `originDate`；两者都缺失时返回空标签，由 Portal 显示 `-`，不得重新回退到 UTC 日期。

## 验收标准

1. 后端回归 fixture 必须明确设置 `active_start_date="2026-06-04"`、`pairing_start_utc="2026-06-05T...Z"`，并断言 `startDateLabel="Jun 4, 2026"`，能够捕获原始问题。
2. Date Range 选择 `2026-06-01` 至 `2026-06-04` 时，该结果的筛选、卡片和日历日期一致。
3. 分别覆盖 `executePreviewQuery` 与 `executePairingDetailsQuery`，对同一跨日 fixture 断言一致的 `originDate`、`startDateLabel` 和 `activeDates`。
4. 覆盖 `active_start_date` 缺失时使用 `activeDates[0]`，以及两者都缺失时保持空标签的回退边界。
5. Playwright 使用跨日响应，断言真实卡片展示 Base 本地日期，并与同一结果的 Date Range 和日历日期一致。
6. 新增或更新 `docs/test-cases/pbs/pairing/` 下 QA 用例，覆盖跨日一致性、详情入口和缺失日期回退。
7. 现有 Pairing 搜索后端测试、Portal 测试、Playwright 回归、lint、build 和 UI gate 通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 单一 mapper 的局部修复，并行实现的协调成本高于收益。
- Write boundaries: mapper、相关自动化测试和 QA 测试说明。
- Conflict risk: 低，但当前工作区存在同功能区未提交改动，必须采用局部补丁保留现状。
- Execution gate: 用户已明确回复“改”；不执行 Git commit。
