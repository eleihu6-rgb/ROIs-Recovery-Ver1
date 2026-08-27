# PBS All Pairings 添加按钮位置与日历刷新设计

## 背景

`ALL PAIRINGS` 搜索结果卡片当前把 `ADD PAIRING` 放在卡片右侧，距离 pairing number 过远。用户希望按钮靠近 `T4527` 这类 pairing badge，操作关系更直接。

同时，用户需要确认从搜索结果添加 pairing 后，左侧 bidding calendar 是否会显示新增 pairing。当前保存成功路径已经调用 `invalidatePairingCalendarQueries()`，设计上应触发 calendar query 重新拉取；日历最终是否显示蓝色 pairing 块，取决于后端 `/bidding-calendar/current` 是否返回新增的 `pairing_bid` event。

## 目标

- 将搜索结果卡片中的 `ADD PAIRING` 按钮移动到 pairing badge 右侧，保持视觉距离更近。
- 保存成功后继续刷新 calendar query，确保左侧日历有机会显示新增 pairing。
- 补充测试覆盖：点击 `ADD PAIRING` 保存后，会触发 calendar 数据刷新路径。

## 范围

- 前端布局：`PairingDetailCard` 和对应 CSS。
- 前端测试：搜索页 all pairings 添加流程的断言。
- 不修改后端接口、不修改保存 payload、不做 calendar 本地乐观插入。

## 验收标准

- 搜索结果卡片 header 展示为 pairing badge 与 `ADD PAIRING` 相邻。
- 添加成功后仍保留之前已实现的搜索页反馈行。
- 添加成功后调用 calendar query invalidation；若后端返回新增 pairing event，左侧日历会显示对应 pairing。
- 相关前端测试通过，portal build 通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在一个展示组件和一个测试流程，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/pairing/components/pairing-detail-card.tsx`、`pairing-search-panel.module.css`、搜索页测试。
- Conflict risk: 低。
- Execution gate: 用户已确认实施。
