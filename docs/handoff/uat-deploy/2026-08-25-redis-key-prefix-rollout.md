# UAT 部署 Runbook — REDIS_KEY_PREFIX 隔离 (2026-08-25)

## 背景

dev worktree 的 live-server 和 UAT live-server 共享同一 Redis instance
（同一 BullMQ queue 名字），dev worker 抢到 UAT 触发的任务，跑
`f8_dev_live.roster_flight` 时因 dev schema 缺 `dp_min` 列抛错。

修复方案：4 个服务（live / pbs / connector / engine）都加
`REDIS_KEY_PREFIX` 环境变量，dev/uat/sit/prod 各自只读写自己
`<env>:*` 子集。详见 `docs/superpowers/specs/2026-08-25-redis-key-prefix-isolation.md`。

本文档是 **UAT 部署步骤**。

---

## 部署窗口要求

**4 个服务必须在同一个发布窗口里一起升级**——分批升级会导致一
段时间内 dev-style keys（无 prefix）和 uat-style keys（带 prefix）
并存，已在飞的 task 可能 mismatch。

推荐顺序：
1. 先 dev worktree 升级 + 验证（本文档 Step 1-4）
2. 再 UAT 升级 + 验证（本文档 Step 5-9）

---

## Step 1: dev worktree 升级

`/home/yuan.z/rois/rois-ai`（本机 = dev worktree）已 commit：

```
git log --oneline | head -10
```

应包含以下 commits（按时间倒序）：
- `docs(dev-env-setup): record f8_dev_live dp_min migration run`
- `feat(engine-server): namespace Redis keys with REDIS_KEY_PREFIX (Python)`
- `feat(connector-server): namespace Redis keys with REDIS_KEY_PREFIX`
- `feat(pbs-server): namespace Redis keys with REDIS_KEY_PREFIX`
- `chore(live-server): document REDIS_KEY_PREFIX in .env.example`
- `feat(live-server): prefix direct-write keys in mutation/legalty/ws/roster`
- `feat(live-server): prefix app cache keys in cache.ts`
- `feat(live-server): wrap all BullMQ queue/worker names with withPrefix()`
- `feat(live-server): add REDIS_KEY_PREFIX env + redis-key-prefix utility`

## Step 2: dev .env 显式声明 REDIS_KEY_PREFIX=dev

`live-server/.env` 末尾加（gitignored，本地手工）：

```
REDIS_KEY_PREFIX=dev
```

`.env.example` 已经更新（committed）作为模板。

## Step 3: 重启 dev live-server

```bash
# 1. 杀掉当前 dev live-server 进程
pkill -f "tsx watch src/index.ts" || true

# 2. 启动
cd /home/yuan.z/rois/rois-ai/live-server
npx tsx watch src/index.ts &

# 3. 看启动 log，验证 REDIS_KEY_PREFIX 守卫不抛
# Expected: 看到 "Server listening at http://0.0.0.0:3200"，无 zod error
```

如果有 zod 守卫拒绝 `REDIS_KEY_PREFIX=dev` 在 production-like env——检查
`APP_ENV` 是否被设为 `production/staging/uat/demo`，是的话改回 `development`。

## Step 4: 验证 dev worktree 启动后无 dp_min 错误

dev schema `dp_min` 已经在 Task 9 加过（见
`docs/handoff/dev-env-setup/2026-08-25-f8-dev-live-dp-min.md`）。

跑一次 manday recompute（用现有 dev Playwright e2e 或调 API）：

```bash
curl -X POST http://localhost:3200/api/admin/manday/recompute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"crewId":"<some-crew-id>","yearMonth":"2026-08"}'
```

看 redis：

```bash
redis-cli -h 127.0.0.1 -p 6379 -n 0 KEYS "dev:*" | head -20
```

Expected：能看到 `dev:manday-recompute:*` / `dev:roster-inbound:*` 等
dev 前缀 keys，不再有裸 `manday-recompute:*`。

---

## Step 5: UAT 升级 — pull 最新 main

```bash
ssh rois@<uat-host>
cd /home/rois/uat
git pull
```

Expected：pull 到与 dev worktree 相同的 9 个 commit。

## Step 6: 更新 4 个 .env

每个 .env 末尾加一行：

```bash
echo "REDIS_KEY_PREFIX=uat" >> /home/rois/uat/env/live-server.env
echo "REDIS_KEY_PREFIX=uat" >> /home/rois/uat/env/pbs-server.env
echo "REDIS_KEY_PREFIX=uat" >> /home/rois/uat/env/connector-server.env
echo "REDIS_KEY_PREFIX=uat" >> /home/rois/uat/env/engine-server.env
```

注：4 个服务的 env 文件按 UAT 实际部署路径写（`/home/rois/uat/env/`
是 UAT 实际放的，按现场为准）。

engine-server 是 YAML-driven，它的 REDIS_KEY_PREFIX 在 yaml 里
（不是 .env）：

```bash
# engine-server 的 config.yaml 里加：
# redis_key_prefix: uat
```

如果 engine-server 的 yaml 不支持这个 key，请改用环境变量 yaml 解析
路径（见 `ConfigManager._resolve_env_vars` 在
`engine-server/src/config/config.py`），yaml 里写
`${REDIS_KEY_PREFIX}`，`.env` 显式设值。

## Step 7: 重新 build 4 个服务

```bash
cd /home/rois/uat/live-server && npm run build
cd /home/rois/uat/pbs-server && npm run build
cd /home/rois/uat/connector-server && npm run build
cd /home/rois/uat/engine-server && pip install -e .  # or uv sync
```

## Step 8: 重启 4 个服务

```bash
/home/rois/uat/service.sh restart live-server
/home/rois/uat/service.sh restart pbs-server
/home/rois/uat/service.sh restart connector-server
/home/rois/uat/service.sh restart engine-server
```

**确认 4 个服务都在同一分钟内重启完成**（避免 time skew 导致中间
状态）。

## Step 9: 验证 UAT 启动正常

### 9.1 看 log

```bash
journalctl -u live-server --since "1 minute ago" | tail -50
```

Expected：无 `REDIS_KEY_PREFIX must not be 'dev'` / 无 `REDIS_KEY_PREFIX
cannot be 'uat'` 错误，无 zod refine 失败。

如果报错 `REDIS_KEY_PREFIX must be set to a non-default value when
APP_ENV is "uat" with default 'dev' prefix`——是忘了设 .env 或 env
没读；回去 Step 6 重设。

### 9.2 看 redis 出现 uat:* 子集

```bash
redis-cli -h 127.0.0.1 -p 6379 -n 0 KEYS "uat:*" | head -20
```

Expected：至少看到 `uat:rule-check-realtime` / `uat:roster-bulk-delete`
/ `uat:pairing:*` / `uat:connector.flight.inbound` 等。

如果只有 `dev:*` 或裸 key（无 prefix）——服务没读新 .env，重启
service 之前没 reload env。

### 9.3 触发一次 UAT 批量删除

在 UAT gantt UI 上：
- 登录 UAT gantt
- 进 Live Gantt，选 8 月份 pilot
- 选若干 FLY duty，触发批量删除

观察 redis：

```bash
redis-cli -h 127.0.0.1 -p 6379 -n 0 KEYS "uat:roster-bulk-delete:*"
```

Expected：看到 `uat:roster-bulk-delete:bull` (BullMQ queue)。

### 9.4 重复触发 5+ 次

跑 5 次以上批量删除（不同 crew / 不同月份组合）。

Expected：5 次都成功，无 `dp_min does not exist` 错误。
如果 dev worktree 也在跑、且 dev .env 没设 `REDIS_KEY_PREFIX=dev`——
dev worker 会抢 UAT task 并失败，所以 Step 2 不能漏。

---

## Step 10: 部署完成记录

在 `docs/handoff/uat-deploy/` 下补一份 `2026-08-25-uat-rollout.md`，
含：
- 升级时间窗口
- 4 个服务 restart 的精确时间
- 观察到的 redis key（前缀分布、TTL 健康度）
- 跑过的 verification（批量删除次数、是否全成功）
- 任何 known issue / follow-up

---

## 关联文档

- Spec: `docs/superpowers/specs/2026-08-25-redis-key-prefix-isolation.md`
- Plan: `docs/superpowers/plans/2026-08-25-redis-key-prefix-isolation.md`
- Dev schema 补救: `docs/handoff/dev-env-setup/2026-08-25-f8-dev-live-dp-min.md`
