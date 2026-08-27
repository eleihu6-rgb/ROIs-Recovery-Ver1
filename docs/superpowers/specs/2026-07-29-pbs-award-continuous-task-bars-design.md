# PBS Award 同任务连续时间条设计

> 日期：2026-07-29
> 状态：已批准并实施
> 范围：PBS Award 月历事件归并与连续时间条展示
> 不包含：Award 上游 Tier、PRM、原因数据等既有阻塞项

## 1. 背景

Award 月历已经支持按 Crew Base Local Time 将单个事件的真实开始、结束时刻映射到横向 24 小时时间轴。同一个 `PbsAwardCalendarEvent` 跨越多个日期时，前端能够在同一周内绘制为一条跨日色带，并在跨周时拆成周段。

当前页面仍会出现视觉上断开的连续任务，主要原因不是前端缺少跨日坐标能力，而是 Award API 当前将部分发布排班拆成了多个独立 Calendar Event：

- Pairing 按 `pairing_id` 聚合，通常已经是一个完整事件。
- Day Off 按本地日期分组，因此连续多天的 DO 会成为多个事件。
- VAC、ILL、CGS、CBT 等 Activity 按“本地日期 + 任务代码”分组，因此连续多天的同类任务也会成为多个事件。

例如 `Jun 22–26 VAC` 在 `Roster Details` 中合理地保留每天一行、每天各自的 Credit，但在月历上应表达为一个连续的 VAC 时间段，而不是五个彼此留有间隔的黄色块。

## 2. 已确认需求

1. 月历只连接同一个真实任务或同一个连续地面任务段。
2. 同一个 Pairing 跨日时，从真实开始时刻连续画到真实结束时刻。
3. Pairing 必须使用相同 `pairing_id`；不同 Pairing Number / `pairing_id` 不连接，即使时间相邻。
4. VAC、ILL、CGS、CBT、DO 等没有 `pairing_id` 的任务，在任务类型相同且真实时间连续、重叠，或只有发布数据的 1 分钟边界差时，月历合并成连续色带。
5. 不同任务类型不连接，例如 ILL 后接 DO 仍显示为两个事件。
6. 相同任务类型但中间存在真实时间空档时不连接。
7. Calendar 的视觉合并不得改变 `Roster Details` 明细、Duty 数量、Days Off 数量、Credit、Block 或其他业务汇总。
8. 所有时间继续使用当前 Award 已建立的 Crew Base Local Time 口径。

## 3. 目标

- `Jun 10 12:00 → Jun 12 13:00` 的同一个 Pairing 在同一周内显示为一条连续蓝色时间条。
- `Jun 22–26 VAC` 等连续地面任务在月历上显示为一条连续黄色时间条。
- 连续 DO 显示为一条连续绿色时间条。
- 色带的起点、终点仍按真实小时和分钟在日期格中的比例定位。
- 跨周时按周行拆段，但每一段应明确表现为同一个任务的延续。
- 不因文字相同、颜色相同或日期相邻而错误连接不同任务。

## 4. 非目标

- 不合并或删除 `roster_publish` 行。
- 不改变 Award `items` 的业务粒度。
- 不改变每日日历以外的 Roster Details 展示。
- 不重新计算 Credit、Block、TAFB、Days Off 或 Duties。
- 不新增数据库字段或 Migration。
- 不修改 Live 发布流程或优化算法。
- 不修改 Dashboard / Bidding Calendar 的数据和交互。
- 不处理 Award Tier、PRM、Pairing Priority、获得原因或未获得原因等上游阻塞。

## 5. 方案比较

### 方案 A：前端按 Label 和日期直接拼接

前端看到相邻的 `VAC`、`DO` 或同名 Pairing 后直接合并色块。

优点：

- 改动集中在 Portal。

缺点：

- Label 只是展示文字，不是业务身份。
- 可能错误连接两个不同 Pairing 或两个独立但同名的任务。
- 前端需要重新承担业务归并规则。

结论：不采用。

### 方案 B：数据库增加统一 `task_id`

为 Pairing 和所有地面任务增加统一的发布任务标识，再严格按该字段合并。

优点：

- 长期身份最明确。

缺点：

- 需要 Schema、Migration、Scenario / Live / Publish 全链路改造。
- 当前 Pairing 已有 `pairing_id`，连续地面任务也可根据已发布的类型和时间安全形成 Calendar-only run。
- 为一个视觉展示问题扩大数据模型不符合 Minimal-First。

结论：本阶段不采用；如果将来业务要求区分“时间完全相邻但属于两个独立申请”的同类地面任务，再单独设计权威 `task_id`。

### 方案 C：服务端构建 Calendar-only 连续 Run

保持 `items` 和明细不变，在 `pbs-server` 生成 `calendar.events` 时按受控规则合并连续地面任务；Pairing 继续按 `pairing_id` 保持独立。Portal 继续使用现有横向 24h Segment 算法绘制。

优点：

- 合并规则位于 Award 数据 Mapper，所有客户端获得一致结果。
- 不改变发布快照和业务汇总。
- 复用现有 Base Local Time 与跨日时间条能力。
- 改动范围最小，可用后端与 Playwright 测试完整验证。

结论：采用方案 C。

## 6. 数据职责与边界

### `items`

`PbsAwardCurrentResponse.items` 保持现有粒度：

- Pairing：一个 `pairing_id` 对应一个 Pairing item。
- Day Off：继续保留现有每日 item。
- Activity：继续保留现有每日 / 发布任务 item。

Roster Details、Selected Duty、Summary 和 Credit 均继续使用 `items`，不读取合并后的 Calendar Event 反推业务结果。

### `calendar.events`

`PbsAwardCurrentResponse.calendar.events` 是只读展示模型，可以将多个连续地面任务区间归并为一个 Calendar Event。

Calendar Run 不能只从已经归组完成的公开 `items` 反推。当前 Day Off 按日期、Activity 按“日期 + 代码”构建 item，同一天同代码的多条原始任务可能已经被压缩成一个最早开始到最晚结束的区间；如果这些原始任务中间存在空档，item 已无法还原空档。

因此 Mapper 必须从同一批 `AwardRosterRow` 并行构建两套内部结果：

```text
roster_publish rows
  ├→ Award items（现有业务明细归组，不改变）
  └→ Calendar interval candidates（保留每条原始可靠区间）
       → Calendar-only continuous runs（仅月历合并）
       → Award horizontal time segments（按周绘制）
```

Calendar interval candidate 是服务端内部类型，不进入共享 API Contract，至少包含：

- 来源 Row / Owner Item 的稳定标识；
- `pairing_id`；
- Award 类型；
- 规范化任务代码与 Label；
- Tone；
- 显式 UTC 开始、结束时刻；
- 转换后的 Base Local 开始、结束日期时间；
- 时间是否可靠。

这样既能保持公开 `items` 不变，也能识别“同一天、同一代码、两个区间中间存在空档”的情况。

## 7. 同一任务判断规则

### 7.1 Pairing

Pairing 的权威身份是 `pairing_id`：

- 相同 `pairing_id` 的航段先按现有逻辑聚合为一个 Pairing item。
- Calendar 使用该 Pairing item 的最早开始时间和最晚结束时间。
- 不同 `pairing_id` 永不合并。
- Pairing Label / Number 相同不能替代 `pairing_id`。
- 不同 Pairing 即使一个结束时刻等于另一个开始时刻，也必须显示为两条。

### 7.2 Day Off

Day Off 使用规范化类型 `day_off:DO` 作为 Calendar Run Key。

相邻 Day Off candidate interval 仅在以下条件同时成立时合并：

1. 两者都属于 `day_off`；
2. 前一项结束时间与后一项开始时间相等、两个时间区间发生重叠，或间隔不超过发布数据使用的 1 分钟边界差；
3. 开始、结束时间均为可靠的 Base Local Time。

如果中间存在时间空档，则开始新的 DO Calendar Run。

### 7.3 Activity / Leave

VAC、ILL、CGS、CBT 等 Activity 使用规范化任务代码形成 Calendar Run Key：

```text
activity:<normalized assignment code>
```

任务代码的优先级沿用现有 Mapper 口径：

1. `assignment`
2. `assignment_group`
3. `label`

只有 Run Key 相同，且真实时间连续、重叠，或间隔不超过 1 分钟发布边界差，才允许合并。

示例：

- VAC 接 VAC，前后时间连续：合并。
- VAC 接 VAC，中间相隔 8 小时：不合并。
- VAC 接 ILL：不合并。
- CGS 接 CBT：不合并。

### 7.4 时间缺失

Calendar 归并不得捏造时间：

- “可靠时间”必须来自该发布行显式存在且可成功解析的 `start_utc` 和 `end_utc`。
- 两个 UTC 时刻都必须是有限值，并且 `end_utc > start_utc`。
- Base Local 转换后的日期和 `HHMM` 必须完整有效。
- 仅由 `flt_dt` fallback 合成的午夜不属于可靠时间，不能参与连续 Run 合并。
- `end_utc` 缺失时，不得用开始时间代替结束时间参与合并。
- 倒序或零长度区间不参与合并。
- 一个现有公开 item 的贡献行只要包含不可靠区间，该 item 就不参与跨 item 合并，避免同时生成 fallback Event 和部分可靠 Event 造成重复。
- 不可归并的 item 仍按现有 Calendar fallback 规则独立展示，但该 fallback 仅保证内容可见，不代表真实连续时长。
- 不使用 Credit Minutes 推断任务持续时长。
- 不因为日期连续就默认任务全天连续。

上述可靠性只保存在 Mapper 内部的 Calendar interval candidate，不扩展公开 Contract。

## 8. 连续区间算法

服务端先从原始 `AwardRosterRow` 构建 Calendar interval candidates，再将 Base Local Date + Time 转为可比较的本地分钟索引，仅用于 Calendar Run 的排序和区间比较。

### Pairing

1. 仅将 `pairing_id` 相同的可靠候选区间归入同一个 Pairing Event。
2. Event 开始为该 Pairing 最早可靠开始时刻，结束为最晚可靠结束时刻。
3. Pairing 内航段、Duty 或 Layover 之间的空档属于同一个 Pairing 的完整占用区间，不拆开。
4. 如果该 Pairing 存在不可靠时间行，则沿用现有 Pairing item 的独立 Event fallback，不与其他 Pairing 合并。
5. 不同 `pairing_id` 无论时间是否相接，都不进入同一个 Run。

### Day Off / Activity

1. 按 Run Key 分组。
2. 同一个公开 item 的所有贡献行均具备可靠时间时，保留这些原始候选区间参与归并；不能先用 item 的最早开始和最晚结束覆盖中间空档。
3. 每组按开始时间、结束时间、稳定来源 ID 排序。
4. 以第一项建立当前 Run。
5. 如果下一项满足 `next.start - current.end <= 1 minute`，将当前 Run 的结束时间扩展为两者结束时间最大值。
6. 如果 `next.start - current.end > 1 minute`，结束当前 Run 并创建新 Run。
7. Run 的 Tone 和 Label 取规范化任务类型对应的现有视觉值。
8. Run ID 必须稳定，并包含类型、代码、真实区间和第一个稳定来源 ID，避免 React Key 随输入顺序变化或同区间碰撞。稳定来源 ID 的取值优先级为 `roster_id → publish_id → 基于规范化候选字段生成的 deterministic fallback`。

例如同一天存在：

```text
VAC 00:00 → 04:00
VAC 12:00 → 16:00
```

虽然现有业务 item 可能仍按当天 VAC 显示一行，但 Calendar 必须保留为两段，不能错误画成 `00:00 → 16:00` 的连续 VAC。

Calendar Run 的构建不得依赖数据库返回顺序。

这里的 1 分钟不是业务时长配置，而是发布快照的边界表达兼容：真实开发数据中的整日 DO 常使用前一天 `00:00` 结束、下一天 `00:01` 开始。该容差只用于同 Run Key 的 Calendar 视觉连续性，不能扩大为更长时间，也不能跨任务类型使用。

## 9. 前端绘制

### 同一周

现有 `buildAwardCalendarSegments` 已能将一个跨日 Calendar Event 映射为同一周行上的一个 Segment：

- `startOffset` 按开始日期和分钟比例计算；
- `endOffset` 按结束日期和分钟比例计算；
- Segment 横跨中间日期格；
- 仅真实开始和结束位置保留左右 inset。

例如 `Jun 10 12:00 → Jun 12 13:00`：

- 起点位于 Jun 10 日期格的 50%；
- 完整跨过 Jun 11；
- 终点位于 Jun 12 日期格约 54.17%；
- 页面呈现为一条蓝色实心条。

### 跨周

CSS 月历不能使用一个绝对定位元素跨越两个 week row，因此仍按周拆成多个 Segment：

- 第一周段从真实开始时间延伸到周末右边界；
- 中间周段覆盖整周；
- 最后一周段从周首左边界延伸到真实结束时间；
- 延续端不应出现会误导为任务结束的额外留白或独立圆角；
- Title 和 ARIA Label 始终描述原始完整任务区间。

为避免把“真实端点刚好位于周边界”误判成“被周边界裁剪的延续端”，`AwardCalendarSegment` 增加两个仅供 Portal 内部使用的明确标志：

```ts
continuesBefore: boolean;
continuesAfter: boolean;
```

计算规则：

- `continuesBefore = segmentStartMinuteIndex > eventStartMinuteIndex`
- `continuesAfter = segmentEndMinuteIndex < eventEndMinuteIndex`

组件规则：

- 只有真实开始端应用左侧 inset 和左圆角。
- `continuesBefore` 的延续端贴到周首边界并使用方角。
- 只有真实结束端应用右侧 inset 和右圆角。
- `continuesAfter` 的延续端贴到周末边界并使用方角。
- 不从 Label 文本、`startOffset === 0` 或 `endOffset === 7` 反推延续状态。
- 一个真实端点恰好落在周首 / 周末时，continuation flag 仍为 `false`，保留真实端点视觉。

### Label

- 同一周的长条显示一次任务代码，例如 `VAC`、`DO`、`T4520`。
- 条宽不足时允许截断文字，但完整任务和时间必须保留在 `title` / `aria-label`。
- 不在每个日期格重复绘制同一 Label。

### Conflict

Calendar-only 合并后继续使用现有真实时间区间进行 Lane 和 Conflict 检测：

- 同一个已合并 Run 不与自身冲突。
- 不同事件区间真实重叠时分配不同 Lane，并保留 Conflict 视觉。
- 只是在日期上相邻但时间不重叠，不显示 Conflict。

## 10. API 与 Contract

本次不改变公开字段结构：

- `PbsAwardCurrentResponse.items` 不变。
- `PbsAwardCurrentResponse.calendar.events` 字段结构不变。
- 一个合并后的地面 Calendar Event 仍使用现有：
  - `id`
  - `type`
  - `label`
  - `startDate`
  - `endDate`
  - `startTime`
  - `endTime`
  - `tone`
  - `readonly`
  - `metadata`

只改变 `calendar.events` 的事件数量和连续地面任务的起止区间语义。

## 11. 视觉示例

### 连续 VAC

输入明细：

```text
Jun 22 00:00 → Jun 23 00:00  VAC
Jun 23 00:00 → Jun 24 00:00  VAC
Jun 24 00:00 → Jun 25 00:00  VAC
Jun 25 00:00 → Jun 26 00:00  VAC
Jun 26 00:00 → Jun 27 00:00  VAC
```

Roster Details：

```text
Jun 22 VAC
Jun 23 VAC
Jun 24 VAC
Jun 25 VAC
Jun 26 VAC
```

Award Calendar：

```text
Jun 22 00:00 ━━━━━━━━━━━━━━━━━━━━━━━━━ Jun 27 00:00
                 VAC
```

### 不同 Pairing

```text
Pairing A：Jun 10 12:00 → Jun 11 10:00
Pairing B：Jun 11 10:00 → Jun 12 13:00
```

即使两个时间首尾相接，因为 `pairing_id` 不同，仍显示为两条独立蓝色条。

## 12. 错误与异常处理

- API 不因单条事件时间异常导致整个 Award 页面失败。
- 无法解析时间的 item 保留在业务明细中，Calendar 不做不安全合并。
- 不向用户暴露原始日期解析异常、SQL 或内部字段。
- 本次是只读展示，无新增 Toast 或错误弹窗。
- 重复或乱序发布行通过稳定排序处理，不能因数据库返回顺序改变合并结果。

## 13. 测试设计

### pbs-server

为 Award Mapper 增加或更新测试：

1. 相同 `pairing_id` 的多航段生成一个跨日 Pairing Calendar Event。
2. 不同 `pairing_id` 即使 Label 相同、时间首尾相接，也生成两个 Event。
3. 连续五天 VAC 的 `items` 保持五条，`calendar.events` 合并为一条。
4. 连续 DO 合并为一条绿色 Event。
5. VAC 与 ILL 不合并。
6. 相同 VAC 中间存在时间空档时不合并。
7. 时间区间重叠的同类地面任务合并为区间并集。
8. 同一天、同一任务代码的两个区间中间有空档时，公开 item 口径保持现状，但 Calendar 仍生成两段。
9. 仅有 `flt_dt` fallback、缺少结束、倒序或零长度的任务不参与合并。
10. 一个 item 混合可靠与不可靠来源行时，不产生重复 Calendar Event。
11. Summary、Credit、Days Off、Duties 不因 Calendar 合并改变。
12. 输入顺序变化时生成稳定一致的 Calendar Event。

### pbs-portal

更新 Award 页面测试：

1. `Jun 10 12:00 → Jun 12 13:00` 在同一周生成一个 Segment。
2. Segment 的 `startOffset` 和 `endOffset` 精确落在 12:00 与 13:00 比例。
3. 连续 VAC 仅生成一个跨日黄色 Segment。
4. 不同 Pairing Event 生成两个独立蓝色 Segment。
5. 跨周任务按周拆段，并在延续边界没有误导性的内部端点留白。
6. `continuesBefore` / `continuesAfter` 只标记真正被周边界裁剪的段。
7. 真实端点恰好位于周首或周末时，不被误标为 continuation。
8. Title / ARIA Label 保留完整任务区间。
9. 真实重叠事件的 Conflict 行为不回归。

### Playwright

必须使用真实 Award 页面验证：

1. 登录开发环境并进入 `/award`。
2. 选择包含连续 VAC / DO 和跨日 Pairing 的已发布数据。
3. 验证连续 VAC 视觉为一条色带，Roster Details 仍逐日列出。
4. 验证同一个跨日 Pairing 按真实时刻跨日期。
5. 验证不同 Pairing 不连接。
6. 在 `1920×1080`、`1280×720` 下截图确认无重叠、裁切和横向溢出。
7. 确认页面不出现 `Missing`、`null`、`undefined` 等新增占位回归。

### QA 文档

新增：

```text
docs/test-cases/pbs/award/2026-07-29-award-continuous-task-bars.md
```

覆盖连续 Pairing、连续 VAC、连续 DO、不同类型、不同 Pairing、时间空档、跨周和短视口。

## 14. 验收标准

1. 同一个 Pairing 跨日显示为按真实时刻定位的一条连续蓝色条。
2. 不同 `pairing_id` 永不连接。
3. 连续 VAC、ILL、CGS、CBT、DO 按各自类型显示为连续色带。
4. 不同任务类型不连接。
5. 同类型但存在时间空档时不连接。
6. `Roster Details` 仍保留原始逐日 / 逐任务明细。
7. Credit、Block、Days Off、Duties 和其他 Summary 数值不变。
8. 跨周任务清楚表达延续关系，不在周边界制造伪结束。
9. Base Local Time、Conflict 和短视口布局不回归。
10. 后端测试、Portal 测试、Playwright、Lint、Build 和 UI Gate 均通过。

## 15. 影响范围

预计涉及：

- `pbs-server/src/services/award/award-results-mapper.ts`
- `pbs-server/src/services/award/award-results-mapper.test.ts`
- `pbs-portal/src/features/award/award-mappers.ts`
- `pbs-portal/src/features/award/types.ts`（增加内部 continuation flags）
- `pbs-portal/src/features/award/components/award-month-calendar.tsx`
- `pbs-portal/src/features/award/pages/award-page.test.tsx`
- Award Playwright 用例
- Award QA 人工测试文档

不涉及：

- `pbs-engine`
- `engine-server`
- `live-server`
- 数据库 Schema / Migration
- Dashboard / Bid 共享日历

## 16. Multi-Agent Parallelism Assessment

- Recommendation：No
- Rationale：核心改动集中在同一个 Award Event Contract、Mapper 和紧密关联的绘制测试，拆分后需要频繁协调同一数据语义，协作成本高于收益。
- Suggested split：不拆分；由一个实现者按 Server Mapper → Portal Segment → Playwright / QA 顺序完成。
- Write boundaries：仅 Award Server、Award Portal、Award 测试和 QA 文档。
- Conflict risk：多 Agent 同时修改 Award Mapper / Contract 时冲突风险较高。
- Execution gate：用户审阅并明确批准本 Spec 后才能开始实现。

## 17. Git 与实施门禁

- 本 Spec 只确认设计，不代表已经修改功能。
- 用户审阅并明确回复允许实施后，才能修改代码。
- 未获得用户当前会话的明确授权前，不执行 Git Commit。
