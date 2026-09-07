# SIT 部署拓扑重构 + DB 迁移到 10.16.11.18（Design Spec）

## 背景

旧 SIT 部署脚本（`deploy/sit/`）一直按"全量部署"维护：同时管 live-server /
pbs-server / connector-server / engine-server / rule-engine-rs /
pbs-engine solver / gantt / pbs-portal 八条链路，最初运行在
`yuan.z@10.15.12.4` + 共享 CoreServer（10.15.12.3 上的 DB + Redis）。
最近一次环境切换后，实际拓扑又变了两次：

| 时点 | PortalServer | DB + Redis | gantt 前端 |
|------|--------------|------------|------------|
| 历史 | `yuan.z@10.15.12.4` | CoreServer `10.15.12.3`（SSH 隧道） | 同机 |
| 第一版脚本（裁剪版）| `root@10.15.11.3` | 同机 docker (localhost) | 本机 nginx `/altair/` |
| **当前（本次）** | `ecs-user@10.16.11.18` | **同机 docker (localhost)** | 本机 nginx `/altair/` |

本次实际触发的事件：

1. 部署机器从 `root@10.15.11.3`（临时接入）迁到
   **`ecs-user@10.16.11.18`**（专用部署机，ecs-user + sudo NOPASSWD）。
2. **旧 10.15.11.3 上的 `recovery` DB（180 张业务表 / 248 MB /
   3 schema：`dev_live` / `dev_scenario` / `dev_pbs`）冷备 + restore 到
   10.16.11.18**。DB 与服务完全同机，`localhost:5432` / `localhost:6379`
   直连，零 SSH 隧道。
3. 10.15.11.3 在迁移完成后会**关闭**，本机 WebServer 的 nginx 反代
   `/live/` `/engine/` 改指 10.16.11.18:3000/3003。
4. 真实 SIT DB 的 schema 名是 `dev_*`（不是 CLAUDE.md 写的 `f8_sit_*`）
   —— 历史命名遗留。本轮沿用 `dev_*`，CLAUDE.md / docs/architecture/
   一并更新反映现实。

`deploy/sit/` 仓库代码原本是按"10.15.11.3 + 跟 10.15.11.3 localhost
DB"拓扑写的，本轮把它改成"10.16.11.18 + 跟 10.16.11.18 localhost DB"
拓扑，并把 DB 迁移 runbook 落成正式 handoff。

## 目标

- `deploy/sit/` 在新拓扑（10.16.11.18 ecs-user + /home/ecs-user/sit +
  localhost DB/Redis）上可端到端跑通 `setup.sh all` + `deploy.sh --all`。
- 部署范围与 `CLAUDE.md` §Current F8 Engine Scope 对齐：只保留
  live / engine / rule-engine-rs / gantt + 共享 packages；其余链路
  从脚本里整段删除（不是注释开关，不是空 stub）。
- 本机 WebServer 的 nginx 配置进版本控制（`deploy/sit/nginx/
  recovery-sit.conf`），不再依赖运维手维护 conf.d。
- DB 迁移 runbook 落成正式 handoff
  （`docs/handoff/dev-env-setup/2026-09-07-sit-db-migration-runbook.md`），
  让回滚 / 重跑 / 灾备可重现。

## 非目标

- 不恢复 `pbs-server` / `pbs-portal` / `connector-server` 的实际部署——
  业务上不在 F8 交付范围，脚本上不存在了，未来要恢复要重新写 spec。
- 不动 UAT / PROD 部署脚本。
- 不解 `pbs-engine` / `pbs-optimization-report` submodule 的初始化——
  本轮不动 PBS 优化路径，submodule 仍保持未 init 状态。
- **不**把 schema 从 `dev_*` rename 到 `f8_sit_*`——本次只迁不改名；
  后续若要统一命名要单独写 spec。
- 不动 10.15.11.3 上的其它数据（旧机本轮仅作 dump 源，迁移完成后**用户
  手动关闭**；本脚本不主动 shutdown）。

## 关键设计决策

#### D1. 范围裁剪 = "整段删"，不是 "注释掉 / 留 stub"

考虑过的替代方案：
- **方案 A（采纳）：整段删除**。`push_ro_solver` / `verify_pbs_pipeline` /
  `push_pbs_srv` / `push_connector` 等整段从脚本里删掉，对应的 env 文件
  也整文件删除。后续要恢复必须重新写 spec，从干净的代码开始——防止
  历史死代码持续污染。
- **方案 B：保留但用 `if [ 1=0 ]` 注释 / `flag` 开关**。看似更"安全"，
  实际会让脚本体积持续膨胀，并且下次有人看到旧路径时无法区分"已废弃
  但暂留"和"还在用"——CLAUDE.md §Minimal-First 禁止为不可能出现的输入
  写防御性分支，`if [ 1=0 ]` 是这种分支的典型形态。
- **方案 C：抽到 `deploy/legacy/` 子目录保留**。增加维护负担，git history
  里查得到，没有现实收益——脚本就是脚本，不是 SDK。

**选择 A** 的关键依据是 `CLAUDE.md` §Surgical 的精神：不被请求的功能
不写、不被请求的代码不维护。PBS / connector 在 F8 范围外，脚本里的
对应代码就是"不被请求的"。

#### D2. SSH 隧道整段删，不保留"应急恢复"代码

旧脚本每次启动 live-server / pbs-server / connector-server 都建一条
SSH 隧道（10.15.12.4 → 10.15.12.3 暴露 CoreServer 的 Redis）。
新拓扑里 DB+Redis 都在 10.16.11.18 本机 Docker，**没有任何 SSH 隧道需求**。

考虑过的替代方案：
- **方案 A（采纳）：删除 `start_tunnel` / `stop_tunnel` / `CORE_SSH`
  / `TUNNEL_PID_FILE` 等全部隧道代码**。
- **方案 B：用环境变量 `SIT_TUNNEL_ENABLED=1` 控制是否启用隧道**。
  永远不会用到——新拓扑 10.16.11.8 上没有 CoreServer。

**选择 A** 是 §Minimal-First 的直接应用。

#### D3. nginx conf 进仓库，但部署是手动的

考虑过的替代方案：
- **方案 A（采纳）：conf 文件进 `deploy/sit/nginx/recovery-sit.conf`，
  文档明确写"sudo cp + nginx -s reload 手动执行"。**
- **方案 B：在 `setup.sh local` 加一段自动 cp + reload**。自动化很
  诱人，但 root 操作 + nginx 配置文件有可观的"误操作炸服务"风险。
- **方案 C：用 ansible / salt 等配置管理工具**。杀鸡用牛刀。

**选择 A**。

#### D4. 删除三个 env.example，不留模板

`pbs-server.env.example` / `connector-server.env.example` /
`pbs-portal.build.env` 三个文件整体删除，不留 stub。

#### D5. 顺手修 `push_live` 漏写的 `record_pkglock_hash`

旧 `push_live` 在 `npm ci` 成功后**漏**调 `record_pkglock_hash "live-server"`，
导致 `pkglock_changed` 永远为 true、下次部署必然跑一次无谓的
`npm ci --omit=dev`。

#### D6. 远端账号用专用 SSH key + config alias

10.16.11.18 上的 `ecs-user` SSH key 不能用本机已有的 `id_ed25519`
（无 GitHub 权限，且要避免 `id_ed25519` 的 `Permission denied`
污染日志）。考虑过的方案：

- **方案 A（采纳）：生成专用 `~/.ssh/sit_ecs_10_16_11_18` key +
  `~/.ssh/config` 加 `Host sit-db-ecs` 别名 + `IdentitiesOnly yes`。**
- **方案 B：复用 `github_recovery` key**。这把 key 已注册到
  `yuanzhu-ai` GitHub 账号，与 ecs-user@10.16.11.18 无任何关系；
  push 公钥后 `ecs-user` 会拒绝。

**选择 A** 的关键依据：隔离 SSH 身份不混用，故障排错时日志干净。

#### D7. 远端部署路径用 `/home/ecs-user/sit/`，不用 `/home/recovery/sit/`

考虑过的方案：
- **方案 A（采纳）：`/home/ecs-user/sit/`**。ecs-user 自己 home 下的子
  目录，免 sudo 可写；运维侧"归谁所有"一目了然。
- **方案 B：`/home/recovery/sit/`**。与 git 仓库 `recovery` 同名，但
  ecs-user 无写权限（默认 755 root:root），需要 sudo 创建 + chmod；
  后续 service.sh 跑进程用 ecs-user，文件归属不一致会埋坑。

**选择 A**。

#### D8. schema 命名沿用 `dev_*`，本轮不顺手 rename

CLAUDE.md / data-model.md 规范是 `f8_sit_*`，但真实运行的 SIT DB
是 `dev_live` / `dev_scenario` / `dev_pbs`（沿用历史命名）。

考虑过的方案：
- **方案 A（采纳）：沿用 `dev_*`，更新 CLAUDE.md / data-model.md 反映
  现实，最小动作**。
- **方案 B：迁移完成后 ALTER SCHEMA rename 成 `f8_sit_*`**。涉及所有
  env 的 search_path、所有 SQL 文件、所有 seed/migration脚本，**工程
  量远超本次**——CLAUDE.md §Senior Engineering Workflow
  "Detect dead ends early"。
- **方案 C：先把 SIT 停了，rename 再启**。业务连续性不接受。

**选择 A**，并把"未来如果要做 f8_sit_* 统一命名"作为本 spec 的非目标
显式列出，等下次单独做。

#### D9. redis 直接重装，旧 dump 丢弃

10.15.11.3 上的 redis dump.rdb 只有 107 字节（基本空），且 ACL 锁死
无法读取（旧 ACL 配置找不到密码）。

考虑过的方案：
- **方案 A（采纳）：在 10.16.11.18 上起一个新的**无密码** redis，
  BullMQ / cache 冷启**。
- **方案 B：要求用户提供 redis 密码 / ACL 文件**。dump 几乎为空，
  没必要绕这个弯。

**选择 A**。

## 架构

### 当前拓扑（10.16.11.18 单机）

```
                          本机 (WebServer / dev 工作站)
                          ┌────────────────────────────────────────┐
                          │ nginx 1.26.2                            │
                          │   /altair/         → /home/recovery/    │
                          │                       sit/gantt/ (static) │
                          │   /live/  (proxy)  → 10.16.11.18:3000  │
                          │   /engine/ (proxy) → 10.16.11.18:3003  │
                          │                                        │
                          │ cron: */10 * * * * auto-deploy.sh      │
                          │ git repo: ~/dev/recovery                │
                          │ ssh: sit-db-ecs → 10.16.11.18 (ecs-user)│
                          └────────────────────────────────────────┘
                                          │ SSH
                                          ▼
                          PortalServer (10.16.11.18, ecs-user)
                          ┌────────────────────────────────────────┐
                          │ /home/ecs-user/sit/                     │
                          │   live-server/dist/    (Fastify :3000)  │
                          │   live-server/scripts/ (.mjs)           │
                          │   engine-server/       (FastAPI :3003)  │
                          │   rule-engine-rs/target/release/        │
                          │     ruletool + check-* binaries         │
                          │   packages/                             │
                          │     shared-rules / contracts / saml /   │
                          │     legality-messages                   │
                          │   env/                                  │
                          │   logs/ run/                            │
                          │                                        │
                          │ Docker (localhost, ecs-user + sudo)     │
                          │   postgres:17-alpine  :5432             │
                          │     DB = recovery                       │
                          │     schema: dev_live / dev_scenario /   │
                          │              dev_pbs                    │
                          │   redis:7-alpine       :6379            │
                          │     (无密码)                            │
                          └────────────────────────────────────────┘
```

### 服务清单

| 服务 | 端口 | 部署方式 |
|------|------|---------|
| live-server | 3000 | 本机 build dist + rsync + 远程 npm ci + 远程 restart |
| engine-server | 3003 | rsync 源码 + 远程 venv 初始化 + 远程 restart + JWT 探针 |
| rule-engine-rs | (无 HTTP，由 live-server spawn) | 本机 cargo build --release + 远程 rsync binaries |
| gantt | (无 HTTP，本机 nginx 提供 /altair/) | 本机 vite build + 直写 /home/recovery/sit/gantt/ |
| packages/{shared-rules,contracts,saml,legality-messages} | (live-server 运行时 require) | rsync + 远端 npm install @node-saml/node-saml |
| postgres | 5432 | **新端 docker run（已迁）+ restore from 10.15.11.3 dump** |
| redis | 6379 | **新端 docker run（已迁，无密码）** |
| pbs-server | 3002 | ❌ 不部署 |
| pbs-portal | (本机 nginx) | ❌ 不部署 |
| connector-server | 3004 | ❌ 不部署 |
| pbs-engine solver | (engine-server 子进程调用) | ❌ 不部署（依赖 ops 预装 + RO_SOLVER_DIR 配置）|

### 部署流程（`deploy.sh --all`）

```
本机 build_live   → 本机 build_gantt  → push_live → push_rust_bins → restart_live
                                  ↓
                            push_gantt (直写本机 /home/recovery/sit/gantt/)
                                  ↓
                            push_engine (rsync 源码 + 初始化 venv)
                                  ↓
                            restart_engine
                                  ↓
                            verify_engine_jwt_auth (远程用 live JWT 签 token 打 /optimize/start)
```

## 改动清单

逐文件改动详情 + diff 摘录见配套 handoff：
`docs/handoff/dev-env-setup/2026-09-07-sit-deploy-topology-slim.md`

DB 迁移具体步骤 + 校验 + 后续清理见配套 runbook：
`docs/handoff/dev-env-setup/2026-09-07-sit-db-migration-runbook.md`

涉及文件：

| 文件 | 处理 |
|------|------|
| `deploy/sit/CONFIG.md` | 改：拓扑表 + 路径 + 范围 |
| `deploy/sit/deploy.sh` | 改：PORTAL/PORTAL_DEV/JWT 探针远端路径 |
| `deploy/sit/auto-deploy.sh` | 改：crontab 路径 + 模块映射 |
| `deploy/sit/setup.sh` | 改：PORTAL/PORTAL_DEV/前置条件 |
| `deploy/sit/service.sh` | 改：DEV_DIR/注释里的 ssh 示例 |
| `deploy/sit/env/live-server.env.example` | 改：DB 名 `rois` → `recovery`，schema `f8_sit_*` → `dev_*` |
| `deploy/sit/env/engine-server.env.example` | 改：DB 名 + schema + RO_SOLVER_DIR 路径换 `/home/ecs-user/` |
| `deploy/sit/env/gantt.build.env` | 改：顶部注释 |
| `deploy/sit/env/pbs-server.env.example` | 删 |
| `deploy/sit/env/connector-server.env.example` | 删 |
| `deploy/sit/env/pbs-portal.build.env` | 删 |
| `deploy/sit/nginx/recovery-sit.conf` | **新增 + 改**：本机 nginx 1.26.2 server block；反代目标 `10.15.11.3` → `10.16.11.18` |
| `.gitmodules` | 改：rule-engine-rs URL https→git@ |

## 风险

| 风险 | 缓解 |
|------|------|
| 旧 CoreServer（10.15.12.3）/ 旧 10.15.11.3 上的 `recovery` DB 数据丢失 | DB 已 dump 到 `/tmp/recovery-migration.dump.backup.20260907`（本机）+ `/home/ecs-user/recovery-migration.dump`（远端）；schema/row 已双向校验一致 |
| `pbs-engine` / `pbs-optimization-report` submodule 未 init，未来误用 | runbook + spec 显式列出 + 当前 spec 非目标列出 |
| 老的 `auto-deploy.sh` cron 路径 `/home/yuan.z/rois/...` 没改成 `/home/yuan.z/dev/recovery/...` | 已知陷阱；本轮脚本已是新路径 |
| `recovery-sit.conf` 没自动部署到 nginx（仍需手动 sudo cp）| 验证清单第 2 步 + 已知陷阱；spec D3 决策不自动化 |
| 旧脚本的 `record_pkglock_hash "live-server"` 缺失被误判为新功能删除 | spec D5 + handoff 注意事项 |
| 10.16.11.18 ecs-user 的 ssh key (`~/.ssh/sit_ecs_10_16_11_18.pub`) 被另一台机器拿走 | 公钥已 `ssh-copy-id` 推到 `ecs-user@10.16.11.18`，可重做；本机是唯一持有人 |
| 10.15.11.3 上的 docker postgres 容器未停止 / 未删，可能与 10.16.11.18 数据漂移 | 迁移完成 = 旧端只读，10.15.11.3 关闭后无漂移风险；具体清理见 handoff §10 |
| schema 名 `dev_*` 与 CLAUDE.md 规范 `f8_sit_*` 长期不一致 | spec D8 + CLAUDE.md / data-model.md 待更新（独立工作） |

## 回滚

git 单 commit 全量改，回滚就是 `git revert` 那个 commit：

```bash
git revert <commit-sha>           # 创建反向 commit
# 或
git reset --hard <prev-commit-sha> # 直接回退到上次提交（仅在 commit 还没推时）
```

DB 单独回滚（旧端还在时）：
1. 停 10.16.11.18 上所有依赖 DB 的服务（live-server / engine-server）
2. `docker exec postgres pg_dumpall ... > 10.16.11.18.dump` 留底
3. 旧 10.15.11.3 上的 `recovery` DB 仍可用（10.15.11.3 关闭前）
4. 重新把 env 改回 `localhost:5432/rois`、`f8_sit_*` schema
5. nginx 反代改回 `10.15.11.3`

## 验证

- **部署验证**：见 handoff "验证清单"（7 步：子模块 → 远端目录 → nginx
  → setup → 填 env → --all → 浏览器）。
- **DB 迁移验证**：见 runbook "B3 校验"（表数 + sample row count 对比，
  两边完全一致即通过）。
- **结构验证**：
  ```bash
  bash -n deploy/sit/deploy.sh
  bash -n deploy/sit/auto-deploy.sh
  bash -n deploy/sit/setup.sh
  bash -n deploy/sit/service.sh
  ```
  都应无语法错误。
- **nginx 验证**：`sudo nginx -t` 应 `syntax is ok / test is successful`。
- **回归**：跑一次 `live-server` / `engine-server` 全链路 smoke
  （登录 gantt → 打开 Scenario → 看 violation alert center → 跑
  legality recheck）。详见 CLAUDE.md §No-Illusion。

## 关联

- 配套 handoff（逐文件改动 + 验证清单 + 陷阱）：
  `docs/handoff/dev-env-setup/2026-09-07-sit-deploy-topology-slim.md`
- 配套 runbook（DB 迁移具体步骤）：
  `docs/handoff/dev-env-setup/2026-09-07-sit-db-migration-runbook.md`
- 配套 handoff（同 recovery 操作的 submodule SSH 化）：
  `docs/handoff/dev-env-setup/2026-09-07-recovery-submodule-rule-engine-rs.md`
- 项目规范：`CLAUDE.md` §Current F8 Engine Scope
- 项目规范：`CLAUDE.md` §Surgical / §Minimal-First / §No-Auto-Commit