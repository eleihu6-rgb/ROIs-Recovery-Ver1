# PBS Dashboard USER INFORMATION 移除 STATUS 展示设计

## 背景

PBS Portal Dashboard 左侧 `USER INFORMATION` 当前展示为 3 列表格，其中包含 `STATUS` 字段。

当前问题：

- `STATUS` 目前没有实际业务含义。
- 后端当前也没有真实计算该字段，`statusLabel` 基本为 `null`。
- 前端继续展示 `STATUS` 会让用户看到一个长期为 `-` 的无效字段，降低信息密度和可信度。

## 目标

1. Dashboard 左侧 `USER INFORMATION` 不再展示 `STATUS`。
2. 删除 `STATUS` 后，后续字段按 3x3 顺序整体前移。
3. 最后一个格子保留为空位，作为未来新增字段的预留位置。
4. 不改变 Dashboard 其他信息卡、Bidding Calendar、Bid Information 的行为。

## 非目标

- 不修改数据库表结构。
- 不删除 API contract 里的 `statusLabel` 字段。
- 不修改后端 profile service 当前返回结构。
- 不引入新的用户字段。
- 不重做 Dashboard 左侧卡片整体视觉风格。

## 当前展示顺序

当前 `USER INFORMATION` 可理解为一个 3x3 顺序表：

```text
BASE            FLEET             POSITION
SENIORITY       STATUS            LANGUAGE
EXISTING CREDIT TRAINING MONTH    LAST LOGIN
```

其中 `STATUS` 是无效字段。

## 调整后展示顺序

删除 `STATUS` 后，不在原位置留空，而是把后续字段逐个靠前：

```text
BASE            FLEET             POSITION
SENIORITY       LANGUAGE          EXISTING CREDIT
TRAINING MONTH  LAST LOGIN
```

说明：

- `LANGUAGE` 从原第二行第三列前移到第二行第二列。
- `EXISTING CREDIT` 从原第三行第一列前移到第二行第三列。
- `TRAINING MONTH` 从原第三行第二列前移到第三行第一列。
- `LAST LOGIN` 从原第三行第三列前移到第三行第二列。
- 第三行第三列保留空白占位，避免布局塌陷，并给未来字段保留位置。

## 推荐方案

采用前端展示层调整，保留后端 contract：

1. `buildDashboardUserPanelData` 不再把 `statusLabel` 放入用户信息展示模型。
2. `DashboardLeftPanel` 继续使用现有 `DashboardInfoTable` 三列表格，不新增新组件。
3. 用户信息展示模型按新的 3x3 顺序输出。
4. 后端 `PbsDashboardUserProfile.statusLabel` 暂时保留，避免扩大 API contract 改动范围。

选择原因：

- 用户需求是“不展示”，不是“删除接口字段”。
- 后端当前没有真实 status 业务，保留字段不会影响 UI。
- 最小改动，风险集中在 Dashboard 左侧展示层和测试。

## 影响文件

预计实现时涉及：

- `pbs-portal/src/features/dashboard/dashboard-user-panel-profile.ts`
- `pbs-portal/src/features/dashboard/components/dashboard-left-panel.tsx`
- `pbs-portal/src/features/dashboard/dashboard-user-panel-profile.test.ts`
- `pbs-portal/src/features/dashboard/components/dashboard-left-panel.test.tsx`
- `pbs-portal/src/features/dashboard/pages/dashboard-page.test.tsx`
- 相关 Dashboard Playwright 用例
- `gantt/src/version.ts` 前端版本号

## 测试策略

### 单元测试

更新 `buildDashboardUserPanelData` 测试：

- 断言 `STATUS` 不再出现在 headers。
- 断言字段顺序为：
  - `BASE / FLEET / POSITION`
  - `SENIORITY / LANGUAGE / EXISTING CREDIT`
  - `TRAINING MONTH / LAST LOGIN / 空白占位`

更新 `DashboardLeftPanel` 测试：

- 断言页面不显示 `STATUS`。
- 断言 `LANGUAGE`、`EXISTING CREDIT`、`TRAINING MONTH`、`LAST LOGIN` 仍正常显示。

### Playwright

更新现有 Dashboard E2E：

- 进入 Dashboard。
- 断言 `USER INFORMATION` 区域不展示 `STATUS`。
- 断言 `LAST LOGIN` 仍展示在用户信息区。
- 断言关键值仍可见，不因前移丢失。

## 验收标准

1. Dashboard `USER INFORMATION` 中看不到 `STATUS` 字段。
2. 字段整体前移，最终布局为：

   ```text
   BASE            FLEET             POSITION
   SENIORITY       LANGUAGE          EXISTING CREDIT
   TRAINING MONTH  LAST LOGIN
   ```

3. `LAST LOGIN`、`EXISTING CREDIT` 等已有字段不丢失。
4. Dashboard 页面无布局错位。
5. 自动化测试和 Playwright 覆盖该变化。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在 Dashboard 左侧展示模型、组件和测试，拆分会增加协调成本。
- Suggested split: 不建议拆分。
- Write boundaries: 单 agent 负责 `pbs-portal/src/features/dashboard/*`、相关 E2E 和版本号。
- Conflict risk: 低；但需要注意不要修改无关 Dashboard 布局。
- Execution gate: 用户审核本 spec 并确认后再实现。
