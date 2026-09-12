# Crew App R'Bot assistant — design

> Request (Ryan, 2026-09-11): give the crew app an in-app AI assistant named
> **R'Bot** — (1) its own icon on the right of the nav bar that opens a chat box,
> (2) a chat box backed by an LLM (DeepSeek), (3) an assistant that can
> (a) drive every crew-app feature (navigate to the roster calendar, the route
> map, …), (b) perform actions by extracting parameters from the conversation
> (e.g. create an absence request), and (c) change app settings / alarm set-ups.
> Reference UI: Alipay's "阿宝" (dock entry + chat with a capability card).

## 1. What we build

Three pieces, reusing what already exists:

| Piece | Where | Reuses |
|---|---|---|
| Nav-bar entry | `crew-app` `PillDock` area (new sibling button, right of the pill) | theme tokens, glass-dock style, `CrewAvatar` character #0 (the existing "R'Bot mascot") |
| Chat screen | `crew-app/src/features/rbot/RBotScreen.tsx` (new stack route `RBot`) | `GradientScreen`, `PageShell`, `Icon`, agent palette |
| Brain | `ai-server` `POST /ai/crew/chat` (new, separate from the Gantt `/ai/chat`) | `src/llm/client.py` tool-calling loop + DeepSeek provider config |

The Gantt's `/ai/chat` (board filters, pairing build, …) is **not** touched: its
tool set describes a planner's board, not a crew's phone. A separate route keeps
the two prompts from fighting, and lets the crew route grow its own tools.

## 2. Architecture — brain / hands split

Same split the Gantt RBot and the auto-assign planner already use:

1. **ai-server is the brain.** It turns the crew's sentence into
   `{ content, actions: CrewAction[] }` and never touches app state. The LLM
   emits *semantic* targets (`"route_map"`, `"next_trip"`), never route names,
   trip ids or list indexes — those are phone-local facts.
2. **The app is the hands.** `dispatchCrewAction()` resolves a semantic target
   against live state (which trip is next, which index the destination has) and
   performs the navigation / state change. Anything that writes to an external
   system (an absence request) only *opens the pre-filled form* — the crew still
   presses Submit.

This keeps the model out of harm's way: a hallucinated `"route_map"` target is a
no-op, a hallucinated trip id could have been a wrong-screen navigation.

## 3. Contract

### 3.1 Request

`POST {AI_BASE}/ai/crew/chat`

```jsonc
{
  "messages": [{ "role": "user", "content": "show me my route map for September" }],
  "context": {
    "airline": "TG",              // carrier code, for tone only
    "crewId": "42596",
    "crewName": "Kim",            // optional; omit when unknown
    "today": "2026-09-11",        // crew-base local date, anchors "tomorrow"
    "screen": "Home"              // where the crew is when they asked
  }
}
```

`context` is optional but expected; `messages` keeps the last 12 turns, each
message truncated at 4000 chars (same bounds as `/ai/chat`).

### 3.2 Response

```jsonc
{
  "role": "assistant",
  "content": "Opening your route map for September.",
  "actions": [
    { "type": "navigate", "target": "route_map", "month": "2026-09", "label": "Opened route map" }
  ]
}
```

`actions` is always an array (possibly empty) and never fails the request: any
LLM/transport error comes back as `{ content: "…", actions: [] }` so the chat
shows a message instead of a spinner that never resolves.

### 3.3 Action union (phase 1)

| `type` | Fields | Client behaviour |
|---|---|---|
| `navigate` | `target` (enum below), `month?` `"YYYY-MM"`, `tripId?`, `label` | Resolve locally, then `navigation.navigate(...)` |
| `request_absence` | `fromDate` `"YYYY-MM-DD"`, `toDate`, `note?`, `label` | Open Absence prefilled; crew presses Submit |
| `set_alarm` | `action`: `enable` \| `disable` \| `set_offsets` \| `set_agenda_filter`, `wakeUpHours?`, `leaveHomeHours?`, `filter?` | Apply + reconcile alarms |
| `change_setting` | `setting`: `time_zone_mode` \| `theme` \| `avatar` \| `explore_interests`, `value`, `label` | Apply + persist |

`navigate.target` enum:
`home`, `schedule`, `roster_calendar`, `route_map`, `timeline`, `next_trip`,
`trip_details`, `explore`, `alerts`, `upcoming_alarms`, `alarm_settings`,
`absence`, `time_zone`, `preferences`, `appearance`, `personal_info`, `help`,
`global`, `profile`.

Client-side resolution of the non-trivial ones:

* `next_trip` / `trip_details` → the next upcoming trip's `tripId` (nothing to
  navigate to when the roster is empty: the assistant says so instead).
* `roster_calendar` / `route_map` / `timeline` → Schedule tab + a one-shot
  "requested roster view" intent consumed on focus (`schedViewIntent`).
* `explore` → Home tab (the Explore strip lives there).
* `help` / `absence` / `preferences` → the existing `Spec` / `Absence` /
  `Preferences` routes.

## 4. UI

### 4.1 Nav-bar entry (Image #1 reference)

R'Bot gets its **own box** beside the four tabs (Ryan, 2026-09-11: "the AI icon
should not share the same box with the other four icons"). The pill dock keeps
its four tabs and its glass treatment; R'Bot is a sibling box of the same height
(66) and radius (22) — same glass `rgba(255,255,255,.2)` on the dark ground,
`dockLight` when the dock sits on near-white content (Schedule), same shadow.
Inside: the **panda** crew avatar (`CrewAvatar` index 5 — Ryan's pick) on the
theme accent disc, with the "AI" tag under it.

Rejected alternatives: a fifth tab inside the dock (it would read as navigation,
not as an assistant) and a hidden tab that shows no box (a floating bubble over
the content collides with the trip card / quick actions).

### 4.2 Chat screen (Image #2 reference)

* Header: mascot, "R'Bot", subtitle "Your crew assistant", close (chevron) button.
* First run: greeting bubble ("I'm R'Bot …") + a **capability card** listing the
  three buckets, then suggestion chips pulled from the capability list.
* Thread: user bubble (right, accent) / assistant bubble (left, frost), busy
  state with a "…" bubble, applied-action chips under the assistant bubble.
* Input row: text field + send button; keyboard-avoiding so the field sits above
  the keyboard; scrolls to the newest message.
* The screen is a **full-height card** that slides up, not a `presentation:
  'modal'`: a modal is inset from the top, so `KeyboardAvoidingView` over-pads
  and the composer ends up behind the keyboard (Ryan hit this on the simulator:
  the typed text could not be seen). Verified visually — see §8 evidence 06.

## 5. Config

`RBotChatApiBaseURL` (iOS `SettingsManager`, same mechanism as
`EKRosterApiBaseURL` / `F8RosterApiBaseURL`), defaulting in dev to
`http://127.0.0.1:3005`. Production value is a deployment decision (see §7) —
the app refuses a plain-HTTP URL outside `__DEV__`, exactly like the existing
roster API resolvers.

## 6. Safety

* Absence is never submitted by the model: `request_absence` opens the form
  pre-filled, the crew reviews and submits (label: "Prepared your request —
  review and submit").
* Alarm/settings changes are applied immediately (they are one-tap reversible in
  the app) and echoed back in the chat as an applied chip.
* Dates are resolved by the model against `context.today`, which the client
  supplies; the client re-validates `YYYY-MM-DD` and rejects an inverted range.
* No credentials, roster or personal data are sent: the payload carries the crew
  id and carrier code only, matching what the app already sends elsewhere.

## 7. Out of scope / open decisions

1. **Production endpoint for ai-server.** Today ai-server is reachable
   locally (`:3005`) and, in the deployed EVACC environment, behind
   `ai.rois.one`. Phase 1 ships the config knob + dev default; the F8/ET public
   URL has to be chosen before a device build can talk to it.
2. **Voice input** (the reference UI has a mic). Phase 2 — needs a speech
   dependency and permissions.
3. **Roster/portal questions** ("what's my check-in time?", "do I have a
   layover in Milan?"). Phase 2: send a trimmed roster summary as context, or
   add a `query_roster` tool.
4. **Streaming responses.** Phase 1 is a single POST (fast enough for the
   short answers this assistant gives).
5. **Server-side conversation memory.** Phase 1 keeps the thread in the app
   (last 12 turns) — no per-crew server storage.

## 8. Verification

* `ai-server`: pytest for the tool→action mapping and the request bounds.
* `crew-app`: jest for the API client, the dispatcher (each action type,
  including the empty-roster edge case) and the screen (welcome card, send,
  applied chip).
* `npx tsc --noEmit`, `npx jest`.
* Maestro flow on the iOS simulator opening R'Bot from the dock, sending a
  navigation request, and asserting the target screen — on a TG crew and an ET
  crew (no cross-airline leakage).
* Screenshot captured and inspected under
  `docs/assets/screenshots/crew-app/`.

### Evidence (2026-09-11)

| Check | Command | Result |
|---|---|---|
| ai-server tools + route | `cd ai-server && .venv/bin/python -m pytest tests/test_crew_chat_tools.py tests/test_crew_chat_routes.py -q` | **20 passed** |
| ai-server full suite | `cd ai-server && .venv/bin/python -m pytest -q` | 228 passed, **7 pre-existing failures** in `tests/test_regression_routes.py` (Playwright runner group; reproduced with `main.py` reverted, so unrelated) |
| crew-app unit | `cd crew-app && npx jest` | **63 suites / 610 tests passed** |
| types | `cd crew-app && npx tsc --noEmit` | PASS |
| real LLM smoke | 5 `curl` calls to `:3005/ai/crew/chat` | route map → `navigate/route_map`; "sick tomorrow" → `request_absence` 2026-09-12→13; "alarms on + 4h" → two `set_alarm`; "dark theme" → `change_setting theme`; a DO question → no actions |
| TG crew, real UI | `cd crew-app && maestro test .maestro/v2_tg_rbot.yaml` | **PASS** — dock entry, capability card, applied chip ("Theme set to graphite"), suggestion → route map, spoken absence → pre-filled form |
| ET crew (J4002), real UI | ET login + R'Bot + "show me my roster calendar" | **PASS** — calendar opened on the ET theme, no cross-airline mixing |

Screenshots (TG): `crew-app-rbot-Ver1-00_dock-entry.png` … `-05_composer-above-keyboard.png`;
ET: `crew-app-rbot-et-Ver1-00_home-dock.png`, `-01_open.png`, `-02_roster-calendar.png`.

## 9. Phase 2 (2026-09-11, after the first merge)

### 9.1 R'Bot keeps interacting — one session across its own navigation

Request (Ryan): "change theme, then switch to calendar, then submit an absence
request" must be ONE conversation, not three.

The thread moved out of the chat screen into the store
(`features/rbot/rbotSlice.ts`), because R'Bot's own actions navigate the crew
away: any reply that landed after the screen closed used to be lost, and the
next "now do X" had no context.

* `rbotSlice`: `entries` + `unread`, capped at `MAX_STORED_ENTRIES` (40) and aged
  out after `SESSION_TTL_MS` (12h), persisted to AsyncStorage and rehydrated in
  `App.tsx`; **wiped on logout** (the conversation names duties and requests).
* `useFocusEffect` tracks real focus — a *popped* screen is the case that
  matters — so a reply that arrives after R'Bot navigated sets `unread`, which
  shows as a dot on the dock entry (also exposed as the entry's accessibility
  label, "…, new reply", because iOS folds the dot into that container).
* The model still receives the last 12 turns, so "now …" resolves against what
  was just done.

### 9.2 Local-first roster answers

`features/rbot/localAnswers.ts` answers the roster facts a crew asks most —
next duty, report/check-in time (today/tomorrow), hotel, day off, destinations —
**on the device**, before any network call. Nothing about the crew's schedule
leaves the phone for those questions, and the reply carries an "Answered on your
device" chip. Anything else falls through to the assistant unchanged.

Conservative by design: an unmatched or essay-length message returns null and
goes to the model, because a slow right answer beats a fast wrong one.
`route()` deliberately reads base → the rotation's *first non-base* arrival: a
round trip's last leg returns to base, so the naive reading printed "ADD→ADD"
(real bug, caught in the simulator on ET422 ADD→DMM).

### 9.3 UI decisions this round

* The panda sits **straight on** the entry box — no theme-coloured disc behind it
  (Ryan, 2026-09-11); the chat header uses the same panda (`RBOT_AVATAR_INDEX`),
  so one avatar means R'Bot everywhere.
* The chat slides in **from the right** like every other pushed page (Ryan),
  still a full-height card so the composer stays above the keyboard.

### 9.4 Evidence

| Check | Command | Result |
|---|---|---|
| crew-app unit | `cd crew-app && npx jest` | **66 suites / 628 tests passed** |
| types | `cd crew-app && npx tsc --noEmit` | PASS |
| the chain, real UI | `cd crew-app && maestro test .maestro/v2_tg_rbot_session.yaml` | **PASS** — local answer → theme change (chip) → "show me my calendar" (navigates, chat closes) → dock dot → reopen with **the earlier turns still there** → "now I am sick tomorrow, sort it out" → pre-filled absence form |
| ai-server prompt | `curl /ai/crew/chat` for "show me my calendar" 3 ways | each returns `navigate roster_calendar` |
| ai-server tests | `.venv/bin/python -m pytest tests/test_crew_chat_routes.py tests/test_crew_chat_tools.py -q` | 20 passed |

Screenshots: `docs/assets/screenshots/crew-app/crew-app-rbot-session-Ver1-*.png`.
APP_VERSION 111 → 112.

### 9.5 Still open

1. Production ai-server URL for the phone (§7.1) — unchanged, needs the decision.
2. Voice input, streaming, server-side memory — not started.
3. **Delegation note:** three sub-agents spawned for the ET landmark images and
   the PR/EK white-logo skill all died with the same runtime error
   ("stream disconnected before completion"), writing nothing. Those two tasks
   are therefore not started and need either a retry later or local work.

### 9.6 Reaching the phone (2026-09-11, after the first device build)

The first iPhone build said *"Network request failed"*: the dev fallback is
`http://127.0.0.1:3005`, and on a phone that is the phone. The device was also
not on the dev machine's Wi-Fi, so the Metro-host derivation (below) could not
help either.

* **Resolution order** (`crewChatApi.ts`): an explicit
  `RBotChatApiBaseURL` setting wins; otherwise development derives the host from
  the Metro bundle URL (fast on the simulator and on a LAN phone); otherwise —
  and as the fallback when that host cannot be reached — R'Bot calls
  **`https://cr.rois.one/ai`**, the same origin the crew app already uses for its
  crew API. Only a *network* failure falls through to the next origin; a real
  answer (even a 5xx) does not, so a broken service is never masked.
* **The route** lives on the existing `rois-one` Cloudflare tunnel: path rules
  `^/ai/crew/` and `^/ai/health$` → `localhost:3005`. Deliberately narrow —
  `/ai/regression/*` (which runs Playwright on the dev machine) and the Gantt's
  `/ai/chat` stay closed; both verified 404 from the internet.
* **Security gap to close next:** the published crew-chat route is
  unauthenticated, so anyone who knows the URL can spend the model budget. A
  shared token header (app sends, server checks) is the next hardening step.

### 9.7 The app icon (same device build)

The iPhone build had no icon because **only `AppIcon.appiconset/Contents.json`
was tracked — the nine PNGs were untracked**, so any build from `main` had a
catalog pointing at files that were not there. The artwork itself was already
correct (full-bleed, opaque, exact sizes). Fixed by committing the iOS set, the
Android mipmaps, `scripts/genAppIcons.mjs` and the two source SVGs, plus a guard
test (`__tests__/features/appIcon.test.ts`) that fails when a file the catalog
names is missing, when an icon carries alpha, when its pixel size disagrees with
the entry, or when an Android density lacks `ic_launcher{,_round}.png`.

### Deployment note

`ai-server` must be restarted for `/ai/crew/chat` to exist (the running instance
was restarted during this work; it is now detached on `:3005`). The crew app's
production URL for ai-server is still the open decision in §7.1.
