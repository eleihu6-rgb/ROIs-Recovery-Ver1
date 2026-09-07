# SIT 配置契约（Config Contract）

> 自动更新只覆盖「可重建的代码/模板」，永不覆盖「环境私有配置」。
> 违反本契约会导致 engine-server `/optimize/start` 401 等静默故障。

## 拓扑（2026-09-07 起的新 SIT）

| 角色 | 主机 | 备注 |
|------|------|------|
| 本机（WebServer / dev 工作站）| yuan.z@local（nginx 1.26.2） | gantt 静态产物落 `/home/recovery/sit/gantt/`，由本地 nginx 通过 `/etc/nginx/conf.d/recovery-sit.conf` 提供 `/altair/`；git 仓库 + 构建环境 + cron |
| PortalServer | `root@10.15.11.3` | 后端服务运行节点；DB + Redis 在本机 Docker 中通过 localhost 暴露（无需 SSH 隧道） |
| 部署目录（远端）| `/home/recovery/sit/` | 包含 `live-server/dist`、`engine-server/` 源码、`rule-engine-rs/target/release/`、各 `packages/*`、`env/`、`logs/`、`run/` |
| 部署目录（本机）| `/home/recovery/sit/` | 只用于 gantt 静态；后端产物不到本机 |
| 数据库 | `localhost:5432` (PostgreSQL 17-alpine, docker) | schema: `f8_sit_live` / `f8_sit_scenario` / `f8_sit_pbs` |
| Redis | `localhost:6379` (redis:7-alpine, docker) | 无 SSH 隧道 |

## 部署范围（裁剪版）

| 在范围 | 不在范围 |
|--------|----------|
| live-server | pbs-server |
| engine-server | pbs-portal |
| rule-engine-rs (Rust 法规二进制) | connector-server |
| packages/shared-rules / saml / contracts / legality-messages | pbs-engine (已暂停，见下) |
| gantt (前端 SPA) | pbs-optimization-report |
| | ai-server / po-engine / ro-engine / crewrule-dev / data-migration / pbs-app |

> `pbs-engine` 发布链已暂停：SIT solver 使用 `RO_SOLVER_DIR=/home/recovery/PBS_column_based_algorithm-main`（若该路径在 10.15.11.3 上预装）；未预装则把 `engine-server.env` 中的 solver 相关变量注释掉，避免 engine-server 启动失败。

## 1. 两层配置

| 层 | 位置 | 谁维护 | auto-deploy / deploy.sh |
|----|------|--------|-------------------------|
| **模板** | 仓库 `engine-server/config.yaml` 等 | 开发（结构 + `${ENV}`） | **可覆盖** |
| **环境私有** | PortalServer `/home/recovery/sit/env/*.env` | 运维 / 首次 setup | **永不覆盖** |

```
仓库 engine-server/config.yaml     →  模板（可 rsync）
         │  secret: "${JWT_SECRET}"
         ▼
sit/env/engine-server.env          →  真值（唯一密钥源）★
         │
         ▼
service.sh load_env + 校验 → engine-server 进程
```

## 2. 覆盖边界（硬规则）

### 可被推送 / 覆盖

- `engine-server` 源码、`requirements.txt`、**模板** `config.yaml`
- `live-server/dist`、`live-server/scripts/`（独立 .mjs 脚本，不在 dist/ 里）
- `packages/shared-rules/` / `contracts/` / `saml/` / `legality-messages/`（live-server 运行时依赖）
- `rule-engine-rs/target/release/*`（Rust 法规二进制）
- `service.sh`（脚本本身）
- 本机 gantt 静态资源（WebServer `/home/recovery/sit/gantt/`）

### 永不覆盖

| 路径 | 说明 |
|------|------|
| `$PORTAL_DEV/env/*` | 全部 `*.env` 与备份 |
| `engine-server/venv/` | Python 虚拟环境 |
| `complete/` `workspace/` `finished/` `archive/` `temp/` `logs/` | 运行产物 |
| `config.local.yaml` / `*.local.yaml` | 预留主机覆盖（rsync exclude） |
| `*.bak` / `config.yaml.bak*` | 手工备份 |

`push_engine` **根本不碰** `sit/env/` 目录。

## 3. 运维操作规范

**要做：**

```bash
ssh root@10.15.11.3
vim /home/recovery/sit/env/live-server.env
vim /home/recovery/sit/env/engine-server.env   # JWT_SECRET 必须与 live 相同
bash /home/recovery/sit/service.sh restart engine-server
```

**不要做：**

- 在 SIT 上把真实 `JWT_SECRET` 写进 `engine-server/config.yaml`（下次 `--engine` 会被仓库模板盖掉）
- 把生产/SIT 密码提交进 git 仓库
- 为"先跑起来"关闭 `auth.enabled`

## 4. engine-server 关键 env

见 `deploy/sit/env/engine-server.env.example`。至少：

| 变量 | 要求 |
|------|------|
| `JWT_SECRET` | **与** `live-server.env` **完全相同** |
| `DATABASE_URL` / `SCENARIO_DATABASE_URL` | SIT schema（host = `localhost`） |
| `REDIS_URL` | SIT Redis（`redis://localhost:6379/0`） |
| `LIVE_SERVER_URL` | 通常 `http://localhost:3000` |
| `RO_SOLVER_DIR` / `RO_SOLVER_PYTHON` | 若 10.15.11.3 上预装了 PBS_column_based_algorithm，指向其路径；未预装则注释掉 |
| `RO_RULE_SOURCE` | `pg`（SIT 无 MySQL） |

`config.yaml` 中：

```yaml
auth:
  jwt:
    secret: "${JWT_SECRET}"   # 仅引用，无明文
```

## 5. 启动与部署门禁

| 门禁 | 位置 | 行为 |
|------|------|------|
| 缺 JWT 时继承 live | `service.sh` `ensure_engine_jwt_secret` | 从 `live-server.env` 写入 `engine-server.env` 或拒绝启动 |
| unresolved secret | `engine-server` `config.py` | JWT 开启但 secret 仍是 `${JWT_SECRET}` → **启动失败** |
| 部署后 JWT 探针 | `deploy.sh` `verify_engine_jwt_auth` | 用 live secret 签 JWT 打 `/api/optimize/start`；**401 则 deploy 失败** |

JWT 探针通过标准：HTTP **非 401**（例如 502 scenario not found 也算认证通过）。

### 5.1 LegacyRO / ro_rust 失败常见根因

| 现象 | 根因 | 修复 |
|------|------|------|
| `/optimize/start` 401 | JWT 密钥不一致 / 未注入 | 见上文 env 契约 |
| start 200 后秒 FAILED，`ModuleNotFoundError: ColumnModelSolver_python` | `/home/recovery/PBS_column_based_algorithm-main` 缺源码或 `RO_SOLVER_DIR` 配置错误 | 检查 `engine-server.env` 中的 `RO_SOLVER_DIR` / `RO_SOLVER_PYTHON` |
| start 200 后秒 FAILED，缺 `rois_rule_engine_rs` | solver Python 无法导入 Rust wheel（不在本次部署范围，但若启用 pbs-engine 会触发） | 检查 `/root/miniforge3/envs/flair-pbs-env/bin/python` 的 `rois_rule_engine_rs` 导入 |
| start 200 后约 10s FAILED，`Could not find 'experiments/deploy/prod_0604'` | `RO_EXPERIMENT` 默认路径在 conf 中不存在 | `engine-server.env` 设 `RO_EXPERIMENT=deploy/sit` 并 restart engine |
| cabin 场景秒 FAILED，`pairing_seg_crew_offset_min … length N (crews), got M` | extras 在 rank/type 过滤前按全量机组构建 | `ro_solver_wrapper` 在 `bind_problem` 时按过滤后 `problem.crews` 注入 extras |

SIT solver 源码若启用，预装目录 `/home/recovery/PBS_column_based_algorithm-main`；
旧的 `/home/recovery/sit/pbs-engine` 发布链已暂停。不要把 solver 真密钥写进 solver 仓库。

## 6. 新密钥 / 新配置 checklist

1. 仓库模板只加 `${NEW_VAR}` 或默认 `${NEW_VAR:}`
2. 更新 `deploy/sit/env/<svc>.env.example`
3. **人工**在 PortalServer `sit/env/<svc>.env` 填真值（setup 不会覆盖已有文件）
4. 若为 JWT 类共享密钥：live 与 engine **同一值**
5. `service.sh restart <svc>` 或走 `deploy.sh --engine` 看探针是否绿

## 7. 端到端验收（跑优化 → 入库）

**不要只看 UI "Optimization failed" 或 status=DONE。** DONE 只表示 engine 回调了元数据；`scenario.roster_flight` 是 `saveResult` 里 **异步** `loadResultGzIntoDb` 写入的，必须单独证明。

### 7.1 推荐：Portal 上 shell 全链路（含 SQL）

```bash
# 在 PortalServer，或本机 REMOTE=1 自动 scp+ssh：
REMOTE=1 SCENARIO_ID=622 bash deploy/sit/verify-optimize-e2e.sh

# 只预检（JWT + pbs-engine import，不踢跑）：
REMOTE=1 PREFLIGHT_ONLY=1 bash deploy/sit/verify-optimize-e2e.sh

# 已是 DONE 时只验入库 + gantt-data：
REMOTE=1 SKIP_RUN=1 SCENARIO_ID=619 bash deploy/sit/verify-optimize-e2e.sh
```

脚本阶段：

| Phase | 断言 |
|-------|------|
| 0 preflight | live/engine 可达；JWT 一致；venv import（pbs-engine 未部署则跳过 solver import）|
| 1 run | DRAFT→POST `/api/scenario/:id/run` |
| 2 terminal | status **DONE**（FAILED 则 tail engine log 并失败） |
| 3 DB | `task_id`+`file_path`；轮询 `f8_sit_scenario.roster_flight` 直到有行 |
| 4 API | `gantt-data` crew>0 且 assignments/groundItems>0 |

### 7.2 Playwright（UI Run + 持久化）

```bash
cd e2e && \
  GANTT_BASE_URL=http://localhost/altair \
  GANTT_API_URL=http://localhost \
  SCENARIO_ID=622 SCENARIO_NAME='Copy540 of YVR-FC-Ver1' \
  npx playwright test --config=config/playwright.config.ts --project=gantt \
  tests/gantt/scenario-sit-optimize-persist.spec.ts --reporter=list --no-deps
```

共享 helper：`e2e/utils/gantt/scenario-optimize-persist.ts`（`waitForPersistedGanttData` 等异步入库）。

## 8. 相关路径

| 用途 | 路径 |
|------|------|
| 本契约 | `deploy/sit/CONFIG.md` |
| 部署 | `deploy/sit/deploy.sh` |
| 自动部署 | `deploy/sit/auto-deploy.sh` |
| 启动 | `deploy/sit/service.sh` → Portal `/home/recovery/sit/service.sh` |
| **E2E 验收** | `deploy/sit/verify-optimize-e2e.sh` |
| env 模板 | `deploy/sit/env/*.env.example` |
| 真机 env | `/home/recovery/sit/env/` on `10.15.11.3` |
| 本机 nginx | `/etc/nginx/conf.d/recovery-sit.conf`（仓库源 `deploy/sit/nginx/recovery-sit.conf`） |
| 本机 gantt dist | `/home/recovery/sit/gantt/` |
