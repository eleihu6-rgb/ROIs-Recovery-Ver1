# PR route-map arrival-airport regression — 2026-10-08

## Cause and scope

PR `selectPortalCalendarDetailAll` supplies departure as `dep` and arrival as
`arp`. The airport enrichment parser ignored `arp`, leaving imported flight
arrivals blank. Consequently the map had no routes and distance was zero even
though the month had flights and known departure airports.

The parser now reads the exact `arp` field before fuzzy aliases. This avoids
confusing it with `depArp`, `arpIntervalHour`, or `flightBookingLocator`.
Existing TG aliases remain covered. The follow-up simulator coverage check found
that PR 473006 also visits HND, absent from the offline coordinate table. HND was
added through the generator and to `scripts/data/extraAirports.txt`.

There is no `live-server/.env` in this checkout, so the HND coordinate comes from
the Civil Aviation Bureau's [Japan AIP RJTT airport chart hosted by ANA](https://www.anaas.ana-g.com/img/business/general_aviation/pdf/hnd-rjtt.pdf):
ARP 35°33′12″N / 139°46′52″E, materialized as 35.5533 / 139.7811.
Existing coordinate rows were preserved, and no database writes were made.
This fix advanced the app version to 160; concurrent work subsequently advanced
the shared version file further. The build-cache directory retains its original
`156` name and is not an installed-version identifier.

## Repeatable checks

From `crew-app/`:

```sh
node scripts/genAirportCoords.mjs /tmp/crew-route-airports-160.tsv
npx jest __tests__/features/prRouteMap.test.ts __tests__/features/portalCapture.test.ts __tests__/features/schedRosterViews.test.ts --runInBand
npx tsc --noEmit
```

- Coordinate generation: **PASS**, 191 airports / 185 coordinate entries. The
  TSV preserved the existing 190 rows and added the cited HND reference point.
- Regression before fix: **FAIL**, both arrival airports were empty.
- HND reference regression before adding HND: **FAIL**, coordinate was null.
- Focused Jest after both fixes: **PASS**, 3 suites / 56 tests. Includes the full
  MNL–TPE–MNL rotation, account ownership, route count, distance and block time.
  It also checks every airport in 473006's captured October roster.
- TypeScript: **FAIL**, existing errors in `dutySwapMarket.test.tsx`,
  `myDutyScreen.test.tsx`, `myTripsTabs.test.tsx`, `NotificationsScreen.test.tsx`
  and `TripCards.test.tsx` (mock tuple/implicit-any types and missing
  `react-test-renderer` declarations). No reported errors in changed files.

From `crew-app/ios/`:

```sh
xcodebuild build-for-testing -workspace RoyceTravelTemplate.xcworkspace -scheme RoyceTravelTemplateUITests -configuration Release -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/crew-route-sim-156 -jobs 6 CODE_SIGNING_ALLOWED=NO
xcodebuild test-without-building -workspace RoyceTravelTemplate.xcworkspace -scheme RoyceTravelTemplateUITests -configuration Release -destination "id=$ROUTE_SIM_UDID" -derivedDataPath /tmp/crew-route-sim-156 -parallel-testing-enabled NO -only-testing:RoyceTravelTemplateUITests/DuoFitUITests/testPRRouteMapArrivalAirports
```

Run once per device with test-runner variables:
`TEST_RUNNER_ROUTE_DEVICE=air|duo`, `TEST_RUNNER_DUO_ORIENTATION=portrait|landscape`,
`TEST_RUNNER_DUO_SHOT_DIR` pointing to `docs/assets/screenshots/crew-app`, and
`TEST_RUNNER_ROUTE_SHOT_VERSION` incremented for each repeated capture.
Inject `TEST_RUNNER_DUO_PR_PASSWORD` from the test credential configuration;
do not put the value in logs or documentation.
`TEST_RUNNER_ROUTE_CREWS` optionally narrows a follow-up to a comma-separated
crew list; default is all three PR crews. The final HND follow-up on Duo uses
`473006`, after all three had already passed on that device.

Air: `D8409020-8121-4F25-AC0F-A6C1ABA9B12F`.
Duo Test: `08ACE4EC-2508-4DD8-9989-461C1DEF4D72` (unfolded landscape).
Use `ios/scripts/duo-shot-watcher.sh` for Duo screenshots from the same test run.

## Real UI acceptance

1. Sign out to discard the previous partial import, then sign in through the PR
   test portal as each of 487424, 465800 and 473006.
2. Confirm the crew ID in Profile, open Schedule → Route map for October 2026.
3. Confirm MNL base, rendered map, positive flight/route/distance statistics,
   working zoom controls and (487424) the MNL–TPE destination row.
4. Capture the map in the same automated run and inspect the image.
5. Switch to TG, navigate to its published September 2026 month, and verify its
   own identity, BKK map and no retained PR base. The account has no October flights.

Native build: **PASS**. Initial Air run: PR checks passed; the suite failed
because the TG check incorrectly expected October flights. The test was updated
to select September through the real month control. Initial Duo run after this
test correction: **PASS**, including all three PR accounts and TG.

The Air follow-up also exposed the portal's explicit **Use roster** fallback.
The native test helper now accepts that real UI confirmation once, then waits
for Home; this avoids repeated taps during modal dismissal. Earlier timeout and
transition-race failures were resolved in the test helper before the final run.

Final Air selected rerun: **PASS**, PR 465800, PR 473006 and TG account switch
(280.680 seconds). PR 487424's map checks and screenshot had already passed in
the preceding Air run before that run reached the portal fallback for 465800.
Final Duo HND follow-up: **PASS**, PR 473006 (all seven routes including HND)
and TG account switch (152.389 seconds).

| PR crew, October 2026 | Flights | Routes | Distance km | Air evidence | Duo evidence |
|---|---:|---:|---:|---|---|
| 487424 | 13 | 7 | 64,033 | [Ver2](../../assets/screenshots/crew-app/route-map-air-487424-Ver2.png) | [Ver1](../../assets/screenshots/crew-app/route-map-duo-487424-Ver1.png) |
| 465800 | 10 | 4 | 65,975 | [Ver3](../../assets/screenshots/crew-app/route-map-air-465800-Ver3.png) | [Ver1](../../assets/screenshots/crew-app/route-map-duo-465800-Ver1.png) |
| 473006 | 14 | 7 | 62,620 | [Ver3, HND included](../../assets/screenshots/crew-app/route-map-air-473006-Ver3.png) | [Ver3, HND included](../../assets/screenshots/crew-app/route-map-duo-473006-Ver3.png) |

TG's September control: 8 flights, 4 routes, 35,631 km, BKK base.
[Air Ver3](../../assets/screenshots/crew-app/route-map-air-35459-Ver3.png) and
[Duo Ver3](../../assets/screenshots/crew-app/route-map-duo-35459-Ver3.png).

For the final selected reruns, the environment additionally sets:

```sh
# Air: completed 487424 separately; recheck the remaining PR crews and TG.
TEST_RUNNER_ROUTE_DEVICE=air TEST_RUNNER_ROUTE_CREWS=465800,473006 TEST_RUNNER_ROUTE_SHOT_VERSION=3
# Duo: all PR crews passed earlier; recheck 473006 with HND, then TG.
TEST_RUNNER_ROUTE_DEVICE=duo TEST_RUNNER_ROUTE_CREWS=473006 TEST_RUNNER_ROUTE_SHOT_VERSION=3
```

All linked completed screenshots were captured in the corresponding native UI
run and visually inspected. Earlier screenshots are retained.

Playwright is not run: this target is a native iOS React Native screen with no
browser surface. XCUITest drives the real login, profile and schedule controls
instead. No API injection or mocked roster substitutes for the UI run.
This changes crew-app import parsing, not PBS bidding business rules.

The supporting agent inspected simulator/build setup read-only; the primary
agent reviewed the findings and owns the fix, test assertions and visual review.
