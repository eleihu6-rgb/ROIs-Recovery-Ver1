# 开发上下文（2026-07-18）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-18 17:26:32 EDT
- Wing：`engines`
- Topic：`rule-8071-rust-legality`
- Title：rule-8071-rust-legality
- Git branch：`main`

## 本轮对话上下文

Completed the full rule 8071 migration implementation in-place on main.

Key outcomes:
- Rust rule-engine-rs now has rule8071 kernel and check-8071 binary, including C++-derived semantics: 17-column parser, Flights=* wildcard, CM calendar-month windows, F/D/R count modes, over-max > Max Times, editor-only under-min when Min Times > 0.
- Added F8 rule 8071/001 migration with default row: *,*,*,*,*,*,*,FLY,*,*,*,*,1,CM,11,0,* and ruleset membership for 103 and 433.
- Added Live/Scenario/seed rosterProperties source accessors and wired rule8071 into legality-recheck-core and scoped dependency mapping.
- Added E2E coverage for 8071 Legality param dialog and Gantt Alert Center display.
- During Task 6 E2E, found and fixed a real check-8071 parser bug: using trim_end() stripped trailing blank TSV Position columns and skipped F8 rows. Fixed by preserving trailing tabs and only stripping CR; added Rust CLI regression.

Important commits:
- Parent: 385fd9ae test: cover rule 8071 legality and gantt display
- rule-engine-rs submodule: 3d7e1c3 fix: preserve blank 8071 TSV columns
- Earlier parent commits include docs spec/plan, Rust pointer, SQL migration, source accessors, recheck wiring.

Verification run:
- cargo test --manifest-path rule-engine-rs/Cargo.toml PASS.
- cargo clean --manifest-path rule-engine-rs/Cargo.toml --release && cargo build --release --manifest-path rule-engine-rs/Cargo.toml PASS.
- node --test live-server/scripts/__tests__/legality-recheck-core.test.mjs PASS 18/18 after rebuilding all release binaries.
- npm exec -- tsc --noEmit from live-server/ PASS. The npm --prefix form prints tsc help under npm 10.9.8 and exits 1; use workdir live-server equivalent.
- Playwright 8071 param dialog PASS: GANTT_API_URL=http://127.0.0.1:3000 VITE_LIVE_TARGET=http://127.0.0.1:3000 GANTT_TEST_USER=Ryan GANTT_TEST_PASS=<redacted> e2e/node_modules/.bin/playwright test --config=e2e/config/playwright.config.ts --project=gantt --no-deps e2e/tests/gantt/legality-param-editor.spec.ts -g "8071" --reporter=list
- Playwright 8071 ruleset/recheck/Alert Center PASS: same env, e2e/tests/gantt/rule-8071-roster-properties.spec.ts --reporter=list.

Runtime/data notes:
- Local live-server was started with npm --prefix live-server run dev, using live-server/.env schema f8.
- Applied sql/migration/2026-07-18-rule-8071-add-f8-ruleset.sql to the accessible f8 DB and verified worksets {103,433}; default Max Times restored to 11 after E2E.
- Remote SIT /live API at https://crew-f8-usva-sit.roiscloud.com/live currently still returns worksets 103/433 as 14 rules and 0 rules with function=8071, while login reports schema=f8_sit_live. The available local .env DB is not the same DB used by deployed /live. Deployment/DB sync to SIT live remains required before remote users see 8071 there.
- No product UI files were modified in Task 6, so npm run check:ui was not required.

Do not repeat:
- Do not use Flights=0031; F8 default is Flights=*.
- Do not assume Max Times=11 produces zero violations; after parser fix, June 2026 default produced 101 8071 rows in the accessible f8 DB.
- If live-server core tests fail with stale binary errors after any rule-engine-rs source edit, rebuild all release binaries, not only check-8071.

## 当前工作树快照

### git status --short

```text
(clean)
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
2. 本文件：`docs/dev-context/2026-07-18-engines-rule-8071-rust-legality.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh engines
git status --short
```
