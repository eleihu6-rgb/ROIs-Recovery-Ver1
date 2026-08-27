# PBS Bid 工作台简化与 Tier 页面退役设计

> 状态：已按正式需求修订，待用户书面审阅
> 日期：2026-07-21
> 范围：PBS Portal `/bid` 页面简化、独立 `/tier` 页面退役

## 1. 背景

当前 Portal 同时存在两个相关入口：

- `/bid`：用户配置和管理 bid 的主工作台，已经包含当前 Tier、规则数量、匹配 pairing 数量、`VIEW RULES` 和 `SEARCH PAIRINGS`。
- `/tier`：独立的只读复核页面，主要展示大型 `PAIRING POOLS` 卡片，包括 T1–T7 累计总数、`Pairings by Tx`、Pool Graph 和各 Tier 的 `View Set`。

原 AA 参考页面采用逐层累积的 pairing pool 漏斗模型，但本系统允许不同 Tier 使用不同设置，用户也可以直接从 Bid 的 `SEARCH PAIRINGS` 查看当前 Tier 的实际结果。继续保留一套独立的跨 Tier 大卡片，会增加理解和导航成本。

正式需求因此不再延续临时 Demo 的“暂不处理 Tier 页面”限制，而是：

1. 将 Bid 作为唯一的 bid 配置、当前 Tier 状态和 review 工作台。
2. 直接退役独立 Tier 页面及入口。
3. 不把大型 `PAIRING POOLS` 卡片迁移到 Bid。

## 2. 目标

1. 用户只需在 Bid 页面完成 bid 配置、查看当前 Tier 状态、处理 review 和搜索匹配 pairing。
2. Bid 顶部清楚展示当前 Tier 的规则数与匹配结果数。
3. 只有当前 Tier 成功计算且匹配结果为零时，才使用琥珀色警示样式。
4. 删除 `BID REVIEW` 标题旁重复的当前 Tier 徽标。
5. 从产品导航和可访问路由中移除独立 Tier 页面。
6. 旧的 Tier URL 安全回落到 Bid，不留下空白页或 404。
7. 不迁移 Tier 页的大型累计 pool 视图，不改变后端或数据库。

## 3. 最终信息架构

### 3.1 顶部导航

正式导航中删除 `Tier`：

```text
Dashboard | Bid | Reserve | Award | Standing Bid | Help
```

本次只删除 Tier 项，不调整其他导航项的顺序、名称和权限。

### 3.2 路由退役

| 入口 | 新行为 |
| --- | --- |
| 顶部导航 `Tier` | 删除，不再显示 |
| 直接访问 `/tier` | 使用 replace redirect 跳转到 `/bid` |
| 带 query/hash 的旧 `/tier?...` | 跳转到 `/bid`，不尝试保留 Tier 专属参数 |
| 旧 `/layer` 或历史 Tier 别名 | 统一跳转到 `/bid` |
| 当前映射到 Tier 的旧 `/portal/notices` | 直接改为跳转到 `/bid`，避免经过 `/tier` 二次重定向 |
| 登录前保存的 `/tier` return-to | 登录完成后规范化为 `/bid` |

采用重定向而不是保留隐藏页面，原因是用户可能仍有旧书签、浏览器历史或登录前回跳地址。产品层面 Tier 页面已经不存在，但旧链接不会中断用户流程。

### 3.3 Tier 页面内容处理

独立 `/tier` 页的以下 UI 不迁移到 Bid，随页面一起退役：

- `PAIRING POOLS` 大卡片。
- T1–T7 累计 `Total Pairings`。
- `Pairings by Tx`。
- Pool Graph。
- 每个 Tier 独立的 `View Set`。
- Tier page 专属的 pairing set preview、详情入口和页面级诊断展示。

这里的“退役 Tier 页面”是产品页面与入口退役，不代表删除系统中的 Tier 业务概念。Bid、日历、规则配置、Standing Bid 等位置仍继续使用 T1–T7。

## 4. Bid 页面设计

### 4.1 当前 Tier 摘要

摘要保持单行紧凑布局：

```text
[T2] [1 rule] [3 pairings matched]   [REFRESH] [VIEW RULES] [SEARCH PAIRINGS]
```

字段含义：

| 字段 | 含义 |
| --- | --- |
| `T2` | 当前日历选中的 Tier，也是当前规则、匹配数量和搜索结果的作用域 |
| `1 rule` | 当前 Tier 生效的 pairing rule 数量 |
| `3 pairings matched` | 按当前 Tier pairing rules 计算得到的唯一 pairing 数量 |
| `REFRESH` | 重新计算当前 Tier 的匹配数量，不是刷新浏览器页面 |
| `VIEW RULES` | 查看当前 Tier 已配置的规则 |
| `SEARCH PAIRINGS` | 查看或搜索当前 Tier 匹配到的 pairing 明细 |

数量文案统一使用：

- `0 pairings matched`
- `1 pairing matched`
- `N pairings matched`

### 4.2 匹配结果的视觉状态

| 状态 | 摘要样式 | 说明 |
| --- | --- | --- |
| 成功且匹配数大于 0 | 现有浅紫色/中性样式 | 正常结果，不制造警告感 |
| 成功且匹配数等于 0 | 琥珀色警示样式 | 明确提醒当前规则没有匹配结果 |
| 加载中 | 沿用现有加载状态 | 不提前显示零结果警告 |
| 结果过期 | 沿用现有过期状态 | 提示需要重新计算，但不等同于零结果 |
| 计算失败 | 沿用现有错误状态 | 错误与零结果保持不同语义 |
| 当前 Tier 没有 pairing rules | 沿用现有无规则提示 | 不将“没有规则”伪装成“规则匹配为零” |

颜色不是唯一提示手段；零结果同时保留明确的 `0 pairings matched` 文案。

### 4.3 Bid Review 去重

修改前：

```text
BID REVIEW  [T2]  [Days Off] Info ...
```

修改后：

```text
BID REVIEW  [Days Off] Info ...
```

具体规则：

- 删除 `BID REVIEW` 标题旁单独渲染的 `activeTier` 徽标。
- `BID REVIEW` 仍然只展示当前 Tier 相关的 review items，不能取消或改变 `activeTier` 过滤逻辑。
- 紧凑 review item 继续显示模块、严重程度和提示文案。
- 展开的 review popover 继续保留每条提示的 Tier 作用域，例如 `T1, T2`、`All Tx` 或 `Legacy`；这些信息不是重复信息，不能删除。
- 空状态或 popover 说明文字可以继续提及当前 Tier，例如 `No review warnings for T2.` 或 `Review warnings for T2`，用于说明上下文。

### 4.4 REFRESH 语义

`REFRESH` 在本次正式方案中保留：

- 点击后重新计算当前 Tier 的匹配数量。
- 不刷新整个浏览器页面。
- 不改变当前选中的 Tier。
- 不新增或修改 bid rule。

是否后续重命名为更明确的 `RECALCULATE`，不属于本次范围。

## 5. 数据与代码保留边界

### 5.1 当前 Tier 匹配数据

本次复用现有 pairing pool count 数据流：

1. 用户在 Bid 日历中选择 Tier。
2. 页面根据该 Tier 的 pairing rules 获取或计算匹配数量。
3. 摘要展示规则数和唯一 `pairing_id` 数量。
4. 仅当请求成功且 `pairingIdCount === 0` 时，设置零结果警示状态。

不新增 API 请求，不改变接口契约，不修改缓存策略。

### 5.2 可以删除的内容

在确认无其他调用者后，删除仅服务于独立 Tier 页面的代码与资产：

- `TierPage` 页面入口和 lazy route。
- Tier 页专属右侧面板、loading UI、页面专属 preview/dialog 和页面测试。
- Tier 页专属 Help topic、Help 导航项及不再成立的截图引用。
- 只验证 `/tier` 页面存在或顶部 `Tier` 导航存在的测试。

删除前必须执行 GitNexus impact analysis；若某个组件仍被 Bid 使用，则不能因目录位于 `features/tier` 而直接删除。

### 5.3 必须保留的内容

以下内容仍有业务用途，不能随着页面一起删除：

- T1–T7 业务概念、类型和公共选择组件。
- Bid 使用的 Tier summary 数据、review 数据和 `activeTier` 过滤逻辑。
- Bid 详情/编辑仍复用的 Tier detail 选择器、dialog 或 action。
- Bid、Days Off、Pairing、Line、Standing Bid 和日历中的 Tier 选择行为。
- 为 Bid 当前 Tier 摘要服务的 pairing pool count API 与前端数据流。
- 保存 bid 后对相关数据的 invalidation；可删除无消费者的独立 Tier page query invalidation，但不能影响 Bid review 刷新。

如果页面级代码与 Bid 复用代码混在同一 `features/tier` 目录，本次只做安全的死代码清理，不为目录名称进行无关的大规模重构或搬家。

## 6. Help 与用户文案调整

- Help 首页不再将 Tier 列为独立主页面。
- 删除 Tier 页面专属的 overview、summary、editing、details 和 pairing preview 教程入口。
- 更新 Bid、Days Off、Pairing、Line、Reserve 等帮助文案中“前往 Tier 页面复核”或“刷新 Tier summary”的描述。
- 仍可使用小写业务语义的 tier/T1–T7 来描述 bid 的优先层级；只移除将 `Tier` 表述为独立页面的内容。
- 不保留指向已经退役页面的截图、导航步骤或链接。

## 7. 范围

### 7.1 本次包含

- Bid 当前 Tier 摘要文案与零结果状态。
- 删除 `BID REVIEW` 标题旁重复的当前 Tier 徽标。
- 删除顶部 Tier 导航入口。
- 将 `/tier`、旧 `/layer`、`/portal/notices` 和登录 return-to 中的 Tier 页面入口规范化到 `/bid`。
- 退役 `PAIRING POOLS` 页面 UI，不迁移到其他页面。
- 删除确认无调用者的 Tier 页面专属代码、测试、Help 内容和截图引用。
- 更新单元测试、路由测试、组件测试和 Playwright 回归测试。

### 7.2 本次不包含

- 不删除 T1–T7 业务概念。
- 不改变各 bid property 的 Tier 选择或多选行为。
- 不把 pairing pool diagnostics 加入 `BID REVIEW`。
- 不删除展开 review popover 中每条提示的 Tier 作用域。
- 不修改后端、API、数据库或 migration。
- 不改变 T1–T7 累计算法的后端能力；本次只不再提供独立页面 UI。
- 不将计数口径改成 AA 文档中的 “pairing × position”；Bid 仍统计唯一 `pairing_id`。
- 不重命名 `REFRESH`。
- 不为清理 `features/tier` 目录而进行无关架构重构。

## 8. 可访问性与一致性

- 删除 Tier 导航后，键盘导航顺序自然衔接，不留下空白或不可见焦点项。
- 旧 URL 重定向使用 replace，避免浏览器返回键在 `/tier` 与 `/bid` 之间循环。
- 当前 Tier 在 Bid 顶部摘要中继续清晰可见。
- 零结果同时通过颜色和文字表达，避免只依赖颜色。
- 保留现有按钮的键盘操作、焦点样式和 aria 属性。
- 使用现有设计 token 和组件样式，不新增硬编码颜色或字号。
- UI 文案保持英文，设计与验收文档使用中文。

## 9. 测试方案

### 9.1 单元与组件测试

- 正数结果显示 `N pairings matched`。
- 单数结果显示 `1 pairing matched`。
- 零结果显示 `0 pairings matched`。
- 只有成功零结果使用琥珀色警示样式。
- 正数、加载、过期、失败、无规则状态不能误用零结果样式。
- `BID REVIEW` 标题旁不再渲染当前 Tier 徽标。
- `BID REVIEW` 仍按当前 Tier 过滤提示。
- 展开 review popover 仍显示每条提示的 Tier 作用域。
- 顶部导航不再渲染 Tier 链接。
- `/tier`、带参数的 `/tier`、旧 `/layer` 和 `/portal/notices` 均 redirect 到 `/bid`；`/portal/notices` 不经过 `/tier` 中转。
- 登录 return-to 为 `/tier` 时，登录后进入 `/bid`。

### 9.2 Playwright 回归

通过真实 Portal 验证：

1. 顶部导航没有独立 `Tier` 入口。
2. 直接打开 `/tier`、旧 `/layer` 或 `/portal/notices` 自动进入 `/bid`，页面无报错且浏览器返回行为正常。
3. 选择一个有匹配结果的 Tier，Bid 顶部显示当前 Tier、规则数和 `N pairings matched`，摘要不是琥珀色。
4. `BID REVIEW` 区域不再紧邻显示重复的当前 Tier 徽标。
5. `REFRESH`、`VIEW RULES`、`SEARCH PAIRINGS` 仍可操作。
6. 在可控 fixture/mock 下验证零结果显示 `0 pairings matched` 且使用琥珀色警示样式。
7. 展开 Bid Review 时，每条 review item 的 Tier 作用域仍存在。
8. Help 中不存在独立 Tier 页面入口、失效步骤或失效链接。

### 9.3 验证命令

实施完成后至少执行：

```bash
cd pbs-portal
npx vitest run <本次涉及的组件、路由、导航和 Help 测试文件>
npx tsc --noEmit
npm run check:ui

cd ../e2e
npx playwright test --config=config/playwright.config.ts --project=pbs-portal tests/pbs-portal/bid-merged-workbench.spec.ts <受影响的 Help 回归文件>

cd ..
git diff --check
```

提交前还需按项目规范运行 GitNexus `detect_changes()`，确认影响范围符合预期。

## 10. 验收标准

- [ ] 顶部导航不再显示 `Tier`。
- [ ] 直接访问 `/tier`、旧 `/layer`、`/portal/notices` 或登录 return-to `/tier` 时，用户最终进入 `/bid`；`/portal/notices` 不依赖二次重定向。
- [ ] 独立 Tier 页面和 `PAIRING POOLS` 大卡片不再作为可访问产品 UI 存在。
- [ ] `PAIRING POOLS` 的累计总数、`Pairings by Tx`、Pool Graph 和独立 `View Set` 没有迁移到 Bid。
- [ ] Bid 顶部摘要清楚显示当前 Tier、规则数和 `N pairings matched`。
- [ ] 匹配数大于 0 时，摘要保持浅紫色/中性样式。
- [ ] 成功匹配数等于 0 时，摘要显示琥珀色警示样式和 `0 pairings matched`。
- [ ] `BID REVIEW` 标题旁不再出现重复的当前 Tier 徽标。
- [ ] Bid Review 的当前 Tier 过滤、提示内容和展开项 Tier 作用域保持不变。
- [ ] `REFRESH`、`VIEW RULES` 和 `SEARCH PAIRINGS` 行为保持不变。
- [ ] Bid 及其他页面的 T1–T7 选择与保存行为保持不变。
- [ ] Help 不再把 Tier 描述成独立页面，也不存在失效入口或截图引用。
- [ ] 没有后端、API、数据库或 migration 变更。
- [ ] 聚焦测试、TypeScript 检查、UI 标准检查和 Playwright 回归全部通过。

## 11. 风险与控制

| 风险 | 控制措施 |
| --- | --- |
| `features/tier` 内包含 Bid 仍在复用的数据和组件 | 按 symbol 做 impact analysis；只删除 page-only 代码，不按目录整体删除 |
| 删除 `/tier` 后旧书签或登录回跳失效 | 保留轻量 replace redirect 到 `/bid`，并覆盖 query、旧别名和 auth return-to 测试 |
| 删除 Tier query/invalidation 误伤 Bid Review 刷新 | 先确认消费者；保留 Bid 数据流需要的 query、service 和 invalidation |
| 删除标题 Tier 徽标时误删 review 的作用域逻辑 | 只删除标题旁视觉徽标；保留 `activeTier` 过滤、空状态上下文和 item-level tier scope |
| 当前 Tier 摘要组件被多个页面或测试复用 | 修改前执行 GitNexus impact analysis；通过共享组件测试和真实 Bid Playwright 控制回归 |
| 琥珀色被错误用于正常正数结果 | 警示条件限定为请求成功且 `pairingIdCount === 0`，并增加正数反向测试 |
| Help 仍残留 Tier 页面指引 | 搜索产品 Help 中页面语义的 Tier 引用，更新相关主题并执行 Help Playwright |

## 12. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 虽涉及路由、导航、Bid UI、Help 和测试，但它们围绕同一页面退役契约紧密关联；单一实现者更容易保证“删除页面但保留 Tier 业务能力”的边界一致。
- Suggested split: 单一实现者按“impact analysis → 路由/导航 → Bid UI → page-only 清理 → Help → 测试”顺序完成。
- Write boundaries: `pbs-portal` 页面、路由、导航、Help 与对应测试；`e2e` 受影响回归。
- Conflict risk: 多人同时清理 `features/tier` 与修改 Bid 复用代码，容易误删共享 symbol 或产生测试冲突。
- Execution gate: 用户审阅并明确批准本修订版 spec 后，才进入正式实施与验证。

## 13. 实施顺序原则

1. 对待删除或修改的 symbol 执行 GitNexus impact analysis。
2. 先建立 `/tier` → `/bid` 的安全回落，再删除导航与页面入口。
3. 完成 Bid 当前 Tier 摘要和 Bid Review 去重。
4. 按调用关系清理仅属于 Tier 页面的 UI、测试和 Help；不按目录批量删除。
5. 运行聚焦测试，再运行 TypeScript、UI gate 和真实 Playwright 回归。
6. 提交前执行 GitNexus `detect_changes()`，确认没有误伤 Tier 业务能力。
