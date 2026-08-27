"""Tests for engine-server Redis key prefix utility.

The engine-server's prefix is now applied transparently at the client layer
(via ``utils/prefixed_redis.PrefixedRedis``), not by call sites calling
``with_prefix(...)``. So ``with_prefix`` is a deprecated no-op and the
real prefix behavior is tested in ``test_prefixed_redis.py``.

The ``redis_key_prefix()`` reader still has the same contract (reads
``os.environ`` live, no cache, default 'dev') — keep those tests intact.
"""
import pytest
from src.utils import redis_key_prefix as rkp


def test_default_is_dev(monkeypatch):
    monkeypatch.delenv("REDIS_KEY_PREFIX", raising=False)
    assert rkp.redis_key_prefix() == "dev"


def test_redis_key_prefix_reads_env_at_call_time(monkeypatch):
    """No lru_cache — env is read live, no cache_clear needed."""
    monkeypatch.setenv("REDIS_KEY_PREFIX", "dev")
    assert rkp.redis_key_prefix() == "dev"
    monkeypatch.setenv("REDIS_KEY_PREFIX", "uat")
    assert rkp.redis_key_prefix() == "uat"


def test_redis_key_prefix_accepts_other_envs(monkeypatch):
    for env in ("dev", "uat", "sit", "prod", "demo"):
        monkeypatch.setenv("REDIS_KEY_PREFIX", env)
        assert rkp.redis_key_prefix() == env


# ── with_prefix() is now a deprecated no-op ─────────────────────────
# Call sites that still import with_prefix() will get the bare key back;
# the real prefix injection happens in PrefixedRedis. These tests pin
# the no-op behavior so a future regression is caught immediately.

def test_with_prefix_is_noop_uat(monkeypatch):
    monkeypatch.setenv("REDIS_KEY_PREFIX", "uat")
    # no-op: returns bare key unchanged (prefix is applied by PrefixedRedis)
    assert rkp.with_prefix("optimizer:task:abc") == "optimizer:task:abc"


def test_with_prefix_is_noop_sit(monkeypatch):
    monkeypatch.setenv("REDIS_KEY_PREFIX", "sit")
    assert rkp.with_prefix("optimizer:tasks:all") == "optimizer:tasks:all"


def test_with_prefix_is_noop_empty(monkeypatch):
    monkeypatch.setenv("REDIS_KEY_PREFIX", "")
    # empty prefix still works, just returns the bare key
    assert rkp.with_prefix("foo") == "foo"
    assert rkp.with_prefix("optimizer:task:x") == "optimizer:task:x"
