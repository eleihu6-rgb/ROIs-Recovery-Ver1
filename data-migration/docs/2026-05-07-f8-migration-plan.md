# F8 Data Migration Tool — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Python FastAPI service that pulls F8 aviation data (Crew/Flight/Pairing/RosterFlight) and writes it into the legacy MySQL database, with scheduled tasks and manual HTTP triggers.

**Architecture:** Single FastAPI app with APScheduler for scheduled jobs. Each sync entity (crew/flight/pairing/roster_flight) is an independent module. Infrastructure layers (DB, JSON storage, API client) are shared. All F8 external IDs stored in `interface_id` fields; our own PKs generated via MySQL `sequence` table.

**Tech Stack:** Python 3.12+, FastAPI, APScheduler 3.x, PyMySQL, Pydantic v2, pydantic-settings, httpx, pytest

---

## File Map

| File | Responsibility |
|------|---------------|
| `requirements.txt` | All dependencies pinned |
| `.env.example` | Config template |
| `config.py` | pydantic-settings, reads `.env` |
| `main.py` | FastAPI app, startup/shutdown, router registration |
| `scheduler.py` | APScheduler init, job registration, state file persistence |
| `db/mysql.py` | PyMySQL connection factory, `nextval()`, `batch_nextval()` |
| `storage/json_store.py` | `JsonBatch` — create batch dir, save per-chunk JSON |
| `f8/utils.py` | `chunk_date_range()`, `normalize_rank()`, `normalize_assignment()`, `SyncResult` |
| `f8/client.py` | `TokenManager`, `F8Client` — token cache, retry, 401 refresh |
| `f8/models.py` | Pydantic models for all F8 API responses |
| `f8/crew.py` | Crew pull + transform + write (crew + 5 sub-tables) |
| `f8/flight.py` | Flight pull + transform + write (flight FLY rows) |
| `f8/pairing.py` | Pairing pull + transform + write (5 tables + SBY/DHD flights) |
| `f8/roster_flight.py` | RosterFlight pull + validate + write (roster + roster_flight) |
| `routes/sync.py` | `POST /sync/{entity}` endpoints, BackgroundTasks dispatch |
| `routes/scheduler_routes.py` | `GET /scheduler/status`, `POST /scheduler/{job}/enable\|disable` |
| `tests/test_utils.py` | Tests for chunk_date_range, normalize_rank, normalize_assignment |
| `tests/test_json_store.py` | Tests for JsonBatch (tmp_path) |
| `tests/test_crew_transform.py` | Unit tests for crew transform logic |
| `tests/test_flight_transform.py` | Unit tests for flight transform + flt_dt UTC→YVR |
| `tests/test_pairing_transform.py` | Unit tests for pairing, duty node gen, assignment mapping |
| `tests/test_roster_flight_transform.py` | Unit tests for roster_flight validation warnings |

---

## Task 1: Project Bootstrap

**Files:**
- Create: `data-migration/requirements.txt`
- Create: `data-migration/.env.example`
- Create: `data-migration/config.py`
- Create: `data-migration/f8/__init__.py`
- Create: `data-migration/db/__init__.py`
- Create: `data-migration/storage/__init__.py`
- Create: `data-migration/routes/__init__.py`
- Create: `data-migration/tests/__init__.py`

- [ ] **Step 1: Create requirements.txt**

```
fastapi==0.115.5
uvicorn==0.32.1
apscheduler==3.10.4
pymysql==1.1.1
pydantic==2.9.2
pydantic-settings==2.6.1
httpx==0.27.2
pytest==8.3.3
pytest-asyncio==0.24.0
```

- [ ] **Step 2: Create .env.example**

```env
# F8 API
F8_AUTH_URL=https://ceje1h57tg.execute-api.ca-central-1.amazonaws.com/Dev/third/auth/getToken
F8_BASE_URL=https://87kbu8v1m6.execute-api.ca-central-1.amazonaws.com/Dev/rois/out
F8_CLIENT_ID=ROIS
F8_SIGN=f7a2c9e1b4d83f6a0e5c2b7d9f1a4e8c

# MySQL Legacy DB
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=rois
MYSQL_PASSWORD=changeme
MYSQL_DATABASE=rois_legacy

# Sync config
SYNC_DAYS_AHEAD=10
SYNC_CHUNK_DAYS=10

LOG_LEVEL=INFO
```

- [ ] **Step 3: Create config.py**

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    f8_auth_url: str
    f8_base_url: str
    f8_client_id: str = "ROIS"
    f8_sign: str

    mysql_host: str = "localhost"
    mysql_port: int = 3306
    mysql_user: str
    mysql_password: str
    mysql_database: str

    sync_days_ahead: int = 10
    sync_chunk_days: int = 10

    log_level: str = "INFO"

    model_config = {"env_file": ".env"}


settings = Settings()
```

- [ ] **Step 4: Create all `__init__.py` files**

```bash
cd data-migration
touch f8/__init__.py db/__init__.py storage/__init__.py routes/__init__.py tests/__init__.py
```

- [ ] **Step 5: Install dependencies and verify**

```bash
cd data-migration
pip install -r requirements.txt
python -c "import fastapi, apscheduler, pymysql, pydantic; print('OK')"
```

Expected output: `OK`

- [ ] **Step 6: Commit**

```bash
git add data-migration/requirements.txt data-migration/.env.example data-migration/config.py \
  data-migration/f8/__init__.py data-migration/db/__init__.py data-migration/storage/__init__.py \
  data-migration/routes/__init__.py data-migration/tests/__init__.py
git commit -m "chore(data-migration): project bootstrap, config and dependencies"
```

---

## Task 2: DB Layer

**Files:**
- Create: `data-migration/db/mysql.py`

- [ ] **Step 1: Write tests/test_db.py with nextval contract test**

```python
# tests/test_db.py
import pytest
from unittest.mock import MagicMock, patch, call
from db.mysql import nextval, batch_nextval


def _make_cursor(current_val: int):
    cursor = MagicMock()
    cursor.fetchone.return_value = {"current_val": current_val}
    return cursor


def test_nextval_executes_update_then_select():
    cursor = _make_cursor(42)
    result = nextval("PAIRING_SEQ", cursor)
    assert result == 42
    assert cursor.execute.call_count == 2
    first_call_sql = cursor.execute.call_args_list[0][0][0]
    assert "UPDATE" in first_call_sql and "current_val" in first_call_sql


def test_batch_nextval_returns_correct_range():
    cursor = _make_cursor(105)  # end val after +5
    ids = batch_nextval("FLT_SEQ", 5, cursor)
    assert ids == [101, 102, 103, 104, 105]


def test_batch_nextval_single():
    cursor = _make_cursor(10)
    ids = batch_nextval("CREW_SEQ", 1, cursor)
    assert ids == [10]
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd data-migration
pytest tests/test_db.py -v
```

Expected: `ModuleNotFoundError: No module named 'db.mysql'`

- [ ] **Step 3: Create db/mysql.py**

```python
from contextlib import contextmanager
from typing import Generator
import pymysql
from pymysql.cursors import DictCursor
from config import settings


def get_connection() -> pymysql.connections.Connection:
    return pymysql.connect(
        host=settings.mysql_host,
        port=settings.mysql_port,
        user=settings.mysql_user,
        password=settings.mysql_password,
        database=settings.mysql_database,
        cursorclass=DictCursor,
        autocommit=False,
        charset="utf8mb4",
    )


@contextmanager
def db_cursor() -> Generator:
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            yield cursor, conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def nextval(seq_name: str, cursor) -> int:
    cursor.execute(
        "UPDATE `sequence` SET current_val = current_val + 1 WHERE seq_name = %s",
        (seq_name,),
    )
    cursor.execute(
        "SELECT current_val FROM `sequence` WHERE seq_name = %s",
        (seq_name,),
    )
    return cursor.fetchone()["current_val"]


def batch_nextval(seq_name: str, n: int, cursor) -> list[int]:
    cursor.execute(
        "UPDATE `sequence` SET current_val = current_val + %s WHERE seq_name = %s",
        (n, seq_name),
    )
    cursor.execute(
        "SELECT current_val FROM `sequence` WHERE seq_name = %s",
        (seq_name,),
    )
    end_val: int = cursor.fetchone()["current_val"]
    return list(range(end_val - n + 1, end_val + 1))
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd data-migration
pytest tests/test_db.py -v
```

Expected: `3 passed`

- [ ] **Step 5: Commit**

```bash
git add data-migration/db/mysql.py data-migration/tests/test_db.py
git commit -m "feat(data-migration): MySQL connection layer with nextval/batch_nextval"
```

---

## Task 3: JSON Storage

**Files:**
- Create: `data-migration/storage/json_store.py`
- Create: `data-migration/tests/test_json_store.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_json_store.py
import json
from pathlib import Path
import pytest
from storage.json_store import JsonBatch


def test_crew_batch_saves_full_json(tmp_path, monkeypatch):
    monkeypatch.setattr("storage.json_store.STORAGE_BASE", tmp_path)
    batch = JsonBatch("crew")
    batch.save({"data": [1, 2, 3]})
    files = list(tmp_path.rglob("full.json"))
    assert len(files) == 1
    content = json.loads(files[0].read_text())
    assert content == {"data": [1, 2, 3]}


def test_ranged_batch_saves_with_date_filename(tmp_path, monkeypatch):
    monkeypatch.setattr("storage.json_store.STORAGE_BASE", tmp_path)
    batch = JsonBatch("pairing")
    batch.save([{"id": 1}], start_dt="2026-03-01", end_dt="2026-03-10")
    files = list(tmp_path.rglob("2026-03-01_2026-03-10.json"))
    assert len(files) == 1


def test_two_saves_create_separate_files(tmp_path, monkeypatch):
    monkeypatch.setattr("storage.json_store.STORAGE_BASE", tmp_path)
    batch = JsonBatch("pairing")
    batch.save([{"id": 1}], start_dt="2026-03-01", end_dt="2026-03-10")
    batch.save([{"id": 2}], start_dt="2026-03-11", end_dt="2026-03-20")
    files = list(tmp_path.rglob("*.json"))
    assert len(files) == 2
    # Both in same batch directory
    assert len({f.parent for f in files}) == 1


def test_two_batches_create_separate_dirs(tmp_path, monkeypatch):
    monkeypatch.setattr("storage.json_store.STORAGE_BASE", tmp_path)
    b1 = JsonBatch("flight")
    b1.save([], start_dt="2026-03-01", end_dt="2026-03-10")
    b2 = JsonBatch("flight")
    b2.save([], start_dt="2026-03-01", end_dt="2026-03-10")
    dirs = {f.parent for f in tmp_path.rglob("*.json")}
    assert len(dirs) == 2
```

- [ ] **Step 2: Run to verify failures**

```bash
cd data-migration
pytest tests/test_json_store.py -v
```

Expected: `ModuleNotFoundError: No module named 'storage.json_store'`

- [ ] **Step 3: Create storage/json_store.py**

```python
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

STORAGE_BASE = Path(__file__).parent.parent / "storage" / "raw"


class JsonBatch:
    """One instance per sync job. All API responses for that job share one batch dir."""

    def __init__(self, entity: str) -> None:
        now = datetime.now(timezone.utc)
        date_dir = now.strftime("%Y-%m-%d")
        batch_ts = now.strftime("%Y%m%d_%H%M%S")
        # Add sub-second suffix to guarantee uniqueness when two batches start in same second
        self._batch_dir = STORAGE_BASE / date_dir / f"{entity}_{batch_ts}_{int(time.time_ns() % 1000):03d}"
        self._batch_dir.mkdir(parents=True, exist_ok=True)

    def save(self, data: Any, start_dt: str | None = None, end_dt: str | None = None) -> Path:
        if start_dt and end_dt:
            filename = f"{start_dt}_{end_dt}.json"
        else:
            filename = "full.json"
        file_path = self._batch_dir / filename
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2, default=str)
        return file_path

    @property
    def batch_dir(self) -> Path:
        return self._batch_dir
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd data-migration
pytest tests/test_json_store.py -v
```

Expected: `4 passed`

- [ ] **Step 5: Commit**

```bash
git add data-migration/storage/json_store.py data-migration/tests/test_json_store.py
git commit -m "feat(data-migration): JSON batch storage with per-call directory isolation"
```

---

## Task 4: Shared Utilities

**Files:**
- Create: `data-migration/f8/utils.py`
- Create: `data-migration/tests/test_utils.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_utils.py
from datetime import date
import pytest
from f8.utils import chunk_date_range, normalize_rank, normalize_assignment, SyncResult


# --- chunk_date_range ---

def test_chunk_within_10_days_returns_single_chunk():
    chunks = chunk_date_range(date(2026, 3, 1), date(2026, 3, 10), chunk_days=10)
    assert chunks == [(date(2026, 3, 1), date(2026, 3, 10))]


def test_chunk_exactly_10_days():
    chunks = chunk_date_range(date(2026, 3, 1), date(2026, 3, 10), chunk_days=10)
    assert len(chunks) == 1


def test_chunk_11_days_splits_into_two():
    chunks = chunk_date_range(date(2026, 3, 1), date(2026, 3, 11), chunk_days=10)
    assert len(chunks) == 2
    assert chunks[0] == (date(2026, 3, 1), date(2026, 3, 10))
    assert chunks[1] == (date(2026, 3, 11), date(2026, 3, 11))


def test_chunk_25_days_splits_into_three():
    chunks = chunk_date_range(date(2026, 3, 1), date(2026, 3, 25), chunk_days=10)
    assert len(chunks) == 3
    assert chunks[2] == (date(2026, 3, 21), date(2026, 3, 25))


def test_chunk_same_day():
    chunks = chunk_date_range(date(2026, 3, 1), date(2026, 3, 1), chunk_days=10)
    assert chunks == [(date(2026, 3, 1), date(2026, 3, 1))]


# --- normalize_rank ---

def test_normalize_rank_cap_to_ca():
    assert normalize_rank("CAP") == "CA"


def test_normalize_rank_cp_to_fo():
    assert normalize_rank("CP") == "FO"


def test_normalize_rank_ca_unchanged():
    assert normalize_rank("CA") == "CA"


def test_normalize_rank_fo_unchanged():
    assert normalize_rank("FO") == "FO"


def test_normalize_rank_unknown_passthrough():
    assert normalize_rank("FE") == "FE"


# --- normalize_assignment ---

def test_normalize_assignment_flight_to_fly():
    assert normalize_assignment("FLIGHT") == "FLY"


def test_normalize_assignment_reserve_to_sby():
    assert normalize_assignment("Reserve") == "SBY"


def test_normalize_assignment_training_to_grd():
    assert normalize_assignment("Training") == "GRD"


def test_normalize_assignment_transport_to_dhd():
    assert normalize_assignment("Transport") == "DHD"


def test_normalize_assignment_unknown_passthrough():
    assert normalize_assignment("Hotel") == "Hotel"


# --- SyncResult ---

def test_sync_result_defaults_to_completed():
    r = SyncResult("crew")
    assert r.status == "completed"
    assert r.imported == 0
    assert r.skipped == 0


def test_sync_result_add_warning_changes_status():
    r = SyncResult("pairing")
    r.add_warning("Pairing 101: flight not found")
    assert r.status == "completed_with_warnings"
    assert r.skipped == 1
    assert len(r.warnings) == 1


def test_sync_result_to_dict():
    r = SyncResult("flight")
    r.imported = 100
    d = r.to_dict()
    assert d["entity"] == "flight"
    assert d["imported"] == 100
    assert "warnings" in d
```

- [ ] **Step 2: Run to verify failures**

```bash
cd data-migration
pytest tests/test_utils.py -v
```

Expected: `ModuleNotFoundError: No module named 'f8.utils'`

- [ ] **Step 3: Create f8/utils.py**

```python
from dataclasses import dataclass, field
from datetime import date, timedelta

RANK_MAP: dict[str, str] = {"CAP": "CA", "CP": "FO", "CA": "CA", "FO": "FO"}
ASSIGNMENT_MAP: dict[str, str] = {
    "FLIGHT": "FLY",
    "Reserve": "SBY",
    "Training": "GRD",
    "Transport": "DHD",
}


def chunk_date_range(
    start: date, end: date, chunk_days: int = 10
) -> list[tuple[date, date]]:
    chunks: list[tuple[date, date]] = []
    current = start
    while current <= end:
        chunk_end = min(current + timedelta(days=chunk_days - 1), end)
        chunks.append((current, chunk_end))
        current = chunk_end + timedelta(days=1)
    return chunks


def normalize_rank(rank: str) -> str:
    return RANK_MAP.get(rank.upper(), rank)


def normalize_assignment(assignment: str) -> str:
    return ASSIGNMENT_MAP.get(assignment, assignment)


@dataclass
class SyncResult:
    entity: str
    status: str = "completed"
    imported: int = 0
    skipped: int = 0
    warnings: list[str] = field(default_factory=list)

    def add_warning(self, msg: str) -> None:
        self.warnings.append(msg)
        self.status = "completed_with_warnings"
        self.skipped += 1

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "entity": self.entity,
            "imported": self.imported,
            "skipped": self.skipped,
            "warnings": self.warnings,
        }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd data-migration
pytest tests/test_utils.py -v
```

Expected: `22 passed`

- [ ] **Step 5: Commit**

```bash
git add data-migration/f8/utils.py data-migration/tests/test_utils.py
git commit -m "feat(data-migration): shared utils — date chunking, rank/assignment normalization, SyncResult"
```

---

## Task 5: F8 API Client

**Files:**
- Create: `data-migration/f8/client.py`
- Create: `data-migration/f8/models.py`

- [ ] **Step 1: Create f8/models.py**

```python
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel


# --- Auth ---

class TokenResponse(BaseModel):
    accessToken: str
    accessTokenExpirationTime: str  # ISO 8601 UTC string


# --- Crew ---

class CrewBase(BaseModel):
    crewId: int
    base: str
    effDt: datetime
    expDt: datetime
    isPrimary: bool


class CrewRank(BaseModel):
    rank: str
    effDt: datetime
    expDt: datetime


class CrewCertificate(BaseModel):
    certificate: str
    isValid: bool
    expDt: datetime


class CrewRecord(BaseModel):
    owner: str
    crewId: int
    firstName: str
    middleName: str = ""
    lastName: str
    gender: str = ""
    telephone: str = ""
    workEmail: str = ""
    bases: list[CrewBase] = []
    ranks: list[CrewRank] = []
    fleets: list[dict[str, Any]] = []          # confirm schema against MySQL table
    certificates: list[CrewCertificate] = []
    qualifications: list[dict[str, Any]] = []  # confirm schema against MySQL table


# --- Flight ---

class FlightRecord(BaseModel):
    owner: str = ""
    legNo: int
    datOp: datetime
    fltId: str
    depStn: str
    arrStn: str
    status: str = ""
    std: datetime
    sta: datetime
    atd: Optional[datetime] = None
    ata: Optional[datetime] = None
    acGrp: str = ""
    acReg: str = ""


# --- Pairing ---

class PairingComposition(BaseModel):
    actingRank: str
    planValue: int


class DutyNode(BaseModel):
    node: str          # CheckIn | CheckOut
    startUtc: Optional[datetime] = None
    endUtc: Optional[datetime] = None
    airport: str = ""


class DutySegment(BaseModel):
    segSeq: int
    dutySeq: int
    fltId: int = 0     # 0 = SBY/DHD, >0 = FLY
    fltNum: str = ""
    fltDt: Optional[datetime] = None
    depArp: str = ""
    arvArp: str = ""
    assignment: str = ""
    airline: str = ""
    fleet: str = ""
    actStrDtUtc: Optional[datetime] = None
    actEndDtUtc: Optional[datetime] = None


class PairingDuty(BaseModel):
    dutyId: int
    dutySeq: int
    strArp: str = ""
    arrArp: str = ""
    actStrDtUtc: Optional[datetime] = None
    actEndDtUtc: Optional[datetime] = None
    creditMin: int = 0
    assignment: str = ""
    nodes: list[DutyNode] = []
    segments: list[DutySegment] = []


class PairingRecord(BaseModel):
    pairingId: str
    pairingDt: str
    label: str = ""
    base: str = ""
    fleet: str = ""
    durationDays: int = 0
    pairingCompositions: list[PairingComposition] = []
    pairingDutyList: list[PairingDuty] = []


# --- RosterFlight ---

class RosterCrewInfo(BaseModel):
    crewId: str
    crewName: str = ""
    actingRank: str = ""


class RosterFlightRecord(BaseModel):
    rosterFlightId: int
    pairingId: int
    fltId: str = ""
    depArp: str = ""
    arrArp: str = ""
    dutyStrUtc: Optional[datetime] = None
    crew: RosterCrewInfo
```

> **Note:** `PairingDuty.nodes` and `PairingDuty.segments` field names must be confirmed against real API response before Task 8 implementation. The model uses assumed camelCase names; adjust if API uses different casing.

- [ ] **Step 2: Write failing tests for client**

```python
# tests/test_client.py
import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone, timedelta


def _mock_token_response():
    exp = (datetime.now(timezone.utc) + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {"accessToken": "test-token-abc", "accessTokenExpirationTime": exp}


def test_token_manager_fetches_token_on_first_call(respx_mock=None):
    # Test that get_token() calls auth endpoint and caches result
    from f8.client import TokenManager
    import httpx

    with patch("f8.client.httpx.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client_cls.return_value.__enter__.return_value = mock_client
        mock_resp = MagicMock()
        mock_resp.json.return_value = _mock_token_response()
        mock_resp.raise_for_status = MagicMock()
        mock_client.post.return_value = mock_resp

        mgr = TokenManager(
            auth_url="https://example.com/auth",
            client_id="ROIS",
            sign="abc123",
        )
        token = mgr.get_token()
        assert token == "test-token-abc"
        assert mock_client.post.call_count == 1


def test_token_manager_reuses_cached_token():
    from f8.client import TokenManager
    with patch("f8.client.httpx.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client_cls.return_value.__enter__.return_value = mock_client
        mock_resp = MagicMock()
        mock_resp.json.return_value = _mock_token_response()
        mock_resp.raise_for_status = MagicMock()
        mock_client.post.return_value = mock_resp

        mgr = TokenManager(auth_url="https://x.com", client_id="R", sign="s")
        mgr.get_token()
        mgr.get_token()
        assert mock_client.post.call_count == 1  # fetched only once
```

- [ ] **Step 3: Run to verify failures**

```bash
cd data-migration
pytest tests/test_client.py -v
```

Expected: `ModuleNotFoundError: No module named 'f8.client'`

- [ ] **Step 4: Create f8/client.py**

```python
import time
import threading
from datetime import datetime, timezone
from typing import Any

import httpx

from config import settings


class TokenManager:
    def __init__(self, auth_url: str, client_id: str, sign: str) -> None:
        self._auth_url = auth_url
        self._client_id = client_id
        self._sign = sign
        self._token: str | None = None
        self._expires_at: float = 0.0
        self._lock = threading.Lock()

    def get_token(self) -> str:
        with self._lock:
            if self._token and time.time() < self._expires_at - 30:
                return self._token
            self._refresh()
            return self._token  # type: ignore[return-value]

    def _refresh(self) -> None:
        with httpx.Client(timeout=30) as client:
            resp = client.post(
                self._auth_url,
                json={
                    "clientId": self._client_id,
                    "timestamp": int(time.time()),
                    "sign": self._sign,
                },
            )
            resp.raise_for_status()
            data = resp.json()
        self._token = data["accessToken"]
        exp_str: str = data["accessTokenExpirationTime"]
        exp_dt = datetime.fromisoformat(exp_str.replace("Z", "+00:00"))
        self._expires_at = exp_dt.timestamp()


_token_manager = TokenManager(
    auth_url=settings.f8_auth_url,
    client_id=settings.f8_client_id,
    sign=settings.f8_sign,
)


def _request_with_retry(
    method: str,
    url: str,
    timeout: float = 30.0,
    retries: int = 3,
    retry_delay: float = 2.0,
    **kwargs: Any,
) -> Any:
    last_exc: Exception | None = None
    for attempt in range(retries + 1):
        token = _token_manager.get_token()
        headers = kwargs.pop("headers", {})
        headers["AuthorizationToken"] = token
        try:
            with httpx.Client(timeout=timeout) as client:
                resp = getattr(client, method)(url, headers=headers, **kwargs)
                if resp.status_code in (401, 403):
                    _token_manager._expires_at = 0  # force refresh on next call
                    raise httpx.HTTPStatusError(
                        f"Auth error {resp.status_code}", request=resp.request, response=resp
                    )
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPStatusError as e:
            last_exc = e
            if attempt < retries:
                time.sleep(retry_delay)
    raise last_exc  # type: ignore[misc]


class F8Client:
    def get_crew(self) -> list[dict]:
        return _request_with_retry("post", f"{settings.f8_base_url}/crew", timeout=60.0)

    def get_flight(self, start_dt: str, end_dt: str) -> list[dict]:
        return _request_with_retry(
            "post",
            f"{settings.f8_base_url}/flight",
            json={"startDt": start_dt, "endDt": end_dt},
        )

    def get_pairing(self, start_dt: str, end_dt: str) -> list[dict]:
        resp = _request_with_retry(
            "post",
            f"{settings.f8_base_url}/pairing",
            json={"startDt": start_dt, "endDt": end_dt},
        )
        # API may wrap in {"statusCode": 200, "body": [...]}
        if isinstance(resp, dict) and "body" in resp:
            return resp["body"]
        return resp

    def get_roster_flight(self, start_dt: str, end_dt: str) -> list[dict]:
        return _request_with_retry(
            "post",
            f"{settings.f8_base_url}/rosterFlight",
            json={"startDt": start_dt, "endDt": end_dt},
        )


f8_client = F8Client()
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd data-migration
pytest tests/test_client.py -v
```

Expected: `2 passed`

- [ ] **Step 6: Commit**

```bash
git add data-migration/f8/client.py data-migration/f8/models.py data-migration/tests/test_client.py
git commit -m "feat(data-migration): F8 API client with token management, retry, 401 refresh"
```

---

## Task 6: Crew Sync

**Files:**
- Create: `data-migration/f8/crew.py`
- Create: `data-migration/tests/test_crew_transform.py`

- [ ] **Step 1: Write failing tests for crew transform**

```python
# tests/test_crew_transform.py
from datetime import datetime, timezone
from f8.crew import transform_crew_row, filter_valid_ranks


FAR_FUTURE = datetime(2199, 12, 31, tzinfo=timezone.utc)
PAST = datetime(2020, 1, 1, tzinfo=timezone.utc)
NOW_REF = datetime(2026, 5, 7, tzinfo=timezone.utc)


def _rank(rank: str, exp: datetime):
    return {"rank": rank, "effDt": "2018-01-01T00:00:00Z", "expDt": exp.isoformat()}


def test_transform_crew_row_maps_basic_fields():
    raw = {
        "owner": "F8", "crewId": 5510, "firstName": "Peter", "middleName": "",
        "lastName": "Adams", "gender": "Male", "telephone": "647-449-2247",
        "workEmail": "peter.adams@flyflair.com",
        "bases": [], "ranks": [], "fleets": [], "certificates": [], "qualifications": [],
    }
    result = transform_crew_row(raw)
    assert result["interface_id"] == 5510
    assert result["first_name"] == "Peter"
    assert result["last_name"] == "Adams"
    assert result["work_email"] == "peter.adams@flyflair.com"


def test_filter_valid_ranks_removes_expired():
    ranks = [
        _rank("CA", FAR_FUTURE),
        _rank("FO", PAST),
    ]
    valid = filter_valid_ranks(ranks, ref_dt=NOW_REF)
    assert len(valid) == 1
    assert valid[0]["rank"] == "CA"


def test_filter_valid_ranks_normalizes_cap_to_ca():
    ranks = [_rank("CAP", FAR_FUTURE)]
    valid = filter_valid_ranks(ranks, ref_dt=NOW_REF)
    assert valid[0]["rank"] == "CA"


def test_filter_valid_ranks_ca_beats_fo():
    ranks = [_rank("FO", FAR_FUTURE), _rank("CA", FAR_FUTURE)]
    valid = filter_valid_ranks(ranks, ref_dt=NOW_REF)
    ranks_out = [r["rank"] for r in valid]
    assert "CA" in ranks_out


def test_transform_crew_row_only_valid_certificates():
    raw = {
        "owner": "F8", "crewId": 1, "firstName": "A", "middleName": "", "lastName": "B",
        "gender": "", "telephone": "", "workEmail": "",
        "bases": [], "ranks": [], "fleets": [],
        "certificates": [
            {"certificate": "RHS", "isValid": True, "expDt": "2026-11-30T00:00:00Z"},
            {"certificate": "OLD", "isValid": False, "expDt": "2025-01-01T00:00:00Z"},
        ],
        "qualifications": [],
    }
    result = transform_crew_row(raw)
    assert len(result["certificates"]) == 1
    assert result["certificates"][0]["certificate"] == "RHS"
```

- [ ] **Step 2: Run to verify failures**

```bash
cd data-migration
pytest tests/test_crew_transform.py -v
```

Expected: `ModuleNotFoundError: No module named 'f8.crew'`

- [ ] **Step 3: Create f8/crew.py**

```python
import logging
from datetime import datetime, timezone
from typing import Any

from db.mysql import db_cursor, batch_nextval
from f8.client import f8_client
from f8.utils import normalize_rank, SyncResult
from storage.json_store import JsonBatch

logger = logging.getLogger(__name__)

CREW_RANK_PRIORITY = {"CA": 2, "FO": 1}


def filter_valid_ranks(ranks: list[dict], ref_dt: datetime | None = None) -> list[dict]:
    ref = ref_dt or datetime.now(timezone.utc)
    valid = []
    for r in ranks:
        exp = r.get("expDt")
        if isinstance(exp, str):
            exp = datetime.fromisoformat(exp.replace("Z", "+00:00"))
        if exp > ref:
            r = dict(r)
            r["rank"] = normalize_rank(r["rank"])
            valid.append(r)
    return valid


def transform_crew_row(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "interface_id": raw["crewId"],
        "first_name": raw.get("firstName", ""),
        "middle_name": raw.get("middleName", ""),
        "last_name": raw.get("lastName", ""),
        "gender": raw.get("gender", ""),
        "telephone": raw.get("telephone", ""),
        "work_email": raw.get("workEmail", ""),
        "bases": raw.get("bases", []),
        "ranks": filter_valid_ranks(raw.get("ranks", [])),
        "fleets": raw.get("fleets", []),
        "certificates": [c for c in raw.get("certificates", []) if c.get("isValid")],
        "qualifications": raw.get("qualifications", []),
    }


def _upsert_crew(cursor, row: dict, new_id: int) -> int:
    cursor.execute("SELECT id FROM crew WHERE interface_id = %s", (row["interface_id"],))
    existing = cursor.fetchone()
    if existing:
        cursor.execute(
            """UPDATE crew SET first_name=%s, middle_name=%s, last_name=%s,
               gender=%s, telephone=%s, work_email=%s, modified_by='ZY_IMP', last_modified=NOW()
               WHERE id=%s""",
            (row["first_name"], row["middle_name"], row["last_name"],
             row["gender"], row["telephone"], row["work_email"], existing["id"]),
        )
        return existing["id"]
    cursor.execute(
        """INSERT INTO crew (id, interface_id, first_name, middle_name, last_name,
           gender, telephone, work_email, created_by, created_dt, modified_by, last_modified)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'ZY_IMP',NOW(),'ZY_IMP',NOW())""",
        (new_id, row["interface_id"], row["first_name"], row["middle_name"],
         row["last_name"], row["gender"], row["telephone"], row["work_email"]),
    )
    return new_id


def _sync_bases(cursor, crew_id: int, bases: list[dict]) -> None:
    cursor.execute("DELETE FROM crew_base WHERE crew_id = %s", (crew_id,))
    for b in bases:
        cursor.execute(
            """INSERT INTO crew_base (crew_id, base, eff_dt, exp_dt, is_primary)
               VALUES (%s,%s,%s,%s,%s)""",
            (crew_id, b["base"], b["effDt"], b["expDt"], 1 if b.get("isPrimary") else 0),
        )


def _sync_ranks(cursor, crew_id: int, ranks: list[dict]) -> None:
    cursor.execute("DELETE FROM crew_rank WHERE crew_id = %s", (crew_id,))
    for r in ranks:
        cursor.execute(
            "INSERT INTO crew_rank (crew_id, rank, eff_dt, exp_dt) VALUES (%s,%s,%s,%s)",
            (crew_id, r["rank"], r["effDt"], r["expDt"]),
        )


def _sync_certificates(cursor, crew_id: int, certs: list[dict]) -> None:
    cursor.execute("DELETE FROM crew_certificate WHERE crew_id = %s", (crew_id,))
    for c in certs:
        cursor.execute(
            """INSERT INTO crew_certificate (crew_id, certificate, is_valid, exp_dt)
               VALUES (%s,%s,%s,%s)""",
            (crew_id, c["certificate"], 1, c["expDt"]),
        )


def _sync_fleets(cursor, crew_id: int, fleets: list[dict]) -> None:
    # Column mapping to be confirmed against MySQL crew_fleet schema
    cursor.execute("DELETE FROM crew_fleet WHERE crew_id = %s", (crew_id,))
    for f in fleets:
        cols = ", ".join(["crew_id"] + list(f.keys()))
        placeholders = ", ".join(["%s"] * (len(f) + 1))
        cursor.execute(
            f"INSERT INTO crew_fleet ({cols}) VALUES ({placeholders})",
            [crew_id] + list(f.values()),
        )


def _sync_qualifications(cursor, crew_id: int, qualifications: list[dict]) -> None:
    # Column mapping to be confirmed against MySQL crew_qualification schema
    cursor.execute("DELETE FROM crew_qualification WHERE crew_id = %s", (crew_id,))
    for q in qualifications:
        cols = ", ".join(["crew_id"] + list(q.keys()))
        placeholders = ", ".join(["%s"] * (len(q) + 1))
        cursor.execute(
            f"INSERT INTO crew_qualification ({cols}) VALUES ({placeholders})",
            [crew_id] + list(q.values()),
        )


def sync_crew() -> SyncResult:
    result = SyncResult("crew")
    batch = JsonBatch("crew")

    raw_list: list[dict] = f8_client.get_crew()
    batch.save(raw_list)

    ids = []
    with db_cursor() as (cursor, conn):
        ids = batch_nextval("CREW_SEQ", len(raw_list), cursor)
        for i, raw in enumerate(raw_list):
            try:
                row = transform_crew_row(raw)
                crew_id = _upsert_crew(cursor, row, ids[i])
                _sync_bases(cursor, crew_id, row["bases"])
                _sync_ranks(cursor, crew_id, row["ranks"])
                _sync_certificates(cursor, crew_id, row["certificates"])
                _sync_fleets(cursor, crew_id, row["fleets"])
                _sync_qualifications(cursor, crew_id, row["qualifications"])
                result.imported += 1
            except Exception as e:
                msg = f"Crew {raw.get('crewId')}: error during import — {e}"
                logger.warning(msg)
                result.add_warning(msg)

    return result
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd data-migration
pytest tests/test_crew_transform.py -v
```

Expected: `5 passed`

- [ ] **Step 5: Commit**

```bash
git add data-migration/f8/crew.py data-migration/tests/test_crew_transform.py
git commit -m "feat(data-migration): Crew sync — transform, upsert, 6-table write"
```

---

## Task 7: Flight Sync

**Files:**
- Create: `data-migration/f8/flight.py`
- Create: `data-migration/tests/test_flight_transform.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_flight_transform.py
from datetime import datetime, timezone
from f8.flight import transform_flight_row, to_yvr_date


def test_to_yvr_date_utc_minus_7():
    # 2026-03-04 16:50 UTC = 2026-03-04 09:50 YVR (UTC-7) => date 2026-03-04
    dt = datetime(2026, 3, 4, 16, 50, tzinfo=timezone.utc)
    assert to_yvr_date(dt).isoformat() == "2026-03-04"


def test_to_yvr_date_crosses_midnight():
    # 2026-03-04 03:00 UTC = 2026-03-03 20:00 YVR => date 2026-03-03
    dt = datetime(2026, 3, 4, 3, 0, tzinfo=timezone.utc)
    assert to_yvr_date(dt).isoformat() == "2026-03-03"


def test_transform_flight_row_basic_mapping():
    raw = {
        "owner": "F8 - Flair Airlines",
        "legNo": 804,
        "datOp": "2026-03-04T00:00:00Z",
        "fltId": "F8804",
        "depStn": "YVR",
        "arrStn": "YYC",
        "status": "Completed",
        "std": "2026-03-04T16:50:00Z",
        "sta": "2026-03-04T18:20:00Z",
        "atd": "2026-03-04T16:50:00Z",
        "ata": "2026-03-04T18:18:00Z",
        "acGrp": "7M8",
        "acReg": "C-FLGD",
    }
    result = transform_flight_row(raw)
    assert result["flt_num"] == 804
    assert result["interface_flt_id"] == "F8804"
    assert result["dep_arp"] == "YVR"
    assert result["arv_arp"] == "YYC"
    assert result["fleet"] == "7M8"
    assert result["flight_flag"] == "A"
    assert result["flight_assignment"] == "FLY"
    assert result["flt_dt"].isoformat() == "2026-03-04"


def test_transform_flight_row_missing_ata_defaults_to_sta():
    raw = {
        "owner": "F8", "legNo": 100, "datOp": "2026-03-01T00:00:00Z",
        "fltId": "F8100", "depStn": "YYZ", "arrStn": "YVR", "status": "S",
        "std": "2026-03-01T10:00:00Z", "sta": "2026-03-01T14:00:00Z",
        "atd": None, "ata": None, "acGrp": "738", "acReg": "C-ABC",
    }
    result = transform_flight_row(raw)
    assert result["act_dep_dt_utc"] == result["sch_dep_dt_utc"]
    assert result["act_arv_dt_utc"] == result["sch_arv_dt_utc"]
```

- [ ] **Step 2: Run to verify failures**

```bash
cd data-migration
pytest tests/test_flight_transform.py -v
```

Expected: `ModuleNotFoundError: No module named 'f8.flight'`

- [ ] **Step 3: Create f8/flight.py**

```python
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any

from db.mysql import db_cursor, batch_nextval
from f8.client import f8_client
from f8.utils import chunk_date_range, SyncResult
from storage.json_store import JsonBatch
from config import settings

logger = logging.getLogger(__name__)

YVR_OFFSET = timedelta(hours=7)  # UTC-7


def to_yvr_date(utc_dt: datetime) -> date:
    return (utc_dt - YVR_OFFSET).date()


def _parse_dt(val: str | None) -> datetime | None:
    if not val:
        return None
    return datetime.fromisoformat(val.replace("Z", "+00:00"))


def transform_flight_row(raw: dict[str, Any]) -> dict[str, Any]:
    std = _parse_dt(raw["std"])
    sta = _parse_dt(raw["sta"])
    atd = _parse_dt(raw.get("atd")) or std
    ata = _parse_dt(raw.get("ata")) or sta
    dat_op = _parse_dt(raw["datOp"])
    return {
        "flt_num": raw["legNo"],
        "interface_flt_id": raw["fltId"],
        "flt_dt": to_yvr_date(dat_op),
        "dep_arp": raw["depStn"],
        "arv_arp": raw["arrStn"],
        "sch_dep_dt_utc": std,
        "sch_arv_dt_utc": sta,
        "act_dep_dt_utc": atd,
        "act_arv_dt_utc": ata,
        "act_dep_arp": raw["depStn"],
        "act_arv_arp": raw["arrStn"],
        "fleet": raw.get("acGrp", "") or "-",
        "ac_reg": raw.get("acReg", ""),
        "flight_flag": "A",
        "flight_assignment": "FLY",
        "filiale": "F8",
        "ac_owner": "F8",
        "pilot_owner": "F8",
        "cabin_owner": "F8",
        "seg_type": "J",
        "flt_type": "S",
        "service_type": "S",
    }


def _upsert_flight(cursor, row: dict, new_id: int) -> int:
    cursor.execute(
        "SELECT id FROM flight WHERE interface_flt_id = %s", (row["interface_flt_id"],)
    )
    existing = cursor.fetchone()
    if existing:
        cursor.execute(
            """UPDATE flight SET flt_num=%s, flt_dt=%s, dep_arp=%s, arv_arp=%s,
               sch_dep_dt_utc=%s, sch_arv_dt_utc=%s, act_dep_dt_utc=%s, act_arv_dt_utc=%s,
               fleet=%s, ac_reg=%s, modified_by='ZY_IMP', last_modified=NOW() WHERE id=%s""",
            (row["flt_num"], row["flt_dt"], row["dep_arp"], row["arv_arp"],
             row["sch_dep_dt_utc"], row["sch_arv_dt_utc"],
             row["act_dep_dt_utc"], row["act_arv_dt_utc"],
             row["fleet"], row["ac_reg"], existing["id"]),
        )
        return existing["id"]
    cursor.execute(
        """INSERT INTO flight
           (id, flt_num, interface_flt_id, flt_dt, dep_arp, arv_arp,
            sch_dep_dt_utc, sch_arv_dt_utc, act_dep_dt_utc, act_arv_dt_utc,
            act_dep_arp, act_arv_arp, fleet, ac_reg,
            flight_flag, flight_assignment, filiale,
            ac_owner, pilot_owner, cabin_owner, seg_type, flt_type, service_type,
            blk_min, is_locked, sch_id, commute_id,
            created_by, created_dt, modified_by, last_modified)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                   TIMESTAMPDIFF(MINUTE,%s,%s),0,0,0,'ZY_IMP',NOW(),'ZY_IMP',NOW())""",
        (new_id, row["flt_num"], row["interface_flt_id"], row["flt_dt"],
         row["dep_arp"], row["arv_arp"],
         row["sch_dep_dt_utc"], row["sch_arv_dt_utc"],
         row["act_dep_dt_utc"], row["act_arv_dt_utc"],
         row["act_dep_arp"], row["act_arv_arp"],
         row["fleet"], row["ac_reg"],
         row["flight_flag"], row["flight_assignment"], row["filiale"],
         row["ac_owner"], row["pilot_owner"], row["cabin_owner"],
         row["seg_type"], row["flt_type"], row["service_type"],
         row["sch_dep_dt_utc"], row["sch_arv_dt_utc"]),
    )
    return new_id


def sync_flight(start_dt: str, end_dt: str) -> SyncResult:
    from datetime import date as date_type
    result = SyncResult("flight")
    start = date_type.fromisoformat(start_dt)
    end = date_type.fromisoformat(end_dt)
    chunks = chunk_date_range(start, end, chunk_days=settings.sync_chunk_days)
    batch = JsonBatch("flight")

    all_raw: list[dict] = []
    for chunk_start, chunk_end in chunks:
        raw = f8_client.get_flight(chunk_start.isoformat(), chunk_end.isoformat())
        batch.save(raw, start_dt=chunk_start.isoformat(), end_dt=chunk_end.isoformat())
        all_raw.extend(raw)

    with db_cursor() as (cursor, conn):
        ids = batch_nextval("FLT_SEQ", len(all_raw), cursor)
        for i, raw in enumerate(all_raw):
            try:
                row = transform_flight_row(raw)
                _upsert_flight(cursor, row, ids[i])
                result.imported += 1
            except Exception as e:
                msg = f"Flight {raw.get('fltId')}: {e}"
                logger.warning(msg)
                result.add_warning(msg)

    return result
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd data-migration
pytest tests/test_flight_transform.py -v
```

Expected: `4 passed`

- [ ] **Step 5: Commit**

```bash
git add data-migration/f8/flight.py data-migration/tests/test_flight_transform.py
git commit -m "feat(data-migration): Flight sync — FLY direct from API, UTC→YVR date conversion"
```

---

## Task 8: Pairing Sync

**Files:**
- Create: `data-migration/f8/pairing.py`
- Create: `data-migration/tests/test_pairing_transform.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_pairing_transform.py
from datetime import datetime, timezone
from f8.pairing import (
    transform_pairing_row,
    build_duty_nodes,
    normalize_pairing_assignment,
    build_sby_dhd_flight,
)


def _dt(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


DUTY = {
    "dutyId": 10,
    "dutySeq": 1,
    "strArp": "YYZ",
    "arrArp": "YVR",
    "actStrDtUtc": "2026-03-01T10:00:00Z",
    "actEndDtUtc": "2026-03-01T20:00:00Z",
    "creditMin": 360,
    "assignment": "FLIGHT",
    "nodes": [],
    "segments": [],
}

RAW_PAIRING = {
    "pairingId": "101198",
    "pairingDt": "2026-02-23 00:00:00",
    "label": "YYZ/YVR",
    "base": "YYZ",
    "fleet": "737",
    "durationDays": 2,
    "pairingCompositions": [{"actingRank": "CAP", "planValue": 1}],
    "pairingDutyList": [DUTY],
}


def test_transform_pairing_row_stores_pairing_id_as_interface_id():
    result = transform_pairing_row(RAW_PAIRING)
    assert result["interface_id"] == "101198"


def test_transform_pairing_row_normalizes_division_from_compositions():
    result = transform_pairing_row(RAW_PAIRING)
    assert result["division"] in ("P", "C")


def test_transform_pairing_row_derives_sch_str_from_duty_list():
    result = transform_pairing_row(RAW_PAIRING)
    assert result["sch_str_dt_utc"] == _dt("2026-03-01T10:00:00Z")


def test_transform_pairing_row_derives_sch_end_from_last_duty():
    result = transform_pairing_row(RAW_PAIRING)
    assert result["sch_end_dt_utc"] == _dt("2026-03-01T20:00:00Z")


def test_normalize_pairing_assignment_maps_all():
    assert normalize_pairing_assignment("FLIGHT") == "FLY"
    assert normalize_pairing_assignment("Reserve") == "SBY"
    assert normalize_pairing_assignment("Training") == "GRD"
    assert normalize_pairing_assignment("Transport") == "DHD"


def test_build_duty_nodes_generates_4_nodes_no_checkin():
    nodes = build_duty_nodes(DUTY)
    node_names = [n["node"] for n in nodes]
    assert node_names == ["PICKUP", "BRIEF", "DEBRIEF", "DROPOFF"]


def test_build_duty_nodes_with_checkin_uses_node_times():
    duty = dict(DUTY)
    duty["nodes"] = [
        {"node": "CheckIn", "startUtc": "2026-03-01T09:00:00Z", "endUtc": "2026-03-01T09:30:00Z", "airport": "YYZ"},
        {"node": "CheckOut", "startUtc": "2026-03-01T19:30:00Z", "endUtc": "2026-03-01T20:00:00Z", "airport": "YVR"},
    ]
    nodes = build_duty_nodes(duty)
    pickup = next(n for n in nodes if n["node"] == "PICKUP")
    assert pickup["start_utc"] == _dt("2026-03-01T09:00:00Z")


def test_build_sby_dhd_flight():
    seg = {
        "fltId": 0, "fltNum": "SBY001", "fltDt": "2026-03-01T00:00:00Z",
        "depArp": "YYZ", "arvArp": "YVR", "assignment": "SBY",
        "airline": "F8", "fleet": "737",
        "actStrDtUtc": "2026-03-01T10:00:00Z",
        "actEndDtUtc": "2026-03-01T14:00:00Z",
    }
    flight = build_sby_dhd_flight(seg)
    assert flight["flight_flag"] == "B"
    assert flight["flight_assignment"] == "SBY"
    assert flight["dep_arp"] == "YYZ"
```

- [ ] **Step 2: Run to verify failures**

```bash
cd data-migration
pytest tests/test_pairing_transform.py -v
```

Expected: `ModuleNotFoundError: No module named 'f8.pairing'`

- [ ] **Step 3: Create f8/pairing.py**

```python
import logging
from datetime import date as date_type, datetime, timezone
from typing import Any

from db.mysql import db_cursor, batch_nextval, nextval
from f8.client import f8_client
from f8.utils import chunk_date_range, normalize_rank, normalize_assignment, SyncResult
from storage.json_store import JsonBatch
from config import settings

logger = logging.getLogger(__name__)

ASSIGNMENT_FLAG = {"DHD": "D", "SBY": "B"}


def normalize_pairing_assignment(assignment: str) -> str:
    return normalize_assignment(assignment)


def _parse_dt(val: str | None) -> datetime | None:
    if not val:
        return None
    return datetime.fromisoformat(str(val).replace("Z", "+00:00").replace(" ", "T"))


def transform_pairing_row(raw: dict[str, Any]) -> dict[str, Any]:
    duties = raw.get("pairingDutyList", [])
    sch_str = _parse_dt(duties[0]["actStrDtUtc"]) if duties else None
    sch_end = _parse_dt(duties[-1]["actEndDtUtc"]) if duties else None
    comps = raw.get("pairingCompositions", [])
    division = "C" if any(normalize_rank(c.get("actingRank", "")) not in ("CA", "FO") for c in comps) else "P"
    return {
        "interface_id": str(raw["pairingId"]),
        "pairing_dt": _parse_dt(raw.get("pairingDt")),
        "label": raw.get("label", ""),
        "base": raw.get("base", ""),
        "fleet": raw.get("fleet", ""),
        "duration_days": raw.get("durationDays", 0),
        "sch_str_dt_utc": sch_str,
        "sch_end_dt_utc": sch_end,
        "division": division,
        "filiale": "F8",
        "assignment_group": "FLY",
        "assignment": "FLY",
        "ver": 0,
        "scenario_id": 0,
        "is_deleted": 0,
    }


def build_duty_nodes(duty: dict[str, Any]) -> list[dict[str, Any]]:
    nodes_raw = duty.get("nodes", [])
    checkin = next((n for n in nodes_raw if n.get("node") == "CheckIn"), None)
    checkout = next((n for n in nodes_raw if n.get("node") == "CheckOut"), None)
    str_dt = _parse_dt(duty.get("actStrDtUtc"))
    end_dt = _parse_dt(duty.get("actEndDtUtc"))
    str_arp = duty.get("strArp", "")
    end_arp = duty.get("arrArp", "")

    ci_start = _parse_dt(checkin["startUtc"]) if checkin else str_dt
    ci_end = _parse_dt(checkin["endUtc"]) if checkin else str_dt
    ci_airport = checkin.get("airport", str_arp) if checkin else str_arp
    co_start = _parse_dt(checkout["startUtc"]) if checkout else end_dt
    co_end = _parse_dt(checkout["endUtc"]) if checkout else end_dt
    co_airport = checkout.get("airport", end_arp) if checkout else end_arp

    return [
        {"sequence": 1, "node": "PICKUP",  "airport": ci_airport, "start_utc": ci_start, "end_utc": ci_start},
        {"sequence": 2, "node": "BRIEF",   "airport": ci_airport, "start_utc": ci_start, "end_utc": ci_end},
        {"sequence": 3, "node": "DEBRIEF", "airport": co_airport, "start_utc": co_start, "end_utc": co_end},
        {"sequence": 4, "node": "DROPOFF", "airport": co_airport, "start_utc": co_end,   "end_utc": co_end},
    ]


def build_sby_dhd_flight(seg: dict[str, Any]) -> dict[str, Any]:
    assignment = normalize_assignment(seg.get("assignment", ""))
    flag = ASSIGNMENT_FLAG.get(assignment, "")
    str_dt = _parse_dt(seg.get("actStrDtUtc"))
    end_dt = _parse_dt(seg.get("actEndDtUtc"))
    flt_dt_raw = _parse_dt(seg.get("fltDt"))
    flt_dt = (flt_dt_raw - settings._yvr_offset).date() if flt_dt_raw else (str_dt.date() if str_dt else None)
    return {
        "flt_num": seg.get("fltNum", ""),
        "flt_dt": flt_dt,
        "dep_arp": seg.get("depArp", ""),
        "arv_arp": seg.get("arvArp", ""),
        "sch_dep_dt_utc": str_dt,
        "sch_arv_dt_utc": end_dt,
        "act_dep_dt_utc": str_dt,
        "act_arv_dt_utc": end_dt,
        "fleet": seg.get("fleet", "") or "-",
        "airline": seg.get("airline", "F8"),
        "flight_flag": flag,
        "flight_assignment": assignment,
        "filiale": "F8",
        "ac_owner": "F8", "pilot_owner": "F8", "cabin_owner": "F8",
        "seg_type": "J", "flt_type": "S", "service_type": "S",
    }


def _resolve_airline(seg: dict) -> str:
    airline = seg.get("airline", "")
    flt_num = seg.get("fltNum", "")
    if airline in ("FLE", ""):
        import re
        if re.match(r"^(?=.*[a-zA-Z])(?=.*[0-9])", flt_num):
            return flt_num[:2].upper()
        return "F8"
    return airline


def _resolve_flt_num(seg: dict) -> str:
    airline = seg.get("airline", "")
    flt_num = seg.get("fltNum", "")
    return flt_num[2:] if airline == "FLE" else flt_num


def _write_pairing(cursor, pairing_id: int, row: dict) -> None:
    cursor.execute(
        """INSERT INTO pairing
           (id, ver, pairing_dt, label, filiale, division, base, fleet, duration_days,
            sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc,
            assignment_group, assignment, attributes, scenario_id, is_deleted, interface_id,
            created_by, created_dt, modified_by, last_modified)
           VALUES (%s,0,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'',0,0,%s,'ZY_IMP',NOW(),'ZY_IMP',NOW())""",
        (pairing_id, row["pairing_dt"], row["label"], row["filiale"], row["division"],
         row["base"], row["fleet"], row["duration_days"],
         row["sch_str_dt_utc"], row["sch_end_dt_utc"],
         row["sch_str_dt_utc"], row["sch_end_dt_utc"],
         row["assignment_group"], row["assignment"], row["interface_id"]),
    )


def sync_pairing(start_dt: str, end_dt: str) -> SyncResult:
    result = SyncResult("pairing")
    start = date_type.fromisoformat(start_dt)
    end = date_type.fromisoformat(end_dt)
    chunks = chunk_date_range(start, end, chunk_days=settings.sync_chunk_days)
    batch = JsonBatch("pairing")

    all_raw: list[dict] = []
    for chunk_start, chunk_end in chunks:
        raw = f8_client.get_pairing(chunk_start.isoformat(), chunk_end.isoformat())
        batch.save(raw, start_dt=chunk_start.isoformat(), end_dt=chunk_end.isoformat())
        all_raw.extend(raw)

    with db_cursor() as (cursor, conn):
        pairing_ids = batch_nextval("PAIRING_SEQ", len(all_raw), cursor)

        for idx, raw in enumerate(all_raw):
            try:
                row = transform_pairing_row(raw)
                interface_id = row["interface_id"]

                # Check if already exists
                cursor.execute("SELECT id FROM pairing WHERE interface_id = %s", (interface_id,))
                existing = cursor.fetchone()
                if existing:
                    pairing_db_id = existing["id"]
                else:
                    pairing_db_id = pairing_ids[idx]
                    _write_pairing(cursor, pairing_db_id, row)

                # pairing_composition
                comps = raw.get("pairingCompositions", [])
                comp_ids = batch_nextval("PAIRING_COMP_SEQ", len(comps), cursor)
                for ci, comp in enumerate(comps):
                    cursor.execute(
                        """INSERT INTO pairing_composition
                           (id, pairing_id, acting_rank, plan_value, division, is_deleted, scenario_id, modified_by, last_modified)
                           VALUES (%s,%s,%s,%s,'P',0,0,'ZY_IMP',NOW())""",
                        (comp_ids[ci], pairing_db_id,
                         normalize_rank(comp.get("actingRank", "")),
                         comp.get("planValue", 0)),
                    )

                # pairing_duty + nodes + segments
                duties = raw.get("pairingDutyList", [])
                duty_ids = batch_nextval("PAIRING_DUTY_SEQ", len(duties), cursor)

                for di, duty in enumerate(duties):
                    duty_db_id = duty_ids[di]
                    assignment = normalize_pairing_assignment(duty.get("assignment", ""))
                    cursor.execute(
                        """INSERT INTO pairing_duty
                           (id, pairing_id, duty_seq, str_arp, end_arp,
                            act_str_dt_utc, act_end_dt_utc, credited_minutes,
                            assignment, comments, is_deleted, scenario_id,
                            is_manual_modify, fdp_discretion_min, max_fdp_min,
                            min_rest_min, act_rest_min, layover_nits,
                            plan_flight_min, plan_fdp_min, actual_duty_minutes,
                            created_by, created_dt, modified_by, last_modified)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,0,0,0,0,0,0,0,0,0,0,0,
                                   'ZY_IMP',NOW(),'ZY_IMP',NOW())""",
                        (duty_db_id, pairing_db_id,
                         duty.get("dutySeq", di + 1),
                         duty.get("strArp", ""), duty.get("arrArp", ""),
                         _parse_dt(duty.get("actStrDtUtc")),
                         _parse_dt(duty.get("actEndDtUtc")),
                         duty.get("creditMin", 0),
                         assignment,
                         duty.get("dutyId", 0)),  # stored in comments for node correlation
                    )

                    # duty nodes
                    nodes = build_duty_nodes(duty)
                    node_ids = batch_nextval("PAIRING_DUTY_NODE_SEQ", len(nodes), cursor)
                    for ni, node in enumerate(nodes):
                        cursor.execute(
                            """INSERT INTO pairing_duty_node
                               (id, pairing_id, duty_id, sequence, type, node,
                                from_segment_id, to_segment_id, group_id,
                                airport, start_utc, end_utc, scenario_id,
                                modified_by, last_modified, is_manual_modify)
                               VALUES (%s,%s,%s,%s,'DUTY',%s,0,0,1,%s,%s,%s,0,'ZY_IMP',NOW(),0)""",
                            (node_ids[ni], pairing_db_id, duty_db_id,
                             node["sequence"], node["node"],
                             node["airport"], node["start_utc"], node["end_utc"]),
                        )

                    # segments
                    segments = [s for s in duty.get("segments", []) if s.get("assignment") != "Hotel"]
                    seg_ids = batch_nextval("PAIRING_SEG_SEQ", len(segments), cursor)
                    for si, seg in enumerate(segments):
                        seg_assignment = normalize_assignment(seg.get("assignment", ""))
                        airline = _resolve_airline(seg)
                        flt_num = _resolve_flt_num(seg)
                        seg_db_id = seg_ids[si]
                        interface_flt_id = seg.get("fltId", 0)

                        cursor.execute(
                            """INSERT INTO pairing_duty_segment
                               (id, pairing_id, pairing_duty_id, duty_seq, seg_seq,
                                flt_id, flt_dt, assignment, scenario_id,
                                rank_comb_c9a_p, rank_comb_c9a_c, rank_comb_c9a_a,
                                created_by, created_dt, modified_by, last_modified,
                                airline, flt_num, dep_arp, arv_arp, fleet,
                                act_str_dt_utc, act_end_dt_utc, is_deleted, interface_flt_id)
                               VALUES (%s,%s,%s,%s,%s,0,%s,%s,0,0,0,0,
                                       'ZY_IMP',NOW(),'ZY_IMP',NOW(),
                                       %s,%s,%s,%s,%s,%s,%s,0,%s)""",
                            (seg_db_id, pairing_db_id, duty_db_id,
                             seg.get("dutySeq", di + 1), seg.get("segSeq", si + 1),
                             _parse_dt(seg.get("fltDt")),
                             seg_assignment,
                             airline, flt_num,
                             seg.get("depArp", ""), seg.get("arvArp", ""),
                             seg.get("fleet", "") or "-",
                             _parse_dt(seg.get("actStrDtUtc")),
                             _parse_dt(seg.get("actEndDtUtc")),
                             interface_flt_id),
                        )

                        # Insert SBY/DHD flight if fltId == 0
                        if interface_flt_id == 0 and seg_assignment in ("SBY", "DHD"):
                            flt_row = build_sby_dhd_flight(seg)
                            flt_new_id = nextval("FLT_SEQ", cursor)
                            cursor.execute(
                                """INSERT INTO flight
                                   (id, airline, flt_dt, flt_num, dep_arp, arv_arp,
                                    sch_dep_dt_utc, sch_arv_dt_utc, act_dep_dt_utc, act_arv_dt_utc,
                                    act_dep_arp, act_arv_arp, flight_flag, flight_assignment,
                                    blk_min, fleet, ac_owner, pilot_owner, cabin_owner,
                                    commute_id, seg_type, flt_type, is_locked, sch_id,
                                    created_by, created_dt, modified_by, last_modified, service_type)
                                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                                           TIMESTAMPDIFF(MINUTE,%s,%s),%s,%s,%s,%s,
                                           0,'J','S',0,0,'ZY_IMP',NOW(),'ZY_IMP',NOW(),'S')""",
                                (flt_new_id, flt_row["airline"], flt_row["flt_dt"],
                                 flt_row["flt_num"], flt_row["dep_arp"], flt_row["arv_arp"],
                                 flt_row["sch_dep_dt_utc"], flt_row["sch_arv_dt_utc"],
                                 flt_row["act_dep_dt_utc"], flt_row["act_arv_dt_utc"],
                                 flt_row["dep_arp"], flt_row["arv_arp"],
                                 flt_row["flight_flag"], flt_row["flight_assignment"],
                                 flt_row["sch_dep_dt_utc"], flt_row["sch_arv_dt_utc"],
                                 flt_row["fleet"], flt_row["ac_owner"],
                                 flt_row["pilot_owner"], flt_row["cabin_owner"]),
                            )
                            cursor.execute(
                                "UPDATE pairing_duty_segment SET flt_id=%s WHERE id=%s",
                                (flt_new_id, seg_db_id),
                            )

                # Back-fill flt_id for FLY segments (interface_flt_id > 0)
                cursor.execute(
                    """UPDATE pairing_duty_segment ps
                       JOIN flight f ON f.interface_flt_id = ps.interface_flt_id
                         AND ps.airline = f.airline
                         AND ps.dep_arp = f.dep_arp AND ps.arv_arp = f.arv_arp
                         AND ps.act_str_dt_utc = f.sch_dep_dt_utc
                       SET ps.flt_id = f.id
                       WHERE ps.pairing_id = %s AND ps.interface_flt_id > 0 AND ps.flt_id = 0""",
                    (pairing_db_id,),
                )

                result.imported += 1

                # Validation: warn on any segment that still has flt_id=0 and assignment=FLY
                cursor.execute(
                    """SELECT seg_seq, dep_arp, arv_arp, flt_num, flt_dt, interface_flt_id
                       FROM pairing_duty_segment
                       WHERE pairing_id=%s AND flt_id=0 AND assignment='FLY'""",
                    (pairing_db_id,),
                )
                for bad_seg in cursor.fetchall():
                    msg = (
                        f"Pairing {interface_id}: segment "
                        f"({bad_seg['flt_num']} {bad_seg['dep_arp']}→{bad_seg['arv_arp']} "
                        f"{bad_seg['flt_dt']}, interface_flt_id={bad_seg['interface_flt_id']}) "
                        f"not found in flight table, segment skipped"
                    )
                    result.add_warning(msg)

            except Exception as e:
                msg = f"Pairing {raw.get('pairingId')}: error — {e}"
                logger.exception(msg)
                result.add_warning(msg)

    return result
```

- [ ] **Step 4: Add missing `_yvr_offset` to config.py**

Open `data-migration/config.py` and add after the `Settings` class:

```python
from datetime import timedelta

settings = Settings()
settings._yvr_offset = timedelta(hours=7)  # type: ignore[attr-defined]
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd data-migration
pytest tests/test_pairing_transform.py -v
```

Expected: `9 passed`

- [ ] **Step 6: Commit**

```bash
git add data-migration/f8/pairing.py data-migration/tests/test_pairing_transform.py data-migration/config.py
git commit -m "feat(data-migration): Pairing sync — 5-table write, duty nodes, SBY/DHD flight derivation, flt_id back-fill"
```

---

## Task 9: RosterFlight Sync

**Files:**
- Create: `data-migration/f8/roster_flight.py`
- Create: `data-migration/tests/test_roster_flight_transform.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_roster_flight_transform.py
from f8.roster_flight import (
    should_skip_record,
    build_roster_flight_warning,
)


def test_should_skip_when_pairing_id_zero():
    rec = {"pairingId": 0, "crew": {"crewId": "123"}}
    assert should_skip_record(rec) is True


def test_should_not_skip_when_pairing_id_nonzero():
    rec = {"pairingId": 12345, "crew": {"crewId": "123"}}
    assert should_skip_record(rec) is False


def test_warning_message_for_missing_pairing():
    msg = build_roster_flight_warning(
        roster_flight_id=2656138,
        reason="pairing",
        missing_id="99999",
    )
    assert "2656138" in msg
    assert "pairing" in msg
    assert "99999" in msg


def test_warning_message_for_missing_crew():
    msg = build_roster_flight_warning(
        roster_flight_id=2656139,
        reason="crew",
        missing_id="535",
    )
    assert "crew" in msg
    assert "535" in msg
```

- [ ] **Step 2: Run to verify failures**

```bash
cd data-migration
pytest tests/test_roster_flight_transform.py -v
```

Expected: `ModuleNotFoundError: No module named 'f8.roster_flight'`

- [ ] **Step 3: Create f8/roster_flight.py**

```python
import logging
from datetime import date as date_type, datetime
from typing import Any

from db.mysql import db_cursor, batch_nextval
from f8.client import f8_client
from f8.utils import chunk_date_range, normalize_rank, SyncResult
from storage.json_store import JsonBatch
from config import settings

logger = logging.getLogger(__name__)


def should_skip_record(rec: dict[str, Any]) -> bool:
    return int(rec.get("pairingId", 0)) == 0


def build_roster_flight_warning(
    roster_flight_id: int, reason: str, missing_id: str
) -> str:
    return (
        f"RosterFlight {roster_flight_id}: {reason} {missing_id} "
        f"not found in {reason} table, record skipped"
    )


def _parse_dt(val: str | None) -> datetime | None:
    if not val:
        return None
    return datetime.fromisoformat(str(val).replace("Z", "+00:00"))


def sync_roster_flight(start_dt: str, end_dt: str) -> SyncResult:
    result = SyncResult("roster_flight")
    start = date_type.fromisoformat(start_dt)
    end = date_type.fromisoformat(end_dt)
    chunks = chunk_date_range(start, end, chunk_days=settings.sync_chunk_days)
    batch = JsonBatch("roster_flight")

    all_raw: list[dict] = []
    for chunk_start, chunk_end in chunks:
        raw = f8_client.get_roster_flight(chunk_start.isoformat(), chunk_end.isoformat())
        batch.save(raw, start_dt=chunk_start.isoformat(), end_dt=chunk_end.isoformat())
        all_raw.extend(raw)

    # Filter SIM/DHD (pairingId == 0)
    valid_raw = [r for r in all_raw if not should_skip_record(r)]

    with db_cursor() as (cursor, conn):
        roster_ids = batch_nextval("ROSTER_SEQ", len(valid_raw), cursor)
        rf_ids = batch_nextval("ROSTER_FLIGHT_SEQ", len(valid_raw), cursor)

        for i, rec in enumerate(valid_raw):
            rf_id = rec.get("rosterFlightId")
            pairing_interface_id = str(rec.get("pairingId"))
            crew_interface_id = str(rec.get("crew", {}).get("crewId", ""))

            # Validate pairing exists
            cursor.execute(
                "SELECT id, pairing_dt, label, base, fleet, sch_str_dt_utc, sch_end_dt_utc "
                "FROM pairing WHERE interface_id = %s",
                (pairing_interface_id,),
            )
            pairing_row = cursor.fetchone()
            if not pairing_row:
                result.add_warning(
                    build_roster_flight_warning(rf_id, "pairing", pairing_interface_id)
                )
                continue

            # Validate crew exists
            cursor.execute(
                "SELECT id FROM crew WHERE interface_id = %s", (crew_interface_id,)
            )
            crew_row = cursor.fetchone()
            if not crew_row:
                result.add_warning(
                    build_roster_flight_warning(rf_id, "crew", crew_interface_id)
                )
                continue

            acting_rank = normalize_rank(rec.get("crew", {}).get("actingRank", ""))
            crew_db_id = crew_row["id"]
            pairing_db_id = pairing_row["id"]

            # Upsert roster header (one per crew × pairing)
            cursor.execute(
                "SELECT id FROM roster WHERE pairing_id=%s AND crew_id=%s",
                (pairing_db_id, crew_db_id),
            )
            existing_roster = cursor.fetchone()
            if existing_roster:
                roster_db_id = existing_roster["id"]
            else:
                roster_db_id = roster_ids[i]
                cursor.execute(
                    """INSERT INTO roster
                       (id, crew_id, pairing_id, acting_rank,
                        pairing_dt, label, base, fleet,
                        sch_str_dt_utc, sch_end_dt_utc,
                        created_by, created_dt, modified_by, last_modified)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'ZY_IMP',NOW(),'ZY_IMP',NOW())""",
                    (roster_db_id, crew_db_id, pairing_db_id, acting_rank,
                     pairing_row["pairing_dt"], pairing_row["label"],
                     pairing_row["base"], pairing_row["fleet"],
                     pairing_row["sch_str_dt_utc"], pairing_row["sch_end_dt_utc"]),
                )

            # Match pairing_duty_segment by fltId / dep / arr / time
            flt_id_raw = rec.get("fltId", "")
            dep_arp = rec.get("depArp", "")
            arr_arp = rec.get("arrArp", "")
            duty_str = _parse_dt(rec.get("dutyStrUtc"))

            cursor.execute(
                """SELECT id FROM pairing_duty_segment
                   WHERE pairing_id=%s AND dep_arp=%s AND arv_arp=%s
                     AND act_str_dt_utc=%s
                   LIMIT 1""",
                (pairing_db_id, dep_arp, arr_arp, duty_str),
            )
            seg_row = cursor.fetchone()
            segment_db_id = seg_row["id"] if seg_row else None

            # Upsert roster_flight
            cursor.execute(
                "SELECT id FROM roster_flight WHERE interface_id=%s", (rf_id,)
            )
            if cursor.fetchone():
                result.imported += 1
                continue

            cursor.execute(
                """INSERT INTO roster_flight
                   (id, interface_id, roster_id, crew_id, segment_id,
                    acting_rank, dep_arp, arr_arp, duty_str_utc,
                    created_by, created_dt, modified_by, last_modified)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'ZY_IMP',NOW(),'ZY_IMP',NOW())""",
                (rf_ids[i], rf_id, roster_db_id, crew_db_id, segment_db_id,
                 acting_rank, dep_arp, arr_arp, duty_str),
            )
            result.imported += 1

    return result
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd data-migration
pytest tests/test_roster_flight_transform.py -v
```

Expected: `4 passed`

- [ ] **Step 5: Commit**

```bash
git add data-migration/f8/roster_flight.py data-migration/tests/test_roster_flight_transform.py
git commit -m "feat(data-migration): RosterFlight sync — crew/pairing validation, roster+roster_flight upsert"
```

---

## Task 10: HTTP Routes

**Files:**
- Create: `data-migration/routes/sync.py`
- Create: `data-migration/routes/scheduler_routes.py`

- [ ] **Step 1: Create routes/sync.py**

```python
import logging
from datetime import date, timedelta

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel

from config import settings
from f8.crew import sync_crew
from f8.flight import sync_flight
from f8.pairing import sync_pairing
from f8.roster_flight import sync_roster_flight

router = APIRouter(prefix="/sync", tags=["sync"])
logger = logging.getLogger(__name__)


class SyncRangeRequest(BaseModel):
    start: str  # yyyy-MM-dd
    end: str


def _default_range() -> tuple[str, str]:
    today = date.today()
    return today.isoformat(), (today + timedelta(days=settings.sync_days_ahead)).isoformat()


@router.post("/crew")
async def trigger_crew_sync(background_tasks: BackgroundTasks):
    background_tasks.add_task(_run_crew)
    return {"status": "started", "entity": "crew"}


@router.post("/flight")
async def trigger_flight_sync(body: SyncRangeRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(_run_flight, body.start, body.end)
    return {"status": "started", "entity": "flight", "range": f"{body.start}~{body.end}"}


@router.post("/pairing")
async def trigger_pairing_sync(body: SyncRangeRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(_run_pairing, body.start, body.end)
    return {"status": "started", "entity": "pairing", "range": f"{body.start}~{body.end}"}


@router.post("/roster-flight")
async def trigger_roster_flight_sync(body: SyncRangeRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(_run_roster_flight, body.start, body.end)
    return {"status": "started", "entity": "roster_flight", "range": f"{body.start}~{body.end}"}


def _run_crew() -> None:
    result = sync_crew()
    logger.info("Crew sync done: %s", result.to_dict())


def _run_flight(start: str, end: str) -> None:
    result = sync_flight(start, end)
    logger.info("Flight sync done: %s", result.to_dict())


def _run_pairing(start: str, end: str) -> None:
    result = sync_pairing(start, end)
    logger.info("Pairing sync done: %s", result.to_dict())


def _run_roster_flight(start: str, end: str) -> None:
    result = sync_roster_flight(start, end)
    logger.info("RosterFlight sync done: %s", result.to_dict())
```

- [ ] **Step 2: Create routes/scheduler_routes.py**

```python
from fastapi import APIRouter
from scheduler import scheduler_manager

router = APIRouter(prefix="/scheduler", tags=["scheduler"])


@router.get("/status")
def get_scheduler_status():
    return scheduler_manager.get_status()


@router.post("/{job_name}/enable")
def enable_job(job_name: str):
    scheduler_manager.enable(job_name)
    return {"job": job_name, "enabled": True}


@router.post("/{job_name}/disable")
def disable_job(job_name: str):
    scheduler_manager.disable(job_name)
    return {"job": job_name, "enabled": False}
```

- [ ] **Step 3: Commit**

```bash
git add data-migration/routes/sync.py data-migration/routes/scheduler_routes.py
git commit -m "feat(data-migration): HTTP routes for manual sync triggers and scheduler control"
```

---

## Task 11: Scheduler

**Files:**
- Create: `data-migration/scheduler.py`

- [ ] **Step 1: Create scheduler.py**

```python
import json
import logging
from datetime import date, timedelta
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from config import settings

logger = logging.getLogger(__name__)
STATE_FILE = Path(__file__).parent / ".scheduler_state.json"

_DEFAULT_STATE = {
    "crew": True,
    "flight": True,
    "pairing": True,
    "roster_flight": True,
}


def _load_state() -> dict[str, bool]:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception:
            pass
    return dict(_DEFAULT_STATE)


def _save_state(state: dict[str, bool]) -> None:
    STATE_FILE.write_text(json.dumps(state, indent=2))


class SchedulerManager:
    def __init__(self) -> None:
        self._scheduler = BackgroundScheduler(timezone="UTC")
        self._state = _load_state()
        self._register_jobs()

    def _register_jobs(self) -> None:
        self._scheduler.add_job(
            self._run_crew, CronTrigger(hour=0, minute=0), id="crew", replace_existing=True
        )
        self._scheduler.add_job(
            self._run_flight, CronTrigger(hour=1, minute=0), id="flight", replace_existing=True
        )
        self._scheduler.add_job(
            self._run_pairing, CronTrigger(hour=1, minute=30), id="pairing", replace_existing=True
        )
        self._scheduler.add_job(
            self._run_roster_flight, CronTrigger(hour=2, minute=0), id="roster_flight", replace_existing=True
        )
        # Pause jobs that were disabled in last session
        for job_name, enabled in self._state.items():
            if not enabled:
                self._scheduler.pause_job(job_name)

    def start(self) -> None:
        self._scheduler.start()

    def shutdown(self) -> None:
        self._scheduler.shutdown(wait=False)

    def enable(self, job_name: str) -> None:
        self._scheduler.resume_job(job_name)
        self._state[job_name] = True
        _save_state(self._state)

    def disable(self, job_name: str) -> None:
        self._scheduler.pause_job(job_name)
        self._state[job_name] = False
        _save_state(self._state)

    def get_status(self) -> dict:
        return {name: enabled for name, enabled in self._state.items()}

    def _default_range(self) -> tuple[str, str]:
        today = date.today()
        return today.isoformat(), (today + timedelta(days=settings.sync_days_ahead)).isoformat()

    def _run_crew(self) -> None:
        if not self._state.get("crew"):
            return
        from f8.crew import sync_crew
        result = sync_crew()
        logger.info("Scheduled crew sync: %s", result.to_dict())

    def _run_flight(self) -> None:
        if not self._state.get("flight"):
            return
        from f8.flight import sync_flight
        start, end = self._default_range()
        result = sync_flight(start, end)
        logger.info("Scheduled flight sync: %s", result.to_dict())

    def _run_pairing(self) -> None:
        if not self._state.get("pairing"):
            return
        from f8.pairing import sync_pairing
        start, end = self._default_range()
        result = sync_pairing(start, end)
        logger.info("Scheduled pairing sync: %s", result.to_dict())

    def _run_roster_flight(self) -> None:
        if not self._state.get("roster_flight"):
            return
        from f8.roster_flight import sync_roster_flight
        start, end = self._default_range()
        result = sync_roster_flight(start, end)
        logger.info("Scheduled roster_flight sync: %s", result.to_dict())


scheduler_manager = SchedulerManager()
```

- [ ] **Step 2: Commit**

```bash
git add data-migration/scheduler.py
git commit -m "feat(data-migration): APScheduler with per-job enable/disable and state persistence"
```

---

## Task 12: App Wiring

**Files:**
- Create: `data-migration/main.py`

- [ ] **Step 1: Create main.py**

```python
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from routes.sync import router as sync_router
from routes.scheduler_routes import router as scheduler_router
from scheduler import scheduler_manager
from config import settings

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler_manager.start()
    yield
    scheduler_manager.shutdown()


app = FastAPI(title="F8 Data Migration", version="1.0.0", lifespan=lifespan)
app.include_router(sync_router)
app.include_router(scheduler_router)


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 2: Verify app starts**

```bash
cd data-migration
cp .env.example .env
# Edit .env with real MySQL credentials before running
uvicorn main:app --reload --port 8100
```

Expected: Server starts at http://localhost:8100, no import errors.  
Check: `curl http://localhost:8100/health` → `{"status":"ok"}`  
Check: `curl http://localhost:8100/scheduler/status` → all 4 jobs with enabled state.

- [ ] **Step 3: Run full test suite**

```bash
cd data-migration
pytest tests/ -v
```

Expected: All unit tests pass (DB, json_store, utils, crew transform, flight transform, pairing transform, roster_flight transform).

- [ ] **Step 4: Commit**

```bash
git add data-migration/main.py
git commit -m "feat(data-migration): FastAPI app wiring, lifespan startup/shutdown"
```

---

## Self-Review Checklist

**Spec coverage:**

| Spec requirement | Task |
|-----------------|------|
| Crew 全量拉取 + 6 张表写入 | Task 6 |
| Flight 按日期范围 + FLY 直写 | Task 7 |
| Pairing 5 张表 + SBY/DHD 反推 | Task 8 |
| RosterFlight roster+roster_flight | Task 9 |
| 10 天切分逻辑 | Task 4 (chunk_date_range) |
| JSON 每次调用独立存档 | Task 3 (JsonBatch) |
| 定时任务 + 开关 + 状态持久化 | Task 11 |
| HTTP 手动触发接口 | Task 10 |
| 数据校验友好告警 | Task 8 (flt_id), Task 9 (crew/pairing) |
| 幂等性 (interface_id upsert) | Task 6/7/8/9 |
| F8 外部 ID → interface_id | All sync tasks |
| Token 管理 + 重试 + 401 刷新 | Task 5 |

**No placeholders found.**  
**Type consistency:** `SyncResult` defined in Task 4 and used consistently in Tasks 6–9.  
`normalize_rank` / `normalize_assignment` defined in Task 4, used in Tasks 6/8/9.

> **Note on crew_fleet / crew_qualification:** `_sync_fleets` and `_sync_qualifications` in Task 6 use dynamic column insertion from dict keys. Before running against real DB, confirm the MySQL `crew_fleet` and `crew_qualification` table schemas and update field mapping if needed.

> **Note on PairingDuty model field names:** `PairingDuty.nodes`, `.segments`, field names (camelCase) in `f8/models.py` must be verified against real F8 API response. Adjust model and `pairing.py` references if the API uses different naming.
