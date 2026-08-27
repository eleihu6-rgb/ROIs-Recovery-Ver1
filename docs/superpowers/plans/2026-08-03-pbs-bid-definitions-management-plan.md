# PBS Bid Definitions 实施计划

## 目标

按照已批准的设计，将 Redeye、Weekend、Credit Window 的管理员可变值统一到 live `dictionary`，增加 Gantt `Bid Definitions` 管理页，并让 PBS Portal、搜索、日历与算法导出读取同一事实来源。

## 实施顺序

1. **共享契约与迁移**
   - 在 `packages/contracts` 增加 Redeye/Weekend/Credit Window 的强类型配置、解析与展示函数。
   - 删除带业务值的 Redeye 共享常量。
   - 增加幂等 migration 和 verify SQL，清理 `pbs_bid_property` 中的可变 Redeye 定义。
   - 验证：contracts 单元测试、SQL 静态检查。

2. **live-server 管理接口**
   - 增加管理员专用 GET/PATCH 路由、事务更新、审计字段与 Zod 校验。
   - 注册路由，并让现行算法导出读取 dictionary 中的最新定义。
   - 验证：route/service Vitest，非管理员 401/403，旧值与新值冲突时以 dictionary 为准。

3. **pbs-server 消费路径**
   - 增加 Redeye loader，并将配置显式传入 Pairing Search builder。
   - Weekend 日历与冲突路径使用配置区间，不再固定周六/周日。
   - Pairing Search cache key 纳入 definition version。
   - 验证：Redeye 同日/跨午夜/DST/边界，Weekend same-DOW/24:00/跨周/跨月，现有 Bid 无需重存。

4. **Gantt 与 PBS Portal**
   - Gantt PBS 菜单增加 `Bid Definitions`，实现紧凑表格与三个 `AppDialog` 编辑器。
   - Portal Redeye/Weekend/Credit Window 展示改为服务端配置并在重新打开时刷新。
   - 验证：组件测试、`npm run check:ui`、真实 Playwright 管理与 Portal 流程。

5. **集成与交付检查**
   - 运行 GitNexus `detect_changes`，确认影响范围与设计一致。
   - 运行最小测试后扩展到 touched modules build/test。
   - 数据库 migration 只在用户单独授权后执行到 Development、SIT、UAT。

## 写入边界

- `packages/contracts/`
- `sql/schema/live/`、`sql/migration/`
- `live-server/src/routes/pbs/`、相关算法导出与测试
- `pbs-server/src/services/`、相关 routes/cache 与测试
- `gantt/src/components/pbs/`、shell store/sidebar、服务与 Playwright
- `pbs-portal/src/features/`、共享服务与 Playwright

不修改 Bid 实例 payload，不迁移 Current/Standing/Favorite 业务数据，不改与三项定义无关的页面或规则。
