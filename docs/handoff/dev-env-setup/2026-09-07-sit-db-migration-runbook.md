# SIT DB 迁移 Runbook（2026-09-07：10.15.11.3 → 10.16.11.18）

## 摘要

| 项 | 值 |
|----|----|
| 源端 | `root@10.15.11.3`（docker container `postgres`，DB `recovery`，180 张表 / 248 MB / 3 schema：`dev_live` / `dev_scenario` / `dev_pbs`）|
| 目标端 | `ecs-user@10.16.11.18`（docker container `postgres`，DB `recovery`，同 schema）|
| 工具 | `pg_dumpall` + `psql`（postgres:17 自带），免额外依赖 |
| 数据完整性校验 | ✅ 表数 149/19/12 完全一致；9 张 sample 表 row count **全部完全一致**（crew 895、flight 32760、pairing 23237、pairing_seg 62507、roster_flight 210081、crew_base 1439、pbs_user 895、roster_scen 0、pbs_bid 0）|
| 备份留底 | 本机 `/tmp/recovery-migration.dump.backup.20260907`（324 MB，sha256 `2c07d958...`）；远端 `/home/ecs-user/recovery-migration.dump`（同名同 sha256）|
| 实际执行 | 2026-09-07 06:57–06:58 UTC |
| 操作者 | 本机 `yuan.z@local`（agent 驱动，**`!ssh-copy-id` 由用户本人执行**）|

## 前置条件

- 本机到 10.16.11.18 已免密 SSH（专用 key `~/.ssh/sit_ecs_10_16_11.18`
  + SSH config alias `sit-db-ecs` + `IdentitiesOnly yes`）。详见
  `docs/handoff/dev-env-setup/2026-09-07-recovery-submodule-rule-engine-rs.md`
  同样的 SSH 化思路。
- 本机到 10.15.11.3 已免密 SSH（root）。
- 10.16.11.18 上 `ecs-user` 有 `sudo NOPASSWD: ALL`（运维侧预配）。

---

## 阶段 A — 10.16.11.18 准备（不动旧端）

### A1. 安装 docker.io

```bash
ssh sit-db-ecs "sudo apt install -y docker.io && sudo systemctl enable --now docker && sudo usermod -aG docker ecs-user"
ssh sit-db-ecs "sudo docker version --format '{{.Server.Version}}'"
# 期望输出：29.1.3
```

### A2. 拉镜像

```bash
ssh sit-db-ecs "sudo docker pull postgres:17-alpine && sudo docker pull redis:7-alpine"
```

### A3. 起 postgres 容器（DB 名 `recovery`，密码用 env-file 用完即删）

```bash
ssh sit-db-ecs 'set -e
sudo tee /home/ecs-user/.pg-pw > /dev/null <<PWEOF
POSTGRES_USER=postgres
POSTGRES_DB=recovery
POSTGRES_PASSWORD=<same as 10.15.11.3>
PWEOF
sudo chmod 600 /home/ecs-user/.pg-pw && sudo chown ecs-user:ecs-user /home/ecs-user/.pg-pw
sudo docker run -d \
  --name postgres \
  --env-file /home/ecs-user/.pg-pw \
  -v pgdata:/var/lib/postgresql/data \
  -p 5432:5432 \
  --restart unless-stopped \
  postgres:17-alpine
sudo rm -f /home/ecs-user/.pg-pw
'
```

> ⚠️ **安全**：密码只在 env-file 出现一次（被 chmod 600），docker run
> 成功后 `rm -f` 删掉。密码随后**只活在** `docker inspect postgres`
> 的 Config.Env 字段；如需 rotate，重跑 A3 即可。
>
> ⚠️ 密码不应该写进任何 git 跟踪文件。本 runbook 用 `<placeholder>`
> 表达，实际密码走对话 / 一次性输入。

### A4. 起 redis 容器（无密码，dump.rdb 丢弃）

```bash
ssh sit-db-ecs "sudo docker run -d \
  --name redis \
  -v redisdata:/data \
  -p 6379:6379 \
  --restart unless-stopped \
  redis:7-alpine"
```

旧端 dump.rdb 只有 107 字节（基本空）+ ACL 锁死不可读，新端直接冷启。

### A6. 健康检查

```bash
ssh sit-db-ecs "sudo docker exec postgres pg_isready -U postgres && sudo docker exec postgres psql -U postgres -c '\\l' && sudo docker exec redis redis-cli ping"
# 期望：accepting connections + 4 DB（postgres/recovery/template0/1）+ PONG
```

---

## 阶段 B — 数据迁移（源端只读，目标端空）

### B1. 源端 pg_dumpall

```bash
ssh root@10.15.11.3 "docker exec postgres pg_dumpall -U postgres -c --if-exists --clean" > /tmp/recovery-migration.dump
sha256sum /tmp/recovery-migration.dump
cp /tmp/recovery-migration.dump /tmp/recovery-migration.dump.backup.$(date +%Y%m%d)
```

本次实测：
- 大小：324 MB（text SQL，未压缩）
- sha256：`2c07d958322234fc70be6821c67c0d4bcd8b53d0f7dbe0f302ba34dd2799a0a6`
- 包含 DB：template1 / appdb / postgres / recovery（template0 默认不 dump）
- 末尾标识：`PostgreSQL database cluster dump complete`

### B2. scp + restore

```bash
scp /tmp/recovery-migration.dump sit-db-ecs:/home/ecs-user/recovery-migration.dump
ssh sit-db-ecs "sha256sum /home/ecs-user/recovery-migration.dump"   # 应与本机 sha256 一致

ssh sit-db-ecs "cat /home/ecs-user/recovery-migration.dump | sudo docker exec -i \
  -e PGOPTIONS='--client-min-messages=warning' \
  postgres psql -U postgres -d postgres -q -v ON_ERROR_STOP=0" > /tmp/restore.log 2>&1
echo "exit=$?"      # 期望 0
```

> ⚠️ 这里 `cat | docker exec -i` 必须放在 ssh 命令**内部**（远端 shell
> 跑），否则本地的 `<` 重定向会读本机路径导致 Permission denied。

### B3. 校验（必须两边完全一致）

把以下 SQL 写到 `/tmp/verify.sql`：

```sql
SELECT 'tbl_count:'||schemaname AS metric, COUNT(*) AS n
FROM pg_tables
WHERE schemaname IN ('dev_live','dev_scenario','dev_pbs')
GROUP BY 1 ORDER BY 1;

SELECT 'row:crew' AS metric, COUNT(*) AS n FROM dev_live.crew
UNION ALL SELECT 'row:flight',        COUNT(*) FROM dev_live.flight
UNION ALL SELECT 'row:pairing',       COUNT(*) FROM dev_live.pairing
UNION ALL SELECT 'row:crew_base',     COUNT(*) FROM dev_live.crew_base
UNION ALL SELECT 'row:roster_flight', COUNT(*) FROM dev_live.roster_flight
UNION ALL SELECT 'row:pairing_seg',   COUNT(*) FROM dev_live.pairing_segment
UNION ALL SELECT 'row:roster_scen',   COUNT(*) FROM dev_scenario.roster_flight
UNION ALL SELECT 'row:pbs_bid',       COUNT(*) FROM dev_pbs.pbs_bid
UNION ALL SELECT 'row:pbs_user',      COUNT(*) FROM dev_pbs.pbs_user;
```

```bash
ssh root@10.15.11.3 "docker exec -i postgres psql -U postgres -d recovery" < /tmp/verify.sql > /tmp/verify.src.txt 2>&1
ssh sit-db-ecs     "sudo docker exec -i postgres psql -U postgres -d recovery" < /tmp/verify.sql > /tmp/verify.dst.txt 2>&1
diff /tmp/verify.src.txt /tmp/verify.dst.txt && echo "✅ VERIFY OK"
```

> 注：`scenario` 表**不存在**于 `dev_scenario`（之前探查时只有 12 张表，
> 没有 scenario 本身）；verify.sql 已去掉这条 query。误写会两端报相同
> ERROR 但仍能验证 schema 一致性。

### B4. 清理

```bash
rm -f /tmp/recovery-migration.dump /tmp/verify.sql /tmp/verify.src.txt /tmp/verify.dst.txt /tmp/restore.log
# /tmp/recovery-migration.dump.backup.<date> 保留 7 天做灾备
```

远端 `/home/ecs-user/recovery-migration.dump` 保留 7 天做灾备，到期后：

```bash
ssh sit-db-ecs "rm -f /home/ecs-user/recovery-migration.dump"
```

---

## 阶段 C — 切流量

详见 `docs/handoff/dev-env-setup/2026-09-07-sit-deploy-topology-slim.md`
（仓库代码侧改动清单）+ `docs/superpowers/specs/2026-09-07-sit-deploy-
topology-slim-design.md`（设计决策）。

简版步骤：

```bash
# C1 — 本机 nginx 反代改地址（recovery-sit.conf 已经改了，手动 deploy）
sudo cp deploy/sit/nginx/recovery-sit.conf /etc/nginx/conf.d/recovery-sit.conf
sudo nginx -t && sudo nginx -s reload

# C2 — 部署脚本改 host / 路径（已 commit 在仓库）
# C3 — env 文件改 DB 名 + schema（已 commit 在仓库）

# C4 — 在 10.16.11.18 上初始化工作目录 + 推 env 模板
bash deploy/sit/setup.sh all

# C5 — 手填 JWT_SECRET / DB 密码到 /home/ecs-user/sit/env/*.env
#      （密码不在文档里；用户手填）

# C6 — 全量部署
bash deploy/sit/deploy.sh --all
```

---

## 阶段 D — 关闭旧端 10.15.11.3

**本脚本不主动 shutdown**。运维 / 用户手动执行：

```bash
# 1. 确认所有 SIT 流量已切到 10.16.11.18（无客户端连 10.15.11.3）
ssh sit-db-ecs "ss -tnp | grep -E ':3000|:3003|:5432|:6379' | wc -l"  # 期望活跃连接正常

# 2. 在 10.15.11.3 上停 docker 容器（保留数据 7 天）
ssh root@10.15.11.3 "docker stop postgres redis"

# 3. 7 天后用户决定保留 / 删除 volume
ssh root@10.15.11.3 "docker volume rm pgdata redisdata"   # 真删，不可逆

# 4. 关闭 10.15.11.3（按运维流程）
```

> 7 天窗口期内，旧 10.15.11.3 docker 容器 `stop`（不删）可作为灾备
> fallback。如果新端有数据漂移，可快速 `docker start postgres` +
> `ssh -L` 反向隧道回退。

---

## 回滚 / rotate / 灾备

### DB 旋转（rotate postgres 密码）

```bash
# 1. 停依赖服务
ssh sit-db-ecs "bash /home/ecs-user/sit/service.sh stop all"

# 2. 改 env 文件（用户手填）
ssh sit-db-ecs "vim /home/ecs-user/sit/env/live-server.env"
ssh sit-db-ecs "vim /home/ecs-user/sit/env/engine-server.env"

# 3. 重启容器 + 服务
ssh sit-db-ecs "sudo docker restart postgres"
ssh sit-db-ecs "bash /home/ecs-user/sit/service.sh start all"
```

> postgres 容器自身密码（`POSTGRES_PASSWORD`，用于 docker exec psql）与
> 应用层 DATABASE_URL 里的密码**是两个东西**。rotate 应用密码不动容器；
> rotate 容器密码要重跑 A3 + 重新 restore（dump 含 globals 会重建 role）。

### 完全回滚到 10.15.11.3（旧端未关时）

```bash
# 1. 停 10.16.11.18 服务
ssh sit-db-ecs "bash /home/ecs-user/sit/service.sh stop all"

# 2. 恢复仓库代码 + env（git revert deploy/sit/*）
git revert <deploy-commit-sha>

# 3. 在 10.15.11.3 上启容器（如果停了）
ssh root@10.15.11.3 "docker start postgres redis"

# 4. nginx 反代改回
sudo vim /etc/nginx/conf.d/recovery-sit.conf    # 10.16.11.18 → 10.15.11.3
sudo nginx -t && sudo nginx -s reload

# 5. 重启服务（旧 deploy 流程）
ssh root@10.15.11.3 "bash /home/recovery/sit/service.sh start all"
```

### 完全重跑迁移（旧端已关、需从 backup 还原）

```bash
# 1. 旧端 backup 在 7 天窗口内可用
ls -lh /tmp/recovery-migration.dump.backup.20260907       # 本机
ssh sit-db-ecs "ls -lh /home/ecs-user/recovery-migration.dump"   # 远端

# 2. 重跑阶段 B（restore 到 10.16.11.18）
#    如果是初次失败，目标端容器在 A3 已起好；直接 cat dump | docker exec
ssh sit-db-ecs "cat /home/ecs-user/recovery-migration.dump | sudo docker exec -i postgres psql -U postgres -d postgres -q -v ON_ERROR_STOP=0"
```

---

## 关联

- 配套 handoff（仓库代码侧改动）：
  `docs/handoff/dev-env-setup/2026-09-07-sit-deploy-topology-slim.md`
- 配套 spec（设计决策 + 风险）：
  `docs/superpowers/specs/2026-09-07-sit-deploy-topology-slim-design.md`
- 配套 handoff（同 recovery 操作的 SSH 化）：
  `docs/handoff/dev-env-setup/2026-09-07-recovery-submodule-rule-engine-rs.md`
- 项目规范：`CLAUDE.md` §No-Auto-Commit / §Surgical / §Minimal-First