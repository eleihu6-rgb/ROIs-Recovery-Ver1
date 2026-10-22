# Crew App React Native 0.86 Security Migration

**Date:** 2026-10-22
**Status:** Implementation-ready
**Module:** `crew-app/`

## Goal

Remove the Crew App production dependency audit findings without suppressing advisories, forcing incompatible transitive versions, or weakening existing user-visible behavior.

The current `react-native@0.74.5` dependency graph reports 43 production findings (`14 moderate`, `29 high`, `0 critical`). The findings are concentrated in React Native's bundled CLI, Metro, codegen, and Jest-related dependency graph, plus React Navigation 6. The public audit metadata identifies `react-native@0.86.3` and `@react-navigation/native@7.5.1` as the supported fixes. Leaf-only overrides cannot reach zero because the direct React Native and React Navigation versions are themselves inside affected ranges.

## Scope

- Upgrade React Native to `0.86.3` and React to the compatible `19.2.3` line.
- Upgrade React Navigation packages together to compatible 7.x versions.
- Upgrade React Native companion libraries only where required by peer/native compatibility:
  - Reanimated and Worklets
  - Screens
  - Safe Area Context
  - Gesture Handler
  - Maps
  - Async Storage
  - Keychain
  - SVG
  - WebView
  - React Native test/build presets and React type packages
- Regenerate the npm lockfile and CocoaPods integration through supported package tooling.
- Migrate app/native entrypoints and configuration only where the React Native upgrade requires it.
- Preserve the existing bundle ID, Apple team, WeatherKit entitlement, TestFlight app/group/public link, and build-number discipline.
- Preserve all current Crew App behavior, including Home arrival weather in every layout and lazy opened-city weather.

## Out of Scope

- Feature redesigns or unrelated component refactors.
- Advisory suppression, audit allowlists, or changing the audit command to hide build-tool dependencies.
- `npm audit fix --force` without reviewing the resulting React Native and Navigation migrations.
- Replacing existing native business modules unless an upstream API removal makes a narrow adapter necessary.

## Architecture and Migration Risks

1. **React Native architecture:** React Native 0.86 requires validating the New Architecture path. The existing Objective-C/Swift bridges (`CalendarModule`, `AlarmModule`, `ShareModule`, and meeting modules) must still register and execute.
2. **React 19:** test renderer, React Native Testing Library, ref behavior, and `act` behavior may require test-compatible updates.
3. **Navigation 7:** stack/tab option and param typings may change. Existing navigation behavior and deep links must remain unchanged.
4. **Reanimated 4:** requires the matching Worklets dependency and Babel configuration. Animations and gesture-driven screens must be smoke-tested.
5. **Native build chain:** Podfile, AppDelegate, deployment target, Xcode 27 signing, Hermes, and iOS scene/window handling must compile and launch on simulator and physical iPhone.
6. **Release behavior:** a successful dependency audit is insufficient if the app fails to bundle, sign, authenticate, load rosters, or request WeatherKit.

## Implementation Sequence

1. Capture baseline: current full Jest, TypeScript, production audit, iOS Release build, entitlement output, and physical weather state.
2. Upgrade React Native/React and the matching official build/test presets.
3. Upgrade Navigation and required native companion libraries as one peer-compatible set.
4. Install dependencies and Pods; review every direct package's license and provenance against project policy.
5. Apply only required source/native migrations.
6. Fix stale tests without weakening assertions.
7. Run all acceptance gates below.
8. Bump the Crew App version for every code/config change and release only the final validated number.

## Acceptance Gates

All gates are mandatory:

- `npm audit --omit=dev` reports `0 vulnerabilities`.
- All direct production dependencies have an allowed open-source license and trusted provenance.
- `npm test -- --runInBand` passes the full Crew App suite.
- `npm run type-check` passes.
- Root `npm run check:ui` reports zero hard violations.
- `git diff --check` passes.
- iOS Release simulator build embeds `main.jsbundle` and launches without Metro.
- iPhone Air simulator validates Home portrait, Home landscape, and opened destination detail through the real UI.
- iPhone Duo automation-only validation follows Air; iPad follows Duo.
- PR and TG account switching shows no cross-airline roster mixing.
- Signed physical iPhone build preserves:
  - `application-identifier = 6B2783K6KM.com.eleihu6.roycetravel`
  - `com.apple.developer.weatherkit = true`
  - expected team identifier
- Physical iPhone 13 shows a real temperature in Home portrait and landscape and on the opened city detail page; no separate unavailable row appears.
- Versioned screenshots from the same passing UI runs are exported and visually inspected.
- TestFlight workflow validation, dry-run, authenticated preflight, exact-build upload, processing, group membership, beta review, installation, and exact-build device validation all pass.

## Rollback

Do not publish a partially migrated build. If the migration cannot satisfy all gates, keep the last approved TestFlight build available and retain the migration as an unshipped branch state with exact failing evidence. Never mask remaining audit findings or weaken the physical WeatherKit assertions to release.
