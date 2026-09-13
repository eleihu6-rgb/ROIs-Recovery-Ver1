# S1 — Six swap candidates with incremental GH costs

2026-09-12, America/Vancouver. Real headed Chrome / public Live UI, Ryan controller account. Source remains J4002 Getnet Kifle, ADD CA, 7M8, pairing152056 and saved SL/FLY rule1001 overlap. This extends the existing case rather than creating another crew-mobile absence request.

## Final result

Five additional **existing crew masters** J4014–J4018 were prepared with genuine saved duties, alongside existing J4005. Final UI: **6 available, 6 executable, 0 filtered**, no fleet-mismatch warnings. All six independently passed cost breakdown, Preview, **Apply four draft operations → Undo**. **No swap Save or payroll posting was performed.** Browser left on the full swap list with zero draft operations.

| Crew | Name | Donor pairing | September saved credit before | Projected after swap | Incremental GH quote |
|---|---|---:|---:|---:|---:|
| J4005 | Tsegaye Wondimu | 152097 | 15:15 | 22:35 | USD 0.00 |
| J4014 | Melaku Mekonnen | 152093 | 17:25 | 24:15 | USD 0.00 |
| J4015 | Dereje Wolde | 152093 | 17:35 | 24:25 | USD 0.00 |
| J4018 | Berhanu Mamo | 152106 | 78:30 | 86:05 | USD 130.00 |
| J4016 | Aster Zewde | 152097 | 80:40 | 88:00 | USD 360.00 |
| J4017 | Shimelis Beyene | 152106 | 81:20 | 88:55 | USD 470.00 |

These are full-calendar-month saved planned credits, not already-flown hours and not RP MCred. GH floor85h, default Cost Library guarantee revision1, USD100/hour with1.2 multiplier through90h and1.5 above90h. All three positive final examples cross85h but remain below90h. No policy rates or credit aggregate values were manually edited.

### Both crews count

Source pairing credit15:15. Donor credits: 152093=08:25, 152097=07:55, 152106=07:40. For each side:

`Pay(saved month credit − outgoing pairing credit + incoming pairing credit) − Pay(saved month credit)`

J4002 starts77:35 and finishes70:45 /70:15 /70:00 respectively, so the source contribution is USD0 for these fixtures. The code also retains negative source savings in other cases; it does not clamp them or count the incoming duty without removing the outgoing one. Displayed quotes are **GH pay only**, not all operational disruption costs or a complete composite score.

## Real setup and model flow

Controller-facing Recovery generates candidates from loaded Live roster data and invokes current legality checks. Costs use the existing CostLibraryService guarantee calculator. Credit baseline was recomputed by the existing Rust manday driver. No optimization solver or AI language model chooses the crew.

Setup was performed through authenticated normal roster assignment APIs, not falsely described as manual UI or crew-mobile creation. The original98 active scoped roster rows remained byte-for-byte unchanged. Final setup adds60 active roster rows across the five candidates; abandoned setup rows were soft-deleted only after matching exact assignment receipts.

| Candidate | Additional credit-building pairings retained (besides its original duty and donor) |
|---|---|
| J4014 | None |
| J4015 | None |
| J4016 | 150503,150858,151041,151182,151455,151818,151838,152031 |
| J4017 | 150537,151004,151236,151443,151757,151833,152218,151993 |
| J4018 | 150518,150969,151115,151238,151450,151814,151844,152003 |

The donor pairings are ADD→DXB→ADD (152093), ADD→DMM→ADD (152097), and ADD→AMM→ADD (152106), all7M8. Each has configured CA plan2. Two candidates can hold distinct captain seats on the same donor pairing; final coverage was checked against capacity, not overfilled.

Final donor assignment rows:
- J4014/152093:1355588–1355589
- J4015/152093:1355620–1355621
- J4016/152097:1355622–1355623
- J4017/152106:1355391–1355392
- J4018/152106:1355624–1355625

Source rows1355154–1355159 remain assigned to J4002. Standby fixtures J4011–J4013 remain unchanged. Temporary SL1355350 remains deliberately as the immediate replay trigger; final full-case cleanup has not removed it. Never use historic Case1 reset scripts with obsolete assignment IDs.

## Step-by-step UI test

Each candidate started from an equivalent saved incident state. Screenshots are under `docs/assets/screenshots/crew-recovery/`.

| Step | Crew control | Crew actor | Module/model | Action / expected and actual result | Evidence |
|---|---|---|---|---|---|
| 1 | Test operator | None | Saved roster API + Rust manday | Capture scoped baseline; prepare five donors and real credit duties; recompute September. No artificial totals. | Private `.local/s1-swap-gh/` setup/assignment/refinement receipts |
| 2 | Ryan | J4002 | Live → Alert Center | Load ADD pilots and click the recoverable J4002/1001 overlap row. Click Recovery selected. | Existing SL trigger retained, not new mobile submission |
| 3 | Ryan | All six candidates | Recovery → Swap duty → All | Wait for real checks. Assert six enabled checkboxes, six candidates, zero filtered and no fleet mismatch. | `s1-swap-gh-six-selectable-Ver1.png`; final reread `s1-swap-gh-list-Ver4.png` |
| 4 | Ryan | Candidate and J4002 | Recovery cost breakdown | Select candidate checkbox; click its cost. Assert exact USD quote, candidate and source GH rows, before/after credit and excluded-cost notes. Repeat all six. | `s1-swap-gh-<crew>-cost-Ver1.png` |
| 5 | Ryan | Candidate and J4002 | Recovery Preview | Click Preview and inspect before/after rosters; click Options to return. Preview shows the affected two crews, not six alternatives. | `s1-swap-gh-<crew>-preview-Ver1.png` |
| 6 | Ryan | Candidate and J4002 | Recovery → draft store | Click Apply. Assert four draft operations: remove both original crew/pairing assignments, add each crew to the other pairing. | `s1-swap-gh-<crew>-draft-Ver1.png` |
| 7 | Ryan | Same | Live draft toolbar | Undo until draft count0. Never click Save. Reopen1001 Recovery before the next candidate. | Automated PASS for all six |
| 8 | Ryan | All six | Recovery → Swap duty | Return to full list, assert six available/zero filtered and zero draft. Leave browser stationary for user. | `s1-swap-gh-restored-Ver1.png` |
| 9 | Test operator | Scoped fixture | Read-only SQL / manifests | Verify original98 rows untouched, source flight timing unchanged, only five authorized crews gained60 setup rows, coverage within capacity. Save final ready baseline. | `.local/s1-swap-gh/ready-baseline.json` |

### Why another browser may show only two

The current Recovery dialog explicitly uses **Loaded Live data only**. Existing dialogs may also retain pre-setup snapshots. Close Recovery, refresh Live with ADD pilots including J4014–J4018 loaded, then reopen J4002/1001 → Recovery selected → Swap duty → All. On a shorter screen, scroll the candidate pane. The two affected crews in Preview are not the candidate count. The cost-tier sidebar count is also not a count of all candidate crews.

## Failures corrected during preparation

1. Initial greedy high-credit schedules would form long consecutive-duty stretches. Replaced only owned setup duties with schedules conservatively limited to five consecutive base-local occupied dates across the swap window. Final credit is lower than the first80/86/92 target plan; do not reuse those obsolete numbers.
2. Some initially selected donor pairings had738/788/73W segments. The UI allowed selection but showed fleet warnings; these were not accepted as demo-ready. Replaced owned donors with7M8 pairings instead of changing crew qualifications or suppressing warnings.
3. Two7M8 donors generated7504 WOCL-rest findings for the source after swap. Another donor reported/departed on the next ADD-local business date and disappeared from the same-day search. Replaced those donors with valid existing captain seats; final real Recovery gate passes all six.
4. A read-only review identified missing-context generic-pricing fallback and a roster-side duty-credit consistency gap. Added Unpriced fallback for missing swap identities, consistency and exact segment-mapping guards; real SQL EXPLAIN and API smoke passed afterward.

## Implementation / verification receipts

New service: `live-server/src/services/recovery/swap-gh-cost.ts`. Optional swap identity context flows through recovery cost route, frontend API and candidate mapping. `swap-duty` now carries two changes. Same-base pilot single-month GH estimate rejects incomplete assignments, missing credit/policy and unsupported cross-base/follow-on contexts. Default effective policy is not asserted to be an individually verified employment contract.

- `cd live-server && npx vitest run src/services/recovery/standby-gh-cost.test.ts src/services/recovery/swap-gh-cost.test.ts` — **PASS29 tests**.
- `cd gantt && npx vitest run src/services/__tests__/recovery-swap-gh.test.ts src/services/__tests__/recovery-standby-gh.test.ts src/services/__tests__/recovery-swap-duty.test.ts src/services/__tests__/recovery-draft.test.ts src/services/__tests__/recovery-candidates.test.ts` — **PASS48 tests**.
- `node --import ./live-server/node_modules/tsx/dist/loader.mjs .local/s1-swap-gh/check-sql.cjs` — **PASS three real SIT EXPLAINs and baseline calculation**.
- `node .local/s1-swap-gh/api-smoke.cjs` — **PASS authenticated six-candidate batch**, exact0/0/0/360/470/130 USD; missing context and unsupported cross-base return null, not zero.
- `NODE_PATH=/tmp/rois-s1-tools/node_modules node e2e/scripts/recovery-s1-swap-gh.cjs` — **PASS six candidates, both-crew breakdown, Preview, Apply4/Undo, no Save**.
- `node .local/s1-swap-gh/ui-open.cjs` — **PASS final post-guard real UI reread, six executable/no filtered**, versioned screenshot.
- `node .local/s1-swap-gh/final-verify.cjs` — **PASS preserved original roster and flight timing, prepared baseline retained**.
- `npm run check:ui` — **PASS**,0 hard violations,124 existing warnings.
- TypeScript checks remain **FAIL outside touched recovery code**: backend `legality-preview.ts:288` dimension type; frontend `service-status-pill.ts` missing `livePort`/`checkedAt`. No clean full build claimed.

Supporting agent produced bounded test files and read-only cost review; primary reviewed the changes, addressed findings and verified the UI/screenshots. No commits or pushes. Full committed swap/delay execution, CCX integrations and Help publication remain separate outstanding case work.
