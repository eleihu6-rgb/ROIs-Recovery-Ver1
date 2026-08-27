# Admin / PBS Portal 登录凭据自动填充阻断实施计划

## 实施目标

在同一域名下，让 Admin 与 PBS Portal 登录页首次展示及受保护阶段始终保持空凭据；用户主动操作后仍可正常输入和登录。

## 步骤

1. 在 `@rois/ui` 增加可复用的凭据输入保护 hook，并为状态机、DOM 注入清理、主动解锁和 BFCache 重置补单元测试。
2. Admin 登录页接入保护 hook，删除延迟读取 autofill 的逻辑，提交时只读取受控 React state。
3. Portal 登录页接入同一保护 hook，保持现有加密登录、SSO 和 redirect 行为。
4. 更新 Admin / Portal Vitest 与 Playwright，验证明确 DOM 属性、主动输入和提交行为。
5. 新增 QA 人工用例，覆盖同一 Chrome profile 下 Portal → Admin → Portal 的密码库串填回归。
6. 运行相关 Vitest、Playwright、typecheck/build/lint、`npm run check:ui`，最后执行 GitNexus 变更影响检查。

## 写入边界

- `packages/ui/src/hooks/` 与公共导出
- `gantt/src/components/auth/login-page.tsx` 及登录测试
- `pbs-portal/src/features/auth/pages/login-page.tsx` 及登录测试
- `e2e/tests/gantt/`、`e2e/tests/pbs-portal/` 登录回归
- `docs/test-cases/pbs/auth/`

不修改认证 API、服务端、数据库及当前工作区已有 Pairing Search 文件。
