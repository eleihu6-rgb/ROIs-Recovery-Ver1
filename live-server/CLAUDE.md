# Live Server 开发规范

实时排班数据服务，端口 3000。

## 技术栈

- Fastify + TypeScript + Drizzle ORM + Redis 7 + BullMQ

## 目录结构

```
src/
├── config/          # 配置（数据库、Redis、环境变量）
├── routes/          # Fastify 路由（按功能模块拆分）
│   ├── auth/        # 认证路由（login, me）
│   ├── base/        # 基础数据路由（airport, base, timezone-options 等）
│   └── ...          # 其他业务路由
├── services/        # 业务逻辑
├── models/          # Drizzle ORM schema 定义
├── plugins/         # Fastify 插件
│   ├── auth.ts      # JWT 认证钩子（全局）
│   ├── database.ts  # PostgreSQL 连接池
│   ├── redis.ts     # Redis 连接
│   └── websocket.ts # WebSocket 支持
├── utils/           # 工具函数
└── index.ts         # 入口文件
```

## API 规范

- 路由按功能模块拆分文件，放在 `routes/` 下
- 业务逻辑放 `services/`，路由层只做参数校验和响应
- Drizzle ORM schema 定义放 `models/`
- 配置统一从 `config/` 导出，使用环境变量 + dotenv
- API 响应统一格式：
```typescript
// 成功
{ code: 200, data: T, message: 'ok' }
// 失败
{ code: number, data: null, message: string }
```

## 认证机制

**全局认证钩子:** `src/plugins/auth.ts`

**公开路由 (PUBLIC_PATHS):**
```typescript
const PUBLIC_PATHS = [
  '/api/auth/login',      // 用户登录
  '/api/health',          // 健康检查（监控）
  '/api/health/detail',   // 详细健康检查
]
```

**认证流程:**
1. 所有请求经过 `onRequest` 钩子
2. 公开路由直接放行
3. 其他路由检查 `Authorization: Bearer <token>`
4. JWT 验证成功 → `request.authUser` 携带用户信息
5. JWT 验证失败 → 返回 401

**JWT Payload:**
```typescript
interface AuthPayload {
  userCode: string
  userName: string
  schema: string    // 航司 schema（如 'f8'）
  isAdmin: number
}
```

**需要认证的路由示例:**
| 路由 | 说明 |
|------|------|
| `/base/timezone-options` | 时区选项（需认证） |
| `/api/crew` | 机组数据 |
| `/api/roster` | 排班数据 |

**注意:** 路由路径格式需与 `routes/*.ts` 中注册的路径一致，不带 `/api` 前缀（由 `index.ts` 统一添加）

## 缓存与数据库一致性策略

### 写操作：先写库，再更新缓存

```
1. 开启数据库事务 (BEGIN)
2. 执行数据库写操作 (INSERT/UPDATE/DELETE)
3. 事务提交成功 (COMMIT)
4. 删除/更新对应 Redis 缓存
5. 若步骤4失败 → 设置缓存过期时间兜底（TTL 自动淘汰）
```

**关键规则：**
- **禁止先写缓存再写库**：库写失败会导致缓存脏数据
- **缓存更新策略采用 Cache-Aside（旁路缓存）**：写时删缓存，读时回填
- **所有缓存必须设置 TTL**：即使更新失败，也能通过过期自动修复
- **批量操作使用 Redis Pipeline**：保证多个缓存 key 的原子性删除

### 读操作：缓存优先

```
1. 查询 Redis 缓存
2. 命中 → 直接返回
3. 未命中 → 查询数据库
4. 将数据库结果写入 Redis（设置 TTL）
5. 返回结果
```

### 缓存 TTL 分类

| 数据类型 | TTL | 说明 |
|---------|-----|------|
| 基础数据（机场/机型/航线） | 24h | 低频变更，高频读取 |
| 机组信息 | 4h | 中频变更 |
| 排班数据（roster/pairing） | 10min | 高频变更，短 TTL 兜底 |
| 法规配置 | 1h | 变更不频繁 |
| 用户会话 | 按 JWT 有效期 | 登出时删除 |

## 测试

### 单元测试 (Vitest)

- 每个 service 文件对应一个测试文件
- 可 mock 外部依赖（数据库、Redis、HTTP 请求等）

### 集成测试 (Vitest)

```
tests/
├── unit/            # 单元测试
├── integration/
│   ├── api/         # API 端点测试
│   └── cache/       # 缓存一致性测试
└── fixtures/        # 测试数据
```

缓存一致性专项测试（每个涉及缓存的 service 必须包含）：
- 写入 DB 后缓存应被清除
- 读取时缓存未命中应回填 Redis 并设置 TTL
- DB 事务回滚后缓存不应被更新
- 缓存删除失败时 TTL 应兜底过期
- 并发读写时不应出现缓存与 DB 数据不一致
- 批量更新后所有相关缓存 key 应被清除
