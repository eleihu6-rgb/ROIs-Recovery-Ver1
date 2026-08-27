# PBS Minimum Base Layover 定义管理实施计划

## 目标

在现有 Gantt `Bid Definitions` 中增加 Minimum Base Layover 管理，并让 PBS 后续新建/编辑统一使用 dictionary 最新最低值；不回填已有数据，未修改的 grandfathered 旧值不阻断无关保存。

## 实施步骤

1. 扩展 `packages/contracts/pbs-bid-definitions`，增加 Minimum Base Layover definition、请求校验和格式化测试。
2. 扩展 live-server Bid Definitions GET/PATCH，在事务中更新现有 dictionary 行，并补管理员权限、格式校验和缺行回滚测试。
3. 扩展 Gantt API 与现有表格/`AppDialog`，增加第四行、时长输入、字段级可访问错误和保存反馈。
4. 移除 PBS Server 的硬编码 `13:00` 配置兜底；dictionary 缺失/非法时返回 unavailable 并由服务端 fail closed。
5. 在 Current、Standing、Favorite 保存路径中按稳定 key 识别未改变的 grandfathered 旧值；新增、复制、换 key、重建或实际修改必须执行最新最低值校验。
6. 更新 focused tests、真实 Gantt/PBS Portal Playwright、UI gate、模块 typecheck/build。
7. 提交前运行 GitNexus `detect_changes`；仅在用户再次明确授权后创建 Git commit。

## 验收

- Bid Definitions 显示并可保存 Minimum Base Layover。
- 新配置成为 Portal 新建默认值和服务端最低值。
- 已有低值不被批量修改，也不阻断无关保存。
- 无法通过新 key、复制或删除重建绕过新最低值。
- dictionary 缺失/非法时前后端均不使用硬编码兜底。
- 所有指定测试和 UI gate 通过。
