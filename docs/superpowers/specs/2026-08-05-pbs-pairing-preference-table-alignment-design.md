# PBS Pairing Preference 表格对齐与 Route 可读性设计

## 目标

- 修复 `Configure Pairing Preference` 中表头与数据列错位的问题。
- 在常用桌面宽度下完整展示常见 `Route`，避免用户无法判断完整航线。
- 保持现有筛选、分页、选择、滚动复位和骨架屏行为不变。

## 现状与根因

- 表头和数据行分别使用两张 `table`。
- 数据区有纵向滚动条，表头没有；两张表的可用宽度不同，浏览器独立计算列宽后产生错位。
- `Route` 列固定为较窄宽度并使用 `truncate`，多航点航线被过早省略。

## 方案比较

1. **单表格 + sticky 表头（采用）**：表头和数据共享同一列模型，纵向滚动时固定表头；结构可靠，后续维护成本最低。
2. 两张表同步补偿滚动条宽度：改动表面较小，但依赖平台滚动条宽度，容易再次错位。
3. CSS Grid 重写结果区：控制力强，但会扩大改动范围，并失去原生表格语义，不符合本次最小修改原则。

## 设计

- 将结果区改为仅负责纵向滚动的容器，容器内只保留一张表格。合并容器最大高度约为 `320px`（`40px` sticky 表头 + 现有 `280px` 数据视口）；Route 换行时允许同屏可见数据行数减少。
- sticky 定位落在各个 `th`，并设置不透明背景和层级；滚动数据时表头保持可见且不会透出数据文字。
- 表头、正常数据、空态、错误态和骨架屏共用同一套列定义。
- 表格始终占满当前容器，不设置会强制横向滚动的最小宽度。
- `Route` 分配更大的比例宽度并允许按连字符/文本边界持续换行，不限制两行或三行；极端超长 Route 也必须完整显示，对应数据行可以自然增高。
- 其余列保持稳定比例和垂直居中，不因 Route 换行产生错位。
- 不改变接口、查询参数、数据结构、业务筛选规则和选择状态。

## 验收标准

- 结果区出现纵向滚动条时，8 列表头与首条数据对应列的左右边界误差不超过 1px。
- 纵向滚动时表头仍可见，分页或筛选后的滚动复位行为不变。
- 固定测试值 `YYZ-YVR-YYC-YKF-YOW-YYZ` 在 `1440×900` 视口下可直接读完。
- 固定超长测试值 `YYZ-YVR-YYC-YKF-YOW-YEG-YWG-YUL-YHZ-YYZ` 必须通过换行完整显示；在 `1024×768` 下，该单元格高度大于普通单行高度、`scrollWidth <= clientWidth`，且不得使用 `truncate`、`line-clamp`、`white-space: nowrap` 或其他裁切样式。
- `1440×900` 下滚动容器满足 `scrollWidth <= clientWidth`，不产生无必要的横向滚动。
- `1024×768` 下滚动容器同样满足 `scrollWidth <= clientWidth`，不得出现横向滚动；Route 按需要换行后，8 列表头与数据列对应边界误差仍不超过 1px。
- 骨架屏、空态、错误态、选择和分页功能无回归；状态行仍覆盖全部 8 列且不破坏表格宽度。

## 测试

- 更新组件测试，确认表头和数据位于同一张表、Route 完整值仍可访问。
- 更新 Playwright：在真实弹窗中制造纵向滚动，测量表头和数据列边界；验证固定 Route 测试值、超长 Route 完整换行，以及 `1440×900`、`1024×768` 均无横向滚动并保持列对齐。
- 组件测试覆盖单表结构及 loading、空态、错误态；现有 Playwright 继续覆盖分页/筛选后的 `scrollTop` 复位和骨架屏。
- 增加对应 QA 人工测试用例。
- 执行相关 Vitest、Playwright、`npm run build`、`npm run lint` 和根目录 `npm run check:ui`。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 修改集中在一个组件及其紧耦合测试，拆分会增加冲突和协调成本。
- Suggested split: 主 agent 串行完成实现与验证。
- Write boundaries: `pairing-preference-picker.tsx`、对应单测/E2E、QA 文档。
- Conflict risk: 多 agent 会同时修改同一表格结构和测试定位器，冲突风险高。
- Execution gate: 用户审阅本 spec 并明确批准实施后开始。
