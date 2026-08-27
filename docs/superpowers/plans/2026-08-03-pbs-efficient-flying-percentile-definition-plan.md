# PBS Efficient Flying Percentile 定义管理实施计划

## 目标

在 Gantt `Bid Definitions` 中管理 `PBS_EFFICIENT_FLYING_CONFIG / PERCENTILE`，并保证 PBS Portal、Pairing Search 与算法导出始终读取该公司定义。Bid、Standing Bid 和 Favorite 只保存 `efficient` / `inefficient` 方向，不保存百分比。

## 实施步骤

1. **统一配置契约**
   - 扩展 `packages/contracts/pbs-bid-definitions`，增加 dictionary parent/code、`1–50` 整数解析与百分比展示格式。
   - 用 contract 测试锁定缺失、重复、小数和越界值的失败行为。

2. **扩展 live-server 管理接口**
   - 在现有 Bid Definitions GET 中追加 `Efficient Flying Percentile`。
   - 增加管理员 PATCH 接口，事务内更新唯一 dictionary 行并返回完整定义。
   - 补充读取、保存、权限、校验和回滚测试。

3. **扩展 Gantt 管理页面**
   - 在现有表格增加第五行及整数编辑框。
   - `1–50` 错误显示在输入框下方并保持弹窗打开；网络/服务端异常继续使用全局 toast。
   - 保存成功后立即刷新当前行，并显示 30 秒收敛说明。

4. **统一 PBS 消费端行为**
   - pbs-server 的配置解析复用共享契约，保留 Pairing Search 的 30 秒缓存。
   - PBS Portal 每次打开 Efficient Flying 配置弹窗时主动 refetch，避免复用旧查询结果。
   - live-server 与 pbs-server 两条导出路径均使用相同的合法值规则，不增加默认百分比。

5. **验证与交付**
   - 更新 Gantt、Portal Playwright，覆盖管理端保存和 Portal 同会话重新打开后显示新百分比。
   - 更新后端和 contract 测试；确认 payload 仍只含 `mode`。
   - 新增 QA 文档 `docs/test-cases/pbs/pairing/2026-08-03-efficient-flying-percentile-definition.md`。
   - 运行相关单测、构建、`npm run check:ui`、Playwright；不执行 migration，因为 dictionary 行已经存在。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: contract、管理接口、Portal 展示和导出读取共享同一语义，改动规模有限且存在严格顺序依赖。
- Suggested split: 由单一实现链路按契约到消费者顺序完成。
- Write boundaries: 不拆分并行写入，避免多个 agent 同时修改共享 contract 和测试。
- Conflict risk: 低；当前工作树仅有本功能 spec 未提交。
- Execution gate: 用户已明确批准 spec 并要求按文档实现。
