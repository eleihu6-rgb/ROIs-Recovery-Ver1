# PBS Crew Bid TXT 上传导入接口调整设计

## 背景

现有 crew bid 导入接口要求调用方把 TXT 文件内容读成 JSON 字段 `sourceText`。这对 Apifox 和人工测试不友好，用户希望直接把客户原始 `.txt` 文件上传给接口，由后端读取并解析。

## 目标

- `dry-run` 与正式导入统一改为 `multipart/form-data`。
- 请求中必须包含 `file` 文件字段。
- 不保留 JSON `sourceText` 导入兼容方式，避免 Apifox 中出现两套调用方式。
- 导入解析、统计、Pairing Number 匹配、run 查询和 rollback 逻辑保持不变。

## 接口协议

### Dry-run

```text
POST /api/admin/crew-bid-imports/dry-run
Content-Type: multipart/form-data
```

Form 字段：

| 字段 | 必填 | 说明 |
|------|------|------|
| `file` | 是 | 客户 crew bid `.txt` 文件 |
| `periodCode` | 是 | 目标月份，例如 `Jun 2026` |
| `sourcePeriodCode` | 否 | 源文件月份，例如 `December 2025` |
| `scopeBase` | 否 | 基地过滤，例如 `YEG` |
| `scopeCategories` | 否 | JSON 字符串数组，例如 `["YEG-737-CA"]` |
| `scopeCrewIds` | 否 | JSON 字符串数组，例如 `["274","383"]` |
| `options` | 否 | JSON 字符串对象 |

### 正式导入

```text
POST /api/admin/crew-bid-imports
Content-Type: multipart/form-data
```

字段同 dry-run，额外要求：

| 字段 | 必填 | 说明 |
|------|------|------|
| `confirm` | 是 | 必须为 `true` |

## 解析规则

- route 层只接受 multipart。
- route 层读取 `file` 内容为 UTF-8 字符串，然后组装内部 `PbsCrewBidImportServiceRequest` 传给 service。
- 如果 `file` 缺失、为空、不是可读文本，返回 `400`。
- 如果 `scopeCategories`、`scopeCrewIds`、`options` 不是合法 JSON，返回 `400`。
- `options` 未传时使用既有默认值：

```json
{
  "useCurrentBidWhenAvailable": true,
  "fallbackToDefaultBid": true,
  "firstPairingBidGroupOnly": true,
  "overwriteCurrentBid": true,
  "failOnUnmatchedPairing": true
}
```

## 实现影响

- 新增依赖：`@fastify/multipart`，MIT 许可证，Fastify 官方包。
- `pbs-server/src/app.ts` 注册 multipart 插件。
- `pbs-server/src/routes/crew-bid-imports.ts` 删除 JSON body schema 入口，改为 multipart form parser。
- contract 类型将 `sourceText` 改为服务内部字段，不作为外部 HTTP JSON body 使用。
- 更新 route tests，使用 multipart file 注入。
- 更新 Apifox/人工 QA 文档。

## 验收标准

- Apifox 可以直接通过 form-data 上传 `Dec 2025 All in one.txt`。
- 不带 `file` 返回 `400`。
- 发送 JSON `sourceText` 到 dry-run/import 返回 `400`。
- dry-run 不落库，仍返回 summary/items/problems。
- 正式导入仍要求 `confirm=true`。
- `GET /api/admin/crew-bid-imports`、`GET /api/admin/crew-bid-imports/:runId`、`DELETE /api/admin/crew-bid-imports/:runId` 不变。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在单个后端 route、依赖、contract 和测试，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `pbs-server`、`packages/contracts`、测试文档。
- Conflict risk: 低。
- Execution gate: 用户已确认不保留 JSON 兼容并批准实现。
