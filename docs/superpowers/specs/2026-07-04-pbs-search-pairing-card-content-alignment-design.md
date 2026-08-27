# PBS Search Pairings 结果卡片内容对齐修复

## 背景

`Pairing > Search Pairings` 结果卡片已经改为左侧紧凑 Pairing detail、右侧 mini calendar。当前视觉问题是：左侧 detail 卡片和右侧 mini calendar 的顶部不在同一水平线。

根因是外层卡片直接使用左右两列 grid：

- 左列先渲染 `pairingNumber / ADD PAIRING` 操作行。
- 左列再渲染 detail 卡片。
- 右列 mini calendar 作为独立 grid item，从更高位置开始。

结果就是两个真正的内容卡片错位，看起来不整齐。

## 目标

- `PairingResultCardDetail` 和 `PairingMiniCalendar` 顶部水平对齐。
- `pairingNumber / ADD PAIRING` 仍保留在左上角。
- 不改 Pairing 搜索数据、不改搜索 API、不改 `ADD PAIRING` 行为。
- 继续保持 Search 结果卡片无内部横向滚动条。

## 设计

采用“两层布局”：

1. 外层 `resultCard` 改为纵向布局。
2. 第一层是操作行，只放 `pairingNumber / ADD PAIRING`。
3. 第二层是内容行 `resultCardContent`，使用左右两列：
   - 左列：`PairingResultCardDetail`
   - 右列：`PairingMiniCalendar`
4. `PairingResultCardDetail` 在结果卡片里传入 `mt-0`，避免组件默认上边距再次把左侧卡片压低。
5. `PairingMiniCalendar` 去掉自身 top/right margin，依赖外层内容行和卡片 padding 控制间距。

## 验收标准

- 搜索结果卡片中，左侧 detail 卡片顶部和右侧 mini calendar 顶部对齐。
- 右侧 mini calendar 不再比左侧 detail 卡片更靠上。
- `EB8052 / ADD PAIRING` 仍显示在卡片左上。
- Search 结果卡片仍不出现内部横向滚动条。
- Playwright 覆盖真实浏览器下的 top alignment。

## 测试

- 更新 `PBS-3201`：真实数据存在时检查 detail 与 mini calendar 顶部对齐。
- 更新 `PBS-3602`：mock 数据稳定检查 detail 与 mini calendar 顶部对齐，并继续检查无横向溢出。
- 继续运行 PBS Portal 相关 Vitest、Playwright、UI gate、lint、build。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在一个卡片布局和对应测试，拆分会增加协调成本。
- Suggested split: 不拆。
- Write boundaries: `pairing-detail-card.tsx`、`pairing-search-panel.module.css`、Pairing Search 测试、版本号、测试文档。
- Conflict risk: 低。
- Execution gate: 本 spec 确认后实施；用户已确认“好”。
