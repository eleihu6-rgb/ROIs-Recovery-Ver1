# 开发上下文（2026-06-09）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-06-09 15:50:01 CST
- Wing：`pbs`
- Topic：`pairing-credit-priority-and-preview-query-source`
- Title：pairing-credit-priority-and-preview-query-source
- Git branch：`main`

## 本轮对话上下文

本轮 PBS Pairing 相关上下文保存：

已完成并验证的主线：
- Pairing credit priority 显式 Higher / Lower 选择已完成，默认不选，不根据 > / < / Between 推断。
- 四种导出映射固定为：Award+Higher -> Award_Higher_Credit_Tiers；Award+Lower -> Avoid_Higher_Credit_Tiers；Avoid+Higher -> Avoid_Higher_Credit_Tiers；Avoid+Lower -> Award_Higher_Credit_Tiers。
- PAIRING_SCORE.csv / RESERVE_SCORE.csv 已包含 Award_Higher_Credit_Tiers 和 Avoid_Higher_Credit_Tiers；Reserve UI 当前未暴露 Higher / Lower 时默认 []。
- 后端用 pbs_bid_group.preference_json 保存算法偏好元数据，不占用 param_c。
- 已新增 migration 并同步 sql/schema/03-pbs_pg.sql；当前 f8_pbs schema 已应用 preference_json jsonb 字段。
- 已补 spec、QA 手工测试文档、自动化测试。验证通过：pbs-portal tsc -b；PairingPage 46 tests；pbs-server tsc --noEmit；后端指定 4 个 test 文件共 89 tests；git diff --check；浏览器 Pairing 页面可加载。

刚确认的新问题：Pairing 页面小眼睛 preview 查询来源
- 用户问：pairing 点击小眼睛的查询是走数据库还是 Redis。
- 结论：走数据库，不走 Redis。
- 前端小眼睛入口在 pbs-portal/src/features/pairing/components/pairing-right-panel.tsx：
  - existing property preview: handleExistingPreview -> navigate('/pairing/search', state)
  - available/favorite preview: handleAvailableAction(action === 'preview') -> navigate('/pairing/search', state)
- Search Pairings 页面在 pbs-portal/src/features/pairing/pages/search-pairings-page.tsx 使用 TanStack Query 调 pairingService.previewCurrentRules / previewCriteria。
- pairingService 请求 POST /api/pairing-search/preview，代码在 pbs-portal/src/shared/services/pairing-service.ts。
- 后端 route 在 pbs-server/src/routes/pairing-search.ts，调用 fastify.pairingSearchService.previewPairings。
- 后端 service 在 pbs-server/src/services/pairing-search/pairing-search-service.ts，previewPairings 最终调用 executePreviewQuery。
- executePreviewQuery 在 pbs-server/src/services/pairing-search/pairing-search-preview-query.ts，直接使用 pgPool.query 查询 PostgreSQL。
- 查询主要读取 live schema 的 pairing 和 pairing_segment 表，例如 ${schema}.pairing p、${schema}.pairing_segment s。
- liveSchema 在 pbs-server/src/app.ts 中由 env.PBS_SCHEMA.replace(/_pbs$/i, '') 得到；如果 PBS_SCHEMA=f8_pbs，则 preview 查 live schema f8。
- 前端 TanStack Query 有 60 秒 staleTime 的浏览器内存缓存 workbenchQueryDefaults，但这不是 Redis；后端 preview 命中服务时仍是 PostgreSQL 查询。

注意：
- pbs-server 模块使用 Node 内置 test runner，不是 Vitest；不要用 pnpm exec vitest 跑 pbs-server 测试。
- 当前工作树仍有本轮改动未提交，包含 docs/dev-context/LATEST.md、credit priority 相关前后端代码、schema/migration/spec/QA 文档等。

## 当前工作树快照

### git status --short

```text
(clean)
```

### unstaged changed files

```text
(none)
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-06-09-pbs-pairing-credit-priority-and-preview-query-source.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
