import os
import csv
import gzip
import hashlib
import json
import shutil
import uuid
import subprocess
import threading
import time
import logging
from datetime import datetime, timezone
from typing import Dict, Optional, List
from enum import Enum
from src.optimizers.optimizer_manager import optimizer_manager
from src.config.config import config_manager
from src.tasks.redis_manager import redis_manager
from src.utils.http_client import create_live_server_client
from src.utils.rule_request_builder import RuleRequestBuilder
from src.utils.legacy_java_client import (
    login as legacy_java_login,
    fetch_ro_input as legacy_java_fetch,
)
from src.files.file_manager import file_manager
from src.utils import bid_package_client
from src.utils.workdir_prep import (
    copy_aux_files,
    extract_preference_package,
    cleanup_aux_files,
)
from src.exceptions import (
    OptimizerNotFoundError, OptimizerExecutionError,
    TaskNotFoundError, TaskLimitError, TaskStateError,
    InputFetchError, OutputSubmitError,
)
from src.report.scenario_report import (
    _credit_roster_period_note,
    build_report_sections,
)

logger = logging.getLogger(__name__)

REPORT_SCENARIO_RETENTION_DAYS = 3


def _compact_credit_hour_report(result_json: Dict) -> List[dict]:
    """Expose the solver's final credit rows without sending the full result JSON."""
    initial_rows = result_json.get("initial_generator_summary", {}).get("credit_hour_report", [])
    final_rows = result_json.get("final_credit_hour_report", [])
    if not isinstance(initial_rows, list):
        initial_rows = []
    if not isinstance(final_rows, list):
        final_rows = []
    final_by_crew = {
        str(row.get("crew_id")): row
        for row in final_rows
        if isinstance(row, dict) and row.get("crew_id") is not None
    }
    # The Report uses the initial credit-hour report because it contains the
    # per-day and day-off fields. Merge final values underneath it for fields
    # that only exist after the selected assignment is finalized.
    raw_rows = initial_rows or final_rows
    if not isinstance(raw_rows, list):
        return []

    crew_info = result_json.get("crew_info", {})
    if not isinstance(crew_info, dict):
        crew_info = {}

    compact: List[dict] = []
    for raw in raw_rows:
        if not isinstance(raw, dict):
            continue
        crew_id = str(raw.get("crew_id", ""))
        merged = {**raw, **final_by_crew.get(crew_id, {})}
        crew = crew_info.get(crew_id, {})
        if not isinstance(crew, dict):
            crew = {}
        row = dict(merged)
        row["base"] = crew.get("base", "")
        row["credit_min"] = merged.get("target_min")
        row["credit_max"] = merged.get("target_max")
        row["pre_assigned_types"] = _preassigned_types_for_period(
            crew.get("preassign_tasks", []),
            merged.get("credit_period"),
        )
        compact.append(row)
    return compact


def _preassigned_types_for_period(tasks: object, credit_period: object) -> str:
    """Match the Report's compact pre-assignment type summary for one period."""
    if not isinstance(tasks, list):
        return ""
    counts: Dict[str, int] = {}
    period_start, period_end = _calendar_month_bounds(credit_period)
    for task in tasks:
        if not isinstance(task, dict):
            continue
        start = _epoch_to_datetime(task.get("start_time_utc"))
        end = _epoch_to_datetime(task.get("end_time_utc"))
        if period_start is not None and start is not None:
            effective_end = end if end is not None and end > start else start
            if not (start < period_end and effective_end > period_start):
                continue
        label = str(task.get("label") or task.get("assignment") or "").strip()
        if label:
            counts[label] = counts.get(label, 0) + 1
    return ", ".join(
        f"{label} ×{count}"
        for label, count in sorted(counts.items(), key=lambda item: (-item[1], item[0].upper()))
    )


def _epoch_to_datetime(value: object) -> Optional[datetime]:
    if value is None or value == "":
        return None
    try:
        return datetime.fromtimestamp(float(value), tz=timezone.utc)
    except (TypeError, ValueError, OverflowError, OSError):
        return None


def _calendar_month_bounds(value: object) -> tuple[Optional[datetime], Optional[datetime]]:
    text = str(value or "").strip().upper()
    if len(text) == 7 and text[4] == "-" and text[:4].isdigit() and text[5:].isdigit():
        year, month = int(text[:4]), int(text[5:])
    elif len(text) == 8 and text[4:6] == "RP" and text[:4].isdigit() and text[6:].isdigit():
        year, month = int(text[:4]), int(text[6:])
    else:
        return None, None
    if month < 1 or month > 12:
        return None, None
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    end = datetime(year + (month == 12), 1 if month == 12 else month + 1, 1, tzinfo=timezone.utc)
    return start, end


def _password_from_dsn(dsn: Optional[str]) -> Optional[str]:
    """从 postgresql:// DSN 提取密码（无第三方依赖，失败返回 None）。"""
    if not dsn:
        return None
    try:
        from urllib.parse import urlsplit, unquote
        pw = urlsplit(dsn).password
        return unquote(pw) if pw else None
    except Exception:
        return None


def _pg_env_from_dsn(dsn: Optional[str]) -> Dict[str, str]:
    """从 postgresql:// DSN 提取 PG_HOST/PG_PORT/PG_DATABASE/PG_USER/PG_PASSWORD。

    mode=rust 的 Rust 法规 connector 的 `_connect` 默认连 localhost:5432——只注入
    PG_PASSWORD 会让它用远端密码连**本地旧库**，workset 查询失败（`column r.rule_id
    does not exist`）后静默回退 F8 默认值（缺 8056 分组行 → FLY|RES→VAC/DO 不生效）。
    注入完整连接，让 connector 读取与 ro_input / gantt Legality 同一个库的 workset 103。
    失败返回空 dict。"""
    if not dsn:
        return {}
    try:
        from urllib.parse import urlsplit, unquote
        u = urlsplit(dsn)
        out: Dict[str, str] = {}
        if u.hostname:
            out["PG_HOST"] = u.hostname
        if u.port:
            out["PG_PORT"] = str(u.port)
        db = (u.path or "").lstrip("/")
        if db:
            out["PG_DATABASE"] = db
        if u.username:
            out["PG_USER"] = unquote(u.username)
        if u.password:
            out["PG_PASSWORD"] = unquote(u.password)
        return out
    except Exception:
        return {}


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


def parse_input_sections(gz_path: str) -> Dict[str, List[dict]]:
    """解析 live-server ro_input.gz 为 {section: [rows]}。

    live-server 的 ``buildRoInputGz`` 输出与 output.gz 相同的 ``## section``
    CSV 格式，因此是 ``parse_output_sections`` 的薄别名。
    """
    return parse_output_sections(gz_path)


class TaskStatus(Enum):
    PENDING = "pending"      # 待执行
    RUNNING = "running"      # 运行中
    COMPLETED = "completed"  # 已完成
    FAILED = "failed"        # 失败
    STOPPED = "stopped"      # 已停止


class Task:
    def __init__(self, task_id: str, airline: str, optimizer_type: str, parameters: dict = None,
                 url: str = None, token: str = None, user: str = None):
        self.task_id = task_id
        self.airline = airline
        self.optimizer_type = optimizer_type
        self.parameters = parameters or {}
        self.url = url  # Live Server URL
        self.token = token  # 认证token (用于调用Live Server)
        self.user = user  # 用户名
        self.status = TaskStatus.PENDING
        self.progress = 0
        self.progress_stage = "starting"
        self.start_time = None
        self.end_time = None
        self.error_message = None
        self.working_dir = optimizer_manager.prepare_working_dir(airline, optimizer_type, self.parameters, task_id[:8])
        self.process = None
        self.server_id = redis_manager.get_server_id()
        self.input_file_path = None
        self.output_file_path = None
        self._archived_to_complete = False  # RO 场景流：是否已 move_to_complete
        self._stdout_lines: List[str] = []
        self._stderr_lines: List[str] = []

        # 初始化时保存到Redis
        self._save_to_redis()

    def _save_to_redis(self):
        """保存任务数据到Redis"""
        task_data = {
            'task_id': self.task_id,
            'airline': self.airline,
            'optimizer_type': self.optimizer_type,
            'parameters': self.parameters,
            'status': self.status.value,
            'progress': self.progress,
            'progress_stage': self.progress_stage,
            'start_time': self.start_time,
            'end_time': self.end_time,
            'error_message': self.error_message,
            'server_id': self.server_id,
            'output_file_path': self.output_file_path,
            'input_file_path': self.input_file_path,
        }
        redis_manager.set_task(self.task_id, task_data)

    def _server_integration_enabled(self, optimizer_config) -> bool:
        """判断优化器是否启用 Live Server 集成"""
        return bool(getattr(optimizer_config, 'server_integration', False))

    def _build_subprocess_env(self, optimizer_config) -> dict:
        """优化器子进程环境变量。

        继承引擎环境后，确保 PG_PASSWORD 存在：mode=rust 的 in-process Rust 法规
        connector 据此从 PG workset 103 读取**权威**法规参数（gantt Legality 同源）。
        缺失时 connector 会静默回退到写死的旧默认值（如 8002 112h vs workset-103 58h），
        导致 solver 与 gantt 判定不一致、coverage 虚高。密码取自构建 ro_input 用的同一
        db_url，所以 solver 法规参数始终跟随 gantt。
        """
        env = os.environ.copy()
        # Inject the FULL PG connection from the same db_url used to build ro_input so the
        # Rust connector reads workset 103 from the SAME database as the gantt Legality tab
        # (its _connect defaults to localhost:5432 — injecting only the password made it hit a
        # local dev DB with an old schema → param query fails → F8 fallback). setdefault so an
        # operator's explicit PG_* env still wins.
        for _k, _v in _pg_env_from_dsn(getattr(optimizer_config, "db_url", None)).items():
            env.setdefault(_k, _v)

        # Scenario-specific ruleset: resolve THIS scenario's workset (same name-match
        # the gantt Legality uses) and hand it to the Rust connector via
        # RUST_RULE_WORKSET, so each scenario enforces its OWN ruleset instead of a
        # hardcoded workset. Each scenario defines its own ruleset/crew/pairing scope.
        input_source = self.parameters.get("inputSource") or getattr(
            optimizer_config, "input_source", None)
        if input_source == "db" and self.optimizer_type == "LegacyRO":
            try:
                from F8.ro_input_builder import cli as ro_input_cli
                ws = ro_input_cli.scenario_workset_id(
                    airline=self.airline.lower(),
                    scenario=int(self.parameters.get("scenarioId", 6)),
                    db_url=getattr(optimizer_config, "db_url", None),
                )
                if ws:
                    env["RUST_RULE_WORKSET"] = str(ws)
            except Exception as e:  # noqa: BLE001 — best-effort; connector defaults to 103
                logger.warning("[Task %s] 场景 ruleset workset 解析失败，connector 用默认: %s",
                               self.task_id, e)

            # Crew division (P/C): the solver filters crews by problem.crew_type and the
            # deploy experiment hardcodes 'P', so a cabin-crew scenario would be filtered
            # to 0 crews. Pass the scenario's OWN division to ro_rust.sh (RO_CREW_TYPE)
            # so each division solves with zero code change. Default 'P' keeps pilot runs
            # byte-identical when unresolved.
            try:
                from F8.ro_input_builder import cli as ro_input_cli
                div = ro_input_cli.scenario_crew_division(
                    airline=self.airline.lower(),
                    scenario=int(self.parameters.get("scenarioId", 6)),
                    db_url=getattr(optimizer_config, "db_url", None),
                )
                if div:
                    env["RO_CREW_TYPE"] = div
            except Exception as e:  # noqa: BLE001 — best-effort; ro_rust.sh defaults to 'P'
                logger.warning("[Task %s] 场景 crew division 解析失败，solver 用默认 P: %s",
                               self.task_id, e)
        return env

    def _get_rule_category(self) -> str:
        """Rule 专用：获取并校验 category 参数，缺失时抛 ValueError"""
        category = self.parameters.get("category")
        if not category:
            raise ValueError("Rule type is missing the 'category' parameter")
        return category

    def _resolve_url_path(self, optimizer_config, direction: str) -> str:
        """按优化器类型解析 input/output URL 路径

        Rule 走 optimizer_config.categories[category].url.<direction>；
        PO/RO/TO 走 optimizer_config.url.<direction>。

        Args:
            direction: 'input' 或 'output'
        """
        if self.optimizer_type == "Rule":
            category = self._get_rule_category()
            if category not in optimizer_config.categories:
                raise ValueError(f"Rule category '{category}' does not exist")
            url_cfg = optimizer_config.categories[category].url
        else:
            url_cfg = optimizer_config.url
        return getattr(url_cfg, direction)

    def _build_input_request_body(self):
        """按优化器类型构造 Live Server input 请求体

        - Rule: 通过 RuleRequestBuilder 构造 dict（_post 会以 json= 发送）
        - PO/RO/TO: 发送纯整数 scenarioId（_post 会以 str(int) 作为原始 body）
        """
        if self.optimizer_type == "Rule":
            return RuleRequestBuilder.build_request(self._get_rule_category(), self.parameters)

        scenario_id = self.parameters.get("scenarioId")
        if not scenario_id:
            return None
        try:
            return int(scenario_id)
        except (ValueError, TypeError):
            return scenario_id

    def _resolve_live_server_auth(self) -> (str, str):
        """解析调用 Live Server 时使用的 base_url 和 token，未传时回退到默认值"""
        base_url = self.url if self.url else f"http://localhost/{self.airline.lower()}"
        token = self.token if self.token else ""
        return base_url, token

    def _fetch_input_data(self) -> bool:
        """从Live Server获取input.gz文件（LegacyRO走Java server登录路径）

        Returns:
            True: 成功获取input.gz
            False: server_integration未启用，不需要获取

        Raises:
            InputFetchError: 获取input.gz失败
        """
        optimizer_config = config_manager.get_optimizer_config(self.airline, self.optimizer_type)

        if not self._server_integration_enabled(optimizer_config):
            logger.info("[Task %s] server_integration未启用，跳过获取input.gz", self.task_id)
            return False

        # LegacyRO + inputSource=db: build input.gz directly from PostgreSQL.
        # Per-task parameter overrides the config default (optimizer_config.input_source).
        input_source = self.parameters.get("inputSource") or getattr(optimizer_config, "input_source", None)
        if self.optimizer_type == "LegacyRO" and input_source == "db":
            return self._generate_input_from_db(optimizer_config)

        # LegacyRO: login to Java server first, then call comptxt
        if self.optimizer_type == "LegacyRO" and getattr(optimizer_config, "legacy_java", None):
            return self._fetch_input_legacy_java(optimizer_config)

        try:
            input_url = self._resolve_url_path(optimizer_config, "input")
            request_data = self._build_input_request_body()
        except ValueError as e:
            raise InputFetchError(f"[Task {self.task_id}] {e}") from e

        base_url, token = self._resolve_live_server_auth()

        logger.info("[Task %s] 正在从Live Server获取input.gz, URL: %s, API: %s",
                    self.task_id, base_url, input_url)
        logger.debug("[Task %s] 请求数据: %s", self.task_id, request_data)

        try:
            with create_live_server_client(base_url, token) as client:
                response_data = client.get_input_data(
                    airline=self.airline,
                    url_path=input_url,
                    data=request_data,
                )
        except Exception as e:
            raise InputFetchError(f"[Task {self.task_id}] Failed to fetch input.gz: {e}") from e

        # 保存input.gz文件
        self.input_file_path = os.path.join(self.working_dir, "input.gz")
        with open(self.input_file_path, 'wb') as f:
            f.write(response_data)

        logger.info("[Task %s] 成功获取input.gz，大小: %d bytes", self.task_id, len(response_data))
        return True

    def _fetch_input_legacy_java(self, optimizer_config) -> bool:
        """LegacyRO专用：登录Java server，调用/api/orengine/ro/comptxt取老格式input.gz。

        parameters.javaScenarioId — 传给Java server的场景ID（默认114，临时固定）
        parameters.scenarioId    — 新系统场景ID，仅用于complete/目录命名，不传给Java
        """
        legacy = optimizer_config.legacy_java

        # Java server scenarioId: 可通过 javaScenarioId 参数覆盖，默认固定为 114
        java_scenario_id = int(self.parameters.get("javaScenarioId", 114))

        logger.info("[Task %s] LegacyRO: 登录Java server %s, user=%s",
                    self.task_id, legacy.url, legacy.username)
        try:
            java_token = legacy_java_login(legacy.url, legacy.username, legacy.password)
        except Exception as e:
            raise InputFetchError(f"[Task {self.task_id}] Java server login failed: {e}") from e

        logger.info("[Task %s] LegacyRO: 获取ro_input.gz, javaScenarioId=%d", self.task_id, java_scenario_id)
        try:
            response_data = legacy_java_fetch(legacy.url, java_token, java_scenario_id)
        except Exception as e:
            raise InputFetchError(f"[Task {self.task_id}] Failed to fetch legacy-format input.gz: {e}") from e

        self.input_file_path = os.path.join(self.working_dir, "input.gz")
        with open(self.input_file_path, 'wb') as f:
            f.write(response_data)

        logger.info("[Task %s] LegacyRO: 成功获取ro_input.gz，大小: %d bytes",
                    self.task_id, len(response_data))

        # 运行目录准备:复制 tzdata/Database_connection.txt + 下载偏好包
        self._prepare_legacy_workdir(optimizer_config)
        return True

    def _generate_input_from_db(self, optimizer_config) -> bool:
        """LegacyRO + inputSource=db: build ro_input.txt/input.gz from PostgreSQL
        (replaces the Java-server fetch), then prepare the legacy work dir."""
        scenario = int(self.parameters.get("scenarioId", 6))
        txt_path = os.path.join(self.working_dir, "ro_input.txt")
        self.input_file_path = os.path.join(self.working_dir, "input.gz")
        logger.info("[Task %s] LegacyRO(db): generating ro_input from Postgres, scenario=%d",
                    self.task_id, scenario)
        try:
            from F8.ro_input_builder import cli as ro_input_cli
            ro_input_cli.build(
                airline=self.airline.lower(), scenario=scenario,
                out_path=txt_path, registry_name="full", gz_path=self.input_file_path,
                db_url=getattr(optimizer_config, "db_url", None),
            )
        except Exception as e:
            raise InputFetchError(
                f"[Task {self.task_id}] Failed to generate input.gz from DB: {e}"
            ) from e
        logger.info("[Task %s] LegacyRO(db): input.gz generated (%d bytes)",
                    self.task_id, os.path.getsize(self.input_file_path))
        self._prepare_legacy_workdir(optimizer_config)
        return True

    def _prepare_legacy_workdir(self, optimizer_config) -> None:
        """LegacyRO专用：准备外部优化器所需的运行目录文件。

        1. 复制 engine-server/<airline>/tzdata/ 与 Database_connection.txt 到工作目录
           （归档前会被 cleanup_aux_files 删除，不进 complete/）
        2. bid_package_server 已配置时，登录 live-server 下载偏好包 tgz 并解压到工作目录根
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

        package_cfg = getattr(optimizer_config, "bid_package_server", None)
        if not package_cfg:
            logger.info("[Task %s] LegacyRO: 未配置 bid_package_server，跳过偏好包下载", self.task_id)
            return

        period_code = str(self.parameters.get("periodCode") or package_cfg.period_code)
        roster_period_id = self.parameters.get("rosterPeriodId")

        # Scenario-scoped crew set: the SAME crew the ro_input was just built from.
        # When available we ask live-server for a scenario-specific bid package so the
        # solver's preference CSVs match the optimized roster crew; otherwise (no
        # scenarioId / empty scope) fall back to the legacy YEG-14 test package.
        crew_ids: list[str] = []
        scenario_window: tuple[str, str] | None = None
        include_crew_bids = True
        input_source = self.parameters.get("inputSource") or getattr(
            optimizer_config, "input_source", None)
        if input_source == "db":
            scenario = int(self.parameters.get("scenarioId", 6))
            try:
                from F8.ro_input_builder import cli as ro_input_cli
                db_url = getattr(optimizer_config, "db_url", None)
                crew_ids = ro_input_cli.scenario_crew_ids(
                    airline=self.airline.lower(), scenario=scenario, db_url=db_url,
                )
                # Bound the PAIRING_SCORE bid set to the scenario's date window so the
                # bid package isn't scored against every live pairing (all months).
                scenario_window = ro_input_cli.scenario_pairing_window(
                    airline=self.airline.lower(), scenario=scenario, db_url=db_url,
                )
                try:
                    division = ro_input_cli.scenario_crew_division(
                        airline=self.airline.lower(), scenario=scenario, db_url=db_url,
                    )
                except Exception as e:  # noqa: BLE001 — unknown division keeps legacy all-rank behavior
                    division = None
                    logger.warning("[Task %s] 场景 Division 解析失败，算法参数保留全量 Rank: %s",
                                   self.task_id, e)
                include_crew_bids = self._materialize_algorithm_parameters(
                    ro_input_cli, scenario, db_url, division,
                )
            except Exception as e:  # noqa: BLE001 — scope lookup is best-effort
                logger.warning("[Task %s] LegacyRO: 场景 crew 范围获取失败，回退 YEG 偏好包: %s",
                               self.task_id, e)

        if not include_crew_bids:
            logger.info("[Task %s] Crew Bid disabled for scenario; skipping preference package", self.task_id)
            return

        try:
            package_token = bid_package_client.login(
                package_cfg.url, package_cfg.username, package_cfg.password)
            if crew_ids:
                win_start, win_end = scenario_window or (None, None)
                tgz_bytes = bid_package_client.fetch_scenario_package(
                    package_cfg.url, package_token, period_code, crew_ids,
                    roster_period_id,
                    scenario_start=win_start, scenario_end=win_end)
                pkg_kind = f"scenario(crew={len(crew_ids)})"
            else:
                tgz_bytes = bid_package_client.fetch_yeg_test_package(
                    package_cfg.url, package_token, period_code, roster_period_id)
                pkg_kind = "yeg-14"
            extracted = extract_preference_package(tgz_bytes, self.working_dir)
        except (RuntimeError, ValueError) as e:
            raise InputFetchError(
                f"[Task {self.task_id}] Failed to fetch preference package from bid package server: {e}"
            ) from e
        logger.info("[Task %s] LegacyRO: 偏好包已解压 kind=%s periodCode=%s files=%s",
                    self.task_id, pkg_kind, period_code, extracted)

    def _materialize_algorithm_parameters(
        self,
        ro_input_cli,
        scenario: int,
        db_url: str | None,
        division: str | None = None,
    ) -> bool:
        """Write Algorithm Param files into the solver working directory.

        The PBS report app feeds these as meta.json + FLOOR_RESCUE_RULES.json and
        Hydra argv. In engine-server we persist the same values in
        scenario_parameter, then materialize the equivalent run artifacts here.
        """
        team_rules_path = os.path.join(self.working_dir, "TEAM_RULES.json")
        for stale_path in (team_rules_path,):
            if os.path.exists(stale_path):
                os.remove(stale_path)

        try:
            payload = ro_input_cli.scenario_algorithm_parameters(
                airline=self.airline.lower(), scenario=scenario, db_url=db_url,
                division=division,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("[Task %s] Algorithm Param load failed: %s", self.task_id, exc)
            return True

        floor_rules = payload.get("floor_rescue_rules")
        if isinstance(floor_rules, dict):
            path = os.path.join(self.working_dir, "FLOOR_RESCUE_RULES.json")
            with open(path, "w", encoding="utf-8") as f:
                json.dump(floor_rules, f, indent=2)
                f.write("\n")

        hydra_args = payload.get("hydra_args")
        if isinstance(hydra_args, list):
            path = os.path.join(self.working_dir, "algorithm_args.txt")
            with open(path, "w", encoding="utf-8") as f:
                for arg in hydra_args:
                    if isinstance(arg, str) and arg.strip():
                        f.write(arg.strip() + "\n")

        meta = payload.get("meta")
        if isinstance(meta, dict):
            path = os.path.join(self.working_dir, "algorithm_meta.json")
            with open(path, "w", encoding="utf-8") as f:
                json.dump(meta, f, indent=2)
                f.write("\n")

        # Team Rules (Algorithm Param tab): the solver only ever receives team rules
        # through TEAM_RULES.json in pref_dir (== self.working_dir, see ro_pipeline.sh
        # / ro_rust.sh). Without it io/team_rules.py load_team_rules() returns [] and
        # the rules sit in algorithm_meta.json silently ignored. Materialize the file
        # here so an edited filter or a toggled-off rule takes effect on this run.
        team_rules = []
        if isinstance(meta, dict) and meta.get("team_rules"):
            try:
                team_rules = ro_input_cli.resolve_team_rules_for_solver(
                    airline=self.airline.lower(), scenario=scenario, db_url=db_url,
                    team_rules=meta.get("team_rules"),
                )
            except Exception as exc:  # noqa: BLE001 — optimization continues with no solver Team Rules
                logger.warning("[Task %s] Team rules handoff failed: %s", self.task_id, exc)
                team_rules = []
            if team_rules:
                with open(team_rules_path, "w", encoding="utf-8") as f:
                    json.dump({"rules": team_rules}, f, indent=2)
                    f.write("\n")

        ruleset_id = None
        rules = []
        try:
            ruleset_id = ro_input_cli.scenario_workset_id(
                airline=self.airline.lower(), scenario=scenario, db_url=db_url,
            )
            from F8.ro_input_builder import db as ro_db
            conn = ro_db.connect(self.airline.lower(), db_url)
            try:
                cur = conn.cursor()
                cur.execute(
                    """
                    SELECT rs.rule_id, r.param_json
                      FROM rule_set rs
                      JOIN rule r ON r.rule_id = rs.rule_id
                     WHERE rs.workset_id = %s
                     ORDER BY rs.id
                    """,
                    (ruleset_id,),
                )
                rules = [
                    {"ruleId": str(rule_id), "paramJson": param_json}
                    for rule_id, param_json in cur.fetchall()
                ]
                cur.close()
            finally:
                conn.close()
        except Exception as exc:  # noqa: BLE001 - snapshot failure must not fail optimization
            logger.warning("[Task %s] Rule parameter snapshot failed: %s", self.task_id, exc)

        snapshot = {
            "scenarioId": scenario,
            "airline": self.airline,
            "generatedAt": datetime.utcnow().isoformat() + "Z",
            "rulesetId": ruleset_id,
            "algorithm": payload,
            "rules": rules,
        }
        path = os.path.join(self.working_dir, "ruleset_parameters.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(snapshot, f, indent=2, default=str)
            f.write("\n")
        meta = payload.get("meta")
        return not isinstance(meta, dict) or meta.get("include_crew_bids", True) is not False

    def _submit_output_data(self) -> bool:
        """向Live Server提交output.gz文件（LegacyRO不回调，仅归档）

        Returns:
            True: 成功提交
            False: server_integration未启用，不需要提交

        Raises:
            OutputSubmitError: 提交output.gz失败
        """
        optimizer_config = config_manager.get_optimizer_config(self.airline, self.optimizer_type)

        # LegacyRO: 归档到 complete/ 并通知 live-server 更新场景状态 RUNNING→DONE
        if self.optimizer_type == "LegacyRO":
            self.output_file_path = os.path.join(self.working_dir, "output.gz")
            self.input_file_path  = os.path.join(self.working_dir, "input.gz")
            scenario_id = str(
                self.parameters.get("scenarioId")
                or self.parameters.get("javaScenarioId", 114)
            )
            # tzdata / Database_connection.txt 不归档,移动前删除
            cleanup_aux_files(self.working_dir)
            version = str(self.parameters.get("version") or "")
            complete_dir = file_manager.move_to_complete(
                self.working_dir,
                self.airline,
                scenario_id,
                version=version or None,
            )
            if complete_dir:
                self.output_file_path = os.path.join(complete_dir, "output.gz")
                self.input_file_path  = os.path.join(complete_dir, "input.gz")
                self._archived_to_complete = True
                logger.info("[Task %s] LegacyRO: 已归档到 %s", self.task_id, complete_dir)
                self._export_to_report_scenario(complete_dir, scenario_id)
                file_manager.cleanup_expired_complete_files()
            else:
                logger.warning("[Task %s] LegacyRO: 归档失败，文件留在工作目录", self.task_id)

            # 通知 live-server：场景优化完成，更新状态 RUNNING→DONE
            self._notify_live_server_result(scenario_id)
            self._save_to_redis()
            return False  # no Java server callback

        if not self._server_integration_enabled(optimizer_config):
            logger.info("[Task %s] server_integration未启用，跳过提交output.gz", self.task_id)
            return False

        self.output_file_path = os.path.join(self.working_dir, "output.gz")
        if not os.path.exists(self.output_file_path):
            raise OutputSubmitError(f"[Task {self.task_id}] Output file does not exist: {self.output_file_path}")

        try:
            output_url = self._resolve_url_path(optimizer_config, "output")
        except ValueError as e:
            raise OutputSubmitError(f"[Task {self.task_id}] {e}") from e

        base_url, token = self._resolve_live_server_auth()

        # RO 走新场景流：解析结果 → 归档 complete → 提交 metadata JSON
        if self.optimizer_type == "RO":
            return self._submit_scenario_result(output_url, base_url, token)

        # PO/TO/Rule 沿用遗留 bytes 提交
        logger.info("[Task %s] 正在向Live Server提交output.gz, URL: %s, API: %s",
                    self.task_id, base_url, output_url)

        try:
            with open(self.output_file_path, 'rb') as f:
                output_data = f.read()

            with create_live_server_client(base_url, token) as client:
                client.submit_output_data(
                    airline=self.airline,
                    url_path=output_url,
                    data=output_data,
                )
        except Exception as e:
            raise OutputSubmitError(f"[Task {self.task_id}] Failed to submit output.gz: {e}") from e

        logger.info("[Task %s] 成功提交output.gz，大小: %d bytes", self.task_id, len(output_data))
        return True

    def _submit_scenario_result(self, output_url: str, base_url: str, token: str) -> bool:
        """RO 场景流结果提交：解析 output.gz → 归档 complete/ → 提交 metadata JSON。

        归档后 self.working_dir 已迁移，self.output_file_path 更新为归档后路径
        （供 GET /optimize/result/{task_id} 读取）。
        """
        try:
            sections = parse_output_sections(self.output_file_path)
        except Exception as e:
            raise OutputSubmitError(f"[Task {self.task_id}] Failed to parse output.gz: {e}") from e

        result_meta_rows = sections.get("RESULT_META", [])
        result_meta = result_meta_rows[0] if result_meta_rows else {}
        status = result_meta.get("status") or "DONE"

        with open(self.output_file_path, 'rb') as f:
            out_bytes = f.read()

        scenario_id = str(self.parameters.get("scenarioId", ""))
        version = str(self.parameters.get("version") or "")
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        complete_dir = file_manager.move_to_complete(
            self.working_dir,
            self.airline,
            scenario_id,
            version=version or None,
            timestamp=timestamp,
        )
        if complete_dir:
            self.output_file_path = os.path.join(complete_dir, "output.gz")
            self.input_file_path = os.path.join(complete_dir, "input.gz")
            self._archived_to_complete = True
            self._export_to_report_scenario(complete_dir, scenario_id)
            file_manager.cleanup_expired_complete_files()
        file_path = self.output_file_path
        file_timestamp = os.path.basename(complete_dir) if complete_dir else timestamp
        archive_path = os.path.dirname(file_path)
        result_json: Dict = {}
        if complete_dir:
            result_json_path = os.path.join(complete_dir, "output", "result.json")
            try:
                with open(result_json_path, "r", encoding="utf-8") as result_file:
                    parsed_result = json.load(result_file)
                if isinstance(parsed_result, dict):
                    result_json = parsed_result
            except (OSError, json.JSONDecodeError) as exc:
                logger.warning("[Task %s] 无法读取 result.json credit report: %s", self.task_id, exc)
        credit_hour_report = _compact_credit_hour_report(result_json)
        if credit_hour_report:
            result_meta = {**result_meta, "credit_hour_report": credit_hour_report}

        # Build the report-shaped sections (general_kpi / scheduling_details) the
        # gantt frontend reads, aligned with the legacy report's generate_report
        # contract. Failure degrades to empty sections — the gantt falls back.
        report_sections: Dict = {}
        try:
            input_sections = (
                parse_input_sections(self.input_file_path)
                if self.input_file_path and os.path.exists(self.input_file_path)
                else {}
            )
            report_sections = build_report_sections(result_json, input_sections)
        except Exception as exc:
            logger.warning("[Task %s] 无法构建 report-shaped sections: %s", self.task_id, exc)
            report_sections = {}
        primary_month = report_sections.get("primary_month") or ""
        credit_note = _credit_roster_period_note(primary_month) if primary_month else ""

        metadata = {
            "scenarioId": int(scenario_id) if scenario_id.isdigit() else scenario_id,
            "taskId": self.task_id,
            "status": status,
            "filePath": file_path,
            "archivePath": archive_path,
            "inputPath": self.input_file_path or "",
            "version": version or None,
            "executedBy": self.user or self.parameters.get("user") or None,
            "executedAt": datetime.utcnow().isoformat() + "Z",
            "fileTimestamp": file_timestamp,
            "algorithmSnapshot": {
                "metaPath": "algorithm_meta.json",
                "argsPath": "algorithm_args.txt",
                "floorRescueRulesPath": "FLOOR_RESCUE_RULES.json",
            },
            "ruleSnapshot": {
                "path": "ruleset_parameters.json",
            },
            "fileSize": len(out_bytes),
            "checksum": hashlib.sha256(out_bytes).hexdigest(),
            "kpi": sections.get("KPI", []),
            "resultMeta": result_meta,
            "generalKpi": report_sections.get("general_kpi", {"credit_hour_report": []}),
            "schedulingDetails": report_sections.get("scheduling_details", {}),
            "credit_roster_period_note": credit_note,
        }

        logger.info("[Task %s] 正在向Live Server提交结果元数据, URL: %s, API: %s, status=%s",
                    self.task_id, base_url, output_url, status)
        try:
            with create_live_server_client(base_url, token) as client:
                client.submit_result_metadata(self.airline, output_url, metadata)
        except Exception as e:
            raise OutputSubmitError(f"[Task {self.task_id}] Failed to submit result metadata: {e}") from e

        logger.info("[Task %s] 成功提交结果元数据, path=%s", self.task_id, file_path)
        return True

    def _export_to_report_scenario(self, complete_dir: str, scenario_id: str) -> None:
        """把归档后的优化结果 copy 到 PBS Scenario Report 的 scenario/ 目录。

        目标路径由环境变量 PBS_REPORT_SCENARIO_DIR 控制（未设则跳过）。
        文件夹命名：{scenario_id}_{YYYYmmdd_HHmmss}
        失败只记录日志，不影响主流程。
        """
        report_scenario_dir = os.environ.get("PBS_REPORT_SCENARIO_DIR", "").strip()
        if not report_scenario_dir:
            return

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        target_dir = os.path.join(report_scenario_dir, f"{scenario_id}_{timestamp}")

        flat_files = [
            "DAYSOFF.csv",
            "LINE_RULES.csv",
            "PAIRING_SCORE.csv",
            "RESERVE_SCORE.csv",
            "FLOOR_RESCUE_RULES.json",
            "algorithm_args.txt",
            "algorithm_meta.json",
            "ro_input.txt",
        ]
        result_json_src = os.path.join(complete_dir, "output", "result.json")

        try:
            os.makedirs(target_dir, exist_ok=True)
            for fname in flat_files:
                src = os.path.join(complete_dir, fname)
                if os.path.exists(src):
                    shutil.copy2(src, os.path.join(target_dir, fname))
            if os.path.exists(result_json_src):
                shutil.copy2(result_json_src, os.path.join(target_dir, "result.json"))
            logger.info(
                "[Task %s] 已导出场景到报表目录: %s", self.task_id, target_dir
            )
            self._cleanup_report_scenario_dir(report_scenario_dir)
        except Exception as exc:
            logger.warning(
                "[Task %s] 导出到报表目录失败（不影响主流程）: %s", self.task_id, exc
            )

    def _cleanup_report_scenario_dir(self, report_scenario_dir: str) -> None:
        """清理报表场景素材目录下超过 3 天的直接子目录。"""
        try:
            if not os.path.isdir(report_scenario_dir):
                return

            current_time = time.time()
            max_age_seconds = REPORT_SCENARIO_RETENTION_DAYS * 24 * 3600
            cleaned_count = 0

            for entry in os.listdir(report_scenario_dir):
                entry_path = os.path.join(report_scenario_dir, entry)
                if not os.path.isdir(entry_path):
                    continue

                try:
                    entry_age = current_time - os.path.getmtime(entry_path)
                except OSError:
                    continue

                if entry_age > max_age_seconds:
                    shutil.rmtree(entry_path)
                    cleaned_count += 1

            if cleaned_count > 0:
                logger.info(
                    "[Task %s] 已清理 %d 个过期报表场景素材目录",
                    self.task_id,
                    cleaned_count,
                )
        except Exception as exc:
            logger.warning(
                "[Task %s] 清理报表场景素材目录失败（不影响主流程）: %s",
                self.task_id,
                exc,
            )

    def _notify_live_server_result(self, scenario_id: str, status: str = "DONE") -> None:
        """通知 live-server POST /api/scenario/result，更新场景状态（DONE 或 FAILED）。"""
        if not self.url or not self.token:
            logger.warning("[Task %s] 无live-server URL或token，跳过状态通知", self.task_id)
            return

        try:
            out_path = self.output_file_path
            out_bytes = b""
            if status == "DONE" and out_path and os.path.exists(out_path):
                with open(out_path, "rb") as f:
                    out_bytes = f.read()

            result_meta = {"status": status, "total_assignments": "0"}
            result_json: Dict = {}
            if status == "DONE" and out_path:
                result_json_path = os.path.join(
                    os.path.dirname(out_path), "output", "result.json"
                )
                try:
                    with open(result_json_path, "r", encoding="utf-8") as result_file:
                        result_json = json.load(result_file)
                    if isinstance(result_json, dict):
                        credit_hour_report = _compact_credit_hour_report(result_json)
                        if credit_hour_report:
                            result_meta["credit_hour_report"] = credit_hour_report
                except (OSError, json.JSONDecodeError) as exc:
                    logger.warning(
                        "[Task %s] 无法读取 LegacyRO result.json credit report: %s",
                        self.task_id,
                        exc,
                    )

            # Build the report-shaped sections (general_kpi / scheduling_details)
            # the gantt frontend reads — same contract as the new RO flow, so
            # LegacyRO scenarios render the report's exact uncovered/credit rows.
            # Failure degrades to empty sections; the gantt falls back.
            report_sections: Dict = {}
            if status == "DONE" and isinstance(result_json, dict) and result_json:
                try:
                    input_sections = (
                        parse_input_sections(self.input_file_path)
                        if self.input_file_path and os.path.exists(self.input_file_path)
                        else {}
                    )
                    report_sections = build_report_sections(result_json, input_sections)
                except Exception as exc:
                    logger.warning(
                        "[Task %s] 无法构建 report-shaped sections: %s",
                        self.task_id,
                        exc,
                    )
                    report_sections = {}
            primary_month = report_sections.get("primary_month") or ""
            credit_note = _credit_roster_period_note(primary_month) if primary_month else ""

            metadata = {
                "scenarioId": int(scenario_id) if scenario_id.isdigit() else scenario_id,
                "taskId": self.task_id,
                "status": status,
                "filePath": out_path or "",
                "archivePath": os.path.dirname(out_path) if out_path else "",
                "inputPath": self.input_file_path or "",
                "version": self.parameters.get("version") or None,
                "executedBy": self.user or self.parameters.get("user") or None,
                "executedAt": datetime.utcnow().isoformat() + "Z",
                "fileTimestamp": (
                    os.path.basename(os.path.dirname(out_path))
                    if out_path else datetime.utcnow().strftime("%Y%m%d_%H%M%S")
                ),
                "algorithmSnapshot": {
                    "metaPath": "algorithm_meta.json",
                    "argsPath": "algorithm_args.txt",
                    "floorRescueRulesPath": "FLOOR_RESCUE_RULES.json",
                },
                "ruleSnapshot": {
                    "path": "ruleset_parameters.json",
                },
                "fileSize": len(out_bytes),
                "checksum": hashlib.sha256(out_bytes).hexdigest() if out_bytes else "",
                "kpi": [],
                "resultMeta": result_meta,
                "generalKpi": report_sections.get("general_kpi", {"credit_hour_report": []}),
                "schedulingDetails": report_sections.get("scheduling_details", {}),
                "credit_roster_period_note": credit_note,
            }
            with create_live_server_client(self.url, self.token) as client:
                client.submit_result_metadata(
                    self.airline, "/api/scenario/result", metadata
                )
            logger.info("[Task %s] 已通知live-server scenarioId=%s status=%s",
                        self.task_id, scenario_id, status)
        except Exception as e:
            logger.warning("[Task %s] 通知live-server失败（不影响结果）: %s",
                           self.task_id, e)

    def _notify_failure_to_live_server(self) -> None:
        """进程失败或提交失败后，通知 live-server 将场景从 RUNNING 转为 FAILED。"""
        scenario_id = str(
            self.parameters.get("scenarioId")
            or self.parameters.get("javaScenarioId", "")
        )
        if not scenario_id:
            return
        self._notify_live_server_result(scenario_id, status="FAILED")

    def _build_command(self, optimizer) -> List[str]:
        """构建优化器执行命令

        Returns:
            命令参数列表

        Raises:
            OptimizerExecutionError: 可执行文件不存在
        """
        # 通过策略模式统一获取可执行文件路径（Rule/PO/RO/TO 均由各自的 Optimizer 子类处理）
        exec_path = optimizer.get_executable_path(self.parameters)

        if not exec_path:
            raise OptimizerExecutionError(
                f"[Task {self.task_id}] 优化器 {self.airline}/{self.optimizer_type} 未配置可执行文件路径"
            )

        # 将相对路径转换为绝对路径
        if not os.path.isabs(exec_path):
            exec_path = os.path.abspath(exec_path)

        # 检查可执行文件是否存在
        if not os.path.exists(exec_path):
            logger.warning(
                "[Task %s] 可执行文件不存在: %s，将尝试直接执行（可能在PATH中）",
                self.task_id, exec_path
            )

        # 构建命令：可执行文件 + 工作目录作为参数
        cmd = [exec_path, self.working_dir]

        # 如果有 input.gz，追加输入文件路径
        if self.input_file_path and os.path.exists(self.input_file_path):
            cmd.append(self.input_file_path)

        return cmd

    def start(self):
        """启动任务

        Returns:
            True: 启动成功

        Raises:
            OptimizerNotFoundError: 优化器不存在
            InputFetchError: 获取输入文件失败
            OptimizerExecutionError: 启动进程失败
        """
        optimizer = optimizer_manager.get_optimizer(self.airline, self.optimizer_type)
        if not optimizer:
            self.status = TaskStatus.FAILED
            self.error_message = f"Optimizer {self.optimizer_type} does not exist"
            self._save_to_redis()
            raise OptimizerNotFoundError(self.error_message)

        # The input build is synchronous, so expose coarse progress before the
        # task receives its solver-owned progress.json.
        self.progress_stage = "extracting_input"
        self.progress = 5
        redis_manager.update_task_progress(self.task_id, self.progress)
        self._save_to_redis()

        # 从Live Server获取input.gz（如果启用了server_integration）
        try:
            self._fetch_input_data()
        except InputFetchError as e:
            self.status = TaskStatus.FAILED
            self.error_message = str(e)
            self._save_to_redis()
            raise
        self.progress = 15
        redis_manager.update_task_progress(self.task_id, self.progress)
        self._save_to_redis()

        # 构建执行命令
        try:
            cmd = self._build_command(optimizer)
        except OptimizerExecutionError as e:
            self.status = TaskStatus.FAILED
            self.error_message = str(e)
            self._save_to_redis()
            raise
        self.progress_stage = "solving"
        self.progress = 20
        redis_manager.update_task_progress(self.task_id, self.progress)
        self._save_to_redis()

        try:
            logger.info("[Task %s] 执行命令: %s, 工作目录: %s", self.task_id, cmd, self.working_dir)

            # 子进程环境：注入 PG_PASSWORD，让 mode=rust 的 Rust 法规 connector 能从
            # PG workset 103 读取与 gantt Legality 同源的法规参数（否则静默回退旧默认值）。
            sub_env = self._build_subprocess_env(
                config_manager.get_optimizer_config(self.airline, self.optimizer_type))

            self.process = subprocess.Popen(
                cmd,
                cwd=self.working_dir,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                env=sub_env,
            )
            self.status = TaskStatus.RUNNING
            self.start_time = time.time()
            self._save_to_redis()

            logger.info("[Task %s] 任务已启动, airline=%s, type=%s, pid=%d",
                         self.task_id, self.airline, self.optimizer_type, self.process.pid)

            # 启动 stdout/stderr 读取线程（防止管道缓冲区满导致死锁）
            stdout_thread = threading.Thread(
                target=self._read_stream, args=(self.process.stdout, self._stdout_lines, "stdout"),
                name=f"stdout-{self.task_id[:8]}", daemon=True
            )
            stderr_thread = threading.Thread(
                target=self._read_stream, args=(self.process.stderr, self._stderr_lines, "stderr"),
                name=f"stderr-{self.task_id[:8]}", daemon=True
            )
            stdout_thread.start()
            stderr_thread.start()

            # 启动监控线程
            monitor_thread = threading.Thread(
                target=self._monitor_task,
                args=(stdout_thread, stderr_thread),
                name=f"monitor-{self.task_id[:8]}", daemon=True
            )
            monitor_thread.start()

            return True
        except Exception as e:
            self.status = TaskStatus.FAILED
            self.error_message = str(e)
            self._save_to_redis()
            raise OptimizerExecutionError(f"[Task {self.task_id}] Failed to start: {e}") from e

    def _read_stream(self, stream, lines: List[str], name: str):
        """持续读取子进程的输出流，防止管道缓冲区满导致死锁"""
        try:
            for line in stream:
                line = line.rstrip('\n')
                lines.append(line)
                # 尝试从stdout中解析进度信息
                if name == "stdout":
                    self._parse_progress(line)
            stream.close()
        except Exception as e:
            logger.debug("[Task %s] 读取%s结束: %s", self.task_id, name, e)

    def _parse_progress(self, line: str):
        """从优化器输出中解析进度信息

        支持的格式:
        - PROGRESS:50      (直接百分比)
        - PROGRESS:50/100  (当前/总数)
        """
        line = line.strip()
        if not line.startswith("PROGRESS:"):
            return

        try:
            value = line[len("PROGRESS:"):]
            if "/" in value:
                current, total = value.split("/", 1)
                progress = int(int(current) / int(total) * 100)
            else:
                progress = int(value)

            progress = max(0, min(100, progress))
            self.progress = progress
            redis_manager.update_task_progress(self.task_id, progress)
        except (ValueError, ZeroDivisionError):
            pass

    def stop(self):
        """停止任务"""
        if self.status == TaskStatus.RUNNING and self.process:
            try:
                logger.info("[Task %s] 正在停止任务, pid=%d", self.task_id, self.process.pid)
                self.process.terminate()
                try:
                    self.process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    logger.warning("[Task %s] terminate超时，强制kill进程", self.task_id)
                    self.process.kill()
                    self.process.wait(timeout=3)
                self.status = TaskStatus.STOPPED
                self.end_time = time.time()
                self._save_to_redis()
                # 搬运被停止的任务目录到 finished/<airline>/<task_dir>_stop/
                file_manager.move_to_finished(self.working_dir, self.airline, suffix="_stop")
                logger.info("[Task %s] 任务已停止", self.task_id)
                return True
            except Exception as e:
                self.error_message = str(e)
                self._save_to_redis()
                logger.error("[Task %s] 停止任务异常: %s", self.task_id, e, exc_info=True)
                return False
        return False

    def _monitor_task(self, stdout_thread: threading.Thread, stderr_thread: threading.Thread):
        """监控任务执行状态"""
        if not self.process:
            return

        task_timeout = config_manager.get_config().tasks.timeout

        # 等待进程结束（带超时）
        try:
            self.process.wait(timeout=task_timeout)
        except subprocess.TimeoutExpired:
            logger.warning("[Task %s] 进程执行超时(%ds)，强制终止", self.task_id, task_timeout)
            self.process.kill()
            self.process.wait(timeout=10)

        # 等待 stdout/stderr 读取线程完成
        stdout_thread.join(timeout=5)
        stderr_thread.join(timeout=5)

        if self.status == TaskStatus.RUNNING:
            if self.process.returncode == 0:
                # 优化器执行成功
                self.progress = 100
                self.progress_stage = "producing_result"
                redis_manager.update_task_progress(self.task_id, 100)
                self._save_to_redis()

                # 提交输出文件到Live Server，提交失败视为任务失败
                submit_failed = False
                try:
                    self._submit_output_data()
                except OutputSubmitError as e:
                    logger.error("[Task %s] %s", self.task_id, e)
                    submit_failed = True
                    self.status = TaskStatus.FAILED
                    self.error_message = str(e)

                if submit_failed:
                    # 提交失败：归档到 finished/<airline>/<task_dir>_submit_failed/
                    file_manager.move_to_finished(self.working_dir, self.airline, suffix="_submit_failed")
                    logger.error("[Task %s] 任务因output.gz提交失败而失败", self.task_id)
                    self._notify_failure_to_live_server()
                else:
                    # RO 场景流已在 _submit_scenario_result 内 move_to_complete，避免重复搬运
                    if not self._archived_to_complete:
                        file_manager.move_to_finished(self.working_dir, self.airline)
                    self.status = TaskStatus.COMPLETED
                    logger.info("[Task %s] 任务执行完成", self.task_id)
            else:
                stderr_text = "\n".join(self._stderr_lines)
                self.status = TaskStatus.FAILED
                self.error_message = stderr_text or f"Process exit code: {self.process.returncode}"
                logger.error("[Task %s] 任务执行失败, returncode=%d, stderr=%s",
                             self.task_id, self.process.returncode, stderr_text[:500])
                # 搬运失败任务目录到 finished/<airline>/<task_dir>_failed/
                file_manager.move_to_finished(self.working_dir, self.airline, suffix="_failed")
                self._notify_failure_to_live_server()
            self.end_time = time.time()
            self._save_to_redis()

    def get_status(self) -> str:
        """获取任务状态"""
        return self.status.value

    def get_progress(self) -> int:
        """获取任务进度"""
        return self.progress

    def _progress_paths(self) -> List[str]:
        """Return likely progress.json locations for live and archived tasks."""
        paths: List[str] = []
        if self.working_dir:
            paths.extend([
                os.path.join(self.working_dir, "output", "progress.json"),
                os.path.join(self.working_dir, "progress.json"),
            ])
        for output_path in (self.output_file_path, self.input_file_path):
            if output_path:
                base = os.path.dirname(output_path)
                paths.extend([
                    os.path.join(base, "output", "progress.json"),
                    os.path.join(base, "progress.json"),
                ])
        return list(dict.fromkeys(paths))

    def _read_progress_file(self) -> tuple[Optional[dict], Optional[float]]:
        for path in self._progress_paths():
            try:
                stat = os.stat(path)
                with open(path, "r", encoding="utf-8") as handle:
                    payload = json.load(handle)
                if isinstance(payload, dict):
                    return payload, max(0.0, time.time() - stat.st_mtime)
            except (FileNotFoundError, OSError, ValueError, TypeError):
                continue
        return None, None

    def get_progress_detail(self) -> Optional[dict]:
        """Read the solver's structured progress payload, if available."""
        payload, _ = self._read_progress_file()
        if payload is not None:
            return payload
        if self.progress_stage:
            return {
                "state": "running" if self.status in (TaskStatus.PENDING, TaskStatus.RUNNING) else self.status.value,
                "percent": self.progress,
                "stage": self.progress_stage,
                "stage_label": {
                    "starting": "Starting optimization",
                    "extracting_input": "Preparing optimization input",
                    "solving": "Solving optimization",
                    "producing_result": "Producing optimization result",
                }.get(self.progress_stage, self.progress_stage),
                "detail": None,
            }
        return None

    def get_progress_age_sec(self) -> Optional[float]:
        """Return the file age so clients can identify a stale solver update."""
        _, age = self._read_progress_file()
        return age


class TaskManager:
    # 已完成任务的保留时间（秒），超过后自动清理
    COMPLETED_TASK_TTL = 3600  # 1小时

    def __init__(self):
        self.tasks: Dict[str, Task] = {}  # task_id -> Task
        self.airline_tasks: Dict[str, List[str]] = {}  # airline -> list of task_ids
        tasks_config = config_manager.get_config().tasks
        self.max_concurrent = tasks_config.max_concurrent
        self.optimizer_max_concurrent = tasks_config.optimizer_max_concurrent or {}
        self.lock = threading.Lock()

    def _get_optimizer_limit(self, optimizer_type: str) -> Optional[int]:
        """Return a positive per-optimizer concurrency limit when configured."""
        if optimizer_type in self.optimizer_max_concurrent:
            limit = self.optimizer_max_concurrent[optimizer_type]
        else:
            normalized_type = optimizer_type.lower()
            limit = next(
                (
                    configured_limit
                    for configured_type, configured_limit in self.optimizer_max_concurrent.items()
                    if configured_type.lower() == normalized_type
                ),
                None,
            )

        if limit is None or limit <= 0:
            return None
        return limit

    def _assert_concurrency_available(self, optimizer_type: str, exclude_task_id: Optional[str] = None) -> None:
        active_statuses = {TaskStatus.PENDING, TaskStatus.RUNNING}
        local_active_tasks = [
            t for t in self.tasks.values()
            if t.task_id != exclude_task_id and t.status in active_statuses
        ]
        local_active_count = len(local_active_tasks)
        if local_active_count >= self.max_concurrent:
            raise TaskLimitError(f"Maximum concurrency limit reached: {self.max_concurrent}")

        optimizer_limit = self._get_optimizer_limit(optimizer_type)
        if optimizer_limit is None:
            return

        optimizer_active_count = len([
            t for t in local_active_tasks
            if t.optimizer_type.lower() == optimizer_type.lower()
        ])
        if optimizer_active_count >= optimizer_limit:
            raise TaskLimitError(
                f"Maximum concurrency limit reached for optimizer {optimizer_type}: {optimizer_limit}"
            )

    def create_task(self, airline: str, optimizer_type: str, parameters: dict = None,
                   url: str = None, token: str = None, user: str = None) -> str:
        """创建新任务

        Returns:
            task_id

        Raises:
            OptimizerNotFoundError: 优化器不可用
            TaskLimitError: 已达最大并发数
        """
        if not optimizer_manager.validate_optimizer(airline, optimizer_type):
            raise OptimizerNotFoundError(f"Optimizer {optimizer_type} is not available for airline {airline}")

        with self.lock:
            self._assert_concurrency_available(optimizer_type)

            task_id = str(uuid.uuid4())
            task = Task(task_id, airline, optimizer_type, parameters, url, token, user)
            self.tasks[task_id] = task

            if airline not in self.airline_tasks:
                self.airline_tasks[airline] = []
            self.airline_tasks[airline].append(task_id)

        logger.info("任务创建成功: task_id=%s, airline=%s, type=%s", task_id, airline, optimizer_type)
        return task_id

    def start_task(self, task_id: str) -> bool:
        """启动任务

        Raises:
            TaskNotFoundError: 任务不存在
            TaskStateError: 任务状态不正确
            TaskLimitError: 已达最大并发数
        """
        with self.lock:
            task = self.tasks.get(task_id)
            if not task:
                task_data = redis_manager.get_task(task_id)
                if task_data:
                    raise TaskStateError(f"Task {task_id} is on another server and cannot be started locally")
                raise TaskNotFoundError(f"Task {task_id} does not exist")

            if task.status != TaskStatus.PENDING:
                raise TaskStateError(f"Task {task_id} is in status {task.status.value} and cannot be started")

            self._assert_concurrency_available(task.optimizer_type, exclude_task_id=task_id)

        # 在锁外启动任务
        return task.start()

    def stop_task(self, task_id: str) -> bool:
        """停止任务"""
        task = None
        with self.lock:
            task = self.tasks.get(task_id)

        if task:
            return task.stop()

        # 检查Redis中的任务（可能在其他服务器）
        task_data = redis_manager.get_task(task_id)
        if task_data:
            redis_manager.publish_task_event(task_id, "stop", {})
            logger.info("已通过Redis发布停止事件: task_id=%s", task_id)
            return True

        return False

    def get_task(self, task_id: str) -> Optional[Task]:
        """获取任务"""
        with self.lock:
            task = self.tasks.get(task_id)
            if task:
                return task

        # 检查Redis中的任务
        task_data = redis_manager.get_task(task_id)
        if task_data:
            task = Task(
                task_id=task_data['task_id'],
                airline=task_data['airline'],
                optimizer_type=task_data['optimizer_type'],
                parameters=task_data['parameters']
            )
            task.status = TaskStatus(task_data['status'])
            task.progress = task_data['progress']
            task.progress_stage = task_data.get('progress_stage', 'starting')
            task.start_time = task_data['start_time']
            task.end_time = task_data['end_time']
            task.error_message = task_data['error_message']
            task.output_file_path = task_data.get('output_file_path')
            task.input_file_path = task_data.get('input_file_path')
            # Fallback for pre-fix Redis entries: infer path from complete dir + scenario_id
            if not task.output_file_path and task_data.get('parameters'):
                import os
                scenario_id = task_data['parameters'].get('scenarioId')
                if scenario_id:
                    complete_base = config_manager.get_config().paths.complete_dir
                    version = task_data['parameters'].get('version')
                    candidates: list[str] = []
                    if version:
                        version_root = os.path.join(complete_base, task.airline, str(scenario_id), str(version))
                        if os.path.isdir(version_root):
                            candidates.extend(
                                os.path.join(version_root, entry)
                                for entry in sorted(os.listdir(version_root), reverse=True)
                            )
                    candidates.append(os.path.join(complete_base, task.airline, str(scenario_id)))
                    for candidate in candidates:
                        if os.path.exists(os.path.join(candidate, 'output.gz')):
                            task.output_file_path = os.path.join(candidate, 'output.gz')
                            task.input_file_path = os.path.join(candidate, 'input.gz')
                            break
            return task

        return None

    def get_all_tasks(self, airline: str = None) -> List[dict]:
        """获取所有任务信息"""
        redis_tasks = redis_manager.get_all_tasks(airline)

        with self.lock:
            if airline:
                task_ids = self.airline_tasks.get(airline, [])
                local_tasks = [self.tasks[task_id] for task_id in task_ids if task_id in self.tasks]
            else:
                local_tasks = list(self.tasks.values())

        local_tasks_dict = [{
            "task_id": task.task_id,
            "airline": task.airline,
            "optimizer_type": task.optimizer_type,
            "status": task.get_status(),
            "progress": task.get_progress(),
            "start_time": task.start_time,
            "end_time": task.end_time,
            "error_message": task.error_message
        } for task in local_tasks]

        task_map = {}
        for task in redis_tasks:
            task_map[task['task_id']] = task
        for task in local_tasks_dict:
            task_map[task['task_id']] = task

        return list(task_map.values())

    def get_running_tasks(self, airline: str = None) -> List[dict]:
        """获取运行中任务"""
        redis_tasks = redis_manager.get_running_tasks(airline)

        with self.lock:
            if airline:
                task_ids = self.airline_tasks.get(airline, [])
                local_tasks = [self.tasks[task_id] for task_id in task_ids if task_id in self.tasks and self.tasks[task_id].status == TaskStatus.RUNNING]
            else:
                local_tasks = [t for t in self.tasks.values() if t.status == TaskStatus.RUNNING]

        local_tasks_dict = [{
            "task_id": task.task_id,
            "airline": task.airline,
            "optimizer_type": task.optimizer_type,
            "status": task.get_status(),
            "progress": task.get_progress(),
            "start_time": task.start_time
        } for task in local_tasks]

        task_map = {}
        for task in redis_tasks:
            task_map[task['task_id']] = task
        for task in local_tasks_dict:
            task_map[task['task_id']] = task

        return list(task_map.values())

    def cleanup_tasks(self):
        """清理已完成的任务（超过TTL的）"""
        current_time = time.time()
        with self.lock:
            completed_task_ids = []
            for task_id, task in self.tasks.items():
                if task.status in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.STOPPED]:
                    if task.end_time and (current_time - task.end_time) > self.COMPLETED_TASK_TTL:
                        completed_task_ids.append(task_id)

            if completed_task_ids:
                logger.info("清理已完成任务: %d 个", len(completed_task_ids))

            for task_id in completed_task_ids:
                task = self.tasks[task_id]
                if task.airline in self.airline_tasks:
                    if task_id in self.airline_tasks[task.airline]:
                        self.airline_tasks[task.airline].remove(task_id)
                del self.tasks[task_id]
                redis_manager.delete_task(task_id)

    def stop_all_tasks(self):
        """停止所有运行中的任务（服务关闭时调用）"""
        with self.lock:
            running_tasks = [t for t in self.tasks.values() if t.status == TaskStatus.RUNNING]

        for task in running_tasks:
            logger.info("服务关闭，正在停止任务: %s", task.task_id)
            task.stop()


# 全局任务管理器实例
task_manager = TaskManager()
