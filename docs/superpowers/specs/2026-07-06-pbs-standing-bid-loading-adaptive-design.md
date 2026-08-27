# PBS Standing Bid Loading 自适应修复设计

## 背景

Standing Bid Phase A 已新增独立 `/standing-bid` 页面。当前真实页面是两列结构：

- 左侧：`Standing Bid` 说明卡、`Lineholder Standing Bid` / `Reserve Standing Bid` 模式切换、当前视图统计。
- 右侧：Rule Bid 通用右侧面板，展示 Existing / Add Standing Bid。

截图中的加载态只渲染了一个横向铺满的 `RuleBidRightPanelLoading`，没有左侧占位，也没有使用真实页面的两列 grid。因此加载完成前后会出现明显布局跳变，且在宽屏下看起来像一个被拉满的大白框，不符合 PBS Portal 已确认的自适应规则。

## 目标

修复 Standing Bid 页面加载态，让 loading 骨架和真实页面布局一致：

- 加载中也保留 `StandingBidCanvas` 的等比例适配。
- 加载中也使用 `360px + minmax(0, 1fr)` 的两列布局。
- 左侧渲染 Standing Bid 专属 skeleton，占位真实页面的标题、说明、模式切换和统计区域。
- 右侧继续复用 `RuleBidRightPanelLoading`，但标题文案与默认模式对齐。
- 加载完成前后不出现横向宽度、列结构或高度的大幅跳变。

## 非目标

- 不改 Standing Bid 的后端接口、数据库或保存逻辑。
- 不改 `RuleBidRightPanelLoading` 的全局布局语义，避免影响 Days Off / Line / Reserve / Pairing 等已有页面。
- 不新增新的 loading 框架或第三方依赖。
- 不调整真实页面的业务交互和字段内容。

## 问题拆解

### 当前问题

`StandingBidPage` 在 `isLoading` 时直接返回：

```tsx
<StandingBidCanvas>
  <RuleBidRightPanelLoading ... />
</StandingBidCanvas>
```

这会跳过真实页面的外层 grid 和左侧 card，导致：

- loading 态只有右侧面板；
- 面板被拉伸到整页宽度；
- 加载完成后从单列变成两列；
- 左侧区域突然出现，用户感知为页面重新布局。

### 设计原则

Loading 态不是另一个页面，而是真实页面的骨架。骨架应该占住最终布局的位置，内容可以是 skeleton，但结构不能变。

## 方案比较

### 方案 A：只给 `RuleBidRightPanelLoading` 加最大宽度

做法：在 loading 组件外包一层宽度限制，让右侧不铺满。

优点：

- 改动最小。

缺点：

- 左侧仍然没有占位。
- 加载完成仍然从单列切到两列。
- 只是视觉遮掩，没有修复根因。

结论：不推荐。

### 方案 B：Standing Bid 自己实现完整 loading skeleton

做法：在 `StandingBidPage` 中新增 `StandingBidPageLoading`，使用和真实页面同一个两列 grid。左侧用本地 skeleton，右侧复用 `RuleBidRightPanelLoading`。

优点：

- 精准修复当前页面，不污染共享组件。
- 加载态和真实态结构一致。
- 容易补单测和 Playwright 回归。
- 符合 PBS Portal “页面主工作区按视觉基线等比例自适应”的规范。

缺点：

- Standing Bid 页面增加一个本地 loading 组件。

结论：推荐。

### 方案 C：扩展 `RuleBidRightPanelLoading` 支持外部 shell

做法：把两列布局能力抽象进共享 loading 组件。

优点：

- 长期看可能能复用。

缺点：

- 当前只有 Standing Bid 有独立左侧 card，其他 Rule Bid 页面走共享 workbench，不适合强行抽象。
- 容易扩大影响范围。

结论：暂不采用。

## 推荐方案

采用方案 B：在 Standing Bid feature 内新增本地 loading 结构，保持真实页面的外层布局不变。

### 结构设计

在 `pbs-portal/src/features/standing-bid/pages/standing-bid-page.tsx` 中拆出两个本地组件：

1. `StandingBidLayout`
   - 负责统一包裹真实态和 loading 态的两列 grid。
   - 使用当前真实页面已有 class：
     - `grid`
     - `min-h-[var(--portal-page-shell-height)]`
     - `grid-cols-[360px_minmax(0,1fr)]`
     - `gap-4`
   - 保留 `data-testid="standing-bid-page-layout"`，方便 Playwright 在 loading / loaded 两种状态下验证。

2. `StandingBidLeftPanelLoading`
   - 渲染左侧白色卡片 skeleton。
   - 占位内容对应真实左侧：
     - 顶部小标题 `Standing Bid` 位置；
     - 主标题 `Long-term backup bid` 位置；
     - 两行说明文本；
     - 两个模式切换卡片；
     - 底部 `Current View` 统计卡片。

Loading 逻辑改为：

```tsx
if (isLoading) {
  return (
    <StandingBidCanvas>
      <StandingBidLayout>
        <StandingBidLeftPanelLoading />
        <RuleBidRightPanelLoading
          addButtonLabel="ADD STANDING BID"
          statusLabel="Loading Standing Bid..."
          testId="standing-bid-page-loading"
          title="EXISTING LINEHOLDER STANDING BID"
        />
      </StandingBidLayout>
    </StandingBidCanvas>
  );
}
```

真实态也使用同一个 `StandingBidLayout`，避免 loading / loaded 两套壳层漂移。

### 文案设计

Loading 中右侧标题使用默认初始模式：

- `EXISTING LINEHOLDER STANDING BID`

原因：

- 页面初始 mode 是 `lineholder`。
- 避免加载态显示泛化的 `EXISTING STANDING BID`，加载完成后又变成更具体标题。

### 样式设计

- 左侧 loading 卡片沿用真实左侧卡片的白底、圆角、阴影和 padding。
- skeleton 使用已有 `LoadingBlock`，不新增依赖。
- 左侧 skeleton 不需要可点击状态，不渲染真实按钮，避免 loading 中误导用户。
- 右侧 loading 保持 `RuleBidRightPanelLoading`，不改共享组件。

## 测试方案

### 单元 / 组件测试

更新 `pbs-portal/src/features/standing-bid/pages/standing-bid-page.test.tsx`：

- 验证 loading 中存在 `standing-bid-page-layout`。
- 验证 loading 中存在左侧 skeleton 的 test id，例如 `standing-bid-left-panel-loading`。
- 验证 loading 中右侧标题为 `EXISTING LINEHOLDER STANDING BID`。
- 验证 loading 中不展示 `BIDDING CALENDAR`。

### Playwright 测试

更新 `e2e/tests/pbs-portal/standing-bid-phase-one.spec.ts`：

- 在 `GET /api/standing-bids/current` 延迟响应期间检查 loading 态。
- 断言 loading 态已经是两列布局：
  - `standing-bid-page-layout` 可见；
  - `standing-bid-left-panel-loading` 可见；
  - `standing-bid-page-loading` 可见；
  - 无横向 overflow。
- 响应完成后再次检查真实页面仍在同一 `standing-bid-page-layout` 内。

### 验证命令

最小验证：

```bash
pnpm --filter pbs-portal exec vitest run src/features/standing-bid
cd e2e && npx playwright test tests/pbs-portal/standing-bid-phase-one.spec.ts --config=config/playwright.config.ts --project=pbs-portal --reporter=list
```

交付验证：

```bash
pnpm --filter pbs-portal lint
pnpm --filter pbs-portal build
npm run check:ui
git diff --check
node .gitnexus/run.cjs detect_changes
```

## 验收标准

- Standing Bid 加载中不再出现单个大面板铺满整页。
- 加载中左侧说明区域有稳定占位。
- 加载中和加载完成后的页面都使用同一个两列布局。
- 1920x1080、1366x768、1280x720 下没有横向滚动。
- 不影响 Days Off、Pairing、Line、Reserve、Tier、Award 页面。
- 自动化测试覆盖 loading 态布局。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动范围集中在 Standing Bid 页面 loading 和对应测试，单人实现更快，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: 仅 `pbs-portal/src/features/standing-bid/**`、`e2e/tests/pbs-portal/standing-bid-phase-one.spec.ts` 和本 spec。
- Conflict risk: 低；但当前工作树已有 Standing Bid Phase A 未提交改动，实施时必须避免触碰无关文件。
- Execution gate: 用户确认本 spec 后再修改代码。

## 风险与注意事项

- `RuleBidRightPanelLoading` 是共享组件，本次不改它，避免连带影响其他页面。
- 如果真实页面后续左侧卡片再调整，loading 左侧 skeleton 需要同步维护。
- Playwright 延迟接口时要避免测试超时，延迟只需覆盖 loading 可见即可。
