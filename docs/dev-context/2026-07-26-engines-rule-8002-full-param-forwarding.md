# 开发上下文（2026-07-26）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-26 17:09:41 EDT
- Wing：`engines`
- Topic：`rule-8002-full-param-forwarding`
- Title：rule-8002-full-param-forwarding
- Git branch：`main`

## 本轮对话上下文

Implemented Rule 8002 full parameter forwarding across PBS and Live/Scenario.

Completed changes:
- rule-engine-rs commit edddb8a: PyO3 8002 now converts per-crew crew_teams into open-ended Q/T qualification entries; non-wildcard team rows remain gated when no team data exists.
- pbs-engine commit f2a27ce: parser guard test proves Crew Teams, Unit=RP, inert Prorated, standby, and reduction values remain in cum_rules; parser production code required no change.
- root commits 4ae1a530 and 87125ff9: shared Live/Scenario 8002 core emits Q crew T team rows, P roster-period rows for Unit=RP, reads Prorated as inert metadata, supports ctx.runBin in tests, and skips B/R/F/team/RP gated rows when required source context is unavailable.
- root commit 4dbc3413: Live, normal Scenario, and standalone/seed Scenario sources expose rosterPeriods() using live/f8 roster_period with a 400-day overlap buffer; normal Scenario source receives date context.

Verification from this run:
- cargo build --release --manifest-path rule-engine-rs/Cargo.toml: PASS
- cargo check --bin check-8002-full --manifest-path rule-engine-rs/Cargo.toml: PASS
- cargo check --manifest-path rule-engine-rs/py/Cargo.toml: PASS with existing unused duty_idx warning
- pytest rule-engine-rs/py/tests/test_engine_8002_full_params.py -q: PASS, 1 passed
- PYTHONPATH=pbs-engine pytest ... -k 8002: PASS, 1 passed, 12 deselected
- node live-server/scripts/__tests__/legality-recheck-core.test.mjs: PASS, 51 passed
- npm --prefix live-server test -- tests/unit/legality-recheck-core-param.spec.ts --run: PASS, 20 passed
- node --check live/scenario source scripts: PASS
- git diff --check: PASS

Review notes:
- Task 2 review approved.
- Task 3 first review found missing B/R/F qualification-source guard; fixed in 87125ff9 and re-review approved.
- Task 4 reviewer agent could not start because the team disabled the selected model; manually reviewed the focused diff and syntax checks passed.
- GitNexus CLI/MCP was unavailable in this environment, so required impact/detect_changes calls could not be run.

Pending integration:
- rule-engine-rs main is ahead 1 at edddb8a and pbs-engine main is ahead 1 at f2a27ce; push submodule commits before pushing root.
- Root main is ahead 5 of origin/main and has only the two expected submodule pointer changes before final root commit.

## 当前工作树快照

### git status --short

```text
 M pbs-engine
 M rule-engine-rs
```

### unstaged changed files

```text
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
2. 本文件：`docs/dev-context/2026-07-26-engines-rule-8002-full-param-forwarding.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh engines
git status --short
```
