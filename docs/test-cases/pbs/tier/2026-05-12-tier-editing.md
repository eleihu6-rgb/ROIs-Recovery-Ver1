# PBS Tier 编辑能力回归测试案例

> 历史废弃：2026-07-20 起，`/tier` 详情不再承担 `Edit Tx` / `Delete Bid`。bid 编辑、删除和 Tx 调整统一从 `/bid` 的 `EXISTING BID PROPERTIES` 完成。

## 测试目标

验证 `/tier` 详情弹窗可以对当前 draft 中可追溯来源的 Pairing / Days Off / Line bid 执行 `Edit Tx` 和 `Delete Bid`，并且保存后刷新 Tier summary / review；同时确认 legacy、unsupported、Calendar、Reserve 和 T8+ 数据保持只读。

## 前置条件

- PBS Portal 可进入 `/tier`。
- 当前 Lineholder draft 至少包含一个 Pairing bid、一个 Days Off bid、一个 Line bid。
- 至少准备一条 legacy 或 T8+ 数据用于只读校验。
- 浏览器 DevTools Network 可查看 XHR 请求。

## 场景 1：编辑 Pairing bid 的 Tx

1. 打开 `/tier`。
2. 在 `BID SUMMARY` 点击一条 Pairing bid。
3. 在详情弹窗点击 `Edit Tx`。
4. 勾选或取消 T1-T7 中的 Tx，保留至少一个 Tx。
5. 点击 `Save Tx`。

预期结果：

- 页面调用现有 Pairing property patch 接口。
- 保存期间按钮进入禁用或保存状态。
- 保存成功后 Tier summary / review 被刷新。
- 同一条 bid 在新的 Tx 分组下展示。
- Pairing Set preview 状态被清空，避免显示旧规则结果。

## 场景 2：删除 Pairing bid

1. 打开 `/tier` 并点击一条 Pairing bid。
2. 点击 `Delete Bid`。
3. 在确认区点击 `Delete`。

预期结果：

- 页面调用现有 Pairing property delete 接口。
- 删除成功后关闭详情弹窗。
- Tier summary / review 被刷新，该 bid 不再展示。

## 场景 3：Days Off / Line bid 编辑

1. 分别点击 Days Off 和 Line 类型的 bid。
2. 重复 `Edit Tx` 和 `Delete Bid` 流程。

预期结果：

- Days Off 使用现有 Days Off property patch/delete 接口。
- Line 使用现有 Line property patch/delete 接口。
- 保存和删除后均刷新 Tier summary / review。

## 场景 4：只读边界

1. 点击 Calendar、Reserve、Unsupported、legacy 或包含 T8+ 的 bid。
2. 查看详情弹窗操作区。

预期结果：

- 不展示 `Edit Tx` 和 `Delete Bid`。
- 弹窗显示只读原因。
- 如有来源页面，允许通过 `Go to Source` 返回来源页查看或修改。

## 场景 5：错误和取消

1. 在 `Edit Tx` 中取消所有 Tx。
2. 模拟保存接口失败或断网。
3. 在确认删除区按 `Cancel` 或 `Escape`。

预期结果：

- 未选择任何 Tx 时不能保存。
- 保存失败时弹窗展示错误信息，不误删或误改本地 summary。
- `Cancel` 和 `Escape` 可以退出编辑或删除确认状态。
- mutation 进行中不应通过 `Escape` 中断状态。

## 回归范围

- `/pairing`、`/days-off`、`/line` 原有添加、修改、删除逻辑不受影响。
- `/tier` 的 `View Pairing Set` 继续复用 Pairing current draft 缓存。
- `/api/lineholder-bids/current/summary` 仅新增 `editableSource` 元数据，不改变旧字段含义。
