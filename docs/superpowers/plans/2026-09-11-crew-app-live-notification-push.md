# Crew App Live Notification + Push — Implementation Plan

Date: 2026-09-11
Status: Ready to implement (Phase 1 has no external dependency)

**Spec:** `docs/superpowers/specs/2026-09-11-crew-app-live-notification-push-design.md`

**Goal:** Make Altair Live roster changes reach the crew app, including when the
app is closed: a durable per-crew notification feed owned by `live-server`, fed by
the Live mutation points, delivered by FCM on Android and iOS, with the feed as
the source of truth and push as the wake-up hint.

**Tech stack:** Fastify + TypeScript + Drizzle/raw parameterized PostgreSQL +
Zod + Vitest (`live-server`); React Native 0.74 + Redux Toolkit + Zod + Jest
(`crew-app`); FCM HTTP v1 for delivery.

---

## Phases At A Glance

| Phase | Content | External dependency | Outcome |
|---|---|---|---|
| 1 | `crew_notification` table, service, poll + read routes, app client envelope support | none | F8/ET Alerts tab works (fixes a shipped 404) |
| 2 | Producer hooks at the Live mutation points | none | Live roster changes appear in the feed |
| 3 | `crew_device_token`, FCM adapter, native push setup | Firebase + APNs credentials | **Closed-app delivery** |
| 4 | Auth hardening (per-crew session token), coalescing, quiet hours, metrics | none | Production-grade |

Phase 1 and 2 are fully implementable today. Phase 3 can be coded now but cannot
be device-verified until the credentials in the checklist at the end arrive.

## Global Constraints

- **Emit after commit.** A notification is created only after the mutation has
  committed and `notifyRosterTasksChanged` has bumped the roster cache version —
  never from a preview or dry run. Otherwise the app fetches stale roster rows.
- **Never block the mutation.** Notification write and push dispatch are
  off-path: they must not throw into a roster mutation or roll it back.
- **Feed is truth, push is a hint.** Every push tap resolves to a feed fetch. A
  dropped push must lose nothing.
- **One contract for EK + F8/ET.** EK stays on EVACC; F8/ET come here. The app
  keeps a single client; only the base URL and envelope differ.
- **Durability, not TTL.** Notification rows are history. No expiry.
- `live-server` API envelope `{ code, data, message }` via
  `live-server/src/utils/response.ts` is mandatory on these routes.
- Additive, idempotent SQL migrations under `sql/migration/`; no destructive DDL,
  no `search_path` assumptions inside the script.
- `crew-app` version bump in `crew-app/src/version.ts` (currently 98) on every
  code change, plus a Jest test and a simulator pass.
- No commit or push without explicit instruction.

---

## Phase 1 — live-server notification feed

### Task 1.1 — Migration `sql/migration/2026-09-11-crew-notification.sql`

Follow the shape of `sql/migration/2026-09-10-cost-library.sql`: a leading
`do $$ ... $$` guard that refuses to run unless an application `search_path` is
selected, then `create table if not exists`.

```sql
create table if not exists crew_notification (
    seq bigint generated always as identity primary key,
    airline varchar(4) not null,
    crew_id varchar(30) not null,
    notif_id varchar(64) not null,
    notif_type varchar(32) not null,
    created_utc timestamptz not null default now(),
    title text not null,
    body text not null default '',
    status varchar(8) not null default 'unread'
        check (status in ('unread', 'read')),
    read_utc timestamptz,
    related_pairing_id varchar(32),
    related_flight_id varchar(32),
    related_duty_id varchar(64),
    payload jsonb not null default '{}'::jsonb
        check (jsonb_typeof(payload) = 'object')
);
create unique index if not exists crew_notification_notif_id_uidx
    on crew_notification (notif_id);
create index if not exists crew_notification_crew_seq_idx
    on crew_notification (airline, crew_id, seq);
```

Then update `sql/migration/README.md`'s executed/待执行 tables like the previous
migration did. Verify with `npx tsx run-migration.ts` or the documented `psql`
command against `f8`, and re-run once to prove idempotency.

### Task 1.2 — Drizzle model

Create `live-server/src/models/crew/crew-notification.ts` and export it from
`live-server/src/models/index.ts` under the `// ── crew ──` block, matching the
column names and `bigint(..., { mode: 'number' })` style of
`live-server/src/models/crew/crew.ts`.

### Task 1.3 — Extract the shared credential verifier

`live-server/src/services/mobile-roster/mobile-roster-service.ts:159` currently
inlines the `pbs_user` lookup + access-window checks + `bcrypt.compare`. Extract
it so both features share exactly one gate:

```ts
export interface VerifiedCrew { crewId: string; crewRowId: string }
export const verifyMobileCrewCredentials = async (
  options: MobileRosterServiceOptions,
  input: { airline: MobileRosterAirline; crewId: string; password: string },
): Promise<VerifiedCrew>
```

`authenticateAndLoadMobileRoster` then calls it and keeps its current behaviour
identical (existing tests at
`live-server/src/services/mobile-roster/__tests__/mobile-roster-service.test.ts`
must stay green — this is a pure refactor).

### Task 1.4 — Service

Create `live-server/src/services/crew-notify/crew-notify-service.ts`:

```ts
export interface CrewNotifyOptions { pgPool: ...; liveSchema?: string; now?: Date }
export const listForCrew = async (options, input: { airline; crewId; since?: number }): Promise<{
  cursor: number
  notifications: CrewNotificationDto[]
  openDiscretions: []            // EK/EVACC concept; empty here, kept for contract parity
}>
export const markRead = async (options, input: { airline; crewId; notifId }): Promise<boolean>
export const appendNotification = async (options, input: AppendNotificationInput): Promise<CrewNotificationDto>
```

Rules: `cursor` is the max `seq` for that crew; `since` returns `seq > since`;
`markRead` is idempotent and scoped by `(airline, crew_id)` so one crew can never
read another's row; `appendNotification` upserts on `notif_id` and does nothing
on a duplicate (idempotency for replayed commits).

### Task 1.5 — Routes

Create `live-server/src/routes/crew-notify/crew-notify.ts` with the live-server
envelope and Zod-validated bodies:

- `POST /notifications` — `{ airline: 'F8'|'ET', crewId, password, since? }`
- `POST /notifications/:notifId/read` — `{ airline, crewId, password }`

Register in `live-server/src/index.ts` next to the mobile-roster registration at
line 205:

```ts
await server.register(crewNotifyRoutes, { prefix: '/api/crew-app/v1' })
```

Add both exact routes to `PUBLIC_EXACT_ROUTES` in
`live-server/src/plugins/auth.ts:37` (they carry crew credentials in the body,
matching `/api/mobile-roster/session`; the global JWT hook would otherwise 401
them). Map `MobileRosterServiceError.statusCode` to `error(reply, ...)` exactly
like `routes/mobile-roster/mobile-roster.ts:29`.

### Task 1.6 — Backend tests

`live-server/src/__tests__/unit/crew-notify-route.test.ts` (mirror
`mobile-roster-route.test.ts`: `app.register(routes, { prefix })` + `app.inject`):

1. valid credentials → `code: 200` with notifications and cursor
2. wrong password → 401 `code`
3. disabled `app_access` / expired `exp_dt` → 403
4. `since` returns only newer rows
5. read is idempotent, and reading another crew's row is not possible
6. `appendNotification` with a duplicate `notif_id` does not create a second row

Run: `cd live-server && npx vitest run src/__tests__/unit/crew-notify-route.test.ts`

### Task 1.7 — App client support

`crew-app/src/features/notifications/notificationsApi.ts` posts to
`${apiBaseUrl}/crew-app/v1/notifications` and gives up if the body is not the raw
EVACC shape. Two changes:

1. Unwrap the live-server envelope when the airline is F8/ET — reuse the
   `isMobileRosterAirline` helper and the envelope check from
   `crew-app/src/features/travel/ekRosterApi.ts:222`.
2. Surface a distinguishable error so the screen can tell "service unreachable"
   from "no notifications" (the existing `throwForStatus` collapses these).

Bump `crew-app/src/version.ts` 98 → 99 and add
`crew-app/__tests__/features/notificationsApi.test.ts` cases for both envelopes.

Run: `cd crew-app && npx jest __tests__/features/notificationsApi.test.ts && npx tsc --noEmit`

### Phase 1 Acceptance

- Migration applied to `f8`, re-runnable.
- live-server route tests PASS.
- F8 crew `113` opens the Alerts tab and gets data instead of `Request not found`.
- Real-UI gate: Playwright run against `https://cr.rois.one/altair/live` plus a
  simulator pass, with a versioned screenshot under
  `docs/assets/screenshots/crew-app/`.

---

## Phase 2 — Producer hooks

### Task 2.1 — Notification catalogue

One module owning event → title/body templates so wording never drifts across
call sites: `live-server/src/services/crew-notify/crew-notify-templates.ts`.

Stage-1 events (from the design's recommended producer scope):

| Event | Trigger | Recipient |
|---|---|---|
| `roster_assignment_added` | crew gains a pairing/duty in draft or publish | that crew |
| `roster_assignment_removed` | crew loses a pairing/duty | that crew |
| `flight_time_changed` | delay/time cascade touches a flight on their pairing | crew on that pairing |

### Task 2.2 — Hook points

Call `appendNotification` **after** the existing `notifyRosterTasksChanged` call
at each site, so cache invalidation has already happened:

- `live-server/src/routes/draft/draft.ts:300`
- `live-server/src/routes/flight/flight.ts:245`
- `live-server/src/routes/scenario/scenario.ts:1510` (publish only)
- `live-server/src/workers/roster-bulk-delete-worker.ts:260,281`

Wrap every call so a notification failure logs and continues — it must never
fail the mutation.

### Task 2.3 — Suppression rules

- No notification when the diff is empty (no assignment actually changed).
- No notification for a crew already notified for the same `(event, pairingId,
  dutyId)` within a short window — derive `notif_id` deterministically from those
  keys so replay and rapid re-saves collapse onto one row.
- No notification to crew who are not in the affected crew list.

### Task 2.4 — Tests

Per hook site: one test asserting the notification is written with the right
recipients and content, one asserting a no-op edit writes nothing, one asserting
a replayed commit does not duplicate. Plus a unit test on the templates.

---

## Phase 3 — Closed-app push

### Task 3.1 — Device token migration and model

`sql/migration/2026-09-11-crew-device-token.sql` →

```sql
create table if not exists crew_device_token (
    token_id bigint generated always as identity primary key,
    airline varchar(4) not null,
    crew_id varchar(30) not null,
    platform varchar(8) not null check (platform in ('ios', 'android')),
    device_token text not null,
    app_version integer not null default 0,
    created_utc timestamptz not null default now(),
    last_seen_utc timestamptz not null default now(),
    revoked_utc timestamptz
);
create unique index if not exists crew_device_token_token_uidx
    on crew_device_token (platform, device_token);
create index if not exists crew_device_token_crew_idx
    on crew_device_token (airline, crew_id) where revoked_utc is null;
```

Plus `live-server/src/models/crew/crew-device-token.ts` and its `models/index.ts`
export.

### Task 3.2 — Push adapter

`live-server/src/services/crew-notify/push-sender.ts`, with an injectable sender
so tests never hit the network:

```ts
export interface PushSender {
  send(msg: { platform: 'ios'|'android'; token: string; title: string; body: string;
              data: Record<string, string> }): Promise<
    { ok: true } | { ok: false; unrecoverable?: boolean; status?: number; reason?: string }>
}
```

FCM HTTP v1 via `https://fcm.googleapis.com/v1/projects/<projectId>/messages:send`,
OAuth2 from the service-account JSON. `UNREGISTERED` / `BadDeviceToken` /
`SenderIdMismatch` → `unrecoverable: true`, and the caller sets `revoked_utc`.
New env keys in `live-server/src/config/env.ts` (all optional so dev and
production-like boots are unaffected when push is off):

```
CREW_PUSH_ENABLED       boolFromEnv(false)
FCM_PROJECT_ID          optionalNonBlankString()
FCM_SERVICE_ACCOUNT_FILE optionalNonBlankString()   # path to the service-account JSON
```

Also add a Prometheus counter for sends/ok/failed/revoked alongside the existing
`getOrCreateCounter` usage in `live-server/src/plugins/redis.ts`.

### Task 3.3 — Device endpoints

Extend `routes/crew-notify/crew-notify.ts`:

- `POST /devices` — `{ airline, crewId, password, platform, deviceToken, appVersion }`
  → upsert by `(platform, device_token)`, re-pointing `crew_id` if the device
  changes hands and clearing `revoked_utc`; refresh `last_seen_utc`.
- `POST /devices/revoke` — `{ airline, crewId, password, deviceToken }` → set
  `revoked_utc`; called on logout.

Add both to `PUBLIC_EXACT_ROUTES`.

### Task 3.4 — App native setup

- `crew-app/package.json`: add `@react-native-firebase/app` and
  `@react-native-firebase/messaging`; `pod install` for iOS.
- iOS: create `RoyceTravelTemplate.entitlements` with `aps-environment`; enable
  the Push Notifications capability and the `remote-notification` background
  mode (`Info.plist` `UIBackgroundModes`); add the APNs token bridge in
  `AppDelegate.mm`.
- Android: `google-services.json`, the `com.google.gms.google-services` Gradle
  plugin, `POST_NOTIFICATIONS` in `AndroidManifest.xml`, and the messaging
  service entry.
- This is the only task in the whole plan that touches native project files; do
  it as its own change so a build failure is easy to isolate.

### Task 3.5 — App token lifecycle and tap-through

- Register the token after a successful login and on every app start while
  signed in; revoke on logout (`crew-app` already has a logout path with tests
  at `__tests__/features/authLogout.test.ts`).
- Foreground and background handlers render/relay the notification; a tap
  deep-links to Alerts or the affected pairing.
- Keep the existing focus-triggered poll and add an app-foreground refresh from
  the notification's `data` payload — this is the safety net for held pushes.
- Bump `APP_VERSION`; add Jest coverage for the register/revoke calls and the
  deep-link target.

### Task 3.6 — Device verification

Required, and it cannot be replaced by Playwright:

1. Android 13+: install, sign in, force-stop the app, trigger a Live change on a
   disposable scenario/crew, confirm the notification appears and the tap opens
   the right screen. Confirm the runtime permission prompt appears on first run.
2. iOS: same with the app swiped away; confirm with Low Power Mode off first,
   then note behaviour with it on.
3. Uninstall/reinstall to prove token rotation is handled (the revoked token
   must not accumulate).

---

## Phase 4 — Hardening

- **Auth:** replace the password-in-body per request with a short-lived per-crew
  session token issued at mobile-roster login and accepted by the notify routes;
  this is in scope because `/devices` is a new externally reachable surface.
- **Coalescing and quiet hours:** collapse a burst of edits into one notification;
  honour a crew-configured quiet window for non-urgent types.
- **Metrics and SLOs:** notification write latency, push send success rate,
  feed fetch p95, and revoked-token rate.
- **Retention:** decide a notification retention window and prune job (the
  `ROSTER_SOFT_DELETE_*` env keys show the established pattern for a scheduled
  cleanup worker).

---

## Credential And Access Checklist (request from Flair)

Nothing here is a cost; all three are access issues and they gate device
verification of Phase 3.

1. **Firebase project** for the crew app, plus a **service-account JSON** with
   Messaging API access (this is what `FCM_SERVICE_ACCOUNT_FILE` points at).
2. **APNs authentication key** (`.p8`) with its **Key ID**, plus the **Apple Team
   ID** and the **iOS bundle identifier** of the shipped app — uploaded into the
   Firebase project's Cloud Messaging settings.
3. **`google-services.json`** for the Android application ID, and confirmation of
   whether Android is distributed through Google Play or an MDM/sideload channel
   (affects the notification-permission and update path).

While these are outstanding, Phase 3 code can be written and unit-tested with a
stub `PushSender`; only the device test in Task 3.6 is blocked.

## Verification Commands

```bash
# live-server
cd live-server
npx vitest run src/__tests__/unit/crew-notify-route.test.ts
npx vitest run src/services/mobile-roster      # guard the Task 1.3 refactor
npx tsc --noEmit

# crew-app
cd ../crew-app
npx jest __tests__/features/notificationsApi.test.ts
npx tsc --noEmit

# migration (against the intended schema)
cd .. && npx tsx run-migration.ts
```

The real-UI gate stays as specified in the design: Playwright against
`https://cr.rois.one/altair/live` for the user-visible outcome plus a versioned,
visually inspected screenshot under `docs/assets/screenshots/crew-app/`.

## Rollback

- Phase 1/2 are additive tables and off-path writes: disable the hooks by
  removing the producer calls; the tables can stay without effect.
- Phase 3 has its own kill switch — `CREW_PUSH_ENABLED=false` stops all dispatch
  while the feed keeps working. A bad token never blocks a roster mutation, so
  rollback does not need a deploy of the app.

## Open Items

1. Confirm the recommended provider choice in the design doc (FCM for both) so
   Task 3.2 is written once, not twice.
2. Confirm the Phase 2 producer scope (assignment gained/lost + flight-time
   change) before Task 2.1 wording is written, since it is user-facing copy.
3. Decide whether F8 and ET both ride this channel in Phase 1 or ET waits — the
   endpoints are airline-parameterised, so this is only a rollout choice.
