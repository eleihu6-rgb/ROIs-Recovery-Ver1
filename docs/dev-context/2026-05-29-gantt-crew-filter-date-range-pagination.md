# 开发上下文（2026-05-29）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-29 14:05:10 UTC
- Wing：`gantt`
- Topic：`crew-filter-date-range-pagination`
- Title：Gantt Crew Filter 日期范围语义 + 分页修复
- Git branch：`main`

## 本轮对话上下文

本轮完成 Gantt Filter 系统的 Crew 过滤语义和分页 bug 修复：

## 主要改动

### 1. 主题一致性修复
- `filter-dialog.tsx` 和 `multi-select-dropdown.tsx` 全面替换硬编码 hex 颜色为 CSS 变量类（bg-card、bg-muted、bg-background、bg-accent、text-foreground 等），三套主题（Ocean Blue / Dark Pro / Emerald Green）统一生效。

### 2. Crew 过滤语义
- Division 条件：直接过滤 `crew.division` 字段。
- Base / Rank / Fleet 条件：通过 EXISTS 子查询，匹配 Gantt 日期范围内有效的 `crew_base` / `crew_rank` / `crew_fleet` 记录（`eff_dt <= rangeEnd AND (exp_dt IS NULL OR exp_dt >= rangeStart)`）。
- 条件内多选为 OR，条件间为 AND。
- 日期范围取自 `filterStore.dateRange.start/end`，序列化为 YYYY-MM-DD，并 cast 为 `::timestamp`（非 `::date`，匹配列类型）。
- 工具栏 badge 改为显示 Crew 数量（`crewStore.total / unfilteredTotal`），不再显示 Roster 任务数。

### 3. Drizzle sql 模板数组参数 bug 修复
- 根本原因：`` sql`...IN (${filter.bases})...` `` 中 JS 数组被序列化为裸文本 chunk，而非 SQL 参数，导致生成无效 SQL `cb.base IN (YYZ)`（无引号）。
- 修复：改用 `sql.join(items.map(v => sql`${v}`), sql`, `)` 生成正确的参数化 IN 子句 `IN ($1, $2, ...)`。

### 4. LoadMore 分页丢失过滤条件修复
- 现象：P+YYZ 过滤后 116 人，首页加载 100 人，向下滚动加载了不含过滤条件的新 100 人。
- 原因：`fetchCrewsWithFilter` 创建的 session 里 `filters: {}` 为空，`loadMore` 通过 `buildQueryFromFilters(session.filters)` 重建参数时不包含全局过滤条件。
- 修复：在 `CrewStore` 新增 `activeGlobalFilter` 字段，`fetchCrewsWithFilter` 执行成功后写入，`fetchCrews`（无过滤）清空为 null；`loadMore` 和 `applySort` 在构造 API 参数时 spread `activeGlobalFilter`，确保后续分页请求携带相同的过滤参数。

## 涉及文件

| 文件 | 改动 |
|------|------|
| `live-server/src/services/crew/crew-service.ts` | 新增 divisions/bases/ranks/fleets/dateRangeStart/dateRangeEnd 过滤条件 |
| `live-server/src/routes/crew/crew.ts` | 新增对应 Zod schema 字段 + CSV 解析 |
| `gantt/src/types/crew.ts` | CrewListFilters 新增同名字段 |
| `gantt/src/services/crew-api.ts` | buildQueryParams 新增数组序列化 |
| `gantt/src/stores/crew-store.ts` | 新增 fetchCrewsWithFilter + activeGlobalFilter 持久化，loadMore/applySort 携带全局过滤 |
| `gantt/src/components/shell/gantt-sub-toolbar.tsx` | handleFilterApply 回调 + Crew badge |
| `gantt/src/components/layout/filter-dialog.tsx` | 主题 CSS 变量化 |
| `gantt/src/components/common/multi-select-dropdown.tsx` | 主题 CSS 变量化 |

## 不要重复推翻的结论

- Drizzle `sql` 模板不能直接传 JS 数组作参数——必须用 `sql.join(arr.map(v => sql`${v}`), sql`, `)` 或 `inArray(col, arr)`。
- crew_base/crew_rank/crew_fleet 时间范围列类型为 `timestamp`，不能用 `::date` cast。
- `fetchCrewsWithFilter` 创建的 session 故意保持 `filters: {}` 为空（兼容现有 session 结构），全局过滤条件通过独立的 `activeGlobalFilter` 字段传递。

## 当前工作树快照

### git status --short

```text
?? data-migration/scripts/api_samples.json
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
2. 本文件：`docs/dev-context/2026-05-29-gantt-crew-filter-date-range-pagination.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh gantt
git status --short
```
