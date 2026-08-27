import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from src.config.config import config_manager, Config


class TestConfigManager:
    """配置管理模块测试"""

    def setup_method(self):
        """每个测试前重新加载配置"""
        config_manager._config = None
        config_manager.load_config()

    def test_config_load(self):
        """测试配置加载"""
        config = config_manager.get_config()
        assert config is not None
        assert isinstance(config, Config)

    def test_server_config(self):
        """测试服务器配置"""
        config = config_manager.get_config()
        assert config.server.host == "0.0.0.0"
        assert config.server.port == 3003

    def test_server_docs_endpoints_disabled(self):
        """生产/示例默认关闭 Swagger/ReDoc/OpenAPI，避免未鉴权泄露接口结构"""
        config = config_manager.get_config()
        assert config.server.docs_url is None
        assert config.server.redoc_url is None
        assert config.server.openapi_url is None

    def test_cors_origins_restricted(self):
        """CORS 白名单默认空列表（禁止跨域浏览器访问），严禁 '*'"""
        config = config_manager.get_config()
        assert config.server.cors.allow_origins == []

    def test_auth_config(self):
        """测试认证配置"""
        config = config_manager.get_config()
        assert isinstance(config.auth.enabled, bool)

    def test_paths_config(self):
        """测试文件路径配置"""
        config = config_manager.get_config()
        assert config.paths.working_dir == "./workspace"
        assert config.paths.finished_dir == "./finished"
        assert config.paths.archive_dir == "./archive"
        assert config.paths.temp_dir == "./temp"

    def test_tasks_config(self):
        """测试任务配置"""
        config = config_manager.get_config()
        assert config.tasks.max_concurrent == 10
        assert config.tasks.optimizer_max_concurrent == {"LegacyRO": 1}
        assert config.tasks.timeout == 3600

    def test_airlines_config(self):
        """测试航司配置"""
        config = config_manager.get_config()
        assert "F8" in config.airlines
        assert "BR" in config.airlines

    def test_get_airline_config(self):
        """测试获取航司配置"""
        airline_config = config_manager.get_airline_config("F8")
        assert airline_config is not None
        assert airline_config.optimizers is not None

    def test_get_airline_config_invalid(self):
        """测试获取不存在的航司配置"""
        with pytest.raises(ValueError):
            config_manager.get_airline_config("INVALID")

    def test_f8_live_server_url_configured(self):
        """F8 配置了 live-server.url，应解析到 live_server 字段（连字符别名）"""
        airline_config = config_manager.get_airline_config("F8")
        assert airline_config.live_server is not None
        assert airline_config.live_server.url == "http://localhost:3000"

    def test_get_live_server_url_f8(self):
        """get_live_server_url 返回 F8 配置的回调地址"""
        assert config_manager.get_live_server_url("F8") == "http://localhost:3000"

    def test_get_live_server_url_unconfigured_returns_none(self):
        """未配置 live-server 的航司返回 None，调用方据此回退到请求体 url"""
        # BR 在示例配置中未设置 live-server
        assert config_manager.get_live_server_url("BR") is None
        # 不存在的航司同样返回 None（不抛异常）
        assert config_manager.get_live_server_url("INVALID") is None

    def test_get_optimizer_config(self):
        """测试获取优化器配置"""
        for airline in ["F8", "BR"]:
            for opt_type in ["PO", "RO", "TO", "Rule"]:
                opt_config = config_manager.get_optimizer_config(airline, opt_type)
                assert opt_config is not None

    def test_get_optimizer_config_invalid(self):
        """测试获取不支持的优化器配置"""
        with pytest.raises(ValueError):
            config_manager.get_optimizer_config("F8", "INVALID")

    def test_get_optimizer_name(self):
        """测试获取优化器名称"""
        name = config_manager.get_optimizer_name("F8", "PO")
        assert name == "Pairing Optimizer"

    def test_http_client_config(self):
        """测试HTTP客户端配置"""
        config = config_manager.get_config()
        assert config.http_client.timeout == 1200

    def test_redis_config(self):
        """测试Redis配置"""
        config = config_manager.get_config()
        assert config.redis.enabled is False
        assert config.redis.host == "localhost"
        assert config.redis.port == 6379

    def test_platform_detection(self):
        """测试平台检测"""
        platform = "windows" if os.name == "nt" else "linux"
        assert platform in ["windows", "linux"]

    def test_is_unresolved_secret(self):
        """Unresolved ${JWT_SECRET} placeholders must be treated as missing secrets."""
        assert config_manager._is_unresolved_secret(None) is True
        assert config_manager._is_unresolved_secret("") is True
        assert config_manager._is_unresolved_secret("${JWT_SECRET}") is True
        assert config_manager._is_unresolved_secret("your_jwt_secret_here") is True
        assert config_manager._is_unresolved_secret("real-shared-secret-value") is False

    def test_validate_auth_config_rejects_unresolved_jwt_secret(self, caplog):
        """JWT enabled + placeholder secret must fail fast (SIT auto-deploy regression)."""
        import logging
        from src.config.config import AuthConfig, JWTConfig, Config, ServerConfig

        # Minimal Config is heavy (airlines required). Call validator via a stub object.
        class _Stub:
            pass

        stub = _Stub()
        stub.auth = AuthConfig(
            enabled=True,
            jwt=JWTConfig(enabled=True, secret="${JWT_SECRET}"),
        )
        with pytest.raises(ValueError, match="JWT secret is missing or unresolved"):
            config_manager._validate_auth_config(stub, logging.getLogger("test"))

    def test_validate_auth_config_accepts_resolved_secret(self):
        import logging
        from src.config.config import AuthConfig, JWTConfig

        class _Stub:
            pass

        stub = _Stub()
        stub.auth = AuthConfig(
            enabled=True,
            jwt=JWTConfig(enabled=True, secret="shared-with-live-server"),
        )
        config_manager._validate_auth_config(stub, logging.getLogger("test"))
