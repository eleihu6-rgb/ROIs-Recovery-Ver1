# R'Bot Simulate Crew Bids To Portal

> Date: 2026-06-24
> Status: approved design
> Related: `docs/superpowers/specs/2026-06-21-rbot-create-crew-bids-design.md`,
> `docs/modules/pbs/npbs-bids-simulation-playbook.md`

## Goal

Give R'Bot the same practical crew-bid simulation capability that can already be launched from a
terminal: a planner types a short chat command such as `simulate crew bids to portal for June YUL
base`, R'Bot recognizes the intent, extracts the month and base, asks for rank if it was not
specified, then launches the existing headed Playwright flow that logs in through the crew portal
and enters bids as real crew would.

The feature should feel like a conversational wrapper around the existing NPBS-to-portal simulation,
not a new bid importer. Bids are still entered only through the portal UI.

## User Flow

1. Planner opens R'Bot in the Gantt application.
2. Planner says a phrase such as `simulate crew bids to portal for June YUL base`.
3. R'Bot recognizes the crew-bid simulation intent and extracts:
   - month: `June`
   - base: `YUL`
4. If rank is absent, R'Bot asks one follow-up question: `Which rank should I use for June YUL crew
   bids?`
5. Planner replies with a rank such as `CA` or `FO`.
6. R'Bot launches the existing crew-bids run:
   - generate a scoped fixture from the NPBS export
   - start headed Playwright with one crew at a time
   - login, enter days-off, pairing, and line bids, logout, then continue to the next crew
7. R'Bot replies with a concise start message including scope, period, run id, and live watch URL
   when available.
8. When the run finishes, the status endpoint returns a quick summary: scoped crew count, placed bid
   count, and recorded issues/blockers.

## Requirements

- Trigger phrases include `simulate crew bids`, `simulate crew bids to portal`, `enter crew bids`,
  `crew bids to portal`, and close variants that clearly mean portal bid entry.
- Month and base are key slots and should be extracted from natural language.
- Rank remains required. If user omits rank, R'Bot must ask for rank and must not launch the run.
- The final run spec passed to the runner remains normalized as `{ bases, ranks, start, end }`.
- Month-only input resolves against the current year from the chat system prompt date. On
  2026-06-24, `June` resolves to `2026-06-01` through `2026-06-30`.
- The browser operation uses the existing headed Playwright simulation path; no DB or API writes are
  allowed for bid placement.
- Per-crew failures, unmapped predicates, disabled Add Bid, login blockers, and rejected values are
  recorded as issues. Product code is not changed to force a bid to fit.
- The chat summary should be brief and operational: how many bids were entered, how many crew were
  scoped, and what issues were noticed.

## Architecture

Reuse the existing `create_crew_bids` server-resolved R'Bot tool. It already owns the important
execution behavior: generating the scoped fixture, starting headed Playwright, registering a live
stream, and exposing run status. The change is in intent recognition and slot filling, not in the
portal automation engine.

```
Gantt R'Bot chat
  -> POST /ai/chat
     -> LLM tool call: create_crew_bids
        slots:
          bases[]  required
          ranks[]  required
          start    required, derived from month when needed
          end      required, derived from month when needed
     -> ai-server/src/crewbids/runner.py start_run(params)
        -> generate-fixture.mjs
        -> headed Playwright npbs-crew-bids-simulation.spec.ts
        -> e2e/results/npbs-issues/*.json
     -> chat reply with run id and live watch URL
  -> GET /ai/crew-bids/runs/{run_id}
     -> running/done/error plus summary
```

## Components

| Unit | File | Responsibility |
|---|---|---|
| Tool declaration | `ai-server/src/chat/tools.py` | Update `create_crew_bids` description so the model recognizes `simulate/enter crew bids to portal`, accepts month phrasing, and still requires base + rank + dates. |
| Slot validation | `ai-server/src/chat/tools.py` | Keep `crew_bids_params` as the final guard: no base, no rank, or invalid dates means no run starts. |
| Chat prompt | `ai-server/src/chat/routes.py` | Tell R'Bot to extract month/base, convert month to dates, and ask specifically for rank if rank is missing. |
| Runner | `ai-server/src/crewbids/runner.py` | Reuse existing headed Playwright execution and status summary. Add only small summary wording helpers if needed. |
| Status route | `ai-server/src/crewbids/routes.py` | Reuse existing poll endpoint for run summary. |
| Tests | `ai-server/tests/test_chat_tools.py`, `ai-server/tests/test_chat_route.py`, `ai-server/tests/test_crewbids.py` | Cover trigger wording, missing rank follow-up, valid complete run, command construction, and returned summary. |

## Error Handling

- Missing rank: R'Bot asks for rank and does not call `start_run`.
- Missing month or base: R'Bot asks for the missing slot and does not call `start_run`.
- Invalid month text: R'Bot asks for a month or date range in clearer wording.
- No matching crew in NPBS export: fixture generation fails; runner marks the run `error`; chat/status
  reports no matching crew for the requested scope.
- Playwright timeout or spawn failure: runner marks `error` and keeps bounded stderr/stdout in the run.
- Per-crew blockers: existing issue JSON and screenshots remain the source of truth.

## Testing

- Unit tests for `crew_bids_params` continue to prove incomplete scope is rejected.
- Chat route test with mocked LLM call:
  - input equivalent to complete `June YUL CA` starts a run and returns no client action.
  - input missing rank produces a question and does not call `start_run`.
- Runner command tests confirm Playwright remains headed and serial (`--headed`, `--workers=1`).
- Manual verification after implementation:
  - start `ai-server`, `gantt`, and required PBS portal services
  - type `simulate crew bids to portal for June YUL base`
  - confirm R'Bot asks for rank
  - reply with a rank
  - confirm headed/live browser flow starts and status summary is available

## Out Of Scope

- Live per-step streaming text inside the chat panel.
- Direct database/API bid writes.
- Reserve bid page expansion.
- Changing portal forms or product code to make unmapped legacy bids placeable.
