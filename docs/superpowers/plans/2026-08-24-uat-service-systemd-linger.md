# Plan: UAT 后端服务进程托管迁移

| 字段 | 值 |
| --- | --- |
| Plan ID | `2026-08-24-uat-service-systemd-linger` |
| Spec | `docs/superpowers/specs/2026-08-24-uat-service-systemd-linger.md` |
| 日期 | 2026-08-24 |
| 状态 | Draft（待用户确认 spec 后开工） |

## 阶段 0 — 立即止血（不依赖 spec 评审）

- [ ] **`bash /home/rois/uat/service.sh start live-server`** — 用现有 nohup 路径先拉起 UAT live-server 让用户能用
- [ ] `ss -tlnp | grep :3000` 确认监听
- [ ] `tail -f /home/rois/uat/logs/live-server.log` 看 `Database connected, schema: f8_uat_live` / `Live server running` 字样

> 这一步只用现有 `service.sh`，不写新代码。

## 阶段 1 — 写四个 systemd unit（先不动 `service.sh`）

- [ ] 备份 `.config/systemd/user` 目录：`cp -a ~/.config/systemd/user ~/.config/systemd/user.bak-20260824`
- [ ] 写 `uat-live-server.service`（按 spec §4.2.1）
- [ ] 写 `uat-pbs-server.service`、`uat-connector-server.service`（同构）
- [ ] 写 `uat-engine-server.service`（ExecStart 用 venv python + uvicorn）
- [ ] `systemctl --user daemon-reload`
- [ ] `systemd-analyze verify ~/.config/systemd/user/uat-*.service` 必须 0 warning
- [ ] `systemctl --user list-unit-files uat-*.service` 确认四个都出现

## 阶段 2 — 启用 linger

- [ ] `sudo loginctl enable-linger yuan.z`（一次性）
- [ ] `loginctl show-user yuan.z | grep Linger` 期望 `Linger=yes`
- [ ] 记录到 `docs/handoff/uat/2026-08-24-linger-enabled.md`：何时、谁执行、验证结果

## 阶段 3 — 改 `service.sh`（核心改动）

- [ ] 先备份：`cp -a /home/rois/uat/service.sh /home/rois/uat/service.sh.bak-20260824`
- [ ] 新增 `have_user_unit()` 探活函数
- [ ] 重写 `start_live_server` / `start_pbs_server` / `start_engine_server` / `start_connector_server`：优先 systemd user unit，缺失时走原 nohup 兜底
- [ ] 重写 `stop_one`：优先 `systemctl --user stop`，再走 `kill` 兜底
- [ ] 重写 `restart_one`：stop → start，逻辑随上面走
- [ ] 重写 `status_all`：unit 模式加 `(systemd)` 后缀
- [ ] `bash -n /home/rois/uat/service.sh` 必须 0 错误
- [ ] `bash /home/rois/uat/service.sh status` 输出格式与原版字段一致

## 阶段 4 — 切换（不停机）

- [ ] `bash /home/rois/uat/service.sh stop live-server` — 把当前 nohup 进程停掉
- [ ] `systemctl --user start uat-live-server.service` — 走 unit 启动
- [ ] 等 5s，`ss -tlnp | grep :3000` 确认
- [ ] `systemctl --user status uat-live-server.service` 看 MainPID + 启动时间
- [ ] `journalctl --user -u uat-live-server -n 50` 看启动日志
- [ ] `tail -50 /home/rois/uat/logs/live-server.log` 看 append 日志（必须与 journal 看到的同一份）
- [ ] 同样切 pbs-server / engine-server / connector-server

## 阶段 5 — 验证（按 spec §5 表逐条跑）

- [ ] 单元加载、单元语法、Linger、启动 — 阶段 1/2/4 顺带完成
- [ ] **端到端登录保持**：SSH 登入 → `exit` → 等 10s → `ss -tlnp` 看 3000/3002/3003/3004 仍 LISTEN
- [ ] **模拟 SSH slice 回收**（可选但强烈推荐）：`sudo loginctl kill-user yuan.z` → 等 10s → `ss -tlnp` 仍 LISTEN
- [ ] **进程崩溃自动拉起**：`kill -9 $(systemctl --user show -p MainPID --value uat-live-server.service)` → 5s 内 `MainPID` 变化
- [ ] **主动 stop 不被拉起**：`bash /home/rois/uat/service.sh stop live-server` → 5s 后仍 `inactive (dead)`
- [ ] `bash /home/rois/uat/service.sh status` 输出兼容
- [ ] `tail -f logs/<svc>.log` 仍可用
- [ ] `journalctl --user -u uat-<svc>` 可读

## 阶段 6 — 文档与收尾

- [ ] 在 `docs/handoff/uat/2026-08-24-uat-systemd-linger.md` 写运维 handoff：如何重启、如何回滚、如何读 journal
- [ ] 如果有 `save-context.sh` 可用：把本轮对话上下文写入 `docs/dev-context/2026-08-24-uat-service-systemd-linger.md`
- [ ] 不需要为本次改动建 Plane 工单（属于 ops 修复；可在 #100-plane-ops 后批量建）

## 回滚路径

如果阶段 5 任意一项失败：

```bash
sudo loginctl disable-linger yuan.z
systemctl --user disable --now uat-live-server.service
# 此时 have_user_unit 返非零，service.sh 走原 nohup 兜底
bash /home/rois/uat/service.sh start live-server
```

不需要回滚代码。spec §4.6 兜底分支一直在。

## 风险

- 详见 spec §7
- 唯一"动手前发现不了"的是 `ProtectSystem=full` 是否会拦 node 写自己 cwd（`/home/rois/uat/live-server` 下的 `dist/`、`node_modules/`）。我们让 WorkingDirectory 不在 ReadWritePaths 里，但 live-server 启动期不需要写；这步在阶段 4 切第一个服务（live-server）时验证，5s 内看到 `Database connected, schema: f8_uat_live` 即通过。
