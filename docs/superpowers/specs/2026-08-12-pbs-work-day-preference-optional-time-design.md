# PBS Work Day Preference 可选时间窗口参考对齐设计

日期：2026-08-12
状态：已实施，核心验证通过；完整 build 受既有 Bid Feedback 未完成改动阻塞
范围：PBS Portal Current Pairing、Standing Lineholder、Search Pairings、Bid Feedback、后端保存校验与摘要；不修改数据库 schema

## 1. 决策摘要

将 `propertyCode=110` `Work Day Preference` 的时间窗口语义严格对齐参考项目：

- 至少选择一个 weekday 才能保存。
- 每个选中 weekday 的 `checkInFrom` / `checkInTo` 都是可选字段。
- `checkInFrom=null` 且 `checkInTo=null` 表示该 weekday 任意 check-in time 都匹配。
- 仅 `checkInFrom` 有值表示该 weekday 从该时间以后匹配。
- 仅 `checkInTo` 有值表示该 weekday 到该时间以前匹配。
- 两边都有值时按该 weekday 自己的 check-in window 匹配，允许跨午夜。
- 两边都有值且相等时非法。

Current Pairing Bid 和 Standing Lineholder Bid 必须使用同一套规则。Standing Bid 中 Work Day Preference 不显示 event date scope 的现状保持不变，但只选 weekday 不填时间也必须能保存。

本次不新增数据库字段、不新增 migration、不改变 `pbs_bid_property` / `pbs_bid_condition` 的 JSON 存储结构；现有 payload 已经支持 `string | null`。

## 2. 参考项目依据

参考项目路径：

```text
/Users/lei/Codehub/Flair_PBS_Optimization_Report
```

关键参考文件：

- `src/frontend/src/unittest/bidOptions.ts`
- `src/frontend/src/unittest/ConfigureBiddingDialog.tsx`
- `src/frontend/src/unittest/bidOptions.test.ts`
- `src/server/app/bid_options.py`

参考项目的 `workDay` 结构为：

```ts
{
  windows: {
    [jsDayIndex]: {
      start: string;
      end: string;
    }
  }
}
```

其中 key 的存在表示选中了该 weekday。`start/end` 可以为空字符串：

```text
{ start: "", end: "" }       -> 当天任意 check-in time
{ start: "17:00", end: "" }  -> 当天 17:00 以后
{ start: "", end: "07:00" }  -> 当天 07:00 以前
```

参考项目 validator 只拒绝：

- 没有选择任何 weekday。
- `start` 和 `end` 都存在且相等。

参考项目 selector 使用 duty 的本地 `checkin_local`，并且 day 与 time window 是同一个 duty check-in 上的条件，不是全局时间窗口。

## 3. 当前系统问题

当前项目已经把 Work Day Preference 建模为：

```ts
{
  type: "work-day-preference",
  days: [
    {
      dayOfWeek: "MON" | ... | "SUN",
      checkInFrom: string | null,
      checkInTo: string | null
    }
  ],
  dateScope?: { mode: "specific_dates" | "date_range", ... } | null
}
```

类型和 JSON 存储已经能表达可选时间，但部分代码仍按“每个 weekday 必须填写完整 from/to”处理：

- `pbs-portal/src/features/pairing/components/work-day-preference-editor.tsx`
  - `isWorkDayPreferenceBidValueValid` 要求每个 day 都满足完整时间窗口。
  - 用户只选 weekday 时 `ADD BID` / `UPDATE BID` 被禁用。
- `pbs-portal/src/features/pairing/pairing-bid-control-logic.ts`
  - `isPairingBidComplete` 把 `null/null` 或单边时间视为 incomplete。
- `pbs-server/src/routes/pairing-bid-route-schemas.ts`
  - zod schema 拒绝 `checkInFrom` 或 `checkInTo` 为 `null`。
  - Standing Bid route 复用该 schema，因此也受影响。
- `pbs-server/src/services/pairing/pairing-property-validation.ts`
  - 保存校验要求两个时间都存在且有效。
- `pbs-server/src/services/pairing-search/pairing-search-detail-conditions.ts`
  - Search Pairings SQL 条件只为完整 from/to 生成 clause，空时间会导致缺少 work day 条件。
- `pbs-server/src/services/lineholder/lineholder-summary-formatters.ts`
  - 空时间会被判为 review-only。
- `pbs-portal/src/features/pairing/pairing-bid-summary.ts`
  - 空时间显示为 `Incomplete check-in window`。
- `pbs-portal/src/features/bid/bid-property-summary.ts`
  - bid summary 可能显示 needs review。

另一方面，`pbs-server/src/services/bid-feedback/bid-feedback-pairing-matcher.ts` 已经基本支持参考语义：`null/null` 匹配当天任意 check-in，单边时间按 open-ended 处理。需要补测试确保不回退。

## 4. 目标

1. Current Pairing Bid 的 Work Day Preference 支持只选 weekday 并保存。
2. Standing Lineholder Bid 的 Work Day Preference 支持只选 weekday 并保存。
3. 前端 dialog 中选中 weekday 后，不要求必须填写时间。
4. 前端只在两边时间都填且相等时展示错误/禁用保存。
5. 后端 route schema 接受 `checkInFrom/checkInTo` 为 `null`。
6. 后端业务校验接受 `null/null`、`start/null`、`null/end`。
7. Search Pairings 能正确按 weekday-only / start-only / end-only / full-window 查询。
8. Bid Feedback matcher 对 weekday-only / open-ended window 有回归测试。
9. Summary 文案不再把合法空时间称为 incomplete 或 needs review。
10. 不影响其他 Pairing conditions、Line Bid、Days Off、Reserve Bid。

## 5. 非目标

1. 不改变 Work Day Preference 的 property code：仍为 `110`。
2. 不改变 action：仍为 award-only。
3. 不新增或修改数据库表、字段、migration。
4. 不改变 Standing Bid 中 event date scope 被隐藏/清空的现状。
5. 不修改参考项目。
6. 不改 Days Off 的 Prefer Off 逻辑；该功能有独立的 time window 规则。
7. 不把 Work Day Preference 改回参考项目的 `windows` map 结构；当前项目继续使用 `days[]`。

## 6. 产品语义

### 6.1 Weekday-only

用户只选 `Mon`，不填时间：

```json
{
  "type": "work-day-preference",
  "days": [
    { "dayOfWeek": "MON", "checkInFrom": null, "checkInTo": null }
  ],
  "dateScope": null
}
```

语义：Award pairings whose duty check-in is on Monday, regardless of check-in time.

### 6.2 Start-only

用户选 `Mon`，只填 `From=17:00`：

```json
{
  "dayOfWeek": "MON",
  "checkInFrom": "17:00",
  "checkInTo": null
}
```

语义：Award pairings whose Monday duty check-in is at or after 17:00.

### 6.3 End-only

用户选 `Mon`，只填 `To=07:00`：

```json
{
  "dayOfWeek": "MON",
  "checkInFrom": null,
  "checkInTo": "07:00"
}
```

语义：Award pairings whose Monday duty check-in is at or before 07:00.

### 6.4 Full window

用户选 `Mon`，填 `From=22:00`、`To=04:00`：

```json
{
  "dayOfWeek": "MON",
  "checkInFrom": "22:00",
  "checkInTo": "04:00"
}
```

语义：Award pairings whose Monday duty check-in falls in the configured window. `from > to` 表示跨午夜窗口，保持当前支持。

### 6.5 Equal endpoints

用户填 `From=06:00`、`To=06:00`：

```text
非法：Start and end time cannot be the same.
```

## 7. 实现方案

### 7.1 推荐方案：统一 helper，前后端各自最小复用

在前端当前 pairing control helper 中调整 `isCompleteWorkDayPreferenceWindow`：

```text
合法条件：
- dayOfWeek 有效
- checkInFrom 为 null 或 HH:mm
- checkInTo 为 null 或 HH:mm
- 不允许 checkInFrom/checkInTo 同时非空且相等
```

`isWorkDayPreferenceBidValueValid` 保持 `days.length > 0`、weekday 唯一、dateScope 合法、dateScope 与 weekday 有交集的判断，但不再要求完整时间。

后端 route schema 和 `pairing-property-validation` 使用同一语义：

- zod schema 不再在 `null` 任一侧时报错。
- 业务 validator 只拒绝 invalid time、duplicate weekday、equal endpoints。

Search Pairings SQL 的 `buildWorkDayPreferenceCondition` 按四种情况生成 day clause：

```text
null/null      -> weekday clause only
start/null     -> weekday and event_time >= start
null/end       -> weekday and event_time <= end
start/end      -> weekday and window condition
start === end  -> invalid / false
```

Bid Feedback matcher 已支持该语义，只补回归测试，避免后续被改回“必须完整时间”。

Summary 文案调整为：

- `Mon`：weekday-only。
- `Mon after 17:00`：start-only。
- `Mon before 07:00`：end-only。
- `Mon 22:00-04:00` 或 `Mon between 22:00 and 04:00`：full window。

### 7.2 备选方案：只改前端保存按钮

只放开 `WorkDayPreferenceEditor` 和 `isPairingBidComplete`。

不推荐，因为后端 schema / validator 仍可能 400，Search Pairings 和 summary 仍不一致。

### 7.3 备选方案：新增 payload 字段

新增 `allDay: true` 或 `timeMode`。

不推荐，因为当前 `checkInFrom/checkInTo: string | null` 已经能无损表达参考项目语义，新增字段会扩大 contract、migration 和兼容成本。

## 8. 受影响文件

预计修改：

- `pbs-portal/src/features/pairing/pairing-bid-control-logic.ts`
- `pbs-portal/src/features/pairing/components/work-day-preference-editor.tsx`
- `pbs-portal/src/features/pairing/pairing-bid-summary.ts`
- `pbs-portal/src/features/pairing/pairing-existing-bid-summary.ts`
- `pbs-portal/src/features/pairing/pairing-existing-bid-summary.test.ts`
- `pbs-portal/src/features/bid/bid-property-summary.ts`
- `pbs-server/src/routes/pairing-bid-route-schemas.ts`
- `pbs-server/src/routes/pairing-bid-route-schemas.test.ts`
- `pbs-server/src/services/pairing/pairing-property-validation.ts`
- `pbs-server/src/services/pairing-search/pairing-search-detail-conditions.ts`
- `pbs-server/src/services/pairing-search/generated-sql-preflight-cases.ts`
- `pbs-server/src/services/pairing-search/generated-sql-preflight-manifest.ts`
- `pbs-server/src/services/lineholder/lineholder-summary-formatters.ts`
- `pbs-server/src/services/lineholder/rule-bid-format.ts`
- `pbs-portal/src/features/standing-bid/standing-bid-property-summary.ts`
- 相关 `.test.ts` / `.test.tsx`
- 相关 PBS Portal Playwright test
- QA 手工测试文档 `docs/test-cases/pbs/pairing/`

可能只补测试或确认无需修改：

- `pbs-server/src/services/bid-feedback/bid-feedback-pairing-matcher.ts`
- `pbs-server/src/services/lineholder/rule-bid-value.ts`

## 9. 数据和迁移

不需要数据库 migration。

原因：

- Work Day Preference 已经通过 JSON 序列化保存在 bid condition 参数中。
- 合约类型已经允许 `checkInFrom/checkInTo` 为 `string | null`。
- 后端 `deserializeRuleBid` 已经能解析 `null/null` 和单边时间。

需要注意：

- 现有保存失败不是数据库能力问题，而是前端完整性、route schema、业务 validator 和查询生成逻辑没有一致承认可选时间。

## 10. 测试计划

### 10.1 前端单测

更新或新增：

- `pbs-portal/src/features/pairing/pairing-bid-control-logic.test.ts`
  - `days=[]` invalid。
  - `MON null/null` valid。
  - `MON 06:00/null` valid。
  - `MON null/10:00` valid。
  - `MON 06:00/06:00` invalid。
- `pbs-portal/src/features/pairing/components/work-day-preference-editor.test.tsx`
  - 只点 `Mon` 后 validity 为 true。
  - 单边时间保持 valid。
  - 相同 from/to invalid。
  - Standing 模式 `disableEventDateScope` 下同样 valid。
- `pbs-portal/src/features/pairing/pairing-bid-summary.test.ts`
  - weekday-only 不显示 incomplete。
  - start-only / end-only 文案正确。
- `pbs-portal/src/features/pairing/pairing-existing-bid-summary.test.ts`
  - existing Work Day weekday-only / start-only / end-only 不再显示 `Work Day Preference needs review`。
- `pbs-portal/src/features/bid/bid-property-summary.test.ts`
  - Work Day weekday-only 不再 needs review。
- `pbs-portal/src/features/standing-bid/standing-bid-property-summary.test.ts`
  - Standing Work Day weekday-only / start-only / end-only 使用合法摘要，不显示 needs review 或 incomplete。

### 10.2 后端单测

更新或新增：

- `pbs-server/src/services/pairing/pairing-property-validation.test.ts`
  - 保存校验接受 `null/null`、start-only、end-only。
  - 仍拒绝 duplicate weekday、invalid time、equal endpoints。
- `pbs-server/src/routes/pairing-bid-route-schemas.test.ts`
  - zod schema 接受 `null/null`、start-only、end-only。
  - zod schema 拒绝 invalid time、duplicate weekday、equal endpoints。
- `pbs-server/src/routes/pairing-bids.test.ts`
  - Current Pairing Bid 可保存 weekday-only。
- `pbs-server/src/routes/standing-bids.test.ts`
  - Standing Lineholder 可保存 weekday-only Work Day Preference。
- `pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts`
  - SQL 条件包含 weekday-only clause。
  - start-only / end-only 生成对应 bound。
  - full window 保持原语义。
- `pbs-server/src/services/pairing-search/generated-sql-preflight-cases.ts`
  - 为 property 110 增加 weekday-only、start-only、end-only、full-window fixture case。
- `pbs-server/src/services/pairing-search/generated-sql-preflight-manifest.ts`
  - 将新增 fixture 纳入动态 SQL preflight manifest，确保结构检查和远端 PostgreSQL 解析验证覆盖新增分支。
- `pbs-server/src/services/bid-feedback/bid-feedback-pairing-matcher.test.ts`
  - weekday-only 匹配该 weekday 任意 check-in。
  - start-only / end-only 匹配 open-ended window。
- `pbs-server/src/services/lineholder/lineholder-summary-formatters.test.ts`
  - weekday-only / start-only / end-only 不再被标记为 review-only。
- `pbs-server/src/services/lineholder/rule-bid-value.test.ts`
  - `formatRuleBid` 或相关 formatter 对 weekday-only / start-only / end-only 输出合法摘要，不再输出 `Incomplete check-in window`。

### 10.3 E2E / Playwright

更新或新增 PBS Portal 用例：

- Current Pairing：
  - Add Work Day Preference。
  - 选择 `Mon`。
  - 不填时间。
  - `ADD BID` enabled。
  - POST payload 中 `checkInFrom/checkInTo` 为 `null`。
- Standing Lineholder：
  - Add Work Day Preference。
  - 选择 `Mon`。
  - 不填时间。
  - 保存成功。
  - payload 中保留 `checkInFrom/checkInTo=null`，且 `dateScope=null`。

### 10.4 验证命令

实施后优先运行：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal && npm test -- --run <相关测试文件>
cd /Users/lei/Codehub/rois-ai/pbs-server && env DATABASE_URL=postgresql://test:test@localhost:5432/rois node --import tsx --test <相关测试文件>
cd /Users/lei/Codehub/rois-ai/pbs-server && npm run test:generated-sql-coverage
cd /Users/lei/Codehub/rois-ai/pbs-server && npm run build
cd /Users/lei/Codehub/rois-ai/pbs-server && LIVE_SCHEMA=f8 PBS_SCHEMA=f8_pbs npm run verify:generated-sql
cd /Users/lei/Codehub/rois-ai && npx playwright test e2e/tests/pbs-portal/<相关用例>.spec.ts --reporter=list
```

动态 SQL 修改必须满足项目 `generated-sql-safety-standard`：

- fixture / manifest 覆盖新增 SQL 分支。
- 本地结构完整性测试通过。
- 远端 PostgreSQL authority 上最小只读解析或 `EXPLAIN` 验证通过；不能只靠 TypeScript build 或字符串 mock test。

若改到前端样式或触发 UI gate，再运行：

```bash
cd /Users/lei/Codehub/rois-ai && npm run check:ui
```

## 11. 验收标准

1. Current Pairing 的 Work Day Preference 只选 weekday 不填时间可以保存。
2. Standing Lineholder 的 Work Day Preference 只选 weekday 不填时间可以保存。
3. 保存 payload 使用现有结构：

```json
{
  "type": "work-day-preference",
  "days": [
    { "dayOfWeek": "MON", "checkInFrom": null, "checkInTo": null }
  ],
  "dateScope": null
}
```

4. Summary 不再显示 `Incomplete check-in window` 或 `Condition needs review`。
5. Search Pairings 和 Bid Feedback 都把 weekday-only 当成该 weekday 任意 check-in。
6. start-only 在 Search Pairings 和 Bid Feedback 中匹配该 weekday `event_time >= start` / duty check-in minutes >= start。
7. end-only 在 Search Pairings 和 Bid Feedback 中匹配该 weekday `event_time <= end` / duty check-in minutes <= end。
8. 两边时间相等在前端保存、后端 route schema、后端业务 validator 中都被拒绝。
9. 不产生数据库 migration。
10. 自动化测试覆盖 Current + Standing + Search + Feedback。

## 12. 风险和边界

- Search Pairings SQL 是动态 SQL，需要保持参数化，不能拼接未验证时间值。
- `from > to` 的跨午夜语义要保持，不要误改成非法。
- Summary 的文案变化会影响快照/文本断言，需要同步测试。
- Standing Bid 隐藏 date scope，但保存仍复用 Work Day bid schema，因此不能只改 Current Pairing。
- 不要改 Days Off Prefer Off，它的 time window 是另一个 bid 类型。

## 13. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这次改动围绕一个 bid value 合约，前端、后端、搜索、反馈必须保持一致；拆成多个 agent 容易在 schema 和测试断言上互相踩。
- Suggested split: 不拆分。
- Write boundaries: 主 agent 统一修改 Work Day Preference 相关前端 helper/editor/summary、后端 schema/validator/search/summary 和测试。
- Conflict risk: 中等，集中在 Work Day Preference 相关文件。
- Execution gate: 本 spec 经用户确认后再实施。
