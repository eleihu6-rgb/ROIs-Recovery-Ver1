# Live Rule Dev/Debug Playbook

This playbook is for Live legality rule work that crosses:

- Rust rule binary output
- `live-server` recheck/persist message shaping
- Gantt bell data
- Alert Center planner validation

It is written from the 8056 C++ to Rust migration and message-fix flow.

## 1. Scope First

Before changing code, decide which layer is actually wrong:

- Rule core: violation detection, pairing selection, thresholds, severity, emitted tuples
- Output contract: message text, labels, date-time formatting, units
- Recheck path: Live scoped recheck, persistence, broadcast, Alert Center visibility
- UI only: filtering, grouping, row rendering, snapshot proof

Do not change rule core logic when the defect is only missing context in the warning text.

## 2. Follow the Previous Migration Flow

Use the same path we used for migrated Live rules:

1. Rust binary emits machine-stable violation tuple fields.
2. `live-server/scripts/legality-recheck-core.mjs` shapes the Live recheck message.
3. `live-server/scripts/persist-<rule>-violations.mjs` shapes the persisted message.
4. Gantt reads live violations through the existing Live data flow.
5. Alert Center is the planner-facing proof surface.

For 8056, the missing dates were not lost in SQL migration. They were absent in the migrated output/message path.

## 3. Message Design Rule

Planner-facing warnings should answer four questions immediately:

1. Which two duties are involved.
2. What exact end/start date-times define the gap.
3. What the actual gap is.
4. What threshold was violated.

Prefer this structure:

`Rest between (<previous-duty-label> <yyyy-mm-dd HH:MM>) and (<next-duty-label> <yyyy-mm-dd HH:MM>) is <H:MM>, which is below the required <N> RH.`

Why this works:

- `Rest between` is product language, not engine jargon.
- The label and date-time stay together, so planners do not need to map a detached timestamp back to a duty.
- The sentence ends with the breached threshold, which makes the actionability obvious.

Avoid:

- `spacing` without context
- detached `previous duty` / `next duty` fragments
- messages that require the planner to infer which timestamp belongs to which duty
- raw engine tuple wording

## 4. Minimal Code Touch Pattern

When the issue is message clarity only:

- keep Rust core unchanged
- keep threshold logic unchanged
- keep rule selection unchanged
- only patch the formatter in both Live output paths

For 8056, the two formatter files are:

- `live-server/scripts/legality-recheck-core.mjs`
- `live-server/scripts/persist-8056-violations.mjs`

## 5. Required Verification Ladder

Run smallest to largest:

1. Focused unit test for the message formatter.
2. Rust rule test to prove rule core logic did not regress.
3. Playwright user story that changes the rule param in the real UI.
4. Playwright live-roster validation against the current active roster.
5. Alert Center snapshot artifact.

For 8056, the useful commands were:

```bash
cd live-server
npm test -- tests/unit/legality-recheck-core-param.spec.ts
```

```bash
cd rule-engine-rs
cargo test --release --test rule_8056_tests -- --nocapture
```

```bash
cd e2e
PBS_PORTAL_BASE_URL=http://127.0.0.1:5173/altair/ \
  npx playwright test --config=config/playwright.config.ts --project=gantt \
  tests/gantt/legality-recheck-8056-user-story.spec.ts --no-deps --reporter=line
```

```bash
cd e2e
PBS_PORTAL_BASE_URL=http://127.0.0.1:5173/altair/ \
  npx playwright test --config=config/playwright.config.ts --project=gantt \
  tests/gantt/rule-8056-spacing.spec.ts --no-deps --reporter=line
```

```bash
cd e2e
PBS_PORTAL_BASE_URL=http://127.0.0.1:5173/altair/ \
  npx playwright test --config=config/playwright.config.ts --project=gantt \
  tests/gantt/capture-8056-alert-snapshot.spec.ts --no-deps --reporter=line
```

## 6. Playwright Snapshot Method

Use this exact planner-visible proof flow:

1. Open Live Gantt.
2. Set the target date range if needed.
3. Open Alert Center.
4. In the left sidebar, click `Rule`.
5. Select or click `8056/001`.
6. Capture:
   - full dialog screenshot
   - 8056 row screenshot
   - optional proof text file with the exact row text

Current artifact paths:

- `image/RUST/8056/8056-alert-center-rule-8056-dialog.png`
- `image/RUST/8056/8056-alert-center-rule-8056-row.png`
- `image/RUST/8056/8056-alert-center-rule-8056-proof.txt`

## 7. Known Gotchas

- Shared Live environments may keep `recheck-status.lastCheckedAt` unchanged even after a real recheck. If the POST was observed and status stabilizes at `done`, do not hang forever on timestamp drift.
- Ruleset parameter baselines drift in shared DBs. Do not assume `13` is still current; normalize first if the test needs `13 -> 14`.
- Alert Center proof is more reliable than canvas-only observation because it exposes exact planner text.

## 8. Done Standard

A Live rule message task is done only when all of these are true:

- the intended message text is present in the Live warning
- the intended threshold change is visible in planner-facing text
- the focused unit test passes
- the Rust rule test passes
- the Playwright flow passes
- the Alert Center snapshot artifact is captured
