# PBS Search Pairings 结果卡片左右高度对齐

## 背景

Search Pairings 结果卡片现在分成两块：

- 左侧：pairing detail preview。
- 右侧：mini calendar。

当 pairing legs 较少时，左侧 detail preview 内容高度明显小于右侧日历，看起来像两块卡片没有对齐。用户期望左侧至少和右侧日历一样高；如果左侧 legs 较多，左侧可以自然超过日历高度。

## 目标

- 左侧 detail preview 的最小高度与右侧 mini calendar 一致。
- 左侧内容多时允许自然撑高，不裁切、不滚动。
- 右侧 mini calendar 尺寸不变。
- 不改变字段、数据来源、Add Pairing 行为和弹窗完整 Gantt 明细。

## 推荐方案

在 `pairing-search-panel.module.css` 中抽出一个共享 CSS 变量，例如：

```css
--pairing-result-side-panel-min-height: 222px;
```

然后：

- `.miniCalendarWrap` 使用这个变量作为 `min-height`。
- 新增 `.resultCardDetail`，使用同一个变量并增加 2px 保护值作为 `min-height`，避免页面缩放或像素取整后左侧反而比日历矮。
- `PairingDetailCard` 给 `PairingResultCardDetail` 传入 `.resultCardDetail`。

这样左侧和右侧使用同一个高度来源，避免以后只改一边导致再次不一致。

## 备选方案

### 方案 A：只给左侧写死 `min-height: 222px`

- 优点：改动最少。
- 缺点：和右侧日历高度重复写死，后续容易漂移。

### 方案 B：用 JS 测量右侧日历高度后同步到左侧

- 优点：理论上最动态。
- 缺点：这里没必要，引入测量、resize、渲染时序问题，复杂度过高。

### 方案 C：CSS 共享变量控制左右最小高度（推荐）

- 优点：简单、可维护、无运行时成本。
- 缺点：仍然依赖现有日历的固定视觉高度，但这是当前组件本来就已经存在的约束。

## 验收标准

- 左侧 detail preview 不再比右侧 mini calendar 矮。
- 左侧 legs 较多时可以超过右侧日历。
- Search result card 仍无横向滚动条。
- 左右顶部仍保持对齐。
- Playwright 覆盖：断言左侧高度 `>=` 右侧日历高度，并保留无横向滚动、顶部对齐断言。

## 测试计划

- 更新 `e2e/tests/pbs-portal/pairing-search.spec.ts`：
  - mock 结果场景断言左侧 detail height 大于等于 mini calendar height。
  - 真实数据路径保留无横向滚动和顶部对齐覆盖。
- 更新 `pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx`：
  - 保持字段展示回归。
- 运行：
  - `pnpm exec vitest run src/features/pairing/pages/search-pairings-page.test.tsx --reporter=basic`
  - `npx playwright test tests/pbs-portal/pairing-search.spec.ts -g "PBS-3201|PBS-3602" --reporter=list --config=config/playwright.config.ts --project=pbs-portal`
  - `npm run check:ui`
  - `pnpm lint`
  - `pnpm build`

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在一个卡片组件、一个 CSS module 和现有测试。
- Suggested split: 不拆。
- Write boundaries: `pairing-detail-card.tsx`、`pairing-search-panel.module.css`、Pairing Search 测试、版本号。
- Conflict risk: 低。
- Execution gate: 用户确认后再实现。
