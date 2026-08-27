# PBS Efficient Flying Pairing Bid 标准答案对齐实施计划

日期：2026-07-24
依据：
`docs/superpowers/specs/2026-07-24-pbs-efficient-flying-pairing-bid-reference-parity-design.md`

## 实施目标

- 将 `propertyCode = 428` 从 Line 迁移到 Pairing。
- Portal 使用统一 Pairing Preference UI，员工选择
  `Efficient flying / Inefficient flying`。
- 公司百分位从
  `PBS_EFFICIENT_FLYING_CONFIG / PERCENTILE` 读取，默认 20。
- Search Pairings、Current Rules count/page、`pbs-server` 与
  `live-server` 的 `PAIRING_SCORE.csv` 使用相同 cohort 和 cutoff。
- 命中 Pairing 在所选 Tier 的 Award counter 上 `+1`。
- 428 不再进入 `LINE_RULES.csv`。
- 清理旧 Line 428 开发期数据，不兼容旧 flag payload。

## 实施约束

- 修改 symbol 前逐个执行 GitNexus upstream impact。
- HIGH/CRITICAL impact 必须先向用户报告。
- 先建立 contracts 和数据库唯一契约，再并行修改消费者。
- 不改变 `PAIRING_SCORE.csv` 表头。
- 不新增跨请求缓存，不引入 Crew × Pairing N+1。
- UI 使用现有 Pairing editor、`PbsDialogFrame`、`TierToggleGroup`、
  `PreferenceSegmentedControl` 和共享 footer。
- UI 文案使用英文。
- Migration 在本地、SIT、UAT 三个目标库执行前先 dry verification，
  密码只通过环境变量/交互输入，不写入命令记录或文档。
- 不主动提交实现代码；完成后由用户决定 Git 提交。

## Phase 0：影响分析与失败基线

### Task 0.1：GitNexus impact

至少对以下准备修改的 symbols 执行 upstream impact：

- `pbsLineAaPropertyCodes`
- `pbsPairingPropertyCatalog`
- Pairing bid serialize/deserialize 与 validation symbols
- `PairingPropertyConfigDialog`
- `buildPreviewCondition`
- `loadPairingScoreCsv`
- Line 428 entry builder
- 两套 Crew Bid mapper

输出每个 symbol 的风险等级、直接调用方和受影响流程。

### Task 0.2：建立当前失败证据

先运行现有 focused tests，记录当前行为：

- 428 仍属于 Line catalog；
- 428 保存为 flag + Award/Avoid；
- 428 未被 Pairing Search 支持；
- `live-server` 跳过 Line 428；
- `pbs-server` 仍保留 Line 428 entry；
- import mapper 仍输出 Line payload。

不修改测试断言来掩盖旧行为；后续把这些测试更新为新契约。

## Phase 1：Contracts、Catalog 与数据库唯一契约

### Task 1.1：Pairing contract

涉及文件：

- `packages/contracts/pbs-pairing-bids.js`
- `packages/contracts/pbs-pairing-bids.d.ts`
- 必要的 Pairing contract tests

实现：

1. 新增常量 `EFFICIENT_FLYING_PROPERTY_CODE = 428`。
2. 新增 payload：

   ```ts
   {
     type: "efficient-flying-preference";
     mode: "efficient" | "inefficient";
   }
   ```

3. catalog 定义：
   - `bidType = Pairing`
   - `defaultAction = award`
   - `supportedActions = ["award"]`
4. serialize/deserialize round trip 保留 mode。
5. 拒绝旧 `{ type: "flag" }`、非法 mode 和 avoid action。

### Task 1.2：从 Line contract 移除 428

涉及文件：

- `packages/contracts/pbs-line-bids.js`
- `packages/contracts/pbs-line-bids.d.ts`
- Line contract tests

实现：

- 删除 Line catalog 中 428；
- 删除旧 Line default bid/action；
- 保持 property code 428 只在 Pairing contract 中出现。

### Task 1.3：Seed 与 migration

涉及文件：

- `sql/seed/10-pbs-bid-property.sql`
- `sql/seed/01-dictionary.sql`
- 新增
  `sql/migration/2026-07-24-pbs-efficient-flying-pairing-bid.sql`

迁移步骤：

1. 精确定位旧 Line 428 group/condition/favorite/Standing 数据。
2. 删除引用旧 Line 428 的：
   - `pbs_bid_condition`
   - `pbs_bid_group`
   - `pbs_bid_line_favorite`
   - `pbs_bid_property_favorite`
   - Standing context 数据
3. 连续重排受影响 Tier 的 `group_seq`。
4. 重算 `pbs_bid_tier.total_groups`。
5. 更新唯一 catalog 428 为 Pairing + 新 validation JSON。
6. 更新 Pairing/Line recommended order。
7. 幂等 upsert：

   ```text
   PBS_EFFICIENT_FLYING_CONFIG / PERCENTILE = 20
   ```

8. 验证没有旧 flag payload 和 Line 428 残留。

先写 migration structure/fixture tests，再执行任何数据库。

## Phase 2：PBS Server 配置与 Pairing 保存

### Task 2.1：配置 loader

建议新增：

- `pbs-server/src/services/pairing/efficient-flying-config.ts`
- `pbs-server/src/services/pairing/efficient-flying-config.test.ts`

职责：

- 从 dictionary 读取唯一 `PERCENTILE`；
- 只接受整数 `1..50`；
- 缺失/重复/非法返回明确错误；
- 不硬编码运行时 fallback。

### Task 2.2：只读配置 API

涉及文件：

- Pairing bid route/service
- route tests

新增：

```text
GET /api/pairing-bids/efficient-flying-config
```

验证：

- 成功返回 `{ percentile }`；
- 无效配置返回稳定非 200；
- 无 428 的普通接口不依赖该 loader。

### Task 2.3：Pairing validation 与持久化

更新 Pairing bid validation、draft/current/favorite mapper：

- 接受 canonical payload；
- action 规范为 award；
- Tier 必填；
- 新增、编辑、收藏、回读一致；
- 不生成 review-only legacy item。

## Phase 3：统一 Cohort 与 Search Pairings

### Task 3.1：共享 Daily Credit SQL expression

在 `pbs-server` Pairing Search 内建立单一 helper：

1. active segment 按 `duty_seq` 分组；
2. `ORDER BY duty_seq, seg_seq` 取每 duty 第一条；
3. `duty_act_credited_minutes` null 按 0；
4. duty Credit 求和；
5. 除以 `pairing.duration_days`。

用同一 helper替换本任务触达范围内可能重复的 Daily Credit expression，
但不顺带重构其他未触达条件。

### Task 3.2：Cohort builder

建议新增：

- `pbs-server/src/services/pairing-search/efficient-flying-cohort.ts`
- 对应测试

使用 set-based CTE/window query：

- period/scope 先建立全局 FLY cohort；
- `k = max(1, round(n * P / 100))`；
- cutoff 包含并列；
- 其他 Criteria、crew eligibility、count/page 在 cutoff 后应用；
- count/page 共用同一 SQL/参数构造。

覆盖：

- Single Property；
- 组合 Search Criteria；
- Current Rules count；
- Current Rules page；
- 分页前后身份稳定；
- 不按 Crew 重算。

### Task 3.3：live-server 等价 helper

`live-server` 不能 import `pbs-server` 内部实现时：

- 保持 SQL 和参数顺序等价；
- 使用同一 fixture/golden 比较 cohort、cutoff、命中 Pairing；
- 不允许自行选择另一套 Credit source。

## Phase 4：Portal UI 与统一摘要

### Task 4.1：配置 query

在 `pbs-portal/src/shared/services` 增加只读配置请求和 query：

- 仅当 428 editor/summary/search criteria 实际出现时 enabled；
- loading/unavailable 状态稳定；
- 无 428 页面不请求配置。

### Task 4.2：Efficient Flying editor

建议新增：

- `pbs-portal/src/features/pairing/components/efficient-flying-editor.tsx`
- 对应 Vitest

并接入：

- `pairing-property-config-dialog.tsx`
- Pairing new/edit/favorite 路径
- Search Pairings 同一 editor

UI 顺序：

1. `Configure Pairing Bid`
2. `Efficient Flying First`
3. `TIERS · REQUIRED`
4. `PREFERENCE`
5. `Efficient flying / Inefficient flying`
6. 当前公司 `Top/Bottom P%` 说明
7. 共享 footer

配置不可用时禁止保存。

### Task 4.3：统一 summary

更新唯一 formatter，使以下位置一致：

- Existing Bid Properties
- Search Criteria
- Bid detail/review
- Favorite 回显

文案：

```text
Efficient flying · Top 20% by average daily credit
Inefficient flying · Bottom 20% by average daily credit
```

## Phase 5：两套 `PAIRING_SCORE.csv`

### Task 5.1：pbs-server exporter

涉及：

- `pbs-server/src/services/algorithm-export/pairing-score-export.ts`
- focused tests

实现：

- 只有导出范围含 428 时加载配置和 cohort；
- Current、YEG-14 使用各自 period natural-month resolver；
- Scenario 使用现有 explicit window + fallback/buffer resolver；
- band 后应用 per-crew eligibility；
- 命中写 `Tn_Award_Counter + 1`；
- Inefficient 不写 Avoid counter；
- 与其他 Pairing 条件累加。

### Task 5.2：live-server exporter

同步：

- `live-server/src/services/algorithm-export/pairing-score-export.ts`
- focused tests

对同一 fixture 逐项比较：

- cutoff；
- pairing ids；
- crew ids；
- tiers；
- Award counters。

### Task 5.3：彻底移除 Line 428

更新两模块：

- Line validation/catalog/summary；
- line-rules-entry；
- line-rules-metadata；
- line-rules-readme；
- Line Help 和 stale tests。

断言 `LINE_RULES.csv` 永远不输出 428。

## Phase 6：三条导入路径

同步更新：

- `pbs-server` Crew Bid importer；
- `live-server` Crew Bid importer；
- `e2e/utils/npbs` Playwright mapper。

测试采用 spec 映射矩阵：

- 明确正向 → `mode=efficient`；
- 明确低 Daily Credit → `mode=inefficient`；
- `Avoid Efficient Flying First` → 拒绝；
- 含糊文本 → `efficient_flying_mode_ambiguous`；
- 三条路径生成同一 canonical payload。

## Phase 7：数据库执行

### Task 7.1：脚本静态与事务验证

- `git diff --check`
- migration 语法检查；
- 幂等执行 fixture；
- rollback 验证；
- 删除前后 count 与 FK 验证；
- 确认仅影响 428。

### Task 7.2：三个目标库

按顺序执行：

1. 本地连接目标库；
2. SIT；
3. UAT。

每个库执行：

- migration；
- catalog 428 唯一性验证；
- Line 428 数据为 0；
- Pairing 428 catalog 正确；
- dictionary 唯一且为 20；
- Tier `group_seq/total_groups` 一致性查询。

任一环境失败立即停止，不继续下一个环境。

## Phase 8：测试与验收

### Task 8.1：Focused tests

依次运行：

- contracts；
- Pairing config/validation；
- cohort/search；
- Portal editor/summary；
- 两套 Pairing Score exporter；
- 两套 Line Rule exporter；
- 三条 importer。

### Task 8.2：远端 PostgreSQL 只读验证

按 generated SQL safety standard：

- 代表性 period/scenario 结果核对；
- `EXPLAIN (ANALYZE false, COSTS true)`；
- Current/YEG-14/Scenario 三类 window；
- Base/Fleet/Division/Rank scope；
- count/page 使用同一 cohort；
- 无 Crew × Pairing N+1。

### Task 8.3：Playwright

真实 UI 覆盖：

1. Pairing 新增 Efficient；
2. 选择多 Tier；
3. Existing Bid 摘要；
4. 编辑为 Inefficient；
5. Search Pairings 结果；
6. 翻页/组合 Criteria 身份稳定；
7. 删除；
8. Line 分类无 428；
9. config unavailable 禁止保存；
10. 导入 428 可直接编辑。

### Task 8.4：QA 文档

新增：

```text
docs/test-cases/pbs/pairing/2026-07-24-efficient-flying-pairing-bid.md
```

### Task 8.5：模块与总体验证

运行并记录：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal
npm test
npm run lint -- --quiet
npm run build

cd /Users/lei/Codehub/rois-ai/pbs-server
npm test
npm run build

cd /Users/lei/Codehub/rois-ai/live-server
npm test
npm run build

cd /Users/lei/Codehub/rois-ai
npm run check:ui
npm run verify:pbs
git diff --check
node .gitnexus/run.cjs detect-changes --scope compare --base-ref main
```

任何失败必须区分本任务回归、既有失败和外部环境阻塞。

## Multi-Agent 执行方案

Recommendation: Yes

### 顺序

1. 主 Agent 完成 Phase 0 和 Phase 1，固定 contracts。
2. contracts 稳定后并行：
   - Agent A：Portal UI、Vitest、Playwright；
   - Agent B：pbs-server config/cohort/search/export；
   - Agent C：live-server export/import/Line 428 清理。
3. 主 Agent 负责 SQL migration、跨模块 importer 一致性、数据库执行、
   集成测试和最终 diff review。

### 写入边界

- Agent A：`pbs-portal/**`、指定 `e2e/tests/pbs-portal/**`
- Agent B：`pbs-server/**`
- Agent C：`live-server/**`
- 主 Agent：`packages/contracts/**`、`sql/**`、`docs/**`、
  `e2e/utils/npbs/**`

### 冲突风险

- `packages/contracts` 是所有实现的前置条件，禁止并行修改。
- `e2e/utils/npbs` 只由主 Agent 修改。
- 两套 cohort 必须用 golden fixture 验证等价，不能靠代码外观判断。

### Execution gate

用户明确批准本计划并要求开始实施后，才修改非文档文件或执行数据库。

## 完成标准

- 428 只有一个 Pairing 定义。
- UI、保存、搜索、导入、摘要和两套导出使用同一 payload。
- Efficient/Inefficient cutoff 在同一 scope 内稳定。
- 两套 `PAIRING_SCORE.csv` 对同一 fixture 完全一致。
- Inefficient 只增加 Award counter。
- 428 不进入 `LINE_RULES.csv`。
- 三个目标库 migration 与验证完成。
- focused、Playwright、UI gate、build 和必要的 full tests 有 PASS 收据。
- GitNexus impact/detect-changes 无未解释影响。
