# PBS Tier Bid Summary Tx 切换设计

## 背景

删除 `PAIRING STATISTICS` 后，`BID SUMMARY` 成为 Tier 页面底部主要的规则查看区域。当前它把 T1-T7 全部纵向铺开，用户需要不断滚动查找目标 Tx，信息量一多就显得混乱。

## 目标

- 在 `BID SUMMARY` 标题下方加入 T1-T7 的本地切换按钮。
- 用户点击某个 Tx 后，底部只展示该 Tx 的 bid summary。
- 每个按钮显示该 Tx 的 bid 数量，帮助用户快速判断哪里有内容。
- 默认选中第一个有 bid 的 Tx；如果全部为空，则选中第一个 Tx。
- 空 Tx 仍显示 `No bids in this tier.`，不隐藏。
- 保留现有 `View Pairing Set`、bid detail、Edit Tx、Delete Bid、Pairing Set preview 等能力。

## 非目标

- 不新增接口。
- 不修改 mapper、mock 数据结构或算法职责。
- 不恢复 `PAIRING STATISTICS`。
- 不改变 `BID STATISTICS` 和 `TIER REVIEW` 的布局。

## UI 设计

- `BID SUMMARY` panel 内部结构改为：
  - 顶部 `PanelStripHeader`
  - 下方一排 T1-T7 segmented buttons
  - 下方内容区只渲染当前选中的 Tx group
- 选中按钮使用当前系统紫色强调。
- 未选中按钮使用白底灰边。
- 数量以小号数字显示在按钮右侧，例如 `T1 3`。
- 按钮区域可横向换行，避免窄屏挤压。

## 验收标准

- 页面不再需要滚动查找 T1-T7 分组。
- 默认显示第一个有 bid 的 Tx。
- 点击 `T3` 时只显示 T3 内容和空态。
- 点击回 `T1` 后仍能看到 `View Pairing Set` 并正常打开预览。
- 类型检查、lint、Tier focused tests 和 PBS 总验证通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在 `TierRightPanel` 的 `BID SUMMARY` 区域和对应测试，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/tier/components/tier-right-panel.tsx`、`tier-right-panel.test.tsx`。
- Conflict risk: 低。
- Execution gate: 用户已确认按 T1-T7 tab/segmented control 方式实现。
