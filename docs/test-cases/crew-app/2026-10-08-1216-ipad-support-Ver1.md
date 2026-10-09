# iPad support and layout validation — build 162

Target: iPad Pro 11-inch (M5). Simulator: iOS 26.5; connected device: iPadOS 27.2.
The existing dirty Duo/duty-swap worktree was preserved. No commit, push, App Store
submission, phone installation, roster modification or swap submission was made.
A read-only delegated iPad audit identified the Profile stretch risk; the main
agent reviewed the findings, implemented changes and inspected native screenshots.

## Changes

- Complete pending universal app configuration, iPad icons and four modal orientations.
- Profile: 64pt avatar, horizontal compact identity card, natural settings heights,
  centred 1040pt page limit and 520pt avatar picker when both window axes are >=700pt.
  Air/Duo retain their 80pt avatars and existing Profile geometry.
- Schedule: respect the top safe area for the wide toolbar outside the Duo side strip.
- Rotation: explicitly resize both the background SVG and its painted rectangle.
- Destination: render the floating header after/above the information panel so
  its Trip Details button receives touches.
- Freeze the existing destination test fixture clock; September fixtures had aged
  out of the upcoming-destination window.

## Automated checks

From `crew-app/`:

```sh
npx jest __tests__/features/duoLayout.test.ts __tests__/features/duoPageLayouts.test.tsx __tests__/features/ipadGradient.test.tsx __tests__/features/destinationView.test.tsx --runInBand
npx tsc --noEmit
```

- Jest: **PASS**, 4 suites / 57 tests. Covers iPad widths, Split View width classes,
  Profile sizing, Air/Duo geometry, toolbar safe area, modal orientations,
  destination navigation and live background dimensions.
- TypeScript: **FAIL**, existing unrelated test errors in dutySwapMarket,
  myDutyScreen, myTripsTabs, NotificationsScreen and TripCards (mock tuple/implicit
  any and missing react-test-renderer declarations). No changed runtime source error.
- Root `npm run check:ui`: **PASS**, 0 hard violations, 124 existing warnings.
- `git diff --check`: **PASS**.
- `plutil -lint crew-app/ios/RoyceTravelTemplate/Info.plist`: **PASS**.
- CocoaPods lock/manifest match; no dependency change or pod reinstall required.

## Native UI run

XCUITest drives this native iOS app; browser Playwright cannot exercise its native
controls. Environment supplies the existing PR test password without logging it.
From `crew-app/ios/`:

```sh
TEST_RUNNER_DUO_PR_PASSWORD='<existing test credential>' \
TEST_RUNNER_IPAD_SHOT_DIR="$PWD/../../docs/assets/screenshots/crew-app" \
TEST_RUNNER_IPAD_SHOT_VERSION=9 \
xcodebuild test -workspace RoyceTravelTemplate.xcworkspace \
  -scheme RoyceTravelTemplateUITests -configuration Release \
  -destination 'id=7E7EB9CC-3407-4103-9959-E159E143B68A' \
  -derivedDataPath /tmp/crew-ipad-sim-155 -jobs 4 ARCHS=arm64 ONLY_ACTIVE_ARCH=YES \
  -parallel-testing-enabled NO \
  -only-testing:RoyceTravelTemplateUITests/DuoFitUITests/testIPadPR473006AndTGAccountSwitch \
  -resultBundlePath /tmp/crew-ipad-ui-162-v9.xcresult CODE_SIGNING_ALLOWED=NO
```

Final result: **PASS**, same build rerun with `test-without-building`, screenshot
version 10 and `/tmp/crew-ipad-ui-162-v10.xcresult` (TEST EXECUTE SUCCEEDED).
Ver9 hit a login-helper race tapping the captured-roster button after dismissal;
no application change was needed for the successful retry. PR 473006 walk covers Home, Schedule,
Calendar, Route, Profile, avatar picker, Duty Swap, Destination, Trip Details,
portrait/landscape and upside-down logout. TG account switching checks carrier
identity and absence of PR identity. Ver8 completed the PR walk but failed an
incorrect test assumption that Meal was PR-only; source confirms it is a shared
action, so Ver9 removes that assertion while retaining crew/carrier isolation.
The successful run confirms TG 35459 identity and THAI carrier after PR logout.

Visually reviewed final-run captures under `docs/assets/screenshots/crew-app/`:

- `ipad-pr-home-landscape-Ver10.png`, `ipad-pr-profile-landscape-Ver10.png`,
  `ipad-pr-modal-upside-down-Ver10.png`, `ipad-tg-profile-landscape-Ver10.png`:
  final-build rotation, compact Profile, retained modal orientation and account switch.

The earlier Ver8 run has the same runtime layout changes and also reviewed:

- `ipad-pr-home-landscape-Ver8.png`: rotation seam resolved.
- `ipad-pr-profile-portrait-Ver8.png`: compact avatar/card with readable settings.
- `ipad-pr-avatar-picker-landscape-Ver8.png`: bounded picker.
- `ipad-pr-schedule-landscape-Ver8.png` and `ipad-pr-calendar-portrait-Ver8.png`:
  toolbar below status area.
- `ipad-pr-trip-details-portrait-Ver8.png`: reached through Destination button.

Earlier captures are retained. Ver3 app-only landscape screenshots were cropped
by stale capture bounds; final capture uses XCUIScreen.main. Early runs also found
the real rotation paint and header hit-testing bugs, fixed and rerun in Ver8.

## Device build and deployment

```sh
xcodebuild -workspace RoyceTravelTemplate.xcworkspace -scheme RoyceTravelTemplate \
  -configuration Release -destination 'id=00008142-000668392198401C' \
  -derivedDataPath /tmp/crew-ipad-device-155 -jobs 4 \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration build
```

Build 162: **PASS**, including the bundled JavaScript version. Bundle ID is
`com.eleihuus.roycetravel`; device family contains 1 and 2. The deployment skill
guided isolated DerivedData, device provisioning and artifact verification.
Incremental Xcode bundling left an old outer signature, so the app was re-signed
with the existing development identity while preserving entitlements/requirements.
`codesign --verify --deep --strict --verbose=2 <app>` then **PASS**.
The explicit re-sign command was:

```sh
codesign --force --sign B2EF3EF91434E9C220F107282A9E7D41488C1B45 \
  --preserve-metadata=identifier,entitlements,requirements,flags,runtime \
  /tmp/crew-ipad-device-155/Build/Products/Release-iphoneos/RoyceTravelTemplate.app
```

Installation: **PASS**, `devicectl device install app --device
9BF95E4A-D933-5F5A-B261-93454C5CFEC0 <app>` reported installed bundle
`com.eleihuus.roycetravel`.

```sh
xcrun devicectl device process launch \
  --device 9BF95E4A-D933-5F5A-B261-93454C5CFEC0 com.eleihuus.roycetravel
```

Launch: **BLOCKED**, CoreDevice 10002 / FBSOpenApplicationErrorDomain 3, security:
invalid signature, inadequate entitlements or profile not explicitly trusted.
Local deep signature verification passes; the provisioning profile includes this
iPad and its application identifier matches the signed app. The user must unlock
the iPad and check Settings > General > VPN & Device Management > Developer App
for the existing development identity, trust it, then open R'Bot. Device launch
is not claimed successful. Profile expires **2026-10-15 04:48:48 UTC**; this local
development installation needs renewal after that date.

## Limits

No fresh Air/Duo native UI run in this session; their focused unit regressions pass
and their devices/simulators were left alone. Split View/Stage Manager have width
unit coverage, not a native multitasking walkthrough. Mini and 13-inch devices
were not run. Existing iPhone-specific calendar/picker wording remains. Widget
support is not included. Physical-device interactive PR login is not yet verified.
