# AI Capabilities (Chat + Regression) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI chat box that drives Gantt filter/sort/reset operations, plus a regression-testing website that converts natural-language test cases into runnable Playwright specs — both served by a new `ai-server` (Python FastAPI, port 3005).

**Architecture:** A new standalone `ai-server` hosts EVACC's multi-provider LLM auto-detect (`_llm_config`) and two feature surfaces: `POST /ai/chat` (tool-calling → `AiAction[]`) and `POST /ai/regression/*` (NL→Playwright generation + UI-triggered runs, JSON-file storage). The gantt frontend gets a floating chat panel (dispatches actions to Zustand stores) and a new `regression` shell module. nginx proxies `/fpqe/ai` → `:3005`.

**Tech Stack:** Python 3.12, FastAPI, Uvicorn, `anthropic` + `openai` SDKs, pydantic-settings, pytest; React 19 + Zustand + `@rois/ui` (gantt); Playwright (e2e).

**Specs:**
- `docs/superpowers/specs/2026-06-02-ai-chat-gantt-control-design.md`
- `docs/superpowers/specs/2026-06-02-regression-testing-website-design.md`

**Build order / independent tracks:**
- **Phase 0** (foundation) is a prerequisite for everything.
- **Phase 1–2** (chat) and **Phase 3–4** (regression) are independent after Phase 0; each ends in shippable software.

---

## File Structure

**New package `ai-server/`:**
- `ai-server/main.py` — FastAPI app, CORS, router includes, uvicorn entry
- `ai-server/src/config/settings.py` — pydantic-settings (port, CORS origins)
- `ai-server/src/llm/config.py` — `_llm_config()` provider auto-detect
- `ai-server/src/llm/client.py` — `llm_text()` + `llm_tools()` helpers
- `ai-server/src/chat/tools.py` — 5 tool schemas + dispatch to `AiAction`
- `ai-server/src/chat/routes.py` — `POST /ai/chat`
- `ai-server/src/regression/store.py` — JSON-file load/save + models
- `ai-server/src/regression/prompts.py` — `PW_GEN_SYSTEM`
- `ai-server/src/regression/routes.py` — tests CRUD, generate, apply, runs
- `ai-server/tests/test_chat_tools.py`, `ai-server/tests/test_regression.py`
- `ai-server/requirements.txt`, `ai-server/pyproject.toml`, `ai-server/.env.example`, `ai-server/.gitignore`

**Gantt frontend (chat):**
- `gantt/src/config/api-paths.ts` — add `AI_API_BASE`
- `gantt/src/services/ai-api.ts` — axios client + chat call
- `gantt/src/components/ai-chat/ai-chat-panel.tsx`
- `gantt/src/components/ai-chat/use-ai-chat.ts`
- `gantt/src/components/ai-chat/dispatch-ai-action.ts`
- `gantt/src/components/ai-chat/types.ts`
- Modify `gantt/src/components/shell/app-shell.tsx` (mount panel)

**Gantt frontend (regression):**
- `gantt/src/stores/shell-store.ts` — add `'regression'` to `ActiveModule`
- `gantt/src/components/shell/shell-sidebar.tsx` — nav entry
- `gantt/src/components/shell/app-shell.tsx` — `ModuleView` case
- `gantt/src/components/regression/regression-view.tsx` + subcomponents
- `gantt/src/services/regression-api.ts`

**E2E:**
- `e2e/gantt/ai-chat.spec.ts`
- `e2e/gantt/regression-page.spec.ts`
- `e2e/gantt/user-tests.spec.ts` (generated-test sink, created by Phase 3)

---

# PHASE 0 — ai-server foundation

### Task 0.1: Scaffold ai-server package

**Files:**
- Create: `ai-server/requirements.txt`, `ai-server/pyproject.toml`, `ai-server/.gitignore`, `ai-server/.env.example`, `ai-server/src/__init__.py`, `ai-server/src/config/__init__.py`, `ai-server/src/config/settings.py`

- [ ] **Step 1: Create `ai-server/requirements.txt`**

```
fastapi>=0.115,<1.0
uvicorn[standard]>=0.30,<1.0
pydantic>=2.0,<3.0
pydantic-settings>=2.0,<3.0
anthropic>=0.40.0
openai>=1.40.0
pytest>=8.0,<9.0
httpx>=0.27,<1.0
```

- [ ] **Step 2: Create `ai-server/pyproject.toml`**

```toml
[project]
name = "ai-server"
version = "0.1.0"
requires-python = ">=3.12"

[tool.pytest.ini_options]
pythonpath = ["."]
testpaths = ["tests"]
```

- [ ] **Step 3: Create `ai-server/.gitignore`**

```
.env
__pycache__/
*.pyc
.venv/
regression_tests.json
```

- [ ] **Step 4: Create `ai-server/.env.example`**

```
# Provider auto-detect order: AI_PROVIDER override -> DeepSeek -> Qwen -> Anthropic
AI_PROVIDER=
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-6
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com
DASHSCOPE_API_KEY=
QWEN_MODEL=qwen-plus
DASHSCOPE_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
# Comma-separated CORS origins
CORS_ORIGINS=http://localhost:5173
PORT=3005
# Repo root for running playwright (defaults to parent of ai-server)
REPO_ROOT=
```

- [ ] **Step 5: Create empty `__init__.py` files**

Create `ai-server/src/__init__.py` and `ai-server/src/config/__init__.py` (empty).

- [ ] **Step 6: Create `ai-server/src/config/settings.py`**

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    ai_provider: str = ''
    anthropic_api_key: str = ''
    anthropic_model: str = 'claude-sonnet-4-6'
    deepseek_api_key: str = ''
    deepseek_model: str = 'deepseek-chat'
    deepseek_base_url: str = 'https://api.deepseek.com'
    dashscope_api_key: str = ''
    qwen_model: str = 'qwen-plus'
    dashscope_base_url: str = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
    cors_origins: str = 'http://localhost:5173'
    port: int = 3005
    repo_root: str = ''

    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(',') if o.strip()]


settings = Settings()
```

- [ ] **Step 7: Commit**

```bash
git add ai-server/requirements.txt ai-server/pyproject.toml ai-server/.gitignore ai-server/.env.example ai-server/src
git commit -m "chore(ai-server): scaffold FastAPI package + settings"
```

---

### Task 0.2: LLM provider auto-detect (`_llm_config`)

**Files:**
- Create: `ai-server/src/llm/__init__.py`, `ai-server/src/llm/config.py`
- Test: `ai-server/tests/__init__.py`, `ai-server/tests/test_llm_config.py`

- [ ] **Step 1: Write the failing test** — Create `ai-server/tests/__init__.py` (empty) and `ai-server/tests/test_llm_config.py`

```python
from src.llm.config import resolve_provider


def test_explicit_override_wins():
    env = {'AI_PROVIDER': 'anthropic', 'DEEPSEEK_API_KEY': 'x'}
    assert resolve_provider(env)['provider'] == 'anthropic'


def test_deepseek_detected_first_when_no_override():
    env = {'DEEPSEEK_API_KEY': 'x', 'ANTHROPIC_API_KEY': 'y'}
    assert resolve_provider(env)['provider'] == 'deepseek'


def test_qwen_detected_before_anthropic():
    env = {'DASHSCOPE_API_KEY': 'x', 'ANTHROPIC_API_KEY': 'y'}
    assert resolve_provider(env)['provider'] == 'qwen'


def test_anthropic_detected_when_only_key():
    env = {'ANTHROPIC_API_KEY': 'y'}
    cfg = resolve_provider(env)
    assert cfg['provider'] == 'anthropic'
    assert cfg['model'] == 'claude-sonnet-4-6'


def test_fallback_to_deepseek_when_nothing():
    assert resolve_provider({})['provider'] == 'deepseek'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ai-server && python -m pytest tests/test_llm_config.py -v`
Expected: FAIL — `ModuleNotFoundError: src.llm.config`

- [ ] **Step 3: Write minimal implementation** — Create `ai-server/src/llm/__init__.py` (empty) and `ai-server/src/llm/config.py`

```python
import os


def resolve_provider(env: dict[str, str] | None = None) -> dict[str, str]:
    """Port of EVACC _llm_config(): pick provider + model + base_url from env."""
    e = env if env is not None else os.environ
    provider = (e.get('AI_PROVIDER') or '').lower().strip()
    if not provider:
        if e.get('DEEPSEEK_API_KEY'):
            provider = 'deepseek'
        elif e.get('DASHSCOPE_API_KEY'):
            provider = 'qwen'
        elif e.get('ANTHROPIC_API_KEY'):
            provider = 'anthropic'
        else:
            provider = 'deepseek'

    if provider == 'anthropic':
        return {
            'provider': 'anthropic',
            'api_key': e.get('ANTHROPIC_API_KEY', ''),
            'model': e.get('ANTHROPIC_MODEL', 'claude-sonnet-4-6'),
            'base_url': '',
        }
    if provider == 'qwen':
        return {
            'provider': 'qwen',
            'api_key': e.get('DASHSCOPE_API_KEY', ''),
            'model': e.get('QWEN_MODEL', 'qwen-plus'),
            'base_url': e.get('DASHSCOPE_BASE_URL', 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'),
        }
    return {
        'provider': 'deepseek',
        'api_key': e.get('DEEPSEEK_API_KEY', ''),
        'model': e.get('DEEPSEEK_MODEL', 'deepseek-chat'),
        'base_url': e.get('DEEPSEEK_BASE_URL', 'https://api.deepseek.com'),
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ai-server && python -m pytest tests/test_llm_config.py -v`
Expected: PASS (5 passed)

- [ ] **Step 5: Commit**

```bash
git add ai-server/src/llm ai-server/tests/__init__.py ai-server/tests/test_llm_config.py
git commit -m "feat(ai-server): port EVACC LLM provider auto-detect"
```

---

### Task 0.3: LLM client helpers (`llm_text`, `llm_tools`)

**Files:**
- Create: `ai-server/src/llm/client.py`

These wrap the Anthropic SDK and the OpenAI-compatible SDK (DeepSeek/Qwen). They are thin and provider-branching; unit-tested indirectly via route tests with monkeypatching, so no dedicated test here (the dispatch logic is tested in Task 1.x / 3.x).

- [ ] **Step 1: Create `ai-server/src/llm/client.py`**

```python
"""LLM helpers. Two entry points:
   - llm_text(system, user, max_tokens) -> str         (regression generation)
   - llm_tools(messages, tools, system) -> (text, tool_calls)  (chat)
Tool calls are normalized to: [{'name': str, 'input': dict}]."""
from typing import Any
from .config import resolve_provider


def _anthropic_client(api_key: str):
    import anthropic
    return anthropic.Anthropic(api_key=api_key)


def _openai_client(api_key: str, base_url: str):
    import openai
    return openai.OpenAI(api_key=api_key, base_url=base_url)


def llm_text(system: str, user: str, max_tokens: int = 1024) -> str:
    cfg = resolve_provider()
    if cfg['provider'] == 'anthropic':
        client = _anthropic_client(cfg['api_key'])
        resp = client.messages.create(
            model=cfg['model'], max_tokens=max_tokens, system=system,
            messages=[{'role': 'user', 'content': user}],
        )
        return ''.join(b.text for b in resp.content if getattr(b, 'type', '') == 'text')
    client = _openai_client(cfg['api_key'], cfg['base_url'])
    resp = client.chat.completions.create(
        model=cfg['model'], max_tokens=max_tokens,
        messages=[{'role': 'system', 'content': system}, {'role': 'user', 'content': user}],
    )
    return resp.choices[0].message.content or ''


def llm_tools(messages: list[dict[str, Any]], tools: list[dict[str, Any]], system: str,
              max_iterations: int = 10) -> tuple[str, list[dict[str, Any]]]:
    """Returns (assistant_text, collected_tool_calls). Runs a tool loop but since our
    tools have no server-side result to feed back (frontend applies them), we collect
    tool calls and stop. Anthropic and OpenAI tool formats are handled separately."""
    cfg = resolve_provider()
    if cfg['provider'] == 'anthropic':
        return _anthropic_tools(cfg, messages, tools, system)
    return _openai_tools(cfg, messages, tools, system)


def _anthropic_tools(cfg, messages, tools, system):
    client = _anthropic_client(cfg['api_key'])
    resp = client.messages.create(
        model=cfg['model'], max_tokens=1024, system=system,
        messages=messages, tools=tools,
    )
    text_parts, calls = [], []
    for block in resp.content:
        if getattr(block, 'type', '') == 'text':
            text_parts.append(block.text)
        elif getattr(block, 'type', '') == 'tool_use':
            calls.append({'name': block.name, 'input': dict(block.input)})
    return ''.join(text_parts), calls


def _openai_tools(cfg, messages, tools, system):
    client = _openai_client(cfg['api_key'], cfg['base_url'])
    oai_tools = [{'type': 'function', 'function': {
        'name': t['name'], 'description': t['description'], 'parameters': t['input_schema'],
    }} for t in tools]
    resp = client.chat.completions.create(
        model=cfg['model'], max_tokens=1024,
        messages=[{'role': 'system', 'content': system}, *messages], tools=oai_tools,
    )
    msg = resp.choices[0].message
    calls = []
    for tc in (msg.tool_calls or []):
        import json
        calls.append({'name': tc.function.name, 'input': json.loads(tc.function.arguments or '{}')})
    return (msg.content or ''), calls
```

- [ ] **Step 2: Sanity import check**

Run: `cd ai-server && python -c "from src.llm.client import llm_text, llm_tools; print('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add ai-server/src/llm/client.py
git commit -m "feat(ai-server): LLM text + tool-calling helpers (anthropic + openai-compat)"
```

---

### Task 0.4: FastAPI app + health endpoint

**Files:**
- Create: `ai-server/main.py`
- Test: `ai-server/tests/test_health.py`

- [ ] **Step 1: Write the failing test** — Create `ai-server/tests/test_health.py`

```python
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health_ok():
    r = client.get('/ai/health')
    assert r.status_code == 200
    assert r.json()['status'] == 'ok'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ai-server && python -m pytest tests/test_health.py -v`
Expected: FAIL — `ModuleNotFoundError: main` / app missing

- [ ] **Step 3: Create `ai-server/main.py`**

```python
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config.settings import settings

app = FastAPI(title='AI Server', version='0.1.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list(),
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.get('/ai/health')
def health() -> dict[str, str]:
    return {'status': 'ok'}


if __name__ == '__main__':
    uvicorn.run('main:app', host='0.0.0.0', port=settings.port, reload=False)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ai-server && python -m pytest tests/test_health.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-server/main.py ai-server/tests/test_health.py
git commit -m "feat(ai-server): FastAPI app + CORS + /ai/health"
```

---

# PHASE 1 — AI chat backend

### Task 1.1: Tool schemas + dispatch to AiAction

**Files:**
- Create: `ai-server/src/chat/__init__.py`, `ai-server/src/chat/tools.py`
- Test: `ai-server/tests/test_chat_tools.py`

- [ ] **Step 1: Write the failing test** — Create `ai-server/tests/test_chat_tools.py`

```python
from src.chat.tools import TOOLS, tool_call_to_action


def test_five_tools_defined():
    names = {t['name'] for t in TOOLS}
    assert names == {'filter_crew', 'filter_pairing', 'filter_flight', 'sort_roster', 'reset_filters'}


def test_filter_crew_maps_to_action():
    action = tool_call_to_action({'name': 'filter_crew', 'input': {'bases': ['BKK'], 'ranks': ['CA']}})
    assert action == {'type': 'filter_crew', 'bases': ['BKK'], 'ranks': ['CA']}


def test_sort_roster_maps_with_defaults():
    action = tool_call_to_action({'name': 'sort_roster', 'input': {'field': 'crewId', 'direction': 'desc'}})
    assert action == {'type': 'sort_roster', 'paneId': 'roster', 'field': 'crewId', 'direction': 'desc'}


def test_reset_filters_maps():
    assert tool_call_to_action({'name': 'reset_filters', 'input': {}}) == {'type': 'reset_filters'}


def test_unknown_tool_returns_none():
    assert tool_call_to_action({'name': 'nope', 'input': {}}) is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ai-server && python -m pytest tests/test_chat_tools.py -v`
Expected: FAIL — `ModuleNotFoundError: src.chat.tools`

- [ ] **Step 3: Write implementation** — Create `ai-server/src/chat/__init__.py` (empty) and `ai-server/src/chat/tools.py`

```python
from typing import Any

TOOLS: list[dict[str, Any]] = [
    {
        'name': 'filter_crew',
        'description': "Filter the roster/crew panes. Provide any subset of divisions "
                       "('P' cockpit, 'C' cabin), bases (airport codes), ranks (e.g. CA, FO), fleets.",
        'input_schema': {
            'type': 'object',
            'properties': {
                'divisions': {'type': 'array', 'items': {'type': 'string', 'enum': ['P', 'C']}},
                'bases': {'type': 'array', 'items': {'type': 'string'}},
                'ranks': {'type': 'array', 'items': {'type': 'string'}},
                'fleets': {'type': 'array', 'items': {'type': 'string'}},
            },
        },
    },
    {
        'name': 'filter_pairing',
        'description': 'Filter the pairing pane by bases, fleets, divisions, departure airports (depArps), '
                       'or whether the pairing is fully crewed (isFull true/false).',
        'input_schema': {
            'type': 'object',
            'properties': {
                'bases': {'type': 'array', 'items': {'type': 'string'}},
                'fleets': {'type': 'array', 'items': {'type': 'string'}},
                'divisions': {'type': 'array', 'items': {'type': 'string', 'enum': ['P', 'C']}},
                'depArps': {'type': 'array', 'items': {'type': 'string'}},
                'isFull': {'type': 'boolean'},
            },
        },
    },
    {
        'name': 'filter_flight',
        'description': 'Filter the flight pane by departure airports (depArps), arrival airports (arvArps), '
                       'flight numbers (fltNums), fleets, or statuses.',
        'input_schema': {
            'type': 'object',
            'properties': {
                'depArps': {'type': 'array', 'items': {'type': 'string'}},
                'arvArps': {'type': 'array', 'items': {'type': 'string'}},
                'fltNums': {'type': 'array', 'items': {'type': 'string'}},
                'fleets': {'type': 'array', 'items': {'type': 'string'}},
                'statuses': {'type': 'array', 'items': {'type': 'string'}},
            },
        },
    },
    {
        'name': 'sort_roster',
        'description': "Sort a roster pane by a field. field examples: 'crewId'. direction is 'asc' or 'desc'. "
                       "paneId defaults to 'roster' (the main roster pane).",
        'input_schema': {
            'type': 'object',
            'properties': {
                'paneId': {'type': 'string'},
                'field': {'type': 'string'},
                'direction': {'type': 'string', 'enum': ['asc', 'desc']},
            },
            'required': ['field', 'direction'],
        },
    },
    {
        'name': 'reset_filters',
        'description': 'Clear all active filters on every pane, returning to defaults.',
        'input_schema': {'type': 'object', 'properties': {}},
    },
]

_FILTER_KEYS = {
    'filter_crew': ('divisions', 'bases', 'ranks', 'fleets'),
    'filter_pairing': ('bases', 'fleets', 'divisions', 'depArps', 'isFull'),
    'filter_flight': ('depArps', 'arvArps', 'fltNums', 'fleets', 'statuses'),
}


def tool_call_to_action(call: dict[str, Any]) -> dict[str, Any] | None:
    name = call.get('name')
    data = call.get('input') or {}
    if name in _FILTER_KEYS:
        action: dict[str, Any] = {'type': name}
        for key in _FILTER_KEYS[name]:
            if key in data and data[key] is not None:
                action[key] = data[key]
        return action
    if name == 'sort_roster':
        return {
            'type': 'sort_roster',
            'paneId': data.get('paneId', 'roster'),
            'field': data['field'],
            'direction': data.get('direction', 'asc'),
        }
    if name == 'reset_filters':
        return {'type': 'reset_filters'}
    return None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ai-server && python -m pytest tests/test_chat_tools.py -v`
Expected: PASS (5 passed)

- [ ] **Step 5: Commit**

```bash
git add ai-server/src/chat/__init__.py ai-server/src/chat/tools.py ai-server/tests/test_chat_tools.py
git commit -m "feat(ai-server): chat tool schemas + AiAction mapping"
```

---

### Task 1.2: `POST /ai/chat` route

**Files:**
- Create: `ai-server/src/chat/routes.py`
- Modify: `ai-server/main.py` (include router)
- Test: `ai-server/tests/test_chat_route.py`

- [ ] **Step 1: Write the failing test** — Create `ai-server/tests/test_chat_route.py`

```python
from fastapi.testclient import TestClient
import src.chat.routes as routes
from main import app

client = TestClient(app)


def test_chat_returns_actions(monkeypatch):
    def fake_llm_tools(messages, tools, system):
        return 'Filtering crew to BKK.', [{'name': 'filter_crew', 'input': {'bases': ['BKK']}}]
    monkeypatch.setattr(routes, 'llm_tools', fake_llm_tools)

    r = client.post('/ai/chat', json={'messages': [{'role': 'user', 'content': 'show only bangkok crew'}]})
    assert r.status_code == 200
    body = r.json()
    assert body['role'] == 'assistant'
    assert body['content'] == 'Filtering crew to BKK.'
    assert body['actions'] == [{'type': 'filter_crew', 'bases': ['BKK']}]


def test_chat_qa_has_empty_actions(monkeypatch):
    monkeypatch.setattr(routes, 'llm_tools', lambda m, t, s: ('The roster pane shows crew rows.', []))
    r = client.post('/ai/chat', json={'messages': [{'role': 'user', 'content': 'what does the roster show?'}]})
    assert r.json()['actions'] == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ai-server && python -m pytest tests/test_chat_route.py -v`
Expected: FAIL — route 404 / import error

- [ ] **Step 3: Create `ai-server/src/chat/routes.py`**

```python
from fastapi import APIRouter
from pydantic import BaseModel

from src.llm.client import llm_tools
from src.chat.tools import TOOLS, tool_call_to_action

router = APIRouter(prefix='/ai', tags=['chat'])

SYSTEM_PROMPT = (
    "You are an assistant embedded in a crew-scheduling Gantt board. "
    "You can perform simple operations on the user's LIVE board by calling tools: "
    "filter the roster/crew, pairing, or flight panes; sort a roster pane; or reset all filters. "
    "Divisions are 'P' (cockpit) and 'C' (cabin). Ranks are codes like CA, FO. "
    "When the user asks to filter or sort, call the matching tool. "
    "When the user only asks a question, answer in plain English and do NOT call a tool. "
    "Always briefly confirm in words what you did. Be conservative — only act on clear intent."
)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


@router.post('/chat')
def chat(req: ChatRequest) -> dict:
    messages = [{'role': m.role, 'content': m.content} for m in req.messages]
    try:
        text, calls = llm_tools(messages, TOOLS, SYSTEM_PROMPT)
    except Exception as exc:  # noqa: BLE001 — surface a friendly error, never 500 the UI
        return {'role': 'assistant', 'content': f'AI request failed: {exc}', 'actions': []}
    actions = [a for a in (tool_call_to_action(c) for c in calls) if a is not None]
    if not text:
        text = 'Done.' if actions else 'I could not determine an action.'
    return {'role': 'assistant', 'content': text, 'actions': actions}
```

- [ ] **Step 4: Modify `ai-server/main.py` to include the router**

Add after the `health` function definition (before the `if __name__` block):

```python
from src.chat.routes import router as chat_router  # noqa: E402
app.include_router(chat_router)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd ai-server && python -m pytest tests/test_chat_route.py -v`
Expected: PASS (2 passed)

- [ ] **Step 6: Run full backend suite**

Run: `cd ai-server && python -m pytest -v`
Expected: PASS (all)

- [ ] **Step 7: Commit**

```bash
git add ai-server/src/chat/routes.py ai-server/main.py ai-server/tests/test_chat_route.py
git commit -m "feat(ai-server): POST /ai/chat tool-calling endpoint"
```

---

# PHASE 2 — AI chat frontend

### Task 2.1: API path + service client

**Files:**
- Modify: `gantt/src/config/api-paths.ts`
- Create: `gantt/src/services/ai-api.ts`, `gantt/src/components/ai-chat/types.ts`

- [ ] **Step 1: Add AI base path** — Modify `gantt/src/config/api-paths.ts`, add after line 7 (`ENGINE_API_BASE`):

```typescript
export const AI_API_BASE = '/fpqe/ai'
```

- [ ] **Step 2: Create `gantt/src/components/ai-chat/types.ts`**

```typescript
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export type AiAction =
  | { type: 'filter_crew'; divisions?: string[]; bases?: string[]; ranks?: string[]; fleets?: string[] }
  | { type: 'filter_pairing'; bases?: string[]; fleets?: string[]; divisions?: string[]; depArps?: string[]; isFull?: boolean | null }
  | { type: 'filter_flight'; depArps?: string[]; arvArps?: string[]; fltNums?: string[]; fleets?: string[]; statuses?: string[] }
  | { type: 'sort_roster'; paneId: string; field: string; direction: 'asc' | 'desc' }
  | { type: 'reset_filters' }

export interface ChatResponse {
  role: 'assistant'
  content: string
  actions: AiAction[]
}
```

- [ ] **Step 3: Create `gantt/src/services/ai-api.ts`**

```typescript
import { AI_API_BASE } from '@/config/api-paths'
import { createHttpClient } from './http-client'
import type { ChatMessage, ChatResponse } from '@/components/ai-chat/types'

const aiClient = createHttpClient({ baseURL: AI_API_BASE })

export const aiApi = {
  chat: (messages: ChatMessage[]): Promise<ChatResponse> =>
    aiClient.post('/chat', { messages }) as Promise<ChatResponse>,
}
```

- [ ] **Step 4: Type-check**

Run: `cd gantt && npx tsc --noEmit`
Expected: PASS (no new errors beyond the 2 pre-existing ones noted in project memory)

- [ ] **Step 5: Commit**

```bash
git add gantt/src/config/api-paths.ts gantt/src/services/ai-api.ts gantt/src/components/ai-chat/types.ts
git commit -m "feat(gantt): ai-api client + chat types + /fpqe/ai path"
```

---

### Task 2.2: Action dispatcher (store mutations)

**Files:**
- Create: `gantt/src/components/ai-chat/dispatch-ai-action.ts`
- Test: `gantt/src/components/ai-chat/__tests__/dispatch-ai-action.test.ts`

- [ ] **Step 1: Write the failing test** — Create `gantt/src/components/ai-chat/__tests__/dispatch-ai-action.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { dispatchAiAction } from '../dispatch-ai-action'
import { useFilterStore } from '@/stores/filter-store'
import { useRosterStore } from '@/stores/roster-store'

describe('dispatchAiAction', () => {
  beforeEach(() => {
    useFilterStore.getState().resetFilters()
  })

  it('applies filter_crew to the filter store', () => {
    dispatchAiAction({ type: 'filter_crew', bases: ['BKK'], ranks: ['CA'] })
    expect(useFilterStore.getState().crew.bases).toEqual(['BKK'])
    expect(useFilterStore.getState().crew.ranks).toEqual(['CA'])
  })

  it('applies sort_roster to the roster store', () => {
    dispatchAiAction({ type: 'sort_roster', paneId: 'roster', field: 'crewId', direction: 'desc' })
    const pane = useRosterStore.getState()['roster']
    expect(pane.sortField).toBe('crewId')
    expect(pane.sortDirection).toBe('desc')
  })

  it('reset_filters clears crew filter', () => {
    dispatchAiAction({ type: 'filter_crew', bases: ['BKK'] })
    dispatchAiAction({ type: 'reset_filters' })
    expect(useFilterStore.getState().crew.bases).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gantt && npx vitest run src/components/ai-chat/__tests__/dispatch-ai-action.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create `gantt/src/components/ai-chat/dispatch-ai-action.ts`**

> Note: `roster` is the default `PaneId`. If `useRosterStore`'s `PaneId` type rejects the string, cast via the store's exported type. Confirm the exact `PaneId` union in `gantt/src/stores/roster-store.ts` when implementing and import it.

```typescript
import { useFilterStore } from '@/stores/filter-store'
import { useRosterStore } from '@/stores/roster-store'
import type { AiAction } from './types'

/** Apply one AI action to the relevant Zustand store. Returns a short
 *  English confirmation string for the chat thread, or null to skip. */
export function dispatchAiAction(action: AiAction): string | null {
  switch (action.type) {
    case 'filter_crew': {
      const { type, ...rest } = action
      useFilterStore.getState().setCrewFilter(rest)
      return `Filtered crew (${summarize(rest)})`
    }
    case 'filter_pairing': {
      const { type, ...rest } = action
      useFilterStore.getState().setPairingFilter(rest)
      return `Filtered pairings (${summarize(rest)})`
    }
    case 'filter_flight': {
      const { type, ...rest } = action
      useFilterStore.getState().setFlightFilter(rest)
      return `Filtered flights (${summarize(rest)})`
    }
    case 'sort_roster': {
      useRosterStore.getState().setSort(action.paneId as never, action.field, action.direction)
      return `Sorted roster by ${action.field} ${action.direction}`
    }
    case 'reset_filters': {
      useFilterStore.getState().resetFilters()
      return 'Cleared all filters'
    }
    default:
      return null
  }
}

function summarize(rest: Record<string, unknown>): string {
  return Object.entries(rest)
    .filter(([, v]) => v != null && (!Array.isArray(v) || v.length > 0))
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : String(v)}`)
    .join(' · ') || 'no change'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gantt && npx vitest run src/components/ai-chat/__tests__/dispatch-ai-action.test.ts`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components/ai-chat/dispatch-ai-action.ts gantt/src/components/ai-chat/__tests__/dispatch-ai-action.test.ts
git commit -m "feat(gantt): AI action dispatcher to filter/roster stores"
```

---

### Task 2.3: Chat hook + panel UI + mount

**Files:**
- Create: `gantt/src/components/ai-chat/use-ai-chat.ts`, `gantt/src/components/ai-chat/ai-chat-panel.tsx`
- Modify: `gantt/src/components/shell/app-shell.tsx`

- [ ] **Step 1: Create `gantt/src/components/ai-chat/use-ai-chat.ts`**

```typescript
import { useState, useCallback } from 'react'
import { aiApi } from '@/services/ai-api'
import { dispatchAiAction } from './dispatch-ai-action'
import type { ChatMessage } from './types'

export interface ThreadEntry extends ChatMessage {
  /** confirmation chips for applied actions */
  applied?: string[]
}

export function useAiChat() {
  const [thread, setThread] = useState<ThreadEntry[]>([])
  const [busy, setBusy] = useState(false)

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    const userMsg: ThreadEntry = { role: 'user', content: trimmed }
    const history: ChatMessage[] = [...thread.map((m) => ({ role: m.role, content: m.content })), userMsg]
    setThread((t) => [...t, userMsg])
    setBusy(true)
    try {
      const resp = await aiApi.chat(history)
      const applied = resp.actions
        .map((a) => dispatchAiAction(a))
        .filter((s): s is string => s !== null)
      setThread((t) => [...t, { role: 'assistant', content: resp.content, applied }])
    } catch {
      setThread((t) => [...t, { role: 'assistant', content: 'AI request failed. Please try again.' }])
    } finally {
      setBusy(false)
    }
  }, [thread, busy])

  return { thread, busy, send }
}
```

- [ ] **Step 2: Create `gantt/src/components/ai-chat/ai-chat-panel.tsx`**

```tsx
import { useState } from 'react'
import { Bot, Send, X, MessageSquare } from 'lucide-react'
import { useAiChat } from './use-ai-chat'

export const AiChatPanel = () => {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const { thread, busy, send } = useAiChat()

  const submit = () => { void send(input); setInput('') }

  if (!open) {
    return (
      <button
        data-testid="ai-chat-toggle"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
        aria-label="Open AI assistant"
      >
        <MessageSquare className="h-4 w-4" />
      </button>
    )
  }

  return (
    <div
      data-testid="ai-chat-panel"
      className="fixed bottom-4 right-4 z-50 flex h-[28rem] w-80 flex-col rounded-lg border border-border bg-background shadow-xl"
    >
      <div className="flex h-10 shrink-0 items-center gap-2 rounded-t-lg bg-primary px-3 text-primary-foreground">
        <Bot className="h-4 w-4 shrink-0" />
        <span className="text-sm font-semibold">AI Assistant</span>
        <button onClick={() => setOpen(false)} className="ml-auto" aria-label="Close" data-testid="ai-chat-close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3" data-testid="ai-chat-thread">
        {thread.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Try: "show only Bangkok crew", "sort roster by crew id descending", "clear all filters".
          </p>
        )}
        {thread.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <div className={[
              'inline-block max-w-[85%] rounded-md px-2 py-1 text-xs',
              m.role === 'user' ? 'bg-primary/10 text-foreground' : 'bg-muted text-foreground',
            ].join(' ')}>
              {m.content}
            </div>
            {m.applied?.map((chip, j) => (
              <div key={j} className="mt-1 text-2xs text-muted-foreground" data-testid="ai-chat-applied">✓ {chip}</div>
            ))}
          </div>
        ))}
        {busy && <div className="text-2xs text-muted-foreground" data-testid="ai-chat-busy">Thinking…</div>}
      </div>

      <div className="flex shrink-0 items-center gap-1.5 border-t border-border p-2">
        <input
          data-testid="ai-chat-input"
          className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs outline-none"
          placeholder="Ask the assistant…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        />
        <button
          data-testid="ai-chat-send"
          onClick={submit}
          disabled={busy}
          className="inline-flex h-7 w-7 items-center justify-center rounded bg-primary p-0 text-primary-foreground disabled:opacity-50"
          aria-label="Send"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Mount in `app-shell.tsx`** — add import near the other component imports (after line 8):

```typescript
import { AiChatPanel } from '@/components/ai-chat/ai-chat-panel'
```

Then render `<AiChatPanel />` inside the `AppShell` return, as a sibling after the main layout wrapper (so it floats above all modules). Place it just before the closing fragment/root element alongside `<Toaster />`.

- [ ] **Step 4: Type-check + build**

Run: `cd gantt && npx tsc --noEmit && npx vite build`
Expected: PASS (no new errors)

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components/ai-chat/use-ai-chat.ts gantt/src/components/ai-chat/ai-chat-panel.tsx gantt/src/components/shell/app-shell.tsx
git commit -m "feat(gantt): floating AI chat panel + hook, mounted in AppShell"
```

---

### Task 2.4: E2E test for AI chat (mandatory)

**Files:**
- Create: `e2e/gantt/ai-chat.spec.ts`

> The LLM is stubbed at the network layer via `page.route('**/fpqe/ai/chat', …)` so the test is deterministic and asserts dispatch + UI effect, per §No-Illusion. Reuse the existing gantt auth seeding helper (sessionStorage via `addInitScript`) — check an existing spec in `e2e/gantt/` for the exact helper import and base path `/fpqe/gantt/`.

- [ ] **Step 1: Write the test** — Create `e2e/gantt/ai-chat.spec.ts`

```typescript
import { test, expect } from '@playwright/test'
// Reuse existing auth/setup helper from e2e/gantt — match the import other specs use.
// e.g. import { gotoGantt } from './helpers'  (confirm actual helper name/path)

test('AI chat filters crew, then resets', async ({ page }) => {
  // Stub the AI endpoint deterministically.
  await page.route('**/fpqe/ai/chat', async (route) => {
    const body = route.request().postDataJSON() as { messages: { content: string }[] }
    const last = body.messages[body.messages.length - 1].content.toLowerCase()
    if (last.includes('reset') || last.includes('clear')) {
      await route.fulfill({ json: { role: 'assistant', content: 'Cleared.', actions: [{ type: 'reset_filters' }] } })
    } else {
      await route.fulfill({ json: { role: 'assistant', content: 'Filtering to BKK.', actions: [{ type: 'filter_crew', bases: ['BKK'] }] } })
    }
  })

  // TODO at implementation: navigate to gantt + ensure authenticated (reuse helper),
  // and make sure the Live/roster module is open so filter chips are visible.

  await page.getByTestId('ai-chat-toggle').click()
  await expect(page.getByTestId('ai-chat-panel')).toBeVisible()

  await page.getByTestId('ai-chat-input').fill('show only bangkok crew')
  await page.getByTestId('ai-chat-send').click()

  // Assert the action was applied (confirmation chip + filter store effect).
  await expect(page.getByTestId('ai-chat-applied')).toContainText('Filtered crew')
  await expect(page.getByTestId('ai-chat-applied')).toContainText('bases=BKK')

  await page.getByTestId('ai-chat-input').fill('clear all filters')
  await page.getByTestId('ai-chat-send').click()
  await expect(page.getByTestId('ai-chat-applied').last()).toContainText('Cleared all filters')
})
```

- [ ] **Step 2: Wire up the auth/navigation helper**

Open an existing passing spec under `e2e/gantt/` (e.g. a roster spec) and copy its exact import + the call that lands an authenticated session on the roster view. Replace the `TODO` comment in Step 1 with those real lines.

- [ ] **Step 3: Run the test**

Run (from repo root, ai-server + gantt dev server running): `npx playwright test e2e/gantt/ai-chat.spec.ts --reporter=list`
Expected: PASS. Paste the PASS/FAIL summary into the completion message (§No-Illusion).

- [ ] **Step 4: Bump versions** — Modify `gantt/src/version.ts`:

```typescript
export const BACKEND_VERSION = 37
export const FRONTEND_VERSION = 44
```

- [ ] **Step 5: Commit**

```bash
git add e2e/gantt/ai-chat.spec.ts gantt/src/version.ts
git commit -m "test(gantt): e2e AI chat filter+reset; bump versions B37/F44"
```

---

# PHASE 3 — Regression backend

### Task 3.1: JSON storage model

**Files:**
- Create: `ai-server/src/regression/__init__.py`, `ai-server/src/regression/store.py`
- Test: `ai-server/tests/test_regression_store.py`

- [ ] **Step 1: Write the failing test** — Create `ai-server/tests/test_regression_store.py`

```python
from src.regression.store import RegressionStore


def test_create_and_list(tmp_path):
    store = RegressionStore(tmp_path / 'r.json')
    t = store.create_test(title='Filter BKK', category='Roster Filter', priority='High', description='base chip appears')
    assert t['id'] == 1001
    assert t['source'] == 'User'
    assert t['spec_file'] == 'manual'
    assert store.list_tests()[0]['title'] == 'Filter BKK'


def test_persists_across_instances(tmp_path):
    path = tmp_path / 'r.json'
    RegressionStore(path).create_test(title='A', category='c', priority='Low', description='')
    assert len(RegressionStore(path).list_tests()) == 1


def test_record_run_updates_stats(tmp_path):
    store = RegressionStore(tmp_path / 'r.json')
    t = store.create_test(title='A', category='c', priority='Low', description='')
    store.record_run(t['id'], status='pass', duration_ms=120, log='ok')
    updated = store.get_test(t['id'])
    assert updated['run_count'] == 1
    assert updated['pass_count'] == 1
    assert updated['last_status'] == 'pass'
    assert updated['flakiness_score'] == 0.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ai-server && python -m pytest tests/test_regression_store.py -v`
Expected: FAIL — module missing

- [ ] **Step 3: Create `ai-server/src/regression/__init__.py`** (empty) **and `ai-server/src/regression/store.py`**

```python
import json
from pathlib import Path
from typing import Any


def _now() -> str:
    # Caller may pass timestamps; default empty to keep store pure/testable.
    return ''


class RegressionStore:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self._data = self._load()

    def _load(self) -> dict[str, Any]:
        if self.path.exists():
            try:
                return json.loads(self.path.read_text())
            except (json.JSONDecodeError, OSError):
                pass
        return {'next_id': 1001, 'tests': []}

    def _save(self) -> None:
        self.path.write_text(json.dumps(self._data, indent=2))

    def list_tests(self) -> list[dict[str, Any]]:
        return self._data['tests']

    def get_test(self, test_id: int) -> dict[str, Any] | None:
        return next((t for t in self._data['tests'] if t['id'] == test_id), None)

    def create_test(self, *, title: str, category: str, priority: str, description: str,
                    source: str = 'User') -> dict[str, Any]:
        test_id = self._data['next_id']
        self._data['next_id'] += 1
        test = {
            'id': test_id, 'title': title, 'spec_file': 'manual', 'test_name': '',
            'category': category, 'source': source, 'priority': priority, 'description': description,
            'created_at': _now(), 'updated_at': _now(),
            'last_status': None, 'last_run_at': None, 'last_duration_ms': None, 'last_log': None,
            'run_count': 0, 'pass_count': 0, 'fail_count': 0,
            'total_duration_ms': 0, 'flakiness_score': 0.0,
            'versions': [{'version': 1, 'timestamp': _now(), 'trigger': 'created',
                          'title': title, 'code': '', 'status': '', 'log': '', 'run_at': '', 'duration_ms': 0}],
        }
        self._data['tests'].append(test)
        self._save()
        return test

    def update_test(self, test_id: int, **fields: Any) -> dict[str, Any] | None:
        t = self.get_test(test_id)
        if t is None:
            return None
        for k in ('title', 'category', 'priority', 'description', 'spec_file', 'test_name'):
            if k in fields and fields[k] is not None:
                t[k] = fields[k]
        t['updated_at'] = _now()
        self._save()
        return t

    def delete_test(self, test_id: int) -> bool:
        before = len(self._data['tests'])
        self._data['tests'] = [t for t in self._data['tests'] if t['id'] != test_id]
        changed = len(self._data['tests']) != before
        if changed:
            self._save()
        return changed

    def append_version(self, test_id: int, *, trigger: str, code: str = '', status: str = '',
                       log: str = '', duration_ms: int = 0) -> None:
        t = self.get_test(test_id)
        if t is None:
            return
        version = len(t['versions']) + 1
        t['versions'].append({'version': version, 'timestamp': _now(), 'trigger': trigger,
                              'title': t['title'], 'code': code, 'status': status, 'log': log,
                              'run_at': '', 'duration_ms': duration_ms})
        t['versions'] = t['versions'][-50:]
        self._save()

    def record_run(self, test_id: int, *, status: str, duration_ms: int, log: str) -> None:
        t = self.get_test(test_id)
        if t is None:
            return
        t['run_count'] += 1
        if status == 'pass':
            t['pass_count'] += 1
        else:
            t['fail_count'] += 1
        t['total_duration_ms'] += duration_ms
        t['last_status'] = status
        t['last_duration_ms'] = duration_ms
        t['last_log'] = log
        t['flakiness_score'] = round(t['fail_count'] / t['run_count'], 3) if t['run_count'] else 0.0
        self.append_version(test_id, trigger='run', status=status, log=log, duration_ms=duration_ms)
        self._save()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ai-server && python -m pytest tests/test_regression_store.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add ai-server/src/regression/__init__.py ai-server/src/regression/store.py ai-server/tests/test_regression_store.py
git commit -m "feat(ai-server): regression JSON store (CRUD + versions + run stats)"
```

---

### Task 3.2: PW_GEN prompt + generate/apply/run routes

**Files:**
- Create: `ai-server/src/regression/prompts.py`, `ai-server/src/regression/runner.py`, `ai-server/src/regression/routes.py`
- Modify: `ai-server/main.py`
- Test: `ai-server/tests/test_regression_routes.py`

- [ ] **Step 1: Create `ai-server/src/regression/prompts.py`**

```python
PW_GEN_SYSTEM = """You are an expert Playwright test writer for the ROIS crew-scheduling Gantt app.

App context:
- The app is served under the base path /fpqe/gantt/ .
- Authentication is sessionStorage-based and is already seeded by a shared helper before each test.
- A helper `loginAndSeed(page)` (or the project's existing equivalent) ALREADY EXISTS in the target spec file — DO NOT redeclare it; just call it first.
- Gantt panes are Canvas-rendered. Prefer asserting via data-testid attributes and the window.__ganttTest introspection hook for canvas content, NOT pixel coordinates.
- All interactive controls expose data-testid attributes.

Write ONLY the `test('...', async ({ page }) => { ... });` block — no imports, no helper definitions, no surrounding describe.
The test MUST: (1) call the existing login/seed helper, (2) perform the user action, (3) assert a SPECIFIC visible value or element count (never a bare toBeVisible).

If the user's description is too vague to write a reliable assertion, respond with a JSON object {"questions": ["...", "..."]} listing what you need. Otherwise respond with {"code": "test('...', async ({ page }) => { ... });"}.
Respond with raw JSON only."""
```

- [ ] **Step 2: Write the failing test** — Create `ai-server/tests/test_regression_routes.py`

```python
import json
from fastapi.testclient import TestClient
import src.regression.routes as rroutes
from main import app

client = TestClient(app)


def test_create_then_list():
    r = client.post('/ai/regression/tests', json={'title': 'Filter BKK', 'category': 'Roster Filter', 'priority': 'High', 'description': 'chip appears'})
    assert r.status_code == 200
    tid = r.json()['id']
    listed = client.get('/ai/regression/tests').json()
    assert any(t['id'] == tid for t in listed['tests'])


def test_generate_returns_questions(monkeypatch):
    monkeypatch.setattr(rroutes, 'llm_text', lambda system, user, max_tokens=1024: json.dumps({'questions': ['Which pane?']}))
    r = client.post('/ai/regression/generate-playwright', json={'title': 'x', 'description': '', 'category': 'c'})
    assert r.json()['questions'] == ['Which pane?']


def test_generate_returns_code(monkeypatch):
    code = "test('filters BKK', async ({ page }) => { await loginAndSeed(page); });"
    monkeypatch.setattr(rroutes, 'llm_text', lambda system, user, max_tokens=1024: json.dumps({'code': code}))
    r = client.post('/ai/regression/generate-playwright', json={'title': 'x', 'description': 'detailed', 'category': 'c'})
    assert r.json()['code'] == code


def test_run_parses_reporter(monkeypatch):
    created = client.post('/ai/regression/tests', json={'title': 'R', 'category': 'c', 'priority': 'Low', 'description': ''}).json()
    fake = {'passed': 1, 'failed': 0, 'results': {str(created['id']): {'status': 'pass', 'duration_ms': 50, 'log': ''}}}
    monkeypatch.setattr(rroutes, 'run_playwright', lambda specs, names, id_by_name: fake)
    r = client.post('/ai/regression/runs', json={'test_ids': [created['id']]})
    run_id = r.json()['run_id']
    status = client.get(f'/ai/regression/runs/{run_id}').json()
    assert status['status'] == 'done'
    assert status['passed'] == 1
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd ai-server && python -m pytest tests/test_regression_routes.py -v`
Expected: FAIL — routes missing

- [ ] **Step 4: Create `ai-server/src/regression/runner.py`**

```python
import json
import subprocess
from pathlib import Path
from typing import Any

from src.config.settings import settings


def _repo_root() -> Path:
    if settings.repo_root:
        return Path(settings.repo_root)
    # ai-server/src/regression/runner.py -> repo root is 3 parents up from ai-server/
    return Path(__file__).resolve().parents[3]


def run_playwright(specs: list[str], names: list[str], id_by_name: dict[str, int]) -> dict[str, Any]:
    """Run selected tests via the repo's playwright config; parse JSON reporter."""
    root = _repo_root()
    spec_args = [f'e2e/gantt/{s}' for s in specs]
    grep = '|'.join(names) if names else '.*'
    cmd = ['npx', 'playwright', 'test', *spec_args, '--reporter=json', '--grep', grep]
    proc = subprocess.run(cmd, cwd=root, capture_output=True, text=True, timeout=600)
    results: dict[str, Any] = {}
    passed = failed = 0
    try:
        report = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return {'passed': 0, 'failed': len(names), 'results': {},
                'error': proc.stderr[-2000:] or 'playwright produced no JSON output'}
    for suite in report.get('suites', []):
        for spec in _iter_specs(suite):
            title = spec.get('title', '')
            ok = all(t.get('status') == 'expected' for t in spec.get('tests', []))
            duration = sum(r.get('duration', 0) for t in spec.get('tests', []) for r in t.get('results', []))
            tid = id_by_name.get(title)
            status = 'pass' if ok else 'fail'
            if ok:
                passed += 1
            else:
                failed += 1
            if tid is not None:
                results[str(tid)] = {'status': status, 'duration_ms': int(duration), 'log': ''}
    return {'passed': passed, 'failed': failed, 'results': results}


def _iter_specs(suite: dict[str, Any]):
    yield from suite.get('specs', [])
    for child in suite.get('suites', []):
        yield from _iter_specs(child)
```

- [ ] **Step 5: Create `ai-server/src/regression/routes.py`**

```python
import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.llm.client import llm_text
from src.regression.prompts import PW_GEN_SYSTEM
from src.regression.store import RegressionStore
from src.regression.runner import run_playwright
from src.config.settings import settings

router = APIRouter(prefix='/ai/regression', tags=['regression'])

_STORE_PATH = Path(settings.repo_root or Path(__file__).resolve().parents[2]) / 'regression_tests.json'
store = RegressionStore(_STORE_PATH)

# In-memory run registry (poll target). Process-local, matches EVACC.
_runs: dict[str, dict[str, Any]] = {}
_run_seq = {'n': 0}


class CreateTest(BaseModel):
    title: str
    category: str
    priority: str
    description: str = ''


class UpdateTest(BaseModel):
    title: str | None = None
    category: str | None = None
    priority: str | None = None
    description: str | None = None


class GenerateReq(BaseModel):
    title: str
    description: str = ''
    category: str = ''


class ApplyReq(BaseModel):
    code: str


class RunReq(BaseModel):
    test_ids: list[int]


@router.get('/tests')
def list_tests() -> dict:
    return {'tests': store.list_tests()}


@router.post('/tests')
def create_test(req: CreateTest) -> dict:
    return store.create_test(title=req.title, category=req.category, priority=req.priority, description=req.description)


@router.put('/tests/{test_id}')
def update_test(test_id: int, req: UpdateTest) -> dict:
    t = store.update_test(test_id, **req.model_dump(exclude_none=True))
    if t is None:
        raise HTTPException(404, 'test not found')
    return t


@router.delete('/tests/{test_id}')
def delete_test(test_id: int) -> dict:
    if not store.delete_test(test_id):
        raise HTTPException(404, 'test not found')
    return {'deleted': test_id}


@router.post('/generate-playwright')
def generate(req: GenerateReq) -> dict:
    user = f"Title: {req.title}\nCategory: {req.category}\nStory / acceptance: {req.description}"
    try:
        raw = llm_text(PW_GEN_SYSTEM, user, max_tokens=1024)
    except Exception as exc:  # noqa: BLE001
        return {'error': f'generation failed: {exc}'}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        # Model returned bare code; wrap it.
        return {'code': raw.strip()}
    if 'questions' in parsed:
        return {'questions': parsed['questions']}
    return {'code': parsed.get('code', '').strip()}


def _extract_test_name(code: str) -> str:
    import re
    m = re.search(r"test\(\s*['\"](.+?)['\"]", code)
    return m.group(1) if m else ''


@router.post('/tests/{test_id}/apply-generated')
def apply_generated(test_id: int, req: ApplyReq) -> dict:
    t = store.get_test(test_id)
    if t is None:
        raise HTTPException(404, 'test not found')
    name = _extract_test_name(req.code)
    spec_path = Path(settings.repo_root or Path(__file__).resolve().parents[3]) / 'e2e' / 'gantt' / 'user-tests.spec.ts'
    spec_path.parent.mkdir(parents=True, exist_ok=True)
    header = "import { test, expect } from '@playwright/test'\n\n"
    block = f"\n// user-test-{test_id}\n{req.code}\n"
    if not spec_path.exists():
        spec_path.write_text(header + block)
    else:
        spec_path.write_text(spec_path.read_text() + block)
    store.update_test(test_id, spec_file='user-tests.spec.ts', test_name=name)
    store.append_version(test_id, trigger='script', code=req.code)
    return {'spec_file': 'user-tests.spec.ts', 'test_name': name}


@router.post('/runs')
def create_run(req: RunReq) -> dict:
    _run_seq['n'] += 1
    run_id = f"run-{_run_seq['n']}"
    tests = [store.get_test(i) for i in req.test_ids]
    tests = [t for t in tests if t is not None and t['spec_file'] != 'manual']
    specs = sorted({t['spec_file'] for t in tests})
    names = [t['test_name'] for t in tests if t['test_name']]
    id_by_name = {t['test_name']: t['id'] for t in tests if t['test_name']}
    try:
        result = run_playwright(specs, names, id_by_name)
        for tid_str, res in result['results'].items():
            store.record_run(int(tid_str), status=res['status'], duration_ms=res['duration_ms'], log=res.get('log', ''))
        status = 'done'
    except Exception as exc:  # noqa: BLE001
        result = {'passed': 0, 'failed': len(names), 'results': {}, 'error': str(exc)}
        status = 'error'
    _runs[run_id] = {'run_id': run_id, 'status': status,
                     'passed': result['passed'], 'failed': result['failed'],
                     'results': result['results'], 'error': result.get('error')}
    return {'run_id': run_id}


@router.get('/runs/{run_id}')
def get_run(run_id: str) -> dict:
    run = _runs.get(run_id)
    if run is None:
        raise HTTPException(404, 'run not found')
    return run
```

- [ ] **Step 6: Include router in `ai-server/main.py`** — add after the chat router include:

```python
from src.regression.routes import router as regression_router  # noqa: E402
app.include_router(regression_router)
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd ai-server && python -m pytest tests/test_regression_routes.py -v`
Expected: PASS (4 passed)

> Note: `create_run` runs synchronously then reports `done`/`error` (EVACC-compatible polling contract preserved; `status` is never observed as `running` because there is no background task — acceptable for v1, the frontend still polls once). Document this in the route docstring.

- [ ] **Step 8: Run full backend suite**

Run: `cd ai-server && python -m pytest -v`
Expected: PASS (all)

- [ ] **Step 9: Commit**

```bash
git add ai-server/src/regression/prompts.py ai-server/src/regression/runner.py ai-server/src/regression/routes.py ai-server/main.py ai-server/tests/test_regression_routes.py
git commit -m "feat(ai-server): regression generate/apply/run endpoints + PW prompt"
```

---

# PHASE 4 — Regression frontend

### Task 4.1: Regression API client + shell module registration

**Files:**
- Create: `gantt/src/services/regression-api.ts`, `gantt/src/types/regression.ts`
- Modify: `gantt/src/stores/shell-store.ts` (add `'regression'` to `ActiveModule`)

- [ ] **Step 1: Create `gantt/src/types/regression.ts`**

```typescript
export interface RegressionTest {
  id: number
  title: string
  spec_file: string
  test_name: string
  category: string
  source: 'AI' | 'User'
  priority: 'High' | 'Medium' | 'Low'
  description: string
  last_status: 'pass' | 'fail' | null
  last_duration_ms: number | null
  run_count: number
  pass_count: number
  fail_count: number
  flakiness_score: number
}

export interface GenerateResult {
  code?: string
  questions?: string[]
  error?: string
}
```

- [ ] **Step 2: Create `gantt/src/services/regression-api.ts`**

```typescript
import { AI_API_BASE } from '@/config/api-paths'
import { createHttpClient } from './http-client'
import type { RegressionTest, GenerateResult } from '@/types/regression'

const client = createHttpClient({ baseURL: AI_API_BASE })

export const regressionApi = {
  list: (): Promise<{ tests: RegressionTest[] }> =>
    client.get('/regression/tests') as Promise<{ tests: RegressionTest[] }>,
  create: (body: { title: string; category: string; priority: string; description: string }): Promise<RegressionTest> =>
    client.post('/regression/tests', body) as Promise<RegressionTest>,
  remove: (id: number): Promise<{ deleted: number }> =>
    client.delete(`/regression/tests/${id}`) as Promise<{ deleted: number }>,
  generate: (body: { title: string; description: string; category: string }): Promise<GenerateResult> =>
    client.post('/regression/generate-playwright', body) as Promise<GenerateResult>,
  applyGenerated: (id: number, code: string): Promise<{ spec_file: string; test_name: string }> =>
    client.post(`/regression/tests/${id}/apply-generated`, { code }) as Promise<{ spec_file: string; test_name: string }>,
  run: (testIds: number[]): Promise<{ run_id: string }> =>
    client.post('/regression/runs', { test_ids: testIds }) as Promise<{ run_id: string }>,
  runStatus: (runId: string): Promise<{ status: string; passed: number; failed: number }> =>
    client.get(`/regression/runs/${runId}`) as Promise<{ status: string; passed: number; failed: number }>,
}
```

- [ ] **Step 3: Add `'regression'` to `ActiveModule`** — Modify `gantt/src/stores/shell-store.ts` line 3:

```typescript
export type ActiveModule = 'dashboard' | 'live' | 'scenario' | 'rule' | 'data' | 'system' | 'regression'
```

- [ ] **Step 4: Type-check**

Run: `cd gantt && npx tsc --noEmit`
Expected: PASS (no new errors)

- [ ] **Step 5: Commit**

```bash
git add gantt/src/services/regression-api.ts gantt/src/types/regression.ts gantt/src/stores/shell-store.ts
git commit -m "feat(gantt): regression api client + register regression shell module"
```

---

### Task 4.2: Regression view (list + add dialog + run) and shell wiring

**Files:**
- Create: `gantt/src/components/regression/regression-view.tsx`, `gantt/src/components/regression/add-test-dialog.tsx`
- Modify: `gantt/src/components/shell/app-shell.tsx` (ModuleView case), `gantt/src/components/shell/shell-sidebar.tsx` (nav entry)

- [ ] **Step 1: Create `gantt/src/components/regression/add-test-dialog.tsx`**

```tsx
import { useState } from 'react'
import { AppDialog, Button } from '@rois/ui'
import { FlaskConical } from 'lucide-react'

interface AddTestDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSave: (data: { title: string; category: string; priority: string; description: string }) => void
}

const PRIORITIES = ['High', 'Medium', 'Low']

export const AddTestDialog = ({ open, onOpenChange, onSave }: AddTestDialogProps) => {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('General')
  const [priority, setPriority] = useState('Medium')
  const [description, setDescription] = useState('')

  const save = () => {
    if (!title.trim()) return
    onSave({ title: title.trim(), category, priority, description })
    setTitle(''); setDescription(''); onOpenChange(false)
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      data-testid="add-test-dialog"
      className="sm:max-w-[540px]"
      icon={<FlaskConical className="h-4 w-4" />}
      title="Add Regression Test"
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} data-testid="add-test-save">Save</Button></>}
    >
      <div className="space-y-3">
        <label className="block text-2xs font-medium text-muted-foreground">Story / what does this test check?
          <textarea data-testid="add-test-title" className="mt-1 w-full rounded border border-border bg-background p-2 text-xs" rows={6}
            value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="flex gap-3">
          <label className="flex-1 text-2xs font-medium text-muted-foreground">Category
            <input className="mt-1 w-full rounded border border-border bg-background p-1.5 text-xs"
              value={category} onChange={(e) => setCategory(e.target.value)} />
          </label>
          <label className="text-2xs font-medium text-muted-foreground">Priority
            <select className="mt-1 w-full rounded border border-border bg-background p-1.5 text-xs"
              value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-2xs font-medium text-muted-foreground">Notes / acceptance criteria (optional)
          <textarea className="mt-1 w-full rounded border border-border bg-background p-2 text-xs" rows={3}
            value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
      </div>
    </AppDialog>
  )
}
```

- [ ] **Step 2: Create `gantt/src/components/regression/regression-view.tsx`**

```tsx
import { useEffect, useState, useCallback } from 'react'
import { FlaskConical, Plus, Play, Wand2, Trash2 } from 'lucide-react'
import { Button } from '@rois/ui'
import { regressionApi } from '@/services/regression-api'
import type { RegressionTest } from '@/types/regression'
import { AddTestDialog } from './add-test-dialog'

export const RegressionView = () => {
  const [tests, setTests] = useState<RegressionTest[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [preview, setPreview] = useState<{ id: number; code: string } | null>(null)

  const refresh = useCallback(async () => {
    const { tests } = await regressionApi.list()
    setTests(tests)
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const onSave = async (data: { title: string; category: string; priority: string; description: string }) => {
    await regressionApi.create(data)
    await refresh()
  }

  const onGenerate = async (t: RegressionTest) => {
    const res = await regressionApi.generate({ title: t.title, description: t.description, category: t.category })
    if (res.code) setPreview({ id: t.id, code: res.code })
  }

  const userCount = tests.filter((t) => t.source === 'User').length

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-4">
        <FlaskConical className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">Regression Tests</span>
        <Button size="sm" className="ml-auto" onClick={() => setAddOpen(true)} data-testid="add-test-open">
          <Plus className="h-3.5 w-3.5" /> Add Test
        </Button>
      </div>

      <div className="flex gap-3 border-b border-border px-4 py-2 text-xs">
        <span data-testid="stat-total">Total: {tests.length}</span>
        <span data-testid="stat-pass">Pass: {tests.filter((t) => t.last_status === 'pass').length}</span>
        <span data-testid="stat-fail">Fail: {tests.filter((t) => t.last_status === 'fail').length}</span>
        <span data-testid="stat-user">User-added: {userCount}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4" data-testid="regression-list">
        {tests.map((t) => (
          <div key={t.id} className="flex items-center gap-2 border-b border-border py-1.5 text-xs" data-testid="regression-row">
            <span className="font-mono tabular-nums text-muted-foreground">{t.id}</span>
            <span className="flex-1 truncate">{t.title}</span>
            <span className="text-2xs text-muted-foreground">{t.category}</span>
            <span className="text-2xs">{t.source}</span>
            <button onClick={() => onGenerate(t)} aria-label="Generate" data-testid="row-generate"><Wand2 className="h-3.5 w-3.5" /></button>
            <button aria-label="Run" data-testid="row-run" onClick={() => regressionApi.run([t.id])}><Play className="h-3.5 w-3.5" /></button>
            <button aria-label="Delete" onClick={async () => { await regressionApi.remove(t.id); await refresh() }}><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>

      {preview && (
        <div className="border-t border-border p-3" data-testid="generate-preview">
          <pre className="max-h-40 overflow-auto rounded bg-muted p-2 text-2xs">{preview.code}</pre>
          <Button size="sm" className="mt-2" data-testid="apply-generated"
            onClick={async () => { await regressionApi.applyGenerated(preview.id, preview.code); setPreview(null); await refresh() }}>
            Apply
          </Button>
        </div>
      )}

      <AddTestDialog open={addOpen} onOpenChange={setAddOpen} onSave={onSave} />
    </div>
  )
}
```

- [ ] **Step 3: Wire `ModuleView`** — Modify `gantt/src/components/shell/app-shell.tsx`: add import after line 8 and a case in `ModuleView` (after the `rule` case, line 21):

```typescript
import { RegressionView } from '@/components/regression/regression-view'
```
```typescript
  if (module === 'regression') return <RegressionView />
```

- [ ] **Step 4: Add sidebar nav entry** — Modify `gantt/src/components/shell/shell-sidebar.tsx`: add a nav item that calls `useShellStore.getState().setModule('regression')` with a `FlaskConical` icon and label "Regression", `data-testid="nav-regression"`. Match the existing nav-item markup pattern in that file (open it and mirror an existing entry exactly).

- [ ] **Step 5: Type-check + build**

Run: `cd gantt && npx tsc --noEmit && npx vite build`
Expected: PASS (no new errors)

- [ ] **Step 6: Commit**

```bash
git add gantt/src/components/regression gantt/src/components/shell/app-shell.tsx gantt/src/components/shell/shell-sidebar.tsx
git commit -m "feat(gantt): regression module view, add-test dialog, generate preview"
```

---

### Task 4.3: E2E test for regression page (mandatory)

**Files:**
- Create: `e2e/gantt/regression-page.spec.ts`

> Backend `/fpqe/ai/regression/*` is stubbed via `page.route` so the test is deterministic (asserts UI flow + generated-code preview), per §No-Illusion. Reuse the gantt auth helper as in Task 2.4.

- [ ] **Step 1: Write the test** — Create `e2e/gantt/regression-page.spec.ts`

```typescript
import { test, expect } from '@playwright/test'
// import { gotoGantt } from './helpers'  // reuse existing helper as in ai-chat.spec.ts

test('create a test case then generate playwright code', async ({ page }) => {
  const created: any[] = []
  await page.route('**/fpqe/ai/regression/tests', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      const t = { id: 1001, source: 'User', last_status: null, run_count: 0, pass_count: 0, fail_count: 0, flakiness_score: 0, spec_file: 'manual', test_name: '', last_duration_ms: null, ...body }
      created.push(t)
      await route.fulfill({ json: t })
    } else {
      await route.fulfill({ json: { tests: created } })
    }
  })
  await page.route('**/fpqe/ai/regression/generate-playwright', async (route) => {
    await route.fulfill({ json: { code: "test('filters BKK', async ({ page }) => { await loginAndSeed(page); });" } })
  })

  // TODO at implementation: navigate + authenticate (reuse helper), then open the regression module:
  await page.getByTestId('nav-regression').click()

  await page.getByTestId('add-test-open').click()
  await page.getByTestId('add-test-title').fill('Filtering to BKK shows a base chip')
  await page.getByTestId('add-test-save').click()

  // Row appears with source User; stats updated.
  await expect(page.getByTestId('regression-row')).toContainText('Filtering to BKK shows a base chip')
  await expect(page.getByTestId('stat-user')).toContainText('User-added: 1')

  // Generate -> preview shows the returned code.
  await page.getByTestId('row-generate').click()
  await expect(page.getByTestId('generate-preview')).toContainText("test('filters BKK'")
})
```

- [ ] **Step 2: Wire the auth/navigation helper** (same as Task 2.4 Step 2).

- [ ] **Step 3: Run the test**

Run: `npx playwright test e2e/gantt/regression-page.spec.ts --reporter=list`
Expected: PASS. Paste the PASS/FAIL summary (§No-Illusion).

- [ ] **Step 4: Bump versions** — Modify `gantt/src/version.ts` (continue from Task 2.4 values):

```typescript
export const BACKEND_VERSION = 38
export const FRONTEND_VERSION = 45
```

- [ ] **Step 5: Commit**

```bash
git add e2e/gantt/regression-page.spec.ts gantt/src/version.ts
git commit -m "test(gantt): e2e regression page create+generate; bump versions B38/F45"
```

---

# PHASE 5 — Docs + integration

### Task 5.1: Register ai-server in project docs + start script

**Files:**
- Modify: root `CLAUDE.md` (project structure table), create `ai-server/CLAUDE.md`, modify `ai-server/.env.example` only if new vars surfaced.

- [ ] **Step 1: Add `ai-server` row to root `CLAUDE.md`** project-structure code block, after `connector-server`:

```
├── ai-server/       # AI服务 (FastAPI + Python, 端口3005；AI聊天工具调用 + 回归测试生成/运行)
```

- [ ] **Step 2: Create `ai-server/CLAUDE.md`** documenting: provider auto-detect env vars, `/ai/chat` + `/ai/regression/*` routes, that `regression_tests.json` and `.env` are gitignored, nginx route `/fpqe/ai`, and "copy EVACC `.env` keys to run".

- [ ] **Step 3: Document the nginx route requirement**

Add a note in `ai-server/CLAUDE.md`: nginx must proxy `/fpqe/ai/` → `http://localhost:3005/ai/` for the gantt frontend to reach it (mirrors `/fpqe/live`, `/fpqe/rule`, `/fpqe/engine`). Update the actual nginx conf out-of-band (deployment task, not code).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md ai-server/CLAUDE.md
git commit -m "docs(ai-server): register service in project structure + module guide"
```

---

### Task 5.2: Final full verification

- [ ] **Step 1: Backend suite green**

Run: `cd ai-server && python -m pytest -v`
Expected: PASS (all). Paste summary.

- [ ] **Step 2: Gantt unit tests + typecheck + build**

Run: `cd gantt && npx vitest run && npx tsc --noEmit && npx vite build`
Expected: PASS (no new failures vs. pre-existing baseline in project memory).

- [ ] **Step 3: E2E (both new specs)**

Run (ai-server on :3005 + gantt dev server up): `npx playwright test e2e/gantt/ai-chat.spec.ts e2e/gantt/regression-page.spec.ts --reporter=list`
Expected: PASS. Paste the final PASS/FAIL summary (§No-Illusion).

- [ ] **Step 4: Confirm versions bumped** — `gantt/src/version.ts` shows `BACKEND_VERSION = 38`, `FRONTEND_VERSION = 45`.

---

## Self-Review notes (addressed)

- **Spec coverage:** ai-server foundation (Spec A §3.1) → Task 0.x; chat tools + endpoint (Spec A §3.2–3.3) → Task 1.x; chat frontend + dispatch (Spec A §3.4) → Task 2.x; chat tests (Spec A §5) → Task 2.4 + 1.x; regression storage (Spec B §5) → Task 3.1; generate/apply/run + prompt (Spec B §4) → Task 3.2; regression frontend module (Spec B §3) → Task 4.x; regression tests (Spec B §7) → Task 4.3 + 3.x; versioning (both §6/§8) → Tasks 2.4, 4.3; docs/CLAUDE.md registration → Task 5.1.
- **Type consistency:** `AiAction` union identical in backend mapping (Task 1.1) and frontend types (Task 2.1); `setSort(paneId, field, direction)` and `setCrewFilter/setPairingFilter/setFlightFilter` match the real store signatures verified in filter-store.ts / roster-store.ts; `RegressionStore` method names (`create_test`, `record_run`, `append_version`) consistent across Tasks 3.1–3.2.
- **Known v1 simplification (documented, not a gap):** `POST /ai/regression/runs` executes synchronously and returns terminal status; the frontend polls once. Background/streaming runs are an explicit non-goal (Spec B §9).
- **Implementation-time confirmations flagged inline:** exact `PaneId` union for `sort_roster` cast (Task 2.2); exact gantt e2e auth-helper import (Tasks 2.4/4.3); exact sidebar nav-item markup (Task 4.2 Step 4).
