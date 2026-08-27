# 开发上下文（2026-06-11）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-06-11 17:19:03 CST
- Wing：`pbs`
- Topic：`pairing-property-pool-counts`
- Title：pairing-property-pool-counts
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS Pairing Property Pool Counts 设计与实现。

需求结论：
- /fpqe/pbs/pairing 的 EXISTING PAIRING PROPERTIES 增加当前 active Tier 的任务环统计诊断。
- 每条 active property 显示 Rule count（单条规则独立命中）和 Funnel count（从第一条到当前行累计漏斗）。
- 顶部显示 All rules 总过滤结果。
- 使用后端批量 count API，一次请求返回完整统计快照，不在前端多次调用 preview 拼装。
- 切换 active Tier / Tx 时自动计算切换后的当前 Tier；Refresh 按钮保留，用于手动重算。
- 不把 T1-T7 混成一个大查询，不把 counts 当最终 Award。

主要代码改动：
- packages/contracts/pbs-search-pairings.* 新增 currentRulesCounts route 和 PbsPairingCurrentRulesCounts request/response types。
- pbs-server 新增 POST /pairing-search/current-rules/counts route，service 增加 countCurrentRules。
- pbs-server/src/services/pairing-search/pairing-search-preview-query.ts 新增 executePreviewCountQueries，使用轻量 count 查询，不加载 pairing card detail/segments。
- pbs-portal pairingService 新增 countCurrentRules。
- pbs-portal PairingRightPanel 顶部增加当前 Tier counts summary 和 REFRESH 按钮；Existing property row 下方展示 Rule/Funnel。
- 切换 active Tier 自动刷新 counts，快速切换通过 request seq 避免旧响应覆盖。
- 新增/编辑/删除/tier toggle 保存成功后标记 counts stale，避免展示过期数字。

新增/更新文档：
- docs/superpowers/specs/2026-06-11-pbs-pairing-property-pool-counts-design.md
- docs/test-cases/pbs/pairing/2026-06-11-pairing-property-pool-counts.md

验证结果：
- git diff --check：通过。
- pbs-server targeted tests：31 tests 通过。
- pbs-server npm run build：通过。
- pbs-portal targeted tests：54 tests 通过。
- pbs-portal npm run lint：通过，仅既有 Fast Refresh warnings。
- pbs-portal npm run build：通过，仅既有 chunk size warning。
- npm run verify:pbs：pbs-server 全量测试 390 tests 通过，pbs-server build 通过；在 pbs-server sync:pbs-users -- --dry-run 阶段失败，错误为本地数据库 password authentication failed for user "f8_pbs"，属于本地凭据/环境问题，不是本轮代码测试失败。

注意事项：
- 工作树中 docs/dev-context/LATEST.md 和 docs/dev-context/2026-06-11-pbs-pairing-calendar-and-search-business-context.md 在本轮开始前已经是未提交/未跟踪状态；本轮 save-context 会更新 LATEST 并新增本 topic dev-context。
- 不要回退用户已有未提交上下文文件。

## 当前工作树快照

### git status --short

```text
 M docs/dev-context/LATEST.md
 M packages/contracts/pbs-search-pairings.d.ts
 M packages/contracts/pbs-search-pairings.js
 M pbs-portal/src/features/pairing/components/pairing-property-table.tsx
 M pbs-portal/src/features/pairing/components/pairing-right-panel.tsx
 M pbs-portal/src/features/pairing/pages/pairing-page.test-utils.tsx
 M pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
 M pbs-portal/src/shared/services/pairing-service.test.ts
 M pbs-portal/src/shared/services/pairing-service.ts
 M pbs-server/src/app.ts
 M pbs-server/src/routes/pairing-search.test.ts
 M pbs-server/src/routes/pairing-search.ts
 M pbs-server/src/services/pairing-search/pairing-search-preview-query.ts
 M pbs-server/src/services/pairing-search/pairing-search-service.test.ts
 M pbs-server/src/services/pairing-search/pairing-search-service.ts
 M pbs-server/src/services/pairing-search/types.ts
?? docs/dev-context/2026-06-11-pbs-pairing-calendar-and-search-business-context.md
?? docs/superpowers/specs/2026-06-11-pbs-pairing-property-pool-counts-design.md
?? docs/test-cases/pbs/pairing/2026-06-11-pairing-property-pool-counts.md
```

### unstaged changed files

```text
docs/dev-context/LATEST.md
packages/contracts/pbs-search-pairings.d.ts
packages/contracts/pbs-search-pairings.js
pbs-portal/src/features/pairing/components/pairing-property-table.tsx
pbs-portal/src/features/pairing/components/pairing-right-panel.tsx
pbs-portal/src/features/pairing/pages/pairing-page.test-utils.tsx
pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
pbs-portal/src/shared/services/pairing-service.test.ts
pbs-portal/src/shared/services/pairing-service.ts
pbs-server/src/app.ts
pbs-server/src/routes/pairing-search.test.ts
pbs-server/src/routes/pairing-search.ts
pbs-server/src/services/pairing-search/pairing-search-preview-query.ts
pbs-server/src/services/pairing-search/pairing-search-service.test.ts
pbs-server/src/services/pairing-search/pairing-search-service.ts
pbs-server/src/services/pairing-search/types.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-06-11-pbs-pairing-property-pool-counts.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
