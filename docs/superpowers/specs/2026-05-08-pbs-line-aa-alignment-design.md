# PBS Line 旧库兼容与 AA 扩展设计

日期：2026-05-08  
作者：Codex + lei  
状态：已确认，实施中

## 背景

当前 PBS Lineholder 主线已经具备基础骨架：

- `/pairing` 已经完成 Pairing 主体能力、Search Pairings、specific-date pairing、左侧日历蓝条详情与 Tx 编辑闭环。
- `/days-off` 已经具备 Lineholder Days Off 主体能力，左侧日历与右侧泛化 Days Off 规则已经接入同一份 Current draft。
- `/line` 已有真实前后端链路：`GET/PUT /api/line-bids/current`，保存到同一份 Lineholder Current draft。
- `/tier` 已能读取 `lineholder-bids/current/summary`，但它依赖 Calendar / Pairing / Line / Days Off 四类数据的完整度。

AA 文档中，Line Tab 的职责不是选择 pairing pool，而是影响系统如何把 pairing 放入整月 line。它会控制：

- preferred line value / credit。
- work block、cadence、commutable 等 line 形状。
- double-up、multiple pairings、waiver 等排线许可。

因此下一步不应先完善 `/tier`。Tier 是 AA 原文 Layer Tab，对应本项目 Tier，它更像 Lineholder bid 的 review / summary 页面。如果 Line 模块语义不足，先做 Tier 会在后续 Line 补齐后返工。

## 目标

1. 将 `/line` 从“有真实保存链路的基础规则页”升级为“旧库 Line 数据优先兼容、AA Line 能力可扩展”的可用版本。
2. Line 属性目录优先兼容 `init-docs/crew_bids_reference-2026-03-16-072929.xlsx` 中的旧库 Line `401-407`。
3. 保留旧库 Line `401-407` 的历史含义，不直接覆盖，以免未来历史 bid / legacy 数据无法正确回显。
4. AA Line 主体属性作为扩展能力进入 catalog：`source_type` 只标记来源，是否展示只由 `is_visible_in_portal` 开关控制；默认不硬替代旧库目录。
5. 前后端都补 Line 基础校验，不能只靠 UI。
6. 保持 Line 与 Pairing / Days Off / Calendar 共用同一份 Lineholder Current draft。
7. 交付时同时提供自动化测试、回归测试、QA 人工测试案例。

## 非目标

- 本期不做 `Buddy With` 完整闭环。
- 本期不做 `Avoid Person` 完整闭环。
- 本期不做员工搜索、邀请、接受/拒绝、通知或权限状态流转。
- 本期不做最终 PBS award 计算。
- 本期不做 Tier 页面大改；只保证 Line 保存后能进入现有 summary。
- 本期不修改非 PBS 模块。

## Line 属性范围

本期 Line catalog 采用和 Pairing / Days Off 一致的策略：

- 旧库 Line `401-407` 是默认兼容对象，优先保证读取、保存、回显和测试。
- AA Line Tab 提到的属性作为扩展能力保留在 catalog 中。
- `source_type='aa'` 只表示属性来源于 AA 文档，不等同于关闭；是否在 Portal 展示由数据库 `is_visible_in_portal` 控制，不在前端硬编码注入。

### 旧库 Line 401-407

旧库 Line 属性来自 `init-docs/crew_bids_reference-2026-03-16-072929.xlsx`，本期优先兼容：

| Code | 旧库名称 | 输入类型 | 本期语义 |
| --- | --- | --- | --- |
| 401 | `Max Credit Window` | flag | 兼容旧库最大 credit window 规则 |
| 402 | `Min Credit Window` | flag | 兼容旧库最小 credit window 规则 |
| 403 | `Clear Schedule and Start Next Bid Group` | flag | 兼容旧库 clear schedule / start next group |
| 404 | `No Same Day Pairings` | flag | 兼容旧库禁止 same-day pairings |
| 405 | `Waive No Same Day Duty Starts` | flag | 兼容旧库 waiver |
| 406 | `Forget Line` | integer | 兼容旧库指定忘记 line number |
| 407 | `Min Base Layover` | duration | 兼容旧库最小 base layover |

### AA Line 扩展属性

AA 文档中的 Line 主体属性作为扩展能力保留，后续可通过数据库开关逐步开启：

| 属性 | 输入类型 | 扩展语义 |
| --- | --- | --- |
| `Target Credit Range` | credit range | 目标月度 credit 范围 |
| `Maximize Credit` | flag | 请求尽量最大化总 credit |
| `Maximize International Credit` | flag | 请求尽量最大化 international credit |
| `Work Block Size` | number range | 连续工作日数量范围 |
| `Prefer Cadence on Day-of-Week` | weekday select | 希望 work block 按指定星期 cadence 开始 |
| `Commutable Work Block` | time range pair | 两个 back-to-back pairing 的 report/release 偏好 |
| `Pairing Mix in a Work Block` | pair length tuple | work block 内两个 pairing 的长度顺序 |
| `Allow Double-Up on Date` | date | 指定日期允许 double-up |
| `Allow Multiple Pairings` | flag | 允许同日 multiple pairings |
| `Allow Multiple Pairings on Date` | date | 指定日期允许 multiple pairings |
| `Allow Co-Terminal Mix in Work Block` | flag | 允许同 work block 混 co-terminal |
| `Clear Bids` | flag | 清除前序累计 bid 的 line property |
| `Waive 24 hrs Rest in Domicile` | flag | waiver，后续 Tx 持续生效 |
| `Waive Minimum Domicile Rest` | flag | waiver，后续 Tx 持续生效 |
| `Waive 30 hrs in 7 Days` | flag | waiver，后续 Tx 持续生效 |
| `Waive Carry-Over Credit` | flag | waiver，AA 语义中需 T1 启用并持续生效 |

暂缓：

- `Avoid Person`。
- `Buddy With`。

原因：这两项不是普通 property 输入，而是员工关系和状态流转，需要独立设计。

## Property Code 策略

当前旧库 Line `401-407` 在 `crew_bids_reference` 中已有历史含义，例如：

- `401 Max Credit Window`
- `402 Min Credit Window`
- `403 Clear Schedule and Start Next Bid Group`
- `404 No Same Day Pairings`
- `405 Waive No Same Day Duty Starts`
- `406 Forget Line`
- `407 Min Base Layover`

当前项目曾把 `401-407` 暂时映射为基础指标类 Line 属性。为了避免继续扩大历史含义冲突，本期采用：

1. 恢复并优先兼容 `401-407` 的旧库语义。
2. 不用 AA Line 属性覆盖 `401-407`。
3. 新增 AA Line 扩展属性 code，建议从 `411` 开始。
4. `401-407` 标记为 `source_type='legacy'`，默认 `is_visible_in_portal=1`。
5. AA Line 扩展属性标记为 `source_type='aa'`，默认 `is_visible_in_portal=0`；后续需要启用时只改 `is_visible_in_portal`，不改 `source_type`。
6. 前端 Line catalog 仍从后端返回的 visible catalog 派生，不在页面硬编码注入。

建议 code：

| Code | Name |
| --- | --- |
| 411 | `Target Credit Range` |
| 412 | `Maximize Credit` |
| 413 | `Maximize International Credit` |
| 414 | `Work Block Size` |
| 415 | `Prefer Cadence on Day-of-Week` |
| 416 | `Commutable Work Block` |
| 417 | `Pairing Mix in a Work Block` |
| 418 | `Allow Double-Up on Date` |
| 419 | `Allow Multiple Pairings` |
| 420 | `Allow Multiple Pairings on Date` |
| 421 | `Allow Co-Terminal Mix in Work Block` |
| 422 | `Clear Bids` |
| 423 | `Waive 24 hrs Rest in Domicile` |
| 424 | `Waive Minimum Domicile Rest` |
| 425 | `Waive 30 hrs in 7 Days` |
| 426 | `Waive Carry-Over Credit` |

## Bid 值模型

复用现有 `RuleBidValue` / `PbsLineBidValue` 能力，必要时补极少量类型：

- `flag`：无参数开关类属性。
- `stepper-range`：TCR、Work Block Size。
- `select`：weekday。
- `time-range` 或组合结构：Commutable Work Block。
- `stepper-range-date` / `date`：日期型 waiver。
- `tag-list` 或 tuple-like value：Pairing Mix in a Work Block。

如果现有通用控件表达不了 `Pairing Mix` 或 `Commutable Work Block`，优先在 RuleBid 通用 value 渲染层补最小能力，不为 Line 单独写一套完全不同的面板。

## 校验规则

后端必须兜底，前端可以做即时提示。

本期校验分两层：

- 对旧库 `401-407`：优先保证旧库数据可被保存、回显和基础合法性校验。
- 对 AA 扩展属性：先在 contract / catalog 层保留定义；只有被数据库打开可见并进入保存链路时，才启用对应 AA 校验。

### 1. 单层唯一

AA 扩展属性被启用时，同一 Tx 中以下属性最多出现一次：

- `Target Credit Range`
- `Work Block Size`
- `Prefer Cadence on Day-of-Week`
- `Commutable Work Block`

### 2. 同层可多次使用

AA 扩展属性被启用时，同一 Tx 中以下属性可多次出现，不同值表达 OR 语义：

- `Pairing Mix in a Work Block`
- `Allow Double-Up on Date`
- `Allow Multiple Pairings on Date`

### 3. 范围限制

旧库属性：

- `Forget Line`：line number 必须是正整数。
- `Min Base Layover`：duration 必须是合法 `HHH:MM` 或当前项目已支持的 duration 格式。

AA 扩展属性被启用时：

- `Target Credit Range`：
  - min >= 40
  - max <= 110
  - max - min >= 5
  - min <= max
- `Work Block Size`：
  - min >= 1
  - max <= 12
  - min <= max
- `Pairing Mix in a Work Block`：
  - 两个 pairing length 合计应在 3-6 天。
  - 顺序有意义，`3,1` 与 `1,3` 是两条不同偏好。

### 4. Persistent 提示

以下属性在 AA 中属于 persistent line property，本期至少要保存并在 UI / summary 中有提示：

- `Maximize Credit`
- `Maximize International Credit`
- `Allow Double-Up on Date`
- `Allow Multiple Pairings`
- `Allow Multiple Pairings on Date`
- `Allow Co-Terminal Mix in Work Block`
- `Waive 24 hrs Rest in Domicile`
- `Waive 30 hrs in 7 Days`
- `Waive Minimum Domicile Rest`
- `Waive Carry-Over Credit`

本期不做 award 计算，不要求模拟最终生效结果，但不能把这些属性当作普通一次性规则误导用户。

### 5. Restrictive 提示

以下属性在 AA 中有 restrictive 语义：

- `Work Block Size`
- `Commutable Work Block`

本期先做基础保存和可读提示。跨 Tx 累计限制如果实现成本可控，可在后端校验；如果会扩大范围，放到下一期 Line Hardening。

### 6. Clear Bids

`Clear Bids` 本期保存为 line property，并在说明中提示它会影响前序累计 bid。复杂 pairing shuffle / award 行为不在本期计算。

## 前端设计

### 1. `/line` 页面

继续复用 `RuleBidRightPanel`：

- Existing 区展示已保存 Line properties。
- Add 区展示后端返回的 visible Line catalog；默认优先为旧库 `401-407`。
- 保持当前自动保存体验。
- 保存成功后刷新：
  - Line page query。
  - Tier summary query。
  - 必要时刷新 Bidding Calendar query。

### 2. 输入控件

优先复用通用 RuleBid 控件：

- `flag` 展示为无参数 property。
- `stepper-range` 展示为 min/max 两个输入。
- `select` 展示 weekday 下拉。
- `date` 展示日期输入。
- `time-range` 展示时间范围。

如果某属性需要组合输入，先用最小可维护的通用 value type 表达，不引入新依赖。

### 3. 文案

- 继续使用本项目术语 `Tier / Tx`。
- 引用 AA 文档时写清“AA 原文 Layer，对应本项目 Tier”。
- 页面表头继续使用 `PROPERTY`，不要回退为 `PRIORITY`。
- Line 属性说明要避免让用户误以为它会改变 pairing pool；它主要影响 line 构建。
- 当前默认 catalog 应体现旧库 Line 语义；AA Line 属性如未开启，不应在页面被前端硬编码展示。

## 后端设计

### 1. Contract

更新：

- `packages/contracts/pbs-line-bids.js`
- `packages/contracts/pbs-line-bids.d.ts`

内容：

- 恢复 / 修正旧库 `401-407` Line 属性定义。
- 增加 AA Line 扩展属性定义，但默认不要求 Portal 展示。
- 明确每个属性的默认 bid value。
- 保留旧 `401-407` 类型兼容，不删除旧定义相关能力。

### 2. Catalog / Seed / Migration

需要补：

- `pbs_bid_property` 中恢复 / 修正 `401-407` 为旧库 Line 语义，并保持 `source_type='legacy'`、`is_visible_in_portal=1`。
- `pbs_bid_property` 中新增 `411-426` AA Line 扩展属性，并默认 `source_type='aa'`、`is_visible_in_portal=0`。
- 若当前 DB 中已经把 `401-407` 用作基础指标，需要通过 migration/seed 修正定义；历史已保存 draft 仍按 stable `property_definition_id` 和 `legacy_property_code` 正常回显。

### 3. Service

更新 `pbs-server/src/services/line/line-bid-service.ts`：

- 读取 visible Line catalog，默认返回旧库 `401-407`。
- 保存时序列化新 value 类型。
- 在 normalize 阶段执行 Line 校验。
- 保持 `bid_type='Line'`。
- 保持稳定 `property_definition_id`。
- 保持 `draftVersion` 并发语义。
- 保存后继续 `syncBidTiers`。

如校验逻辑变长，新增：

- `pbs-server/src/services/line/line-validation.ts`
- `pbs-server/src/services/line/line-validation.test.ts`

## Tier 影响

本期不重做 Tier 页面，但 Line 保存后必须能进入现有 summary：

- `lineholder-summary-service` 已统计 `lineCount`。
- Summary item 应能展示 `bidType='Line'`、property name、bid、tiers。

若新增 value 类型导致 summary `bid` 展示为 `—` 或不可读，需要补轻量 formatter，但不做 Tier 大 UI 重构。

## 测试计划

### 自动化测试

后端：

- `pbs-server/src/routes/line-bids.test.ts`
- `pbs-server/src/services/line/line-validation.test.ts`
- 必要时补 `line-bid-service` 定向测试。

覆盖：

- GET 默认返回旧库 Line `401-407` visible catalog，不默认返回 AA 扩展属性。
- PUT 保存 `Clear Schedule and Start Next Bid Group` 并回显。
- PUT 保存 `No Same Day Pairings` flag 并回显。
- PUT 保存 `Forget Line` integer 并回显。
- PUT 保存 `Min Base Layover` duration 并回显。
- `Forget Line` 非正整数时拒绝。
- `Min Base Layover` 非法 duration 时拒绝。
- 如果测试打开 AA 扩展属性，则覆盖 `Target Credit Range` / `Work Block Size` 等 AA 校验。
- 并发 `draftVersion` 冲突仍返回 409。

前端：

- `pbs-portal/src/features/line/pages/line-page.test.tsx`
- `pbs-portal/src/features/line/line-draft-mappers.test.ts`
- 必要时补 `rule-bids` 通用控件测试。

覆盖：

- Line 页面默认展示旧库 Line property catalog。
- 添加 `Clear Schedule and Start Next Bid Group` 后保存。
- 添加 `No Same Day Pairings` 后保存。
- 添加 `Forget Line` 后保存。
- 添加 `Min Base Layover` 后保存。
- 保存成功后刷新 Tier summary。
- 校验错误显示且不误判保存成功。

### 回归测试

交付前至少运行：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
npm test -- src/routes/line-bids.test.ts src/services/line/line-validation.test.ts
npm run build

cd /Users/lei/Codehub/rois-ai/pbs-portal
npm test -- src/features/line/pages/line-page.test.tsx src/features/line/line-draft-mappers.test.ts
npm run lint
npm run build

cd /Users/lei/Codehub/rois-ai
npm run verify:pbs
```

如涉及性能敏感接口，补跑 PBS perf baseline，确保相关接口仍在 2 秒目标内。

### QA 人工测试案例

按新规则新增：

```text
docs/test-cases/pbs/line/2026-05-08-line-legacy-catalog-and-aa-extension.md
```

内容至少包含：

- 前置条件：登录账号、当前 bid period、已有 Pairing / Days Off 数据。
- 正常路径：
  - 添加旧库 `Clear Schedule and Start Next Bid Group`。
  - 添加旧库 `No Same Day Pairings`。
  - 添加旧库 `Forget Line`。
  - 添加旧库 `Min Base Layover`。
  - 切换 Tx 并确认保存。
  - 进入 Tier 页面确认 Line summary 出现。
- 异常路径：
  - `Forget Line` 输入非法 line number。
  - `Min Base Layover` 输入非法 duration。
  - 关闭的 AA 扩展属性不应出现在默认 Add Line Properties。
- 回归范围：
  - Pairing 页面不受影响。
  - Days Off 页面不受影响。
  - 左侧 Bidding Calendar active Tx 不被页面切换重置。

## 验收标准

1. `/line` 默认可添加旧库 Line `401-407` 属性，并保持旧库语义。
2. Line 属性保存、刷新后回显。
3. Line 保存后 `/tier` summary 能显示对应 Line property。
4. AA Line 属性作为扩展能力保留在 catalog / DB 中，默认不硬替代旧库属性。
5. 前后端都拦截明显非法 Line bid。
6. 不新增 `Layer / Lx` PBS 业务术语。
7. 自动化测试、回归测试、QA 人工测试案例齐全。
8. `npm run verify:pbs` 通过。

## 风险与控制

- 风险：AA Line 属性一次补太多导致控件复杂。  
  控制：本期默认优先旧库 `401-407`，AA Line 作为扩展保留；暂缓 `Buddy With / Avoid Person`。

- 风险：覆盖旧库 `401-407` 造成历史数据语义错误。  
  控制：恢复并优先兼容旧库 `401-407`；新增 `411+` AA Line code 作为扩展，不直接覆盖旧 code。

- 风险：Line 属性与 Pairing pool 关系被用户误解。  
  控制：UI/QA 说明中明确 Line property 不直接改变 pairing pool，而是影响 line 构建。

- 风险：Tier 页面 summary 显示新 value 不可读。  
  控制：如发现新 value 显示为 `—`，只补 formatter，不做 Tier 大改。

## 实施顺序

1. 更新 Line contract，增加 AA Line 主体属性定义。
2. 修正 Line contract 中旧库 `401-407` 定义，并增加 AA Line 扩展属性定义。
3. 增加 migration / seed，恢复 `401-407` legacy 可见，写入 `411-426` AA 扩展并默认隐藏。
4. 增加 Line validation helper 和后端测试。
5. 更新 `line-bid-service` 保存 / 回显 / 校验逻辑。
6. 更新前端 Line mapper / 通用 RuleBid 控件支持。
7. 更新 Line 页面测试。
8. 新增 QA 人工测试案例文档。
9. 跑定向测试、lint、build、`npm run verify:pbs`。
