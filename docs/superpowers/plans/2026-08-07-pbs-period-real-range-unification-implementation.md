# PBS Period 真实范围统一实施计划

对应已批准设计：

- `docs/superpowers/specs/2026-08-07-pbs-period-real-range-unification-design.md`

## 实施目标

将 PBS 全部运行时日期消费者从“解析 `periodCode` 得到自然月”切换为 Live `roster_period` 的真实 Context：

```text
rosterPeriodId
rosterPeriodKey
periodCode（仅展示）
rpStartLocal
rpEndLocal（包含结束日）
```

本期覆盖：Current Period、Pairing Search、Days Off、Reserve、Dashboard、Credit/Profile、算法导出和 PBS Portal 日历/日期控件。

## 已确认边界

- 不新增数据库字段，不修改历史 `periodCode`。
- 不实现 Award Final 或 mis-award。
- 不保留自然月 fallback；缺失 Context、无效范围或越界日期直接报错。
- Pairing 按 `pairing.base -> airport.zone_id` 下的 local origin date 归属 RP。
- Pairing 从 RP 内开始后允许 carry-out；RP 前开始但延伸进入 RP 的 Pairing 不属于当前 RP。
- Days Off、Reserve 日期条件必须逐日位于真实 RP 内。
- 算法文件格式不变，只修正生成范围和匹配语义。
- 如果三库核查发现必须修数据，停止应用实现并单独提交数据修复方案；本计划不授权写库。
- 不自动提交 Git；只有用户在实施阶段明确授权时才提交。

## 任务 0：影响分析与消费者冻结

只读检查：

- GitNexus 对准备修改的 resolver、共享日期函数、Pairing Search builder、导出入口和 Portal mapper 逐个执行 upstream impact。
- GitNexus 返回 HIGH/CRITICAL 时先向用户报告，不直接编辑。
- 全仓搜索：

```bash
rg -n "parsePeriodMonth|isIsoDateInPeriod|buildPeriodMonthRange|parsePeriodMonthStart" \
  pbs-server/src pbs-portal/src packages/contracts
rg -n "Date.UTC\([^\n]*month|interval '1 month'|durationDays|periodCode" \
  pbs-server/src/services pbs-portal/src/features packages/contracts
```

输出：

- 按 Backend query、validation、export、Portal、test/fixture、script 分类的消费者清单。
- 标记可以保留的通用公历工具与必须删除的运行时自然月推算。
- 记录每个待修改 symbol 的 blast radius 和对应测试。

完成条件：

- 消费者清单覆盖设计 §9.2。
- 没有未分类的运行时 `periodCode -> month range` 路径。

## 任务 1：冻结 Period Context 与 fail-fast 合同

主要修改：

- `packages/contracts/pbs-current-period.d.ts`
- `packages/contracts/pbs-search-pairings.d.ts`
- `packages/contracts/pbs-reserve-bids.d.ts`
- `packages/contracts/pbs-dashboard-summary.d.ts`
- `packages/contracts/pbs-dashboard-profile.d.ts`
- `packages/contracts/pbs-algorithm-export.d.ts`
- `pbs-server/src/services/lineholder/shared-types.ts`
- `pbs-server/src/services/lineholder/current-bid.ts`
- 对应 contract test、route test、`current-period-bid.test.ts`

实施：

1. 新增或收紧日期型 `PbsRosterPeriodContext`，其中以下字段必填：
   - `rosterPeriodId`
   - `rosterPeriodKey`
   - `rpStartLocal`
   - `rpEndLocal`
2. Current Bid resolver 从同一条 `roster_period` 返回完整 Context。
3. 日期消费者必须先通过类型守卫取得完整 Context；不得直接使用通用 `PbsCurrentPeriod` 的可空字段。Standing Bid 的 synthetic context 保持独立，本期不强制其具备真实 RP id。
4. 增加统一错误类型/错误标识：
   - `PERIOD_CONTEXT_REQUIRED`
   - `PERIOD_NOT_FOUND`
   - `PERIOD_RANGE_INVALID`
   - `DATE_OUTSIDE_ROSTER_PERIOD`
   - `PAIRING_BASE_TIMEZONE_REQUIRED`
5. 只携带 `periodCode` 的日期型入口 fail-fast；不返回空数据或自然月结果。
6. Current Bid 草稿必须通过 `pbs_bid.roster_period_id` 与 Context 精确匹配；`period_code` 仅保留展示。

测试先行：

- `periodCode="Feb 2026"`，但 Context 为 `2026-01-31～2026-03-01`，断言 Context 原样返回。
- `rosterPeriodId`、`rosterPeriodKey` 或日期缺失时失败。
- `rpStartLocal > rpEndLocal` 时失败。
- 只传 `periodCode` 的日期请求返回 `PERIOD_CONTEXT_REQUIRED`。

Focused 验证：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
DATABASE_URL=postgresql://test:test@localhost:5432/rois \
node --import tsx --test \
  src/services/lineholder/current-period-bid.test.ts \
  src/routes/pairing-search.test.ts \
  src/routes/reserve-bids.test.ts \
  src/routes/dashboard-summary.test.ts \
  src/routes/dashboard-profile.test.ts \
  src/routes/algorithm-export.test.ts
```

## 任务 2：共享真实范围与 Pairing local-origin 工具

主要修改：

- `pbs-server/src/services/lineholder/date-utils.ts`
- `pbs-server/src/services/pairing-search/pairing-local-date-sql.ts`
- 新增或扩展专用 Period Context/范围测试。

实施：

1. 新增纯函数 `isIsoDateInRange(value, rpStartLocal, rpEndLocal)` 和包含式天数计算。
2. 删除运行时对 `isIsoDateInPeriod(value, periodCode)` 的依赖；确认无调用后再删除旧业务函数。
3. Pairing local origin 固定复用最早 duty/brief/segment start。
4. 时区固定来自 `pairing.base -> airport.zone_id`。
5. 删除 Pairing 日期 SQL 中 `coalesce(zone_id, 'UTC')` fallback；缺失 Base/合法 IANA 时区必须暴露错误。
6. SQL date 参数使用 `YYYY-MM-DD`，末日采用 `<= rpEndLocal` 或 `< rpEndLocal + 1 day` 的等价形式。

测试先行：

- 日期范围首尾均合法，前一天/后一天非法。
- 30、31 天和跨月范围的包含式天数正确。
- Pairing Base 为 YYZ/YVR 时按对应 `airport.zone_id` 计算 origin date。
- 缺失 Pairing Base/时区时失败，不回退 UTC。

## 任务 3：迁移 Pairing Search 全链路

主要修改：

- `pbs-server/src/services/pairing-search/pairing-search-service.ts`
- `pbs-server/src/services/pairing-search/pairing-search-preview-query.ts`
- `pbs-server/src/services/pairing-search/pairing-occurrence-query.ts`
- `pbs-server/src/services/pairing-search/pairing-id-search-query.ts`
- `pbs-server/src/services/pairing-search/pairing-number-filter-options-query.ts`
- `pbs-server/src/services/pairing-search/pairing-search-core-conditions.ts`
- `pbs-server/src/services/pairing-search/pairing-search-detail-conditions.ts`
- `pbs-server/src/services/pairing-search/pairing-search-time-conditions.ts`
- `pbs-server/src/services/pairing-search/pairing-search-condition-context.ts`
- `pbs-server/src/services/pairing/pairing-property-validation.ts`
- `pbs-server/src/services/calendar/bidding-calendar-service.ts`
- 相关 route/service/generated-SQL tests。

实施：

1. 删除 `buildPeriodRange(periodCode)`，改为接收已验证 Context。
2. Preview、count、pagination、IDs/numbers、occurrences、details、filter options 全部使用同一 `rpStartLocal/rpEndLocal`。
3. Pairing pool 按 local origin date 归属，不使用 segment 范围相交。
4. Pairing A：origin=`2026-03-01`、release=`2026-03-02`，保留并展示 carry-out。
5. Pairing B：origin=`2026-01-30`、release=`2026-01-31`，从 RP2 排除。
6. Month-End Carryover 以 `rpEndLocal` 计算超出日数。
7. 用户输入日期范围超出 RP 时返回 `DATE_OUTSIDE_ROSTER_PERIOD`，不静默裁剪。
8. 更新 generated SQL preflight fixture 和远端 SQL 验证入口。

Focused 验证：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
DATABASE_URL=postgresql://test:test@localhost:5432/rois \
node --import tsx --test \
  src/services/pairing-search/pairing-search-service.test.ts \
  src/services/pairing-search/pairing-search-condition-builder.test.ts \
  src/services/pairing-search/efficient-flying-query-integration.test.ts \
  src/services/pairing-search/generated-sql-preflight.test.ts \
  src/routes/pairing-search.test.ts
npm run test:generated-sql-coverage
npm run verify:generated-sql
```

远端数据库验证：

- 对普通自然月 RP 和特殊 RP 执行相同查询的 `EXPLAIN`。
- 核对结果/选项数量/分页总数/preview count 一致。
- 验证 Pairing Base 时区缺失能被 fixture 发现，不把业务库异常伪装为空结果。

## 任务 4：迁移 Days Off、Reserve、Dashboard 与 Credit/Profile

主要修改：

- `pbs-server/src/services/days-off/days-off-validation.ts`
- 必要的 Days Off service/mappers。
- `pbs-server/src/services/reserve/reserve-coverage-service.ts`
- `pbs-server/src/services/reserve/reserve-validation.ts`
- `pbs-server/src/services/dashboard-summary/dashboard-summary-service.ts`
- `pbs-server/src/services/dashboard-profile/dashboard-profile-service.ts`
- 对应 route/service tests。

实施：

1. Days Off 的 Specific Dates、Date Range、Weekend/Day-of-week 展开使用真实 RP。
2. 任一日期越界时保存/导出整体失败；旧草稿不自动移动或删除日期。
3. Reserve Coverage 的 calendar/manday daily 查询使用 `[rpStartLocal, rpEndLocal]`。
4. Reserve daily 只返回 RP 内日期，首尾日均包含。
5. Dashboard pairing/fleet count 按 Pairing local origin date 查询。
6. Dashboard 删除 `buildPeriodMonthRange(periodCode)`。
7. Credit/Profile 使用 Context 的 `rosterPeriodKey` 精确连接 Manday period 表，删除 `periodCode -> YYYYRPnn` 拼接。
8. 当前用户 Base/Division 或 Period Context 缺失时使用持续可理解的业务错误，不返回带 warnings 的空成功结果掩盖配置错误。

Focused 验证：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
DATABASE_URL=postgresql://test:test@localhost:5432/rois \
node --import tsx --test \
  src/services/days-off/days-off-validation.test.ts \
  src/services/days-off/days-off-bid-service.test.ts \
  src/services/reserve/reserve-coverage-service.test.ts \
  src/services/reserve/reserve-validation.test.ts \
  src/services/dashboard-summary/dashboard-summary-service.test.ts \
  src/services/dashboard-profile/dashboard-profile-service.test.ts \
  src/routes/days-off-bids.test.ts \
  src/routes/reserve-bids.test.ts \
  src/routes/dashboard-summary.test.ts \
  src/routes/dashboard-profile.test.ts
```

## 任务 5：迁移算法导出

主要修改：

- `pbs-server/src/services/algorithm-export/algorithm-export-service.ts`
- `pbs-server/src/services/algorithm-export/pairing-score-export.ts`
- `pbs-server/src/services/algorithm-export/line-rules-export.ts`
- `pbs-server/src/services/algorithm-export/reserve-score-export.ts`
- `pbs-server/src/services/algorithm-export/days-off-export.ts`（审计后按需）
- `pbs-server/src/services/algorithm-export/*test.ts`
- `pbs-server/src/routes/algorithm-export.test.ts`
- 诊断 seed script 仅在仍参与验证时同步新合同。

实施：

1. Current/Scenario export 以 `rosterPeriodId` 加载 Context；`periodCode` 仅作为文件/内容标签。
2. 删除 `parsePeriodMonthStart`、`getBidMonthDayCount` 和自然月 `buildPeriodRange` 依赖。
3. PAIRING_SCORE pool 按 Pairing local origin date 归属，并保留 carry-out segments。
4. LINE_RULES 周期天数使用 `rpEndLocal - rpStartLocal + 1`。
5. Reserve `whole_month` 内部解释为整个真实 RP。
6. `first_half` 为 RP 序号第 1～15 天；`second_half` 为第 16 天至 RP 末日。
7. 日期 property 越界时停止整个导出，返回 crew/tier/property/date 的可诊断信息；不生成部分成功压缩包。
8. 不新增算法 CSV 字段，不修改 engine 项目。

Focused 验证：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
DATABASE_URL=postgresql://test:test@localhost:5432/rois \
node --import tsx --test \
  src/services/algorithm-export/algorithm-export-service.test.ts \
  src/services/algorithm-export/pairing-score-export.test.ts \
  src/services/algorithm-export/line-rules-export.test.ts \
  src/services/algorithm-export/reserve-score-export.test.ts \
  src/services/algorithm-export/days-off-export.test.ts \
  src/routes/algorithm-export.test.ts
```

文件核验：

- 对相同 fixture 解压导出包，逐项核对 `PAIRING_SCORE.csv`、`LINE_RULES.csv`、`RESERVE_SCORE.csv`。
- 普通 Jun RP 输出保持业务等价。
- 特殊 RP 包含 Jan 31 / Mar 1 范围，且不包含错误归属 Pairing。

## 任务 6：迁移 PBS Portal Context、日期控件与日历

主要修改：

- `pbs-portal/src/features/dashboard/bidding-calendar-mappers.ts`
- Dashboard 共享 calendar/state/query 文件。
- `pbs-portal/src/features/pairing/components/pairing-detail-card.tsx`
- Pairing Search 页面数据/query key/日期筛选文件。
- Days Off、Reserve 页面日期控件和 validation 文件。
- Award mapper 只做审计：若仍从 `periodCode` 构造日历范围则切换；不修改 Award 生命周期。
- 对应 Portal Vitest。

实施：

1. 所有相关 query key 加入 `rosterPeriodId`。
2. 日期控件 min/max 使用 `rpStartLocal/rpEndLocal`。
3. 共享 Bidding Calendar 绘制真实 RP 连续 7 列网格，首尾仅为布局补齐 muted 日期。
4. 跨月边界显示月份标识；标题展示 `periodCode` 和真实日期范围。
5. Pairing mini-calendar 显示合法 carry-out active dates，并把 RP 外日期标记为 muted/carry-out。
6. Context 缺失或请求失败时使用可访问的页面级错误状态；禁止自然月 placeholder 和旧结果闪现。
7. 不在左侧 Bidding Calendar 创建下一 RP 的 C/O Off 占位。

Focused 验证：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal
npx vitest run \
  src/features/dashboard/bidding-calendar-mappers.test.ts \
  src/features/dashboard/components/dashboard-left-panel.test.tsx \
  src/features/dashboard/pages/dashboard-page.test.tsx \
  src/features/days-off/pages/days-off-page.test.tsx \
  src/features/reserve/pages/reserve-page.test.tsx \
  src/features/pairing/pages/search-pairings-page.test.tsx
npm run lint
```

Playwright：

- 新增 `e2e/tests/pbs-portal/period-real-range.spec.ts`。
- 使用真实页面覆盖普通 RP、`2026-01-31～2026-03-01`、carry-out、日期越界、Context 错误和切换 Period 不显示旧数据。

```bash
cd /Users/lei/Codehub/rois-ai/e2e
npx playwright test tests/pbs-portal/period-real-range.spec.ts \
  --config=config/playwright.config.ts --project=pbs-portal --reporter=list
```

## 任务 7：QA 文档与三环境只读核查

新增：

- `docs/test-cases/pbs/period/2026-08-07-period-real-range-unification.md`

QA 至少覆盖：

- RP1 `01-01～01-30`。
- RP2 `01-31～03-01`。
- RP3 `03-02～03-31`。
- 4 月后的自然月。
- Pairing origin/carry-out 两个边界样本。
- Pairing Search、Days Off、Reserve、Dashboard、Credit 和算法导出交叉一致性。
- 缺失 Period 关联、非法日期范围、Pairing Base 时区缺失和日期越界错误。

DEV/SIT/UAT 只读核查：

- `roster_period` 五个核心字段完整。
- 测试用 `pbs_bid.roster_period_id` 可唯一关联。
- Manday period 业务键与主表一致。
- 特殊 RP 边界一致。

如果发现必须写库的数据问题：

1. 停止后续实施/验证。
2. 输出环境、表、行数和影响范围，不输出敏感连接信息。
3. 单独设计幂等 migration/修复脚本并请求批准。

## 任务 8：全量验证与交付检查

按由小到大顺序：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
npm test
npm run build

cd /Users/lei/Codehub/rois-ai/pbs-portal
npm test
npm run lint
npm run build

cd /Users/lei/Codehub/rois-ai
npm run check:ui
npm run verify:pbs
```

此外必须：

- 远端 PostgreSQL 对修改后的动态 SQL 执行 `EXPLAIN` 或最小只读执行。
- 运行新增 Playwright，并保留命令、PASS/FAIL、耗时和截图回执。
- 全仓重新搜索自然月推算，证明运行时消费者为零。
- GitNexus `detect_changes({ scope: "compare", base_ref: "main" })`，确认变更范围只覆盖本计划。
- `git diff --check`。
- 检查没有新增 migration；如果确实新增，必须有单独批准和三环境执行记录。
- 未经用户当前阶段明确授权，不运行 `git commit`。

## 实施分段与停止点

为了减少跨模块同时损坏，实施按以下门禁推进：

1. Contract/Context 测试通过后，才迁移消费者。
2. Pairing Search 与 generated SQL 通过后，才迁移算法导出。
3. Backend API 合同稳定后，才切换 Portal。
4. Focused tests 全部通过后，才运行完整 PBS 验证。
5. 任一模块发现业务归属与本 spec 冲突，停止并更新 spec，不增加 fallback。

## Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: Context 合同冻结后，后端普通消费者、Pairing Search/算法导出和 Portal/E2E 可以按目录拆分。
- Suggested split:
  - Agent A：任务 1、2、4；拥有 lineholder、days-off、reserve、dashboard-profile、dashboard-summary。
  - Agent B：任务 3、5；拥有 pairing-search、pairing property、calendar backend、algorithm-export。
  - Agent C：任务 6、7 的 Portal/E2E/QA；拥有 pbs-portal、`e2e/tests/pbs-portal/period-real-range.spec.ts` 和新 QA 文档。
- Write boundaries: Agent A 先冻结共享 Context；之后 Agent B/C 只消费，不修改其合同。Agent B 不修改 Portal；Agent C 不修改 PBS Server。
- Conflict risk: Medium。`packages/contracts`、共享 fixture 与 `bidding-calendar-service` 由主 Agent 指定唯一 owner。
- Integration plan: 主 Agent 先完成任务 0/1 的合同与影响分析，再启动并行任务；回收后统一运行任务 8。
- Execution gate: 用户批准本实施计划并明确开始实施后才能启动；开始前再次声明 agent 角色、写入边界和集成顺序。
