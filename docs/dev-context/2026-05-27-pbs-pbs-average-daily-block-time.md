# 开发上下文（2026-05-27）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-27 10:55:13 CST
- Wing：`pbs`
- Topic：`pbs-average-daily-block-time`
- Title：pbs-average-daily-block-time
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS Pairing propertyCode=121 Average Daily Block Time 的对齐与实现。

关键结论：
- 121 的旧库口径确认是 credit/duration 型条件，不是文本框。
- 121 只允许 < / >，不允许 =、Between、Any/Every。
- 语义按“总 block time / pairing 天数”实现。
- 分子使用 pairing_segment 关联 flight.blk_min 汇总，分母使用 p.duration_days，并以 greatest(coalesce(p.duration_days, 1), 1) 防止除零。
- 旧 text payload 不再兼容，后端校验直接拒绝。

已完成改动：
- packages/contracts/pbs-pairing-bids.js：121 defaultBid 改成 duration + operator ">"，supportedOperators 仅保留 < / >。
- pbs-server/routes/pairing-bids.ts：补 121 的入参校验与错误文案。
- pbs-server/services/pairing-search/pairing-search-condition-builder.ts：补 121 的 SQL preview 生成。
- pbs-portal/mock.ts：补 121 测试数据，便于页面测试进入配置弹窗。
- 补充了 server / portal 单测与页面回归测试。
- 新增 QA 测试文档：docs/test-cases/pbs/pairing/2026-05-27-average-daily-block-time.md。

验证结果：
- git diff --check 通过。
- npm --prefix pbs-server test -- pairing-search-condition-builder pairing-bids 通过。
- npm --prefix pbs-server run build 通过。
- npm --prefix pbs-portal test -- pairing-property-catalog pairing-bid-control pairing-bid-control-logic pairing-page 通过。
- npm --prefix pbs-portal run build 通过。
- npm --prefix pbs-portal run lint 通过。

## 当前工作树快照

### git status --short

```text
 M packages/contracts/pbs-pairing-bids.js
 M pbs-portal/src/features/pairing/mock.ts
 M pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
 M pbs-portal/src/features/pairing/pairing-property-catalog.test.ts
 M pbs-portal/tsconfig.tsbuildinfo
 M pbs-server/src/routes/pairing-bids.test.ts
 M pbs-server/src/routes/pairing-bids.ts
 M pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts
 M pbs-server/src/services/pairing-search/pairing-search-condition-builder.ts
?? docs/superpowers/specs/2026-05-27-pbs-pairing-average-daily-block-time-design.md
?? docs/test-cases/pbs/pairing/2026-05-27-average-daily-block-time.md
```

### unstaged changed files

```text
packages/contracts/pbs-pairing-bids.js
pbs-portal/src/features/pairing/mock.ts
pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
pbs-portal/src/features/pairing/pairing-property-catalog.test.ts
pbs-portal/tsconfig.tsbuildinfo
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
2. 本文件：`docs/dev-context/2026-05-27-pbs-pbs-average-daily-block-time.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
