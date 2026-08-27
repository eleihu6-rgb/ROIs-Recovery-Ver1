# PBS Add Properties 卡片视觉与语义优化

## 背景

上一阶段已经把 `ALL PROPERTIES`、系统高频模板、用户 `FAVORITED PROPERTIES` 的业务语义拆开：

- `ALL PROPERTIES` 是可添加的 property 模板目录。
- 系统高频项只影响 `ALL PROPERTIES` 排序。
- `FAVORITED PROPERTIES` 只展示用户保存过的完整配置快照。

当前页面已经方向正确，但视觉上仍然像“表单行”：

- property 名称被包在 input 风格边框里，用户容易以为可以直接输入。
- `RECOMMENDED` 文案不准确；它不是系统主观推荐，而是历史使用率较高 / 排行靠前。
- `FAVORITED` 卡片里有 `Saved setup` 标题，但这个信息对用户重复，反而让卡片更重。
- bid 摘要仍像输入框，缺少“只读摘要”的视觉语义。
- 卡片整体比较粗糙，信息层级不够清楚，不够像专业航空业务系统里的可复用条件模板。

## 目标

1. 让 `ALL PROPERTIES` 的卡片明确表达“可添加模板”，不是可编辑 input。
2. 把 `RECOMMENDED` 改成更准确的高频语义，默认使用 `TOP USED`。
3. 让 `FAVORITED PROPERTIES` 更像“已保存配置快照”，去掉多余的 `Saved setup`。
4. 用更精致的卡片样式提升可读性：
   - property 名称清楚；
   - bid 摘要完整展示；
   - tier / modifier chip 轻量展示；
   - 操作按钮清晰但不抢视觉。
5. 保持交互不变：
   - `ALL PROPERTIES` 点击 `+` 继续打开配置弹窗。
   - `FAVORITED PROPERTIES` 点击 `+` 继续直接添加保存配置。
   - 删除 favorite 逻辑不变。

## 非目标

本次不处理：

- 不改后端 API。
- 不改数据库字段。
- 不改 favorite 保存 / 删除 / 添加逻辑。
- 不改分页逻辑。
- 不重做配置弹窗。
- 不引入新的 UI 依赖。
- 不改 `EXISTING ... PROPERTIES` 区域。

## 设计原则

### 1. 模板不是输入框

`ALL PROPERTIES` 里的 property 名称只用于选择模板，不能继续使用 input 外观。

推荐样式：

```text
┌──────────────────────────────────────────────────────────────┐
│ Prefer Off                                      TOP USED   +  │
└──────────────────────────────────────────────────────────────┘
```

视觉要求：

- 卡片本身提供边框和 hover 反馈。
- property 名称使用普通文本，不放入 input 边框。
- `+` 按钮放在右侧，保持当前用户习惯。
- 高频 badge 使用轻量 pill，不要过大。
- 非高频项不显示 badge。

### 2. 高频不是推荐

当前 `RECOMMENDED` 容易让用户理解成“系统建议你填这个条件”。实际它只是从历史报表中统计出的高频属性。

文案改为：

```text
TOP USED
```

含义：

- 该 property 在历史 bid report 中使用率较高。
- 它只是排序和提示，不代表系统建议用户一定要选择。

如果后续要进一步增强，可以展示：

- `#1 Top Used`
- `Used 1,583 times`

但本次先不改 API，不展示 usage count，避免扩大范围。

### 3. 收藏是保存好的条件快照

`FAVORITED PROPERTIES` 不需要 `Saved setup` 标题。用户进入 `FAVORITED` tab，本身就知道这里是保存项。

推荐样式：

```text
┌──────────────────────────────────────────────────────────────┐
│ Min Consecutive Days Off                              +  🗑   │
│ 2                                                            │
│ T1  T4                                                       │
└──────────────────────────────────────────────────────────────┘
```

视觉要求：

- property 名称作为主标题。
- bid 摘要是只读文本块，不使用 input 边框。
- 摘要允许多行换行，不能截断核心内容。
- tier / modifier chip 放在摘要下方。
- 删除按钮保留，但视觉降低权重。

### 4. 卡片更好看但不花哨

整体风格应该是“专业、干净、轻量”，不要做成消费级花哨卡片。

建议：

- 背景：白色或非常浅的蓝灰。
- 边框：浅灰蓝，hover 时略微加深。
- 圆角：保持当前系统 `rounded-2xl` 级别。
- 阴影：极轻微，只用于 hover 或 favorite 卡片。
- 信息区：使用浅底色摘要块，而不是输入框边框。
- 文案颜色：主文本深灰，辅助信息中灰，badge 使用紫色但降低饱和度。

## 具体 UI 改造

### `ALL PROPERTIES`

当前问题：

```text
[ Prefer Off input-like box ] [ RECOMMENDED ] [+]
```

目标：

```text
Prefer Off                    TOP USED       [+]
```

结构：

- 左侧：property 名称。
- 中间：可选 `TOP USED` badge。
- 右侧：`+` icon button。

删除：

- input-like property name border。
- `RECOMMENDED` 文案。
- 过大的 badge 字号。

保留：

- row/card hover。
- `Add <Property>` aria-label。
- `recommendedSortOrder` 排序逻辑。

### `FAVORITED PROPERTIES`

当前问题：

```text
Min Consecutive Days Off
SAVED SETUP
[ 2 input-like box ]
[T1] [T4]
```

目标：

```text
Min Consecutive Days Off                       [+] [Delete]
2
T1  T4
```

结构：

- Header 行：
  - 左侧 property 名称；
  - 右侧 `+` 和删除按钮。
- Body：
  - bid 摘要文本；
  - tier / modifier chips。

删除：

- `Saved setup` 文案。
- bid 摘要 input 外观。

保留：

- bid 摘要完整显示。
- tier / modifier chip。
- 删除确认。
- 点击 `+` 直接添加 favorite 快照。

## 文案规范

| 当前文案 | 新文案 | 说明 |
|---|---|---|
| `RECOMMENDED` | `TOP USED` | 表达高频使用，不表达主观推荐 |
| `Saved setup` | 删除 | `FAVORITED` tab 已经表达保存语义 |

UI 文案保持英文，符合 PBS Portal 当前产品语言。

## 技术方案

### 前端

主要改动文件：

- `pbs-portal/src/features/rule-bids/components/rule-bid-property-table.tsx`
- `pbs-portal/src/features/pairing/components/pairing-property-table.tsx`

实现方式：

1. 调整 catalog row 样式：
   - 删除 property name 的 input-like box。
   - 改为普通文本 + 卡片容器。
   - badge 文案从 `Recommended` 改为 `Top Used` 或 `TOP USED`。
2. 调整 favorite row 样式：
   - 删除 `Saved setup`。
   - bid 摘要从 bordered input-like box 改成只读摘要块。
   - chips 保持轻量样式。
3. 保持现有 props / handler 不变，避免影响业务逻辑。

### 后端 / Contract

不改。

当前 `recommendedSortOrder`、`recommendedPropertyCodes`、`recommended_order` 命名仍然准确，因为这是内部技术语义：用于推荐排序 / 高频排序。UI 文案展示为 `TOP USED`。

## 验收标准

### 视觉

- `ALL PROPERTIES` 不再出现 input 风格的 property 名称。
- `FAVORITED PROPERTIES` 不再出现 input 风格的 bid 摘要。
- `RECOMMENDED` 不再出现，替换为 `TOP USED`。
- `Saved setup` 不再出现。
- 卡片在 1920 宽度下信息层级清楚，不显得空、不像表单。
- 长 bid 摘要能换行显示，不被截断。

### 交互

- `ALL PROPERTIES` 点击 `+` 仍打开配置弹窗。
- `FAVORITED PROPERTIES` 点击 `+` 仍直接添加保存配置。
- 删除 favorite 仍需要确认。
- 搜索、分页不变。

### 测试

需要更新 / 补充：

- `pbs-portal/src/features/days-off/pages/days-off-page.test.tsx`
- `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx`
- `pbs-portal/src/features/line/pages/line-page.test.tsx`
- `e2e/tests/pbs-portal/condition-default-favorites.spec.ts`

测试断言：

- `RECOMMENDED` 不存在。
- `TOP USED` 存在于 `ALL PROPERTIES` 高频项。
- `Saved setup` 不存在。
- `FAVORITED` 的 bid 摘要可见。
- `ALL PROPERTIES` 不显示 `BID` / `TIERS` 表头。

验证命令：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal && npm test
cd /Users/lei/Codehub/rois-ai/pbs-portal && npm run lint
cd /Users/lei/Codehub/rois-ai/pbs-portal && npm run build
cd /Users/lei/Codehub/rois-ai && npm run check:ui
cd /Users/lei/Codehub/rois-ai/e2e && ./node_modules/.bin/playwright test --config=config/playwright.config.ts --project=pbs-portal tests/pbs-portal/condition-default-favorites.spec.ts --reporter=list
```

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是集中在两个共享 UI 组件和少量测试断言上的视觉微调，拆分多 agent 会增加冲突成本。
- Suggested split: 不拆分。
- Write boundaries: 单 agent 修改 `rule-bids` / `pairing` 组件及相关测试。
- Conflict risk: 中等；这些组件刚刚经历语义重构，需要避免与上一轮未提交改动混淆。
- Execution gate: 用户确认 spec 后再实施。

## 风险与控制

### 风险：视觉改动影响测试选择器

控制：

- 保留现有 `data-testid`。
- 保留 aria-label。
- 测试只改文案和语义断言，不依赖脆弱 CSS。

### 风险：`TOP USED` 被理解为强制推荐

控制：

- 不写 `Recommended`。
- 不展示“系统建议”类文案。
- 仅用排序和轻量 badge 表示历史高频。

### 风险：卡片过大导致页面密度下降

控制：

- `ALL PROPERTIES` 使用紧凑卡片。
- `FAVORITED` 才允许更高卡片，因为它需要展示完整保存配置。
- 分页逻辑保持不变。
