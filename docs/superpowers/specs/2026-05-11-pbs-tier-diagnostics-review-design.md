# PBS Tier Diagnostics / Review 提醒设计

## 背景

`/tier` 已完成 AA 原文 Layer Tab 对应的只读 Bid Review / Summary 首期能力：按本项目 `Tier / Tx / T1-T7` 展示当前 Lineholder Current draft 的统计、bid summary、conditions 和 legacy warning。

下一步需要让 Tier 页面更接近“提交前检查”的用途：用户不只看到每个 Tier 里有什么，还能看到哪些地方值得 review。AA 原文 Layer 概念在项目中仍统一表达为 Tier，不新增 Layer UI/API 术语。

## 目标

- 在 `/tier` 增加只读诊断提醒，帮助用户发现当前 bid 结构里的 review 点。
- 诊断结果随 `GET /lineholder-bids/current/summary` 一次返回，不为每个 Tier 额外请求。
- 诊断只提醒，不阻止用户，也不在 Tier 页面新增编辑能力。
- 保持旧数据兼容：`T8-T24`、unsupported property 仍可被提示和审阅。

## 非目标

- 不做 Award Engine。
- 不做 Reason Report。
- 不做真实 Pairing Pool / View Pairing Set 计算。
- 不做 Tier 页面内新增、删除、保存、拖拽、重排。
- 不导入 Excel。
- 不把 `Layer` 术语带入代码、API、UI、测试或路由。

## 诊断类型 MVP

首期只做可从 summary 数据稳定推导的诊断：

1. `emptyTier`
   - `T1-T7` 中某个 Tier 没有任何 bid。
   - severity: `info`
   - 目的：提醒用户该 Tx 当前没有出价内容。

2. `legacyTier`
   - summary item 包含 `T8-T24` 或其他超出 `T1-T7` 的 Tier。
   - severity: `warning`
   - 目的：继续显式兼容旧数据，不静默丢弃。

3. `unsupportedProperty`
   - summary item 的 `bidType` 为 `Unsupported` 或 `warningCode=unsupportedProperty / legacyOnly`。
   - severity: `warning`
   - 目的：提示该 bid 只能 review，后续需要 catalog/迁移处理。

4. `duplicateAcrossTier`
   - 同一个稳定 `groupKey` 或相同 readable signature 出现在多个 `T1-T7`。
   - severity: `info`
   - 目的：提醒“同一 bid 被多个 Tx 引用”，这可能是用户有意为之，不能当错误。

5. `heavyTier` / `lightTier`
   - 在非空 Tier 中，某个 Tier 数量明显高于平均值或低于平均值。
   - severity: `info`
   - 建议规则：非空 Tier 平均值 `avg`；`totalItems >= max(4, avg * 2)` 为 heavy，`totalItems === 1 && avg >= 3` 为 light。
   - 目的：提示分布异常，不判断对错。

6. `restrictiveHint`
   - summary readable text / label 命中已知 restrictive、persistent 或 waiver 关键字。
   - severity: `info`
   - 首期关键词：
     - `Minimum Days Off Between Work Blocks`
     - `Waive Minimum Days Off`
     - `Clear Bids`
     - `Waive 24 hrs Rest in Domicile`
     - `Waive Minimum Domicile Rest`
     - `Waive 30 hrs in 7 Days`
     - `Waive Carry-Over Credit`
   - 目的：提示这些 bid 可能影响后续 Tx，需要 review；不重新实现跨 Tier 校验。

## 数据契约

在 `PbsLineholderCurrentSummaryResponse` 增加：

```ts
type PbsLineholderSummaryDiagnosticSeverity = "info" | "warning";

type PbsLineholderSummaryDiagnosticCode =
  | "emptyTier"
  | "legacyTier"
  | "unsupportedProperty"
  | "duplicateAcrossTier"
  | "heavyTier"
  | "lightTier"
  | "restrictiveHint";

type PbsLineholderSummaryDiagnostic = {
  id: string;
  code: PbsLineholderSummaryDiagnosticCode;
  severity: PbsLineholderSummaryDiagnosticSeverity;
  message: string;
  tier?: string;
  tiers?: string[];
  groupKey?: string;
  itemIds?: string[];
};
```

说明：

- `warnings` 保留给兼容性和服务端警告；`diagnostics` 表示页面 review 建议。
- `diagnostics` 是只读展示，不作为业务校验结果。
- `id` 必须稳定，避免 UI key 使用 message。

## 后端设计

`lineholder-summary-service.ts` 在构造完 `statistics`、`summaryItems`、`warnings` 后生成 diagnostics。

规则：

- 不增加数据库查询，不做 N+1。
- 基于已有 `statisticsByTier`、`summaryItems`、`unsupportedTierWarnings` 生成。
- 空 draft 返回 `T1-T7` 的 `emptyTier` diagnostics，页面可显示“当前没有 bid”。
- legacy/unsupported 与现有 warnings 不冲突：warnings 仍显示兼容风险，diagnostics 显示 review 建议。

## 前端设计

`tier-draft-mappers.ts` 将 response diagnostics 映射成 `TierDiagnostic[]`。

`TierRightPanel` 新增诊断区：

- 标题：`TIER REVIEW`
- 位置：在 `BID SUMMARY` 下方、warnings 上方；如果 warnings 存在，warnings 仍在最底部。
- 当 diagnostics 为空时不渲染空区。
- 每条诊断显示 severity、message、相关 Tier chips。
- 使用局部滚动保护，不能撑破右侧 panel。

文案语气：

- 使用 review / may / check 一类提示语，不写成 hard error。
- 不出现 `Layer`。

## 测试计划

后端：

- route mock 测试覆盖 response 包含 diagnostics。
- service/纯函数测试覆盖：
  - empty Tier。
  - legacy Tier。
  - unsupported property。
  - duplicate across Tier。
  - heavy/light 分布。
  - restrictive hint。

前端：

- mapper 测试覆盖 diagnostics 映射。
- component 测试覆盖 `TIER REVIEW` 渲染、severity、Tier chips、空 diagnostics 不显示。
- 现有 Tier summary、legacy warning、局部滚动测试保持通过。

QA：

- 新增 `docs/test-cases/pbs/tier/2026-05-11-tier-diagnostics-review.md`。
- 覆盖空 draft、混合 bid、跨 Tx 重复、legacy、unsupported、restrictive hint。

## 验收标准

- `/tier` 能展示 T1-T7 的 review diagnostics。
- 诊断只读，不影响 Pairing / Days Off / Line 的现有编辑流程。
- 没有诊断时不出现空壳。
- 旧数据超出 `T7` 仍可见且有提示。
- 页面不会因为 diagnostics 被撑高导致整体滚动异常。
- 不引入新依赖。
- 根目录 `npm run verify:pbs` 通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 该改动横跨 contract、summary service、Tier mapper/UI/test，但逻辑依赖紧密，单人串行更稳。
- Suggested split: 不拆分。
- Write boundaries: `packages/contracts/pbs-lineholder-summary.*`、`pbs-server/src/services/lineholder/lineholder-summary-service.ts`、`pbs-server/src/routes/lineholder-summary.test.ts`、`pbs-portal/src/features/tier/*`、`docs/test-cases/pbs/tier/*`。
- Conflict risk: 中等。需要避免无关重构，保持 Tier 只读边界。
- Execution gate: 用户已确认 MVP 范围后实施。
