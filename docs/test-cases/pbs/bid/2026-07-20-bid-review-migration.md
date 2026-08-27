# Bid Review 迁移回归测试

## 范围

验证 `/bid` 页面正式承接原 `/tier` 的 bid 配置类 review；`/tier` 页面只保留 Pairing pool health 和 Pairing Set Preview。

## 前置条件

- 使用含有 T1/T2 bid、diagnostics、warnings 或 legacy item 的测试账号。
- PBS Portal 已加载当前 bid month。
- 后端 `GET /lineholder-bids/current/summary` 正常返回。

## 用例 1：Bid 页默认 T1 显示 BID REVIEW

1. 打开 `/bid`。
2. 确认左侧 calendar 没有显式选择其他 Tx。
3. 查看 `EXISTING BID PROPERTIES` 下方。

预期：

- 显示 `BID REVIEW`。
- 显示 `T1`。
- 下方 Existing bid list 也显示 `T1 only`。
- 不出现 mock 文案，例如 `Mock warnings`。

## 用例 2：Tx 切换同步 review 和 existing rows

1. 在左侧 calendar 选择 `TIER-02`。
2. 查看 `/bid` 右侧。

预期：

- `BID REVIEW` 显示 `T2`。
- `T2 only` 和 bid rows 同步切换。
- 只展示和 T2 相关、global 或符合 legacy 规则的 review items。
- 只属于 T1 的 review item 不显示在 T2。

## 用例 3：More 浮层

1. 准备超过 3 条 review items。
2. 在 `/bid` 点击 `+N more`。
3. 在浮层内滚动。

预期：

- 浮层显示当前 Tx 的全部 review items。
- 浮层内部可滚动。
- 页面外侧不出现不可用的 body 滚动条。
- 点击 `Close` 后浮层关闭。

## 用例 4：Tier 页移除 TIER REVIEW

1. 打开 `/tier`。
2. 查看页面内容。

预期：

- 显示 `PAIRING POOLS`。
- 不显示 `TIER REVIEW`。
- 不显示 `BID SUMMARY`。
- Pairing Set Preview 入口仍可用。

## 用例 5：Pairing pool 结果提示保留在 Tier

1. 准备 Tx pool 为空、0 new pairings 或 count error 的数据。
2. 打开 `/tier`。

预期：

- 对应提示显示在 `PAIRING POOLS` 附近。
- 这些提示不迁入 `/bid` 的 `BID REVIEW`。

## 回归范围

- `/bid` Existing bid rows 的 edit / delete / preview 不受影响。
- `/bid` Pairing toolbar、Search Pairings、View Rules 不受影响。
- `/tier` Pairing pool counts、View Set、Pairing Set Preview 不受影响。
- Help Center 中 Tier/Bid 说明与页面职责一致。
