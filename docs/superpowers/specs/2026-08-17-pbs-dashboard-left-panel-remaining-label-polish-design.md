# PBS Dashboard 左侧面板 Remaining 与 User Information 展示优化设计

## 状态

- 文档状态：待用户审阅
- 日期：2026-08-17
- 目标模块：`pbs-portal`
- 目标页面：Crew Portal / PBS Portal Dashboard 左侧信息面板
- 明确约束：只修改用户截图中的 Dashboard 左侧信息面板，不影响 Calendar、Bid、Reserve、Standing Bid、Award、后端 API 或数据库。

## 背景

当前左侧面板仍有两个展示问题：

1. `REMAINING` 显示到分钟，例如 `5 DAYS 3 HRS 52 MINS`。但页面不是实时每分钟跳动的倒计时，用户容易认为倒计时不准确或卡住。
2. `USER INFORMATION` 表格中的字段标签展示不统一：
   - `BASE`、`FLEET`、`POSITION`、`SENIORITY`、`LANGUAGE` 是单行。
   - `EXISTING CREDIT`、`TRAINING MONTH`、`LAST LOGIN` 被硬编码成换行。
   - 同一张表里有的字段换行、有的不换行，视觉上不规整。

用户明确要求：

- `REMAINING` 要么实时跳动，要么只显示大概天和小时，不显示分钟。
- 本轮选择“不显示分钟”的粗粒度方案。
- `USER INFORMATION` 字段展示要一并整理，避免换行混乱。

## 目标

- `REMAINING` 只显示天和小时，不显示分钟。
- 保持 `Closed` 等非倒计时状态文案不变。
- `USER INFORMATION` 的字段标签统一单行展示。
- `EXISTING CREDIT` 保持当前格子位置，不移动。
- 不新增实时 timer，不改变后端 `remainingLabel` contract。
- 不改变 `BID START` / `BID END`。
- 不影响 Dashboard 中间 Calendar、右侧 Message Center 或其它业务页面。

## 非目标

- 不实现实时倒计时。
- 不改 `/dashboard/summary` 后端计算。
- 不改 PBS Business Time。
- 不重新设计 Dashboard 三栏布局。
- 不改变 `EXISTING CREDIT` 的计算口径或单位。
- 不修改 Help。
- 不做数据库 migration。

## 展示规则

### Remaining

在前端左侧面板展示层对后端返回的 `bidPackage.remainingLabel` 做粗粒度格式化：

| 后端返回示例 | Dashboard 显示 |
|---|---|
| `5 DAYS 3 HRS 52 MINS` | `5 DAYS 3 HRS` |
| `1 DAY 4 HRS 1 MIN` | `1 DAY 4 HRS` |
| `3 HRS 52 MINS` | `3 HRS` |
| `52 MINS` / `0 HRS 52 MINS` | `LESS THAN 1 HR` |
| `Closed` | `Closed` |
| `Bidding not open` 或其它非标准状态 | 原样显示 |

实现原则：

- 只处理包含 `MIN` / `MINS` 的标准倒计时文案。
- 去掉分钟后，如果没有有效天/小时信息，则显示 `LESS THAN 1 HR`。
- 不在前端每分钟刷新，不修改 query interval。

### User Information Labels

`USER INFORMATION` header 标签统一单行：

- `BASE`
- `FLEET`
- `POSITION`
- `SENIORITY`
- `LANGUAGE`
- `EXISTING CREDIT`
- `TRAINING MONTH`
- `LAST LOGIN`

实现原则：

- 删除 view model 中的显式换行，例如 `EXISTING\nCREDIT`。
- 表格 header cell 使用单行展示。
- Header 可使用更适合紧凑表格的字号，例如 Tailwind `text-xs`，确保长标签不挤出单元格。
- Value cell 保持现有逻辑：如果真实值本身是多值列表，例如多 fleet / 多 language，可以继续按多行展示。

## 前端设计

主要涉及文件：

- `pbs-portal/src/features/dashboard/dashboard-user-panel-profile.ts`
- `pbs-portal/src/features/dashboard/components/dashboard-info-table.tsx`
- `pbs-portal/src/features/dashboard/components/dashboard-left-panel.tsx`
- 对应 Dashboard 单元测试和 Dashboard Playwright 测试。

推荐实现：

1. 在 `dashboard-user-panel-profile.ts` 中新增小 helper，例如 `formatCoarseRemainingLabel`。
2. `REMAINING` 行使用该 helper 包装 `bidPackage?.remainingLabel`。
3. `USER INFORMATION` headers 改成无换行文本。
4. `DashboardInfoTable` 对 `tone === "header"` 的 cell 使用单行样式，避免自动断词换行。
5. 不改变数据值 formatting，例如 `formatList` 仍允许多值换行。

## 测试策略

最小验证范围：

- `dashboard-user-panel-profile.test.ts`
  - `5 DAYS 3 HRS 52 MINS` 显示为 `5 DAYS 3 HRS`。
  - `52 MINS` 显示为 `LESS THAN 1 HR`。
  - `Closed` 原样显示。
  - `USER INFORMATION` headers 不再包含 `\n`。

- `dashboard-left-panel.test.tsx`
  - `EXISTING CREDIT`、`TRAINING MONTH`、`LAST LOGIN` 作为单行文本可查到。
  - 值仍正常显示。

- `dashboard-page.test.tsx`
  - Dashboard 页面显示粗粒度 `REMAINING`。
  - 只断言左侧 `REMAINING` 字段值不包含 `MIN` / `MINS`，避免误伤页面其它可能包含分钟的正常文案。

- Playwright Dashboard smoke：
  - 登录 Dashboard mock 页面后，左侧 `REMAINING` 字段值不显示 `MIN` / `MINS`。
  - `EXISTING CREDIT` 仍在 `USER INFORMATION` 区域可见。

- UI 标准：
  - 如果有 CSS/Tailwind class 调整，必须运行 `npm run check:ui` 并报告结果；若本地环境无法运行，必须记录 blocker、已做的替代验证和剩余风险。

## 验收标准

- 截图中 `REMAINING` 不再显示分钟，例如显示 `5 DAYS 3 HRS`。
- 页面不实现实时跳动倒计时。
- `USER INFORMATION` 字段标签不再出现一部分换行、一部分不换行的混乱状态。
- 在目标 Dashboard 左侧面板宽度下，`EXISTING CREDIT`、`TRAINING MONTH`、`LAST LOGIN` 单行展示时不溢出、不重叠、不被截断。
- `EXISTING CREDIT` 仍保留在原位置。
- `BID START`、`BID END` 保持不变。
- 不修改后端 API、数据库、Calendar、Bid、Reserve、Standing Bid、Award。
- 自动化测试覆盖本次展示变化。

## 风险

- 如果某些环境后端返回的 `remainingLabel` 格式不是标准英文倒计时，前端会原样显示；这是有意保守处理，避免误改状态文案。
- Header 改为单行后，极窄宽度下可能仍有视觉压力；本页面当前左侧面板宽度固定，使用紧凑 header 字号可以覆盖现有字段长度。
- 单行 header 可能压缩值区展示，尤其是 `FLEET` / `LANGUAGE` 等多值字段；实现和测试需要覆盖“标签单行、值仍可多行”的共存行为。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本任务是单个 Dashboard 左侧面板的展示优化，改动小，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: Dashboard 左侧面板 view model、左侧表格组件、对应 Dashboard 测试；不修改 Help、后端或其它业务模块。
- Conflict risk: 低，主要风险是误伤多值展示或状态文案。
- Execution gate: 用户审阅并确认本 spec 后再实施。
