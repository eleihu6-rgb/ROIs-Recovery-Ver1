# R'Bot "create crew bids" — conversational crew-bid simulation

> Date: 2026-06-21
> Status: approved (brainstorming) → implementation
> Related: skill `108-npbs-bids-portal-simulation`, `docs/modules/pbs/npbs-bids-simulation-playbook.md`,
> `docs/superpowers/specs/2026-06-20-npbs-bids-to-portal-playwright-simulation-design.md`

## Goal

Let a scheduler tell **R'Bot** (the gantt AI chat) "create crew bids" / "add bids", have R'Bot
collect a crew scope (base + rank) and a date range, then **bring up a headed browser** that, per
crew, logs in to the pbs-portal, submits bids on the **days-off / pairing / line** pages, logs out,
and continues with the next crew. The run produces the usual per-crew issue JSON + Word report.

This wires the existing NPBS-Legend bid simulation (skill 108) to a conversational trigger and makes
its scope + dates parametric.

## Hard rules (inherited)

- **Playwright only** drives the portal; never call DB/API to place bids.
- **Never change product code to make a failed bid fit** (project rule #7). Unmappable predicates,
  disabled ADD BID, locked logins → *recorded*, never forced.
- Every change ships with a test (§Playwright-Required / §No-Illusion).

## Approved decisions

1. **Bid content source:** filter the committed NPBS export to the requested base×rank and shift its
   date predicates into the requested range (reuses the whole parser/fixture pipeline).
2. **Date range meaning:** sets the bidding period **and** shifts date-valued predicates (Prefer Off,
   etc.) into that range (day-of-month preserved from source).
3. **Pages:** **days-off, pairing, line** only (reserve skipped for this feature; default spec still
   covers all four when the env var is unset).
4. **Scope rule:** require **≥1 base AND ≥1 rank**; run **6 crew per base×rank bucket**.
5. **Trigger:** server-side tool resolved in ai-server (approach A), reports a run id back to chat;
   status is pollable. No live per-crew streaming (kept minimal).
6. **Logout:** explicit visible logout click at each crew's end (in addition to the fresh-context
   isolation Playwright already gives per `test()`).

## Architecture

```
R'Bot chat (gantt)
  → POST /ai/chat  (ai-server)
     → LLM tool: create_crew_bids {bases[], ranks[], start, end}
        (system prompt: ask until all four present — slot filling)
     → crewbids.start_run(params)            # background thread + registry
         1. node generate-fixture.mjs --bases ... --ranks ... --period-start ... --period-end ...
            → e2e/fixtures/pbs/npbs-bids-<runid>.json  (scoped, date-shifted)
         2. npx playwright test npbs-crew-bids-simulation.spec.ts --headed --workers=1
            env: CREWBIDS_FIXTURE=<path>  CREWBIDS_PAGES=days-off,pairing,line
            per crew: login → days-off/pairing/line → logout → next
         3. collect e2e/results/npbs-issues/*.json → run summary
     → reply: "Started crew-bid simulation for <scope> · <dates>. Run id <id>."
  → GET /ai/crew-bids/runs/{id}  (poll status)
```

### Components

| Unit | File | Responsibility |
|---|---|---|
| Tool def + slot-filling | `ai-server/src/chat/tools.py`, `src/chat/routes.py` (SYSTEM_PROMPT) | declare `create_crew_bids`; instruct R'Bot to ask until base+rank+dates present |
| Param extraction | `ai-server/src/chat/tools.py` `crew_bids_params(call)` | validate the tool call → `{bases,ranks,start,end}` or `None` |
| Run orchestration | `ai-server/src/crewbids/runner.py` | pure cmd builders (`build_fixture_cmd`, `build_playwright_cmd`) + `run_crew_bids` (spawn both) + `start_run`/`get_run` (thread + in-memory registry) |
| Status route | `ai-server/src/crewbids/routes.py` | `GET /ai/crew-bids/runs/{id}` |
| Chat wiring | `ai-server/src/chat/routes.py` | detect a complete `create_crew_bids` call → `start_run` → append run info to reply |
| Scoped fixture | `e2e/utils/npbs/generate-fixture.mjs`, `parse-npbs-bids.mjs` | CLI args `--bases/--ranks/--period-start/--period-end`; `shiftDates(text, {month,year})` generalized |
| Per-crew flow | `e2e/tests/pbs-portal/npbs-crew-bids-simulation.spec.ts` | env-driven `CREWBIDS_FIXTURE` + `CREWBIDS_PAGES`; explicit logout at test end |
| Logout PO | `e2e/pages/pbs-portal/pbs-login-page.ts` | `logout()` clicks `aria-label="Log out"` → "Log Out" confirm → back to login |

## Error handling

- **Incomplete scope:** the LLM does not call the tool (system prompt); if it calls with missing
  fields, `crew_bids_params` returns `None` and the chat asks for what's missing — no run starts.
- **No matching crew in the export:** `generate-fixture.mjs` exits non-zero with a clear message;
  the runner records it as the run error; R'Bot reports "no crew matched <scope>".
- **Playwright spawn failure / timeout:** runner captures stderr (bounded), marks run `error`.
- **Per-crew blockers:** unchanged — recorded to `e2e/results/npbs-issues/<id>.json` + snapshot.

## Testing

- ai-server pytest:
  - `create_crew_bids` advertised in `TOOLS` (update the now-stale `test_six_tools_defined`).
  - `crew_bids_params`: complete → params; missing base/rank/date → `None`; bad dates → `None`.
  - `build_fixture_cmd` / `build_playwright_cmd` pure-builder assertions (args, `--headed`, env).
  - chat route: complete tool call (monkeypatched `start_run`) → reply mentions a run id, `actions==[]`;
    missing scope → asks, no run started.
- Playwright: regenerate a tiny scoped fixture, list/compile the spec; full headed run is the manual
  proof (requires portal :3030 up).

## Out of scope (YAGNI)

- Live per-crew progress streaming into the chat panel.
- New AiAction client dispatch (the tool is fully server-resolved).
- Reserve page for this feature (kept available behind the env default).
