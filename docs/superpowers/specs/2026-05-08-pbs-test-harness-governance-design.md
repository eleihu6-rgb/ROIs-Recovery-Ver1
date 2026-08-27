# PBS 测试 Harness / Fixture 治理设计

日期：2026-05-08  
作者：Codex + lei  
状态：待用户确认后实施

## 背景

上一轮 PBS 大文件治理已经完成运行时代码和部分测试文件拆分，并通过 `npm run verify:pbs` 与 PBS 性能基线。当前剩余的主要维护压力在测试层：

- `pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx` 约 1500 行。
- `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx` 约 1000 行。
- `pbs-portal/src/features/pairing/mock.ts` 约 668 行，本轮暂不优先拆。

这些大测试文件覆盖的是 Pairing、Bidding Calendar、Days Off 冲突保护、Pairing calendar 添加、当前规则预览等关键用户流程。它们不是无用文件，也不应为了行数被硬拆散。本轮目标是降低测试维护成本，让后续新增和定位回归更容易。

## 目标

1. 只治理 `pbs-portal` 内 PBS 相关测试支撑代码。
2. 优先整理测试 harness、service mock setup、常用 user flow helper 和 fixture builder。
3. 保留关键用户流程测试的语义和断言，不改变被测行为。
4. 不修改产品代码、API contract、数据库 schema、UI 文案或交互。
5. 拆分后必须通过定向测试和 `npm run verify:pbs`。

## 非目标

- 本轮不拆 `pairing/mock.ts` 的运行时 mock 数据结构，除非某个 fixture helper 必须读取它。
- 本轮不调整测试断言覆盖范围，不为了让测试变短删除关键断言。
- 本轮不改 Playwright、后端测试、非 PBS 前端测试。
- 本轮不做视觉或交互优化。

## 推荐方案

采用“测试支撑层优先”的方案，不直接拆用户流程测试为多个小文件。

### 1. 抽 shared workbench 测试 harness

目标文件：

- `pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx`

拟新增本地测试 helper，例如：

- `pbs-portal/src/app/layout/shared-bidding-workbench-layout.test-utils.tsx`

职责：

- 统一 `renderSharedBiddingWorkbenchLayout`。
- 统一 `AppProviders` / `MemoryRouter` / route setup。
- 统一 `biddingCalendarService`、`calendarDaysOffService`、`pairingService` 的默认 mock setup。
- 提供常用数据 builder，例如 calendar event、days-off draft、pairing occurrence、pending promise helper。

保留原则：

- 具体用户流程测试仍留在 test 文件里，保持阅读顺序。
- helper 只处理重复 setup，不隐藏核心断言。
- 不把复杂业务判断塞进 helper，避免测试失败时难定位。

### 2. 抽 Pairing 页面测试 harness

目标文件：

- `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx`

拟新增本地测试 helper，例如：

- `pbs-portal/src/features/pairing/pages/pairing-page.test-utils.tsx`

职责：

- 统一 `renderPairingPage`。
- 统一 Pairing page 默认 service mocks。
- 抽 `goToAvailablePropertyPage`、`buildCurrentRulesPreviewResponse`、`buildCriteriaPreviewResponse` 等重复测试支撑函数。
- 提供 pending save helper，减少每个 case 重复手写 Promise 控制结构。

保留原则：

- Pairing 主流程测试仍按用户行为排列。
- 不把“点击什么后期待什么”包成过度抽象的一句话 helper。
- 保留业务断言，例如 stable id、draftVersion、Tier toggles、favorite rollback、Search Pairings 导航。

## 可接受保留标准

如果某些测试虽然长，但每段都是连续用户流程，并且抽出去会让读者跨文件追踪断言，则可以保留在原文件。

本轮成功不以“所有文件低于 500 行”为硬指标。成功标准是：

- 重复 setup 明显减少。
- 测试失败时更容易定位是 mock setup、fixture 还是用户流程断言。
- 新增 PBS 前端测试时可以复用统一 harness。

## 验收标准

1. `shared-bidding-workbench-layout.test.tsx` 和 `pairing-page.test.tsx` 的重复 setup 被抽到本地 test utils。
2. 关键用户流程测试语义不变，断言不减少。
3. 不改运行时代码。
4. 没有新增依赖。
5. 通过：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal
npm test -- src/app/layout/shared-bidding-workbench-layout.test.tsx src/features/pairing/pages/pairing-page.test.tsx
npm run lint
npm run build

cd /Users/lei/Codehub/rois-ai
npm run verify:pbs
```

## 风险与控制

- 风险：helper 过度封装后测试可读性下降。  
  控制：只抽 setup、fixture、pending promise、导航到属性页这类机械重复；核心用户动作和断言留在 test case。

- 风险：默认 mock setup 改变测试初始状态。  
  控制：先用现有 beforeEach 行为迁移，改完跑定向测试；每个 case 的特殊 mock 继续留在 case 内显式覆盖。

- 风险：一次拆两个大测试文件导致失败定位复杂。  
  控制：先拆 shared workbench test helper 并跑定向测试，再拆 pairing page test helper。

## 实施顺序

1. 先整理 `shared-bidding-workbench-layout.test.tsx` 的 render/mock/fixture helper。
2. 跑 shared workbench 定向测试。
3. 再整理 `pairing-page.test.tsx` 的 render/mock/fixture helper。
4. 跑 Pairing page 定向测试。
5. 跑 `pbs-portal` lint/build。
6. 跑根目录 `npm run verify:pbs`。
