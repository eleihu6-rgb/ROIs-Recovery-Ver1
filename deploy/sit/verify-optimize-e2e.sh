#!/usr/bin/env bash
# deploy/sit/verify-optimize-e2e.sh
#
# SIT 端到端验收：预检 → 踢跑优化 → 等到 DONE → 校验 result 元数据 + scenario.roster_flight 入库 + gantt-data。
#
# 用法（在 PortalServer 10.15.12.4 上，或本机经 SSH）：
#   bash deploy/sit/verify-optimize-e2e.sh                 # 默认 scenario 622
#   SCENARIO_ID=619 bash deploy/sit/verify-optimize-e2e.sh
#   PREFLIGHT_ONLY=1 bash deploy/sit/verify-optimize-e2e.sh
#   SKIP_RUN=1 SCENARIO_ID=619 bash ...                   # 只验已有 DONE 的入库
#   REMOTE=1 bash ...                                     # 本机 SSH 到 Portal 执行
#
# 环境变量：
#   SCENARIO_ID     默认 622
#   LIVE_URL        默认 http://127.0.0.1:3000
#   ENGINE_URL      默认 http://127.0.0.1:3003
#   PBS_URL         默认 http://127.0.0.1:3002
#   GANTT_USER / GANTT_PASS  默认 admin / 123456
#   ENV_DIR         默认 /home/rois/sit/env
#   SIT_ROOT        默认 /home/rois/sit
#   RUN_TIMEOUT_S   默认 1200（20 min）
#   DB_WAIT_S       默认 180（DONE 后等异步 loadResultGzIntoDb）
#   MIN_ROSTER_ROWS 默认 1
#   PREFLIGHT_ONLY  1 = 只跑预检
#   SKIP_RUN        1 = 不踢跑，只验当前状态+入库
#   REMOTE          1 = ssh yuan.z@10.15.12.4 执行本脚本
#
# 退出码：0 全绿；非 0 失败阶段见日志。

set -euo pipefail

if [ "${REMOTE:-0}" = "1" ] && [ "${VERIFY_OPTIMIZE_REMOTE:-0}" != "1" ]; then
  SCRIPT_REL="deploy/sit/verify-optimize-e2e.sh"
  # Prefer repo path on build host; on Portal the script may be scp'd next to service.sh.
  REMOTE_SCRIPT="${REMOTE_SCRIPT:-/home/rois/sit/verify-optimize-e2e.sh}"
  if [ -f "$(cd "$(dirname "$0")" && pwd)/verify-optimize-e2e.sh" ]; then
    scp -q "$(cd "$(dirname "$0")" && pwd)/verify-optimize-e2e.sh" "yuan.z@10.15.12.4:$REMOTE_SCRIPT"
  fi
  exec ssh -o BatchMode=yes yuan.z@10.15.12.4 \
    "VERIFY_OPTIMIZE_REMOTE=1 SCENARIO_ID=${SCENARIO_ID:-622} PREFLIGHT_ONLY=${PREFLIGHT_ONLY:-0} SKIP_RUN=${SKIP_RUN:-0} bash $REMOTE_SCRIPT"
fi

SCENARIO_ID="${SCENARIO_ID:-622}"
LIVE_URL="${LIVE_URL:-http://127.0.0.1:3000}"
ENGINE_URL="${ENGINE_URL:-http://127.0.0.1:3003}"
PBS_URL="${PBS_URL:-http://127.0.0.1:3002}"
GANTT_USER="${GANTT_USER:-admin}"
GANTT_PASS="${GANTT_PASS:-123456}"
ENV_DIR="${ENV_DIR:-/home/rois/sit/env}"
SIT_ROOT="${SIT_ROOT:-/home/rois/sit}"
RUN_TIMEOUT_S="${RUN_TIMEOUT_S:-1200}"
DB_WAIT_S="${DB_WAIT_S:-180}"
MIN_ROSTER_ROWS="${MIN_ROSTER_ROWS:-1}"
PREFLIGHT_ONLY="${PREFLIGHT_ONLY:-0}"
SKIP_RUN="${SKIP_RUN:-0}"

PY="${SIT_ROOT}/engine-server/venv/bin/python3"
[ -x "$PY" ] || PY=python3

ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "[$(ts)] $*"; }
ok()  { echo "[$(ts)] ✓ $*"; }
fail() { echo "[$(ts)] ✗ $*" >&2; exit 1; }

export SCENARIO_ID LIVE_URL ENGINE_URL PBS_URL GANTT_USER GANTT_PASS ENV_DIR SIT_ROOT
export RUN_TIMEOUT_S DB_WAIT_S MIN_ROSTER_ROWS PREFLIGHT_ONLY SKIP_RUN

"$PY" - <<'PY'
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Callable, Optional
from urllib.parse import urlparse

# ── env ──────────────────────────────────────────────────────────────
SCENARIO_ID = int(os.environ.get("SCENARIO_ID", "622"))
LIVE_URL = os.environ["LIVE_URL"].rstrip("/")
ENGINE_URL = os.environ["ENGINE_URL"].rstrip("/")
PBS_URL = os.environ["PBS_URL"].rstrip("/")
USER = os.environ["GANTT_USER"]
PASS = os.environ["GANTT_PASS"]
ENV_DIR = Path(os.environ["ENV_DIR"])
SIT_ROOT = Path(os.environ["SIT_ROOT"])
RUN_TIMEOUT_S = int(os.environ["RUN_TIMEOUT_S"])
DB_WAIT_S = int(os.environ["DB_WAIT_S"])
MIN_ROSTER_ROWS = int(os.environ["MIN_ROSTER_ROWS"])
PREFLIGHT_ONLY = os.environ.get("PREFLIGHT_ONLY", "0") == "1"
SKIP_RUN = os.environ.get("SKIP_RUN", "0") == "1"

LIVE_SCHEMA = "f8_sit_live"
SCENARIO_SCHEMA = "f8_sit_scenario"


def log(msg: str) -> None:
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)


def ok(msg: str) -> None:
    log(f"✓ {msg}")


def fail(msg: str) -> None:
    log(f"✗ {msg}")
    sys.exit(1)


def load_env(path: Path) -> dict[str, str]:
    d: dict[str, str] = {}
    if not path.is_file():
        return d
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        d[k] = v.strip().strip('"').strip("'")
    return d


def http_json(
    method: str,
    url: str,
    *,
    token: Optional[str] = None,
    body: Any = None,
    timeout: float = 60,
) -> tuple[int, Any]:
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            if not raw:
                return resp.status, None
            try:
                return resp.status, json.loads(raw.decode())
            except json.JSONDecodeError:
                return resp.status, raw.decode(errors="replace")[:500]
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, raw[:500]
    except Exception as e:
        return 0, f"{type(e).__name__}: {e}"


def unwrap(payload: Any) -> Any:
    if isinstance(payload, dict) and "data" in payload:
        return payload["data"]
    return payload


# ── Phase 0: preflight ───────────────────────────────────────────────
def phase_preflight() -> None:
    log("=== Phase 0: preflight ===")

    # services
    for name, url in (
        ("live-server", f"{LIVE_URL}/health"),
        ("engine-server", f"{ENGINE_URL}/health"),
        ("pbs-server", f"{PBS_URL}/health"),
    ):
        code, body = http_json("GET", url, timeout=5)
        # live/pbs may return 401 without auth on /health — still means up
        if code in (200, 401):
            ok(f"{name} up (HTTP {code})")
        else:
            fail(f"{name} not reachable: HTTP {code} {body}")

    # JWT alignment
    live_env = load_env(ENV_DIR / "live-server.env")
    eng_env = load_env(ENV_DIR / "engine-server.env")
    live_jwt = live_env.get("JWT_SECRET", "")
    eng_jwt = eng_env.get("JWT_SECRET", "")
    if not live_jwt:
        fail("live-server.env missing JWT_SECRET")
    if not eng_jwt:
        fail("engine-server.env missing JWT_SECRET (see deploy/sit/CONFIG.md)")
    if live_jwt != eng_jwt:
        fail("JWT_SECRET mismatch: live-server.env vs engine-server.env")
    if eng_jwt in ("${JWT_SECRET}", "your_jwt_secret_here", "replace-with-same-value-as-live-server-jwt-secret"):
        fail(f"JWT_SECRET still placeholder: {eng_jwt!r}")
    ok(f"JWT_SECRET aligned (len={len(live_jwt)})")

    # pbs-engine source integrity
    pe = SIT_ROOT / "pbs-engine"
    for rel in ("run_solver.py", "ColumnModelSolver_python", "pyproject.toml"):
        p = pe / rel
        if not (p.is_file() or p.is_dir()):
            fail(f"pbs-engine missing {rel} under {pe} — solver will ModuleNotFoundError")
    ok("pbs-engine source present (run_solver.py + ColumnModelSolver_python)")

    solver_py = pe / ".venv" / "bin" / "python3"
    if not solver_py.is_file():
        fail(f"missing {solver_py}")
    chk = subprocess.run(
        [
            str(solver_py),
            "-c",
            "import sys; sys.path.insert(0, r'%s'); "
            "from ColumnModelSolver_python.io.loader import load_from_ro_input; "
            "import rois_rule_engine_rs; print('OK')" % pe,
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if chk.returncode != 0 or "OK" not in (chk.stdout or ""):
        fail(
            "pbs-engine import probe failed:\n"
            f"stdout={chk.stdout!r}\nstderr={chk.stderr!r}"
        )
    ok("pbs-engine imports ColumnModelSolver_python + rois_rule_engine_rs")

    # Hydra experiment path must resolve (SIT regression: default deploy/prod_0604 missing)
    eng_env_full = load_env(ENV_DIR / "engine-server.env")
    experiment = eng_env_full.get("RO_EXPERIMENT") or os.environ.get("RO_EXPERIMENT") or "deploy/sit"
    # Hydra group path: conf/experiments/deploy/sit.yaml for deploy/sit
    candidates = [
        pe / "conf" / "experiments" / f"{experiment}.yaml",
        pe / "conf" / "experiments" / experiment / "config.yaml",
    ]
    if not any(c.is_file() for c in candidates):
        fail(
            f"RO_EXPERIMENT={experiment!r} not found under {pe}/conf/experiments/ "
            f"(tried {[str(c.relative_to(pe)) for c in candidates]}). "
            f"Set RO_EXPERIMENT=deploy/sit in engine-server.env"
        )
    hydra_script = (
        "import os\n"
        f"os.chdir({str(pe)!r})\n"
        "from hydra import compose, initialize_config_dir\n"
        f"with initialize_config_dir(config_dir={str(pe / 'conf')!r}, version_base=None):\n"
        f"    compose(config_name='config', overrides=['+experiments={experiment}'])\n"
        "print('OK')\n"
    )
    hydra_chk = subprocess.run(
        [str(solver_py), "-c", hydra_script],
        capture_output=True,
        text=True,
        timeout=30,
        cwd=str(pe),
    )
    if hydra_chk.returncode != 0 or "OK" not in (hydra_chk.stdout or ""):
        fail(
            f"Hydra cannot compose +experiments={experiment}:\n"
            f"stderr={(hydra_chk.stderr or '')[:400]}"
        )
    ok(f"Hydra experiment OK (+experiments={experiment})")

    # login
    code, body = http_json(
        "POST",
        f"{LIVE_URL}/api/auth/login",
        body={"userCode": USER, "password": PASS},
        timeout=15,
    )
    data = unwrap(body) if code == 200 else None
    if code != 200 or not isinstance(data, dict) or not data.get("token"):
        fail(f"login failed HTTP {code}: {body}")
    ok(f"login ok user={data.get('userCode')} schema={data.get('schema')}")


def login() -> str:
    code, body = http_json(
        "POST",
        f"{LIVE_URL}/api/auth/login",
        body={"userCode": USER, "password": PASS},
        timeout=15,
    )
    data = unwrap(body)
    if code != 200 or not isinstance(data, dict) or not data.get("token"):
        fail(f"login failed HTTP {code}: {body}")
    return str(data["token"])


def get_scenario(token: str) -> dict[str, Any]:
    code, body = http_json(
        "GET", f"{LIVE_URL}/api/scenario/{SCENARIO_ID}", token=token, timeout=30
    )
    data = unwrap(body)
    if code != 200 or not isinstance(data, dict):
        fail(f"GET scenario {SCENARIO_ID} → {code}: {body}")
    return data


def transition(token: str, status: str) -> None:
    code, body = http_json(
        "POST",
        f"{LIVE_URL}/api/scenario/{SCENARIO_ID}/transition",
        token=token,
        body={"status": status},
        timeout=60,
    )
    if code not in (200, 201):
        fail(f"transition → {status} failed HTTP {code}: {body}")
    ok(f"transition → {status}")


def ensure_draft(token: str) -> None:
    sc = get_scenario(token)
    st = str(sc.get("status") or "")
    log(f"scenario {SCENARIO_ID} status={st} name={sc.get('name')!r}")
    if st == "DRAFT":
        ok("already DRAFT")
        return
    if st == "RUNNING":
        # cannot DRAFT from RUNNING; mark FAILED then DRAFT
        log("RUNNING → FAILED → DRAFT")
        transition(token, "FAILED")
        transition(token, "DRAFT")
        return
    if st in ("DONE", "FAILED", "PUBLISHED"):
        transition(token, "DRAFT")
        return
    fail(f"unknown status {st!r}")


def db_connect():
    import psycopg2

    live_env = load_env(ENV_DIR / "live-server.env")
    url = live_env.get("DATABASE_URL")
    if not url:
        fail("DATABASE_URL missing in live-server.env")
    # honor SCENARIO_SCHEMA / LIVE_SCHEMA from env if present
    global LIVE_SCHEMA, SCENARIO_SCHEMA
    LIVE_SCHEMA = live_env.get("LIVE_SCHEMA") or LIVE_SCHEMA
    SCENARIO_SCHEMA = live_env.get("SCENARIO_SCHEMA") or SCENARIO_SCHEMA
    return psycopg2.connect(url)


def db_scenario_row(conn) -> dict[str, Any]:
    cur = conn.cursor()
    cur.execute(
        f"""
        select id, name, status, task_id, file_path, file_size, checksum,
               optimized_count, updated_at
        from {LIVE_SCHEMA}.scenario where id = %s
        """,
        (SCENARIO_ID,),
    )
    row = cur.fetchone()
    if not row:
        fail(f"scenario {SCENARIO_ID} not in {LIVE_SCHEMA}.scenario")
    cols = [
        "id",
        "name",
        "status",
        "task_id",
        "file_path",
        "file_size",
        "checksum",
        "optimized_count",
        "updated_at",
    ]
    return dict(zip(cols, row))


def db_roster_stats(conn) -> dict[str, Any]:
    cur = conn.cursor()
    cur.execute(
        f"""
        select count(*)::int,
               count(*) filter (where pairing_id is not null)::int,
               count(*) filter (where pairing_id is null)::int,
               count(distinct crew_id)::int
        from {SCENARIO_SCHEMA}.roster_flight
        where scenario_id = %s
        """,
        (SCENARIO_ID,),
    )
    total, flying, ground, crews = cur.fetchone()
    cur.execute(
        f"""
        select coalesce(source, ''), count(*)::int
        from {SCENARIO_SCHEMA}.roster_flight
        where scenario_id = %s
        group by 1 order by 2 desc
        """,
        (SCENARIO_ID,),
    )
    sources = {str(s): int(n) for s, n in cur.fetchall()}
    return {
        "total": int(total),
        "flying": int(flying),
        "ground": int(ground),
        "crews": int(crews),
        "sources": sources,
    }


def wait_status(token: str, accept: Callable[[str], bool], timeout_s: int, poll_s: float = 5.0) -> str:
    deadline = time.time() + timeout_s
    last = ""
    while time.time() < deadline:
        sc = get_scenario(token)
        last = str(sc.get("status") or "")
        log(f"  poll status={last} taskId={sc.get('taskId')}")
        if accept(last):
            return last
        time.sleep(poll_s)
    fail(f"timeout waiting for status (last={last})")
    return last


def wait_roster(conn, min_rows: int, timeout_s: int) -> dict[str, Any]:
    """loadScenarioResultIntoDb is fire-and-forget after DONE — poll partitions."""
    deadline = time.time() + timeout_s
    last: dict[str, Any] = {}
    while time.time() < deadline:
        conn.rollback()
        last = db_roster_stats(conn)
        log(f"  poll roster total={last['total']} flying={last['flying']} ground={last['ground']} crews={last['crews']} sources={last['sources']}")
        if last["total"] >= min_rows:
            return last
        time.sleep(3)
    fail(
        f"timeout waiting for scenario.roster_flight rows "
        f"(need>={min_rows}, last={last}). "
        f"Check live-server log for 'DB load failed' / 'loaded into DB'."
    )
    return last


def phase_run(token: str) -> str:
    log("=== Phase 1: kick off optimize ===")
    ensure_draft(token)

    # /run is synchronous through engine start (can take minutes for ro_input+bids)
    log(f"POST /api/scenario/{SCENARIO_ID}/run (timeout={RUN_TIMEOUT_S}s for full solve poll later)")
    code, body = http_json(
        "POST",
        f"{LIVE_URL}/api/scenario/{SCENARIO_ID}/run",
        token=token,
        body={},
        timeout=min(RUN_TIMEOUT_S, 600),
    )
    if code != 200:
        fail(f"/run failed HTTP {code}: {body}")
    data = unwrap(body) or {}
    task_id = (data.get("taskId") if isinstance(data, dict) else None) or ""
    ok(f"/run accepted taskId={task_id or '(pending in DB)'}")

    log("=== Phase 2: wait terminal status ===")
    status = wait_status(
        token,
        lambda s: s in ("DONE", "FAILED"),
        RUN_TIMEOUT_S,
        poll_s=8.0,
    )
    if status != "DONE":
        # dump engine hint
        log_path = SIT_ROOT / "logs" / "engine-server.log"
        if log_path.is_file():
            tail = log_path.read_text(errors="replace").splitlines()[-40:]
            log("engine-server.log tail:")
            for line in tail:
                print(f"    {line}")
        fail(f"scenario ended status={status} (expected DONE)")
    ok("status=DONE")
    return task_id


def phase_assert_persist(token: str) -> None:
    log("=== Phase 3: assert result metadata + DB persistence ===")
    conn = db_connect()
    try:
        row = db_scenario_row(conn)
        log(
            f"DB scenario status={row['status']} task_id={row['task_id']} "
            f"file_path={row['file_path']} optimized_count={row['optimized_count']}"
        )
        if row["status"] != "DONE":
            fail(f"DB status is {row['status']!r}, expected DONE")
        if not row["task_id"]:
            fail("task_id empty after DONE")
        if not row["file_path"]:
            fail("file_path empty after DONE (engine callback metadata missing)")
        ok(f"result metadata: task_id + file_path set (size={row['file_size']})")

        # async DB load
        log(f"waiting up to {DB_WAIT_S}s for {SCENARIO_SCHEMA}.roster_flight load…")
        stats = wait_roster(conn, MIN_ROSTER_ROWS, DB_WAIT_S)
        ok(
            f"roster_flight rows={stats['total']} flying={stats['flying']} "
            f"ground={stats['ground']} crews={stats['crews']}"
        )
        if stats["total"] < MIN_ROSTER_ROWS:
            fail(f"roster rows {stats['total']} < MIN_ROSTER_ROWS={MIN_ROSTER_ROWS}")
        if stats["crews"] < 1:
            fail("no distinct crew_id in roster_flight")

        # optimizer / leadin sources (CR or OPT used historically; leadin optional)
        sources = stats["sources"]
        assigned_like = sum(
            n for k, n in sources.items() if k.upper() in ("CR", "OPT", "SOLVER", "RO")
        )
        if assigned_like < 1 and stats["flying"] < 1 and stats["ground"] < 1:
            fail(f"unexpected source distribution: {sources}")
        ok(f"sources={sources}")

        # manday monthly (best-effort — some scenarios may only have roster)
        cur = conn.cursor()
        manday_total = 0
        for t in (
            "crew_manday_fd_monthly",
            "crew_manday_cc_am_monthly",
        ):
            try:
                cur.execute(
                    f"select count(*)::int from {SCENARIO_SCHEMA}.{t} where scenario_id=%s",
                    (SCENARIO_ID,),
                )
                manday_total += int(cur.fetchone()[0])
            except Exception as e:
                conn.rollback()
                log(f"  manday table {t}: skip ({e})")
        if manday_total > 0:
            ok(f"crew_manday_*_monthly rows={manday_total}")
        else:
            log("⚠ no monthly manday rows (warn only — roster is required gate)")
    finally:
        conn.close()

    # gantt-data API (same path UI opens)
    log("=== Phase 4: gantt-data API ===")
    code, body = http_json(
        "GET",
        f"{LIVE_URL}/api/scenario/{SCENARIO_ID}/gantt-data",
        token=token,
        timeout=120,
    )
    data = unwrap(body)
    if code != 200 or not isinstance(data, dict):
        fail(f"gantt-data HTTP {code}: {body}")
    crew = data.get("crew") or data.get("crews") or []
    assignments = data.get("assignments") or data.get("rosters") or []
    ground = data.get("groundItems") or []
    crew_n = len(crew) if isinstance(crew, list) else 0
    asg_n = len(assignments) if isinstance(assignments, list) else 0
    gr_n = len(ground) if isinstance(ground, list) else 0
    log(f"gantt-data crew={crew_n} assignments={asg_n} groundItems={gr_n}")
    if crew_n < 1:
        fail("gantt-data crew empty after DONE+DB load")
    if asg_n + gr_n < 1:
        fail("gantt-data has no assignments/groundItems — UI would show empty roster")
    ok(f"gantt-data usable (crew={crew_n}, duties={asg_n + gr_n})")


def main() -> None:
    log(f"SIT optimize E2E — scenario={SCENARIO_ID} live={LIVE_URL}")
    phase_preflight()
    if PREFLIGHT_ONLY:
        ok("PREFLIGHT_ONLY complete")
        return

    token = login()
    if not SKIP_RUN:
        phase_run(token)
    else:
        sc = get_scenario(token)
        log(f"SKIP_RUN=1 current status={sc.get('status')}")
        if str(sc.get("status")) != "DONE":
            fail(f"SKIP_RUN requires DONE scenario, got {sc.get('status')}")

    phase_assert_persist(token)
    ok("ALL PHASES PASSED — optimize → DONE → DB roster → gantt-data")


if __name__ == "__main__":
    main()
PY
