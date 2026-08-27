# 开发上下文（2026-05-12）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-12 10:53:31 CST
- Wing：`pbs`
- Topic：`tier-editing`
- Title：PBS Tier 编辑能力
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS `/tier` 页面 Tier 编辑能力收口，定位为正式客户可用功能，不叫 MVP。

关键结论：
- PBS 侧只负责保存、检查、预览 bid rules；不做算法、RO/PO、coverage 或法规计算。
- Tier detail 允许编辑可追溯来源的 current draft Pairing / Days Off / Line bid。
- Calendar / Reserve / Unsupported / legacy / T8+ 数据保持只读。
- 编辑和删除复用现有 Pairing、Days Off、Line property patch/delete 接口，不新增 SQL/schema/migration，不新增依赖。
- 保存后刷新 `/api/lineholder-bids/current/summary` 对应的 Tier summary / review；Pairing Set preview 会被清空，避免旧 preview 误导用户。

主要改动：
- `packages/contracts/pbs-lineholder-summary.d.ts`：summary item 新增 `editableSource` 元数据。
- `pbs-server/src/services/lineholder/lineholder-summary-service.ts`：current draft 且支持的 Pairing / DaysOff / Line bid 返回 `editableSource`；只读边界不返回。
- `pbs-portal/src/features/tier/tier-draft-mappers.ts` / `types.ts`：映射 `editableSource` 并计算 `isEditable`。
- `pbs-portal/src/features/tier/tier-editing-actions.ts`：新增 Tier 编辑 orchestration helper，复用现有 source page query cache 和 service。
- `pbs-portal/src/features/tier/components/tier-detail-dialog.tsx`：新增 `Edit Tx`、`Delete Bid`、`Go to Source`、保存/删除状态、错误和只读原因。
- `pbs-portal/src/features/tier/components/tier-right-panel.tsx`：接入 mutation、导航、保存后清 preview。
- 补充 Vitest 覆盖 editable source、编辑 Tx、删除 bid、legacy 只读、页面 Router 外壳。
- 新增 QA 文档 `docs/test-cases/pbs/tier/2026-05-12-tier-editing.md`。

验证结果：
- `npm run verify:pbs` 已通过。
- 单独跑过 `pbs-portal` Tier tests、lint、build；`pbs-server` test/build 也通过。
- 浏览器冒烟使用 mocked API 在本地 dev server `http://127.0.0.1:5176/fpqe/pbs/tier` 验证：editable Pairing detail 显示 `Edit Tx` / `Delete Bid` / `Go to Pairing`；legacy item 不显示编辑/删除，并显示 `Review-only legacy item.`。

注意事项：
- 本地 `5174` 被非 PBS 页面占用，本轮另起 Vite，最终端口为 `5176`。
- `pbs-portal/tsconfig.tsbuildinfo` 是 build 缓存，已从工作树恢复，不应提交。

## 当前工作树快照

### git status --short

```text
 M packages/contracts/pbs-lineholder-summary.d.ts
 M pbs-portal/src/features/tier/components/tier-detail-dialog.tsx
 M pbs-portal/src/features/tier/components/tier-right-panel.test.tsx
 M pbs-portal/src/features/tier/components/tier-right-panel.tsx
 M pbs-portal/src/features/tier/mock.ts
 M pbs-portal/src/features/tier/pages/tier-page.test.tsx
 M pbs-portal/src/features/tier/tier-detail-selectors.test.ts
 M pbs-portal/src/features/tier/tier-draft-mappers.test.ts
 M pbs-portal/src/features/tier/tier-draft-mappers.ts
 M pbs-portal/src/features/tier/tier-pairing-set-preview.test.ts
 M pbs-portal/src/features/tier/types.ts
 M pbs-server/src/routes/lineholder-summary.test.ts
 M pbs-server/src/services/lineholder/lineholder-summary-service.ts
?? docs/superpowers/specs/2026-05-12-pbs-tier-editing-design.md
?? docs/test-cases/pbs/tier/2026-05-12-tier-editing.md
?? pbs-portal/src/features/tier/tier-editing-actions.ts
```

### unstaged changed files

```text
packages/contracts/pbs-lineholder-summary.d.ts
pbs-portal/src/features/tier/components/tier-detail-dialog.tsx
pbs-portal/src/features/tier/components/tier-right-panel.test.tsx
pbs-portal/src/features/tier/components/tier-right-panel.tsx
pbs-portal/src/features/tier/mock.ts
pbs-portal/src/features/tier/pages/tier-page.test.tsx
pbs-portal/src/features/tier/tier-detail-selectors.test.ts
pbs-portal/src/features/tier/tier-draft-mappers.test.ts
pbs-portal/src/features/tier/tier-draft-mappers.ts
pbs-portal/src/features/tier/tier-pairing-set-preview.test.ts
pbs-portal/src/features/tier/types.ts
pbs-server/src/routes/lineholder-summary.test.ts
pbs-server/src/services/lineholder/lineholder-summary-service.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-05-12-pbs-tier-editing.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
