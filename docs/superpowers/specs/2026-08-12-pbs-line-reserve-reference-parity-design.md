# PBS Line Reserve 参考项目双向语义恢复设计

日期：2026-08-12
状态：独立审查通过，用户已批准实施
范围：PBS Current Line、Standing Lineholder、Property 427、算法导出、Bid Feedback、导入、测试与数据库定义

## 1. 决策摘要

将当前 `propertyCode=427 Reserve Avoidance` 恢复为参考项目的双向 Line 条件 `Reserve`：

- `Award · reserve-only`：整个 bid month 的最终 line 必须是 reserve-only。
- `Avoid · no reserve`：整个 bid month 的最终 line 不得包含 reserve。

Current Line 与 Standing Lineholder 必须共享同一名称、默认值、控件、保存契约和回显语义。

新增 `Reserve` 时，按照参考项目默认选中 `Award · reserve-only`。Tier 仍遵循当前 PBS Portal 新 UI 规范：初始不选，至少选择一个 Tier 后才允许 Add/Update Bid；Save Favorite 不保存 Tier，因此不受该门禁影响。

本设计只恢复截图中选中的 `Reserve` 条件，不修改：

- `Reserve Short Call` / `Reserve Preference`（Property 301）。
- Reserve 页面其他条件。
- `Mixed Block Pattern`（Property 410）。

## 2. 背景与依据

### 2.1 参考项目

参考项目：

```text
/Users/lei/Codehub/Flair_PBS_Optimization_Report
```

参考项目将 Line `Reserve` 定义为：

```text
Reserve
Force a reserve-only line, or avoid reserve entirely.

Award · reserve-only
Avoid · no reserve
```

参考实现使用：

```json
{
  "action": "award | avoid",
  "scope": "whole_bid_month"
}
```

并导出：

```text
Code_ID=427
Rule_ID=427
Rule_Type=RESERVE
```

参考证据：

- `Flair_PBS_Optimization_Report/src/frontend/src/unittest/ConfigureLineBiddingDialog.tsx`
- `Flair_PBS_Optimization_Report/src/frontend/src/unittest/lineRulesCsv.ts`
- 参考场景中的 `LINE_RULES.csv`

### 2.2 本项目历史设计

本项目在 2026-06-03 曾实现完全相同的双向语义：

- `Award Reserve = Only Reserve`
- `Avoid Reserve = No Reserve`
- `propertyCode=427`
- `Rule_Type=RESERVE`

历史设计：

```text
docs/superpowers/specs/2026-06-03-pbs-line-reserve-award-avoid-design.md
```

2026-07-14 根据当时 Jen 的 “avoid reserve only” 口径，将 427 改为 `Reserve Avoidance`，并替换为：

- `If possible`
- `No matter what`

历史设计：

```text
docs/superpowers/specs/2026-07-14-pbs-reserve-avoidance-design.md
```

本次产品决定以参考项目为准，撤销 2026-07-14 对 427 的单向 avoidance 改造，恢复 2026-06-03 的双向 Reserve 语义。

### 2.3 当前实现问题

当前 Portal 将 427 保存为：

```json
{
  "type": "reserve-avoidance",
  "mode": "if_possible | no_matter_what"
}
```

但当前真实算法包由 `live-server` 生成时，会把两个 mode 都有损归一为：

```json
{
  "action": "avoid",
  "scope": "whole_bid_month"
}
```

因此当前 UI 虽显示两个 avoidance 强度，标准 `LINE_RULES.csv` 和算法实际输入却无法区分。恢复参考项目的 `award | avoid` 后，Portal 意图、CSV 和参考算法契约重新一致。

## 3. 目标

1. Current Line catalog 将 427 显示为 `Reserve`。
2. Standing Lineholder catalog 同步显示 `Reserve`。
3. 两处都提供 `Award · reserve-only` 和 `Avoid · no reserve`。
4. 新增时默认选择 `Award · reserve-only`。
5. 保存契约恢复为 `{ type: "flag" } + action`。
6. Active algorithm export 精确输出参考项目的 427 `RESERVE` 格式。
7. Existing row、Favorite、Standing、Bid Feedback A2 冲突与正式 Crew Bid Import 使用同一语义。
8. UI 使用当前 PBS Portal 新 UI 规范，不复制参考项目旧 CSS。
9. 清理运行时代码中的 `Reserve Avoidance`、`if_possible` 和 `no_matter_what` 427 语义。

## 4. 非目标

1. 不修改 Property 301 `Reserve Preference` / Short Call 类型与日期范围。
2. 不修改 Property 410 `Mixed Block Pattern`。
3. 不新增 partial-month Reserve、具体日期 Reserve 或 Reserve/Flying 混合规则。
4. 不修改求解器其他 Line Rules。
5. 不重构整个 Line/Standing dialog 架构。
6. 不迁移所有 PBS Portal 弹窗外壳；本次只在现有标准外壳中替换 427 editor。
7. 不修改 `pbs-app`；当前 App 没有 427 消费路径。
8. 不重写历史 spec 或已执行的历史 migration；历史文件继续保留决策演变证据。

## 5. 产品语义

### 5.1 条件归属

`Reserve` 是 Line 条件，因为它控制最终 award 出来的整月 line 是否包含 reserve 成分。

它不是 Reserve 页面条件。Reserve 页面继续负责“如果 crew 获得 Reserve，Reserve 内部如何安排”。

### 5.2 两个动作

| UI 选项 | 保存 action | 业务含义 | 算法含义 |
|---|---|---|---|
| `Award · reserve-only` | `award` | Crew 要求获得纯 Reserve line | 整个 bid month 的最终 line 必须为 reserve-only / reserve-required |
| `Avoid · no reserve` | `avoid` | Crew 要求最终 line 不包含 Reserve | 整个 bid month 排除 reserve duty、reserve assignment 和 reserve pairing |

两个动作都是 whole-month 语义，不提供日期字段。

### 5.3 默认值

- 新增 Current `Reserve`：默认 action 为 `award`。
- 新增 Standing `Reserve`：默认 action 为 `award`。
- Tier 初始为空，不默认替 crew 选择 T1。
- 未选择 Tier 时，`ADD BID` / `UPDATE BID` 保持 disabled。
- `SAVE FAVORITE` 不依赖 Tier；Favorite 只保存条件配置和 action，继续沿用当前“Favorite 不保存 Tier”的产品规则。
- 编辑 Existing 时，以已保存 action 和 tiers 回显，不重新套默认值。
- 编辑 Favorite 或从 Favorite 开始新增时恢复已保存 action；Tier 保持为空，由用户在 Add Bid 前重新选择。

这里的 `default action = award` 只用于新建 editor 的初始选择，不是服务端缺失字段的兼容默认值。Current/Standing mutation 收到缺失 `action` 的 427 payload 时必须拒绝，不能静默解释成强制 `reserve-only`。

## 6. UI / UX 设计

### 6.1 设计原则

参考项目只作为信息结构和业务语义基线，不复制其旧式视觉样式。

本次 UI 必须遵循：

- `docs/modules/pbs/pairing-condition-ui-standard.md`
- Current/Standing 已验收的共享 Preference primitives
- PBS Portal 当前的 `PbsDialogFrame` 白色轻量弹窗体系
- 项目设计 Token、可访问性和全局消息/错误规范

本次是在现有 Line/Standing 业务弹窗内修改 427 editor，不新增裸 `DialogContent`、Modal、Drawer 或 Popover，也不新增另一套弹窗外壳。

### 6.2 Current Line

Current 弹窗：

```text
Configure Reserve

TIERS · REQUIRED
[T1] [T2] ...

PREFERENCE
[Award · reserve-only] [Avoid · no reserve]

Cancel   Save Favorite   Add Bid / Update Bid
```

要求：

- 使用现有 `TierSelectionTitle` 与 `TierToggleGroup`。
- `PREFERENCE` 使用共享 `PreferenceConditionSection`。
- 两个动作使用共享 `PreferenceSegmentedControl`，不保留旧 `ReserveAvoidanceControl` 的自定义硬编码按钮样式。
- 选中态使用当前 Portal 标准：白底、品牌色文字、轻量阴影；未选中态使用中性背景和灰色文字。
- 不使用红色表示 `Avoid`；Award/Avoid 是业务选择，不是错误或破坏性操作。
- Tooltip/条件说明使用：`Force a reserve-only line, or avoid reserve entirely.`
- 不在 dialog 内重复展示内部 `Rule_ID`、`action` 或技术解释。
- 未选择 Tier 时 `SAVE FAVORITE` 仍可用；只有 `ADD BID` / `UPDATE BID` 受 Tier required 门禁控制。

### 6.3 Standing Lineholder

Standing 继续使用统一标题规范：

```text
Configure Standing Bid
Reserve
```

主体与 Current 共用同一个 Reserve action editor：

```text
TIERS · REQUIRED
PREFERENCE
Award · reserve-only / Avoid · no reserve
```

Standing 不得继续保留 `AVOIDANCE / If possible / No matter what`，也不得为同一个 427 维护第二套 UI 或 payload。

### 6.4 交互与可访问性

- `PREFERENCE` 和 `TIERS` 分别使用有可访问名称的 `fieldset/legend` 或等效 `role="group" + aria-labelledby` 结构，不能只依赖视觉标题。
- 两个 Preference 选项均使用语义化 `button`。
- 选中状态、视觉样式、`aria-pressed` 和保存 action 必须由同一个 state 派生。
- 可访问名称使用完整业务文案，例如 `Award reserve-only`、`Avoid no reserve`。
- 键盘可以 Tab 进入并用 Enter/Space 切换。
- Footer pending 期间 action、Tier、关闭和保存操作全部禁用。
- Escape、焦点恢复和焦点限制继续由现有 dialog shell 处理。
- 重要信息不只依赖颜色表达。

### 6.5 错误呈现

- Tier 未选择属于表单级必填状态。`ADD BID` / `UPDATE BID` disabled 时，Tier group 必须通过 `aria-describedby` 关联持久说明 `Select at least one tier to add this bid.`；不能只通过 disabled 按钮或颜色表达原因。
- 后端拒绝非法 427 payload 时返回稳定产品错误，不暴露异常对象、SQL 或内部结构。
- 保存网络错误继续使用 Portal 单一全局 message/toast 入口，不在 dialog 中新增散落红字或独立 popup。
- 重复失败遵循现有消息去重/节流机制。

## 7. Contract 设计

### 7.1 Property 定义

427 的 canonical contract 恢复为：

```ts
{
  propertyCode: 427,
  name: "Reserve",
  defaultBid: { type: "flag" },
  defaultAction: "award",
  supportedActions: ["award", "avoid"]
}
```

`reserve-avoidance` 不再是 427 的合法 `PbsLineBidValue`。

`defaultAction: "award"` 的职责仅限 catalog/new-dialog initialization。它不得用于补全客户端提交的 mutation payload，也不得用于修复数据库中缺失的 action。

### 7.2 Current 保存 payload

Award 示例：

```json
{
  "propertyCode": 427,
  "name": "Reserve",
  "action": "award",
  "bid": { "type": "flag" },
  "tiers": ["T1"]
}
```

Avoid 示例：

```json
{
  "propertyCode": 427,
  "name": "Reserve",
  "action": "avoid",
  "bid": { "type": "flag" },
  "tiers": ["T2"]
}
```

### 7.3 Standing 保存 payload

Standing 使用同一 action/bid 结构，只保留 Standing 自己的：

- `bidContext=StandingLineholder`
- `periodCode=STANDING`
- draft version 与独立 mutation 流程

Standing 不读取或写入 Current draft 状态。

### 7.4 后端校验

427 必须满足：

1. `bid.type === "flag"`。
2. `action === "award" || action === "avoid"`。
3. Current/Standing Bid mutation 至少包含一个合法 Tier；Current Favorite mutation 按现有 contract 不携带 Tier。
4. 不接受 `reserve-avoidance`。
5. 不接受 `if_possible` / `no_matter_what`。
6. Current 与 Standing route schema、service validation 使用相同 427 语义。
7. Current 与 Standing mutation 必须显式携带 action；现有 `property.action ?? definition.defaultAction` 通用 fallback 必须对 427 绕开或在进入该 fallback 前完成拒绝。

Catalog GET 返回 `defaultAction=award` 是合法的；mutation request 缺失 action 则返回稳定 400 validation error。两者不能混为同一行为。

## 8. 持久化与数据库迁移

### 8.1 Property metadata

新增可重复执行的 migration，将 427 更新为：

```text
property_name      = Reserve
award_or_avoid     = ["award","avoid"]
validation_json    = {"type":"flag"}
tooltip            = Line whole-month Reserve preference; Award means Only Reserve, Avoid means No Reserve.
is_active          = 1
```

可见性保持：

| Context | 可见性 |
|---|---:|
| `Current` | 1 |
| `StandingLineholder` | 1 |
| `StandingReserve` | 0 |

同步更新 `sql/seed/10-pbs-bid-property.sql`，避免新环境重新 seed 后回到 `Reserve Avoidance`。

不修改既有历史 migration。

### 8.2 Bid group 与 Favorite

持久化恢复为：

- `pbs_bid_group.action_id`：`1=award`、`2=avoid`。
- 427 的 bid payload 使用 flag 标准序列化。
- `pbs_bid_line_favorite.action` 保存 `award | avoid`。
- `pbs_bid_line_favorite` 不存 Tier；Favorite 回填只恢复 action 和 flag，不再恢复 avoidance mode。
- 从 Favorite 新增 427 时 Tier 初始为空，用户选择 Tier 后才能 Add Bid。

### 8.3 旧数据策略

`if_possible` 无法无损映射成参考项目的 `award` 或 `avoid`，因此 migration 不猜测 crew 意图，也不静默删除 crew 数据。

metadata migration 必须在同一 transaction 内先按 Property 427/FK 精确检查：

- Current / Standing 的 427 bid group 与 condition；
- 427 configured Line Favorite；
- 427 generic property favorite。

transaction 必须先锁定 427 metadata row（`FOR UPDATE`），再区分两种状态：

1. metadata 仍是 legacy/非 canonical 状态：只要任一目标 schema 中任一 427 业务计数非零，migration 必须 `RAISE EXCEPTION` 并整体回滚，metadata 也不得更新。
2. metadata 已经是 canonical `Reserve + {type:flag} + [award,avoid]`：migration 只验证/no-op，允许迁移后新增的合法 427 bid 与 Favorite 存在。

默认 migration 不包含这些业务行的 `DELETE`。因此它既保护首次迁移前的 legacy crew intent，也允许完成迁移后的环境安全二次执行。

如果未来某个部署环境 preflight 非零，应停止发布，先由产品确认每一类 crew intent 的处理方式；需要删除或人工重建时，必须另开数据清理设计并取得单独授权，不能扩大本 spec 的权限。

2026-08-12 对远端权威 `f8_pbs` 的只读 preflight 结果：

```text
427 Current/Standing bid groups = 0
427 line favorites              = 0
427 property favorites          = 0
```

因此当前权威环境不存在需要迁移的 crew intent。实施前和首次从 legacy metadata 转换的 migration transaction 内都必须重新检查，防止数据在 spec、部署预检与实际执行之间发生变化。

## 9. Algorithm Export

### 9.1 Active export

真实算法包由 `live-server` 生成。427 必须导出为：

Award：

```text
Code_ID=427
Rule_ID=427
Rule_Type=RESERVE
Parameters_JSON={"action":"award","scope":"whole_bid_month"}
Description=Award only Reserve for the whole bid month; require the line to be reserve-only.
```

Avoid：

```text
Code_ID=427
Rule_ID=427
Rule_Type=RESERVE
Parameters_JSON={"action":"avoid","scope":"whole_bid_month"}
Description=No Reserve for the whole bid month.
```

Tier counter 必须对应保存 Tier。Award 与 Avoid 不得被合并成同一行，也不得继续输出 `RESERVE_AVOIDANCE` 或 `avoidance` 字段。

### 9.2 Legacy export copy

`pbs-server` 中保留的 algorithm-export 实现不是当前生产入口，但仍参与类型检查和回归测试。它必须同步使用相同 427 contract，避免共享 Contract 改动后出现两套格式。

### 9.3 Solver 边界

本次不修改 solver 规则。参考项目与现有标准答案已经使用 427 `RESERVE + action`，本次负责恢复正确输入契约。

如果实现验证时发现 active `pbs-engine` 对 `action=award` 或 `action=avoid` 不接受，必须停止并报告，不得在 exporter 中再次做有损映射。

## 10. Summary、Favorite 与 Bid Feedback

### 10.1 Existing / Tier Summary

推荐文案：

- `Award reserve-only for the whole bid month`
- `No reserve for the whole bid month`

用户可见 summary 不展示：

- `{ type: "flag" }`
- `action=award|avoid`
- `Rule_ID=427`

### 10.2 Favorite

- Favorite 名称显示 `Reserve`。
- 保存 Favorite 时保留 action。
- Favorite 保存和更新不要求 Tier，也不保存 Tier。
- 从 Favorite 新增时恢复 action，Tier 初始为空；用户选择至少一个 Tier 后才能 Add Bid。
- Current Favorite 不注入 Standing；Standing 继续不复用 Current mutation 状态。

### 10.3 Bid Feedback

当前 Bid Feedback response/UI 只有 Pairing、Days Off 和 conflict/advisory，不存在通用 Line property 列表。本次不新增 Line 条件展示区，也不要求在没有冲突时单独显示 427 文案。

本次恢复参考项目原本标记为 `not_applicable` 的 A2 冲突，精确定义如下：

1. Feedback 继续使用现有有效来源规则：只要存在任意 Current formal bid，全部类别使用 Current；否则 Line 使用 Standing Lineholder、Reserve Preference 使用 Standing Reserve。
2. Property 427 从有效 Line draft 读取，必须保留其显式 `action`；Standing Line 映射不能丢掉 action。
   Feedback service 可在内存中的 effective Line/Reserve wrapper 上增加 `current | standing` 来源标签，供 stableKey 使用；该标签不写入数据库，也不修改公开 draft contract。
3. Property 301 是本项目现有的正向 `Reserve Preference`，没有 Award/Avoid 控件，A2 计算时按 `award` 语义处理；不修改 301 的 UI、payload 或持久化。
4. 当有效 427 为 `avoid` 且有效 Reserve draft 至少存在一个 301 group 时，每个 427/301 group pair 产生一条 A2 conflict。427 为 `award` 时与 301 同向，不产生 A2。
   同一 group 的多个 Tier 聚合到这一条 conflict 中，按 T1→T7 去重排序显示，例如 `(T1, T3)`；不按 Tier pair 展开，避免夸大 toolbar conflict count。现有 contract 的单值 `tier` 字段在 A2 中省略。
5. 427 是 whole-month，视为与 301 的任意现有日期范围重叠；本次不改变 301 日期算法。
6. A2 response 沿用现有 `PbsBidFeedbackConflict` contract，不新增 response 字段：

```json
{
  "code": "A2",
  "severity": "conflict",
  "title": "Reserve bid conflict",
  "message": "Avoid · no reserve (T1, T3) contradicts Reserve Preference PRAM for whole month (T2, T4).",
  "bidKeys": ["<427 group key>", "<301 group key>"],
  "stableKey": "A2:<427 source>:<427 group key>:<301 source>:<301 group key>"
}
```

7. `GET /api/bid-feedback/current/conflicts` 与完整 `GET /api/bid-feedback/current` 返回相同 A2 语义；toolbar conflict count 自动计入 A2。
8. A2 消息只使用产品文案，不出现 `Reserve Avoidance`、`If possible`、`No matter what`、原始 payload 或异常文本。
9. 当前 `BidFeedbackDialog` 不渲染 `data.conflicts`。本次不新增 conflict/advisory 展示区；Portal 只通过现有 toolbar badge 呈现 conflict count，A2 message 的精确内容由 backend/integration test 验证，不写成 UI 验收。
10. A2 改变两个 endpoint 的缓存结果，`FEEDBACK_CACHE_VERSION` 从 `v7` bump 到 `v8`（继续拼接 `pbsTierPolicy.version`），确保部署后不复用最长 5 分钟的旧无 A2 cache entry。

这是一项由 427 恢复后重新适用的既有参考规则，不扩展其他 Feedback 冲突算法。

## 11. Crew Bid Import

正式 Crew Bid Import 的代码所有权在 `live-server/src/services/crew-bid-import/crew-bid-property-mapper.ts`；`e2e` 中的 NPBS replay/simulation 只负责真实 UI 回归，不是生产导入 mapper。

Legacy/NPBS 文本映射：

| 输入文本 | 结果 |
|---|---|
| `Award Reserve` | 427 + `action=award` + flag |
| `Only Reserve` | 427 + `action=award` + flag |
| `Avoid Reserve` | 427 + `action=avoid` + flag |
| `No Reserve` | 427 + `action=avoid` + flag |
| `Reserve Avoidance No Matter What` | 可明确归一为 427 + `action=avoid` |
| `Reserve Avoidance If Possible` | preference mapping result 为 `status=skipped`；唯一 issue 为 `severity=warning`、`code=reserve_avoidance_if_possible_unsupported`；不写入数据库 |

导入 warning 使用稳定产品文案，不暴露 parser 内部异常。

## 12. 数据流

```mermaid
flowchart LR
    A["Current Line / Standing Lineholder"] --> B["Shared Reserve action editor"]
    B --> C["Property 427 + flag + award/avoid"]
    C --> D["PBS persistence"]
    C --> E["Summary / tierless Favorite"]
    D --> F["live-server LINE_RULES.csv"]
    F --> G["Rule 427 RESERVE"]
    D --> H["Bid Feedback effective drafts"]
    H --> I["A2 conflict with effective Property 301"]
    J["live-server Crew Bid Import"] --> C
```

## 13. 受影响模块

| 模块 | 预期变化 |
|---|---|
| `packages/contracts` | 427 恢复为 `Reserve + flag + default award + supported actions`；删除 427 avoidance 类型 |
| `pbs-portal` | Current/Standing 共享双向 action editor；更新 mapper、summary、Help 与 Bid Feedback toolbar count 回归；不新增 Feedback conflict panel |
| `pbs-server` | Current/Standing route schema、显式 action 校验、序列化、Favorite、Bid Feedback A2/cache version、legacy export |
| `live-server` | Active 427 `RESERVE` 导出、正式 Crew Bid Import mapper 与相关说明 |
| `sql` | 新幂等 migration、seed metadata、migration verification |
| `e2e` | Current、Standing、Bid Feedback 真实 UI 回归 |
| `docs/test-cases/pbs` | Line、Standing、Bid Feedback、algorithm export 人工用例 |

参考项目只读，不在本次修改范围内。

## 14. 测试与验证

### 14.1 Contract / Backend

至少覆盖：

1. 427 catalog 名称为 `Reserve`。
2. default action 为 `award`，supported actions 为 award/avoid。
3. Current 接受 flag + award。
4. Current 接受 flag + avoid。
5. Standing 接受 flag + award。
6. Standing 接受 flag + avoid。
7. Current/Standing 拒绝旧 `reserve-avoidance` payload。
8. Current/Standing 拒绝缺失或非法 action。
9. Favorite 无 Tier 也可保存，保存与读取保留 action，且从 Favorite Add Bid 前仍需新选 Tier。
10. route-level 测试证明 Current/Standing 缺失 action 都被拒绝，而 catalog 仍返回 default award。
11. Bid Feedback 的 Current/Standing effective source 均保留 427 action。
12. A2 仅在有效 427 avoid 与有效 301 同时存在时产生，并计入两个 Feedback endpoint 的 `conflictCount`；多 Tier 按 group pair 聚合并稳定排序。
13. Property 301 与 Property 410 原有 contract、summary、导出行为保持不变。
14. Feedback cache key 使用 `v8:${pbsTierPolicy.version}`；预置旧 v7 entry 时两个 endpoint 都不命中旧缓存。
15. Crew Bid Import 的六类 427 文本映射逐项覆盖；`If Possible` 精确返回 skipped/warning/stable code 且无数据库写入。

### 14.2 Algorithm Export

至少覆盖：

1. Award 输出 427/427/`RESERVE` + `action=award`。
2. Avoid 输出 427/427/`RESERVE` + `action=avoid`。
3. Description 与参考项目一致。
4. Tier counter 正确。
5. Award/Avoid 不合并。
6. 输出不含 `RESERVE_AVOIDANCE`、`avoidance`、`if_possible`、`no_matter_what`。
7. Active `live-server` 与 legacy `pbs-server` 分别使用包含 Award/Avoid 两行的 fixture，逐字段断言 Code_ID、Rule_ID、Rule_Type、Parameters_JSON、Tier counter 和 Description。
8. Property 301 `RESERVE_SHORT_CALL_TYPE` 保持不变；Property 410 精确保持现有 `Rule_ID=410`、`Rule_Type=RESERVE_FLYING_DATE_PATTERN`、当前 `Parameters_JSON={segments,strength}` 与现有 Description，不得改成其他 Rule Type。

### 14.3 Portal focused tests

Current 与 Standing 分别覆盖：

1. 新增时 `Award · reserve-only` 处于选中态。
2. `aria-pressed` 与视觉选择同步。
3. Tier 初始为空。
4. 未选 Tier 时 Add/Update disabled，但 Save Favorite 可用。
5. 选择 Tier 后保存 award。
6. 切换后保存 avoid。
7. 编辑 Existing 正确回显 action/tiers；Favorite 正确回显 action 且不带 Tier。
8. Summary 使用新文案。
9. Preference/Tier group 有可访问名称，Tier required 说明通过 `aria-describedby` 关联，Enter/Space 可操作。

### 14.4 Playwright

必须通过真实 UI 驱动：

1. Current Line 新增 `Reserve`，验证默认 award、Tier 门禁、保存与 Existing 回显。
2. Current Line 编辑为 avoid，刷新后仍回显。
3. Standing Lineholder 新增 `Reserve`，验证同一两个选项和 Standing payload。
4. Standing Existing 编辑与回显。
5. Current `Avoid · no reserve` 与 Current Property 301 同时存在时，Bid Feedback toolbar count +1；不要求 dialog 渲染 A2 message。
6. 没有 Current formal bid 时，Standing Lineholder 427 avoid 与 Standing Reserve 301 令 toolbar count +1；有任意 Current formal bid 时 Standing 不参与。
7. 搜索 `Reserve` 时不会把 `Reserve Preference` 误当成本条件。

### 14.5 数据库与迁移

1. 迁移前重新执行远端 427 preflight。
2. migration fixture/结构验证通过。
3. 远端 PostgreSQL 最小只读验证 427 metadata 和三个 context 可见性。
4. 以下文件组成隔离数据库验证：
   - `sql/migration/2026-08-12-pbs-line-reserve-reference-parity.sql`
   - `sql/migration/tests/2026-08-12-pbs-line-reserve-reference-parity-fixture.sql`
   - `sql/migration/tests/2026-08-12-pbs-line-reserve-reference-parity-verify.sql`
   - `sql/migration/tests/2026-08-12-pbs-line-reserve-reference-parity-legacy-nonzero-fixture.sql`
   - `sql/migration/tests/2026-08-12-pbs-line-reserve-reference-parity-legacy-nonzero-verify.sql`
   - `sql/migration/tests/2026-08-12-pbs-line-reserve-reference-parity-canonical-second-run-fixture.sql`
   - `sql/migration/tests/2026-08-12-pbs-line-reserve-reference-parity-verify-second-run.sql`
5. legacy metadata + 任一 427 bid/Favorite 非零时，migration 返回非零、transaction metadata 回滚、legacy 数据保持原样。
6. legacy metadata + 零业务行时首次成功；随后插入 canonical 427 bid/Favorite 并第二次执行，migration 成功/no-op，canonical 数据保持原样。
7. seed 重跑保持幂等且不会恢复 `Reserve Avoidance`。

### 14.6 交付门禁

实施阶段必须报告以下结果：

- `node --test packages/contracts/pbs-line-bids.test.mjs packages/contracts/pbs-standing-bids.test.mjs packages/contracts/pbs-favorite-eligibility.test.mjs`；其中 `pbs-line-bids.test.mjs` 由本实现新增，直接覆盖 427 canonical contract。
- `cd pbs-server && DATABASE_URL=postgresql://test:test@localhost:5432/rois node --import tsx --test src/routes/line-bids.test.ts src/routes/standing-bids.test.ts src/services/line/line-validation.test.ts src/services/standing-bid/standing-bid-service.test.ts src/services/lineholder/property-catalog.test.ts src/services/lineholder/rule-bid-value.test.ts src/services/lineholder/lineholder-summary-formatters.test.ts src/services/bid-feedback/bid-feedback-service.test.ts src/services/algorithm-export/line-rules-export.test.ts`。
- `cd live-server && npm test -- src/services/algorithm-export/line-rules-export.test.ts src/services/crew-bid-import/__tests__/crew-bid-property-mapper.test.ts`。
- `cd pbs-portal && npm test -- src/features/line/pages/line-page.test.tsx src/features/standing-bid/pages/standing-bid-page.test.tsx src/features/standing-bid/standing-bid-draft-mappers.test.ts src/features/standing-bid/standing-bid-property-summary.test.ts src/features/bid/components/bid-feedback-toolbar-actions.test.tsx`。
- `cd e2e && npx playwright test --config=config/playwright.config.ts --project=pbs-portal --no-deps tests/pbs-portal/long-stretch-commuter-pattern.spec.ts tests/pbs-portal/standing-bid-phase-one.spec.ts tests/pbs-portal/bid-feedback.spec.ts`。

Migration 必须在隔离 `TEST_DATABASE_URL` 上以以下顺序执行；不得对远端业务 schema 执行 fixture：

```bash
RESERVE_PARITY_TEST_URL="${TEST_DATABASE_URL:?Set TEST_DATABASE_URL to an isolated PostgreSQL database}"
export RESERVE_PARITY_TEST_URL

psql "$RESERVE_PARITY_TEST_URL" -v ON_ERROR_STOP=1 -f sql/migration/tests/2026-08-12-pbs-line-reserve-reference-parity-legacy-nonzero-fixture.sql
if psql "$RESERVE_PARITY_TEST_URL" -v ON_ERROR_STOP=1 -f sql/migration/2026-08-12-pbs-line-reserve-reference-parity.sql; then
  echo "Expected legacy nonzero migration to fail"
  exit 1
fi
psql "$RESERVE_PARITY_TEST_URL" -v ON_ERROR_STOP=1 -f sql/migration/tests/2026-08-12-pbs-line-reserve-reference-parity-legacy-nonzero-verify.sql

psql "$RESERVE_PARITY_TEST_URL" -v ON_ERROR_STOP=1 -f sql/migration/tests/2026-08-12-pbs-line-reserve-reference-parity-fixture.sql
psql "$RESERVE_PARITY_TEST_URL" -v ON_ERROR_STOP=1 -f sql/migration/2026-08-12-pbs-line-reserve-reference-parity.sql
psql "$RESERVE_PARITY_TEST_URL" -v ON_ERROR_STOP=1 -f sql/migration/tests/2026-08-12-pbs-line-reserve-reference-parity-verify.sql

psql "$RESERVE_PARITY_TEST_URL" -v ON_ERROR_STOP=1 -f sql/migration/tests/2026-08-12-pbs-line-reserve-reference-parity-canonical-second-run-fixture.sql
psql "$RESERVE_PARITY_TEST_URL" -v ON_ERROR_STOP=1 -f sql/migration/2026-08-12-pbs-line-reserve-reference-parity.sql
psql "$RESERVE_PARITY_TEST_URL" -v ON_ERROR_STOP=1 -f sql/migration/tests/2026-08-12-pbs-line-reserve-reference-parity-verify-second-run.sql
```

- `cd pbs-portal && npm run lint -- --quiet`。
- `cd pbs-portal && npm run build`。
- `cd pbs-server && npm run build`。
- `cd live-server && npm run build`。
- 根目录 `npm run check:ui`。
- 根目录 `npm run verify:pbs`；涉及真实 E2E 环境并可用时再运行 `npm run verify:pbs:e2e`。
- `git diff --check`。

如果 active solver 无法在当前工作区运行，交付说明必须明确测试缺口、已完成的 CSV 契约验证和剩余风险，不得声称 solver 已验证。

## 15. 验收标准

1. Current Line 和 Standing Lineholder 均显示 `Reserve`，不显示 `Reserve Avoidance`。
2. 427 在 Standing Reserve 中保持隐藏。
3. 新增时默认选中 `Award · reserve-only`。
4. 另一个选项为 `Avoid · no reserve`。
5. Tier 初始为空；Add/Update Bid 前必选，Save Favorite 不要求 Tier。
6. Current/Standing 保存、编辑、刷新回显均正确。
7. Canonical payload 为 flag + award/avoid。
8. 旧 avoidance mutation payload 被拒绝；migration 发现旧持久化业务行时中止并回滚，不清理、不静默解释。
9. Favorite 保留 action 但不保存 Tier；从 Favorite 新增前重新选择 Tier。
10. Summary、Help 不再显示 avoidance mode；Bid Feedback API 在适用时输出 A2 产品文案，Portal toolbar count 正确，不要求 dialog 新增 conflict 文本区。
11. `LINE_RULES.csv` 与参考项目 427 格式一致。
12. UI 使用当前 PBS Portal 标准 primitives，无新增硬编码视觉体系。
13. 相关自动化、Playwright、build、lint、UI 标准和迁移验证全部通过。
14. canonical metadata 下 migration 二次执行为成功/no-op，即使已有合法 427 bid/Favorite 也不会失败或改写数据。
15. Bid Feedback cache version 已 bump，部署后不会复用旧 v7 结果。

## 16. 风险与控制

| 风险 | 控制 |
|---|---|
| `reserve-only` 是强意图且成为默认选择 | 这是用户明确要求的参考项目行为；Tier 仍需显式选择，避免打开 dialog 即提交 |
| Current 与 Standing 出现两套 427 语义 | 共用 Contract、editor 和 formatter；分别保留独立 draft/mutation |
| 旧 avoidance 数据被误映射或误删 | migration transaction 发现任一旧 427 业务行即 `RAISE EXCEPTION`；`if_possible` 不猜测；数据清理需另行授权 |
| migration 完成后因合法 427 数据无法二次执行 | 仅 legacy/非 canonical metadata 分支检查非零旧数据；canonical 分支验证后 no-op，并用 canonical 数据覆盖 second-run fixture |
| Active 与 legacy exporter 漂移 | 两份 exporter 同步测试，active `live-server` 作为生产权威 |
| 部署后短时命中旧 Bid Feedback 结果 | `FEEDBACK_CACHE_VERSION` 从 v7 bump 到 v8，并测试两个 endpoint 不读取旧 key |
| 运行时代码残留旧文案 | runtime/tests/help 定向扫描；历史 spec/migration 不作为残留失败 |
| UI 为模仿截图引入旧 CSS | 只复用参考语义，使用 `PreferenceSegmentedControl`、Tier 组件和现有 dialog shell |
| Solver 实际不支持 award | 以真实 CSV/solver 验证为门禁；失败即停止，不做有损降级 |

## 17. 方案比较与最终选择

### 方案 A：恢复原始 427 Reserve 契约（采用）

- 与参考项目完全一致。
- Portal intent、CSV 和算法契约一致。
- 可以直接复用本项目 2026-06-03 已验证过的模型。

### 方案 B：保留 `reserve-avoidance`，新增 `reserve_only` mode（不采用）

- 内部结构继续偏离参考项目。
- action 与 mode 容易产生双来源和无效组合。
- 增加迁移、校验、Feedback 与 export 复杂度。

### 方案 C：只改 UI 文案（不采用）

- `if_possible/no_matter_what` 无法表达 reserve-only。
- 会造成 UI、持久化和算法语义不一致。

## 18. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 427 的 Contract、Current/Standing UI、后端校验、持久化和 CSV 强耦合，必须按同一 canonical payload 顺序推进。
- Suggested split: 单一实现流按 Contract → backend → Portal → export → migration → tests 顺序完成。
- Write boundaries: 仅 Property 427 直接相关代码、测试、Help、migration 和 QA 文档。
- Conflict risk: Medium；主要风险是 `Reserve Avoidance` 残留和 active/legacy exporter 漂移。
- Execution gate: 用户审核本 spec 并明确批准实施后，才能进入实现计划与代码修改。

## 19. 实施门禁

本文件仅为设计，不授权修改业务代码、数据库或提交 Git。

后续步骤：

1. 独立审查本 spec。
2. 用户审核并批准本 spec。
3. 编写实施计划。
4. 用户明确批准实施后再修改代码。
5. 所有实现变更默认保持 uncommitted；没有用户在当前对话中的单独明确授权，绝不运行 `git commit`。
