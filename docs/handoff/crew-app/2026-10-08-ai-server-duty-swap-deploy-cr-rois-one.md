# Handoff — deploy ai-server Duty Swap tools to cr.rois.one

Date: 2026-10-08 · From: Duty Swap (Concept D) session · Commit on `main`: `1a4c9f0d`

## Goal

Make `https://cr.rois.one/ai/crew/chat` serve the Duty Swap R'Bot tools that the
crew-app (APP_VERSION 138) now uses. The app already works without it: R'Bot
answers common swap requests locally ("on this phone") and only falls back to
the server for free-form requests. Until this deploy, those fallbacks get a
server without the swap tools, so no table actions come back.

## What changed (ai-server only — nothing else needs deploying)

| File | Change |
|------|--------|
| `ai-server/src/chat/crew_tools.py` | `SWAP_TOOLS`: `set_swap_search` (dates, filters, `wantKind`), `set_swap_crews`, `select_swap_duties`; `swap_fields`, `_swap_action`; wired into `crew_tool_call_to_action` |
| `ai-server/src/chat/crew_routes.py` | `CrewContext.swap` (screen snapshot); when `screen == 'duty_swap'` adds `DUTY_SWAP_PROMPT` + snapshot JSON (≤16000 chars) and exposes `SWAP_TOOLS` (gated — other screens never see them) |
| `ai-server/tests/test_crew_chat_swap.py` | new tests |

No new Python dependencies, no env vars, no DB/schema change. The route is
backward compatible: requests without `screen: 'duty_swap'` behave exactly as before.

## Where cr.rois.one runs

- `cr.rois.one` is a Cloudflare tunnel; `/ai/*` → an ai-server on port `3005`
  (`/ai/health` returned `{"status":"ok"}` on 2026-10-08).
- On the dev Mac (`~/DevOps/ROIs-Recovery-Ver1`) **nothing listens on 3005 and there
  is no `~/.cloudflared/`**, so the tunnel + ai-server currently live on another
  host/user. First step: find it (owner of the tunnel config with the `/ai` ingress;
  the old setup was LaunchAgent `com.rois.ai-server`, see
  `docs/modules/dev/local-start-playbook.md`).
- SIT `deploy/sit/auto-deploy.sh` does **not** deploy ai-server (excluded on purpose) — do not rely on it.

## Steps

1. On the host serving cr.rois.one `/ai`: `git fetch && git checkout main && git pull --ff-only`
   (expect `1a4c9f0d` or later). Do not reset away local changes you did not make — check `git status` first.
2. Tests: `cd ai-server && ./.venv/bin/python -m pytest -q tests/test_crew_chat_swap.py tests/test_crew_chat_tools.py tests/test_crew_chat_routes.py`
   (expected: all pass; `tests/test_regression_routes.py` has 7 known pre-existing failures, unrelated).
3. Restart the ai-server on 3005 (LaunchAgent `launchctl kickstart -k gui/$(id -u)/com.rois.ai-server`
   if present, else stop the old process and `./.venv/bin/python main.py`). Reuse the existing env/.env — do not
   copy keys into docs or commands that get logged.
4. Health: `curl -s https://cr.rois.one/ai/health` → `{"status":"ok"}`.
5. Smoke the swap route (calls the LLM once):

   ```bash
   curl -s https://cr.rois.one/ai/crew/chat -H 'Content-Type: application/json' -d '{
     "messages":[{"role":"user","content":"find me someone who can take my 12 Oct trip, I want a standby"}],
     "context":{"airline":"PR","crewId":"392923","today":"2026-10-08","screen":"duty_swap",
       "swap":{"window":{"startDate":"2026-10-08","endDate":"2026-11-02"},"filters":{},
               "me":{"crewId":"392923","duties":[{"key":"k1","code":"PR124/PR125","kind":"fly","start":"2026-10-12T08:00","end":"2026-10-13T02:00"}]},
               "crews":[],"give":[],"take":[],"crewB":null}}}'
   ```

   Pass = the response `actions` contains a `set_swap_search` (and/or `select_swap_duties`), not just text.
   Check the exact request schema against `CrewContext` in `crew_routes.py` if it 422s.
6. Real-UI check (crew-app, PR crew 392923, iPhone Air sim — never the "iPhone Duo - Release" sim):
   Home ▸ Duty Swap ▸ R'Bot, type a request the local interpreter does not cover
   (e.g. "who has a quiet week around the 20th?") → the reply has no "on this phone" tag and,
   when it suggests a change, the table updates. Flow template: `crew-app/.maestro/pr_392923_duty_swap_rbot.yaml`.
   Save a screenshot as `docs/assets/screenshots/crew-app/duty-swap-rbot-server-Ver1.png`.

## Rollback

Check out the previous ai-server commit (`9b753afe`) on that host and restart. The app keeps
working (local interpreter), so rollback is safe at any time.

## References

- Spec: `docs/superpowers/specs/2026-10-07-crew-app-duty-swap-concept-d-design.md` §6 (R'Bot), §10 (findings)
- Client: `crew-app/src/features/dutySwap/swapRbot.ts`, `components/SwapRbotPanel.tsx`, `rbot/crewChatApi.ts`
- Do not commit/push without the user's say-so (root CLAUDE.md §No-Auto-Commit).
