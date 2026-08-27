#!/bin/bash
# ROIS-AI PostgreSQL 初始化脚本
# 由 docker-entrypoint-initdb.d 自动执行（仅首次创建数据卷时）
# 幂等：可安全重复执行

set -e

PGUSER="${POSTGRES_USER:-postgres}"

echo "=== ROIS-AI: 初始化数据库 ==="

# ── 创建数据库（如果不存在）─────────────────────────────────────
psql -v ON_ERROR_STOP=0 -U "$PGUSER" <<-'EOSQL'
  SELECT 'CREATE DATABASE rois'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'rois')\gexec
EOSQL

# ── 创建用户和 schema ──────────────────────────────────────────
psql -v ON_ERROR_STOP=1 -U "$PGUSER" -d rois <<-'EOSQL'
  -- f8 用户和 schema
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'f8') THEN
      CREATE ROLE f8 LOGIN PASSWORD 'Pier2026AIf8';
    END IF;
  END
  $$;
  CREATE SCHEMA IF NOT EXISTS f8 AUTHORIZATION f8;
  ALTER ROLE f8 SET search_path TO f8, public;
  GRANT USAGE ON SCHEMA f8 TO f8;
  GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA f8 TO f8;
  ALTER DEFAULT PRIVILEGES IN SCHEMA f8 GRANT ALL ON TABLES TO f8;

  -- tg 用户和 schema
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tg') THEN
      CREATE ROLE tg LOGIN PASSWORD 'Pier2026AItg';
    END IF;
  END
  $$;
  CREATE SCHEMA IF NOT EXISTS tg AUTHORIZATION tg;
  ALTER ROLE tg SET search_path TO tg, public;
  GRANT USAGE ON SCHEMA tg TO tg;
  GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA tg TO tg;
  ALTER DEFAULT PRIVILEGES IN SCHEMA tg GRANT ALL ON TABLES TO tg;
EOSQL

echo "=== ROIS-AI: 用户和 schema 创建完成 ==="

# ── 执行 schema/*.sql（建表脚本，按目录顺序: live → pbs → scenario）─
SCHEMA_DIR="/docker-entrypoint-initdb.d/schema"
if [ -d "$SCHEMA_DIR" ]; then
  echo "=== ROIS-AI: 执行建表脚本 (schema=f8) ==="
  for f in $(find "$SCHEMA_DIR"/live "$SCHEMA_DIR"/pbs "$SCHEMA_DIR"/scenario -name "*.sql" -type f 2>/dev/null | sort); do
    echo "  执行: $(basename "$(dirname "$f")")/$(basename "$f")"
    psql -v ON_ERROR_STOP=1 -U "$PGUSER" -d rois \
      -c "SET search_path TO f8, public;" \
      -f "$f"
  done
fi

# ── 执行 seed/*.sql（基础数据脚本，search_path=f8）─────────────
SEED_DIR="/docker-entrypoint-initdb.d/seed"
if [ -d "$SEED_DIR" ] && ls "$SEED_DIR"/*.sql 1>/dev/null 2>&1; then
  echo "=== ROIS-AI: 执行基础数据脚本 (schema=f8) ==="
  for f in "$SEED_DIR"/*.sql; do
    echo "  执行: $(basename "$f")"
    psql -v ON_ERROR_STOP=1 -U "$PGUSER" -d rois \
      -c "SET search_path TO f8, public;" \
      -f "$f"
  done
fi

echo "=== ROIS-AI: 数据库初始化完成 ==="
