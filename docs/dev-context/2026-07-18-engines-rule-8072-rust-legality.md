# 开发上下文（2026-07-18）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-18 23:13:15 EDT
- Wing：`engines`
- Topic：`rule-8072-rust-legality`
- Title：rule-8072-rust-legality
- Git branch：`codex/rule-8072-rust-legality`

## 本轮对话上下文

Implemented full rule 8072 migration from C++ to Rust legality.

Key implementation:
- Rust checker and CLI: rule-engine-rs/src/rule8072.rs, rule-engine-rs/src/bin/check_8072.rs, exports in rule-engine-rs/src/lib.rs, Cargo bin check-8072.
- F8 catalog migration: sql/migration/2026-07-18-rule-8072-add-f8-ruleset.sql creates/updates 8072/001 with rule_id 8072001 and default row *,FLY,*,*,*,*,*,FC-GREEN,*,*,*,0,1, and adds worksets 103/433.
- live-server legality core wires rule8072 through computeViolations and maps persisted rule_code 8072 rows for generic Gantt Alert Center / violation dialog display.
- Live/Scenario/seed source accessors expose normalized crew-on-flight segment qualification data and filter to pilot division rows for F8.
- Scoped recheck dependency maps 8072 to itself.
- E2E coverage verifies 8072 ParamRowDialog, ruleset defaults, scoped recheck persistence, and Alert Center display.

Important bug found during Task 6:
- 8072 is segment-level, but live/scenario rule_violation upsert uniqueness does not include segment_id.
- Multiple same-duty segment violations collided in one ON CONFLICT batch.
- Fixed by prefixing 8072 scope_key with seg:<segmentId>:<param-scope>, preserving separate segment-level persisted violations without schema changes.

Verification:
- cargo test --manifest-path rule-engine-rs/Cargo.toml PASS.
- cargo build --release --manifest-path rule-engine-rs/Cargo.toml PASS.
- node --test live-server/scripts/__tests__/legality-recheck-core.test.mjs PASS.
- cd live-server && npm exec -- tsc --noEmit PASS.
- node --check live-server/scripts/legality-recheck-core.mjs PASS.
- node --check live-server/scripts/live-legality.mjs PASS.
- node --check live-server/scripts/scenario-legality.mjs PASS.
- Playwright 8072 param editor PASS with local Gantt/live target.
- Playwright 8072 ruleset/recheck/Alert Center PASS with local Gantt/live target.

DB sync:
- Applied 8072 migration to the configured F8 test DB for E2E and verified rule_id 8072001 in worksets {103,433}; final default param row restored to FC-GREEN / max 1.
- Applied 8072 migration to the authorized f8_sit_live target using a temporary search_path-adjusted SQL copy and verified rule_id 8072001, required_qualifications=FC-GREEN, worksets={103,433}.

Known process gap:
- GitNexus MCP/runner was not available in this Codex session, so impact()/detect_changes() could not be executed. Used focused local context review and git diff-stat fallback.

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
2. 本文件：`docs/dev-context/2026-07-18-engines-rule-8072-rust-legality.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh engines
git status --short
```
