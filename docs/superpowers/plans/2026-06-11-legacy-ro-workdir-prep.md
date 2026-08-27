# LegacyRO 运行目录准备改进 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LegacyRO 任务启动时自动把 `engine-server/<airline>/tzdata/`、`Database_connection.txt` 和 pbs-server YEG 偏好包(4 个 CSV)放入运行目录;归档 complete/ 前删除 tzdata 与 Database_connection.txt。

**Architecture:** 新增 `src/utils/pbs_server_client.py`(登录+下载,对照 `legacy_java_client.py` 模式)和 `src/utils/workdir_prep.py`(复制/解压/清理纯函数,便于单测);`task_manager._fetch_input_legacy_java` 在 input.gz 落盘后调用新方法 `_prepare_legacy_workdir`;`_submit_output_data` LegacyRO 分支在 `move_to_complete` 前调用 `cleanup_aux_files`。配置走 `config.yaml` LegacyRO 块新增 `pbs_server` 节点。

**Tech Stack:** Python 3.8+ / requests / tarfile / pytest(http.server 起 mock pbs-server,与 conftest 的 MockLiveServer 同模式)

**Spec:** `docs/superpowers/specs/2026-06-11-legacy-ro-workdir-prep-design.md`

**工作目录:** 所有命令在 `~/rois/rois-ai/engine-server/` 下执行;测试用 `python3 -m pytest`。

---

### Task 1: workdir_prep 纯函数(复制 / 解压 / 清理)

**Files:**
- Create: `engine-server/src/utils/workdir_prep.py`
- Test: `engine-server/tests/test_legacy_ro_workdir_prep.py`(新文件,本任务先写纯函数部分)

- [ ] **Step 1: 写失败测试**

`engine-server/tests/test_legacy_ro_workdir_prep.py`:

```python
"""LegacyRO 运行目录准备测试:辅助文件复制、偏好包解压、归档前清理、pbs-server 客户端。"""
import io
import os
import tarfile

import pytest

from src.utils.workdir_prep import (
    AUX_DIR_NAME,
    AUX_FILE_NAME,
    cleanup_aux_files,
    copy_aux_files,
    extract_preference_package,
)

PREF_FILES = ["DAYSOFF.csv", "PAIRING_SCORE.csv", "RESERVE_SCORE.csv", "LINE_RULES.csv"]


def build_test_tgz(extra_member: str = None) -> bytes:
    """构造与 pbs-server yeg-test-package 同结构的 tgz(4 CSV + README,文件在根)。"""
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for name in PREF_FILES + ["LINE_RULES_README.md"]:
            content = f"col_a,col_b\n{name},1\n".encode()
            info = tarfile.TarInfo(name=name)
            info.size = len(content)
            tar.addfile(info, io.BytesIO(content))
        if extra_member:
            content = b"evil"
            info = tarfile.TarInfo(name=extra_member)
            info.size = len(content)
            tar.addfile(info, io.BytesIO(content))
    return buf.getvalue()


def make_aux_src(base):
    """在 base 下构造 F8 源目录:tzdata/africa + Database_connection.txt。"""
    src = base / "F8"
    (src / AUX_DIR_NAME).mkdir(parents=True)
    (src / AUX_DIR_NAME / "africa").write_text("tz africa data")
    (src / AUX_FILE_NAME).write_text("data_source=file\n")
    return src


def test_copy_aux_files_copies_tzdata_and_dbconn(tmp_path):
    src = make_aux_src(tmp_path)
    work = tmp_path / "work"
    work.mkdir()
    copy_aux_files(str(src), str(work))
    assert (work / AUX_DIR_NAME / "africa").read_text() == "tz africa data"
    assert (work / AUX_FILE_NAME).read_text() == "data_source=file\n"


def test_copy_aux_files_missing_tzdata_raises(tmp_path):
    src = tmp_path / "F8"
    src.mkdir()
    (src / AUX_FILE_NAME).write_text("x")
    work = tmp_path / "work"
    work.mkdir()
    with pytest.raises(FileNotFoundError, match="tzdata"):
        copy_aux_files(str(src), str(work))


def test_copy_aux_files_missing_dbconn_raises(tmp_path):
    src = tmp_path / "F8"
    (src / AUX_DIR_NAME).mkdir(parents=True)
    work = tmp_path / "work"
    work.mkdir()
    with pytest.raises(FileNotFoundError, match="Database_connection"):
        copy_aux_files(str(src), str(work))


def test_extract_preference_package_extracts_four_csvs(tmp_path):
    work = tmp_path / "work"
    work.mkdir()
    extracted = extract_preference_package(build_test_tgz(), str(work))
    for name in PREF_FILES:
        assert (work / name).exists(), name
        assert name in extracted
    assert (work / "LINE_RULES_README.md").exists()
    assert (work / "DAYSOFF.csv").read_text() == "col_a,col_b\nDAYSOFF.csv,1\n"


def test_extract_preference_package_rejects_path_traversal(tmp_path):
    work = tmp_path / "work"
    work.mkdir()
    with pytest.raises(ValueError, match="unsafe path"):
        extract_preference_package(build_test_tgz(extra_member="../evil.csv"), str(work))
    assert not (tmp_path / "evil.csv").exists()


def test_extract_preference_package_invalid_bytes_raises(tmp_path):
    work = tmp_path / "work"
    work.mkdir()
    with pytest.raises(ValueError, match="invalid preference package"):
        extract_preference_package(b"not a tgz", str(work))


def test_cleanup_aux_files_removes_aux_keeps_csvs(tmp_path):
    work = tmp_path / "work"
    (work / AUX_DIR_NAME).mkdir(parents=True)
    (work / AUX_DIR_NAME / "africa").write_text("x")
    (work / AUX_FILE_NAME).write_text("x")
    (work / "DAYSOFF.csv").write_text("x")
    (work / "output.gz").write_bytes(b"gz")
    cleanup_aux_files(str(work))
    assert not (work / AUX_DIR_NAME).exists()
    assert not (work / AUX_FILE_NAME).exists()
    assert (work / "DAYSOFF.csv").exists()
    assert (work / "output.gz").exists()


def test_cleanup_aux_files_missing_targets_is_noop(tmp_path):
    work = tmp_path / "work"
    work.mkdir()
    cleanup_aux_files(str(work))  # 不抛异常
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd ~/rois/rois-ai/engine-server && python3 -m pytest tests/test_legacy_ro_workdir_prep.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'src.utils.workdir_prep'`

- [ ] **Step 3: 实现 `src/utils/workdir_prep.py`**

```python
"""
LegacyRO 运行目录准备工具。

外部 PBS rostering 优化器运行时需要在工作目录内提供:
  - tzdata/ 时区目录 + Database_connection.txt(来自 engine-server/<airline>/)
  - 4 个偏好 CSV(来自 pbs-server yeg-test-package tgz)

tzdata/ 与 Database_connection.txt 不归档:move_to_complete 前由
cleanup_aux_files() 删除;偏好 CSV 保留随目录进 complete/。
"""
import io
import logging
import os
import shutil
import tarfile
from typing import List, Optional

logger = logging.getLogger(__name__)

AUX_DIR_NAME = "tzdata"
AUX_FILE_NAME = "Database_connection.txt"


def copy_aux_files(src_dir: str, working_dir: str) -> None:
    """把 <src_dir>/tzdata/ 和 <src_dir>/Database_connection.txt 复制到工作目录。

    Raises:
        FileNotFoundError: 源目录/文件缺失
    """
    src_tzdata = os.path.join(src_dir, AUX_DIR_NAME)
    src_dbconn = os.path.join(src_dir, AUX_FILE_NAME)
    if not os.path.isdir(src_tzdata):
        raise FileNotFoundError(f"aux dir missing: {src_tzdata}")
    if not os.path.isfile(src_dbconn):
        raise FileNotFoundError(f"aux file missing: {src_dbconn}")
    shutil.copytree(src_tzdata, os.path.join(working_dir, AUX_DIR_NAME), dirs_exist_ok=True)
    shutil.copy2(src_dbconn, os.path.join(working_dir, AUX_FILE_NAME))


def extract_preference_package(tgz_bytes: bytes, working_dir: str) -> List[str]:
    """把偏好包 tgz 的常规文件平铺解压到工作目录根,返回解出的文件名列表。

    成员路径含绝对路径或 `..` 时拒绝(防目录穿越);按 basename 落盘。

    Raises:
        ValueError: 包格式非法或含不安全路径
    """
    try:
        tar = tarfile.open(fileobj=io.BytesIO(tgz_bytes), mode="r:gz")
    except tarfile.TarError as e:
        raise ValueError(f"invalid preference package: {e}") from e

    extracted: List[str] = []
    with tar:
        for member in tar.getmembers():
            if member.name.startswith("/") or ".." in member.name.split("/"):
                raise ValueError(f"unsafe path in preference package: {member.name}")
            if not member.isfile():
                continue
            filename = os.path.basename(member.name)
            src = tar.extractfile(member)
            if src is None:
                continue
            with open(os.path.join(working_dir, filename), "wb") as out:
                shutil.copyfileobj(src, out)
            extracted.append(filename)
    return extracted


def cleanup_aux_files(working_dir: str) -> None:
    """归档前删除工作目录下的 tzdata/ 与 Database_connection.txt;失败仅记 warning。"""
    try:
        tz_dir = os.path.join(working_dir, AUX_DIR_NAME)
        if os.path.isdir(tz_dir):
            shutil.rmtree(tz_dir)
        dbconn = os.path.join(working_dir, AUX_FILE_NAME)
        if os.path.isfile(dbconn):
            os.remove(dbconn)
    except OSError as e:
        logger.warning("cleanup aux files failed (non-fatal): %s", e)
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd ~/rois/rois-ai/engine-server && python3 -m pytest tests/test_legacy_ro_workdir_prep.py -v`
Expected: 8 PASS

- [ ] **Step 5: Commit**

```bash
cd ~/rois/rois-ai && git add engine-server/src/utils/workdir_prep.py engine-server/tests/test_legacy_ro_workdir_prep.py && git commit -m "feat(engine-server): LegacyRO workdir prep helpers (aux copy / tgz extract / cleanup)"
```

---

### Task 2: pbs_server_client(登录 + 偏好包下载)

**Files:**
- Create: `engine-server/src/utils/pbs_server_client.py`
- Test: `engine-server/tests/test_legacy_ro_workdir_prep.py`(追加)

- [ ] **Step 1: 追加失败测试(mock pbs-server,与 conftest MockLiveServer 同模式)**

在 `tests/test_legacy_ro_workdir_prep.py` 追加:

```python
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

from src.utils import pbs_server_client

PBS_TOKEN = "pbs-token-1"


class MockPbsHandler(BaseHTTPRequestHandler):
    requests_seen = []

    def log_message(self, fmt, *args):  # 静默
        pass

    def _send_json(self, code: int, payload: dict):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length) or b"{}")
        MockPbsHandler.requests_seen.append(("POST", self.path, dict(self.headers), body))
        if self.path != "/api/auth/session":
            return self._send_json(404, {"code": 404, "data": None, "message": "not found"})
        if body.get("userCode") == "admin" and body.get("password") == "Admin@2026":
            return self._send_json(200, {"code": 200, "data": {"token": PBS_TOKEN}, "message": "ok"})
        return self._send_json(401, {"code": 401, "data": None, "message": "Invalid credentials."})

    def do_GET(self):
        MockPbsHandler.requests_seen.append(("GET", self.path, dict(self.headers), None))
        if not self.path.startswith("/api/admin/algorithm-export/yeg-test-package"):
            return self._send_json(404, {"code": 404, "data": None, "message": "not found"})
        if self.headers.get("Authorization") != f"Bearer {PBS_TOKEN}":
            return self._send_json(403, {"code": 403, "data": None, "message": "Admin access is required."})
        data = build_test_tgz()
        self.send_response(200)
        self.send_header("Content-Type", "application/gzip")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


@pytest.fixture(scope="module")
def mock_pbs_server():
    server = HTTPServer(("127.0.0.1", 0), MockPbsHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


@pytest.fixture(autouse=True)
def clear_pbs_requests():
    MockPbsHandler.requests_seen.clear()
    yield


def test_pbs_login_success(mock_pbs_server):
    token = pbs_server_client.login(mock_pbs_server, "admin", "Admin@2026")
    assert token == PBS_TOKEN


def test_pbs_login_bad_password_raises(mock_pbs_server):
    with pytest.raises(RuntimeError, match="login failed"):
        pbs_server_client.login(mock_pbs_server, "admin", "wrong")


def test_pbs_fetch_yeg_package_sends_token_and_period_code(mock_pbs_server):
    data = pbs_server_client.fetch_yeg_test_package(mock_pbs_server, PBS_TOKEN, "Jun 2026")
    assert data == build_test_tgz()
    method, path, headers, _ = MockPbsHandler.requests_seen[-1]
    assert method == "GET"
    assert "periodCode=Jun%202026" in path
    assert headers.get("Authorization") == f"Bearer {PBS_TOKEN}"


def test_pbs_fetch_yeg_package_bad_token_raises(mock_pbs_server):
    with pytest.raises(RuntimeError, match="HTTP 403"):
        pbs_server_client.fetch_yeg_test_package(mock_pbs_server, "bad-token", "Jun 2026")
```

> 注意:`build_test_tgz()` 每次调用产出的 gzip 字节需可复比。若 gzip 时间戳导致
> `data == build_test_tgz()` 不稳定,改为解包比对文件名集合:
> `tarfile.open(fileobj=io.BytesIO(data)).getnames() == PREF_FILES + ["LINE_RULES_README.md"]`。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd ~/rois/rois-ai/engine-server && python3 -m pytest tests/test_legacy_ro_workdir_prep.py -v -k pbs`
Expected: FAIL — `ModuleNotFoundError: No module named 'src.utils.pbs_server_client'`

- [ ] **Step 3: 实现 `src/utils/pbs_server_client.py`**

```python
"""
pbs-server 客户端 — 登录 + YEG 偏好包下载(LegacyRO 临时方案用)。

接口:
  POST /api/auth/session                                  {userCode, password} → data.token
  GET  /api/admin/algorithm-export/yeg-test-package        ?periodCode=... (admin Bearer) → tgz
"""
import logging
from urllib.parse import quote

import requests

logger = logging.getLogger(__name__)


def login(base_url: str, user_code: str, password: str, timeout: int = 30) -> str:
    """登录 pbs-server,返回 JWT token。

    Raises:
        RuntimeError: 请求失败、HTTP 非 200 或响应缺 token
    """
    url = f"{base_url.rstrip('/')}/api/auth/session"
    try:
        resp = requests.post(url, json={"userCode": user_code, "password": password}, timeout=timeout)
    except requests.RequestException as exc:
        raise RuntimeError(f"pbs-server login request failed: {exc}") from exc

    if resp.status_code != 200:
        raise RuntimeError(f"pbs-server login failed (HTTP {resp.status_code}): {resp.text[:200]}")

    try:
        token = (resp.json().get("data") or {}).get("token")
    except ValueError as exc:
        raise RuntimeError("pbs-server login returned non-JSON response") from exc
    if not token:
        raise RuntimeError("pbs-server login response missing data.token")

    logger.info("pbs-server login success, user=%s", user_code)
    return str(token)


def fetch_yeg_test_package(base_url: str, token: str, period_code: str, timeout: int = 120) -> bytes:
    """下载 YEG 测试偏好包 tgz 字节。

    Raises:
        RuntimeError: 请求失败、HTTP 错误或空响应
    """
    url = (
        f"{base_url.rstrip('/')}/api/admin/algorithm-export/yeg-test-package"
        f"?periodCode={quote(period_code)}"
    )
    try:
        resp = requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=timeout)
    except requests.RequestException as exc:
        raise RuntimeError(f"fetch preference package failed: {exc}") from exc

    if not resp.ok:
        raise RuntimeError(f"fetch preference package HTTP {resp.status_code}: {resp.text[:200]}")
    if not resp.content:
        raise RuntimeError("fetch preference package returned empty response")

    logger.info("Fetched preference package, size=%d bytes", len(resp.content))
    return resp.content
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd ~/rois/rois-ai/engine-server && python3 -m pytest tests/test_legacy_ro_workdir_prep.py -v`
Expected: 12 PASS

- [ ] **Step 5: Commit**

```bash
cd ~/rois/rois-ai && git add engine-server/src/utils/pbs_server_client.py engine-server/tests/test_legacy_ro_workdir_prep.py && git commit -m "feat(engine-server): pbs-server client for YEG preference package download"
```

---

### Task 3: 配置模型 + config.yaml

**Files:**
- Modify: `engine-server/src/config/config.py`(`LegacyJavaConfig` 类后新增 `PbsServerConfig`;`OptimizerTypeConfig` 加字段)
- Modify: `engine-server/config.yaml`(LegacyRO 块 `legacy_java` 之后)

- [ ] **Step 1: config.py 新增模型**

在 `LegacyJavaConfig` 类定义后添加:

```python
class PbsServerConfig(BaseSettings):
    """pbs-server 凭据 — LegacyRO 下载 YEG 偏好包用。"""
    url: str
    username: str
    password: str
    period_code: str = "Jun 2026"  # periodCode 默认值,任务 parameters.periodCode 可覆盖
```

`OptimizerTypeConfig` 增加字段(`legacy_java` 行之后):

```python
    pbs_server: Optional[PbsServerConfig] = None  # set → LegacyRO 下载 pbs-server 偏好包
```

- [ ] **Step 2: config.yaml LegacyRO 块追加(`legacy_java:` 节点平级)**

```yaml
        pbs_server:
          url: "http://localhost:3002"
          username: "admin"
          password: "${PBS_ADMIN_PASSWORD:Admin@2026}"
          period_code: "Jun 2026"
```

- [ ] **Step 3: 验证配置可加载**

Run: `cd ~/rois/rois-ai/engine-server && python3 -c "from src.config.config import config_manager; cfg = config_manager.get_optimizer_config('F8', 'LegacyRO'); print(cfg.pbs_server.url, cfg.pbs_server.username, cfg.pbs_server.period_code)"`
Expected: `http://localhost:3002 admin Jun 2026`

- [ ] **Step 4: Commit**

```bash
cd ~/rois/rois-ai && git add engine-server/src/config/config.py engine-server/config.yaml && git commit -m "feat(engine-server): pbs_server config block for LegacyRO preference package"
```

---

### Task 4: task_manager 接线(准备 + 归档前清理)

**Files:**
- Modify: `engine-server/src/tasks/task_manager.py`(imports;`_fetch_input_legacy_java` 末尾;新方法 `_prepare_legacy_workdir`;`_submit_output_data` LegacyRO 分支)
- Test: `engine-server/tests/test_legacy_ro_workdir_prep.py`(追加接线测试)

- [ ] **Step 1: 追加失败的接线测试**

在 `tests/test_legacy_ro_workdir_prep.py` 追加。用 `Task.__new__` 构造裸实例,避开 redis/optimizer_manager 依赖;`monkeypatch.chdir` 使 `./F8` 源目录指向 tmp:

```python
from src.exceptions import InputFetchError
from src.tasks.task_manager import Task


def make_bare_task(tmp_path, parameters=None):
    task = Task.__new__(Task)
    task.task_id = "test-task-0001"
    task.airline = "F8"
    task.optimizer_type = "LegacyRO"
    task.parameters = parameters or {}
    task.url = None
    task.token = None
    work = tmp_path / "work"
    work.mkdir(exist_ok=True)
    task.working_dir = str(work)
    task.input_file_path = None
    task.output_file_path = None
    task._archived_to_complete = False
    task._save_to_redis = lambda: None
    return task


class FakePbsCfg:
    def __init__(self, url):
        self.url = url
        self.username = "admin"
        self.password = "Admin@2026"
        self.period_code = "Jun 2026"


class FakeOptimizerCfg:
    def __init__(self, pbs_server=None):
        self.pbs_server = pbs_server


def test_prepare_legacy_workdir_copies_aux_and_extracts_package(
        tmp_path, monkeypatch, mock_pbs_server):
    make_aux_src(tmp_path)
    monkeypatch.chdir(tmp_path)  # aux 源目录按 cwd/<airline> 解析
    task = make_bare_task(tmp_path)

    task._prepare_legacy_workdir(FakeOptimizerCfg(FakePbsCfg(mock_pbs_server)))

    work = tmp_path / "work"
    assert (work / AUX_DIR_NAME / "africa").exists()
    assert (work / AUX_FILE_NAME).exists()
    for name in PREF_FILES:
        assert (work / name).exists(), name


def test_prepare_legacy_workdir_missing_aux_fails_task(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)  # 无 F8/ 源目录
    task = make_bare_task(tmp_path)
    with pytest.raises(InputFetchError, match="aux"):
        task._prepare_legacy_workdir(FakeOptimizerCfg())


def test_prepare_legacy_workdir_pbs_down_fails_task(tmp_path, monkeypatch):
    make_aux_src(tmp_path)
    monkeypatch.chdir(tmp_path)
    task = make_bare_task(tmp_path)
    cfg = FakeOptimizerCfg(FakePbsCfg("http://127.0.0.1:1"))  # 连不上的地址
    with pytest.raises(InputFetchError, match="preference package"):
        task._prepare_legacy_workdir(cfg)


def test_prepare_legacy_workdir_without_pbs_config_skips_download(
        tmp_path, monkeypatch):
    make_aux_src(tmp_path)
    monkeypatch.chdir(tmp_path)
    task = make_bare_task(tmp_path)
    task._prepare_legacy_workdir(FakeOptimizerCfg(pbs_server=None))
    assert (tmp_path / "work" / AUX_DIR_NAME).exists()
    assert not (tmp_path / "work" / "DAYSOFF.csv").exists()


def test_legacy_ro_archive_excludes_aux_files(tmp_path, monkeypatch):
    """归档时 complete/ 不应包含 tzdata 与 Database_connection.txt(偏好 CSV 保留)。"""
    from src.tasks import task_manager as tm

    task = make_bare_task(tmp_path, parameters={"scenarioId": "555"})
    work = tmp_path / "work"
    (work / AUX_DIR_NAME).mkdir()
    (work / AUX_DIR_NAME / "africa").write_text("x")
    (work / AUX_FILE_NAME).write_text("x")
    (work / "DAYSOFF.csv").write_text("x")
    (work / "input.gz").write_bytes(b"in")
    (work / "output.gz").write_bytes(b"out")

    moved_listing = {}

    def fake_move_to_complete(source_dir, airline, scenario_id):
        moved_listing["files"] = sorted(os.listdir(source_dir))
        return None  # 归档失败路径即可,只验证移动时的目录内容

    monkeypatch.setattr(
        tm, "config_manager",
        type("FakeCM", (), {"get_optimizer_config": staticmethod(lambda a, t: FakeOptimizerCfg())})(),
    )
    monkeypatch.setattr(tm.file_manager, "move_to_complete", fake_move_to_complete)

    task._submit_output_data()

    assert AUX_DIR_NAME not in moved_listing["files"]
    assert AUX_FILE_NAME not in moved_listing["files"]
    assert "DAYSOFF.csv" in moved_listing["files"]
    assert "output.gz" in moved_listing["files"]
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd ~/rois/rois-ai/engine-server && python3 -m pytest tests/test_legacy_ro_workdir_prep.py -v -k "prepare or archive"`
Expected: FAIL — `AttributeError: 'Task' object has no attribute '_prepare_legacy_workdir'`;archive 用例 FAIL(tzdata 仍在 listing 中)

- [ ] **Step 3: task_manager.py 实现**

imports 区(`from src.files.file_manager import file_manager` 之后)追加:

```python
from src.utils import pbs_server_client
from src.utils.workdir_prep import (
    copy_aux_files,
    extract_preference_package,
    cleanup_aux_files,
)
```

`_fetch_input_legacy_java` 末尾(`return True` 前,即 "成功获取ro_input.gz" 日志之后)插入:

```python
        # 运行目录准备:复制 tzdata/Database_connection.txt + 下载偏好包
        self._prepare_legacy_workdir(optimizer_config)
```

`_fetch_input_legacy_java` 方法之后新增方法:

```python
    def _prepare_legacy_workdir(self, optimizer_config) -> None:
        """LegacyRO专用：准备外部优化器所需的运行目录文件。

        1. 复制 engine-server/<airline>/tzdata/ 与 Database_connection.txt 到工作目录
           （归档前会被 cleanup_aux_files 删除，不进 complete/）
        2. pbs_server 已配置时，登录 pbs-server 下载 YEG 偏好包 tgz 并解压到工作目录根
           （DAYSOFF/LINE_RULES/PAIRING_SCORE/RESERVE_SCORE 四个 CSV）

        Raises:
            InputFetchError: 辅助文件缺失或偏好包下载/解压失败
        """
        aux_src_dir = os.path.abspath(self.airline)
        try:
            copy_aux_files(aux_src_dir, self.working_dir)
        except (FileNotFoundError, OSError) as e:
            raise InputFetchError(
                f"[Task {self.task_id}] Failed to copy aux files from {aux_src_dir}: {e}"
            ) from e
        logger.info("[Task %s] LegacyRO: 已复制 tzdata + Database_connection.txt", self.task_id)

        pbs_cfg = getattr(optimizer_config, "pbs_server", None)
        if not pbs_cfg:
            logger.info("[Task %s] LegacyRO: 未配置 pbs_server，跳过偏好包下载", self.task_id)
            return

        period_code = str(self.parameters.get("periodCode") or pbs_cfg.period_code)
        try:
            pbs_token = pbs_server_client.login(pbs_cfg.url, pbs_cfg.username, pbs_cfg.password)
            tgz_bytes = pbs_server_client.fetch_yeg_test_package(pbs_cfg.url, pbs_token, period_code)
            extracted = extract_preference_package(tgz_bytes, self.working_dir)
        except (RuntimeError, ValueError) as e:
            raise InputFetchError(
                f"[Task {self.task_id}] Failed to fetch preference package from pbs-server: {e}"
            ) from e
        logger.info("[Task %s] LegacyRO: 偏好包已解压 periodCode=%s files=%s",
                    self.task_id, period_code, extracted)
```

`_submit_output_data` LegacyRO 分支,`complete_dir = file_manager.move_to_complete(...)` 行之前插入:

```python
            # tzdata / Database_connection.txt 不归档,移动前删除
            cleanup_aux_files(self.working_dir)
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd ~/rois/rois-ai/engine-server && python3 -m pytest tests/test_legacy_ro_workdir_prep.py -v`
Expected: 17 PASS

- [ ] **Step 5: Commit**

```bash
cd ~/rois/rois-ai && git add engine-server/src/tasks/task_manager.py engine-server/tests/test_legacy_ro_workdir_prep.py && git commit -m "feat(engine-server): LegacyRO workdir prep + archive cleanup wiring"
```

---

### Task 5: 回归 + 版本号 + 收尾

**Files:**
- Modify: `gantt/src/version.ts`(`BACKEND_VERSION` +1,当前 71 → 实施时以文件实际值 +1)

- [ ] **Step 1: 跑 engine-server 全量测试(CLAUDE.md 命令)**

Run: `cd ~/rois/rois-ai/engine-server && python3 -m pytest tests/test_input_interface.py tests/test_output_interface.py tests/test_auth_and_errors.py tests/test_file_management.py tests/test_e2e_lifecycle.py tests/test_jwt_auth.py tests/test_legacy_ro_workdir_prep.py -v`
Expected: 全部 PASS(105 + 17 新增)

- [ ] **Step 2: 版本号 +1**

`gantt/src/version.ts`:`export const BACKEND_VERSION = 71` → `72`(以实施时实际值为准,只增不减)。

- [ ] **Step 3: Commit**

```bash
cd ~/rois/rois-ai && git add gantt/src/version.ts && git commit -m "chore: bump BACKEND_VERSION for LegacyRO workdir prep"
```

---

## Self-Review 记录

- Spec 覆盖:配置(Task 3)、客户端(Task 2)、复制/解压/清理(Task 1)、接线与失败策略(Task 4)、测试(各任务 TDD)、版本号(Task 5)— 全覆盖。
- 偏好 CSV 保留归档:`test_legacy_ro_archive_excludes_aux_files` 断言 `DAYSOFF.csv` 在归档 listing 中。
- 类型一致性:`copy_aux_files/extract_preference_package/cleanup_aux_files/login/fetch_yeg_test_package` 签名在 Task 1/2 定义、Task 4 按同名引用,一致。
- `build_test_tgz` 字节级比对存在 gzip 时间戳风险,Task 2 Step 1 已附 fallback 断言方案。
