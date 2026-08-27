"""Prefixed Redis client wrapper for engine-server.

Mirrors the live-server / connector-server / pbs-server client-layer prefix
wrapper (``src/utils/prefixed-redis.ts``). Wraps a ``redis.Redis`` instance
so all key-accepting methods transparently receive ``<REDIS_KEY_PREFIX>:``
prepended keys. Call sites pass bare keys, exactly as they would to a raw
``redis.Redis``:

    await r.get("optimizer:task:abc")     # actually hits sit:optimizer:task:abc
    await r.sadd("optimizer:tasks:all", id)

The same wrapper also intercepts ``pipeline()`` to return a
``PrefixedPipeline`` so every command in a transaction gets the prefix too.

The engine-server doesn't use BullMQ, so no ``withBullmqPrefix`` analogue is
needed here. (BullMQ rejects ``:`` in queue names; that's a TS-only concern.)

Why a Python wrapper, not a redis-py monkey-patch? Because the existing
``redis-py`` API doesn't expose a connection-level key prefix hook, and
redis-py 5.x methods go through ``Redis.execute_command`` which we'd have to
patch on every instance. A thin object wrapper is the smallest change that
keeps the call sites clean and the test surface tight.

Design notes:

* ``redisKeyPrefix()`` is read on **every** call (no cache), so a
  ``monkeypatch.setenv("REDIS_KEY_PREFIX", ...)`` between tests takes
  effect without ``cache_clear``. Same rule as
  ``src/utils/redis_key_prefix.py``.
* Already-prefixed keys (first segment == current prefix) are passed
  through unchanged, so double-wrapping is a no-op.
* Empty prefix degrades to bare keys (no leading ``:``).
* Methods that don't take keys (``ping``, ``info``, ``acl_*``, ...) are
  passed through transparently via ``__getattr__`` falling back to the
  underlying client.
"""

from __future__ import annotations

from typing import Any, Iterable, List, Optional

import redis

from src.utils.redis_key_prefix import redis_key_prefix


def _pfx() -> str:
    """Current prefix with trailing ``:`` (or ``''`` if no prefix)."""
    p = redis_key_prefix()
    return f"{p}:" if p else ""


def _prefix_key(k: str) -> str:
    p = _pfx()
    if not p:
        return k
    if k.startswith(p):
        return k
    return f"{p}{k}"


def _prefix_keys(keys: Iterable[str]) -> List[str]:
    return [_prefix_key(k) for k in keys]


class PrefixedPipeline:
    """Wrap a ``redis.client.Pipeline`` so every queued command is prefixed.

    Mirrors the methods engine-server actually uses on a pipeline:
    ``setex / sadd / srem / delete / smembers / mget / publish / execute``.
    Other pipeline commands fall through to the underlying pipeline object.
    """

    def __init__(self, raw: "redis.client.Pipeline"):
        self._raw = raw

    # ── Single-key commands on the pipeline ─────────────────────────
    def setex(self, name: str, time: int, value: Any) -> "PrefixedPipeline":
        self._raw.setex(_prefix_key(name), time, value)
        return self

    def psetex(self, name: str, time_ms: int, value: Any) -> "PrefixedPipeline":
        self._raw.psetex(_prefix_key(name), time_ms, value)
        return self

    def set(self, name: str, value: Any, **kwargs: Any) -> "PrefixedPipeline":
        self._raw.set(_prefix_key(name), value, **kwargs)
        return self

    def get(self, name: str) -> "PrefixedPipeline":
        self._raw.get(_prefix_key(name))
        return self

    def delete(self, *names: Any) -> "PrefixedPipeline":
        if len(names) == 1 and isinstance(names[0], (list, tuple)):
            self._raw.delete(*_prefix_keys(names[0]))
        else:
            self._raw.delete(*_prefix_keys(names))
        return self

    def unlink(self, *names: Any) -> "PrefixedPipeline":
        if len(names) == 1 and isinstance(names[0], (list, tuple)):
            self._raw.unlink(*_prefix_keys(names[0]))
        else:
            self._raw.unlink(*_prefix_keys(names))
        return self

    def ttl(self, name: str) -> "PrefixedPipeline":
        self._raw.ttl(_prefix_key(name))
        return self

    def pttl(self, name: str) -> "PrefixedPipeline":
        self._raw.pttl(_prefix_key(name))
        return self

    # ── Set commands ────────────────────────────────────────────────
    def sadd(self, name: str, *values: Any) -> "PrefixedPipeline":
        self._raw.sadd(_prefix_key(name), *values)
        return self

    def srem(self, name: str, *values: Any) -> "PrefixedPipeline":
        self._raw.srem(_prefix_key(name), *values)
        return self

    def smembers(self, name: str) -> "PrefixedPipeline":
        self._raw.smembers(_prefix_key(name))
        return self

    # ── Hash commands ───────────────────────────────────────────────
    def hset(self, name: str, *args: Any, **kwargs: Any) -> "PrefixedPipeline":
        self._raw.hset(_prefix_key(name), *args, **kwargs)
        return self

    def hget(self, name: str, key: str) -> "PrefixedPipeline":
        self._raw.hget(_prefix_key(name), key)
        return self

    def hdel(self, name: str, *keys: str) -> "PrefixedPipeline":
        self._raw.hdel(_prefix_key(name), *keys)
        return self

    # ── Multi-key / list commands ───────────────────────────────────
    def mget(self, keys: Iterable[str], **kwargs: Any) -> "PrefixedPipeline":
        self._raw.mget(_prefix_keys(keys), **kwargs)
        return self

    # ── Pub/Sub ─────────────────────────────────────────────────────
    def publish(self, channel: str, message: Any, **kwargs: Any) -> "PrefixedPipeline":
        self._raw.publish(_prefix_key(channel), message, **kwargs)
        return self

    # ── Pipeline control ────────────────────────────────────────────
    def execute(self, raise_on_error: bool = True) -> List[Any]:
        return self._raw.execute(raise_on_error=raise_on_error)

    def __enter__(self) -> "PrefixedPipeline":
        self._raw.__enter__()
        return self

    def __exit__(self, *args: Any) -> Any:
        return self._raw.__exit__(*args)

    # Anything we don't explicitly intercept falls through to the raw
    # pipeline. This is important so callers (e.g. ``pipe.reset()``,
    # ``pipe.watch(...)``, ``pipe.multi()``) keep working.
    def __getattr__(self, item: str) -> Any:
        return getattr(self._raw, item)


class PrefixedRedis:
    """Wrap a ``redis.Redis`` instance so all key-accepting methods
    transparently prepend ``<REDIS_KEY_PREFIX>:``.

    Methods not in the intercepted set (``ping``, ``info``, ``acl_*``,
    ``scan_iter``, ...) fall through to the underlying client via
    ``__getattr__``.

    The wrapper is intentionally a thin object wrapper, not a subclass of
    ``redis.Redis`` — subclassing would force us to keep up with every
    redis-py release, while composition only needs to know about the
    methods we actually call.
    """

    def __init__(self, raw: "redis.Redis"):
        self._raw = raw

    # ── Single-key ──────────────────────────────────────────────────
    def get(self, name: str) -> Any:
        return self._raw.get(_prefix_key(name))

    def getdel(self, name: str) -> Any:
        return self._raw.getdel(_prefix_key(name))

    def set(self, name: str, value: Any, **kwargs: Any) -> Any:
        return self._raw.set(_prefix_key(name), value, **kwargs)

    def setex(self, name: str, time: int, value: Any) -> Any:
        return self._raw.setex(_prefix_key(name), time, value)

    def psetex(self, name: str, time_ms: int, value: Any) -> Any:
        return self._raw.psetex(_prefix_key(name), time_ms, value)

    def setnx(self, name: str, value: Any) -> Any:
        return self._raw.setnx(_prefix_key(name), value)

    def incr(self, name: str, amount: int = 1) -> Any:
        return self._raw.incr(_prefix_key(name), amount)

    def incrby(self, name: str, amount: int) -> Any:
        return self._raw.incrby(_prefix_key(name), amount)

    def incrbyfloat(self, name: str, amount: float) -> Any:
        return self._raw.incrbyfloat(_prefix_key(name), amount)

    def decr(self, name: str, amount: int = 1) -> Any:
        return self._raw.decr(_prefix_key(name), amount)

    def decrby(self, name: str, amount: int) -> Any:
        return self._raw.decrby(_prefix_key(name), amount)

    def expire(self, name: str, time: int, **kwargs: Any) -> Any:
        return self._raw.expire(_prefix_key(name), time, **kwargs)

    def pexpire(self, name: str, time_ms: int, **kwargs: Any) -> Any:
        return self._raw.pexpire(_prefix_key(name), time_ms, **kwargs)

    def expireat(self, name: str, when: int, **kwargs: Any) -> Any:
        return self._raw.expireat(_prefix_key(name), when, **kwargs)

    def pexpireat(self, name: str, when: int, **kwargs: Any) -> Any:
        return self._raw.pexpireat(_prefix_key(name), when, **kwargs)

    def ttl(self, name: str) -> int:
        return self._raw.ttl(_prefix_key(name))

    def pttl(self, name: str) -> int:
        return self._raw.pttl(_prefix_key(name))

    def persist(self, name: str) -> Any:
        return self._raw.persist(_prefix_key(name))

    def exists(self, name: str) -> Any:
        return self._raw.exists(_prefix_key(name))

    def type(self, name: str) -> Any:
        return self._raw.type(_prefix_key(name))

    def rename(self, src: str, dst: str) -> Any:
        return self._raw.rename(_prefix_key(src), _prefix_key(dst))

    def renamenx(self, src: str, dst: str) -> Any:
        return self._raw.renamenx(_prefix_key(src), _prefix_key(dst))

    # ── Multi-key ───────────────────────────────────────────────────
    def mget(self, keys: Iterable[str], **kwargs: Any) -> List[Any]:
        return self._raw.mget(_prefix_keys(keys), **kwargs)

    def mset(self, mapping: dict, **kwargs: Any) -> Any:
        # Every KEY side gets prefixed; values pass through unchanged.
        prefixed = {_prefix_key(k): v for k, v in mapping.items()}
        return self._raw.mset(prefixed, **kwargs)

    def delete(self, *names: Any) -> Any:
        if len(names) == 1 and isinstance(names[0], (list, tuple)):
            return self._raw.delete(*_prefix_keys(names[0]))
        return self._raw.delete(*_prefix_keys(names))

    def unlink(self, *names: Any) -> Any:
        if len(names) == 1 and isinstance(names[0], (list, tuple)):
            return self._raw.unlink(*_prefix_keys(names[0]))
        return self._raw.unlink(*_prefix_keys(names))

    # ── Hash ────────────────────────────────────────────────────────
    def hget(self, name: str, key: str) -> Any:
        return self._raw.hget(_prefix_key(name), key)

    def hset(self, name: str, *args: Any, **kwargs: Any) -> Any:
        return self._raw.hset(_prefix_key(name), *args, **kwargs)

    def hsetnx(self, name: str, key: str, value: Any) -> Any:
        return self._raw.hsetnx(_prefix_key(name), key, value)

    def hdel(self, name: str, *keys: str) -> Any:
        return self._raw.hdel(_prefix_key(name), *keys)

    def hgetall(self, name: str) -> Any:
        return self._raw.hgetall(_prefix_key(name))

    def hincrby(self, name: str, key: str, amount: int = 1) -> Any:
        return self._raw.hincrby(_prefix_key(name), key, amount)

    def hincrbyfloat(self, name: str, key: str, amount: float = 0.0) -> Any:
        return self._raw.hincrbyfloat(_prefix_key(name), key, amount)

    def hlen(self, name: str) -> int:
        return self._raw.hlen(_prefix_key(name))

    def hkeys(self, name: str) -> List[Any]:
        return self._raw.hkeys(_prefix_key(name))

    def hvals(self, name: str) -> List[Any]:
        return self._raw.hvals(_prefix_key(name))

    def hexists(self, name: str, key: str) -> bool:
        return self._raw.hexists(_prefix_key(name), key)

    def hmget(self, name: str, keys: Iterable[str]) -> List[Any]:
        return self._raw.hmget(_prefix_key(name), list(keys))

    def hmset(self, name: str, mapping: dict) -> Any:
        return self._raw.hmset(_prefix_key(name), mapping)

    # ── Set ─────────────────────────────────────────────────────────
    def sadd(self, name: str, *values: Any) -> Any:
        return self._raw.sadd(_prefix_key(name), *values)

    def srem(self, name: str, *values: Any) -> Any:
        return self._raw.srem(_prefix_key(name), *values)

    def smembers(self, name: str) -> set:
        return self._raw.smembers(_prefix_key(name))

    def sismember(self, name: str, value: Any) -> bool:
        return self._raw.sismember(_prefix_key(name), value)

    def scard(self, name: str) -> int:
        return self._raw.scard(_prefix_key(name))

    def spop(self, name: str, count: Optional[int] = None) -> Any:
        if count is None:
            return self._raw.spop(_prefix_key(name))
        return self._raw.spop(_prefix_key(name), count)

    def smove(self, src: str, dst: str, value: Any) -> bool:
        return self._raw.smove(_prefix_key(src), _prefix_key(dst), value)

    def sinter(self, keys: Iterable[str], **kwargs: Any) -> set:
        return self._raw.sinter(_prefix_keys(keys), **kwargs)

    def sunion(self, keys: Iterable[str], **kwargs: Any) -> set:
        return self._raw.sunion(_prefix_keys(keys), **kwargs)

    def sdiff(self, keys: Iterable[str], **kwargs: Any) -> set:
        return self._raw.sdiff(_prefix_keys(keys), **kwargs)

    # ── Pub/Sub ─────────────────────────────────────────────────────
    def publish(self, channel: str, message: Any, **kwargs: Any) -> int:
        return self._raw.publish(_prefix_key(channel), message, **kwargs)

    # ── Pipeline ────────────────────────────────────────────────────
    def pipeline(self, *args: Any, **kwargs: Any) -> PrefixedPipeline:
        raw_pipe = self._raw.pipeline(*args, **kwargs)
        return PrefixedPipeline(raw_pipe)

    # ── Passthrough for everything else ─────────────────────────────
    # ``ping``, ``info``, ``acl_*``, ``scan_iter``, ``config_*``, etc.
    # are exposed unchanged so callers can use the wrapper as a drop-in
    # for ``redis.Redis`` without losing any non-key methods.
    def __getattr__(self, item: str) -> Any:
        return getattr(self._raw, item)
