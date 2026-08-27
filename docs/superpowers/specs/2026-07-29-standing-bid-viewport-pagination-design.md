# Standing Bid 视口与分页适配设计

## 目标

- 删除 Standing 页面顶部的标题、说明和分隔线区域。
- Standing 主面板填满顶部导航以下的可用视口。
- Existing 或 Available 条件增多时，分页仍固定可见，不被列表内容顶出屏幕。

## 设计

1. `StandingBidPage` 不再渲染独立页面标题；加载、错误和正常状态都只保留主业务面板。
2. Standing 布局删除原有 `grid-rows-[auto_minmax(0,1fr)]` 双行结构，改为单行
   `h-[var(--portal-page-shell-height)] min-h-0 overflow-hidden` 容器。正常、Loading、Error 的
   直接业务面板都使用 `h-full min-h-0`，防止内容继续向下撑开后被 `MainLayout` 裁切。
3. 为共享 `RuleBidRightPanel` 增加显式的 viewport-bound 布局能力，仅由 Standing 页面启用：
   - 面板使用 `h-full min-h-0` 填充网格剩余高度；
   - Existing section 是不扩张且最多占主面板约 40% 的容器，只有 Existing 行容器使用
     `overflow-y-auto`；
   - Available section 使用 `min-h-0 flex-1 overflow-hidden`，移除固定的
     `min-h-[420px]`；
   - Available 属性行容器是该区域唯一的 `overflow-y-auto` 滚动区；
   - 分类、搜索不参与行滚动，分页 footer 显式使用 `shrink-0` 固定在底部。
   上述 class 只在 Standing 的 viewport-bound opt-in 中启用，默认分支保留现有 class。
4. 不减少每页 10 条的业务规则，不改变条件数据、保存流程或其他 Bid 页面的默认布局。

## 验收

1. 页面不再显示顶部 `Standing Bid` 和说明文案。
2. Playwright 在 1920×1080、2048×1152 和较矮桌面视口中，以超过一页的 Available 数据和
   足够多的 Existing 行验证：
   - footer bounding box 完整位于视口内；
   - Available 和 Existing 行容器分别满足 `scrollHeight > clientHeight`；
   - 滚动行容器后，分类、搜索和 footer 的 bounding box 不移动；
   - 页面无横向溢出。
3. Standing Loading/Error 使用确定高度，没有旧标题区域，且业务面板位于可视区域内。
4. 至少一个未启用 viewport-bound 的 Current 页面保持原有布局 class 和分页行为。
5. 相关 Vitest、Playwright、build、lint 和 UI Standard Gate 通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在共享面板的同一条高度约束链，拆分容易产生互相覆盖的 CSS。
- Suggested split: 单人实现页面壳层、共享 opt-in 布局和视口回归测试。
- Write boundaries: Standing 页面、Rule Bid 面板/分区、相关测试和 QA 用例。
- Conflict risk: Low。
- Execution gate: 用户已确认推荐方案。
