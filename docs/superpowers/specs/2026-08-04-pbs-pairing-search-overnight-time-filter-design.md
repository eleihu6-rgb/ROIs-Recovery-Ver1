# PBS Pairing 跨午夜时间筛选与日期范围布局设计

## 目标

- Pairing Search 的时间筛选支持每天重复的跨午夜窗口。
- Date Range 始终单行显示完整日期，不再因筛选栏宽度不足而折行变形。
- 筛选失败时不向用户展示 Axios 原始错误文本。

## 行为设计

- `timeFrom <= timeTo` 时保持现有逻辑：`report_time >= timeFrom AND report_time <= timeTo`。
- `timeFrom > timeTo` 时视为跨午夜窗口：`report_time >= timeFrom OR report_time <= timeTo`。
- 跨午夜 OR 条件必须整体放入括号后再与其他筛选条件 AND 组合，避免 SQL 布尔优先级扩大结果集。
- 例如 `15:53 → 08:59` 表示每天 `15:53–24:00` 或 `00:00–08:59`，并继续与 Date Range、Pairing Number、Airport 等字段按 AND 组合。
- 仅填写开始时间或结束时间时，继续分别作为单边界筛选。
- `timeFrom === timeTo` 保持闭区间语义，只匹配该分钟。
- 后端仅从倒序校验集合中排除 `timeFrom/timeTo`；Date Range、Release Time、`durationDays` 和 `creditMinutes` 仍保持“开始不得大于结束”的校验并返回 400。

## 界面与错误处理

- Date Range 列获得足够的最小宽度，两个 `YYYY-MM-DD`、`TO`、清除和日历图标保持单行，不改变日期选择器交互。
- 筛选栏仍保持响应式布局；空间不足时不能通过拆分日期文本来压缩 Date Range。
- 可恢复的搜索失败使用页面现有的持久化 `role="alert"` 结果刷新错误状态，但展示产品文案 `Unable to refresh pairing results. Adjust the filters or try again.`，不得展示 `Request failed with status code 400`、响应正文或内部异常文本；首次加载失败同样通过统一安全映射展示产品文案。

## 验收标准

1. `08:00 → 15:00` 生成同日闭区间 SQL 条件；`15:53 → 08:59` 被后端接受并生成整体带括号的跨午夜 OR 条件。
2. 跨午夜条件与 Date Range、Pairing Number、Airport 等其他条件正确按 AND 组合。
3. 仅开始时间、仅结束时间及 `timeFrom === timeTo` 均有独立回归测试。
4. Date Range、Release Time、`durationDays`、`creditMinutes` 的倒序输入仍返回 400。
5. SQL fixture/结构测试覆盖普通窗口、跨午夜叠加其他条件、两个单边界和相等时间；远端 PostgreSQL 对这些代表性 SQL 执行 `EXPLAIN` 或最小只读查询并提供回执。
6. Date Range 在空值、单值和完整范围状态下均不换行、不裁剪；Playwright 至少覆盖 `1920×1080` 基线和一个项目支持的较窄视口，断言两个日期、`TO`、清除和日历图标同一行且无溢出，其他控件仍顶部对齐。
7. mock UI Playwright 断言跨午夜请求 payload 包含 `timeFrom: "15:53"`、`timeTo: "08:59"`；真实 pbs-server/远端数据库验证另行执行，不用 mock 结果冒充真实查询。
8. 模拟 Axios 400 时，持久化 `role="alert"` 和首次加载错误均展示安全产品文案，并断言页面不包含 Axios message、响应正文或内部异常信息。
9. 更新现有 QA 文档 `docs/test-cases/pbs/pairing/2026-08-04-search-result-filter-controls.md`，覆盖普通窗口、跨午夜、单边界、其他倒序范围拒绝、两种视口布局和 400 安全文案。
10. 运行并报告相关 Vitest、TypeScript、ESLint、build、`npm run check:ui`、SQL 验证和 Playwright 结果。

## 影响范围

- `pbs-server`：Pairing Search 请求校验、结果筛选 SQL 与测试。
- `pbs-portal`：Date Range 布局、搜索错误文案与测试。
- `e2e`：Pairing Search 跨午夜与布局回归。
- 不修改数据库 schema，不需要 migration，不改变 API 字段名称。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 请求校验、SQL 语义、前端状态和同一条 E2E 紧密关联，顺序实施更易保证一致性。
- Suggested split: 不拆分。
- Write boundaries: 仅限 Pairing Search 相关前后端、测试、现有 QA 文档。
- Conflict risk: Low。
- Execution gate: 用户审核并批准本 spec 后实施。
