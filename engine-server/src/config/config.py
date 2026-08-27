import os
import re
import sys
import yaml
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Dict, Any, Optional


class OptimizerConfig(BaseSettings):
    path: str


class OptimizerURLConfig(BaseSettings):
    input: str
    output: str


class OptimizerOSConfig(BaseSettings):
    path: str


class RuleCategoryConfig(BaseSettings):
    name: str
    linux: OptimizerOSConfig
    windows: OptimizerOSConfig
    url: OptimizerURLConfig


class LegacyJavaConfig(BaseSettings):
    """Credentials for logging in to the old Java admin server (Pi Solution)."""
    url: str
    username: str
    password: str


class BidPackageServerConfig(BaseSettings):
    """live-server admin credentials for downloading solver bid packages."""
    url: str
    username: str
    password: str
    period_code: str = "Jun 2026"  # periodCode 默认值,任务 parameters.periodCode 可覆盖


class OptimizerTypeConfig(BaseSettings):
    name: str
    linux: OptimizerOSConfig
    windows: OptimizerOSConfig
    url: OptimizerURLConfig
    server_integration: bool = True  # true: server处理input/output传输; false: 优化器自身处理
    legacy_java: Optional[LegacyJavaConfig] = None  # set → fetch/submit via Java server login
    bid_package_server: Optional[BidPackageServerConfig] = None  # set → LegacyRO 下载 live-server 偏好包
    input_source: Optional[str] = None  # LegacyRO: "db" → 从 PostgreSQL 生成 input.gz；其它/None → Java server 抓取
    db_url: Optional[str] = None  # LegacyRO input_source=db 时连接的 PostgreSQL DSN（不设则用 LEGACY_RO_DB_URL 环境变量）


class RuleOptimizerConfig(BaseSettings):
    categories: Dict[str, RuleCategoryConfig]
    server_integration: bool = True  # true: server处理input/output传输; false: 优化器自身处理


class OptimizersConfig(BaseSettings):
    PO: OptimizerTypeConfig
    RO: OptimizerTypeConfig
    TO: OptimizerTypeConfig
    Rule: RuleOptimizerConfig
    LegacyRO: Optional[OptimizerTypeConfig] = None


class LiveServerConfig(BaseSettings):
    # 该航司回调 Live Server 的基础地址。配置后优先于请求体中携带的 url
    # （请求体的 url 取自浏览器 Host 头，在多机/反向代理环境下 engine-server
    # 不一定能解析回 Live Server，故以本配置为准）。
    url: Optional[str] = None


class AirlineConfig(BaseSettings):
    model_config = SettingsConfigDict(populate_by_name=True)

    optimizers: OptimizersConfig
    # YAML 键为 live-server（带连字符），映射到 live_server 字段
    live_server: Optional[LiveServerConfig] = Field(default=None, alias="live-server")


class CorsConfig(BaseSettings):
    # 空列表 = 禁止所有跨域浏览器访问。engine-server 的合法浏览器调用全部经 nginx 同源反代
    # （gantt/pbs-portal 用相对路径 /<prefix>/engine），服务间调用不走 CORS —— 无需 "*"。
    allow_origins: list = []
    allow_methods: list = ["GET", "POST"]
    allow_headers: list = ["X-Airline", "X-API-Key", "Authorization", "Content-Type"]


class ServerConfig(BaseSettings):
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True
    cors: CorsConfig = CorsConfig()
    # API 文档端点开关：None = 禁用（生产默认），避免未鉴权的 OpenAPI/Swagger/ReDoc 泄露接口结构。
    # 仅本地开发需要调试文档时，在 config.yaml 显式设置为 "/docs" "/redoc" "/openapi.json"。
    docs_url: Optional[str] = None
    redoc_url: Optional[str] = None
    openapi_url: Optional[str] = None


class APIKeyConfig(BaseSettings):
    enabled: bool = False
    key: str = "your_api_key_here"


class BearerTokenConfig(BaseSettings):
    enabled: bool = False
    token: str = "your_bearer_token_here"


class AirlineAuthConfig(BaseSettings):
    api_key: str = ""
    bearer_token: str = ""


class JWTConfig(BaseSettings):
    enabled: bool = False
    secret: str = ""  # 与 Live Server 共享的 JWT 签名密钥
    algorithm: str = "HS256"
    verify_exp: bool = True  # 是否校验过期时间


class RateLimitConfig(BaseSettings):
    enabled: bool = False
    rate: str = "15/minute"  # 限流速率，格式: "次数/时间单位"


class AuthConfig(BaseSettings):
    enabled: bool = False
    jwt: JWTConfig = JWTConfig()
    api_key: APIKeyConfig = APIKeyConfig()
    bearer_token: BearerTokenConfig = BearerTokenConfig()
    airline_auth: Dict[str, AirlineAuthConfig] = {}
    rate_limit: RateLimitConfig = RateLimitConfig()


class PathsConfig(BaseSettings):
    working_dir: str = "./workspace"
    finished_dir: str = "./finished"
    archive_dir: str = "./archive"
    temp_dir: str = "./temp"
    complete_dir: str = "./complete"


class FileManagementConfig(BaseSettings):
    archive_days: int = 1
    cleanup_days: int = 30
    complete_compress_days: int = 1
    complete_cleanup_days: int = 5


class RedisConfig(BaseSettings):
    enabled: bool = False
    host: str = "localhost"
    port: int = 6379
    password: Optional[str] = None
    db: int = 0
    task_ttl: int = 3600


class TasksConfig(BaseSettings):
    max_concurrent: int = 10
    optimizer_max_concurrent: Dict[str, int] = Field(default_factory=dict)
    timeout: int = 3600


class HttpClientConfig(BaseSettings):
    timeout: int = 600  # Live Server请求超时时间（秒），默认10分钟
    legacy_ssl: bool = False  # true=降低 OpenSSL 安全等级到 1，允许弱密钥/SHA1 证书（仅测试环境）
    ssl_verify: bool = True   # false=完全跳过证书校验（自签名/测试场景；生产禁用）


class Config(BaseSettings):
    server: ServerConfig = ServerConfig()
    auth: AuthConfig = AuthConfig()
    paths: PathsConfig = PathsConfig()
    airlines: Dict[str, AirlineConfig]
    file_management: FileManagementConfig = FileManagementConfig()
    tasks: TasksConfig = TasksConfig()
    redis: RedisConfig = RedisConfig()
    # Per-environment prefix prepended to every Redis key so multiple
    # engine-server processes (dev / uat / sit / prod) sharing one Redis
    # instance don't collide on the same keys. Default 'dev' (pydantic
    # fallback). Production-like APP_ENV refuses to start with 'dev' or
    # 'uat' — see Config's model_validator below.
    redis_key_prefix: str = Field(
        default="dev",
        pattern=r"^[a-z][a-z0-9_]*$",
        description="Per-env Redis key prefix (e.g. 'dev', 'uat', 'prod').",
    )
    http_client: HttpClientConfig = HttpClientConfig()


class ConfigManager:
    _instance = None
    _config = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ConfigManager, cls).__new__(cls)
        return cls._instance

    @staticmethod
    def _resolve_env_vars(data):
        """递归解析配置值中的环境变量引用

        支持格式: ${ENV_VAR_NAME:default_value} 或 ${ENV_VAR_NAME}
        """
        if isinstance(data, str):
            pattern = r'\$\{([^}:]+)(?::([^}]*))?\}'
            def replacer(match):
                env_name = match.group(1)
                default_value = match.group(2) if match.group(2) is not None else match.group(0)
                return os.environ.get(env_name, default_value)
            return re.sub(pattern, replacer, data)
        elif isinstance(data, dict):
            return {k: ConfigManager._resolve_env_vars(v) for k, v in data.items()}
        elif isinstance(data, list):
            return [ConfigManager._resolve_env_vars(item) for item in data]
        return data

    def load_config(self, config_path: str = None):
        """加载配置文件

        查找顺序：
          1. 显式参数
          2. 环境变量 ROIS_CONFIG_PATH
          3. 冻结模式（PyInstaller）：可执行文件所在目录的 config.yaml
             非冻结模式：src/config/config.yaml（开发模式默认）
        """
        if config_path is None:
            config_path = os.environ.get("ROIS_CONFIG_PATH")
        if config_path is None:
            if getattr(sys, "frozen", False):
                base = os.path.dirname(os.path.abspath(sys.executable))
            else:
                base = os.path.dirname(__file__)
            config_path = os.path.join(base, "config.yaml")

        import logging
        _logger = logging.getLogger(__name__)

        if not os.path.exists(config_path):
            # 如果配置文件不存在，使用默认配置
            _logger.warning("配置文件不存在: %s，将回退到内置默认配置（config.yaml.example）", config_path)
            self._config = self._create_default_config()
            return self._config

        _logger.info("加载配置文件: %s", config_path)
        with open(config_path, "r", encoding="utf-8") as f:
            config_data = yaml.safe_load(f)

        # 解析环境变量引用
        config_data = self._resolve_env_vars(config_data)

        self._config = Config(**config_data)
        self._validate_auth_config(self._config, _logger)
        return self._config

    @staticmethod
    def _is_unresolved_secret(value: Optional[str]) -> bool:
        """True when secret is empty or still an unresolved ${ENV} placeholder."""
        if value is None:
            return True
        text = str(value).strip()
        if not text:
            return True
        if text.startswith("${") and text.endswith("}"):
            return True
        if text in {"your_jwt_secret_here", "your_api_key_here", "your_bearer_token_here"}:
            return True
        return False

    @classmethod
    def _validate_auth_config(cls, config: Config, logger) -> None:
        """Fail fast when JWT auth is enabled but the shared secret is missing.

        SIT auto-deploy rsyncs engine-server/config.yaml (secret: ${JWT_SECRET}).
        If JWT_SECRET is not exported into the process env, the placeholder is left
        as the literal string and live-server tokens fail with 401. Refuse to start
        instead of accepting a broken auth configuration.
        """
        if not config.auth.enabled:
            return
        jwt_cfg = config.auth.jwt
        if not jwt_cfg.enabled:
            return
        if cls._is_unresolved_secret(jwt_cfg.secret):
            raise ValueError(
                "auth.jwt.enabled but JWT secret is missing or unresolved. "
                "Set JWT_SECRET in the process environment (SIT: "
                "/home/yuan.z/rois/sit/env/engine-server.env, same value as "
                "live-server JWT_SECRET) before starting engine-server."
            )
        logger.info(
            "JWT auth enabled (secret configured, len=%s)",
            len(jwt_cfg.secret or ""),
        )

    def _create_default_config(self):
        """创建默认配置 — 从 config.yaml.example 加载，避免硬编码重复"""
        import logging
        _logger = logging.getLogger(__name__)

        # 尝试从 config.yaml.example 加载默认配置
        example_path = os.path.join(os.path.dirname(__file__), "config.yaml.example")
        if os.path.exists(example_path):
            _logger.info("配置文件不存在，从 config.yaml.example 加载默认配置")
            with open(example_path, "r", encoding="utf-8") as f:
                config_data = yaml.safe_load(f)
            config_data = self._resolve_env_vars(config_data)
            config = Config(**config_data)
            self._validate_auth_config(config, _logger)
            if not config.auth.enabled:
                # UAT 2026-08 事故：src/config/config.yaml 缺失时静默回退到 example（auth 关闭），
                # 整个 /engine/api 对公网全开。回退本身允许（本地开发），但必须醒目告警。
                _logger.critical(
                    "FALLBACK CONFIG: src/config/config.yaml 缺失，回退加载 config.yaml.example，"
                    "且 auth.enabled=false —— 服务对任何调用者开放。生产环境必须安装真实 config.yaml"
                    "（用仓库根目录 engine-server/config.yaml 模板，auth 已开启）。",
                )
            return config

        # config.yaml.example 也不存在时，抛出明确错误
        raise FileNotFoundError(
            "未找到配置文件。请复制 src/config/config.yaml.example 为 src/config/config.yaml 并修改配置。"
        )

    def get_config(self) -> Config:
        """获取配置"""
        if self._config is None:
            self.load_config()
        return self._config

    def get_airline_config(self, airline: str) -> AirlineConfig:
        """获取航司配置"""
        config = self.get_config()
        if airline not in config.airlines:
            raise ValueError(f"Airline {airline} is not configured")
        return config.airlines[airline]

    def get_live_server_url(self, airline: str) -> Optional[str]:
        """获取航司配置的 Live Server 回调地址（live-server.url）。

        返回 None 表示未配置，调用方应回退到请求体中携带的 url。
        """
        config = self.get_config()
        airline_config = config.airlines.get(airline)
        if airline_config and airline_config.live_server and airline_config.live_server.url:
            return airline_config.live_server.url
        return None

    def get_optimizer_config(self, airline: str, optimizer_type: str):
        """获取优化器配置"""
        airline_config = self.get_airline_config(airline)
        if optimizer_type == "PO":
            return airline_config.optimizers.PO
        elif optimizer_type == "RO":
            return airline_config.optimizers.RO
        elif optimizer_type == "TO":
            return airline_config.optimizers.TO
        elif optimizer_type == "Rule":
            return airline_config.optimizers.Rule
        elif optimizer_type == "LegacyRO":
            return airline_config.optimizers.LegacyRO
        else:
            raise ValueError(f"Unsupported optimizer type: {optimizer_type}")

    def get_optimizer_name(self, airline: str, optimizer_type: str) -> str:
        """获取优化器名称"""
        config = self.get_optimizer_config(airline, optimizer_type)
        if optimizer_type == "Rule":
            return "Rule Optimizer"
        return config.name if hasattr(config, 'name') else optimizer_type


# 全局配置管理器实例
config_manager = ConfigManager()
