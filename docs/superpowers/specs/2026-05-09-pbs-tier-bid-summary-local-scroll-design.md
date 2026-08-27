# PBS Tier Bid Summary 局部滚动设计

## 背景

`/tier` 首期已改为只读 Bid Review / Summary。当前 `BID SUMMARY` 区域内容较多时，会把右侧面板和页面整体撑高，用户需要滚动整个页面才能查看底部内容。对照 Pairing 工作区体验，长列表应在内容容器内部滚动，顶部统计信息保持可见，避免页面级滚动破坏工作台稳定感。

## 目标

- 将 `/tier` 右侧面板限制在共享工作台高度内。
- `BID STATISTICS` 保持顶部固定占位，不参与 summary 列表滚动。
- `BID SUMMARY` 使用剩余高度并在自身容器内滚动。
- `TIER WARNINGS` 如存在，保留在底部且有最大高度保护，避免旧数据提示撑高整个页面。

## 非目标

- 不修改 API、后端数据、mapper 或 contract。
- 不改变 Bid Summary 的分组、文案、排序和 legacy 数据兼容规则。
- 不增加新的编辑、保存或筛选能力。

## 设计

右侧根容器使用 `var(--portal-page-shell-height)` 作为高度边界，和 `SharedBiddingWorkbenchLayout` / Pairing Search 的工作区高度保持一致。根容器设置 `overflow-hidden`，内部通过 flex 分配空间。

布局结构：

- 根容器：固定工作区高度，纵向 flex，禁止页面被内部内容撑高。
- `BID STATISTICS`：`shrink-0`，高度由内容决定。
- `BID SUMMARY`：`flex-1 min-h-0 overflow-hidden`，内部滚动容器使用 `flex-1 min-h-0 overflow-auto`。
- `TIER WARNINGS`：`shrink-0 max-h[...] overflow-hidden`，内部列表滚动。

## 验收标准

- `/tier` 数据很多时，页面整体不被 `BID SUMMARY` 撑高。
- `BID SUMMARY` 内部出现滚动，统计区仍在顶部。
- 有 `T8+` legacy warning 时，warnings 区域不撑破页面。
- 现有 Tier 渲染、legacy warning、service boundary 测试继续通过。
- 新增/更新组件测试覆盖关键滚动 class。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 单组件布局修复，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/tier/components/tier-right-panel.tsx` 与对应测试。
- Conflict risk: 低。
- Execution gate: 用户已确认推荐方案后实施。
