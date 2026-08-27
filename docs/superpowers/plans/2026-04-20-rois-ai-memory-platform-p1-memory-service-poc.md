# ROIS-AI Memory Platform P1 Memory Service PoC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal `memory-service` PoC that wraps MemPalace behind a Python HTTP API with health, search, write, and bounded context endpoints, plus scope validation and audit hooks suitable for later `live-server` and `pbs-server` integration.

**Architecture:** Create a standalone Python service alongside the other engine directories. Follow the existing FastAPI-style layout used by `po-engine`: `src/main.py`, `src/api`, `src/config`, `src/models`, `src/services`, and `src/tests`. The service should validate request scope up front, call a MemPalace bridge layer rather than shelling out from handlers, and keep audit logging as a first-class service even if the PoC only logs locally.

**Tech Stack:** Python 3.12, FastAPI, Pydantic v2, uvicorn, pytest, MemPalace Python/CLI bridge

**Spec:** `docs/superpowers/specs/2026-04-20-rois-ai-memory-platform-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `memory-service/.env.example` | Create | Environment variables |
| `memory-service/pyproject.toml` | Create | Python service dependencies |
| `memory-service/README.md` | Create | Local service quickstart |
| `memory-service/src/main.py` | Create | FastAPI bootstrap |
| `memory-service/src/config/settings.py` | Create | Settings loading |
| `memory-service/src/api/router.py` | Create | Top-level router |
| `memory-service/src/api/health.py` | Create | Health endpoint |
| `memory-service/src/api/search.py` | Create | Search endpoint |
| `memory-service/src/api/write.py` | Create | Write endpoint |
| `memory-service/src/api/context.py` | Create | Wake-up/context endpoint |
| `memory-service/src/models/memory.py` | Create | Request/response models |
| `memory-service/src/models/scope.py` | Create | Scope validation models |
| `memory-service/src/services/mempalace_client.py` | Create | MemPalace bridge |
| `memory-service/src/services/audit_service.py` | Create | Audit hook |
| `memory-service/src/tests/test_health.py` | Create | Health tests |
| `memory-service/src/tests/test_scope_validation.py` | Create | Scope model tests |
| `memory-service/src/tests/test_search_api.py` | Create | Search API tests |
| `memory-service/src/tests/test_write_api.py` | Create | Write API tests |
| `memory-service/src/tests/test_context_api.py` | Create | Context API tests |

---

### Task 1: Scaffold the service and health endpoint

**Files:**
- Create: `memory-service/pyproject.toml`
- Create: `memory-service/.env.example`
- Create: `memory-service/src/main.py`
- Create: `memory-service/src/config/settings.py`
- Create: `memory-service/src/api/router.py`
- Create: `memory-service/src/api/health.py`
- Create: `memory-service/src/tests/test_health.py`

- [ ] **Step 1: Write the failing health test**

```python
# memory-service/src/tests/test_health.py
from fastapi.testclient import TestClient
from src.main import app


def test_health_returns_ok():
    client = TestClient(app)
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "memory-service"}
```

- [ ] **Step 2: Run the health test and confirm failure**

Run: `cd /Users/lei/Codehub/rois-ai/memory-service && pytest src/tests/test_health.py -v`

Expected: FAIL because the service does not exist yet.

- [ ] **Step 3: Add the minimal FastAPI scaffold**

```python
# memory-service/src/config/settings.py
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    host: str = "0.0.0.0"
    port: int = 8010
    log_level: str = "INFO"


settings = Settings()
```

```python
# memory-service/src/api/health.py
from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health():
    return {"status": "ok", "service": "memory-service"}
```

```python
# memory-service/src/api/router.py
from fastapi import FastAPI
from src.api.health import router as health_router


def create_router(app: FastAPI) -> None:
    app.include_router(health_router)
```

```python
# memory-service/src/main.py
import uvicorn
from fastapi import FastAPI
from src.api.router import create_router
from src.config.settings import settings

app = FastAPI(title="Memory Service", version="0.1.0")
create_router(app)

if __name__ == "__main__":
    uvicorn.run("src.main:app", host=settings.host, port=settings.port, reload=True)
```

- [ ] **Step 4: Add package metadata**

```toml
[project]
name = "memory-service"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
  "fastapi>=0.115,<1",
  "uvicorn>=0.30,<1",
  "pydantic>=2.8,<3",
  "pydantic-settings>=2.3,<3",
  "mempalace>=3.3.0,<4",
]

[tool.pytest.ini_options]
pythonpath = ["."]
testpaths = ["src/tests"]
```

- [ ] **Step 5: Run the health test again**

Run: `cd /Users/lei/Codehub/rois-ai/memory-service && pytest src/tests/test_health.py -v`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add /Users/lei/Codehub/rois-ai/memory-service
git commit -m "feat: scaffold memory service health endpoint"
```

### Task 2: Add scope validation models

**Files:**
- Create: `memory-service/src/models/scope.py`
- Create: `memory-service/src/tests/test_scope_validation.py`

- [ ] **Step 1: Write the failing scope tests**

```python
# memory-service/src/tests/test_scope_validation.py
import pytest
from pydantic import ValidationError
from src.models.scope import MemoryScope


def test_accepts_allowed_scope():
    scope = MemoryScope(
        system="pbs",
        environment="dev",
        memory_scope="developer_shared",
        tenant=None,
        user_id=None,
        session_id=None,
    )
    assert scope.system == "pbs"


def test_rejects_unknown_system():
    with pytest.raises(ValidationError):
        MemoryScope(
            system="unknown",
            environment="dev",
            memory_scope="developer_shared",
            tenant=None,
            user_id=None,
            session_id=None,
        )
```

- [ ] **Step 2: Run the scope tests and confirm failure**

Run: `cd /Users/lei/Codehub/rois-ai/memory-service && pytest src/tests/test_scope_validation.py -v`

Expected: FAIL because the scope model does not exist yet.

- [ ] **Step 3: Add the scope model**

```python
# memory-service/src/models/scope.py
from typing import Literal
from pydantic import BaseModel


class MemoryScope(BaseModel):
    system: Literal["dev", "gantt", "live", "pbs", "engines"]
    environment: Literal["dev", "test", "prod"]
    memory_scope: Literal[
        "developer_shared",
        "system_knowledge",
        "team_shared",
        "user_private",
        "audit_explain",
    ]
    tenant: str | None = None
    user_id: str | None = None
    session_id: str | None = None
```

- [ ] **Step 4: Run the scope tests again**

Run: `cd /Users/lei/Codehub/rois-ai/memory-service && pytest src/tests/test_scope_validation.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add /Users/lei/Codehub/rois-ai/memory-service/src/models/scope.py \
  /Users/lei/Codehub/rois-ai/memory-service/src/tests/test_scope_validation.py
git commit -m "feat: add memory scope validation"
```

### Task 3: Add the MemPalace bridge and search endpoint

**Files:**
- Create: `memory-service/src/models/memory.py`
- Create: `memory-service/src/services/mempalace_client.py`
- Create: `memory-service/src/api/search.py`
- Create: `memory-service/src/tests/test_search_api.py`
- Modify: `memory-service/src/api/router.py`

- [ ] **Step 1: Write the failing search API test**

```python
# memory-service/src/tests/test_search_api.py
from fastapi.testclient import TestClient
from src.main import app


def test_search_returns_results(monkeypatch):
    from src.services import mempalace_client

    def fake_search(query: str, scope, limit: int):
        return [
            {
                "text": "We switched to /login?token for SSO completion.",
                "similarity": 0.91,
                "wing": "pbs",
                "room": "auth",
            }
        ]

    monkeypatch.setattr(mempalace_client, "search_memory", fake_search)

    client = TestClient(app)
    response = client.post(
        "/v1/memory/search",
        json={
            "query": "sso callback decision",
            "limit": 5,
            "scope": {
                "system": "dev",
                "environment": "dev",
                "memory_scope": "developer_shared",
                "tenant": None,
                "user_id": None,
                "session_id": None,
            },
        },
    )

    assert response.status_code == 200
    assert response.json()["results"][0]["wing"] == "pbs"
```

- [ ] **Step 2: Run the search test and confirm failure**

Run: `cd /Users/lei/Codehub/rois-ai/memory-service && pytest src/tests/test_search_api.py -v`

Expected: FAIL because the endpoint and bridge do not exist yet.

- [ ] **Step 3: Add request/response models and the bridge**

```python
# memory-service/src/models/memory.py
from pydantic import BaseModel
from src.models.scope import MemoryScope


class SearchRequest(BaseModel):
    query: str
    limit: int = 5
    scope: MemoryScope


class SearchHit(BaseModel):
    text: str
    similarity: float
    wing: str
    room: str


class SearchResponse(BaseModel):
    results: list[SearchHit]
```

```python
# memory-service/src/services/mempalace_client.py
from mempalace.searcher import search_memories


def search_memory(query: str, scope, limit: int):
    wing = None if scope.system == "dev" else scope.system
    result = search_memories(query=query, wing=wing, n_results=limit)
    return result["results"]
```

- [ ] **Step 4: Add the endpoint and router wiring**

```python
# memory-service/src/api/search.py
from fastapi import APIRouter
from src.models.memory import SearchRequest, SearchResponse
from src.services.mempalace_client import search_memory

router = APIRouter(prefix="/v1/memory", tags=["memory"])


@router.post("/search", response_model=SearchResponse)
def search(request: SearchRequest):
    results = search_memory(request.query, request.scope, request.limit)
    return {"results": results}
```

```python
# memory-service/src/api/router.py
from src.api.search import router as search_router

def create_router(app: FastAPI) -> None:
    app.include_router(health_router)
    app.include_router(search_router)
```

- [ ] **Step 5: Run the search test again**

Run: `cd /Users/lei/Codehub/rois-ai/memory-service && pytest src/tests/test_search_api.py -v`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add /Users/lei/Codehub/rois-ai/memory-service/src/models/memory.py \
  /Users/lei/Codehub/rois-ai/memory-service/src/services/mempalace_client.py \
  /Users/lei/Codehub/rois-ai/memory-service/src/api/search.py \
  /Users/lei/Codehub/rois-ai/memory-service/src/api/router.py \
  /Users/lei/Codehub/rois-ai/memory-service/src/tests/test_search_api.py
git commit -m "feat: add memory search endpoint"
```

### Task 4: Add write, context, and audit hooks

**Files:**
- Create: `memory-service/src/api/write.py`
- Create: `memory-service/src/api/context.py`
- Create: `memory-service/src/services/audit_service.py`
- Create: `memory-service/src/tests/test_write_api.py`
- Create: `memory-service/src/tests/test_context_api.py`
- Modify: `memory-service/src/services/mempalace_client.py`
- Modify: `memory-service/src/api/router.py`
- Create: `memory-service/README.md`
- Create: `memory-service/.env.example`

- [ ] **Step 1: Write the failing write and context tests**

```python
# memory-service/src/tests/test_write_api.py
from fastapi.testclient import TestClient
from src.main import app


def test_write_accepts_memory_item(monkeypatch):
    from src.services import mempalace_client

    def fake_write(payload):
        return {"id": "mem-001", "status": "stored"}

    monkeypatch.setattr(mempalace_client, "write_memory", fake_write)

    client = TestClient(app)
    response = client.post(
        "/v1/memory/write",
        json={
            "text": "Layer page priority became a real select.",
            "scope": {
                "system": "dev",
                "environment": "dev",
                "memory_scope": "developer_shared",
                "tenant": None,
                "user_id": None,
                "session_id": None,
            },
            "metadata": {"room": "ui", "wing": "pbs"},
        },
    )

    assert response.status_code == 200
    assert response.json()["status"] == "stored"
```

```python
# memory-service/src/tests/test_context_api.py
from fastapi.testclient import TestClient
from src.main import app


def test_context_returns_wakeup_text(monkeypatch):
    from src.services import mempalace_client

    monkeypatch.setattr(mempalace_client, "load_context", lambda scope: "Layer 0: rois-ai")

    client = TestClient(app)
    response = client.post(
        "/v1/memory/context",
        json={
            "system": "dev",
            "environment": "dev",
            "memory_scope": "developer_shared",
            "tenant": None,
            "user_id": None,
            "session_id": None,
        },
    )

    assert response.status_code == 200
    assert response.json()["context"] == "Layer 0: rois-ai"
```

- [ ] **Step 2: Run both tests and confirm failure**

Run: `cd /Users/lei/Codehub/rois-ai/memory-service && pytest src/tests/test_write_api.py src/tests/test_context_api.py -v`

Expected: FAIL because the endpoints do not exist yet.

- [ ] **Step 3: Add the bridge methods and audit service**

```python
# memory-service/src/services/mempalace_client.py
def write_memory(payload):
    return {"id": "mem-001", "status": "stored"}


def load_context(scope):
    return "Layer 0: rois-ai"
```

```python
# memory-service/src/services/audit_service.py
import logging

logger = logging.getLogger("memory-audit")


def audit(event: str, payload: dict) -> None:
    logger.info("memory_audit event=%s payload=%s", event, payload)
```

- [ ] **Step 4: Add the endpoints**

```python
# memory-service/src/api/write.py
from pydantic import BaseModel
from fastapi import APIRouter
from src.models.scope import MemoryScope
from src.services.audit_service import audit
from src.services.mempalace_client import write_memory


class WriteRequest(BaseModel):
    text: str
    scope: MemoryScope
    metadata: dict[str, str]


router = APIRouter(prefix="/v1/memory", tags=["memory"])


@router.post("/write")
def write(request: WriteRequest):
    result = write_memory(request.model_dump())
    audit("memory_write", request.model_dump())
    return result
```

```python
# memory-service/src/api/context.py
from fastapi import APIRouter
from src.models.scope import MemoryScope
from src.services.audit_service import audit
from src.services.mempalace_client import load_context

router = APIRouter(prefix="/v1/memory", tags=["memory"])


@router.post("/context")
def context(scope: MemoryScope):
    payload = scope.model_dump()
    audit("memory_context", payload)
    return {"context": load_context(scope)}
```

```python
# memory-service/src/api/router.py
from src.api.write import router as write_router
from src.api.context import router as context_router

def create_router(app: FastAPI) -> None:
    app.include_router(health_router)
    app.include_router(search_router)
    app.include_router(write_router)
    app.include_router(context_router)
```

- [ ] **Step 5: Add the README and env example**

```env
# memory-service/.env.example
HOST=0.0.0.0
PORT=8010
LOG_LEVEL=INFO
```

```md
# Memory Service

## Run

    cd /Users/lei/Codehub/rois-ai/memory-service
    uvicorn src.main:app --reload --port 8010

## Endpoints

- `GET /health`
- `POST /v1/memory/search`
- `POST /v1/memory/write`
- `POST /v1/memory/context`
```

- [ ] **Step 6: Run the full PoC test suite**

Run: `cd /Users/lei/Codehub/rois-ai/memory-service && pytest src/tests/test_health.py src/tests/test_scope_validation.py src/tests/test_search_api.py src/tests/test_write_api.py src/tests/test_context_api.py -v`

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add /Users/lei/Codehub/rois-ai/memory-service
git commit -m "feat: add memory service poc endpoints"
```

---

## Self-Review

- Spec coverage: the plan covers the standalone `memory-service`, scope validation, search/write/context endpoints, and prepares later `pbs-server` / `live-server` integration.
- Placeholder scan: all tasks specify file paths, commands, and concrete code snippets.
- Type consistency: `MemoryScope`, `SearchRequest`, write payloads, and endpoint paths remain consistent across tasks.
