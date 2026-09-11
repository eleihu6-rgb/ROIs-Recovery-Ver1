# Handoff — Crew App Live Notification + Push (PAUSED)

- **Date:** 2026-09-11
- **Area:** `live-server` (feed owner) + `crew-app` (client) + `sql/migration` (schema)
- **Status:** Phase 1 **built and verified end-to-end on the local dev DB**. Phases 2–4 **not started**. Closed-app push is **blocked on credentials from Flair** (see §5).
- **Paused by:** Ryan, 2026-09-11 — "we will get back later".
- **Spec:** `docs/superpowers/specs/2026-09-11-crew-app-live-notification-push-design.md`
- **Plan of record:** `docs/superpowers/plans/2026-09-11-crew-app-live-notification-push.md` (Phases 1–4, tasks, verification commands, rollback)
- **Dev context:** `docs/dev-context/2026-09-11-live-server-crew-app-notification-push.md`

---

## 1. The problem in one paragraph

Altair Live had no way to tell a crew member anything. `live-server`'s only
"notify" service invalidates caches and broadcasts over WebSocket to **operator
gantt clients** — the crew never hears about it. Crew notifications existed only
in EVACC for EK, delivered by polling. The F8/ET crew app was actually
**broken**: it POSTs to `https://cr.rois.one/api/crew-app/v1/notifications`, but
`live-server` had no such route, so the Alerts tab returned 404. Separately,
there is **no push plumbing at all** anywhere in the app (no `aps-environment`
entitlement, no Firebase dependency, no `POST_NOTIFICATIONS` on Android), so
"app is not open" meant "no notification, ever".

## 2. What shipped — Phase 1 (the feed)

The durable per-crew notification feed on `live-server`, plus the app client that
reads it. This alone fixes the F8/ET Alerts tab.

| File | Purpose |
|---|---|
| `sql/migration/2026-09-11-crew-notification.sql` | `crew_notification` table. Additive, idempotent, `search_path`-guarded. `notif_id` unique = idempotency key; `(airline, crew_id, seq)` index for the cursor poll |
| `live-server/src/models/crew/crew-notification.ts` | Drizzle model; exported from `models/index.ts` |
| `live-server/src/services/crew-notify/crew-notify-service.ts` | `listForCrew` (cursor, 200-row page, newest-first then ascending), `markRead` (idempotent, airline+crew scoped), `appendNotification` (`on conflict do nothing`, returns the existing row on replay) |
| `live-server/src/routes/crew-notify/crew-notify.ts` | `POST /notifications`, `POST /notifications/:notifId/read`; live-server `{code,data,message}` envelope |
| `live-server/src/index.ts` | Registers the routes at prefix `/api/crew-app/v1` |
| `live-server/src/plugins/auth.ts` | Public-route exemption for both endpoints; new `matchesRoutePattern` supports a `:param` segment so the exemption stays method- and shape-bound instead of opening a prefix |
| `live-server/src/services/mobile-roster/mobile-roster-service.ts` | Extracted `verifyMobileCrewCredentials` — roster and notifications now share one credential gate (pure refactor) |
| `crew-app/src/features/notifications/notificationsApi.ts` | F8/ET unwrap `{code,data,message}`; non-200 codes surface the backend message. EK path untouched |
| `crew-app/src/version.ts` | `APP_VERSION` 98 → 99 |

Behaviour rules worth remembering:

- Responses carry the **live-server envelope**; EVACC (EK) returns raw. The app
  branches on `isMobileRosterAirline(airline)`.
- The feed is scoped by **airline + crew** so a shared crew id across F8/ET
  cannot leak rows.
- `notif_id` is the idempotency key — a replayed Live commit must not create a
  second row.
- `openDiscretions` is always `[]` here: FDP discretion is an EK/EVACC concept,
  kept in the response only so the app has one shape.

## 3. Verification evidence (actual results)

**Automated (all PASS):**

| Command | Result |
|---|---|
| `live-server`: `npx vitest run src/services/crew-notify src/__tests__/unit/crew-notify-route.test.ts src/services/mobile-roster src/__tests__/unit/mobile-roster-route.test.ts` | 4 files / 28 tests |
| `live-server`: `npx tsc --noEmit` | clean |
| `crew-app`: `npx jest __tests__/features/notificationsApi.test.ts` | 9 tests |
| `crew-app`: `npx jest __tests__/features/NotificationsScreen.test.tsx __tests__/features/notificationsSlice.test.ts` | 7 tests |
| `crew-app`: `npx tsc --noEmit` | clean |

**Live end-to-end against the local dev DB** (`localhost:5432/rois`,
`search_path=f8_sit_live`), real F8 crew `113`, dev server on :3000:

| Probe | Result |
|---|---|
| `POST /api/crew-app/v1/notifications` (real creds) | `code:200`, row returned, `cursor:1` |
| `POST .../e2e-crew-notify-1/read` | `{ok:true}`; DB showed `status=read`, `read_utc` set |
| Re-poll with `since=1` | `{cursor:1, notifications:[]}` |
| Wrong password | HTTP 401 |
| Either endpoint with no `Authorization` header | reached the handler (public exemption works) |
| Invalid airline `EK` | `code:400` with a Zod enum message |

The test row was deleted afterwards; the table is back to 0 rows.

**Migration state:** applied to the local dev DB `f8_sit_live` and re-run to
prove idempotency (`NOTICE: relation ... already exists, skipping`). **Not
applied to any other environment.**

**Known unrelated failures:** `live-server/src/__tests__/unit` has 3 files / 6
tests failing (`roster-inbound-worker`, `scenario-publish-roster-route`,
`scenario-route-audit-user`). Confirmed pre-existing by re-running them with the
auth-plugin change stashed out.

**Not verified — do not claim it:** no simulator run, no real-UI Playwright run,
no device push. The F8 Alerts tab has not been looked at on a screen yet.

## 4. Decisions already made — do not re-litigate

1. **The durable feed is the source of truth; push is only a wake-up hint.** A
   dropped push must lose nothing, and the focus-time poll stays as the safety
   net.
2. **FCM for both Android and iOS** is the recommended provider. Google's
   Firebase pricing page lists Cloud Messaging as *No-cost*, and the only real
   money is the Apple Developer Program membership we already need for iOS
   signing. One server credential, one RN library, one adapter.
3. **Self-hosted ntfy / Gotify / UnifiedPush is rejected** for this requirement:
   it cannot wake a closed iOS app at all, and on Android it still travels
   through FCM underneath. It is not a cheaper equivalent.
4. **The store belongs to `live-server` (Postgres)**, not an extension of
   EVACC's Redis store — Live data has one owner and stays queryable next to the
   roster tables.
5. **EK stays on EVACC; F8/ET come here; one app-facing contract.** Any contract
   change must land in both places or the app forks.
6. **Emit after commit** — never from a preview or dry run, and only after
   `notifyRosterTasksChanged` has bumped the roster cache version.

## 5. Blocked: the three credentials, and who owns the accounts

All three must be issued by an account Flair or ROIS owns; we cannot self-issue
any of them. Exact identifiers from this repo: iOS device bundle ID
`com.eleihuus.roycetravel`; Android application ID `com.roycetraveltemplate`.

| Item | Where it comes from | Where it goes |
|---|---|---|
| Firebase **service-account JSON** | Firebase Console → Project settings → **Service accounts** → Firebase Admin SDK → *Generate new private key*. Requires a Firebase project, which does not exist yet | live-server env: `FCM_SERVICE_ACCOUNT_FILE` (+ `FCM_PROJECT_ID`). Treat as a production secret — it can push to every crew device. A dedicated service account with only `roles/firebase.messaging` is a safer ask than an owner-level key |
| **google-services.json** | Same project → Project settings → **General** → Your apps → Android app with package `com.roycetraveltemplate` | `crew-app/android/app/google-services.json` |
| **APNs `.p8` + Key ID + Team ID + bundle ID** | Apple Developer Program → **Certificates, Identifiers & Profiles** → Keys → **+** → *Apple Push Notifications service (APNs)* → download `.p8` (one-time download only), note Key ID. Team ID is on Membership details. Requires Account Holder or Admin | Firebase Console → Project settings → **Cloud Messaging** → Apple app configuration. Alternative: hand the `.p8` to us and we call APNs HTTP/2 directly, which means maintaining a second sender |

**Open ownership question to settle before asking:** the iOS bundle id is under
`com.eleihuus.roycetravel`, which does not look like a Flair corporate account.
Whoever owns that Apple team and the Firebase project is the party that has to
produce these; without settling it, the request bounces between teams.

## 6. Open product decisions (needed before Phases 2–3 are written)

1. **Producer scope** for Live events — (a) assignments the crew personally
   gained/lost, (b) also flight-time changes on their pairings, (c) everything
   including manday/legality flags. *Recommended: a+b.* This is user-facing copy,
   so it gates the template wording.
2. **ET rollout** — same time as F8, or later. The endpoints are already
   airline-parameterised, so this is only a rollout choice.
3. **Confirm FCM-for-both** so the push adapter is written once.

## 7. Resume steps

```bash
# 1. Client available? (installed 2026-09-11)
which psql && psql --version            # /opt/homebrew/bin/psql, libpq 18.6

# 2. Apply the migration wherever the DB is reachable (idempotent)
cd /Users/kimi/DevOps/ROIs-Recovery-Ver1
DBURL="$(grep -E '^DATABASE_URL=' live-server/.env | cut -d= -f2-)"
psql "$DBURL" -f sql/migration/2026-09-11-crew-notification.sql

# 3. Regression check
cd live-server && npx vitest run src/services/crew-notify \
  src/__tests__/unit/crew-notify-route.test.ts src/services/mobile-roster \
  src/__tests__/unit/mobile-roster-route.test.ts && npx tsc --noEmit
cd ../crew-app && npx jest __tests__/features/notificationsApi.test.ts && npx tsc --noEmit

# 4. Live probe (dev server on :3000 hot-reloads via tsx watch)
curl -s -X POST http://127.0.0.1:3000/api/crew-app/v1/notifications \
  -H 'Content-Type: application/json' \
  -d '{"airline":"F8","crewId":"113","password":"<crew password>"}'
```

Then: Phase 1 real-UI acceptance (Alerts tab for crew 113, plus a Playwright pass
against `https://cr.rois.one/altair/live` with a versioned screenshot under
`docs/assets/screenshots/crew-app/`), then Phase 2 producer hooks.

## 8. What is next, concretely

**Phase 2 — producer hooks** (no external dependency). Call
`appendNotification` after the existing `notifyRosterTasksChanged` at each site
(line numbers as of 2026-09-11, expect drift):

| Live event | Call site |
|---|---|
| Draft save / assignment change | `live-server/src/routes/draft/draft.ts:300` |
| Flight edit / delay cascade | `live-server/src/routes/flight/flight.ts:245` |
| Scenario publish to live | `live-server/src/routes/scenario/scenario.ts:1510` |
| Bulk de-assign worker | `live-server/src/workers/roster-bulk-delete-worker.ts:260,281` |

Every call must be wrapped so a notification failure logs and continues — it
must never fail the roster mutation. Suppress no-op diffs and derive `notif_id`
deterministically from `(event, pairingId, dutyId)` so replays collapse.

**Phase 3 — closed-app push.** `crew_device_token` table + register/revoke
endpoints, FCM HTTP v1 adapter with an injectable sender, the native setup
(entitlements, `Info.plist` background mode, Android manifest + Gradle plugin),
token registration/revoke on login/logout, and deep-link tap-through. Phase 3
code can be written against a stub sender while the credentials are outstanding;
only the on-device test is blocked.

**Phase 4 — hardening.** Per-crew session token (replacing password-in-body),
coalescing + quiet hours, metrics, retention/pruning.

## 9. Deliberately not done

- No notification templates or wording — waits on the producer-scope decision.
- No device-token table, no push adapter, no native project changes.
- No changes to EVACC or EK.
- **Nothing committed or pushed** (repo rule: explicit instruction required).
