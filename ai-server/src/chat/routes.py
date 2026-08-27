import json
import pathlib
from datetime import date
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from src.llm.client import llm_tools
from src.chat.tools import TOOLS, tool_call_to_action, crew_bids_params
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

    actions = [a for a in (tool_call_to_action(c) for c in calls) if a is not None]
    if crew_bids_msg:
        text = f'{text}\n\n{crew_bids_msg}'.strip() if text else crew_bids_msg
    elif crew_bids_missing_msg:
        text = crew_bids_missing_msg
    elif not text:
        text = 'Done.' if actions else 'I could not determine an action.'
    return {'role': 'assistant', 'content': text, 'actions': actions}
