# PBS Pairing Preference 表头与日期换行设计

## 目标

- Pairing 结果表的所有表头保持单行，`CHECK-OUT` 不再换行。
- `DATES` 数据列允许日期范围在箭头两侧自然换行。

## 实现方案

- 为全部表头增加不换行约束。
- 将 `DATES` 列宽度由 18% 调整为 16%。
- 将 `CHECK-IN` 和 `CHECK-OUT` 各由 8% 调整为 9%，总列宽仍为 100%。
- 两个时间表头使用相同的紧凑水平内边距，确保 `CHECK-OUT` 在窄视口也完整显示。
- `DATES` 单元格保持普通换行，不裁切、不显示省略号。
- 不改动数据、API、筛选逻辑或其他列的业务含义。

## 验收标准

- 10 个表头在 `1440×900` 和 `1024×768` 下均满足 `white-space: nowrap` 且 `scrollWidth <= clientWidth`，不通过裁切实现单行。
- 单日 `2026-06-01` 保持一行；日期范围 `2026-06-01 → 2026-06-02` 在 `1024×768` 下可在箭头附近自然换行，单元格高度大于单日行并满足 `scrollWidth <= clientWidth`，不存在 `nowrap`、`truncate`、`line-clamp` 或裁切。
- `1440×900` 和 `1024×768` 下滚动容器均满足 `scrollWidth <= clientWidth`；制造纵向滚动条后，10 列表头与首行对应列的左右边界误差均不超过 `1px`。
- sticky 表头、Route 换行、骨架屏、空态和错误态无回归。

## 测试

- 组件测试验证表头 `nowrap`、`DATES` 允许换行及列宽分配。
- Playwright 使用 `2026-06-01` 和 `2026-06-01 → 2026-06-02` 验证全部表头单行完整显示、日期范围可换行、单日值保持单行，以及两个视口无横向滚动且 10 列对齐。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在同一表格组件及其紧耦合测试，并行编辑容易冲突。
- Suggested split: 主 agent 串行完成。
- Write boundaries: Pairing Preference 组件、对应组件测试和 Playwright。
- Conflict risk: Low，但多 agent 会修改同一列宽定义。
- Execution gate: 用户审阅本 spec 并明确批准实施后开始。
