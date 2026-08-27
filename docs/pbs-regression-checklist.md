# PBS 回归清单

> 这份清单描述 PBS 长期维护时应优先守住的回归面。
> 快速统一校验入口见仓库根命令：`npm run verify:pbs`。

## 默认校验入口

- `npm run verify:pbs`
  - `pbs-server`: `npm test`
  - `pbs-server`: `npm run build`
  - `pbs-server`: `npm run sync:pbs-users -- --dry-run`
  - `pbs-portal`: `npm test`
  - `pbs-portal`: `npm run lint`
  - `pbs-portal`: `npm run build`

- `npm run verify:pbs:e2e`
  - 在默认校验基础上追加 `pbs-portal` 的 `Playwright` 流程

## 什么时候至少要跑默认校验

- 改认证链路
- 改 `pbs_user` 字段或同步逻辑
- 改 `pbs-server` 路由、响应格式或认证插件
- 改 `pbs-portal` 登录、路由守卫、请求封装或会话恢复
- 改跨模块字段命名或接口返回结构

## 什么时候要补跑 E2E

- 改登录页主流程
- 改受保护路由跳转逻辑
- 改首页到关键业务页的导航链路
- 改 `Pairing`、`Days Off`、`Reserve` 这类关键页面的核心交互骨架

## PBS Server 重点回归面

- `auth`
  - 登录成功
  - 错误密码
  - 无权限账号
  - 会话解析
  - Bearer token 缺失或失效

- `sync`
  - `users -> pbs_user` 共享字段映射
  - `dry-run` 不落库
  - 缺失 `crew_id` 映射时的安全退出
  - 防止误停用全量账号

- `schema`
  - `pbs_user` 与 `users` 的共享字段命名是否仍对齐
  - 迁移文件、schema 文件、Drizzle model 是否同步更新

## PBS Portal 重点回归面

- `auth`
  - 登录成功
  - token 存储
  - 初始化恢复会话
  - 登出清理状态

- `routing`
  - `/` 跳转
  - `/portal/*` 兼容重定向
  - `/auth/callback` 兼容入口
  - 受保护路由拦截

- `page smoke`
  - `Dashboard`
  - `Days Off`
  - `Pairing`
  - `Reserve`
  - `Layer`
  - `Award`

## 变更后的更新要求

- 如果新增关键页面或关键链路，需要同步更新：
  - 对应测试
  - `verify:pbs` 相关说明
  - 本回归清单
