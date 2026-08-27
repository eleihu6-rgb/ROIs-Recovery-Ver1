# PBS Days Off 既有 Prefer Off 摘要回归测试

## 1. 测试目标

确认既有 Prefer Off 的具体日期、日期范围和单个星期能够按原始申请语义展示，不再把合法的日期范围或星期显示为 `Prefer Off needs review`。

同时确认 Current Days Off 与 Unified Bid Summary 对同一个 Current Bid 返回一致的 Days Off 条目和 Tier 数量。

## 2. 前置条件

- PBS Portal 与 PBS Server 已启动。
- 测试账号存在可编辑的 Current Bid。
- Current Bid 包含以下 T1 Days Off：
  - Prefer Off：`2026-06-03,2026-06-04,2026-06-05`
  - Prefer Off：`Between 2026-06-03 - 2026-06-05`
  - Prefer Off：`Tuesday`
  - Long Stretch Off：2026-06-01 至 2026-06-30，至少连续休息 10 天
- 若使用用户 `19`，先确认运行时 Current Bid identity；不得假设历史 bid `3635` 永远是 Current Bid。

## 3. 主流程

### 3.1 合并 Bid 页面

1. 登录 PBS Portal。
2. 打开 `Bid` 页面。
3. 保持 Bidding Calendar 为 `TIER-01`。
4. 在 `EXISTING BID PROPERTIES` 中检查 Days Off 条目。

预期：

- 具体日期显示：

```text
Prefer off on Jun 3, 2026, Jun 4, 2026, Jun 5, 2026
```

- 日期范围显示：

```text
Prefer off from Jun 3, 2026 to Jun 5, 2026
```

- 星期显示：

```text
Prefer off on Tuesdays
```

- Long Stretch Off 显示：

```text
Award at least 10 consecutive days off from Jun 1, 2026 to Jun 30, 2026
```

- 四条均显示 `T1`。
- 合法的日期范围和星期均不显示 `needs review`。

### 3.2 Days Off 分类

1. 在 `ADD BID PROPERTIES` 中切换到 `DAYS OFF`。
2. 检查现有 Days Off 列表。

预期：

- 日期范围和星期摘要与合并 Bid 页面一致。
- 条目仍可通过原有 Edit/Delete 操作定位。
- 切换分类不会改变原始申请值。

### 3.3 刷新一致性

1. 刷新浏览器。
2. 等待 Bid 页面重新加载完成。
3. 再次检查 T1 Days Off。

预期：

- 四条 Days Off 仍存在。
- 文案、Tier 和数量保持不变。
- 页面不会在刷新后变成 0 条 Days Off。

## 4. 接口与数据库一致性

在相同 crew、period、bid context、bid id 和 draft version 下检查：

1. `GET /api/days-off-bids/current`
2. `GET /api/lineholder-bids/current/summary`
3. 对应 bid 的 `pbs_bid_group` 中 `bid_type='DaysOff'` 记录

预期：

- Current Days Off 的 `draft.properties` group keys 与数据库一致。
- Unified Summary 的 Days Off `summaryItems` group keys 与 Current Days Off 一致。
- T1 的 `daysOffCount` 与 T1 实际 property group 数量一致。
- 三处使用同一个 bid id、period code 和 draft version。

若无法在相同业务上下文复现接口漏读，不得把不同时间点或不同服务实例的数据差异判定为产品缺陷。

## 5. 异常与边界场景

### 5.1 无效日期

数据：`2026-02-30`

预期：

- 条目仍可见。
- 显示 `Prefer Off needs review`。
- 其他合法 Days Off 不受影响。

### 5.2 倒置日期范围

数据：`Between 2026-06-05 - 2026-06-03`

预期：

- 条目显示 `Prefer Off needs review`。
- 不自动交换起止日期。

### 5.3 未配置的星期

数据：不属于接口 `preferOffConfig.weekdays` 的值。

预期：

- 显示 `Prefer Off needs review`。
- 前端不自行猜测或硬编码星期合法性。

## 6. 回归范围

- Days Off 具体日期的短列表和折叠式长列表。
- Long Stretch Off 摘要。
- Pairing 与 Roster property 摘要保持不变。
- Prefer Off 编辑器、日历展开和算法导出语义保持不变。

## 7. 自动化覆盖

- Portal unit/component：
  - `pbs-portal/src/features/bid/bid-property-summary.test.ts`
  - `pbs-portal/src/features/bid/bid-existing-property-summary.test.ts`
  - `pbs-portal/src/features/days-off/pages/days-off-page.test.tsx`
  - `pbs-portal/src/features/bid/pages/bid-page.test.tsx`
- Playwright：
  - `PBS-3510B`
  - `PBS-3530`
