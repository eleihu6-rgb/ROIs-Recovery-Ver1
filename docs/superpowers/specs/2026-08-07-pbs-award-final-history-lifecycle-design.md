# PBS Award Final 生命周期与历史查看设计

## 1. 背景

当前系统已经具备以下基础能力：

- Live `roster_period` 统一维护 Roster 范围、Bid Open、Bid Close 和 Award Publish。
- Live 发布成功后写入 `schedule_publish_record.published=1`。
- PBS Server 只有在到达 `pbs_award_publish_at` 且存在与 Crew、Base、Division、Fleet、Roster Period 完整匹配的成功发布记录时，才展示 Award。
- Current Bid Period 与 Current Award Period 已分离。
- Award 页面能够读取 `roster_publish`，展示已发布的排班结果。

AA 指南明确区分三个业务时间点：

- Award 发布到 PBS；
- Award Final，并进入运营 Crew Portal；
- mis-award 申报截止。

本项目的具体日期不照搬 AA 固定日期，而是在 Live 的同一条 `roster_period` 中配置。本期同时补充历史 Award 查看：组员可以查看当前已发布 Award，也可以按 Period 查看以前已发布的 Award。

## 2. 目标

1. 在 Live Period 配置中增加 Award Final 和 mis-award 截止时间。
2. 明确 `Award Publish -> Final -> Mis-award Closed` 生命周期。
3. 当前 Period 尚未发布时，Award 页面继续显示最近一个可查看的历史 Award，而不是显示空白或未来结果。
4. 当前 Period 发布成功后，Award 页面立即切换到当前结果；到达 Final 时间后只改变生命周期状态，不替换 Award 内容。
5. 组员能够通过稳定的 `rosterPeriodId` 查看以前已发布的 Award。
6. 未发布、配置不完整或不属于当前 Crew 的 Award 不能通过历史接口访问。

## 3. 非目标

- 本期不实现 mis-award 申报表单、处理后台、审批或通知。
- 本期不实现同一 Period 内不同发布批次的历史快照浏览。
- 本期不修改 PBS 优化算法。
- 本期不解决 Award Tier、P1-P7/PN/CN、完整 Reason Report 或 PRM 的上游数据阻塞。
- 本期不实现独立运营 Crew Portal；`Final` 只形成清晰状态和后续系统可消费的门禁。
- 本期不从 `schedule_publish_record` 还原旧批次的完整 Award 内容。Award 明细仍只读取当前发布快照 `roster_publish`。

## 4. AA 时间点与本项目字段映射

| AA 含义 | 本项目字段 | 本项目行为 |
|---|---|---|
| Award 发布到 PBS | `pbs_award_publish_at` | 到时且发布成功后，PBS Portal 可查看本期 Award |
| Award Final / 进入运营 Crew Portal | `pbs_award_final_at` | 同一份 Award 状态变为 Final，供后续运营流程使用 |
| mis-award 申报截止 | `pbs_mis_award_deadline_at` | 到时后状态变为 Mis-award Closed；本期不提供申报表单 |

这些时间均为 Crew Base 当地墙上时间，继续沿用现有 Period Base-local 解释规则。Portal 不按浏览器时区重新解释，也不硬编码 AA 的日期或 DFW 时区。

## 5. 数据模型

### 5.1 `roster_period` 新字段

在 Live `roster_period` 增加：

```sql
pbs_award_final_at          timestamp without time zone
pbs_mis_award_deadline_at   timestamp without time zone
```

字段含义：

- `pbs_award_final_at`：Award 正式 Final 的 Crew Base 当地墙上时间。
- `pbs_mis_award_deadline_at`：mis-award 申报截止的 Crew Base 当地墙上时间。

不新增第二套 PBS Period 表，也不把这两个字段放入 `schedule_publish_record`。计划时间属于 Period 配置；实际发布事实仍属于 `schedule_publish_record`。

### 5.2 时间顺序校验

完整配置必须满足：

```text
pbs_bid_open_at < pbs_bid_close_at
pbs_bid_close_at <= pbs_award_publish_at
pbs_award_publish_at <= pbs_award_final_at
pbs_award_final_at < pbs_mis_award_deadline_at
```

边界语义：

- `businessNow == pbs_award_publish_at` 时允许进入发布判断。
- `businessNow == pbs_award_final_at` 时进入 `FINAL`。
- `businessNow == pbs_mis_award_deadline_at` 时进入 `MIS_AWARD_CLOSED`。

字段级错误必须绑定对应控件，不返回原始 SQL、Axios 或异常文本。

### 5.3 Migration 与历史数据

- 新 Migration 只增加字段、注释和必要索引，不修改旧 Migration。
- 两列先以 nullable 方式 expand，保证 Migration 幂等。
- 应用切换为严格生命周期前，开发、SIT、UAT 必须核对所有需要展示的历史 Period。
- 不根据 AA 的 18/20/24 日或固定天数自动猜测历史值。
- 管理员必须通过 Period 管理页面确认历史 Period 的 Final 和截止时间。
- 配置缺失的 Period 标记为 `UNCONFIGURED`，不得伪装成 Final。
- 本项目尚未正式上线，不保留旧的隐式生命周期 fallback；环境数据未补齐时应明确报错。

## 6. 生命周期状态

PBS Server 返回以下 Award 生命周期状态：

```ts
type PbsAwardLifecycleStage =
  | "UNCONFIGURED"
  | "SCHEDULED"
  | "PUBLISH_PENDING"
  | "PUBLISHED"
  | "FINAL"
  | "MIS_AWARD_CLOSED";
```

判断顺序如下：

1. 必要配置缺失：`UNCONFIGURED`。
2. `businessNow < pbs_award_publish_at`：`SCHEDULED`。
3. 已到 Award Publish，但没有匹配的成功发布记录：`PUBLISH_PENDING`。
4. 已成功发布，且 `businessNow < pbs_award_final_at`：`PUBLISHED`。
5. 已成功发布，且 `pbs_award_final_at <= businessNow < pbs_mis_award_deadline_at`：`FINAL`。
6. 已成功发布，且 `businessNow >= pbs_mis_award_deadline_at`：`MIS_AWARD_CLOSED`。

关键门禁：

- 时间到达不能替代真实发布。
- 即使 Final 或截止时间已经到达，只要没有成功发布记录，仍然是 `PUBLISH_PENDING`。
- `PUBLISHED`、`FINAL`、`MIS_AWARD_CLOSED` 都允许 Crew 查看该 Period 的 Award。
- `SCHEDULED`、`PUBLISH_PENDING`、`UNCONFIGURED` 不允许读取该 Period 的 Award 明细。

## 7. 当前 Award 与历史 Award 解析

### 7.1 默认显示规则

Award 页面默认展示“当前可查看 Award”，解析规则为：

1. 仅考虑已经到达 `pbs_award_publish_at` 且存在成功发布记录的 Period。
2. 按 `pbs_award_publish_at DESC, roster_period.id DESC` 选择最近一条。
3. 当前新 Period 尚未发布时，默认继续显示上一个已发布 Period。
4. 当前新 Period发布成功后，默认立即切换到该 Period。
5. Final 只改变状态，不改变默认选择，也不重新加载另一份业务结果。

为了避免用户误以为仍在查看本月结果，默认响应同时返回最近的候选 Period：

```ts
type PbsAwardUpcomingPeriod = {
  rosterPeriodId: number;
  periodCode: string;
  lifecycleStage: "SCHEDULED" | "PUBLISH_PENDING" | "UNCONFIGURED";
  awardPublishAt: string | null;
  awardFinalAt: string | null;
};
```

例如 Jun 尚未发布而页面显示 May 时，Portal 显示：

```text
Showing May 2026. Jun 2026 Award is awaiting publication.
```

候选 Period 的确定顺序必须固定，不能受数据库返回顺序影响：

1. 只考虑比当前显示 Award 更新的 Period。
2. 优先选择计划发布时间已经到达但尚未成功发布的最近 Period，状态为 `PUBLISH_PENDING`。
3. 没有待发布 Period 时，选择计划发布时间最近的未来 Period，状态为 `SCHEDULED`。
4. 两者都没有时，才返回最近一个必要时间缺失的 Period，状态为 `UNCONFIGURED`。
5. 同类候选按计划时间确定性排序；未来 Period 取最早即将到达的一条，已到时间的待发布 Period 取最近计划发布的一条，最终以 `roster_period.id` 打破并列。

### 7.2 历史 Period 列表

新增只读历史列表接口，返回当前 Crew 有权查看的已发布 Period：

```text
GET /api/award/periods
```

列表项至少包含：

```ts
type PbsAwardPeriodListItem = {
  rosterPeriodId: number;
  periodCode: string;
  rpStart: string;
  rpEnd: string;
  lifecycleStage: "PUBLISHED" | "FINAL" | "MIS_AWARD_CLOSED";
  awardPublishAt: string;
  awardFinalAt: string;
  misAwardDeadlineAt: string;
  firstPublishedAt: string;
  latestPublishedAt: string;
};
```

规则：

- 只返回该 Crew 的 Base、Division、Fleet 和 Crew ID 均匹配成功发布记录的 Period。
- 按真实 `rp_start DESC, id DESC` 排序。
- 不返回 `SCHEDULED`、`PUBLISH_PENDING`、`UNCONFIGURED` Period。
- Period Code 只用于展示，选择和查询必须使用稳定 `rosterPeriodId`。
- 历史列表不是同一 Period 的发布批次列表。

### 7.3 指定历史 Award

新增按稳定 Period ID 查询的只读接口：

```text
GET /api/award/periods/:rosterPeriodId
```

服务端必须重新验证：

- 当前认证 Crew；
- Period 是否存在；
- 是否到达 Award Publish；
- 是否存在完全匹配的成功发布记录；
- 是否属于允许查看的生命周期状态。

明细查询的身份规则：

- `roster_publish` 当前没有 `roster_period_id`，因此先用 `rosterPeriodId` 解析权威 `rp_start/rp_end`，再按该真实范围读取 Crew 的发布快照；不得由 `periodCode` 推算月份。
- `pbs_award_result` 已有 `roster_period_id`，必须改为按 `roster_period_id + crew_id` 查询；不得继续使用 `period_code + crew_id` 作为历史结果身份。
- 默认 Award 与指定历史 Award 必须走同一个 `rosterPeriodId -> Period Context -> 明细` 服务入口。
- 读取 `roster_publish` 时保留现有 Period 首尾缓冲窗口，以完整加载跨边界 Duty/Pairing；最终仍由 Award Mapper 按权威 `rp_start/rp_end` 裁剪，不能把缓冲区中的相邻 Period 独立任务串入当前 Award。

客户端传入不存在、未发布或无权限的 Period 时，不得自动回退到默认 Award，避免用户误以为查询成功。

建议错误语义：

- Period 不存在：`404 AWARD_PERIOD_NOT_FOUND`。
- Period 尚不可查看：`409 AWARD_NOT_AVAILABLE`。
- 发布范围与 Crew 不匹配：对外仍返回 `404`，避免泄露其他 Crew 或范围的发布信息。

## 8. Live Period 管理页面

新建和编辑弹窗字段顺序：

```text
Period Code        Roster Start
Roster End         Bid Open
Bid Close          Award Publish
Final At           Mis-award Deadline
```

列表增加：

- Award Publish
- Final At
- Mis-award Deadline
- First Published At / Latest Published At（只读，沿用现有发布信息）
- 当前计算状态

管理页面只维护计划时间，不允许手工把 Period 标记为 Published 或 Final。Published 必须来自真实发布记录；Final 和截止状态由业务时间自动计算，不写回静态状态字段。

年度批量生成本期不猜测 Final 和截止时间。若生成流程不能取得管理员输入的两个时间，则生成结果必须明确标记为不完整，并要求管理员补齐后才能用于 Award 生命周期。

## 9. PBS Portal Award 页面

### 9.1 页面默认行为

- 页面加载时请求历史 Period 列表和默认可查看 Award。
- 有当前可查看 Award 时展示 Award 内容。
- 新 Period 尚未发布但存在历史 Award 时，展示历史 Award，并显示候选 Period 提示。
- 没有任何可查看 Award 时，展示页面级稳定状态，不显示空的业务卡片或旧缓存数据。

### 9.2 历史选择器

- 在 Award 页标题区域增加 Period 选择器。
- 默认选中 Server 返回的最近可查看 Period。
- 选项显示 `periodCode`，辅助信息显示真实 `rpStart-rpEnd`。
- 选择后使用 `rosterPeriodId` 请求对应 Award。
- 切换期间清除旧 Award 内容并展示与现有布局一致的骨架屏，避免把旧 Period 数据误认为新选择结果。
- 请求失败时保留选择器和恢复操作，但不继续展示错误 Period 的旧内容。

### 9.3 状态文案

建议状态文案：

- `PUBLISHED`：`Published · Not final`
- `FINAL`：`Final`
- `MIS_AWARD_CLOSED`：`Final · Mis-award window closed`
- 候选 Period 等待发布：`<Period> Award is awaiting publication.`
- 候选 Period 尚未到计划时间：`<Period> Award will be available on <Base Local Time>.`

本期不展示不可点击的 mis-award 按钮，也不伪造尚未实现的申报入口。

## 10. 数据流

```text
Live Period Admin
  -> roster_period.pbs_award_publish_at
  -> roster_period.pbs_award_final_at
  -> roster_period.pbs_mis_award_deadline_at

Live Publish
  -> roster_publish / roster_publish_adjust
  -> schedule_publish_record.published=1

PBS Server
  -> 按 Crew Base-local businessNow 计算生命周期
  -> 通过 schedule_publish_record 验证发布事实和访问范围
  -> 从 roster_publish 读取指定 rosterPeriodId 对应范围的 Award

PBS Portal
  -> 默认显示最近可查看 Award
  -> 使用 rosterPeriodId 切换历史 Award
  -> 展示 Published / Final / Closed 状态
```

共享 Contract 必须冻结三类响应的统一字段：默认 Award、历史 Period 列表、指定历史 Award 都使用同一套 `rosterPeriodId`、`periodCode`、真实 RP 范围、生命周期状态和三个计划时间。历史详情错误码固定使用 `AWARD_PERIOD_NOT_FOUND` / `AWARD_NOT_AVAILABLE`，Portal 不根据错误文案字符串判断行为。

## 11. 安全与一致性

- Award 接口只能读取当前认证 Crew 自己的结果。
- 不在日志、错误文案或客户端响应中暴露其他 Crew、发布条件、SQL 或内部路径。
- History query key 必须包含 `rosterPeriodId`，避免跨 Period 缓存污染。
- 默认 Award 和指定历史 Award 必须复用同一个明细加载服务，不能形成两套 Mapper。
- `schedule_publish_record` 是发布事实和访问门禁，不是 Award 明细来源。
- 不能根据 `roster_publish` 中存在零散行推断发布成功。
- 同一 Period 重复发布后，页面读取当前 `roster_publish` 快照；本期不声称能够查看旧批次内容。

## 12. 错误处理

- Live 字段校验错误显示在对应时间控件旁。
- Award 页面无历史结果时使用页面级空状态。
- 指定历史 Period 请求失败时使用页面级错误状态并提供 Retry。
- 短暂的用户操作失败通过项目统一消息入口提示。
- 不向用户展示原始 PostgreSQL、Axios、Fastify 或异常堆栈。
- 重复失败不得无限弹 Toast；持续失败升级为页面级错误状态。

## 13. 测试设计

### 13.1 Live Server

- Migration 在字段不存在和已经存在时均可安全执行。
- Period 新建、编辑、列表返回两个新字段。
- 四段时间顺序逐项验证，并关联到正确控件字段。
- 配置缺失时状态明确为不完整。
- 管理员不能通过 Period API 伪造 Published 或 Final。

### 13.2 PBS Server

- Award Publish 前默认返回上一个已发布 Period。
- 当前 Period 到达 Award Publish 但发布记录缺失时，仍返回上一个 Award，并同时返回候选 `PUBLISH_PENDING` 信息。
- 当前 Period 发布成功后立即成为默认 Award，状态为 `PUBLISHED`。
- `businessNow == Final At` 时状态为 `FINAL`。
- `businessNow == Mis-award Deadline` 时状态为 `MIS_AWARD_CLOSED`。
- Final 时间已到但发布失败时仍为 `PUBLISH_PENDING`。
- 历史列表只包含当前 Crew 有权查看的已发布 Period。
- 按 `rosterPeriodId` 查询成功、404、409和跨 Crew 隔离均有覆盖。
- 历史 Award 明细仍只读取 `roster_publish`。

### 13.3 PBS Portal Vitest

- 历史选择器默认选中最近可查看 Period。
- 显示候选新 Period 的等待发布提示。
- `PUBLISHED`、`FINAL`、`MIS_AWARD_CLOSED` 文案正确。
- 切换 Period 时旧内容不会继续显示。
- 空历史、请求失败和 Retry 状态正确。

### 13.4 Playwright

至少覆盖一条真实用户流程：

1. 将业务时间设置在新 Period Award Publish 前，登录 Crew，默认看到上一个 Award。
2. 验证历史选择器可以查看更早的已发布 Award。
3. 将业务时间推进到 Award Publish，并准备匹配的成功发布记录；刷新后默认切换到新 Award，状态为 `Published · Not final`。
4. 将业务时间推进到 Final At；同一 Award 内容保持不变，状态变为 `Final`。
5. 将业务时间推进到截止时间；状态变为 `Final · Mis-award window closed`。
6. 直接请求未发布或其他 Crew 的 Period，不能获得 Award 数据。

### 13.5 远端数据库与发布验证

- 开发、SIT、UAT 分别核对新字段、列类型和空值。
- 使用真实 `schedule_publish_record` 验证默认 Award 与历史列表。
- 使用特殊非自然月 RP 验证历史详情范围仍取 `rp_start/rp_end`。
- Migration 的执行和环境数据回填必须单独记录，不因代码完成自动视为已执行。

## 14. 验收标准

1. Live 可以配置 Award Publish、Final 和 mis-award Deadline。
2. 生命周期完全由 Base-local 业务时间和真实发布记录计算。
3. 当前 Period 未发布时，组员仍能看到最近一个已发布 Award，并明确知道新 Period 尚未发布。
4. 当前 Period 发布成功后立即在 PBS Portal 展示；Final 时只改变状态。
5. 组员能按 `rosterPeriodId` 查看以前已发布的 Award。
6. 未发布和无权限 Period 无法通过历史接口读取。
7. 不实现或伪造 mis-award 表单。
8. 不声称支持同一 Period 的发布批次历史。
9. Live、PBS Server、PBS Portal 自动化测试及关键 Playwright 流程通过。
10. 前端 UI Standard 检查和相关模块 build 通过。

## 15. 实施顺序

1. 增加幂等 Migration、Live Model、Contract 和 Period Admin 字段。
2. 在开发、SIT、UAT 核对并补齐需要展示的 Period 时间配置。
3. 扩展 PBS Server 生命周期 resolver。
4. 增加历史 Period 列表和指定 Period Award API，并复用现有 Award Mapper。
5. 增加 Portal 历史选择器、候选 Period 提示和状态展示。
6. 补齐后端、Portal Vitest、Playwright 和 QA 文档。
7. 完成“配置 -> 发布 -> Published -> Final -> Closed -> 历史查看”SIT smoke。

## 16. Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: Live、PBS Server、Portal 和测试具备明确模块边界，可以在共享 Contract 冻结后并行实施。
- Suggested split:
  - Agent A：SQL Migration、Live Model、Period Admin API 和管理页面。
  - Agent B：PBS Server 生命周期、历史列表和历史详情 API。
  - Agent C：PBS Portal 历史选择器、状态和 Playwright。
- Write boundaries: Agent A 只写 `sql/`、`live-server/`、`gantt/`；Agent B 只写 `pbs-server/` 与 Award Contract；Agent C 只写 `pbs-portal/` 和目标 E2E。共享 Contract 由主 Agent 先冻结并统一集成。
- Conflict risk: 中等。Contract、测试 fixture 和 Award 状态命名是主要冲突点。
- Execution gate: 用户审核并批准本 Spec，实施计划明确写边界后才能启动并行实现。

## 17. 残余风险

- 现有历史 Period 缺少 Final 和截止时间，需要管理员确认，不能自动猜测。
- `roster_publish` 不保存同一 Period 的每个发布批次内容，因此历史功能只能按 Period 查看。
- 如果后续运营 Crew Portal 需要独立同步，必须另写集成 Spec，不能仅依赖状态文案。
- mis-award 申报数据模型、入口和处理流程仍待独立设计。
