# Case 3 preparation — Rule 8004 crew-fleet mismatch recovery

> Internal preparation record (skill 145). Fixture state for the Case-3 recovery demo.
> No secrets. Prepared 2026-09-13 (America/Vancouver), env `f8_sit_live`, branch `main`.
> Local stack: Gantt vite `:5567`, live-server `:3000`, ai-server `:3005`, Metro `:8081`.

## 1. Objective and status

Reproduce the demo-video business flow ("Case 3.mp4"): a **Rule 8004 crew-fleet mismatch**
on a fully-rostered pairing opens the Recovery UI from three entry points and exposes the
three standard recovery methods (Roster transfer/exchange, Standby Crew callout,
Cross-base positioning).

| Item | Status |
|---|---|
| 10 ADD-base 788-qualified crew seeded | Done |
| 8004 FLEET check enabled in the Live-FD ruleset | Done |
| 788 pairing fully rostered with 4 pilots | Done |
| Both flights changed 788 → 7M8; 8004 fires for all 4 crew | Done |
| Recovery entry points (Alert Center / Pairing pane / Roster pane) | **Verified — Playwright PASS** |
| Recovery option execution (Executable / cost / Preview / Apply / Save) | **Verified — Playwright PASS** |

## 2. Isolation from Case 1 and Case 2

Case 1 = crew `113` / `J4002` / pairing `152056`; Case 2 (S2 ADD) = `T2001/T2021/T2022` +
standby `T2002–T2034`, pairing `152675`, flights `161242–161245`. Case 3 uses a **disjoint**
crew prefix (`L3xxx`), pairing (`152227`) and flights (`155785/155806`).

## 3. Fixture

### 3.1 Crew (skill 141)

Fixture `.agents/skills/141-crew-seed-generator/fixtures/ethiopia-add-788.json`
(`idPrefix L`, `idStart 3001`, `count 10`, `caCount 5`, base `ADD`, fleet `788`).

| crew_id | base | fleet_specific | rank |
|---|---|---|---|
| L3001–L3005 | ADD | 788 | CA |
| L3006–L3010 | ADD | 788 | FO |

`crew_fleet.fleet_specific = '788'` (the flight-facing code; `fleet` master row 788 already
existed with `fleet_grp=B787`, `ac_type=788`). No crew in the DB were qualified on `788`
before this seed.

### 3.2 Pairing and roster

* Pairing **152227** — base ADD, fleet **788**, division P, `FLY`, 1 duty / 2 segments,
  **2026-09-19** (ADD 00:15Z → 23:05Z), composition **CA ×2 + FO ×2 = 4 pilots**.
  Segments: ET452 ADD→CAI 02:15Z, ET453 CAI→ADD 07:20Z.
* Assigned via the same application function the UI uses (`rosterService.assignPairing`):
  L3001, L3002 (CA) and L3006, L3007 (FO) → 8 roster rows (4 crew × 2 segments).

**Route note:** the only ADD–MED 788 pairings (150638/150444) are dated 2026-09-01/02 —
already ended, and Recovery refuses a completed Roster (`canRecoverViolation` →
`isRosterCompleted`). All *future* ADD–MED pairings are 7M8. Case 3 therefore uses the
closest future 788 ADD turn (ADD–CAI–ADD) instead of ADD–MED. Only the route label differs;
the business flow and options are identical.

### 3.3 Fleet change (the demo trigger)

Both flights changed 788 → **7M8** via `flightService.update` (which propagates
`fleet → pairing_segment.fleet_seg`, the field 8004 reads first):

| flt_id | flt_num | flight.fleet | pairing_segment.fleet_seg |
|---|---|---|---|
| 155785 | ET452 | 7M8 | 7M8 |
| 155806 | ET453 | 7M8 | 7M8 |

### 3.4 Rule parameter

In `f8_sit_live` all three 8004 instances had **FLEET Enable Check = N** (only BASE = Y), so
the fleet mismatch could never fire. Enabled via the Legality API (same endpoint the
Legality tab uses, which triggers a scoped live recheck):

`PATCH /api/legality/rule/22/params` with paramJson
`...["RANK","N","0","CD","FLY"],["FLEET","Y","0","CD","FLY"]`.

An ADD-wide FLEET row then gave case-2 crew **T2001** a collateral alert (rostered on 738
pairing 150406, only B787-qualified). The row is therefore scoped to
`["ADD","*","788","FLEET","Y","0","CD","FLY"]` — Base **ADD**, Fleet **788** — so only
788-qualified ADD crew are checked. After the recheck, the **only** fleet-8004 rows in the
database are the four case-3 crew; case 1 / case 2 carry none.

Rule id 22 = `8004001` (instance **8004/001**), linked to workset **103**
("PBS Solver Ruleset FD", LIVE, division P) — the ruleset the Legality tab auto-selects.

### 3.5 Resulting violations

4 persisted `rule_violation` rows (severity 1), recomputed 2026-09-13T17:05:05Z:

```
8004  L3001  152227  Row 3: Crew fleet (788) is invalid for the pairing (7M8) on 2026-09-18.
8004  L3002  152227  ... (same)
8004  L3006  152227  ... (same)
8004  L3007  152227  ... (same)
```

(Message is the current unified BASE/RANK/FLEET wording from the live-server legality path;
the video's older "Crew fleet 7M8 is not a valid qualification for the roster" string is the
pre-`5adf4a9` format.)

## 4. Recovery UI verification (real UI, Playwright)

Spec `e2e/tests/gantt/recovery-case-003.spec.ts`, config `e2e/config/case3.config.ts`.

Command:

```bash
cd e2e && GANTT_BASE_URL=http://localhost:5567 GANTT_API_URL=http://localhost:3000 \
  npx playwright test --config=config/case3.config.ts
```

Result: **PASS (1 test, 59.4 s)**.

Asserted:

1. All 10 seeded `L3xxx` crew are loaded in the Live crew store.
2. L3001/L3002/L3006/L3007 carry pairing 152227 in the roster pane.
3. **Entry 1 — Alert Center:** row `L3001/152227` has `data-recoverable="true"`; select →
   "Recovery Selected" opens the Recovery dialog.
4. **Entry 2 — Pairing pane:** row right-click → **Recovery** opens the same dialog.
5. **Entry 3 — Roster pane:** row right-click → **Recovery** opens the same dialog.
6. Each dialog shows Rule 8004 and the three method filters
   (`recovery-plan-filter-roster|standby|cross-base`).

Screenshots (inspected via OCR, since image viewing is unavailable in this session):

| Screenshot | Shows |
|---|---|
| `docs/assets/screenshots/crew-recovery/case3-roster-4-pilots-Ver1.png` | roster rows L3001/L3002/L3006/L3007 |
| `docs/assets/screenshots/crew-recovery/case3-entry1-alert-center-Ver1.png` | "Rule 8004 · ET452 · 1 Crew · 1 Roster", message, Recovery methods |
| `docs/assets/screenshots/crew-recovery/case3-entry2-pairing-pane-Ver1.png` | same dialog from the Pairing pane |
| `docs/assets/screenshots/crew-recovery/case3-entry3-roster-pane-Ver1.png` | same dialog from the Roster pane |

### 4.2 Option-level verification

Spec `e2e/tests/gantt/recovery-case-003-options.spec.ts` (same config/command):
**PASS (1 test, 40.2 s)**. One roster-transfer option driven through every boundary:

| Step | Observed |
|---|---|
| Executable / Filtered / Best cost tabs | present and switchable; `All / Executable / Filtered` counts render |
| Executable list | candidate **L3003** (CA, ADD, 788) Executable; cost **Unpriced** |
| Cost breakdown | `recovery-option-cost-dialog` opens; state is **Unpriced** (no cost-library entry for an ADD transfer in this fixture — honest, not "free") |
| Preview | in-memory "Preview mode · Before + After"; "Recovery Roster is simulated and not saved"; "Transfer to L3003" |
| Apply | draft only: "Recovery option applied to the unsaved Gantt draft. Use Save to commit it."; `draftOps` non-empty; source released / target holds the Pairing **in the draft** |
| Save | "Changes saved successfully"; `draftOps` back to 0 |

Screenshots: `case3-options-{executable,cost-breakdown,preview,applied-draft,saved}-Ver1.png`.

**Soft-fleet outcome (product decision 2026-09-12):** after Save the roster is
`L3002 / L3003 (CA) + L3006 / L3007 (FO)` on pairing 152227, and the 8004 **remains** for
L3003 ("Crew fleet (788) is invalid for the pairing (7M8)") — a 788-only candidate cannot
clear a 7M8 fleet mismatch. The fleet constraint does not block executability, so the
transfer commits and the warning persists. A fully clearing transfer needs a 7M8-qualified
candidate (the ADD 7M8 pool `J40xx` is busy in this window).

Not verified: 8004 clearance by a qualified replacement; cross-base / standby option
execution; crew-app notification.

## 5. Code changes and findings

### 5.1 Gap found and fixed — Pairing pane had no 8004 recovery entry

`gantt/src/components/roster/context-menu.tsx`: `pairingRecoverySnapshot` only handled
Rule **3007** (published delay) via `hasPairingActualDelay`; the committed HEAD version had
no pairing-pane Recovery entry at all. For an 8004 fleet alert the Pairing pane therefore
offered no Recovery item, so the demo's "three entry points" requirement was not met.

Fixed by resolving a recoverable alert for the pairing first (reusing the same
`findRecoverableAlert` + `ruleViolationsMap` / `persistedViolationsMap` plumbing the Roster
right-click uses), then falling back to the published-delay branch. No new abstraction —
the existing `recovery:open` window event and `RecoveryViolationDialog` are reused.

`npx tsc --noEmit` (gantt): clean except the pre-existing
`service-status-pill.tsx` 104/115/116 errors.

### 5.2 Pre-existing stale tests (not caused by this prep)

* `live-server` `npm run test:8004-regression` → **1 fail**: the mock source supplies
  `fleetSegments`/`fleetQuals`, but the current `rule8004` core reads
  `competencyFlights`/`competencyQuals`, and the expected message still uses the old wording.
  It is a pure unit test (no DB, imports the HEAD core) — fails identically with and without
  `SKIP_RUST_BINS=true`. Needs updating to the current core contract.
* `gantt` `recovery-trigger.test.ts` → **1 fail** ("ignores rules that are not Recovery entry
  points" still expects 3007 to be ignored). This is the **uncommitted 3007/FDP-discretion
  work** in the worktree; it is unrelated to Case 3.

## 6. Reset / replay

Replay instructions (scripts under `.local/case3/`):

* Re-seed crew (idempotent): `seed-crew.mjs fixtures/ethiopia-add-788.json`.
* Re-assign pairing: `assign-pairing.cjs` (pairing 152227, 4 crew).
* Re-apply the trigger: `change-fleet.cjs` (flights → 7M8 + scoped 8004 recheck).
* After an Apply/Save option run: `reset-152227.cjs` releases any crew that took the pairing
  and re-assigns the original 4 (`rosterService.removeByPairingAndCrew` / `assignPairing`) + recheck.
* Reset the trigger: `revert-150638.cjs` is the 150638 variant; for 152227 set the flights
  back to 788 and de-assign with `rosterService.removeByPairingAndCrew`.

Preserve: the 8004 FLEET `Enable Check=Y` param (the case precondition). Case 1 and Case 2
data were not modified; pairing 150638 (first, past-dated attempt) was fully reverted
(flights back to 788, crew de-assigned, stale 8004 rows cleared).

## 7. Online Help delivery (Case study 3)

Published as a Help Case Study alongside Case 1 and Case 2 (skill 003):

| Artifact | Location |
|---|---|
| Topic body | `gantt/src/components/help/topics/recovery/recovery-case-003.tsx` |
| Registry | `gantt/src/components/help/help-data.ts` (after `recovery-case-002`), `stepCount: 10` |
| Lazy import | `gantt/src/components/help/help-view.tsx` |
| Screenshots (5) | `gantt/public/help/screenshots/s3-{entry-alert-center,entry-pairing-pane,entry-roster-pane,options-executable,options-preview}-Ver1.png` |
| Content test | `e2e/tests/gantt/help/help-recovery.spec.ts` — image count 5 + text assertions + search keywords |
| Version | `FRONTEND_VERSION` 450 → **451** |

Content covers: the incident (pairing 152227, ET452/ET453 changed 788 → 7M8), the crew and the
ADD/788 scoping, the three entry points, the three recovery methods, the
Executable/Filtered/Best-cost tiers, the Unpriced cost state, the soft-fleet warning, and the
Preview → Apply (draft) → Save boundaries. It is published as **Partial** because a 788-only
replacement does not clear the 8004 and the Standby / Cross-base options were not executed.

Receipts: full Help suite **75 passed (1.1 m)**
(`npx playwright test -c config/playwright.config.ts --project=gantt tests/gantt/help/ --reporter=list --no-deps`
with `GANTT_BASE_URL=http://localhost:5567`); the run also captures
`docs/assets/screenshots/gantt/help-recovery-recovery-case-003-Ver1.png`.

Notes / limitations:
* Help topics were screenshotted from the real Playwright UI runs above, not the
  `capture-help-screenshots.ts` harness; total added PNG weight ≈ 1.1 MB (5 images, comparable to
  Case 2's 4 × ≈1.0 MB).
* Screenshots were inspected by OCR, not by eye (image viewing is unavailable in this session).
* `scripts/check-help-menu-coverage.mjs` and `scripts/check-legality-help-coverage.mjs` each report
  one **pre-existing** gap unrelated to this change (System → Interface page; rule 7509
  Avoid Co-pairing). No topics were invented to silence them.
