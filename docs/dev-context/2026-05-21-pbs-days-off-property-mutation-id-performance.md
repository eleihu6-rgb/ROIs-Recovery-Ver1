# 开发上下文（2026-05-21）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-21 10:02:52 CST
- Wing：`pbs`
- Topic：`days-off-property-mutation-id-performance`
- Title：days-off-property-mutation-id-performance
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS Days Off property mutation 稳定身份与性能快路径优化。

用户确认的目标：
- Days Off 新增 / 编辑 / 删除 property 继续使用标准 HTTP 方法，后续 CRUD 必须使用后端返回的稳定 id/key。
- 前端 mutation 不再只传 draftVersion，需要带 draftKey、bidId、periodCode、draftVersion。
- PUT /api/days-off-bids/current/properties/:propertyGroupKey 偶发 4-5s 需要从后端定位和优化，正常关键接口目标 <2s。
- 不改变 AA/旧库语义：Prefer Off 重叠仍允许保存。
- 不恢复旧 calendar-days-off API，不改 Tier/其他模块语义。

本轮代码改动：
- pbs-portal/src/shared/services/days-off-service.ts：POST/PUT/DELETE mutation 统一从 draftMeta 携带 draftKey、bidId、periodCode、draftVersion；仍保持轻量 payload，不发送 name、suggestions、property 整对象或整份 draft。
- pbs-server/src/services/days-off/days-off-bid-service.ts：新增 stable bid id 直接加载 helper；patchCurrentDraftProperty 在有 bidId/draftKey 时不再先 resolve current period，而是按 bidId + crewId + Current 直接定位 bid，再校验 draftVersion；removeCurrentDraftProperty 在稳定 bidId 路径下也避免不必要 current period 推导。
- pbs-server/src/services/days-off/days-off-bid-service.ts + pbs-server/src/app.ts：为 add/patch/remove Days Off property mutation 增加分段 timing logger；慢于 2s 时 warn 输出，正常情况下 debug 级别输出，不记录 crew 敏感信息。
- pbs-server/src/routes/days-off-bids.test.ts：覆盖 POST/PUT/DELETE 接受并透传稳定 draft identity。
- pbs-portal/src/shared/services/days-off-service.test.ts：覆盖 mutation payload / delete query 包含 draftKey、bidId、periodCode、draftVersion，且仍不发送 UI-only 字段。
- docs/superpowers/specs/2026-05-21-pbs-days-off-property-mutation-id-performance-design.md：spec 状态更新为已确认实施。
- docs/test-cases/pbs/days-off/2026-05-20-days-off-simplify-performance-regression.md：补充稳定 draft identity 人工回归检查点。

验证结果：
- pnpm --dir pbs-portal exec vitest run src/shared/services/days-off-service.test.ts：3 passed。
- pnpm --dir pbs-server test -- src/routes/days-off-bids.test.ts：项目脚本实际跑全量 pbs-server 测试，190 passed。
- pnpm --dir pbs-portal exec vitest run：50 files / 319 tests passed。
- pnpm --dir pbs-server build：passed。
- pnpm --dir pbs-portal lint：passed。
- pnpm --dir pbs-server test：190 passed。
- pnpm --dir pbs-portal build：passed，仅既有 Vite index chunk size warning。
- git diff --check：passed。
- pbs-portal/tsconfig.tsbuildinfo 是本轮 build 生成产物，已 git restore 还原。

注意事项：
- 当前工作树已有上一轮 Days Off 左侧日历简化改动的 staged-looking A/M 文件，本轮没有回滚这些改动。
- 如用户继续追踪 4-5s 慢请求，优先看后端日志里的 “Slow PBS days off mutation segment timing”，重点判断慢在 propertyCatalog、loadExistingProperties、validate、writeProperty，还是请求整体排队/连接池。

## 当前工作树快照

### git status --short

```text
A  docs/superpowers/specs/2026-05-20-pbs-days-off-simplify-performance-design.md
AM docs/test-cases/pbs/days-off/2026-05-20-days-off-simplify-performance-regression.md
M  pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
M  pbs-portal/src/app/router/app-routes.test.tsx
A  pbs-portal/src/features/dashboard/calendar-query-invalidations.ts
M  pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
A  pbs-portal/src/features/dashboard/hooks/use-dashboard-calendar-data.ts
A  pbs-portal/src/features/dashboard/hooks/use-days-off-calendar-actions.tsx
A  pbs-portal/src/features/days-off/days-off-calendar-mutation.test.ts
A  pbs-portal/src/features/days-off/days-off-calendar-mutation.ts
 M pbs-portal/src/shared/services/days-off-service.test.ts
 M pbs-portal/src/shared/services/days-off-service.ts
 M pbs-server/src/app.ts
 M pbs-server/src/routes/days-off-bids.test.ts
 M pbs-server/src/services/days-off/days-off-bid-service.ts
?? docs/superpowers/specs/2026-05-21-pbs-days-off-property-mutation-id-performance-design.md
```

### unstaged changed files

```text
docs/test-cases/pbs/days-off/2026-05-20-days-off-simplify-performance-regression.md
pbs-portal/src/shared/services/days-off-service.test.ts
pbs-portal/src/shared/services/days-off-service.ts
pbs-server/src/app.ts
pbs-server/src/routes/days-off-bids.test.ts
pbs-server/src/services/days-off/days-off-bid-service.ts
```

### staged files

```text
docs/superpowers/specs/2026-05-20-pbs-days-off-simplify-performance-design.md
docs/test-cases/pbs/days-off/2026-05-20-days-off-simplify-performance-regression.md
pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
pbs-portal/src/app/router/app-routes.test.tsx
pbs-portal/src/features/dashboard/calendar-query-invalidations.ts
pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
pbs-portal/src/features/dashboard/hooks/use-dashboard-calendar-data.ts
pbs-portal/src/features/dashboard/hooks/use-days-off-calendar-actions.tsx
pbs-portal/src/features/days-off/days-off-calendar-mutation.test.ts
pbs-portal/src/features/days-off/days-off-calendar-mutation.ts
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-05-21-pbs-days-off-property-mutation-id-performance.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
