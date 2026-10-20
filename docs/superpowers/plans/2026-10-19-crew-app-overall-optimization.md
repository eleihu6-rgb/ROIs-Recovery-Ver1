# Crew App Overall Optimization — Overseas Performance + App Size

> Date: 2026-10-19 · Module: `crew-app/` (RN 0.74.5, Hermes on) · Owner: next agent
> Goals: (1) faster roster pull for crew on overseas networks (TG / PR crew portals on roiscloud),
> (2) cut the ~33 MB app, (3) phased, independently shippable steps.

## 0. Audit findings (2026-10-19, measured locally)

| # | Finding | Evidence | Impact |
|---|---|---|---|
| S1 | **71 city photos bundled, 14 MB**, ~40% of the app. Some up to 2560×1704 (`singapore.jpg` 888 KB). Phones need ≤1290 px wide. | `src/features/home/cityImages/`, registry `src/features/home/cities.ts` | Size, biggest item |
| S2 | **`react-native-vector-icons` ships 19 icon fonts (3.8 MB)**, but nothing in `src/` imports it. The app uses SVG `TripIcons` / `components/v2/icons.tsx`. | `grep` finds no imports. The `.app` has `*.ttf` + `RNVectorIcons` pod. | Size, free win |
| S3 | Android Release: `enableProguardInReleaseBuilds = false`, no `shrinkResources` | `android/app/build.gradle:57` | Android size |
| P1 | **The roster pull runs inside a WebView that loads the full portal SPA** from the overseas roiscloud host, does a UI login, navigates to `/page/roster`, and only then fires the roster APIs. The SPA's own JS/CSS/HTML download plus the SPA's own roster fetch all cross the long-haul link before any data arrives. | `features/travel/portalInjectedJs.ts` (`gotoRoster`, `antdSubmit`, fetch loop L255-290), `PortalCaptureScreen.tsx`, `portalCapture.ts` | Main overseas latency |
| P2 | A native portal client already exists (getPublicKey → RSA → login → token) but is only used by Duty Swap. Its token is memory-only, so **every cold start pays ≥2 serial round trips** before the first data request. | `features/portal/portalClient.ts` | +2 RTT per cold start |
| P3 | Each month fires 3 endpoints (`selectPortalCalendar`, `selectCrewRosterReport`, `selectPortalCalendarDetailAll`). They already run in parallel, but there's no incremental or conditional refresh: everything is re-pulled every time. | `portalInjectedJs.ts` L263-290 | Bytes and time on slow links |
| P4 | Duties are already cached in AsyncStorage (`dutiesSlice.ts` `K_DUTIES`). Confirm whether the UI renders the cache **before** the network pull finishes. | `features/roster/dutiesSlice.ts` | Perceived speed |

Not yet measured, and Phase 0 must measure: the real TestFlight install/download size per device, the SPA payload size, and roster time-to-data from an overseas vantage point.

## Phase 0 — Baseline (do first, no code changes)

1. **Size baseline.** Archive a Release build. Record the App Store Connect "App Store File Sizes" report (download + install for one modern iPhone) and the `.app` breakdown (`du -sh` of `main.jsbundle`, `assets/`, `Frameworks/`, `*.ttf`, the binary). The Debug `.app` (39 MB, mostly `debug.dylib`) is **not** representative.
2. **Network baseline.** On the simulator, add temporary timing marks (or use the existing `portalDebug.ts`) for: WebView start → SPA loaded → token available → each roster response → duties rendered. Record bytes per request. Run for **TG 35459** and **PR 433535** (`TEST_CREDENTIALS`). If you can, run once through a high-latency link profile (Network Link Conditioner "High Latency DNS"/custom 300 ms RTT) to mimic overseas.
3. Record the numbers in a short table at the bottom of this file. Every later phase reports against it.

## Phase 1 — Size quick wins (low risk)

**1a. Re-encode city images (S1).** Resize to max 1290 px on the long edge, JPEG q≈70, progressive, strip metadata. Keep file names, so `cities.ts` stays unchanged. Use `sips` or an existing script (`scripts/cityImageReport.mjs` / `check:assets`). Don't add new deps. Target: 14 MB → ≤4 MB. Visual check: Home destination strip + city page on iPhone Air and iPad (largest render).

**1b. Remove `react-native-vector-icons` (S2).** First prove it's unused: no import in `src/`, and no transitive need from `@react-navigation/*` (it doesn't need it). Then uninstall, `pod install`, remove any `UIAppFonts` entries / Android `fonts.gradle` apply, and drop `@types/react-native-vector-icons`. Target: −3.8 MB fonts + native module.

**1c. Android Release shrink (S3).** Enable `minifyEnabled` + `shrinkResources` in Release, check `proguard-rules.pro` covers RN/Hermes/reanimated/maps, ship an AAB (per-ABI split by Play). Smoke-test a Release build on an emulator.

**1d. Remove other unused dependencies (verified 2026-10-19: zero imports in `src/` and `index.js`).**
- `react-native-reanimated`: native module + worklet runtime initialised at startup, never imported. Remove the package **and** the `'react-native-reanimated/plugin'` entry in `babel.config.js`, then `pod install`. Check that `@react-navigation/*` v6 + `react-native-screens` don't need it (they don't). Gains: native size + startup.
- `axios`: unused, JS bundle only. Remove.
- `date-fns`: only mentioned in comments (`tripCsv.ts`). Remove the package; leave the comments.
- Keep: `react-native-gesture-handler` (used by `CalendarView.tsx` + `index.js`), `zod`, `react-native-webview` / `react-native-maps` / `react-native-document-picker` (one live feature each, so don't remove features without asking Ryan).
- Re-run `npx tsc --noEmit` + full `npx jest`. A jest mock in `jest.setup.js` for a removed lib must be removed too.

Acceptance: Release size report shows the reduction, and all screens that showed city photos still render correctly for TG + PR.

## Phase 2 — Overseas roster speed (main win)

**2a. Show cached data first (P4).** On launch, render duties from `K_DUTIES` right away, then refresh in the background with a subtle "Updating…" state. Never blank the schedule while fetching. Check that the account-switch cleanup (`clearStoredDuties`) still prevents TG/PR mixing.

**2b. Native roster pull, no SPA (P1).** For `portalKind === 'rois'` airlines, fetch the three roster endpoints through `createPortalClient(...).get(...)` instead of loading the portal SPA in a WebView. Reuse the existing parsers/enrichers in `portalCapture.ts` (`buildAirportIndex`, `buildTrainingIndex`, etc.) by feeding them the same raw JSON the WebView `cap()` produced. Don't re-implement parsing. Keep the WebView path only as a **fallback**, for when native login needs an interactive captcha/email code or returns an unexpected error. Fire all month × endpoint requests in parallel (`Promise.all`) with a per-request timeout.
- Risk: captcha/email-code tenants. `portalClient` already sends `outCaptcha` for the TEST tenant. Confirm the PR and TG production behaviour before removing the WebView from the default path.
- Risk: the hard-won enrichment logic in `portalCapture.ts` (1069 lines). Regression-test with recorded TG and PR payloads (sanitized fixtures, no tokens).

**2c. Reuse the token across launches (P2).** Store the portal token in the Keychain (`react-native-keychain`, already a dependency) with its issue time, scoped by airline + crewId, and clear it on logout/account switch. On a warm start, skip `getPublicKey` + `login` (−2 RTT). The existing one-shot re-login on auth failure handles expiry. This changes the current "token never persisted" design, so it's a security decision. **Ryan must approve 2c** before implementation (see Options).

**2d. Lighter refresh (P3).** On a background refresh, pull the current + next month first and render, then the remaining months. Only re-pull past months on a manual pull-to-refresh. Check whether the portal honours `ETag`/`If-None-Match` or `Accept-Encoding: gzip` (iOS `NSURLSession` sends gzip automatically; just confirm the server compresses). If the roiscloud portal is ours, compression is a server-side follow-up. Note it, but don't change the portal from this plan.

Acceptance: from the Phase 0 baseline, time-to-first-duty on a warm start ≈ cached (instant). Cold-start fresh data is clearly faster on the 300 ms RTT profile. TG and PR show identical duty content before vs after (fixture diff + simulator).

## Phase 2.5 — Code-level runtime optimizations (on-device smoothness + startup)

Found by code scan on 2026-10-19 and not yet profiled. Measure before/after with the RN perf monitor or React DevTools Profiler on a **Release** build (a Debug build overstates JS cost).

| # | Finding | Where | Fix | Risk |
|---|---|---|---|---|
| C1 | **Schedule list re-renders all visible cards on every scroll step.** `onViewable` → `setActive(...)` re-renders `ScheduleScreen`. `DayCard` isn't memoised, and `renderItem` passes a new inline `onTrip={id => nav.navigate(...)}` and a new inline `viewabilityConfig` object each render. | `features/v2/ScheduleScreen.tsx:222-230, 338-360, 528` | Wrap `DayCard` in `React.memo`. Hoist `onTrip` into a `useCallback` and `viewabilityConfig` into a module const / `useRef`. Wrap `renderItem` in `useCallback`. Keep the existing `getItemLayout` on the strip. | Low. Props are already plain data + memoised `meetingActions` |
| C2 | **`Intl.DateTimeFormat` constructed per call** (costly on Hermes) inside per-flight loops. Also duplicated: two copies of `ymdInZone`. | `features/v2/scheduleKpi.ts:183` (called per flight at 305/325/346), `features/v2/model.ts:265` (per day at 414), `features/settings/alarmSetup.ts:109` | One shared helper with a `Map<zone, Intl.DateTimeFormat>` cache. Make `model.ts` reuse `scheduleKpi.ts`'s export (code-reuse rule) and keep the UTC fallback `catch`. | Low. Pure function, existing Jest covers KPI/model |
| C3 | **Splash waits for full roster JSON parse before reading the session.** `Bootstrap` awaits `loadTrips()` + `loadDuties()` (whole roster `JSON.parse`) **before** dispatching `loadAuthSession()`, which is what leaves the splash. | `src/App.tsx` Bootstrap effect | Dispatch `loadAuthSession()` (+ settings) in parallel with the trips/duties load. Make sure screens tolerate empty trips for one frame (they already handle the empty state). Same change pairs with Phase 2a cache-first. | Medium. Verify no flash of the empty state / login screen for a signed-in crew on TG + PR |
| C4 | **Full-resolution city JPEGs decoded on the UI thread** (`ImageBackground`, up to 2560 px), which costs memory and jank on the Home strip and city pages. | `features/v2/HomeScreen.tsx`, `DestinationScreen.tsx`, `cities.ts` | Fixed by Phase 1a resize (no code change). Confirm by the memory drop in Xcode. | — |
| C5 | **Refetch on every screen focus, no freshness window.** Each return to Notifications / Duty Swap Records / My Duties fires overseas round trips again. | `NotificationsScreen.tsx:261`, `DutySwapRecordsScreen.tsx:43`, `DutySwapMyDutiesScreen.tsx:41` | Show stored data right away. Skip the focus-refetch if the last successful load was < N s ago, with N from one shared constant (pull-to-refresh always forces). Keep the Discretion screen's always-refresh (consent must be live). | Low-medium. Don't stale pending FDP-discretion decisions |
| C6 | **Debounced persist writes the whole roster as one JSON blob** on every trips change. Fine today, but watch it: with 3+ months of trips, this is a large AsyncStorage write. | `App.tsx` save effect, `tripsPersistence.ts`, `dutiesSlice.ts` | Report only. Measure write size in Phase 0; act only if > ~1 MB. | — |

Checked and fine (don't touch): Schedule uses `FlatList` with `keyExtractor`, the strip has `getItemLayout`, the R'Bot thread is capped at 40 entries, only 2 `console.*` calls, and `TripCards` sub-cards are already `React.memo`.

Acceptance: C1, a Profiler trace of a 5-second schedule scroll shows `DayCard` commits only for newly mounted items. C2, existing `scheduleKpi`/`model` Jest tests pass unchanged plus a test that the formatter cache returns the same instance per zone. C3, splash-to-home time is lower on warm launch, with no empty-state flash (simulator video/screenshots, TG + PR). C5, a Jest test for the freshness gate, and a pull-to-refresh still fetches.

## Phase 3 — Optional / later (ask Ryan first)

- **Remote city images.** Bundle only the home-base cities + a generic fallback, and download the rest on first view with a disk cache. Needs a CDN location and possibly an image-cache library (dependency/security review per root `CLAUDE.md`). Saves most of the remaining ~4 MB.
- Lazy-load heavy screens (maps / route map, WebView) to reduce startup JS work.

## Options for Ryan

| Decision | Options | Recommendation |
|---|---|---|
| City images | A) re-encode, keep bundled (Phase 1a) · B) A + remote for non-base cities (Phase 3) | **A now**: offline-safe, no new infra, saves ~10 MB |
| Token persistence (2c) | A) Keychain, per airline+crew, cleared on logout · B) keep memory-only | **A**: saves 2 round trips per launch overseas; Keychain is the same store as the password already |
| Roster path (2b) | A) native first, WebView fallback · B) keep WebView, only add cache-first | **A**: removes the SPA download, which is the biggest overseas cost |

## Verification rules (from `crew-app/CLAUDE.md`, all mandatory)

- Bump `APP_VERSION` in `src/version.ts` by 1 per code change.
- Jest test per change under `__tests__/features/` (bug fixes: failing first). `npx jest <file>` + `npx tsc --noEmit` pass.
- Simulator: iPhone Air → iPhone Duo → iPad, ≤2 sims booted. **Both TG (35459) and PR (433535)**, plus `switch_account.yaml` to prove no PR/TG mixing. Use the Maestro flows in `.maestro/`.
- Login hang rule: no progress for 30 s or a credential rejection means stop, inspect, don't retry-loop.
- Screenshots versioned `-Ver<N>` under `docs/assets/screenshots/crew-app/`, visually inspected.
- No commit/push without Ryan's explicit instruction.

## Baseline / results log

| Metric | Baseline | After P1 | After P2 |
|---|---|---|---|
| iOS download size (ASC report) | | | |
| iOS install size | | | |
| Android AAB / per-ABI APK | | | |
| TG cold start → first duty (300 ms RTT) | | | |
| PR cold start → first duty (300 ms RTT) | | | |
| Warm start → first duty | | | |
| Bytes per full roster refresh | | | |
