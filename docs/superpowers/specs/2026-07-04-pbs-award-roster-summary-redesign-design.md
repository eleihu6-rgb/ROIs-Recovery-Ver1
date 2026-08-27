# PBS Award 结果页 Roster Summary 信息架构调整设计

## 背景

Award 页面是组员查看最终排班结果的页面。当前页面已经能从 `roster_publish` 读取并展示最终排班，但顶部汇总卡和右侧明细表仍混有提交 bid 阶段的概念，例如 `Tier`。

用户反馈：`Tier` 只在提交申请、组织偏好层级时有意义。最终排班已经生成后，用户更关心本月排班结果本身，例如 duty 数、休息日、飞行 pairing、credit/block hours 等。

参考旧系统 Roster 详情页，结果页应更像 roster summary，而不是 bid submission summary。

## 当前问题

当前顶部卡片：

- `Tier`
- `Off`
- `Credit`
- `Premium PRM`
- `Pairings`
- `Activities`

问题：

- `Tier`：最终排班结果页主视图中意义弱，且当前多数情况下显示 `--`，占用关键位置。
- `Premium PRM`：当前没有可靠数据源，显示 `--` 会让用户误以为系统缺数据。
- `Activities`：口径不清。顶部 `Activities` 当前只统计非飞行、非 day off 的 activity；右侧 `Total: 19 activities` 又统计全部 item，两个 “activities” 含义不同。
- 明细表第一列 `TIER` 实际显示的是 `CRM / DO / VAC` 等活动 code，不是 tier。
- 右侧标题 `AWARDED ACTIVITIES` 不够准确，因为列表里包含 day off、vacation、ground activity、pairing 等完整 roster item。

## 目标

把 Award 页面从 “Award/Tier 结果概览” 调整为 “Roster 结果概览”：

- 顶部展示最终排班最有价值的关键指标。
- 删除或降级提交阶段概念。
- 修正文案口径，让 summary、calendar、details 表含义一致。
- 保持当前两栏布局：左侧整月日历，右侧 roster 明细和 reason report。

## 推荐方案

顶部 summary 改为 6 个 roster-oriented 指标：

1. `Period`
   - 值：`01-Jun-2026 ~ 30-Jun-2026`
   - 含义：当前 award roster 覆盖的排班周期。
   - 来源：`periodCode` 解析出的月初/月末。

2. `Duties`
   - 值：全部 roster item 数量。
   - 含义：本月最终排班条目总数，包括 pairing、day off、vacation、ground/training/reserve activity。
   - 来源：`items.length`。
   - 当前截图中应为 `19`，不再叫 `Total activities`。

3. `Days Off`
   - 值：休息日数量。
   - 含义：`type === "day_off"` 的 item 数量。
   - 来源：`summary.offDays`。

4. `Pairings`
   - 值：飞行 pairing 数量。
   - 含义：`type === "pairing"` 的 item 数量。
   - 来源：`summary.pairingCount`。

5. `Credit Hours`
   - 值：总 credit。
   - 含义：所有可计 credit item 的总 credit。
   - 来源：`summary.creditMinutes`。

6. `Block Hours`
   - 值：总 block hours；如果当前 period 没有 block minutes，则显示 `--`。
   - 含义：飞行 block hours 汇总。对于当前 Stanislav 的 Jun 2026 数据，因为没有飞行 pairing，预期为 `--` 或 `0:00`，实现时应采用现有 mapper 的 null 口径。
   - 来源：优先从 `items[].blockMinutes` 汇总。若全部为 null，则显示 `--`。

移除顶部：

- `Tier`
- `Premium PRM`
- `Activities`

## 明细表调整

右侧 section 标题：

- 从 `AWARDED ACTIVITIES`
- 改为 `ROSTER DETAILS` 或 `AWARDED ROSTER`

推荐使用：`ROSTER DETAILS`。

表格列调整：

| 当前列 | 调整后 | 说明 |
|---|---|---|
| `TIER` | `CODE` | 当前实际显示的是 `CRM / DO / VAC / Tn` 这类 badge。没有 award result 时应显示 duty/activity code。 |
| `PAIRING / ACTIVITY` | `DUTY / ACTIVITY` | 覆盖 pairing、day off、ground/vacation/training。 |
| `START` | `START` | 保持。 |
| `ROUTE / LOCATION` | `ROUTE / LOCATION` | 保持。pairing 显示 route，activity 显示 base/assignment。 |
| `SEAT` | `POSITION` | 更符合航空岗位字段。没有值显示 `--`。 |
| `CREDIT` | `CREDIT` | 保持。 |
| `TYPE` | `TYPE` | 保持，但 day off 不再叫 `Ground`，建议显示 `Day Off`。 |

表格底部：

- 从 `Total: 19 activities`
- 改为 `Total: 19 duties`

原因：列表包含 DO/VAC/CRM/Pairing，不全是 activities。

## Calendar 调整

左侧月历标题保持：

- `JUN 2026 AWARD CALENDAR`

Legend 建议改为：

- `Pairing`
- `Day Off`
- `Activity / Leave`

当前 `RES / Activity` 对 `VAC/CRM` 不够准确，且当前数据不一定有 reserve。

布局补充：

- Award 页面主卡应填满共享工作台可用高度，不能在 1920 x 1080 基线下露出大面积底部背景空白。
- 5 周月份不能因为 `weekCount * 103px` 太短而让页面下方空出一截；Award 月历应允许日期格按可用高度增高。
- 共享 `ScheduleEventCalendar` 的默认日期格高度仍保持 `103px`，只有 Award 这类需要填满结果页高度的入口显式传入更高 `calendarCellHeight`。

## Reason Report 区域

Reason Report 保持不变：

- 如果 `pbs_award_result / pbs_award_item` 没有数据，继续显示不可用。
- 不因为 roster_publish 有数据就伪造 reason report。

后续如果 award result 数据补齐，可以把 `matchedTier` 或 reason 信息放入 details/preview，但不作为本次调整范围。

## 数据和接口影响

前端可先基于现有接口完成大部分调整：

- `Period`：由 `periodCode` 解析。
- `Duties`：由 `items.length` 得出。
- `Days Off`：由 `summary.offDays` 得出。
- `Pairings`：由 `summary.pairingCount` 得出。
- `Credit Hours`：由 `summary.creditMinutes` 得出。
- `Block Hours`：当前 contract 已有 `PbsAwardItem.blockMinutes`，前端可汇总。

如果需要后端直接返回 `blockMinutes` summary，可以后续扩展 contract；本次优先用前端汇总，避免扩大 API 改动。

## 不做范围

- 不改 `roster_publish` / `roster_flight` 数据。
- 不改 Award Business Time 逻辑。
- 不新增 period selector。
- 不新增 detail drawer / Flight Log 展开。
- 不实现旧系统右侧 flight card 的完整复刻。
- 不改变 Reason Report 生成逻辑。

## 验收标准

- 顶部不再展示 `Tier`。
- 顶部不再展示 `Premium PRM`。
- 顶部不再展示口径不清的 `Activities`。
- 顶部展示：`Period`、`Duties`、`Days Off`、`Pairings`、`Credit Hours`、`Block Hours`。
- 右侧标题改为 `ROSTER DETAILS`。
- 表格第一列不再叫 `TIER`，改为 `CODE`。
- 表格底部显示 `Total: N duties`。
- Day Off 的 type 文案显示为 `Day Off`，不显示 `Ground`。
- 当前 Stanislav / Jun 2026 页面应能清楚表达：19 duties、13 days off、0 pairings、24:00 credit。
- UI 在 1920px 宽度不横向溢出；卡片文字不截断核心值。
- UI 在 1920 x 1080 基线下，Award 主卡底部不应留下大面积蓝灰背景空白；5 周月份月历格应拉高以填满结果页可用高度。

## 测试方案

自动化：

- 更新 `pbs-portal/src/features/award/pages/award-page.test.tsx`：
  - 断言顶部包含 `Period / Duties / Days Off / Pairings / Credit Hours / Block Hours`。
  - 断言不再包含顶部 `Tier` 和 `Premium PRM`。
  - 断言右侧 section 标题为 `ROSTER DETAILS`。
  - 断言表头包含 `CODE`，不包含 `TIER`。
  - 断言 footer 为 `Total: N duties`。
  - 断言 Award 主卡使用共享工作台高度。

- 更新 `pbs-portal/src/shared/components/schedule/schedule-event-calendar.test.tsx`：
  - 断言默认日期格仍为 `103px`。
  - 断言传入自定义 `calendarCellHeight` 时日期格可增高。

- 更新 `pbs-portal/src/app/router/app-routes.test.tsx` 如受影响。

验证命令：

```bash
npm --prefix pbs-portal test -- src/features/award/pages/award-page.test.tsx src/app/router/app-routes.test.tsx
npm --prefix pbs-portal run build
npm --prefix pbs-portal run lint
npm run check:ui
```

手动/Playwright：

- 打开 `/pbs/award`。
- 确认 `StanislavProfatilov` 在 Jun 2026 下显示新的 roster summary。
- 截图检查顶部卡片、表格标题、表头、footer 文案。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是单页 UI 文案和前端聚合口径调整，改动集中在 Award 组件和测试，拆分成本高于收益。
- Suggested split: 不拆。
- Write boundaries: `pbs-portal/src/features/award/**` 和必要路由测试；若 runtime 改动则按规则 bump `gantt/src/version.ts` 前端版本。
- Conflict risk: 低；但需注意当前工作区可能存在其他未跟踪 spec，不应误提交。
- Execution gate: 用户确认该 spec 后再实施。
