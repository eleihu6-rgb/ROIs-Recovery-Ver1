# PBS Bid Feedback 实施计划

## 目标

在 Crew Portal 的 Bid 页面增加 `BID FEEDBACK` 与冲突提醒入口，基于当前生效 Bid 计算 Pairing / Days Off 反馈；界面时间使用 Crew Base Local Time，算法导出的 Days Off CSV 继续使用 UTC。

## 实施步骤

1. 在共享 contracts 中定义反馈摘要、完整反馈、冲突、错误码与路由。
2. 在 `pbs-server` 增加反馈服务和只读 API：
   - 复用当前 Bid Period 与结构化 Bid 数据；
   - 复用 Pairing 属性匹配条件；
   - 区分原始匹配和可导出匹配；
   - 计算冲突与基地本地时间展示数据。
3. 在 `pbs-portal` 增加 TanStack Query 服务、冲突入口和白色反馈弹窗；仅在 Bid 页面工具栏启用。
4. 修复 `live-server` Days Off CSV 跨午夜 UTC 转换与非法时区静默丢行问题。
5. 补齐后端单元/路由测试、Portal 组件测试、Playwright 流程及人工测试用例。
6. 执行定向测试、build、lint、`check:ui`，并用 GitNexus `detect_changes` 复核影响范围。

## 验收标准

- Bid 页面按钮顺序为 `REFRESH / VIEW RULES / BID FEEDBACK / SEARCH PAIRINGS`，冲突图标位于反馈按钮左侧。
- 弹窗展示 Award、Avoid、Days Off 的 Bids 与 Calendar 视图。
- Pairing 反馈明确显示可用检查范围，不把缺少 Team Rule 判断误报为完全合格。
- 页面时间为 Crew Base Local Time；Days Off CSV 为 UTC 且跨午夜正确。
- 加载、空状态、字段错误和页面级错误均符合 Portal 现有交互规范。
- 独立 Pairing 页面原有工具栏行为不变。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 前后端 contract、有效 Bid 语义与 UI 展示紧密耦合，当前由单一实现链路更容易保证一致性。
- Suggested split: 不拆分；按 contract → backend → frontend → export fix → verification 顺序实施。
- Write boundaries: `packages/contracts`、`pbs-server`、`pbs-portal`、`live-server`、`docs/test-cases`。
- Conflict risk: 共享 Pairing 工具栏风险较高，必须通过 presentation 参数隔离 Bid 页面行为。
- Execution gate: 已有正式 spec，用户已明确批准实施。
