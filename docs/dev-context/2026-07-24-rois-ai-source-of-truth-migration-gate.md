# 开发上下文（2026-07-24）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-24 02:03:39 UTC
- Wing：`rois-ai`
- Topic：`source-of-truth-migration-gate`
- Title：source-of-truth-migration-gate
- Git branch：`main`

## 本轮对话上下文

本轮补充通用 Source-of-Truth Migration Gate，避免类似 Scenario Division ownership 迁移时只改 UI/live-server 而漏掉 engine-server/pbs/solver 等 downstream consumers：
- 新增长期工程规则文档：docs/architecture/source-of-truth-migration-gate.md。
- 根 CLAUDE.md 只增加一行引用：业务字段 owner/storage/derivation 变化时，实施前必须按 gate 执行。
- 根 AGENTS.md 只增加一行引用：Codex 在编辑 consumers 前必须按 gate 执行。
- gate 的核心要求：全仓搜索旧/新来源；按 UI/API/service/export/import/background/engine-server/pbs-server/solver/callback/result-loader/tests/docs 分层审计；明确旧来源是删除/忽略/迁移/fallback；必须加 old!=new 冲突回归测试；记录未检查 downstream paths。
- 验证：git diff --check 通过。

## 当前工作树快照

### git status --short

```text
 M AGENTS.md
 M CLAUDE.md
 M docs/dev-context/LATEST.md
 M e2e/tests/gantt/roster-publish-dialog.spec.ts
 M engine-server/F8/ro_input_builder/cli.py
 M engine-server/F8/ro_input_builder/context.py
 M engine-server/F8/ro_input_builder/sections/crew.py
 M engine-server/tests/test_ro_input_context.py
 M engine-server/tests/test_ro_input_crew_sections.py
 M engine-server/tests/test_ro_input_full_assembly.py
 M gantt/src/components/common/multi-select-dropdown.tsx
 M gantt/src/components/roster/__tests__/roster-publish-dialog.test.tsx
 M gantt/src/components/roster/roster-publish-dialog.tsx
 M pbs-engine
?? docs/architecture/source-of-truth-migration-gate.md
?? docs/dev-context/2026-07-24-engines-ro-input-workset-division-scope.md
?? docs/superpowers/specs/2026-07-24-engine-ro-input-workset-division-scope.md
?? gantt/src/components/common/__tests__/
```

### unstaged changed files

```text
AGENTS.md
CLAUDE.md
docs/dev-context/LATEST.md
e2e/tests/gantt/roster-publish-dialog.spec.ts
engine-server/F8/ro_input_builder/cli.py
engine-server/F8/ro_input_builder/context.py
engine-server/F8/ro_input_builder/sections/crew.py
engine-server/tests/test_ro_input_context.py
engine-server/tests/test_ro_input_crew_sections.py
engine-server/tests/test_ro_input_full_assembly.py
gantt/src/components/common/multi-select-dropdown.tsx
gantt/src/components/roster/__tests__/roster-publish-dialog.test.tsx
gantt/src/components/roster/roster-publish-dialog.tsx
pbs-engine
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-07-24-rois-ai-source-of-truth-migration-gate.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh rois-ai
git status --short
```
