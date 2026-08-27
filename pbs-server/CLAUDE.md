# PBS Server 开发规范

PBS 机组申请后端，端口 3002。与 Live Server 完全解耦，独立部署。

## 技术栈

- Fastify + TypeScript + Drizzle ORM + 独立 Redis 实例 + BullMQ

## 目录结构

```
src/
├── config/          # 配置（独立数据库连接池、独立 Redis）
├── routes/          # Fastify 路由
├── services/        # 业务逻辑
├── models/          # Drizzle ORM schema 定义
├── plugins/         # Fastify 插件
├── utils/           # 工具函数
└── index.ts         # 入口文件
```

## 性能隔离（重点）

PBS 面临最多 5000 组员同时使用：
- **独立 PostgreSQL 连接池**（pgBouncer），不与 Live Server 争抢连接
- **独立 Redis 实例**，session 和热数据隔离
- 水平扩展（2-4 实例 + Nginx 负载均衡）
- 申请提交走 BullMQ 队列削峰
- Redis 缓存高频查询（排班周期、班表数据，TTL 30min）

## 缓存一致性

与 Live Server 相同策略（Cache-Aside），详见 `live-server/CLAUDE.md`。

PBS 特有缓存：

| 数据类型 | TTL | 说明 |
|---------|-----|------|
| PBS 排班周期/班表 | 30min | 修改时主动删缓存 |

## 安全设计

- `pbs_user` 与内部 `users` 表完全分开，机组 App 账号独立管理
- 密码前端 RSA 加密传输，后端解密后 bcrypt 哈希存储
- JWT 认证，`token_version` 用于修改密码后使旧 JWT 失效

## API 响应格式

与 Live Server 统一：
```typescript
{ code: 200, data: T, message: 'ok' }
{ code: number, data: null, message: string }
```

## 测试

### 单元测试 (Vitest)
- 申请校验、权限逻辑

### 集成测试 (Vitest)
- API + 数据库 + 缓存一致性 + 并发场景
