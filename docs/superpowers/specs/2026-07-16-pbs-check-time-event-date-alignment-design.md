# PBS Check-In / Check-Out Time 事件日期统一设计

## 1. 背景

`Pairing Check-In / Check-Out Time` 当前使用独立的 `DATE` 三段选择：

- `Any date`
- `Specific date`
- `Date range`

`Airport Preference` 则使用可选限制的统一交互：

- `LIMIT TO EVENT DATE` 默认关闭，关闭表示不限制日期；
- 开启后显示 `Specific Dates` 或 `Date Range`；
- `Specific Dates` 支持选择多个独立日期。

两者的日期条件本质相同：都是限制条件所对应事件发生的日期。当前不同的 UI 和 payload 结构会让员工在相似条件中遇到两套交互，也增加 contracts、保存回显、搜索和导入逻辑的分叉。

本次将 `Pairing Check-In / Check-Out Time` 的事件日期能力与 `Airport Preference` 对齐。这里的“对齐”包含 UI 和业务语义，不是只替换标题或控件外观。

## 2. 目标

1. 将 `Pairing Check-In / Check-Out Time` 的 `DATE` 三段选择改为 `LIMIT TO EVENT DATE` 可选开关。
2. 开关关闭时表示 Any date，不保存日期限制。
3. 开关开启后支持：
   - `Specific Dates`：一个或多个独立日期；
   - `Date Range`：一个起止日期闭区间。
4. 让 `Airport Preference` 与 `Pairing Check-In / Check-Out Time` 共用相同的事件日期数据结构和 UI 行为。
5. 自动保留已有单日期 Check-In / Check-Out Time bid，将旧 `specific_date` 转换为新的单元素 `specific_dates`。
6. Pairing 页面与 Search Pairings 复用同一个 editor、相同 payload 和相同过滤语义。

## 3. 非目标

- 不修改 `Check-In / Check-Out` 类型切换。
- 不修改时间操作符 `Between / Exactly at / Before / After`。
- 不修改 AM、PM、Custom 快捷时间范围。
- 不修改 Tier、Award/Avoid、Favorite 的通用工作流。
- 不修改 `Airport Preference` 的机场事件、机场选择、layover duration 或 fulfilment 字段。
- 不借本次需求批量重构其他 Pairing 日期条件。
- 不改变 bid period 之外日期不可选的现有约束。

## 4. 方案比较与决策

### 方案 A：共享事件日期契约与 UI（采用）

为两个条件定义同一事件日期结构，并复用一个最小的 optional event-date editor：开关关闭为 Any date，开启后选择多日期或日期范围。

优点：

- UI、payload、验证和隐藏字段清理规则保持一致；
- 后续修复日期选择行为时只有一个共享入口；
- 符合 `docs/modules/pbs/pairing-condition-ui-standard.md` 的“先复用，再新增”原则。

代价：

- 需要同步修改共享 contracts、前端、服务端和搜索条件；
- 需要处理旧 `specific_date` 数据升级。

### 方案 B：仅在 Check-In editor 中复制 Airport UI（不采用）

改动局部，但会继续保留两套类型和逻辑，未来容易再次漂移。

### 方案 C：只改外观，仍保留单日期结构（不采用）

无法实现用户确认的“语义完全一样”，也不能支持多日期。

## 5. 统一数据契约

### 5.1 新标准结构

事件日期限制统一为：

```ts
type PairingEventDateScope =
  | { mode: "specific_dates"; dates: string[] }
  | { mode: "date_range"; from: string; to: string };
```

`Airport Preference` 和 `Pairing Check-In / Check-Out Time` 的 `dateScope` 均使用：

```ts
dateScope?: PairingEventDateScope | null;
```

语义：

- `null` 或缺失：Any date；
- `specific_dates`：事件日期必须命中 `dates` 中任意一天；
- `date_range`：事件日期必须落在 `from` 至 `to` 的闭区间内。

日期字符串继续使用 `YYYY-MM-DD`。

### 5.2 有效性规则

- 开关关闭：`dateScope=null`，日期部分合法。
- `specific_dates`：至少一个日期，所有日期均为合法 ISO date；保存前去重并保持用户选择顺序。
- `date_range`：`from`、`to` 均合法，且 `from <= to`。
- 日期必须落在当前 `periodCode` 对应的自然月内。前端由共享 `PbsDatePicker` 限制可选日期，服务端在 Add、Update、Favorite 和 Search preview 边界再次校验，不能只依赖 UI。
- 服务端使用现有 `parsePeriodMonth(periodCode)` 解析自然月边界；无法解析 periodCode 时沿用现有统一请求错误，不允许跳过日期越界校验。
- `specific_dates` 中每一天都必须位于周期内；`date_range.from` 与 `date_range.to` 都必须位于周期内。
- 不允许提交空的 `specific_dates` 或不完整的 `date_range`。

### 5.3 隐藏字段清理

- 关闭 `LIMIT TO EVENT DATE` 时立即输出 `dateScope=null`。
- 从 `Specific Dates` 切换到 `Date Range` 时，不保留旧 `dates`。
- 从 `Date Range` 切换到 `Specific Dates` 时，不保留旧 `from/to`。
- Favorite、Add Bid、Update Bid 和 Search Pairings preview 均只能收到当前可见模式的数据。

## 6. UI 与交互设计

`Pairing Check-In / Check-Out Time` 条件专属字段顺序保持：

1. `TIME TYPE`
2. `TIME`
3. `LIMIT TO EVENT DATE`

日期区域行为：

- 使用 `PreferenceInlineSwitch`；
- label 固定为 `LIMIT TO EVENT DATE`；
- 默认关闭；
- 关闭时不显示日期 mode 和日期选择器；
- 开启时默认进入 `Specific Dates`，但日期数组为空，因此在选择至少一个日期前 Add/Update Bid 保持 disabled；
- 开启后显示：
  - `Specific Dates`
  - `Date Range`
- `Specific Dates` 使用 `PbsDatePicker mode="multiple"`；
- `Date Range` 使用 `PbsDatePicker mode="range"`；
- 日期 picker 的 period 继续来自当前 `periodCode`。

`Airport Preference` 的现有日期区也改为复用同一个共享 optional event-date editor，但用户可见行为不发生变化。

共享组件只负责：

- optional switch；
- mode segmented control；
- date picker；
- date scope 切换与清理。

具体 bid 的其他字段、完整性判断和业务保存仍由各自 editor 管理，避免把无关业务塞进共享组件。

## 7. 旧数据兼容与迁移

### 7.1 兼容目标

已有 Check-In / Check-Out Time bid：

```json
{
  "mode": "specific_date",
  "date": "2026-07-18"
}
```

应自动转换为：

```json
{
  "mode": "specific_dates",
  "dates": ["2026-07-18"]
}
```

用户打开已有 bid、Favorite 或 Standing/Current Bid 回显时，不丢失原日期。

### 7.2 收敛策略

- 新 contracts 和所有新写入只接受/产生 `specific_dates` 或 `date_range`。
- 服务端读取旧 JSON 时允许一次性识别 `specific_date`，立即归一化为 `specific_dates`。
- 旧格式只存在于读取边界，不能继续进入前端 state、搜索条件或新保存数据。
- 如现有持久化表可通过安全、可验证的 migration 原地升级，则提供幂等 migration 将旧 JSON 转成新 JSON；migration 执行范围和环境同步单独记录。
- 在无法保证所有历史数据已完成 migration 前，读取边界保留窄兼容，避免员工已有申请失效。该兼容不得扩散为双轨业务逻辑。

## 8. 服务端与搜索语义

### 8.1 保存、解析和回显

以下链路统一识别新结构：

- contract normalization；
- Pairing property validation；
- lineholder serialize / deserialize / clone；
- Favorite 与 Current Bid 回显；
- summary formatter。

摘要建议：

- 无日期：不追加日期文本；
- 单个日期：`on 2026-07-18`；
- 多个日期：`on 2026-07-18, 2026-07-21`；
- 日期范围：`between 2026-07-18 - 2026-07-21`。

### 8.2 Pairing Search

Check-In 和 Check-Out 的事件日期统一采用“事件发生机场的本地日历日期”，不能继续使用 UTC 日期：

- Check-In：按 `brief_start_utc ASC, duty_seq ASC, seg_seq ASC` 取得最早且 `brief_start_utc` 非空的 segment；事件机场固定为该 segment 的 `dep_arp`，再使用对应 `airport.zone_id` 转换为本地日期和本地时间。
- Check-Out：按 `debrief_end_utc DESC, duty_seq DESC, seg_seq DESC` 取得最晚且 `debrief_end_utc` 非空的 segment；事件机场固定为该 segment 的 `arv_arp`，再使用对应 `airport.zone_id` 转换为本地日期和本地时间。
- 事件机场存在但 `zone_id` 为空、非法或查不到有效 PostgreSQL timezone 时，统一 fallback 为 `UTC`，避免 SQL 因非法 timezone 失败；该 fallback 只用于异常主数据，正常数据必须使用事件机场本地时区。
- 事件 timestamp 缺失时，该 pairing 不命中对应 Check-In/Check-Out 时间条件，不伪造日期。

SQL 通过 `airport` 左连接 `pg_timezone_names` 验证 zone，并使用 `coalesce(valid_timezone.name, 'UTC')`，不得把未经验证的 `airport.zone_id` 直接传给 `AT TIME ZONE`。

时间比较也必须使用同一个事件机场的本地时间，与事件日期共同来自同一 check-in/check-out 事件。这样跨 UTC 午夜的 pairing 不会出现“日期按本地、时间按 UTC”的混合语义。

- `dateScope=null`：不追加日期 SQL。
- `specific_dates`：使用参数化数组匹配，语义等价于 `event_date = ANY($n::date[])`。
- `date_range`：使用参数化闭区间，语义等价于 `event_date BETWEEN $n::date AND $n+1::date`。
- 禁止把日期直接拼接进 SQL。

Pairing 页面和 Search Pairings preview 必须调用同一条件构造逻辑，不允许一处支持多日期、另一处仍按单日期处理。

### 8.3 Legacy crew-bid import

- legacy 单日期文本导入为 `specific_dates: [date]`；
- legacy 起止日期相同也归一化为单元素 `specific_dates`；
- legacy 起止日期不同导入为 `date_range`；
- 无日期限制的文本导入为 `dateScope=null`。

### 8.4 Algorithm export

`propertyCode=103` 当前通过 `buildPreviewCondition` 计算匹配 pairing，并进入 `PAIRING_SCORE` 导出。本次不新增另一套算法参数格式；导出必须复用更新后的 Pairing Search 条件：

- `specific_dates` 的全部日期参与匹配，不得只取第一项；
- `date_range` 按闭区间参与匹配；
- `null` 不增加日期限制；
- Check-In / Check-Out 分别使用对应事件机场本地日期和本地时间；
- 输出仍是现有 PAIRING_SCORE 结果，只有匹配 pairing 集合按新日期语义变化。

必须增加 `pairing-score-export` 回归，覆盖无日期、多日期、日期范围，以及 Check-In / Check-Out 跨 UTC 与本地午夜的匹配结果。

## 9. 错误处理

- 开启日期限制但未选择日期时，Add/Update Bid disabled。
- `specific_dates` 包含非法日期或为空时，前后端均拒绝保存。
- `date_range` 不完整或倒序时，前后端均拒绝保存。
- `specific_dates` 任一日期或 `date_range` 任一端点超出当前 period 自然月时，服务端返回 400；Favorite、Add、Update 与 Search preview 口径一致。
- periodCode 无法解析但请求包含日期限制时，服务端返回 400，不能降级为不限日期。
- 旧 `specific_date` 缺失合法 `date` 时不伪造日期；按无效历史数据处理并阻止重新保存，避免静默改变用户意图。
- 服务端错误沿用现有统一错误响应，不新增独立错误协议。

## 10. 影响范围

预计涉及：

- `packages/contracts/pbs-pairing-bids.d.ts`
- `packages/contracts/pbs-pairing-bids.js`
- `pbs-portal/src/features/pairing/types.ts`
- `pbs-portal/src/features/pairing/components/pairing-check-time-editor.tsx`
- `pbs-portal/src/features/pairing/components/airport-preference-editor.tsx`
- `pbs-portal/src/shared/components/preferences/` 下最小共享日期组件
- Pairing bid mapper、summary、完整性验证及对应测试
- `pbs-server/src/services/lineholder/` 解析、序列化、格式化与 clone
- `pbs-server/src/services/pairing-search/` 日期 SQL 构造
- `pbs-server/src/services/crew-bid-import/` legacy import
- `pbs-server/src/services/algorithm-export/pairing-score-export.ts` 及其多日期、范围、Check-In/Check-Out 回归 tests
- `e2e/tests/pbs-portal/condition-default-favorites.spec.ts`
- Search Pairings 相关 E2E / component tests
- `docs/test-cases/pbs/condition-properties/` 手工 QA 用例
- 如确认需要原地升级历史 JSON，则新增 `sql/migration/` 幂等 migration

实施前必须对实际修改的函数/方法逐一执行 GitNexus upstream impact analysis，并向用户报告 blast radius。若返回 HIGH 或 CRITICAL，必须先告警再修改。

## 11. 测试设计

### 11.1 前端 focused tests

覆盖：

- 初始 switch 关闭且不显示 picker；
- 开关关闭时 `dateScope=null`；
- 开启后默认 `specific_dates` 空数组且 bid 无效；
- 选择一个和多个日期后有效；
- 切换 `Date Range` 清除旧 dates；
- 切回 `Specific Dates` 清除旧 from/to；
- 关闭 switch 清除当前日期结构；
- 旧 `specific_date` 归一化后回显为一个已选日期；
- Airport 与 Check-Time 共享日期组件行为一致。

### 11.2 服务端 focused tests

覆盖：

- contract normalization；
- 新结构保存、serialize / deserialize / clone；
- 旧单日期读取后升级；
- summary 的无日期、单日期、多日期、范围；
- validation 拒绝空 dates、非法日期和倒序范围；
- crew-bid import 的无日期、单日期和范围；
- Search SQL 的无日期、多日期和范围均参数化；
- Check-In 与 Check-Out 使用各自事件机场的本地日期和本地时间；
- 事件跨 UTC/本地午夜时按事件机场本地日命中；
- 机场 zone 缺失或非法时 fallback UTC；
- Specific Dates 和 Date Range 的 period 内、period 外以及非法 periodCode 校验；
- `pairing-score-export` 对 null、多日期、范围、Check-In、Check-Out 和跨午夜语义的回归。

### 11.3 Playwright

通过真实 PBS Portal UI：

1. 打开 Pairing 页面并新增 `Pairing Check-In / Check-Out Time`。
2. 确认 `LIMIT TO EVENT DATE` 默认关闭且无日期 picker。
3. 开启后选择两个 Specific Dates，保存并确认摘要/回显包含两个日期。
4. 编辑为 Date Range，确认旧 dates 不再出现，保存后正确回显范围。
5. 再关闭开关保存，确认回显不含日期限制。
6. 在 Search Pairings 复用入口验证同一 editor 和筛选行为。

### 11.4 QA 手工用例

新增或更新 `docs/test-cases/pbs/condition-properties/` 下的 Check-In / Check-Out Time 用例，至少包含：

- 默认 Any date；
- Specific Dates 多选；
- Date Range；
- 模式切换与隐藏字段清理；
- Favorite；
- 旧单日期申请回显；
- Search Pairings；
- 非法/空日期边界。

### 11.5 交付命令

先运行最小 focused tests，再运行：

```bash
cd pbs-portal && npm test
cd pbs-portal && npm run lint -- --quiet
cd pbs-portal && npm run build
cd pbs-server && npm test
cd pbs-server && npm run build
npm run check:ui
cd e2e && npx playwright test --config=config/playwright.config.ts --project=pbs-portal tests/pbs-portal/condition-default-favorites.spec.ts --reporter=list
git diff --check
```

如共享 contracts 或跨模块行为影响 PBS 全链路，再运行根目录 `npm run verify:pbs`。任何未运行或失败项必须在交付说明中明确列出。

## 12. 验收标准

1. Check-In / Check-Out Time 不再显示独立 `DATE` 三段控件。
2. 显示 `LIMIT TO EVENT DATE` switch，默认关闭并表示 Any date。
3. 开启后支持 `Specific Dates` 多选和 `Date Range`。
4. 关闭开关或切换 mode 后不保存隐藏的旧日期字段。
5. Airport Preference 与 Check-In / Check-Out Time 使用同一事件日期结构和共享交互组件。
6. 已有合法 `specific_date` bid 自动回显为单元素 `specific_dates`，用户数据不丢失。
7. Favorite、Current Bid、Standing/Lineholder 回显和摘要支持新结构。
8. Pairing Search 对多日期和日期范围执行正确、参数化的日期过滤。
9. legacy import 不再生成旧 `specific_date` 新数据。
10. Check-In / Check-Out 的日期和时间均按各自事件机场本地时区计算；zone 异常时明确 fallback UTC，并有跨午夜回归证明。
11. 日期限制在前后端均受当前 period 自然月边界约束，API 不能绕过 UI 写入越界日期。
12. `PAIRING_SCORE` 导出通过统一搜索条件完整支持 null、多日期和日期范围，不静默丢失日期。
13. 自动化测试、真实 UI Playwright、QA 文档、build、lint 和 UI standard gate 按项目要求完成并报告结果。

## 13. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 共享 contract、两个 editor、服务端解析和搜索 SQL 紧密耦合，修改顺序受统一数据契约约束。
- Suggested split: 单一实现链路完成；spec 和最终 diff 可由独立 reviewer 审查。
- Write boundaries: contracts、pbs-portal、pbs-server、E2E、QA 文档和可选 migration。
- Conflict risk: 多个 agent 并行修改共享 bid union、normalizer 和测试 fixture 时冲突风险较高。
- Execution gate: 本 spec 经用户审阅并明确批准实施后，才允许生成 implementation plan 和修改代码。
