# PBS Minimum Time Between Flights 定义管理实施计划

## 目标

在现有 Gantt `Bid Definitions` 中增加 Minimum Time Between Flights 管理，并让 PBS Portal 与 PBS Server 对新建或实际修改的 Time Between Flights 使用最新公司最低值；动态最大值继续沿用当前 Period pool 的现有交互，不回填历史数据，稳定且 duration 未变化的旧记录继续 grandfather。

## 实施步骤

1. 扩展 `packages/contracts/pbs-bid-definitions`，增加 Minimum Time Between Flights definition、分钟解析、格式化和测试。
2. 扩展 Live Server Bid Definitions GET/PATCH，按管理员认证身份事务更新唯一 dictionary 行，并覆盖非法输入、缺行、重复行和回滚。
3. 扩展 Gantt API 与现有 Bid Definitions 表格/`AppDialog`，增加配置行、`HH:MM` 输入、字段级错误和持续配置错误状态。
4. 复用现有 Time Between Flights bounds 查询，让 Portal 每次重新打开弹窗时 refetch 最新上下限。
5. 扩展 PBS Server Current、Standing、Favorite 保存校验：新建或实际修改校验最新最低值；Current/Favorite 按认证用户、period、context、property code、稳定 key 和原始 duration 核对，Standing 按认证用户、Standing context、property code、稳定 key 和原始 duration 核对。
6. 更新 focused contract、Live Server、PBS Server、Portal 测试，以及 Gantt/PBS Portal Playwright 和人工测试用例。
7. 运行 UI gate、相关模块 typecheck/build、GitNexus `detect_changes`；不主动创建 Git commit。

## 验收

- Bid Definitions 显示并可保存 Minimum Time Between Flights。
- 同一 Portal 会话重新打开弹窗时使用最新最低值，动态最大值保持实时计算。
- 新建、复制、重建或修改 duration 必须满足最新公司最低值。
- 稳定旧 duration 未变化时，即使低于最新最低值或配置暂时不可用，也不阻断其他修改。
- 无法通过伪造 key、跨用户、跨 period 或跨 context 获得豁免。
- Bid payload 与 Pairing interval 算法保持不变。
