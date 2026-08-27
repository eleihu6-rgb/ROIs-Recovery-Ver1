# PBS Standing Bid 单页合并实施计划

日期：2026-07-28

关联设计：
`docs/superpowers/specs/2026-07-28-pbs-standing-bid-unified-page-design.md`

## 目标

把 Standing Lineholder 与 Standing Reserve 条件显示在同一个 Bid 风格页面中，同时保持两份 draft、版本号、保存请求和缓存完全独立。

## 实施顺序

### 1. 统一页面模型

- 将 Standing query 从按 mode 查询改为一次读取完整 current response。
- mapper 同时保留 `lineholder` 和 `reserve` 两份完整 draft metadata。
- 为 Existing 和 Available 行附加来源 context、分类与原始 `rowSeq`。
- 按已确认的稳定比较器合并 Existing 列表。

验证：

- mapper focused tests 覆盖双 context、五个分类、稳定排序和目标 context payload 重建。

### 2. Standing 页面与 Bid UI 对齐

- 删除顶部 `Lineholder / Reserve` Tab。
- 页面只保留一个 `EXISTING STANDING BID` 和一个 `ADD STANDING BID`。
- Available 分类使用 Current Bid 的下划线 Tab 视觉：
  `ALL PROPERTIES / DAYS OFF / PAIRING / ROSTER / RESERVE`。
- Existing 行使用 Current Bid 的扁平列表视觉和类型标签。
- 不显示收藏、日历或独立 `Standing` 分类。

验证：

- 页面 component tests 验证结构、分类与无模式 Tab。

### 3. 独立 mutation routing

- 新增、编辑、删除根据行的来源 context 选择保存目标。
- 每次只从目标 context 的行重建完整 payload。
- 成功后只更新 Standing query cache。
- `409` 显示恢复提示，并只刷新 Standing current query。

验证：

- component tests 分别验证 Lineholder / Reserve 的 mode、metadata 和 properties。
- 验证一类操作不进入另一类 payload。

### 4. E2E 与 QA

- 更新真实 Portal Playwright：
  - 无 mode Tab；
  - 五个分类；
  - Reserve 301/312/313/314；
  - 两类新增分别写入正确 context；
  - 两类 Existing 同时显示；
  - 1280 / 1366 / 1920 无横向溢出。
- 更新 Standing Bid QA 人工测试案例。

## 修改边界

- `pbs-portal/src/features/standing-bid/**`
- 为支持 Standing 展示变体，对 `rule-bids` 共享组件做向后兼容的可选 props 扩展
- `e2e/tests/pbs-portal/standing-bid-phase-one.spec.ts`
- `docs/test-cases/pbs/standing-bid/**`

不修改：

- pbs-server contract 与业务校验
- Current Bid 数据流和默认 UI 行为
- Standing editor 业务内容
- solver fallback

## 完成门禁

- Standing focused Vitest：PASS
- 共享 Rule Bid 受影响回归：PASS
- Standing Playwright：PASS
- `npm run check:ui`：硬违规 0
- `npm --prefix pbs-portal run lint`：PASS
- `npm --prefix pbs-portal run build`：PASS
- GitNexus `detect_changes`：仅预期模块和流程
