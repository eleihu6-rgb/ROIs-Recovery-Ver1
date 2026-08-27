# PBS Dashboard 左侧信息面板 NPBS 口径收敛设计

## 状态

- 文档状态：待用户审阅
- 日期：2026-08-17
- 目标模块：`pbs-portal`
- 目标页面：Crew Portal / PBS Portal Dashboard 左侧信息面板
- 参考口径：`init-docs/N-PBS 24.7 Bidders Guide.pdf`
- 明确约束：只修改用户截图中的左侧信息面板，不影响 Calendar、Bid、Reserve、Standing Bid、Award 等其他业务模块。

## 背景

当前 Dashboard 左侧信息面板包含以下内容：

1. 用户头像、姓名、邮箱。
2. `BID INFORMATION-LOCAL TIME`：`BID START`、`BID END`、`REMAINING`。
3. Bid metrics 三格：`TARGETED LINE`、`TOTAL BIDDER`、`TARGETED RESERVE`。
4. `USER INFORMATION`：`BASE`、`FLEET`、`POSITION`、`SENIORITY`、`LANGUAGE`、`EXISTING CREDIT`、`TRAINING MONTH`、`LAST LOGIN`。

Jen 对 `TOTAL BIDDER` 的数量和展示必要性提出疑问。按 NPBS Guide，登录后的 `Info Screen` 主要分为：

- `Bidder Details`：和当前登录 crew 竞标相关的个人资料。
- `Pairing Distribution`：当前 active bid period 的 pairing day-wise 分布。
- `Bidding Information`：管理员发布的 bidding open/close、credit windows、公告等信息。
- `Carry-in Activities` / `Upcoming Activities`：后续活动列表。

NPBS Guide 的 `Bidder Details` 没有把 `TARGETED LINE`、`TOTAL BIDDER`、`TARGETED RESERVE` 作为个人信息展示。当前三格 KPI 更接近 AA Dashboard 的 base-level bid package metrics，不适合作为本轮 NPBS 对齐范围。

## 目标

- 按 NPBS 口径收敛 Dashboard 左侧面板，删除容易误导的 base-level KPI 行。
- `EXISTING CREDIT` 保持在当前 `USER INFORMATION` 位置，不移动到 Calendar。
- 保持现有 Dashboard 页面主体、Calendar、右侧 Message Center、Bid 编辑流程不变。
- 不新增 NPBS 示例公司里的可配置字段，例如 `Eligible`、`Line Check`、`Stat Day Bank`、`Restricted Equipment`、`Training Seniority` 等。
- 不做数据库 migration。
- 不为了填充页面而新增推导算法。

## 非目标

- 不重新设计 Dashboard 三栏布局。
- 不改变 `/bidding-calendar/current`。
- 不改变 Current Bid、Standing Bid、Reserve、Award 的业务逻辑。
- 不改变 `EXISTING CREDIT` 的数据来源和计算逻辑。
- 不在本任务中新增管理员配置表、message board 管理、line average 或 target line/reserve 数据源。
- 不在本任务中彻底重构 `/dashboard/summary` contract。后端旧 `totalBidder` 计算可以作为后续清理任务处理。

## 需求确认

### 保留内容

左侧面板顶部继续显示：

- crew avatar
- crew name
- crew email

`BID INFORMATION-LOCAL TIME` 继续显示：

- `BID START`
- `BID END`
- `REMAINING`

`USER INFORMATION` 继续显示：

- `BASE`
- `FLEET`
- `POSITION`
- `SENIORITY`
- `LANGUAGE`
- `EXISTING CREDIT`
- `TRAINING MONTH`
- `LAST LOGIN`

其中 `EXISTING CREDIT` 必须保持当前格子位置，也就是第二行第三列，不移动到 Calendar 或其它区域。

### 删除内容

从左侧面板移除整行 bid metrics：

- `TARGETED LINE`
- `TOTAL BIDDER`
- `TARGETED RESERVE`

移除后页面不应出现空白三列表格、占位边框或 `- / 535 / -` 之类残留值。

## 前端设计

当前生成左侧面板数据的主要入口是：

- `pbs-portal/src/features/dashboard/dashboard-user-panel-profile.ts`
- `pbs-portal/src/features/dashboard/components/dashboard-left-panel.tsx`
- `pbs-portal/src/features/dashboard/pages/dashboard-page.tsx`

推荐最小改法：

1. `DashboardLeftPanel` 不再渲染三格 metrics 区域。
2. 优先只改截图区域的渲染逻辑，避免扩大 view model contract 变化。
3. 保持 `bidInfoRows` 和 `userInfoGrid` 结构不变。
4. `EXISTING CREDIT` 的 label 和 value 不做位置调整。

只有确认 `bidMetricBlock` 没有其它消费者时，才允许做小范围清理：

- `buildDashboardUserPanelData` 不再输出 `bidMetricBlock`。
- `DashboardUserPanelData` 类型把 `bidMetricBlock` 改成可选字段。

示例：

```ts
bidMetricBlock?: {
  headers: string[];
  values: string[];
}
```

但本任务不应引入新的 Dashboard layout abstraction。

## 后端设计

本任务以展示层收敛为主，默认不修改后端 contract：

- `/dashboard/summary` 可以继续返回 `bidPackage.targetedLine`、`bidPackage.totalBidder`、`bidPackage.targetedReserve`。
- 前端 Dashboard 左侧面板不再展示这些字段。
- 是否进一步清理 view model 中对这些字段的消费，仅在确认没有其它消费者后执行。

这样可以避免影响任何潜在 API 调用方，也避免把本次 UI 口径调整扩大成后端数据治理任务。

后续如果要彻底清理，应单独做一个后端任务：

- 停止或修复 `totalBidder` 的旧计算。
- 确认是否仍需要 `targetedLine` / `targetedReserve` contract 字段。
- 处理 `pbs_user.base` 已被移除后的旧查询问题。

## Help / 文档同步

本任务不修改 Help。

如果实现后发现 Dashboard Help 仍描述 `bid metrics row`，仅在最终说明中记录为后续文档同步事项，不在本任务中改 Help 文件、Help 路由、Help 组件、截图生成机制或其它业务 topic。

## 测试策略

最小验证范围：

- `pbs-portal` Dashboard view model/unit test：
  - 不再渲染 `TARGETED LINE`、`TOTAL BIDDER`、`TARGETED RESERVE`。
  - `EXISTING CREDIT` 仍显示在 `USER INFORMATION` 中。
  - `BID START`、`BID END`、`REMAINING` 保持显示。

- Playwright 或现有 Dashboard E2E：
  - 登录 Dashboard 后断言三格 KPI 文案不存在。
  - 断言 `EXISTING CREDIT` 仍可见。
  - 断言页面仍显示 crew name、email、bid period 信息。

- UI 标准：
  - 如果涉及 CSS/layout 修改，运行 `npm run check:ui` 或项目要求的 UI 标准检查。

其它模块验证原则：

- 通过 `git diff --name-only` 确认未修改 Calendar、Bid、Reserve、Standing Bid、Award 相关文件。
- 不为这些未触达模块新增行为测试或改动测试 fixture。
- 如果现有 smoke 测试已经覆盖 Dashboard 导航，可运行最小 Dashboard smoke；不扩大到完整业务回归。

## 验收标准

- Dashboard 左侧不再显示 `TARGETED LINE`、`TOTAL BIDDER`、`TARGETED RESERVE`。
- `TOTAL BIDDER` 数字，例如 `535`，不再出现在截图位置。
- `EXISTING CREDIT` 保持在 `USER INFORMATION` 的当前位置。
- `BID INFORMATION-LOCAL TIME` 三行保持不变。
- `USER INFORMATION` 的其它字段保持不变。
- Calendar、Bid、Reserve、Standing Bid、Award 页面行为不变。
- 不新增数据库 migration。
- 自动化测试覆盖本次 UI 变化，或最终说明无法运行的原因和人工验证结果。

## 风险

- 左侧面板删除三格 KPI 后，下方空白会增加。当前用户明确接受只修改该区域，不做大版面重排。
- 如果 Help 文案不同步，会出现用户手册描述和 UI 不一致。
- 后端仍返回旧 KPI 字段时，API contract 会保留冗余字段；但这是最小变更，避免本任务扩散。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本任务范围很小，主要是 Dashboard 左侧 view model 和渲染条件调整，单人实现协调成本最低。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal` Dashboard 左侧面板渲染相关文件及对应测试；不修改 Help。
- Conflict risk: 中低，主要风险是误删 `EXISTING CREDIT` 或影响 Dashboard 其它区域。
- Execution gate: 用户审阅并确认本 spec 后再实施。
