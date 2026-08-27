# Rule Engine Python Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the TypeScript `rule-engine` (npm package + HTTP service) with a Python FastAPI service that embeds the `rois-rule-engine` library and the rule session/violation code currently in `engine-server`, leaving `engine-server` as a pure PO/RO scheduler.

**Architecture:** `rule-engine/` becomes a Python FastAPI service on port 3001 containing: (1) core rule calculation logic moved from `rois-rule-engine/`, (2) `RuleEngineService` + `ViolationWorker` + session routes moved from `engine-server/`, (3) new HTTP endpoints for pairing/roster checks used by `live-server` workers. `live-server` workers switch from `import('@rois/rule-engine')` to HTTP calls. `gantt` session API moves from `/fpqe/engine` to `/fpqe/rule`.

**Tech Stack:** Python 3.12, FastAPI, asyncpg, redis-py (async), httpx, pydantic-settings; live-server workers (TypeScript/BullMQ) call new HTTP endpoints instead of importing npm package.

---

## File Map

### Deleted
- `rois-rule-engine/` — entire directory (merged into rule-engine)
- `rule-engine/src/` (TypeScript), `rule-engine/package.json`, `rule-engine/package-lock.json`, `rule-engine/tsconfig.json`, `rule-engine/node_modules/`
- `engine-server/src/api/rule_session_routes.py`
- `engine-server/src/services/rule_engine_service.py`
- `engine-server/src/workers/violation_worker.py`

### Created (rule-engine Python service)
- `rule-engine/main.py` — FastAPI app + lifespan (init RuleEngineService + ViolationWorker)
- `rule-engine/pyproject.toml` — package metadata
- `rule-engine/requirements.txt` — runtime deps
- `rule-engine/.env.example`
- `rule-engine/src/__init__.py`
- `rule-engine/src/core/` — copied verbatim from `rois-rule-engine/rois_rule_engine/` (calculators, checkers, checkers_roster, engine, types, utils, `__init__.py`)
- `rule-engine/src/services/__init__.py`
- `rule-engine/src/services/rule_engine_service.py` — from `engine-server` (update imports)
- `rule-engine/src/workers/__init__.py`
- `rule-engine/src/workers/violation_worker.py` — from `engine-server` (update imports)
- `rule-engine/src/api/__init__.py`
- `rule-engine/src/api/check_routes.py` — `POST /check/pairing`, `POST /check/roster`
- `rule-engine/src/api/session_routes.py` — from `engine-server/src/api/rule_session_routes.py` (update imports)
- `rule-engine/src/api/admin_routes.py` — `POST /admin/cache/invalidate`
- `rule-engine/src/config/__init__.py`
- `rule-engine/src/config/settings.py` — pydantic-settings
- `rule-engine/tests/__init__.py`
- `rule-engine/tests/conftest.py`
- `rule-engine/tests/test_check_routes.py`
- `rule-engine/tests/test_session_routes.py`

### Created (live-server)
- `live-server/src/services/rule-engine-client.ts` — typed HTTP client wrapping all Python rule-engine calls

### Modified
- `live-server/src/workers/check-pairing-worker.ts` — replace engine import with HTTP call
- `live-server/src/workers/check-roster-worker.ts` — replace engine import with HTTP call
- `live-server/src/workers/batch-crew-worker.ts` — replace engine import with HTTP calls
- `live-server/src/workers/violations-init-worker.ts` — replace engine import with HTTP calls
- `live-server/src/index.ts` — remove `RuleLoader` instantiation + `ruleLoader` params
- `live-server/src/types/rule-engine.ts` — (new) local type definitions replacing `@rois/rule-engine` types
- `live-server/src/services/rule-check/rule-check-data-service.ts` — replace `@rois/rule-engine` type imports
- `live-server/src/services/rule-check/rule-check-result-service.ts` — replace `@rois/rule-engine` type imports
- `live-server/package.json` — remove `@rois/rule-engine` workspace dep
- `gantt/src/services/rule-session-api.ts` — change `ENGINE_API_BASE` → `RULE_API_BASE`
- `engine-server/main.py` — remove rule session router + RuleEngineService/ViolationWorker lifespan
- `engine-server/requirements.txt` — remove asyncpg (used only by rule code)
- `CLAUDE.md` — update module descriptions

---

## Task 1: rule-engine Python service skeleton

**Files:**
- Create: `rule-engine/pyproject.toml`
- Create: `rule-engine/requirements.txt`
- Create: `rule-engine/.env.example`
- Create: `rule-engine/src/__init__.py`
- Create: `rule-engine/src/config/settings.py`
- Create: `rule-engine/main.py`
- Create: `rule-engine/tests/conftest.py`
- Create: `rule-engine/tests/test_health.py`

- [ ] **Step 1: Write the failing test**

```python
# rule-engine/tests/test_health.py
from fastapi.testclient import TestClient

def test_health(client: TestClient):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "healthy"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd rule-engine
python -m pytest tests/test_health.py -v
# Expected: ModuleNotFoundError (main.py doesn't exist yet)
```

- [ ] **Step 3: Create pyproject.toml**

```toml
# rule-engine/pyproject.toml
[build-system]
requires = ["setuptools>=70", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "rule-engine-service"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.30",
    "pydantic>=2.0",
    "pydantic-settings>=2.0",
    "asyncpg>=0.29",
    "redis[hiredis]>=5.0",
    "httpx>=0.27",
]

[tool.setuptools.packages.find]
where = ["."]
include = ["src*"]
```

- [ ] **Step 4: Create requirements.txt**

```
fastapi>=0.115,<1.0
uvicorn[standard]>=0.30,<1.0
pydantic>=2.0,<3.0
pydantic-settings>=2.0,<3.0
asyncpg>=0.29,<1.0
redis[hiredis]>=5.0,<6.0
httpx>=0.27,<1.0
```

- [ ] **Step 5: Create .env.example**

```bash
# rule-engine/.env.example
DB_DSN=postgresql://f8:Pier2026AIf8@localhost:5432/rois?options=-c%20search_path%3Df8
REDIS_URL=redis://localhost:6379/0
LIVE_SERVER_URL=http://localhost:3000
AIRLINE=f8
PORT=3001
LOG_LEVEL=INFO
```

- [ ] **Step 6: Create config/settings.py**

```python
# rule-engine/src/config/settings.py
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    db_dsn: str = 'postgresql://f8:Pier2026AIf8@localhost:5432/rois?options=-c%20search_path%3Df8'
    redis_url: str = 'redis://localhost:6379/0'
    live_server_url: str = 'http://localhost:3000'
    airline: str = 'f8'
    port: int = 3001
    log_level: str = 'INFO'


settings = Settings()
```

- [ ] **Step 7: Create src/__init__.py**

```python
# rule-engine/src/__init__.py
```

- [ ] **Step 8: Create main.py skeleton**

```python
# rule-engine/main.py
import logging
import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI
from src.config.settings import settings

logging.basicConfig(level=settings.log_level.upper())
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Rule Engine Service starting on port %d", settings.port)
    yield
    logger.info("Rule Engine Service shutting down")


app = FastAPI(title="Rule Engine Service", version="0.1.0", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=settings.port, reload=False)
```

- [ ] **Step 9: Create tests/conftest.py**

```python
# rule-engine/tests/conftest.py
import pytest
from fastapi.testclient import TestClient
from main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)
```

- [ ] **Step 10: Install dependencies in the .venv-rule-engine and run test**

```bash
cd /home/yuan.z/rois/rois-ai
# .venv-rule-engine already exists
source .venv-rule-engine/bin/activate
cd rule-engine
pip install -r requirements.txt
pip install pytest httpx
python -m pytest tests/test_health.py -v
# Expected: PASS (1 passed)
```

- [ ] **Step 11: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add rule-engine/main.py rule-engine/pyproject.toml rule-engine/requirements.txt \
        rule-engine/.env.example rule-engine/src/ rule-engine/tests/
git commit -m "feat(rule-engine): Python FastAPI service skeleton — health endpoint"
```

---

## Task 2: Copy core rule logic from rois-rule-engine

**Files:**
- Create: `rule-engine/src/core/` (entire directory, copied from `rois-rule-engine/rois_rule_engine/`)
- Create: `rule-engine/src/core/__init__.py` (re-export convenience)

- [ ] **Step 1: Copy the core package**

```bash
cd /home/yuan.z/rois/rois-ai
cp -r rois-rule-engine/rois_rule_engine/. rule-engine/src/core/
```

- [ ] **Step 2: Update rule-engine/src/core/__init__.py to re-export key symbols**

Replace the contents of `rule-engine/src/core/__init__.py` with:

```python
# rule-engine/src/core/__init__.py
from .types import (
    FlightSegment, DutyPeriod, PairingInput, CrewInfo,
    CheckInput, RosterInput, RosterDeltaInput,
    CalcResult, CheckResult, EngineResult, RosterEngineResult,
    ResolvedRule, RuleGroup,
)
from .engine import RuleEngine, RosterEngine, ExecutionContext, RosterContext
from .engine.loader import RuleLoader

__all__ = [
    "FlightSegment", "DutyPeriod", "PairingInput", "CrewInfo",
    "CheckInput", "RosterInput", "RosterDeltaInput",
    "CalcResult", "CheckResult", "EngineResult", "RosterEngineResult",
    "ResolvedRule", "RuleGroup",
    "RuleEngine", "RosterEngine", "ExecutionContext", "RosterContext",
    "RuleLoader",
]
```

- [ ] **Step 3: Smoke-test the core import**

```bash
cd /home/yuan.z/rois/rois-ai/rule-engine
source ../.venv-rule-engine/bin/activate
python -c "from src.core import RuleEngine, RosterEngine, RuleLoader; print('OK')"
# Expected: OK
```

- [ ] **Step 4: Run the existing rois-rule-engine unit tests against the copied code**

```bash
cd /home/yuan.z/rois/rois-ai/rule-engine
# Create a quick smoke test
python -c "
from src.core import RuleEngine, CheckInput, PairingInput, DutyPeriod, FlightSegment
from datetime import datetime, timezone

seg = FlightSegment(
    flt_no='F81234', dep_port='PEK', arr_port='SHA',
    std_utc=datetime(2025,1,10,2,0, tzinfo=timezone.utc),
    sta_utc=datetime(2025,1,10,4,30, tzinfo=timezone.utc),
    block_minutes=150, is_night=False,
)
duty = DutyPeriod(
    duty_seq=1,
    report_utc=datetime(2025,1,10,1,0, tzinfo=timezone.utc),
    release_utc=datetime(2025,1,10,5,30, tzinfo=timezone.utc),
    segments=[seg],
)
pairing = PairingInput(pairing_id=1, crew_base='PEK', duties=[duty])
inp = CheckInput(rule_group_code='test', pairing=pairing)
engine = RuleEngine()
result = engine.check_with_rules(inp, [])
assert result.passed_all is True
print('Core engine OK')
"
# Expected: Core engine OK
```

- [ ] **Step 5: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add rule-engine/src/core/
git commit -m "feat(rule-engine): copy core rule engine logic from rois-rule-engine"
```

---

## Task 3: Add pairing/roster check HTTP endpoints

These replace `RuleEngine.checkWithRules()` and `RosterEngine.checkWithRules()` for live-server workers.

**Files:**
- Create: `rule-engine/src/api/__init__.py`
- Create: `rule-engine/src/api/check_routes.py`
- Modify: `rule-engine/main.py`
- Create: `rule-engine/tests/test_check_routes.py`

- [ ] **Step 1: Write failing tests**

```python
# rule-engine/tests/test_check_routes.py
import pytest
from fastapi.testclient import TestClient


PAIRING_PAYLOAD = {
    "groupCode": "test",
    "pairing": {
        "pairingId": 1,
        "crewBase": "PEK",
        "duties": [{
            "dutySeq": 1,
            "reportUtc": "2025-01-10T01:00:00Z",
            "releaseUtc": "2025-01-10T05:30:00Z",
            "segments": [{
                "fltNo": "F81234",
                "depPort": "PEK",
                "arrPort": "SHA",
                "stdUtc": "2025-01-10T02:00:00Z",
                "staUtc": "2025-01-10T04:30:00Z",
                "blockMinutes": 150,
                "isNight": False,
            }],
            "restAfterMinutes": 720,
        }],
    },
    "crew": {
        "crewId": "C001",
        "division": "P",
        "rank": "CA",
        "fleetQuals": ["B738"],
        "airportQuals": [],
        "recentFlightHours": {
            "last24h": 0, "last7d": 300, "last28d": 1200,
            "last90d": 3600, "last365d": 14400,
        },
    },
}


def test_check_pairing_returns_result(client: TestClient):
    resp = client.post("/check/pairing", json=PAIRING_PAYLOAD)
    assert resp.status_code == 200
    data = resp.json()
    assert data["pairingId"] == 1
    assert "passedAll" in data
    assert "checkResults" in data
    assert "calcResults" in data


def test_check_pairing_empty_rules_passes(client: TestClient):
    # With no rules loaded (groupCode='test' → no DB rows), should pass trivially
    resp = client.post("/check/pairing", json=PAIRING_PAYLOAD)
    assert resp.status_code == 200
    assert resp.json()["passedAll"] is True


def test_check_roster_returns_pairing_and_roster_results(client: TestClient):
    payload = {
        "groupCode": "test",
        "crew": PAIRING_PAYLOAD["crew"],
        "pairings": [PAIRING_PAYLOAD["pairing"]],
        "periodStart": "2025-01-01T00:00:00Z",
        "periodEnd": "2025-01-31T23:59:59Z",
    }
    resp = client.post("/check/roster", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "passedAll" in data
    assert "rosterViolations" in data
    assert "pairingResults" in data
    assert "1" in data["pairingResults"]  # pairingId as string key
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd rule-engine
source ../.venv-rule-engine/bin/activate
python -m pytest tests/test_check_routes.py -v
# Expected: ImportError / 404 (routes not registered yet)
```

- [ ] **Step 3: Create src/api/__init__.py**

```python
# rule-engine/src/api/__init__.py
```

- [ ] **Step 4: Create src/api/check_routes.py**

```python
# rule-engine/src/api/check_routes.py
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from src.core import (
    RuleEngine, RosterEngine, RuleLoader,
    CheckInput, PairingInput, DutyPeriod, FlightSegment, CrewInfo,
    RosterInput, EngineResult, RosterEngineResult, CalcResult, CheckResult,
    ResolvedRule,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=['check'])

# Module-level rule loader (set from main.py lifespan)
_rule_loader: RuleLoader | None = None


def set_rule_loader(loader: RuleLoader) -> None:
    global _rule_loader
    _rule_loader = loader


async def _load_rules(group_code: str) -> list[ResolvedRule]:
    if _rule_loader is None:
        return []
    return await _rule_loader.load_rules(group_code)


# ── Pydantic models (camelCase, matching TypeScript convention) ────────────


class SegmentPayload(BaseModel):
    fltNo: str
    depPort: str
    arrPort: str
    stdUtc: str
    staUtc: str
    blockMinutes: int
    isNight: bool
    fleetCode: str | None = None


class DutyPayload(BaseModel):
    dutySeq: int
    reportUtc: str
    releaseUtc: str
    segments: list[SegmentPayload]
    restAfterMinutes: int | None = None
    reportLocal: str | None = None
    baseUtcOffset: int | None = None


class PairingPayload(BaseModel):
    pairingId: int
    crewBase: str = ''
    duties: list[DutyPayload]


class CrewPayload(BaseModel):
    crewId: str
    division: str
    rank: str
    fleetQuals: list[str] = []
    airportQuals: list[str] = []
    recentFlightHours: dict[str, float] = {}
    recentLandings90d: int | None = None
    totalHours: int | None = None


class PairingCheckRequest(BaseModel):
    groupCode: str
    pairing: PairingPayload
    crew: CrewPayload | None = None


class RosterCheckRequest(BaseModel):
    groupCode: str
    crew: CrewPayload
    pairings: list[PairingPayload]
    periodStart: str
    periodEnd: str
    # Optional per-pairing crew overrides (only recentFlightHours differs per pairing)
    pairingCrew: dict[str, CrewPayload] | None = None


class CalcResultOut(BaseModel):
    ruleCode: str
    ruleName: str
    value: float
    unit: str


class CheckResultOut(BaseModel):
    ruleCode: str
    ruleName: str
    passed: bool
    severity: int
    actualValue: float
    limitValue: float
    unit: str
    message: str


class PairingCheckResponse(BaseModel):
    pairingId: int
    passedAll: bool
    highestSeverity: int
    checkResults: list[CheckResultOut]
    calcResults: list[CalcResultOut]


class PairingResultOut(BaseModel):
    passedAll: bool
    highestSeverity: int
    checkResults: list[CheckResultOut]
    calcResults: list[CalcResultOut]


class RosterCheckResponse(BaseModel):
    passedAll: bool
    highestSeverity: int
    rosterViolations: list[CheckResultOut]
    pairingResults: dict[str, PairingResultOut]  # key = str(pairingId)


# ── Helpers ───────────────────────────────────────────────────────────────


def _parse_dt(s: str) -> datetime:
    return datetime.fromisoformat(s.replace('Z', '+00:00'))


def _to_pairing(p: PairingPayload) -> PairingInput:
    duties = []
    for d in p.duties:
        segs = [
            FlightSegment(
                flt_no=s.fltNo, dep_port=s.depPort, arr_port=s.arrPort,
                std_utc=_parse_dt(s.stdUtc), sta_utc=_parse_dt(s.staUtc),
                block_minutes=s.blockMinutes, is_night=s.isNight, fleet_code=s.fleetCode,
            )
            for s in d.segments
        ]
        duties.append(DutyPeriod(
            duty_seq=d.dutySeq,
            report_utc=_parse_dt(d.reportUtc),
            release_utc=_parse_dt(d.releaseUtc),
            segments=segs,
            rest_after_minutes=d.restAfterMinutes,
            report_local=d.reportLocal,
            base_utc_offset=d.baseUtcOffset,
        ))
    return PairingInput(pairing_id=p.pairingId, crew_base=p.crewBase, duties=duties)


def _to_crew(c: CrewPayload) -> CrewInfo:
    rh = c.recentFlightHours
    return CrewInfo(
        crew_id=c.crewId, division=c.division, rank=c.rank,
        fleet_quals=c.fleetQuals, airport_quals=c.airportQuals,
        recent_flight_hours={
            'last24h': rh.get('last24h', 0),
            'last7d': rh.get('last7d', 0),
            'last28d': rh.get('last28d', 0),
            'last90d': rh.get('last90d', 0),
            'last365d': rh.get('last365d', 0),
        },
        recent_landings_90d=c.recentLandings90d,
        total_hours=c.totalHours,
    )


def _result_out(r: EngineResult) -> tuple[list[CheckResultOut], list[CalcResultOut]]:
    checks = [
        CheckResultOut(
            ruleCode=c.rule_code, ruleName=c.rule_name,
            passed=c.passed, severity=c.severity,
            actualValue=c.actual_value, limitValue=c.limit_value,
            unit=c.unit, message=c.message,
        )
        for c in r.check_results
    ]
    calcs = [
        CalcResultOut(ruleCode=c.rule_code, ruleName=c.rule_name, value=c.value, unit=c.unit)
        for c in r.calc_results
    ]
    return checks, calcs


# ── Endpoints ─────────────────────────────────────────────────────────────


@router.post('/check/pairing', response_model=PairingCheckResponse)
async def check_pairing(req: PairingCheckRequest) -> PairingCheckResponse:
    rules = await _load_rules(req.groupCode)
    pairing = _to_pairing(req.pairing)
    crew = _to_crew(req.crew) if req.crew else None
    check_input = CheckInput(rule_group_code=req.groupCode, pairing=pairing, crew=crew)
    result = RuleEngine().check_with_rules(check_input, rules)
    checks, calcs = _result_out(result)
    return PairingCheckResponse(
        pairingId=req.pairing.pairingId,
        passedAll=result.passed_all,
        highestSeverity=result.highest_severity,
        checkResults=checks,
        calcResults=calcs,
    )


@router.post('/check/roster', response_model=RosterCheckResponse)
async def check_roster(req: RosterCheckRequest) -> RosterCheckResponse:
    rules = await _load_rules(req.groupCode)
    engine = RosterEngine()
    base_crew = _to_crew(req.crew)

    pairings = [_to_pairing(p) for p in req.pairings]

    # Build per-pairing crew map from overrides
    pairing_crew: dict[int, CrewInfo] = {}
    if req.pairingCrew:
        for pid_str, crew_override in req.pairingCrew.items():
            pairing_crew[int(pid_str)] = _to_crew(crew_override)

    if pairing_crew:
        # Run pairing engine separately per pairing with per-pairing crew
        pairing_engine = RuleEngine()
        pairing_results_raw: dict[int, EngineResult] = {}
        for p in pairings:
            c = pairing_crew.get(p.pairing_id, base_crew)
            inp = CheckInput(rule_group_code=req.groupCode, pairing=p, crew=c)
            pairing_results_raw[p.pairing_id] = pairing_engine.check_with_rules(inp, rules)
        # Run roster engine for roster-level checks only
        roster_input = RosterInput(
            rule_group_code=req.groupCode, crew=base_crew, pairings=pairings,
            period_start=_parse_dt(req.periodStart), period_end=_parse_dt(req.periodEnd),
        )
        roster_result = engine.check_with_rules(roster_input, rules)
        # Override pairing results from per-pairing run
        roster_violations = roster_result.roster_violations
    else:
        roster_input = RosterInput(
            rule_group_code=req.groupCode, crew=base_crew, pairings=pairings,
            period_start=_parse_dt(req.periodStart), period_end=_parse_dt(req.periodEnd),
        )
        roster_result = engine.check_with_rules(roster_input, rules)
        pairing_results_raw = roster_result.pairing_results
        roster_violations = roster_result.roster_violations

    pairing_results_out: dict[str, PairingResultOut] = {}
    for pid, res in pairing_results_raw.items():
        checks, calcs = _result_out(res)
        pairing_results_out[str(pid)] = PairingResultOut(
            passedAll=res.passed_all, highestSeverity=res.highest_severity,
            checkResults=checks, calcResults=calcs,
        )

    roster_checks = [
        CheckResultOut(
            ruleCode=v.rule_code, ruleName=v.rule_name,
            passed=v.passed, severity=v.severity,
            actualValue=v.actual_value, limitValue=v.limit_value,
            unit=v.unit, message=v.message,
        )
        for v in roster_violations
    ]

    all_passed = all(r.passed_all for r in pairing_results_raw.values()) and all(v.passed for v in roster_violations)
    severity = max(
        (r.highest_severity for r in pairing_results_raw.values()),
        default=0,
    )
    severity = max(severity, max((v.severity for v in roster_violations if not v.passed), default=0))

    return RosterCheckResponse(
        passedAll=all_passed,
        highestSeverity=severity,
        rosterViolations=roster_checks,
        pairingResults=pairing_results_out,
    )
```

- [ ] **Step 5: Register routes in main.py**

```python
# rule-engine/main.py  — replace with:
import logging
import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI
from src.config.settings import settings
from src.api.check_routes import router as check_router, set_rule_loader
from src.core import RuleLoader

logging.basicConfig(level=settings.log_level.upper())
logger = logging.getLogger(__name__)

_rule_loader: RuleLoader | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _rule_loader
    logger.info("Rule Engine Service starting on port %d", settings.port)
    _rule_loader = RuleLoader(settings.db_dsn)
    set_rule_loader(_rule_loader)
    yield
    logger.info("Rule Engine Service shutting down")


app = FastAPI(title="Rule Engine Service", version="0.1.0", lifespan=lifespan)
app.include_router(check_router)


@app.get("/health")
async def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=settings.port, reload=False)
```

- [ ] **Step 6: Run tests**

```bash
cd rule-engine
source ../.venv-rule-engine/bin/activate
python -m pytest tests/test_check_routes.py tests/test_health.py -v
# Expected: 5 passed
```

- [ ] **Step 7: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add rule-engine/src/api/ rule-engine/tests/test_check_routes.py rule-engine/main.py
git commit -m "feat(rule-engine): add /check/pairing and /check/roster HTTP endpoints"
```

---

## Task 4: Add admin cache-invalidate endpoint

This replaces `RULE_ENGINE_URL/admin/cache/invalidate` that live-server calls when a rule group changes.

**Files:**
- Create: `rule-engine/src/api/admin_routes.py`
- Modify: `rule-engine/main.py`

- [ ] **Step 1: Write the failing test**

```python
# rule-engine/tests/test_admin_routes.py
def test_cache_invalidate(client):
    resp = client.post("/admin/cache/invalidate", json={"groupCode": "ccar121_gantt"})
    assert resp.status_code == 200
    assert resp.json()["invalidated"] is True
```

- [ ] **Step 2: Create src/api/admin_routes.py**

```python
# rule-engine/src/api/admin_routes.py
import logging
from fastapi import APIRouter
from pydantic import BaseModel
from src.api.check_routes import _rule_loader

logger = logging.getLogger(__name__)
router = APIRouter(tags=['admin'])


class InvalidateCacheRequest(BaseModel):
    groupCode: str


@router.post('/admin/cache/invalidate')
async def invalidate_cache(req: InvalidateCacheRequest) -> dict:
    if _rule_loader is not None:
        _rule_loader.invalidate(req.groupCode)
        logger.info("Cache invalidated for group %s", req.groupCode)
    return {"invalidated": True, "groupCode": req.groupCode}
```

- [ ] **Step 3: Register admin router in main.py**

Add to the import block and `app.include_router(admin_router)`:

```python
from src.api.admin_routes import router as admin_router
# ...
app.include_router(admin_router)
```

- [ ] **Step 4: Run tests**

```bash
cd rule-engine
source ../.venv-rule-engine/bin/activate
python -m pytest tests/ -v
# Expected: all passing
```

- [ ] **Step 5: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add rule-engine/src/api/admin_routes.py rule-engine/tests/test_admin_routes.py rule-engine/main.py
git commit -m "feat(rule-engine): add /admin/cache/invalidate endpoint"
```

---

## Task 5: Migrate RuleEngineService + session routes from engine-server

**Files:**
- Create: `rule-engine/src/services/__init__.py`
- Create: `rule-engine/src/services/rule_engine_service.py`
- Create: `rule-engine/src/api/session_routes.py`
- Create: `rule-engine/tests/test_session_routes.py`
- Modify: `rule-engine/main.py`

- [ ] **Step 1: Write failing test**

```python
# rule-engine/tests/test_session_routes.py

SESSION_CHECK_PAYLOAD = {
    "session_id": "s1",
    "user_id": "u1",
    "group_code": "test",
    "operation": "edit",
    "pairing": {
        "pairing_id": 1,
        "crew_base": "PEK",
        "duties": [{
            "duty_seq": 1,
            "report_utc": "2025-01-10T01:00:00Z",
            "release_utc": "2025-01-10T05:30:00Z",
            "segments": [{
                "fltNo": "F81234", "depPort": "PEK", "arrPort": "SHA",
                "stdUtc": "2025-01-10T02:00:00Z", "staUtc": "2025-01-10T04:30:00Z",
                "blockMinutes": 150, "isNight": False,
            }],
        }],
    },
    "crew": {
        "crew_id": "C001", "division": "P", "rank": "CA",
        "fleet_quals": [], "airport_quals": [],
        "recent_flight_hours": {},
    },
}


def test_check_session_returns_result(client):
    resp = client.post("/api/rules/check/session", json=SESSION_CHECK_PAYLOAD)
    assert resp.status_code == 200
    data = resp.json()
    assert data["session_id"] == "s1"
    assert "violations" in data
    assert "passed_all" in data


def test_session_discard(client):
    resp = client.post("/api/rules/session/discard", json={"session_id": "s1", "user_id": "u1"})
    assert resp.status_code == 200
    assert resp.json()["discarded"] is True


def test_session_commit(client):
    resp = client.post("/api/rules/session/commit", json={
        "session_id": "s1", "user_id": "u1", "event_id": 42
    })
    assert resp.status_code == 200
    assert resp.json()["committed"] is True
```

- [ ] **Step 2: Create src/services/__init__.py**

```python
# rule-engine/src/services/__init__.py
```

- [ ] **Step 3: Create src/services/rule_engine_service.py**

Copy from `engine-server/src/services/rule_engine_service.py` and update the import block:

```python
# rule-engine/src/services/rule_engine_service.py
# (full content — replace the sys.path injection block with a direct import)

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from src.core import RuleEngine, RuleLoader
from src.core.types import ResolvedRule, CheckInput, PairingInput, CrewInfo, EngineResult, CheckResult

logger = logging.getLogger(__name__)

PINNED_GROUPS = frozenset(['ccar121_gantt', 'ccar121_pbs'])
TTL_MINUTES = 30


@dataclass
class ActiveGroupState:
    clients: set[str] = field(default_factory=set)
    rules: list[ResolvedRule] = field(default_factory=list)
    pinned: bool = False
    ttl_task: asyncio.Task | None = None


@dataclass
class UserSession:
    user_id: str
    group_code: str
    roster_overlay: dict[int, PairingInput] = field(default_factory=dict)
    session_violations: dict[int, list[CheckResult]] = field(default_factory=dict)
    last_active: datetime = field(default_factory=datetime.now)
    ttl_minutes: int = 120


CrewRoster = dict[str, list[PairingInput]]


class RuleEngineService:
    def __init__(self, rule_loader: RuleLoader, db_pool: Any, redis_client: Any) -> None:
        self.rule_loader = rule_loader
        self.db_pool = db_pool
        self.redis = redis_client
        self.active_groups: dict[str, ActiveGroupState] = {}
        self.roster_snapshot: CrewRoster = {}
        self.user_sessions: dict[str, UserSession] = {}
        self._session_cleanup_task: asyncio.Task | None = None
        self._engine = RuleEngine()

    async def initialize(self) -> None:
        for group_code in PINNED_GROUPS:
            await self._load_group(group_code, pinned=True)
        self._session_cleanup_task = asyncio.create_task(self._session_cleanup_loop())
        logger.info("RuleEngineService initialized with pinned groups: %s", PINNED_GROUPS)

    async def shutdown(self) -> None:
        if self._session_cleanup_task:
            self._session_cleanup_task.cancel()
        for state in self.active_groups.values():
            if state.ttl_task:
                state.ttl_task.cancel()

    async def activate_group(self, group_code: str, client_id: str) -> None:
        if group_code not in self.active_groups:
            await self._load_group(group_code, pinned=False)
        state = self.active_groups[group_code]
        state.clients.add(client_id)
        if state.ttl_task:
            state.ttl_task.cancel()
            state.ttl_task = None

    async def deactivate_group(self, group_code: str, client_id: str) -> None:
        if group_code not in self.active_groups:
            return
        state = self.active_groups[group_code]
        state.clients.discard(client_id)
        if not state.clients and not state.pinned:
            state.ttl_task = asyncio.create_task(self._evict_after_ttl(group_code))

    async def change_group(self, from_code: str, to_code: str, client_id: str) -> None:
        await self.deactivate_group(from_code, client_id)
        await self.activate_group(to_code, client_id)

    def update_roster_snapshot(self, crew_id: str, pairings: list[PairingInput]) -> None:
        self.roster_snapshot[crew_id] = pairings

    def get_active_groups_with_clients(self) -> list[str]:
        return [gc for gc, state in self.active_groups.items() if state.clients]

    def get_or_create_session(self, user_id: str, group_code: str) -> UserSession:
        if user_id not in self.user_sessions:
            self.user_sessions[user_id] = UserSession(user_id=user_id, group_code=group_code)
        session = self.user_sessions[user_id]
        session.last_active = datetime.now()
        return session

    def check_session(
        self,
        user_id: str, group_code: str,
        pairing: PairingInput | None, crew: CrewInfo | None, operation: str,
    ) -> tuple[list[CheckResult], bool, int]:
        session = self.get_or_create_session(user_id, group_code)
        if operation == 'undo' and pairing is None:
            return [], True, 0
        if pairing is None:
            return [], True, 0
        session.roster_overlay[pairing.pairing_id] = pairing
        overlay_ids = set(session.roster_overlay.keys())
        effective = [
            p for p in self.roster_snapshot.get(crew.crew_id if crew else '', [])
            if p.pairing_id not in overlay_ids
        ] + list(session.roster_overlay.values())
        rules = self.active_groups.get(group_code, ActiveGroupState()).rules
        if not rules:
            return [], True, 0
        check_input = CheckInput(rule_group_code=group_code, pairing=pairing, crew=crew)
        result = self._engine.check_with_rules(check_input, rules)
        violations = [r for r in result.check_results if not r.passed]
        session.session_violations[pairing.pairing_id] = violations
        return violations, result.passed_all, result.highest_severity

    def commit_session(self, user_id: str) -> tuple[dict[int, list[CheckResult]], dict[int, PairingInput]]:
        session = self.user_sessions.get(user_id)
        if not session:
            return {}, {}
        violations = dict(session.session_violations)
        overlay = dict(session.roster_overlay)
        session.roster_overlay.clear()
        session.session_violations.clear()
        return violations, overlay

    def discard_session(self, user_id: str) -> None:
        session = self.user_sessions.get(user_id)
        if session:
            session.roster_overlay.clear()
            session.session_violations.clear()

    async def _load_group(self, group_code: str, *, pinned: bool) -> None:
        rules = await self.rule_loader.load_rules(group_code)
        self.active_groups[group_code] = ActiveGroupState(rules=rules, pinned=pinned)
        logger.info("Loaded group %s (%d rules, pinned=%s)", group_code, len(rules), pinned)

    async def _evict_after_ttl(self, group_code: str) -> None:
        await asyncio.sleep(TTL_MINUTES * 60)
        state = self.active_groups.get(group_code)
        if state and not state.clients and not state.pinned:
            del self.active_groups[group_code]
            self.rule_loader.invalidate(group_code)
            logger.info("Evicted inactive group %s after TTL", group_code)

    async def _session_cleanup_loop(self) -> None:
        while True:
            await asyncio.sleep(600)
            now = datetime.now()
            expired = [
                uid for uid, s in self.user_sessions.items()
                if (now - s.last_active) > timedelta(minutes=s.ttl_minutes)
            ]
            for uid in expired:
                del self.user_sessions[uid]
            if expired:
                logger.info("Cleaned up %d expired user sessions", len(expired))
```

- [ ] **Step 4: Create src/api/session_routes.py**

Copy from `engine-server/src/api/rule_session_routes.py` and update imports:

```python
# rule-engine/src/api/session_routes.py
"""
POST /api/rules/check/session  — real-time check during edit/undo/redo
POST /api/rules/session/commit — persist session violations after save
POST /api/rules/session/discard — abandon edit without persisting
"""
import logging
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.core.types import PairingInput, DutyPeriod, FlightSegment, CrewInfo
from src.services.rule_engine_service import RuleEngineService

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/api/rules', tags=['rule-session'])

_service_instance: RuleEngineService | None = None


def set_service_instance(service: RuleEngineService) -> None:
    global _service_instance
    _service_instance = service


def get_service() -> RuleEngineService:
    if _service_instance is None:
        raise HTTPException(status_code=503, detail='RuleEngineService not initialized')
    return _service_instance


class DutyPeriodPayload(BaseModel):
    duty_seq: int
    report_utc: str
    release_utc: str
    segments: list[dict]
    rest_after_minutes: int | None = None
    report_local: str | None = None
    base_utc_offset: int | None = None


class PairingPayload(BaseModel):
    pairing_id: int
    crew_base: str = ''
    duties: list[DutyPeriodPayload]


class CrewPayload(BaseModel):
    crew_id: str
    division: str
    rank: str
    fleet_quals: list[str] = []
    airport_quals: list[str] = []
    recent_flight_hours: dict[str, float] = {}
    recent_landings_90d: int | None = None
    total_hours: int | None = None


class SessionCheckRequest(BaseModel):
    session_id: str
    user_id: str
    group_code: str
    operation: str
    pairing: PairingPayload | None = None
    crew: CrewPayload | None = None


class ViolationResponse(BaseModel):
    rule_code: str
    rule_name: str
    passed: bool
    severity: int
    actual_value: float
    limit_value: float
    unit: str
    message: str


class SessionCheckResponse(BaseModel):
    session_id: str
    pairing_id: int | None
    violations: list[ViolationResponse]
    passed_all: bool
    highest_severity: int


class SessionCommitRequest(BaseModel):
    session_id: str
    user_id: str
    event_id: int


class SessionCommitResponse(BaseModel):
    session_id: str
    user_id: str
    committed: bool


class SessionDiscardRequest(BaseModel):
    session_id: str
    user_id: str


class SessionDiscardResponse(BaseModel):
    session_id: str
    user_id: str
    discarded: bool


def _parse_dt(s: str) -> datetime:
    return datetime.fromisoformat(s.replace('Z', '+00:00'))


def _parse_pairing(payload: PairingPayload) -> PairingInput:
    duties = []
    for d in payload.duties:
        segments = []
        for s in d.segments:
            flt_no = s.get('fltNo', s.get('flt_no', ''))
            segments.append(FlightSegment(
                flt_no=flt_no,
                dep_port=s.get('depPort', s.get('dep_port', '')),
                arr_port=s.get('arrPort', s.get('arr_port', '')),
                std_utc=_parse_dt(s.get('stdUtc', s.get('std_utc', ''))),
                sta_utc=_parse_dt(s.get('staUtc', s.get('sta_utc', ''))),
                block_minutes=s.get('blockMinutes', s.get('block_minutes', 0)),
                is_night=s.get('isNight', s.get('is_night', False)),
                fleet_code=s.get('fleetCode', s.get('fleet_code')),
            ))
        duties.append(DutyPeriod(
            duty_seq=d.duty_seq,
            report_utc=_parse_dt(d.report_utc),
            release_utc=_parse_dt(d.release_utc),
            segments=segments,
            rest_after_minutes=d.rest_after_minutes,
            report_local=d.report_local,
            base_utc_offset=d.base_utc_offset,
        ))
    return PairingInput(pairing_id=payload.pairing_id, crew_base=payload.crew_base, duties=duties)


def _parse_crew(payload: CrewPayload | None) -> CrewInfo | None:
    if payload is None:
        return None
    rh = payload.recent_flight_hours
    return CrewInfo(
        crew_id=payload.crew_id, division=payload.division, rank=payload.rank,
        fleet_quals=payload.fleet_quals, airport_quals=payload.airport_quals,
        recent_flight_hours={
            'last24h': rh.get('last24h', 0), 'last7d': rh.get('last7d', 0),
            'last28d': rh.get('last28d', 0), 'last90d': rh.get('last90d', 0),
            'last365d': rh.get('last365d', 0),
        },
        recent_landings_90d=payload.recent_landings_90d,
        total_hours=payload.total_hours,
    )


@router.post('/check/session', response_model=SessionCheckResponse)
async def check_session(req: SessionCheckRequest) -> SessionCheckResponse:
    service = get_service()
    pairing = _parse_pairing(req.pairing) if req.pairing else None
    crew = _parse_crew(req.crew)
    violations, passed_all, highest_severity = service.check_session(
        user_id=req.user_id, group_code=req.group_code,
        pairing=pairing, crew=crew, operation=req.operation,
    )
    return SessionCheckResponse(
        session_id=req.session_id,
        pairing_id=pairing.pairing_id if pairing else None,
        violations=[
            ViolationResponse(
                rule_code=v.rule_code, rule_name=v.rule_name,
                passed=v.passed, severity=v.severity,
                actual_value=v.actual_value, limit_value=v.limit_value,
                unit=v.unit, message=v.message,
            )
            for v in violations
        ],
        passed_all=passed_all,
        highest_severity=highest_severity,
    )


@router.post('/session/commit', response_model=SessionCommitResponse)
async def commit_session(req: SessionCommitRequest) -> SessionCommitResponse:
    service = get_service()
    service.commit_session(user_id=req.user_id)
    return SessionCommitResponse(session_id=req.session_id, user_id=req.user_id, committed=True)


@router.post('/session/discard', response_model=SessionDiscardResponse)
async def discard_session(req: SessionDiscardRequest) -> SessionDiscardResponse:
    service = get_service()
    service.discard_session(user_id=req.user_id)
    return SessionDiscardResponse(session_id=req.session_id, user_id=req.user_id, discarded=True)
```

- [ ] **Step 5: Update main.py to wire RuleEngineService**

```python
# rule-engine/main.py — full replacement
import asyncio
import logging
import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI

import asyncpg
import redis.asyncio as aioredis

from src.config.settings import settings
from src.core import RuleLoader
from src.services.rule_engine_service import RuleEngineService
from src.api.check_routes import router as check_router, set_rule_loader
from src.api.admin_routes import router as admin_router
from src.api.session_routes import router as session_router, set_service_instance

logging.basicConfig(level=settings.log_level.upper())
logger = logging.getLogger(__name__)

_service: RuleEngineService | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _service
    logger.info("Rule Engine Service starting on port %d", settings.port)

    rule_loader = RuleLoader(settings.db_dsn)
    set_rule_loader(rule_loader)

    db_pool = await asyncpg.create_pool(settings.db_dsn)
    redis_client = aioredis.from_url(settings.redis_url, decode_responses=True)

    _service = RuleEngineService(rule_loader=rule_loader, db_pool=db_pool, redis_client=redis_client)
    await _service.initialize()
    set_service_instance(_service)

    logger.info("Rule Engine Service ready")
    yield

    await _service.shutdown()
    await db_pool.close()
    await redis_client.aclose()
    logger.info("Rule Engine Service shut down")


app = FastAPI(title="Rule Engine Service", version="0.1.0", lifespan=lifespan)
app.include_router(check_router)
app.include_router(admin_router)
app.include_router(session_router)


@app.get("/health")
async def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=settings.port, reload=False)
```

- [ ] **Step 6: Run all tests**

```bash
cd rule-engine
source ../.venv-rule-engine/bin/activate
python -m pytest tests/ -v
# Expected: all passing (health, check_routes, admin_routes, session_routes)
```

- [ ] **Step 7: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add rule-engine/src/services/ rule-engine/src/api/session_routes.py \
        rule-engine/tests/test_session_routes.py rule-engine/main.py
git commit -m "feat(rule-engine): migrate RuleEngineService + session routes from engine-server"
```

---

## Task 6: Migrate ViolationWorker, complete main.py lifespan

**Files:**
- Create: `rule-engine/src/workers/__init__.py`
- Create: `rule-engine/src/workers/violation_worker.py`
- Modify: `rule-engine/main.py`

- [ ] **Step 1: Create src/workers/__init__.py**

```python
# rule-engine/src/workers/__init__.py
```

- [ ] **Step 2: Create src/workers/violation_worker.py**

Copy from `engine-server/src/workers/violation_worker.py` and replace the sys.path block with direct imports:

```python
# rule-engine/src/workers/violation_worker.py
"""
ViolationWorker — Redis subscriber for roster events.
Subscribes roster:{airline}, fetches event from live-server,
recomputes violations, UPSERTs to rule_violation, PUBLISHes violations:{airline}:{groupCode}.
"""
import asyncio
import json
import logging
from datetime import datetime

import asyncpg
import redis.asyncio as aioredis
import httpx

from src.core import RuleEngine
from src.core.types import CheckInput, PairingInput, DutyPeriod, FlightSegment, CrewInfo, CheckResult
from src.services.rule_engine_service import RuleEngineService, ActiveGroupState

logger = logging.getLogger(__name__)


class ViolationWorker:
    def __init__(
        self,
        service: RuleEngineService,
        redis_url: str,
        db_dsn: str,
        live_server_url: str,
        airline: str,
    ) -> None:
        self.service = service
        self.redis_url = redis_url
        self.db_dsn = db_dsn
        self.live_server_url = live_server_url
        self.airline = airline
        self._redis: aioredis.Redis | None = None
        self._db_pool: asyncpg.Pool | None = None
        self._last_event_id: int = 0
        self._running = False

    async def start(self) -> None:
        self._redis = aioredis.from_url(self.redis_url, decode_responses=True)
        self._db_pool = await asyncpg.create_pool(self.db_dsn)
        stored = await self._redis.get(f'rule_engine:last_event:{self.airline}')
        if stored:
            self._last_event_id = int(stored)
        self._running = True
        await self._catchup()
        asyncio.create_task(self._subscribe_loop())
        logger.info("ViolationWorker started for airline %s (last_event_id=%d)", self.airline, self._last_event_id)

    async def stop(self) -> None:
        self._running = False
        if self._redis:
            await self._redis.aclose()
        if self._db_pool:
            await self._db_pool.close()

    async def _subscribe_loop(self) -> None:
        pubsub = self._redis.pubsub()
        await pubsub.subscribe(f'roster:{self.airline}')
        async for message in pubsub.listen():
            if not self._running:
                break
            if message['type'] != 'message':
                continue
            try:
                await self._process_event(int(message['data']))
            except Exception:
                logger.exception("Error processing roster event")

    async def _catchup(self) -> None:
        if self._last_event_id == 0:
            return
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f'{self.live_server_url}/api/events',
                params={'after': self._last_event_id, 'airline': self.airline},
            )
            if resp.status_code != 200:
                logger.warning("Catchup failed: %s", resp.text)
                return
            for event in resp.json().get('data', []):
                await self._process_event(event['eventId'])

    async def _process_event(self, event_id: int) -> None:
        if event_id <= self._last_event_id:
            return
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f'{self.live_server_url}/api/events/{event_id}')
            if resp.status_code != 200:
                logger.warning("Failed to fetch event %d: %s", event_id, resp.text)
                return
            event = resp.json().get('data', resp.json())
        crew_ids: list[str] = event.get('ref', {}).get('crewIds', [])
        if crew_ids:
            crew_pairings = await self._fetch_crew_pairings(crew_ids)
            for crew_id, pairings in crew_pairings.items():
                self.service.update_roster_snapshot(crew_id, pairings)
            for group_code in self.service.get_active_groups_with_clients():
                await self._recompute_and_upsert(group_code, crew_ids, crew_pairings, event_id)
        self._last_event_id = event_id
        await self._redis.set(f'rule_engine:last_event:{self.airline}', event_id)

    async def _recompute_and_upsert(self, group_code, crew_ids, crew_pairings, event_id):
        state = self.service.active_groups.get(group_code)
        if not state or not state.rules:
            return
        engine = RuleEngine()
        rows: list[dict] = []
        for crew_id in crew_ids:
            for pairing in crew_pairings.get(crew_id, []):
                inp = CheckInput(rule_group_code=group_code, pairing=pairing, crew=None)
                result = engine.check_with_rules(inp, state.rules)
                now = datetime.utcnow()
                start_dt = pairing.duties[0].report_utc if pairing.duties else now
                end_dt = pairing.duties[-1].release_utc if pairing.duties else now
                for r in result.check_results:
                    if r.passed:
                        continue
                    rows.append({
                        'crew_id': crew_id, 'pairing_id': pairing.pairing_id,
                        'rule_group_code': group_code, 'rule_code': r.rule_code,
                        'start_dt': start_dt, 'end_dt': end_dt,
                        'severity': r.severity, 'actual_value': r.actual_value,
                        'limit_value': r.limit_value, 'unit': r.unit,
                        'message': r.message, 'computed_at': now,
                    })
        if rows:
            await self._upsert_violations(rows)
        await self._redis.publish(f'violations:{self.airline}:{group_code}', str(event_id))

    async def _upsert_violations(self, rows: list[dict]) -> None:
        sql = """
            INSERT INTO rule_violation (
                crew_id, pairing_id, duty_seq, rule_group_code, rule_code,
                start_dt, end_dt, severity, actual_value, limit_value, unit, message,
                computed_at, created_by, updated_by, created_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'system','system',$13,$13)
            ON CONFLICT ON CONSTRAINT uq_rule_violation DO UPDATE SET
                start_dt=EXCLUDED.start_dt, end_dt=EXCLUDED.end_dt,
                severity=EXCLUDED.severity, actual_value=EXCLUDED.actual_value,
                limit_value=EXCLUDED.limit_value, unit=EXCLUDED.unit,
                message=EXCLUDED.message, computed_at=EXCLUDED.computed_at,
                updated_by='system', updated_at=EXCLUDED.computed_at
        """
        async with self._db_pool.acquire() as conn:
            await conn.executemany(sql, [
                (r['crew_id'], r.get('pairing_id'), None,
                 r['rule_group_code'], r['rule_code'],
                 r['start_dt'], r['end_dt'], r['severity'],
                 r.get('actual_value'), r.get('limit_value'),
                 r.get('unit', ''), r['message'], r['computed_at'])
                for r in rows
            ])

    async def _fetch_crew_pairings(self, crew_ids: list[str]) -> dict[str, list[PairingInput]]:
        if not crew_ids:
            return {}
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f'{self.live_server_url}/api/roster/pairings/by-crew',
                json={'crewIds': crew_ids, 'airline': self.airline},
            )
            if resp.status_code != 200:
                logger.warning("Failed to fetch crew pairings: %s", resp.text)
                return {}
            raw = resp.json().get('data', {})
        return {cid: [self._parse_pairing(p) for p in ps] for cid, ps in raw.items()}

    def _parse_pairing(self, raw: dict) -> PairingInput:
        duties = []
        for d in raw.get('duties', []):
            segments = [
                FlightSegment(
                    flt_no=s.get('fltNo', ''), dep_port=s.get('depPort', ''),
                    arr_port=s.get('arrPort', ''),
                    std_utc=datetime.fromisoformat(s['stdUtc'].replace('Z', '+00:00')),
                    sta_utc=datetime.fromisoformat(s['staUtc'].replace('Z', '+00:00')),
                    block_minutes=s.get('blockMinutes', 0),
                    is_night=s.get('isNight', False),
                    fleet_code=s.get('fleetCode'),
                )
                for s in d.get('segments', [])
            ]
            duties.append(DutyPeriod(
                duty_seq=d.get('dutySeq', 1),
                report_utc=datetime.fromisoformat(d['reportUtc'].replace('Z', '+00:00')),
                release_utc=datetime.fromisoformat(d['releaseUtc'].replace('Z', '+00:00')),
                segments=segments,
                rest_after_minutes=d.get('restAfterMinutes'),
                report_local=d.get('reportLocal'),
                base_utc_offset=d.get('baseUtcOffset'),
            ))
        return PairingInput(pairing_id=raw['pairingId'], crew_base=raw.get('crewBase', ''), duties=duties)
```

- [ ] **Step 3: Wire ViolationWorker in main.py lifespan**

Add to the lifespan function (after `_service.initialize()`):

```python
from src.workers.violation_worker import ViolationWorker

# inside lifespan, after set_service_instance(_service):
violation_worker = ViolationWorker(
    service=_service,
    redis_url=settings.redis_url,
    db_dsn=settings.db_dsn,
    live_server_url=settings.live_server_url,
    airline=settings.airline,
)
await violation_worker.start()
```

And in the shutdown section:

```python
await violation_worker.stop()
```

- [ ] **Step 4: Smoke test — service starts without errors**

```bash
cd rule-engine
source ../.venv-rule-engine/bin/activate
pip install asyncpg redis[hiredis] httpx
python -m pytest tests/ -v
# Expected: all tests pass
```

- [ ] **Step 5: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add rule-engine/src/workers/ rule-engine/main.py
git commit -m "feat(rule-engine): migrate ViolationWorker from engine-server, wire full lifespan"
```

---

## Task 7: Update live-server workers to use HTTP client

This is the biggest task. Workers switch from `import('@rois/rule-engine')` to HTTP calls.

**Files:**
- Create: `live-server/src/types/rule-engine.ts`
- Create: `live-server/src/services/rule-engine-client.ts`
- Modify: `live-server/src/workers/check-pairing-worker.ts`
- Modify: `live-server/src/workers/check-roster-worker.ts`
- Modify: `live-server/src/workers/batch-crew-worker.ts`
- Modify: `live-server/src/workers/violations-init-worker.ts`
- Modify: `live-server/src/index.ts`
- Modify: `live-server/src/services/rule-check/rule-check-data-service.ts`
- Modify: `live-server/src/services/rule-check/rule-check-result-service.ts`
- Modify: `live-server/package.json`

- [ ] **Step 1: Create live-server/src/types/rule-engine.ts**

Inline types replacing `@rois/rule-engine` imports throughout live-server:

```typescript
// live-server/src/types/rule-engine.ts
// Local type definitions mirroring the Python rule-engine HTTP contract.

export interface FlightSegment {
  fltNo: string
  depPort: string
  arrPort: string
  stdUtc: Date
  staUtc: Date
  blockMinutes: number
  isNight: boolean
  fleetCode?: string | null
}

export interface DutyPeriod {
  dutySeq: number
  reportUtc: Date
  releaseUtc: Date
  segments: FlightSegment[]
  restAfterMinutes?: number
  reportLocal?: string
  baseUtcOffset?: number
}

export interface PairingInput {
  pairingId: number
  crewBase: string
  duties: DutyPeriod[]
}

export interface CrewInfo {
  crewId: string
  division: string
  rank: string
  fleetQuals: string[]
  airportQuals: string[]
  recentFlightHours: {
    last24h: number
    last7d: number
    last28d: number
    last90d: number
    last365d: number
  }
  recentLandings90d?: number
  totalHours?: number
}

export interface CheckInput {
  ruleGroupCode: string
  pairing: PairingInput
  crew?: CrewInfo
}

export interface RosterInput {
  ruleGroupCode: string
  crew: CrewInfo
  pairings: PairingInput[]
  periodStart: Date
  periodEnd: Date
}

export interface CalcResult {
  ruleCode: string
  ruleName: string
  value: number
  unit: string
}

export interface CheckResult {
  ruleCode: string
  ruleName: string
  passed: boolean
  severity: number
  actualValue: number
  limitValue: number
  unit: string
  message: string
}

export interface EngineResult {
  checkResults: CheckResult[]
  calcResults: CalcResult[]
  passedAll: boolean
  highestSeverity: number
}

export interface RosterEngineResult {
  pairingResults: Map<number, EngineResult>
  rosterViolations: CheckResult[]
  passedAll: boolean
  highestSeverity: number
}
```

- [ ] **Step 2: Create live-server/src/services/rule-engine-client.ts**

```typescript
// live-server/src/services/rule-engine-client.ts
import { env } from '../config/index.js'
import type {
  PairingInput, CrewInfo, EngineResult, RosterEngineResult, CheckResult,
} from '../types/rule-engine.js'

// Serialize pairing to HTTP-ready JSON (Date → ISO string)
function serializePairing(p: PairingInput): unknown {
  return {
    pairingId: p.pairingId,
    crewBase: p.crewBase,
    duties: p.duties.map((d) => ({
      dutySeq: d.dutySeq,
      reportUtc: d.reportUtc.toISOString(),
      releaseUtc: d.releaseUtc.toISOString(),
      restAfterMinutes: d.restAfterMinutes,
      reportLocal: d.reportLocal,
      baseUtcOffset: d.baseUtcOffset,
      segments: d.segments.map((s) => ({
        fltNo: s.fltNo,
        depPort: s.depPort,
        arrPort: s.arrPort,
        stdUtc: s.stdUtc.toISOString(),
        staUtc: s.staUtc.toISOString(),
        blockMinutes: s.blockMinutes,
        isNight: s.isNight,
        fleetCode: s.fleetCode,
      })),
    })),
  }
}

function serializeCrew(c: CrewInfo): unknown {
  return {
    crewId: c.crewId,
    division: c.division,
    rank: c.rank,
    fleetQuals: c.fleetQuals,
    airportQuals: c.airportQuals,
    recentFlightHours: c.recentFlightHours,
    recentLandings90d: c.recentLandings90d,
    totalHours: c.totalHours,
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${env.RULE_ENGINE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    throw new Error(`Rule engine HTTP ${res.status}: ${await res.text()}`)
  }
  return res.json() as Promise<T>
}

export const ruleEngineClient = {
  async checkPairing(
    groupCode: string,
    pairing: PairingInput,
    crew?: CrewInfo | null,
  ): Promise<EngineResult> {
    const raw = await post<{
      pairingId: number
      passedAll: boolean
      highestSeverity: number
      checkResults: CheckResult[]
      calcResults: { ruleCode: string; ruleName: string; value: number; unit: string }[]
    }>('/check/pairing', {
      groupCode,
      pairing: serializePairing(pairing),
      crew: crew ? serializeCrew(crew) : undefined,
    })
    return {
      passedAll: raw.passedAll,
      highestSeverity: raw.highestSeverity,
      checkResults: raw.checkResults,
      calcResults: raw.calcResults,
    }
  },

  async checkRoster(
    groupCode: string,
    crew: CrewInfo,
    pairings: PairingInput[],
    periodStart: Date,
    periodEnd: Date,
    pairingCrew?: Map<number, CrewInfo>,
  ): Promise<RosterEngineResult> {
    const pairingCrewObj: Record<string, unknown> | undefined = pairingCrew
      ? Object.fromEntries([...pairingCrew.entries()].map(([k, v]) => [String(k), serializeCrew(v)]))
      : undefined

    const raw = await post<{
      passedAll: boolean
      highestSeverity: number
      rosterViolations: CheckResult[]
      pairingResults: Record<string, {
        passedAll: boolean
        highestSeverity: number
        checkResults: CheckResult[]
        calcResults: { ruleCode: string; ruleName: string; value: number; unit: string }[]
      }>
    }>('/check/roster', {
      groupCode,
      crew: serializeCrew(crew),
      pairings: pairings.map(serializePairing),
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      pairingCrew: pairingCrewObj,
    })

    const pairingResults = new Map<number, EngineResult>()
    for (const [pidStr, res] of Object.entries(raw.pairingResults)) {
      pairingResults.set(Number(pidStr), {
        passedAll: res.passedAll,
        highestSeverity: res.highestSeverity,
        checkResults: res.checkResults,
        calcResults: res.calcResults,
      })
    }
    return {
      passedAll: raw.passedAll,
      highestSeverity: raw.highestSeverity,
      rosterViolations: raw.rosterViolations,
      pairingResults,
    }
  },
}
```

- [ ] **Step 3: Update live-server/src/config/env.ts**

`RULE_ENGINE_URL` default stays `http://localhost:3001`. No change needed if already set. Verify it exists:

```typescript
// live-server/src/config/env.ts — confirm this line exists (no change if present)
RULE_ENGINE_URL: z.string().url().default('http://localhost:3001'),
```

- [ ] **Step 4: Update check-pairing-worker.ts**

Remove `loadRuleEngine()` function and `ruleLoader` parameter. Replace `RuleEngine.checkWithRules()` with `ruleEngineClient.checkPairing()`. The worker signature changes from `startCheckPairingWorker(fastify, ruleLoader)` to `startCheckPairingWorker(fastify)`.

In `check-pairing-worker.ts`:
1. Delete the `let _reModule` block and `loadRuleEngine()` function
2. Delete the `ResolvedRule` local type (no longer needed)
3. Add import: `import { ruleEngineClient } from '../services/rule-engine-client.js'`
4. Replace the `RuleLoader` type from the function signature with no param
5. Change the `processPairingCheckJob` signature — remove `rules: ResolvedRule[]` param
6. Replace:
```typescript
  // OLD:
  const mod = await loadRuleEngine()
  const engine = new mod.RuleEngine()
  const result: EngineResult = engine.checkWithRules(
    { ruleGroupCode: data.ruleGroupCode, pairing, crew },
    rules,
  )
  
  // NEW:
  const result = await ruleEngineClient.checkPairing(data.ruleGroupCode, pairing, crew)
```

7. In the worker factory, remove `ruleLoader.loadRules()` call:
```typescript
  // OLD:
  const rules = await ruleLoader.loadRules(job.data.ruleGroupCode)
  await processPairingCheckJob(fastify, job.data, rules)
  
  // NEW:
  await processPairingCheckJob(fastify, job.data)
```

8. Remove `ruleLoader` parameter from `startCheckPairingWorker(fastify: FastifyInstance)`.

- [ ] **Step 5: Update check-roster-worker.ts**

Same pattern as Step 4:
1. Delete `loadRosterEngine()` and `_reModule`
2. Add import for `ruleEngineClient`
3. Remove `ruleLoader` from `startCheckRosterWorker` signature
4. Remove `const rules = await ruleLoader.loadRules(...)` call
5. Replace:
```typescript
  // OLD:
  const mod = await loadRosterEngine()
  const rosterEngine = new mod.RosterEngine()
  const result: RosterEngineResult = rosterEngine.checkWithRules(rosterInput, rules)
  
  // NEW:
  const result = await ruleEngineClient.checkRoster(
    ruleGroupCode,
    crew,
    validPairings,
    periodStart,
    periodEnd,
  )
```

- [ ] **Step 6: Update batch-crew-worker.ts**

1. Delete `loadRE()` and `_reModule`
2. Add `ruleEngineClient` import
3. Remove `ruleLoader` from `startBatchCrewWorker` signature
4. Remove rule loading: `const rules = await ruleLoader.loadRules(...)`
5. Build `pairingCrew` map from computed per-pairing history, then call HTTP:

Replace the Level-1 + Level-2 loop:
```typescript
  // OLD:
  const ruleEngine = new mod.RuleEngine()
  const pairingResults: UpsertPairingInput[] = []
  for (const pair of pairs) { ... ruleEngine.checkWithRules(...) ... }
  const rosterEngine = new mod.RosterEngine()
  for (const m of months) { ... rosterEngine.checkWithRules(...) ... }

  // NEW:
  // Build per-pairing crew map (preserving per-pairing recentFlightHours)
  const pairingCrewMap = new Map<number, CrewInfo>()
  const pairingInputs: PairingInput[] = []
  for (const pair of pairs) {
    const pairingInput = await ruleCheckDataService.loadPairingInput(fastify, pair.pairingId)
    if (!pairingInput) continue
    pairingInputCache.set(pair.pairingId, pairingInput)
    pairingInputs.push(pairingInput)
    const referenceTime = pairingInput.duties[0]?.reportUtc
    if (referenceTime) {
      const pairingHistory = computeWindowSums(referenceTime, allFlightRows)
      pairingCrewMap.set(pair.pairingId, { ...crewBase, recentFlightHours: pairingHistory })
    }
  }

  // Call /check/roster once with per-pairing crew overrides
  const rosterResult = await ruleEngineClient.checkRoster(
    ruleGroupCode, crewBase, pairingInputs,
    new Date(dateFrom + 'T00:00:00Z'), periodEnd,
    pairingCrewMap,
  )

  const pairingResults: UpsertPairingInput[] = []
  for (const [pairingId, res] of rosterResult.pairingResults) {
    pairingResults.push({
      crewId, pairingId, ruleGroupCode,
      passedAll: res.passedAll,
      highestSeverity: res.highestSeverity,
      checkResults: res.checkResults,
      calcResults: res.calcResults,
    })
  }
  await ruleCheckResultService.bulkUpsertPairingResults(fastify, pairingResults)

  // Per-month roster results
  const months = groupPairingsByMonth(pairs, [...pairingInputCache.values()])
  for (const m of months) {
    const periodStart = new Date(m.month + '-01T00:00:00Z')
    const monthEnd = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 0, 23, 59, 59, 999))
    const monthResult = await ruleEngineClient.checkRoster(
      ruleGroupCode, crewBase, m.pairings, periodStart, monthEnd,
    )
    await ruleCheckResultService.upsertRosterResult(fastify, crewId, ruleGroupCode, m.month, monthResult)
  }
```

- [ ] **Step 7: Update violations-init-worker.ts**

1. Delete `loadRE()` and `_reModule`
2. Add `ruleEngineClient` import
3. Remove `ruleLoader` from `startViolationsInitWorker` and `handleCrew` signatures
4. Replace the pairing+roster engine calls in `handleCrew`:

```typescript
  // OLD:
  const rules = await ruleLoader.loadRules(ruleGroupCode)
  const mod = await loadRE()
  const ruleEngine = new mod.RuleEngine()
  const rosterEngine = new mod.RosterEngine()
  // ... loop over pairings calling ruleEngine.checkWithRules ...
  // ... call rosterEngine.checkWithRules ...

  // NEW:
  // Build per-pairing crew map
  const pairingCrewMap = new Map<number, CrewInfo>()
  const pairingInputs: PairingInput[] = []
  for (const pair of pairs) {
    const pairingInput = await ruleCheckDataService.loadPairingInput(fastify, pair.pairingId)
    pairingInputCache.set(pair.pairingId, pairingInput)
    if (!pairingInput) continue
    pairingInputs.push(pairingInput)
    const firstDuty = pairingInput.duties[0]
    if (firstDuty?.reportUtc) {
      const pairingHistory = computeWindowSums(firstDuty.reportUtc, allFlightRows)
      pairingCrewMap.set(pair.pairingId, { ...crewBase, recentFlightHours: pairingHistory })
    }
  }

  if (pairingInputs.length === 0) {
    await markProcessed(fastify, airline, ruleGroupCode, crewId)
    return
  }

  const rosterResult = await ruleEngineClient.checkRoster(
    ruleGroupCode, crewBase, pairingInputs,
    new Date(dateFrom + 'T00:00:00Z'), periodEnd,
    pairingCrewMap,
  )

  // Build violation rows from pairingResults
  const violations: RuleViolationRow[] = []
  for (const pairingInput of pairingInputs) {
    const res = rosterResult.pairingResults.get(pairingInput.pairingId)
    if (!res) continue
    const startDt = pairingInput.duties[0]?.reportUtc ?? periodEnd
    const endDt = pairingInput.duties[pairingInput.duties.length - 1]?.releaseUtc ?? periodEnd
    for (const check of res.checkResults.filter(r => !r.passed)) {
      violations.push({
        crew_id: crewId,
        pairing_id: pairingInput.pairingId,
        duty_seq: null,
        rule_group_code: ruleGroupCode,
        rule_code: check.ruleCode,
        start_dt: startDt,
        end_dt: endDt,
        severity: check.severity,
        actual_value: check.actualValue,
        limit_value: check.limitValue,
        unit: check.unit,
        message: check.message,
        input_hash: inputHash,
      })
    }
  }
  // Roster-level violations (pairingId = null)
  for (const v of rosterResult.rosterViolations.filter(r => !r.passed)) {
    violations.push({
      crew_id: crewId, pairing_id: null, duty_seq: null,
      rule_group_code: ruleGroupCode, rule_code: v.ruleCode,
      start_dt: new Date(dateFrom + 'T00:00:00Z'), end_dt: periodEnd,
      severity: v.severity, actual_value: v.actualValue, limit_value: v.limitValue,
      unit: v.unit, message: v.message, input_hash: inputHash,
    })
  }
```

- [ ] **Step 8: Update index.ts — remove RuleLoader**

```typescript
  // OLD in live-server/src/index.ts:
  const { RuleLoader } = await import('@rois/rule-engine')
  const ruleLoader = new RuleLoader(server.pgPool)
  startCheckPairingWorker(server, ruleLoader)
  startCheckRosterWorker(server, ruleLoader)
  startBatchCrewWorker(server, ruleLoader)
  // ...
  const { worker: _violationsWorker, queue: violationsQueue } = startViolationsInitWorker(server, ruleLoader)

  // NEW:
  startCheckPairingWorker(server)
  startCheckRosterWorker(server)
  startBatchCrewWorker(server)
  // ...
  const { worker: _violationsWorker, queue: violationsQueue } = startViolationsInitWorker(server)
```

- [ ] **Step 9: Fix type imports in rule-check-data-service.ts**

```typescript
// Replace:
import type { PairingInput, DutyPeriod, FlightSegment } from '@rois/rule-engine'
// With:
import type { PairingInput, DutyPeriod, FlightSegment } from '../../types/rule-engine.js'
```

- [ ] **Step 10: Fix type imports in rule-check-result-service.ts**

```typescript
// Replace:
import type { RosterEngineResult } from '@rois/rule-engine'
// With:
import type { RosterEngineResult } from '../../types/rule-engine.js'
```

- [ ] **Step 11: Remove @rois/rule-engine from live-server/package.json**

Remove the line `"@rois/rule-engine": "workspace:*"` (or similar) from `dependencies`.

Run: `cd live-server && npm install`

- [ ] **Step 12: TypeScript compile check**

```bash
cd live-server
npx tsc --noEmit
# Expected: 0 errors (or only pre-existing errors unrelated to these files)
```

- [ ] **Step 13: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add live-server/src/types/rule-engine.ts \
        live-server/src/services/rule-engine-client.ts \
        live-server/src/workers/ \
        live-server/src/index.ts \
        live-server/src/services/rule-check/ \
        live-server/package.json
git commit -m "feat(live-server): replace @rois/rule-engine npm import with HTTP calls to Python rule-engine service"
```

---

## Task 8: Update gantt session API routing

Session API calls currently go to `ENGINE_API_BASE` (`/fpqe/engine` → port 3003). After migration they go to `RULE_API_BASE` (`/fpqe/rule` → port 3001).

**Files:**
- Modify: `gantt/src/services/rule-session-api.ts`

- [ ] **Step 1: Update the import in rule-session-api.ts**

```typescript
// gantt/src/services/rule-session-api.ts — change line 1-3:

// OLD:
import { ENGINE_API_BASE } from '@/config/api-paths'
import { createHttpClient } from './http-client'
const engineClient = createHttpClient({ baseURL: ENGINE_API_BASE })

// NEW:
import { RULE_API_BASE } from '@/config/api-paths'
import { createHttpClient } from './http-client'
const engineClient = createHttpClient({ baseURL: RULE_API_BASE })
```

No other changes needed — the endpoint paths (`/api/rules/check/session`, etc.) are unchanged.

- [ ] **Step 2: Verify api-paths.ts has RULE_API_BASE**

Check `gantt/src/config/api-paths.ts`:

```typescript
export const RULE_API_BASE = '/fpqe/rule'  // should already exist — no change needed
```

- [ ] **Step 3: TypeScript compile check**

```bash
cd gantt
npx tsc --noEmit
# Expected: 0 new errors
```

- [ ] **Step 4: Bump versions**

```typescript
// gantt/src/version.ts
export const BACKEND_VERSION = 16   // +1 (rule-engine is backend)
export const FRONTEND_VERSION = 32  // +1 (gantt routing change)
```

- [ ] **Step 5: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add gantt/src/services/rule-session-api.ts gantt/src/version.ts
git commit -m "feat(gantt): route session API from engine-server to rule-engine service"
```

---

## Task 9: Remove rule code from engine-server

**Files:**
- Delete: `engine-server/src/api/rule_session_routes.py`
- Delete: `engine-server/src/services/rule_engine_service.py`
- Delete: `engine-server/src/workers/violation_worker.py`
- Modify: `engine-server/main.py`
- Modify: `engine-server/requirements.txt`

- [ ] **Step 1: Delete rule-related files**

```bash
rm engine-server/src/api/rule_session_routes.py
rm engine-server/src/services/rule_engine_service.py
rm engine-server/src/workers/violation_worker.py
```

- [ ] **Step 2: Update engine-server/main.py**

Remove these lines:

```python
# Remove these imports:
from src.api.rule_session_routes import router as rule_session_router
# (and any RuleEngineService / ViolationWorker imports)

# Remove this line from app setup:
app.include_router(rule_session_router)
```

The remaining `main.py` should only include:
- `api_router` (optimization routes)
- `task_manager`, `file_manager` lifespan
- Prometheus metrics, CORS, rate limiting, error handlers

- [ ] **Step 3: Remove asyncpg from engine-server/requirements.txt**

asyncpg was only needed by the rule engine code. Remove the line:

```
asyncpg>=0.29.0,<1.0.0
```

- [ ] **Step 4: Verify engine-server still starts**

```bash
cd engine-server
# Check syntax
python3 -c "import ast; ast.parse(open('main.py').read()); print('syntax OK')"
python3 -c "
from src.api.routes import router
from src.tasks.task_manager import task_manager
from src.files.file_manager import file_manager
print('engine-server imports OK')
"
```

- [ ] **Step 5: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add engine-server/main.py engine-server/requirements.txt
git rm engine-server/src/api/rule_session_routes.py \
       engine-server/src/services/rule_engine_service.py \
       engine-server/src/workers/violation_worker.py
git commit -m "feat(engine-server): remove rule engine code — engine-server is now PO/RO scheduler only"
```

---

## Task 10: Delete rois-rule-engine, delete TS rule-engine sources, update docs

**Files:**
- Delete: `rois-rule-engine/` (entire directory)
- Delete: `rule-engine/src/` (TypeScript), `rule-engine/package.json`, `rule-engine/package-lock.json`, `rule-engine/tsconfig.json`, `rule-engine/.env`, `rule-engine/.env.example` (old TS one)
- Delete: `rule-engine/node_modules/` (untrack via .gitignore or git rm -r --cached)
- Delete: `.venv-rule-engine/` mention — add to .gitignore if not already (it's a venv, shouldn't be tracked)
- Modify: `CLAUDE.md` — update module descriptions
- Create: `rule-engine/CLAUDE.md` — new module docs

- [ ] **Step 1: Delete rois-rule-engine directory**

```bash
cd /home/yuan.z/rois/rois-ai
git rm -r rois-rule-engine/
```

- [ ] **Step 2: Delete TypeScript rule-engine sources**

```bash
git rm -r rule-engine/src/    # TypeScript src
git rm rule-engine/package.json rule-engine/package-lock.json rule-engine/tsconfig.json
git rm rule-engine/.env rule-engine/.env.example  # old TS env files (Python created new ones)
# node_modules is already in .gitignore; just delete the directory
rm -rf rule-engine/node_modules
```

- [ ] **Step 3: Update root CLAUDE.md module descriptions**

Replace the `rule-engine/` and `rois-rule-engine/` lines in the project structure section:

```markdown
# OLD:
├── rule-engine/     # 法规引擎 TS 版 (npm包 @rois/rule-engine，live-server/pbs-server 直接 import；HTTP服务 端口3001供旧路径)
├── rois-rule-engine/ # 法规引擎 Python 版 (pip包 rois_rule_engine，由 engine-server 内嵌的 Rule Engine Service 使用；PO/RO 直接 import)

# NEW:
├── rule-engine/     # 法规引擎服务 (Python FastAPI，端口3001；包含 CCAR-121 规则计算核心 + RuleEngineService + ViolationWorker + Session API)
```

Also update `engine-server/` description:

```markdown
# OLD:
├── engine-server/   # 优化引擎调度服务 + Rule Engine Service (FastAPI + Python, 端口3003；单一实例管理 active_groups + user_sessions + violation_worker)

# NEW:
├── engine-server/   # 优化引擎调度服务 (FastAPI + Python, 端口3003；调度 PO/RO/TO 优化器，管理任务生命周期)
```

- [ ] **Step 4: Create rule-engine/CLAUDE.md**

```markdown
# CLAUDE.md — Rule Engine Service

## Overview

Python FastAPI service (port 3001) providing CCAR-121 regulatory compliance checks.

## Tech Stack

Python 3.12 / FastAPI / asyncpg / redis-py (async) / httpx / pydantic-settings

## Startup

```bash
source /home/yuan.z/rois/rois-ai/.venv-rule-engine/bin/activate
cd /home/yuan.z/rois/rois-ai/rule-engine
pip install -r requirements.txt
cp .env.example .env   # edit DB_DSN / REDIS_URL
python main.py
```

## HTTP API

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| POST | /check/pairing | Single pairing check (called by live-server workers) |
| POST | /check/roster | Full crew roster check (called by live-server workers) |
| POST | /admin/cache/invalidate | Flush rule loader cache for a group |
| POST | /api/rules/check/session | Per-user real-time check (called by gantt) |
| POST | /api/rules/session/commit | Commit session after save |
| POST | /api/rules/session/discard | Discard session |

## Directory Structure

```
src/
├── core/          # Rule calculation logic (calculators, checkers, engine, types)
├── services/      # RuleEngineService — active_groups, user_sessions, roster_snapshot
├── workers/       # ViolationWorker — Redis subscriber → recompute → UPSERT
├── api/           # HTTP route handlers
└── config/        # pydantic-settings
```

## Tests

```bash
source /home/yuan.z/rois/rois-ai/.venv-rule-engine/bin/activate
cd /home/yuan.z/rois/rois-ai/rule-engine
python -m pytest tests/ -v
```
```

- [ ] **Step 5: Update live-server package.json workspace references**

Verify `@rois/rule-engine` is fully removed (no lingering workspace reference):

```bash
grep -r "@rois/rule-engine" live-server/package.json pbs-server/package.json 2>/dev/null || echo "clean"
```

If pbs-server still references it, remove that too.

- [ ] **Step 6: Bump versions**

```typescript
// gantt/src/version.ts
export const BACKEND_VERSION = 17   // rule-engine + engine-server cleanup
export const FRONTEND_VERSION = 32  // unchanged
```

- [ ] **Step 7: Final build check**

```bash
# live-server TypeScript check
cd live-server && npx tsc --noEmit
# gantt TypeScript check
cd ../gantt && npx tsc --noEmit
# rule-engine Python test
cd ../rule-engine && source ../.venv-rule-engine/bin/activate && python -m pytest tests/ -v
```

- [ ] **Step 8: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add CLAUDE.md rule-engine/CLAUDE.md gantt/src/version.ts
git commit -m "chore: delete rois-rule-engine + TS rule-engine; update docs for Python service architecture"
```

---

## Self-Review

**Spec coverage:**
- ✅ TS rule-engine deleted (Task 10)
- ✅ rois-rule-engine merged into rule-engine/src/core/ (Task 2)
- ✅ engine-server rule code migrated to rule-engine (Tasks 5, 6, 9)
- ✅ engine-server becomes PO/RO only (Task 9)
- ✅ rule-engine is standalone service with HTTP API (Tasks 1-6)
- ✅ live-server uses HTTP client instead of npm import (Task 7)
- ✅ gantt routes to correct service (Task 8)
- ✅ Per-pairing flight history preserved via pairingCrew map (Task 7 Steps 6-7)

**Type consistency:**
- `ruleEngineClient.checkPairing()` returns `EngineResult` (defined in `live-server/src/types/rule-engine.ts`)
- `ruleEngineClient.checkRoster()` returns `RosterEngineResult` (same file)
- Session routes use `RuleEngineService` from `rule-engine/src/services/` (unchanged API)
- Workers reference `PairingInput`, `CrewInfo`, etc. from `live-server/src/types/rule-engine.ts`

**Potential gaps:**
- `pbs-server` may also import `@rois/rule-engine` — check and remove if present (included in Task 10 Step 5)
- nginx config may need updating to route `/fpqe/rule` to port 3001 if not already configured — out of scope for this plan (port 3001 was already the rule-engine port)
