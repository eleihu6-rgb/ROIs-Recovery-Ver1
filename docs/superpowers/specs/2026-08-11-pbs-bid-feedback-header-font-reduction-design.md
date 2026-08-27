# PBS Bid Feedback 表头字号缩小设计

## 目标

只缩小 Bid Feedback Pairing 列表中 `Pairing / Base / Start / End / Days / Credit` 六个可见表头文字。以当前浏览器实际约 16px 的显示大小为基准，缩小约三分之一。

## 设计

- 表头容器保持现有样式不变。
- 仅给六个可见表头 `span` 分别添加标准 `text-xs scale-90`：标准字号先变为 12px，再以 90% 视觉缩放到约 10.8px，相对当前 16px 缩小约 32.5%，接近三分之一。
- 不使用任意像素字号，不启用当前 PBS Portal 未接入的全局 `text-2xs` token，避免影响其他页面已有的 `text-2xs` 用法。
- 不修改表格正文、字号以外的表头样式、Grid、对齐、间距、背景、分页、滚动、弹窗、portal、接口或业务逻辑。

## 验证

- 组件测试只断言六个可见表头采用 `text-xs scale-90`，数据行保持原样。
- Playwright 验证六个表头的计算字号与缩放组合对应约 10.8px，并确认正文、布局和交互未被改动。
- 运行 PBS Portal 聚焦测试、Bid Feedback Playwright、UI Standard Gate 和 `git diff --check`。

## 验收标准

- 六个表头文字视觉大小约为原来的三分之二。
- 只有这六个表头文字发生视觉变化。
- 不创建 Git commit。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 单组件单点样式修改，并行成本高于收益。
- Suggested split: 不拆分。
- Write boundaries: Bid Feedback 表头及对应聚焦测试。
- Conflict risk: Low。
- Execution gate: 用户审核本 Spec 并明确批准实施后开始修改。
