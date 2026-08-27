# PBS Standing Bid 条件分类筛选设计

## 背景

当前 `Standing Bid` 页面已经把可添加条件按 `Days Off / Pairing / Line / Standing` 做了分组标题展示。这个方向是对的，但从用户视角看，条件数量变多以后，只靠滚动查看分组仍然不够高效：

- `Pairing` 条件很多，用户想找 `Line` 或 `Standing` 时需要滚动较长距离。
- 分组标题只能帮助阅读，不能快速过滤。
- 搜索框只能按名称查找，不适合用户先按业务类型缩小范围。

因此建议在 Add rules 区域增加“分类筛选”能力，让用户先按业务类型过滤，再在当前分类内搜索。

## 目标

1. 在 `Standing Bid` 的 Add rules 区域增加可点击分类筛选。
2. Lineholder 模式支持 `All / Days Off / Pairing / Line / Standing`。
3. Reserve 模式支持 `All / Reserve / Standing`。
4. 分类筛选与搜索框、分页联动。
5. 保留当前分组标题，帮助用户在 `All` 视图下理解列表结构。
6. 不改数据库，不改 Standing Bid API，不影响当前月 `Days Off / Pairing / Line / Reserve` 页面。

## 非目标

- 不新增 Standing Bid 条件。
- 不修改 property catalog 来源。
- 不修改保存逻辑。
- 不把分类筛选扩展到所有 Rule Bid 页面，除非页面数据提供了 category。
- 不实现拖拽排序、收藏分类、用户自定义分类。

## 当前实现事实

- Standing Bid catalog 已在前端 mapper 中给 available property 注入：
  - `categoryLabel`
  - `categorySortOrder`
- Add list 当前由共享组件渲染：
  - `RuleBidAvailablePropertiesSection`
  - `filterRuleBidAvailableProperties`
- 当前 `ADD STANDING BID` 会切换到 `ALL STANDING PROPERTIES` tab。
- 当前列表已经会按 `categorySortOrder` 排序，并显示分组标题。
- 当前没有可点击 category filter 状态。

## 方案对比

### 方案 A：只保留现有分组标题

优点：

- 不需要继续改代码。
- 视觉上已经能看出分组。

缺点：

- 条件多时仍然需要滚动。
- 用户无法快速只看 `Line` 或 `Standing`。
- 不能解决截图里“列表很长、查找成本高”的核心问题。

结论：不采用。

### 方案 B：在 Tabs 下方增加分类 chip 筛选（推荐）

优点：

- 改动小，符合当前页面结构。
- 用户可一键过滤分类，不需要滚动找分组。
- 可以复用现有 `categoryLabel/categorySortOrder`。
- 对其他页面影响可控：没有 category 数据时不显示分类筛选。

缺点：

- 需要扩展共享 Rule Bid 组件的过滤状态。
- 需要补共享组件回归测试，避免影响 DaysOff / Line / Reserve 页面。

结论：采用。

### 方案 C：左侧做 sticky 分类导航 / anchor

优点：

- `All` 视图中可以快速跳转到分类段落。
- 大列表下阅读体验好。

缺点：

- 需要新增更多布局空间。
- 与右侧列表已有 tabs、搜索、分页交互叠加后复杂度偏高。
- 只跳转不筛选，搜索和分页仍然要额外处理。

结论：暂不采用。后续如果 Standing 条件继续扩展到非常多，再考虑。

## 推荐设计

### 1. 分类筛选位置

在 `ALL STANDING PROPERTIES` tab 下方、搜索框同一工具栏区域展示分类 chip：

```text
[All 52] [Days Off 6] [Pairing 35] [Line 11] [Standing 1]        [Search Standing Properties]
```

Reserve 模式：

```text
[All 4] [Reserve 1] [Standing 3]                                  [Search Standing Properties]
```

布局规则：

- 大屏：分类 chips 靠左，搜索框靠右。
- 中小屏 / 缩放后：分类 chips 可换行，搜索框仍保持可用。
- 如果当前数据没有任何 `categoryLabel`，不显示分类筛选工具栏，保持现有页面不变。

### 2. 分类筛选行为

新增 active category 状态：

- 默认：`All`
- 点击某个分类后，只显示该分类下的 property。
- 再点击 `All` 恢复全部。
- 切换 `Lineholder / Reserve` 模式时重置为 `All`。
- 切换 `Favorited / All` tab 时保留当前 category；如果当前 tab 下该分类为空，显示空态。
- 修改 category 时分页重置到第一页。

### 3. 与搜索联动

筛选顺序：

1. 先按当前 tab 过滤：
   - `Favorited Properties`
   - `All Standing Properties`
2. 再按 category 过滤。
3. 再按 search keyword 过滤。
4. 最后分页。

搜索框行为：

- Search 只搜索当前 category 内的结果。
- 如果 category 是 `All`，搜索全部当前 tab 结果。
- 清空搜索后仍保留当前 category。

### 4. 数量显示

分类 chip 建议显示数量：

- `All 52`
- `Days Off 6`
- `Pairing 35`

数量口径：

- 数量基于当前 tab 的结果计算。
- 数量不受 search keyword 影响。
- 这样用户搜索时仍能看到每类总规模，不会因为搜索结果变化导致 chip 数字跳动。

### 5. 视觉规范

分类 chip 应比顶部 tab 更轻，避免和 `Favorited / All` 主 tab 混淆：

- Active：浅紫背景、紫色边框、紫色文字。
- Inactive：白底、浅灰边框、深灰文字。
- 数量可用小号 badge 或同一文本，例如 `Pairing 35`。
- Hover：轻微背景变化。
- Focus：可见 focus ring。
- 高度建议 30-32px，和 search input 视觉高度接近。

### 6. 可访问性

- 每个 chip 用 `button`。
- 使用 `aria-pressed` 表示是否选中。
- button 文案包含分类和数量，例如 `Pairing 35`。
- 空态文案应包含当前筛选上下文，例如：
  - `No Pairing properties match the current filters.`
  - `No favorite properties match the current filters.`

## 技术设计

### 1. 数据模型

沿用现有字段：

- `RuleBidAvailableProperty.categoryLabel`
- `RuleBidAvailableProperty.categorySortOrder`

实现时可以新增派生 filter item：

```ts
type RuleBidAvailableCategoryFilter = {
  key: string;
  label: string;
  count: number;
  sortOrder: number;
};
```

`key` 可由 `categoryLabel` 归一化生成，例如：

- `Days Off` -> `days-off`
- `Pairing` -> `pairing`
- `Standing` -> `standing`

如果后续需要更稳定的 key，再给 `RuleBidAvailableProperty` 增加 `categoryKey`。

### 2. 共享过滤逻辑

建议扩展现有 filtering utility：

- 新增 `buildRuleBidAvailableCategoryFilters(properties, activeTab)`
- 扩展 `filterRuleBidAvailableProperties(properties, activeTab, searchKeyword, categoryKey?)`

注意：

- 当前没有 category 的页面不应该改变行为。
- category filtering 只在传入 `categoryKey !== "all"` 时生效。
- 排序仍按现有 `categorySortOrder` 和原始顺序。

### 3. 共享 UI 组件

扩展 `RuleBidAvailablePropertiesSection`：

- 内部接收或计算 `categoryFilters`。
- 增加 `activeCategoryKey` state。
- 渲染 `RuleBidCategoryFilterBar`。
- 分类为空时不渲染 filter bar。

为了降低共享组件风险，建议把分类 bar 拆成小组件：

- `RuleBidCategoryFilterBar`
- 输入：filters、activeKey、onChange
- 不直接依赖 Standing Bid。

### 4. 状态重置

在 `RuleBidRightPanel` 中：

- `viewResetKey` 变化时重置 active category 为 `all`。
- category change 时：
  - `setCurrentPage(1)`
  - `setConfirmingFavoriteDeleteId(null)`
- search change 时仍只重置 page，不重置 category。

## 测试要求

### 前端单元测试

新增或更新：

1. `rule-bid-filtering`：
   - 能生成 category filters。
   - category + search 交集过滤正确。
   - 没有 category 数据时行为不变。
2. `standing-bid-page.test.tsx`：
   - Lineholder 显示 `All / Days Off / Pairing / Line / Standing`。
   - 点击 `Pairing` 后只显示 Pairing 条件，不显示 Days Off 条件。
   - Search 在当前分类内生效。
   - Reserve 显示 `All / Reserve / Standing`。

### Playwright

更新 `standing-bid-phase-one.spec.ts`：

1. 进入 `/standing-bid`。
2. 点击 `ADD STANDING BID`。
3. 点击 `Pairing` 分类。
4. 验证：
   - `Any Landing In Airport` 可见。
   - `Prefer Off` 不可见。
5. 搜索 `Credit`，验证只在 Pairing 分类内过滤。
6. 切换 Reserve，验证分类变为 `All / Reserve / Standing`。

### UI 标准

实现后必须运行：

- `pbs-portal` 相关 vitest。
- `e2e` Standing Bid Playwright。
- `pbs-portal pnpm run build`。
- `pbs-portal pnpm run lint`。
- 根目录 `npm run check:ui`。

## 验收标准

1. Standing Bid Add list 有可点击分类筛选。
2. Lineholder 分类为 `All / Days Off / Pairing / Line / Standing`。
3. Reserve 分类为 `All / Reserve / Standing`。
4. 分类筛选和搜索、分页联动正确。
5. 没有 category 的其他 Rule Bid 页面不受影响。
6. 分类筛选在 Playwright 中覆盖真实 UI。
7. 不需要数据库同步。

## 风险与控制

### 风险 1：共享 Rule Bid 组件影响其他页面

控制：

- 分类 bar 只有存在 `categoryLabel` 时才显示。
- 没有 category 的页面保持现有逻辑。
- 补跑 DaysOff / Line / Reserve 受影响单测。

### 风险 2：分类数量和搜索结果数量让用户困惑

控制：

- chip 数量不随 search 改变，表示当前 tab 分类总量。
- 空态文案说明当前筛选没有结果。

### 风险 3：分页和分类切换错位

控制：

- category change 强制回到第一页。
- 若过滤后总页数减少，继续沿用现有 `clampRuleBidPage` 逻辑。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次是一个小型 UI 交互增强，主要集中在 `pbs-portal` 的共享 Rule Bid 面板和 Standing Bid 测试；多 agent 协调成本高于收益。
- Suggested split: 不建议拆分。
- Write boundaries: 单 agent 修改 `pbs-portal` 与对应 `e2e` 测试即可。
- Conflict risk: Medium。共享 Rule Bid 面板会影响 DaysOff / Line / Reserve 页面，需要严格测试，但文件范围仍集中。
- Execution gate: 用户确认本 spec 后再实现。

## 待确认

推荐采用方案 B：在 `ALL STANDING PROPERTIES` 下方增加分类 chip 筛选，并保留当前分组标题。

确认后我再进入实现。
