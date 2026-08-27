# 开发上下文（2026-07-26）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-26 00:41:38 EDT
- Wing：`engines`
- Topic：`rule-7505-unified-structured-scope`
- Title：rule-7505-unified-structured-scope
- Git branch：`main`

## 本轮对话上下文

本轮继续 2026-07-25 rule 7505 unified structured scope plan，并完成实现：

目标：7505 Bases/Ranks/Fleets/Crew Teams applicability 由共享 Rust 7505 scope helper 处理，Live/Scenario CLI、diagnostic harness、PBS PyO3 Engine 复用同一 Rust semantics；不改变 days-off counting kernel。

主要改动：
- rule-engine-rs/src/lib.rs 新增 DaysOffScope、CrewScope7505、ScopedDaysOffRow、Parsed7505Input、scope_matches_7505、filter_days_off_rows_for_crew、parse_check_7505_input。
- check-7505 CLI 支持 structured R/Q/T/A，同时保留 legacy 12-column R wildcard scope 输入。
- 修复 Q/T effective/expiry 单位：输入为 day ordinal，parser 转换为 epoch seconds 后交给 shared helper；exp=-1 表示 open-ended。
- live-server/scripts/legality-recheck-core.mjs 的 rule7505 不再 JS 侧过滤 B/R/F/team；改为发 structured R/Q/T/A 到 check-7505。保留缺少 source.crewQualEntries/source.crewTeams 时 warn/skip row 行为。
- live-server/scripts/check-7505-gdo.mjs 输出 structured R，并可按 crew 注入 Q/T scope lines。
- rule-engine-rs/py/src/lib.rs 的 PBS PyO3 7505 path 不再自实现 B/R/F/team matching；改为构造 CrewScope7505 并调用 filter_days_off_rows_for_crew。保留缺少 crew-team context 时非 wildcard team row 抛 ValueError 的既有行为。
- pbs-engine 未产生文件改动；现有 parser 已保存 7505 scope tuple。

重要测试/验证：
- cargo test --manifest-path rule-engine-rs/Cargo.toml parse_check_7505_qualification_days -- --nocapture PASS，覆盖 day ordinal Q/T 能匹配 epoch-second RP window。
- cargo test --manifest-path rule-engine-rs/Cargo.toml rule_7505 -- --nocapture PASS。
- cargo build --release --manifest-path rule-engine-rs/Cargo.toml PASS（全量 release binaries，避免 live tests stale guard）。
- maturin develop --manifest-path rule-engine-rs/py/Cargo.toml PASS（需要 escalated，安装到 /home/qianggong/.venv；仍有既有 duty_idx dead-code warning）。
- node live-server/scripts/__tests__/legality-recheck-core.test.mjs PASS：47 passed。
- npm --prefix live-server test -- scripts/__tests__/check-7505-gdo.test.mjs src/__tests__/services/scenario-seed-legality-source.test.ts tests/unit/legality-recheck-core-param.spec.ts --run PASS：25 passed。
- /home/qianggong/.venv/bin/pytest rule-engine-rs/py/tests/test_engine_phase2_7505.py -q PASS：14 passed。
- PYTHONPATH=pbs-engine /home/qianggong/.venv/bin/pytest pbs-engine/tests/unit/test_rust_checker_rule_1001_params.py -q PASS：10 passed。
- node --check live-server/scripts/legality-recheck-core.mjs, live-legality.mjs, scenario-legality.mjs, scenario-legality-source.mjs, check-7505-gdo.mjs PASS。
- git diff --check, git -C rule-engine-rs diff --check, git -C pbs-engine diff --check PASS.

Current worktree:
- root main ahead origin/main by 1 pre-existing docs commit.
- root modified: live-server/scripts/__tests__/check-7505-gdo.test.mjs, live-server/scripts/__tests__/legality-recheck-core.test.mjs, live-server/scripts/check-7505-gdo.mjs, live-server/scripts/legality-recheck-core.mjs, submodule rule-engine-rs.
- rule-engine-rs modified: py/src/lib.rs, src/bin/check_7505.rs, src/lib.rs, src/rules/rule7505.rs, tests/rule_7505_tests.rs.
- pbs-engine clean.

Caveats:
- GitNexus MCP tools were unavailable in Codex; impact/detect_changes were approximated with rg, git diff/status, and tests.

## 当前工作树快照

### git status --short

```text
 M live-server/scripts/__tests__/check-7505-gdo.test.mjs
 M live-server/scripts/__tests__/legality-recheck-core.test.mjs
 M live-server/scripts/check-7505-gdo.mjs
 M live-server/scripts/legality-recheck-core.mjs
 m rule-engine-rs
```

### unstaged changed files

```text
live-server/scripts/__tests__/check-7505-gdo.test.mjs
live-server/scripts/__tests__/legality-recheck-core.test.mjs
live-server/scripts/check-7505-gdo.mjs
live-server/scripts/legality-recheck-core.mjs
rule-engine-rs
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-07-26-engines-rule-7505-unified-structured-scope.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh engines
git status --short
```
