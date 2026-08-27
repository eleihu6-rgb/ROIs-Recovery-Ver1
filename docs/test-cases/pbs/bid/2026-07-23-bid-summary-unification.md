# PBS Bid 条件摘要统一回归

## 测试目标

确认 Bid 页面中 `DAYS OFF`、`PAIRING`、`ROSTER` 三类当前条件，以及 Pairing 的 `SEARCH CRITERIA`，使用一致、可读的自然语言摘要。

## 前置条件

- 当前业务日期处于 Jul 2026 bidding window。
- Crew `906` 已存在本轮导入的 Current Bid。
- 使用真实 Portal 和真实 PBS API，不启用 mock。

## 自动化用例

文件：

```text
e2e/tests/pbs-portal/bid-summary-unification.spec.ts
```

执行：

```bash
cd e2e
npx playwright test tests/pbs-portal/bid-summary-unification.spec.ts \
  --config=config/playwright.config.ts \
  --project=pbs-portal \
  --no-deps \
  --workers=1
```

## 验证矩阵

| Tx | 分类 | 条件 | 预期摘要 |
|---|---|---|---|
| T1 | Roster | Credit Window Preference | `High credit window` |
| T2 | Days Off | Prefer Off | `Prefer off on 15 selected dates`，默认 3 个日期和 `+12 more`，支持展开与收起 |
| T3 | Pairing | Pairing Preference | `Award pairings V4507 ×13`，不重复平铺 label，不显示 Pairing ID |
| T3 | Search Criteria | Pairing Preference | 与 Existing 相同：`Award pairings V4507 ×13` |
| T4 | Pairing | Pairing Preference | `Award pairings V4505 ×17` |
| T5 | Pairing | Redeye Preference | `Avoid pairings with a redeye leg` |
| T6 | Pairing | Flight Legs per Duty | `Avoid pairings with any duty having more than 2 flying legs` |
| T7 | Pairing | Airport Preference | `Avoid pairings landing at 10 selected airports` |

## 通用检查

- 页面不显示 JSON、`[object Object]`、`pairingIds` 或 `pairingLabels`。
- 日期显示为 `Jul 1, 2026` 形式，不显示 ISO 日期。
- `Show all N selected` 中的 N 是底层实际选择数。
- 展开区域自身滚动，不造成整个 Bid 页面无限增长。
- 编辑、删除、Preview 仍通过原 `propertyGroupKey` 工作。
- legacy、review-only 或无法与 current draft 对账的行继续保留服务端安全文案。
