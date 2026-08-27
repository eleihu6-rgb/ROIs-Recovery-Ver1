# PBS Reserve Coverage 实时计算回归用例

## 目标

验证 Reserve 页面 `Need / Off` 不再来自旧 `pbs_reserve_coverage` seed 表，而是由 pbs-server 按当前用户 base/division/current period 从 live 数据实时聚合。

## 前置条件

- PBS Server 和 PBS Portal 可正常运行。
- 目标测试账号在 `pbs_user` 中有有效 `base` 和 `division`。
- live schema 中目标月份存在 RES pairing，或测试人员可以通过 Live Gantt 的 RES Pairing Creator 创建/调整 RES pairing。
- 可访问数据库以核对 `pairing`、`pairing_composition`、`crew_base`、`crew_manday_*_daily`。

## 自动化覆盖

后端 service 测试：

```bash
cd pbs-server
DATABASE_URL=postgresql://test:test@localhost:5432/rois node --import tsx --test src/services/reserve/reserve-coverage-service.test.ts
```

覆盖点：

- coverage service 查询 live `pairing` / `pairing_composition`，不引用 `pbs_reserve_coverage`。
- `Need` 使用 `SUM(pairing_composition.plan)`。
- `Off` 使用 `activeCrewCount - unavailableCrewCount - openReserveNeed`，并用 `greatest(..., 0)` 归零。
- Cabin / Pilot 分别使用对应 manday daily 表。
- 用户 base/division 缺失、periodCode 无法解析时返回 warning。
- 动态 schema 名不合法时拒绝启动 service。

## 人工测试步骤

1. 登录 PBS Portal，进入 `Reserve` 页面。
2. 记录当前用户 base/division 和页面日历中某一天的 `Need / Off`。
3. 在数据库核对同一天 live RES pairing：
   - `pairing.assignment_group = 'RES'` 或 `assignment` 属于 `RES_CALL_TYPE`。
   - `pairing.base` 和 `pairing.division` 匹配当前用户。
   - `SUM(pairing_composition.plan)` 等于页面 `Need`。
4. 在 Live Gantt 调整同一天 RES pairing 的 plan，或新增/删除一个测试 RES pairing。
5. 刷新 PBS Portal Reserve 页面，或触发页面重新请求 coverage。
6. 预期：对应日期 `Need` 按最新 live plan 变化。
7. 调整该日期的 roster/manday 状态，使 active/unavailable/open reserve need 发生变化。
8. 再次刷新 Reserve 页面。
9. 预期：对应日期 `Off` 变化，且不会出现负数。

## 边界场景

- 当前 base/division 没有 RES pairing：页面正常显示，`Need = 0`。
- `pbs_user.base` 或 `pbs_user.division` 缺失：接口返回 warning，页面显示 warning，不回退旧表。
- 当前 periodCode 不是 `Mon YYYY` 格式：接口返回 warning，页面不展示 seed 假数据。
- 数据库中即使残留旧 `pbs_reserve_coverage`，接口也不读取它；部署 migration 后该表应被删除。

## 回归范围

- PBS Portal Reserve 页面 coverage 日历。
- `GET /api/reserve-bids/current/coverage`。
- Live RES pairing plan/open 统计。
- crew base/division scope。
- manday daily 可用性统计。
