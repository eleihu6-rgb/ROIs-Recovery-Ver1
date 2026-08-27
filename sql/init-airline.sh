#!/bin/bash
# ============================================================
# 一键初始化新航司脚本
# 用法: ./sql/init-airline.sh <航司二字码>
# 示例: ./sql/init-airline.sh CA
# 流程: 创建 Schema → 执行建表脚本 → 执行基础数据 seed 脚本 → 设置 filiale 大写默认
# ============================================================

set -euo pipefail

AIRLINE_CODE="${1:?用法: $0 <航司二字码>, 例如: $0 CA}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 数据库连接参数（从环境变量读取，提供默认值）
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-f8}"
DB_USER="${DB_USER:-f8}"

# 转换为大写（filiale 默认值必须大写）
AIRLINE_UPPER=$(echo "$AIRLINE_CODE" | tr '[:lower:]' '[:upper:]')

echo "=========================================="
echo "初始化航司: ${AIRLINE_CODE}"
echo "数据库: ${DB_HOST}:${DB_PORT}/${DB_NAME}"
echo "=========================================="

# 1. 创建 Schema
echo "[1/4] 创建 Schema ${AIRLINE_CODE}..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
  CREATE SCHEMA IF NOT EXISTS ${AIRLINE_CODE} AUTHORIZATION ${DB_USER};
"

# 2. 执行建表脚本（按目录顺序: live → pbs → scenario）
echo "[2/4] 执行建表脚本..."
for sql_file in $(find "$SCRIPT_DIR"/schema/live "$SCRIPT_DIR"/schema/pbs "$SCRIPT_DIR"/schema/scenario -name "*.sql" -type f 2>/dev/null | sort); do
  echo "  执行: $(basename "$(dirname "$sql_file")")/$(basename "$sql_file")"
  PGOPTIONS="-c search_path=${AIRLINE_CODE}" \
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$sql_file"
done

# 3. 执行 seed 数据脚本
echo "[3/4] 执行 seed 数据脚本..."
for sql_file in "$SCRIPT_DIR"/seed/*.sql; do
  if [ -f "$sql_file" ]; then
    echo "  执行: $(basename "$sql_file")"
    PGOPTIONS="-c search_path=${AIRLINE_CODE}" \
      psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$sql_file"
  fi
done

# 4. 设置 filiale 列大写约束（不设置 DEFAULT，不同航司默认值不同）
echo "[4/4] 设置 filiale 大写约束..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
SET search_path TO ${AIRLINE_CODE};

DO \$\$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = '${AIRLINE_CODE}'
      AND column_name = 'filiale'
      AND table_name != 'filiale'
  LOOP
    EXECUTE format('ALTER TABLE ${AIRLINE_CODE}.%I DROP CONSTRAINT IF EXISTS chk_%I_filiale_upper', tbl, tbl);
    EXECUTE format('ALTER TABLE ${AIRLINE_CODE}.%I ADD CONSTRAINT chk_%I_filiale_upper CHECK (filiale = UPPER(filiale))', tbl, tbl);
  END LOOP;
END \$\$;
"

echo "=========================================="
echo "航司 ${AIRLINE_CODE} 初始化完成!"
echo "filiale CHECK 级约束已设置（强制大写）"
echo "注意：seed 脚本必须显式提供 filiale = '${AIRLINE_UPPER}'"
echo "=========================================="
