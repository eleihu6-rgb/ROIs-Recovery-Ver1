# 7501 Edit-Focus Worst Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an edit causes a 7501 SDFD breach, preview popup and mutation persist/recheck select the worst window that overlaps the edit focus (not an older unrelated global-worst window).

**Architecture:** Extend Rust `check_sdfd_rolling_app` with optional focus UTC intervals; among violating windows prefer those overlapping focus, else fall back to global worst. Wire focus from preview draft delta and from mutation duty timestamps into `check-7501` / `rule7501`. Full Recheck omits focus.

**Tech Stack:** Rust (`rule-engine-rs`), Node (`live-server/scripts/legality-recheck-core.mjs`, preview + recheck TS), Playwright (`e2e/tests/gantt/`).

**Spec:** `docs/superpowers/specs/2026-08-01-7501-edit-focus-worst-window-design.md`

## Global Constraints

- Still **one** 7501 emission per crew per rule-row (168 RH / 672 RH each ≤1).
- No focus → behavior identical to today (global worst, earliest on SDFD ties).
- Focus overlap empty → fall back to global worst.
- Do not treat 7501 as always-surface on the frontend (engine fix first).
- SIT needs `check-7501` binary redeploy after Rust change (`deploy/sit` rust-bins); no DB schema change.
- UI strings remain English. §Minimal-First / §Surgical.

## File map

| File | Role |
|------|------|
| `rule-engine-rs/src/lib.rs` | Focus-aware worst-window pick in `check_sdfd_rolling_app` |
| `rule-engine-rs/src/rules/rule7501.rs` | Thread focus into `check_rule7501_structured` |
| `rule-engine-rs/src/bin/check_7501.rs` | CLI `--focus-start-secs` / `--focus-end-secs` (repeatable pairs) |
| `rule-engine-rs/tests/rule_7501_tests.rs` | Unit tests for focus preference |
| `live-server/scripts/legality-recheck-core.mjs` | `rule7501` passes focus args from `ctx` |
| `live-server/scripts/__tests__/legality-recheck-core.test.mjs` | Assert CLI args include focus |
| `live-server/src/services/rule/legality-preview.ts` | Build focus from afterItems; put on ctx |
| `live-server/src/services/rule/legality-recheck.ts` | Pass unpadded mutation focus into spawn |
| `live-server/scripts/live-legality.mjs` | Accept `--focus-from` / `--focus-to` (or epoch args) → ctx |
| `e2e/tests/gantt/rule-7501-edit-focus-assign.spec.ts` | Playwright: assign shows 7501 dialog |

---

### Task 1: Rust focus selection + unit tests

**Files:**
- Modify: `rule-engine-rs/src/lib.rs` (`check_sdfd_rolling_app`, ~1599–1725)
- Modify: `rule-engine-rs/src/rules/rule7501.rs` (`check_rule7501_structured`)
- Modify: `rule-engine-rs/tests/rule_7501_tests.rs`
- Test: `cargo test --manifest-path rule-engine-rs/Cargo.toml --test rule_7501_tests`

**Interfaces:**
- Consumes: existing `overlaps`, `SdfdViolation`, `Application`
- Produces:
  - `check_sdfd_rolling_app(..., focus_intervals: &[(i64, i64)])` — empty slice = current behavior
  - `check_sdfd_rolling` passes `&[]`
  - `check_rule7501_structured(..., focus_intervals: &[(i64, i64)])`

- [ ] **Step 1: Write failing tests** in `rule_7501_tests.rs`

Add helpers + tests (adapt timestamps to existing fixture style so two SDFD=0 windows exist — early Jan-like dense block and late Aug-like dense block; or construct minimal work so both windows violate with count 0):

```rust
#[test]
fn focus_prefers_overlapping_window_when_both_violate() {
    // Arrange two separate violating clusters in `work` such that global worst
    // is the EARLIER window (same SDFD). Focus = late cluster span.
    // Assert returned window_start_utc overlaps focus and is the late window.
}

#[test]
fn empty_focus_keeps_global_earliest_worst() {
    // Same work, focus = &[]; assert early window selected.
}

#[test]
fn focus_with_no_overlap_falls_back_to_global_worst() {
    // Focus far from both clusters; assert early global worst.
}
```

If constructing two real SDFD=0 clusters is heavy, reuse proven duty patterns from existing tests in the same file (copy `march_day` / consecutive FLY patterns) offset by months.

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cargo test --manifest-path rule-engine-rs/Cargo.toml --test rule_7501_tests focus_prefers -- --nocapture
```

Expected: compile error (no `focus_intervals` param) or assertion fail.

- [ ] **Step 3: Implement selection in `check_sdfd_rolling_app`**

Replace single `worst: Option<(i64, i64)>` with:

1. Collect all violating `(count, ws)` as today.
2. If `focus_intervals` non-empty, filter to those where `overlaps(ws, ws+window_secs, f0, f1)` for any focus pair.
3. If filtered non-empty, pick min `count`, then min `ws`.
4. Else pick global min `count`, then min `ws` (today’s rule).

Thread `focus_intervals` through `check_rule7501_structured` → `check_sdfd_rolling_app`. Update `check_sdfd_rolling` to pass `&[]`. Update any other callers of `check_sdfd_rolling_app` to pass `&[]` unless they already have focus.

- [ ] **Step 4: Re-run tests — expect PASS**

```bash
cargo test --manifest-path rule-engine-rs/Cargo.toml --test rule_7501_tests
```

Expected: all `rule_7501_tests` PASS.

- [ ] **Step 5: Commit**

```bash
git add rule-engine-rs/src/lib.rs rule-engine-rs/src/rules/rule7501.rs rule-engine-rs/tests/rule_7501_tests.rs
git commit -m "$(cat <<'EOF'
feat(rule-engine-rs): prefer edit-focus window for 7501 SDFD worst pick

EOF
)"
```

---

### Task 2: `check-7501` CLI focus args

**Files:**
- Modify: `rule-engine-rs/src/bin/check_7501.rs`
- Test: manual / small rust test optional; primary verify via `cargo build --release --bin check-7501` + stdin smoke

**Interfaces:**
- Consumes: Task 1 `check_rule7501_structured` / `check_sdfd_rolling` with focus
- Produces: CLI flags `--focus-start-secs <i64>` and `--focus-end-secs <i64>` (paired in order; multiple pairs allowed). Parsed into `Vec<(i64, i64)>` passed into structured + legacy eval loops.

- [ ] **Step 1: Parse repeatable focus pairs**

```rust
// After existing arg parsing:
let focus_starts = all_arg_i64(&args, "--focus-start-secs");
let focus_ends = all_arg_i64(&args, "--focus-end-secs");
assert_eq!(focus_starts.len(), focus_ends.len()); // or zip min and warn
let focus: Vec<(i64, i64)> = focus_starts.into_iter().zip(focus_ends).collect();
```

Pass `&focus` into every `check_rule7501_structured` / `check_sdfd_rolling` call site in this bin.

- [ ] **Step 2: Build release binary**

```bash
CARGO_TARGET_DIR="$(pwd)/rule-engine-rs/target" cargo build --release --manifest-path rule-engine-rs/Cargo.toml --bin check-7501
```

Expected: Finished successfully; binary mtime newer than `src`.

- [ ] **Step 3: Smoke with Aug-only AFTER fixture** (optional local script using known crew duties) — focus on Aug 11–12 should emit Aug window when full-year stdin would otherwise emit Jan.

- [ ] **Step 4: Commit**

```bash
git add rule-engine-rs/src/bin/check_7501.rs
git commit -m "$(cat <<'EOF'
feat(rule-engine-rs): check-7501 CLI focus interval args

EOF
)"
```

---

### Task 3: `rule7501` JS passes `ctx.focusIntervals`

**Files:**
- Modify: `live-server/scripts/legality-recheck-core.mjs` (`rule7501`, args near `--checked-end-secs`)
- Modify: `live-server/scripts/__tests__/legality-recheck-core.test.mjs`
- Test: `node --test live-server/scripts/__tests__/legality-recheck-core.test.mjs`

**Interfaces:**
- Consumes: `ctx.focusIntervals?: Array<{ startSecs: number, endSecs: number }>`
- Produces: for each interval, append `--focus-start-secs`, String(start), `--focus-end-secs`, String(end) to `check-7501` args

- [ ] **Step 1: Failing test** — extend existing `rule7501 maps structured...` or add:

```js
test('rule7501 forwards ctx.focusIntervals to check-7501 args', async () => {
  let captured = null
  // minimal source + instancesOf 2014/7501 like existing test
  await rule7501(source, {
    ...CTX_DATES,
    focusIntervals: [{ startSecs: 100, endSecs: 200 }],
    instancesOf: /* 2014 + 7501 */,
    log: () => {},
    runBin(bin, args) { captured = { bin, args }; return [] },
  })
  assert.equal(captured.bin, 'check-7501')
  const i = captured.args.indexOf('--focus-start-secs')
  assert.ok(i >= 0)
  assert.equal(captured.args[i + 1], '100')
  assert.equal(captured.args[i + 2], '--focus-end-secs')
  assert.equal(captured.args[i + 3], '200')
})
```

- [ ] **Step 2: Run — expect FAIL** (args lack focus)

```bash
cd live-server && node --test scripts/__tests__/legality-recheck-core.test.mjs --test-name-pattern 'forwards ctx.focusIntervals'
```

- [ ] **Step 3: Implement** in `rule7501` when building `args`:

```js
const args = ['--emit-tsv', /* night + checked-end */]
for (const f of ctx.focusIntervals ?? []) {
  const a = Number(f.startSecs), b = Number(f.endSecs)
  if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
    args.push('--focus-start-secs', String(a), '--focus-end-secs', String(b))
  }
}
```

- [ ] **Step 4: Run test — PASS**

- [ ] **Step 5: Commit**

```bash
git add live-server/scripts/legality-recheck-core.mjs live-server/scripts/__tests__/legality-recheck-core.test.mjs
git commit -m "$(cat <<'EOF'
feat(live): forward 7501 focusIntervals to check-7501

EOF
)"
```

---

### Task 4: Preview builds focus from afterItems

**Files:**
- Modify: `live-server/src/services/rule/legality-preview.ts`
- Test: add focused unit test under `live-server/src/__tests__/services/rule/` if a preview helper is extracted; otherwise extend an existing legality-preview test, or add a pure helper:

**Interfaces:**
- Produces: `export function focusIntervalsFromPreviewItems(items: PreviewRosterItem[]): { startSecs: number, endSecs: number }[]`  
  — one interval per item with finite `schStrDtUtc`/`schEndDtUtc` (epoch seconds). Preview ctx sets `focusIntervals` from **all** `afterItems` that are part of the overlay mutation set.

**Minimal approach (spec-aligned):** For live preview, set focus to the union of timestamps of `afterItems` that fall inside the overlay window **or** simply all `afterItems` passed into preview (caller already scopes to affected crew’s simulated roster). Prefer: intervals from items whose `id < 0` (temp placeholders) **or** whose pairingId is in the set of pairings present only in after vs a before snapshot.

Simplest correct approach for assign: preview `afterItems` includes full crew roster + new segs; focus = intervals only for items with **negative ids** (temp) or `source === 'MA'` draft markers — verify what the gantt sends for new assigns. If new rows use negative ids (as in SIT repro), use:

```ts
const focusIntervals = afterItems
  .filter((i) => i.id < 0 || /* pairing newly introduced */)
  .map(...)
```

If unreliable, pass `relatedPairingIds` from API (optional body field) — **only if needed**; prefer negative-id / new pairing detection without API change first.

Wire into `ctx` in `previewDraftLegality` before `computeViolations`:

```ts
ctx = { ..., focusIntervals }
```

Ensure `computeViolations` / live source path preserves unknown ctx fields through to `rule7501`.

- [ ] **Step 1:** Add pure helper + Vitest asserting negative-id items become focus intervals.
- [ ] **Step 2:** Call helper from `previewDraftLegality` live + scenario branches.
- [ ] **Step 3:** Run `cd live-server && npx vitest run src/__tests__/...` (exact path of new test).
- [ ] **Step 4:** Commit.

---

### Task 5: Mutation recheck passes unpadded focus dates

**Files:**
- Modify: `live-server/src/services/rule/legality-recheck.ts` (`spawnLiveRecheck`, `recheckLiveRosterMutation`)
- Modify: `live-server/scripts/live-legality.mjs` (argv parse → ctx.focusIntervals)
- Modify: `live-server/src/__tests__/services/rule/legality-recheck.test.ts`

**Interfaces:**
- `spawnLiveRecheck(..., focus?: { fromIso: string, toIso: string } | null)`
- CLI: `--focus-from YYYY-MM-DD` `--focus-to YYYY-MM-DD` (inclusive calendar days → epoch range covering that local/UTC day span as `[from 00:00Z, to+1day 00:00Z)` **or** better: pass epoch from mutation timestamps directly via `--focus-start-secs` / `--focus-end-secs` to avoid TZ ambiguity)

**Preferred:** `recheckLiveRosterMutation` computes:

```ts
const focusStartSecs = Math.floor(Math.min(...timestamps) / 1000)
const focusEndSecs = Math.floor(Math.max(...timestamps) / 1000)
// if equal, bump end by 1s
spawnLiveRecheck(..., { focusStartSecs, focusEndSecs })
```

Child: `live-legality.mjs` parses flags → `ctx.focusIntervals = [{ startSecs, endSecs }]`.

Padded `--from`/`--to` for data load **unchanged** (−31/+31).

- [ ] **Step 1:** Update unit test `recheckLiveRosterMutation window` to assert spawn args include focus secs derived from input dates (mock spawn).
- [ ] **Step 2:** Implement spawn + live-legality parse.
- [ ] **Step 3:** `npx vitest run src/__tests__/services/rule/legality-recheck.test.ts`
- [ ] **Step 4:** Commit.

---

### Task 6: Playwright regression — assign shows 7501 dialog

**Files:**
- Create: `e2e/tests/gantt/rule-7501-edit-focus-assign.spec.ts`
- Possibly reuse helpers from `e2e/utils/gantt-hook` and patterns from `e2e/tests/gantt/rule-7501-sdfd.spec.ts`

**Scenario (SIT or local with `f8_sit_live`):**

1. Login, open Live gantt, ruleset 103, RP covering Aug 2026.
2. Bring crew `2438` into roster (filter / search).
3. Assign pairing `15676` via **real UI** (drag or assign action — §Simulate-User).
4. Expect `RuleConfirmDialog` (or existing legality confirm) visible with text matching `/7501|Single day free from duty/i`.
5. Cancel/dismiss without saving if the environment must stay clean — or save only on disposable SIT data with cleanup.

If headed SIT credentials required, document env vars `GANTT_BASE_URL`, `GANTT_TEST_USER`, `GANTT_TEST_PASS` like other SIT specs.

- [ ] **Step 1: Write the spec** with concrete selectors already used by legality confirm dialog in gantt.
- [ ] **Step 2: Run**

```bash
cd e2e && npx playwright test tests/gantt/rule-7501-edit-focus-assign.spec.ts --reporter=list
```

- [ ] **Step 3: Fix until PASS; paste receipt in PR/commit message.**
- [ ] **Step 4: Commit.**

---

### Task 7: Rebuild + SIT deploy note

**Files:** none required in repo beyond ops

- [ ] **Step 1:** Local:

```bash
CARGO_TARGET_DIR="$(pwd)/rule-engine-rs/target" cargo build --release --manifest-path rule-engine-rs/Cargo.toml
```

Ensure all `check-*` land under `rule-engine-rs/target/release` (watch `CARGO_TARGET_DIR` sandbox redirect).

- [ ] **Step 2:** Deploy rust bins to SIT via existing `deploy/sit/deploy.sh` live/rust-bins path (or scp `check-7501` to `/home/yuan.z/rois/sit/rule-engine-rs/target/release/` and restart live-server if needed).

- [ ] **Step 3:** Re-verify on SIT: assign 15676→2438 → dialog appears; after Save, Alert Center/bell not stuck solely on January when mutation focus applied.

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Focus-overlap worst pick in engine | Task 1 |
| One row per rule-row | Task 1 (still single Option) |
| Empty focus = global worst | Task 1 |
| No overlap → fallback global | Task 1 |
| CLI focus | Task 2 |
| JS rule7501 forwards focus | Task 3 |
| Preview supplies focus | Task 4 |
| Mutation recheck supplies focus | Task 5 |
| Full recheck no focus | Task 5 (omit flags) |
| Playwright assign dialog | Task 6 |
| SIT binary deploy | Task 7 |

## Placeholder / consistency self-review

- No TBD steps; focus flag names consistent: `--focus-start-secs` / `--focus-end-secs` and `ctx.focusIntervals: { startSecs, endSecs }[]`.
- Preview helper may need a quick look at actual gantt `afterItems` ids during Task 4 — if negative ids are not used, switch to “pairings in after not in before” using a before snapshot already fetched by `checkLiveDraftLegality` (two preview calls). If API cannot see before, add optional `focusPairingIds` to preview body from the gantt `relatedPairingIds` — implement only if Step 1 of Task 4 proves negative-id insufficient.
