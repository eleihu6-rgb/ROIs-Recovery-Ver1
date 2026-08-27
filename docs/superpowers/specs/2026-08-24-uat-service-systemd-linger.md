# UAT 后端服务进程托管：迁移到 systemd user unit + linger

| 字段 | 值 |
| --- | --- |
| Spec ID | `2026-08-24-uat-service-systemd-linger` |
| 日期 | 2026-08-24 |
| 状态 | Draft (待评审) |
| 作者 | Codex (MiniMax-M3) |
| 触发事件 | 2026-08-24 06:53 UTC UAT `live-server` 在 SSH 登出后被 systemd user slice SIGKILL |
| 范围 | `/home/rois/uat/` 下四个服务：`live-server`、`pbs-server`、`engine-server`、`connector-server` |
| 主机 | `coreserver-01`（UAT 部署目标） |

## 1. 背景

### 1.1 故障时间线（已确认）

- `2026-08-21 20:42–20:43` — 用户 `yuan.z` 从 `10.15.12.2` 通过 SSH 登入，开了一连串短暂会话（典型的 `service.sh start` 调试重试）
- `2026-08-21 20:44:12` — SSH session 7904 开启
- `2026-08-21 20:44:13` — `live-server` pid 2916490 启动，版本行 `Ver:B2371/F3103/R40 @d9e3ce02`
- `2026-08-21 20:44:14` — SSH 客户端断开，但 session 7904 scope 仍然存活（因为 `nohup` 的 node 子进程被挂在 user manager 下面）
- `2026-08-21 20:44:14` → `2026-08-24 06:53:39` — live-server 正常运行 2 天 10 小时，期间无任何 `level:50/60` 异常
- `2026-08-24 06:53:39.611` — 最后一条日志（`WS client subscribed`），此后 3 秒内无任何输出
- `2026-08-24 06:53:42` — journald 记录：
  - `session-7904.scope: Deactivated successfully.`
  - `session-7904.scope: Consumed 10min 2.927s CPU time.`
  - `systemd-logind[986]: Removed session 7904.`
- `2026-08-24 06:59:34` — 用户 `yuan.z` 重新 SSH 登入，发现服务挂了；当天 09:00 左右用户触发 Codex 排查

### 1.2 根因

`/home/rois/uat/service.sh` 的四个 `start_*` 全部使用如下模式：

```bash
nohup node dist/index.js >> "$LOG_DIR/live-server.log" 2>&1 &
save_pid "live-server"
```

两个根本性缺陷：

1. **进程没有脱离 SSH session 的 cgroup**。`nohup` 只屏蔽 SIGHUP，并不会把进程从 `user@1000.service` / `session-XXXX.scope` 移走。子进程只是 detach 出当前 shell 的进程组，仍是 user slice 的成员。
2. **没有 linger**。`loginctl show-user yuan.z` 输出 `Linger=no`。一旦 logind 决定该 scope 已无活动（session 7904 持有 nohup 子进程维持 scope 存活，但 logind 仍按 idle 回收策略关掉它），整个 scope 被 SIGKILL，所有挂在它下面的进程全部消失。

进程被 SIGKILL 时来不及写任何 shutdown 日志，所以日志在最后一条 `WS client subscribed` 戛然而止 — 这正是「no trace」症状的来源。

### 1.3 现有架构约束（必须保留）

| 约束 | 来源 |
| --- | --- |
| 部署产物位于 `/home/rois/uat/`，不在 git 仓库里 | `service.sh` 顶部注释 |
| 私有环境配置在 `/home/rois/uat/env/*.env`，deploy 永不覆盖 | `service.sh` 顶部注释 |
| Redis 是 `localhost:6379`，UAT 不走 SSH 隧道 | `service.sh` 顶部注释 |
| 服务以 `yuan.z` 用户运行（不是 root） | `/home/rois/uat` 全部 644/755，owner `yuan.z` |
| 端口固定：3000 / 3002 / 3003 / 3004 | `service.sh` `service_port()` |
| 日志追加到 `$LOG_DIR/<svc>.log`（无 logrotate） | `service.sh` 启动行 |
| pid 文件在 `/home/rois/uat/run/<svc>.pid` | `service.sh` `pid_file()` |
| 现有运维入口 `service.sh {start,stop,restart,status,logs} [all\|<svc>]` 不可被破坏 | `/home/rois/redeploy-report.sh` 链路 |

## 2. 目标

| # | 目标 | 验收 |
| --- | --- | --- |
| G1 | UAT 四个后端服务不依赖任何 SSH session 存活 | 用户登出后再登入，服务仍在 `systemctl --user status uat-*.service` 报 active |
| G2 | 单个服务崩溃后自动拉起，但部署期主动 stop / restart 不会被自动覆盖 | `Restart=on-failure` + 主动 stop 退出码 143 不触发 on-failure（见 §4.5） |
| G3 | 现有 `service.sh` 入口的语义和输出对用户保持兼容 | `service.sh start\|stop\|status\|logs` 行为不变 |
| G4 | pid 文件、运行目录、日志路径不变 | `run/<svc>.pid`、`logs/<svc>.log` 继续被写入 |
| G5 | 部署流程（`redeploy-report.sh` / `deploy.sh`）无需感知改动 | 部署脚本继续走 `service.sh restart <svc>` |
| G6 | 故障可定位：每个服务有独立的 journald 流，与现有 `logs/<svc>.log` 并存 | `journalctl --user -u uat-live-server` 可读最近 7 天；`tail -f logs/live-server.log` 继续工作 |
| G7 | 不引入新端口、不改环境变量名、不动 `.env` | UAT 用户侧 SSO/JWT/数据库连接零变更 |

## 3. 非目标

- 不改 deploy 脚本的产物结构（`/home/rois/uat/<svc>/dist/` 不动）
- 不引入 `tmux` / `screen` / `forever` / `pm2` 这类用户态进程监管
- 不做 logrotate（沿用现有 append 模式）
- 不改 `.env` 内容
- 不动 dev / SIT 环境的 `service.sh`（只改 UAT 这台机器）
- 不为这次改动新加任何 npm 依赖
- 不上 Prometheus / metrics（live-server 已有 §live-server-perf 路线，本次不交叉）

## 4. 设计

### 4.1 总体模型

把每个服务的进程交给 `systemd --user` 管：

- 启用 `loginctl enable-linger yuan.z`，让 user manager 在没有 SSH session 时也活着（修掉根因的关键）
- 为四个服务分别写一个 `~/.config/systemd/user/uat-<svc>.service` 单元
- `service.sh` 的 `start_*` 改成 `systemctl --user start uat-<svc>.service`，并把 unit 自己的 pid 通过 `MainPID=$(systemctl --user show -p MainPID --value uat-<svc>.service)` 写回 `run/<svc>.pid` 以保持兼容
- `stop_*` / `restart_one` 同样走 `systemctl --user stop` / `restart`
- `status_all` 同时报告 unit state 和 pid
- `logs` 仍然 `tail -50 logs/<svc>.log`（不切到 journald，避免破坏既有排障路径）
- 兜底：`have_user_unit` 返回 false 时走原 `nohup` 逻辑（首次部署、单元文件未就位）

### 4.2 单元文件

#### 4.2.1 `~/.config/systemd/user/uat-live-server.service`

```ini
[Unit]
Description=UAT live-server (Fastify, port 3000)
Documentation=https://crew-f8-usva-uat.roiscloud.com
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/rois/uat/live-server
EnvironmentFile=/home/rois/uat/env/live-server.env
ExecStart=/usr/bin/env node dist/index.js
Restart=on-failure
RestartSec=5s
TimeoutStopSec=30s
KillMode=mixed
KillSignal=SIGTERM
SuccessExitStatus=0
StandardOutput=append:/home/rois/uat/logs/live-server.log
StandardError=append:/home/rois/uat/logs/live-server.log

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=read-only
ReadWritePaths=/home/rois/uat/logs /home/rois/uat/run

[Install]
WantedBy=default.target
```

**设计选择**：

- `Type=simple`：Node 没有 fork，`MainPID` 就是它自己；不用 `Type=forking` + `PIDFile=`
- `EnvironmentFile=`：复用现有 `env/live-server.env`，不动文件内容
- `StandardOutput/StandardError=append:`：让 unit 把 stdout/stderr append 到 `logs/<svc>.log`，与现有 `>>` 行为完全等价；`tail -f` 路径不变
- `KillMode=mixed` + `KillSignal=SIGTERM` + `TimeoutStopSec=30s`：给 Node 30s 跑完 `beforeExit` 钩子，超时再 SIGKILL；`mixed` 保证子进程（bullmq workers、Redis client）也能收到 SIGTERM
- `Restart=on-failure`：只在非 0 退出才拉起；用户主动 `stop` 不会触发
- `ProtectHome=read-only` + `ReadWritePaths=/home/rois/uat/logs /home/rois/uat/run`：node 运行期只写 `logs/` 和 `run/`，其他用户家目录只读
- `WantedBy=default.target`：linger 之后 session 断了 unit 仍在

#### 4.2.2 其它三个单元（差异部分）

| 字段 | `uat-pbs-server` | `uat-engine-server` | `uat-connector-server` |
| --- | --- | --- | --- |
| Description | UAT pbs-server (Fastify, port 3002) | UAT engine-server (FastAPI/uvicorn, port 3003) | UAT connector-server (Fastify, port 3004) |
| WorkingDirectory | `/home/rois/uat/pbs-server` | `/home/rois/uat/engine-server` | `/home/rois/uat/connector-server` |
| EnvironmentFile | `/home/rois/uat/env/pbs-server.env` | `/home/rois/uat/env/engine-server.env` | `/home/rois/uat/env/connector-server.env` |
| ExecStart | `/usr/bin/env node dist/index.js` | `/home/rois/uat/engine-server/.venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 3003` | `/usr/bin/env node dist/index.js` |
| RestartSec | 5s | 10s（uvicorn 启动稍重） | 5s |

`engine-server` 的 venv 路径沿用 `service.sh` 既有的 `engine-server/.venv/bin/python`，与 `engine-server/scripts/deploy.sh` 的部署约定一致。

### 4.3 `service.sh` 改动

只在 4 个 `start_*` + `stop_one` + `restart_one` + `status_all` 函数体内替换实现，外层 `case` 不动，调用方零感知。新增 `have_user_unit()` 探活。

```bash
have_user_unit() {
    local name="$1"; local unit="uat-${name}.service"
    systemctl --user -q is-enabled "$unit" 2>/dev/null
}

# start_live_server 重写示例（其它三个同样改）
start_live_server() {
    local name="live-server" unit="uat-${name}.service" port=3000
    if have_user_unit "$name"; then
        log "通过 systemd user unit 启动 $name..."
        systemctl --user start "$unit" || { err "$unit start 失败"; return 1; }
        local i=0 pid
        while [ $i -lt 30 ]; do
            if ss -lptn "sport = :$port" 2>/dev/null | grep -q ":$port"; then
                pid=$(systemctl --user show -p MainPID --value "$unit")
                echo "$pid" > "$(pid_file "$name")"
                ok "$name 已启动 (pid $pid, port $port)"
                return
            fi
            sleep 0.5; i=$((i + 1))
        done
        err "$name 启动失败，journal: journalctl --user -u $unit -n 50"
        return 1
    fi
    # 兜底：原 nohup 逻辑保留
    log "未检测到 $unit，回退到 nohup 启动..."
    # ……原有代码……
}
```

`status_all` 在 unit 模式下加 `(systemd)` 后缀：

```
[2026-08-24 10:00:00] live-server: active (running) pid 12345, port 3000 (systemd)
[2026-08-24 10:00:00] pbs-server:  active (running) pid 12346, port 3002 (systemd)
[2026-08-24 10:00:00] engine-server: inactive (dead) since ...
```

### 4.4 Linger 启用

```bash
sudo loginctl enable-linger yuan.z
```

幂等：重复执行无副作用。`loginctl show-user yuan.z | grep Linger` 之后会显示 `Linger=yes`。

### 4.5 部署期用户主动 stop 的语义

`Restart=on-failure` 的 systemd 行为：

- 进程退出码 ∈ {0, SIGTERM(15), SIGHUP(1)} 且 `SuccessExitStatus=0` → 不重启
- `systemctl --user stop uat-live-server.service` 发 SIGTERM → 进程退出码 143 → **不触发** `on-failure`
- 进程被 OOM SIGKILL（退出码 137） → 触发 `on-failure` → 5s 后拉起 ✓
- 进程因 `uncaughtException` 退出码 1 → 触发 `on-failure` → 5s 后拉起 ✓

正好满足 G2：崩溃自动拉起，主动 stop 不被覆盖。

### 4.6 失败回滚

如果上线后 systemd unit 有问题：

```bash
sudo loginctl disable-linger yuan.z
systemctl --user disable --now uat-live-server.service
# service.sh 内部 fallback 仍能跑（have_user_unit 返回非零 → 走 nohup 兜底）
```

不需要回滚代码，因为兜底分支一直存在。

## 5. 验证计划

| 阶段 | 命令 | 通过条件 |
| --- | --- | --- |
| 单元加载 | `systemctl --user daemon-reload && systemctl --user list-unit-files uat-*.service` | 4 个 unit 全部 `enabled` |
| 单元语法 | `systemd-analyze verify ~/.config/systemd/user/uat-*.service` | 零 warning / 零 error |
| Linger | `loginctl show-user yuan.z \| grep Linger` | `Linger=yes` |
| 启动 | `bash /home/rois/uat/service.sh restart all` | 4 个服务 `active (running)`，`ss -tlnp` 看到 3000/3002/3003/3004 端口 |
| 端到端登录保持 | 用户 SSH 登入后 `exit` → 等 10s → `ss -tlnp \| grep -E ':3000\|:3002\|:3003\|:3004'` | 四个端口仍然 LISTEN |
| 模拟 SSH slice 回收 | `sudo loginctl kill-user yuan.z` 或等 24h 自然触发 | 服务保持运行（这正是要修的 bug） |
| 进程崩溃自动拉起 | `kill -9 $(systemctl --user show -p MainPID --value uat-live-server.service)` | 5s 内 `MainPID` 变更，`status` 报 `active (running)` |
| 主动 stop 不被拉起 | `bash /home/rois/uat/service.sh stop live-server` | 5s 后仍 `inactive (dead)`，无 `activating` |
| `service.sh` 兼容 | `bash /home/rois/uat/service.sh status` | 输出 `运行中 (pid X, port Y)` / `未运行` |
| 现有运维 | `tail -f /home/rois/uat/logs/live-server.log` | 仍能看到 live-server 的 stdout/stderr append |
| Journal 排障 | `journalctl --user -u uat-live-server -n 200` | 能看到 service start/stop 边界、崩溃前后 200 行 |
| Lint | `bash -n /home/rois/uat/service.sh` | 无语法错误 |

## 6. 文件改动清单

| 文件 | 状态 | 说明 |
| --- | --- | --- |
| `/home/rois/uat/service.sh` | modify | 替换 4 个 `start_*` + `stop_one` + `restart_one` + `status_all`；保留 `logs` / `case` / env 解析；保留 nohup 兜底 |
| `/home/yuan.z/.config/systemd/user/uat-live-server.service` | add | live-server 单元 |
| `/home/yuan.z/.config/systemd/user/uat-pbs-server.service` | add | pbs-server 单元 |
| `/home/yuan.z/.config/systemd/user/uat-engine-server.service` | add | engine-server 单元（uvicorn） |
| `/home/yuan.z/.config/systemd/user/uat-connector-server.service` | add | connector-server 单元 |
| `/home/rois/uat/run/<svc>.pid` | rewrite | 重启后由 systemd MainPID 重写 |
| 其余 pid / 日志 / env / dist | 不动 | — |

## 7. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
| --- | --- | --- | --- |
| user manager 未启动时 `systemctl --user` 不可用 | 低 | 高 | `have_user_unit` 探活；不可用则 `service.sh` 走 nohup 兜底 |
| `ProtectSystem=full` 阻断了 node 写 `.env` / `dist/` | 中 | 中 | `live-server` 运行期不需要写 env 与 dist；写需求只到 `logs/` 和 `run/`，已被 `ReadWritePaths=` 显式允许 |
| `KillMode=mixed` 让 bullmq 子进程没收到 SIGTERM 就被 SIGKILL | 低 | 低 | bullmq worker 句柄由 Node 持有，SIGTERM Node 时会广播；`TimeoutStopSec=30s` 兜底 |
| `enable-linger` 让 user manager 常驻，增加内存占用 | 低 | 低 | user manager 静态内存 < 50 MB，coreserver-01 有 16 GB，余量充足 |
| `Restart=on-failure` 5s 间隔过短 | 低 | 低 | Redis/PG 都在 localhost，重连快；engine-server 给 10s |
| engine-server venv 路径 `.venv/bin/python` 在 deploy 后变 | 低 | 高 | ExecStart 写绝对路径；deploy.sh 不动 venv；异常时回退到 nohup 兜底（手动） |
| `service.sh status` 输出变化让外部脚本 break | 低 | 中 | 仅在 unit 模式下加 `(systemd)` 后缀；核心字段 `service / pid / port` 不变 |

## 8. 不做

- 不写 deploy 配套脚本（deploy 后用户手动 `service.sh restart all` 即可）
- 不做 healthcheck 端点 / 主动探活（live-server 现有 `run-health` 接口，外部 LB 已用）
- 不动 `live-server` / `pbs-server` 业务代码
- 不引入 docker / podman 隔离

## 9. 关联文档

- `docs/modules/database/generated-sql-safety-standard.md`（不动）
- `live-server/CLAUDE.md`（不动）
- `/home/rois/uat/service.sh` 原始实现（作为兜底保留）
- `AGENTS.md` 根规则
