# 开发上下文（2026-07-11）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-11 23:21:02 UTC
- Wing：`rois-ai`
- Topic：`bullmq-redis-url-separation`
- Title：bullmq-redis-url-separation
- Git branch：`main`

## 本轮对话上下文

本轮完成 LIVE/REDIS_URL 与 BULLMQ_REDIS_URL 分离：
- 提交并推送代码：26bda34c feat: separate bullmq redis url。
- live-server: REDIS_URL 继续用于 Fastify redis 插件（服务私有缓存）；新增 BULLMQ_REDIS_URL，所有 BullMQ Queue/Worker/QueueEvents 使用 getBullmqRedisConnection()，默认回退 REDIS_URL。
- connector-server: REDIS_URL 继续用于 connector 私有 Redis/cache；queueBaseOptions 改为使用 BULLMQ_REDIS_URL，默认回退 REDIS_URL，因此 Queue/Worker/FlowProducer 均走共享队列 Redis。
- pbs-server 本轮未改代码，因为当前没有 BullMQ runtime wiring；继续 REDIS_PBS_URL 独立。
- UAT env: live-server REDIS_URL db1, BULLMQ_REDIS_URL db0；connector-server REDIS_URL db1, BULLMQ_REDIS_URL db0；pbs-server REDIS_PBS_URL db2。
- SIT env: live-server/connector-server REDIS_URL db7, BULLMQ_REDIS_URL db6；engine-server REDIS_URL/config.yaml redis db7；pbs-server REDIS_PBS_URL db8。
- SIT 已 rsync 新 live-server/dist 和 connector-server/dist，并重启 live/connector/pbs/engine。
- 验证：live-server unit redis-url + bullmq-redis tests PASS；connector bullmq-redis-options test PASS；live-server build PASS；connector-server build PASS。UAT/SIT live/connector health 200，SIT engine health redis connected，pbs /health 401（认证保护）。
- 注意：根 service.sh 在 UAT 仍有 rois-ai/rois-ai 路径拼接问题，本轮继续用 setsid + node dist/index.js 启动 UAT live/connector/pbs。

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
2. 本文件：`docs/dev-context/2026-07-11-rois-ai-bullmq-redis-url-separation.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh rois-ai
git status --short
```
