# PBS Pairing Search 筛选控件圆角统一设计

## 目标

统一 Search Pairings 页面结果筛选栏内各控件外框的圆角，消除 Pairing Number、Date Range、Airport、Time From、Time To 与 Clear 按钮之间的视觉差异。

## 现状与原因

- Pairing Number / Airport 外框使用 `rounded-md`，在 PBS Portal 中为 `3px`。
- Date Range 使用 `rounded-lg`，为 `4px`。
- Time From / Time To / Clear 使用局部 CSS `6px`。
- 同一筛选栏混用了三档圆角，导致控件看起来不一致。

## 方案比较

1. **统一为 `4px`（采用）**：与 PBS Portal 基础圆角和当前 Date Range 一致，改动最小。
2. 统一为 `6px`：视觉更柔和，但会偏离 Portal 当前基础控件规范。
3. 新增全局筛选控件组件：长期复用更强，但本次仅修一个局部问题，范围过大。

## 实施范围

- Pairing Number / Airport 外框改用 `4px` 圆角。
- Time From / Time To / Clear 外框改为 `4px` 圆角。
- Date Range 保持现有 `4px`。
- 保持控件高度、宽度、间距、颜色、焦点状态、下拉面板、选中标签和筛选行为不变。
- 不修改 API、后端、数据库或业务逻辑。

## 验收标准

- 六个可见控件外框的计算样式 `border-radius` 均为 `4px`。
- 1920×1080 基准视口下保持当前对齐和单行布局。
- Pairing Number、Airport、Date Range、时间输入与 Clear 功能不回归。
- Playwright 覆盖同一筛选栏各控件圆角一致性；前端 UI 标准检查通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在同一筛选组件及其 E2E 测试，工作量小且高度耦合，并行协调成本更高。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal` Pairing Search 局部样式与对应 Playwright 测试。
- Conflict risk: 低，但当前相关文件已有未提交改动，实施时只做最小补丁。
- Execution gate: 用户审阅并批准本 spec 后实施。
