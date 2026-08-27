# AI Chat Box for Gantt Control — Design Spec

> Date: 2026-06-02
> Status: Approved (brainstorming) — pending implementation plan
> Source inspiration: EVACC project (`ROIs-Suit-aiGen-EVACC`) AI chat + tool-calling

## 1. Goal

Add an interactive AI chat box to the gantt frontend. The user converses in
natural language ("show only Bangkok crew", "sort the roster by block hours
descending", "clear all filters") and the AI performs **simple Gantt
operations** — filtering panes, sorting the roster, resetting filters — or
answers questions about the board with no state change.

This mirrors EVACC's AI chat capability, reusing the **same LLM provider and key**
configuration, adapted to this project's microservice + Zustand architecture.

## 2. Scope (v1)

In scope — the AI can call these tools:

| Tool | Effect | Target store action |
|------|--------|---------------------|
| `filter_crew` | Filter roster/crew panes | `useFilterStore.setCrewFilter({ divisions, bases, ranks, fleets })` |
| `filter_pairing` | Filter pairing pane | `useFilterStore.setPairingFilter({ bases, fleets, divisions, depArps, isFull })` |
| `filter_flight` | Filter flight pane | `useFilterStore.setFlightFilter({ depArps, arvArps, fltNums, fleets, statuses })` |
| `sort_roster` | Sort a roster pane | `useRosterStore.setSort(paneId, field, direction)` |
| `reset_filters` | Clear all filters | `useFilterStore.resetFilters()` |
| (no tool) | Plain Q&A about the board / how to use Gantt | none |

Out of scope (v1): auto-assign, fairness balancing, workload moves, data
mutation (drag/drop, add/delete duties), cross-pane analytics. These were EVACC
extras; explicitly deferred.

## 3. Architecture

```
gantt (5173)                         ai-server (NEW, :3005)
┌────────────────────────┐           ┌────────────────────────────┐
│ AppShell               │           │ FastAPI                    │
│  └─ <AiChatPanel/>     │  POST     │  POST /ai/chat             │
│       useAiChat() ─────┼──────────▶│   _llm_tools() loop        │
│       dispatchAction() │  {messages}│   (max 10 iterations)     │
│        ├ setCrewFilter │◀──────────┤   returns {content,actions}│
│        ├ setPairingF.. │ {content, │   _llm_config() autodetect │
│        ├ setFlightF..  │  actions[]}│   Anthropic/DeepSeek/Qwen │
│        ├ setSort       │           └────────────────────────────┘
│        └ resetFilters  │
└────────────────────────┘
```

### 3.1 Shared foundation — `ai-server`

- New package `ai-server/` — Python 3.12, FastAPI + Uvicorn, **port 3005**
  (next free after connector-server 3004). Registered in root `CLAUDE.md`
  project-structure table.
- **LLM layer ported from EVACC** (`backend/main.py`):
  - `_llm_config()` — provider auto-detect. Order: `AI_PROVIDER` env override →
    `DEEPSEEK_API_KEY` → `DASHSCOPE_API_KEY` → `ANTHROPIC_API_KEY` → fallback
    deepseek.
  - Env vars (in `ai-server/.env`, gitignored; `.env.example` committed):
    `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default `claude-sonnet-4-6`),
    `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL` (default `deepseek-chat`),
    `DEEPSEEK_BASE_URL` (default `https://api.deepseek.com`),
    `DASHSCOPE_API_KEY`, `QWEN_MODEL` (default `qwen-plus`),
    `DASHSCOPE_BASE_URL`.
  - **"Same key" = operator copies EVACC's `.env` values into `ai-server/.env`.**
    No keys are committed.
  - Helpers: `_llm_text(system, user, max_tokens)` (plain completion — used by
    the regression spec) and `_llm_tools(messages, tools, system)` (tool-calling
    loop). Anthropic via `anthropic` SDK; DeepSeek/Qwen via `openai` SDK
    (OpenAI-compatible), tool schemas translated per provider.
- CORS: whitelist gantt dev origin (`http://localhost:5173`) + configured prod
  origin. No `origin:'*'`.
- Dependencies (security rule: trusted sources only): `fastapi`, `uvicorn`,
  `anthropic`, `openai`, `pydantic`, `pydantic-settings`. No telemetry packages.

### 3.2 Request / response contract

```
POST /ai/chat
Request:  { "messages": [ { "role": "user"|"assistant", "content": str } ] }
Response: { "role": "assistant",
            "content": str,                 # natural-language reply
            "actions": [ AiAction, ... ] }  # 0+ operations for the frontend
```

`AiAction` is a discriminated union on `type`:

```ts
type AiAction =
  | { type: 'filter_crew';    divisions?: string[]; bases?: string[]; ranks?: string[]; fleets?: string[] }
  | { type: 'filter_pairing'; bases?: string[]; fleets?: string[]; divisions?: string[]; depArps?: string[]; isFull?: boolean | null }
  | { type: 'filter_flight';  depArps?: string[]; arvArps?: string[]; fltNums?: string[]; fleets?: string[]; statuses?: string[] }
  | { type: 'sort_roster';    paneId: string; field: string; direction: 'asc' | 'desc' }
  | { type: 'reset_filters' }
```

### 3.3 Tool definitions (backend)

Five tools whose `input_schema` mirrors the store shapes in §2. The system
prompt supplies the model with:
- The pane model (roster, pairing, flight) and what each shows.
- Valid enum values: `divisions` = `P`|`C`; known `ranks` (CA/FO/…); roster
  `sort_roster.field` options (`crewId`, and other roster columns); `direction`
  = `asc`|`desc`.
- A statement that tool calls mutate the user's **live** board, so it must be
  conservative and confirm intent in `content`.

The backend runs the EVACC-style tool loop (max 10 iterations) and accumulates
each tool call into the `actions` array returned to the frontend. The backend
does **not** touch any database — it only translates language → actions; the
frontend applies them.

### 3.4 Frontend

Location: `gantt/src/components/ai-chat/`
- `ai-chat-panel.tsx` — floating panel + toggle button, bottom-right, mounted
  once in `AppShell` (so it's available across modules). Built from `@rois/ui`
  primitives + Tailwind tokens (NOT `AppDialog` — it is a docked panel, not a
  modal). **English UI only** per project rule. Messages: user right-aligned,
  assistant left-aligned; pending state while awaiting the server.
- `use-ai-chat.ts` — holds message history, POSTs to `/ai/chat` via the gantt
  axios service, returns `{ content, actions }`, appends assistant message.
- `dispatch-ai-action.ts` — maps each `AiAction` to a direct Zustand store call
  (table in §2). After applying filter actions it triggers the **same apply
  path the Filter dialog uses** so panes reload with new filters. Each applied
  action appends a small confirmation chip to the chat thread (e.g.
  `✓ filtered crew · base=BKK`).
- Service base URL from env (`VITE_AI_SERVER_URL`), never hardcoded — per
  security rule.

## 4. Error handling

- LLM/network failure → assistant bubble shows a friendly English error, no
  actions dispatched, input stays editable.
- Unknown/invalid action type or enum value → frontend ignores that action and
  notes it in the confirmation area; never throws.
- 401 from gantt session → handled by existing axios auth interceptor.

## 5. Testing (mandatory — §Playwright-Required, §No-Illusion)

**Playwright** `e2e/gantt/ai-chat.spec.ts` (multi-step, real assertions):
1. Open chat → type "show only Bangkok crew" → assert a base chip appears in the
   roster toolbar **and** roster row count changes (not just visible).
2. Type "sort roster by crew id descending" → assert order via
   `window.__ganttTest` introspection (first/last row id).
3. Type "reset filters" → assert all filter chips gone + row count restored.
The LLM call is stubbed at the network layer (route interception returns canned
`actions`) so the test is deterministic and asserts the **dispatch + UI effect**,
not model quality.

**Backend pytest** `ai-server/tests/test_chat_tools.py`: feed a mocked LLM
tool-call response → assert `/ai/chat` returns the correct `actions` array shape
for each of the 5 tools, and that Q&A returns empty `actions`.

## 6. Versioning

- `ai-server` code → `BACKEND_VERSION` +1.
- gantt chat UI → `FRONTEND_VERSION` +1.
(Bumped once at feature completion in `gantt/src/version.ts`.)

## 7. Open items / non-goals

- Streaming responses: deferred (v1 is request/response).
- Conversation persistence across reloads: deferred (in-memory per session).
- Multi-pane instance targeting (roster1/roster2): `sort_roster.paneId` carries
  the target; default to the active roster pane when the model omits it.
