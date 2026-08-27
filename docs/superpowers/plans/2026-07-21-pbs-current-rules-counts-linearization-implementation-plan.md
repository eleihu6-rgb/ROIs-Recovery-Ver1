# PBS Current Rules Counts 线性化性能修复实施计划

- 日期：2026-07-21
- 对应设计：`docs/superpowers/specs/2026-07-21-pbs-current-rules-counts-linearization-design.md`
- 状态：已批准并完成实施验证
- 预计范围：`pbs-server` 动态 count SQL、后端测试、真实数据库验证、PBS Portal Playwright/QA
- 明确不做：不改业务 contract、不改 Portal timeout、不做数据库 migration、不改页面布局

## 1. 实施原则

本次只优化 `/api/pairing-search/current-rules/counts` 的执行方式：

- 所有业务叶子条件继续由 `buildPreviewCondition()` 生成；
- AND/OR grouping 继续由现有 `buildCurrentRulesCondition()` 的同一套算法决定；
- Base、Rank、Period、本地 origin date、Tier、顺序、计数口径与缓存行为不变；
- 不把现有 `executePreviewCountQueries()` 的 tier-pools 路径一起重写，避免扩大影响面；
- 先捕获改前真实基线，再写代码；没有新旧结果对照和真实 UI 回归不能交付。

## 2. 工作树保护

当前工作区已有日历 popover 定位修复的未提交改动，包括 `e2e/tests/pbs-portal/bid-merged-workbench.spec.ts` 和若干 Portal 文件。本任务：

- 不回滚、不暂存、不提交这些既有改动；
- 后端修改限制在 pairing-search count 相关文件；
- 新增或修改 `pairing-search.spec.ts` 时不触碰 `bid-merged-workbench.spec.ts`；
- 每一步运行 `git status --short` 和局部 diff，确认没有覆盖用户工作。

## 3. 阶段一：建立改前证据

### 3.1 GitNexus 影响分析

在任何 symbol 修改前，对以下目标执行 upstream impact/context：

- `buildCurrentRulesCondition`
- `executePreviewCountQueries`
- `countCurrentRules`

记录直接调用者、关联流程和风险等级。若为 HIGH/CRITICAL，先向用户报告 blast radius，再继续实现。

若 GitNexus MCP 不可用，使用仓库 `.gitnexus/run.cjs`/CLI 完成等价 query、context 和 impact；若索引过期，先更新索引。

### 3.2 捕获用户 19 的真实基线

通过真实 Portal 登录用户 19，捕获 Jun 2026 / T1 的合法 counts payload，但不得保存 JWT、密码或其他敏感 header。

记录：

- properties 总数与当前 T1 active 数量；
- propertyCode/name/tier/action/quantifier/bid type 的非敏感摘要；
- HTTP 状态；
- 应用冷缓存端到端 duration；
- 完整 `rows[].rule`、`rows[].funnel`、`summary` 结果快照。

应用冷缓存通过仅替换合法 UUID 型 `propertyGroupKey` 生成新的 request hash；其余业务 payload 不变。

### 3.3 捕获改前 SQL 与 EXPLAIN

从 test Pool wrapper 或运行中 `pg_stat_activity` 捕获参数化 SQL 与参数，执行远端 PostgreSQL：

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ...
```

保存：

- execution time；
- candidate pairing 行数；
- `pairing_segment` 相关子查询 loops；
- shared hit/read buffers；
- target 分支数量；
- wait event 状态。

基线预期：用户 19 为 7 个 row targets + 6 个 funnel targets，共 13 个完整分支，冷请求约 34–35 秒。

## 4. 阶段二：共享 AND/OR 组合器

### 4.1 修改文件

- `pbs-server/src/services/pairing-search/pairing-search-condition-builder.ts`
- `pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts`

### 4.2 实施内容

从 `buildCurrentRulesCondition()` 内抽取一个最小的共享表达式组合器，例如：

```ts
buildCurrentRulesExpression(properties, buildLeafExpression)
```

职责：

- 执行现有 conflict detection；
- 使用现有 union-find 识别 multi-use 与 forced-OR groups；
- 组内 OR、组间 AND；
- 保持 property 输入顺序；
- 由 callback 决定叶子表达式。

现有 `buildCurrentRulesCondition()` 改为调用该组合器，并传入：

```ts
property => buildPreviewCondition(property, ...)
```

线性化 counts 路径随后传入稳定布尔列引用。不得复制 `shouldJoinRulePropertiesWithOr()`、union-find 或 conflict 逻辑。

### 4.3 测试

补充/更新 focused tests：

- 普通不同 property 使用 AND；
- 相同 multi property 使用 OR；
- forced-OR 使用 OR；
- OR group 与其他 group 使用 AND；
- 3 个以上条件的传递 OR grouping；
- prefix slice 顺序不变；
- duplicate/single-use conflict 仍返回相同错误；
- 重构前后现有 SQL condition snapshot/regex 断言不变。

阶段验证：

```bash
cd pbs-server
npm test -- pairing-search-condition-builder
```

实际命令以模块当前 test script 支持方式为准，并在交付中报告精确命令。

## 5. 阶段三：新增 current-rules 专用线性化 count query

### 5.1 修改文件

- `pbs-server/src/services/pairing-search/pairing-search-preview-query.ts`
- 对应 query/service focused test 文件；优先复用现有 `pairing-search-service.test.ts`，如结构断言过重再新增聚焦 test

### 5.2 保留现有通用路径

保留 `executePreviewCountQueries()` 供现有 tier-pools 等调用。新增 current-rules 专用执行函数，不在本任务中改变 tier-pools SQL。

建议输入结构：

```ts
type CurrentRuleCountLeaf = {
  key: string;
  condition: string;
};

type CurrentRuleCountTarget = {
  key: string;
  expression: string;
};
```

所有 SQL alias 由服务端按顺序生成 `match_1...match_N`，不使用用户输入作为 identifier。

### 5.3 Candidate CTE

生成 `MATERIALIZED candidate_pairings`，只执行一次：

- active pairing；
- actor base；
- actor rank composition；
- period/local-origin-date；
- 本地日期所需 airport/base timezone。

继续复用当前 `buildPairingLocalOriginDateExpression()`。不得改成 UTC 月份或 `p.sch_str_dt_utc` 的不同口径。

Candidate 必须保留底层行基数，不得通过 `DISTINCT`/提前聚合把 `totalItems` 强制成 distinct pairing count。

### 5.4 Evaluated CTE

生成 `MATERIALIZED evaluated_pairings`：

- 保留计数所需 pairing id/结果行；
- 每个 leaf property 使用一次现有 `buildPreviewCondition()` SQL；
- 输出稳定 `match_N` boolean；
- 允许 row 和 funnel target 复用同一 boolean。

### 5.5 Target 聚合

从 evaluated 结果构造：

- 所有 existing properties 的 row-rule targets；
- 当前 Tx active properties 的 prefix-funnel targets；
- 保持原 `count_key` 结构和 Map 映射；
- 分别计算 `count(*)` 与 `count(distinct pairing id)`；
- target 扫描只读取 materialized boolean，不重新执行叶子条件。

### 5.6 SQL 安全测试

按照 `docs/modules/database/generated-sql-safety-standard.md` 验证：

- 动态值全部参数化；
- schema 校验不变；
- alias 只来自服务端稳定序号；
- 0、1、7、20 条 properties 均生成合法 SQL；
- period/local-origin expression 在最终 SQL 只出现在 candidate 阶段；
- 每个 leaf condition 只出现在 evaluated 阶段一次；
- 目标表达式只引用 `match_N`；
- PostgreSQL fixture/结构校验 PASS；
- 远端 `EXPLAIN`/最小只读执行 PASS。

## 6. 阶段四：接入 `countCurrentRules`

### 6.1 修改文件

- `pbs-server/src/services/pairing-search/pairing-search-service.ts`
- `pbs-server/src/services/pairing-search/pairing-search-service.test.ts`

### 6.2 实施内容

保持现有：

```text
rowProperties = 所有 existing properties
activeTierProperties = 当前 tier active properties
```

构造稳定 property key → `match_N` 映射：

- key 优先为 trimmed `propertyGroupKey`；
- 缺失时继续使用 `row-<rowSeq>`；
- row target 引用单个 `match_N`；
- funnel target 使用共享组合器，对当前 prefix 的 properties 生成 `match_N` AND/OR 表达式。

调用新的 current-rules 专用 count query，响应映射保持当前代码不变。

### 6.3 兼容测试

- 无 properties：不查 DB，返回当前空响应；
- 有 rows、当前 Tx 无 active：rows 有独立 rule counts、funnel 使用当前 empty fallback、`allRules: null`；
- 其他 Tx property 出现在 rows 但不进入当前 funnel；
- 当前 Tx properties 顺序决定 funnel；
- `summary.allRules` 等于最后 active funnel；
- `pairingIdCount` 与 `totalItems` 分开保持；
- unsupported/conflict 状态码不变；
- cache key、TTL、cache hit 和 20 并发 identical single-flight tests 不变；
- Redis 失败继续回源 DB。

## 7. 阶段五：新旧语义一致性证明

### 7.1 双版本方式

不在生产代码保留 legacy SQL。使用两个独立运行实例连接同一远端只读数据源：

- 基线实例：当前提交版本，在独立端口运行；
- 新实例：工作树优化版本，在另一独立端口运行。

对相同 actor 和相同业务 payload 调用两个实例。为避免结果缓存干扰，分别使用合法 UUID `propertyGroupKey`，并在比较时按 `rowSeq/propertyCode` 对齐，忽略仅用于标识的 UUID 和 `computedAt`。

### 7.2 必测组合

- 用户 19 当前 7 条 properties / T1；
- Award / Avoid；
- multi-use OR；
- forced OR；
- 跨组 AND；
- Any / Every；
- Specific Dates / Date Range；
- 其他 Tx rows；
- 当前 Tx 无 active；
- 0 匹配结果；
- 20 条代表性合法 conditions。

逐项比较：

- row 顺序、rowSeq、propertyCode、name；
- rule `pairingIdCount/totalItems`；
- funnel `pairingIdCount/totalItems`；
- activePropertyCount；
- allRules。

任何数字不一致都必须停止性能验收并修复语义差异。

## 8. 阶段六：性能与并发验收

### 8.1 用户 19 当前请求

- 使用新的 UUID propertyGroupKey 保证 result cache miss；
- 记录 HTTP 端到端 duration；
- 要求低于 10 秒，目标低于 5 秒；
- 记录新 `EXPLAIN (ANALYZE, BUFFERS)` 并与阶段一比较。

### 8.2 20 条条件基线

对完全相同业务条件、仅 propertyGroupKey 不同的 payload 连续执行 5 次应用冷缓存请求：

- 报告全部 5 个原始 duration；
- 排序后第 3 个为 median，要求 `< 8s`；
- 最大值要求 `< 10s`；
- 每次必须 HTTP 200；
- 不以 Redis result hit 作为样本。

### 8.3 并发 single-flight

- 生成一个新的合法冷 key；
- 5 个真实会话或 5 个 API 请求通过 barrier 同步起跑；
- 5 个请求 payload 完全相同；
- 验证底层 count SQL 只执行一次；
- 每个请求在 10 秒内 HTTP 200；
- 不出现 500、timeout 或 aborted。

## 9. 阶段七：真实 Portal Playwright 与 QA

### 9.1 修改/新增文件

- `e2e/tests/pbs-portal/pairing-search.spec.ts`
- `docs/test-cases/pbs/pairing/2026-07-21-current-rules-counts-performance.md`

### 9.2 Playwright 场景

更新 PBS-3200 或新增不冲突的 PBS-3xxx case：

1. 使用真实用户 19 登录。
2. 进入 `/pbs/bid`，停在真实 Bid workspace。
3. 点击 `REFRESH`。
4. 捕获页面真实发出的 counts request/response。
5. 断言 HTTP 200 且 response contract 正确。
6. 断言 summary 显示当前 T1、规则数和匹配 Pairing 数。
7. 断言不出现 `Try refresh again` 和错误样式。
8. 记录响应 duration，要求低于 10 秒。

并发性能主要由后端集成测试/诊断 harness 验证，Playwright 至少覆盖一个真实用户完整交互，避免用 API-only 测试冒充 UI 回归。

### 9.3 QA 文档

记录：

- 前置用户/周期/条件数量；
- 冷缓存构造方式；
- 单会话和并发步骤；
- 预期 HTTP、页面状态和性能门槛；
- 如何确认 counts 数字与 SEARCH PAIRINGS 语义一致。

## 10. 阶段八：完整验证与交付检查

按最小到完整顺序运行：

```bash
# focused condition/query/service tests
cd pbs-server
npm test -- <focused pairing-search tests>

# 后端完整验证
npm test
npm run build

# Portal/E2E
cd ../e2e
PBS_TEST_USER=19 PBS_TEST_PASS=rois \
  npx playwright test -c config/playwright.config.ts \
  --project=pbs-portal tests/pbs-portal/pairing-search.spec.ts \
  --grep '<counts regression case>' --workers=1 --reporter=line

# 仓库检查
cd ..
git diff --check
```

若实际 npm test 不支持文件过滤，使用项目当前 Vitest/node:test 的精确命令替代，并在最终回执中列出。

前端产品 CSS 不在本任务范围；若没有修改前端样式，不需要以 `check:ui` 冒充相关验证。若实际触碰 Portal 样式，则必须补跑 `npm run check:ui`。

提交前必须：

- 运行 GitNexus `detect_changes({scope: "compare", base_ref: "main"})` 或等价 CLI；
- 确认只影响 current-rules counts、共享组合器和测试流程；
- 单独列出当前工作树原有日历 popover 改动，不能混入本任务提交；
- 仅在用户明确要求后暂存/提交。

## 11. 预期修改清单

预计修改：

- `pbs-server/src/services/pairing-search/pairing-search-condition-builder.ts`
- `pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts`
- `pbs-server/src/services/pairing-search/pairing-search-preview-query.ts`
- `pbs-server/src/services/pairing-search/pairing-search-service.ts`
- `pbs-server/src/services/pairing-search/pairing-search-service.test.ts`
- `e2e/tests/pbs-portal/pairing-search.spec.ts`
- `docs/test-cases/pbs/pairing/2026-07-21-current-rules-counts-performance.md`

仅当 focused test 边界需要时新增一个专用 query test 文件。不预计修改：

- `packages/contracts/*`
- `pbs-portal` 产品代码
- `sql/schema/*`
- `sql/migration/*`
- Redis/cache helper

## 12. 完成定义

只有同时满足以下条件才算完成：

- 新旧所有业务 count 一致；
- 用户 19 真实请求不再超过 10 秒；
- 20 条代表性 conditions 的 5 个冷样本 median < 8 秒且 max < 10 秒；
- 5 并发相同冷请求全部在 10 秒内成功，底层 SQL 只执行一次；
- Portal timeout 未修改；
- focused/full backend tests、build、真实 DB SQL、HTTP smoke、Playwright 全部 PASS；
- GitNexus impact/detect_changes 完成；
- 未覆盖或混入当前工作树的无关改动。

## 13. 实施结果回执

- 用户 19 真实 7 条规则：5 个 application-cold 样本 `3.603 / 3.633 / 3.636 / 3.662 / 3.947 秒`，原捕获的 rule/funnel/summary 数字完全一致。
- 20 条代表性重条件：5 个 application-cold 样本 `5.897 / 5.915 / 5.924 / 6.006 / 6.343 秒`，median `5.924 秒`，max `6.343 秒`。
- 5 个完全相同的冷 key 并发请求全部在 10 秒内 HTTP 200。
- 真实 `/pbs/bid` UI 登录用户 19 后，counts 请求 HTTP 200，页面未显示 `Try refresh again`。
- 动态 SQL 结构/coverage 门禁 PASS；远端 PostgreSQL 90 个合法生成 SQL case 全部 `EXPLAIN` PASS。
- 未修改 Portal timeout、API contract、数据库 schema/migration 或 tier-pools 通用查询。
