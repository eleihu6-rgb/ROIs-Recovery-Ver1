"""Redis key prefix isolation per environment.

同一台机多个 engine-server 共用 Redis 时，靠这个 key 把读写空间隔开：
dev / uat / sit / prod 各自只读写自己 `<env>:*` 子集，互不踩。

默认 'dev'（pydantic 兜底）。engine-server 的 `Config` 是 YAML 驱动、没有
APP_ENV 概念，所以 prod-like 守卫不存在；部署时必须在 yaml/env 显式设
`REDIS_KEY_PREFIX=prod`（或其他非 'dev' / 非 'uat' 值）以避免与 dev/uat
进程撞 key。
"""
import os


def redis_key_prefix() -> str:
    """当前进程所属环境的 Redis key prefix。

    直接读 `os.environ['REDIS_KEY_PREFIX']`（不缓存）的原因：
    1. lru_cache 会让 env 改动后必须 cache_clear 一次才生效——测试 / hot-reload
       场景下容易踩坑。
    2. 运行时每次都从 `os.environ` 读 string 字段几乎零开销（dict lookup）。
    3. Config 在启动时已经验过 REDIS_KEY_PREFIX 的合法性，运行时直接读
       os.environ 是安全的。
    """
    return os.environ.get("REDIS_KEY_PREFIX", "dev")


def with_prefix(key: str) -> str:
    """Deprecated v1 opt-in 包装：no-op。

    ``tasks/redis_manager.py`` 已经在 client 层（用 ``utils/prefixed_redis.py``
    的 ``PrefixedRedis``）透明加 ``<env>:`` 前缀，call site 直接传裸 key
    即可。继续调这个函数是冗余但无害——它现在返回原 key 不变。计划在下
    一个 release 删除。
    """
    return key
