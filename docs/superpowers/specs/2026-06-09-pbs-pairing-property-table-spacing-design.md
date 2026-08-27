# PBS Pairing Property 表格间距修正设计

## 背景

Pairing 页面行操作按钮统一到 `PROPERTY` 右侧后，整体语义已经更清楚，但实际视觉仍有两个问题：

- `PROPERTY / BID / TIERS` 表头和第一行 property 之间没有稳定间距，显得贴在一起。
- 在 compact / medium 宽度下，`BID` 和 `TIERS` 两列距离偏紧，长 bid 文本会让 tiers 色块显得被挤压。

## 目标

- Existing property 表头和第一行之间增加清晰但克制的垂直间距。
- `BID` 和 `TIERS` 之间增加横向呼吸感。
- 保持 `Delete / Edit / Preview` 继续紧跟 `PROPERTY` 字段右侧。
- 保持 existing、favorite、available 的三列对齐规则一致。

## 非目标

- 不改变 property、bid、tiers 的业务语义。
- 不改变 bid 文案格式化、省略规则或保存逻辑。
- 不改变 tier toggle 的交互、颜色或可点击状态。
- 不重做 Pairing 页面整体视觉风格。

## 方案

- Existing properties 的 rows container 增加顶部 margin，与 `ADD PAIRING PROPERTIES` 区域的表格节奏保持一致。
- 适当增加 `PairingRightPanel` 中 `tableLayout.columnGap`：
  - compact 从 `14px` 调整到更宽松的值。
  - medium / wide 同步小幅增加，避免不同断点下视觉节奏突变。
- 保持 `gridTemplateColumns` 三列结构不变：`PROPERTY | BID | TIERS`。

## 验收标准

- 表头和第一行之间不再贴边。
- `BID` 与 `TIERS` 之间不再显得拥挤。
- Existing 行的删除、编辑、小眼睛仍在 property 输入框右侧。
- Pairing feature 回归测试和 TypeScript 检查通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动只涉及局部 spacing 和对应测试，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `pairing-right-panel.tsx`、Pairing 页面测试。
- Conflict risk: 低。
- Execution gate: 用户已确认后执行。
