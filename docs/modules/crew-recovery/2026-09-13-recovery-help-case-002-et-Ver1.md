# Recovery Help — Case study 2 rewritten to the ET / ADD published-delay case

Prepared 2026-09-13, America/Vancouver. Branch `main`. No commit or push.

## Why this rewrite

The published Help still described Case 2 as the synthetic **PI201/PI202 HKG-SIN** narrative with
an `S21001`-`S21039` SIN B787 pool. The prepared Case 2 fixture is now a real-carrier
**ET / ADD** published-delay incident, and the `recovery-case-002` topic had drifted from it
(skill `003-online-help-writing` — "never describe Help content from memory or an old build").

## The ET case that Case 2 now documents

Verified against the live stack (Gantt `:5567`, live-server `:3000`, schema `f8_sit_live`):

| Item | Value |
|---|---|
| Pairing | **152675**, base ADD, division P, fleet B787, 2 duties / 4 segments |
| Flights | **ET2681 ADD-DXB**, **ET2682 DXB-ADD** (duty 1, 29 Sep 2026); **ET2683 ADD-JNB**, **ET2684 JNB-ADD** (duty 2, 30 Sep 2026) |
| Crew | **T2001** (CA), **T2021** (FO), **T2022** (FO) — dialog header "3 Crew · 1 Roster" |
| Trigger | **Rule 3007** published delay: ET2681 actual departure later than scheduled |
| Alert Center | three **3007** rows (T2001/T2021/T2022), message "Published delay: actual departure is later than scheduled; open Recovery preparation to review FDP impact and request crew agreement (FDP Discretion)" |
| Entry points | Alert Center (tick rows, then *Recovery selected*), Pairing right-click, Roster right-click |

Recovery dialog contents observed on the real UI:

| Strategy | Options | Notes |
|---|---|---|
| FDP Discretion | 1 | `Execute with Crew T2001`, badge *Crew consent*; warning "Apply remains disabled until independent FDP legality execution is implemented" |
| Standby Crew callout | 4 Executable / 2 Filtered | T2002 US$0.00, T2003 US$240.00, T2004 US$675.00, T2005 US$1,350.00 (saved calendar-month GH deltas); SBY 29 Sep 00:00-08:00Z retained |
| Swap duty | 3 (J4021 Executable; K1014/K1015 Blocked) | all **Unpriced**; orange fleet-mismatch warnings (J4021 not B787-qualified, T2001 not 7M8-qualified) |
| Flight Delay | 0 | "No executable candidates in the current loaded data range" |

## Files changed

| File | Change |
|---|---|
| `gantt/src/components/help/topics/recovery/recovery-case-002.tsx` | Rewritten to the ET / ADD case (10 steps, 5 screenshots) |
| `gantt/src/components/help/help-data.ts` | Case 2 title/overview updated (ET2681, 152675, T2001, published delay, FDP Discretion, standby) |
| `gantt/public/help/screenshots/s2-et-*.png` | 5 real-UI screenshots added (alert center, FDP discretion, standby, swap duty, flight delay) |
| `e2e/tests/gantt/help/help-recovery.spec.ts` | Case 2 image count 4 -> 5; text assertions and search keywords updated (`ET2681`, `J4021`, `Unpriced`, empty-delay copy) |
| `gantt/src/version.ts` | `FRONTEND_VERSION` 453 -> 454 |

The old SIN / PI screenshots (`s2-isolated-crew-pool-Ver1.png`, `s2-consent-*.png`) are left in
`gantt/public/help/screenshots/` as an archive; nothing references them from Help any more.

## Commands and results

Run from the repository root unless a directory is named.

| Directory | Command | Result |
|---|---|---|
| e2e | `GANTT_BASE_URL=http://localhost:5567 GANTT_API_URL=http://localhost:3000 npx playwright test -c config/playwright.config.ts --project=gantt tests/gantt/help/ --reporter=list --no-deps` | **PASS 75/75** (59.2s), including `help-recovery` (new Case 2 assertions) and `help-screenshots` "no help screenshot 404s while browsing every topic" — so all 5 new PNGs load |
| root | `npm run check:ui` | **PASS** — 0 hard violations (123 warnings) |
| gantt | `npx tsc --noEmit -p tsconfig.json` | Only the pre-existing `service-status-pill.tsx` errors (`livePort`, `checkedAt`), nothing new |
| root | `git diff --check` | **PASS** |

## Visual review

Rendered article captured by the same Playwright run:
`docs/assets/screenshots/gantt/help-recovery-recovery-case-002-Ver1.png` — visually inspected:
breadcrumb, `10 steps` badge, green overview, Partial warning, the ET incident paragraph, and the
embedded Alert Center capture all render; no horizontal clipping (the spec asserts
`scrollWidth <= clientWidth`).

Source UI captures archived under `docs/assets/screenshots/crew-recovery/`:

- `s2-et-alert-center-Ver1.png` — Alert Center, three 3007 rows for T2001/T2021/T2022
- `s2-et-recovery-fdp-discretion-Ver1.png` — FDP Discretion option with the Apply-disabled warning
- `s2-et-recovery-standby-Ver1.png` — 4 Executable standby teams with distinct GH costs
- `s2-et-recovery-swap-duty-Ver1.png` — J4021 Executable, K1014/K1015 Blocked, all Unpriced
- `s2-et-recovery-flight-delay-Ver1.png` — Flight Delay group with 0 options

## Boundaries — Case 2 stays Partial

- **FDP Discretion is communication only.** The controller sends the agreement request, the crew
  answer Yes/No in the Crew App, but **Apply stays disabled** until independent FDP legality
  execution is implemented. Consent does not override the FDP limit.
- **Flight Delay is empty for a published-delay trigger.** `visiblePlanGroups` lists the group for
  `published-delay-fdp`, but the option builder only creates a delay plan for an Assignment
  Overlap (`recovery-candidates.ts`, `if (trigger === 'assignment-overlap')`), so the group renders
  with 0 options.
- **No Apply / Save / recheck** has been demonstrated for Case 2. The case has not been taken to a
  written roster.
- **The delay is fixture data** written to SIT (ET2681 actual later than scheduled), not a
  rule-engine output. The `3007` rows in the Alert Center for this pairing are the frontend
  published-delay rows, not a persisted genuine FDP-exceedance (`rule_violation` has no 3007 row for
  T2001/T2021/T2022).
- **Swap candidates are Unpriced** and carry fleet-mismatch warnings; the specific candidate set
  moves with the loaded roster window (observed 3 candidates, of which 1 Executable).
- Candidate counts in the topic (Standby 4, Swap 3) follow the loaded data and can change between
  runs. The Help says so rather than freezing a number.
