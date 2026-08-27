# PBS Tier Review 高度与 Pairing Statistics 样式调整设计

## 背景

当前 `/tier` 页面顶部区域左侧是 `BID STATISTICS`，右侧是 `TIER REVIEW`。右侧容器设置了 `max-h-[220px] min-h-[190px]`，而左侧高度由 `BID STATISTICS` 表格内容自然撑开，因此两块视觉高度不一致。

同时，`PAIRING STATISTICS` 当前使用了带边框的行组样式，和 `BID STATISTICS` 的紧凑表格风格不一致。

## 目标

- `TIER REVIEW` 高度跟随左侧 `BID STATISTICS`，两者始终同高。
- 顶部区域最高高度仍由当前 `BID STATISTICS` 的自然高度决定。
- `TIER REVIEW` 内容超出时只在自身内部滚动，不撑高整个页面。
- `PAIRING STATISTICS` 调整为与 `BID STATISTICS` 一致的表格视觉语言。
- 不改变 Tier 数据加载、Pairing Set preview、编辑、删除、review diagnostic 等业务逻辑。

## 调整范围

- `pbs-portal/src/features/tier/components/tier-right-panel.tsx`
  - 顶部 grid 使用 stretch 布局。
  - 移除 `TIER REVIEW` 的固定最大/最小高度限制，改为跟随 grid 行高。
  - 保留内部滚动区域。
  - 将 `PAIRING STATISTICS` 行样式调整为无额外外层边框、与 `BID STATISTICS` 类似的紧凑表格。
- `pbs-portal/src/features/tier/components/tier-right-panel-loading.tsx`
  - 同步 skeleton 的顶部左右等高结构。
  - 同步 `PAIRING STATISTICS` skeleton 的表格感。
- 相关测试按新的布局 class 更新。

## 验收标准

- `BID STATISTICS` 和 `TIER REVIEW` 顶部两块在同一行显示，并且视觉高度一致。
- 当 `TIER REVIEW` 内容较多时，右侧内部滚动，页面整体不被撑高。
- `PAIRING STATISTICS` 看起来和 `BID STATISTICS` 属于同一种表格样式。
- 现有 Tier 功能不回退：自动加载 pairing pool、`View`、retry、detail dialog、编辑/删除仍可用。
- 类型检查、lint 和 Tier 相关测试通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在同一个组件和对应测试，拆分会增加协调成本。
- Suggested split: 不建议拆分。
- Write boundaries: `pbs-portal/src/features/tier/components/` 及对应测试。
- Conflict risk: 低。
- Execution gate: 用户已确认按此方向修改。
