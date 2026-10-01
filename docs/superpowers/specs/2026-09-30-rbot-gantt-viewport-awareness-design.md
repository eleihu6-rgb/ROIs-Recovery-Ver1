# R'Bot Gantt Viewport Awareness — Design (Plan)

> Date: 2026-09-30
> Status: P1 + P2 implemented 2026-09-30. P2 delivered: read-to-read diff (viewport-diff.ts), viewDefaults + ai-server VIEW_DEFAULT_FIELDS registry for build_pairings / auto_assign_pairings. Deferred from P2: get_viewport tool (read without the button) and per-change source labels (you / live update / draft). P3 delivered 2026-09-30: L2 plan card (rbot-plan-card.tsx) with legality pre-check, Yes/Keep as draft/Cancel, confirmed Save via the normal saveDraft path, post-save re-read report, dictionary kill switch + cap (SYS_PARAM RBOT_AUTONOMY / RBOT_MAX_PLAN_CHANGES, sql/seed/34-rbot-policy.sql), manual-only op types, server audit log line (via=rbot + instruction), save_changes / undo_changes tools, coverage audit (docs/modules/gantt/rbot-feature-coverage-audit.md). P3b 2026-09-30: coverage recompute fix (pairing-store refreshDraftCoverage recomputes only draft-changed slots), recover_violation / recover_open_pairing / best_fit_crew tools, Scenario e2e written (blocked: SIT live-server DB role lacks USAGE on f8_sit_scenario → Scenario list API 500). Deferred from P3: §16.5 inverse-plan card after Save, per-user kill switch, durable audit table, wiring the uncovered features in the audit.
> Builds on: `2026-06-02-ai-chat-gantt-control-design.md` (R'Bot chat + tool-calling)

## 1. Goal

R'Bot today *acts* on the Gantt (filter / sort / build / assign) but is **blind**: it cannot see what the
user is looking at. Add "View Gantt": one click in R'Bot reads the current viewport, and R'Bot talks
about it — "42 crew on screen, 7 open pairings, 3 with violations" — then lets the user drill in.

Non-goals (v1): mutating data from the snapshot, cross-month analytics, reading unloaded data.

## 2. User flow

1. R'Bot panel shows a **quick-nav row** above the input: `[👁 View Gantt]` (+ later: `Selection`).
2. Click → client builds a **ViewportSnapshot** from already-loaded stores (no new fetch).
3. R'Bot posts a summary bubble (numbers are computed client-side, not by the LLM), plus follow-up chips:
   `Open pairings` · `Crew with violations` · `Busiest crew` · `Clear`.
4. Chip / free text ("which open pairings are DXB→LHR?") goes to `/ai/chat` **with the snapshot attached**
   as context; answers are grounded in it.
5. Phase 2 "Pick" mode: click a crew row / duty puck / pairing on the canvas → snapshot of that object
   (crew: duties, MBH/credit, violations; pairing: legs, coverage, crew assigned).

## 3. What the snapshot contains (compact, PII-light)

| Block | Source (existing store) | Fields |
|---|---|---|
| Window | `gantt-view-store` (scrollX, pxPerHour, viewportWidth), `timezone-store` | `startUtc`, `endUtc`, tz, period label |
| Filters | `filter-store` | active crew/pairing/flight filters (echoed so R'Bot explains "why so few") |
| Roster | `roster-store` rosterItems + `crew-store` | crew loaded / total, crew with ≥1 duty in window, ground-task count, per-rank / per-base counts |
| Pairings | `pairing-store` | pairings in window by coverage (open / partial / full / over), open credit total |
| Flights | `flight-store` | flights in window, by status |
| Violations | `session-violation-store` / `legality-store` | count by rule for **loaded crew only** |
| Meta | — | `loadedCrew`, `totalCrew`, `isFullyLoaded` so R'Bot says "of the 60 loaded (412 total)" |

Cap: send aggregates + at most N=20 named items (ids/labels only), never raw rows → small payload, no
crew personal data beyond employee code.

## 4. Options (pick one)

| | A — Client snapshot + attach to chat | B — LLM tool `get_viewport` (client executes) | C — Server recomputes from DB |
|---|---|---|---|
| Idea | Button builds digest locally; digest rides along with the chat request | LLM asks for the view when it needs it; client runs the tool and replies | Send only window params; ai-server / live-server query DB |
| Accuracy | Exact (deterministic counts) | Exact, but adds a round trip | Can disagree with what's on screen (unsaved drafts, filters) |
| Latency | Instant summary bubble, no LLM needed | +1 LLM loop | Slowest, hits DB (§First-Paint risk) |
| Fits today | Small change: extends `ChatRequest` | Needs a client-side tool loop (today tools only return actions) | Duplicates store logic |

**Recommendation: A for v1** (button + instant client-computed summary; digest attached to later turns).
Add B in v2 so typed questions ("how many open pairings here?") work without pressing the button.
Skip C: it answers about the database, not about the screen.

## 5. Architecture

```
gantt (shared layer)                                   ai-server (:3005)
AiChatPanel ─ [View Gantt] ─▶ buildViewportSnapshot()  POST /ai/chat
   ▲                          (pure fn over stores)      { messages, viewport?: Snapshot }
   │ summary bubble + chips   ─────────────────────────▶ system prompt gets
   └─────────────────────────◀── { content, actions }     "== Current viewport ==" block
```

- **Gantt-Unify**: `buildViewportSnapshot` reads through `GanttPaneSource` (new optional capability
  `getViewportSnapshot`) with Live / Scenario adapters supplying only source differences. No `if (live)`
  branches in the panel.
- New files: `gantt/src/components/ai-chat/viewport-snapshot.ts` (pure builder + unit tests),
  `viewport-summary.ts` (formatter), extend `types.ts` / `use-ai-chat.ts` / `ai-api.ts`.
- ai-server: `ChatRequest.viewport` (Pydantic, size-capped) → appended to system prompt in `routes.py`;
  prompt rule: "answer only from this block; if a number isn't in it, say so".
- Stale guard: snapshot carries `capturedAt`; re-built on each button press and on send if older than
  the last store change (cheap version counter), so R'Bot never quotes a scrolled-away view.

## 6. Risks / rules touched

- **§First-Paint**: snapshot reads loaded state only; must never trigger a fetch or block first render.
  Violations counted for loaded crew only (matches existing rule).
- **Drafts**: counts must reflect what's on screen incl. unsaved staged edits — read from the displayed
  `rosterItems` / draft store, not `baseItems`. Label as "(includes unsaved changes)".
- **LLM hallucinated numbers**: mitigated by client-computed summary bubble + prompt grounding rule.
- **Privacy**: aggregates + employee codes only; no console.log of snapshot (security rule).
- **Prompt injection**: snapshot strings (labels, notes) go in a delimited data block, treated as data.
- **Perf**: builder is O(loaded items) single pass, memoized on store version; budget < 20 ms.
- UI text in English; pop-up/tokens per style standard (chip = existing button tokens, no `text-[Npx]`).

## 7. Verification plan

- Vitest: `viewport-snapshot.test.ts` — window clipping (duty straddling edge counts once), coverage
  buckets, filter echo, draft inclusion, cap of 20 items, empty state vs not-loaded state.
- pytest: `/ai/chat` with `viewport` attaches block; oversize snapshot rejected/truncated.
- Playwright (`e2e/tests/gantt/rbot-view-gantt.spec.ts`), real UI: open Gantt → open R'Bot → click
  `View Gantt` → assert the bubble's crew / open-pairing counts equal the pane badge counts read from the
  UI; apply a filter → click again → counts change and wrong items absent; scroll the timeline → window
  label changes. Realistic multi-leg pairing data (§Real-Business-Case-Test). Versioned screenshots
  `docs/assets/screenshots/gantt/rbot-view-gantt-Ver1.png`, inspected.
- Sign-off on `https://cr.rois.one/altair/live` (Ryan's target), plus Scenario gantt to prove Gantt-Unify.

## 8. Phasing

1. **P1** snapshot builder + button + client summary + attach to chat (Live + Scenario).
2. **P2** LLM `get_viewport` tool so typed questions work; drill-down chips (open pairings list →
   click row = existing "bring crew to top" gesture).
3. **P3** Pick mode (click object on canvas → object card + Q&A).

## 9. Decisions (Ryan, 2026-09-30)

1. v1 = one **View Gantt** button (no auto-glance; typed view-questions come in P2).
2. "Open pairings" = pairings with **an open position**: coverage `open` + `partial` (pure open and partial open).
3. Snapshot covers **all open panes** (Roster + Pairing + Flight, plus any extra pane instances), each block labelled by pane.

## 10. Conversation drives existing features (view-aware)

R'Bot already routes typed intent to tools in `ai-server/src/chat/tools.py`. The new work is making them
**viewport-aware** so the user can say "build pairings for what I'm looking at" or "assign these open ones".

| Existing tool (client action) | Use the snapshot to... |
|---|---|
| `build_pairings` (opens Pairing Build dialog) | default base / fleet / date range from the view when the user omits them; today it asks back |
| `auto_assign_pairings` (opens Auto-assign dialog) | "assign the open pairings here" -> crew = crew on screen, range = window; still no-commit |
| `filter_crew` / `filter_pairing` / `filter_flight` / `sort_roster` / `reset_filters` / `set_date_range` | "show only the partial ones", "sort these by credit" resolve against what is visible |
| `move_task` / `swap_tasks` / `unassign_task` / `add_ground_task` | resolve "this crew / that duty" from the picked object (P3); still staged only, human presses Save |
| `prepare_pa_removal`, `create_crew_bids` | unchanged; snapshot only supplies default scope |

Rules:
- **Deduce, then confirm**: when a value is inferred from the view, the reply says so ("Using DXB, A380,
  Sep 1-30 from your view") and the dialog opens pre-filled, never auto-run. Mutations stay staged/no-commit.
- **One registry**: add a small `feature registry` (name, description, needs-view-fields) in ai-server so new
  Gantt features become callable by adding one entry, not by editing the prompt.
- **Ambiguity**: several panes/dates match -> R'Bot asks one short question, never guesses a crew id.
- Reuses `dispatchAiAction` sequential dispatch and its legality confirm dialogs; no new mutation path.

Test: Playwright, real UI - click View Gantt, say "build pairings for this view", assert the Pairing Build
dialog opens with base/fleet/range equal to the view; "auto assign the open ones" opens Auto-assign with the
on-screen crew; nothing is saved without Save.

## 11. Voice ("listen") - needs your call

"Listen to user input" is ambiguous. Nothing in gantt uses speech today.
- **V0 (in scope):** typed chat only; R'Bot "listens" = understands intent via tools (section 10).
- **V1 (P4, optional):** mic button using browser Web Speech API (no new dependency; audio may go to the
  browser vendor's cloud - security review needed for crew data) -> transcript into the same chat box.
- **V2:** server-side speech-to-text via ai-server (needs approved provider).
Recommendation: ship V0 now; V1 only if you mean real voice.

## 12. Overall goal and pillars (Ryan, 2026-09-30)

R'Bot becomes a **co-pilot that sees, changes and talks**, not only a filter chatbot.

| # | Pillar | Meaning | Delivered by |
|---|---|---|---|
| 1 | **Operate as the user** | R'Bot can do anything an existing feature lets a user do | Action registry over the same store/service handlers the UI calls (sections 10, 13) |
| 2 | **LLM-instructed** | User gives plain-language orders; LLM picks and sequences features | Tool-calling loop in ai-server (exists), extended to multi-step plans |
| 3 | **Read the screen + changes** | Review on-screen objects; user triggers "Read"; R'Bot reports what changed since last read | ViewportSnapshot (sections 2-5) + snapshot diff (section 14) |
| 4 | **Talk and interact** | Two-way dialogue: R'Bot asks, confirms, explains, reports back | Chat now; optional voice (section 11) |

## 13. "Operate as user" - how, and how safely

Two ways to act:
- **A. Action registry (recommended):** each feature exposed as a typed action that calls the same store
  action / service the button calls (what `dispatch-ai-action.ts` does today). Fast, testable, honours the
  same locks, legality confirm dialogs and drafts. Coverage grows by registering features.
- **B. UI puppeteering:** R'Bot clicks real buttons. Brittle (selectors, canvas objects), slow, harder to
  audit. Only for features that have no callable action; prefer adding the action instead.

Autonomy levels (one setting; **Ryan chose L2 as the target level on 2026-09-30**, see L2 contract below; P1-P2 ship read/stage only, L2 arrives with P3):
- **L0 Read-only**: describe, answer, never act.
- **L1 Stage (default)**: change only draft state or open pre-filled dialogs; human reviews and presses Save/Apply.
- **L2 Commit with confirm**: R'Bot may press Save after an explicit per-plan "Yes, do it" card listing the exact changes.
- Never autonomous: delete/cancel flights, publish/import, anything outside the user's permissions.
Every action runs **as the logged-in user** (same permissions, same audit trail), shows a "R'Bot did: ..."
chip, and is undoable through the existing draft/undo history. Multi-step plans show the plan first, then run
steps sequentially (existing sequential dispatch), stopping at the first failure or legality warning.

## 14. Read = snapshot + change tracking

- **Read** (button, later voice/typed) takes a snapshot and stores the previous one.
- **Diff**: "since your last read: 3 open pairings became full, T2004 gained a duty, 2 new violations
  (rule 8002)". Objects are keyed by id (pairing id, crew id, roster item id) so moves are detected.
- Change sources: user edits, other users' websocket updates, solver/auto-assign results, drafts.
  Label each ("you" / "live update" / "unsaved draft").
- Optional later: a passive "changes pending" dot on R'Bot when the view changed since last read (no LLM
  call, no cost) so the user knows when to press Read.

## 15. Phasing (final)

1. **P1** View Gantt snapshot + summary + attach to chat, all open panes, Live + Scenario.
2. **P2** Snapshot diff ("what changed") + view-aware defaults for build/auto-assign/filters + feature registry.
3. **P3** Full action coverage: audit every user-facing feature, register missing ones at L1; multi-step plans with plan card.
4. **P4** Pick mode on canvas objects ("move this to T2004").
5. **P5** Voice (STT/TTS) if confirmed; L2 commit-with-confirm if confirmed.

## 16. L2 contract - commit with confirm (decided 2026-09-30)

R'Bot may press Save/Apply itself, but only through a **confirmation card** the human approves per plan.

1. **Plan card before any commit**: lists exact changes (crew, pairing, date, old -> new), counts, legality
   result. Buttons: `Yes, do it` / `Edit` / `Cancel`. Approval covers only that card, never a later plan.
2. **Stage first, then commit**: steps run into the draft store (L1 path); legality/lock dialogs still fire;
   the commit is one Save of the staged batch. Any legality warning/violation pauses and re-asks.
3. **Runs as the logged-in user**: same permissions, locks and audit fields (`created_by`/`updated_by`) as a
   human Save; audit log also records "via R'Bot" + the user's original instruction text.
4. **Post-commit report**: R'Bot re-reads the view and reports the real outcome (diff, section 14), not "done".
5. **Undo**: existing undo/history for staged edits; after Save, R'Bot offers the inverse plan as a new card.
6. **Hard limits (no L2 even with Yes)**: cancel/delete flights, import/publish, rule/param changes,
   permission changes, bulk over a configurable cap (dictionary parameter, e.g. max crew/duties per plan).
7. **Shared SIT data**: dev/E2E runs write to shared `f8_sit_*`; L2 tests use agreed fixture crew/pairings
   only and restore afterwards.
8. **Kill switch**: per-user/per-env setting to drop to L1 or L0 without a deploy.

Extra tests: Playwright asserts no data changes before `Yes`; Cancel leaves DB untouched; Yes commits
exactly the listed changes and the post-read diff matches the card; a legality warning halts the commit.
