# PBS Standing Prefer Off 周末展示修复实施计划

对应设计：`docs/superpowers/specs/2026-07-29-pbs-standing-prefer-off-weekend-display-fix-design.md`

1. 在 `prefer-off-editor.test.tsx` 中增加 Current 周末数量与 Standing `Every weekend` 回归。
2. 在 `bid-property-summary.test.ts` 中增加 Weekends、多个星期和合法时间窗口摘要回归。
3. 最小修改 `PreferOffEditor` 的周末徽标文案。
4. 仅扩展 property 201 的 Prefer Off 摘要分支，保留非法值 `needs review`。
5. 让 Standing Existing 的 property 201 复用 Current Bid 的绿色分类标签和摘要生成器，同时保留 Standing 的编辑/删除操作。
6. 增加 Standing Existing 回归，覆盖 Weekdays、Weekends、Time Window、星期顺序和标签颜色。
7. 运行聚焦 Vitest、Portal build、lint、UI gate 和员工 19 的 Standing Playwright。

Multi-Agent Parallelism Assessment：

- Recommendation: No
- Rationale: 共享前端逻辑与 Standing Existing 行紧密相关，单一实现者更容易保持语义一致。
- Write boundaries: Prefer Off 编辑器、Bid 摘要、Standing Existing property 201 展示及其测试。
- Conflict risk: 并行修改同一摘要文件会产生冲突。
- Execution gate: 设计已批准后开始。
