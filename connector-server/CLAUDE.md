# Connector Server 开发规范

外部系统对接服务，端口 3004。

## 技术栈

- Fastify + TypeScript + Drizzle ORM + Redis 7 + BullMQ

## 功能概述

connector-server 负责与航司第三方系统的数据交换：

- **入向（Inbound）**：接收航班、机组数据（推送/轮询）
- **出向（Outbound）**：发布排班结果（推送/查询）
- **认证**：API Key + HMAC 签名，OAuth 2.0 Client Credentials

## 目录结构

```
src/
├── config/          # 配置（数据库、Redis、环境变量）
├── routes/          # Fastify 路由
│   ├── inbound/     # 入向推送接口
│   ├── outbound/    # 出向查询接口
│   └── admin/       # 管理接口（连接器配置）
├── services/        # 业务逻辑
│   ├── connector/   # 连接器配置服务
│   ├── protocols/   # 协议处理器（poll/push/query）
│   └── auth/        # 认证服务（api-key/oauth2）
├── transform/       # 数据格式转换插件
├── workers/         # BullMQ 消费者
├── models/          # Drizzle ORM schema
├── plugins/         # Fastify 插件
└── utils/           # 工具函数
```

## API 响应格式

与 live-server 一致：

```typescript
// 成功
{ code: 200, data: T, message: 'ok' }
// 失败
{ code: number, data: null, message: string }
```

## 认证机制

- **对外接口**：API Key + HMAC 签名 或 OAuth 2.0 CC
- **管理接口**：需要 `connector:admin` scope

## BullMQ 队列

| 队列名 | 方向 | 说明 |
|--------|------|------|
| `connector:flight:inbound` | 入向 | 航班数据 → live-server |
| `connector:crew:inbound` | 入向 | 机组数据 → live-server |
| `connector:roster:outbound` | 出向 | 排班发布 → 外部系统 |

## 测试

- Vitest 单元测试 + 集成测试
- 覆盖率目标：业务逻辑 ≥80%，认证路径 100%