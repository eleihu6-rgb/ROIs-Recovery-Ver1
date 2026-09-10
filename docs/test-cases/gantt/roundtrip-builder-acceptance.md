# Round-trip Builder Acceptance

Target: `https://cr.rois.one/altair/live`. Base ADD; outbound departure 20 September 2026; search through 24 September within the open Gantt range.

This run creates and retains exactly ten real pairings in the shared SIT database: three four-segment single-duty rotations, two two-segment single-duty rotations, and five rotations with genuine layovers. Coordinate this date/flight scope before running. Automatic retries are disabled because a failed run may already have committed pairings. Inspect the JSON receipt before any rerun; do not delete existing pairings or synthesize fixtures to make the test pass.

## Automated Run

For public live Gantt browser validation, use the Ryan planner account by setting `GANTT_TEST_USER=Ryan` and supplying `GANTT_TEST_PASS` from the local environment. Do not commit or document plaintext credentials.

From `e2e/`:

```sh
npx playwright test --config=config/roundtrip-builder.config.ts --grep RT-20260920
```

The test logs in with the existing UI page object and configured test account. All searches, selections and builds use real controls. Reading the app's own responses and read-only test hooks verifies persistence and rendering; no browser state mutation or direct write API is used. The public frontend must expose its existing `pairingPanelOrder` and `pairingSegments` read hooks.

The test first checks that the live search has all required shapes. It builds the scarce four-segment examples first, refreshes open flights after every commit, and verifies:

- Every first departure is 20 September in the actual active timezone.
- Each pairing starts and ends at ADD, connects at every airport, and has no overlapping or reused flights.
- Persisted flight IDs, segment timestamps and duty grouping match the selected complete rotation.
- Multi-segment duties obey the chosen block cap; layovers provide real free rest after debrief and before the next check-in, including the prior duty-period requirement.
- Persisted check-in/debrief anchors match the selected rules and appear in the loaded segment data.
- After every build the rendered `pairingPanelOrder[0]` is that receipt's pairing ID and `[1]` is the previous receipt's pairing ID.
- Every critical scope, search, preview and committed-pane checkpoint has a new versioned screenshot under `docs/assets/screenshots/gantt/roundtrip-builder-*-Ver<N>.png`.

The Playwright output contains `roundtrip-builder-receipt.json`: committed pairing IDs, selected flight IDs, duty/segment counts, verified rest minutes, pane order and screenshot paths. It is written immediately after every successful commit so partial failures remain reviewable. Traces are disabled to avoid preserving login credentials.

## Manual Checks

| Case | Procedure | Expected |
|---|---|---|
| Scope | Open builder; inspect defaults, select ADD/fleet and dates; edit one scope field after search. | Dates remain inside open Gantt range; editing invalidates old results. |
| Complete rotation | Select an outstation connecting flight. | Preview includes the complete ADD-to-ADD rotation, including its preceding outbound. |
| Four segments | Select a four-segment single-duty result. | All four segments appear; short turns are not labelled as layovers. |
| Layover | Select a multi-duty result. | Actual ground interval and free rest are distinguishable; no invented rest. |
| Single commit | Build the selected result. | One pairing persists; the full new pairing appears at row 1 immediately. |
| Successive commit | Repeat a selected build. | Latest pair at row 1, prior pair at row 2; screenshots match IDs. |
| Search freshness | Find open flights again after a successful build. | Consumed operating flights are unavailable for another matching-division build. |
| Selection | Select a flight, then clear selection. | Single preview is cleared and the batch action reflects eligible rotations. Do not execute batch in the ten-pair acceptance scope. |
| Existing filters | With an existing restrictive pairing filter/sort, build one approved selected candidate. | New result focus remains visible; clearing focus restores normal order/filter behavior. |
| Scenario | Open a Scenario Gantt. | Live-only builder is absent or unavailable. |

## Read-only Feasibility Receipt

On 9 September 2026, the authoritative `live-server/.env` connection reported `f8_sit_live`. A read-only query of active flights without active Pilot (`P`) pairing coverage, followed by the production chooser with default rules and UTC 20-24 September scope, returned these outbound-20-September counts:

| Fleet | Layover | Two segments, one duty | Four segments, one duty |
|---|---:|---:|---:|
| 7M8 | 14 | 13 | 3 |
| 738 | 1 | 1 | 2 |
| 73W | 1 | 2 | 0 |
| 788 | 6 | 2 | 0 |
| 789 | 8 | 0 | 0 |

The three 7M8 four-segment candidates used flight IDs `154953,154986,154895,154925`; `154227,154258,154749,154780`; and `154685,154723,154168,154203`. These are evidence of availability at audit time, not hardcoded creation fixtures. The acceptance test discovers current candidates from the UI search and fails truthfully if concurrent changes consume them.

No data was created, repaired or deleted during this feasibility audit. A syntax/list check is not a completed acceptance run; the actual Playwright run receipt is required for delivery.

## Completed Receipts

The ten-build run passed and created retained pairing IDs **151836-151845**. Its original receipt is preserved in `roundtrip-builder-ten-build-receipt.json`, including every row-1/row-2 observation and versioned build screenshot. Three four-segment duties, two two-segment duties and five layover pairings were created.

The subsequent read-only public regression passed on 9 September 2026:

```sh
cd e2e
npx playwright test --config=config/roundtrip-builder.config.ts --grep RT-read-only
```

Latest result: **1 passed (8.7s)** on 9 September 2026, **zero build requests**, one read-only search. The test held the actual first options response to reproduce close/reopen during loading, checked narrow/wide fleet defaults and preservation of customized counts through the multi-fleet selector, rejected out-of-range and reversed dates before search, verified the `Link` column renders route/date candidates with one preferred green option, excluded all previously consumed flights, verified the exact enabled Build-all count, selected an interior return flight and cleared selection, and checked search invalidation after a rule edit. Authenticated GET requests revalidated all ten retained pairings against their original receipt: base loops, shapes, timestamps, check-in/debrief anchors and real rest.

The retained follow-up receipt is `roundtrip-builder-readonly-receipt.json`. Existing screenshot checkpoints now end in `Ver6`; the new Link checkpoint is `docs/assets/screenshots/gantt/roundtrip-builder-readonly-link-candidates-Ver3.png`. No additional pairing was created by the read-only run.

Use the `--grep RT-read-only` command for repeat checks. Running the entire config also selects the ten-write test and must not be used as a routine read-only regression.
