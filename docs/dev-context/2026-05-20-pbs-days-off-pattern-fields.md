# 开发上下文（2026-05-20）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-20 11:29:26 CST
- Wing：`pbs`
- Topic：`days-off-pattern-fields`
- Title：days-off-pattern-fields
- Git branch：`main`

## 本轮对话上下文

# PBS Days Off / Days On Pattern 字段语义修复 - 2026-05-20

本轮完成 `205 Days Off / Days On Pattern` 的语义修复。不要再把该条件实现成只有 `from/to` 两个数字的 `stepper-range`。

已确认业务语义：
- AA / 旧库结构为 `Set Condition Pattern Between A and B Days On, with C Days Off`。
- 旧库保存映射为 `param_a = min days off`，`param_b = min days on`，`param_c = max days on`，`operator = Between`。
- 本项目前端结构统一为 `days-off-on-pattern`，字段是 `minDaysOff`、`minDaysOn`、`maxDaysOn`。

本轮关键改动：
- `packages/contracts/pbs-days-off-bids.js` 中 205 默认值改为 `{ type: "days-off-on-pattern", minDaysOff: 3, minDaysOn: 3, maxDaysOn: 5, min: 1, max: 14 }`。
- Portal `PairingBidControl` 增加三字段 UI：`Min days on`、`Max days on`、`Minimum days off`。
- Days Off 弹窗增加 205 校验：三个字段必须 >= 1，且 `minDaysOn <= maxDaysOn`。
- Server `serializeRuleBid` / `deserializeRuleBid` 按旧库 A/B/C 语义保存和回显。
- Server Days Off draft validation 增加 205 专用结构和范围校验。
- SQL seed / migration 中 205 的 `validation_json` 更新为 A/B/C 三字段。
- 已补自动化测试和人工测试案例：`docs/test-cases/pbs-portal/days-off-pattern-fields.md`。
- 已更新 spec：`docs/superpowers/specs/2026-05-20-pbs-days-off-pattern-fields-design.md`，状态为已确认并实施。

验证已通过：
- `pnpm --dir pbs-portal test -- pairing-bid-control.test.tsx days-off-page.test.tsx rule-bids/utils.test.ts`，实际 48 个测试文件 / 301 个测试通过。
- `pnpm --dir pbs-server test -- lineholder/rule-bid-value.test.ts days-off/days-off-validation.test.ts`，当前脚本实际执行 194 个测试通过。
- `pnpm --dir pbs-portal exec tsc --noEmit --pretty false`。
- `pnpm --dir pbs-portal build`。
- `pnpm --dir pbs-server build`。
- `pnpm --dir pbs-portal lint -- src/features/days-off/components/days-off-bid-dialog.tsx src/features/days-off/pages/days-off-page.test.tsx src/features/pairing/components/pairing-bid-control.tsx src/features/pairing/components/pairing-bid-control.test.tsx src/features/pairing/pairing-bid-control-logic.ts src/features/pairing/pairing-bid-summary.ts src/features/rule-bids/utils.ts`。
- `git diff --check`。

注意：
- 本轮没有修改其他 Days Off 条件的语义。
- `MODIFIERS` 仍只对 `Prefer Off` 显示。
- `204 Min Consecutive Days Off In Window` 仍是 `stepper-date-range`。
- `206 Shared Days Off With Employee` 仍是 `crew-days-off-share`。

## 当前工作树快照

### git status --short

```text
 M packages/contracts/pbs-days-off-bids.d.ts
 M packages/contracts/pbs-days-off-bids.js
 M packages/contracts/pbs-line-bids.d.ts
 M packages/contracts/pbs-pairing-bids.d.ts
 M packages/contracts/pbs-pairing-bids.js
 M pbs-portal/src/features/days-off/components/days-off-bid-dialog.tsx
 M pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
 M pbs-portal/src/features/pairing/components/pairing-bid-control.test.tsx
 M pbs-portal/src/features/pairing/components/pairing-bid-control.tsx
 M pbs-portal/src/features/pairing/pairing-bid-control-logic.ts
 M pbs-portal/src/features/pairing/pairing-bid-summary.ts
 M pbs-portal/src/features/pairing/types.ts
 M pbs-portal/src/features/rule-bids/utils.ts
 M pbs-server/src/services/days-off/days-off-validation.test.ts
 M pbs-server/src/services/days-off/days-off-validation.ts
 M pbs-server/src/services/lineholder/rule-bid-value.test.ts
 M pbs-server/src/services/lineholder/rule-bid-value.ts
 M sql/migration/2026-04-30-pbs-property-catalog-visibility.sql
 M sql/seed/10-pbs-bid-property.sql
?? docs/superpowers/specs/2026-05-20-pbs-days-off-pattern-fields-design.md
?? docs/test-cases/pbs-portal/days-off-pattern-fields.md
```

### unstaged changed files

```text
packages/contracts/pbs-days-off-bids.d.ts
packages/contracts/pbs-days-off-bids.js
packages/contracts/pbs-line-bids.d.ts
packages/contracts/pbs-pairing-bids.d.ts
packages/contracts/pbs-pairing-bids.js
pbs-portal/src/features/days-off/components/days-off-bid-dialog.tsx
pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
pbs-portal/src/features/pairing/components/pairing-bid-control.test.tsx
pbs-portal/src/features/pairing/components/pairing-bid-control.tsx
pbs-portal/src/features/pairing/pairing-bid-control-logic.ts
pbs-portal/src/features/pairing/pairing-bid-summary.ts
pbs-portal/src/features/pairing/types.ts
pbs-portal/src/features/rule-bids/utils.ts
pbs-server/src/services/days-off/days-off-validation.test.ts
pbs-server/src/services/days-off/days-off-validation.ts
pbs-server/src/services/lineholder/rule-bid-value.test.ts
pbs-server/src/services/lineholder/rule-bid-value.ts
sql/migration/2026-04-30-pbs-property-catalog-visibility.sql
sql/seed/10-pbs-bid-property.sql
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-05-20-pbs-days-off-pattern-fields.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
