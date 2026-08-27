# PBS Pairing Length 起始日期选择统一设计

日期：2026-07-16
状态：待用户审阅
范围：PBS Portal Pairing 条件 `Pairing Length`（property code `112`）

## 1. 背景与目标

当前 `Pairing Length` 已支持：

- `Award / Avoid`；
- `Min days / Max days`，按闭区间表达 pairing 持续天数；
- 可选的 `LIMIT TO PAIRING START DATE`；
- 日期限制开启后，只能选择一个连续 `Date Range`。

标准答案及已经验收的 `Flight Legs per Duty`、`Airport Preference`、`Pairing Check-In / Check-Out Time` 日期交互均提供：

- `Specific Dates`：选择一个或多个离散日期；
- `Date Range`：选择连续起止日期。

本轮目标是让 `Pairing Length` 的起始日期限制采用相同交互，同时保持其业务标题和判断对象不变。

## 2. 已确认需求

### 2.1 Pairing Length 条件

- `PAIRING LENGTH` 继续使用现有 `Min days / Max days`。
- 不把 pairing 长度本身改成 `1 day / 2 days / 3 days` 离散多选。
- 现有闭区间语义保持不变：
  - 仅填写 `Min days = 3`：`duration_days >= 3`；
  - 仅填写 `Max days = 3`：`duration_days <= 3`；
  - 填写 `Min days = 1`、`Max days = 3`：`duration_days between 1 and 3`，包含两端。

### 2.2 Pairing Start Date 限制

- 外层标题保持 `LIMIT TO PAIRING START DATE`，不能改成通用的 `LIMIT TO EVENT DATE`。
- 开关默认关闭；关闭时 `dateScope = null`。
- 开关打开后默认进入 `Specific Dates`，初始未选日期，因此条件尚未完成。
- `Specific Dates` 使用多选日期控件：
  - 选择一个日期代表单日期限制；
  - 选择多个日期代表离散多日期限制；
  - 至少选择一个日期后才有效。
- `Date Range` 使用范围日期控件：
  - `from`、`to` 均必填；
  - `from <= to`；
  - 范围包含起止日期。
- `Specific Dates` 与 `Date Range` 切换时清空上一模式的值，避免隐藏条件继续生效。
- 关闭日期限制时清空当前日期值；再次开启从空的 `Specific Dates` 开始。

### 2.3 日期业务语义

- 日期判断对象仍是 pairing start date，而不是 pairing 覆盖期间的任意日期，也不是 duty event date。
- 本轮只扩展日期选择形态，不改变当前 pairing start date 的计算表达式或时区定义。
- Search Pairings、pool count、草稿保存、Favorite、编辑回显、摘要和算法导出必须使用同一 payload 语义。

## 3. 方案对比

### 方案 A：保留现有 Date Range

优点：无需修改。

缺点：不符合标准答案，也无法表达不连续的 pairing start dates。

结论：不采用。

### 方案 B：在 PairingLengthEditor 内复制 Specific Dates / Date Range UI

优点：局部实现直观。

缺点：会复制已经存在的日期模式切换、清空、验证和可访问性逻辑；后续多个条件容易再次漂移。

结论：不采用。

### 方案 C：扩展并复用 OptionalEventDateScopeEditor

保留共享组件现有默认行为，同时允许调用方传入业务标题及可访问名称。`Pairing Length` 传入 `LIMIT TO PAIRING START DATE`，内部继续复用与标准答案一致的 `Specific Dates | Date Range`、多选日期和范围日期控件。

优点：交互完全统一、改动最小、现有条件默认行为不变。

结论：采用。

## 4. Contract 设计

将 `PbsPairingLengthDateScope` 从仅范围：

```ts
type PbsPairingLengthDateScope = {
  mode: "date_range";
  from: string;
  to: string;
};
```

扩展为：

```ts
type PbsPairingLengthDateScope =
  | { mode: "specific_dates"; dates: string[] }
  | { mode: "date_range"; from: string; to: string };
```

完整示例：

```json
{
  "type": "pairing-length-preference",
  "minDays": 1,
  "maxDays": 3,
  "dateScope": {
    "mode": "specific_dates",
    "dates": ["2026-08-03", "2026-08-07", "2026-08-12"]
  },
  "min": 1,
  "max": 7
}
```

兼容规则：

- 现有 `{ mode: "date_range", from, to }` payload 原样继续支持。
- `dateScope = null` 继续表示不限 pairing start date。
- 现有 legacy `stepper` / `stepper-range` Pairing Length 读取与转换逻辑保持不变。
- 新保存的数据只使用扩展后的专用 `pairing-length-preference` shape。

### 4.1 必须同步的 authoritative touchpoints

扩展类型声明本身不足以保证运行时兼容。实施时必须逐项更新并测试：

- `packages/contracts/pbs-pairing-bids.d.ts`：公开 union 类型；
- `packages/contracts/pbs-pairing-bids.js` 中 `normalizePbsPairingBidValueForRules()`：保留、排序并去重 `specific_dates`，不能归一化为 `null`；
- shared condition signature：不同离散日期集合必须生成不同 signature，相同集合仅顺序不同则生成相同 signature；
- Portal `clonePairingBidValue()`：对 `specific_dates.dates` 做深拷贝，不能共享数组引用；
- Server `rule-bid-types.ts`：运行时 RuleBidValue union；
- Server `parsePairingLengthDateScope()`：接受两种模式并保留全部离散日期；
- Server `cloneRuleBidValue()`：深拷贝 `dates`；
- Portal 与 Server 的 `formatPairingLengthDateScope()`：分别格式化离散日期和范围日期；
- `serializeRuleBid()` / deserialize JSON round trip：完整保留 dateScope。

上述链路是验收范围，不能只修改 editor、Zod schema 和搜索 SQL。

## 5. Portal 设计

### 5.1 共享日期控件

扩展 `OptionalEventDateScopeEditor` 的展示参数，至少允许调用方覆盖：

- 可见标题，默认仍为 `LIMIT TO EVENT DATE`；
- switch、calendar、clear、open、remove-date 等可访问名称中的日期语义。

默认参数必须保证现有 `Flight Legs per Duty` 等调用方无需修改且 UI/aria 行为不变。

### 5.2 PairingLengthEditor

删除当前编辑器内部维护的单一 range picker 状态和专属 range handler，改为复用共享日期控件：

- 可见标题：`LIMIT TO PAIRING START DATE`；
- `Specific Dates`：使用 `PbsDatePicker mode="multiple"`；
- `Date Range`：使用 `PbsDatePicker mode="range"`；
- 日期范围受当前 PBS period 限制；
- `Min days / Max days` 的输入、验证和回显不变。

### 5.3 有效性与摘要

- 日期限制关闭：只验证 Min/Max。
- `specific_dates`：必须至少一个合法 ISO 日期。
- `date_range`：两端必须是合法 ISO 日期且顺序正确。
- 日期必须位于当前 period 内；沿用其他 Event Date 条件的 period validation 规则。
- Portal 始终拥有当前 `periodCode`，因此新选择的日期必须处于当前 period。
- 摘要建议：
  - 单日期：`1-3 days · starting on 2026-08-03`；
  - 多日期：`1-3 days · starting on 2026-08-03, 2026-08-07`；
  - 范围：`1-3 days · starting 2026-08-03 - 2026-08-12`。

## 6. Server 与搜索语义

### 6.1 Schema 与业务验证

Pairing Length 的 route schema 和 service validation 接受两种日期模式：

- `specific_dates`：非空数组，每项为合法 ISO date；
- `date_range`：合法 `from/to`，并满足 `from <= to`。

两种模式都应验证日期属于当前 PBS period。错误信息保持 Pairing Length 业务语义，不使用 Flight Legs 或通用 Event Date 名称。

Period 兼容决策：

- 当调用上下文提供 `periodCode` 时，必须验证所有 specific dates 或 range 两端位于该 period。
- 当历史 Favorite、草稿 mutation 或兼容调用没有提供 `periodCode` 时，不得仅因缺少 period 而拒绝；此时只做日期格式、非空和顺序验证。
- 不主动改写或删除历史 range payload。缺少 period context 的读取与原样重存继续允许。
- 当历史 payload 被用于一个具有明确 period 的 Search Pairings / preview / pool count 时，再按该 period 验证；越界数据应返回定向验证错误，不能静默截断。
- 不以本轮需求强制所有旧 mutation route 新增必填 `periodCode`；如果实施调查发现服务层能从 authoritative draft/bid 上下文可靠取得 period，可复用该上下文，但不得凭默认月份推断。

### 6.2 Pairing Search

持续天数 SQL 保持不变。仅扩展 pairing start date 条件：

- `specific_dates`：pairing start date 命中所选日期集合，使用参数化 `IN` 或等价的安全参数表达式；
- `date_range`：继续使用闭区间 `between from and to`；
- `dateScope = null`：不追加日期条件。

必须复用现有 pairing occurrence start expression，不能退化为仅使用可能不准确的单一表字段。

Search Pairings 不会自动经过通用 `validatePairingPropertyPayload()`，因此 builder 本身必须接收并使用 `PairingSearchConditionContext.periodCode`：

- preview、row result count、tier pool count 必须走同一结构与 period 校验；
- 空 specific dates、非法日期、反向 range、已知 period 下的越界日期必须在 builder 阶段拒绝；
- 不能出现保存时通过、preview/count 时以另一套语义执行的情况。

### 6.3 持久化与当前算法导出

- pbs-server 的 JSON serialization/deserialization、clone、Favorite 和草稿保存不得丢失 `specific_dates`。
- lineholder readable summary 正确区分离散日期和范围日期。
- 当前 PBS algorithm export route 已迁移到 `live-server`，不能在 pbs-server 已返回 `410` 的旧 route 上声称完成导出验证。
- `live-server/src/services/algorithm-export/pairing-score-export.ts` 会读取 `pbs_bid_group.param_a`，通过本地 `deserializeRuleBid()` 解析 bid，再调用本地 `buildPreviewCondition()` 计算 pairing score CSV；它不是 JSON 透传。
- 因此 live-server 必须同步以下 authoritative touchpoints：
  - 本地 `rule-bid-types.ts`：加入 `pairing-length-preference` 及两种 dateScope；
  - 本地 `rule-bid-value.ts`：反序列化 Pairing Length JSON，并保留全部 specific dates；
  - 本地 Pairing Search property `112` builder：支持 Min/Max、复用 occurrence start expression，并实现 `specific_dates` / `date_range` 与 period 语义。
- live-server 计算出的 score 语义必须与 pbs-server Search Pairings 一致：两个离散起始日期命中，夹在中间但未选择的日期不命中；现有 date range 闭区间行为继续兼容。
- pbs-server 已保留的旧 export service 文件不是本轮 authoritative HTTP 出口，不以其单独通过作为验收依据。

## 7. 数据流

```text
用户选择 Specific Dates / Date Range
  → PairingLengthEditor
  → pairing-length-preference.dateScope
  → Portal draft / Favorite / Search Pairings
  → pbs-server schema + business validation
  → Pairing Search 按 pairing start date 过滤
  → pbs-server summary / persistence 保留相同语义
  → live-server 反序列化持久化 JSON
  → 按相同 Pairing Length / start-date 语义生成 score CSV
```

## 8. 错误处理与边界

- 日期限制开启但未选日期：Add/Save 保持禁用。
- `specific_dates` 为空：拒绝保存。
- 日期格式无效或超出 period：拒绝保存，并返回 Pairing Length 定向错误。
- 日期范围缺一端或反向：拒绝保存。
- 多日期在 shared contract normalization 中必须按 ISO 日期排序并去重，以保持稳定摘要、equality 和 condition signature；原始选择顺序不参与业务语义。
- 不把多个离散日期自动扩展为它们首尾之间的连续范围。
- 切换模式与关闭开关必须清除隐藏值，避免 UI 与实际过滤条件不一致。

## 9. 测试与验收标准

### 9.1 Portal focused tests

- 默认开关关闭，日期控件隐藏。
- 打开后默认显示 `Specific Dates`，Add/Save 因日期为空而禁用。
- 可选择一个日期并生成 `specific_dates` payload。
- 可选择多个离散日期并完整保存、摘要、编辑回显。
- 切换 `Date Range` 后清空 specific dates，并生成 range payload。
- 从 Date Range 切回 Specific Dates 后清空 range。
- 关闭开关后 `dateScope = null`。
- 现有 Min/Max only、Min only、Max only 与 legacy 回填测试继续通过。
- 共享组件的默认 `LIMIT TO EVENT DATE` 及现有调用方回归不变。
- shared contract normalization 不丢失 specific dates；不同日期集合 signature 不同，相同集合不同顺序 signature 相同。
- Portal clone 后修改日期数组不会改变原 bid，证明不存在共享引用。

### 9.2 Server focused tests

- route schema 与 service validation 接受单个及多个 `specific_dates`。
- 拒绝空数组、非法日期；有 period context 时拒绝超出 period 的日期。
- 无 `periodCode` 的历史 Favorite/草稿 mutation 仍可读取并原样重存合法旧 range；不得仅因 period 缺失失败。
- 原有合法/非法 `date_range` 测试继续通过。
- clone、serialize/deserialize、readable summary 保留所有离散日期且深拷贝数组。
- Pairing Search：
  - 单日期命中 equality/IN 条件；
  - 多日期命中离散集合；
  - range 继续生成闭区间；
  - 不限制日期时没有额外 start-date clause。
  - preview、row count、tier pool count 共享 builder 校验和 period 语义。
- live-server 当前算法导出：
  - 成功反序列化专用 Pairing Length JSON；
  - 两个离散 start dates 对应的 pairings 获得预期 score；
  - 夹在中间但未选择日期的 pairing 不得计分；
  - 原有 date range score 行为继续通过。
- 不得只测试 pbs-server 的 410 旧 route，也不得以“JSON 未丢失”替代 score 语义测试。

### 9.3 Playwright 与人工 QA

真实 PBS Portal Pairing 页面覆盖：

1. 新增 Pairing Length，选择 Tier、Award/Avoid 和 Min/Max。
2. 打开 `LIMIT TO PAIRING START DATE`。
3. 在 `Specific Dates` 中选择一个日期，再增加第二个不连续日期。
4. 保存并重新编辑，确认两个日期均回显，夹在两者之间但未选择的日期不命中。
5. 切换为 `Date Range`，选择起止日期，保存并重新编辑。
6. 在 Search Pairings 中确认两种日期模式均可编辑，preview 与 pool count 都走真实后端，并断言具体 pairing 的包含/排除结果。
7. 确认 `Flight Legs per Duty` 等现有条件仍显示 `LIMIT TO EVENT DATE`。
8. 在标准参考分辨率下人工对照截图，确认开关打开后同时显示 `Specific Dates` 与 `Date Range`，且默认选中前者；布局、间距和日期触发器与标准答案一致。

Playwright 还必须断言：切换模式或关闭开关后，旧日期不再出现在保存/preview 请求中。

更新人工 QA：`docs/test-cases/pbs/pairing/<date>-pairing-length-start-date-selection.md`。

## 10. 验证门槛

实施完成后至少运行并记录：

```bash
cd pbs-portal && pnpm exec vitest run <pairing-length-and-shared-date-tests>
cd pbs-portal && pnpm exec tsc --noEmit --pretty false
cd pbs-server && pnpm exec tsc --noEmit --pretty false
cd pbs-server && node --import tsx --test <pairing-length-server-tests>
cd live-server && pnpm exec vitest run <pairing-length-algorithm-export-test>
cd e2e && npx playwright test --config=config/playwright.config.ts --project=pbs-portal <pairing-length-spec> --reporter=list
npm run check:ui
git diff --check
```

如果共享 editor、dialog、Search Pairings 或 contract 受影响，按项目门槛补跑相应更广测试。不得仅凭代码检查宣称完成。

## 11. 非目标

- 不改变 `Min days / Max days` 为离散 pairing length 多选。
- 不改变 pairing start date 的定义或时区计算。
- 不改变日期范围的闭区间语义。
- 不修改 `Flight Legs per Duty`、`Airport Preference`、`Pairing Check-In / Check-Out Time` 的业务 payload。
- 不新增数据库表、字段、migration 或第三方依赖。
- 不执行远端数据写入。

## 12. Multi-Agent Parallelism Assessment

- Recommendation: No。
- Rationale: 改动横跨 contract、共享日期 editor、Pairing Length editor、pbs-server validation/search、live-server algorithm export 和测试，但围绕同一紧耦合 bid shape；多人并行更容易造成 payload、Search 与 score 语义不一致。
- Suggested split: 单 agent 顺序完成 contract → Portal → pbs-server → live-server export → focused tests → Playwright。
- Write boundaries: 仅修改 Pairing Length、共享日期 editor 的可配置展示参数、live-server 对该 bid 的反序列化/score 计算，以及直接相关测试/QA。
- Conflict risk: Medium。当前工作区已有其他 Pairing 条件改动，实施时必须逐文件检查并只暂存本任务 hunks。
- Execution gate: 用户审阅并明确批准本 spec 后，才编写实施计划和修改产品代码。
