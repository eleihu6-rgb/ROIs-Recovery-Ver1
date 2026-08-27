# PBS Enroute Check-In Time Every Quantifier Design

## 背景

CLASS bid report 中仍有一条 unsupported：

`Award Pairings If Every Enroute Check-In Time = 09:15`

系统已有 Pairing 属性 `propertyCode=114`，当前名称为 `Any Enroute Check-In Time`，但只支持 `any` 量词。用户要求页面也能选择对应量词，并补充 Playwright 测试。

## 目标

- 将现有 `propertyCode=114` 扩展为 `Any/Every Enroute Check-In Time`。
- 页面配置 Pairing Bid 时能选择 `Any` 或 `Every`。
- 导入接口能识别 `Every Enroute Check-In Time = 09:15`。
- Pairing search/count 对 `Every` 使用正确语义。
- 补充后端测试和 Playwright E2E 测试。

## 非目标

- 不新增新的 property code。
- 不把 `Every` 降级为 `Any`。
- 不处理剩余两个 unsupported：
  - `Departing On Between 06:00 And 06:45`
  - `Days Off Opposite Employee 762 Minimum 8`

## 行为设计

### 量词语义

- `Any Enroute Check-In Time = 09:15`：
  - pairing 内存在至少一个 enroute check-in time 满足 `= 09:15`。
- `Every Enroute Check-In Time = 09:15`：
  - pairing 内至少存在一个 enroute check-in time；
  - 且不存在任何 enroute check-in time 不满足 `= 09:15`。

这个语义要用于 pairing search/count，所以页面右侧 count 和导入后的条件筛选结果保持一致。

## 实现范围

### Shared contracts / catalog

- 更新 `packages/contracts/pbs-pairing-bids.js`：
  - `propertyCode=114` 名称改为 `Any/Every Enroute Check-In Time`。
  - `supportedQuantifiers` 从 `["any"]` 改为 `["any","every"]`。
  - `defaultQuantifier` 保持 `any`。

### 数据库 migration

- 新增 migration 更新 `pbs_bid_property`：
  - `property_name='Any/Every Enroute Check-In Time'`
  - `any_or_every='["any","every"]'`
  - tooltip 文案同步。

### PBS 保存校验

- 更新 `pbs-server/src/services/pairing/pairing-property-validation.ts`：
  - 114 允许 `any` 或 `every`。
  - 错误文案从 `requires Any` 调整为 `requires Any or Every`。

### Pairing search/count

- 更新 `pbs-server` 和 `live-server` 的 pairing search time condition：
  - `any` 保持现有 `exists`。
  - `every` 使用 `exists` + `not exists not-matching`。

### Crew bid import mapper

- 更新 `live-server/src/services/crew-bid-import/crew-bid-property-mapper.ts`：
  - 识别 `Every Enroute Check-In Time ...`。
  - 输出 `propertyCode=114`，`paramC='every'`。

### Playwright E2E

- 补充 PBS Portal/Pairing 页面测试案例：
  - 打开 Pairing Bid 配置。
  - 选择 `Any/Every Enroute Check-In Time`。
  - 验证页面出现量词选择。
  - 选择 `Every`，保存。
  - 验证已保存的 bid 文案包含 `Every`。

## 验收标准

- 页面能新增并保存 `Every Enroute Check-In Time = 09:15`。
- 对应 count 能正常返回，不报错。
- 整份 March 文件 dry-run 后 unsupported 从 `3` 降到 `2`。
- 后端 targeted tests 通过。
- 新增 Playwright 测试通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 需要跨 contracts、pbs-server、live-server、E2E 串联同一个 propertyCode，拆分容易出现语义不一致。
- Suggested split: 不拆。
- Write boundaries: main agent 统一修改 contracts、server、import mapper、测试。
- Conflict risk: 中等；当前工作区已有 crew bid import 和 UI failure table 未提交改动，实现时要避免误改无关文件。
- Execution gate: 用户确认本 spec 后进入实现。
