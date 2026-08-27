# Scenario Optimization Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Gantt「Run scenario」→ live-server → engine-server → ro-engine so a scenario is optimized end-to-end, with live-server exporting a filtered raw-table `ro_input.gz`, engine-server archiving results to `complete/` and writing back metadata, and Gantt reading the optimized roster back on open.

**Architecture:** live-server gains a run-trigger, a performant raw-table CSV exporter (`ro_input.gz`, `## table` sections, all queries concurrent / no N+1), a result-callback writer, and a roster read-back endpoint. engine-server reuses its existing RO task lifecycle; it adds a `complete/` archive step, switches result submission to metadata-JSON, and serves the result file on demand (approach **B**). Gantt wires the real Run button + a rule-group selector.

**Tech Stack:** live-server (Fastify + Drizzle + Vitest), engine-server (FastAPI + pytest), gantt (React 19 + Vite + Playwright). Spec: `docs/superpowers/specs/2026-06-02-scenario-optimization-loop-design.md`.

---

## File Structure

**engine-server (Python)**
- Modify `config.yaml.example` — RO optimizer `server_integration`, input/output URLs, `paths.complete_dir`.
- Modify `src/files/file_manager.py` — add `move_to_complete()`.
- Modify `src/tasks/task_manager.py` — RO success → `move_to_complete` + build metadata, submit metadata JSON (not bytes).
- Modify `src/utils/http_client.py` — add `submit_result_metadata()` (JSON body).
- Modify `src/api/routes.py` + `src/api/models.py` — add `GET /optimize/result/{task_id}` (serve `ro_output.gz`).
- Tests: `tests/test_file_management.py`, `tests/test_output_interface.py`, `tests/test_optimize_api.py`.

**live-server (TypeScript)**
- Modify `src/config/env.ts` — `ENGINE_SERVER_URL`.
- Create `src/services/engine-server-client.ts` — start RO task, fetch result file.
- Create `src/services/scenario/scenario-export-service.ts` — raw-table → `ro_input.gz`.
- Create `src/services/scenario/scenario-result-service.ts` — result callback + roster read-back.
- Modify `src/services/scenario/scenario-service.ts` — `run()` orchestration.
- Modify `src/routes/scenario/scenario.ts` — `/:id/run`, `/export`, `/result`, `/:id/roster`.
- Modify `src/models/scenario/scenario.ts` — add `taskId` column (track running task).
- Tests: `src/__tests__/services/scenario/scenario-export-service.test.ts`, `scenario-result-service.test.ts`, `scenario-service.test.ts`.

**gantt (TypeScript/React)**
- Modify `src/services/scenario-api.ts` — `run()`, `getRoster()`.
- Modify `src/stores/scenario-store.ts` — `runScenario()`, poll, `openScenarioRoster()`.
- Modify `src/components/scenario/scenario-toolbar.tsx` — real Run wiring.
- Modify `src/components/scenario/scenario-detail-panel.tsx` — rule-group selector.
- Modify `gantt/src/version.ts` — version bump.
- Test: `e2e/gantt/scenario-run.spec.ts`.

---

## Conventions for this plan

- live-server raw SQL uses Drizzle's `sql` template + `fastify.db.execute(sql\`...\`)`; results read from `.rows`.
- engine-server tests run from `engine-server/`: `python3 -m pytest <file> -v`.
- live-server tests run from `live-server/`: `npx vitest run <file>`.
- Commit after each task. Branch first (we are on `main`): `git checkout -b feat/live-server/scenario-optimization-loop`.

---

## Task 0: Branch

- [ ] **Step 1: Create the feature branch**

```bash
cd /home/yuan.z/rois/rois-ai
git checkout -b feat/live-server/scenario-optimization-loop
```

- [ ] **Step 2: Confirm clean baseline**

Run: `git status`
Expected: on `feat/live-server/scenario-optimization-loop`.

---

## Task 1: engine-server — `move_to_complete()`

**Files:**
- Modify: `engine-server/src/files/file_manager.py`
- Modify: `engine-server/config.yaml.example` (add `paths.complete_dir`)
- Test: `engine-server/tests/test_file_management.py`

- [ ] **Step 1: Write the failing test**

Add to `engine-server/tests/test_file_management.py`:

```python
def test_move_to_complete_keeps_input_and_output(tmp_path, monkeypatch):
    from src.files.file_manager import file_manager

    # working dir with the two artifacts
    work = tmp_path / "task_dir"
    work.mkdir()
    (work / "input.gz").write_bytes(b"IN")
    (work / "output.gz").write_bytes(b"OUT")

    complete_root = tmp_path / "complete"
    monkeypatch.setattr(file_manager.paths, "complete_dir", str(complete_root))

    dst = file_manager.move_to_complete(str(work), "f8", "123")

    assert dst is not None
    assert os.path.isfile(os.path.join(dst, "input.gz"))
    assert os.path.isfile(os.path.join(dst, "output.gz"))
    # lands under complete/<airline>/<scenario>/
    assert os.path.normpath(dst).startswith(os.path.normpath(str(complete_root / "f8" / "123")))
```

Ensure `import os` is present at the top of the test file.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd engine-server && python3 -m pytest tests/test_file_management.py::test_move_to_complete_keeps_input_and_output -v`
Expected: FAIL — `AttributeError: ... 'complete_dir'` or `move_to_complete` not defined.

- [ ] **Step 3: Add `complete_dir` to config model + example**

In `engine-server/config.yaml.example`, under the `paths:` block add:

```yaml
  complete_dir: "data/complete"
```

In `engine-server/src/config/config.py`, locate the `paths` config model (alongside `finished_dir`, `archive_dir`) and add a `complete_dir` field with default `"data/complete"`, mirroring how `finished_dir` is declared.

- [ ] **Step 4: Implement `move_to_complete`**

Add to `FileManager` in `engine-server/src/files/file_manager.py`:

```python
    def move_to_complete(self, source_dir: str, airline: str, scenario_id: str) -> Optional[str]:
        """将成功的场景任务目录移动至 complete/<airline>/<scenario_id>/，保留 input.gz + output.gz。

        返回目标目录绝对路径；失败返回 None。
        """
        with self._lock:
            try:
                if not os.path.isdir(source_dir):
                    logger.warning("源目录不存在: %s", source_dir)
                    return None

                dst_dir = os.path.join(self.paths.complete_dir, airline, str(scenario_id))
                # 同名场景重复优化时追加时间戳，保留历史
                if os.path.exists(dst_dir):
                    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
                    dst_dir = f"{dst_dir}_{timestamp}"
                os.makedirs(os.path.dirname(dst_dir), exist_ok=True)

                shutil.move(source_dir, dst_dir)
                logger.info("场景任务目录已移动至 complete: %s", dst_dir)
                return os.path.abspath(dst_dir)
            except Exception as e:
                logger.error("移动场景任务目录失败: %s", e, exc_info=True)
                return None
```

- [ ] **Step 5: Run it to verify it passes**

Run: `cd engine-server && python3 -m pytest tests/test_file_management.py::test_move_to_complete_keeps_input_and_output -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add engine-server/src/files/file_manager.py engine-server/src/config/config.py engine-server/config.yaml.example engine-server/tests/test_file_management.py
git commit -m "feat(engine-server): add move_to_complete for scenario RO archive"
```

---

## Task 2: engine-server — submit result as metadata JSON

The RO output callback must send metadata (path/size/checksum/KPI/RESULT_META), not raw bytes. We parse `ro_output.gz` (`## SECTION` CSV) to extract `KPI` and `RESULT_META`.

**Files:**
- Modify: `engine-server/src/utils/http_client.py`
- Modify: `engine-server/src/tasks/task_manager.py`
- Test: `engine-server/tests/test_output_interface.py`

- [ ] **Step 1: Write the failing test for the gz parser**

Add to `engine-server/tests/test_output_interface.py`:

```python
def test_parse_output_sections_extracts_kpi_and_meta(tmp_path):
    import gzip
    from src.tasks.task_manager import parse_output_sections

    content = (
        "## RESULT_META\n"
        "status,assignments\n"
        "DONE,412\n"
        "## KPI\n"
        "code,value\n"
        "coverage,0.99\n"
        "## ASSIGNMENTS\n"
        "crew_id,pairing_id\n"
        "F8001,5001\n"
    )
    gz = tmp_path / "output.gz"
    with gzip.open(gz, "wb") as f:
        f.write(content.encode("utf-8"))

    sections = parse_output_sections(str(gz))

    assert sections["RESULT_META"] == [{"status": "DONE", "assignments": "412"}]
    assert sections["KPI"] == [{"code": "coverage", "value": "0.99"}]
    # ASSIGNMENTS parsed too (used elsewhere); presence is enough here
    assert sections["ASSIGNMENTS"][0]["crew_id"] == "F8001"
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd engine-server && python3 -m pytest tests/test_output_interface.py::test_parse_output_sections_extracts_kpi_and_meta -v`
Expected: FAIL — `cannot import name 'parse_output_sections'`.

- [ ] **Step 3: Implement the parser (module-level in task_manager.py)**

Add near the top of `engine-server/src/tasks/task_manager.py` (after imports):

```python
import csv
import gzip
import hashlib
import io


def parse_output_sections(gz_path: str) -> Dict[str, List[dict]]:
    """解析 ro-engine output.gz 的 `## SECTION` CSV 段为 {section: [rows]}。"""
    with gzip.open(gz_path, "rb") as f:
        text = f.read().decode("utf-8")

    sections: Dict[str, List[dict]] = {}
    current: Optional[str] = None
    lines: List[str] = []

    def _flush():
        if current is not None:
            sections[current] = list(csv.DictReader(lines))

    for raw in text.splitlines():
        s = raw.strip()
        if s.startswith("## "):
            _flush()
            current = s[3:].strip()
            lines = []
        elif not s or s.startswith("#"):
            continue
        else:
            lines.append(raw)
    _flush()
    return sections
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd engine-server && python3 -m pytest tests/test_output_interface.py::test_parse_output_sections_extracts_kpi_and_meta -v`
Expected: PASS.

- [ ] **Step 5: Add `submit_result_metadata` to the HTTP client**

Add to `LiveServerClient` in `engine-server/src/utils/http_client.py`:

```python
    def submit_result_metadata(self, airline: str, url_path: str,
                               metadata: Dict[str, Any],
                               extra_headers: Optional[Dict[str, str]] = None) -> bool:
        """向 Live Server 提交优化结果元数据（JSON）。"""
        self._post(
            airline,
            url_path,
            body=metadata,                       # dict -> json=
            content_type='application/json',
            extra_headers=extra_headers,
            error_prefix="提交结果元数据失败",
        )
        return True
```

- [ ] **Step 6: Rewrite `Task._submit_output_data` to send metadata + archive to complete**

Replace the body of `_submit_output_data` in `engine-server/src/tasks/task_manager.py` so it (for RO/scenario tasks) parses the output, moves to `complete/`, and posts metadata. Keep the existing bytes-submit path for non-scenario optimizers by branching on `optimizer_type`:

```python
    def _submit_output_data(self) -> bool:
        optimizer_config = config_manager.get_optimizer_config(self.airline, self.optimizer_type)
        if not self._server_integration_enabled(optimizer_config):
            logger.info("[Task %s] server_integration未启用，跳过提交output", self.task_id)
            return False

        self.output_file_path = os.path.join(self.working_dir, "output.gz")
        if not os.path.exists(self.output_file_path):
            raise OutputSubmitError(f"[Task {self.task_id}] 输出文件不存在: {self.output_file_path}")

        try:
            output_url = self._resolve_url_path(optimizer_config, "output")
        except ValueError as e:
            raise OutputSubmitError(f"[Task {self.task_id}] {e}") from e

        base_url, token = self._resolve_live_server_auth()

        # 解析 output.gz 段，提取 KPI / RESULT_META
        try:
            sections = parse_output_sections(self.output_file_path)
        except Exception as e:
            raise OutputSubmitError(f"[Task {self.task_id}] 解析output.gz失败: {e}") from e

        result_meta = sections.get("RESULT_META", [{}])
        status = (result_meta[0].get("status") if result_meta else None) or "DONE"

        # 归档到 complete/<airline>/<scenario>/，记录路径
        scenario_id = str(self.parameters.get("scenarioId", ""))
        with open(self.output_file_path, "rb") as f:
            out_bytes = f.read()
        complete_dir = file_manager.move_to_complete(self.working_dir, self.airline, scenario_id)
        # move 之后 working_dir 已迁移，更新结果文件路径
        file_path = os.path.join(complete_dir, "output.gz") if complete_dir else self.output_file_path

        metadata = {
            "scenarioId": int(scenario_id) if scenario_id.isdigit() else scenario_id,
            "taskId": self.task_id,
            "status": status,
            "filePath": file_path,
            "fileSize": len(out_bytes),
            "checksum": hashlib.sha256(out_bytes).hexdigest(),
            "kpi": sections.get("KPI", []),
            "resultMeta": result_meta[0] if result_meta else {},
        }

        try:
            with create_live_server_client(base_url, token) as client:
                client.submit_result_metadata(self.airline, output_url, metadata)
        except Exception as e:
            raise OutputSubmitError(f"[Task {self.task_id}] 提交结果元数据失败: {e}") from e

        logger.info("[Task %s] 成功提交结果元数据, status=%s, path=%s", self.task_id, status, file_path)
        return True
```

> Note: because `move_to_complete` already relocates the task dir, the existing `_monitor_task` success branch must NOT also call `file_manager.move_to_finished` for scenario tasks. Update `_monitor_task`: in the success branch, only call `move_to_finished` when `move_to_complete` was not used (i.e., when `_submit_output_data` returned `False`/server_integration disabled). Simplest: have `_submit_output_data` return `True` on success and skip `move_to_finished` when it returned `True`.

- [ ] **Step 7: Guard `_monitor_task` against double-move**

In `engine-server/src/tasks/task_manager.py` `_monitor_task` success branch, change:

```python
                submitted = False
                try:
                    submitted = self._submit_output_data()
                except OutputSubmitError as e:
                    ...
                if submit_failed:
                    file_manager.move_to_finished(self.working_dir, self.airline, suffix="_submit_failed")
                else:
                    if not submitted:
                        file_manager.move_to_finished(self.working_dir, self.airline)
                    self.status = TaskStatus.COMPLETED
```

(Keep the existing `submit_failed` handling; only add the `submitted` flag and the `if not submitted` guard.)

- [ ] **Step 8: Run the engine-server suite**

Run: `cd engine-server && python3 -m pytest tests/test_output_interface.py tests/test_file_management.py tests/test_e2e_lifecycle.py -v`
Expected: PASS (update any existing test that asserted raw-bytes submission for RO to assert metadata JSON instead; PO/Rule paths unchanged).

- [ ] **Step 9: Commit**

```bash
git add engine-server/src/tasks/task_manager.py engine-server/src/utils/http_client.py engine-server/tests/test_output_interface.py
git commit -m "feat(engine-server): RO result submit as metadata JSON + archive to complete"
```

---

## Task 3: engine-server — serve result file (`GET /optimize/result/{task_id}`)

Approach B: live-server fetches `ro_output.gz` on demand.

**Files:**
- Modify: `engine-server/src/api/routes.py`
- Test: `engine-server/tests/test_optimize_api.py`

- [ ] **Step 1: Write the failing test**

Add to `engine-server/tests/test_optimize_api.py` (follow the existing auth fixture/client pattern in that file):

```python
def test_get_result_returns_output_bytes(client, auth_headers, monkeypatch):
    from src.tasks.task_manager import task_manager, Task

    # craft a task with a known output file
    import tempfile, gzip, os
    d = tempfile.mkdtemp()
    out = os.path.join(d, "output.gz")
    with gzip.open(out, "wb") as f:
        f.write(b"## RESULT_META\nstatus\nDONE\n")

    t = Task("tid-1", "f8", "RO", {"scenarioId": 1})
    t.output_file_path = out
    task_manager.tasks["tid-1"] = t

    resp = client.get("/optimize/result/tid-1", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.content[:2] == b"\x1f\x8b"  # gzip magic
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd engine-server && python3 -m pytest tests/test_optimize_api.py::test_get_result_returns_output_bytes -v`
Expected: FAIL — 404 (route missing).

- [ ] **Step 3: Implement the route**

Add to `engine-server/src/api/routes.py`:

```python
from fastapi.responses import FileResponse

@router.get("/optimize/result/{task_id}")
async def get_optimization_result(task_id: str, auth: AuthContext = Depends(verify_token)):
    """返回任务的 output.gz 字节（approach B：Live Server 按需拉取）。"""
    task = task_manager.get_task(task_id)
    if not task or not task.output_file_path:
        raise HTTPException(status_code=404, detail="结果文件不存在")
    import os
    if not os.path.exists(task.output_file_path):
        raise HTTPException(status_code=404, detail="结果文件已被清理")
    return FileResponse(task.output_file_path, media_type="application/gzip",
                        filename="ro_output.gz")
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd engine-server && python3 -m pytest tests/test_optimize_api.py::test_get_result_returns_output_bytes -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine-server/src/api/routes.py engine-server/tests/test_optimize_api.py
git commit -m "feat(engine-server): serve RO result file via GET /optimize/result/{task_id}"
```

---

## Task 4: engine-server — RO optimizer config

**Files:**
- Modify: `engine-server/config.yaml.example`

- [ ] **Step 1: Configure the RO optimizer block**

In `engine-server/config.yaml.example`, ensure the RO optimizer (per airline, e.g. `f8`) has:

```yaml
        RO:
          executable: "ro-engine/dist/ro_engine"   # keep existing value if present
          server_integration: true
          url:
            input: "/api/scenario/export"
            output: "/api/scenario/result"
```

> Only edit the example file (real `config.yaml` is gitignored and copied per-host). Do not change PO/Rule blocks.

- [ ] **Step 2: Sanity-load config**

Run: `cd engine-server && python3 -c "from src.config.config import config_manager; print('ok')"`
Expected: prints `ok` (no schema error).

- [ ] **Step 3: Commit**

```bash
git add engine-server/config.yaml.example
git commit -m "chore(engine-server): RO optimizer server_integration + scenario URLs"
```

---

## Task 5: live-server — env + engine-server client

**Files:**
- Modify: `live-server/src/config/env.ts`
- Create: `live-server/src/services/engine-server-client.ts`
- Test: `live-server/src/__tests__/services/engine-server-client.test.ts`

- [ ] **Step 1: Add the env var**

In `live-server/src/config/env.ts`, add to the schema:

```typescript
  ENGINE_SERVER_URL: z.string().url().default('http://localhost:3003'),
```

- [ ] **Step 2: Write the failing test**

Create `live-server/src/__tests__/services/engine-server-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { engineServerClient } from '../../services/engine-server-client.js'

describe('engineServerClient', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('startRoTask posts type=RO with scenarioId and forwards token', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ task_id: 't-1', status: 'started' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const taskId = await engineServerClient.startRoTask({
      scenarioId: 123, liveServerUrl: 'http://live', token: 'JWT', airline: 'f8',
    })

    expect(taskId).toBe('t-1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/optimize/start')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.type).toBe('RO')
    expect(body.parameters.scenarioId).toBe(123)
    expect(body.token).toBe('JWT')
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd live-server && npx vitest run src/__tests__/services/engine-server-client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the client**

Create `live-server/src/services/engine-server-client.ts`:

```typescript
import { env } from '../config/index.js'

interface StartRoTaskArgs {
  scenarioId: number
  liveServerUrl: string
  token: string
  airline: string
}

const HEADERS = (token: string, airline: string): Record<string, string> => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
  'X-Airline': airline,
})

export const engineServerClient = {
  /** Start an RO optimization task; returns engine-server task_id. */
  async startRoTask({ scenarioId, liveServerUrl, token, airline }: StartRoTaskArgs): Promise<string> {
    const res = await fetch(`${env.ENGINE_SERVER_URL}/optimize/start`, {
      method: 'POST',
      headers: HEADERS(token, airline),
      body: JSON.stringify({
        type: 'RO',
        parameters: { scenarioId },
        url: liveServerUrl,
        token,
      }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) throw new Error(`engine-server /optimize/start ${res.status}: ${await res.text()}`)
    const json = (await res.json()) as { task_id: string }
    return json.task_id
  },

  /** Fetch ro_output.gz bytes for a finished task (approach B). */
  async fetchResultFile(taskId: string, token: string, airline: string): Promise<Buffer> {
    const res = await fetch(`${env.ENGINE_SERVER_URL}/optimize/result/${taskId}`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Airline': airline },
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) throw new Error(`engine-server /optimize/result ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  },
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `cd live-server && npx vitest run src/__tests__/services/engine-server-client.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add live-server/src/config/env.ts live-server/src/services/engine-server-client.ts live-server/src/__tests__/services/engine-server-client.test.ts
git commit -m "feat(live-server): engine-server client + ENGINE_SERVER_URL"
```

---

## Task 6: live-server — scenario raw-table export service (`ro_input.gz`)

The performance-critical piece. A data-driven table spec drives one SQL per table, all run concurrently, each serialized to a `## table` CSV section, then a single gzip.

**Files:**
- Create: `live-server/src/services/scenario/scenario-export-service.ts`
- Test: `live-server/src/__tests__/services/scenario/scenario-export-service.test.ts`

- [ ] **Step 1: Write the failing test**

Create `live-server/src/__tests__/services/scenario/scenario-export-service.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { gunzipSync } from 'node:zlib'
import { buildRoInputGz, __test } from '../../../services/scenario/scenario-export-service.js'

function makeFastify(rowsByTable: Record<string, Record<string, unknown>[]>) {
  const calls: string[] = []
  return {
    calls,
    db: {
      execute: vi.fn(async (q: { __table?: string }) => {
        // Each query is tagged with its table name via __test.tag()
        const table = q.__table ?? 'unknown'
        calls.push(table)
        return { rows: rowsByTable[table] ?? [] }
      }),
    },
  } as never
}

describe('scenario export', () => {
  it('toCsvSection renders ## header + CSV with escaping', () => {
    const section = __test.toCsvSection('crew', [
      { id: 1, name: 'A,B', note: 'x"y' },
      { id: 2, name: 'C', note: '' },
    ])
    expect(section).toContain('## crew')
    expect(section).toContain('id,name,note')
    expect(section).toContain('1,"A,B","x""y"')
    expect(section).toContain('2,C,')
  })

  it('empty table still emits its ## header', () => {
    const section = __test.toCsvSection('rank', [])
    expect(section.trim()).toBe('## rank')
  })

  it('buildRoInputGz issues exactly one query per table (no N+1) and gzips all sections', async () => {
    const scenario = {
      id: 7, worksetId: 70, strDtLoc: new Date('2026-06-01'), endDtLoc: new Date('2026-06-30'),
      filterParams: {}, rulesetId: 'RS1',
    }
    const fastify = makeFastify({
      crew: [{ id: 1, crew_no: 'F8001' }],
      pairing: [{ id: 5001, pairing_no: 'P1' }],
    })
    const buf = await buildRoInputGz(fastify, scenario as never)
    const text = gunzipSync(buf).toString('utf-8')

    expect(text).toContain('## crew')
    expect(text).toContain('F8001')
    expect(text).toContain('## pairing')
    // one query per table in the spec, no duplicates
    const c = (fastify as unknown as { calls: string[] }).calls
    expect(new Set(c).size).toBe(c.length)
    expect(c.length).toBe(__test.TABLE_COUNT)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd live-server && npx vitest run src/__tests__/services/scenario/scenario-export-service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the export service**

Create `live-server/src/services/scenario/scenario-export-service.ts`:

```typescript
import { gzipSync } from 'node:zlib'
import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

interface ScenarioRow {
  id: number
  worksetId: number
  strDtLoc: Date
  endDtLoc: Date
  filterParams: Record<string, unknown>
  rulesetId: string
}

/** One export table = a name + a SQL builder. Each builder returns a single,
 *  self-contained query (sub-selects, never per-row loops) so all run concurrently. */
interface TableSpec {
  name: string
  query: (s: ScenarioRow) => ReturnType<typeof sql>
}

// crew sub-table time-overlap predicate
const overlap = (s: ScenarioRow) =>
  sql`effdt <= ${s.endDtLoc} AND (expdt >= ${s.strDtLoc} OR expdt IS NULL)`

// crew id set from scenario filters (v1: simple — all crew; enrich via filter_params later)
const crewIds = (_s: ScenarioRow) => sql`SELECT id FROM crew`
// pairing id set within the scenario window
const pairingIds = (s: ScenarioRow) =>
  sql`SELECT id FROM pairing WHERE str_dt_loc <= ${s.endDtLoc} AND end_dt_loc >= ${s.strDtLoc}`

const SPECS: TableSpec[] = [
  { name: 'scenario', query: (s) => sql`SELECT * FROM scenario WHERE id = ${s.id}` },
  { name: 'workset', query: (s) => sql`SELECT * FROM workset WHERE id = ${s.worksetId}` },
  { name: 'crew', query: (s) => sql`SELECT * FROM crew WHERE id IN (${crewIds(s)})` },
  { name: 'crew_rank', query: (s) => sql`SELECT * FROM crew_rank WHERE crew_id IN (${crewIds(s)}) AND ${overlap(s)}` },
  { name: 'crew_base', query: (s) => sql`SELECT * FROM crew_base WHERE crew_id IN (${crewIds(s)}) AND ${overlap(s)}` },
  { name: 'crew_fleet', query: (s) => sql`SELECT * FROM crew_fleet WHERE crew_id IN (${crewIds(s)}) AND ${overlap(s)}` },
  { name: 'crew_qualification', query: (s) => sql`SELECT * FROM crew_qualification WHERE crew_id IN (${crewIds(s)}) AND ${overlap(s)}` },
  { name: 'crew_status', query: (s) => sql`SELECT * FROM crew_status WHERE crew_id IN (${crewIds(s)}) AND ${overlap(s)}` },
  { name: 'crew_certificate', query: (s) => sql`SELECT * FROM crew_certificate WHERE crew_id IN (${crewIds(s)}) AND ${overlap(s)}` },
  { name: 'roster_flight', query: (s) => sql`SELECT * FROM roster_flight WHERE str_dt_loc <= ${s.endDtLoc} AND end_dt_loc >= ${s.strDtLoc}` },
  { name: 'pairing', query: (s) => sql`SELECT * FROM pairing WHERE id IN (${pairingIds(s)})` },
  { name: 'pairing_segment', query: (s) => sql`SELECT * FROM pairing_segment WHERE pairing_id IN (${pairingIds(s)})` },
  { name: 'pairing_composition', query: (s) => sql`SELECT * FROM pairing_composition WHERE pairing_id IN (${pairingIds(s)})` },
  { name: 'flight', query: (s) => sql`SELECT * FROM flight WHERE std_loc <= ${s.endDtLoc} AND sta_loc >= ${s.strDtLoc}` },
  { name: 'flight_composition', query: (s) => sql`SELECT * FROM flight_composition WHERE flight_id IN (SELECT id FROM flight WHERE std_loc <= ${s.endDtLoc} AND sta_loc >= ${s.strDtLoc})` },
  { name: 'rule_group', query: (s) => sql`SELECT * FROM rule_group WHERE group_code = ${ruleGroupCode(s)}` },
  { name: 'rule_group_item', query: (s) => sql`SELECT * FROM rule_group_item WHERE group_id IN (SELECT id FROM rule_group WHERE group_code = ${ruleGroupCode(s)})` },
  { name: 'rule_instance', query: (s) => sql`SELECT * FROM rule_instance WHERE id IN (SELECT instance_id FROM rule_group_item WHERE group_id IN (SELECT id FROM rule_group WHERE group_code = ${ruleGroupCode(s)}))` },
  { name: 'rule_template', query: (s) => sql`SELECT * FROM rule_template WHERE id IN (SELECT template_id FROM rule_instance WHERE id IN (SELECT instance_id FROM rule_group_item WHERE group_id IN (SELECT id FROM rule_group WHERE group_code = ${ruleGroupCode(s)})))` },
  { name: 'base', query: () => sql`SELECT * FROM base` },
  { name: 'rank', query: () => sql`SELECT * FROM rank` },
  { name: 'fleet', query: () => sql`SELECT * FROM fleet` },
  { name: 'airport', query: (s) => sql`SELECT * FROM airport WHERE three_code IN (
      SELECT dep_port FROM flight WHERE std_loc <= ${s.endDtLoc} AND sta_loc >= ${s.strDtLoc}
      UNION SELECT arr_port FROM flight WHERE std_loc <= ${s.endDtLoc} AND sta_loc >= ${s.strDtLoc})` },
]

/** v1: read selected rule-group code from filter_params; fall back to rulesetId. */
function ruleGroupCode(s: ScenarioRow): string {
  const fromParams = (s.filterParams as { ruleGroupCode?: string })?.ruleGroupCode
  return fromParams ?? s.rulesetId
}

function csvEscape(v: unknown): string {
  if (v == null) return ''
  const str = v instanceof Date ? v.toISOString() : String(v)
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

function toCsvSection(name: string, rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return `## ${name}\n`
  const cols = Object.keys(rows[0])
  const header = cols.join(',')
  const body = rows.map((r) => cols.map((c) => csvEscape(r[c])).join(',')).join('\n')
  return `## ${name}\n${header}\n${body}\n`
}

export async function buildRoInputGz(fastify: FastifyInstance, scenario: ScenarioRow): Promise<Buffer> {
  // one query per table, all concurrent — no N+1
  const results = await Promise.all(
    SPECS.map(async (spec) => {
      const tagged = spec.query(scenario) as unknown as { __table?: string }
      tagged.__table = spec.name // test hook; harmless in prod
      const res = (await fastify.db.execute(tagged as never)) as unknown as { rows: Record<string, unknown>[] }
      return toCsvSection(spec.name, res.rows)
    }),
  )
  return gzipSync(Buffer.from(results.join('\n'), 'utf-8'))
}

export const __test = { toCsvSection, TABLE_COUNT: SPECS.length }
```

> If `flight`/`pairing` column names differ (e.g. `std_loc` vs `std_utc`, `dep_port` vs `dep_airport`), adjust the SQL to the real columns — verify against `live-server/src/models/` during implementation. The structure (one self-contained query per table) must not change.

- [ ] **Step 4: Run it to verify it passes**

Run: `cd live-server && npx vitest run src/__tests__/services/scenario/scenario-export-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add live-server/src/services/scenario/scenario-export-service.ts live-server/src/__tests__/services/scenario/scenario-export-service.test.ts
git commit -m "feat(live-server): scenario raw-table export to ro_input.gz (concurrent, no N+1)"
```

---

## Task 7: live-server — scenario model `taskId` column

**Files:**
- Modify: `live-server/src/models/scenario/scenario.ts`
- Modify: `sql/migration/` (add a migration adding `task_id varchar(64)` to `scenario`)

- [ ] **Step 1: Add the column to the Drizzle model**

In `live-server/src/models/scenario/scenario.ts`, add to the `scenario` table after `checksum`:

```typescript
  taskId: varchar('task_id', { length: 64 }),
```

- [ ] **Step 2: Write the migration**

Create `sql/migration/<NN>_scenario_add_task_id.sql` (use the next sequence number in that dir):

```sql
-- Track the in-flight engine-server optimization task per scenario
ALTER TABLE scenario ADD COLUMN IF NOT EXISTS task_id varchar(64);
```

- [ ] **Step 3: Typecheck**

Run: `cd live-server && npx tsc --noEmit`
Expected: no errors referencing scenario model.

- [ ] **Step 4: Commit**

```bash
git add live-server/src/models/scenario/scenario.ts sql/migration/
git commit -m "feat(live-server): scenario.task_id column for optimization tracking"
```

---

## Task 8: live-server — run orchestration + result service + roster read-back

**Files:**
- Create: `live-server/src/services/scenario/scenario-result-service.ts`
- Modify: `live-server/src/services/scenario/scenario-service.ts` (add `run`)
- Test: `live-server/src/__tests__/services/scenario/scenario-result-service.test.ts`

- [ ] **Step 1: Write the failing test for result write-back**

Create `live-server/src/__tests__/services/scenario/scenario-result-service.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { saveResult, __test } from '../../../services/scenario/scenario-result-service.js'

describe('scenario result', () => {
  it('parseAssignments maps crew_id -> pairing_id from output gz sections', () => {
    const assignments = __test.parseAssignments({
      ASSIGNMENTS: [
        { crew_id: 'F8001', pairing_id: '5001' },
        { crew_id: 'F8002', pairing_id: '5002' },
      ],
    })
    expect(assignments).toEqual([
      { crewId: 'F8001', pairingId: 5001 },
      { crewId: 'F8002', pairingId: 5002 },
    ])
  })

  it('saveResult writes file_path/checksum, bumps optimized_count, sets DONE', async () => {
    const updates: Record<string, unknown>[] = []
    const fastify = {
      db: {
        update: () => ({ set: (v: Record<string, unknown>) => ({ where: async () => { updates.push(v); return [] } }) }),
      },
      redis: { del: vi.fn(), keys: vi.fn(async () => []) },
    } as never

    await saveResult(fastify, {
      scenarioId: 7, taskId: 't1', status: 'DONE',
      filePath: '/c/output.gz', fileSize: 10, checksum: 'abc', kpi: [], resultMeta: {},
    })

    expect(updates[0]).toMatchObject({ filePath: '/c/output.gz', checksum: 'abc', status: 'DONE' })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd live-server && npx vitest run src/__tests__/services/scenario/scenario-result-service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the result service**

Create `live-server/src/services/scenario/scenario-result-service.ts`:

```typescript
import { eq, sql } from 'drizzle-orm'
import { gunzipSync } from 'node:zlib'
import type { FastifyInstance } from 'fastify'
import { scenario } from '../../models/scenario/scenario.js'
import { invalidate, invalidatePattern } from '../../utils/cache.js'

export interface ResultMetadata {
  scenarioId: number
  taskId: string
  status: string // DONE | FAILED | INFEASIBLE | TIMEOUT
  filePath: string
  fileSize: number
  checksum: string
  kpi: Record<string, unknown>[]
  resultMeta: Record<string, unknown>
}

export interface CrewAssignment { crewId: string; pairingId: number }

function parseAssignments(sections: Record<string, Record<string, string>[]>): CrewAssignment[] {
  return (sections.ASSIGNMENTS ?? []).map((r) => ({
    crewId: r.crew_id,
    pairingId: Number(r.pairing_id),
  }))
}

/** Parse a `## SECTION` CSV gzip buffer into {section: rows}. */
function parseSections(buf: Buffer): Record<string, Record<string, string>[]> {
  const text = gunzipSync(buf).toString('utf-8')
  const sections: Record<string, Record<string, string>[]> = {}
  let current: string | null = null
  let header: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('## ')) { current = line.slice(3).trim(); header = []; sections[current] = [] }
    else if (!line || !current) continue
    else if (header.length === 0) header = line.split(',')
    else {
      const cells = line.split(',')
      const row: Record<string, string> = {}
      header.forEach((h, i) => { row[h] = cells[i] ?? '' })
      sections[current].push(row)
    }
  }
  return sections
}

const DONE_STATES = new Set(['DONE'])

export async function saveResult(fastify: FastifyInstance, meta: ResultMetadata): Promise<void> {
  const finalStatus = DONE_STATES.has(meta.status) ? 'DONE' : 'FAILED'
  await fastify.db
    .update(scenario)
    .set({
      filePath: meta.filePath,
      fileSize: meta.fileSize,
      checksum: meta.checksum,
      taskId: meta.taskId,
      status: finalStatus,
      optimizedCount: sql`${scenario.optimizedCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(scenario.id, meta.scenarioId))

  await Promise.all([
    invalidate(fastify.redis, `scenario:${meta.scenarioId}`),
    invalidatePattern(fastify.redis, `scenario:list:*`),
  ])
  // KPI rows persisted by scenario-service.createKpi in the route layer (kept simple here)
}

export const __test = { parseAssignments, parseSections }
export { parseAssignments, parseSections }
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd live-server && npx vitest run src/__tests__/services/scenario/scenario-result-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Add `run()` to scenario-service**

Add to `scenarioService` in `live-server/src/services/scenario/scenario-service.ts`:

```typescript
  async run(
    fastify: FastifyInstance,
    id: number,
    token: string,
    airline: string,
    liveServerUrl: string,
  ): Promise<{ taskId: string }> {
    const sc = await this.getById(fastify, id)
    if (!sc) throw new Error('Scenario not found')
    if (sc.status === 'RUNNING') throw new Error('Scenario is already running')

    await this.transition(fastify, id, 'RUNNING', 'system')
    try {
      const { engineServerClient } = await import('../engine-server-client.js')
      const taskId = await engineServerClient.startRoTask({ scenarioId: id, liveServerUrl, token, airline })
      await fastify.db.update(scenario).set({ taskId }).where(eq(scenario.id, id))
      return { taskId }
    } catch (err) {
      await this.transition(fastify, id, 'FAILED', 'system')
      throw err
    }
  },
```

- [ ] **Step 6: Run scenario-service tests**

Run: `cd live-server && npx vitest run src/__tests__/services/scenario/scenario-service.test.ts`
Expected: PASS (existing tests unaffected).

- [ ] **Step 7: Commit**

```bash
git add live-server/src/services/scenario/scenario-result-service.ts live-server/src/services/scenario/scenario-service.ts live-server/src/__tests__/services/scenario/scenario-result-service.test.ts
git commit -m "feat(live-server): scenario run orchestration + result write-back + assignment parse"
```

---

## Task 9: live-server — routes (`/:id/run`, `/export`, `/result`, `/:id/roster`)

**Files:**
- Modify: `live-server/src/routes/scenario/scenario.ts`

- [ ] **Step 1: Add the run route**

In `live-server/src/routes/scenario/scenario.ts`, inside `scenarioRoutes`, add:

```typescript
  // POST /api/scenario/:id/run — kick off RO optimization
  fastify.post('/:id/run', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')

    const auth = (request as { authUser?: { schema?: string } }).authUser
    const airline = auth?.schema ?? 'f8'
    const token = (request.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
    const liveServerUrl = `${request.protocol}://${request.headers.host}`

    try {
      const result = await scenarioService.run(fastify, numId, token, airline, liveServerUrl)
      return success(reply, result)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })
```

- [ ] **Step 2: Add the export route (octet-stream gzip)**

```typescript
  // POST /api/scenario/export — engine-server fetches ro_input.gz (raw filtered tables)
  fastify.post('/export', async (request, reply) => {
    // engine-server posts the scenarioId as a raw integer body
    const raw = request.body as unknown
    const scenarioId = typeof raw === 'number' ? raw : Number((raw as { scenarioId?: number })?.scenarioId ?? raw)
    if (Number.isNaN(scenarioId)) return fail(reply, 400, 'Invalid scenarioId')

    const sc = await scenarioService.getById(fastify, scenarioId)
    if (!sc) return fail(reply, 404, 'Scenario not found')

    const { buildRoInputGz } = await import('../../services/scenario/scenario-export-service.js')
    const gz = await buildRoInputGz(fastify, sc as never)
    return reply.header('Content-Type', 'application/gzip').send(gz)
  })
```

> The export route returns a raw gzip buffer, not the `{code,data,message}` envelope, because engine-server consumes the bytes directly. Confirm `index.ts` body parsing accepts a bare integer for this route (engine-server sends `str(int)` with `Content-Type: application/json`); if Fastify rejects it, register a `text/plain`+integer content-type parser or have engine-server send `{"scenarioId": N}`.

- [ ] **Step 3: Add the result callback route**

```typescript
  // POST /api/scenario/result — engine-server writes back optimization result metadata
  fastify.post('/result', async (request, reply) => {
    const { saveResult } = await import('../../services/scenario/scenario-result-service.js')
    const meta = request.body as Parameters<typeof saveResult>[1]
    if (!meta || typeof meta.scenarioId !== 'number') return fail(reply, 400, 'Invalid result payload')

    try {
      await saveResult(fastify, meta)
      // persist KPI rows if present
      for (const k of meta.kpi ?? []) {
        await scenarioService.createKpi(fastify, { ...k, scenarioId: meta.scenarioId } as never, 'engine')
      }
      return success(reply, null)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })
```

- [ ] **Step 4: Add the roster read-back route**

```typescript
  // GET /api/scenario/:id/roster — read optimized roster (approach B: pull file from engine-server)
  fastify.get('/:id/roster', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')

    const sc = await scenarioService.getById(fastify, numId)
    if (!sc) return fail(reply, 404, 'Scenario not found')
    if (sc.status !== 'DONE' || !sc.taskId) return fail(reply, 409, 'Scenario has no optimized result')

    const auth = (request as { authUser?: { schema?: string } }).authUser
    const airline = auth?.schema ?? 'f8'
    const token = (request.headers.authorization ?? '').replace(/^Bearer\s+/i, '')

    try {
      const { engineServerClient } = await import('../../services/engine-server-client.js')
      const { parseSections, parseAssignments } = await import('../../services/scenario/scenario-result-service.js')
      const gz = await engineServerClient.fetchResultFile(sc.taskId, token, airline)
      const assignments = parseAssignments(parseSections(gz))
      return success(reply, { assignments })
    } catch (err) {
      return error(reply, 502, `Failed to load result: ${(err as Error).message}`)
    }
  })
```

- [ ] **Step 5: Typecheck + run the scenario route/service tests**

Run: `cd live-server && npx tsc --noEmit && npx vitest run src/__tests__/services/scenario/`
Expected: no type errors; tests PASS.

- [ ] **Step 6: Commit**

```bash
git add live-server/src/routes/scenario/scenario.ts
git commit -m "feat(live-server): scenario run/export/result/roster routes"
```

---

## Task 10: gantt — rule-group selector on scenario detail

**Files:**
- Modify: `live-server` rule route (confirm a `GET /api/rule/groups` exists; if not add a minimal one)
- Modify: `gantt/src/components/scenario/scenario-detail-panel.tsx`
- Modify: `gantt/src/services/scenario-api.ts`

- [ ] **Step 1: Confirm rule-group list endpoint**

Run: `cd live-server && grep -rniE "rule_group|ruleGroup|/groups" src/routes/rule/ | head`
Expected: identify a list endpoint. If none returns `{ groupCode, name }`, add:

```typescript
// in src/routes/rule/<existing file>.ts
fastify.get('/groups', async (_request, reply) => {
  const rows = await fastify.db.select({ groupCode: ruleGroup.groupCode, name: ruleGroup.name })
    .from(ruleGroup).where(eq(ruleGroup.isDeleted, 0))
  return success(reply, rows)
})
```

- [ ] **Step 2: Add a rule-group `<select>` to the detail panel**

In `gantt/src/components/scenario/scenario-detail-panel.tsx`, add a labeled select bound to `draftDetail.filterParams.ruleGroupCode`, populated from `GET /api/rule/groups`. Follow the existing field/label styling in that file (do not introduce magic font sizes/colors — use the project tokens). Persist via the existing scenario `saveDetail` flow (writes `filter_params.ruleGroupCode`).

UI text must be English (e.g. label `Rule Group`), per the front-end language rule.

- [ ] **Step 3: Typecheck gantt**

Run: `cd gantt && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add gantt/src/components/scenario/scenario-detail-panel.tsx gantt/src/services/scenario-api.ts live-server/src/routes/rule/
git commit -m "feat(gantt): rule-group selector persists filter_params.ruleGroupCode"
```

---

## Task 11: gantt — wire real Run + roster open

**Files:**
- Modify: `gantt/src/services/scenario-api.ts`
- Modify: `gantt/src/stores/scenario-store.ts`
- Modify: `gantt/src/components/scenario/scenario-toolbar.tsx`

- [ ] **Step 1: Add API methods**

In `gantt/src/services/scenario-api.ts`:

```typescript
  async run(id: number): Promise<{ taskId: string }> {
    return api.post(`/api/scenario/${id}/run`, {}) as Promise<{ taskId: string }>
  },
  async getRoster(id: number): Promise<{ assignments: { crewId: string; pairingId: number }[] }> {
    return api.get(`/api/scenario/${id}/roster`) as Promise<{ assignments: { crewId: string; pairingId: number }[] }>
  },
```

- [ ] **Step 2: Add store actions with status polling**

In `gantt/src/stores/scenario-store.ts`, add `runScenario(id)` that calls `scenarioApi.run`, then polls `scenarioApi.getById(id)` every 3s until `status` is `DONE` or `FAILED` (cap ~10 min), refreshing `detail`. Add `openScenarioRoster(id)` calling `scenarioApi.getRoster`.

- [ ] **Step 3: Wire the Run button**

In `gantt/src/components/scenario/scenario-toolbar.tsx`, change `handleRun` to call `runScenario(detail.id)` when not running (replace the fake `transitionStatus(detail.id, 'RUNNING')`). Keep the kill path (`transitionStatus('FAILED')`) for an in-flight run.

- [ ] **Step 4: Typecheck**

Run: `cd gantt && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/services/scenario-api.ts gantt/src/stores/scenario-store.ts gantt/src/components/scenario/scenario-toolbar.tsx
git commit -m "feat(gantt): real Run button triggers optimization + polls to DONE"
```

---

## Task 12: e2e Playwright (§Playwright-Required, §No-Illusion)

**Files:**
- Create: `e2e/gantt/scenario-run.spec.ts`

- [ ] **Step 1: Write the test**

Create `e2e/gantt/scenario-run.spec.ts` covering a 2+ step workflow with intermediate assertions:

```ts
import { test, expect } from '@playwright/test'

test('scenario run drives DRAFT→RUNNING→DONE and opens optimized roster', async ({ page }) => {
  await page.goto('/')
  // navigate to scenario view + select a DRAFT scenario (use existing nav testids)
  await page.getByTestId('scenario-run-btn').click()

  // intermediate state: RUNNING indicator visible
  await expect(page.getByTestId('scenario-run-btn')).toHaveClass(/amber/)

  // final state: status becomes DONE (poll-driven) — assert specific text, not just visibility
  await expect(page.getByText('DONE')).toBeVisible({ timeout: 120_000 })

  // open roster shows specific optimized assignment data (count > 0)
  await page.getByTestId('scenario-open-btn').click()
  const rows = page.getByTestId('roster-row')
  await expect(rows.first()).toBeVisible()
  expect(await rows.count()).toBeGreaterThan(0)
})
```

> Adjust testids/selectors to the real ones in `scenario-toolbar.tsx` / roster view. The test MUST assert concrete data (status text `DONE`, roster row count > 0), never bare `toBeVisible()` alone.

- [ ] **Step 2: Run the test**

Run: `cd /home/yuan.z/rois/rois-ai && npx playwright test e2e/gantt/scenario-run.spec.ts --reporter=list`
Expected: PASS. Paste the PASS/FAIL summary into the completion message (§No-Illusion).

- [ ] **Step 3: Commit**

```bash
git add e2e/gantt/scenario-run.spec.ts
git commit -m "test(e2e): scenario run end-to-end DRAFT→DONE + roster open"
```

---

## Task 13: Version bump

**Files:**
- Modify: `gantt/src/version.ts`

- [ ] **Step 1: Bump versions**

In `gantt/src/version.ts`: `BACKEND_VERSION +1` (live-server + engine-server changed — same backend counter), `FRONTEND_VERSION +1` (gantt changed). `RULE_VERSION` unchanged.

- [ ] **Step 2: Commit**

```bash
git add gantt/src/version.ts
git commit -m "chore: bump BACKEND/FRONTEND version for scenario optimization loop"
```

---

## Self-Review notes (resolved)

- **Spec coverage:** §2 flow → Tasks 5/8/9/11; §3 export → Task 6; §4 result/read-back → Tasks 2/3/8/9; §5.1 live-server → Tasks 5–9; §5.2 engine-server → Tasks 1–4; §5.3 gantt → Tasks 10–11; §6 auth → Task 9 (token forwarding); §7 errors → Tasks 8/9 (try/catch + transitions); §8 tests → Tasks 1–12; §9 version → Task 13.
- **Type consistency:** `ResultMetadata` (Task 8) fields match engine-server metadata (Task 2) and `/result` route (Task 9). `parseSections`/`parseAssignments` exported from result-service used by route (Task 9). `buildRoInputGz(fastify, scenario)` signature consistent across Tasks 6 & 9.
- **Known verify-at-impl points (flagged, not placeholders):** real column names for `flight`/`pairing`/`airport` (Task 6 note); Fastify bare-integer body parsing for `/export` (Task 9 note); rule-group list endpoint existence (Task 10 Step 1).
```
