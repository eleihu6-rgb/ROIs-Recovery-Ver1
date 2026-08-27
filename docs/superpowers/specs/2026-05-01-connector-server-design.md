# Connector Server 设计文档

**日期：** 2026-05-01  
**模块：** `connector-server`  
**端口：** 3004  
**状态：** 待实施

---

## 1. 背景与目标

ROIS-AI 系统需要与各家航司的第三方系统进行数据交换，包括接收航班计划、机组基础数据，以及向外发布排班结果。各航司对接形式各异（REST 推送、轮询、文件等），但与 live-server 的内部对接需要逐步标准化。

**目标：**

- 提供一套标准的对接接口，新航司优先通过标准接口接入
- 无法适配标准接口时，通过航司专属 transform 插件处理差异
- 与 live-server 通过 BullMQ 解耦，避免直接写库
- 提供系统间安全认证机制（API Key + OAuth 2.0 可升级）

---

## 2. 技术栈

与 live-server 保持一致：

| 组件 | 技术 |
|------|------|
| HTTP 框架 | Fastify 5 + TypeScript |
| ORM | Drizzle ORM |
| 数据库 | PostgreSQL 16（复用 rois 库，各航司 schema 隔离） |
| 缓存 | Redis 7 |
| 消息队列 | BullMQ |
| 校验 | Zod |
| 测试 | Vitest |

---

## 3. 整体架构

### 3.1 与其他服务的关系

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
    │  特殊读：直接查 PostgreSQL（QueryOutbound 增量查询，避免 live-server 额外开接口）
    ▼
live-server (3000) ←→ PostgreSQL / Redis
    │
    ▼  (C) 我们主动推送排班数据给对方    (D) 对方调我们接口查询增量排班
外部航司系统
```

### 3.2 目录结构

```
connector-server/
├── src/
│   ├── config/
│   │   ├── env.ts               # Zod 环境变量
│   │   └── index.ts
│   ├── plugins/
│   │   ├── database.ts          # PostgreSQL 连接池
│   │   ├── redis.ts             # Redis 连接
│   │   ├── bullmq.ts            # BullMQ 连接与队列定义
│   │   └── auth.ts              # 全局鉴权钩子
│   ├── routes/
│   │   ├── inbound/
│   │   │   └── push-inbound.ts  # POST /api/inbound/:connectorCode/*
│   │   ├── outbound/
│   │   │   └── query-outbound.ts # GET /api/outbound/:connectorCode/roster
│   │   ├── admin/
│   │   │   ├── connector.ts     # 连接器配置 CRUD
│   │   │   └── log.ts           # 执行日志查询
│   │   ├── auth.ts              # POST /api/auth/token
│   │   └── health.ts
│   ├── services/
│   │   ├── connector/
│   │   │   ├── connector-config-service.ts   # 配置加载与缓存
│   │   │   └── connector-scheduler.ts        # 轮询调度（BullMQ repeatable jobs）
│   │   ├── protocols/
│   │   │   ├── protocol-handler.ts           # ProtocolHandler 接口定义
│   │   │   ├── poll-inbound.ts               # 轮询外部 API 拉取数据
│   │   │   ├── push-inbound.ts               # 接收外部推送数据
│   │   │   ├── push-outbound.ts              # 主动推送数据给外部
│   │   │   └── query-outbound.ts             # 提供增量查询接口逻辑
│   │   └── auth/
│   │       ├── api-key-auth.ts               # API Key + HMAC 验签
│   │       └── oauth2-cc-auth.ts             # OAuth 2.0 Client Credentials
│   ├── transform/
│   │   ├── base.ts              # TransformPlugin 接口
│   │   ├── default.ts           # 默认直通 transform
│   │   ├── f8/                  # F8 航司专属 transforms（按需添加）
│   │   └── tg/                  # TG 航司专属 transforms（按需添加）
│   ├── workers/
│   │   └── roster-outbound-worker.ts  # 监听 connector:roster:outbound
│   ├── models/
│   │   ├── connector-config.ts  # Drizzle schema: connector_config
│   │   └── connector-log.ts     # Drizzle schema: connector_log
│   ├── utils/
│   │   ├── response.ts          # 统一响应格式（与 live-server 一致）
│   │   └── crypto.ts            # HMAC 签名工具
│   └── index.ts
├── package.json
└── tsconfig.json
```

---

## 4. 数据库表设计

所有表按各航司 schema 隔离（与现有规范一致）。

### 4.1 `connector_config` — 连接器注册表

```sql
CREATE TABLE connector_config (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  connector_code    varchar(50)  NOT NULL UNIQUE,
  connector_name    varchar(100) NOT NULL,
  direction         varchar(20)  NOT NULL,  -- inbound | outbound
  protocol          varchar(20)  NOT NULL,  -- poll_inbound | push_inbound | push_outbound | query_outbound
  data_domain       varchar(20)  NOT NULL,  -- flight | crew | roster
  auth_type         varchar(20)  NOT NULL,  -- api_key | oauth2_cc
  auth_config       jsonb        NOT NULL,  -- 加密存储（key/secret/token_url 等）
  endpoint_config   jsonb        NOT NULL,  -- url, headers, timeout 等
  schedule_cron     varchar(50),            -- 仅 poll_inbound 有效
  transform_plugin  varchar(100),           -- 可选，航司专属 transform 模块标识，如 'f8/flight'（对应 transform/f8/flight.ts）
  is_enabled        smallint     NOT NULL DEFAULT 1,
  is_deleted        smallint     NOT NULL DEFAULT 0,
  created_by        varchar(50)  NOT NULL,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_by        varchar(50)  NOT NULL,
  updated_at        timestamptz  NOT NULL DEFAULT now()
);
```

### 4.2 `connector_log` — 执行日志

```sql
CREATE TABLE connector_log (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  connector_id     bigint       NOT NULL REFERENCES connector_config(id),
  direction        varchar(20)  NOT NULL,
  status           varchar(20)  NOT NULL,  -- success | fail | partial
  records_in       int          NOT NULL DEFAULT 0,
  records_out      int          NOT NULL DEFAULT 0,
  error_message    text,
  duration_ms      int,
  executed_at      timestamptz  NOT NULL DEFAULT now()
);

-- 日志只保留 30 天
CREATE INDEX idx_connector_log_executed_at ON connector_log(executed_at);
```

---

## 5. 安全认证

### 5.1 对外暴露接口的认证（外部调我们）

#### API Key + HMAC 签名（默认）

每家航司在 `connector_config` 中分配独立 API Key 和 Secret。外部系统请求时需携带签名头：

```
X-Api-Key: <api_key>
X-Timestamp: <unix_timestamp_seconds>
X-Signature: HMAC-SHA256(api_key + "." + timestamp + "." + SHA256(body), secret)
```

**防重放机制：** `X-Timestamp` 与服务器时间差超过 300 秒则拒绝请求（返回 401）。

#### OAuth 2.0 Client Credentials（高安全需求航司）

航司使用 `client_id` + `client_secret` 调用 token 接口换取短期 JWT：

```
POST /api/auth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id=<id>&client_secret=<secret>
```

返回 JWT（有效期 1 小时），后续请求携带 `Authorization: Bearer <token>`。

**JWT Payload：**

```typescript
interface ConnectorTokenPayload {
  clientId: string       // 航司唯一标识
  schema: string         // 航司 schema（如 'f8'）
  scopes: string[]       // 权限范围，如 ['flight:write', 'roster:read', 'connector:admin']
  type: 'connector'      // 区分人员 JWT
}
```

与 live-server 复用相同 JWT 签名密钥，`type: 'connector'` 字段区分来源。

### 5.2 调外部接口的认证（我们调航司）

认证参数存于 `connector_config.auth_config`（jsonb，敏感字段加密存储，不明文）。`oauth2-cc-auth.ts` 负责在每次请求前自动获取/刷新 token，token 缓存于 Redis（TTL = expires_in - 60s）。

### 5.3 管理接口保护

`/api/admin/*` 要求 `scope: connector:admin`，仅由具有管理员权限的 live-server 操作员账号调用，不对外部航司系统开放。

---

## 6. BullMQ 队列设计

### 6.1 入向队列（connector-server 生产，live-server 消费）

| 队列名 | 数据域 | 触发来源 |
|--------|--------|----------|
| `connector:flight:inbound` | 航班 | PollInbound / PushInbound |
| `connector:crew:inbound` | 机组 | PollInbound / PushInbound |

**Job Payload：**

```typescript
interface InboundJob {
  connectorCode: string   // 来源连接器标识
  schema: string          // 航司 schema
  dataType: 'flight' | 'crew'
  records: StandardRecord[]  // 已完成 transform 的标准格式数据
  sourceRef: string       // 来源批次号/时间戳，用于幂等去重
}
```

`sourceRef` 作为 BullMQ job ID 前缀，启用 deduplication 防止重复入队。

### 6.2 出向队列（live-server 生产，connector-server 消费）

| 队列名 | 数据域 | 触发来源 |
|--------|--------|----------|
| `connector:roster:outbound` | 排班发布 | live-server 排班发布事件 |

connector-server 的 `roster-outbound-worker.ts` 监听此队列，查 `connector_config` 找到所有启用的 `push_outbound` 连接器，执行 `PushOutboundHandler` 主动推送。`query_outbound` 是被动查询模式，由外部系统主动调用，不由 worker 触发。

---

## 7. 四种协议处理器

所有处理器实现统一接口：

```typescript
interface ProtocolHandler {
  execute(config: ConnectorConfig): Promise<ExecuteResult>
}

interface ExecuteResult {
  status: 'success' | 'fail' | 'partial'
  recordsIn: number
  recordsOut: number
  errorMessage?: string
  durationMs: number
}
```

| 处理器 | 触发方式 | 核心逻辑 |
|--------|----------|----------|
| `PollInboundHandler` | BullMQ repeatable job（按 `schedule_cron`） | 带时间范围调外部 API → transform.toStandard() → 入队 `connector:*:inbound` |
| `PushInboundHandler` | Fastify 路由接收 POST 请求 | 验签/鉴权 → transform.toStandard() → 入队 `connector:*:inbound` |
| `PushOutboundHandler` | `roster-outbound-worker` 消费队列 | 取排班数据 → transform.fromStandard() → 调外部 API → 记录日志 |
| `QueryOutboundHandler` | Fastify 路由响应 GET 请求 | 验签/鉴权 → 直接查 PostgreSQL 增量 → transform.fromStandard() → 返回 |

### 7.1 Transform 插件规范

```typescript
interface TransformPlugin {
  // 入向：外部格式 → ROIS 标准格式
  toStandard(raw: unknown): StandardRecord

  // 出向：ROIS 标准格式 → 外部格式
  fromStandard(record: StandardRecord): unknown
}
```

- `connector_config.transform_plugin` 为空时使用 `default.ts`（直通，假设外部格式与标准格式一致）
- 标准格式与 live-server 的 flight、crew、roster 内部模型对齐
- 航司专属 transform 放 `transform/<schema>/` 目录，按需创建

---

## 8. API 端点

### 8.1 公开接口（外部航司调用，需认证）

```
# 认证
POST /api/auth/token                              # OAuth 2.0 CC 换 token

# 入向：接收外部推送
POST /api/inbound/:connectorCode/flight           # 接收航班数据推送
POST /api/inbound/:connectorCode/crew             # 接收机组数据推送

# 出向：提供增量查询
GET  /api/outbound/:connectorCode/roster          # 查询排班增量数据
     ?from=<ISO8601>&to=<ISO8601>&page=&size=

# 健康检查（公开，无需认证）
GET  /api/health
```

### 8.2 管理接口（内网，需 connector:admin scope）

```
GET    /api/admin/connectors                      # 连接器列表
POST   /api/admin/connectors                      # 新增连接器配置
PUT    /api/admin/connectors/:id                  # 更新连接器配置
DELETE /api/admin/connectors/:id                  # 删除连接器
POST   /api/admin/connectors/:id/trigger          # 手动触发一次执行
GET    /api/admin/connectors/:id/logs             # 查询执行日志
       ?from=&to=&status=&page=&size=
```

### 8.3 响应格式

与 live-server 保持一致：

```typescript
// 成功
{ code: 200, data: T, message: 'ok' }
// 失败
{ code: number, data: null, message: string }
```

---

## 9. 测试策略

| 层级 | 工具 | 覆盖点 |
|------|------|--------|
| 单元测试 | Vitest | 四种协议处理器逻辑、transform 插件、HMAC 签名验证、OAuth token 缓存刷新 |
| 集成测试 | Vitest | 完整入向流程（mock 外部 API → 入队 → 验证 job payload）；完整出向流程（入队 → mock 外部接口调用 → 验证日志写入） |
| 认证测试 | Vitest | API Key 签名过期拒绝（>300s）、重放攻击拒绝、OAuth token scope 校验、未授权访问管理接口 |

覆盖率目标：业务逻辑 ≥ 80%，认证/安全路径 100%。

---

## 10. 上线流程（新航司接入）

1. 在对应航司 schema 下执行 connector_config 建表 migration
2. 通过管理接口 `POST /api/admin/connectors` 注册连接器配置
3. 若外部格式与标准格式有差异，在 `transform/<schema>/` 下添加 transform 插件
4. 通过 `POST /api/admin/connectors/:id/trigger` 手动触发一次验证
5. 确认日志 status=success 后，启用定时调度（`is_enabled=1`）

---

## 11. 未来扩展

- 其他数据域（酒店、疲劳、薪资等）按相同模式增加 `data_domain` 枚举和对应队列
- 若需要文件传输（SFTP/FTP），在协议处理器层新增 `SftpInboundHandler` 等，核心 transform 和队列逻辑不变
- SITA/ACARS 等航空专有协议作为特殊 transform 插件处理
