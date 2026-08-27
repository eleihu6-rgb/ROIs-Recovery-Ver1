# PBS 账号切换缓存隔离修复设计

## 背景

当前 PBS Portal 在退出账号或切换账号后，后一个账号会短暂或持续看到前一个账号的数据，需要手动强制刷新页面才能恢复。这已经影响到用户隔离边界，属于系统级严重问题。

已观察到的问题包括：

- 账号 A 退出后，账号 B 登录仍可能看到账号 A 的页面缓存。
- 账号 A 添加的 Pairing / DaysOff / Line / Reserve 条件，账号 B 登录后也可能先看到。
- Tier summary、Bidding calendar、current draft 等账号私有数据可能复用前一个账号的 React Query cache。

## 根因判断

前端认证状态切换时只处理了 token 和 zustand auth session：

- `clearAuthToken()`
- `writeAuthToken()`
- `useAuthSessionStore` 的 `status/user/authMode`

但没有清理 React Query 的全局缓存。当前多个账号私有 query key 都是固定值，不包含用户身份：

```text
["pairing", "page-data"]
["days-off", "page-data"]
["line", "page-data"]
["reserve", "page-data"]
["reserve", "coverage"]
["tier", "page-data"]
["bidding-calendar", "current"]
```

因此账号 A 登录后产生的缓存，在账号 B 登录后仍然命中同一组 query key。只要页面还没有重新从后端拉取完成，就可能展示账号 A 的数据；某些缓存状态下甚至会持续显示旧数据，直到用户强制刷新浏览器。

## 目标

在所有身份边界切换点清空账号私有前端缓存，确保不同账号之间不会复用任何 current draft、existing properties、calendar、tier summary 或本地 UI 选择态。

修复后应满足：

- 退出账号后，所有账号私有 React Query cache 被清空。
- 从账号 A 切换到账号 B 后，B 不会看到 A 添加过的条件。
- SSO 登录、密码登录、token 失效、手动 clear session 都走同一套缓存清理逻辑。
- 不依赖用户手动强制刷新页面。

## 范围

### 需要清理的缓存

清理 React Query 全局缓存：

```ts
queryClient.clear()
```

覆盖范围包括但不限于：

- Pairing 当前 draft 与 existing properties
- DaysOff 当前 draft 与 existing properties
- Line 当前 draft 与 existing properties
- Reserve 当前 draft 与 existing properties
- Reserve coverage
- Tier 页面数据
- Bidding calendar 当前周期数据
- Pairing search 页面依赖的 cached pairing page data

清理本地 UI store：

```ts
useBiddingCalendarStore.getState().resetActiveTierLabel()
```

避免账号切换后保留前账号正在查看的 Tx / Tier 选择态。

### 触发清理的身份边界

建议新增一个统一 helper，例如：

```ts
clearAuthenticatedClientState()
```

在以下路径调用：

- `login()` 开始前：避免旧账号缓存继续挂在登录过程中。
- `login()` 成功后：确保新 token 写入后页面只从新账号拉取数据。
- `login()` 失败后：确保失败时回到干净的未登录状态。
- `completeSsoFromToken()` 开始前与成功后。
- `completeSsoFromToken()` 失败后。
- `logout()` finally 中。
- `clearSession()`。
- `initialize()` 发现无 token、session API 返回 null、session API 报错时。

其中成功登录路径可以在写入新 token 前先清一次，再在 session 设置成功后保持干净状态。核心原则是：任何时候账号身份发生变化或失效，都不能保留上一身份的账号私有缓存。

## 非目标

本次不改后端 token 解析逻辑。

本次不把所有 query key 改成带 `crewId` 的形式。这个方案也可行，但改动面更大，且仍需要 logout 时清理 UI store。当前 bug 的最快稳定修复是身份边界全局清 cache。

本次不改业务数据表，不改 bid 保存逻辑。

## 方案比较

### 方案 A：身份边界统一清理缓存

在 auth store 中引入统一清理函数，所有登录/退出/失效路径调用。

优点：

- 改动小。
- 覆盖所有账号私有 query。
- 不需要逐个页面列 query key，漏修风险低。
- 能立即解决“后账号看到前账号条件”的问题。

缺点：

- 切换账号后所有页面都需要重新请求数据，这是正确且可接受的。

### 方案 B：所有 query key 加用户维度

例如：

```text
["pairing", "page-data", crewId]
```

优点：

- 理论上不同账号缓存自然隔离。

缺点：

- 改动范围较大，需要所有 hooks、cache setQueryData、invalidateQueries、测试同步调整。
- 仍需要 logout 时清理内存中的敏感数据，否则账号 A 的缓存仍留在浏览器内存里，只是不容易被账号 B 命中。

### 推荐

推荐先做方案 A。它是当前灾难 bug 的直接修复，覆盖面足够，风险低。

后续如果要优化多账号同窗口切换体验，可以再评估方案 B，但不能替代本次的 logout/login 清理。

## 实施设计

新增或内联一个清理函数：

```ts
const clearAuthenticatedClientState = () => {
  queryClient.clear();
  useBiddingCalendarStore.getState().resetActiveTierLabel();
};
```

优先放在 auth store 附近，例如：

```text
pbs-portal/src/features/auth/store/auth-client-state.ts
```

或直接在：

```text
pbs-portal/src/features/auth/store/use-auth-session-store.ts
```

如果只被 auth store 使用，内联即可；如果未来其它 auth 边界也要复用，可以独立成文件。

修改 `useAuthSessionStore`：

- `initialize()` 无 token 时清理缓存并设置 unauthenticated。
- `initialize()` session 返回 null 或失败时清理 token + 缓存。
- `login()` 发起前先清理旧缓存；成功写入 token 和 session；失败时清理 token + 缓存。
- `completeSsoFromToken()` 同 `login()`。
- `logout()` finally 中清理 token + 缓存 + session。
- `clearSession()` 清理 token + 缓存 + session。

## 测试设计

更新：

```text
pbs-portal/src/features/auth/store/use-auth-session-store.test.ts
```

新增测试点：

1. `logout()` 会清空 React Query cache。
2. `clearSession()` 会清空 React Query cache。
3. 账号 A 已有 `pairing/page-data` 缓存时，账号 B `login()` 成功后缓存为空或不会保留 A 的数据。
4. `completeSsoFromToken()` 成功后不会保留旧缓存。
5. `initialize()` 在 token 无效 / session API 失败时会清缓存。
6. `useBiddingCalendarStore.activeTierLabel` 会在身份边界重置。

测试中可以向 `queryClient` 写入一条模拟账号 A 的缓存：

```ts
queryClient.setQueryData(["pairing", "page-data"], {
  rightPanel: {
    existingProperties: [{ name: "A account condition" }],
  },
});
```

然后执行登录/退出动作，断言：

```ts
expect(queryClient.getQueryData(["pairing", "page-data"])).toBeUndefined();
```

## 验收标准

- 账号 A 添加 Pairing 条件后退出，账号 B 登录不再看到账号 A 的 Pairing 条件。
- 账号 A 添加 DaysOff / Line / Reserve 条件后退出，账号 B 登录不再看到账号 A 的条件。
- Dashboard calendar 和 Tier 页面不会复用前账号数据。
- 不需要手动刷新浏览器即可看到正确账号数据。
- `pbs-portal` auth store 相关测试通过。
- 前端 build/test 不因为缓存清理变更失败。

## 风险与注意事项

- `queryClient.clear()` 会清空所有 React Query 缓存，包括非账号私有数据。当前 PBS Portal 的主要 query 都与登录账号或当前业务上下文相关，清空是符合安全边界的。
- 登录成功后页面会重新加载数据，短时间显示 loading，这是合理行为。
- 如果未来引入真正的公共静态 query，可以再通过独立 query client 或重新 fetch 处理，不应为了公共缓存牺牲账号隔离。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 修复点集中在 auth store 和测试，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/auth/store/use-auth-session-store.ts`、相关测试，必要时新增一个 auth client state helper。
- Conflict risk: 低。
- Execution gate: 用户确认本设计后再进入实现。
