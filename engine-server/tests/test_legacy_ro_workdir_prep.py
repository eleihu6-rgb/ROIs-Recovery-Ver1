"""LegacyRO 运行目录准备测试:辅助文件复制、偏好包解压、归档前清理、bid package 客户端。"""
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
    """构造与 live-server algorithm-export package 同结构的 tgz(4 CSV + README,文件在根)。"""
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for name in PREF_FILES + ["LINE_RULES_README.md"]:
            content = "col_a,col_b\n{},1\n".format(name).encode()
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


# ---------------------------------------------------------------------------
# bid package client (mock live-server, same style as conftest MockLiveServer)
# ---------------------------------------------------------------------------
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

from src.utils import bid_package_client

BID_PACKAGE_TOKEN = "live-token-1"
ROSTER_PERIOD_ID = 6  # 2026RP06 (Jun 2026), matching the period_code used below


class MockBidPackageHandler(BaseHTTPRequestHandler):
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

    def _send_tgz(self):
        data = build_test_tgz()
        self.send_response(200)
        self.send_header("Content-Type", "application/gzip")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length) or b"{}")
        MockBidPackageHandler.requests_seen.append(("POST", self.path, dict(self.headers), body))
        if self.path == "/api/auth/login":
            if body.get("userCode") == "admin" and body.get("password") == "Admin@2026":
                return self._send_json(200, {"code": 200, "data": {"token": BID_PACKAGE_TOKEN}, "message": "ok"})
            return self._send_json(401, {"code": 401, "data": None, "message": "Invalid credentials."})
        if self.path == "/api/admin/algorithm-export/scenario-package":
            if self.headers.get("Authorization") != "Bearer " + BID_PACKAGE_TOKEN:
                return self._send_json(403, {"code": 403, "data": None, "message": "Admin access is required."})
            return self._send_tgz()
        return self._send_json(404, {"code": 404, "data": None, "message": "not found"})

    def do_GET(self):
        MockBidPackageHandler.requests_seen.append(("GET", self.path, dict(self.headers), None))
        if not self.path.startswith("/api/admin/algorithm-export/yeg-test-package"):
            return self._send_json(404, {"code": 404, "data": None, "message": "not found"})
        if self.headers.get("Authorization") != "Bearer " + BID_PACKAGE_TOKEN:
            return self._send_json(403, {"code": 403, "data": None, "message": "Admin access is required."})
        return self._send_tgz()


@pytest.fixture(scope="module")
def mock_bid_package_server():
    server = HTTPServer(("127.0.0.1", 0), MockBidPackageHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield "http://127.0.0.1:{}".format(server.server_address[1])
    server.shutdown()


@pytest.fixture(autouse=True)
def clear_bid_package_requests():
    MockBidPackageHandler.requests_seen.clear()
    yield


def test_bid_package_login_success(mock_bid_package_server):
    token = bid_package_client.login(mock_bid_package_server, "admin", "Admin@2026")
    assert token == BID_PACKAGE_TOKEN


def test_bid_package_login_bad_password_raises(mock_bid_package_server):
    with pytest.raises(RuntimeError, match="login failed"):
        bid_package_client.login(mock_bid_package_server, "admin", "wrong")


def test_bid_package_fetch_yeg_package_sends_token_and_period_code(mock_bid_package_server):
    data = bid_package_client.fetch_yeg_test_package(
        mock_bid_package_server, BID_PACKAGE_TOKEN, "Jun 2026", ROSTER_PERIOD_ID)
    names = tarfile.open(fileobj=io.BytesIO(data), mode="r:gz").getnames()
    assert names == PREF_FILES + ["LINE_RULES_README.md"]
    method, path, headers, _ = MockBidPackageHandler.requests_seen[-1]
    assert method == "GET"
    assert "periodCode=Jun%202026" in path
    assert "rosterPeriodId=6" in path
    assert headers.get("Authorization") == "Bearer " + BID_PACKAGE_TOKEN


def test_bid_package_fetch_yeg_package_bad_token_raises(mock_bid_package_server):
    with pytest.raises(RuntimeError, match="HTTP 403"):
        bid_package_client.fetch_yeg_test_package(
            mock_bid_package_server, "bad-token", "Jun 2026", ROSTER_PERIOD_ID)


def test_bid_package_fetch_scenario_package_posts_period_and_crew_ids(mock_bid_package_server):
    data = bid_package_client.fetch_scenario_package(
        mock_bid_package_server, BID_PACKAGE_TOKEN, "Jun 2026",
        ["274", "499", "536"], ROSTER_PERIOD_ID)
    names = tarfile.open(fileobj=io.BytesIO(data), mode="r:gz").getnames()
    assert names == PREF_FILES + ["LINE_RULES_README.md"]
    method, path, headers, body = MockBidPackageHandler.requests_seen[-1]
    assert method == "POST"
    assert path == "/api/admin/algorithm-export/scenario-package"
    assert headers.get("Authorization") == "Bearer " + BID_PACKAGE_TOKEN
    assert body == {
        "periodCode": "Jun 2026",
        "crewIds": ["274", "499", "536"],
        "rosterPeriodId": ROSTER_PERIOD_ID,
    }


def test_bid_package_fetch_scenario_package_forwards_scenario_window(mock_bid_package_server):
    """When a scenario window is supplied it is forwarded so live-server can narrow the
    PAIRING_SCORE pairing set to the scenario's date range."""
    bid_package_client.fetch_scenario_package(
        mock_bid_package_server, BID_PACKAGE_TOKEN, "Jun 2026", ["274"], ROSTER_PERIOD_ID,
        scenario_start="2026-06-01", scenario_end="2026-06-30")
    _, _, _, body = MockBidPackageHandler.requests_seen[-1]
    assert body == {
        "periodCode": "Jun 2026",
        "crewIds": ["274"],
        "rosterPeriodId": ROSTER_PERIOD_ID,
        "scenarioStart": "2026-06-01",
        "scenarioEnd": "2026-06-30",
    }


def test_bid_package_fetch_scenario_package_forwards_filters(mock_bid_package_server):
    bid_package_client.fetch_scenario_package(
        mock_bid_package_server, BID_PACKAGE_TOKEN, "Jun 2026", ["274"], ROSTER_PERIOD_ID,
        filters={
            "division": "P",
            "status": "ACTIVE",
            "bases": ["YEG"],
            "fleetQuals": ["737"],
        })
    _, _, _, body = MockBidPackageHandler.requests_seen[-1]
    assert body == {
        "periodCode": "Jun 2026",
        "crewIds": ["274"],
        "rosterPeriodId": ROSTER_PERIOD_ID,
        "filters": {
            "division": "P",
            "status": "ACTIVE",
            "bases": ["YEG"],
            "fleetQuals": ["737"],
        },
    }


def test_bid_package_fetch_scenario_package_bad_token_raises(mock_bid_package_server):
    with pytest.raises(RuntimeError, match="HTTP 403"):
        bid_package_client.fetch_scenario_package(
            mock_bid_package_server, "bad-token", "Jun 2026", ["1"], ROSTER_PERIOD_ID)


# ---------------------------------------------------------------------------
# task_manager 接线:_prepare_legacy_workdir + 归档前清理
# ---------------------------------------------------------------------------
from src.exceptions import InputFetchError
from src.tasks.task_manager import Task, _password_from_dsn


def test_password_from_dsn_extracts_and_unquotes():
    assert _password_from_dsn("postgresql://f8:Pier%402026@h:5432/rois") == "Pier@2026"
    assert _password_from_dsn("postgresql://f8:plain@h/rois") == "plain"
    assert _password_from_dsn(None) is None
    assert _password_from_dsn("not-a-dsn") is None


def make_bare_task(tmp_path, parameters=None):
    """绕开 redis/optimizer_manager 构造裸 Task 实例。"""
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


class FakeBidPackageCfg:
    def __init__(self, url):
        self.url = url
        self.username = "admin"
        self.password = "Admin@2026"
        self.period_code = "Jun 2026"


class FakeOptimizerCfg:
    def __init__(self, bid_package_server=None, input_source=None, db_url=None):
        self.bid_package_server = bid_package_server
        self.input_source = input_source
        self.db_url = db_url


def test_prepare_legacy_workdir_copies_aux_and_extracts_package(
        tmp_path, monkeypatch, mock_bid_package_server):
    make_aux_src(tmp_path)
    monkeypatch.chdir(tmp_path)  # aux 源目录按 cwd/<airline> 解析
    task = make_bare_task(tmp_path)

    task._prepare_legacy_workdir(FakeOptimizerCfg(FakeBidPackageCfg(mock_bid_package_server)))

    work = tmp_path / "work"
    assert (work / AUX_DIR_NAME / "africa").exists()
    assert (work / AUX_FILE_NAME).exists()
    for name in PREF_FILES:
        assert (work / name).exists(), name


def test_prepare_legacy_workdir_db_source_uses_scenario_package(
        tmp_path, monkeypatch, mock_bid_package_server):
    """inputSource=db + scenarioId → fetch the scenario-scoped package (the scenario's
    crew set), NOT the hardcoded yeg-test-package."""
    make_aux_src(tmp_path)
    monkeypatch.chdir(tmp_path)
    # Stub the DB-backed scope lookup so the test stays offline.
    import F8.ro_input_builder.cli as ro_cli
    monkeypatch.setattr(
        ro_cli, "scenario_crew_ids",
        lambda airline, scenario, db_url=None: ["274", "499", "536"],
    )
    monkeypatch.setattr(
        ro_cli, "scenario_pairing_window",
        lambda airline, scenario, db_url=None: ("2026-06-01", "2026-06-30"),
    )
    task = make_bare_task(tmp_path, parameters={
        "scenarioId": "537", "inputSource": "db", "rosterPeriodId": ROSTER_PERIOD_ID})
    cfg = FakeOptimizerCfg(
        FakeBidPackageCfg(mock_bid_package_server), input_source="db", db_url="postgresql://x")

    task._prepare_legacy_workdir(cfg)

    posts = [r for r in MockBidPackageHandler.requests_seen
             if r[0] == "POST" and r[1] == "/api/admin/algorithm-export/scenario-package"]
    assert len(posts) == 1, "scenario-package must be requested exactly once"
    # The scenario window is resolved and forwarded alongside the crew scope.
    assert posts[0][3] == {
        "periodCode": "Jun 2026",
        "crewIds": ["274", "499", "536"],
        "rosterPeriodId": ROSTER_PERIOD_ID,
        "scenarioStart": "2026-06-01",
        "scenarioEnd": "2026-06-30",
    }
    # No YEG-14 fallback when a scenario scope is available.
    assert not any(r[0] == "GET" and "yeg-test-package" in r[1]
                   for r in MockBidPackageHandler.requests_seen)
    for name in PREF_FILES:
        assert (tmp_path / "work" / name).exists(), name


def test_prepare_legacy_workdir_db_source_empty_scope_falls_back_to_yeg(
        tmp_path, monkeypatch, mock_bid_package_server):
    """inputSource=db but the scenario resolves to no crew → fall back to yeg-test-package
    rather than requesting an empty scenario package."""
    make_aux_src(tmp_path)
    monkeypatch.chdir(tmp_path)
    import F8.ro_input_builder.cli as ro_cli
    monkeypatch.setattr(ro_cli, "scenario_crew_ids", lambda airline, scenario, db_url=None: [])
    monkeypatch.setattr(ro_cli, "scenario_pairing_window",
                        lambda airline, scenario, db_url=None: None)
    task = make_bare_task(tmp_path, parameters={
        "scenarioId": "999", "inputSource": "db", "rosterPeriodId": ROSTER_PERIOD_ID})
    cfg = FakeOptimizerCfg(
        FakeBidPackageCfg(mock_bid_package_server), input_source="db", db_url="postgresql://x")

    task._prepare_legacy_workdir(cfg)

    yeg_gets = [r for r in MockBidPackageHandler.requests_seen
                if r[0] == "GET" and "yeg-test-package" in r[1]]
    assert len(yeg_gets) == 1, "yeg-test-package must be requested exactly once"
    # The roster period is forwarded so live-server can resolve the period context.
    assert "rosterPeriodId=6" in yeg_gets[0][1]
    assert not any(r[1] == "/api/admin/algorithm-export/scenario-package"
                   for r in MockBidPackageHandler.requests_seen)


def test_prepare_legacy_workdir_skips_bid_package_when_scenario_disables_crew_bids(
        tmp_path, monkeypatch, mock_bid_package_server):
    make_aux_src(tmp_path)
    monkeypatch.chdir(tmp_path)
    import F8.ro_input_builder.cli as ro_cli
    monkeypatch.setattr(ro_cli, "scenario_crew_ids", lambda airline, scenario, db_url=None: ["274"])
    monkeypatch.setattr(ro_cli, "scenario_pairing_window",
                        lambda airline, scenario, db_url=None: ("2026-06-01", "2026-06-30"))
    monkeypatch.setattr(ro_cli, "scenario_crew_division", lambda airline, scenario, db_url=None: "P")
    monkeypatch.setattr(
        Task, "_materialize_algorithm_parameters",
        lambda self, *_args, **_kwargs: False,
    )
    task = make_bare_task(tmp_path, parameters={"scenarioId": "537", "inputSource": "db"})
    cfg = FakeOptimizerCfg(
        FakeBidPackageCfg(mock_bid_package_server), input_source="db", db_url="postgresql://x")

    task._prepare_legacy_workdir(cfg)

    assert not any("algorithm-export" in request[1] for request in MockBidPackageHandler.requests_seen)
    assert not any(request[0] == "GET" and "yeg-test-package" in request[1]
                   for request in MockBidPackageHandler.requests_seen)


def test_build_subprocess_env_injects_pg_password_from_db_url(tmp_path, monkeypatch):
    """子进程环境注入 PG_PASSWORD（取自 db_url），让 Rust connector 能读 workset 103。"""
    monkeypatch.delenv("PG_PASSWORD", raising=False)
    task = make_bare_task(tmp_path)
    cfg = FakeOptimizerCfg(db_url="postgresql://f8:secretpw@host:5432/rois")
    env = task._build_subprocess_env(cfg)
    assert env["PG_PASSWORD"] == "secretpw"


def test_build_subprocess_env_does_not_override_existing_pg_password(tmp_path, monkeypatch):
    monkeypatch.setenv("PG_PASSWORD", "preset")
    task = make_bare_task(tmp_path)
    cfg = FakeOptimizerCfg(db_url="postgresql://f8:other@host/rois")
    env = task._build_subprocess_env(cfg)
    assert env["PG_PASSWORD"] == "preset"


def test_build_subprocess_env_no_db_url_leaves_pg_password_unset(tmp_path, monkeypatch):
    monkeypatch.delenv("PG_PASSWORD", raising=False)
    task = make_bare_task(tmp_path)
    env = task._build_subprocess_env(FakeOptimizerCfg())
    assert "PG_PASSWORD" not in env


def test_build_subprocess_env_sets_rust_rule_workset_for_db_scenario(tmp_path, monkeypatch):
    """db-source LegacyRO → resolve THIS scenario's workset into RUST_RULE_WORKSET so the
    Rust connector enforces the scenario's OWN ruleset, not a hardcoded one."""
    monkeypatch.delenv("RUST_RULE_WORKSET", raising=False)
    import F8.ro_input_builder.cli as ro_cli
    monkeypatch.setattr(ro_cli, "scenario_workset_id",
                        lambda airline, scenario, db_url=None: 207)
    task = make_bare_task(tmp_path, parameters={"scenarioId": "537", "inputSource": "db"})
    cfg = FakeOptimizerCfg(input_source="db", db_url="postgresql://f8:pw@h/rois")
    env = task._build_subprocess_env(cfg)
    assert env["RUST_RULE_WORKSET"] == "207"


def test_build_subprocess_env_no_workset_when_unresolved(tmp_path, monkeypatch):
    monkeypatch.delenv("RUST_RULE_WORKSET", raising=False)
    import F8.ro_input_builder.cli as ro_cli
    monkeypatch.setattr(ro_cli, "scenario_workset_id",
                        lambda airline, scenario, db_url=None: None)
    task = make_bare_task(tmp_path, parameters={"scenarioId": "999", "inputSource": "db"})
    cfg = FakeOptimizerCfg(input_source="db", db_url="postgresql://f8:pw@h/rois")
    env = task._build_subprocess_env(cfg)
    assert "RUST_RULE_WORKSET" not in env


def test_prepare_legacy_workdir_missing_aux_fails_task(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)  # 无 F8/ 源目录
    task = make_bare_task(tmp_path)
    with pytest.raises(InputFetchError, match="aux"):
        task._prepare_legacy_workdir(FakeOptimizerCfg())


def test_prepare_legacy_workdir_bid_package_server_down_fails_task(tmp_path, monkeypatch):
    make_aux_src(tmp_path)
    monkeypatch.chdir(tmp_path)
    task = make_bare_task(tmp_path)
    cfg = FakeOptimizerCfg(FakeBidPackageCfg("http://127.0.0.1:1"))  # 连不上的地址
    with pytest.raises(InputFetchError, match="preference package"):
        task._prepare_legacy_workdir(cfg)


def test_prepare_legacy_workdir_without_bid_package_config_skips_download(
        tmp_path, monkeypatch):
    make_aux_src(tmp_path)
    monkeypatch.chdir(tmp_path)
    task = make_bare_task(tmp_path)
    task._prepare_legacy_workdir(FakeOptimizerCfg(bid_package_server=None))
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

    def fake_move_to_complete(source_dir, airline, scenario_id, version=None):
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
