# PBS 隐藏 Mixed Block Pattern 设计确认

## 1. 背景

`410 Mixed Block Pattern` 当前显示在 PBS Portal 的 Line/Roster 条件目录中。产品决定暂时隐藏该
条件。项目尚未上线，不兼容已有 `410` Bid/Favorite 数据，现有数据直接删除。

本需求严格沿用项目原有隐藏机制，不扩展到导入、导出、rollback、API 写入许可或其他业务行为。

## 2. 目标

1. 使用 `pbs_bid_property.is_visible_in_portal` 隐藏 `property_code=410`。
2. 删除三个目标数据库中已有的 `410` Bid/Favorite 数据。
3. 保留 `410` 的代码、Contract、编辑器、payload、校验器、导入映射和算法导出能力。
4. 使用幂等 Migration，并在三个数据库执行和核验。

## 3. 非目标

- 不修改导入规则。
- 不修改导出规则。
- 不修改 import rollback/snapshot。
- 不修改 Current/Standing API 的写入校验。
- 不从 supported catalog、Contract 或前端代码中删除 `410`。
- 不设置 `is_active=0`。
- 不修改 `410` 的名称、排序、payload 或算法语义。
- 不新增前端 `propertyCode !== 410` 硬编码过滤。

## 4. 数据库可见性

仅修改：

```sql
update pbs_bid_property
set
  is_visible_in_portal = 0,
  updated_by = 'system',
  updated_at = now()
where property_code = 410
  and bid_type = 'Line';
```

保持：

- `is_active=1`
- `recommended_order` 原值
- `recommended_usage_count` 原值
- `display_order` 原值
- `property_name='Mixed Block Pattern'`

Current Line 与 Standing Lineholder Catalog 继续使用项目现有的
`is_visible_in_portal=1` 过滤逻辑，不新增代码层隐藏规则。

## 5. 已有数据清理

Migration 通过 `property_code=410` 及对应稳定 `pbs_bid_property.id` 定位并删除：

1. `pbs_bid_line_favorite` 中的 `410` configured Favorite；
2. `pbs_bid_property_favorite` 中 `bid_type='Line'` 的旧通用 Favorite；
3. `pbs_bid_group` 中主属性为 `410` 的 Line group；
4. Line group 的附加 `pbs_bid_condition` 使用 `410` 时，删除对应完整 group。

同一个 `(bid_id, bid_type, property_group_key)` 跨多个 Tx 的记录必须整体删除，不能只删除其中
一个 Tx；不得影响其他 bid 或 bid type 下偶然相同的 key。

删除 group 前先删除对应 condition。删除后按实际剩余 group 数更新受影响
`pbs_bid_tier.total_groups`。不删除 `pbs_bid` 和 `pbs_bid_tier` 容器。

Migration 必须幂等，重复执行不报错，第二次删除数量为零。

## 6. Seed 与 Migration

更新 `sql/seed/10-pbs-bid-property.sql`，保证新库初始化或重复执行 seed 后：

```text
property_code=410
is_visible_in_portal=0
is_active=1
```

新增：

```text
sql/migration/2026-07-28-pbs-hide-mixed-block-pattern.sql
```

Migration 在单个事务中：

1. 设置 `is_visible_in_portal=0`；
2. 删除现有 `410` Favorite；
3. 删除现有 `410` condition/group；
4. 重算受影响 tier 的 `total_groups`；
5. 输出各类更新和删除数量。

Migration 不包含数据库地址、账号或密码。

## 7. 缓存与执行

Current Line Catalog 存在本地/Redis TTL 缓存。每个目标环境执行 Migration 后，使用项目现有运维
方式清理 Catalog 缓存或重启对应 `pbs-server`，再验证页面/API。

Migration 经验证后执行到用户指定的三个 PBS 数据库。每个环境核验：

- `410.is_visible_in_portal=0`
- `410.is_active=1`
- `410` group/Favorite 数量为零
- Current Line Catalog 不返回 `410`
- Standing Lineholder Catalog 不返回 `410`

## 8. 导入和导出保持原样

本需求不改变项目现有导入和导出逻辑：

- 不因 `is_visible_in_portal=0` 新增导入阻断；
- 不在算法导出中新增可见性过滤；
- 不修改旧 import snapshot/rollback；
- 不把“所有隐藏条件都不可导入或导出”定义为全局规则。

如果未来需要统一隐藏条件的导入/导出语义，必须单独立项和确认。

## 9. 测试

### 9.1 数据库

- Migration 首次执行后 `410` 隐藏且数据已清理；
- 重复执行幂等；
- 同一 property 跨多个 Tx 时整组删除；
- 不同 bid/bid type 使用相同 key 时不误删；
- 同一 Bid 中其他 Line 条件保留；
- `total_groups` 与实际剩余 group 数一致。

### 9.2 Catalog

- Current Line Catalog 不返回 `410`；
- Standing Lineholder Catalog 不返回 `410`；
- 其他 Line 条件保持原有顺序和行为；
- 内部 supported catalog/Contract 仍包含 `410`。

### 9.3 QA

新增：

```text
docs/test-cases/pbs/line/2026-07-28-hide-mixed-block-pattern.md
```

通过真实 Portal 页面确认 Current Bid 和 Standing Bid 均不显示 `Mixed Block Pattern`。

## 10. 验收标准

- `410` 只通过数据库 `is_visible_in_portal=0` 隐藏。
- 没有从代码中删除或硬编码过滤 `410`。
- 三个数据库已有 `410` Bid/Favorite 数据清理完成。
- 导入、导出、rollback 和 API 写入逻辑没有改动。
- Migration 幂等，其他 Line 条件和 Bid 数据不受影响。
- 数据库核验、Catalog 测试、Playwright、build 和 `git diff --check` 通过。

## 11. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本需求只涉及数据库可见性、定向数据清理和对应验证，拆分成本高于收益。
- Suggested split: 不拆分。
- Write boundaries: seed、migration、Catalog/QA 测试和文档。
- Conflict risk: 低。
- Execution gate: 本 spec 经用户确认后再写实施计划和开始实现。
