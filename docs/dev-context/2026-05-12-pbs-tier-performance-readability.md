# 开发上下文（2026-05-12）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-12 09:52:35 CST
- Wing：`pbs`
- Topic：`tier-performance-readability`
- Title：PBS Tier 性能与可读性修正
- Git branch：`main`

## 本轮对话上下文

本轮继续 PBS Tier 功能开发中的性能与可读性收尾。

用户关注点：
- `/api/pairing-bids/current` 首次调用接近 5 秒，担心 Tier 后续开发走偏、重复请求、可读性变差。
- Tier 的 `View Pairing Set` 应优先复用 Pairing 已有数据/缓存，不要在 Tier 内自己维护一份隐式缓存导致重复打慢接口。
- 算法不属于 PBS 前端/后端当前职责；PBS 只保存、校验、预览规则，后续算法通过接口读取规则并返回最终结果。

本轮确认并实现：
- 前端 Tier Pairing Set Preview 改为使用全局 TanStack Query 缓存 `pairingPageDataQueryKey`，通过 `queryClient.fetchQuery` 复用 Pairing 页数据；已有缓存时不会再调用 `pairingService.getPageData()`。
- 新增 Tier 单测覆盖：已存在 Pairing page data 缓存时，点击 `View Pairing Set for T1` 不重复请求 `getPageData`，仍调用 `previewCurrentRules` 生成预览。
- 后端慢请求日志从只覆盖 mutation 扩展为覆盖所有 `/api/` 超 2 秒请求，日志名为 `Slow PBS API request`，便于观察慢 GET。
- PostgreSQL pool 增加 `min: 1` 以降低空闲后首个请求的连接冷启动尖刺；同时补上 `pool.on("error")`，避免远端关闭 idle client 时 Node 因未监听 Pool error 崩溃。
- 将 `lineholder-summary-service.ts` 内部 diagnostics 逻辑拆到 `lineholder-summary-diagnostics.ts`，summary service 更聚焦数据读取/组装。
- 新增/保留 spec：`docs/superpowers/specs/2026-05-12-pbs-tier-performance-readability-design.md`。
- 新增 QA：`docs/test-cases/pbs/tier/2026-05-12-tier-performance-cache-regression.md`。

验证结果：
- `cd pbs-server && npm test` 通过：176 tests。
- `cd pbs-server && npm run build` 通过。
- 空闲 35 秒后跑 `npm run perf:pbs -- --base-url=http://127.0.0.1:3002 --samples=1 --budget-ms=2000` 通过；关键值：`pairing current draft` 1310.09ms，`lineholder summary` 1429.72ms，所有端点低于 2000ms。
- 根目录 `npm run verify:pbs` 通过：pbs-server test/build/sync dry-run、pbs-portal 280 tests/lint/build 全部通过。

注意事项：
- 曾经出现一次因 `min: 1` 保留 idle PG 连接、远端断开后 Pool 无 error listener 导致 dev server 崩溃；已通过 `pool.on("error")` 修复。
- 本轮没有改 SQL/schema/migration，没有新增依赖。
- 当前 3002 端口已有另一个 `tsx watch` 服务在监听（PID 92324 / 父进程 40051），本轮新开的失败外壳 PID 93402/93431 已清理，没有继续占用端口。

## 当前工作树快照

### git status --short

```text
 M pbs-portal/src/features/tier/components/tier-right-panel.test.tsx
 M pbs-portal/src/features/tier/components/tier-right-panel.tsx
 M pbs-server/src/app.ts
 M pbs-server/src/plugins/database.ts
 M pbs-server/src/services/lineholder/lineholder-summary-service.test.ts
 M pbs-server/src/services/lineholder/lineholder-summary-service.ts
?? docs/superpowers/specs/2026-05-12-pbs-tier-performance-readability-design.md
?? docs/test-cases/pbs/tier/2026-05-12-tier-performance-cache-regression.md
?? pbs-server/src/services/lineholder/lineholder-summary-diagnostics.ts
```

### unstaged changed files

```text
pbs-portal/src/features/tier/components/tier-right-panel.test.tsx
pbs-portal/src/features/tier/components/tier-right-panel.tsx
pbs-server/src/app.ts
pbs-server/src/plugins/database.ts
pbs-server/src/services/lineholder/lineholder-summary-service.test.ts
pbs-server/src/services/lineholder/lineholder-summary-service.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-05-12-pbs-tier-performance-readability.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
