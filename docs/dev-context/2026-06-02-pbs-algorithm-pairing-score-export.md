# 开发上下文（2026-06-02）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-06-02 16:24:22 CST
- Wing：`pbs`
- Topic：`algorithm-pairing-score-export`
- Title：algorithm-pairing-score-export
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS Algorithm Export Pairing Score 对接：
- 设计文档：docs/superpowers/specs/2026-06-02-pbs-algorithm-pairing-score-export-design.md 已更新为确认状态。
- 新增导出文件 PAIRING_SCORE.csv，加入 /api/admin/algorithm-export 返回的 tgz 包，保留 DAYSOFF.csv 原行为。
- Pairing Score 行粒度为 Crew_ID + Pairing_ID，只输出命中行，不输出全量 0 counter 行。
- Pairing_ID 使用 live pairing.id，Interface_ID 使用 live pairing.interface_id。
- 每条 Pairing bid property 复用 Search Pairings 的 buildPreviewCondition 做正向匹配；avoid 不反向搜索，而是把命中的 pairing 计入 Avoid counter。
- 同一 crew/pairing/tier/action 多次命中 counter 累加；T8+ 忽略。
- pairing-occurrence-list 按 occurrence 明细查询，多个 occurrence 命中同一 pairing 会多次累加。
- 不支持搜索或无法构造条件的 Pairing property 跳过，并通过 server log 记录 crew/period/propertyCode/propertyGroupKey/reason，不让整体导出失败。
- 主要代码：pbs-server/src/services/algorithm-export/pairing-score-export.ts、algorithm-export-service.ts、app.ts。
- 自动化测试：新增 pbs-server/src/services/algorithm-export/pairing-score-export.test.ts。
- QA 测试案例：docs/test-cases/pbs/algorithm-export/2026-06-02-pairing-score-export.md。
- 已通过：pnpm --filter pbs-server exec tsc --noEmit。
- 已通过：DATABASE_URL=postgresql://test:test@localhost:5432/rois PBS_SCHEMA=f8_pbs JWT_SECRET=test-secret CORS_ORIGIN=http://localhost:3030 node --import tsx --test src/services/algorithm-export/pairing-score-export.test.ts src/services/algorithm-export/days-off-export.test.ts src/routes/algorithm-export.test.ts。
- 已通过：同 env 下 node --import tsx --test "src/**/*.test.ts"，结果 360 pass。

## 当前工作树快照

### git status --short

```text
 M docs/superpowers/specs/2026-06-02-pbs-algorithm-pairing-score-export-design.md
 M pbs-server/src/app.ts
 M pbs-server/src/services/algorithm-export/algorithm-export-service.ts
?? docs/test-cases/pbs/algorithm-export/2026-06-02-pairing-score-export.md
?? pbs-server/src/services/algorithm-export/pairing-score-export.test.ts
?? pbs-server/src/services/algorithm-export/pairing-score-export.ts
```

### unstaged changed files

```text
docs/superpowers/specs/2026-06-02-pbs-algorithm-pairing-score-export-design.md
pbs-server/src/app.ts
pbs-server/src/services/algorithm-export/algorithm-export-service.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-06-02-pbs-algorithm-pairing-score-export.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
