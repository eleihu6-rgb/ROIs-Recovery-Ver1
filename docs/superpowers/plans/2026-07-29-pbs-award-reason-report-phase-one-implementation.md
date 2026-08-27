# PBS Award Reason Report 第一阶段实施计划

## 目标

按照已批准的
`docs/superpowers/specs/2026-07-29-pbs-award-reason-report-phase-one-design.md`
实现第一阶段 Award Reason Report：

- 只展示具有有效 `roster_publish.comments` Award explanation 的 Pairing。
- Preview 展示前 3 条，完整报告通过弹窗查看。
- 没有 explanation 时不展示 Pairing、Day Off 或其他 Activity，并使用明确空状态。
- 不实现“为什么没有获得”，不修改算法或数据库结构。

## 实施顺序

### 1. 扩展共享 Contract

修改：

- `packages/contracts/pbs-award-results.d.ts`
- `packages/contracts/pbs-award-results.test.mjs`

工作：

- 新增 `PbsAwardReasonReportItem`。
- 为 `reasonReport` 增加 `items`。
- 保持现有 `available`、`disabledReason` 向后兼容。
- 增加 Contract 结构测试。

验证：

```bash
node --test packages/contracts/pbs-award-results.test.mjs
```

### 2. PBS Server 组装报告

修改：

- `pbs-server/src/services/award/award-results-mapper.ts`
- `pbs-server/src/services/award/award-results-mapper.test.ts`
- 必要时同步 `pbs-server/src/routes/award-results.test.ts`

工作：

- 从已经完成安全解析的 Pairing `explanation` 生成报告条目。
- 一条 Pairing 只生成一条报告记录。
- 按 `startDate`、`pairingCode`、稳定 `id` 排序。
- `available` 仅由有效报告条目决定，不再由 `awardRows` 数量决定。
- 空报告返回 `items: []` 和统一 `disabledReason`。

验证：

```bash
npm --prefix pbs-server test -- --run src/services/award/award-results-mapper.test.ts
npm --prefix pbs-server test -- --run src/routes/award-results.test.ts
```

### 3. Portal 展示 Preview 和完整弹窗

修改：

- `pbs-portal/src/features/award/components/award-right-panel.tsx`
- `pbs-portal/src/features/award/pages/award-page.test.tsx`
- 必要时同步 Award mapper 测试或路由测试 fixture

工作：

- Preview 显示前 3 条 explanation。
- 超过 3 条时显示 `+ N more explanations`。
- `View Reason Report` 打开受控 `AppDialog`。
- 弹窗显示全部条目，支持关闭按钮和 `Esc`，关闭后焦点返回入口。
- 空报告时禁用按钮并显示：
  `No award explanations are available for this period.`
- 不解析 explanation 正文，不重新推导 Tier。

验证：

```bash
npm --prefix pbs-portal test -- --run src/features/award/pages/award-page.test.tsx
npm --prefix pbs-portal run check:ui
```

### 4. Playwright 与 QA 测试

修改：

- `e2e/tests/pbs-portal/award-published-data-completeness.spec.ts`
- `docs/test-cases/pbs/award/2026-07-29-award-reason-report-phase-one.md`

覆盖：

- 4 条 explanation 时 Preview 只展示 3 条。
- 打开弹窗后展示全部 4 条。
- 关闭弹窗后焦点返回。
- 空报告按钮禁用且页面不出现 `Missing`。
- Award API 失败时沿用现有页面错误状态，不泄露原始异常。

验证：

```bash
npx playwright test e2e/tests/pbs-portal/award-published-data-completeness.spec.ts
```

### 5. 完整验证与交付

执行：

```bash
npm --prefix pbs-server test
npm --prefix pbs-server run build
npm --prefix pbs-portal test
npm --prefix pbs-portal run lint
npm --prefix pbs-portal run build
npm run check:ui
npm run verify:pbs
```

提交前：

- 运行 GitNexus `detect_changes --scope compare --base-ref main`。
- 确认只包含 Award Reason Report、对应测试和文档。
- 不暂存或提交现有 Standing Bid 改动。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: Contract、后端 mapper、Portal fixture 和 E2E 存在顺序依赖，且工作区已有未提交的
  Standing Bid 改动；单一执行者更容易保持边界清晰。
- Suggested split: 不拆分。
- Write boundaries: 仅修改本计划列出的 Award、Contract、测试和文档文件。
- Conflict risk: Portal/Server 测试 fixture 需要随 Contract 同步，拆分会增加冲突风险。
- Execution gate: 已批准设计 Spec，可以开始实施。
