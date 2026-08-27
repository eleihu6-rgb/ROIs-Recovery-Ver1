# PBS Add Properties Footer 按钮清理设计

## 背景

PBS Portal 的 Days Off / Pairing / Line / Reserve 等条件页面复用同一套 Add Properties 区域。当前底部 footer 同时展示分页控件、`Cancel` 和 `Reset All`。

从用户视角看，这两个按钮存在明显误导：

- `Cancel` 和 `Reset All` 当前代码都触发同一个 `onReset`。
- `onReset` 只重置 Add Properties 区域的本地视图状态，例如 tab、搜索词、页码、编辑态。
- `onReset` 不会撤销或删除已经保存到 Existing Properties 的 bids。
- `Reset All` 文案容易被理解为“清空所有已申请条件”，风险高。
- 删除右侧按钮后，分页继续居中会显得悬浮，和表格区域关系不清晰。

## 目标

本次只做 Add Properties footer 的最小交互修正：

1. 移除 footer 右侧 `Cancel` 按钮。
2. 移除 footer 右侧 `Reset All` 按钮。
3. 保留分页能力。
4. 将分页控件靠右展示。
5. 保留左侧/中部的总数信息，使用户仍能看到当前列表数量。

## 非目标

本次不处理以下问题：

- 不调整 `BID` 列宽。
- 不调整 Add Properties 行内默认 bid 的展示方式。
- 不修改 `FAVORITED PROPERTIES` 命名或推荐逻辑。
- 不隐藏已添加过的 property。
- 不修改后端接口、数据库、业务保存逻辑。
- 不修改 Existing Properties 的新增、编辑、删除行为。

这些问题后续单独按小步改动处理。

## 当前行为

当前 footer 结构大致为：

- 中间：`Total N items` + 分页 + page size + go to page
- 右侧：`Cancel` + `Reset All`

两个按钮的实际行为相同，都会调用 `onReset`。

`onReset` 当前重置的是：

- Add Properties active tab 回到 `FAVORITED PROPERTIES`
- 搜索词清空
- 页码回到第一页
- 退出 available / existing 编辑态
- 恢复本地 available property 状态

它不是业务上的“取消申请”，也不是“清空所有申请”。

## 推荐方案

采用最小删除方案：

- 删除 footer 组件对 `cancelLabel`、`resetLabel`、`onCancel`、`onReset` 的按钮渲染。
- footer 只保留 `Total` 和分页区。
- footer 布局改为左右分布：
  - 左侧：`Total N items`
  - 右侧：上一页、页码、下一页、page size、go to page

推荐原因：

- 直接消除误导按钮。
- 不引入新的按钮文案。
- 不改变业务状态机。
- 不影响用户继续分页查找 property。
- 改动范围集中在共享 footer 组件和调用方类型。

## 备选方案

### 方案 A：只隐藏按钮，保留 props

优点：

- 改动最小。

缺点：

- `cancelLabel` / `resetLabel` / `onCancel` / `onReset` 仍留在组件契约里，后续容易误用。
- 代码语义仍然污染。

不推荐。

### 方案 B：按钮改名为 `Reset Filters`

优点：

- 保留一个重置搜索和分页的入口。

缺点：

- 当前 footer 没有复杂筛选，用户不需要额外按钮。
- 仍然占用视觉空间。
- 当前最主要问题是误导，应先删除。

不推荐。

## 影响范围

预计涉及：

- `pbs-portal/src/shared/components/pagination/available-properties-pagination-footer.tsx`
- `pbs-portal/src/features/rule-bids/components/rule-bid-right-panel-sections.tsx`
- 相关单元测试 / 页面测试中查找 `Cancel`、`Reset All` 的断言
- 必要时更新 PBS Portal QA 测试案例

不涉及：

- `pbs-server`
- 数据库 migration
- 登录认证
- bidding calendar
- bid 保存接口

## 验收标准

### UI

- Add Properties footer 不再出现 `Cancel`。
- Add Properties footer 不再出现 `Reset All`。
- `Total N items` 仍展示。
- 分页控件靠右展示。
- 上一页 / 下一页 / 页码 / Go to page 仍可正常使用。

### 行为

- 删除按钮后，不影响新增 property。
- 不影响编辑 existing property。
- 不影响删除 existing property。
- 不影响切换 `FAVORITED PROPERTIES` / `ALL PROPERTIES`。
- 不影响搜索 property。
- 不影响分页跳转。

### 测试

- 更新受影响的 `pbs-portal` 单元测试。
- 如果已有 E2E 覆盖 Add Properties footer，应更新断言；如果没有，补充最小回归覆盖。
- 前端样式改动后运行 `npm run check:ui`。
- 运行 `pbs-portal` 的相关 test / lint / build。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在一个共享 footer 组件和少量测试，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal` 组件、测试、必要 QA 文档。
- Conflict risk: 低。
- Execution gate: 用户确认 spec 后再开始实现。

## 风险与控制

- 风险：删除 `onReset` 入口后，用户无法一键清空搜索和页码。
  - 控制：当前搜索框本身可手动清空，分页会随 tab / 搜索变化归一化；删除按钮收益大于损失。
- 风险：共享 footer 被 Pairing / Line / Reserve 共用，删除按钮会影响多个页面。
  - 控制：这是预期效果，因为按钮语义在共享页面中同样误导；测试需要覆盖共享影响。
- 风险：测试中可能仍断言 `Reset All` 存在。
  - 控制：同步更新测试，使其验证按钮不存在、分页仍可用。
