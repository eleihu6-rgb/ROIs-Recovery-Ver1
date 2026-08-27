# PBS Bid Feedback 表格对齐与 Credit 单位实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Bid Feedback Pairing 列表表头与数据错位，把 Credit 统一显示为带 `h` 单位的时长，并让表头与数据区呈现为一张连续的一体化表格。

**Architecture:** 保留现有 Bid Feedback 数据契约和 CSS Grid 结构，在本地组件中统一所有列的居中规则、Credit 展示格式及表头/数据区的视觉表面。JSDOM 测试检查格式与 class，Playwright 在真实浏览器中检查内容中心点和一体化背景。

**Tech Stack:** React 19、TypeScript、Tailwind CSS、Vitest、Testing Library、Playwright。

---

### Task 1: 固化格式与列对齐回归测试

**Files:**
- Modify: `pbs-portal/src/features/bid/components/bid-feedback-toolbar-actions.test.tsx`
- Modify: `e2e/tests/pbs-portal/bid-feedback.spec.ts`

- [x] **Step 1: 增加组件断言**

断言列表及详情均显示 `15:48h`，并断言所有表头和数据单元格使用相同居中 class 与稳定 `data-column` 标识。

- [x] **Step 2: 增加 Playwright fixture 与几何断言**

新增 Avoid pairing；封装 `expectPairingColumnsAligned`，比较每列表头和数据内容的中心点，误差不超过 1px。分别在 Award、Avoid、桌面及窄屏执行。

- [x] **Step 3: 运行测试确认旧实现失败**

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal
npx vitest run src/features/bid/components/bid-feedback-toolbar-actions.test.tsx
```

Expected: FAIL，缺少 `h` 或对齐标识。

### Task 2: 实施最小 UI 修复

**Files:**
- Modify: `pbs-portal/src/features/bid/components/bid-feedback-dialog.tsx`

- [x] **Step 1: 增加本地 Credit 格式化函数**

```ts
const formatCreditHours = (value: string): string => value.endsWith("h") ? value : `${value}h`;
```

- [x] **Step 2: 统一列对齐**

表头和数据行继续共享 `PAIRING_GRID` / `AWARD_PAIRING_GRID`；所有列统一添加 `justify-self-center text-center`，数字保留 `tabular-nums`。

- [x] **Step 3: 统一 Credit 展示**

Pairing 列表与右侧详情均调用 `formatCreditHours(pairing.totalCredit)`，不改变接口值。

- [x] **Step 4: 运行组件测试**

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal
npx vitest run src/features/bid/components/bid-feedback-toolbar-actions.test.tsx
```

Expected: PASS。

### Task 3: QA 文档与交付验证

**Files:**
- Modify: `docs/test-cases/pbs/bid/2026-08-10-bid-feedback.md`

- [x] **Step 1: 补充人工测试案例**

覆盖 Award/Avoid 表头对齐、`HH:MMh`、桌面和窄屏。

- [x] **Step 2: 运行 Portal 门禁**

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal
npm run lint
npm run build
cd /Users/lei/Codehub/rois-ai
npm run check:ui
cd /Users/lei/Codehub/rois-ai/e2e
npx playwright test --config=config/playwright.config.ts --project=pbs-portal tests/pbs-portal/bid-feedback.spec.ts -g 'PBS-BID-FEEDBACK-001' --reporter=line
```

Expected: 全部 PASS，UI hard violations 为 0。

- [x] **Step 3: 保持未提交状态**

本轮没有 Git commit 授权；完成后只报告变更与验证结果。

### Task 4: 一体化表头视觉修复

**Files:**
- Modify: `pbs-portal/src/features/bid/components/bid-feedback-dialog.tsx`
- Modify: `pbs-portal/src/features/bid/components/bid-feedback-toolbar-actions.test.tsx`
- Modify: `e2e/tests/pbs-portal/bid-feedback.spec.ts`

- [x] **Step 1: 增加表头表面回归断言**

组件测试断言表头使用与列表一致的背景，不再使用明显的 `bg-muted`；Playwright 检查表头和普通数据行的背景一致。

- [x] **Step 2: 实施一体化表头**

保留共享 Grid、居中布局和浅色下边框，将表头切换为统一白底并降低视觉重量；不改选中、hover、focus 和 Eligibility 行为。

- [x] **Step 3: 执行完整验证**

运行聚焦 Vitest、Bid Feedback Playwright、Portal lint/build、UI Standard Gate 与 `git diff --check`。

### Task 5: 对齐 Bid 条件弹窗的响应式行为

**Files:**
- Modify: `pbs-portal/src/features/bid/components/bid-feedback-dialog.tsx`
- Modify: `pbs-portal/src/features/bid/components/bid-feedback-toolbar-actions.test.tsx`
- Modify: `e2e/tests/pbs-portal/bid-feedback.spec.ts`
- Modify: `docs/test-cases/pbs/bid/2026-08-10-bid-feedback.md`

- [ ] **Step 1: 增加响应式与字号失败断言**

组件测试断言弹窗不使用固定 `760px` 高度和 body portal，并断言表头为 `text-sm`、数据行为 `text-2xs`。Playwright 使用多行 Award 和单行 Avoid 分别覆盖内部滚动与自然收缩，并检查弹窗处于缩放 canvas 内。

- [ ] **Step 2: 复用 Bid 条件弹窗布局策略**

移除 `portalToBody` 和固定高度，保留共享视口最大高度；为结果列表设置 `320px` 最大高度和稳定测试标识。双栏使用非拉伸对齐，使少量数据自然收缩、大量数据内部滚动。

- [ ] **Step 3: 统一表头与正文比例**

数据行使用 `text-2xs`，表头使用 `text-sm`；保留居中、白底、浅边框、Credit 单位和状态表现。

- [ ] **Step 4: 更新 QA 并执行完整门禁**

补充缩放、自动高度、滚动与字号检查；运行聚焦 Vitest、Bid Feedback Playwright、Portal lint/build、UI Standard Gate 与 `git diff --check`。
