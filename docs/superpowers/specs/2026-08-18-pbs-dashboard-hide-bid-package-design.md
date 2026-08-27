# PBS Dashboard Message Center 隐藏 Bid Package 设计

## 状态

- 文档状态：待用户审阅
- 日期：2026-08-18
- 目标模块：`pbs-portal`
- 目标页面：PBS Portal Dashboard 右侧 `MESSAGE CENTER`
- 需求类型：小范围 UI 行为收敛

## 背景

Dashboard 右侧 `MESSAGE CENTER` 当前在 `Pre-assigned Duties` 与 `Duty Details` 下面展示 `BID PACKAGE` 区块。该区块展示当前 bid period 的 fleet / sub-fleet / pairing count，例如：

- `Other fleet`
- `737`
- `All sub-fleets`
- `629 pairings`

经过 AA 与 NPBS 文档核对，这块信息不适合继续放在 crew 个人 Dashboard 右侧：

- AA Dashboard 的 `Message Board` 主要是 base line average、管理员消息、fleet / sub-fleet list。
- NPBS 的 `Bidding Information` 是管理员发布消息。
- NPBS 的 `Upcoming Activities` 是当前 crew 接下来最多 5 个活动。
- 现有 `BID PACKAGE` 展示的是 period pairing pool 的 fleet 聚合数量，不是管理员消息，也不是 crew 个人 upcoming activity。

因此第一版先隐藏该区块，避免 crew 看到解释成本高、个人价值弱的信息。

## 目标

- 从 Dashboard 右侧 `MESSAGE CENTER` 删除 `BID PACKAGE` 整块展示。
- 不再显示 fleet / sub-fleet / pairing count 信息。
- 保留当前已经完成的 `Pre-assigned Duties`、分类统计和 `Duty Details`。
- 不引入新的替代区块，后续如需做 `Bidding Information` 或 `Upcoming Activities`，再单独设计。

## 非目标

- 不改 `/dashboard/summary` API contract。
- 不删除后端 `messageCenter.fleetItems` 字段。
- 不删除后端当前 fleet distribution 查询。
- 不新增 admin message 配置表。
- 不把 `Duty Details` 改成严格 NPBS `Upcoming Activities`。
- 不改 Dashboard 左侧 user panel 或中间 bidding calendar。
- 不做数据库 migration。

## 推荐方案

采用最小前端隐藏方案：

1. 在 `DashboardRightPanel` 中移除 `Bid Package` section 的渲染。
2. 删除该 section 相关的 `hasFleetItems` 局部变量和空状态文案。
3. 更新组件测试，断言不再显示：
   - `Bid Package`
   - `All sub-fleets`
   - `pairings`
   - `Other fleet`
4. 保持 mapper、types、contract、server service 暂时不动。

这样做的好处：

- 改动最小，风险低。
- 不影响后端接口兼容性。
- 不阻塞后续如果需要恢复 AA/NPBS 更准确展示。
- 不引入临时 fake admin message。

## 数据流

当前后端仍可返回：

```ts
messageCenter: {
  fleetItems: [...]
}
```

前端 Dashboard right panel 不再消费 `data.items` 渲染到页面。该字段暂时保留在 view model 中，避免本次小需求扩大到 contract 清理。

## UI 行为

删除前：

```text
MESSAGE CENTER
Pre-assigned Duties
Duty Details
Bid Package
  Other fleet      1 pairing
  737              629 pairings
```

删除后：

```text
MESSAGE CENTER
Pre-assigned Duties
Duty Details
```

如果没有 pre-assigned duties，仍显示现有空状态：

```text
No pre-assigned duties for this period.
```

不新增 `No bid package information available.` 空态。

## 影响范围

预计修改：

- `pbs-portal/src/features/dashboard/components/dashboard-right-panel.tsx`
- `pbs-portal/src/features/dashboard/components/dashboard-right-panel.test.tsx`
- 如现有页面级测试依赖 `Bid Package` 文案，则同步更新：
  - `pbs-portal/src/features/dashboard/pages/dashboard-page.test.tsx`

不修改：

- `packages/contracts/pbs-dashboard-summary.d.ts`
- `pbs-server/src/services/dashboard-summary/dashboard-summary-service.ts`
- 数据库 schema / migration

## 验收标准

- Dashboard 右侧不再出现 `BID PACKAGE`。
- Dashboard 右侧不再出现 `Other fleet`。
- Dashboard 右侧不再出现 `All sub-fleets`。
- Dashboard 右侧不再出现 `629 pairings` 这类 fleet pool count。
- `Pre-assigned Duties` summary 正常显示。
- `Duty Details` 列表正常显示并保持可滚动。
- Dashboard 页面不出现新的空白卡片或残留分隔线。

## 验证计划

最小验证：

```bash
pnpm --dir pbs-portal exec vitest run \
  src/features/dashboard/components/dashboard-right-panel.test.tsx \
  src/features/dashboard/pages/dashboard-page.test.tsx \
  src/features/dashboard/dashboard-summary-mappers.test.ts
```

UI gate：

```bash
npm run check:ui
```

真实页面回归：

```bash
cd e2e
npx playwright test --config=config/playwright.config.ts \
  --project=pbs-portal \
  --no-deps \
  tests/pbs-portal/dashboard-real-data-no-mock.spec.ts
```

提交前检查：

```bash
git diff --check
```

## 风险与后续

- 风险：隐藏后右侧底部空间会更空，但比展示低价值的 fleet pool 统计更清晰。
- 后续：如果业务确认需要 AA 风格 `Message Board`，应先做 admin message / line average 权威数据源设计。
- 后续：如果业务确认走 NPBS 风格，应单独把 `Duty Details` 拆为 `Upcoming Activities` 与 `All Pre-assigned Duties`。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本需求是单一组件小范围隐藏，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: Dashboard right panel 与相关测试。
- Conflict risk: Low。
- Execution gate: 用户确认 spec 后实施。
