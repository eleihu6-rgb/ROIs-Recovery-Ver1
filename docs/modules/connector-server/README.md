# Connector Server 外部系统对接服务

> 端口：3004
> 技术栈：Fastify + TypeScript + Drizzle ORM + Redis + BullMQ

---

## 1. 概述

connector-server 是 ROIS-AI 系统与外部航司第三方系统的对接桥梁，负责：

- **入向数据接收**：航班计划、机组基础数据从外部系统流入
- **出向数据发布**：排班结果向外部系统推送或提供查询接口
- **协议适配**：支持多种对接协议（推送、轮询、查询）
- **格式转换**：通过 Transform 插件处理各航司数据格式差异

---

## 2. 与其他服务的关系

```
外部航司系统
    │
    │  (A) 对方调我们接口推送数据        (B) 我们轮询对方接口拉取数据
    ▼                                        ▼
connector-server (3004)
    │
    │  入向：BullMQ 队列 → live-server 消费
    │        connector:flight:inbound
    │        connector:crew:inbound
    │
    │  出向：live-server 发布事件 → BullMQ 队列 → connector-server worker
    │        connector:roster:outbound
    │
    │  特殊读：直接查 PostgreSQL（QueryOutbound 增量查询）
    ▼
live-server (3000) ←→ PostgreSQL / Redis
    │
    ▼  (C) 我们主动推送排班数据给对方    (D) 对方调我们接口查询增量排班
外部航司系统
```

---

## 3. 目录结构

```
connector-server/
├── src/
│   ├── config/               # 环境变量配置
│   ├── plugins/              # Fastify 插件
│   │   ├── database.ts       # PostgreSQL 连接池
│   │   ├── redis.ts          # Redis 连接
│   │   ├── bullmq.ts         # BullMQ 队列定义
│   │   └── auth.ts           # 全局认证钩子
│   ├── routes/               # API 路由
│   │   ├── inbound/          # 入向推送接口
│   │   ├── outbound/         # 出向查询接口
│   │   ├── admin/            # 管理接口（连接器配置 CRUD）
│   │   ├── auth.ts           # OAuth 2.0 Token 接口
│   │   └── health.ts         # 健康检查
│   ├── services/
│   │   ├── connector/        # 连接器配置服务
│   │   ├── protocols/        # 四种协议处理器
│   │   └── auth/             # 认证服务（API Key / OAuth2）
│   ├── transform/            # 数据格式转换插件
│   │   ├── base.ts           # TransformPlugin 接口定义
│   │   ├── default.ts        # 默认直通转换
│   │   ├── f8/               # F8 航司专属转换（按需添加）
│   │   └── tg/               # TG 航司专属转换（按需添加）
│   ├── workers/              # BullMQ 消费者
│   ├── models/               # Drizzle ORM Schema
│   └── utils/                # 工具函数
├── migrations/               # 数据库迁移脚本
├── package.json
└── tsconfig.json
```

---

## 4. 数据库表设计

### 4.1 connector_config（连接器注册表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint | 主键 |
| connector_code | varchar(50) | 连接器唯一标识 |
| connector_name | varchar(100) | 连接器名称 |
| direction | varchar(20) | inbound / outbound |
| protocol | varchar(20) | poll_inbound / push_inbound / push_outbound / query_outbound |
| data_domain | varchar(20) | flight / crew / roster / pairing |
| auth_type | varchar(20) | api_key / oauth2_cc / f8_token |
| auth_config | jsonb | 认证配置（加密存储） |
| endpoint_config | jsonb | 端点配置（URL、Headers、Timeout） |
| schedule_cron | varchar(50) | 轮询调度 Cron（仅 poll_inbound） |
| transform_plugin | varchar(100) | 转换插件标识（如 'f8/flight'） |
| is_enabled | smallint | 是否启用 |
| is_deleted | smallint | 是否删除 |

### 4.2 connector_log（执行日志）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint | 主键 |
| connector_id | bigint | 连接器 ID（FK） |
| direction | varchar(20) | inbound / outbound |
| status | varchar(20) | success / fail / partial |
| records_in | int | 入向记录数 |
| records_out | int | 出向记录数 |
| error_message | text | 错误信息 |
| duration_ms | int | 执行耗时 |
| executed_at | timestamptz | 执行时间 |

---

## 5. 安全认证

### 5.1 API Key + HMAC 签名（默认）

外部系统请求时需携带签名头：

```
X-Api-Key: <api_key>
X-Timestamp: <unix_timestamp_seconds>
X-Signature: HMAC-SHA256(api_key + "." + timestamp + "." + SHA256(body), secret)
```

- **防重放**：Timestamp 与服务器时间差超过 300 秒则拒绝（401）
- **签名算法**：HMAC-SHA256，防止请求篡改

### 5.2 OAuth 2.0 Client Credentials（高安全需求）

航司使用 client_id + client_secret 换取短期 JWT：

```
POST /api/auth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id=<id>&client_secret=<secret>
```

返回 JWT（有效期 1 小时），后续请求携带 `Authorization: Bearer <token>`。

JWT Payload：

```typescript
interface ConnectorTokenPayload {
  clientId: string    // 航司唯一标识
  schema: string      // 航司 schema（如 'f8'）
  scopes: string[]    // 权限范围
  type: 'connector'   // 区分人员 JWT
}
```

---

## 6. BullMQ 队列设计

### 6.1 入向队列（connector-server 生产，live-server 消费）

| 队列名 | 数据域 | 触发来源 |
|--------|--------|----------|
| connector:flight:inbound | 航班 | PollInbound / PushInbound |
| connector:crew:inbound | 机组 | PollInbound / PushInbound |
| connector:pairing:inbound | 配对 | PollInbound |
| connector:roster:inbound | 排班 | PollInbound |
| connector:roster_ground:inbound | 地面任务/单段飞行 | PollInbound（F8 import）|

> F8 全量同步采用 FlowProducer 串行链：`flight → pairing → roster → roster_ground`（子任务先完成，roster_ground 作为顶层最后执行，确保单段飞行可关联到已落库的航班）。

### 6.2 调度队列（connector-server 内部使用）

| 队列名 | 用途 | 触发来源 |
|--------|------|----------|
| connector:poll:trigger | 轮询任务触发 | BullMQ repeatable job / 手动 trigger |

Job Payload：

```typescript
interface InboundJob {
  connectorCode: string       // 来源连接器标识
  schema: string              // 航司 schema
  dataType: 'flight' | 'crew' | 'pairing' | 'roster' // 数据类型
  records: StandardRecord[]   // 标准格式数据
  sourceRef: string           // 来源批次号（幂等去重）
}
```

### 6.3 出向队列（live-server 生产，connector-server 消费）

| 队列名 | 数据域 | 触发来源 |
|--------|--------|----------|
| connector:roster:outbound | 排班发布 | live-server 排班发布事件 |

---

## 7. 四种协议处理器

| 处理器 | 触发方式 | 核心逻辑 |
|--------|----------|----------|
| PollInboundHandler | BullMQ repeatable job | 调外部 API → transform → 入队 |
| PushInboundHandler | Fastify 路由接收 | 验签 → transform → 入队 |
| PushOutboundHandler | roster-outbound-worker | 取排班 → transform → 推送 |
| QueryOutboundHandler | Fastify 路由响应 | 验签 → 查 DB 增量 → transform → 返回 |

---

## 8. Transform 插件系统

```typescript
interface TransformPlugin {
  // 入向：外部格式 → ROIS 标准格式
  toStandard(raw: unknown): StandardRecord

  // 出向：ROIS 标准格式 → 外部格式
  fromStandard(record: StandardRecord): unknown
}
```

- `transform_plugin` 为空时使用 `default.ts`（直通）
- 航司专属转换放 `transform/<schema>/` 目录
- 标准格式与 live-server 的 flight、crew、roster 内部模型对齐

---

## 9. API 端点

### 9.1 公开接口（外部航司调用，需认证）

```
POST /api/auth/token                    # OAuth 2.0 CC 换 token
POST /api/inbound/:connectorCode/flight # 接收航班数据推送
POST /api/inbound/:connectorCode/crew   # 接收机组数据推送
GET  /api/outbound/:connectorCode/roster # 查询排班增量数据
GET  /api/health                        # 健康检查（无需认证）
GET  /api/docs                          # Swagger UI（接口文档）
GET  /api/docs/json                     # OpenAPI JSON 格式
```

### 9.2 管理接口（内网，需 connector:admin scope）

```
GET    /api/admin/connectors            # 连接器列表
POST   /api/admin/connectors            # 新增连接器配置
PUT    /api/admin/connectors/:id        # 更新连接器配置
DELETE /api/admin/connectors/:id        # 删除连接器
POST   /api/admin/connectors/:id/trigger # 手动触发执行
GET    /api/admin/connectors/logs       # 查询执行日志
```

### 9.3 响应格式

与 live-server 保持一致：

```typescript
// 成功
{ code: 200, data: T, message: 'ok' }
// 失败
{ code: number, data: null, message: string }
```

---

## 10. 新航司接入流程

1. 在航司 schema 下执行 migration：`migrations/001_connector_tables.sql`
2. 通过管理接口 `POST /api/admin/connectors` 注册连接器配置
3. 若外部格式与标准格式有差异，在 `transform/<schema>/` 下添加插件
4. 通过 `POST /api/admin/connectors/:id/trigger` 手动触发验证
5. 确认日志 status=success 后，启用定时调度（`is_enabled=1`）

---

## 11. 配置示例

### 11.1 航班推送入向连接器

```json
{
  "connectorCode": "f8-flight-push",
  "connectorName": "F8 航班数据推送",
  "direction": "inbound",
  "protocol": "push_inbound",
  "dataDomain": "flight",
  "authType": "api_key",
  "authConfig": {
    "apiKey": "f8-api-key-001",
    "apiSecret": "f8-secret-encrypted"
  },
  "endpointConfig": {
    "url": "https://api.f8airline.com/flight/push",
    "timeout": 30000
  },
  "transformPlugin": "f8/flight",
  "isEnabled": 1
}
```

### 11.2 排班出向推送连接器

```json
{
  "connectorCode": "f8-roster-push",
  "connectorName": "F8 排班发布推送",
  "direction": "outbound",
  "protocol": "push_outbound",
  "dataDomain": "roster",
  "authType": "oauth2_cc",
  "authConfig": {
    "clientId": "f8-ro-client",
    "clientSecret": "f8-ro-secret-encrypted",
    "tokenUrl": "https://auth.f8airline.com/oauth/token",
    "scopes": ["roster:write"]
  },
  "endpointConfig": {
    "url": "https://api.f8airline.com/roster/receive",
    "timeout": 60000
  },
  "transformPlugin": "f8/roster",
  "isEnabled": 1
}
```

---

## 12. 运行与测试

```bash
# 安装依赖
cd connector-server
npm install

# 开发模式
npm run dev

# 构建
npm run build

# 生产运行
npm start

# 测试
npm test

# 初始化测试账号（数据库）
npx tsx scripts/init-test-db.ts

# 运行接口测试
./test-connector.sh
```

---

## 13. 测试账号配置

### 13.1 API Key 认证测试账号

| 项目 | 值 |
|------|-----|
| API Key | `f8-test-api-key` |
| API Secret | `f8-test-secret-2026` |

**测试连接器：**

| 连接器代码 | 用途 | 方向 |
|-----------|------|------|
| `f8-flight-test` | 航班推送测试 | inbound |
| `f8-crew-test` | 机组推送测试 | inbound |
| `f8-roster-query-test` | 排班查询测试 | outbound |

**请求示例：**

```bash
# 生成签名
timestamp=$(date +%s)
body='{"data":{"flightNo":"CA1234","depDate":"2026-05-01"}}'
body_hash=$(echo -n "$body" | sha256sum | cut -d' ' -f1)
payload="f8-test-api-key.${timestamp}.${body_hash}"
signature=$(echo -n "$payload" | openssl dgst -sha256 -hmac "f8-test-secret-2026" | cut -d' ' -f2)

# 发送请求
curl -X POST "https://crew-f8-usva-tst.roiscloud.com/fpqe/connector/inbound/flight/f8-flight-test" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: f8-test-api-key" \
  -H "X-Timestamp: $timestamp" \
  -H "X-Signature: $signature" \
  -d "$body"
```

### 13.2 OAuth 2.0 认证测试账号

| 项目 | 值 |
|------|-----|
| Client ID | `f8-oauth-client` |
| Client Secret | `f8-oauth-secret-2026` |
| Scopes | `connector:read`, `connector:write` |

**获取 Token：**

```bash
curl -X POST "https://crew-f8-usva-tst.roiscloud.com/fpqe/connector/auth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=f8-oauth-client&client_secret=f8-oauth-secret-2026&scope=connector:read"
```

**使用 Token：**

```bash
curl -X POST "https://crew-f8-usva-tst.roiscloud.com/fpqe/connector/inbound/flight/f8-oauth-test" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access_token>" \
  -d '{"data":{"flightNo":"CA1234","depDate":"2026-05-01"}}'
```

---

## 14. Nginx 配置

connector-server 通过 Nginx 反向代理对外提供服务：

```nginx
# connector-server (外部系统对接) on 10.15.12.3:3004
# Swagger UI - rewrite absolute paths in HTML
location = /fpqe/connector/docs {
    proxy_pass http://10.15.12.3:3004/api/docs;
    proxy_set_header Host $host;
    proxy_set_header Accept-Encoding "";
    sub_filter '/api/' '/fpqe/connector/';
    sub_filter_once off;
    sub_filter_types application/javascript text/css;
}

location ^~ /fpqe/connector/docs/static/ {
    proxy_pass http://10.15.12.3:3004/api/docs/static/;
}

location ^~ /fpqe/connector/docs/json {
    proxy_pass http://10.15.12.3:3004/api/docs/json;
}

# connector-server API
location ^~ /fpqe/connector/ {
    proxy_pass http://10.15.12.3:3004/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_http_version 1.1;
    proxy_connect_timeout 300s;
    proxy_read_timeout 600s;
}
```

**外部访问地址：**

- Swagger UI: `https://crew-f8-usva-tst.roiscloud.com/fpqe/connector/docs`
- API 端点: `https://crew-f8-usva-tst.roiscloud.com/fpqe/connector/<endpoint>`

---

## 15. F8 Connector 实现（2026-05-05）

### 15.1 概述

F8 航空 connector 已完整实现入向轮询对接，支持：
- **Crew**：全量机组数据拉取（每 4 小时）
- **Flight**：航班计划数据拉取（未来 30 天，每小时）
- **Pairing**：执勤配对任务拉取（未来 60 天，每 2 小时）
- **Roster-Flight**：机组排班明细拉取（未来 30 天，每小时）

### 15.2 F8 认证机制

F8 使用**自定义 Token 认证**（非标准 OAuth2）：

```typescript
// Token 请求
POST https://ceje1h57tg.execute-api.ca-central-1.amazonaws.com/Dev/third/auth/getToken
Body: { clientId: "ROIS", timestamp: <unix_seconds>, sign: "f7a2c9e1b4d83f6a0e5c2b7d9f1a4e8c" }

// Token 响应
{ accessToken: "<token>", accessTokenExpirationTime: "<ISO_datetime>" }

// 业务请求 Header
AuthorizationToken: <accessToken>  // 注意：非标准 Bearer 格式
```

**实现文件**：
- `src/services/auth/f8-token-auth.ts` - Token 获取 + Redis 缓存（30s 刷新缓冲）
- `src/services/protocols/poll-inbound.ts` - 401/403 自动重新获取 Token

### 15.3 F8 Transform 插件

| 插件标识 | 文件 | 核心业务规则 |
|---------|------|-------------|
| `f8/crew` | `transform/f8/crew.ts` | 职级优先级 CA > FO；CAP/CP → CA 归一化；RHS 证书过滤 |
| `f8/flight` | `transform/f8/flight.ts` | `fltId` → `flightNo`；`datOp` 提取日期 |
| `f8/pairing` | `transform/f8/pairing.ts` | `actingRank` 归一化；配对任务结构转换 |
| `f8/roster-flight` | `transform/f8/roster-flight.ts` | `pairingId=0` 过滤（SIM/DHD 不参与排班） |
| 共享工具 | `transform/f8/utils.ts` | `normalizeRank()` 函数 |

**职级归一化规则**：
- `CAP` / `CP` → `CA`（机长）
- `FO` 保持不变（副驾）

**SIM/DHD 过滤**：
```typescript
// roster-flight.ts
if (r.pairingId === 0) {
  throw new Error('SIM/DHD record: pairingId=0, skip this record')
}
```

### 15.4 BullMQ 队列配置

新增队列（`src/plugins/bullmq.ts`）：

| 队列名 | 用途 |
|--------|------|
| `connector.pairing.inbound` | Pairing 数据入向队列 |
| `connector.roster.inbound` | Roster 数据入向队列 |
| `connector.poll.trigger` | 轮询触发队列（调度器使用） |

**Worker 实现**：
- `src/workers/poll-inbound-worker.ts` - 消费 `connector.poll.trigger`，执行轮询任务

### 15.5 数据库配置（f8 schema）

Seed 文件：`sql/seed/f8/10_connector_f8.sql`

| connector_code | data_domain | schedule_cron | pollBodyDays |
|----------------|-------------|---------------|--------------|
| f8-crew | crew | `0 */4 * * *` | -（全量拉取） |
| f8-flight | flight | `0 * * * *` | 30 |
| f8-pairing | pairing | `0 */2 * * *` | 60 |
| f8-roster-flight | roster | `0 * * * *` | 30 |

### 15.6 POST 请求日期范围计算

```typescript
// poll-inbound-worker.ts
if (endpointConfig.method === 'POST' && endpointConfig.pollBodyDays) {
  const today = new Date()
  pollConfig = {
    startDt: format(today, 'yyyy-MM-dd'),
    endDt: format(addDays(today, endpointConfig.pollBodyDays), 'yyyy-MM-dd'),
  }
}
```

### 15.7 重试机制

| 数据域 | timeout | retryCount | retryDelay |
|--------|---------|------------|------------|
| Crew | 60s | 3 | 2s |
| Flight | 30s | 2 | 2s |
| Pairing | 30s | 2 | 2s |
| Roster | 30s | 2 | 2s |

### 15.8 测试覆盖

| 测试文件 | 测试数 | 覆盖范围 |
|---------|--------|---------|
| `f8-token-auth.test.ts` | 5 | Token 获取、缓存、刷新 |
| `f8-transforms.test.ts` | 29 | 4 个 Transform 插件 + 注册验证 |
| `poll-inbound-post.test.ts` | 6 | POST 请求、重试、Token 刷新 |

### 15.9 手动触发测试

```bash
# 通过管理接口触发轮询
curl -X POST http://localhost:3004/api/admin/connectors/f8-crew/trigger \
  -H "Authorization: Bearer <admin-token>"
```

---

## 16. 未来扩展

- 其他数据域（酒店、疲劳、薪资）按相同模式增加 `data_domain` 枚举
- 文件传输（SFTP/FTP）新增 `SftpInboundHandler` 等
- SITA/ACARS 等航空专有协议作为特殊 Transform 插件处理
- 新航司接入参考 F8 实现模式