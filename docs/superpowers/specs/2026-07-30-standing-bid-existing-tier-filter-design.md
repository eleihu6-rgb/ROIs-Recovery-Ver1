# Standing Bid Existing Tier 筛选设计

## 目标

在 `EXISTING STANDING BID` 区域增加 `ALL / T1–T7` 单选筛选，让用户能够清晰查看每个 Tier 已保存的 Standing Bid 条件。

## 范围

- 筛选器只作用于 `EXISTING STANDING BID` 已保存条件列表。
- 默认选择 `ALL`，展示全部已保存条件。
- 选择 `T1–T7` 时，展示包含对应 Tier 的条件。
- 同一条件属于多个 Tier 时，会出现在每个对应 Tier 的筛选结果中。
- `ADD STANDING BID` 条件目录、搜索、分类和分页保持不变。

## 交互与视觉

- 使用与现有 Bid 页面一致的紧凑型单选 Tier 控件。
- 筛选器放在 Existing 标题下方、条件列表上方。
- 控件组使用带可访问名称的单选语义；各选项支持键盘操作、清晰焦点态和选中状态。
- 某个 Tier 没有条件时，在 Existing 区显示该 Tier 的空状态，不影响 Add 区。
- 切换筛选不会打开弹窗、修改条件或发起保存请求。

## 数据与实现边界

- 筛选状态仅为 Standing Bid 页面本地 UI 状态。
- 完整 `existingProperties` 始终作为 hydration、校验和新增、编辑、删除、保存的数据源；Tier 筛选只派生 Existing 区可见行，禁止裁剪草稿数据。
- 不修改 API、数据库、`bid_context`、property 可见配置或 Standing 保存结构。
- 不改变 Lineholder / Reserve 两个独立保存上下文。
- Existing 条件继续使用现有 Tier 标签和编辑、删除操作。
- 同一页面 query 刷新和 mutation 完成后保留当前筛选；页面卸载后重新进入时恢复 `ALL`。
- 编辑后条件不再属于当前 Tier 时，该行立即从当前筛选结果消失；删除最后一行后保持当前 Tier 并显示空状态。
- 如共享 `RuleBidRightPanel` 当前缺少 Existing toolbar 插槽，则新增 opt-in 插槽；未传入时 DOM、布局和 Current Bid 行为保持不变。

## 验收标准

1. 初次进入页面默认展示全部 Existing 条件。
2. 点击某个 Tier 后，只显示包含该 Tier 的条件。
3. 多 Tier 条件在每个对应 Tier 下都能看到。
4. 空 Tier 显示明确空状态。
5. 切换筛选不触发 Standing API mutation。
6. Add 区不随 Existing Tier 筛选变化。
7. 1920×1080、1366×768、1280×720 下控件保持单行、无横向溢出。
8. 使用 T1-only、T2-only、T1+T2 和空 Tier 数据验证筛选结果。
9. 验证同页刷新保留筛选、重新进入恢复 `ALL`，以及编辑和删除后的筛选结果。
10. 验证 Add 区条目数、搜索和分页不变。
11. 如修改共享面板，增加一个未启用筛选的 Current 页面回归测试。
12. 增加组件测试和真实页面 Playwright 回归，前端 UI 检查通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在 Standing 页面及其测试，拆分收益小于协调成本。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal` Standing Bid 页面、必要的共享 Existing toolbar 插槽、对应测试和 Standing QA 测试案例。
- Conflict risk: 多人同时修改 Standing 页面会产生冲突。
- Execution gate: 用户确认本设计文档后再实施。
