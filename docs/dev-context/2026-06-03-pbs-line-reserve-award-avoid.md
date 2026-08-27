# 开发上下文（2026-06-03）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-06-03 11:53:29 CST
- Wing：`pbs`
- Topic：`line-reserve-award-avoid`
- Title：line-reserve-award-avoid
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS Line Reserve Award/Avoid 方案落地：
- 新增 Line `Reserve` 条件，`propertyCode=427`，属于 Line AA supported code。
- `Award Reserve` 表达 `Only Reserve`：全 bid month 只要 reserve。
- `Avoid Reserve` 表达 `No Reserve`：全 bid month 不要任何 reserve duty / reserve assignment / reserve pairing。
- UI 不默认选择 Award/Avoid；用户点击 Add Reserve 后必须在弹窗中显式选择，`BID` 固定显示 `Whole bid month`。
- 前后端 contracts、RuleBid mapper、Line mapper、Line service、route schema 均保留 `action: "award" | "avoid" | null`。
- 后端 Line validation 要求 427 必须 `bid.type="flag"` 且 action 为 award/avoid。
- `pbs_bid_group.action_id` 对 Line 427 复用：award=1，avoid=2；普通 Line 仍通常为 null。
- `pbs_bid_line_favorite` 新增 `action` 字段，配置收藏会保留 Award/Avoid。
- 算法导出 `LINE_RULES.csv` 中 427 导出为 `Rule_Type=RESERVE`，`Parameters_JSON={"action":"award|avoid","scope":"whole_bid_month"}`，Description 为完整句子。
- 410 继续表示 `Reserve / Flying Date Pattern`，不再作为 Only Reserve 的首选导出表达。
- 新增 migration `sql/migration/2026-06-03-pbs-line-reserve-award-avoid.sql`，seed 同步增加 427。
- 更新长期文档与 QA 文档，避免继续出现 “Only Reserve 使用 410” 的旧结论。
验证：
- `pnpm --filter pbs-portal exec vitest run src/features/line/pages/line-page.test.tsx` 通过，20 tests。
- 带本地测试 env 运行 `pnpm --filter pbs-server exec tsx --test src/services/line/line-validation.test.ts src/services/algorithm-export/line-rules-export.test.ts` 通过，14 tests。
- 带本地测试 env 运行 `pnpm --filter pbs-server exec tsc --noEmit` 通过。
- `pnpm --filter pbs-portal exec tsc --noEmit` 通过。
注意：工作树中还有本轮 spec、QA、migration 等未提交改动；不要回滚用户/前序模型留下的 PBS pairing 或其他无关改动。

## 当前工作树快照

### git status --short

```text
 M docs/modules/pbs/algorithm-export-line-rules.md
 M docs/superpowers/specs/2026-06-02-pbs-algorithm-line-rules-export-design.md
 M docs/test-cases/pbs/algorithm-export/2026-06-02-line-rules-export.md
 M packages/contracts/pbs-line-bids.d.ts
 M packages/contracts/pbs-line-bids.js
 M pbs-portal/src/features/line/components/line-bid-dialog.tsx
 M pbs-portal/src/features/line/line-draft-mappers.ts
 M pbs-portal/src/features/line/pages/line-page.test.tsx
 M pbs-portal/src/features/line/pages/line-page.tsx
 M pbs-portal/src/features/rule-bids/rule-bid-draft-mappers.ts
 M pbs-portal/src/features/rule-bids/types.ts
 M pbs-portal/src/features/rule-bids/utils.ts
 M pbs-server/src/models/pbs/pbs-bid-line-favorite.ts
 M pbs-server/src/routes/line-bids.ts
 M pbs-server/src/services/algorithm-export/line-rules-export.test.ts
 M pbs-server/src/services/algorithm-export/line-rules-export.ts
 M pbs-server/src/services/line/line-bid-service.ts
 M pbs-server/src/services/line/line-draft-property-helpers.ts
 M pbs-server/src/services/line/line-draft-property-write.ts
 M pbs-server/src/services/line/line-validation.test.ts
 M pbs-server/src/services/line/line-validation.ts
 M sql/schema/03-pbs_pg.sql
 M sql/seed/10-pbs-bid-property.sql
?? docs/superpowers/specs/2026-06-03-pbs-line-reserve-award-avoid-design.md
?? docs/test-cases/pbs/line/2026-06-03-reserve-award-avoid.md
?? sql/migration/2026-06-03-pbs-line-reserve-award-avoid.sql
```

### unstaged changed files

```text
docs/modules/pbs/algorithm-export-line-rules.md
docs/superpowers/specs/2026-06-02-pbs-algorithm-line-rules-export-design.md
docs/test-cases/pbs/algorithm-export/2026-06-02-line-rules-export.md
packages/contracts/pbs-line-bids.d.ts
packages/contracts/pbs-line-bids.js
pbs-portal/src/features/line/components/line-bid-dialog.tsx
pbs-portal/src/features/line/line-draft-mappers.ts
pbs-portal/src/features/line/pages/line-page.test.tsx
pbs-portal/src/features/line/pages/line-page.tsx
pbs-portal/src/features/rule-bids/rule-bid-draft-mappers.ts
pbs-portal/src/features/rule-bids/types.ts
pbs-portal/src/features/rule-bids/utils.ts
pbs-server/src/models/pbs/pbs-bid-line-favorite.ts
pbs-server/src/routes/line-bids.ts
pbs-server/src/services/algorithm-export/line-rules-export.test.ts
pbs-server/src/services/algorithm-export/line-rules-export.ts
pbs-server/src/services/line/line-bid-service.ts
pbs-server/src/services/line/line-draft-property-helpers.ts
pbs-server/src/services/line/line-draft-property-write.ts
pbs-server/src/services/line/line-validation.test.ts
pbs-server/src/services/line/line-validation.ts
sql/schema/03-pbs_pg.sql
sql/seed/10-pbs-bid-property.sql
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-06-03-pbs-line-reserve-award-avoid.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
