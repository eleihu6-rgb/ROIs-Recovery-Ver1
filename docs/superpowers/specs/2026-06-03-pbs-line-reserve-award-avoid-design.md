# PBS Line Reserve Award / Avoid 条件设计

日期：2026-06-03  
状态：待用户审核  
范围：PBS Line 条件 catalog / contract / 保存语义 / 页面展示 / 后续算法导出语义。本文件只定义设计，不包含代码实现。

## 背景

用户最初提出需要 `No Reserve` 条件，用于表达 crew 在当前 bid month 内不要任何 reserve 成分。进一步讨论后确认：系统不应新增两个彼此对立的 property，例如 `No Reserve` 和 `Only Reserve`。更合理的方式是新增一个 Line property：

```text
Reserve
```

然后复用现有 bid action：

```text
Award / Avoid
```

这样 property 表达对象，action 表达态度：

- `Avoid Reserve`：本 bid month 内不要任何 reserve duty / reserve assignment / reserve pairing。
- `Award Reserve`：`Only Reserve`，本 bid month 内只要 reserve。

该条件仍应归属 Line，而不是 Reserve 页面。Reserve 页面负责“如果我是 reserve，我希望 reserve 怎么排”，例如 Reserve Day On、Reserve Prefer Off、Short Call Type、Reserve / Flying Date Pattern 等。`Reserve + Award/Avoid` 约束的是最终 line 的组成结果，应归属 Line。

## 目标

1. 在 Line 模块新增 `Reserve` 条件。
2. `Reserve` 使用现有 `Award / Avoid` action，由用户显式选择，不设置默认 action。
3. `Reserve` 作为全月生效的 line-level 条件，不需要选择日期。
4. `Reserve` 使用 flag bid value：

```ts
{ type: "flag" }
```

5. 保存语义使用 `bidType = "Line"`，不得保存为 Reserve bid。
6. Reserve 页面不新增该条件。
7. 后续算法导出或求解输入中：
   - `Avoid Reserve` 表达“当前 bid month 内禁止 reserve duty / reserve assignment / reserve pairing”。
   - `Award Reserve` 表达“当前 bid month 内只要 reserve”，即 `Only Reserve`。

## 非目标

- 不新增 `No Reserve` 和 `Only Reserve` 两个独立 property。
- 不新增 Reserve 页面入口。
- 不新增日期选择或 partial-month 版本。
- 不把 `Avoid Reserve` 做成 Reserve Prefer Off 的反向条件。
- 不改变现有 Reserve Day On、Reserve Prefer Off、Short Call Type、Reserve / Flying Date Pattern 的语义。
- 不在本次设计中处理“某些日期不 reserve、其它日期允许 reserve”的细分需求。

## 业务语义

`Reserve` 是 Line 条件，因为它约束最终 award 出来的 line 内容。

```text
Avoid Reserve = No Reserve，最终 line 中不应包含任何 reserve duty、reserve assignment 或 reserve pairing。
Award Reserve = Only Reserve，最终 line 应为 reserve-only / reserve-required。
```

它和 Days Off 的归属逻辑类似：

- Days Off：控制最终 line 中哪些日期不要工作。
- Reserve：控制最终 line 中 reserve 类型工作是否被 award 或 avoid。

它和 Reserve 页面的职责不同：

- Reserve 页面：表达 reserve 体系内部偏好，例如希望哪些天 reserve、call type 怎么选。
- Line > Reserve：表达 reserve 成分是否进入最终 line。

## 推荐设计

### 模块归属

放入 Line：

```text
Line > ADD LINE PROPERTIES > Reserve
```

不放入 Reserve：

```text
Reserve 页面不展示 Reserve 这个 Award/Avoid 条件
```

### 条件形态

`Reserve` 是无参数 flag 条件，但必须由用户选择 action：

```ts
{
  propertyCode: <待分配>,
  name: "Reserve",
  defaultBid: { type: "flag" },
  defaultAction: null
}
```

交互要求：

1. 用户在 `ADD LINE PROPERTIES` 中点击 `Reserve`。
2. 系统打开配置弹窗或等价 action 选择 UI。
3. 用户必须选择 `Award` 或 `Avoid`。
4. 未选择 action 时，`ADD BID` 不可提交。
5. 提交后进入 `EXISTING LINE PROPERTIES`，展示为 `Award Reserve` 或 `Avoid Reserve`。

不允许系统默认选择 `Avoid` 或 `Award`。这是为了避免在 crew 未明确选择时替用户表达关键排班偏好。

### Property Code

需要为 `Reserve` 分配新的 Line property code。

现有 Line codes：

- Legacy Line：`401-410`
- AA Line：`411-426`

确认新增为 Line AA / project-supported property：

```ts
pbsLineAaPropertyCodes.reserve = 427
```

仓库当前已使用 Line code 为 `401-426`，`427` 未被正式占用，可作为 `Reserve` 的新 Line supported code。不得使用 Reserve property code，也不得复用现有 Line code。

### Contract

需要同步更新：

- `packages/contracts/pbs-line-bids.js`
- `packages/contracts/pbs-line-bids.d.ts`

新增：

```ts
pbsLineAaPropertyCodes.reserve
pbsLineAaPropertyCatalog item
```

`PbsLineBidValue` 已支持 `{ type: "flag" }`，无需新增 bid value 类型。

### 前端

Line 页面应从后端返回的 property catalog 展示 `Reserve`。

预期 UI 行为：

1. `Reserve` 出现在 `ADD LINE PROPERTIES > ALL PROPERTIES`。
2. 用户点击 add 后必须选择 `Award` 或 `Avoid`。
3. 未选择 action 时不能保存。
4. 保存后 `Reserve` 出现在 `EXISTING LINE PROPERTIES`。
5. 展示文案体现 action，例如 `Award Reserve` / `Avoid Reserve`。
6. 可按现有 Line 条件逻辑保存、删除、切换 tiers、收藏。

Reserve 页面不显示该 property。

### 后端保存

后端 Line catalog 支持 `Reserve` 后：

1. `GET /line-bids/current` 的 `propertyCatalog` 返回 `Reserve`。
2. `POST /line-bids/current/properties` 接受 `propertyCode=427`、`action="award" | "avoid"` 和 `bid={ type: "flag" }`。
3. 如果 action 缺失或不是 `award/avoid`，应拒绝保存。
4. 保存到 `pbs_bid_group` 时 `bid_type = "Line"`。
5. 反序列化 current draft 时能恢复 action 和 `Reserve`。
6. lineholder summary 中归类为 Line 条件。

### 算法导出

Line rules export 必须纳入 `Reserve`。

导出文件要求：

```text
Crew_ID, Rule_ID, Rule_Type, Parameters_JSON, Tier_1_Counter, ..., Tier_X_Counter, Description
```

其中 `Description` 必须是一句完整说明。`Reserve` 使用：

```text
Rule_ID = 427
Rule_Type = RESERVE
```

`Parameters_JSON`：

```json
{ "action": "avoid", "scope": "whole_bid_month" }
```

或：

```json
{ "action": "award", "scope": "whole_bid_month" }
```

导出语义：

- `action="avoid"`：`No Reserve`，全月不要任何 reserve duty / reserve assignment / reserve pairing。
- `action="award"`：`Only Reserve`，全月只要 reserve。

示例 `Description`：

```text
Avoid Reserve for the whole bid month; exclude all reserve duties, reserve assignments, and reserve pairings.
```

```text
Award only Reserve for the whole bid month; require the line to be reserve-only.
```

现有 `Rule_ID=410` 继续表示 `Reserve / Flying Date Pattern`，不再用作 `Only Reserve` 的首选表达。`Only Reserve` 统一由 `Rule_ID=427` + `action="award"` 表达。

## 验收标准

1. `Reserve` 出现在 Line 的 `ADD LINE PROPERTIES`。
2. `Reserve` 不出现在 Reserve 的 property 列表。
3. 添加 `Reserve` 时，用户必须选择 `Award` 或 `Avoid`。
4. 未选择 `Award / Avoid` 时不能保存。
5. 添加后，`EXISTING LINE PROPERTIES` 出现 `Reserve` 条件，并能看出 action。
6. 保存 payload 使用 Line draft/property API。
7. 保存内容中 `bidType = "Line"`，`action = "award" | "avoid"`，bid value 为 `{ type: "flag" }`。
8. 重新加载 Line 页面后，`Reserve` 能从后端 current draft 恢复。
9. Tier / Lineholder summary 中该条件归类为 Line，不归类为 Reserve。
10. 现有 Reserve Day On、Reserve Prefer Off、Reserve / Flying Date Pattern 行为不变。
11. Line rules export 使用 `Rule_ID=427`、`Rule_Type=RESERVE`、`Parameters_JSON.action` 导出 `Award Reserve` / `Avoid Reserve`。
12. `Only Reserve` 不再使用 `Rule_ID=410` 作为首选导出表达；`410` 继续保留给 `Reserve / Flying Date Pattern`。

## 测试设计

### 自动化测试

建议覆盖：

1. Contract / catalog 测试：
   - `pbsLineAaPropertyCodes.reserve` 存在。
   - `pbsSupportedLinePropertyCatalog` 包含 `Reserve`。
   - default bid 为 `{ type: "flag" }`。
   - default action 不应自动设为 `award` 或 `avoid`。

2. Line 前端测试：
   - `Reserve` 显示在 Line `ADD LINE PROPERTIES`。
   - 点击 add 后要求用户选择 `Award / Avoid`。
   - 未选择 action 时不能保存。
   - 选择 `Avoid` 后保存 payload 为 `propertyCode=427`、`action="avoid"`、`bid={ type: "flag" }`。
   - 选择 `Award` 后保存 payload 为 `propertyCode=427`、`action="award"`、`bid={ type: "flag" }`。

3. Reserve 前端测试：
   - Reserve 页面不显示 Line 的 `Reserve` Award/Avoid 条件。

4. 后端 Line service 测试：
   - Line current draft catalog 返回 `Reserve`。
   - add/save/patch 可接受带 action 的 `Reserve`。
   - 缺失 action 的 `Reserve` 保存应失败。
   - current draft 读取能反序列化 `Reserve` 和 action。

5. Lineholder summary / export 测试：
   - summary 归类为 Line。
   - line rules export 中 `Avoid Reserve` 输出 `Rule_ID=427`、`Rule_Type=RESERVE`、`Parameters_JSON.action="avoid"`。
   - line rules export 中 `Award Reserve` 输出 `Rule_ID=427`、`Rule_Type=RESERVE`、`Parameters_JSON.action="award"`。
   - export description 是完整的一句话。
   - `Rule_ID=410` 不再用于 `Only Reserve` 的首选导出表达。

### 人工 QA 测试

建议新增：

```text
docs/test-cases/pbs/line/2026-06-03-reserve-award-avoid.md
```

覆盖：

- Line 页面添加 `Reserve`。
- 未选择 action 时不能保存。
- 添加 `Avoid Reserve`。
- 添加 `Award Reserve`。
- 保存后刷新恢复。
- Reserve 页面不展示该 Line 条件。
- Tier / summary 中归类为 Line。
- Reserve 相关已有条件回归。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次改动虽涉及 contract、catalog、Line 页面和后端保存，但核心是一个 property code、action requirement 与语义的一致性。拆分多 agent 容易造成 property code、bidType、default action 或算法语义不一致。
- Suggested split: 不拆分。
- Write boundaries: `packages/contracts/pbs-line-bids.*`、Line catalog/service/tests、Line 前端测试、必要的 Reserve 负向测试、QA 文档。
- Conflict risk: Medium。主要风险是误放到 Reserve、默认替用户选择 action、property code 与数据库 catalog 不一致、或算法导出继续沿用旧的 `Rule_ID=410` 表达 `Only Reserve`。
- Execution gate: 用户审核并确认本设计后，再进入实现。

## 已确认点

1. `propertyCode=427` 可作为 `Reserve` 的新 Line AA / supported code。
2. `Award Reserve` 表达 `Only Reserve`，是 reserve-only / reserve-required 的强语义。
3. `Avoid Reserve` 表达 `No Reserve`，全月不要任何 reserve duty / reserve assignment / reserve pairing。
4. Line rules export 必须同步使用 `Rule_ID=427`、`Rule_Type=RESERVE`、`Parameters_JSON.action` 和一句完整 `Description`。

本设计确认后再进入实现。
