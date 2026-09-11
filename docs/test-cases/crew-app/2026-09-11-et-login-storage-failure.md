# Crew app — ET login survives an AsyncStorage failure (2026-09-11)

## What changed

The roster snapshot commit is no longer allowed to fail the sign-in. The roster
fetch (the real authentication) still aborts the login on failure; only the
persistence step is best effort now.

- `crew-app/src/features/auth/ekRosterLogin.ts` — returns
  `{trips, persisted, persistenceError}`; a failed commit publishes an in-memory
  session instead of throwing.
- `crew-app/src/features/auth/authSlice.ts` — new `publishEphemeralSession`.
- `crew-app/src/features/auth/EkRosterLoginScreen.tsx` — soft notice instead of
  the blocking "Unable to load … roster" alert.
- `crew-app/src/features/auth/ekRosterSnapshot.ts` — rollback is best effort so
  the original commit error is what surfaces.

Root cause of the original report: `containermanagerd` restarted at 05:52:46 and
logged `Deleting orphaned data missing a metadata file at: …/93BB17C3-…` — it
deleted the running app's data container, so `AsyncStorage` could no longer
create its temp file (`NSCocoaErrorDomain 4`, ENOENT) and the roster write threw.

## Automated checks

```bash
cd crew-app
npx jest                                            # 44 suites / 417 tests PASS
npx tsc --noEmit                                    # PASS
```

New cases: `__tests__/features/ekRosterLogin.test.ts`
("signs the crew in for this run when atomic persistence fails",
"still aborts when a failed persistence attempt races a cancellation") and
`__tests__/features/ekRosterSnapshot.test.ts`
("keeps the original commit failure when the rollback cannot write either").

## Real-UI validation (iOS simulator, Maestro)

Healthy path — `maestro test .maestro/et_login.yaml` → PASS.
Screenshots: `docs/assets/screenshots/crew-app/et-j4002-login-home-Ver2.png`,
`et-j4002-login-upcoming-Ver2.png`.

Failure injection (proves the fix):

1. `maestro test .maestro/et_login_storage_failure_1_launch.yaml` → app on the
   login screen (its storage directory is created during startup hydration).
2. On the host, make the app's store unwritable — the equivalent of the
   container disappearing under a running app:
   `chmod 000 "<container>/Library/Application Support/<bundle>/RCTAsyncLocalStorage_V1"`
3. `maestro test .maestro/et_login_storage_failure_2_login.yaml` → tap airline →
   ET → Log in.

Result: PASS — the ET roster loads (Home shows ET895/ET894) and the soft notice
appears: "Signed in to Ethiopian Airlines — Your roster loaded, but this device
could not save your login."
Screenshots: `et-j4002-login-storage-failure-soft-notice-Ver1.png`,
`et-j4002-login-storage-failure-home-Ver1.png`.

Notes / limits: Maestro's `launchApp` must be present in a flow or the driver
only sees SpringBoard; `clearState: true` does not empty the data container on
this setup, so state had to be reset by hand. Text assertions are anchored
regexes (`.*….*`).
