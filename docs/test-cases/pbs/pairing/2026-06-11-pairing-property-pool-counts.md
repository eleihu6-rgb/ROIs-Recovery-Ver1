# PBS Pairing Property Pool Counts QA 用例

范围：PBS Portal `/fpqe/pbs/pairing` 的 `EXISTING PAIRING PROPERTIES` 统计诊断

## 前置条件

- 使用有 Pairing bid 权限的 PBS 用户登录。
- 当前 bid period 已加载。
- Pairing 页面至少存在一个 active Tier 下的 Pairing property。
- 后端 `/pairing-search/current-rules/counts` 可访问。

## 场景 1：手动刷新当前 Tx 统计

1. 进入 `/fpqe/pbs/pairing`。
2. 确认 `EXISTING PAIRING PROPERTIES` 顶部摘要显示左侧 `BIDDING CALENDAR` 当前选中的 Tx，例如 `T1` 与 `Counts not calculated`。
3. 点击 `REFRESH`。

预期结果：

- 页面调用一次 current rules counts 接口。
- 顶部醒目显示当前 Tx、active rules 数量、`X pairings`。
- 当前 Tx active 的每条 property 在 `TIERS` 后方显示自己的 count。
- 页面不显示 `All rules` 或 `Funnel` 文案。
- `SEARCH PAIRINGS` 原有跳转能力不受影响。

## 场景 2：多条 property 单条统计

1. 准备同一 Tx 下至少两条 Pairing properties。
2. 点击 `REFRESH`。
3. 观察每条 property 的 `TIERS` 后方统计。

预期结果：

- 每条 property 只显示该条规则单独命中的 `pairings`。
- 非当前 Tx active 的 property 不显示 count。
- 顶部结果表示当前 Tx 下所有 active rules 合并后的最终过滤结果。

## 场景 3：切换左侧 BIDDING CALENDAR Tx 自动计算

1. 在左侧 `BIDDING CALENDAR` 点击 Tx 行按钮，例如用户界面标识为 `ui-149`、`ui-81` 的 Tx 按钮，从 `T1` 切到 `T4`。
2. 不点击 `REFRESH`，观察顶部统计条。

预期结果：

- 页面自动为切换后的当前 Tx 请求一次 counts。
- 顶部显示切换后 Tx 的 rule 数量与过滤结果，或显示 `0 rules / No active pairing properties`。
- 不应批量请求其他 Tx。
- 快速连续切换时，旧 Tx 的返回结果不应覆盖当前 Tx。

## 场景 4：编辑后统计过期

1. 已经刷新出当前 Tx counts。
2. 编辑任意 property 的 bid，或点击右侧 property 行内 `T1/T2/...` tier 勾选。
3. 保存成功后观察统计条。

预期结果：

- 旧的行内 count 不继续展示。
- 顶部显示 counts 需要重新刷新或未计算状态。
- 右侧 property 行内 tier 勾选不应被当作左侧 Tx 切换，不应自动请求 counts。
- 再次点击 `REFRESH` 后显示新的统计结果。

## 场景 5：0 result

1. 准备一组会筛出 0 个 pairing 的条件。
2. 点击 `REFRESH`。

预期结果：

- 请求成功。
- 顶部显示当前 Tx 的 rules 数量与 `0 pairings`。
- 相关行的单条 count 可显示 0。
- 页面不把 0 result 当成接口错误。

## 场景 6：接口错误

1. 模拟 counts 接口返回错误或断网。
2. 点击 `REFRESH` 或切换 Tier。

预期结果：

- 页面显示友好的错误提示。
- Pairing properties 仍可编辑、删除、搜索。
- 不显示可能误导用户的旧统计结果。

## 回归范围

- `/fpqe/pbs/pairing` 新增、编辑、删除 Pairing property。
- `VIEW RULES / VIEW PROPERTIES` 切换。
- `SEARCH PAIRINGS` 当前规则预览。
- 单条 favorite property eye preview。
- 左侧 `BIDDING CALENDAR` active Tx 切换。
- 右侧 Pairing property 行内 tier 勾选。
