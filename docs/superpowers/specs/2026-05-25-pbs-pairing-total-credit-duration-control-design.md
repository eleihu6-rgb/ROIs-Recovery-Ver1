# PBS Pairing Total Credit 时长控件修复设计

## 背景

`Pairing Total Credit` 当前对应 `propertyCode=105`，在 `packages/contracts/pbs-pairing-bids.js` 中配置为：

```ts
defaultBid: { type: "text", value: "08:00" }
supportedOperators: ["=", "<", ">", "Between"]
```

因此 `Configure Pairing Bid` 弹窗会渲染成普通文本框，用户可以输入 `s` 这类无效值。这个字段表达的是 pairing 总 credit 时长，不是普通字符串，也不是一天内钟点时间；它可能超过 `23:59`，不能用浏览器原生 `type="time"` 控件。

同时，当前 pairing search SQL 条件中没有明确处理 `propertyCode=105`，如果它作为搜索条件或当前规则预览条件参与过滤，后端无法正确转换为总 credit 分钟比较。

## 目标

- `Pairing Total Credit` 在弹窗中使用正确的时长/credit 输入控件，而不是普通文本框。
- 支持现有操作符：`=`, `<`, `>`, `Between`。
- 单值输入使用 `H:MM` / `HH:MM` 风格，例如 `8:00`, `08:00`, `112:30`。
- `Between` 使用两个时长输入，例如 `Between 08:00 - 12:30`。
- 无效输入不能被当作有效 bid 保存或用于搜索，例如 `s`, `8`, `08:7`, `08:75`。
- 后端将 `propertyCode=105` 转为 pairing 总 credit 分钟 SQL 条件，保证 Search Pairings 和 Current Rules preview 语义一致。

## 非目标

- 不全局迁移所有当前仍是 `text` 的时长类 property。
- 不把 `time` / `time-range` 当作总 credit 的数据结构，因为它们语义是 clock time，不适合超过 `23:59` 的 credit duration。
- 不改数据库 schema，不迁移历史数据；当前仍处开发阶段，但这次修复不需要动表结构。
- 不改 Days Off / Line bid 的时长控件。
- 不改变 `Pairing Check-In Time` 已确认的多行 bid 行为。

## 方案比较

### 方案 A：继续使用 `text`，只在前端加校验

优点是改动最小；缺点是数据结构仍然把 credit duration 表达成普通字符串，后端和其他入口很难知道它需要时长语义，后续汇总和搜索仍容易出现歧义。

不推荐。

### 方案 B：复用 `time` / `time-range`

优点是现有 operator、summary、控件链路可复用；缺点是 `time` 是一天内钟点时间，浏览器原生控件限制和用户心智都不适合 `48:00`、`112:30` 这种 credit duration。

不推荐。

### 方案 C：新增专用 `duration` / `duration-range` bid 类型

新增 bid value：

```ts
{ type: "duration"; value: string; operator?: "=" | "<" | ">" }
{ type: "duration-range"; from: string; to: string }
```

`Pairing Total Credit` 默认值改为 `{ type: "duration", value: "08:00" }`。前端使用专用 `DurationInput`，本质上是文本输入，但带 `inputMode="numeric"`、格式限制、失焦规范化和完整性校验。后端 schema、序列化、反序列化、search SQL 都明确识别 duration 类型。

推荐采用。它把“时长”从普通文本里独立出来，避免再出现 `s` 这种值被 UI 接收，也不会和 clock time 混在一起。

## 前端设计

- 在 `PairingBidValue` 增加 `duration` / `duration-range`。
- 在 `pairing-bid-control-logic.ts` 中让 duration 支持 operator 切换：
  - `duration` + `Between` -> `duration-range`
  - `duration-range` + `=/< />` -> `duration`
- 新增或复用本地小组件 `DurationInput`：
  - 显示宽度接近当前 time input。
  - 允许用户输入数字和冒号。
  - 完整值必须匹配 `^\d{1,3}:\d{2}$`，分钟必须 `00-59`。
  - 失焦时可把 `8:00` 规范化为 `08:00`；超过两位小时保留，例如 `112:30`。
- `Pairing Total Credit` 单值显示：operator + duration input。
- `Between` 显示：operator + from duration input + `-` + to duration input。
- Summary：
  - `= 08:00`
  - `> 12:30`
  - `Between 08:00 - 16:00`
- 保存按钮的完整性判断要把非法 duration 视为 incomplete，避免提交无效字符串。

## 后端设计

- `packages/contracts/pbs-pairing-bids.js/.d.ts` 增加 duration 类型，并把 `propertyCode=105` 默认 bid 改为 `duration`。
- `pbs-server/src/routes/pairing-bids.ts` 的 Pairing 专属 schema 增加 duration / duration-range；不要把它加入 Days Off / Line 共用的 `ruleBidValueSchema`。
- `pbs-server/src/services/lineholder/rule-bid-value.ts` 支持 duration 的 serialize / deserialize / signature，避免规则重复判断和草稿持久化丢语义。
- 在 pairing search condition helper 增加 duration compare SQL builder：
  - 单值：把 `value` 用 `parseDurationToMinutes` 转为分钟。
  - range：把 `from/to` 转为分钟并生成 `between`。
- `propertyCode=105` 的 SQL 表达式使用 pairing segments 的 credit minutes 汇总：

```sql
select sum(coalesce(s.act_credited_minutes_seg::numeric, s.duty_act_credited_minutes::numeric, 0))
from <live_schema>.pairing_segment s
where s.pairing_id = p.id
  and s.is_deleted = 0
```

- 对 `award/avoid` 的正负意图仍沿用现有 `wrapIntent` 逻辑。
- 旧 `text` 不作为 `propertyCode=105` 的合法新输入；如果请求里传 `{ type: "text" }`，后端应返回校验错误，而不是静默兼容。

## 测试计划

- 前端单元测试：
  - `duration` 单值渲染专用输入，不能像普通 text 一样接受任意值作为 complete。
  - operator 从 `=` 切到 `Between` 后变成 `duration-range`，再切回单值能保留 from。
  - `08:75`、`s` 等无效输入不可保存。
  - Summary 正确显示单值和范围。
- 后端单元测试：
  - route schema 接受 `duration` / `duration-range`，拒绝 105 的 `text`。
  - rule bid serialize / deserialize 保留 duration 语义。
  - search condition builder 为 105 生成总 credit 分钟比较 SQL。
  - `Between 08:00 - 12:00` 参数转成 `480` 和 `720`。
- QA 手工测试文档：
  - 新增 `docs/test-cases/pbs/pairing/2026-05-25-pairing-total-credit-duration-control.md`。
  - 覆盖弹窗输入、非法值、Between、保存后展示、Search Pairings preview。

## 验收标准

- `Pairing Total Credit` 弹窗不再出现可输入任意文本的普通 text 控件。
- 用户不能保存 `s`、`08:75` 等非法 credit 时长。
- `= / < / > / Between` 四种 operator 都能生成正确 bid 数据。
- 多入口 summary、草稿保存/读取、Search Pairings preview、Current Rules preview 语义一致。
- 不影响 `Pairing Check-In Time`、Days Off、Line bid 行为。
- 自动化测试和构建通过，至少运行：
  - `npm --prefix pbs-portal test -- pairing-bid-control pairing-bid-control-logic`
  - `npm --prefix pbs-server test -- --test-reporter=spec pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts pbs-server/src/routes/pairing-bids.test.ts pbs-server/src/services/lineholder/rule-bid-value.test.ts`
  - `npm --prefix pbs-portal run build`
  - `npm --prefix pbs-server run build`

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动跨 contract、前端控件、后端 schema/search，但核心语义很小，多个 agent 并行会增加同一 bid 类型定义的冲突风险。
- Suggested split: 不拆分；由一个 agent 顺序修改 contract -> 前端 -> 后端 -> 测试。
- Write boundaries: 单 agent 统一维护 `duration` 类型，避免前后端类型不一致。
- Conflict risk: 中等；如果并行，容易在 `PairingBidValue`、`PbsPairingBidValue` 和 route schema 上产生重复或冲突。
- Execution gate: 用户确认本 spec 后再开始实现。
