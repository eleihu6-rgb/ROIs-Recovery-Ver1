# PBS Pairing Credit Priority 选择与导出回归测试

## 前置条件

- PBS Portal 和 PBS Server 使用同一套已迁移数据库，`pbs_bid_group.preference_json` 字段存在。
- 测试账号可访问 `Jun 2026` 当前 bid 草稿。
- Pairing 页面可正常加载，并能看到 `ADD PAIRING PROPERTIES`。

## 测试范围

- `Pairing Total Credit`
- `Average Daily Credit`
- `Pairing Total Block Time`
- `Average Daily Block Time`
- `Credit per Time Away from Base`

以上属性应显示 `CREDIT PRIORITY` 的 `Higher / Lower` 显式选择。其他 Pairing 属性不应显示该选择。

## 用例 1：默认不选择 Higher / Lower

1. 打开 `/fpqe/pbs/pairing`。
2. 在 `ADD PAIRING PROPERTIES` 中打开 `Pairing Total Credit` 配置弹窗。
3. 填写 `Award > 08:00`，不点击 `Higher` 或 `Lower`。
4. 保存到 `T1`。
5. 导出或检查后端生成的 `PAIRING_SCORE.csv`。

预期结果：

- 页面 summary 不显示 `Higher` 或 `Lower`。
- `Award_Higher_Credit_Tiers` 为 `[]`。
- `Avoid_Higher_Credit_Tiers` 为 `[]`。

## 用例 2：Award + Higher

1. 打开 `Average Daily Credit` 配置弹窗。
2. 填写 `Award > 06:00`。
3. 选择 `Higher` 并保存到 `T1`。
4. 导出或检查 `PAIRING_SCORE.csv`。

预期结果：

- 页面 summary 显示 `Higher`。
- 命中该条件的 pairing 行中，`Award_Higher_Credit_Tiers` 包含 `[1]`。
- `Avoid_Higher_Credit_Tiers` 不因该条件增加 tier。

## 用例 3：Award + Lower

1. 打开 `Pairing Total Credit` 配置弹窗。
2. 填写 `Award Between 04:00 and 07:30`。
3. 选择 `Lower` 并保存到 `T2`。
4. 导出或检查 `PAIRING_SCORE.csv`。

预期结果：

- 页面 summary 显示 `Lower`。
- 命中该条件的 pairing 行中，`Avoid_Higher_Credit_Tiers` 包含 `[2]`。
- `Award_Higher_Credit_Tiers` 不因该条件增加 tier。

## 用例 4：Avoid + Higher

1. 打开 `Average Daily Block Time` 配置弹窗。
2. 填写 `Avoid > 06:00`。
3. 选择 `Higher` 并保存到 `T3`。
4. 导出或检查 `PAIRING_SCORE.csv`。

预期结果：

- 页面 summary 显示 `Higher`。
- 命中该条件的 pairing 行中，`Avoid_Higher_Credit_Tiers` 包含 `[3]`。
- `Award_Higher_Credit_Tiers` 不因该条件增加 tier。

## 用例 5：Avoid + Lower

1. 打开 `Average Daily Credit` 配置弹窗。
2. 填写 `Avoid < 06:00`。
3. 选择 `Lower` 并保存到 `T4`。
4. 导出或检查 `PAIRING_SCORE.csv`。

预期结果：

- 页面 summary 显示 `Lower`。
- 命中该条件的 pairing 行中，`Award_Higher_Credit_Tiers` 包含 `[4]`。
- `Avoid_Higher_Credit_Tiers` 不因该条件增加 tier。

## 用例 6：Higher / Lower 可取消与互斥

1. 打开任一支持 credit priority 的 Pairing 属性配置弹窗。
2. 点击 `Higher`。
3. 再点击 `Lower`。
4. 再次点击 `Lower`。

预期结果：

- 第 2 步后仅 `Higher` 被选中。
- 第 3 步后仅 `Lower` 被选中。
- 第 4 步后两者都不选中。

## 用例 7：历史草稿回显

1. 保存一个带 `Higher` 或 `Lower` 的 credit property。
2. 刷新 Pairing 页面。
3. 打开已保存属性的编辑弹窗。

预期结果：

- 已保存的 credit priority 能正确回显。
- 修改后保存，不会丢失 tier、action、operator、duration 参数。

## 回归范围

- 不支持 credit priority 的 Pairing 属性仍按原逻辑保存和导出。
- `RESERVE_SCORE.csv` 仍输出 `Award_Higher_Credit_Tiers` 和 `Avoid_Higher_Credit_Tiers` 两列；当前 Reserve UI 未提供 Higher / Lower 时，两列默认为 `[]`。
- Pairing favorite 保存、编辑、从 favorite 加入草稿时，credit priority 不丢失。
- Search Pairings 页面从已有属性或 favorite 进入时，仍同步回原属性来源。
