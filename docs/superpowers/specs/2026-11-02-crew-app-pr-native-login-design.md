# Crew App PR native login design

Status: implemented; PR accepted on iPhone Air, remaining device/reverse checks recorded below
Date: 2026-11-02

## Goal

Make Philippine Airlines sign-in use the same direct native ROIS authentication and roster pull as THAI. PR login must not mount the crew portal WebView.

The existing TG loading screen is the visual benchmark. This change introduces no new layout, motion, navigation, or carrier styling.

## Acceptance

| ID | Entry and action | Expected result and persistence |
| --- | --- | --- |
| PR-NATIVE-01 | Fresh login, choose PR, enter crew `452320`, submit valid credentials | Native client calls the standard account `/login` endpoint (never SSO) with fixed `outCaptcha: "202604"`, fetches all nine previous/current/next-month datasets, imports the PR roster, and opens the app. Keep Login persistence remains unchanged. |
| PR-NATIVE-02 | Observe PR sign-in from submit through roster import | The carrier-themed signing-in/loading-roster screen is visible. `portal-capture-web` is never mounted. |
| PR-NATIVE-03 | Submit rejected PR credentials or let login exceed 30 seconds | One attempt ends with the existing recoverable error, exact crew ID, and Back to login action. No automatic retry or WebView fallback occurs. |
| PR-NATIVE-04 | Log in as PR, log out, then log in as TG; repeat in reverse | Each login uses the same native ROIS path. Trips and duties are replaced at the login boundary, so neither airline's roster remains in the other session. |

## Verification map

- PR-NATIVE-01/02: focused Jest asserts PR crew `452320`, account `/login` rather than SSO, fixed captcha `202604`, PR API-site configuration, nine native calls, parser options, completion, and no WebView.
- PR-NATIVE-03: existing native-login failure/timeout Jest coverage plus the PR screen recovery assertion.
- PR-NATIVE-04: existing account-switch isolation coverage, followed by real simulator login on both airlines.
- Real UI: iPhone Air first, then Duo, then iPad; capture uncropped evidence of the PR loading/result state and TG reverse transition.

## 2026-11-02 verification result

- PR-NATIVE-01/02 — **executed/pass**, build 340, iPhone Air simulator. Fresh PR crew `452320` login imported the live roster and reached Home without `portal-capture-web`. Evidence: `docs/assets/screenshots/crew-app/portal-452320-auto-import-home-Ver2.png` and the uncropped portrait capture `docs/assets/screenshots/crew-app/portal-452320-native-login-air-Ver2.png`.
- PR-NATIVE-03 — **executed/pass** in focused Jest for native failure/timeout recovery; real rejected credentials were not submitted.
- PR-NATIVE-04 — **blocked** for the Air PR→TG reverse transition: PR passed, but TG crew `35459` did not reach Home within the 30-second login limit. The run was stopped without retrying the credential. Unit-level TG native-path coverage remains passing.
- Duo and iPad — **not-tested** in this change. Two simulators were already booted, including a Duo session that was left untouched; the two-simulator resource limit prevented starting iPad validation.
