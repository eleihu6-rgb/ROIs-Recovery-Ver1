# PBS Bid 条件摘要统一实施计划

## 1. 实施依据

- 已批准 spec：
  - `docs/superpowers/specs/2026-07-23-pbs-bid-summary-unification-design.md`
- 范围：
  - Days Off 2 个条件
  - Pairing 11 个条件
  - Line 6 个条件
- 核心验收：
  - Bid 主页面 `EXISTING BID PROPERTIES` 与 Pairing `SEARCH CRITERIA` 对同一 property 使用同源摘要。
  - Crew `906` 的 `V4507` 显示为 `V4507 ×13`。
  - Crew `906` 的 15 个 Prefer Off 日期默认显示 3 个、`+12 more` 和 `Show all 15 selected`。
  - 不修改 API、数据库、导入数据或 Pairing Search 业务逻辑。

## 2. 工作树保护

实施前：

1. 记录 `git status --short` 和目标文件 diff。
2. 保留并整合当前未提交的 Pairing Length formatter、测试和 PBS-3510 测试改动。
3. 不修改或提交用户已有的 `AGENTS.md`、`CLAUDE.md`。
4. 不主动执行 Git commit。

## 3. Task 1：影响分析与测试基线

目标文件 / symbol：

- `BidPage`
- `SummaryItemRow`
- `buildExistingPairingBidSummary`
- `PairingBidSummaryView`
- `PairingRuleConditionSummary`
- `RuleBidExistingPropertyRow`
- `renderLineExistingBidSummary`

步骤：

1. 对上述待修改 symbol 执行 GitNexus upstream impact。
2. 若风险为 HIGH / CRITICAL，先停止并向用户报告。
3. 运行当前 focused tests，记录基线：
   - Pairing existing summary
   - Search Pairings current rules
   - Bid merged page
   - Days Off page
   - Line page

## 4. Task 2：建立公共摘要模型和纯 formatter

新增建议目录：

```text
pbs-portal/src/features/bid-summary/
```

建议文件：

- `bid-property-summary.ts`
- `bid-property-summary-view.tsx`
- `days-off-bid-summary.ts`
- `pairing-bid-summary.ts`
- `line-bid-summary.ts`
- 对应 focused tests

实现：

1. 定义 `text` / `selection-list` 两类摘要。
2. 固定：
   - `collapsedGroupLimit = 3`
   - `collapsedValueLimit = 3`
3. 建立统一日期、操作符、单复数工具。
4. 完成 19 个 current property 的 formatter 矩阵。
5. Pairing Preference：
   - 按 label 保持首次出现顺序。
   - 统计 `×N`。
   - 不显示内部 ID。
   - label / ID 不完整时返回 needs-review。
6. Prefer Off：
   - headline 为 `Prefer off on N selected date(s)`。
   - values 使用友好日期。

先写失败测试，再实现到 PASS。

## 5. Task 3：迁移 Pairing 摘要消费入口

涉及：

- `pairing-existing-bid-summary.ts`
- `pairing-bid-summary-view.tsx`
- `pairing-rule-condition-summary.tsx`
- `pairing-rule-logic.ts`
- `pairing-search-criteria-row.tsx`

步骤：

1. 将现有 Pairing Length formatter 合并到公共 Pairing formatter。
2. 将 `pairing-preference` 纳入 grouped / counted summary。
3. Existing、Current Rules、单条件 Search Criteria 使用同一摘要对象。
4. 删除不再使用的 Pairing 页面级拼接逻辑。
5. 更新 stale tests，不保留旧 `Award · V4507, V4507...` 或 `1 days` 断言。

## 6. Task 4：迁移 Days Off 与 Line 摘要

涉及：

- `rule-bid-property-table.tsx`
- `line-page.tsx`
- Days Off / Line focused tests

步骤：

1. `RuleBidExistingPropertyRow` 支持公共摘要 view。
2. Days Off Existing 使用 Days Off formatter。
3. Line Existing 使用 Line formatter。
4. 移除或收敛 `renderLineExistingBidSummary`，避免保留第二套 Line 文案。
5. Available Property 的未配置默认值不强制改为完整句子。

## 7. Task 5：主 Bid Existing 与 draft 对账

涉及：

- `bid-page.tsx`
- `tier-summary-sections.tsx`
- Bid page focused tests

步骤：

1. 使用已加载的 Days Off / Pairing / Line page data 建立：

   ```ts
   Map<`${module}:${propertyGroupKey}`, NormalizedBidProperty>
   ```

2. 对可编辑 `TierSummaryItem`：
   - 根据 `editableSource.module + propertyGroupKey` 查 draft property。
   - 找到时生成公共摘要。
   - 找不到时保留 `readableText`。
3. Legacy / unsupported / review-only item 始终保留服务端文案和状态。
4. `SummaryItemRow` 接收可选 display summary，不改变编辑、删除、preview 的稳定身份。
5. 增加 current matched、unmatched、legacy 三类测试。

## 8. Task 6：组件交互与 UI 标准

验证公共 `selection-list`：

1. 默认最多 3 个 group / value。
2. `+N more` 是隐藏 value 数。
3. `+N more pairings` 是隐藏 unique group 数。
4. `Show all N selected` 的 N 是底层选择总数。
5. 展开区域使用内部滚动。
6. 按钮具备正确 cursor、focus 和 aria 文案。
7. 运行根目录 `npm run check:ui`，hard violations 必须为 0。

## 9. Task 7：Crew 906 Playwright 回归

新增：

```text
e2e/tests/pbs-portal/bid-summary-unification.spec.ts
```

只读路径：

1. Crew `906` 登录。
2. `ROSTER / T1`：`High credit window`。
3. `DAYS OFF / T2`：
   - `Prefer off on 15 selected dates`
   - 默认 3 个日期
   - `+12 more`
   - 展开全部并可收起
4. `PAIRING / T3`：
   - `Award pairings V4507 ×13`
   - 不显示内部 ID
   - 不平铺 13 次 label
5. Search Pairings T3：
   - `SEARCH CRITERIA` 同样显示 `Award pairings V4507 ×13`
6. 检查 T4–T7：
   - `V4505 ×17`
   - Redeye
   - Flight Legs per Duty
   - Airport Preference
7. 页面不存在 JSON / `[object Object]`。

## 10. Task 8：QA 文档与最终验证

新增：

```text
docs/test-cases/pbs/bid/2026-07-23-bid-summary-unification.md
```

验证顺序：

```bash
npm --prefix pbs-portal test -- <focused summary tests>
npm run check:ui
npm --prefix pbs-portal run build
(cd e2e && npx playwright test tests/pbs-portal/bid-summary-unification.spec.ts \
  --config=config/playwright.config.ts \
  --project=pbs-portal \
  --no-deps)
git diff --check
node .gitnexus/run.cjs detect-changes --scope compare --base-ref main
```

最终报告：

- 列出实际修改文件。
- 列出每条验证命令及 PASS / FAIL。
- 明确没有 API、数据库、migration 和导入数据变化。
- 明确是否存在未提交的用户文件或其他历史改动。
