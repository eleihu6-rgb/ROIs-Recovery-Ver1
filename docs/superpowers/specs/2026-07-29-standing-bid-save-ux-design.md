# Standing Bid 保存体验修复设计

## 问题

Standing Bid 新增或编辑条件时，保存响应会先更新 TanStack Query 缓存。共享
`RuleBidRightPanel` 随即用外部数据重新初始化本地状态，导致仍处于 pending 的弹窗先恢复为
默认值；稍后弹窗才关闭、Existing 列表才稳定更新。用户会误以为输入被清空或保存失败。

## 目标体验

- 点击 `ADD BID` / `UPDATE BID` 后，弹窗保留用户已经填写的全部内容。
- 保存期间控件和关闭操作不可用，主按钮显示 `ADDING...` / `UPDATING...`。
- 保存成功后，Existing 列表立即显示服务端确认的数据，并关闭弹窗。
- 保存失败时不关闭弹窗、不清空输入，通过项目统一消息入口提示错误，允许用户直接重试。

## 设计

在共享 `RuleBidRightPanel` 中同时修正 hydration 时序和编辑草稿归属：

1. 打开编辑弹窗后，面板为该弹窗保存独立的 property 草稿；列表的乐观更新或失败回滚不能
   覆盖这份草稿。取消或成功关闭弹窗时才清理草稿。
2. mutation pending 时，新的 query data 仍可进入页面；如果新的 `viewResetKey` 与当前视图
   相同，则暂不消费这次 hydration，也不更新 `lastHydrationKey`。使用同步 ref 判断 pending，
   避免 React state 尚未提交时发生抢跑。
3. 如果 pending 期间 `viewResetKey` 已变化（例如 period/context 切换），仍按现有规则立即
   重置视图，不能延迟真正的页面切换。每次 mutation 启动时记录当前 `viewResetKey` 和递增
   token；视图重置时使该 token 失效。旧请求随后无论成功或失败，都不得再更新新视图的
   Existing 列表、saved baseline、弹窗草稿、pending 状态或成功/失败消息。
4. mutation 成功后按以下顺序完成：
   - 写入服务端确认的 Existing 快照和 saved baseline；
   - 关闭弹窗并清理独立草稿；
   - 清除 pending；
   - 消费此前暂缓的同视图 hydration，与 query cache 最终对齐。
5. mutation 失败时，Existing 列表可以回滚到已保存快照，但独立弹窗草稿不回滚；只清除
   pending 并通过统一 `message.error` 提示，用户可以用原输入直接重试。

该修复放在共享 hydration 状态协调层，不增加 Standing 专用定时器或硬编码分支，不修改
Standing/Current Bid 的业务 payload、API 或数据库。

## 范围

- `pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx`
- 对应组件测试、Standing 页面测试及 Playwright 回归
- Standing Bid QA 人工测试案例

不修改后端、数据库、条件可见性和条件业务规则。

## 验收

1. 使用可控 Promise 延迟 Standing 保存响应；pending 中即使 query data 改变，弹窗输入和
   当前列表也不闪烁，主按钮显示 pending 文案，且不能重复提交或关闭。
2. 成功响应后按“服务端快照和 baseline → 关闭弹窗 → 清除 pending → deferred hydration”
   的顺序完成，新行或更新内容立即可见。
3. 失败响应后 Existing 列表回滚，但弹窗仍保留用户输入；按钮恢复，使用原输入重试可成功。
4. pending 中同一 `viewResetKey` 的 hydration 被延迟；不同 `viewResetKey` 的 period/context
   重置不被阻止。可控 Promise 还要覆盖：切换到新视图后旧请求成功或失败，新视图状态均
   保持不变。
5. Current Bid 在无 mutation 时仍能正常 hydration，已有新增和编辑保存流程不回归。
6. Playwright 人为延迟 Standing 保存接口，验证视觉上不清空、成功后列表更新并关闭。
7. 相关 Vitest、Playwright、构建和 UI Standard Gate 通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 状态变化集中在同一共享组件和同一条异步时序，拆分实现容易产生竞态。
- Suggested split: 单人完成实现、自动化测试和真实页面验证。
- Write boundaries: 共享面板、相关测试和 Standing QA 用例。
- Conflict risk: Low。
- Execution gate: 用户已确认采用共享 hydration 根治方案。
