# UAT 后端服务进程托管 — 运维 handoff

> 日期：2026-08-24
> 触发事件：2026-08-24 06:53 UTC UAT `live-server` 在 SSH 登出后被 systemd user slice SIGKILL
> 修复：UAT 四个后端服务从 `nohup &` 模式迁移到 `systemd --user` unit，并启用 `loginctl enable-linger`

## 1. 系统现状

四个后端服务（`live-server` / `pbs-server` / `engine-server` / `connector-server`）现在由 `systemd --user` 管理。`yuan.z` 用户的 user manager 已启用 linger，SSH 登出/登入不再影响服务。

| 服务 | 端口 | MainPID（验证时） | 单元文件 | cgroup |
| --- | --- | --- | --- | --- |
| live-server | 3000 | 3529651 | `~/.config/systemd/user/uat-live-server.service` | `app.slice/uat-live-server.service` |
| pbs-server | 3002 | 3531418 | `~/.config/systemd/user/uat-pbs-server.service` | `app.slice/uat-pbs-server.service` |
| engine-server | 3003 | 3527115 | `~/.config/systemd/user/uat-engine-server.service` | `app.slice/uat-engine-server.service` |
| connector-server | 3004 | 3527172 | `~/.config/systemd/user/uat-connector-server.service` | `app.slice/uat-connector-server.service` |

`/var/lib/systemd/linger/yuan.z` 存在（linger 标记）。

## 2. 日常运维（保持 `service.sh` 接口不变）

| 操作 | 命令 |
| --- | --- |
| 查看所有服务 | `bash /home/rois/uat/service.sh status` |
| 启动单个 | `bash /home/rois/uat/service.sh start <svc>` |
| 启动全部 | `bash /home/rois/uat/service.sh start all` |
| 停止单个 | `bash /home/rois/uat/service.sh stop <svc>` |
| 重启单个 | `bash /home/rois/uat/service.sh restart <svc>` |
| 看 tail 50 行日志 | `bash /home/rois/uat/service.sh logs <svc>` |

`status` 输出末尾会带 `(systemd)` 标识走的是 unit 模式。

也可以直接用 `systemctl --user`（更适合远程排障）：

```bash
systemctl --user status uat-live-server.service
systemctl --user restart uat-engine-server.service
journalctl --user -u uat-pbs-server.service -n 200
```

## 3. 部署流程

`redeploy-report.sh` 和 `engine-server/scripts/deploy.sh` 都不需要改：它们走 `service.sh restart <svc>`，service.sh 内部已经会走 `systemctl --user restart uat-<svc>.service`（前提是 unit 已 enable + 单元文件存在）。

> 注意：deploy 完一定要 `daemon-reload` 一次以防单元文件被覆盖过：
>
> ```bash
> systemctl --user daemon-reload
> ```

## 4. 排障路径

| 现象 | 看哪里 |
| --- | --- |
| 服务起不来 | `journalctl --user -u uat-<svc> -n 100` |
| 启动后立刻退出 | `journalctl --user -u uat-<svc> -n 200 --no-pager` 找 `Result=...` / `ExecMainStatus=` |
| 端口没起 | `ss -tlnp \| grep :<port>` + `tail -50 /home/rois/uat/logs/<svc>.log` |
| 反复重启 | `systemctl --user show uat-<svc>.service -p NRestarts` 计数 |
| cgroup 异常 | `cat /proc/<pid>/cgroup` 看是否在 `app.slice/uat-<svc>.service` 下 |

## 5. 单元文件模板

`~/.config/systemd/user/uat-*.service` 都长这样（以 live-server 为例）：

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
SuccessExitStatus=0 143
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

engine-server 区别只在 ExecStart：`/home/rois/uat/engine-server/.venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 3003`，且多一个 `ReadWritePaths=/home/rois/uat/engine-server`（uvicorn 启动时 import 路径需要写访问）。

**关键开关**：
- `Restart=on-failure` + `SuccessExitStatus=0 143` → 崩溃自动拉起，主动 stop（SIGTERM, exit 143）不被拉起
- `KillMode=mixed` + `TimeoutStopSec=30s` → 30s 内给 Node 跑完 beforeExit 钩子，超时 SIGKILL
- `StandardOutput=append:` → 与原 `>>` 行为完全等价，运维 `tail -f` 路径不变
- `ProtectSystem=full` + `ReadWritePaths=` → 锁住 node 写权限，只允许写 `logs/` 和 `run/`

## 6. 故障回滚

如果 unit 配置有 bug，回滚只需要三步：

```bash
sudo loginctl disable-linger yuan.z
systemctl --user disable --now uat-live-server.service
# service.sh 内部 have_user_unit 返非零 → 自动走原 nohup 兜底
bash /home/rois/uat/service.sh start live-server
```

不需要回滚代码，`service.sh` 已经保留了 nohup 兜底分支。

## 7. 已知问题

1. **`KillMode=mixed` + `ProtectSystem=full` 的 cgroup-kill 冲突**：`unit process remains running after unit stopped` 偶发，原因是 systemd 在 unit 退出后试图 SIGKILL 整个 cgroup，但受 `ProtectSystem=full` 保护下 cgroup kill 失败。日志里会看到 `Failed to kill control group ... Invalid argument`。**影响**：`Restart=on-failure` 不会被错误触发，但子进程可能 leak 几秒。当前可接受，未做修复。

2. **重启时日志文件先 truncate 再 append**：因为 `StandardOutput=append:` 不会 truncate，但 `service.sh start` 之前如果 `free_service_port` 误删了某些文件，行为会变。**当前实现无此问题**，仅记录。

3. **engine-server venv 路径硬编码**：`ExecStart` 直接写 `/home/rois/uat/engine-server/.venv/bin/python`，如果未来 deploy 把 venv 放到别的位置，unit 文件需要手动改。可考虑改成环境变量 `$ENGINE_VENV`，但目前没动。

## 8. 关联文档

- Spec: `docs/superpowers/specs/2026-08-24-uat-service-systemd-linger.md`
- Plan: `docs/superpowers/plans/2026-08-24-uat-service-systemd-linger.md`
- 原始 service.sh: `/home/rois/uat/service.sh.bak-20260824`（保留作为兜底参考）
- 原始 unit 配置（如有）: `/home/yuan.z/.config/systemd/user.bak-20260824`
