# PBS Mixed Line Bid 参考项目对齐设计

日期：2026-08-12
状态：已批准实施
范围：PBS Portal Current Line、Standing Lineholder、Property 427 前端展示与交互；不修改 CSV/export/算法契约

## 1. 决策摘要

将 PBS Portal 中 `propertyCode=427` 的员工端展示从 `Reserve` 调整为参考项目的 `Mixed Line Bid`，并把现有两个动作按钮改成三段式选择：

- `Mixed Line`：默认 neutral 状态，表示不配置 427；保存后不得产生 427 bid，也不得输出 427 `LINE_RULES.csv` 行。
- `Reserve Only`：保存为现有 `action=award`，语义等同当前 `Award · reserve-only`。
- `Pairing Only`：保存为现有 `action=avoid`，语义等同当前 `Avoid · no reserve`。

本次只改变 PBS Portal 的员工端名称、选择器和 Current/Standing 的删除/不保存语义，不改变后端 canonical action、CSV 导出、solver 输入、数据库 schema 或既有 migration。

Current Line 与 Standing Lineholder 必须同步；Standing Reserve 继续隐藏 427。

## 2. 参考项目依据

参考项目路径：

```text
/Users/lei/Codehub/Flair_PBS_Optimization_Report
```

关键参考实现：

- `src/frontend/src/unittest/ConfigureLineBiddingDialog.tsx`
- `src/frontend/src/unittest/lineRulesCsv.ts`
- `src/frontend/src/unittest/LineRulesEditor.tsx`

参考项目中的真实数据结构：

```ts
export interface CrewLineRules {
  reserve: ReserveParams | null;
}

export interface ReserveParams {
  action: "award" | "avoid";
}
```

三段按钮映射：

```text
Mixed Line   -> reserve = null
Reserve Only -> reserve = { action: "award" }
Pairing Only -> reserve = { action: "avoid" }
```

CSV 生成逻辑：

```ts
if (rules.reserve) lines.push(reserveRow(crew, rules.reserve));
```

因此参考项目没有第三种 `mixed` action。`Mixed Line` 的含义是关闭/不配置该 Line Rule；只有 `Reserve Only` 和 `Pairing Only` 会生成 427 `RESERVE` 行。

参考项目没有独立 Standing Bid 模块。本项目需要把同一语义应用到 `StandingLineholder`，避免 Current 与 Standing 对同一个 427 出现两套员工体验。

## 3. 当前系统状态

上一轮已经把 427 恢复为 canonical `Reserve + flag + action`：

- `propertyCode=427`
- backend/storage action 只允许 `award | avoid`
- bid payload 为 `{ "type": "flag" }`
- active `live-server` 和 legacy `pbs-server` CSV 输出为 `Rule_Type=RESERVE`
- `Parameters_JSON={"action":"award|avoid","scope":"whole_bid_month"}`
- Standing Reserve 中保持隐藏 427

当前 Portal 显示仍是：

```text
Reserve
Award · reserve-only / Avoid · no reserve
```

本次在这个基础上，把员工端展示和交互改为参考项目的 `Mixed Line Bid` 三段式，但不回滚上一轮已经完成的后端/CSV canonical 契约。

## 4. 目标

1. Current Line 可见卡片显示为 `Mixed Line Bid`。
2. Standing Lineholder 可见卡片显示为 `Mixed Line Bid`。
3. 配置 dialog 中显示三个选项：`Mixed Line`、`Reserve Only`、`Pairing Only`。
4. 新增时默认选中 `Mixed Line`。
5. `Reserve Only` 保存为 427 `action=award`。
6. `Pairing Only` 保存为 427 `action=avoid`。
7. 新增状态下保持 `Mixed Line` 不会新增 bid、不保存 Favorite、不产生 427 CSV 行。
8. 编辑已有 427 时切回 `Mixed Line` 会删除该 427 bid。
9. Favorite 只保存 `Reserve Only` 或 `Pairing Only`，不保存 `Mixed Line`。
10. Summary、Help、Current/Standing focused tests 和 Playwright 同步使用新员工端文案。

## 5. 非目标

1. 不新增后端 action，例如 `mixed`、`mixed_line`、`none`。
2. 不修改 `LINE_RULES.csv` 的 427 输出格式。
3. 不修改 `live-server` / `pbs-server` algorithm exporter。
4. 不修改 solver、`pbs-engine` 或任何算法解释。
5. 不新增数据库字段、表、migration 或数据清理脚本。
6. 不修改远端 PBS schema metadata；`pbs_bid_property.property_name` 可以继续保持 canonical `Reserve`。
7. 不修改 Property 301 `Reserve Preference` / `Reserve Short Call`。
8. 不修改 Property 410 `Reserve / Flying Date Pattern`。
9. 不修改 Bid Feedback selector 语义；只在因 427 文案变化必须更新 conflict/product copy 时做最小同步。

## 6. 产品语义

### 6.1 Mixed Line

`Mixed Line` 表示 crew 没有通过 427 对整月 line 类型施加强制偏好。算法仍可根据 pairing、reserve 需求、quota、credit floor 和其他规则为 crew 分配 pairing 或 reserve。

它不是一个保存到后端的 action，也不是一条 solver rule。

### 6.2 Reserve Only

`Reserve Only` 表示 crew 要求整月获得 reserve-only line。

持久化与导出保持：

```json
{
  "propertyCode": 427,
  "action": "award",
  "bid": { "type": "flag" }
}
```

CSV 保持：

```text
Rule_ID=427
Rule_Type=RESERVE
Parameters_JSON={"action":"award","scope":"whole_bid_month"}
```

### 6.3 Pairing Only

`Pairing Only` 表示 crew 要求整月不包含 Reserve，也就是只要 pairing/flying line。

持久化与导出保持：

```json
{
  "propertyCode": 427,
  "action": "avoid",
  "bid": { "type": "flag" }
}
```

CSV 保持：

```text
Rule_ID=427
Rule_Type=RESERVE
Parameters_JSON={"action":"avoid","scope":"whole_bid_month"}
```

## 7. Current Line 设计

### 7.1 可见名称

Current Line 员工端所有可见位置都显示 `Mixed Line Bid`：

- Add property 卡片
- Existing property row
- 配置 dialog title/subtitle
- Summary label
- Favorite row label
- Search/filter 结果
- Playwright 可访问名称

内部 contract、property code、backend canonical metadata 可以继续是 427 `Reserve`，但员工端不得继续显示 `Reserve` 作为此 Line Rule 的卡片名，以免与 `Reserve Short Call` 混淆。

### 7.2 新增流程

用户从 Line catalog 点击 `Mixed Line Bid`：

```text
Configure Mixed Line Bid

TIERS · REQUIRED
[T1] [T2] ...

LINE TYPE
[Mixed Line] [Reserve Only] [Pairing Only]
```

默认状态：

- `Mixed Line` selected。
- Tier 初始为空，延续当前 PBS Portal 规则。
- 由于 `Mixed Line` 不产生 bid，`ADD BID` 在 neutral 状态下不可用。
- `SAVE FAVORITE` 在 neutral 状态下不可用。
- 应提供持久、可访问的说明，例如：`Choose Reserve Only or Pairing Only to add this bid.`

选择 `Reserve Only` 或 `Pairing Only` 后：

- `ADD BID` 仍要求至少一个 Tier。
- `SAVE FAVORITE` 可用，不要求 Tier，延续现有 Favorite tierless 规则。
- 提交 payload 仍为 `{type:"flag"} + action=award|avoid`。

### 7.3 编辑已有 bid

编辑已有 427：

- `action=award` 回显为 `Reserve Only`。
- `action=avoid` 回显为 `Pairing Only`。
- Tier 回显现有 active tiers。

如果用户切到 `Mixed Line`：

- 该状态表示删除/关闭这条 427 bid。
- Primary action 应清楚表达删除语义，推荐显示 `REMOVE BID`，避免用户以为会保存一个第三种 Mixed action。
- 确认后调用现有删除路径，移除该 existing property。
- 删除成功后 Existing row 消失，并且下一次保存/导出不会包含 427。

如果实现成本要求保留 `UPDATE BID` 文案，也必须在按钮附近提供明确说明：`Mixed Line removes this bid.` 但推荐使用 `REMOVE BID`。

### 7.4 Favorite

Favorite 规则：

- `Reserve Only` Favorite 保存 `action=award`。
- `Pairing Only` Favorite 保存 `action=avoid`。
- `Mixed Line` 不保存 Favorite，因为没有实际 bid。
- 编辑已有 Favorite 时切到 `Mixed Line` 不应静默保存空 Favorite；使用现有 Remove Favorite 流程删除 favorite。

## 8. Standing Lineholder 设计

Standing Lineholder 使用与 Current Line 相同的员工端语义：

- catalog/card 显示 `Mixed Line Bid`。
- dialog 中三段式显示 `Mixed Line / Reserve Only / Pairing Only`。
- 新增默认 `Mixed Line`，不允许 Add 空 427。
- `Reserve Only` 保存 `action=award`。
- `Pairing Only` 保存 `action=avoid`。
- 编辑已有 Standing 427 切到 `Mixed Line` 删除该 Standing Lineholder property。

Standing Lineholder 的 draft、mutation、版本号和 Current Line 仍保持独立。不能把 Current 的删除或 neutral 状态写入 Standing draft，也不能反向影响 Current draft。

Standing Reserve 保持不显示 427，不新增 `Mixed Line Bid` 入口。

## 9. 数据契约与保存边界

### 9.1 不新增 action

后端和共享 contract 仍只接受：

```ts
action: "award" | "avoid"
bid: { type: "flag" }
```

`Mixed Line` 不得进入 mutation payload：

```json
{
  "propertyCode": 427,
  "action": "mixed"
}
```

上述 payload 不应出现；如果出现，后端保持现有稳定 validation failure。

### 9.2 显示名与保存名

本次目标是员工端显示名对齐参考项目。实现应优先采用 front-end display helper，把 `propertyCode=427` 渲染为 `Mixed Line Bid`，同时避免无意改变后端存储和 CSV 输出。

如果当前组件只能通过 `property.name` 传递显示名，实现时必须确保：

- 保存 draft 时不会因为 UI display name 改变而影响 exporter。
- 后端仍以 `propertyCode=427` 和 canonical metadata 识别 rule。
- CSV `Description` 仍保持现有 `Reserve Only / No Reserve` 语义，不输出 `Mixed Line`。

不得为了显示名去新增 SQL migration。

## 10. Summary、Help 与 Bid Feedback

### 10.1 Summary

用户可见 summary 建议：

- `Reserve Only`：`Reserve only for the whole bid month`
- `Pairing Only`：`Pairing only for the whole bid month`

`Mixed Line` 没有 existing row，因此没有 summary。

### 10.2 Help

Line / Standing Help 中对应 427 的描述更新为：

- `Mixed Line Bid`：choose whether the line can stay mixed, must be reserve-only, or must be pairing-only.
- `Mixed Line`：no bid is saved.
- `Reserve Only`：saves the existing 427 award rule.
- `Pairing Only`：saves the existing 427 avoid rule.

UI 文案仍使用英文。

### 10.3 Bid Feedback

Bid Feedback 不新增新 conflict 类型。

如果现有 A2 文案提到 `Avoid · no reserve`，可同步为 `Pairing Only`：

```text
Pairing Only contradicts Reserve Preference ...
```

只有保存了 427 `action=avoid` 才可能触发 A2。`Mixed Line` 不保存 427，因此不参与 A2，也不改变 conflict count。

## 11. API、CSV 与算法

### 11.1 API

不新增公开 API 字段。

Current/Standing 的 add/update/delete 使用现有接口：

- `Reserve Only` / `Pairing Only`：现有 add/update/save draft 路径。
- `Mixed Line` on existing：现有 delete/remove property 路径。
- `Mixed Line` on new：不调用 add API。

### 11.2 CSV/export

不修改 exporter。

仍只在存在 427 bid 时输出：

```text
Rule_Type=RESERVE
Parameters_JSON={"action":"award|avoid","scope":"whole_bid_month"}
```

当选择 `Mixed Line` 删除或不新增 427 后，CSV 中不应出现 427 行。

### 11.3 数据库

不新增 migration。

不修改 `sql/seed/10-pbs-bid-property.sql`，除非实施中证明新环境必须从 seed 提供员工端显示名；即便需要，也必须先回到用户确认，因为这会超过“前端修改”的边界。

## 12. 错误与可访问性

- Neutral add 状态必须有可访问说明，不能只靠 disabled button 表达。
- 三段式按钮必须使用 semantic button，并提供 `aria-pressed`。
- 可访问名称使用完整文案：`Mixed Line`、`Reserve Only`、`Pairing Only`。
- 删除已有 bid 时文案必须明确，不得让用户误以为保存了 Mixed action。
- 网络错误继续走现有 Portal 全局 message/toast 或现有 persistent error，不新增独立弹窗。
- 后端 validation error 继续使用产品文案，不暴露 raw payload、SQL 或 stack trace。

## 13. 预期触达范围

预期可能触达：

- `pbs-portal/src/features/line/components/line-bid-dialog.tsx`
- `pbs-portal/src/features/line/pages/line-page.tsx`
- `pbs-portal/src/features/line/line-draft-mappers.ts`
- `pbs-portal/src/features/standing-bid/components/standing-bid-dialog.tsx`
- `pbs-portal/src/features/standing-bid/pages/standing-bid-page.tsx`
- `pbs-portal/src/features/standing-bid/standing-bid-draft-mappers.ts`
- `pbs-portal/src/features/bid/bid-property-summary.ts` 或相关 summary formatter
- `pbs-portal/src/features/help/...` 中 Line/Standing 相关 Help
- `pbs-portal` focused tests
- `e2e/tests/pbs-portal/...` Current/Standing 427 Playwright tests
- `docs/test-cases/pbs/...` 相关人工测试文档

默认不触达：

- `packages/contracts`
- `pbs-server`
- `live-server`
- `sql/migration`
- `sql/seed`
- `pbs-engine`
- `rule-engine-rs`

如果实施中发现必须改后端才能正确删除已有 427，应停止并先报告原因，不能静默扩大范围。

## 14. 测试设计

### 14.1 Portal focused tests

Current Line 覆盖：

1. Catalog 显示 `Mixed Line Bid`，不显示 427 的 `Reserve` 卡片名。
2. 新增 dialog 默认选中 `Mixed Line`。
3. Neutral 状态 `ADD BID` disabled，并有可访问说明。
4. 选择 `Reserve Only` + Tier 后 add，提交 `action=award`。
5. 选择 `Pairing Only` + Tier 后 add，提交 `action=avoid`。
6. Neutral 状态 `SAVE FAVORITE` disabled。
7. 保存 `Reserve Only` / `Pairing Only` Favorite 后回显对应选项，Tier 仍为空。
8. 编辑已有 `action=award` 回显 `Reserve Only`。
9. 编辑已有 `action=avoid` 回显 `Pairing Only`。
10. 编辑已有后切到 `Mixed Line` 调用删除路径，existing row 消失。

Standing Lineholder 覆盖：

1. Catalog 显示 `Mixed Line Bid`。
2. 新增默认 `Mixed Line`。
3. `Reserve Only` 保存 `action=award`。
4. `Pairing Only` 保存 `action=avoid`。
5. 编辑已有后切 `Mixed Line` 删除 Standing Lineholder 427。
6. Standing Reserve catalog 仍不显示 427。

### 14.2 Backend/CSV regression

本次默认不改后端，但需要用现有 focused tests 或最小 regression 证明：

1. `action=award` 仍导出 427 `RESERVE` + `action=award`。
2. `action=avoid` 仍导出 427 `RESERVE` + `action=avoid`。
3. 没有 427 bid 时不导出 427 行。
4. 不出现 `action=mixed`。

如未触达 backend/exporter，可复跑上一轮相关 focused tests 或在交付中说明未运行原因。

### 14.3 Playwright

真实 UI 至少覆盖：

1. Current Line 添加 `Mixed Line Bid`，默认 neutral，选择 `Reserve Only` 保存并回显。
2. Current Line 编辑为 `Pairing Only` 并刷新回显。
3. Current Line 编辑已有后切 `Mixed Line` 删除，刷新后 427 不存在。
4. Standing Lineholder 添加 `Mixed Line Bid`，选择 `Pairing Only` 保存并回显。
5. Standing Lineholder 编辑已有后切 `Mixed Line` 删除。
6. Standing Reserve 搜索不到 `Mixed Line Bid`。

### 14.4 UI 标准

如果修改样式或组件结构，必须运行：

```bash
npm run check:ui
```

Hard violations 必须为 0。

## 15. 验收标准

1. Current Line 和 Standing Lineholder 员工端都显示 `Mixed Line Bid`。
2. 配置 UI 为三段：`Mixed Line`、`Reserve Only`、`Pairing Only`。
3. 新增默认 `Mixed Line`，且不会保存空 427。
4. `Reserve Only` 保存为原 `action=award`。
5. `Pairing Only` 保存为原 `action=avoid`。
6. 已有 427 切回 `Mixed Line` 会删除该 bid。
7. Favorite 不保存 `Mixed Line`。
8. CSV/export 输出格式完全不变。
9. 选择或删除 `Mixed Line` 后，后续 CSV 中没有 427 行。
10. Standing Reserve 仍隐藏 427。
11. Help、summary、测试和可访问名称都使用新文案。
12. 没有新增后端 action、migration 或 solver 变化。

## 16. 风险与控制

| 风险 | 控制 |
| --- | --- |
| 把 `Mixed Line` 错存成第三种 action | 类型和 mapper 不引入 `mixed`；neutral add 不调用 add API；existing neutral 调 delete |
| 员工以为 Mixed 已保存为一个 rule | neutral 状态显示说明；existing neutral 的 primary button 用 `REMOVE BID` |
| UI 显示名改动污染后端保存名 | 优先用前端 display helper；不得为显示名新增 migration |
| Current 与 Standing 漂移 | 两处共享同一三段文案和映射表，分别保留各自 draft/mutation |
| Favorite 保存空配置 | neutral 禁用 Save Favorite；已有 favorite 删除走 Remove Favorite |
| CSV/算法被误改 | 默认不触达 exporter；验证 award/avoid golden 与 no 427 row |

## 17. 方案比较与最终选择

### 方案 A：参考项目 neutral/null 语义（采用）

- `Mixed Line` 不保存 427。
- `Reserve Only` / `Pairing Only` 继续映射到 `award/avoid`。
- 与参考项目真实 `reserve: null | {action}` 结构一致。
- 不改 CSV、后端 action 或 solver。

### 方案 B：新增 `mixed` action（不采用）

- 需要改 contract、backend validation、可能还要改 exporter 忽略 mixed。
- 与参考项目不一致。
- 增加 solver 输入风险。

### 方案 C：只改按钮文案但默认仍保存 `award`（不采用）

- 会把 `Mixed Line` 错解释为 `Reserve Only`。
- 员工端显示和实际保存不一致，风险最大。

## 18. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: Current、Standing、dialog、mapper、删除行为和测试都是同一条 427 前端语义链；拆分会增加状态和文案漂移风险。
- Suggested split: 单一实现流完成。
- Write boundaries: PBS Portal 为主；只有测试证明必要时才触达后端。
- Conflict risk: Medium，主要是现有通用 RuleBidRightPanel edit dialog 只返回 update，需要为 427 neutral 删除接入现有 delete path。
- Execution gate: 用户审核本 spec 并明确批准实施后，才能进入实施计划和代码修改。

## 19. 实施门禁

本文件仅为设计，不授权修改业务代码、数据库、migration、commit 或 push。

后续步骤：

1. 独立审查本 spec。
2. 用户审核并批准本 spec。
3. 编写实施计划。
4. 用户明确批准实施后再修改代码。
5. 所有实现变更默认保持 uncommitted；没有用户在当前对话中的单独明确授权，绝不运行 `git commit`。
