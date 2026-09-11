import json
import pathlib
from datetime import date
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from src.llm.client import llm_tools
from src.chat.tools import (
    TOOLS, tool_call_to_action, crew_bids_params,
    build_pairings_missing_message, auto_assign_missing_message,
)
from src.crewbids.runner import start_run, get_run

_HELP_CORPUS_PATH = pathlib.Path(__file__).parent / 'help-corpus.json'
_HELP_CORPUS: list[dict] = json.loads(_HELP_CORPUS_PATH.read_text(encoding='utf-8'))
_HELP_BLOCK = '\n'.join(
    f"[{t['slug']}] {t['title']}: {t['overview']}"
    for t in _HELP_CORPUS
)

router = APIRouter(prefix='/ai', tags=['chat'])

# Bound the history forwarded to the LLM: keep only the most recent turns,
# and truncate any single message to avoid oversized / runaway payloads.
MAX_HISTORY_MESSAGES = 12
MAX_MESSAGE_CHARS = 4000

SYSTEM_PROMPT = (
    "You are R'Bot, the AI assistant embedded in a crew-scheduling Gantt board. "
    "If asked who you are, say you are R'Bot. "
    "You can perform simple operations on the user's LIVE board by calling tools: "
    "filter the roster/crew, pairing, or flight panes; sort the Live main roster by one "
    "or more fields in priority order; change the "
    "planning date range; or reset all filters. "
    "Divisions are 'P' (cockpit) and 'C' (cabin). Ranks are codes like CA, FO. "
    "Roster sort fields include crew id, seniority, rank, base, mcred, and mdo. "
    "For multi-key sorting, call sort_roster with criteria in the requested priority "
    "order, for example rank asc then crew id desc. "
    "When the user asks to filter or sort, call the matching tool. "
    "When the user only asks a question, answer in plain English and do NOT call a tool. "
    "Always briefly confirm in words what you did. Be conservative — only act on clear intent. "
    "You can also SIMULATE crew adding bids in the crew portal via the create_crew_bids tool "
    "(triggers: 'simulate crew bids to portal', 'enter crew bids', 'crew bids to portal', "
    "'create crew bids', 'add bids', 'simulate crew adding bids'). Extract month words and base "
    "airport codes from the user request. Month-only requests resolve to the current year from "
    "the Today value in this system prompt. That run needs at least one base AND at least one "
    "rank. If rank is missing, ask exactly which rank to use and DO NOT call the tool. If base "
    "or month/date range is missing, ask for the missing piece and DO NOT call the tool. "
    "You can also 'remove pre-assignment (PA) for the solver' via the prepare_pa_removal tool "
    "(triggers: 'remove pre-assignment', 'remove PA for solver', 'prepare PA removal'). It is "
    "READ-ONLY — it marks memo note icons on the duties that would be de-assigned (flying "
    "pairings + days off) for the planner to confirm; it never actually de-assigns. It needs a "
    "date range, and a scope of bases/ranks and/or specific crewIds. "
    "You can also AUTOMATE a pairing build via the build_pairings tool (triggers: 'build pairings', "
    "'build pairing for ADD 7M8', 'automate the pairing build', 'create pairings from open flights', "
    "'pairing build for September'). It opens the 'Pairing Build Automation' dialog pre-filled with "
    "the user's date range, base, fleet, crew composition and build rules, then searches the open "
    "flights for them. It does NOT build by itself — the planner reviews the scope and presses "
    "'Build all'. Extract the pairing base (airport code), the date range or month, and the fleet "
    "when given; extract crew composition counts (CA/FO) and any build-rule overrides (minimum rest, "
    "multi-leg block, check-in, debrief, single-leg long-haul exemption) only when the user states "
    "them. That order needs at least a base AND a date range or month: if either is missing, ask for "
    "the missing piece and DO NOT call the tool. Mention that the dialog will open so the user can "
    "review and press 'Build all'. "
    "You can also AUTO-ASSIGN open pairings to crew via the auto_assign_pairings tool (triggers: "
    "'auto assign open pairings', 'auto assign pairings to T2004', 'fill T2004 and T2005 roster', "
    "'assign open pairings for September'). It opens the 'Auto-assign open pairings' dialog for those "
    "crew over the requested month or date range, showing the no-commit decision trace; the planner "
    "then presses 'Apply to gantt' and Save. It never commits anything itself. That order needs at "
    "least one crew id AND a month or date range: if either is missing, ask for the missing piece and "
    "DO NOT call the tool. Crew ids are employee codes like T2004 — never invent them; if the user "
    "did not name crew, ask which crew. "
    "You can also EDIT the LIVE main roster with move_task (move a crew's duty to another crew), "
    "swap_tasks (swap two crews' duties on a day), unassign_task (take a crew off a duty), and "
    "add_ground_task (create a day off / training / standby / other ground task for one or more "
    "crew). These all STAGE a pending change on the board — they never save/commit; a human always "
    "reviews and clicks Save. Resolve any relative date ('tomorrow', 'next Monday') to an absolute "
    "YYYY-MM-DD before calling. When a crew has more than one duty loaded, pass a pairingLabel or "
    "date to say which one; if you truly cannot tell which duty is meant, ask instead of guessing."
)


class ChatMessage(BaseModel):
    role: Literal['user', 'assistant']
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


@router.post('/chat')
def chat(req: ChatRequest) -> dict:
    recent = req.messages[-MAX_HISTORY_MESSAGES:]
    messages = [{'role': m.role, 'content': m.content[:MAX_MESSAGE_CHARS]} for m in recent]
    # Anchor relative date phrases and month-only crew-bid requests.
    today = date.today()
    system = (
        f"{SYSTEM_PROMPT} Today is {today.isoformat()}.\n\n"
        f"== Help Topics ==\n{_HELP_BLOCK}"
    )
    try:
        text, calls = llm_tools(messages, TOOLS, system)
    except Exception as exc:  # noqa: BLE001 — surface a friendly error, never 500 the UI
        return {'role': 'assistant', 'content': f'AI request failed: {exc}', 'actions': []}
    # create_crew_bids is resolved server-side (it launches a headed browser) — it is
    # NOT a client board action. A complete call starts a background run; an
    # incomplete one is ignored here so the assistant's text (which asks for the
    # missing scope/dates) stands.
    crew_bids_msg = ''
    crew_bids_missing_msg = ''
    for c in calls:
        if c.get('name') != 'create_crew_bids':
            continue
        params = crew_bids_params(c, today=today)
        if params is None:
            data = c.get('input') or {}
            ranks = data.get('ranks')
            bases = data.get('bases')
            has_rank = isinstance(ranks, list) and any(isinstance(rank, str) and rank.strip() for rank in ranks)
            has_base = isinstance(bases, list) and any(isinstance(base, str) and base.strip() for base in bases)
            if not has_rank:
                base_text = '/'.join(base.upper() for base in bases if isinstance(base, str) and base.strip()) if has_base else 'that base'
                period_text = str(data.get('month') or data.get('start') or 'that period')
                crew_bids_missing_msg = f'Which rank should I use for {period_text} {base_text} crew bids?'
            elif not has_base:
                crew_bids_missing_msg = 'Which base should I use for the crew-bid simulation?'
            else:
                crew_bids_missing_msg = 'Which month or date range should I use for the crew-bid simulation?'
            continue
        try:
            run_id = start_run(params)
            scope = f"{'/'.join(params['bases'])} · {'/'.join(params['ranks'])}"
            run = get_run(run_id) or {}
            watch_url = run.get('watchUrl')
            watch_line = f" ▶ Watch live: {watch_url}" if watch_url else ''
            crew_bids_msg = (
                f"Started crew-bid simulation for {scope} — {params['start']} → {params['end']}. "
                f"A headed browser will log in as each crew and submit days-off, pairing and line "
                f"bids, then log out. Run id {run_id}.{watch_line}"
            )
        except Exception as exc:  # noqa: BLE001 — never 500 the chat
            crew_bids_msg = f'Could not start the crew-bid simulation: {exc}'
        break

    # build_pairings is a client action (the dialog opens in the gantt), but an
    # incomplete order (no base, or no date range/month) has no action to dispatch —
    # surface the assistant's "which base/period?" question instead of a bare "Done.".
    build_pairings_msg = ''
    for c in calls:
        if c.get('name') != 'build_pairings':
            continue
        build_pairings_msg = build_pairings_missing_message(c) or ''
        break

    # Same treatment for auto_assign_pairings: an order missing the crew or the period has
    # no action to dispatch, so the assistant asks for the missing piece.
    auto_assign_msg = ''
    for c in calls:
        if c.get('name') != 'auto_assign_pairings':
            continue
        auto_assign_msg = auto_assign_missing_message(c) or ''
        break

    actions = [a for a in (tool_call_to_action(c) for c in calls) if a is not None]
    if crew_bids_msg:
        text = f'{text}\n\n{crew_bids_msg}'.strip() if text else crew_bids_msg
    elif crew_bids_missing_msg:
        text = crew_bids_missing_msg
    elif build_pairings_msg:
        text = build_pairings_msg
    elif auto_assign_msg:
        text = auto_assign_msg
    elif not text:
        text = 'Done.' if actions else 'I could not determine an action.'
    return {'role': 'assistant', 'content': text, 'actions': actions}
