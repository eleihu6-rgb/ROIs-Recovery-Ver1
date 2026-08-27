# 开发上下文（2026-06-11）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-06-11 14:02:36 CST
- Wing：`pbs`
- Topic：`pairing-calendar-base-date-search`
- Title：pairing-calendar-base-date-search
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS 左侧 BIDDING CALENDAR 点击日期搜索 Pairing occurrence 的 base 时区口径修复。

需求结论：
- 前端点击左侧日历日期时仍只传 originDate 和 periodCode，不传 base/zone。
- 后端 /pairing-search/pairing-occurrences/by-date 使用当前登录 actor 的 crewId/userCode 查 pbs_user.base。
- base 对应 live schema airport.zone_id 后，用该 zone 把 pairing start_utc/end_utc 转成本地日期，再进行 period 过滤、点击日期过滤和返回 originDate/startDate/endDate。
- 若 pbs_user.base 缺失，则 fallback live crew_base 当前主基地；若 zone_id 缺失或不是 pg_timezone_names 中的有效时区名，则 fallback UTC。
- Pairing Search 详情卡片和 mini calendar 的展示口径不在本轮改变，继续沿用 pairing base / duty coverage 规则。

代码改动：
- pbs-server/src/services/pairing-search/pairing-occurrence-query.ts：by-date 查询新增 actor_identity/actor_base/actor_zone CTE，替换原先 at time zone 'UTC' 的点击日期筛选。
- pbs-server/src/services/pairing-search/pairing-search-service.ts 和 types.ts：createPbsPairingSearchService 显式接收 pbsSchema，并把 actor 传入 by-date 查询。
- pbs-server/src/app.ts：创建 pairingSearchService 时传入 env.PBS_SCHEMA。
- pbs-server/src/services/pairing-search/pairing-search-service.test.ts：新增 actor base timezone 和 UTC fallback 覆盖。
- docs/test-cases/pbs/pairing-calendar/2026-06-11-calendar-click-base-date-search.md：新增人工 QA 用例。

验证：
- DATABASE_URL=postgresql://test:test@localhost:5432/rois node --import tsx --test src/services/pairing-search/pairing-search-service.test.ts：通过。
- pbs-server npm run build：通过。
- pbs-server npm test：通过，387 个测试通过。
- git diff --check：通过。

## 当前工作树快照

### git status --short

```text
 M pbs-server/src/app.ts
 M pbs-server/src/services/pairing-search/pairing-occurrence-query.ts
 M pbs-server/src/services/pairing-search/pairing-search-service.test.ts
 M pbs-server/src/services/pairing-search/pairing-search-service.ts
 M pbs-server/src/services/pairing-search/types.ts
?? docs/superpowers/specs/2026-06-11-pbs-pairing-calendar-click-base-date-search-design.md
?? docs/test-cases/pbs/pairing-calendar/
```

### unstaged changed files

```text
pbs-server/src/app.ts
pbs-server/src/services/pairing-search/pairing-occurrence-query.ts
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
2. 本文件：`docs/dev-context/2026-06-11-pbs-pairing-calendar-base-date-search.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
