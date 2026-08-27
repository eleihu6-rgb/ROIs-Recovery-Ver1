# 开发上下文（2026-07-24）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-24 01:46:13 UTC
- Wing：`engines`
- Topic：`ro-input-workset-division-scope`
- Title：ro-input-workset-division-scope
- Git branch：`main`

## 本轮对话上下文

本轮完成 engine-server F8 ro_input division 来源修正：
- 需求：过滤 crew 时不再使用 scenario.filter_params.crew.division，改为 scenario.workset_id -> workset.id -> workset.division。
- 设计文档：docs/superpowers/specs/2026-07-24-engine-ro-input-workset-division-scope.md。
- 代码改动：engine-server/F8/ro_input_builder/context.py 的 get_scenario join workset 并缓存 division；新增 scenario_division helper；scenario_crew_ids、cof_crew_ids、CrewOnFlight 和 scenario_crew_division CLI 均使用 workset division。
- pairing_ids 的 coverage division 仍保留 filter_params.pairing.division 显式旧材料覆盖，否则走 workset division。
- 测试改动：test_ro_input_context.py 新增 fake cursor 回归，证明 stale filter_params.crew.division 被忽略；远端 DB 动态测试期望改为 workset.division；相邻 crew/full assembly 旧 golden/scenario fixture 缺失时 skip。
- 验证：engine-server/.venv/bin/python -m py_compile changed files 通过；source engine-server/.env 后 focused pytest: 5 passed, 22 skipped；git diff --check 通过；GitNexus detect-changes low risk, affected processes 0。
- 注意：工作树里 pbs-engine 修改是本轮前已有改动，本轮未触碰。

## 当前工作树快照

### git status --short

```text
 M engine-server/F8/ro_input_builder/cli.py
 M engine-server/F8/ro_input_builder/context.py
 M engine-server/F8/ro_input_builder/sections/crew.py
 M engine-server/tests/test_ro_input_context.py
 M engine-server/tests/test_ro_input_crew_sections.py
 M engine-server/tests/test_ro_input_full_assembly.py
 M pbs-engine
?? docs/superpowers/specs/2026-07-24-engine-ro-input-workset-division-scope.md
```

### unstaged changed files

```text
engine-server/F8/ro_input_builder/cli.py
engine-server/F8/ro_input_builder/context.py
engine-server/F8/ro_input_builder/sections/crew.py
engine-server/tests/test_ro_input_context.py
engine-server/tests/test_ro_input_crew_sections.py
engine-server/tests/test_ro_input_full_assembly.py
pbs-engine
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-07-24-engines-ro-input-workset-division-scope.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh engines
git status --short
```
