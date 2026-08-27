# PBS Portal Pairing 新增配置弹窗不默认业务选择设计说明

## 背景

上一轮已经把新增 bid 的 `TIERS` 默认 `T1` 取消。用户继续发现 Pairing 新增配置弹窗里还有其它默认选择，例如：

- `MODE` 可能默认 `Award` 或由 catalog / template 带入。
- `QUANTIFIER` 默认 `Any`。
- `BID` operator 默认 `=`、`>`、`In` 等。
- 数字输入显示最小可用值，例如 `1`。

这些默认值会让用户在没有明确确认的情况下提交一个完整条件，容易误提交。

## 目标

Pairing 新增配置弹窗打开时，不再替用户默认选择业务分组选项。用户必须明确选择必要项后，才能 `ADD BID` 或 `SAVE FAVORITE`。

## 范围

包含：

- Pairing 右侧 `ALL PROPERTIES` 新增 catalog property 打开的 `Configure Pairing Bid` 弹窗。
- 弹窗内需要用户明确选择的业务分组：
  - `TIERS`
  - `MODE`
  - 可见的多选 `QUANTIFIER`，例如 `Any / Every`
  - `BID` operator 下拉

不包含：

- 数字输入不清空。`Any/Every Duty Legs` 这类 stepper 仍可显示最小可用值 `1`。
- 只有一个合法值且原本隐藏的 quantifier，例如单一 `Any`，继续保持隐式语义，不新增一个只有 `Any` 的可见选择区。
- 已有 bid 编辑弹窗。编辑时继续显示已保存的 action / quantifier / operator / tiers。
- Search Pairings 中编辑已进入 criteria 的条件。该入口继续显示 criteria 当前值，不按新增 property 清空。
- 已保存 favorite 的编辑或直接添加语义。favorite 本身代表用户保存过的一组配置。
- 服务端 contract / 数据库结构调整。

## 期望行为

- 新增 Pairing catalog property 打开弹窗后：
  - `TIERS` 全部未选。
  - 有 `MODE` 时，`Award / Avoid` 都未选。
  - 有可见多选 `QUANTIFIER` 时，`Any / Every` 都未选。
  - 有 operator 下拉时，显示空 placeholder，不默认 `=` / `>` / `In`。
  - 数字输入保留当前最小可用值，不要求为空。
- `ADD BID` 和 `SAVE FAVORITE` 在必要项未选全时 disabled。
- 用户补齐可见的 tier、mode、quantifier、operator 和 bid 值后才能提交。
- 已有 bid 编辑时不清空保存值。

## 实现思路

- 在 Pairing 配置弹窗内部区分 `new catalog property` 和 `existing/favorite configured property`。
- 新增 catalog property 进入弹窗时，生成一个“等待用户明确选择”的 draft：
  - tiers 全 inactive。
  - action 置为 `null`，如果该 property 有 `supportedActions`。
  - quantifier 置为 `null`，如果该 property 有多个可见 quantifier 选项。
  - bid operator 置为未选择状态，仅用于前端 draft，不改变最终提交 contract。
- `PairingBidControl` 的 operator 下拉支持空 placeholder。用户选择 operator 后，才调用现有 `transformPairingBidForOperator` 写入真实 operator / bid type。
- `canConfirm` 增加 operator 完整性判断。
- 不改变 stepper 的 number 类型，不把 `value` 改成 `null` 或空字符串。

## 验收标准

- 打开 `Any/Every Duty Legs` 新增弹窗：
  - T1-T7 全部未选。
  - Award/Avoid 未选。
  - Any/Every 未选。
  - operator 未选，不显示 `=` 为已选。
  - 数字输入仍显示 `1`。
  - `ADD BID` disabled。
- 选择 tier、mode、quantifier、operator 后，`ADD BID` 可以提交。
- 编辑已有 Pairing bid 时，保存过的 action / quantifier / operator / tier 仍然显示。
- 不影响 Days Off / Line / Reserve 已完成的 tier 默认行为。

## 测试计划

- 更新 `pairing-page.test.tsx`，覆盖新增 `Any/Every Duty Legs` 弹窗没有默认 `Mode / Quantifier / Operator / Tier`。
- 更新 `pairing-bid-control.test.tsx` 或新增 focused test，覆盖 operator 下拉 placeholder 和选择后的变更。
- 更新 Playwright `condition-default-favorites.spec.ts`，把 Pairing 新增弹窗验证从只看 tier 扩展到 mode / quantifier / operator。
- 运行相关 Vitest、lint、build 和 PBS Portal Playwright 回归。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在 Pairing 配置弹窗和 shared bid control，拆分会增加同文件冲突。
- Suggested split: 不建议拆分。
- Write boundaries: 单 agent 修改 Pairing 前端组件、测试和 QA 文档。
- Conflict risk: 多 agent 容易同时修改 `pairing-property-config-dialog.tsx`、`pairing-bid-control.tsx` 和 `pairing-page.test.tsx`。
- Execution gate: 等用户确认本 spec 后再实施。
