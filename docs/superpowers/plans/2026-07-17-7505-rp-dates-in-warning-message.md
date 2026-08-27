# 7505 RP Dates in Warning Message — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or implement inline in the same session when the change is tiny).

**Goal:** Append crew-base local RP start/end dates to 7505 warning messages.

**Architecture:** Format only in `rule7505` inside `legality-recheck-core.mjs`, reusing `crewBaseTimezone()` + `localDateOf`. End date = `rpE - 1`.

**Tech Stack:** Node ESM script, Vitest, existing `fakeBin` / `spawnSync` mock pattern from 8056 tests.

**Spec:** `docs/superpowers/specs/2026-07-17-7505-rp-dates-in-warning-message-design.md`

## File map

| File | Change |
|------|--------|
| `live-server/scripts/legality-recheck-core.mjs` | `rule7505`: load tz map; append `(start, end)` to message |
| `live-server/tests/unit/legality-recheck-core-param.spec.ts` | Add 7505 message timezone / UTC-fallback tests |
| Spec status | Mark approved / done after green tests |

## Task 1 — Failing tests

1. Add `describe('rule7505')` with two cases mirroring 8056 style:
   - Vancouver crew + known `rpS`/`rpE` → message ends with local dates.
   - Missing zone → UTC dates.
2. Mock source: `firstPairingByCrew`, `assignmentsAll`, `crewBaseTimezone`.
3. Mock `check-7505` TSV: `crew\trpS\trpE\tdaysOff\tminDo\tperiod\tunit`.
4. Run test → expect FAIL on old message without parentheses.

## Task 2 — Implement message format

1. In `rule7505`, `const tzMap = await source.crewBaseTimezone()`.
2. Per finding: `localDateOf(rpS, zone)` and `localDateOf(rpE - 1, zone)`.
3. Message:
   `The number of days off(${daysOff}) must be at least ${minDo} in ${period} ${unit} (${rpStartLocal}, ${rpEndLocal}).`
4. Re-run unit tests → PASS.

## Task 3 — Verify + mark spec

1. `cd live-server && npx vitest run tests/unit/legality-recheck-core-param.spec.ts --reporter=list`
2. Paste PASS receipt.
3. Update design doc status to approved/implemented.
