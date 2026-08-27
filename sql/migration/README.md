# SQL Migration Scripts

数据库增量变更脚本目录。

## 执行顺序

脚本按日期编号排序执行，确保依赖关系正确。

## 已执行迁移

| 脚本 | 日期 | Schema | 说明 |
|------|------|--------|------|
| `2026-04-21-refactor-pairing-segment-fields.sql` | 2026-04-21 | f8 ✅ | 重构 pairing_segment 进退场字段 |
| `2026-05-01-add-pbs-business-time-override-config.sql` | 2026-05-01 | f8_pbs ✅ | 确保 dictionary 基础表存在，并注册 PBS 业务时间覆盖参数，默认不启用 |

## 待执行迁移

| 脚本 | 待执行 Schema |
|------|---------------|
| `2026-04-21-refactor-pairing-segment-fields.sql` | tg |
| `2026-06-10-rule-group-schema-refactor.sql` | f8 ✅ tg（tg 用户待建） |
| `2026-06-10-rule-group-default-per-division.sql` | f8 ✅ tg（tg 用户待建） |
| `2026-06-10-rule-ws103-migration.sql` | f8 ✅ tg（tg 用户待建） |
| `2026-06-22-pairing-search-perf-indexes.sql` | f8 ✅ tg（tg 用户待建） |

## 执行方式

```bash
# 通过 Node.js 执行（推荐，自动处理 search_path）
npx tsx run-migration.ts

# 或通过 psql 直接执行
PGPASSWORD='Pier2026AIf8' psql -h localhost -U f8 -d rois \
  -c "SET search_path TO f8;" \
  -f sql/migration/2026-04-21-xxx.sql
```

## 迁移脚本编写规范

1. **幂等设计**：使用 `IF EXISTS` / `IF NOT EXISTS` 避免重复执行报错
2. **顶部注释**：必须包含日期、功能说明、业务背景
3. **分步执行**：DROP → ADD → COMMENT，便于定位错误
4. **多 Schema 执行**：脚本不含 schema 前缀，通过 `SET search_path` 切换

---

## 2026-04-21: pairing_segment 进退场字段重构

### 变更内容

删除旧的 3 次进退场字段（pickup_1/2/3_xxx 等 30 个），新增单次 + 双次进退场字段（20 个）。

### 业务场景

| 场景 | 使用字段 |
|------|---------|
| 正常 Duty | pickup/brief + debrief/dropoff（首次） |
| 带休息 Duty | double_pickup/brief/debrief/dropoff（第二次进退场） |
| 大过站 | double_* 在 Segment 层级 |

### 数据赋值规则

- **Duty 内第一段 Segment**：只赋值 pickup/brief 字段
- **Duty 内最后段 Segment**：只赋值 debrief/dropoff 字段
- **发生第二次签退签到**：所有 double_* 字段赋值

### 新增字段清单

首次进退场（10 个，全部可空）：
- pickup_start_utc, pickup_end_utc
- brief_airport, brief_start_utc, brief_end_utc
- debrief_airport, debrief_start_utc, debrief_end_utc
- dropoff_start_utc, dropoff_end_utc

第二次进退场（10 个，全部可空）：
- double_pickup_start_utc, double_pickup_end_utc
- double_brief_airport, double_brief_start_utc, double_brief_end_utc
- double_debrief_airport, double_debrief_start_utc, double_debrief_end_utc
- double_dropoff_start_utc, double_dropoff_end_utc
