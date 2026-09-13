# iPhone crew-app login build provenance audit — Ver1

**Date:** 2026-09-12 06:06 PDT  
**Scope:** Read-only comparison of the reported iPhone login screen with tracked source and native iOS build metadata.

## Finding

The reported iPhone screen matches the login implementation on `main`, which is still the older layout. The newer login implementation is present on the current feature checkout but is not contained in `main`.

| Evidence | `main` / build-115 source | Current feature `HEAD` |
|---|---|---|
| App-side displayed version | `APP_VERSION = 115` in `crew-app/src/version.ts` | `APP_VERSION = 114` in `crew-app/src/version.ts` |
| Login hero | lowercase italic `altair` | `ROIs Altair` |
| Password control | `Show` / `Hide` text | eye control, `testID="toggle-pw"` |
| Form layout | external field labels and portal sign-in hint | icon-led `FieldRow` components and no hint |

The old-screen source is in `main:crew-app/src/features/auth/LoginScreen.tsx`. The newer screen is committed by `d693ec3` (`chore(crew-app): checkpoint the work that only existed uncommitted here`) in the current feature history. `d693ec3` is **not** an ancestor of `main`; `bb614c3` (which changes `APP_VERSION` from 114 to 115) is an ancestor of `main`.

This matches the screenshot's visible details: lowercase `altair`, labelled Airline/Crew ID/Password fields, text `Show`, and the Ethiopian portal hint.

## Native build identity limitation

`crew-app/ios/RoyceTravelTemplate.xcodeproj/project.pbxproj` still sets `CURRENT_PROJECT_VERSION = 1` and `MARKETING_VERSION = 1.0` for iOS configurations. Therefore the native bundle metadata does not distinguish the old build-115 source from a later source build.

No physical iPhone was connected to Xcode during this audit (`xcrun devicectl list devices` returned `No devices found`), and no IPA or installed application bundle was available locally. The installed binary was therefore **not inspected directly**. The conclusion that it was built from `main` or an equivalent source revision is an evidence-based inference from the exact UI match and version divergence, rather than a package-level proof.

## Remedy

Create a fresh signed iPhone build from the intended current source revision that includes `d693ec3` (whether that is the current branch or an integrated target branch). Before building, reconcile the displayed `APP_VERSION` so it does not reuse the already installed 115 value, and assign a monotonic iOS `CURRENT_PROJECT_VERSION` so the native package can be identified independently.

After installation, validate on the physical iPhone that the login shows `ROIs Altair`, icon-led fields, and the password eye control; capture the installed app's displayed and native build identifiers with the validation record.

## Verification performed

- `git merge-base --is-ancestor d693ec3 main` → exit 1 (not contained in `main`).
- `git merge-base --is-ancestor bb614c3 main` → exit 0 (contained in `main`).
- Read-only source comparison of `crew-app/src/features/auth/LoginScreen.tsx` and `crew-app/src/version.ts` at `main` and current `HEAD`.
- Read-only inspection of `crew-app/ios/RoyceTravelTemplate.xcodeproj/project.pbxproj`.
- `xcrun devicectl list devices` → `No devices found`.
