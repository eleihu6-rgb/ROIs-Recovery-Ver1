# 开发上下文（2026-08-23）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-08-23 02:20:23 EDT
- Wing：`gantt`
- Topic：`rule-7509-avoid-co-pairing`
- Title：rule-7509-avoid-co-pairing
- Git branch：`main`

## 本轮对话上下文

Rule 7509 Avoid Co-pairing implementation resumed and verified.

Key E2E root cause and fix:
- Gantt persisted violations use active toolbar group code `103`, not the catalog label `pbs_solver_ruleset`.
- `setDateRange()` cannot model a free-form window because RpMultiSelect auto-restores the current RP when selection is empty.
- Rule 7509 E2E now uses real UI RP selection: add RP06, remove default RP08, Apply, discover a shared physical-flight fixture after progressive roster loading, run scoped recheck with the loaded window, reload Gantt, select RP06 again, then assert Alert Center.
- Fixture/params are temporary and restored in finally.

Fresh verification:
- `cargo test --manifest-path rule-engine-rs/Cargo.toml --test rule_7509_tests`: 8 passed.
- `cargo test --manifest-path rule-engine-rs/Cargo.toml --test engine_check_line`: 5 passed.
- `cargo build --release --manifest-path rule-engine-rs/Cargo.toml`: passed.
- `PYTHONPATH=/tmp/rois-rule-engine-site python3 -m pytest -q rule-engine-rs/py/tests/test_engine_7509.py rule-engine-rs/py/tests/test_engine_8030.py`: 8 passed.
- `node --test live-server/scripts/__tests__/rule-7509.test.mjs live-server/scripts/__tests__/legality-recheck-core.test.mjs`: 2 passed.
- `npx tsc -p tsconfig.json --noEmit` in live-server: passed.
- `npm exec -- tsc -p tsconfig.json --noEmit` in gantt: passed.
- Focused Playwright with `config/precheck.config.ts`, Gantt current source on port 5570 and Live API on 3000: `1 passed (2.1m)`.
- `git diff --check`: passed.

Remote migration/verifier and source-adapter checks were already completed before this continuation per prior handoff: migration/verifier twice, remote F8 SIT data probe, and all Live/Scenario/seed SQL adapters.
No commit or push was made. Preserve unrelated modified submodules/files.

## 当前工作树快照

### git status --short

```text
 M e2e/utils/gantt-hook.ts
 M live-server/scripts/legality-recheck-core.mjs
 M live-server/scripts/live-legality.mjs
 M live-server/scripts/rust-bins.json
 M live-server/scripts/scenario-legality-source.mjs
 M live-server/scripts/scenario-legality.mjs
 M live-server/src/__tests__/services/rule/legality-recheck.test.ts
 M live-server/src/services/rule/legality-recheck.ts
 m pbs-engine
 m rule-engine-rs
 M sql/seed/07-rule.sql
?? docs/superpowers/plans/2026-08-23-rule-7509-avoid-co-pairing.md
?? docs/superpowers/specs/2026-08-23-rule-7509-avoid-co-pairing-design.md
?? e2e/tests/gantt/rule-7509-avoid-co-pairing.spec.ts
?? live-server/scripts/__tests__/rule-7509.test.mjs
?? sql/migration/2026-08-23-rule-7509-add-f8-ruleset.sql
?? sql/migration/verify/2026-08-23-rule-7509-add-f8-ruleset-verify.sql
```

### unstaged changed files

```text
e2e/utils/gantt-hook.ts
live-server/scripts/legality-recheck-core.mjs
live-server/scripts/live-legality.mjs
live-server/scripts/rust-bins.json
live-server/scripts/scenario-legality-source.mjs
live-server/scripts/scenario-legality.mjs
live-server/src/__tests__/services/rule/legality-recheck.test.ts
live-server/src/services/rule/legality-recheck.ts
pbs-engine
rule-engine-rs
sql/seed/07-rule.sql
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-08-23-gantt-rule-7509-avoid-co-pairing.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh gantt
git status --short
```
