# PBS Reserve Preference 按机组类型过滤测试用例

## 范围

验证 `Reserve Preference` 的 short-call type 在 `Current Bid` 和 `Standing Bid` 中都会按照登录机组的 crew type 过滤。

## 数据前置

- `dictionary.parent_code = 'RES_CALL_TYPE'` 中存在 P 组配置，例如 `P_AM`、`P_MM`、`P_PM`，对应 `code_value` 第一段为 `PRAM`、`PRMM`、`PRPM`。
- `dictionary.parent_code = 'RES_CALL_TYPE'` 中存在 C 组配置，例如 `C_AM`、`C_PM`，对应 `code_value` 第一段为 `CRAM`、`CRPM`。
- 至少有一个 pilot 账号，`division = P`。
- 至少有一个 cabin 账号，`division = C`。

## Current Bid

1. 使用 pilot 账号登录。
2. 打开 `Bid -> ROSTER -> Add Reserve Preference`。
3. 期望：`Short-call type` 只显示 P 组配置，例如 `PRAM`、`PRMM`、`PRPM`。
4. 期望：不显示 cabin 的 `CRAM`、`CRPM`。
5. 保存一个合法的 P 组 `Reserve Preference`。
6. 期望：保存成功，重新打开后仍显示同一个 P 组值。

1. 使用 cabin 账号登录。
2. 打开 `Bid -> ROSTER -> Add Reserve Preference`。
3. 期望：`Short-call type` 只显示 C 组配置，例如 `CRAM`、`CRPM`。
4. 期望：不显示 pilot 的 `PRAM`、`PRMM`、`PRPM`。
5. 保存一个合法的 C 组 `Reserve Preference`。
6. 期望：保存成功，重新打开后仍显示同一个 C 组值。

## Standing Bid

1. 使用 pilot 账号登录。
2. 打开 `Standing Bid -> ROSTER -> Add Reserve Preference`。
3. 期望：`Short-call type` 只显示 P 组配置。
4. 使用 `Whole Month`、`First Half` 或 `Second Half` 保存一个 Standing Reserve Preference。
5. 期望：保存到 `StandingReserve` draft 成功。

1. 使用 cabin 账号登录。
2. 打开 `Standing Bid -> ROSTER -> Add Reserve Preference`。
3. 期望：`Short-call type` 只显示 C 组配置。
4. 使用 `Whole Month`、`First Half` 或 `Second Half` 保存一个 Standing Reserve Preference。
5. 期望：保存到 `StandingReserve` draft 成功。

## API 防绕过

1. 使用 cabin 账号 token 调用 `POST /api/reserve-bids/current/properties`，传入 `callType = PRAM`。
2. 期望：接口返回 400，且不创建 reserve property。
3. 使用 cabin 账号 token 调用 `POST /api/standing-bids/current`，`mode = reserve` 且传入 `callType = PRAM`。
4. 期望：接口返回 400，且不创建 standing reserve property。

## 配置缺失

1. 使用一个没有匹配 `RES_CALL_TYPE` 配置的 crew type 测试账号。
2. 打开 `Reserve Preference`。
3. 期望：`Short-call type` 下拉框禁用。
4. 期望：弹窗显示 `No reserve call types are configured for your crew type.`
5. 期望：保存按钮禁用。
