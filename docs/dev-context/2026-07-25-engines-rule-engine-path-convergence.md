# 开发上下文（2026-07-25）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-25 14:26:44 EDT
- Wing：`engines`
- Topic：`rule-engine-path-convergence`
- Title：rule-engine-path-convergence
- Git branch：`main`

## 本轮对话上下文

本轮完成 rule-engine-rs / PBS PyO3 / Live/Scenario binary 法规路径收敛的正式矩阵与实现推进：

目标：所有当前法规按两步走：共享 Rust semantic core + 各 runtime adapter feeding shared core；不合并 PyO3 和 binary/live 为单体引擎。

正式文档：
- docs/superpowers/specs/2026-07-25-rule-engine-path-convergence-matrix.md
- docs/superpowers/plans/2026-07-25-rule-engine-path-convergence.md
- docs/modules/rule-engine/path-convergence-notes.md

关键实现：
- rule-engine-rs/src/rules/ 下建立共享模块入口：1001, 7272, 7501, 7502, 7503, 7504, 7505, 7506, 8002, 8004, 8030, 8056, 8071, 8072。
- PyO3 和 check-* binaries 改为通过 rules::* 共享命名空间导入相应模型/evaluator/helper。
- 7504 Live/Scenario feeder 已补 structured tagged input，包含 assignment/group/attributes/prelabel/post-rest/qualification/team 等字段；缺少非 wildcard source 数据时 warn/skip。
- PBS rule gate 不再强制 1001；8071/8072 明确保持 Live/Scenario-only，若 PBS RuleSet 启用会进入 unwired_functions 并 warning。
- 8002/7502/7272 credit/standby helper 也挂到共享命名空间，ruletool/check-8002-credit/check-7502/check-7272 复用共享入口。

验证结果：
- maturin develop --manifest-path rule-engine-rs/py/Cargo.toml PASS，安装到 /home/qianggong/.venv。
- cargo build --release --manifest-path rule-engine-rs/Cargo.toml PASS。
- cargo test --manifest-path rule-engine-rs/Cargo.toml PASS。
- /home/qianggong/.venv/bin/pytest rule-engine-rs/py/tests -q PASS：98 passed。
- node live-server/scripts/__tests__/legality-recheck-core.test.mjs PASS：29 passed。
- npm --prefix live-server test -- tests/unit/legality-recheck-core-param.spec.ts --run PASS：16 passed。
- PYTHONPATH=pbs-engine /home/qianggong/.venv/bin/pytest pbs-engine/tests/unit/test_rust_rule_gates.py pbs-engine/tests/unit/test_rust_checker_rule_1001_params.py -q PASS：15 passed。
- git diff --check, git -C rule-engine-rs diff --check, git -C pbs-engine diff --check PASS。

Notes:
- GitNexus MCP tools were unavailable in this Codex session; impact analysis was approximated with rg call/import searches.
- rule-engine-rs has broad pre-existing cumulative diffs from this convergence work; do not assume every changed test/bin line belongs only to the latest task.

## 当前工作树快照

### git status --short

```text
 M live-server/scripts/__tests__/legality-recheck-core.test.mjs
 M live-server/scripts/legality-recheck-core.mjs
 M live-server/scripts/live-legality.mjs
 M live-server/scripts/scenario-legality-source.mjs
 M live-server/scripts/scenario-legality.mjs
 m pbs-engine
 m rule-engine-rs
?? docs/modules/rule-engine/path-convergence-notes.md
?? docs/superpowers/plans/2026-07-25-rule-engine-path-convergence.md
?? docs/superpowers/specs/2026-07-25-rule-engine-path-convergence-matrix.md
```

### unstaged changed files

```text
live-server/scripts/__tests__/legality-recheck-core.test.mjs
live-server/scripts/legality-recheck-core.mjs
live-server/scripts/live-legality.mjs
live-server/scripts/scenario-legality-source.mjs
live-server/scripts/scenario-legality.mjs
pbs-engine
rule-engine-rs
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-07-25-engines-rule-engine-path-convergence.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh engines
git status --short
```
