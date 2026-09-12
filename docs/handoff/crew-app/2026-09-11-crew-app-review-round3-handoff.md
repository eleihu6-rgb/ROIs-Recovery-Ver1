# Handoff — Crew App review round 3 (theme · city viewer · ops detail · alarms)

- **Date:** 2026-09-11
- **Area:** `crew-app` (v2 UI) + `live-server` (mobile-roster API) + docs/screenshots
- **Status:** **merged to `main` and pushed** — `origin/main` = `2a26fc6`
- **Commits:** `9908b3c` (live-server API) · `a29e745` (crew-app feature set) · `2a26fc6` (merge into main)
- **Git branch:** work done on `feat/gantt/roundtrip-pairing-builder` (merged; branch tip `a29e745`)
- **Dev context:** `docs/dev-context/2026-09-11-crew-app-theme-selector-and-sched-meetings.md`
  and `docs/dev-context/2026-09-11-crew-app-destination-view-and-flight-ops.md`
- **Screenshots:** `docs/assets/screenshots/crew-app/{theme,sched,dest,tgdest,alarms}-Ver1-*.png` (51 files)

---

## 1. What Ryan asked for (four batches, one afternoon)

1. **Theme colour selector** — four colours per the sign-off mock, remembered, and every element must follow the theme.
2. **Schedule tab** — the dock bar was too dark over white cards; use a light version of the theme colour.
3. **Meetings on Schedule** — a calendar event on a flying day must be its own card; restore the Teams join link and the meeting reminder (tap to turn off). Plus: the month stepper could go back but **not forward**.
4. **Home ▸ Explore your destinations** — tap a picture → near-full-screen city page (Ver1 style) with ETD/ETA, ATD/ATA, hotel, gate, tail, pick-up/drop-off; swipe between cities; the same detail in Trip Details. Then: fix the row order (STD → ETD → ATD; wake up → leave home → check-in), pull what we can from live, mock the rest, make it **compact with line icons**, and finally **group Upcoming Alarms by flight**.

## 2. What shipped

### live-server (`9908b3c`)

| File | Purpose |
|---|---|
| `live-server/src/services/mobile-roster/mobile-roster-service.ts` | `MobileRosterFlight` gains `register`, `estStartUtc`, `estEndUtc`, `actStartUtc`, `actEndUtc`, `blockMinutes`; SQL reads `f.register / f.est_dep_dt_utc / f.est_arv_dt_utc / f.act_dep_dt_utc / f.act_arv_dt_utc / f.blk_min` via `to_char(… 'Z')`; new `optionalUtcString` for the nullable operational columns |
| `live-server/src/__tests__/services/mobile-roster-service-et.test.ts` | asserts the new fields plus the null path for a planned flight |

### crew-app (`a29e745`)

| File | Purpose |
|---|---|
| `crew-app/src/theme/carrier.ts` | `THEME_PRESETS` (sia/thai/emerald/graphite), `THEME_LABELS`, `isThemePreset`, `resolveTheme(choice, airline)`; palette gains `dockLight` + `dockInk` |
| `crew-app/src/features/settings/settingsSlice.ts` | `themePreset` persisted at `@royce_theme` (null = follow airline), hydrated by `loadSettings` |
| `crew-app/src/features/v2/AppearanceScreen.tsx` **(new)** | the four-swatch selector + "Use airline default" reset |
| `crew-app/src/features/v2/V2Navigator.tsx` | provides `paletteFor(resolveTheme(chosen, airline))` — the single palette entry point |
| `crew-app/src/components/v2/PillDock.tsx` | Schedule tab uses `palette.dockLight` + `dockInk`; other tabs keep the frosted glass |
| `crew-app/src/features/v2/MeetingCard.tsx` **(new)** | `MeetingRow` / `MeetingCard`: Join button (`Linking.openURL`) + reminder chip (`toggleMeetingMute`) |
| `crew-app/src/features/v2/ScheduleScreen.tsx` | meetings as their own card above the flight on flying days; `sched-next-month` stepper (`shiftMonth`) |
| `crew-app/src/features/travel/opsInfo.ts` **(new)** | real-vs-mock ops layer: `legOps`, `hotelFor`, `mockGate`, `mockTransfer`, `hotelTransfer`, `blockLabel` |
| `crew-app/src/features/v2/DestinationScreen.tsx` **(new)** | full-bleed photo pager + one info block written on the picture |
| `crew-app/src/features/v2/TripDetailsScreen.tsx` | event-ordered rows, every row icon-led |
| `crew-app/src/features/v2/UpcomingAlarmsScreen.tsx` | `groupAlarmsByFlight()` + compact alarm lines |
| `crew-app/src/features/v2/useV2.ts` | `useDestinations(now)` shared by the Home strip and the city viewer |
| `crew-app/src/features/v2/PageShell.tsx` | `KvRow` gains an optional line `icon` |
| `crew-app/src/components/v2/icons.tsx` | new `bed` and `car` line icons |
| `crew-app/src/features/travel/ekRosterApi.ts`, `tripCsv.ts` | map the new API fields into `TripLeg` (`register`, `estDepUtc`, `estArvUtc`, `actDepUtc`, `actArvUtc`, `blockMinutes`) |
| `crew-app/__tests__/themeSelector.test.tsx`, `themeCoverage.test.ts`, `features/{scheduleMeetings,destinationView,tripDetailsOps,upcomingAlarms}.test.tsx` | 26 new tests (see §5) |
| `crew-app/.maestro/{et_j4002_theme_selector,et_j4002_sched_meetings,et_j4002_destination_view,tg_destination_view,tg_upcoming_alarms}.yaml` | the on-device flows used for acceptance |

## 3. Real vs mocked (know this before changing anything)

| Field | Source |
|---|---|
| STD / STA, fleet, route, check-in | roster (real, as before) |
| **ETD / ETA** | live `flight.est_dep_dt_utc` / `est_arv_dt_utc`; falls back to the schedule when the airline filed none (UI then says "no update yet") |
| **ATD / ATA** | live `flight.act_dep_dt_utc` / `act_arv_dt_utc`, **only shown once the instant is in the past** — a planned row repeats the schedule and would read as a bogus actual |
| **Tail, block time** | live `flight.register`, `flight.blk_min` |
| **Terminal / gate** | **mocked** — the `flight` table has no gate/stand/terminal columns |
| **Hotel** | real when the roster carries `hotelBooking` (TG portal capture); otherwise **mocked** per airport. The live schema *does* have a `hotel` table (airport, name, phone, address, pick_up/drop_off minutes) and `pairing_segment.duty_hotel_id`, but SIT has **0 rows** |
| **Transfer (pick-up/drop-off times, vehicle, plate, driver, contact)** | **entirely mocked**, deterministic, dial code + plate prefix derived from the layover airport |

All mocks live in `opsInfo.ts` and are flagged so the UI can print "expected". Wire the real feeds only there.

## 4. Decisions worth not re-litigating

- **Theme precedence:** explicit crew choice wins, else the airline's own colour (`resolveTheme`). The **login page keeps the Altair palette on purpose** — it is the brand page, not app chrome.
- **Schedule dock:** light tint + dark ink, never the old fixed dark slab. `themeCoverage.test.ts` enforces lightness and ≥4.5:1 contrast with the ink.
- **Theme coverage guard:** any hardcoded colour in `src/features/v2`, `src/components/v2`, `src/features/notifications` or `src/features/settings` fails the build unless the file is on the reviewed allowlist (cartoon art, schedule day-scene art, logo gold, neutral white/black alphas). Adding a real colour means adding it there *with a reason*.
- **Meeting cards:** flying day → own card **above** the flight card (mock Ver10 rule); non-flying day → mixed into that day's card.
- **Row order (Ryan, twice):** STD/STA → ETD/ETA → ATD/ATA; wake up → leave home → check-in. Tests pin both orders.
- **City page:** the photo carries the page; the detail is type-on-photo over a bottom gradient, one icon-led line per fact, and there is exactly **one** info block that follows the visible page (so screen readers and Maestro see one of each row). The `Trip details ›` entry lives in the header because the block scrolls.
- **Layover rule (`layoverStop`):** overnight = an intermediate stop the crew leaves on a **later calendar day**, or a rotation that ends away from base. A same-base round trip with a one-hour turn (ET422/423 ADD→DMM→ADD) correctly has **no** hotel.

## 5. Verification (what actually ran)

| Check | Result |
|---|---|
| `cd crew-app && npx tsc --noEmit` | PASS |
| `cd crew-app && npx jest` | **51 suites / 499 tests PASS** (26 new across theme selector, theme coverage, meeting cards, destination viewer, trip-detail order, alarm grouping) |
| `cd live-server && npx tsc --noEmit` | PASS |
| `cd live-server && npx vitest run src/__tests__/services/mobile-roster-service-et.test.ts` | PASS |
| `npm run check:ui` (repo root) | PASS — 0 hard violations (124 pre-existing warnings) |
| pre-push UI Standard Gate | PASS |
| Maestro · `et_j4002_theme_selector.yaml` | 86 steps PASS — 4 themes × Home/Schedule/Profile/Preferences + cold-relaunch persistence |
| Maestro · `et_j4002_sched_meetings.yaml` | 47 steps PASS — month forward/back, meeting card, Join, alarm silence/re-arm |
| Maestro · `tg_destination_view.yaml` | PASS — TG 35459 → PVG city page, swipe both ways, hotel + transfer, Trip Details |
| Maestro · `tg_upcoming_alarms.yaml` | PASS — grouped alarms (`alarms-Ver1-01_armed.png`) |
| Maestro · `et_j4002_destination_view.yaml` | PASS through the city page, swipes and Trip Details (see the gap in §6) |

## 6. Not verified / known gaps

- **ET city-flow last step:** the added step that scrolls Schedule to `duty-ET819` (29 Sep, Maputo overnight) to screenshot Trip Details' hotel/transfer block **did not complete** — the row was not visible after the scroll. The same block is proven on TG's PVG layover on-device and by unit tests for the ET MPM/MGQ overnights, but there is no ET screenshot of it yet.
- **Alarm grouping was only run on TG** — the ET flow does not open the alarms screen.
- **City photos:** DMM, DAR, GIZ, MGQ, MPM, KGL (and the TG regional airports) fall back to the generic photo; they need the `backend/mine/fetchCity.py` landmark pipeline. Ryan noticed the repeated picture across the ET network.
- **Hotel / gate / transport are mocks** (§3); no NOC feed exists for them yet.
- **Theme choice is device-local** (AsyncStorage) — not synced to live-server, so a reinstall returns to the airline colour.

## 7. Environment quirks (save yourself the debugging)

- **Maestro login flake:** after `launchApp: {clearState: true}` the app still remembers the **last airline**, and the picker animates in. Every flow now taps `airline-dropdown`, `extendedWaitUntil` the `airline-<code>` row, then taps it. Skipping that wait failed twice with "Element not found: airline-ET".
- **Dev LogBox:** the keychain-entitlement warning covers the dock after login. Pattern used everywhere: `tapOn "Dismiss" (optional)` before and after each tab tap, tapping the tab twice.
- **Maestro writes screenshots into the cwd** (`crew-app/`), not into `--debug-output`; move them into `docs/assets/screenshots/crew-app/` after a run.
- **Reading the simulator's captured roster** (very useful for realistic fixtures): the app container's `Library/Application Support/org.reactjs.native.example.RoyceTravelTemplate/RCTAsyncLocalStorage_V1/` holds `manifest.json` plus one MD5-named file per large key; `@royce_trips` is the JSON array of captured trips. That is how the DMM same-day-turn vs MPM overnight distinction in §4 was proven.
- Ports: live-server 3000 (already running under `tsx watch`, reloads itself), Metro 8081, PBS 3002/3030. Simulator: iPhone 17, iOS 26.5, `org.reactjs.native.example.RoyceTravelTemplate`.

## 8. Open items (not this round)

| Item | State |
|---|---|
| `gantt/src/services/__tests__/gantt-sync-manager-fallback.test.ts` + `docs/test-cases/gantt/live-sync-cr-rois-one-signoff-gate.md` | **red test**, untracked; its 15s HTTP fallback poller does not exist. Awaiting Ryan's call (implement / drop / land the doc alone) |
| Crew photo upload (Profile) | needs `react-native-image-picker` + pod install + native rebuild |
| `sql/migration/2026-09-11-crew-notification.sql` | **not executed on SIT**; needs `psql` + live-server restart |
| `docs/superpowers/completed/crew-app-v2-mock.html` | modified in the worktree (Ryan's own edit: Ver10 notes + dock) — deliberately left uncommitted |
| `docs/superpowers/specs/2026-09-11-crew-app-schedule-roster-views-design.md`, `sim_01_login.png` | untracked, not authored by this session |

## 9. Cheat sheet

```bash
# verify
cd crew-app && npx tsc --noEmit && npx jest
cd live-server && npx tsc --noEmit && npx vitest run src/__tests__/services/mobile-roster-service-et.test.ts
npm run check:ui

# on-device (live-server + Metro up, simulator booted)
maestro test crew-app/.maestro/et_j4002_theme_selector.yaml --debug-output "$(mktemp -d)"
maestro test crew-app/.maestro/et_j4002_sched_meetings.yaml --debug-output "$(mktemp -d)"
maestro test crew-app/.maestro/et_j4002_destination_view.yaml --debug-output "$(mktemp -d)"
maestro test crew-app/.maestro/tg_destination_view.yaml --debug-output "$(mktemp -d)"
maestro test crew-app/.maestro/tg_upcoming_alarms.yaml --debug-output "$(mktemp -d)"

# crew credentials: ET J4002 / Pier2026 · TG 35459 / Pier2026 (prefilled)
```

Suggested next steps: (1) finish the ET Maputo screenshot and run the alarms flow on ET, (2) seed real city photos for the ET network, (3) decide the gantt fallback test, (4) when the hotel/transport feed lands, implement it in `opsInfo.ts` only.
