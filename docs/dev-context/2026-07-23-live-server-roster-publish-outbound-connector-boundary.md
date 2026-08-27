# 开发上下文（2026-07-23）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-23 10:40:23 UTC
- Wing：`live-server`
- Topic：`roster-publish-outbound-connector-boundary`
- Title：roster-publish-outbound-connector-boundary
- Git branch：`main`

## 本轮对话上下文

本轮完成 Roster Publish Outbound Callback 的架构边界修正：
- 结论：第三方 F8 HTTP 调用与 token 获取属于 connector-server，不应放在 live-server。
- live-server 继续负责 roster_publish_adjust batch claim、payload 构造、等待 connector job 结果、写 roster_publish_outbound_log、成功标记 published=1、失败回滚 published=0。
- connector-server 的 connector.roster.outbound worker 负责消费 payload，查 enabled outbound roster + push_outbound connector，调用 PushOutboundHandler。
- PushOutboundHandler 支持 direct payload outbound，并支持 f8_token：先调用 token endpoint，业务请求带 AuthorizationToken；401/403 时 force refresh token 后重试一次。
- sql/seed/f8/10_connector_f8.sql 新增 f8-roster-publish-outbound connector，并已在当前 f8 schema 执行 seed 确认 connector_config 行启用。
- 验证通过：live-server roster-publish-outbound-service focused test、connector-server push-outbound/f8-token/poll-inbound focused tests、live-server build、connector-server build、git diff --check、GitNexus detect-changes low risk。
- 已提交并 push：4239dd85 fix: route roster publish outbound through connector。

## 当前工作树快照

### git status --short

```text
 M docs/superpowers/specs/2026-07-23-ro-scenario-pairing-source-scope.md
 M pbs-engine
```

### unstaged changed files

```text
docs/superpowers/specs/2026-07-23-ro-scenario-pairing-source-scope.md
pbs-engine
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-07-23-live-server-roster-publish-outbound-connector-boundary.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh live-server
git status --short
```
