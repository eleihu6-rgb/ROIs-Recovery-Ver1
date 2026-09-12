# Crew App — "J4002 cannot log in" (ET roster service down)

Date: 2026-09-11 · Reported by Ryan (screenshot: *Unable to load Ethiopian Airlines roster — EK roster service unavailable*)

## What the crew saw

Ethiopian crew `J4002 / Pier2026` could not sign in. The alert correctly named
Ethiopian Airlines but the detail line said **"EK roster service unavailable"**,
which pointed at Emirates and sent the investigation the wrong way.

## Root cause (not the account, not the roster data)

1. The simulator build has `F8RosterApiBaseURL = https://cr.rois.one/api`
   (`crew-app/ios/RoyceTravelTemplate.xcodeproj/project.pbxproj`). ET and F8
   share the live-server endpoint `POST /api/mobile-roster/session`.
2. `cr.rois.one/api/*` is a Cloudflare tunnel to **this Mac's `localhost:3000`**
   (`~/.cloudflared/config.yml`).
3. Port 3000 was flapping: an ad-hoc `launchctl submit -l rois-live-server-3000`
   job and two orphaned `tsx watch` supervisors were all starting live-server at
   once. Their children fought for the port (`listen EADDRINUSE: address already
   in use 0.0.0.0:3000` in `/tmp/live-server-3000.log`), so the port spent time
   with **no listener**.
4. With no origin, Cloudflare answers **502**; the app maps any non-401/404
   response to a hardcoded `'EK roster service unavailable'`.
5. Contributing factor: the Mac disk was **100% full** (123 MB free), which also
   kills a watching dev server on write. ~7 GB of regenerable caches were freed
   (Xcode DerivedData, Homebrew downloads, Maestro artifacts, an unused
   simulator).

Proof of the flapping, same credentials, back to back:
`502, 502, 200` — then, after the supervisor took over, `200 ×10`.

## Fixes shipped in the working tree

| Area | Change |
| --- | --- |
| `crew-app/src/features/travel/ekRosterApi.ts` | 5xx now reports the real carrier + status (`ET roster service unavailable (HTTP 502)`); a dead network reports `Cannot reach the ET roster service…`; `AbortError` still passes through untouched |
| `crew-app/__tests__/features/ekRosterApi.test.ts` | +3 regression tests (502, unreachable, abort) |
| `scripts/live-server-supervisor.sh` | **single** owner of port 3000: retires duplicate launchers, keeps one `tsx watch` child, restarts it on exit *and* when it is alive but no longer listening (the silent zombie-watch mode), logs to `/tmp/rois-services/` |
| `crew-app/.maestro/et_login.yaml` | login button is tapped by `id: login-btn` (the label is "Log in" after the parallel login redesign) |

## Operating the roster service

```bash
scripts/live-server-supervisor.sh install     # launchd agent (survives logout/reboot)
scripts/live-server-supervisor.sh status      # agent + supervisor + port + health
scripts/live-server-supervisor.sh stop        # stop serving (also boots the agent out)
scripts/live-server-supervisor.sh uninstall   # remove the launchd agent
```

Installed agent: `~/Library/LaunchAgents/com.rois.live-server-supervisor.plist`
(`com.rois.live-server-supervisor`, `RunAtLoad` + `KeepAlive`).

Recovery measured after the fix: server process killed → healthy in ≤6 s;
listener-only kill → healthy in ~18 s (no manual intervention, no port fight).

## Verification

* `curl POST https://cr.rois.one/api/mobile-roster/session` with `J4002` →
  HTTP 200, crew `Getnet Kifle`, base `ADD`, 15 pairings, 3 ground duties (10/10
  consecutive 200s after the supervisor took over).
* `npx tsc --noEmit` clean · `npx jest` 57 suites / 557 tests PASS ·
  `node scripts/check-ui-standard.mjs` PASS (0 hard violations).
* **On-device proof (2026-09-11 20:13):** `.maestro/et_login.yaml` PASS on a
  freshly erased simulator (`xcrun simctl keychain <udid> reset` first — a
  remembered session lives in the Keychain and `clearState` does not wipe it):
  J4002 → Home with the Ethiopian header, `ET422 · 13 Sep · ADD → DMM`.
  Screenshot: `docs/assets/screenshots/crew-app/crew-app-et-login-Ver1-00_j4002-home.png`.
* Known follow-up found while capturing it: on the current (uncommitted) Home
  redesign the **Quick actions panel overlaps the bottom tab bar**, so
  `tab-agenda` is not hittable. The trip-list half of the ET flow is now guarded
  with `runFlow: when: visible: id: "tab-agenda"` so it resumes automatically
  once that overlap is fixed.

## Watch-outs for the next person

* Never start live-server by hand while the agent is installed — use
  `status`; a second supervisor recreates the original 502 fight.
* `maestro test` drives the booted iPhone 17 simulator regardless of
  `--device`; run one Maestro flow at a time across sessions.
* The app remembers a session in the iOS **Keychain** — `simctl uninstall` and
  `simctl erase` alone do not bring back the login screen on a device that was
  signed in with "Keep me logged in".
