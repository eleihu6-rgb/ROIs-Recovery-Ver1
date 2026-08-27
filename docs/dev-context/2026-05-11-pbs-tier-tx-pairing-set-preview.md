# 开发上下文（2026-05-11）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-11 16:47:11 CST
- Wing：`pbs`
- Topic：`tier-tx-pairing-set-preview`
- Title：tier-tx-pairing-set-preview
- Git branch：`main`

## 本轮对话上下文

本轮继续完善 PBS Tier 功能，完成 Tx 级 Pairing Set Preview。

用户目标：继续完善 /tier，而不是转去 Award；明确 PBS 仍只负责保存规则、检查、预览，不实现 RO/PO/法规/资历/coverage 算法。

本轮新增设计与 QA：
- docs/superpowers/specs/2026-05-11-pbs-tier-tx-pairing-set-preview-design.md
- docs/test-cases/pbs/tier/2026-05-11-tier-tx-pairing-set-preview.md

实现要点：
- 在 /tier 的 BID SUMMARY 每个 T1-T7 分组 header 上，为有 Pairing bid 的 Tx 显示 View Pairing Set。
- 点击 Tx 级入口无需先打开 Tier Bid Detail，直接打开 Pairing Set Preview overlay。
- 复用现有 pairingService.getPageData()、selectPairingSetPreviewPropertiesForTier()、pairingService.previewCurrentRules()。
- Preview 仍按该 Tx 的所有 active Pairing rules 生成 pairing set，只是提交前规则预览，不是最终 Award。
- 没有 Pairing bid 的 Tx 不显示入口。
- 原有 Pairing bid detail 内 View Pairing Set 保持可用。
- 不改后端 API，不改 schema，不新增依赖，不实现算法。

主要改动：
- pbs-portal/src/features/tier/components/tier-right-panel.tsx：新增 Tx header 入口、独立 preview dialog、复用 preview state/page/retry/close 逻辑。
- pbs-portal/src/features/tier/components/tier-right-panel.test.tsx：新增 Tx 级入口显示、直接打开 preview、不显示 detail dialog、无 Pairing Tx 不显示入口等测试。

验证：
- cd pbs-portal && npm test -- --run src/features/tier/components/tier-right-panel.test.tsx src/features/tier/tier-pairing-set-preview.test.ts 通过：15 tests。
- cd pbs-portal && npm test -- --run src/features/tier 通过：24 tests。
- cd pbs-portal && npm run lint 通过。
- cd pbs-portal && npm run build 通过。
- 根目录 npm run verify:pbs 通过：pbs-server tests/build/sync dry-run + pbs-portal tests/lint/build 全过。
- 浏览器 mock 验收通过：127.0.0.1:5175/fpqe/pbs/tier 上 T1 显示 View Pairing Set，T3 不显示；点击 T1 直接打开 Pairing Set Preview，显示 Preview only 文案和 E4101。

注意：
- pbs-portal/tsconfig.tsbuildinfo 因 build 被更新后已 git restore 清理，不应提交。
- 当前工作树仍包含前几阶段 Tier diagnostics/detail/view-pairing-set 的未提交改动，不要回滚。

## 当前工作树快照

### git status --short

```text
 M packages/contracts/pbs-lineholder-summary.d.ts
 M pbs-portal/src/features/tier/components/tier-right-panel.test.tsx
 M pbs-portal/src/features/tier/components/tier-right-panel.tsx
 M pbs-portal/src/features/tier/mock.ts
 M pbs-portal/src/features/tier/tier-draft-mappers.test.ts
 M pbs-portal/src/features/tier/tier-draft-mappers.ts
 M pbs-portal/src/features/tier/types.ts
 M pbs-server/src/routes/lineholder-summary.test.ts
 M pbs-server/src/services/lineholder/lineholder-summary-service.ts
?? docs/superpowers/specs/2026-05-11-pbs-tier-detail-drilldown-design.md
?? docs/superpowers/specs/2026-05-11-pbs-tier-diagnostics-review-design.md
?? docs/superpowers/specs/2026-05-11-pbs-tier-tx-pairing-set-preview-design.md
?? docs/superpowers/specs/2026-05-11-pbs-tier-view-pairing-set-design.md
?? docs/test-cases/pbs/tier/2026-05-11-tier-detail-drilldown.md
?? docs/test-cases/pbs/tier/2026-05-11-tier-diagnostics-review.md
?? docs/test-cases/pbs/tier/2026-05-11-tier-tx-pairing-set-preview.md
?? docs/test-cases/pbs/tier/2026-05-11-tier-view-pairing-set.md
?? pbs-portal/src/features/tier/components/tier-detail-dialog.tsx
?? pbs-portal/src/features/tier/components/tier-pairing-set-preview.tsx
?? pbs-portal/src/features/tier/tier-detail-selectors.test.ts
?? pbs-portal/src/features/tier/tier-detail-selectors.ts
?? pbs-portal/src/features/tier/tier-pairing-set-preview.test.ts
?? pbs-portal/src/features/tier/tier-pairing-set-preview.ts
?? pbs-server/src/services/lineholder/lineholder-summary-service.test.ts
```

### unstaged changed files

```text
packages/contracts/pbs-lineholder-summary.d.ts
pbs-portal/src/features/tier/components/tier-right-panel.test.tsx
pbs-portal/src/features/tier/components/tier-right-panel.tsx
pbs-portal/src/features/tier/mock.ts
pbs-portal/src/features/tier/tier-draft-mappers.test.ts
pbs-portal/src/features/tier/tier-draft-mappers.ts
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
2. 本文件：`docs/dev-context/2026-05-11-pbs-tier-tx-pairing-set-preview.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
