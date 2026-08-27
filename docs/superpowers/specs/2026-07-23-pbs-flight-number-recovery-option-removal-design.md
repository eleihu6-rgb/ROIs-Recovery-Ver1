# PBS Flight Number Preference 移除 Recovery 下拉选项设计

## 1. 背景

Flair 反馈要求在 PBS Portal 的 `Configure Flight Number Preference` 弹窗中，从
`TYPE` 下拉菜单移除：

```text
Recovery Flights - Charter Network
```

当前下拉菜单由前端 `FlightNumberPreferenceEditor` 内的固定选项列表提供，包含：

1. `Charter`
2. `Positioning Flights - Charter Network`
3. `Recovery Flights - Charter Network`

用户已确认本次只处理前端展示，不删除后端或共享 contract 对
`recovery-charter-network` 的兼容能力。

## 2. 目标

- Flight Number Preference 的 Type 下拉菜单只显示：
  - `Charter`
  - `Positioning Flights - Charter Network`
- 用户不能再从 Portal UI 选择 `Recovery Flights - Charter Network`。
- 其他 Flight Number Preference 交互、搜索、日期限制和保存 payload 保持不变。

## 3. 非目标

- 不修改 `PbsFlightNumberSearchType` 共享类型。
- 不删除后端 `recovery-charter-network` 搜索能力。
- 不删除数据库中的 `CHARTER_RECOVERY_NETWORK` 配置。
- 不修改历史请求、旧客户端或测试工具调用该类型时的后端兼容行为。
- 不修改 bid payload、数据库数据、算法导出或 Pairing 搜索规则。
- 不改动其他 Pairing property 的下拉菜单。

## 4. 方案比较

### 方案 A：只从编辑器选项列表移除（采用）

直接从 `FlightNumberPreferenceEditor` 的 Type 选项列表删除 Recovery 项，同时更新
组件、Playwright 和 QA 测试。改动最小，完全符合“只处理前端”的范围。

### 方案 B：增加前端环境配置开关

可以按环境决定是否显示，但当前 Flair 要求没有环境差异，引入配置会增加无必要的部署和
测试分支，因此不采用。

### 方案 C：删除完整前后端能力

能够彻底移除类型，但会破坏旧请求和历史兼容，超出已确认范围，因此不采用。

## 5. 前端行为设计

### 5.1 下拉选项

修改 `FLIGHT_NUMBER_TYPE_OPTIONS`，保留：

```text
Charter
Positioning Flights - Charter Network
```

删除：

```text
Recovery Flights - Charter Network
```

### 5.2 状态与 payload

Type 目前是编辑器内部的临时 autocomplete 筛选状态。它不会作为搜索类型字段写入
`FlightNumberPreferenceBid` payload；payload 中已有的 `"type": "flight-number-preference"`
是 bid 类型 discriminator，与本下拉菜单无关。因此移除选项：

- 不需要迁移已有 bid。
- 不影响打开或编辑已有 Flight Number Preference。
- 不改变 `flightNumbers`、`dateScope`、Award/Avoid 或 tiers。
- 清空 Type 后仍执行无 type 的普通 Flight Number 搜索。

### 5.3 后端兼容

以下内容继续保留：

- `PbsFlightNumberSearchType` 中的 `recovery-charter-network`。
- Pairing service 对该 type 的请求映射。
- PBS server 对 `CHARTER_RECOVERY_NETWORK` 的范围解析和搜索。
- Portal service 直接调用 `recovery-charter-network` 的兼容测试。

这保证旧客户端或非 Portal UI 调用不会因本次展示调整而失败。

本次不以 E2E mock 证明真实 PBS server 的兼容性。实施时不改动共享 contract、PBS server
或其配置解析代码，并运行现有 Portal service Recovery 请求映射测试；真实 PBS server 的
Recovery 搜索能力属于保留的既有能力，不扩展为本次前端需求的新后端测试范围。

## 6. 错误处理

本次不新增 API、请求参数或异常路径。现有 autocomplete 的 loading、empty、error 和
clear 行为保持不变。

## 7. 测试设计

### 7.1 组件测试

更新 `flight-number-preference-editor.test.tsx`：

- 断言 `Charter` 存在。
- 断言 `Positioning Flights - Charter Network` 存在。
- 断言 `Recovery Flights - Charter Network` 不存在。
- 保留 Charter、Positioning、清空 Type，以及 payload 不保存 autocomplete 搜索类型的交互覆盖。

### 7.2 Playwright

更新现有 `PBS-3523` Flight Number Preference 真实 UI 用例：

- 打开配置弹窗。
- 断言 Type 下拉菜单没有 Recovery 选项。
- 继续验证 Positioning、Charter、clear、flight number 选择、日期限制和 ADD BID。

E2E mock 可以继续识别 `recovery-charter-network`，因为它代表被保留的后端兼容能力，
但真实 UI 不得产生该 type。

### 7.3 QA 人工用例

更新现有：

```text
docs/test-cases/pbs/pairing/2026-07-20-flight-number-charter-filter.md
```

- 下拉菜单预期改为只包含两项。
- 删除从 UI 选择 Recovery 的操作步骤。
- 从 Portal UI QA 的配置前置条件中移除 `CHARTER_RECOVERY_NETWORK`；它不再是本次 UI
  验收所需数据。
- 修正 payload 说明：保留 bid discriminator `"type": "flight-number-preference"`，但不包含
  autocomplete 搜索类型字段或 `charter`、`positioning-charter-network`、
  `recovery-charter-network` 值。
- 记录后端兼容能力保留，不属于本次 Portal UI 验收范围。

## 8. 验收标准

- Flight Number Preference Type 下拉菜单不显示
  `Recovery Flights - Charter Network`。
- 菜单仍显示 Charter 和 Positioning 两项。
- 两个保留类型的 autocomplete 请求和结果正常。
- 清空 Type 后普通搜索正常。
- 保存 payload 不包含 autocomplete 搜索类型字段；bid discriminator
  `"type": "flight-number-preference"`、日期与 flight number 内容保持不变。
- 后端 `recovery-charter-network` contract 和实现未改动、未删除。
- 现有 Portal service Recovery 请求映射测试通过；E2E mock 仅用于 UI 流程，不作为真实
  PBS server 兼容性的证明。
- 组件测试、Playwright、PBS Portal lint/build 和 UI 标准检查通过。

## 9. Multi-Agent Parallelism Assessment

- Recommendation：No
- Rationale：改动集中在一个前端选项列表及其现有测试和 QA 文档，并行工作会增加协调成本。
- Suggested split：不拆分。
- Write boundaries：仅 Flight Number Preference editor、对应组件测试、现有 Playwright 和 QA 文档。
- Conflict risk：低。
- Execution gate：用户审核并明确批准本 spec 后才实施。
