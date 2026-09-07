# SIT 部署拓扑重构 + 服务裁剪 + 主机迁移（2026-09-07，含 10.16.11.18 迁移）

## 背景

旧 SIT 部署脚本（`deploy/sit/`）一直按"全量部署"维护。两次环境切换后，
**实际部署拓扑**：

- PortalServer：`root@10.15.11.3` → **`ecs-user@10.16.11.18`**
- DB + Redis：与 PortalServer 同机 docker（10.16.11.18 localhost）
- 部署目录：`/home/recovery/sit/` → **`/home/ecs-user/sit/`**
- 真实 schema：`dev_live` / `dev_scenario` / `dev_pbs`（不是 CLAUDE.md
  写的 `f8_sit_*`，本轮沿用历史命名）

DB 迁移 + 校验已完成（详见配套 runbook
`docs/handoff/dev-env-setup/2026-09-07-sit-db-migration-runbook.md`）；
本 handoff 记录仓库代码侧（`deploy/sit/`）的所有改动。

## 改动总览

### 拓扑前后对比

| 项 | 旧 SIT | 新 SIT |
|----|--------|--------|
| PortalServer host | `root@10.15.11.3` | `ecs-user@10.16.11.18` |
| 远端部署目录 | `/home/recovery/sit` | `/home/ecs-user/sit` |
| 本机 WebServer 目录 | `/home/recovery/sit`（gantt dist 落点 + nginx 服务）| 同（本机 WebServer 角色不变）|
| 仓库路径（cron / auto-deploy）| `/home/yuan.z/dev/recovery` | 同 |
| PostgreSQL | `localhost:5432/rois`（同机 10.15.11.3 docker）| `localhost:5432/recovery`（同机 10.16.11.18 docker）|
| Redis | `localhost:6379`（同机 10.15.11.3 docker）| `localhost:6379`（同机 10.16.11.18 docker）|
| 前端入口 | `https://crew-f8-usva-sit.roiscloud.com`（由本机 nginx `/altair/` 提供）| 同（本机 nginx 反代目标 10.15.11.3 → 10.16.11.18）|
| 真实 schema 名 | `dev_live` / `dev_scenario` / `dev_pbs` | 同（沿用，CLAUDE.md 待更新）|

### 服务裁剪

| 服务 | 处理 |
|------|------|
| `live-server`（:3000）| ✅ 保留 |
| `engine-server`（:3003）| ✅ 保留 |
| `rule-engine-rs` Rust 法规二进制 | ✅ 保留（live-server 内部 spawn）|
| `gantt`（前端 SPA）| ✅ 保留 |
| `packages/{shared-rules,contracts,saml,legality-messages}` | ✅ 保留 |
| `postgres` / `redis` 容器 | ✅ 已迁（见 runbook）|
| `pbs-server`（:3002）| ❌ 删 |
| `pbs-portal`（前端 SPA）| ❌ 删 |
| `connector-server`（:3004）| ❌ 删 |
| `pbs-engine` solver 发布链 | ❌ 删 |
| `pbs-engine` submodule 同步 | ❌ 删 |
| `setup_webserver`（UAT 迁移逻辑）| ❌ 删 |

---

## 逐文件改动

### `deploy/sit/CONFIG.md`

- 顶部"拓扑"表：PortalServer 行 `root@10.15.11.3` →
  `ecs-user@10.16.11.18`；DB / Redis 行 host `localhost` 不变（同机
  仍然走 localhost）。
- 第 1 节"两层配置"环境私有路径：`/home/recovery/sit/env` →
  `/home/ecs-user/sit/env`。
- 第 2 节"可被推送 / 覆盖"列表精简：去掉 `pbs-server/dist` /
  `connector-server/dist`，加 `live-server/scripts/`、`packages/{contracts,
  saml,legality-messages}`、`rule-engine-rs/target/release/*`。
- 第 3 节"环境私有配置"所有 vim 路径改成 `/home/ecs-user/sit/env/`。
- 第 4 节 engine-server env 表 DB/Redis URL 已是 localhost（不变）；
  `RO_SOLVER_DIR` / `RO_SOLVER_PYTHON` 注释里"预装在 10.15.11.3"改成
  "预装在 10.16.11.18"。
- 第 5 节 JWT 探针表删除 `solver 源码完整性` / `solver import 探针` 两行
  （pbs-engine 不再由本脚本部署）。
- 第 6 节故障排查表第 2/3 行的 solver 错误路径从 `/home/recovery/` 改成
  `/home/ecs-user/`。
- 第 7 节 E2E 配置示例 `GANTT_BASE_URL` / `GANTT_API_URL` 用本机
  `http://localhost/altair` + `http://localhost`（不变，因为本机 nginx
  反代目标已改 10.16.11.18）。
- 第 8 节附录：真机 env 路径 `/home/ecs-user/sit/env/` on 10.16.11.18；
  本机 nginx 路径 `/etc/nginx/conf.d/recovery-sit.conf`；
  本机 gantt dist `/home/recovery/sit/gantt/`/`。

### `deploy/sit/deploy.sh`

- 顶部架构注释：PortalServer `root@10.15.11.3` →
  `ecs-user@10.16.11.18`（含"sudo NOPASSWD"提示）；删除"DB + Redis 在
  Docker 中通过 localhost 暴露"那句，改为"全部跑在该机；无 SSH 隧道"。
- `PORTAL="root@10.15.11.3"` → `PORTAL="ecs-user@10.16.11.18"`
- `PORTAL_DEV="/home/recovery/sit"` → `PORTAL_DEV="/home/ecs-user/sit"`
- `LOCAL_WEB_DEV="/home/recovery/sit"` **保持不变**（本机 WebServer
  gantt 落点，不归远端）
- `verify_engine_jwt_auth` 内嵌的远端 SSH bash：
  - `ENV_DIR=/home/recovery/sit/env` → `/home/ecs-user/sit/env`
  - `PY=/home/recovery/sit/engine-server/venv/bin/python3` →
    `/home/ecs-user/sit/engine-server/venv/bin/python3`
  - `read_secret("/home/recovery/sit/env/live-server.env")` →
    `/home/ecs-user/sit/env/live-server.env`
- 删除整个 ro-engine PBS solver 段（约 230 行）：
  `solver_hash` / `solver_changed` / `mark_solver_synced` /
  `rust_wheel_changed` / `ensure_rule_engine_rs_submodule_ssh` /
  `ensure_local_maturin` / `remote_solver_source_ok` /
  `verify_remote_solver_imports` / `ensure_local_pbs_engine` /
  `push_ro_solver`。
- 新增独立段 "rule-engine-rs（Rust 法规二进制）"：从原 ro-solver 段
  移过来的 `rust_bins_hash` / `rust_bins_changed` / `mark_rust_bins_synced`。
  `push_rust_bins` 内删除 `ensure_rule_engine_rs_submodule_ssh` 调用和
  `source "$HOME/.cargo/env"`（cargo 直接可用）。
- 删除整个 `pbs-server` / `connector-server` / `pbs-portal` 段（约 160 行）。
- `push_engine` 中 rsync 加 `|| true` 容错；在 rsync 之前
  `mkdir -p '$PORTAL_DEV/engine-server/F8/tzdata'`。
- 删除 `verify_pbs_pipeline` 段（pbs-engine 不再部署）。
- `push_gantt` 顶部加注释"gantt dist 写到本机，由本地 nginx 提供
  /altair/"。
- `sync_version_tmp` 内 Python print 行去掉 PBS 后端/前端计数（pbs 不再
  部署）。
- 解析参数 / `--all` / 执行流水线删除对应分支。

### `deploy/sit/auto-deploy.sh`

- 顶部注释：仓库路径 `/home/yuan.z/dev/recovery`（不变）；模块映射表
  删除 `--pbs-srv / --connector / --pbs-ui`，加 `packages/{shared-rules,
  contracts,saml,legality-messages}` 跟随 `--live` 推送。
- 新增"本次范围外（不部署，仅静默 pull）"清单。
- `set_need_from_arg` / `build_deploy_args` 精简。
- `submodule_marker_ok` / `update_submodules` 删除 `pbs-engine` 相关。
- 文件级 diff 匹配表精简：`packages/ui/*` 只触发 `--gantt`；
  新增 `packages/{shared-rules,contracts,saml,legality-messages}/*`
  全部触发 `--live`；`pbs-*` 全部移到"不触发部署"分支。

### `deploy/sit/setup.sh`

- 顶部注释整体改写：远端 `ecs-user@10.16.11.18`、远端目录
  `/home/ecs-user/sit`、本机目录 `/home/recovery/sit`（gantt 落点）。
- 前置条件：`ssh-copy-id` 提示从 `root@10.15.11.3` →
  `ecs-user@10.16.11.18`（具体执行：`ssh-copy-id -i
  ~/.ssh/sit_ecs_10_16_11_18.pub ecs-user@10.16.11.18`，专用 key
  已在本机 `~/.ssh/sit_ecs_10_16_11_18`）。
- `PORTAL="root@10.15.11.3"` → `PORTAL="ecs-user@10.16.11.18"`
- `PORTAL_DEV="/home/recovery/sit"` → `PORTAL_DEV="/home/ecs-user/sit"`
- `LOCAL_ROIS="/home/recovery/sit"` **保持不变**（本机路径）。
- 删除 `setup_webserver` 函数（旧版 UAT 迁移逻辑）。
- `setup_local` 创建目录列表只保留 `gantt`（pbs-portal 不再部署）。
- `setup_portal` mkdir 列表精简（去 pbs-server/dist / connector-server/dist）。
- 主逻辑 case 删除 `webserver` 分支。

### `deploy/sit/service.sh`

- 顶部注释：`DEV_DIR` 改 `/home/ecs-user/sit`；用法说明删
  `pbs-server` / `connector-server`；明确"DB + Redis 与本服务同机
  （10.16.11.18 本机 Docker），通过 localhost 暴露"。
- `service_port` 函数删除 `pbs-server` / `connector-server` 两条 case。
- `ensure_engine_jwt_secret` 占位符识别列表新增
  `replace-with-32-plus-char-random-secret`（与新 `live-server.env.example`
  对齐）。
- 删除整个 SSH 隧道段（约 50 行）：`CORE_SSH` / `TUNNEL_PID_FILE` /
  `TUNNEL_LOCAL_REDIS_PORT` / `start_tunnel` / `stop_tunnel`。
- 删除 `start_pbs_server` / `start_connector_server` 两个函数。
- `start_live_server` 删除 `start_tunnel` 调用。
- `show_status` 表删除 `pbs-server` / `connector-server` 行；
  `SERVICES` 数组精简。

### `deploy/sit/env/live-server.env.example`

- 顶部改写：PortalServer host `ecs-user@10.16.11.18`；复制路径
  `/home/ecs-user/sit/env/live-server.env`。
- `DATABASE_URL`：DB 名 `rois` → `recovery`，search_path `f8_sit_live` →
  `dev_live`。
- `LIVE_SCHEMA=f8_sit_live` → `dev_live`
- `SCENARIO_SCHEMA=f8_sit_scenario` → `dev_scenario`
- `PBS_SCHEMA=f8_sit_pbs` → `dev_pbs`
- 注释明确说明：`dev_*` 是实际运行的 schema（与 `CLAUDE.md`
  `f8_sit_*` 规范不一致，docs/architecture/data-model.md 待更新）。

### `deploy/sit/env/engine-server.env.example`

- 顶部改写：PortalServer host `ecs-user@10.16.11.18`；复制路径
  `/home/ecs-user/sit/env/engine-server.env`。
- `DATABASE_URL`：DB 名 `rois` → `recovery`，search_path
  `f8_sit_live` → `dev_live`。
- `SCENARIO_DATABASE_URL`：DB 名 `rois` → `recovery`，search_path
  `f8_sit_scenario` → `dev_scenario`。
- `RO_CONVERTER_PYTHON`：`/home/recovery/sit/engine-server/venv/bin/python`
  → `/home/ecs-user/sit/engine-server/venv/bin/python`
- `RO_SOLVER_DIR` / `RO_SOLVER_PYTHON` / `PBS_PIPELINE_SCRIPT` 路径
  `/home/recovery/` → `/home/ecs-user/`（按 ops 在 10.16.11.18 上
  预装的实际位置）。
- `LEGACY_RO_DB_URL`：DB 名 + search_path 同上。
- `PBS_SERVER_URL` / `PBS_ADMIN_USER` / `PBS_ADMIN_PASSWORD` 整段注释掉
  （pbs-server 不部署）。

### `deploy/sit/env/gantt.build.env`

- 顶部注释更新：本机构建 + 直写 `/home/recovery/sit/gantt/` + 本机 nginx
  `/altair/` 提供（见 `deploy/sit/nginx/recovery-sit.conf`）。

### 删除的 env 模板

| 文件 | 处理 |
|------|------|
| `deploy/sit/env/pbs-server.env.example` | 整文件删除 |
| `deploy/sit/env/connector-server.env.example` | 整文件删除 |
| `deploy/sit/env/pbs-portal.build.env` | 整文件删除 |

### `deploy/sit/nginx/recovery-sit.conf`（101 行）

- 顶部拓扑注释：PortalServer `root@10.15.11.3` → `ecs-user@10.16.11.18`
  + sudo NOPASSWD；服务 + DB + Redis 全部在该机。
- 部署范围注释：加 "postgres + redis（全部在 10.16.11.18）"。
- 反代 `/live/` `proxy_pass http://10.15.11.3:3000/` →
  `http://10.16.11.18:3000/`。
- 反代 `/engine/` `proxy_pass http://10.15.11.3:3003/` →
  `http://10.16.11.18:3003/`。
- 其他（gantt SPA 配置 + CSP + WebSocket + TLS 模板）不变。

> 部署步骤（在本机手动执行一次）：
>
> ```bash
> sudo cp deploy/sit/nginx/recovery-sit.conf /etc/nginx/conf.d/recovery-sit.conf
> sudo nginx -t && sudo nginx -s reload
> ```

### `.gitmodules`

`rule-engine-rs` URL 从 `https://github.com/yuanzhu-ai/rois-rule-engine-rs.git`
改为 `git@github.com:yuanzhu-ai/rois-rule-engine-rs.git`（详见
`docs/handoff/dev-env-setup/2026-09-07-recovery-submodule-rule-engine-rs.md`）。

---

## 验证清单（部署到 10.16.11.18 后逐项跑）

```bash
# 0. 本机 SSH + 免密
ssh -T sit-db-ecs            # 应免密登入 10.16.11.18

# 1. 远端 docker / 容器状态
ssh sit-db-ecs "sudo docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'"
# 期望：postgres Up (DB=recovery) + redis Up（无密码）

# 2. 远端 DB schema 校验（已迁）
ssh sit-db-ecs "sudo docker exec postgres psql -U postgres -d recovery -c '\\dn'"
# 期望：dev_live / dev_scenario / dev_pbs / public

# 3. 本机 nginx
sudo cp deploy/sit/nginx/recovery-sit.conf /etc/nginx/conf.d/recovery-sit.conf
sudo nginx -t && sudo nginx -s reload
curl -sI http://localhost/altair/ | head -1     # 期望 200

# 4. 一次性初始化（portal 创建目录 + 推 env 模板；local 配 crontab）
bash deploy/sit/setup.sh all

# 5. 手填真值（密码不在文档里）
ssh sit-db-ecs "vim /home/ecs-user/sit/env/live-server.env"      # JWT_SECRET=$(openssl rand -base64 48)
ssh sit-db-ecs "vim /home/ecs-user/sit/env/engine-server.env"    # 与 live 相同

# 6. 全量部署 + JWT 探针
bash deploy/sit/deploy.sh --all
# 期望日志：JWT 探针 OK:xxx（任何非 401 状态都算通过）

# 7. 服务状态
ssh sit-db-ecs "bash /home/ecs-user/sit/service.sh status"
# 期望：live-server running / engine-server running，无 pbs/connector 行

# 8. 浏览器
xdg-open http://localhost/altair/   # 或 https://crew-f8-usva-sit.roiscloud.com/altair/
```

---

## 注意事项 / 已知陷阱

- **`record_pkglock_hash "live-server"` 是顺带修的旧 bug**，之前 live-server
  lock 哈希从未被记录，导致 `pkglock_changed` 永远为 true，下次部署会无谓
  跑 `npm ci`。**不要**误把这个补回删除。
- **`/home/recovery/sit/` 是本机 WebServer 路径**，仅用于 gantt dist 落点
  + nginx 服务，**不归远端 ecs-user 管**。deploy.sh / setup.sh 里所有
  `LOCAL_WEB_DEV` / `LOCAL_ROIS` 都保留这个值；只有 `PORTAL_DEV` /
  `DEV_DIR`（ecs-user 远端 home 子目录）改成 `/home/ecs-user/sit/`。
- **DB / Redis 已在 10.16.11.18 上**（见 runbook）。新端容器密码已
  通过 env-file 注入并立即删除 env-file，密码仅活在 `docker inspect`
  输出中；如需 rotate，见 `docs/handoff/dev-env-setup/2026-09-07-sit-db-
  migration-runbook.md` §回滚 / rotate。
- **`pbs-engine` / `pbs-optimization-report` 两个 submodule 仍未 init**：
  本轮不在范围。
- **`recovery-sit.conf` 没有自动部署**：上面"验证清单 §3"必须手动
  `sudo cp`，没有脚本替。
- **`auto-deploy.sh` cron 必须用本机路径**：
  `*/10 * * * * /home/yuan.z/dev/recovery/deploy/sit/auto-deploy.sh`；
  `setup.sh local` 段会处理。
- **`CORS_ORIGIN` 必须等于浏览器实际访问的 origin**：本机访问
  `http://localhost` / 域名访问 `https://crew-f8-usva-sit.roiscloud.com`
  二选一；不能写错。
- **ecs-user 是非 root**：所有远端命令以 ecs-user 身份执行；
  `docker` 命令需要 `sudo` 包装（`docker` 组只对新建 session 生效，
  当前 ssh session 没刷新组权限）。deploy.sh 内**没有**起 docker
  容器的步骤（容器由 ops 起 + 本 runbook 已起），所以脚本本身不需
  sudo；只有人工 `docker exec` / `docker logs` 时需 `sudo`。
- **10.16.11.18 上的 git 仓库**：本轮没在 10.16.11.18 上 clone git
  仓库（`deploy.sh` 是本机跑的，远端只需要接收 dist 产物）。如果
  未来要在远端跑 build，需要 `git clone git@github.com:yuanzhu-ai/
  rois-rule-engine-rs.git` 等操作，复用本机 `github_recovery` key。

---

## 关联

- 配套 spec：`docs/superpowers/specs/2026-09-07-sit-deploy-topology-slim-design.md`
- 配套 runbook（DB 迁移具体步骤 + 校验 + 后续清理）：
  `docs/handoff/dev-env-setup/2026-09-07-sit-db-migration-runbook.md`
- 配套 handoff（同 recovery 操作的 submodule SSH 化）：
  `docs/handoff/dev-env-setup/2026-09-07-recovery-submodule-rule-engine-rs.md`
- 项目规范：`CLAUDE.md` §Current F8 Engine Scope / §Surgical /
  §Minimal-First / §No-Auto-Commit

## 本次范围外（不处理）

- `pbs-server` / `pbs-portal` / `connector-server` / `pbs-engine` 的实际
  服务恢复与 SIT 部署——业务上不在 F8 交付范围。
- 任何 UAT / PROD 部署脚本改动——本轮只动 SIT。
- `auto-deploy.sh` 的 WebServer-nginx reload 自动化——见上文"已知陷阱"。
- `dev_*` → `f8_sit_*` schema rename——见 spec D8，独立工作。
- CLAUDE.md / `docs/architecture/data-model.md` 关于 schema 名的
  更新——本轮沿用历史命名，文档侧独立任务。