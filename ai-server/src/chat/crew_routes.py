"""R'Bot - the crew app's chat endpoint.

`POST /ai/crew/chat` turns a crew member's sentence into
`{role, content, actions: CrewAction[]}`. The app performs the actions; this
service never touches app state (same brain/hands split as `/ai/chat`).

Kept separate from `/ai/chat` on purpose: that route's prompt and tools describe
a planner's Gantt board (filter panes, build pairings, edit the live roster),
none of which exists on a crew's phone.
"""
from datetime import date
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from src.chat.crew_tools import CREW_TOOLS, crew_tool_call_to_action
from src.llm.client import llm_tools

router = APIRouter(prefix='/ai/crew', tags=['crew-chat'])

# Same bounds as the Gantt route: keep only the most recent turns, and truncate
# any single message so a runaway paste cannot blow up the request.
MAX_HISTORY_MESSAGES = 12
MAX_MESSAGE_CHARS = 4000

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
    return f'{CREW_SYSTEM_PROMPT}\n\n== Context ==\n' + ' '.join(facts)


@router.post('/chat')
def chat(req: CrewChatRequest) -> dict:
    recent = req.messages[-MAX_HISTORY_MESSAGES:]
    messages = [{'role': m.role, 'content': m.content[:MAX_MESSAGE_CHARS]} for m in recent]
    try:
        text, calls = llm_tools(messages, CREW_TOOLS, _system_prompt(req.context))
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
