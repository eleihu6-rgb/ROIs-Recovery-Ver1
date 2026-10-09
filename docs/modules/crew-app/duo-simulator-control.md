# iPhone Duo simulator — fold, rotate, tap and capture from a script

> For every agent (Claude, Codex, …) and every human working on `crew-app`.
> Verified 2026-10-08 with Xcode 27.1, the iOS 27.1 runtime and the "iPhone Duo — Test"
> simulator. Everything here uses private, undocumented simulator interfaces; re-verify
> after an Xcode update.

## The problem

Xcode 27 ships no `Simulator.app`; the simulator UI is
`/Applications/Xcode.app/Contents/Applications/DeviceHub.app`. Device Hub can fold,
rotate and tap the iPhone Duo by hand, but **nothing public can**:

| You want to… | What silently does nothing | What works |
|---|---|---|
| Fold / unfold (hinge) | `simctl`, `devicectl` — no hinge command | `duoctl open` / `close` / `hinge <deg>` |
| Rotate the inner screen | `xcrun devicectl device orientation set …` (reports success, app stays 951×669); `XCUIDevice.shared.orientation = .portrait` in XCUITest (same) | `duoctl rotate portrait` / `landscape` |
| Tap the unfolded inner screen | Maestro, AXe, XcodeBuildMCP, `cliclick`-style mouse taps — every touch lands on the **cover** touchscreen | XCUITest (`RoyceTravelTemplateUITests`), or `duoctl tap` |
| Screenshot what is showing | `simctl io <udid> screenshot` (captures display 1, the cover) | `simctl io <udid> screenshot --display=3 …` (inner; black while folded), or `duoctl screenshot` |

Both `devicectl … orientation set` and `XCUIDevice.orientation` exit 0, so a script
carries on as if the rotation happened. Always read the state back (below).

## The tool: `duoctl`

`duoctl` — MIT, <https://github.com/skarol/duoctl> (found through
getsentry/MobileBuildMCP#494, which proposes the same mechanism for XcodeBuildMCP).
A 400-line Python script plus a small Objective-C helper it compiles once with Xcode's
clang (cached in `~/.cache/duoctl`) and runs **inside the simulator** with
`xcrun simctl spawn`. It makes no network calls; it only runs `xcrun simctl`,
`xcrun devicectl` and `xcrun clang` (reviewed 2026-10-08, commit `efd5e3d`).

Install for a session (do **not** vendor it into this repo):

```bash
git clone https://github.com/skarol/duoctl.git /tmp/duoctl      # or your scratch dir
DUOCTL=/tmp/duoctl/bin/duoctl
```

(`brew install skarol/tap/duoctl` also works if you want it on PATH.)

Commands — always pass the UDID with `-d`, never let it guess when two Duos are booted:

```bash
T=08ACE4EC-2508-4DD8-9989-461C1DEF4D72        # "iPhone Duo — Test" (automation only)

python3 $DUOCTL -d $T state                    # hinge angle, active screen, rotation, size
python3 $DUOCTL -d $T open                     # unfold flat (hinge 180°) — inner screen active
python3 $DUOCTL -d $T close                    # fold (hinge 0°) — cover screen active
python3 $DUOCTL -d $T rotate landscape         # inner screen 951×669 — the app's "wide" layout
python3 $DUOCTL -d $T rotate portrait          # inner screen 669×951 — the app's "tall" layout
python3 $DUOCTL -d $T screenshot /tmp/duo.png  # whichever screen is showing
```

Orientation names describe the **interface**, not the phone: the inner panel sits a
quarter turn from the cover, so its default unfolded orientation is `landscape`.
`rotate` retries device orientations until the active screen reports the one you asked
for and fails loudly otherwise.

Read the state back without duoctl:

```bash
xcrun devicectl device info displays -d $T --json-output -   # active display, uniqueId, size
xcrun devicectl device motion hinge-angle -d $T              # 0 (closed) … 180 (flat)
```

Example `state` output after `rotate portrait`:

```json
{ "hingeAngle": 180.0, "activeScreen": "inner", "displayId": 3,
  "rotation": "rot0", "orientation": "portrait", "sizePoints": [669.0, 951.0] }
```

## Known pitfalls

- **After `duoctl close` the cover screen keeps the inner screen's orientation.**
  Observed by the Duty Swap session (2026-10-08, not yet re-verified here): the app came
  up sideways at a fraction of the cover's size, Maestro taps missed, and `rotate portrait`
  while folded left the cover screenshot (display 1) black. Treat fold + rotate as two
  steps: `close`, then `rotate portrait` for the cover, then read `state` back and take a
  display-1 screenshot before driving the cover with Maestro. If the cover stays black,
  `open` → `rotate landscape` → `close` again.
- **Right after a cold boot, `open` can fail** with "the inner screen did not become
  active after setting the hinge to 180°" (state shows hinge 180, `activeScreen: cover`).
  `close` → `open` → `rotate landscape` fixed it (2026-10-08). Before that, `duoctl` reports
  "no display is active" until the boot finishes, so poll `state` first.
- `simctl io … screenshot --display=3` is black while folded; the cover is display 1.
- `rotate` targets the **active** screen only. Set the hinge first, then the rotation.

## How it works (so it can be re-implemented if the tool dies)

Device Hub's hinge slider and orientation picker send a **vendor-defined HID event**
(usage page `0xFF61`, usage `0x5B`) whose payload is a binary-serialized dictionary with
`provider = "com.apple.Virtualization"`; `locationd` in the guest turns it into a hinge
angle or a device orientation:

| Control | `source` | `type` | `value` |
|---|---|---|---|
| Hinge | `hinge-slider-control` | `range` | degrees, 0–180 |
| Orientation | `orientation-picker-control` | `enum` | `portrait`, `pud`, `landscape-left`, `landscape-right`, `faceup`, `facedown` |

Meta's FBSimulatorControl (facebook/idb, `FBSimulatorControl/HID/SimulatorHIDOrientation.swift`
and `SimulatorHingeAngle.swift`) builds the same events as
`IndigoVendorDefinedEvent.virtualMachineControl(source:type:value:)`.

Touches: the Duo exposes one CoreDevice touchscreen HID service per display, tagged with
the display's UUID (`mainTouchscreen(0x101)` = cover, `touchscreen(0x103)` = inner).
Legacy simulator HID injection always targets the main (cover) service, which is why
Maestro/AXe taps vanish on the unfolded Duo. duoctl clones the active display's
touchscreen as a virtual HID service and dispatches digitizer events through the clone.

## How crew-app uses it

- Which sim is which: **"iPhone Duo - Release"** (`73B4308D-256E-4BFF-A517-8A4EFB61401B`)
  is Ryan's hand-test sim with a Release build — never drive it with automation.
  **"iPhone Duo — Test"** (`08ACE4EC-2508-4DD8-9989-461C1DEF4D72`) is for scripts.
- Inner-screen UI automation is XCUITest: `crew-app/ios/RoyceTravelTemplateUITests/DuoFitUITests.swift`
  (K1001 sign-in, 22-screen tour, per-page layout-class assertions). Inner-screen
  captures come from the host: `crew-app/ios/scripts/duo-shot-watcher.sh <udid> <dir>`
  takes `simctl io … --display=3` screenshots on request.
- A tour run = `duoctl rotate <landscape|portrait>` → start the watcher →
  `TEST_RUNNER_DUO_SHOT_DIR=<dir> TEST_RUNNER_DUO_ORIENTATION=<o> xcodebuild test
  -workspace RoyceTravelTemplate.xcworkspace -scheme RoyceTravelTemplateUITests
  -destination "id=$T" -only-testing:RoyceTravelTemplateUITests/DuoFitUITests/testDuoTourAllScreens`.
  Run the landscape (`wide`) and portrait (`tall`) tours one after the other.
- Regular-iPhone regression stays on Maestro (`crew-app/.maestro/regression_ek_k1001.yaml`
  on the iPhone Air). Never run it at the same time as a Duo tour on Debug builds:
  two simulators bundling from one Metro left the Air app with "Cannot connect to Metro".
- Layout classes and the per-page design decisions:
  `docs/superpowers/specs/2026-10-07-crew-app-duo-per-page-layouts-design.md`.
