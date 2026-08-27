# 开发上下文（2026-06-05）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-06-05 13:53:36 CST
- Wing：`pbs`
- Topic：`tier-bid-summary-readable-text`
- Title：tier-bid-summary-readable-text
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS Tier BID SUMMARY 语义化展示：
- 需求：Tier 页汇总 Pairing / DaysOff / Line / Reserve 条件时，不能再展示数据库拼接或 JSON，例如 `Set Short Call Type: PRAM - {"mode":"whole_month"}`。
- 已确认产品方向：文案保持英文；日期格式使用 `Jun 24, 2026`；动作词使用 `Award` / `Avoid`；首期尽量覆盖数据库中当前可见属性，隐藏 AA 属性先不考虑。
- 新增 spec：`docs/superpowers/specs/2026-06-05-pbs-tier-bid-summary-readable-text-design.md`。
- 新增后端 formatter：`pbs-server/src/services/lineholder/lineholder-summary-formatters.ts`。
- `lineholder-summary-service.ts` 已改为调用 formatter 生成 `summaryItems[].readableText`，前端 Tier 继续消费 readableText，无需改 UI。
- formatter 覆盖当前可见属性：Pairing 101-130/163，DaysOff 201-206，Line 401-410/427，Reserve 301/302/311；未覆盖或解析失败走安全 fallback，避免 summary 接口 500。
- 典型输出：`Award PRAM short call for the whole bid month`、`Award reserve day on Jun 24, 2026`、`Award only Reserve for the whole bid month`、`Award pairings landing in ABD`。
验证：
- `DATABASE_URL=... PBS_SCHEMA=f8_pbs JWT_SECRET=test-secret CORS_ORIGIN=http://localhost:3030 pnpm --filter pbs-server exec tsx --test src/services/lineholder/lineholder-summary-formatters.test.ts src/services/lineholder/lineholder-summary-service.test.ts src/routes/lineholder-summary.test.ts` 通过，10 tests。
- `DATABASE_URL=... PBS_SCHEMA=f8_pbs JWT_SECRET=test-secret CORS_ORIGIN=http://localhost:3030 pnpm --filter pbs-server exec tsc --noEmit` 通过。
- `pnpm --filter pbs-portal exec vitest run src/features/tier/tier-draft-mappers.test.ts src/features/tier/pages/tier-page.test.tsx src/features/tier/components/tier-right-panel.test.tsx` 通过，28 tests。
- `pnpm --filter pbs-portal exec tsc --noEmit` 通过。
注意：工作树中存在一个不属于本任务的未跟踪上下文文件 `docs/dev-context/2026-06-05-pbs-pairing-number-detail-api-cleanup.md`，不要误删或覆盖。

## 当前工作树快照

### git status --short

```text
 M docs/dev-context/LATEST.md
 M pbs-server/src/services/lineholder/lineholder-summary-service.ts
?? docs/dev-context/2026-06-05-pbs-pairing-number-detail-api-cleanup.md
?? docs/superpowers/specs/2026-06-05-pbs-tier-bid-summary-readable-text-design.md
?? pbs-server/src/services/lineholder/lineholder-summary-formatters.test.ts
?? pbs-server/src/services/lineholder/lineholder-summary-formatters.ts
```

### unstaged changed files

```text
docs/dev-context/LATEST.md
pbs-server/src/services/lineholder/lineholder-summary-service.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-06-05-pbs-tier-bid-summary-readable-text.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
