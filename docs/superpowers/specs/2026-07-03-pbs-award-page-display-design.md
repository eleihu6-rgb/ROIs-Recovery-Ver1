# PBS Award 页面展示与真实数据接入设计

日期：2026-07-03  
状态：Draft，等待用户确认后实施  
相关模块：`pbs-portal`、`pbs-server`、`packages/contracts`

## 背景

Award 页面用于展示组员提交 PBS 申请后，系统最终发布给该组员的整月排班结果。AA 文档中的 Award / Results 页面提供了参考形态：整月排班视图、按时间排序的已 award 项目、顶部汇总指标、Reason Report 入口。

当前仓库状态：

- `pbs-portal/src/features/award` 仍是 mock 数据页面，没有接后端 API。
- `f8.roster_publish` 已补齐并有 Jun 2026 的发布 roster 数据，可作为当前 MVP 的真实展示数据源。
- `f8_pbs.pbs_award_result` / `f8_pbs.pbs_award_item` 已有模型字段，但当前没有可展示结果数据；后续 solver/publish 流程补齐后再打开 matched tier / reason report。
- 项目术语要求：AA 原文 `Layer` 在本项目中统一映射为 `Tier`。UI、contract、代码、测试均不得新增 PBS 业务含义的 `Layer` 命名。

## 目标

1. 将 `/award` 从 mock 页面改为真实数据页面，优先接入当前用户、当前 bid period 的 `roster_publish` 发布排班。
2. 展示整月排班，而不是只展示孤立 trip card。
3. 保留并强化 AA Award 页面的信息结构，但用本项目术语与视觉体系实现：
   - `Tier`
   - `Off`
   - `Credit`
   - `Premium`
   - Award items / activities
   - Reason Report 入口
4. 当 award result 表还没有数据时，不使用假数据补齐 matched tier / reason；用明确的 unavailable / disabled 状态表达。

## 非目标

- 本次不实现 solver award 计算，不生成 `pbs_award_result` / `pbs_award_item`。
- 本次不实现完整 Reason Report 解释链路。
- 本次不新增历史月份切换器；默认使用现有 `resolveCurrentPeriod` 逻辑。若当前 period 无发布 roster，页面显示空态和原因。
- 本次不改变左侧共享 `BIDDING CALENDAR` 的折叠逻辑。
- 本次不继续修改 `roster_publish` schema；如需信用时间，优先 read-only join `roster_flight` 或 `pairing` 的现有字段。

## 推荐方案

采用“可用发布 roster 先接入，award 表未来增强”的方案。

### 方案 A：只读 `roster_publish`

优点：实现最快，数据来源单一。  
缺点：缺少准确 `awardedTier`、`matchedTier`、Reason Report；Credit / Premium 可能不完整。

### 方案 B：`roster_publish` 主数据 + 可选增强 join（推荐）

后端以 `roster_publish` 作为页面主数据源，按当前用户和当前 period 聚合出整月 calendar 与 item list；可选 join：

- `pairing`：补 `pairing_label`、base、fleet、TAFB、duty/segment count。
- `roster_flight`：通过 `roster_id` 补 `sch_credited_minutes` / `act_credited_minutes`，用于 `Credit`。
- `pbs_award_result` / `pbs_award_item`：如果未来有数据，则补 `awardedTier`、`matchedTier`、Reason Report 状态。

优点：现在能展示真实排班，未来能平滑升级到完整 Award 解释。  
缺点：后端 mapper 需要清晰区分“真实缺失”和“未接入”。

### 方案 C：等待 `pbs_award_result` 完整后再做页面

优点：语义最完整。  
缺点：无法满足当前“先把 UI 和可以对接的数据接进来”的目标。

结论：实施方案 B。

## 数据契约

新增 contract：`packages/contracts/pbs-award-results.js` / `.d.ts`

新增 route 常量：

```ts
export const pbsAwardRoutes = Object.freeze({
  current: "/award/current",
});
```

建议响应结构：

```ts
export type PbsAwardCurrentResponse = {
  currentPeriod?: PbsCurrentPeriod;
  periodCode: string;
  published: boolean;
  summary: {
    tier: string | null;
    offDays: number;
    creditMinutes: number | null;
    premiumMinutes: number | null;
    pairingCount: number;
    activityCount: number;
    warnings?: string[];
  };
  calendar: {
    monthLabel: string;
    weekdayLabels: string[];
    cells: PbsAwardCalendarCell[];
    events: PbsAwardCalendarEvent[];
  };
  items: PbsAwardItem[];
  reasonReport: {
    available: boolean;
    disabledReason?: string;
  };
};
```

关键命名：

- 使用 `tier` / `awardedTier` / `matchedTier`。
- 不使用 `layer` / `Layer`。
- 如果需要表达 AA 文档中的 `P1/P2/PN/CN` 这类 award priority，后续单独命名为 `awardPriority`，不能混同为 Tier。

## 后端设计

新增 `pbs-server` 服务与 route：

- `src/services/award/award-results-service.ts`
- `src/services/award/types.ts`
- `src/routes/award-results.ts`
- `src/app.ts` 中 decorate/register `awardResultsService`

服务流程：

1. 从 auth actor 获取当前 `crewId`。
2. 复用 `resolveCurrentPeriod` 得到当前 period。
3. 根据 period month 计算 UTC 月初/月末。
4. 查询 live schema 的 `roster_publish`：
   - `crew_id = actor.crewId`
   - `sch_str_dt_utc` 或 `flt_dt` 落在 period month 内
   - 只读发布表，不修改数据
5. 按业务项聚合：
   - 有 `pairing_id` 的 flight rows 聚合为一个 pairing item。
   - `assignment` / `assignment_group` 为 `DO` / `GDO` 的行聚合为 day off。
   - 训练、reserve、ground duty 等非飞行行聚合为 activity item。
6. 生成 calendar events：
   - Pairing：蓝色
   - Day Off：绿色
   - Training / ground activity：黄色
7. 可选 join `pairing` / `roster_flight` 补摘要字段。无法确认的数据返回 `null`，前端显示 `--`。
8. 如果 `pbs_award_result` / `pbs_award_item` 有当前 crew + period 数据，则补 `summary.tier`、item `matchedTier`、Reason Report available；否则：
   - `summary.tier = null`
   - item `matchedTier = null`
   - `reasonReport.available = false`
   - `disabledReason = "Reason Report is not available until award result data is published."`

错误处理：

- 未登录或 actor 无效：沿用现有 auth route 行为。
- 当前 period 不存在：返回 period fallback + 空态，不抛 500。
- live roster 查询失败：返回 500，日志不记录敏感 roster 明细。

## 前端设计

`/award` 继续运行在 `SharedBiddingWorkbenchLayout` 右侧，不影响左侧共享 `BIDDING CALENDAR`。

新增/调整：

- `src/shared/services/award-service.ts`
- `src/features/award/hooks/use-award-page-data.ts`
- `src/features/award/award-mappers.ts`
- `src/features/award/components/award-month-calendar.tsx`
- 重构现有 `AwardRightPanel` / `AwardTripCard`，从 contract response 渲染，不再依赖 mock。

页面结构：

1. 顶部标题区：`AWARD RESULTS`、period label、Reason Report 按钮。
2. 汇总条：
   - `Tier`
   - `Off`
   - `Credit`
   - `Premium`
   - Pairings / Activities count
3. 整月 calendar：
   - 复用 `ScheduleEventCalendar` 的 cell/event 绘制能力。
   - 只读展示，不开放 Days Off 的编辑操作。
4. Chronological Award Items：
   - 按 start time 排序。
   - Pairing item 展示 pairing code、日期范围、base、seat/position、credit、TAFB、leg rows。
   - Ground / training / day off item 使用更紧凑的 activity row/card。
5. 空态：
   - 当前 period 无发布 roster：显示稳定空态，不回退 mock。
   - 数据部分缺失：具体字段显示 `--`，并在必要时提供 warning 文案。

视觉约束：

- 页面沿用 PBS Portal 现有浅色专业工作台风格。
- 不做营销式 hero，不新增无关装饰。
- 以 1920 x 1080 桌面工作台为视觉基线，并保持现有 `ScaledPageCanvas` 缩放行为。
- 避免外层 card 内再嵌套多层 card；重复 item 可以用轻量边框 card。
- 所有 UI 文案使用英文；业务层级术语使用 `Tier`。

## 测试计划

自动化测试：

- `pbs-server`：
  - service unit test：验证 roster rows 聚合 pairing / day off / activity。
  - service unit test：验证 award result 缺失时 `Tier` 和 Reason Report 的 disabled 状态。
  - route test：验证 `/api/award/current` 走 auth actor、统一响应、错误处理。
- `pbs-portal`：
  - hook/service test：验证请求 contract 和 loading/error/success 状态。
  - page/component test：验证 calendar、summary、items 渲染真实 response。
  - terminology regression：Award 页面不出现 `Layer`。
- E2E / Playwright：
  - 登录 PBS Portal，进入 `/award`，验证首屏显示 `AWARD RESULTS`、整月 calendar、真实 roster item。
  - 验证 Reason Report 无数据时按钮 disabled 或显示不可用状态。

人工 QA 文档：

- 新增 `docs/test-cases/pbs/award/2026-07-03-award-page-display.md`。
- 覆盖：有发布 roster、无发布 roster、字段缺失、不同 viewport / 缩放、术语检查。

交付验证命令目标：

```bash
npm --prefix pbs-server test -- src/services/award/*.test.ts src/routes/award-results.test.ts
npm --prefix pbs-server run build
npm --prefix pbs-portal test -- src/features/award
npm --prefix pbs-portal run lint
npm --prefix pbs-portal run build
npm run check:ui
```

如跨模块脚本可用，再补跑：

```bash
npm run verify:pbs
```

## 验收标准

- `/award` 不再展示 mock-only 内容。
- 页面能基于当前登录组员和当前 period 从 `roster_publish` 展示整月发布 roster。
- Calendar 和 item list 的日期、pairing/activity 数量与 API 返回一致。
- `Layer` 不出现在新增 UI、contract、代码命名和测试断言中；AA 原文引用除外。
- `pbs_award_result` 缺失时页面不伪造 final tier / reason；显示 `--` 或 disabled reason。
- 页面 loading / error / empty 状态不造成布局跳动或空白闪烁。
- Playwright 能驱动真实 `/award` 页面完成主流程验证。

## Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: 任务横跨 backend API、frontend UI、测试/QA 文档，可拆成边界清晰的子任务。
- Suggested split: 
  - Agent A：`pbs-server` award service / route / contract 数据聚合。
  - Agent B：`pbs-portal` Award UI / hook / mapper。
  - Agent C：测试与 QA 文档，最后由主 agent 集成。
- Write boundaries:
  - Agent A 只写 `pbs-server/src/services/award/**`、`pbs-server/src/routes/award-results.ts`、`packages/contracts/pbs-award-results.*`、必要的 `pbs-server/src/app.ts`。
  - Agent B 只写 `pbs-portal/src/features/award/**`、`pbs-portal/src/shared/services/award-service.ts`。
  - Agent C 只写测试文件和 `docs/test-cases/pbs/award/**`。
- Conflict risk: Medium。`packages/contracts` 和 response mapper 是前后端共享边界，必须先固定 contract，再并行。
- Execution gate: 只有用户确认本 spec 后才启动实现；并行 agent 的写入边界必须在启动前再次声明。

## 待确认假设

- MVP 默认只展示当前 period；历史月份切换后续单独做。
- `Credit` 优先从现有 `roster_flight` / `pairing` 可读字段计算；不可确认时显示 `--`。
- `Premium` 当前没有可靠来源时显示 `--`，不模拟。
- Reason Report 入口保留，但在 `pbs_award_result` / `pbs_award_item` 无数据时不可用。
