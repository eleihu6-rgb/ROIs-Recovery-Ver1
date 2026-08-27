# Rule 7305 Violation Message Date Range Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change Rule 7305 T/D violation messages to include `[first_date, last_date]` in crew-base calendar days and drop attribute/label text.

**Architecture:** Format the new message inside the shared Rust kernel (`rule7305.rs`) when a violating run is flushed. Reuse `local_day` + duty `local_offset_min`; first date from first duty `start_utc`, last date from last duty `duty_end_utc`. Update locked string assertions in Rust and live-server unit tests.

**Tech Stack:** Rust (`rule-engine-rs`), Node test (`live-server/scripts/__tests__/rule-7305.test.mjs`)

## Global Constraints

- Date format must be `YYYY-MM-DD`.
- Last date uses `duty_end_utc`, not `rest_end_utc`.
- Do not change matching semantics or persisted `start_dt`/`end_dt` fields.
- Do not commit/push until the user explicitly commands it.
- Spec: `docs/superpowers/specs/2026-08-14-rule-7305-violation-message-date-range-design.md`

---

## File map

| File | Role |
|------|------|
| `rule-engine-rs/src/rules/rule7305.rs` | Message templates + local date formatting |
| `rule-engine-rs/tests/rule_7305_tests.rs` | Unit assertions for message text |
| `rule-engine-rs/tests/rule_7305_binary_tests.rs` | `check-7305` TSV message column |
| `live-server/scripts/__tests__/rule-7305.test.mjs` | Live adapter mock message string |

---

### Task 1: Update Rust unit expectations (RED)

**Files:**
- Modify: `rule-engine-rs/tests/rule_7305_tests.rs`
- Modify: `rule-engine-rs/tests/rule_7305_binary_tests.rs`

- [ ] Step 1: Change expected message strings to the new T/D templates with concrete `[YYYY-MM-DD, YYYY-MM-DD]` derived from each fixture’s first `start_utc` / last `duty_end_utc` + offsets.
- [ ] Step 2: Run `cargo test -p rule-engine-rs rule_7305` (or equivalent package test filter) and confirm failure on message mismatch.

### Task 2: Implement message formatting (GREEN)

**Files:**
- Modify: `rule-engine-rs/src/rules/rule7305.rs`

- [ ] Step 1: Add a small helper to format `local_day` as `YYYY-MM-DD` (UTC epoch day → civil date, or format via `start_utc + offset*60`).
- [ ] Step 2: In the flush path, set:
  - T: `The number of consecutive rosters ({actual}) [{first}, {last}] exceeds the threshold ({limit}).`
  - D: `The number of consecutive roster days ({actual}) [{first}, {last}] exceeds the threshold ({limit}).`
  using first.`start_utc` / last.`duty_end_utc` and each duty’s `local_offset_min`.
- [ ] Step 3: Re-run Rust 7305 tests until green.

### Task 3: Align live-server unit test

**Files:**
- Modify: `live-server/scripts/__tests__/rule-7305.test.mjs`

- [ ] Step 1: Update the mocked/expected message body string to the new template (dates matching that fixture).
- [ ] Step 2: Run `node --test scripts/__tests__/rule-7305.test.mjs` and confirm pass.

### Task 4: Verification receipt (no commit)

- [ ] Step 1: Paste PASS summaries for Rust 7305 tests + live-server `rule-7305.test.mjs`.
- [ ] Step 2: Stop; wait for user `commit & push` command.
