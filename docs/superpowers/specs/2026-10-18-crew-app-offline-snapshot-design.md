# Crew App - Cached Crew Session and Offline Mode (PR/TG) - Design

Status: PROPOSED - design only, not implemented
Date: 2026-10-18
Owner: Ryan
Scope: `crew-app` (React Native), PR and TG first; compatible with EK/F8/ET later

## 1. Problem

PR and TG crew sign-in is a live chain:

1. The app opens the carrier's portal WebView.
2. `portalClient` performs the native portal login.
3. The WebView loads the portal SPA and captures nine roster payloads.
4. The parser builds trips and duties.
5. Only after that does `LoginCaptureScreen` publish the login session and switch to the main tabs.

Duty Swap is worse: it is deliberately not persisted and every visit calls
`selectOtherCrewPublishTask` again. That search can be about 1 MB and waits up to 90 seconds.

This makes feature testing slow and unreliable because every fresh login, account switch, or
portal hiccup delays the UI the tester actually wants to exercise.

Current code already has pieces of persistence:

| Concern | Current behaviour | Gap |
|---|---|---|
| Crew password | Keychain (`sessionStore.ts`) | Available only while "Keep me logged in" is on |
| Session identity | AsyncStorage (`@royce_airline`, `@royce_crewId`, `@royce_keepLogin`) | No data-freshness metadata |
| Trips | AsyncStorage (`@royce_trips`) | Separate write from duties; no atomic snapshot |
| Duties | AsyncStorage (`@royce_duties`) | Separate write from trips; no atomic snapshot |
| EK/F8/ET roster | Transactional `ekRosterSnapshot.ts` | TG/PR do not use an equivalent snapshot |
| Duty Swap | Redux only; re-fetched on every open | No offline copy at all |
| Login | Published only after capture finishes | A slow portal blocks entry to the app |

The current "Keep me logged in" path therefore restores a session, but it does not provide a
complete, timestamped, account-safe data pack that can be opened without the portal and refreshed
on demand.

## 2. Goals

1. One successful portal login per crew creates a local data copy.
2. A cold launch with a valid session opens the app from that copy, without waiting for the portal.
3. PR/TG rosters and PR Duty Swap can be inspected offline, read-only.
4. The crew can explicitly refresh the latest data or re-login to the portal.
5. A failed refresh never destroys the last good copy.
6. PR and TG data never mix.
7. Testers can switch between cached PR and TG accounts quickly in a development-only tool.
8. The portal remains the source of truth; the local copy is a cache, not a business owner.

## 3. Non-goals

- Offline submission, acceptance, withdrawal, unlock/lock, or other Duty Swap writes.
- Queuing writes and replaying them when the network returns.
- Persisting portal tokens, cookies, or raw authentication responses.
- Persisting raw portal payloads in production. Raw captures remain development diagnostics.
- Background refresh without a user action in production. Automatic refresh may be added later,
  but it is not the default for this design.
- Replacing the existing EK/F8/ET snapshot path in the first phase. The pack model should be
  compatible with it later.

## 4. Design principles and decisions

| Decision | Choice | Reason |
|---|---|---|
| Cache shape | Parsed domain data, not raw portal JSON | Smaller, stable, and independent of portal response wrappers |
| Launch policy | Cache-first, no network on launch | Removes portal latency from the testing path |
| Refresh policy | Explicit user action | Predictable, avoids surprise data use or portal load |
| Offline safety | Read-only | Prevents false success, duplicate swaps, and stale legality decisions |
| Commit policy | Last good copy wins | A timeout or partial capture must not erase usable data |
| Identity policy | Snapshot key includes airline and crew ID | Prevents PR/TG mixing and late responses from another account |
| Session policy | Persist credentials before roster capture | A capture failure should not force the crew to log in again |
| Test policy | Separate development-only snapshot lab | Fast PR/TG switching without weakening production isolation |

## 5. Options considered

| Option | Description | Assessment |
|---|---|---|
| A. Extend `@royce_trips` and `@royce_duties` | Add a timestamp beside the existing keys | Minimal, but does not cover Duty Swap, atomicity, freshness, or account isolation |
| B. Cache raw portal payloads | Store the captured JSON and reparse later | Large, sensitive, and fragile when the portal schema or parser changes |
| C. Persist portal cookies/token | Keep the WebView session alive | Does not provide offline data, tokens expire, and it increases credential exposure |
| D. Domain snapshot pack plus explicit sync | Store parsed trips, duties, and read-only Duty Swap data per crew | Recommended: fast, testable, bounded, and account-safe |
| E. Fixture-only test mode | Seed fixed JSON for testers | Useful as an additional accelerator, but not a product offline mode |

The design uses **D** for the product and adds **E** as a development-only "Offline Lab".

## 6. Proposed architecture

### 6.1 Crew data pack

A pack is the complete local copy for one airline and crew ID.

```ts
interface CrewDataPackV1 {
  version: 1;
  identity: {
    airline: 'PR' | 'TG' | string;
    carrier: string;
    crewId: string;
    portalBase: string;
  };
  capturedAt: string;          // ISO UTC, last successful commit
  generation: number;          // increments on every successful commit
  roster?: {
    trips: Trip[];
    duties: PortalDuty[];
    windowStart?: string;
    windowEnd?: string;
    partial: boolean;
    capturedAt: string;
  };
  dutySwap?: {
    filters: SwapFilters;
    filtersKey: string;        // stable hash of filters + window
    options: SearchOptions;
    crews: SwapCrew[];
    details: Record<string, ApiCompare>;
    records?: ApiRecord[];
    myTasks?: { tasks: ApiMyTask[]; autoUnlock: boolean };
    capturedAt: string;
    partial: boolean;
  };
  lastRefresh?: {
    startedAt: string;
    finishedAt?: string;
    ok: boolean;
    errorCode?: 'AUTH_REJECTED' | 'NETWORK' | 'TIMEOUT' | 'PARTIAL' | 'STORAGE' | 'UNKNOWN';
    message?: string;          // sanitized, user-safe text only
  };
}
```

Rules:

- The pack contains no password, token, cookie, or raw portal response.
- Identity fields are checked against the active session before any UI publishes the pack.
- A pack with an unknown schema version is ignored, not guessed at.
- A pack for another airline or crew ID is ignored and never loaded into Redux.
- `filtersKey` prevents a cached Duty Swap result from being shown for a different date window
  or filter set.
- The portal remains authoritative. The pack is a convenience cache.

Cached versus not cached:

| Data | Cached | Available offline | Writable offline |
|---|---|---|---|
| Airline, crew ID, carrier | Yes, in the session and pack identity | Yes | No |
| Password | Keychain only | Used for refresh | No |
| Portal token / cookie | No | No | No |
| Trips and duties | Yes | Yes | No |
| Duty Swap search and compare | Yes, last search only | Yes | No |
| Duty Swap records and My Duties | Yes, last fetch | Yes | No |
| Submit / withdraw / accept / reject | No | No | No |
| Raw portal captures | Development only | Development only | No |

### 6.2 Storage layout

Use two data keys plus the existing session keys:

```text
@royce_roster_pack_v1:<airline>:<crewId>   -> roster section + metadata
@royce_swap_pack_v1:<airline>:<crewId>     -> duty swap section + metadata
@royce_offline_flags_v1:<airline>:<crewId> -> offline/manual flag and last UI acknowledgement
```

Reasons for splitting roster and Duty Swap:

- Duty Swap search data can be large; a roster write should not rewrite it.
- A Duty Swap failure must not invalidate a good roster.
- Roster writes and swap writes have different refresh cadences.

Each key is one JSON document and is written with one `AsyncStorage.setItem`. The previous value is
kept until the new document has been fully serialized. If a write fails, the old value remains.

Legacy keys remain read-only fallbacks during migration:

```text
@royce_trips
@royce_duties
```

When a valid new pack exists, it wins. When no pack exists, the app may migrate the legacy data into
a pack on first successful online refresh. Legacy keys are removed only after a successful pack
commit.

The existing EK snapshot path remains unchanged in phase 1. A later phase can move EK onto the same
pack contract.

### 6.3 Hydration order

The launch path must not wait for the portal.

```text
App start
  -> read Keychain session (identity + password if remembered)
  -> read roster pack and swap pack in parallel
  -> validate identity and schema
  -> publish Redux data
  -> mark auth and packs hydrated
  -> show main tabs
```

`RootNavigator` should wait only for local hydration, not for a network request. The splash should
cover the local reads; it must not cover a portal login.

A pack may contain only duties and no trips. Duty-only rosters are valid and must not be treated as
an empty capture.

### 6.4 First login

The first login for a crew still needs a real capture, but the session should be saved earlier.

```text
Login
  -> native portal auth succeeds
  -> save Keychain credential + session identity
  -> capture roster in the WebView
  -> parse
  -> validate
  -> commit roster pack
  -> publish Redux data and enter main tabs
```

If capture fails after authentication:

- Keep the saved session.
- Keep any existing pack.
- Show a clear "Signed in, roster not updated" state with retry.
- Do not require the crew to enter the password again on the next launch.

If "Keep me logged in" is off:

- The session remains in memory for this run.
- The pack may be used for this run but is not guaranteed after a relaunch.
- The login page should explain that offline mode and fast relaunch require "Keep me logged in".

This is the smallest change that removes repeated authentication waits without introducing a
background capture service.

### 6.5 Refresh

Refresh is a user action and is single-flight per airline, crew, and resource.

```text
User taps "Refresh latest"
  -> acquire per-crew refresh lock
  -> reuse in-memory portal token, or log in once
  -> fetch and parse
  -> validate the result
  -> commit the new pack
  -> publish Redux
  -> update capturedAt and clear the previous error
```

Rules:

- Do not clear the current pack before the new data is validated.
- A failed request leaves the old pack untouched.
- A partial roster does not replace a complete pack unless the user explicitly confirms.
- An empty result does not replace a non-empty pack automatically. Ask: "The portal returned no
  duties. Keep the saved copy or replace it with an empty roster?"
- A refresh that starts for PR crew A must be cancelled or ignored if the active session changes
  to TG crew B. Late responses must not write into another account's pack.
- Reuse the existing 30-second login timeout and 90-second Duty Swap search timeout. Surface a
  timeout as a retryable error, not as an endless spinner.

### 6.6 Re-login

Re-login is distinct from refresh:

| Action | Token | Password | Typical use |
|---|---|---|---|
| Refresh latest | Reused if valid; re-created once if missing/expired | Keychain copy | Normal data update |
| Re-login | Always discarded first | Revalidated; optional replacement | Password changed, token rejected, or a clean portal session is required |

Re-login flow:

1. Show airline and crew ID read-only.
2. Ask for the password only if the Keychain copy is missing or the user chooses to replace it.
3. Perform one portal login attempt.
4. On success: update the Keychain credential, then refresh data.
5. On rejection: keep the pack, stop retrying, and show "The portal did not accept your password.
   Your saved roster is still available."

There must be no automatic retry loop after a credential rejection.

### 6.7 Offline mode

Offline mode is a data-access state, not a separate app mode.

It can be entered in two ways:

- Automatically after a network or timeout failure while a pack exists.
- Manually from Profile > Data & Sync > "Work offline" for deterministic testing.

In offline mode:

- Home, Agenda/My Trips, Schedule, and read-only Duty Swap render from the pack.
- The app shows the pack timestamp and a visible offline indicator.
- Duty Swap submit, withdraw, accept/reject, unlock/lock, and publish-preference actions are
  disabled with an explanation.
- "Refresh latest" and "Re-login" remain available but require leaving offline mode.
- R'Bot may answer from the cached screen context, but server-backed requests must fail clearly.

### 6.8 Freshness model

Freshness is a UI hint, not a delete policy.

| Data | Fresh | Stale | Read-only warning |
|---|---|---|---|
| Roster | <= 24 hours | > 24 hours | Always show timestamp after 24 hours |
| Duty Swap search | <= 30 minutes | > 30 minutes | Disable write actions after 30 minutes |
| Records / My duties | <= 24 hours | > 24 hours | Disable record actions when stale |

The pack is never silently deleted because it is old. The crew decides when to refresh or clear it.

Displayed states:

- `Updated 18 Oct, 09:12`
- `Offline copy - updated 2 days ago`
- `Last refresh failed: portal timeout - showing 18 Oct copy`
- `Cached for this search only`

Use the carrier theme tokens for the banner. Do not add a second accent colour.

## 7. Duty Swap cache

Duty Swap is the largest latency source and the most sensitive cache.

### 7.1 Cached read data

The last successful search stores:

- Search filters and the exact date window.
- Search options for that window.
- Mapped crew rows, including the signed-in crew's own duties.
- Compare details already fetched for visible crews.
- Records list and My Duties state, when fetched.

The cache is keyed by `filtersKey`. If the user changes the window or filters while offline, the app
does not pretend the old result matches. It shows:

"No offline copy for this search. Go online to refresh this window."

### 7.2 Cache size

- Keep only the latest search result per crew.
- Keep only compare details referenced by the latest search.
- Drop older search generations after a successful new commit.
- Cap the serialized swap pack at a configurable limit (start with 3 MB).
- If the limit is exceeded, keep the search rows and own duties; drop optional compare details and
  fetch them lazily when online.

### 7.3 Writes

No Duty Swap write is allowed from a cached or offline state. The UI must disable the action and
explain why. This is a correctness and safety requirement, not just a UX preference.

## 8. Developer Offline Lab

The testing problem needs a faster path than a production login.

Testing workflow comparison:

| Workflow | Today | With this design |
|---|---|---|
| First PR test run | Login, wait for portal, capture, then test | Login, wait once for capture, then test |
| Next PR test run | Login and capture again | App opens from the pack; no portal wait |
| PR -> TG switch | Logout, login, wait for portal, capture | Open cached TG pack in the Offline Lab; under 2 seconds |
| Duty Swap UI test | Wait for the default window and a search | Open the saved search; no portal wait |
| Data freshness test | Re-run the whole login flow | Tap Refresh latest or Re-login |

Add a development-only screen, gated by `__DEV__` and an explicit flag such as
`ROIS_OFFLINE_LAB=1`, reachable from Profile > Developer.

It lists cached packs:

```text
PR 433535   updated 18 Oct 09:12   roster 126 duties / 14 trips   swap 120 crews
TG 35459    updated 17 Oct 18:40   roster 88 duties / 9 trips
```

Actions:

- **Open cached** - publish the pack and session identity without any portal request.
- **Refresh** - normal online refresh.
- **Re-login** - validate credentials and refresh.
- **Delete** - remove the pack and any test credential.
- **Seed fixture** - load a sanitized JSON fixture from the test bundle.

Guardrails:

- The screen and its routes are excluded from release builds.
- Test credentials and fixtures are not included in production bundles.
- Opening a pack still requires an identity match; the lab may inject the identity only through a
  development-only code path.
- Switching accounts must clear the previous Redux state before loading the next pack.

This screen is what makes PR/TG switching take seconds instead of a full portal round trip.

## 9. UX placement

### 9.1 Profile > Data & Sync

One new section:

```text
Signed in as PR 433535
Last updated: 18 Oct 2026, 09:12
Data source: Crew portal
Offline copy: 126 duties, 14 trips, 120 swap crews

[Refresh latest]  [Re-login]
[Work offline]    [Clear offline copy]
```

`Clear offline copy` is destructive and uses the standard `AppDialog` confirmation.

### 9.2 Global status

Do not show a permanent banner when data is fresh. Show a compact banner only when:

- the app is offline,
- the pack is stale,
- the last refresh failed, or
- the current screen has no cached data for its filter.

The banner includes the timestamp and a direct action ("Refresh" or "Re-login").

### 9.3 My Trips / Agenda

The existing refresh icon stays. Add a small caption under the header or in the panel:

- `Updated 18 Oct, 09:12`
- `Offline copy`
- `Refresh failed - showing saved roster`

The existing portal capture screen remains the implementation behind an online roster refresh.

### 9.4 Duty Swap

- Open from the pack immediately when available.
- Show `Updated <time>` in the search toolbar.
- Show `Offline copy - read only` when applicable.
- Disable submit/withdraw/accept/reject/unlock/lock with a single clear message.
- Provide `Refresh latest` beside the search controls, not hidden in Profile.

### 9.5 Login

The login page remains unchanged for a normal fresh login. When a remembered session exists, the
app skips the page as it does today. The new behaviour is that the main tabs can render before a
roster capture is attempted.

## 10. State and coordination

Add a small sync state separate from auth:

```ts
type Resource = 'roster' | 'swap';
type SyncState = {
  status: 'idle' | 'hydrating' | 'refreshing' | 'ready' | 'offline' | 'error';
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  error: { code: string; message: string } | null;
  resource: Resource;
};
```

Store per-resource state in Redux so every screen reads one source of truth.

Coordination rules:

- One in-flight refresh per `airline|crewId|resource`.
- An `AbortController` or generation stamp is required. When the session changes, old results are
  discarded even if the HTTP request cannot be aborted.
- Auth logout aborts all in-flight refreshes and clears the relevant packs.
- Do not dispatch `searchStarted` / `searchSucceeded` from a stale generation.

## 11. Security and privacy

1. Passwords remain in Keychain. Tokens remain in memory only.
2. Packs contain no credentials, tokens, cookies, or raw portal bodies.
3. The pack is app-sandboxed but not encrypted at rest. This matches the current trips/duties
   posture, but Duty Swap includes other crews' duties, which is more sensitive.
4. For production Duty Swap caching, either:
   - keep only the last search and expire it after 24 hours, with explicit user consent, or
   - encrypt the swap pack with a device key held in Keychain before enabling it broadly.
   Recommendation: start with the bounded last-search cache and explicit consent; add encryption
   only if the security review requires it.
5. Clear the pack on logout in production.
6. Never log pack contents, crew names, passwords, tokens, or raw responses. Debug logs may include
   counts, timestamps, error codes, and sanitized messages.
7. Reject identity mismatch and corrupted packs without exposing their contents.

## 12. Failure handling

| Failure | Behaviour |
|---|---|
| No network on launch | Load pack, show offline banner, no spinner |
| No pack and no network | Normal login/empty state with a clear retry |
| Portal login timeout | Keep pack, show retry, do not loop |
| Wrong password | Keep pack, stop retry, offer Re-login |
| Roster capture partial | Keep complete pack; show "Partial update not saved" |
| Roster returns zero trips/duties | Keep non-empty pack; ask before replacing |
| Duty Swap search timeout | Keep last search; show "Showing saved result" |
| Duty Swap filter changed offline | Show "No offline copy for this search" |
| Storage write fails | Keep old pack, show storage error, do not claim success |
| Corrupt or unknown pack | Ignore it, show "Saved copy unreadable; sign in to rebuild" |
| Account changed mid-refresh | Discard late result; no cross-account write |
| App killed during refresh | Previous pack remains; no partial commit |

## 13. Affected modules

| Area | Files / responsibility |
|---|---|
| Pack model and validation | New `crew-app/src/features/offline/crewDataPack.ts` |
| Pack storage and migration | New `crew-app/src/features/offline/packStorage.ts` |
| Refresh coordination | New `crew-app/src/features/offline/syncCoordinator.ts` |
| Session hydration | `features/auth/sessionStore.ts`, `features/auth/authSlice.ts` |
| App bootstrap | `App.tsx` |
| First login | `features/auth/LoginCaptureScreen.tsx` |
| Portal capture | `features/travel/PortalCaptureScreen.tsx`, `portalCapture.ts` |
| Roster persistence | `features/travel/tripsPersistence.ts`, `features/roster/dutiesSlice.ts` |
| Duty Swap | `features/dutySwap/dutySwapActions.ts`, `dutySwapSlice.ts`, `dutySwapApi.ts` |
| Profile UI | `features/settings/ProfileScreen.tsx` or a focused Data & Sync screen |
| Navigation | `navigation/RootNavigator.tsx`, `features/v2/V2Navigator.tsx` |
| Developer lab | New dev-only screen and route |
| Tests | `crew-app/__tests__/features/` and the existing Maestro flows |

No server schema or business-rule change is required. The portal remains the source of truth.

## 14. Verification plan

### 14.1 Unit and integration tests

- Pack schema accepts valid data and rejects wrong version, wrong identity, and corrupt JSON.
- Pack for PR crew A is never loaded for TG crew B.
- A failed refresh keeps the previous pack.
- A partial or empty result does not replace a complete non-empty pack without confirmation.
- Duty-out-only roster is accepted.
- `filtersKey` prevents cross-window Duty Swap reuse.
- Offline write guards block submit, withdraw, respond, unlock, and lock.
- Freshness labels and stale thresholds are correct.
- Single-flight prevents duplicate refreshes.
- A late response from a previous session cannot dispatch into the new session.
- `LoginCaptureScreen` persists the session before capture completes.

### 14.2 Simulator and real-UI checks

Run on iPhone Air first, then the required Duo and iPad checks only if the change affects their
layouts. Validate both PR and TG; never only one.

| Case | Expected result |
|---|---|
| PR login, capture, force quit, relaunch with network off | Main tabs render from pack; offline banner; no portal wait |
| TG login, same sequence | TG data only; no PR crew IDs or counts |
| PR Duty Swap offline | Last search and details visible; write actions disabled |
| Change Duty Swap window offline | Clear "no offline copy" message; no fabricated result |
| Refresh online | New timestamp and data; old data replaced only after success |
| Refresh fails | Old data remains; sanitized error shown |
| Re-login with wrong password | Pack remains; no retry loop; clear message |
| Switch PR <-> TG in Offline Lab | Under 2 seconds; previous account data gone |
| App killed during refresh | Previous pack remains on next launch |
| Corrupt pack | No crash; clear rebuild prompt |

### 14.3 Performance acceptance

- Cold launch with a valid pack: first roster data visible in under 2 seconds on iPhone Air.
- No portal request on launch unless the user explicitly refreshes.
- Duty Swap open from a pack: first search result visible in under 1 second.
- Cached account switch in the development lab: under 2 seconds.
- Pack serialization must not block the UI thread for more than a short frame budget; if it does,
  move serialization off the critical render path.

### 14.4 Visual and release checks

- Capture versioned screenshots under `docs/assets/screenshots/crew-app/` and inspect them.
- Use the standard `AppDialog` for confirmation and result dialogs.
- Use existing carrier theme tokens and outline icons only.
- Confirm the Offline Lab and test fixtures are absent or unreachable in release builds.
- Bump `APP_VERSION` only when implementation starts.

## 15. Rollout plan

### Phase 1 - Roster pack and cache-first launch

- Add pack model, storage, validation, and identity checks.
- Persist the session before capture.
- Commit trips and duties together.
- Hydrate from the pack on launch.
- Add Profile > Data & Sync with timestamp and Refresh/Re-login.

This phase delivers the largest testing-speed improvement.

### Phase 2 - Duty Swap read-only pack

- Persist the last successful duty swap search, options, details, records, and My Duties.
- Open Duty Swap from the pack without searching.
- Add the offline write guards and stale warnings.

### Phase 3 - Developer Offline Lab

- Add the dev-only pack list and quick PR/TG switch.
- Add sanitized fixture seeds for repeatable tests.

### Phase 4 - Optional hardening

- Encrypt the swap pack at rest if required.
- Add an opt-in background refresh policy.
- Unify EK/F8/ET onto the same pack contract.

## 16. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Stale roster or swap data is mistaken for live data | Timestamp everywhere, offline banner, stale write lock |
| Partial capture overwrites good data | Validate completeness; require confirmation to replace |
| Large Duty Swap JSON blocks storage or UI | Split keys, cap size, keep only latest search, lazy details |
| Other crews' duty data is stored on device | Bounded last-search cache, explicit consent, 24-hour expiry, optional encryption |
| Late response writes to the wrong account | Identity check plus generation/abort guard |
| Test-only code leaks to production | `__DEV__` and build-flag guard, release audit |
| Parser drift breaks an old pack | Versioned schema, defensive validation, re-sync on invalid |
| Duty-only roster is treated as empty | Make duties a first-class valid result |
| Refresh creates duplicate portal load | Single-flight per crew/resource, no auto-refresh by default |

## 17. Recommended product choices

1. **Use the pack for both product and testing.** The product gets a genuine offline read-only
   mode; testers get the same path.
2. **Do not retain PR/TG packs after logout in production.** Keep the multiple-account vault only
   in the development Offline Lab.
3. **Keep the first capture blocking, but persist the session first.** This avoids a larger
   background-capture refactor while still removing repeated logins.
4. **Cache only the latest Duty Swap search per crew.** It is the best balance of speed, size, and
   privacy.
5. **Never allow Duty Swap writes offline.** Treat freshness as a safety control.
