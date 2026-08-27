# PBS Portal 收藏卡片紧凑化设计

## 1. 背景

Bid 页面 `FAVORITED PROPERTIES` 中的收藏卡片纵向留白过多。属性名、条件、Tier 和操作被拆成多个大间距区域，普通收藏卡也接近占据整个可用列表高度，导致一屏只能查看少量收藏。

本次调整只优化收藏卡片的信息层级和空间利用率，不改变收藏、编辑、删除、Tier 选择或加入 Bid 的业务行为。

## 2. 目标

- 普通收藏卡使用单条紧凑信息行，提高一屏可见数量。
- Days Off、Pairing、Roster 收藏保持统一的视觉结构。
- 与 Existing Bid 和普通 Property 列表的轻量、数据密集风格保持一致。
- 保留完整条件摘要、T1–T7、修饰标签和所有操作。
- 长条件、较窄窗口和按钮禁用状态下仍然清楚、可操作。

## 3. 非目标

- 不修改收藏数据结构、接口、缓存或保存流程。
- 不修改 Tier 选择规则、重复条件判断或 Add to Bid 行为。
- 不改 Existing Bid Properties、普通 Property 行或 Standing Bid。
- 不重新设计 Bid 页面整体布局。

## 4. 已确认方案

保留卡片边框、圆角和轻量 hover，但内部改成单条紧凑信息行。卡片分为左侧内容、中右侧 Tier、最右侧操作三个区域。

### 4.1 左侧信息区

- 左侧只显示属性名，不显示 `SELECT TX` 文案。
- 条件摘要放在标题行下方，不再显示 `CONDITION` 标题。
- 条件摘要优先单行；空间不足或内容较长时完整自然换行，不使用 line-clamp、省略号或固定高度裁切。
- 条件修饰标签紧随条件摘要展示；没有标签时不保留空位。

### 4.2 中右侧 Tier 区

- T1–T7 作为完整不可拆散的一组，放在条件内容右侧、操作图标左侧。
- Tier 区只相对卡片的主信息行垂直居中，不再跟随属性名或条件摘要的位置与长度移动；Pairing 删除确认在主信息行下方展开时，Tier 不随整个增高后的卡片重新居中。
- 不显示 `SELECT TX`、`TIERS` 或其他额外标题。

### 4.3 右侧操作区

- 所有操作都恢复为项目原有的小图标，不显示文字按钮或紫色实心大按钮。
- Rule Bid 使用 Pencil、Trash、Plus Circle；Pairing 额外保留 Eye。
- 图标从左到右固定为 Edit、Preview（仅 Pairing）、Delete、Add。
- Add 使用 Plus Circle 小图标；未选择任何 Tier、正在提交或结构变更 pending 时置灰并禁用。
- 图标保持透明背景和轻量 hover/focus，不使用紫色实心底。
- 每个图标仍使用原生 `button`，具备明确的 `aria-label`、可见键盘焦点和原生禁用语义；图形尺寸保持 16px，点击/键盘命中区域不小于 28×28px。
- Tab 顺序与视觉顺序一致，Enter/Space 均可触发；禁用的 Add 不得触发请求。
- 删除确认交互保持现状，确认展开时允许卡片临时增高。

### 4.3 视觉

- 减少卡片上下内边距，移除信息区内部横向分隔线。
- 移除厚重卡片阴影，使用与当前 Bid 列表一致的轻边框和轻量 hover。
- 普通短条件卡片目标高度约为 56–72px；长条件允许按内容增高，禁止写死高度裁切内容。
- 卡片仍保持清晰边界，不通过过小字号或过低对比度换取密度。

### 4.4 按类型保留的功能

- Days Off 与 Roster：属性名、完整条件摘要、T1–T7、实际存在的修饰标签、Edit、Delete 和 Add 图标。
- Pairing：除上述通用信息外，继续保留 Preview。
- 只有当前数据或处理器支持的操作才显示；不得为了统一外观给某一类型补造无效按钮或空占位。
- 删除交互保持现状：
  - Rule Bid 收藏继续使用 Popover 确认。
  - Pairing 收藏继续使用卡内确认区域；确认区作为紧凑信息行下方的独立整行展开，右侧原图标组保留，不得与标题、条件或 Tier 重叠。
  - 确认区在窄宽度和长条件下可自然换行，但不得横向溢出。
  - Cancel、Confirm、pending、禁用和确认关闭行为不得改变；打开后焦点进入确认区。
  - 取消或删除失败后焦点恢复到原 Delete 图标；删除成功后若存在下一张卡片则聚焦其第一个操作图标，否则聚焦上一张卡片的第一个操作图标，列表为空时聚焦收藏列表标题。

## 5. 响应式

- 以 Portal 的 1920×1080 桌面基线为主要验收尺寸。
- 在 1920×1080 和 1366×768 下，左侧内容、Tier 区和图标区保持三栏结构；条件摘要可以换行。
- 属性名过长时允许标题文本在左侧内容区域内换行；T1–T7 仍作为不可拆散的一组保持单行，不得用省略号隐藏属性名。
- 左侧长标题或长条件不得把 Tier 区推向操作图标或改变 Tier 区的垂直位置。
- 响应式长文本 fixture 使用属性名 `Long Stretch Off / Compressed Flying`、条件 `10 consecutive days between 2026-06-03 – 2026-06-13`；在 1366×768 下必须满足 `left.right < tier.left < tier.right < actions.left`，三个区域互不重叠且均位于卡片边界内。
- 右侧图标组保持单行且不得被挤出、遮挡或落到条件区域。
- `<1080` 宽度继续沿用 Portal 共享画布的完整缩小展示，不在收藏卡内部增加另一套独立缩放或强制重排。
- T1–T7 必须保持可识别和可点击，不因紧凑化缩小命中区域。

## 6. 实现边界

预计涉及：

- `pbs-portal/src/features/rule-bids/components/rule-bid-property-table.tsx`
- `pbs-portal/src/features/pairing/components/pairing-property-table.tsx`
- 必要时新增一个只负责收藏卡结构与视觉的共享轻量组件；不得搬迁业务状态或请求逻辑。
- 对应 Portal 单元测试、PBS Portal Playwright 回归和人工 QA 文档。

## 7. 验收标准

- Days Off、Pairing、Roster 收藏均使用相同的紧凑卡片信息行结构。
- 56–72px 高度只针对 1920×1080、属性名 `Prefer Off`、条件 `Weekends`、无修饰标签且未展开删除确认的固定短条件 fixture；长标题、长条件和修饰标签允许自然增高。
- 在 1920×1080、Existing Bid 区域保持当前页面高度、收藏列表使用至少 4 条普通短条件测试数据时，收藏列表视口中至少完整显示 3 张卡片，无需先滚动。
- 不再显示独立的 `CONDITION` 区块标题。
- 属性名、条件摘要、T1–T7、修饰标签和全部操作均保留。
- 页面不显示 `SELECT TX` 文案；T1–T7 位于条件内容右侧、操作图标左侧并垂直居中。
- 属性名与条件摘要保持左侧上下两层。
- 右侧仅显示 Pencil、Eye（仅 Pairing）、Trash、Plus Circle 小图标，不显示紫色 `Add to Bid` 大按钮。
- 长条件完整自然换行，不被遮挡、裁切或省略。
- 长属性名完整自然换行；Tier 组和右侧图标组不得被压缩、拆行或遮挡。
- T1–T7、Edit、Delete、Preview、Add 的交互和禁用规则与修改前一致。
- 未选择任何 Tier 时 Plus Circle 置灰且不可添加。
- Preview 只在 Pairing 收藏中显示；修饰标签只在数据实际存在时显示。
- Rule Bid 的 Popover 删除确认与 Pairing 的卡内删除确认均保持原有 Cancel、Confirm、pending、禁用和关闭行为。
- 每个纯图标按钮具有可访问名称、至少 28×28px 命中区域和可见键盘焦点；Tab 顺序与视觉顺序一致，Enter/Space 可触发。
- Pairing 删除确认展开在信息行下方独占整行，无横向溢出；取消或失败后焦点恢复到 Delete，成功后焦点移至仍存在的相邻卡片操作或收藏列表标题。
- 1920×1080、1366×768 下无横向溢出、遮挡或操作区域错位。
- 不改变 API 请求和业务数据。

## 8. 验证

- 更新组件测试，覆盖收藏摘要、Tier 切换、编辑、删除、预览和 Add to Bid。
- Playwright 在真实 Bid 页面打开 `FAVORITED PROPERTIES`，验证：
  - 一张普通收藏卡的高度处于 56–72px。
  - 使用至少 4 条普通短条件测试数据时，1920×1080 的收藏列表视口内至少完整显示 3 张。
  - 长条件完整换行且不溢出、不省略。
  - T1–T7 和 Add 图标仍可操作。
  - 页面中不存在 `SELECT TX` 文案。
- T1–T7 在 1920×1080 与 1366×768 下位于条件右侧、图标左侧，并保持单行、垂直居中。
- 使用上述长文本 fixture 在 1366×768 下验证 `left.right < tier.left < tier.right < actions.left`，三栏不重叠、不换序且不超出卡片。
  - 右侧只出现小图标，且未选 Tier 时 Add 图标禁用。
  - 长属性名完整换行，但 Tier 组及右侧图标组保持单行。
  - 逐一验证图标 `aria-label`、Tab 顺序、可见 focus、Enter/Space 激活和至少 28×28px 命中区域。
  - 验证禁用 Add 不产生请求；选择 Tier 后 Add 可通过键盘触发。
  - Rule Bid Popover 删除确认和 Pairing 卡内删除确认均可取消、确认，并在 pending 时正确禁用。
  - Pairing 确认区展开后位于信息行下方，无横向溢出；取消或失败后焦点恢复到 Delete，成功后焦点移至仍存在的相邻卡片操作或收藏列表标题。
- 更新 `docs/test-cases/pbs/bid/` 下的人工 QA。
- 运行 Portal 单测、lint、build、`npm run check:ui` 和相关 Playwright。

## 9. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 两个收藏卡渲染路径需要共享同一视觉契约，且测试断言与布局变化紧密关联；并行修改容易产生不一致。
- Suggested split: 由一个实现流程完成组件、样式和测试。
- Write boundaries: 收藏卡组件、对应测试和 QA。
- Conflict risk: Low。
- Execution gate: 本 spec 经用户审阅并明确批准实施后再开始修改代码。
