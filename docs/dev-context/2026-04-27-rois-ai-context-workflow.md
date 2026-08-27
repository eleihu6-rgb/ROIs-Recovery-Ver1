# 开发上下文（2026-04-27）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-04-27 13:52:48 CST
- Wing：`rois-ai`
- Topic：`context-workflow`
- Title：context-workflow
- Git branch：`main`

## 本轮对话上下文

本轮继续调整根目录上下文恢复工具。

用户指出：新开对话窗口时，只需要让新 AI 了解之前的项目记忆、对话上下文和已经开发过的功能，不应该默认跑 verify、做 diff 分析或开始改代码。新窗口打开通常意味着前一轮功能已经完成，第一步应该是恢复上下文，而不是立即验证或实现。

已调整：
- `NEXT_CONTEXT.md` 改为“只读恢复上下文入口”。新窗口推荐提示变为：`先读 /Users/lei/Codehub/rois-ai/NEXT_CONTEXT.md，恢复项目和上次对话上下文。先不要改代码。`
- `NEXT_CONTEXT.md` 明确恢复阶段不默认运行 `verify`、`build`、`test`、lint、数据库脚本，不默认做大范围 diff 分析，不默认创建/编辑/提交/回滚文件。
- `NEXT_CONTEXT.md` 要求新 AI 读完后先总结项目状态、最近上下文和是否需要继续读取模块文件，等待用户给出下一步任务。
- `git status --short` 被移动到“准备真正改代码前再看”，不作为新窗口刚打开的强制第一步。
- `docs/dev-context/README.md` 同步说明：新窗口恢复阶段只读，不默认验证和改代码。
- `save-context.sh` 输出的新窗口提示也改成只读恢复语义，避免以后误导。

仍保留：
- 大任务结束时由 AI 根据本轮对话使用 `./save-context.sh <wing> <topic>` 保存开发上下文，并自动写入 `docs/dev-context` 与 MemPalace。
- 小任务无需保存上下文，避免记忆噪音。

验证：
- 本条上下文通过 `./save-context.sh rois-ai context-workflow` 保存并挖入 memory。

## 当前工作树快照

### git status --short

```text
 M AGENTS.md
A  docs/superpowers/specs/2026-04-24-pbs-pairing-add-delete-api-performance-design.md
A  docs/superpowers/specs/2026-04-24-pbs-pairing-add-delete-persist-before-unlock-design.md
A  docs/superpowers/specs/2026-04-24-pbs-pairing-concurrency-property-identity-design.md
A  docs/superpowers/specs/2026-04-24-pbs-pairing-search-add-and-favorite-unified-optimization-design.md
A  docs/superpowers/specs/2026-04-24-pbs-search-criteria-inline-actions-design.md
A  docs/superpowers/specs/2026-04-24-pbs-search-pairings-heading-structure-design.md
A  docs/superpowers/specs/2026-04-24-pbs-search-results-local-loading-design.md
A  docs/superpowers/specs/2026-04-24-pbs-stable-identity-and-constraints-roadmap-design.md
M  packages/contracts/pbs-calendar-days-off.d.ts
M  packages/contracts/pbs-days-off-bids.d.ts
M  packages/contracts/pbs-line-bids.d.ts
M  packages/contracts/pbs-lineholder-summary.d.ts
M  packages/contracts/pbs-pairing-bids.d.ts
M  packages/contracts/pbs-pairing-bids.js
M  pbs-portal/AGENTS.md
M  pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
M  pbs-portal/src/app/router/app-routes.test.tsx
M  pbs-portal/src/features/dashboard/calendar-days-off-mappers.test.ts
M  pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
M  pbs-portal/src/features/dashboard/pages/dashboard-page.test.tsx
M  pbs-portal/src/features/days-off/mock.ts
M  pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
M  pbs-portal/src/features/days-off/pages/days-off-page.tsx
M  pbs-portal/src/features/layer/layer-draft-mappers.test.ts
M  pbs-portal/src/features/line/mock.ts
M  pbs-portal/src/features/line/pages/line-page.test.tsx
M  pbs-portal/src/features/line/pages/line-page.tsx
M  pbs-portal/src/features/pairing/components/pairing-right-panel.tsx
M  pbs-portal/src/features/pairing/components/pairing-search-panel.module.css
M  pbs-portal/src/features/pairing/components/pairing-search-panel.tsx
M  pbs-portal/src/features/pairing/mock.ts
M  pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
M  pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
M  pbs-portal/src/features/pairing/pages/search-pairings-page.tsx
M  pbs-portal/src/features/pairing/pairing-draft-mappers.ts
M  pbs-portal/src/features/pairing/types.ts
M  pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx
M  pbs-portal/src/features/rule-bids/rule-bid-draft-mappers.ts
M  pbs-portal/src/features/rule-bids/types.ts
M  pbs-portal/src/shared/services/calendar-days-off-service.ts
M  pbs-portal/src/shared/services/days-off-service.ts
M  pbs-portal/src/shared/services/line-service.ts
M  pbs-portal/src/shared/services/pairing-service.ts
M  pbs-server/AGENTS.md
M  pbs-server/src/app.test.ts
M  pbs-server/src/models/index.ts
A  pbs-server/src/models/pbs/pbs-award-item.ts
A  pbs-server/src/models/pbs/pbs-award-result.ts
M  pbs-server/src/models/pbs/pbs-bid-condition.ts
M  pbs-server/src/models/pbs/pbs-bid-group.ts
M  pbs-server/src/models/pbs/pbs-bid-pairing-favorite.ts
M  pbs-server/src/models/pbs/pbs-bid.ts
M  pbs-server/src/routes/calendar-days-off.test.ts
M  pbs-server/src/routes/calendar-days-off.ts
M  pbs-server/src/routes/days-off-bids.test.ts
M  pbs-server/src/routes/days-off-bids.ts
M  pbs-server/src/routes/line-bids.test.ts
M  pbs-server/src/routes/line-bids.ts
M  pbs-server/src/routes/lineholder-summary.test.ts
M  pbs-server/src/routes/pairing-bids.test.ts
M  pbs-server/src/routes/pairing-bids.ts
M  pbs-server/src/services/calendar/calendar-days-off-service.ts
M  pbs-server/src/services/days-off/days-off-bid-service.ts
M  pbs-server/src/services/line/line-bid-service.ts
M  pbs-server/src/services/lineholder/lineholder-summary-service.ts
M  pbs-server/src/services/lineholder/shared.ts
M  pbs-server/src/services/pairing/pairing-bid-service.ts
M  pbs-server/src/services/pairing/types.ts
A  sql/migration/2026-04-24-add-pbs-bid-group-property-key.sql
A  sql/migration/2026-04-24-add-pbs-pairing-favorite-property-id.sql
A  sql/migration/2026-04-27-add-pbs-award-item-stable-match.sql
A  sql/migration/2026-04-27-add-pbs-bid-draft-version.sql
A  sql/migration/2026-04-27-add-pbs-bid-property-definition-id.sql
A  sql/migration/2026-04-27-cleanup-pbs-legacy-identity.sql
M  sql/schema/03-pbs_pg.sql
?? NEXT_CONTEXT.md
?? docs/dev-context/
?? docs/handoff/pbs/pbs-dev-handoff-2026-04-27.md
?? docs/handoff/pbs/pbs-dev-handoff-2026-04-27-portal-brief.md
?? save-context.sh
```

### unstaged changed files

```text
AGENTS.md
```

### staged files

```text
docs/superpowers/specs/2026-04-24-pbs-pairing-add-delete-api-performance-design.md
docs/superpowers/specs/2026-04-24-pbs-pairing-add-delete-persist-before-unlock-design.md
docs/superpowers/specs/2026-04-24-pbs-pairing-concurrency-property-identity-design.md
docs/superpowers/specs/2026-04-24-pbs-pairing-search-add-and-favorite-unified-optimization-design.md
docs/superpowers/specs/2026-04-24-pbs-search-criteria-inline-actions-design.md
docs/superpowers/specs/2026-04-24-pbs-search-pairings-heading-structure-design.md
docs/superpowers/specs/2026-04-24-pbs-search-results-local-loading-design.md
docs/superpowers/specs/2026-04-24-pbs-stable-identity-and-constraints-roadmap-design.md
packages/contracts/pbs-calendar-days-off.d.ts
packages/contracts/pbs-days-off-bids.d.ts
packages/contracts/pbs-line-bids.d.ts
packages/contracts/pbs-lineholder-summary.d.ts
packages/contracts/pbs-pairing-bids.d.ts
packages/contracts/pbs-pairing-bids.js
pbs-portal/AGENTS.md
pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
pbs-portal/src/app/router/app-routes.test.tsx
pbs-portal/src/features/dashboard/calendar-days-off-mappers.test.ts
pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
pbs-portal/src/features/dashboard/pages/dashboard-page.test.tsx
pbs-portal/src/features/days-off/mock.ts
pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
pbs-portal/src/features/days-off/pages/days-off-page.tsx
pbs-portal/src/features/layer/layer-draft-mappers.test.ts
pbs-portal/src/features/line/mock.ts
pbs-portal/src/features/line/pages/line-page.test.tsx
pbs-portal/src/features/line/pages/line-page.tsx
pbs-portal/src/features/pairing/components/pairing-right-panel.tsx
pbs-portal/src/features/pairing/components/pairing-search-panel.module.css
pbs-portal/src/features/pairing/components/pairing-search-panel.tsx
pbs-portal/src/features/pairing/mock.ts
pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
pbs-portal/src/features/pairing/pages/search-pairings-page.tsx
pbs-portal/src/features/pairing/pairing-draft-mappers.ts
pbs-portal/src/features/pairing/types.ts
pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx
pbs-portal/src/features/rule-bids/rule-bid-draft-mappers.ts
pbs-portal/src/features/rule-bids/types.ts
pbs-portal/src/shared/services/calendar-days-off-service.ts
pbs-portal/src/shared/services/days-off-service.ts
pbs-portal/src/shared/services/line-service.ts
pbs-portal/src/shared/services/pairing-service.ts
pbs-server/AGENTS.md
pbs-server/src/app.test.ts
pbs-server/src/models/index.ts
pbs-server/src/models/pbs/pbs-award-item.ts
pbs-server/src/models/pbs/pbs-award-result.ts
pbs-server/src/models/pbs/pbs-bid-condition.ts
pbs-server/src/models/pbs/pbs-bid-group.ts
pbs-server/src/models/pbs/pbs-bid-pairing-favorite.ts
pbs-server/src/models/pbs/pbs-bid.ts
pbs-server/src/routes/calendar-days-off.test.ts
pbs-server/src/routes/calendar-days-off.ts
pbs-server/src/routes/days-off-bids.test.ts
pbs-server/src/routes/days-off-bids.ts
pbs-server/src/routes/line-bids.test.ts
pbs-server/src/routes/line-bids.ts
pbs-server/src/routes/lineholder-summary.test.ts
pbs-server/src/routes/pairing-bids.test.ts
pbs-server/src/routes/pairing-bids.ts
pbs-server/src/services/calendar/calendar-days-off-service.ts
pbs-server/src/services/days-off/days-off-bid-service.ts
pbs-server/src/services/line/line-bid-service.ts
pbs-server/src/services/lineholder/lineholder-summary-service.ts
pbs-server/src/services/lineholder/shared.ts
pbs-server/src/services/pairing/pairing-bid-service.ts
pbs-server/src/services/pairing/types.ts
sql/migration/2026-04-24-add-pbs-bid-group-property-key.sql
sql/migration/2026-04-24-add-pbs-pairing-favorite-property-id.sql
sql/migration/2026-04-27-add-pbs-award-item-stable-match.sql
sql/migration/2026-04-27-add-pbs-bid-draft-version.sql
sql/migration/2026-04-27-add-pbs-bid-property-definition-id.sql
sql/migration/2026-04-27-cleanup-pbs-legacy-identity.sql
sql/schema/03-pbs_pg.sql
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-04-27-rois-ai-context-workflow.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh rois-ai
git status --short
```
