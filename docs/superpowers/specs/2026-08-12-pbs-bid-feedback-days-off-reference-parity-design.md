# PBS Bid Feedback Days Off 参考行为对齐设计

## 1. 状态与产品决策

- 状态：已实施并完成 focused build / test / Playwright 验证。
- 产品决策：PBS Bid Feedback 的 `Days Off` tab 行为以参考项目
  `/Users/lei/Codehub/Flair_PBS_Optimization_Report/src` 为基准。
- 参考范围：只对齐 Bid Feedback 弹窗内 `Days Off` tab 的数据语义、计数、排序和 Calendar 输入；
  不重做 Days Off 主页面的编辑体验，也不改变 Pairing `Award` / `Avoid` 的净分行为。
- 兼容决策：本项目当前 Portal 的表格视觉样式继续保留，因为前一阶段已经把三个 tab 的表格风格
  统一到 Award 表格风格；本规格只修正 `Days Off` tab 的数据来源和展示语义。
- Line Rule 决策：`Long Stretch Off / Compressed Flying` 继续作为 DaysOff 类 Line Rule 参与导出、
  summary 和 conflict 分析，但不得作为 `Days Off` tab 的日期行来源。

本规格修正并扩展
`docs/superpowers/specs/2026-08-12-pbs-bid-feedback-days-off-sort-design.md`。原排序 spec
只解决日期排序，没有解决数据来源和重复日期语义；两者冲突时以本规格为准。

## 2. 参考项目确认

参考项目生产路径为 `src/`，根级 `frontend/`、`backend/`、`python_services/` 是 legacy，不作为行为依据。

参考项目的关键行为：

- `DAYSOFF.csv` 表示 crew 的 day-off bid 日期窗口，每行只有 Award counter，没有 Avoid counter。
- “Prefer Off” 被拆成四种选择形态：specific date、date range、days of week、weekends。
- 四种形态都会在 bid month 内展开为 per-day cells。
- 展开后的 cells 以日期为 key；同一天被多个 option 命中时，只保留更强 tier，即数字更小的 tier。
- manual day-off toggle 只填补没有 option 命中的日期；option 优先于 manual。
- `Long Stretch Off / Compressed Flying` 是
  `MIN_CONSECUTIVE_DAYS_OFF_IN_WINDOW` line rule，写入 `LINE_RULES.csv`，不进入
  `DAYSOFF.csv`，也不进入 Bid Feedback 的 Days Off tab。
- Bid Feedback 弹窗的 `Days Off` tab 以编译后的 date cells 为数据源，计数等于 period 内可见
  date cells 数量。
- `Days Off` tab 不做 pairing eligibility check；它表达的是日期 off request，不是 pairing awardability。

参考代码锚点：

- `/Users/lei/Codehub/Flair_PBS_Optimization_Report/src/frontend/src/unittest/daysOffBids.ts`
- `/Users/lei/Codehub/Flair_PBS_Optimization_Report/src/frontend/src/unittest/bidFeedbackTabs.ts`
- `/Users/lei/Codehub/Flair_PBS_Optimization_Report/src/frontend/src/unittest/BidFeedbackDialog.tsx`
- `/Users/lei/Codehub/Flair_PBS_Optimization_Report/src/frontend/src/unittest/daysOffBids.test.ts`

## 3. 当前偏离

当前 ROIS-AI 的 Bid Feedback 服务将全部 effective DaysOff properties 展开为
`PbsBidFeedbackDayOff`：

```text
effectiveDaysOff
  -> toDayOffFeedback(property, activeDates)
  -> resolveDaysOffDates(property, activeDates)
  -> frontend flatMap property.dates
```

这个模型导致：

- `propertyCode=204 Long Stretch Off / Compressed Flying` 的 `from/to` 被展开为整段日期，
  例如 `2026-06-01 -> 2026-06-30` 会产生 30 个 `Days Off` tab 日期行。
- 同一天如果被多个 property 或多个 tier 命中，前端保留多行，因为 row key 是
  `propertyGroupKey:tier:date`。
- tab count 变成“property/date 行数”，不是参考项目的“唯一 day-off requested date cells 数量”。
- 右侧 detail 会把 Long Stretch 显示成 `Days Off Bid`，这与参考项目的 line rule 边界不一致。
- Calendar 也收到同样的过宽 `daysOff` 输入，会画出不应出现的 OFF 日期。

截图中的 Crew 19 `DAYS OFF 33` 很可能正是这个偏离的结果：Long Stretch 全月 30 天加上真实
Prefer Off 日期，且重复日期没有被合并。

## 4. 目标

- `Days Off` tab 只显示参考项目定义中的 Prefer Off day-off request 日期。
- tab count 等于当前 bid period 内去重后的日期数量。
- 每个日期最多一行，按日期升序展示。
- 同日期多个来源命中时保留更强 tier。
- `Long Stretch Off / Compressed Flying` 不再出现在 `Days Off` tab 的列表、detail 和 Calendar。
- `Long Stretch Off / Compressed Flying` 仍保留在 line rule / algorithm export / conflict 分析中。
- `Award` / `Avoid` pairing tabs 不受本变更影响。

## 5. 非目标

- 不改 Days Off 主页面可配置 property catalog。
- 不删除 `propertyCode=202-206` 或 AA DaysOff properties 的持久化能力。
- 不改变 algorithm export 当前分流：
  - `DAYSOFF.csv` 只处理 `propertyCode=201 Prefer Off` 和直接 day-off rows；
  - 202-206 等 rule-level DaysOff properties 继续导出到 `LINE_RULES.csv`。
- 不新增数据库字段或 schema migration。
- 不在第一阶段接入 Days Off eligibility 或 solver result 解释。

## 6. 方案比较

### 方案 A：后端编译唯一 Date Cells，前端只渲染 cells（采用）

在 `pbs-server` 的 Bid Feedback 服务里新增 Days Off feedback compiler：

1. 只接收 `propertyCode=201 Prefer Off` 作为 date-cell 来源。
2. 使用现有 Prefer Off 解析能力展开 `tag-list` values：
   - ISO date；
   - `Between YYYY-MM-DD - YYYY-MM-DD`；
   - weekday name；
   - `Weekends`；
   - 忽略 time window 对“选中哪些日期”的影响，只让它继续服务 algorithm export。
3. 对展开日期按 `YYYY-MM-DD` 去重。
4. 同日期多 tier 或多 property 命中时保留更强 tier。
5. 输出 period 内的稳定日期行给前端。

优点：

- API 输出已经是正确语义，Calendar、list、count 共用同一结果。
- 后端 Conflict Summary 可以使用同一套 off-date set，避免 B1/D1/D2 与 UI 看到的日期不一致。
- 与现有 algorithm export 的 `propertyCode=201` 边界一致。

代价：

- 需要调整 `PbsBidFeedbackDayOff` contract，或者让旧字段承载新的 cell 语义。
- 需要覆盖服务测试和前端组件测试。

### 方案 B：后端保持原样，前端过滤/去重（不采用）

前端 `BidFeedbackDialog` 只展示 `propertyCode=201` 相关数据，并在 `dayOffRows` 中按日期去重。

不采用原因：

- API 仍然表达错误，Calendar 和 conflict 仍可能用到错误日期。
- 前端 contract 当前没有 `propertyCode` 字段，必须增加字段或根据 property name 猜测。
- 修正只停留在视觉层，不是真正对齐参考行为。

### 方案 C：直接复用 algorithm export 的 `buildDaysOffCsvFromRows` 输出（不采用）

将 Bid Feedback 的 Days Off tab 从导出 CSV rows 反推日期和 tier。

不采用原因：

- 导出 CSV 是 counter 累加模型，同一 crew/date/tier 可以累加 counter；参考 Bid Feedback 是唯一
  date cell，保留最强 tier。
- 导出还涉及 UTC window、weekend partial boundary 和 solver 文件格式；Bid Feedback tab 只需要日期
  request cells，引入导出格式会扩大耦合。

## 7. 详细设计

### 7.1 Contract

推荐将 `PbsBidFeedbackDayOff` 明确改为 date-cell 语义：

```ts
export type PbsBidFeedbackDayOff = {
  date: string;
  tier: string;
  source: "prefer_off";
  fromOption: boolean;
  propertyGroupKey: string;
  propertyName: string;
  description: string;
};
```

说明：

- `date` 是 `YYYY-MM-DD`。
- `tier` 是最终保留的 tier，例如 `T1`。
- `source` 第一阶段固定为 `prefer_off`，防止未来再次把 Long Stretch 误塞进来。
- `fromOption` 当前固定为 `true`，预留给未来如果 PBS Portal 引入 manual day-off rows 时与参考项目一致。
- `propertyGroupKey` / `propertyName` / `description` 只用于 debug 和 detail，不参与 row 唯一性。
- 移除或停止使用 `action`，因为 Days Off 是 award-only，没有 avoid axis。
- 移除或停止使用 `dates: string[]`，避免一个 API item 同时代表多个日期，导致前端再次按 property 展开。

如果为了降低前端改动必须短期兼容旧字段，则后端可以临时返回一项一日期的旧形状：

```ts
{
  propertyGroupKey,
  propertyName: "Prefer Off",
  tier,
  action: "award",
  dates: [date],
  description
}
```

但实现和测试必须仍按“唯一 date cell”验收；后续再做 contract 清理。

### 7.2 后端 Days Off compiler

在 `pbs-server/src/services/bid-feedback/` 内实现局部 helper，不改变 Days Off 主服务：

```text
compileBidFeedbackDaysOff(properties, activeDates, preferOffConfig?)
  filter propertyCode === 201
  for each property tier:
    expandPreferOff dates
    for each date:
      keep if activeDates includes date
      merge into Map<date, cell>
        if no previous -> set
        if current tier stronger than previous -> replace
        if equal tier -> keep deterministic first source
  return cells sorted by date
```

Tier 强弱沿用 `resolveBidFeedbackTierWeight`，权重更高表示更强：

```text
T1=7 > T2=6 > ... > T7=1
```

Prefer Off 展开优先使用现有共享工具：

- `expandPreferOffBidValues`
- `listPbsPeriodDates`
- `PbsPreferOffConfig`

如果当前 Bid Feedback lightweight input 已经读取 Standing Prefer Off dictionary，则 compiler 应复用该
config；如果某路径没有 config，weekday/weekend 解析可以降级到当前已有 config 默认或只解析直接
ISO date，但测试必须覆盖可用 config 时的 weekday/weekend 展开。

无效 Prefer Off values 的处理：

- 不抛 500。
- 不产生日期行。
- 可在服务内部保留可观测的 skipped reason，但不要把 raw exception 暴露给用户。

### 7.3 前端 Bid Feedback dialog

前端改为消费后端已经编译好的 day-off cells：

- `Days Off` tab count 使用 `visibleDayOffCells.length`。
- 列表按 `date` 升序，已经排序时仍可做稳定防御排序。
- 一天最多一行。
- 右侧 detail 按用户已确认的方向保留本项目当前 detail 面板，但内容只描述真正 Prefer Off 日期：
  - 标题：`Days Off Bid`
  - Date
  - Tier
  - Bid：可删除，或固定显示 `Award`；推荐删除 `Bid` 字段，因为参考项目明确无 avoid axis。
  - Description：Prefer Off summary，例如 `Prefer Off · 2026-06-03`、`Prefer Off · Weekends` 或
    `Prefer Off · Between 2026-06-01 - 2026-06-05`。
- 空态沿用当前 `No Days Off bids are active.`。

Calendar 只接收同一批 compiled day-off cells，事件 ID 用 `date` 作为主键：

```text
day-off:2026-06-03
```

避免同一天多个 OFF event 叠在 Calendar 上。

### 7.4 Conflict 分析

`collectConflicts` 中所有依赖 `offDates` 的逻辑应改为使用 compiled Prefer Off date set：

- B1 `Days Off overlap Award Pairings`：只比较真实 Prefer Off dates 与 Award pairings。
- D1 `Commuter Pattern needs review`：只基于真实 Prefer Off dates。
- D2 `More Credit with many Days Off`：只基于真实 Prefer Off dates。

`B3 Long Stretch cannot fit` 保持单独读取 `propertyCode=204` 的逻辑，不受 Days Off tab 过滤影响。

这样用户在 tab 和 conflict 中看到的 “requested Days Off” 是同一批日期。

### 7.5 Current / Standing 来源

Effective source 优先级沿用现有 Bid Feedback 逻辑：

- 如果 Current contains formal bids，则 Current 为权威；
- 否则 Standing 参与 fallback；
- 具体 current/standing merge 策略不在本规格重写。

但不论来源是 Current 还是 Standing，只有 `propertyCode=201 Prefer Off` 可以编译为
`Days Off` tab 日期。

### 7.6 与导出层保持一致

本项目现有 algorithm export 已经体现了参考边界：

- `buildDaysOffCsvFromRows` 中 group rows 只处理 `propertyCode=201`。
- `line-rules-export` 会把 `204 Long Stretch Off / Compressed Flying` 输出为
  `MIN_CONSECUTIVE_DAYS_OFF_IN_WINDOW`。

Bid Feedback 应对齐这个边界，而不是把所有 DaysOff property 都当成 DAYSOFF dates。

## 8. 验收标准

以 Crew 19 / Jun 2026 这类问题样本为验收方向：

- `Long Stretch Off / Compressed Flying` 不再出现在 `Days Off` tab 右侧 detail。
- 如果 Crew 只有 Long Stretch，没有 Prefer Off，则 `Days Off` tab count 为 0，并显示空态。
- 如果 Crew 有 `Prefer Off` 的直接日期、日期范围、星期或周末请求，tab 显示展开后的日期。
- 同一天被多个 Prefer Off 命中时只显示一行。
- 同一天不同 tier 命中时保留更强 tier，例如 T1 覆盖 T3。
- 列表日期升序。
- Calendar 不画 Long Stretch 生成的 OFF block，也不画重复 OFF block。
- B1/D1/D2 conflict 只基于 Prefer Off compiled dates；B3 继续基于 Long Stretch。

## 9. 测试计划

后端自动化测试：

- `propertyCode=204` Long Stretch 不产生 `daysOff` response rows。
- `propertyCode=201` direct ISO date 产生一条 date cell。
- `Between YYYY-MM-DD - YYYY-MM-DD` 展开为范围内日期。
- weekday / Weekends 使用 Prefer Off dictionary config 展开。
- 重叠日期只保留更强 tier。
- `B1` 不再被 Long Stretch 全月日期误触发。
- `B3` 仍会在 Long Stretch 无法满足时触发。

前端自动化测试：

- `Days Off` tab count 使用 compiled cells 数量。
- 列表不会出现重复日期。
- 选中日期 detail 不显示 Long Stretch。
- Calendar 只渲染唯一 day-off event。

E2E / Playwright：

- 打开 Bid Feedback，进入 Crew 19 / Jun 2026。
- `Days Off` tab 中不出现由 Long Stretch 全月范围生成的整月日期。
- 日期列表升序且无重复。
- Calendar 模式不显示 Long Stretch 的全月 OFF。

QA 人工测试文档：

- 新增或更新 `docs/test-cases/pbs/bid-feedback/` 下的 Days Off reference parity 用例。

验证命令建议：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server && npm test -- bid-feedback-service.test.ts
cd /Users/lei/Codehub/rois-ai/pbs-portal && npm test -- bid-feedback-toolbar-actions.test.tsx
npm run check:ui
npx playwright test e2e/tests/pbs-portal/bid-feedback.spec.ts
```

实际实现后按改动范围选择最小可行命令，并在交付说明中报告 PASS/FAIL。

## 10. 风险与处理

- 当前工作树存在 `pbs-server/src/services/bid-feedback/bid-feedback-service.ts` merge conflict。
  实施前必须先确认并解决冲突，不能在冲突文件上继续叠加业务逻辑。
- Contract 改动会影响前后端编译；如果选择清理 `PbsBidFeedbackDayOff` 字段，必须同步改 Calendar、
  dialog 和测试。
- Standing Prefer Off 的 weekday/weekend 展开依赖 dictionary config；若某路径缺 config，需要明确降级
  行为并用测试覆盖。
- 不应把 line rule 从 Days Off 主页面移除；用户仍然可以在当前产品形态中配置它，只是 Bid Feedback
  的 `Days Off` tab 不把它解释成 requested off dates。

## 11. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 变更跨 `pbs-server` 和 `pbs-portal`，但核心契约和语义高度耦合；当前还有 merge
  conflict，拆分实现会增加冲突风险。
- Suggested split: 不拆。由一个实现者先解决冲突，再按后端 compiler → contract/frontend →
  tests/E2E 的顺序串行完成。
- Write boundaries: `packages/contracts/pbs-bid-feedback.d.ts`、
  `pbs-server/src/services/bid-feedback/*`、`pbs-portal/src/features/bid/components/*`、
  touched tests 和 `docs/test-cases/pbs/bid-feedback/*`。
- Conflict risk: 中。主要风险来自现有 unmerged `bid-feedback-service.ts` 和前一阶段 Bid Feedback
  改动仍未提交。
- Execution gate: 用户审阅并明确批准本 spec 后，才能进入实现。
