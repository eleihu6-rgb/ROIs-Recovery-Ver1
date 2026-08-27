# PBS Tier Diagnostics / Review QA 测试案例

> 更新：2026-07-20 起，bid 配置类 review 已迁移到 `/bid` 的 `BID REVIEW`；`/tier` 不再显示 `TIER REVIEW`，只保留 `PAIRING POOLS` 与 pool 结果提示。当前行为以 `docs/test-cases/pbs/bid/2026-07-20-bid-review-migration.md` 为准。

## 测试目标

历史目标：旧 `/tier` 页面曾通过 `TIER REVIEW` 展示配置类诊断。当前配置类 review 已迁移到 `/bid` 的 `BID REVIEW`；本文件只作为历史说明，现行验收看 `docs/test-cases/pbs/bid/2026-07-20-bid-review-migration.md`。

## 前置条件

- PBS Portal 和 PBS Server 正常启动。
- 测试账号能进入 `/tier`。
- 当前 Lineholder Current draft 可准备或 mock 以下数据：
  - 至少一个空 Tier。
  - 一个跨多个 Tier 的相同 bid。
  - 一条 `T8-T24` legacy bid。
  - 一条 unsupported property。
  - 一条 `Minimum Days Off Between Work Blocks` 或 waiver / Clear Bids 类 bid。

## 场景 1：空 Tier 提醒

1. 准备 `T3` 没有任何 bid。
2. 打开 `/bid`。

预期结果：

- 页面显示 `BID REVIEW`。
- 出现类似 `T3 has no saved bids` 的提醒。
- 提醒为只读，不出现编辑、保存或删除控件。

## 场景 2：跨 Tx 重复引用提醒

1. 准备同一个 Pairing / Days Off / Line bid 同时适用于 `T1` 和 `T2`。
2. 打开 `/bid`。

预期结果：

- `EXISTING BID PROPERTIES` 按当前 Tx 筛选该 bid。
- `BID REVIEW` 出现“同一 bid 出现在 T1, T2，需要 review”的提醒。
- 该提醒不阻止用户继续查看页面。

## 场景 3：Legacy Tier 提醒

1. 准备一条 tiers 包含 `T12` 的旧数据。
2. 打开 `/bid`。

预期结果：

- `BID REVIEW` 出现 legacy Tier 提醒。
- legacy-only item 按 `Legacy` 规则展示，不混入普通 Tx-only 过滤。

## 场景 4：Unsupported Property 提醒

1. 准备一条无法识别的 property，使 summary 返回 `bidType=Unsupported` 或 `warningCode=unsupportedProperty`。
2. 打开 `/bid`。

预期结果：

- `BID REVIEW` 出现 unsupported property 提醒。
- 页面不报错，不阻断其他 bid summary 展示。

## 场景 5：分布异常提醒

1. 准备某个 Tier bid 数量明显多于其他非空 Tier。
2. 准备另一个 Tier 只有 1 条 bid，且整体平均值较高。
3. 打开 `/bid`。

预期结果：

- `BID REVIEW` 对重的 Tier 显示 review 提醒。
- `BID REVIEW` 对轻的 Tier 显示 review 提醒。
- 该提醒只说明“review”，不写成 hard error。

## 场景 6：Restrictive / Waiver 提示

1. 准备 `Minimum Days Off Between Work Blocks`、`Waive Minimum Days Off`、`Clear Bids` 或 Line waiver bid。
2. 打开 `/bid`。

预期结果：

- `BID REVIEW` 出现该 bid 可能影响后续 Tx 的提醒。
- 页面不重新执行规则引擎，不阻止用户。

## 回归范围

- `PAIRING POOLS` 仍显示 T1-T7 的 pairing pool 统计。
- `/tier` 不再显示 `BID SUMMARY` / `TIER REVIEW`。
- `/bid` 显示 `BID REVIEW`、legacy warning 和 review-only item。
- `/pairing`、`/days-off`、`/line` 的编辑保存链路不受影响。
