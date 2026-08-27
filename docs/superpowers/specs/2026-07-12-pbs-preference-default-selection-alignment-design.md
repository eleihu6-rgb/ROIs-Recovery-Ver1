# PBS Preference 默认选择一致性设计

日期：2026-07-12
状态：待用户审阅
关联：`2026-07-12-pbs-preference-interaction-consistency-design.md`、`2026-07-12-pbs-airport-preference-jen-aligned-redesign-design.md`

## 1. 背景

PBS Portal 中已完成的 Preference 类条件在“新增弹窗”的默认状态不一致：

- 部分条件默认选择 `T1`；
- Airport Preference（168）虽然数据模型默认事件是 `Landing`，UI 却把 Airport Event 显示为未选择；
- Airport Preference 在显式选择模式下也把 `Award` 清空；
- `LIMIT TO EVENT DATE` 是可选限制，不能因为默认 Airport Event 而自动开启或预填日期。

本设计只统一新增弹窗的初始选择状态，不改变任何后端合同、查询语义、保存数据或编辑已有 bid 的回显。

## 2. 目标与范围

### 目标

1. `Prefer Off`（201）、`Long Stretch Off / Compressed Flying`（204）、`Commuter Pattern`（408）打开新增弹窗时，所有 Tier 默认不选。
2. Airport Preference（168）打开新增弹窗时：
   - Tier 默认不选；
   - `Preference` 默认选中 `Award`；
   - `AIRPORT EVENT` 默认选中 `Landing`；
   - `LIMIT TO EVENT DATE` 默认关闭，`dateScope` 为 `null`，不产生默认日期或范围。
3. `Pairing Preference`（102）打开新增弹窗时：
   - Tier 默认不选；
   - `Preference` 继续默认选中 `Award`；
   - Pairing Number 及其日期 / fulfilment 等可选条件不产生新默认值。
4. 编辑已有 bid 或 configured favorite 时，严格回显已保存值，不套用新增弹窗的默认策略。

### 非目标

- 不改 `pbs-server`、`packages/contracts`、数据库 migration 或算法逻辑。
- 不改变任何条件的业务字段、校验规则、保存 payload 或 Tier 服务端最终校验。
- 不为日期、location、fulfilment 或 duration 增加默认值。
- 不修改 102 Pairing Preference 除 Tier 以外的现有默认状态。

## 3. 方案比较

### 方案 A：按 property code 制定新增弹窗默认策略（推荐）

在各 feature 创建新增草稿的既有入口中，按 property code 明确处理 Tier、Action 和 Event 默认值；编辑入口不调用该策略。

优点：改动最小，保留每个条件的业务边界，能精确满足本次四个入口的差异。
缺点：需要在 Days Off、Line、Pairing 各自补回归测试。

### 方案 B：修改所有可用条件的通用 Tier 默认工厂

让通用 factory 创建的全部可用条件不再默认 T1。

优点：实现点少。
缺点：会影响不属于本需求的条件、搜索条件及历史流程，风险过高。

### 方案 C：为所有 Preference 建立统一大型默认配置对象

把 Tier、Action、Event、日期等规则集中到跨业务域配置表。

优点：表面上集中。
缺点：会让不同 payload 和交互规则产生不必要耦合，超出本次问题范围。

采用方案 A。

## 4. 交互契约

| 条件 | Property Code | 新增时 Tier | 新增时 Preference / Action | 其他默认值 |
| --- | ---: | --- | --- | --- |
| Prefer Off | 201 | 全部不选 | 保持现有业务默认 | 不改日期 / fulfilment 默认值 |
| Long Stretch Off / Compressed Flying | 204 | 全部不选 | 保持现有业务默认 | 不改日期范围及 pattern 默认值 |
| Commuter Pattern | 408 | 全部不选 | 保持现有业务默认 | 不改日期范围及 work/off 默认值 |
| Pairing Preference | 102 | 全部不选 | `Award` | 不改 Pairing Number、日期 / fulfilment 默认值 |
| Airport Preference | 168 | 全部不选 | `Award` | Event=`Landing`；日期限制关闭；`dateScope: null`；无 location / duration / fulfilment 默认值 |

共同规则：

- 没有选中 Tier 时，现有 `Required` 提示和 `ADD BID` / `SAVE FAVORITE` 禁用规则继续生效。
- 用户可以自行选择任意 Tier；默认空 Tier 不得被前端自动补回 T1。
- Airport Preference 选择 `Landing` 后，机场/城市选择器应立即可用，但在用户选择 location 前仍不可保存。
- Airport Preference 仅在用户手动打开 `LIMIT TO EVENT DATE` 后才显示日期控件；关闭时 payload 保持 `dateScope: null`。

## 5. 实现边界

### Days Off 与 Line

- 仅调整 201、204、408 创建“新增 property 草稿”时的 Tier active 状态。
- 不改编辑已有 property、复制 favorite、服务端返回数据或 Tier toggle 的通用组件。

### Pairing Preference / Airport Preference

- 在 `PairingPropertyConfigDialog` 的新增初始化逻辑中，将 102、168 视为可默认 `Award` 的 Preference property；二者均保留空 Tier。
- 102 的新增草稿仅清空 Tier；不重设 Pairing Number、日期范围、数量或其他保存字段。
- 在 `AirportPreferenceEditor` 中移除“必须先点击事件才算已选”的初始门槛，使新草稿中的 `event: "landing"` 直接显示为选中并启用 location picker。
- 不触碰 `dateScope`、`minimumLayoverDuration`、`minimumRequired`、`maximumRequired` 的初始值。
- 编辑已有 102 / 168 bid 时直接按保存的 `action`、Tier、bid 与可选字段渲染。
- 已保存的 102 / 168 configured favorite 保持原 payload 与 Tier，直接新增时不重新经过新增默认策略。

## 6. 测试与验收

### 自动化

1. Days Off：201 与 204 的新增弹窗初始 Tier 均为全不选；选 Tier 后才可提交。
2. Line：408 的新增弹窗初始 Tier 为全不选；选 Tier 后才可提交。
3. Pairing：102 新增时所有 Tier 未选、`Award` 保持选中；选择 Tier 前不能提交。
4. Pairing：168 初始状态断言：
   - 所有 Tier 未选；
   - `Award` 为选中；
   - `Landing` 为选中，其他 Event 未选；
   - location picker 可用；
   - `LIMIT TO EVENT DATE` 为关闭，日期 picker 不显示；
   - 无 location 时 `ADD BID` 仍禁用。
5. 168 打开日期限制后才产生日期 scope；关闭后重新为 `null`。
6. 编辑已有 102 / 168 bid 的测试断言其保存的 Tier、Action 与业务字段不被默认策略覆盖。
7. 已保存的 102 / 168 configured favorite 直接新增时，断言其保存的 Tier 与 payload 不被新增默认策略覆盖。
8. 增加 / 更新 Playwright，用真实 Portal UI 覆盖 168 的默认 `Award + Landing` 与空 Tier。

### 最小验证命令

实施阶段至少运行：

```bash
(cd pbs-portal && ./node_modules/.bin/vitest run <受影响测试>)
(cd e2e && ./node_modules/.bin/playwright test --config=config/playwright.config.ts --project=pbs-portal <受影响用例>)
npm run check:ui
```

如修改 Days Off 或 Line 的组件测试，分别加入对应的定向 Vitest 命令。最终交付必须列出实际命令与 PASS / FAIL。

## 7. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 空 Tier 被错误当作可提交 | 保留现有 Required 与提交禁用；补组件和浏览器测试。 |
| 默认策略影响编辑旧 bid | 只在新增草稿初始化路径应用；102 / 168 编辑测试断言保存值不变。 |
| Airport Event 默认值意外开启日期限制 | 断言 `dateScope: null`、日期开关关闭、picker 不渲染。 |
| 通用 factory 影响无关条件 | 不修改全局 Tier factory，仅在 201 / 204 / 408 的新增入口处理。 |

## 8. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 虽跨 Days Off、Line、Pairing 三个域，但默认策略与验收规则紧密关联；拆分会增加遗漏和集成风险。
- Suggested split: 不适用。
- Write boundaries: 由同一实现统一维护各入口和回归测试。
- Conflict risk: 中。
- Execution gate: 用户审阅本 spec 并明确批准实施后开始。
