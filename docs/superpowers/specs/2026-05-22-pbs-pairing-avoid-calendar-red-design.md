# PBS Pairing Number Avoid 日历红色展示设计

## 背景

当前 Pairing 左侧 `BIDDING CALENDAR` 的快速添加入口固定创建 `Award Pairing Number`，这是合理的，因为用户从日历选择 pairing run 的动作语义是“我想要这个 pairing”。

但右侧 `ADD PAIRING PROPERTIES` 可以添加 `Avoid Pairing Number`。如果 Avoid 也以普通蓝色 pairing event 显示在左侧日历或 Dashboard 日历中，用户会误以为这是“想获得的 pairing”，语义不清楚。

用户确认：Avoid 不应该和 Award 视觉一样；建议显示为红色，让语义更清楚。

## 目标

- `Award Pairing Number` 在左侧日历 / Dashboard 日历中继续显示为蓝色。
- `Avoid Pairing Number` 在左侧日历 / Dashboard 日历中显示为红色。
- 红色表达“想避开 / 不想飞这个 pairing”，蓝色表达“想获得 / 想飞这个 pairing”。
- 左侧日历快速添加入口继续固定创建 `Award`，不新增 Avoid 快速添加入口。
- Avoid 日历事件只做展示语义调整，不改变保存结构、Existing、收藏或 Pairing Number occurrence-list 明细表。

## 非目标

- 不改变 Pairing Number 保存结构。
- 不新增新的日历添加 Avoid 入口。
- 不改变 `pairing-occurrence-list` 数据结构。
- 不改变 Pairing Existing 列表的编辑入口。
- 不重做日历视觉系统或颜色主题。

## 行为设计

### Award

- 来源：左侧日历快速添加，或右侧配置弹窗选择 `Award`。
- 日历展示：
  - `tone: "blue"`。
  - 继续作为用户希望获得的 pairing bid 展示。
  - 现有详情、Tx 编辑、删除逻辑保持不变。

### Avoid

- 来源：右侧配置弹窗选择 `Avoid`。
- 日历展示：
  - `tone: "red"` 或现有日历组件支持的等价 danger/error tone。
  - metadata 保留 `actionId = 2`，前端可据此识别 Avoid。
  - label / detail 中如已有 action 展示能力，则显示 Avoid；如果当前详情没有 action 展示，本次至少保证颜色语义正确。
- 交互：
  - 不从左侧日历新增 Avoid。
  - 不把 Avoid 当成左侧快速添加的 Award 事件。
  - 如果日历详情里存在按 pairing bid 编辑 Tx 的能力，需要确认不会把 Avoid 保存成 Award。

## 数据流

1. 后端 `bidding-calendar` 读取 `pbs_bid_group.action_id`。
2. 构建 pairing calendar event 时：
   - `action_id = 1` → Award → 蓝色。
   - `action_id = 2` → Avoid → 红色。
3. 前端 Dashboard / Pairing 左侧日历使用后端返回的 `tone` 渲染颜色。
4. 前端详情逻辑继续通过 `metadata.actionId` 理解事件来源，不重新推导 action。

## 测试计划

### 后端

- `bidding-calendar-service.test.ts`
  - Award Pairing Number event 返回蓝色 tone。
  - Avoid Pairing Number event 返回红色 tone。
  - occurrence-list 结构下 Award / Avoid 均按 `actionId` 正确映射颜色。

### 前端

- `shared-bidding-workbench-layout.test.tsx` 或相关日历 mapper 测试：
  - Award event 保持蓝色展示。
  - Avoid event 使用红色 tone。
  - 左侧日历快速添加 payload 仍为 `action: "award"`。

### 回归

- Existing 中 Award / Avoid 仍正常展示。
- Pairing Number 收藏不受影响。
- Prefer Off 冲突校验不因颜色展示变化改变。
- Dashboard 日历与 Pairing 左侧日历展示一致。

## 性能要求

- 本次只根据已读取的 `action_id` 映射颜色，不增加额外数据库查询。
- `GET /api/bidding-calendar/current` 仍需满足 < 2s 目标。
- 不能引入前端额外重复请求。

## 验收标准

1. 右侧添加 `Award Pairing Number` 后，日历显示蓝色。
2. 右侧添加 `Avoid Pairing Number` 后，日历显示红色。
3. 左侧日历快速添加仍固定保存为 Award。
4. Avoid 日历事件不会被误保存成 Award。
5. Pairing 页面左侧日历和 Dashboard 日历颜色一致。
6. 自动化测试、lint、build 通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动范围小，主要是后端 event tone 映射和前端回归测试，拆分并行开发的协调成本高于收益。
- Suggested split: 不拆。
- Write boundaries: `pbs-server/src/services/calendar/**`、`pbs-portal/src/features/dashboard/**`、相关测试。
- Conflict risk: Low。
- Execution gate: 用户确认本 spec 后再进入实现。
