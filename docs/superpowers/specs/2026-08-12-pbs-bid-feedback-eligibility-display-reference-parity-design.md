# PBS Bid Feedback Eligibility 展示对齐参考项目设计

状态：已获用户确认并实施。

## 背景

当前 Bid Feedback 的 Award Pairing 详情仍显示固定占位：

- `Eligibility unavailable`
- `N/A`
- `Rule Engine eligibility checks have not been run for Bid Feedback.`

但现有 contract 和后端已经具备真实 eligibility 数据通道：

- `packages/contracts/pbs-bid-feedback.d.ts` 已定义 `pairing.eligibility.status / checked / unavailable / reasons`。
- `pbs-server/src/services/bid-feedback/rule-eligibility.ts` 已把 Rust rule runner 的 violation 映射为 `RULE_ENGINE_CONFLICT` reasons。
- `pbs-server/src/services/bid-feedback/bid-feedback-service.ts` 的正常 DB 路径会在 `getCurrentFeedback` 中尝试计算 Award Pairing 的 eligibility。

参考项目的 Bid Feedback 行为是：Award tab 展示 eligibility 状态，`PASS/FAIL` 与 `✓/✗` 直观标识 pairing 是否可 award；失败时在详情区列出原因。Avoid tab 不做 eligibility check。我们要对齐这个用户可见行为，但**数据来源不复制参考项目 Python 逻辑**，而是消费本项目后端返回的真实 Rust / rule-engine eligibility 结果。

## 目标

1. Award Pairing 列表显示真实 eligibility 状态：
   - `eligible`：通过态，显示 `✓`。
   - `ineligible`：失败态，显示 `✗`，并用浅红行态提示。
   - `unknown` 或 `null`：未知/不可用态，不假装通过。
2. Award Pairing 详情显示真实 `PASS / FAIL / Checking / Unavailable` 状态。
3. `FAIL` 时列出 `pairing.eligibility.reasons` 中的法规原因，优先展示后端 `message`，补充 `ruleName` / `ruleId`。
4. Calendar 继续复用已有 `pairing.eligibility.status === "ineligible"` 标记，让不可 award 的 pairing 在日历上可见。
5. Avoid tab 保持不做 eligibility check，并显示与参考项目一致的解释语义。

## 非目标

- 不复制参考项目 Python eligibility 计算逻辑。
- 不在前端重新判断 Rank/Base/Pre-assignment/Rule legality。
- 不修改 `DAYSOFF.csv`、algorithm export 或 Days Off bid 编译逻辑。
- 不改变 Bid Feedback 后端 eligibility contract。
- 不把 `unknown` 当成 `eligible` 处理。

## 当前差距

前端 `pbs-portal/src/features/bid/components/bid-feedback-dialog.tsx` 中：

- `EligibilityMark` 当前只渲染一个空白 span。
- `PairingDetail` 内的 `eligibilityLabel / eligibilityBadgeClassName / eligibilityResultLabel` 是硬编码。
- 详情文案固定显示“Rule Engine eligibility checks have not been run for Bid Feedback.”，没有读取 `pairing.eligibility` 或 `data.eligibilityLabel`。

后端与 contract 已有可消费字段：

```ts
eligibility: null | {
  status: "eligible" | "ineligible" | "unknown";
  checked: Array<"rank" | "base" | "preassignment" | "rule_engine">;
  unavailable: Array<"rule_engine">;
  reasons: Array<{
    code: "RANK_MISMATCH" | "BASE_MISMATCH" | "PREASSIGNMENT_OVERLAP" | "FACTS_MISSING" | "RULE_ENGINE_CONFLICT";
    message: string;
    ruleId?: string;
    ruleName?: string;
  }>;
}
```

## 设计

### 1. 状态映射

新增前端本地 helper，将 contract 状态转换为 UI view model：

| 后端状态 | 列表标记 | 详情 badge | 详情说明 |
|---|---|---|---|
| `eligible` | `✓` | `PASS` | `Eligible for this crew. No blocking rule was returned by the rule engine.` |
| `ineligible` | `✗` | `FAIL` | 显示 reasons 列表 |
| `unknown` + `unavailable` | 空或 `…` | `Unavailable` | 使用 `data.eligibilityLabel` 或 fallback 文案 |
| `null` | 不显示 | 不显示 eligibility card，Avoid tab 显示说明 |

实现上避免用颜色作为唯一信息来源：列表符号、badge 文案、详情说明同时表达状态。

### 2. Award 列表

`PairingList` 继续只在 Award tab 显示 eligibility 列：

- `eligible`：显示 `✓`，可使用绿色文字/轻量背景。
- `ineligible`：显示 `✗`，行增加浅红背景或左侧轻量失败态。
- `unknown`：显示空白或 `…`；如果 `feedbackQuery.isLoading` 已结束但仍 unknown，详情中解释原因。

Avoid tab 不设置 `data-eligibility`，不显示状态列内容。

### 3. 右侧详情

`PairingDetail` 增加 `eligibilitySummaryLabel?: string` 入参，用于 unknown/unavailable fallback。

Award tab：

- 头部右侧 badge 从硬编码 `Eligibility unavailable` 改为状态驱动：
  - `Eligible`
  - `Not eligible`
  - `Eligibility unavailable`
- `Eligibility` 卡片：
  - `PASS`：绿色 badge，显示通过说明。
  - `FAIL`：红色 badge，显示原因列表。
  - `Unavailable`：中性 badge，显示 `data.eligibilityLabel` 或 fallback。

失败原因展示规则：

- 每条 reason 显示 `message`。
- 如果有 `ruleName` 或 `ruleId`，显示为小号辅助信息，例如 `Rule 8072`。
- `FACTS_MISSING` 使用 warning/unknown 语义，不显示成红色法规失败；真正 `RULE_ENGINE_CONFLICT` 才是 blocking fail。
- 如 `status === "ineligible"` 但 `reasons` 为空，显示通用文案：`Rule engine reported this pairing as not eligible, but no detailed reason was returned.`

### 4. Calendar

现有 `BidFeedbackCalendar` 已设置：

```ts
ineligible: pairing.eligibility?.status === "ineligible"
```

本次保留该逻辑。为了更接近参考项目，可在 legend 中增加第三项：

- Award Pairing
- Award Pairing, not eligible
- Days Off

不改变 calendar 数据模型。

### 5. 错误和降级

- 后端整体请求失败：沿用现有 page-level error + Retry。
- 单个 pairing eligibility unknown：不抛错，不阻断 Bid Feedback；显示 unknown/unavailable。
- 不在前端解析 raw exception、stack trace 或内部诊断。
- 不做无限 toast；Bid Feedback dialog 内部已有 persistent error state。

## 测试计划

### 前端单元测试

更新 `pbs-portal/src/features/bid/components/bid-feedback-toolbar-actions.test.tsx`：

1. Award eligible pairing：
   - 列表行显示 `✓`。
   - 详情显示 `PASS`。
   - 不显示 unavailable 文案。
2. Award ineligible pairing：
   - 列表行显示 `✗`。
   - 行带失败态 class / data attribute。
   - 详情显示 `FAIL`。
   - 详情列出 `RULE_ENGINE_CONFLICT` reason message 和 rule id/name。
3. Award unknown pairing：
   - 不显示 `PASS`。
   - 显示 `Eligibility unavailable` / fallback summary。
4. Avoid pairing：
   - 不显示 `✓/✗`。
   - 详情说明 Avoid bids are not eligibility-checked。
5. Calendar：
   - ineligible Award Pairing segment 带红色 ring class。
   - legend 包含 not eligible 说明。

### 构建与 UI 检查

- `cd pbs-portal && npm test -- src/features/bid/components/bid-feedback-toolbar-actions.test.tsx`
- `cd pbs-portal && npm run build`
- 根目录 `npm run check:ui`

### E2E

更新或补充 `e2e/tests/pbs-portal/bid-feedback.spec.ts` 的 mock response：

- Mock 一个 eligible award pairing 和一个 ineligible award pairing。
- 打开 Bid Feedback 后断言 `✓/✗`、`PASS/FAIL`、失败原因、calendar ineligible 标记。

执行：

```bash
npx playwright test e2e/tests/pbs-portal/bid-feedback.spec.ts --config=e2e/config/playwright.config.ts --project=pbs-portal
```

如本地 `pbs-server` 仍受 Redis 启动问题阻塞，E2E 可优先走现有 mock route；真实接口 smoke 作为后端独立验证项，不阻塞本次纯展示改动。

## 验收标准

- Crew 19 / Jun 2026 的 Bid Feedback 不再固定显示 `N/A`。
- 当后端返回 `eligible` 时，列表和详情显示通过态。
- 当后端返回 `ineligible` 且带 reasons 时，列表和详情显示失败态，并展示原因。
- 当后端返回 `unknown` 时，UI 显示不可用/检查中，不误导为 PASS。
- Avoid tab 行为与参考项目一致：不做 eligibility check。
- Calendar 中不可 award 的 Award Pairing 有可见标记。

## 风险与注意事项

- 真实 PASS/FAIL 依赖后端 Rust rule runner 能稳定返回非 unknown；前端只能准确展示后端状态，不能保证所有 pairing 都有结论。
- 当前 worktree 已有 Days Off / pairing-search 等未提交改动；实施时必须只编辑本任务相关文件，避免混入无关更改。
- 如果后端 eligibility 当前在某些环境因 Redis / ruleset / Rust binary 问题降级为 unknown，UI 应保持诚实显示 unavailable。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次实现主要集中在一个 Bid Feedback React 组件、一个前端测试和一个 E2E mock 测试，拆分会增加协调成本。
- Suggested split: 不拆。
- Write boundaries: `pbs-portal/src/features/bid/components/bid-feedback-dialog.tsx`、对应 component test、`e2e/tests/pbs-portal/bid-feedback.spec.ts`。
- Conflict risk: 中；当前工作树已有其他 Bid Feedback 和 E2E 改动，实施前需核对 diff，不能覆盖用户/前序改动。
- Execution gate: 用户审阅本 spec 并明确批准后实施。
