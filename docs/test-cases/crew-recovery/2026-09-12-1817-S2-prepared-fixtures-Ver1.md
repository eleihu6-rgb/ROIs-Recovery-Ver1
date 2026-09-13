# S2 — Flight Delay: prepared fixtures and verification

Prepared 2026-09-12, America/Vancouver. **Status: pre-incident data prepared; FDP recovery acceptance pending.** No delay, discretion execution, recovery swap or cancellation has been applied. The original HKG-stranding versus pre-departure SIN variant remains open, as does the approved governing FDP ruleset. Crew-app agreement work is tracked in the [consent design](../../superpowers/specs/2026-09-12-S2-discretion-consent-design.md) and [real controller/mobile verification receipt](2026-09-12-S2-discretion-consent-evidence-Ver1.md).

## Isolation and source

All 39 pilots are new synthetic SIN/B787 crew, S21001–S21039, with distinct IDs from Case 1. This is a synthetic fixture, not verification of the originally narrated David Chen/Sarah Kim/James Lee identities. The crew fixture uses the [existing seed configuration](fixtures/s2-sin-b787-crew-Ver1.json).

Source pairing **152548**, **PI201/PI202**, 28 September 2026:

| Flight ID | Flight | Route | Scheduled departure / arrival UTC |
|---|---|---|---|
| 160988 | PI201 | SIN → HKG | 06:00 / 10:00 |
| 160989 | PI202 | HKG → SIN | 11:00 / 15:00 |

Assigned source: S21001 Maya Chen (CA), S21014 Daniel Chen (FO), S21015 Ethan Koh (FO). The existing composition update function sets the user-described CA1/FO2 requirement; all seats are filled. This composition alone does not establish legally approved augmentation.

The existing pairing builder/Rust calculation stores planned FDP **660 minutes**, report 04:00Z, debrief end 15:15Z. No revised estimate exists. Current schema requires actual-time fields even for future schedule rows; the fixture follows existing schedule creation conventions with actual-shaped values equal to scheduled times and flight_flag=S. Those values are not evidence the flights operated. Any future incident publish must preserve the distinction between forecast and actual operation.

## Candidate teams and computed costs

Each team consists of one captain and two first officers. The primary captain selection has six separate standby choices and six donor choices prepared in data; **their selectable status in a genuine FDP Recovery dialog has not been verified**.

| Team | Standby CA | Standby FOs | Saved month credit per pilot | Standby CA incremental GH cost USD |
|---|---|---|---|---|
| 1 | S21002 | S21016, S21017 | 81:00 | 300 |
| 2 | S21003 | S21018, S21019 | 82:00 | 420 |
| 3 | S21004 | S21020, S21021 | 83:00 | 540 |
| 4 | S21005 | S21022, S21023 | 84:00 | 675 |
| 5 | S21006 | S21024, S21025 | 85:00 | 825 |
| 6 | S21007 | S21026, S21027 | 86:00 | 855 |

Each standby pilot has a saved ASBY at SIN, 28 September 00:00–08:00Z, covering source report time. Its existing assignment policy supplies 240 minutes baseline credit. Source flight departure is 06:00Z. The calculator applies its current departure cutoff/callout-credit policy; the numbers above come from the function's breakdown, not simple assumed rate multiplication.

| Team | Donor CA | Donor FOs | Donor pairing | Saved month credit per pilot | Both-CA swap incremental GH cost USD |
|---|---|---|---|---|---|
| 1 | S21008 | S21028, S21029 | 152569 | 87:00 | -240 |
| 2 | S21009 | S21030, S21031 | 152590 | 87:30 | -300 |
| 3 | S21010 | S21032, S21033 | 152611 | 88:00 | -360 |
| 4 | S21011 | S21034, S21035 | 152632 | 88:30 | -420 |
| 5 | S21012 | S21036, S21037 | 152653 | 89:00 | -480 |
| 6 | S21013 | S21038, S21039 | 152674 | 89:30 | -540 |

Donor pairings are separate SIN–DXB–SIN rotations, departing SIN at 10:00Z on 28 September, with a real overnight ground gap before the return. Each has two duties and CA1/FO2 coverage. Block credit ranges 15:00–17:30. They are not yet validated as the narrative's augmented-crew remedy.

Negative swap amounts are pay savings: the source captain is below the guarantee before and after; the donor captain loses more credit than received and moves below the guarantee. The existing calculator includes both crews' before/after pay. These are **individual captain-swap comparisons**, not whole three-pilot-team totals, payroll postings or composite commercial costs. Price every affected seat if choosing a whole-team plan.

## How credit was prepared

No aggregate credit totals, shared tariffs or legality parameters were edited. The existing services created 126 candidate/history pairings and 252 new physical flight records, plus the separate two-flight source pairing. All pairings are same-airline, same-fleet base-to-base loops. Earlier synthetic SIN regional round trips provide the scheduled monthly credit; each standby team has 11 earlier duties, and each donor team has nine earlier duties plus its donor rotation. Regional block times range 4–8 hours per complete round trip, using SGN/BKK/HAN/MNL/HKG as appropriate. No candidate flight is shared with Case 1.

Existing functions used: `flightService.create/update`, `pairingBuildService.build`, `pairingService.updateComposition`, `rosterService.assignPairing/createGroundTask`, and the scoped calendar-month `manday-tool.recompute`. The 12 donor flights were retimed by four hours through the existing update/propagation function to make their departures later than the source. The final driver recomputed only S21001–S21039 for September: 39 crews, 417 daily records, 39 monthly and 39 yearly aggregates.

The current guarantee policy is revision 1, USD100/hour, GH85 with configured tiers through 90 and above 90. Standby revision 17 pins that guarantee policy. `calculateStandbyGhCost` and `calculateSwapGhCost` produced six distinct finite USD totals per method from the saved records. No costs are assumed for unsupported commercial components.

## Verification receipts

All `.local` commands below were run from the repository root; their raw manifests remain private local development artifacts. They contain no reusable blanket reset permission.

| Command | Result / boundary |
|---|---|
| Existing `seed-crew.mjs` with `s2-sin-b787-crew-Ver1.json`, first `--dry-run`, then real run (service environment loaded privately) | PASS: 39 created, zero reused; SIN base reference added |
| `node --import ./live-server/node_modules/tsx/dist/loader.mjs .local/s2-case/create-source.cjs` | PASS: two source flights, pairing152548, six crew×leg assignments |
| `node --import ./live-server/node_modules/tsx/dist/loader.mjs .local/s2-case/create-candidates.cjs` | PASS: six standby teams, six donor teams, 126 separate history/donor pairings |
| `node --import ./live-server/node_modules/tsx/dist/loader.mjs .local/s2-case/finalize-candidates.cjs` | PASS: only owned donor flights retimed; scoped authoritative month credit recomputed |
| `node --import ./live-server/node_modules/tsx/dist/loader.mjs .local/s2-case/verify-costs.cjs` | PASS: six distinct saved-data costs per captain method |
| `node .local/s2-case/crew-ui.cjs` | PASS: **headless** real login → Live → SIN filter, 39 crew, 18 ASBY rows, six donor pairings, source CA1/FO2 coverage and six source leg assignments |
| `node .local/s2-case/check-protected.cjs` | PASS: Case1's 10 crew/61pairings/148flights/158active roster rows, composition, segments and absences exactly match the pre-write snapshot |

Screenshot from the headless run: [S2 prepared rosters](../../assets/screenshots/crew-recovery/s2-isolated-crew-pool-Ver2.png), visually inspected. Ver1 is preserved. Initial test attempts required correcting the current dropdown selector, reading `CrewStore.items[].crew`, and using `createPrefixedRedis` with cache utilities; the latter matters because `withPrefix` is now a no-op. The screenshot's RP credit display is not the calendar-month GH input.

## Remaining acceptance and reset boundary

- The configured f8_sit_live database has no 3007/2107/3010/2102 instances. Select approved FDP parameters before proving a mandatory FDP alert, legal extension, or six executable replacement choices. Do not add arbitrary limits to make the test pass.
- QIUXIA81's current Recovery routing is still 1001/8004. The delay-induced FDP entry and corresponding eligibility/forecast calculation need validation/extension within that framework. No artificial overlap was created to substitute for S2.
- A complete-pairing swap cannot move a crew from HKG to SIN or rewrite flown PI201. The outstanding operational-variant question controls that execution design.
- No recovery Preview/Apply/Save, six selectable FDP candidates, total composite score, cancellation, external notification completion or customs execution is claimed by this fixture receipt. Crew agreement verification has its own evidence.
- Leave this **pre-incident prepared baseline** in place. Do not run creation scripts again when receipts exist. Restore future saved option effects only against `.local/s2-case/source-created.json`, `candidates-created.json`, `finalized.json` and a fresh incident snapshot; preserve the complete protected Case1 manifest. Never reuse Case1 reset scripts or delete all S2 rows as an unreviewed cleanup.

## Final preparation review

The parent reviewed the delegated consent service, routes, controller component and
mobile changes independently. Review identified and requested corrections for
reloaded feedback using current rather than immutable requested windows, and
refresh failing to synchronize parent feedback. Both corrections were implemented and the parent reran
`cd gantt && npm test -- src/components/recovery/__tests__/discretion-consent-panel.test.tsx`
— PASS, two tests. The parent visually inspected the actual mobile request/rejected
reply and fresh controller Yes/No/Pending screenshots in the separate consent
receipt. These prove communication, not permission to execute an extension.

Additional checks from the repository root unless a working directory is named:

- `node .local/s2-case/check-protected.cjs` — PASS again after consent preparation;
  original Case 1 records remain unchanged.
- In `gantt`: `npm test -- src/services/__tests__/recovery-trigger.test.ts src/services/__tests__/recovery-candidates.test.ts src/services/__tests__/recovery-draft.test.ts src/services/__tests__/recovery-flight-delay.test.ts src/services/__tests__/recovery-standby-gh.test.ts src/services/__tests__/recovery-swap-duty.test.ts src/services/__tests__/recovery-swap-gh.test.ts` — PASS, 71 tests / seven files. Existing framework regression only, not S2 execution.
- `npm run check:ui` — PASS, zero hard violations, 124 existing warnings.
- In `gantt`: `./node_modules/.bin/tsc --noEmit -p tsconfig.json` — FAIL in unchanged
  `service-status-pill.tsx:104,115,116`: `ServiceEntry.livePort` and
  `SystemStatus.checkedAt` are missing. No clean full frontend typecheck is claimed.
  An initial `tsconfig.app.json` invocation failed because this module has only
  `tsconfig.json`; the command above is the corrected check.
- In `gantt`: `npm run generate:dev-skills` — PASS, 48 catalog entries regenerated.
- `node .local/s2-case/skill-ui.cjs` — PASS: headless real login → Dev access → Skill
  145, asserting revised flight-delay scope and shared evidence workflow. Screenshot
  [recovery skill](../../assets/screenshots/crew-recovery/s2-recovery-skill-Ver1.png)
  was visually inspected; no headed Playwright window was opened.
- `PYTHONPATH=/tmp/rois-s1-skill-validator python3 /Users/kimi/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/145-crew-recovery-case-study`
  — PASS. Relative links in skill145 and both S2 records checked — PASS.
- `git diff --check` — PASS.
