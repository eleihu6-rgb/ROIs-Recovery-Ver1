# PBS Pairing Preference 筛选时间列设计

## 目标

在 `Configure Pairing Preference` 的结果列表中直接展示每条 Pairing 的 `Check-in` 和 `Check-out`，让用户能够核对时间筛选为什么命中。

## 范围

- 在 `Dates` 后增加 `Check-in`、`Check-out` 两列。
- `Check-in` 使用结果已有的 `reportTime`，表示 Pairing 最早报到时间。
- `Check-out` 使用结果已有的 `releaseTime`，表示 Pairing 最晚签退时间。
- 前端只格式化接口已有的 `reportTime` / `releaseTime`，不从 `legs` 重新推导时间。
- 两个时间均为 Pairing Base 当地时间；复用现有 `formatPairingClock`，统一显示为 `HH:MM`，缺失值显示 `-`。
- 不修改 API、数据库、筛选逻辑或结果数据结构。

## 布局

- 列顺序：选择、Pairing、Base、Route、Dates、Check-in、Check-out、Days、Credit、Rank。
- 重新分配10列宽度，表格继续占满容器且不得出现横向滚动。
- Route 继续不限行换行完整显示；新增时间列保持单行和垂直居中。
- loading 骨架屏、空态、错误态同步适配10列。

## 验收标准

- 应用 Check-in `16:00–17:00`、Check-out `23:30–23:45` 后，固定示例 T4536 在 `2026-06-05` 显示 `Check-in 16:45`、`Check-out 23:40`；在 `2026-06-08` 显示 `Check-in 16:45`、`Check-out 23:42`。
- 输入紧凑时间值（如 `1645`）或带冒号时间值（如 `16:45`）都统一显示为 `16:45`。
- 缺失时间显示 `-`；两个时间单元格保持单行且不裁切。
- 在 `1440×900` 和 `1024×768` 下，滚动容器均满足 `scrollWidth <= clientWidth`；制造纵向滚动条后，10列表头与首条数据列左右边界误差不超过 `1px`，滚动后 sticky 表头仍可见。
- 分页、筛选、选择、Route 换行、sticky 表头、骨架屏、空态和错误态无回归。

## 测试

- 组件测试验证 `1645`、`16:45`、缺失值 `-`、时间单元格不换行/不裁切、10列单表结构和状态行 `colSpan=10`。
- Playwright 在真实 Pairing Preference 弹窗中应用 Check-in `16:00–17:00`、Check-out `23:30–23:45`，断言 T4536 两个日期行及其 `16:45 / 23:40`、`16:45 / 23:42`；同时测量1440/1024下无横向滚动、10列对齐和 sticky 表头。
- 更新 QA 人工测试用例。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在一个表格组件及紧耦合测试，拆分会增加同文件冲突。
- Suggested split: 主 agent 串行完成实现、测试和验证。
- Write boundaries: Pairing Preference 组件、对应单测/E2E、QA 文档。
- Conflict risk: 多 agent 会同时修改同一列模型和同一测试场景。
- Execution gate: 用户审阅本 spec 并明确批准实施后开始。
