# PBS Pairing 单条件 PREVIEW 实施计划

对应规格：

`docs/superpowers/specs/2026-07-21-pbs-pairing-single-property-preview-design.md`

## 实施边界

- 只修改 Pairing 行级单 Property PREVIEW 及其共享 Property 叶子语义。
- 不修改 Current Rules 的 AND/OR 分组结构。
- 不修改算法导出、数据库 Schema 或页面视觉。
- 冻结范围为规格中的 11 个可见 Pairing Property Code：`102, 103, 107, 110, 112, 116, 117, 122, 129, 163, 168`。
- 未经用户明确命令，不执行任何 Git 暂存、提交、历史修改或推送操作。

## Task 1：建立基线和影响范围

目标：在修改前固定调用链、catalog 和当前失败证据。

步骤：

1. 读取并核对以下模块规则和测试：
   - `pbs-server/CLAUDE.md`
   - `pbs-portal/AGENTS.md`
   - `docs/modules/pbs/pairing-condition-ui-standard.md`
   - `docs/modules/database/generated-sql-safety-standard.md`
2. 再次只读查询远端 `f8_pbs.pbs_bid_property`，确认可见 Pairing catalog 仍等于冻结的 11 codes；不一致则暂停并报告。
3. 用 GitNexus 对准备修改的每个函数执行 upstream impact analysis；HIGH/CRITICAL 时先报告，不直接修改。
4. 运行现有基线测试并记录结果：
   - Pairing search service
   - condition builder
   - generated SQL preflight/coverage
   - Portal pairing page/search page/service
   - Pairing Search Playwright
5. 为当前错误行为建立最小失败测试，禁止先改实现再补测试。

## Task 2：Portal 行级 PREVIEW 使用明确的 single-property 请求

目标文件：

- `pbs-portal/src/shared/services/pairing-service.ts`
- `pbs-portal/src/features/pairing/pages/search-pairings-page.tsx`
- `pbs-portal/src/features/pairing/components/pairing-right-panel.tsx`（仅在 mapper/state 需要时）
- 对应 `*.test.ts(x)`

步骤：

1. 新增 `previewSingleProperty` service 方法，使用现有 `/api/pairing-search/preview` 的 `property` payload 分支。
2. Search Pairings 页面识别来自行级 PREVIEW 的 state，首次加载、翻页和刷新均调用 single-property 方法。
3. 保留完整：`propertyCode`、`name`、`action`、`quantifier`、`bid` 和 periodCode。
4. 行级 PREVIEW 不再伪装成只有一项的 `criteria` 请求。
5. 用户在 Search Pairings 页面主动增加 Criteria 后，继续走既有 Criteria 流程；不改变自由搜索功能。
6. 单元测试断言：
   - 初次请求只有一个 Property；
   - 不发送 `criteria.properties[]`；
   - Award/Avoid、Any/Every、日期和时间参数无损；
   - 翻页和刷新保持同一 Property；
   - draft periodCode 必须传入。

## Task 3：单 Property 的严格 Crew eligible pool

目标文件：

- `pbs-server/src/services/pairing-search/actor-base.ts`
- `pbs-server/src/services/pairing-search/pairing-search-service.ts`
- `pbs-server/src/services/pairing-search/pairing-search-preview-query.ts`
- 必要时新增一个职责单一的 eligibility SQL helper
- 对应测试

步骤：

1. single-property 分支强制要求合法 periodCode；缺失或无效返回 400，不使用当前月份 fallback。
2. Rank 使用 `f8_pbs.pbs_user.rank`，为空返回明确错误。
3. eligible pool 查询按每个 Pairing 的 Base 当地 origin date 匹配 `f8.crew_base`：
   - `eff_dt < local_day_end_utc`
   - `exp_dt IS NULL OR exp_dt >= local_day_start_utc`
   - 排序 `is_prime_base DESC, eff_dt DESC, id DESC`
   - `pairing.base = resolved crew_base.base`
4. Base airport 必须有合法 IANA zone；缺失 Base/zone 的日期排除对应 Pairing，整个周期无任何有效 Base 日时返回 400。
5. Pairing 必须存在 `pairing_composition.is_deleted=0 AND acting_rank=actorRank`。
6. 排除已删除/取消以及缺少全局 origin/start、无法判断 Base/Period 的 Pairing。
7. 使用 Base 当地日期应用 Bid Period 首末日，不能直接比较 UTC date。
8. 通过 SQL join/lateral 一次完成，不允许逐 Pairing N+1。
9. 测试覆盖：
   - `pbs_user.base` 与 `crew_base` 不一致；
   - 月内 Base 变更；
   - Base 有效期缺口；
   - Base timezone 缺失；
   - Rank 匹配/不匹配/为空；
   - 周期首末日、跨午夜和 DST；
   - 删除/取消 Pairing。

## Task 4：统一 Award/Avoid 与 NULL 补集语义

目标文件：

- `pbs-server/src/services/pairing-search/pairing-search-condition-builder.ts`
- Property condition helper 和测试

步骤：

1. 每个正条件统一产生确定的 boolean：Property 专属字段/事件缺失时为 `false`。
2. Award 使用正条件。
3. Avoid 使用 eligible pool 内的严格 `NOT(positiveCondition)`。
4. 防止 PostgreSQL `NULL` 造成 Award/Avoid 两边同时遗漏。
5. 对所有支持 Avoid 的 Property 建立集合测试：
   - 交集为空；
   - 并集等于 eligible pool；
   - 含 NULL/缺事件样例仍满足。
6. Any/Every：
   - Any 至少一个有效元素满足；
   - Every 必须存在适用元素，且不存在不满足元素；
   - 空集合为 false。

## Task 5：逐 Property 修复和验证矩阵

目标文件：

- `pbs-server/src/services/pairing-search/pairing-search-core-conditions.ts`
- `pbs-server/src/services/pairing-search/pairing-search-time-conditions.ts`
- `pbs-server/src/services/pairing-search/pairing-search-detail-conditions.ts`
- `pbs-server/src/services/pairing-search/generated-sql-preflight-*.ts`
- 对应测试

按以下顺序实施，每一组先写失败测试，再做最小修改：

1. **直接身份类**：102 Pairing Preference。
2. **时间类**：103 Check-In/Check-Out、129 Time Between Flights。
3. **Duty/计数类**：107 Flight Legs per Duty。
4. **日期/工作日类**：110 Work Day Preference。
5. **Pairing 长度类**：112 当前 `pairing-length-preference`，以及历史 `stepper` / `stepper-range`。
6. **航班/特殊飞行类**：116 Flight Number、117 Redeye、122 Deadhead。
7. **月末类**：163 Month-End Carryover。
8. **机场/Layover 类**：168 Airport Preference。

每个 Property 必须覆盖规格表中列出的 payload 变体，并明确：

- 时间使用哪个机场的 IANA zone；
- 日期使用 Pairing、Duty、Segment 还是事件日期；
- `Between` 端点；
- Award/Avoid；
- Any/Every（适用时）；
- 缺事件/NULL；
- 远端独立 oracle SQL。

共享叶子正确性修复允许同步作用于 Current Rules 和自由 Criteria，但必须证明 AND/OR 组合结构未改变。

## Task 6：缓存、分页和结果一致性

目标文件：

- `pbs-server/src/services/pairing-search/pairing-search-service.ts`
- `pbs-server/src/services/pairing-search/pairing-search-preview-query.ts`
- 对应测试

步骤：

1. single-property Preview 使用新缓存语义版本，隔离旧结果。
2. 单 Property Base 历史按请求参与 SQL，不复用只含单一 Base 的 actor-context 缓存。
3. 缓存 key 包含：Crew ID、Rank、periodCode、完整 Property、page、pageSize、排序版本和语义版本。
4. 保留 30 秒 TTL 和 stampede protection；用可控时钟验证最多 30 秒陈旧窗口。
5. 排序固定：
   - `local_origin_date ASC`
   - `sch_str_dt_utc ASC`
   - `pairing_label ASC NULLS LAST`
   - `pairing.id ASC`
6. 在静态数据测试中遍历全部页面，验证：
   - 无重复；
   - 无遗漏；
   - 合并 ID 数等于 summary pairingIdCount；
   - summary 与 page rows 来自同一过滤表达式。

## Task 7：远端 PostgreSQL oracle 验收

步骤：

1. 为 11 个 Property 分别选择有真实数据的 Crew、Bid Period 和条件。
2. 独立编写只读 oracle SQL，不能直接复制生产 condition builder 的输出作为期望值。
3. 分别计算：
   - eligible pool IDs；
   - Award IDs；
   - Avoid IDs。
4. 遍历 PREVIEW 全部分页并比较完整 ID 集和总数。
5. 记录每个 Property：基础池数量、Award 数量、Avoid 数量、交并集校验、PASS/FAIL。
6. 对所有新增/修改动态 SQL 执行远端 `EXPLAIN` 或最小只读执行，禁止静默跳过。

## Task 8：Playwright 与 QA

目标文件：

- `e2e/tests/pbs-portal/pairing-search.spec.ts` 或同模块现有 Playwright 测试
- `docs/test-cases/pbs/pairing/2026-07-21-single-property-preview.md`

步骤：

1. 使用真实 Portal 从 Pairing 行点击 PREVIEW。
2. 验证请求为 single-property 且只含该 Property。
3. 覆盖代表性条件族、Award/Avoid、Any/Every、时间边界、翻页和返回。
4. 验证错误提示：缺 period、缺 Rank、无有效 Base、无效 payload。
5. 编写 QA 人工测试案例，覆盖 11 个 Property、边界和回归范围。

## Task 9：最终回归与交付

建议按最小范围到完整范围执行：

```bash
cd pbs-server
npx vitest run src/services/pairing-search/pairing-search-condition-builder.test.ts
npx vitest run src/services/pairing-search/pairing-search-service.test.ts
npx vitest run src/services/pairing-search/generated-sql-preflight.test.ts
npm run test:generated-sql-coverage
npm test
npm run lint
npm run build

cd ../pbs-portal
npm test -- --run src/shared/services/pairing-service.test.ts
npm test -- --run src/features/pairing/pages/search-pairings-page.test.tsx
npm test -- --run src/features/pairing/pages/pairing-page.test.tsx
npm test
npm run lint
npm run build

cd ..
npm run verify:pbs
```

再运行目标 Playwright 和远端 oracle 验收。

交付前：

1. 运行 `git diff --check`。
2. 运行 GitNexus `detect-changes`，确认影响范围只包含预期 Pairing Preview 流程。
3. 报告所有命令的 PASS/FAIL、未运行项、阻塞和剩余风险。
4. 不执行 Git 提交；只有用户再次明确要求时才进行 Git 操作。

## Multi-Agent 执行评估

- Recommendation: No
- Rationale: 11 个 Property 共享 eligible pool、时间表达式、condition dispatcher、generated SQL coverage 和 Preview query；并行编辑冲突风险高。
- Suggested split: 单线按 Task 1 至 Task 9 实施。
- Write boundaries: `pbs-server/src/services/pairing-search/**`、必要的 Portal 行级 Preview 文件、目标 E2E 和 QA 文档。
- Conflict risk: 中高。
- Execution gate: 用户审核本计划并明确批准开始实现后，才能修改业务代码。
