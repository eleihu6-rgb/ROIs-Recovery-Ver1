# Pairing Length 摘要文案统一实施计划

## 目标

让 `SEARCH CRITERIA` 与 `EXISTING BID PROPERTIES` 对 Pairing Length 输出完全一致的自然语言摘要，
并保持搜索、保存、导入和导出行为不变。

## 步骤

1. 在共享 Pairing contract 中增加纯格式化方法。
   - 输入：`Award / Avoid`、`minDays / maxDays`、可选 `dateScope`。
   - 输出：spec 定义的完整英文摘要。
   - 验证：共享 contract 单元测试覆盖边界、单复数和日期模式。

2. 接入 PBS Portal Search Criteria。
   - Pairing Length 使用共享完整摘要。
   - 其他 Pairing 条件继续走现有摘要链路。
   - 验证：Portal 单元测试逐字断言新文案。

3. 接入 PBS Server Existing Bid 摘要。
   - structured Pairing Length formatter 使用共享完整摘要。
   - 保留现有 review-only fallback 和数据校验。
   - 验证：Server 单元测试覆盖 Award/Avoid、min/max/exact/range 和日期。

4. 真实页面回归。
   - 通过 Playwright 建立或读取 Pairing Length 条件。
   - 分别断言 `SEARCH CRITERIA` 与 `EXISTING BID PROPERTIES` 文案一致。
   - 运行 `npm run check:ui`、相关 build/test、`git diff --check` 和 GitNexus detect-changes。

## 写入边界

- `packages/contracts/pbs-pairing-bids.*`
- Pairing contract 测试
- `pbs-portal` Pairing 摘要及其测试
- `pbs-server` Lineholder 摘要及其测试
- Pairing Search Playwright 测试

不修改数据库、SQL 条件、Pairing Length payload、导入器或算法导出。
