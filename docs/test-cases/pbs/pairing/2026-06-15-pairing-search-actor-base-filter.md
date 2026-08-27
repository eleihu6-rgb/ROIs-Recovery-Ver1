# PBS Pairing Search 当前用户 Base 过滤人工测试用例

## 范围

- 页面：`/fpqe/pbs/pairing/search`
- 接口：PBS pairing search 相关接口
- 目标：搜索结果、计数、候选项、详情和 occurrence 都只返回当前登录人 base 的 pairing。

## 前置条件

- 准备至少两个不同 base 的测试账号，例如 `YYZ` 和 `YVR`。
- 两个 base 在 live `pairing` 表中都有可搜索 pairing。
- 测试账号在 `pbs_user.base` 中有 base；如果为空，应能通过 live `crew_base` 当前 prime base fallback。

## 用例 1：搜索结果按当前用户 base 过滤

步骤：

1. 使用 `YYZ` 用户登录。
2. 进入 `/fpqe/pbs/pairing/search`。
3. 使用一个会命中多个 base pairing 的搜索条件。

预期：

- 搜索结果列表中所有 pairing 的 `BASE` 都是 `YYZ`。
- 不出现 `YVR` 或其他 base 的 pairing。

## 用例 2：Pairing Number autocomplete 按当前用户 base 过滤

步骤：

1. 使用 `YYZ` 用户登录。
2. 在 Pairing Number 输入框输入明确属于其他 base 的 pairing number 前缀。

预期：

- autocomplete 不返回其他 base 的 pairing。
- 输入 `YYZ` base 存在的 pairing number 前缀时，可以返回候选。

## 用例 3：Flight Number autocomplete 按当前用户 base 过滤

步骤：

1. 使用 `YYZ` 用户登录。
2. 输入一个只存在于其他 base pairing segment 中的 flight number。

预期：

- autocomplete 不返回该 flight number。
- 输入当前 base pairing segment 中存在的 flight number 时，可以返回候选。

## 用例 4：Current Rules Counts 与搜索结果一致

步骤：

1. 使用 `YYZ` 用户登录。
2. 在 Pairing 页面配置若干 current rules。
3. 查看 `/pairing/search` 中每条 rule count 和最终 preview result。

预期：

- rule count 基于 `YYZ` pairing pool。
- count 与 preview result 不出现跨 base 不一致。

## 用例 5：Details / Occurrence 不返回其他 base pairing

步骤：

1. 使用 `YYZ` 用户登录。
2. 直接请求或通过页面操作尝试加载一个其他 base 的 pairing details / occurrences。

预期：

- details 返回空结果。
- occurrence 返回空列表。
- 不暴露其他 base pairing 的 legs / duty / date 明细。

## 用例 6：当前用户 base 缺失

步骤：

1. 使用一个 `pbs_user.base` 为空且 live `crew_base` 也没有当前 prime base 的测试账号登录。
2. 进入 `/fpqe/pbs/pairing/search` 并触发搜索。

预期：

- 接口返回 400。
- 不返回全航司 pairing。
- 错误原因可定位为当前用户 base 缺失。
