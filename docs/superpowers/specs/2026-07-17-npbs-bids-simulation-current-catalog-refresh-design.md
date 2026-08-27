# NPBS Bids Portal Simulation 当前可见条件升级设计

## 背景

`108-npbs-bids-portal-simulation` skill 用于把 legacy NPBS-Legend `CLASS-BidsReport_*.txt` 转成 PBS Portal crew bid，并用 Playwright 登录员工端逐个回放。该 skill 的整体框架仍然有价值：解析文本、生成 fixture、串行登录、真实 UI 添加 bid、记录 issue、生成 Word report。

但 2026-07 中旬以后，PBS bid 条件和 Portal 前端已经多次调整：

- Bid 页面已经合并为 `/bid`，当前 merged workbench 只在右侧 `ADD BID PROPERTIES` 中通过 category tab 展示 `FAVORITED PROPERTIES / DAYS OFF / PAIRING / LINE`。
- `Reserve` 仍是独立 `/reserve` 页面。
- 多个条件已经合并、改名或改 payload，例如 `Airport Preference`、`Pairing Preference`、`Flight Number Preference`、`Pairing Length`、`Reserve Preference`、`Long Stretch Off / Compressed Flying`。
- 旧 skill 里的 mapping 仍引用旧 property 或旧 UI label，例如 `Pairing Number`、`Any Flight Number`、旧 `Airport` tag-list、旧 `Short Call Type`、旧 Line `401/402/404/405`。

因此 108 skill 需要 refresh：不重写 replay 框架，但必须以当前员工端实际显示条件为准更新 mapping、page object 和 smoke 验收。

## 目标

1. 让 NPBS replay 只尝试添加当前员工端可见且受 contract 支持的条件。
2. 对已隐藏、已合并、已不再支持的旧 NPBS predicate，记录为 `unsupported` 或 `hidden-current-catalog`，不再错误地尝试打开旧 property。
3. 适配 merged `/bid` workbench：Days Off、Pairing、Line 通过同一页面 category tab 操作；Reserve 继续走 `/reserve`。
4. 继续遵守 108 skill 硬规则：不能为了让 legacy bid 塞进去而改产品代码；无法真实映射的 predicate 必须记录，不强行落库。
5. 每次完整模拟后仍必须生成 Word report。

## 非目标

- 不在本任务中新增或修改产品 bid 条件。
- 不改变 PBS Portal 员工端 UI。
- 不改变 NPBS 原始文本 parser 的基本 grammar，除非 fixture 回归显示当前 parser 已无法读取新样本。
- 不覆盖 Standing Bid。`218 Day of Week Off`、`312/313/314 Reserve Standing` 属于 Standing Bid，不纳入 current crew-bid replay。
- 不保证所有 legacy NPBS predicate 都能映射；只保证可映射项准确，不能映射项可解释、可统计。

## 当前可见条件基线

基线来源：

- 远端 `f8_pbs.pbs_bid_property` 中 `is_active=1` 且 `is_visible_in_portal=1` 的行。
- 叠加当前 `packages/contracts/pbs-*-bids.js` supported catalog 过滤。
- 当前 merged Bid workbench 和 Reserve 页面行为。

### Pairing

| Code | 当前显示名 | 当前 payload 类型 | NPBS replay 处理 |
|---:|---|---|---|
| 103 | Pairing Check-In / Check-Out Time | `pairing-check-time` | 映射旧 Check-In / Check-Out time predicate |
| 168 | Airport Preference | `airport-preference` | 映射旧 landing / layover airport predicate |
| 102 | Pairing Preference | `pairing-preference` | 映射旧 Pairing Number predicate |
| 107 | Flight Legs per Duty | `flight-legs-per-duty` | 映射旧 Duty Legs predicate |
| 110 | Work Day Preference | `work-day-preference` | legacy `Any Duty On` 只有日期/星期、缺少当前 editor 必填的 check-in window；先记录 unsupported，不伪造默认时间 |
| 112 | Pairing Length | `pairing-length-preference` | 映射旧 Pairing Length 比较为 min/max 语义 |
| 116 | Flight Number Preference | `flight-number-preference` | 映射旧 Any Flight Number predicate |
| 117 | Redeye Preference | `redeye-preference` | 映射旧 Any Leg Is Redeye |
| 122 | Deadhead Flying | `deadhead-flying` | 仅当 NPBS predicate 能明确表达 deadhead 时映射 |
| 129 | Time Between Flights | `duration` | 仅映射明确 connection/time-between predicate |
| 163 | Month-End Carryover | `month-end-carryover` | 仅映射明确 carryover predicate |

### Days Off

| Code | 当前显示名 | 当前 payload 类型 | NPBS replay 处理 |
|---:|---|---|---|
| 201 | Prefer Off | `tag-list` + Prefer Off editor 语义 | 映射 Specific Date / Date Range / Days of Week / Weekends / Time Window；不再写 fulfilment / min / max |
| 204 | Long Stretch Off / Compressed Flying | `stepper-date-range` | 映射窗口内最少连续休息天数；默认 Award，无 Award/Avoid 控件 |

### Line

| Code | 当前显示名 | 当前 payload 类型 | NPBS replay 处理 |
|---:|---|---|---|
| 429 | Credit Window Preference | `credit-window-preference` | 映射 Maximum / Minimum Credit Window 到新条件 |
| 407 | Minimum Base Layover | `minimum-base-layover` | 映射 base layover minimum predicate |
| 408 | Commuter Pattern | `days-off-on-pattern` | 映射 commuter / days-off-on pattern |
| 428 | Efficient Flying First | `flag` | 映射 Most Flying In Least Days / Efficient Flying |
| 410 | Mixed Block Pattern | `reserve-flying-date-pattern` | 映射 reserve / flying mixed block predicate；旧显示名不再使用 |
| 427 | Reserve Avoidance | `reserve-avoidance` | 映射 reserve avoidance predicate |

### Reserve

| Code | 当前显示名 | 当前 payload 类型 | NPBS replay 处理 |
|---:|---|---|---|
| 301 | Reserve Preference | `reserve-call-type-date-scope` | 映射旧 Short Call Type；旧 Reserve Day On 不再作为 302 添加 |

## 设计方案

采用方案 B：保留 skill 框架，升级当前 catalog mapping 和页面操作层。

### 方案 A：只更新文档

只把 `SKILL.md` 的 mapping 表改成当前条件，但不改 `mapping.mjs` 和 Playwright page object。

优点：快。

缺点：实际 replay 仍会失败，报告依然污染，不满足用户后续使用目的。

### 方案 B：文档 + mapping + page object 一起升级（推荐）

同步更新：

- `.agents/skills/108-npbs-bids-portal-simulation/SKILL.md`
- `e2e/utils/npbs/mapping.mjs`
- `e2e/pages/pbs-portal/bid-workbench-page.ts`
- `e2e/utils/npbs/parse-npbs-bids.test.mjs`
- 必要的 NPBS replay smoke fixture / Playwright 回归

优点：能真实跑当前 Portal，失败原因可信。

风险：page object 需要覆盖多个专用 editor，改动面中等。

### 方案 C：重建一个新 skill

废弃 108，另建新 skill。

优点：语义完全干净。

缺点：会丢掉现有 parser、fixture、report、R'Bot runner 经验，不必要。

结论：采用方案 B。

## Mapping 升级规则

### 总规则

1. `mapPredicate()` 返回的 descriptor 必须属于当前可见条件基线。
2. 如果 legacy predicate 只能对应已隐藏旧条件，返回 `{ skipped: true, reason: "hidden-current-catalog: ..." }`。
3. 如果 legacy predicate 语义无法忠实表达，返回 `{ skipped: true, reason: "unmapped-..." }`。
4. 不再把旧 property name 写入 descriptor。descriptor 的 `name` 必须使用当前 Portal 显示名。
5. Mapping 不应该伪造日期、机场、pairing label、flight number；找不到选项时由 Playwright 记录 blocker。

### Pairing 重点映射

- `Pairing Number ...` -> `102 Pairing Preference`
  - `bid.type = "pairing-preference"`
  - legacy pairing label 进入 `pairingLabels`
  - page object 必须用当前 Pairing picker / autocomplete 选择真实选项。
- `Any Landing In ...` / `Any Layover In ...` -> `168 Airport Preference`
  - Landing -> `event = "landing"`
  - Layover -> `event = "layover"`
  - 如果 legacy predicate 同时表达 landing/layover，才使用 `event = "both"`。
  - `locations` 使用机场 code。
  - Preferred layover hours 开关默认关闭；legacy 没有小时信息时不写 `minimumLayoverDuration`。
- `Pairing Check-In Time ...` / `Pairing Check-Out Time ...` -> `103 Pairing Check-In / Check-Out Time`
  - 使用 `timeType` 区分 `check_in` / `check_out`。
  - `Between` 映射 `from/to`；单边比较映射当前 editor 支持的 operator/value。
- `Duty Legs ...` -> `107 Flight Legs per Duty`
  - `operator/value` 映射到 `flight-legs-per-duty`。
  - `Any/Every` 保留 quantifier。
- `Any Duty On ...` -> 暂不自动落 `110 Work Day Preference`
  - 当前 Work Day editor 需要日期/星期之外的 check-in time window。
  - legacy predicate 只表达日期/星期，不能无损映射；记录 `unsupported-current-editor: Work Day Preference`。
  - 后续如果 NPBS 文本能提供 time window，再补 `work-day-preference` replay handler。
- `Pairing Length > N` -> `112 Pairing Length`
  - `> N` 映射为 `minDays = N + 1`。
  - `< N` 映射为 `maxDays = N - 1`，若小于 1 则 unsupported。
  - `= N` 映射为 `minDays = N, maxDays = N`。
  - 如果 NPBS 出现范围，映射为 `minDays/maxDays`。
- `Any Flight Number ...` -> `116 Flight Number Preference`
  - flight number list 进入 `flightNumbers`。
  - legacy 无日期限制时 `dateScope = null`。
- `Any Leg Is Redeye` -> `117 Redeye Preference`
  - `bid.type = "redeye-preference"`，`dateScope = null`。
  - action 按 NPBS Award/Avoid 保留；新增默认仍由产品 editor 管理。
- Deadhead / Month-End / Time Between 只有在 legacy predicate 明确时映射；不推断。

### Days Off 重点映射

- `Prefer Off ...` -> `201 Prefer Off`
  - 支持 `specific_dates`、`date_range`、`days_of_week`、`weekends`、time window。
  - 不再输出 `allOrNothing=false`、`minimumN`、`maximumN`。
  - 保存应标准化为 `allOrNothing=true, minimumN=null, maximumN=null`。
- `Minimum Days Off In A Row ...` / `Long Stretch ...` -> `204 Long Stretch Off / Compressed Flying`
  - 需要能识别窗口日期时，输出 `stepper-date-range`：`value`, `from`, `to`。
  - 如果只有 “N consecutive days off” 但没有窗口，先记录为 unsupported，除非用户后续确认默认整月窗口。
  - action 固定 Award，mapping 不输出 Avoid。
- 旧 `202 Max Consecutive Days On`、`203 Min Consecutive Days Off`、`205 Pattern`、`206 Employee Schedule` 不再作为 current replay 目标；对应 predicate 应记录 hidden/unsupported。

### Line 重点映射

- `Maximum Credit Window` / `Minimum Credit Window` -> `429 Credit Window Preference`
  - 旧 `401/402` 不再直接添加。
  - 若 predicate 只表达方向但没有数值，记录 `needs-value` 或 `unsupported-current-editor`，不得伪造默认 credit。
  - 只有 legacy predicate 带出明确 credit window 数值时，才生成 `credit-window-preference`。
- `Minimum Base Layover ...` -> `407 Minimum Base Layover`
- `Commuter Pattern ...` -> `408 Commuter Pattern`
- `Most Flying In Least Days` -> `428 Efficient Flying First`
- `Reserve / Flying Date Pattern` 语义 -> `410 Mixed Block Pattern`
- `Reserve Avoidance` -> `427 Reserve Avoidance`
- 旧 `403/404/405/406/409` 不再添加；记录 hidden/unsupported。

### Reserve 重点映射

- `Short Call Type X` -> `301 Reserve Preference`
  - `callType = X`
  - 无日期信息时 `dateScope = { mode: "whole_month" }`
- `Reserve Day On` / 旧 `302` 不再添加。
  - 如果能被明确表达为 `301 Reserve Preference` 的 date scope，则转入 301。
  - 否则记录 hidden/unsupported。

## Page Object 升级

`BidWorkbenchPage` 需要从旧 “四个独立页面” 模型改成“merged Bid workbench + Reserve 独立页”模型。

### 导航

- `days-off`、`pairing`、`line`：
  - 进入 `/bid`。
  - 点击对应 tab：`DAYS OFF`、`PAIRING`、`LINE`。
  - 等待 `shared-bidding-workbench-viewport`、`bid-page`、`bid-available-properties-scroll`。
- `reserve`：
  - 继续进入 `/reserve`。
  - 等待 Reserve 当前页面可用区。

### 打开属性

- 不再依赖旧 route 后的全页 workspace。
- 对 `/bid`：
  - 通过 search 输入 `Search Bid Properties` 搜当前 tab。
  - 在当前 tab 的 available list 中找当前显示名。
  - 使用当前 “Add bid for <name>” button。
- 对 pairing 专用 editor，保留必要的 dedicated fill function。
- 对 rule-bid editor，优先使用当前共享 preference primitives 的稳定 aria label。

### 清理 Existing

旧 `npbs-crew-bids-simulation.spec.ts` 会在每个 page kind 开始时调用 `clearExisting(kind)`。合并后的 `/bid` 不再是单一类别页面，`EXISTING BID PROPERTIES` 会同时展示 Days Off、Pairing、Line 的 summary rows，所以不能继续用旧逻辑在每个 tab 里无差别删除。

升级后必须满足：

- `days-off`、`pairing`、`line` 的清理只能作用于本次 replay 范围内的类别。
- 如果仍按 page group 顺序处理，则 `clearExisting("days-off")` 只能删 Days Off row，`clearExisting("pairing")` 只能删 Pairing row，`clearExisting("line")` 只能删 Line row。
- 也可以新增 `clearExistingBidWorkbench(kinds)`，在进入 `/bid` 后一次性清理本次 fixture 包含的 current-bid 类别，然后后续 tab 切换不再重复清。
- Reserve 继续在 `/reserve` 独立清理。
- 不允许因为进入 `PAIRING` tab 而删除同一 crew 的 Days Off / Line 既有 bid，除非这些类别也在本次 fixture 的 `CREWBIDS_PAGES` 范围内且清理逻辑明确覆盖它们。

### Dedicated editor fill functions

至少需要覆盖：

- `fillPreferOff`
- `fillLongStretch`
- `fillPairingPreference`
- `fillAirportPreference`
- `fillPairingCheckTime`
- `fillFlightLegsPerDuty`
- `fillWorkDayPreference`
- `fillPairingLength`
- `fillFlightNumberPreference`
- `fillRedeyePreference`
- `fillDeadheadFlying`
- `fillTimeBetweenFlights`
- `fillMonthEndCarryover`
- `fillReservePreference`
- `fillLineCreditWindowPreference`
- `fillMinimumBaseLayover`
- `fillCommuterPattern`
- `fillMixedBlockPattern`
- `fillReserveAvoidance`

每个 fill function 的失败必须返回 `{ placed:false, reason }`，不能 throw 终止 crew。

## Fixture 和 Report 升级

- Fixture descriptor 增加 `mappedToCurrentCatalog: true` 或等价字段，便于 report 区分旧 mapping 与当前 mapping。
- issue reason 统一：
  - `unmapped-predicate`
  - `unmapped-pairing-condition`
  - `hidden-current-catalog`
  - `unsupported-current-editor`
  - `option-not-found`
  - `add-bid-disabled`
  - `ui-blocker`
- Word report 增加当前 catalog 版本摘要：
  - 可见条件数量：Pairing 11、Days Off 2、Line 6、Reserve 1。
  - 运行是否基于 merged `/bid` workbench。

## 测试与验收

### 单元测试

- `node --test e2e/utils/npbs/parse-npbs-bids.test.mjs`
  - 更新旧断言：`Pairing Number` -> `Pairing Preference`
  - `Pairing Length` -> `pairing-length-preference`
  - `Any Flight Number` -> `Flight Number Preference`
  - `Short Call Type` -> `Reserve Preference`
  - 旧 Line hidden 条件应记录 hidden/unsupported
  - `Prefer Off` 不再产生 fulfilment/min/max
  - `Long Stretch Off / Compressed Flying` 映射 204 或无窗口时 unsupported

### Playwright smoke

先创建或使用一个 1-2 crew 的小 fixture，覆盖：

- Days Off `Prefer Off`
- Days Off `Long Stretch Off / Compressed Flying`
- Pairing `Pairing Preference`
- Pairing `Airport Preference`
- Pairing `Pairing Length`
- Line `Credit Window Preference` 或 `Commuter Pattern`
- Reserve `Reserve Preference`

命令形态：

```bash
cd e2e
npx playwright test --config=config/playwright.config.ts --project=pbs-portal \
  --no-deps npbs-crew-bids-simulation.spec.ts --workers=1 --reporter=list
```

### Report gate

模拟完成后必须运行：

```bash
node e2e/utils/npbs/generate-report.mjs
```

交付说明必须包含 `.docx` 路径和核心 tally。

### 不跑全量的条件

在 smoke 没通过前，不允许启动 5 小时级全量 replay。全量 replay 只在下列条件满足后执行：

- parser 单测通过。
- 1-2 crew smoke 通过。
- report 能生成。
- issue JSON 中没有系统性 `property-not-found` 或 tab 选择失败。

## 数据与安全

- 不在 spec、skill 或 report 中写数据库密码。
- 不把 `.env` 中连接串复制到文档。
- 真实 crew replay 仍使用现有登录方式；避免并发登录同一账号导致 lockout。
- 大批量 replay 继续串行 crew，必要时后台运行并单独 monitor。

## 风险与处理

| 风险 | 影响 | 缓解 |
|---|---|---|
| merged `/bid` DOM 变化导致旧 selector 失效 | 大量 false failure | 先改 page object 导航和 tab 切换，再 smoke |
| mapping 仍引用隐藏旧 property | 报告污染 | descriptor 必须通过当前可见 catalog 白名单 |
| dedicated editor 数量多 | 实现容易漏 | 分批实现，先覆盖当前 fixture 中真实出现频率最高的 predicate |
| legacy predicate 信息不足 | 无法忠实映射 | 记录 unsupported，不推断 |
| Standing Bid 条件混入 | 错误地添加 current bid | 明确排除 218/312/313/314 |

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本任务核心是 `mapping.mjs` 与 `bid-workbench-page.ts` 的契约一致性，拆多 agent 容易让 mapping 和 UI 操作层失配。
- Suggested split: 不拆；先主线完成 mapping + page object + parser tests，再补 smoke。
- Write boundaries: `.agents/skills/108.../SKILL.md`、`e2e/utils/npbs/*`、`e2e/pages/pbs-portal/bid-workbench-page.ts`、必要的 `e2e/tests/pbs-portal/*`。
- Conflict risk: Medium。主要风险来自当前 `/bid` 合并后 DOM 和旧 NPBS replay 选择器差异。
- Execution gate: 用户确认本 spec 后再进入实现；实现前跑 GitNexus impact，提交前跑 detect_changes。

## 验收标准

1. 108 skill 文档不再列旧 property 作为当前 replay 目标。
2. `mapping.mjs` 只输出当前可见条件 descriptor，旧条件明确 skipped。
3. `BidWorkbenchPage` 能在 merged `/bid` 中切换 `DAYS OFF / PAIRING / LINE` 并打开对应条件。
4. Reserve replay 只使用 `301 Reserve Preference`。
5. Parser/mapping 单测覆盖新增和废弃映射。
6. 至少一个 smoke fixture 能真实通过 UI 添加多个类别的 bid。
7. 失败时 issue JSON 和 Word report 能清楚说明是 legacy predicate unsupported、选项缺失还是 UI blocker。
