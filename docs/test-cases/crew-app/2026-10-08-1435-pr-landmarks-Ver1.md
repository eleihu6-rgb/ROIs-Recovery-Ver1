# PR destination landmark coverage — 2026-10-08

## Scope and finding

The user supplied ten PR test crew IDs and a Destination screenshot showing SEA
with the generic flight image. `cityForAirport` lacked SEA, DOH, DAD, RUH and BKK.
Version 167 adds bundled photos and city names through the existing shared city
catalog. Home and Destination consume that catalog on iPad, Air and Duo; no
breakpoints, screen geometry, roster ownership or operational data were changed.
It also uses the user's supplied SIN Merlion/Marina Bay Sands image (JPEG encoded
at original dimensions, no crop/retouch). A native screenshot exposed stale SVG
photo-scrim bounds after rotation; numeric live pane dimensions on both SVG and
Rect plus a size-key remount fix that rendering issue, with regression coverage.
The fixed-height top header tint remains unchanged.

The supporting agent performed the read-only October 2026 roster audit. The
primary reviewed the login/token protocol against `portalClient.ts`, the roster
endpoints against `portalInjectedJs.ts`, the mappings, and all selected photos.
Requests used the existing PR TEST portal and runtime-loaded test credential;
no credentials, tokens, full roster payloads or crew names were retained here.

| Crew | Observed airport coverage (including base) | Previously missing |
|---|---|---|
| 452320 | CGK HKG LAX MNL SFO SIN | None |
| 487424 | HAN LAX MNL NGO PVG SFO SIN TPE | None |
| 540753 | DOH LAX MNL | DOH |
| 473006 | BKK HKG HND MEL MNL PVG SYD YVR | BKK (existing photo reused) |
| 486541 | Not retrieved: login HTTP 200/code 0, no token | Unknown |
| 563044 | CEB DAD ICN LAX MNL YVR | DAD |
| 465800 | BKK HNL MNL NRT SEA | SEA, BKK |
| 479274 | FUK HKG HND MNL NGO NRT PVG RUH TPE | RUH |
| 532510 | CGK DVO HND HNL LAX MNL RUH SIN | RUH |
| 493055 | Not retrieved: login HTTP 200/code 1, no token | Unknown |

This is October coverage only, not a claim about all future destinations. Both
unavailable accounts failed before roster requests; neither is an empty-roster
result. No password attempts beyond the existing shared test credential.

Audit requests after the existing public-key/RSA login:

- `GET /api/rosterFlight/selectCrewRosterReport`
- `GET /api/rosterFlight/selectPortalCalendarDetailAll`, `type=rp`
- Query: requested `crewId`, `startDateTime=2026-10-01T00:00:00`,
  `endDateTime=2026-10-31T23:59:59`; existing token/userId headers.

## Photos

Provenance and reproducible download URLs live in
`crew-app/scripts/data/cityPhotoSources.json`. Public-domain/CC0 sources are
bundled as JPEGs, not fetched on-device. No generated landmark imagery or local
image edits. Seattle: Space Needle; Doha: waterfront skyline; Da Nang: Dragon
Bridge; Riyadh: Masmak Fort. Downloaded originals/thumbnails visually inspected.
Seattle was replaced by a centred Caleb Ekeroth CC0 image after the first native
capture showed the diagonal image's tower clipped in portrait. SIN is
user-supplied; external publication rights were not independently verified.

## Validation

From `crew-app/`:

```sh
npx jest __tests__/features/citiesPR.test.ts __tests__/features/cities.test.ts __tests__/features/destinationView.test.tsx __tests__/features/duoLayout.test.ts --runInBand
node scripts/cityImageReport.mjs
npx tsc --noEmit
```

- Before mapping changes: **FAIL as expected**, four missing-city regressions.
- Expanded roster test caught BKK missing for two accounts; added the existing
  Bangkok image mapping. Final focused Jest: **PASS**, 4 suites / 62 tests,
  including supplied-SIN asset hash and live photo-scrim rotation regression.
- Image budget: **PASS**, 71 files / 13.49 MB, below 14 MB. Full-resolution SIN
  is 886 KB and triggers the 450 KB advisory warning; all other photos are below it.
- TypeScript: **FAIL**, existing errors in dutySwapMarket, myDutyScreen,
  myTripsTabs, NotificationsScreen and TripCards tests; no changed-source errors.
- Root `npm run check:ui`: **PASS**, 0 hard violations / 124 existing warnings.
- `git diff --check`: **PASS**.

Native UI uses XCUITest rather than Playwright because this is a native iOS
React Native screen with no browser surface. New test
`DuoFitUITests/testIPadPRDestinationLandmarks` logs in through the actual UI as
465800/540753/563044/532510/452320, opens SEA/DOH/DAD/RUH/SIN, asserts the city name, captures
portrait and landscape, opens Trip details and returns, then switches to TG
35459 and verifies carrier/identity isolation. Screenshots use XCUIScreen to
avoid stale portrait-bound crops after rotation.

```sh
# crew-app/ios; inject TEST_RUNNER_DUO_PR_PASSWORD securely from existing config.
# TEST_RUNNER_IPAD_SHOT_DIR=<absolute docs/assets/screenshots/crew-app>
# TEST_RUNNER_IPAD_SHOT_VERSION=1
xcodebuild test -workspace RoyceTravelTemplate.xcworkspace -scheme RoyceTravelTemplateUITests -configuration Release -destination 'id=7E7EB9CC-3407-4103-9959-E159E143B68A' -derivedDataPath /tmp/crew-ipad-sim-155 -jobs 4 ARCHS=arm64 ONLY_ACTIVE_ARCH=YES CODE_SIGNING_ALLOWED=NO -parallel-testing-enabled NO -only-testing:RoyceTravelTemplateUITests/DuoFitUITests/testIPadPRDestinationLandmarks -resultBundlePath /tmp/crew-landmarks-ui-163-v1.xcresult
```

First native run (163/Ver1) failed before login: floating iPad keyboard left the
login button non-hittable. The test now dismisses that keyboard by tapping the
non-interactive login heading when needed. No login product code changed.
Second run uses version 164, `IPAD_SHOT_VERSION=2` and
`/tmp/crew-landmarks-ui-164-v2.xcresult`.
It reached SEA/DOH/DAD and saved screenshots, then was interrupted when other
jobs started tests/installations on the same iPad. The primary stopped only its
own xcodebuild PID 81906. Other jobs were left running. This is not a full PASS.

The final run is isolated on newly created iPad Pro 11-inch M5 simulator
`B184E6C6-CF48-4BDB-B0ED-5CEF2429354B` (iOS 26.5), with its own build cache
`/tmp/crew-landmarks-sim-167`, `IPAD_SHOT_VERSION=3`, result bundle
`/tmp/crew-landmarks-ui-167-v3.xcresult`. Concurrent work advanced the shared app
version from 164 through 166; this change advanced it to 167 without reverting
other edits. A fresh native build is required for these final screenshots.

## Final status: native verification / deployment blocked

- Final source version at our change: 167 (concurrent agents may advance it).
- Focused city/destination/layout tests: **PASS**, 62 tests. Additional
  `npx jest __tests__/features/duoPageLayouts.test.tsx __tests__/features/ipadGradient.test.tsx --runInBand`:
  **PASS**, 36 tests. Total 98 in these two focused runs.
- Final UI gate: **PASS**, 0 hard / 124 advisory warnings.
- Final TypeScript: **FAIL**, previously listed unrelated test declarations/mocks.
- Version 167 isolated simulator build: **FAIL**, missing `jsi/jsi.h` while
  compiling React-Fabric. `/tmp/crew-landmarks-build-167.log`.
- Version 167 device build: **FAIL**, missing
  `React/RCTThirdPartyFabricComponentsProvider.h` while compiling React-RCTFabric.
  `/tmp/crew-landmarks-device-167.log`.
- Read-only inspection confirmed `ios/build/generated/ios/RCTThirdPartyFabricComponentsProvider.h`
  absent and `Pods/Headers/Public/jsi` containing only modulemap/umbrella links.
  Their timestamps changed during our builds, while other native build jobs were
  active. No pod install/regeneration or shared-header repair attempted because
  it would interfere with those jobs.
- The cloned build cache also emitted stale absolute-path warnings; final retry
  should use a fresh cache after the shared native dependency state is stable.
- The dedicated simulator remained in first-boot data migration. No final Ver3
  UI run was started. Ver2 SEA/DOH/DAD captures are intermediate, not final proof;
  SEA captures were visually inspected and drove the crop/scrim corrections.
- No final physical install was performed. The earlier version 164 build passed
  signing verification but was intentionally not deployed after subsequent changes.

User subsequently waived simulator testing for this task to save resources.
The dedicated simulator is shut down and no further simulator runs are planned.
Final native UI validation and physical deployment remain unverified; do not
claim this is deployed or fully UI-validated.

Publication scope: city mappings/photos, source attribution, Destination fixes,
focused regression tests and this report. The shared native test harness,
shared version counter, iPad project setup and other concurrent crew-app edits
remain outside this scoped commit. Native test descriptions above record local
attempts, not a completed or separately published native test suite.
No Air/Duo simulator or physical phone was modified by this work.
