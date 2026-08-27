# 开发上下文（2026-05-27）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-27 13:39:08 CST
- Wing：`pbs`
- Topic：`pbs-pairing-default-tier-single-selection`
- Title：pbs-pairing-default-tier-single-selection
- Git branch：`main`

## 本轮对话上下文

本轮修复 PBS Pairing 新增条件配置弹窗默认 tier 多选问题。

背景：
- 用户在真实页面打开 Average Daily Block Time 配置弹窗时看到 T1/T2 同时默认选中。
- 进一步确认后，条件本身来自后端 propertyCatalog，但 pbs-portal 在 mapPairingDraftResponseToPageData 时会用 pairingMockFactories.cloneAvailableProperties() 作为 fallback/template。
- 之前 121 测试 fixture 写了 tiers: ["T1", "T2"]，通过 buildAvailablePropertyFromCatalog 的 template.tiers 被带进真实 catalog-derived available property，导致真实新增条件弹窗默认多选。

关键决策：
- catalog-derived available property 不应继承 mock/template 的 active tier 状态。
- 新增条件默认只选一个 tier，当前固定为 T1。
- configured favorite / existing draft 的 tiers 仍按真实返回数据保留，不受本修复影响。

已完成改动：
- pbs-portal/src/features/pairing/pairing-draft-mappers.ts：buildAvailablePropertyFromCatalog 的 tiers 改为 createPairingTierOptions(["T1"])。
- pbs-portal/src/features/pairing/mock.ts：121 fixture tiers 改为 ["T1"]，避免测试/开发数据继续误导。
- pbs-portal/src/features/pairing/pages/pairing-page.test.tsx：补 Average Daily Block Time 弹窗默认 T1 active、T2 inactive 的断言。
- 新增 spec：docs/superpowers/specs/2026-05-27-pbs-pairing-default-tier-single-selection-design.md。

验证结果：
- npm --prefix pbs-portal test -- pairing-page pairing-property-catalog pairing-bid-control pairing-bid-control-logic 通过。
- npm --prefix pbs-portal run build 通过。
- npm --prefix pbs-portal run lint 通过。
- git diff --check 通过。

## 当前工作树快照

### git status --short

```text
 M docs/dev-context/LATEST.md
 M packages/contracts/pbs-pairing-bids.js
 M pbs-portal/src/features/pairing/mock.ts
 M pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
 M pbs-portal/src/features/pairing/pairing-draft-mappers.ts
 M pbs-portal/src/features/pairing/pairing-property-catalog.test.ts
 M pbs-server/src/routes/pairing-bids.test.ts
 M pbs-server/src/routes/pairing-bids.ts
 M pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts
 M pbs-server/src/services/pairing-search/pairing-search-condition-builder.ts
?? docs/dev-context/2026-05-27-pbs-pbs-average-daily-block-time.md
?? docs/superpowers/specs/2026-05-27-pbs-pairing-average-daily-block-time-design.md
?? docs/superpowers/specs/2026-05-27-pbs-pairing-default-tier-single-selection-design.md
?? docs/test-cases/pbs/pairing/2026-05-27-average-daily-block-time.md
```

### unstaged changed files

```text
docs/dev-context/LATEST.md
packages/contracts/pbs-pairing-bids.js
pbs-portal/src/features/pairing/mock.ts
pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
pbs-portal/src/features/pairing/pairing-draft-mappers.ts
pbs-portal/src/features/pairing/pairing-property-catalog.test.ts
pbs-server/src/routes/pairing-bids.test.ts
pbs-server/src/routes/pairing-bids.ts
pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts
pbs-server/src/services/pairing-search/pairing-search-condition-builder.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-05-27-pbs-pbs-pairing-default-tier-single-selection.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
