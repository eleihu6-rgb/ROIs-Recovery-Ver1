# DEV 数据库 Schema 隔离方案

> 目的：本地开发使用独立的 `f8_dev_*` schema，彻底杜绝开发操作影响 UAT 数据。
> 日期：2026-08-12
> 适用：所有在本地（CoreServer 10.15.12.3）开发 live-server / pbs-server / gantt / pbs-portal 的工程师与 AI agent。

## 1. Schema 总览

数据库 `rois` 按环境 + 业务隔离，共 9 个 schema（2026-08-12 起，旧的 `f8`/`f8_pbs`/`scenario` 已删除）：

| 环境 | Live（排班管理）| Scenario（场景）| PBS（机组申请）|
|------|----------------|----------------|---------------|
| **DEV（本地开发）** | `f8_dev_live` | `f8_dev_scenario` | `f8_dev_pbs` |
| **UAT** | `f8_uat_live` | `f8_uat_scenario` | `f8_uat_pbs` |
| **SIT** | `f8_sit_live` | `f8_sit_scenario` | `f8_sit_pbs` |

**铁律：本地开发一律使用 `f8_dev_*` 三个 schema。** 查询、写入、seed、测试都不得指向 `f8_uat_*`。

## 2. DB 实例与连接

- PostgreSQL 跑在 CoreServer（10.15.12.3）的 Docker 容器 `postgres` 内，端口 5432（内网）+ 55432（公网映射到同一实例）。
- 连接基础：database=`rois`，host=`10.15.12.3:5432`（内网）或 `47.253.173.207:55432`（公网）。
- 各服务 `.env` 的 `DATABASE_URL` 已配置好角色 + search_path（见下），本地开发直接 `npm run dev` 即可。

## 3. DEV 角色与权限

| 角色 | 用途 | 可访问 schema | 属主 |
|------|------|--------------|------|
| `f8_dev_live` | live-server / scenario 连接 | `f8_dev_live`、`f8_dev_scenario`、`f8_dev_pbs` | `f8_dev_live`、`f8_dev_scenario` |
| `f8_dev_pbs` | pbs-server 连接 | `f8_dev_pbs`、`f8_dev_live`、`f8_dev_scenario` | `f8_dev_pbs` |

- 角色密码存于各服务本地 `.env`（`live-server/.env`、`pbs-server/.env` 的 `DATABASE_URL`），**不在本文档/代码/文档中明文**。
- **UAT 角色（`f8_uat_live`/`f8_uat_pbs`）已撤销对 `f8_dev_*` 的访问权限**——UAT 凭据连不到 dev 数据，dev 凭据也连不到 UAT（各自 schema 属主分离）。

## 4. 本地开发配置

各服务 `.env` 关键变量（已配置，勿改回 UAT）：

| 服务 | 变量 | 值 |
|------|------|----|
| live-server | `LIVE_SCHEMA` | `f8_dev_live` |
| live-server | `SCENARIO_SCHEMA` | `f8_dev_scenario` |
| live-server | `PBS_SCHEMA` | `f8_dev_pbs` |
| live-server | `DATABASE_URL` search_path | `f8_dev_live` |
| pbs-server | `PBS_SCHEMA` | `f8_dev_pbs` |
| pbs-server | `DATABASE_URL` search_path | `f8_dev_pbs` |

本地服务端口（与 UAT 隔离）：live-server `3200`、pbs-server `3202`（UAT 占 3000/3002）。

## 5. DEV schema 数据

`f8_dev_*` 从 `f8_uat_*` 完整复制（2026-08-12），含表结构 + 数据 + 序列 + 视图：

| schema | 表数 | 数据 |
|--------|------|------|
| `f8_dev_live` | 148 | 21 users、~47 万 roster_flight 等 |
| `f8_dev_pbs` | 23 | 826 pbs_user |
| `f8_dev_scenario` | 19 | 与 UAT 一致 |

## 6. 重建方法（如需刷新 dev 数据）

从 UAT 复制到 dev（在 CoreServer 上以 postgres 超管执行，`sudo docker exec postgres psql -U postgres -d rois`）：

1. `DROP SCHEMA f8_dev_* CASCADE` + 重建（`CREATE SCHEMA f8_dev_X AUTHORIZATION f8_dev_X`）。
2. 逐表 `CREATE TABLE f8_dev_X.t (LIKE f8_uat_X.t INCLUDING ALL)` + `INSERT ... OVERRIDING SYSTEM VALUE SELECT *`（**排除 GENERATED ALWAYS 计算列**，如 `flight_composition.open`）。
3. `setval` 重置 identity 序列到 `max(id)`。
4. 重建视图（`pbs_bid_feedback_team_rule_source`，引用改为 `f8_dev_live`）。
5. 授权 dev 角色（`GRANT USAGE, CREATE ON SCHEMA ... TO f8_dev_live, f8_dev_pbs` + 表/序列 ALL）。

## 7. AI agent 注意事项

- 查询/调试本地库一律用 `f8_dev_*`（用各服务 `.env` 的 `DATABASE_URL`，search_path 已指向 dev）。
- **禁止**用 dev 连接改 UAT schema；也**禁止**用 UAT 凭据访问 dev（已撤销权限）。
- 判断目标环境先看 `.env` 的 `LIVE_SCHEMA`/`PBS_SCHEMA`/`SCENARIO_SCHEMA`（或 `DATABASE_URL` 的 search_path），再选 schema。
- 涉及 schema 的测试断言（如 `schema: 'f8'`）在 dev 下应为 `f8_dev_live`——发现 stale 断言按 §Stale-Test 更新。

## 8. 测试安全性

**在本地跑单元 / 集成 / E2E 测试是安全的——所有 DB 写操作（seed、清理、业务写入）都落在 `f8_dev_*`，不会影响 SIT/UAT 数据。**

- dev 服务（live 3200 / pbs 3202）连接 `f8_dev_*`；测试若连后端，写操作走 dev schema。
- SIT/UAT 服务与 dev 完全隔离（不同 schema + 不同端口 + 不同主机 10.15.12.4 / 10.15.12.3）。
- 唯一需注意：测试若显式指定了 `search_path=f8_uat_*` 或硬编码 schema（如部分历史 fixture），会连到错误环境——按 §Stale-Test 更新为 `f8_dev_*`。
