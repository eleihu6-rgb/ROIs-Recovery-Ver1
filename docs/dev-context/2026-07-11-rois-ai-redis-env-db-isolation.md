# 开发上下文（2026-07-11）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-11 23:08:28 UTC
- Wing：`rois-ai`
- Topic：`redis-env-db-isolation`
- Title：redis-env-db-isolation
- Git branch：`main`

## 本轮对话上下文

本轮完成 Redis 环境隔离和 SIT/UAT 配置调整（不含密钥）：
- 已提交并推送 live-server Redis URL db 解析修复：3bed2772 fix: honor redis url database in live bullmq。
- 当前代码约束：live-server 和 connector-server 仍只读 REDIS_URL 跑 BullMQ；pbs-server 只读 REDIS_PBS_URL。未实现 LIVE_REDIS_URL/PBS_REDIS_URL/BULLMQ_REDIS_URL 分离逻辑，因此队列生产者 connector 和消费者 live 必须保持同一 Redis DB。
- UAT 目标配置：live-server REDIS_URL -> localhost:6379/0；connector-server REDIS_URL -> localhost:6379/0；pbs-server REDIS_PBS_URL -> localhost:6379/2。db1 暂预留给后续私有缓存拆分。
- SIT 目标配置：live-server/connector-server/engine-server -> 127.0.0.1:16379/6；pbs-server -> 127.0.0.1:16379/8。db7 暂预留。
- SIT 还补了 /home/yuan.z/rois/sit/env/connector-server.env，避免 connector 以后依赖临时进程环境；engine-server 的 Redis 实际由 /home/yuan.z/rois/sit/engine-server/config.yaml 的 redis: 段控制，已改为 127.0.0.1:16379 db6。
- SIT 验证：live /api/health 200；connector /api/health 200；engine /health healthy 且 redis connected；pbs /health 返回 401（认证保护）。SIT 进程环境确认 live/connector/engine db6、pbs db8。
- UAT 根 service.sh 存在路径拼接问题，会 cd 到 rois-ai/rois-ai/...；本轮绕过该脚本，用 node dist/index.js 启动 live-server/connector-server/pbs-server。UAT live/connector health 200，pbs /health 401。
- 工作树仅剩既有 pbs-engine submodule dirty 状态，未触碰。

## 当前工作树快照

### git status --short

```text
 M pbs-engine
```

### unstaged changed files

```text
pbs-engine
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-07-11-rois-ai-redis-env-db-isolation.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh rois-ai
git status --short
```
