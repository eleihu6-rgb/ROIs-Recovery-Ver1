"""R'Bot - the crew app's chat endpoint.

`POST /ai/crew/chat` turns a crew member's sentence into
`{role, content, actions: CrewAction[]}`. The app performs the actions; this
service never touches app state (same brain/hands split as `/ai/chat`).

Kept separate from `/ai/chat` on purpose: that route's prompt and tools describe
a planner's Gantt board (filter panes, build pairings, edit the live roster),
none of which exists on a crew's phone.
"""
import json
from datetime import date
from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel

from src.chat.crew_tools import CREW_TOOLS, SWAP_TOOLS, crew_tool_call_to_action
from src.llm.client import llm_tools

router = APIRouter(prefix='/ai/crew', tags=['crew-chat'])

# Same bounds as the Gantt route: keep only the most recent turns, and truncate
# any single message so a runaway paste cannot blow up the request.
MAX_HISTORY_MESSAGES = 12
MAX_MESSAGE_CHARS = 4000
# The Duty Swap snapshot is capped by the phone; this bound protects the prompt.
MAX_SWAP_SNAPSHOT_CHARS = 16000
DUTY_SWAP_SCREEN = 'duty_swap'

DUTY_SWAP_PROMPT = (
    "The crew is on the DUTY SWAP screen: a table with one row per date, their own duties "
    "('me') and one column per candidate crew ('crews'), shown in the snapshot below. Your job "
    "here: (1) help them find the crew to swap with, (2) read what is on the screen, (3) turn "
    "their words into set_swap_search / set_swap_crews / select_swap_duties. Use only dates, "
    "codes and crew ids that are in the snapshot or that the crew typed. Resolve 'my trip on "
    "08 Oct' to that duty's start/end dates from me.duties. What they want in return (a standby, "
    "a flight) goes in wantKind, not taskTypeList (that filter also applies to their own duties); "
    "'same fleet' means the fleet of the duty they give. Point out "
    "conflicts you can see (a candidate duty overlapping one of their duties, a different "
    "fleet). You never send a swap: the crew reviews it and presses 'Check legality & send', "
    "where the airline's rule check runs."
)

CREW_SYSTEM_PROMPT = (
    "You are R'Bot, the AI assistant built into a crew member's airline app on their phone. "
    "If asked who you are, say you are R'Bot. "
    "You speak to one crew member, not to a planner: use 'your', be warm and brief, and answer "
    "in the language they wrote in. "
    "You can do three things. "
    "(1) OPEN SCREENS - call navigate with a semantic target. Their roster calendar is "
    "'roster_calendar', the map of routes they have flown is 'route_map', the plain duty list is "
    "'schedule'/'timeline', their next rotation is 'next_trip'/'trip_details', destination ideas "
    "are 'explore', and alarms, alerts, absence, time zone, preferences, appearance, personal "
    "information, help, global and profile are their own targets. "
    "When the crew says 'calendar' or 'my calendar' they mean their roster calendar "
    "('roster_calendar'); a month, or a phrase like 'next week', is a period for that same view. "
    "(2) GET THINGS DONE - request_absence prepares a sick-leave request and opens the form "
    "pre-filled (it does NOT submit; the crew confirms), set_alarm enables/disables alarms, "
    "changes the wake-up and leave-home offsets, or limits alarms to work or personal events, and "
    "change_setting switches time-zone display, colour theme, avatar or Explore interests. "
    "(3) ANSWER QUESTIONS - about their duties, a city on their route, or how the app works. When "
    "the crew only asks a question, answer in plain English and do NOT call a tool. "
    "Always resolve relative dates ('tomorrow', 'next Monday', 'for 3 days') to absolute "
    "YYYY-MM-DD dates against the today value in this prompt, and pass the crew-base local date, "
    "never a UTC-shifted one. "
    "Never invent a crew id, a flight number, a trip id or a date the crew did not give you. "
    "If you cannot tell which screen or which dates they mean, ask a short question instead of "
    "calling a tool. Be conservative - only act on clear intent. "
    "After acting, say what you did in one short sentence; the app shows your own confirmation "
    "chip under that sentence. Only say 'Done.' when you actually called a tool - if you did not, "
    "answer the question or ask for the missing detail instead."
)


class CrewChatMessage(BaseModel):
    role: Literal['user', 'assistant']
    content: str


class CrewContext(BaseModel):
    """Phone-local facts the model cannot guess. All optional so an older app
    build (or a curl smoke test) still works."""
    airline: str = ''
    crewId: str = ''
    crewName: str | None = None
    today: str | None = None
    screen: str | None = None
    # Duty Swap only: what the matrix shows (window, filters, my duties, crews).
    swap: dict[str, Any] | None = None


class CrewChatRequest(BaseModel):
    messages: list[CrewChatMessage]
    context: CrewContext | None = None


def _system_prompt(context: CrewContext | None) -> str:
    ctx = context or CrewContext()
    today = ctx.today or date.today().isoformat()
    facts = [f'Today is {today}.']
    if ctx.crewName:
        facts.append(f"The crew's first name is {ctx.crewName}.")
    if ctx.crewId:
        facts.append(f'Your crew id is {ctx.crewId}.')
    if ctx.airline:
        facts.append(f'Airline code {ctx.airline}.')
    if ctx.screen:
        facts.append(f'They are on the {ctx.screen} screen right now.')
    prompt = f'{CREW_SYSTEM_PROMPT}\n\n== Context ==\n' + ' '.join(facts)
    if ctx.screen == DUTY_SWAP_SCREEN:
        snapshot = json.dumps(ctx.swap or {}, separators=(',', ':'))[:MAX_SWAP_SNAPSHOT_CHARS]
        prompt += f'\n\n== Duty Swap ==\n{DUTY_SWAP_PROMPT}\nSnapshot: {snapshot}'
    return prompt


def _tools(context: CrewContext | None) -> list[dict[str, Any]]:
    on_swap = context is not None and context.screen == DUTY_SWAP_SCREEN
    return CREW_TOOLS + SWAP_TOOLS if on_swap else CREW_TOOLS


@router.post('/chat')
def chat(req: CrewChatRequest) -> dict:
    recent = req.messages[-MAX_HISTORY_MESSAGES:]
    messages = [{'role': m.role, 'content': m.content[:MAX_MESSAGE_CHARS]} for m in recent]
    try:
        text, calls = llm_tools(messages, _tools(req.context), _system_prompt(req.context))
    except Exception as exc:  # noqa: BLE001 - surface a friendly error, never 500 the UI
        return {
            'role': 'assistant',
            'content': f"R'Bot could not reach the AI service: {exc}",
            'actions': [],
        }

    actions = [a for a in (crew_tool_call_to_action(c) for c in calls) if a is not None]
    if not text:
        text = 'Done.' if actions else 'I could not work out what to do — could you say that another way?'
    return {'role': 'assistant', 'content': text, 'actions': actions}
