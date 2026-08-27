# PBS Pairing Popover 横向溢出修复设计

## 背景

Dashboard 日历中的 `PAIRING BID` popover 在 pairing number 较长时会被内容撑宽，超出 380px 弹层边界，影响视觉和可用性。

排查结果：

- 本轮算法导出改动没有修改 `pbs-portal`。
- 溢出组件为 `pbs-portal/src/features/dashboard/components/pairing-calendar-bid-popover-content.tsx`。
- 相关布局最早来自 `d16dc9e fix：pairing 细节 补充`。
- 触发原因是 `fieldset` / flex 子项默认最小内容宽度叠加，长 pairing number 和日期列都不收缩。

## 目标

- 长 pairing number 不再撑破 popover。
- popover 宽度保持现有 380px。
- 列表行保持 checkbox、pairing number、日期范围三段结构。
- 只做样式约束，不改业务逻辑和数据结构。

## 方案

1. 给 popover 内容根容器和 `fieldset` 增加最小宽度约束，覆盖浏览器默认的 fieldset 最小内容宽度。
2. 给 occurrence 列表容器禁用横向溢出。
3. 给每一行 flex 容器增加 `min-w-0`。
4. checkbox 固定尺寸不收缩。
5. pairing number 使用 `flex-1 min-w-0 truncate`，长文本在可用空间内省略。
6. 日期列使用固定最大宽度和 `truncate`，保留右对齐，空间不足时优雅省略。
7. 给 pairing number 和日期范围增加 `title`，方便查看完整内容。

## 验收标准

- `YEG/YLW/YEG/YWG/YEG` 这类长 pairing number 不会撑出弹层。
- 弹层不出现横向滚动条。
- 日期范围仍显示在右侧。
- 现有 pairing calendar popover 交互不受影响。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 单组件样式修复，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/dashboard/components/pairing-calendar-bid-popover-content.tsx`
- Conflict risk: 低。
- Execution gate: 用户已确认“改吧”。
