# 开发上下文（2026-07-17）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-17 18:03:59 CST
- Wing：`pbs`
- Topic：`airport-preference-remove-fulfilment`
- Title：Airport Preference 移除 Fulfilment 与三库 Migration
- Git branch：`main`

## 本轮对话上下文

## 最终决策

- Airport Preference 条件结构变化必须同步 `pbs_bid_property.property_code = 168` 的数据库目录元数据。
- 先前 spec 中“不增加数据库迁移”的判断已被用户纠正并正式废止。
- 项目未上线，不兼容旧 Airport Preference 数据：migration 删除完整跨 tier group closure、conditions、occurrences、configured/simple/generic Pairing favorites，并仅清理因此变空的 tier/bid。
- property 168 作为 AND condition 时删除完整规则组，避免只删 condition 后把规则意外放宽。

## Spec 与实现

- 修订 spec：`docs/superpowers/specs/2026-07-17-pbs-airport-preference-remove-fulfilment-design.md`
- Spec reviewer 三轮后 Approved。
- Migration：`sql/migration/2026-07-17-pbs-airport-preference-remove-fulfilment.sql`
- SQL fixture/verify 覆盖首次执行、跨 tier group closure、AND condition、occurrence、day-off 保留、favorite-only bid、其他类别 favorite 保留、计数重算和第二次执行幂等。
- Migration commit：`08e95031 fix: migrate Airport Preference fulfilment removal`

## 三环境执行结果（2026-07-17）

- `f8_pbs`：目录元数据已对齐；第二次执行所有变更计数为 0。
- `f8_uat_pbs`：首次 `metadata updates=1`，其他删除/更新计数为 0；第二次所有计数为 0。
- `f8_sit_pbs`：首次 `metadata updates=1`，其他删除/更新计数为 0；第二次所有计数为 0。
- 三套 schema 执行前均无 property 168 group/condition/occurrence/favorite 数据，因此没有实际业务行被删除。
- 三套 schema 的 bid/tier/day-off/group/condition/occurrence/favorite 表总数执行前后完全一致。
- 最终 validation_json 仅包含 type、events、locations、dateScope、minimumLayoverDuration，不含 fulfilment/minimumRequired/maximumRequired。

## 验证与安全

- 临时隔离 schema 完整迁移链路 PASS，测试 schema 已删除。
- 三套真实 schema 独立事务执行并验证 PASS。
- 数据库密码未写入代码、SQL、文档、日志或 Git。
- 当前工作树另有 NPBS simulation 相关未提交文件，属于其他任务，不得混入本任务提交。

## 当前工作树快照

### git status --short

```text
 M e2e/pages/pbs-portal/bid-workbench-page.ts
 M e2e/utils/npbs/mapping.mjs
 M e2e/utils/npbs/parse-npbs-bids.test.mjs
?? docs/superpowers/specs/2026-07-17-npbs-bids-simulation-current-catalog-refresh-design.md
```

### unstaged changed files

```text
e2e/pages/pbs-portal/bid-workbench-page.ts
e2e/utils/npbs/mapping.mjs
e2e/utils/npbs/parse-npbs-bids.test.mjs
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-07-17-pbs-airport-preference-remove-fulfilment.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
