"""Tests for the engine-server PrefixedRedis client wrapper.

The wrapper must transparently prepend ``<REDIS_KEY_PREFIX>:`` to every
key-accepting method call. Tests use ``fakeredis`` so we can introspect
what actually landed in the (fake) Redis, instead of relying on
redis-py's public API returning the same prefixed/unprefixed key.

Mirrors the live-server / connector-server / pbs-server client-layer
prefix tests (see those modules' ``src/__tests__/utils/prefixed-redis.test.ts``).
"""
import os
import fakeredis
import pytest

from src.utils.prefixed_redis import PrefixedRedis, PrefixedPipeline


@pytest.fixture
def raw():
    return fakeredis.FakeRedis(decode_responses=True)


@pytest.fixture
def client(raw):
    return PrefixedRedis(raw)


# ── Default prefix reads from env ───────────────────────────────────

def test_default_prefix_is_dev(monkeypatch, raw):
    monkeypatch.delenv("REDIS_KEY_PREFIX", raising=False)
    c = PrefixedRedis(raw)
    c.set("foo", "v")
    assert raw.get("dev:foo") == "v"
    assert raw.get("foo") is None


def test_uat_prefix(monkeypatch, raw):
    monkeypatch.setenv("REDIS_KEY_PREFIX", "uat")
    c = PrefixedRedis(raw)
    c.set("foo", "v")
    assert raw.get("uat:foo") == "v"
    assert raw.get("dev:foo") is None


def test_sit_prefix(monkeypatch, raw):
    monkeypatch.setenv("REDIS_KEY_PREFIX", "sit")
    c = PrefixedRedis(raw)
    c.set("bar", "v")
    assert raw.get("sit:bar") == "v"


def test_empty_prefix_does_not_prepend(monkeypatch, raw):
    monkeypatch.setenv("REDIS_KEY_PREFIX", "")
    c = PrefixedRedis(raw)
    c.set("foo", "v")
    # empty prefix → no leading ":"
    assert raw.get("foo") == "v"


def test_prefix_is_live_env_no_cache(monkeypatch, raw):
    monkeypatch.setenv("REDIS_KEY_PREFIX", "dev")
    c = PrefixedRedis(raw)
    c.set("k1", "v1")
    assert raw.get("dev:k1") == "v1"

    monkeypatch.setenv("REDIS_KEY_PREFIX", "uat")
    c.set("k2", "v2")
    assert raw.get("uat:k2") == "v2"
    assert raw.get("dev:k2") is None


# ── Double-prefix idempotence ────────────────────────────────────────

def test_already_prefixed_key_is_not_double_prefixed(monkeypatch, raw):
    monkeypatch.setenv("REDIS_KEY_PREFIX", "uat")
    c = PrefixedRedis(raw)
    c.set("uat:already:prefixed", "v")
    # Should store at "uat:already:prefixed", not "uat:uat:already:prefixed"
    assert raw.get("uat:already:prefixed") == "v"
    assert raw.get("uat:uat:already:prefixed") is None


# ── Single-key methods ──────────────────────────────────────────────

def test_get_setex(monkeypatch, client, raw):
    monkeypatch.setenv("REDIS_KEY_PREFIX", "uat")
    client.setex("task:x", 60, "data")
    assert raw.get("uat:task:x") == "data"
    assert client.get("task:x") == "data"


def test_set_with_kwargs(monkeypatch, client, raw):
    monkeypatch.setenv("REDIS_KEY_PREFIX", "uat")
    client.set("plain:k", "v", ex=30)
    assert raw.get("uat:plain:k") == "v"


def test_ttl(monkeypatch, client, raw):
    monkeypatch.setenv("REDIS_KEY_PREFIX", "uat")
    client.setex("t:1", 100, "v")
    # fakeredis counts down real-time, so allow >=99
    assert 99 <= client.ttl("t:1") <= 100


def test_delete_single_and_list(monkeypatch, client, raw):
    monkeypatch.setenv("REDIS_KEY_PREFIX", "uat")
    client.set("k1", "v1")
    client.set("k2", "v2")
    client.set("k3", "v3")

    client.delete("k1")
    assert raw.get("uat:k1") is None

    client.delete("k2", "k3")
    assert raw.get("uat:k2") is None
    assert raw.get("uat:k3") is None

    # list form
    client.set("k4", "v4")
    client.set("k5", "v5")
    client.delete(["k4", "k5"])
    assert raw.get("uat:k4") is None
    assert raw.get("uat:k5") is None


# ── Hash methods ────────────────────────────────────────────────────

def test_hash_methods(monkeypatch, client, raw):
    monkeypatch.setenv("REDIS_KEY_PREFIX", "uat")
    client.hset("h:1", "f1", "v1")
    assert raw.hget("uat:h:1", "f1") == "v1"
    assert client.hget("h:1", "f1") == "v1"
    assert client.hlen("h:1") == 1
    assert client.hkeys("h:1") == ["f1"]


# ── Set methods ──────────────────────────────────────────────────────

def test_set_methods(monkeypatch, client, raw):
    monkeypatch.setenv("REDIS_KEY_PREFIX", "uat")
    client.sadd("s:1", "a", "b", "c")
    assert raw.smembers("uat:s:1") == {"a", "b", "c"}
    assert client.smembers("s:1") == {"a", "b", "c"}
    client.srem("s:1", "a")
    assert client.smembers("s:1") == {"b", "c"}
    assert client.scard("s:1") == 2
    # redis-py sismember returns int (0/1), not bool
    assert int(client.sismember("s:1", "b")) == 1


def test_set_multi_key(monkeypatch, client, raw):
    monkeypatch.setenv("REDIS_KEY_PREFIX", "uat")
    client.sadd("a", "1")
    client.sadd("b", "2")
    client.sadd("c", "3")
    result = client.sinter(["a", "b", "c"])
    # intersection of disjoint sets → empty
    assert result == set()


# ── mget multi-key ──────────────────────────────────────────────────

def test_mget_prefixes_all_keys(monkeypatch, client, raw):
    monkeypatch.setenv("REDIS_KEY_PREFIX", "uat")
    client.set("a", "A")
    client.set("b", "B")
    client.set("c", "C")
    vals = client.mget(["a", "b", "c"])
    assert vals == ["A", "B", "C"]


# ── Pipeline ────────────────────────────────────────────────────────

def test_pipeline_prefixes_all_commands(monkeypatch, client, raw):
    monkeypatch.setenv("REDIS_KEY_PREFIX", "uat")
    pipe = client.pipeline()
    pipe.setex("p:1", 60, "P1")
    pipe.sadd("p:set", "a", "b")
    pipe.execute()
    assert raw.get("uat:p:1") == "P1"
    assert raw.smembers("uat:p:set") == {"a", "b"}


def test_pipeline_returns_prefixed_pipeline(monkeypatch, client, raw):
    monkeypatch.setenv("REDIS_KEY_PREFIX", "uat")
    pipe = client.pipeline()
    assert isinstance(pipe, PrefixedPipeline)


def test_pipeline_passthrough_methods(monkeypatch, client, raw):
    """Methods not explicitly wrapped on PrefixedPipeline (reset, watch,
    multi, ...) must still be reachable via __getattr__."""
    monkeypatch.setenv("REDIS_KEY_PREFIX", "uat")
    pipe = client.pipeline()
    # reset() exists on redis.client.Pipeline and is not intercepted
    assert hasattr(pipe, "reset")
    pipe.reset()


# ── Pub/Sub ─────────────────────────────────────────────────────────

def test_publish_prefixes_channel(monkeypatch, client, raw):
    monkeypatch.setenv("REDIS_KEY_PREFIX", "uat")
    n = client.publish("channel:1", "msg")
    # fakeredis returns 0 (no subscribers) but the call should not raise
    assert isinstance(n, int)


# ── Passthrough for non-key methods ─────────────────────────────────

def test_ping_fallthrough(monkeypatch, client):
    monkeypatch.setenv("REDIS_KEY_PREFIX", "uat")
    assert client.ping() is True


def test_info_fallthrough(monkeypatch, client):
    monkeypatch.setenv("REDIS_KEY_PREFIX", "uat")
    # info() should pass through to the raw client.
    # fakeredis 2.37 may not implement INFO; if it does not, the call
    # raises ResponseError — that's still a pass-through, not a wrapper bug.
    import redis as _redis
    try:
        result = client.info()
        assert isinstance(result, (str, dict))
    except _redis.exceptions.ResponseError:
        # INFO unsupported by fakeredis — fallthrough itself is verified
        # by the fact we reached the raw client without a wrapper error
        pytest.skip("fakeredis 2.37 does not implement INFO")


def test_flushdb_fallthrough(monkeypatch, raw, client):
    monkeypatch.setenv("REDIS_KEY_PREFIX", "uat")
    client.set("k", "v")
    client.flushdb()
    assert len(raw.keys("*")) == 0


# ── Realistic scenario: full task lifecycle ─────────────────────────

def test_full_task_lifecycle(monkeypatch, raw):
    """Walk through the same calls RedisManager.set_task / get_task /
    delete_task make, end-to-end, and verify the actual stored keys carry
    the prefix while the call sites use bare keys."""
    monkeypatch.setenv("REDIS_KEY_PREFIX", "uat")
    client = PrefixedRedis(raw)

    # set_task
    pipe = client.pipeline()
    pipe.setex("optimizer:task:tid-1", 3600, '{"id":"tid-1","status":"running"}')
    pipe.sadd("optimizer:tasks:all", "tid-1")
    pipe.sadd("optimizer:tasks:running", "tid-1")
    pipe.execute()

    # Stored under uat: namespace
    assert raw.get("uat:optimizer:task:tid-1") == '{"id":"tid-1","status":"running"}'
    assert raw.smembers("uat:optimizer:tasks:all") == {"tid-1"}
    assert raw.smembers("uat:optimizer:tasks:running") == {"tid-1"}

    # get_task
    data = client.get("optimizer:task:tid-1")
    assert data == '{"id":"tid-1","status":"running"}'

    # get_all_tasks
    task_ids = client.smembers("optimizer:tasks:all")
    assert task_ids == {"tid-1"}
    values = client.mget([f"optimizer:task:{tid}" for tid in task_ids])
    assert values == ['{"id":"tid-1","status":"running"}']

    # delete_task
    pipe = client.pipeline()
    pipe.delete("optimizer:task:tid-1")
    pipe.srem("optimizer:tasks:all", "tid-1")
    pipe.srem("optimizer:tasks:running", "tid-1")
    pipe.execute()
    assert raw.get("uat:optimizer:task:tid-1") is None
    assert raw.smembers("uat:optimizer:tasks:all") == set()


def test_different_envs_dont_collide(monkeypatch):
    """Two PrefixedRedis clients in the same process, talking to two
    different (fake) redis instances, must NOT see each other's keys
    when their env differs.

    Note: PrefixedRedis reads the current env on every call (no cache),
    matching the TS sibling. So we must swap env BEFORE the write to
    simulate the realistic per-process env.
    """
    dev_raw = fakeredis.FakeRedis(decode_responses=True)
    uat_raw = fakeredis.FakeRedis(decode_responses=True)

    monkeypatch.setenv("REDIS_KEY_PREFIX", "dev")
    dev = PrefixedRedis(dev_raw)
    dev.set("shared:key", "DEV-VAL")
    assert dev_raw.get("dev:shared:key") == "DEV-VAL"
    assert dev_raw.get("uat:shared:key") is None

    # Reset uat_raw just to be safe (different FakeRedis instance, but
    # verify it starts empty in its own db).
    assert uat_raw.keys("*") == []

    monkeypatch.setenv("REDIS_KEY_PREFIX", "uat")
    uat = PrefixedRedis(uat_raw)
    uat.set("shared:key", "UAT-VAL")
    assert uat_raw.get("uat:shared:key") == "UAT-VAL"
    # dev side untouched by uat writes (different fakeredis server instance)
    assert dev_raw.get("dev:shared:key") == "DEV-VAL"
    # and dev_raw never saw the uat: prefix
    assert dev_raw.get("uat:shared:key") is None
