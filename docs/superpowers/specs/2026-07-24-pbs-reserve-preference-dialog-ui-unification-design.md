# PBS Reserve Preference 配置弹窗 UI 统一设计

## 1. 背景

当前 `Configure Reserve Preference` 已使用 Portal 的 `PbsDialogFrame`，但弹窗内部仍保留一套独立样式和交互：

- Tx 使用四列 checkbox 卡片，而 Pairing 条件使用标准 `TierToggleGroup`。
- 标题、副标题、分组标题、必填提示和垂直间距与 Pairing Preference 不一致。
- footer 单独维护 Cancel / Add Bid 按钮样式，按钮高度、字号、颜色和 pending 状态与 Pairing 不一致。
- Date Range 使用两个独立的 `PortalDatePicker`，Specific Dates 使用“单日输入 + ADD DATE + chip”流程。
- 新增和编辑 Reserve Preference 分别维护相似的 Short-call Type / Date Scope 控件，容易继续产生视觉和行为差异。

这不是 Reserve bid 数据或保存逻辑错误，而是员工端同类配置流程的 UI 一致性问题。

## 2. 目标

将 Reserve Preference 的新增与编辑弹窗纳入现有 PBS Preference 条件 UI 体系，使用户在 Reserve 和 Pairing 之间切换时获得一致的视觉层级、选择方式、日期交互和保存反馈。

本次统一遵循以下原则：

1. 统一弹窗骨架和可复用交互，不强行统一不同的业务字段。
2. 保留 Reserve Preference 当前业务语义、默认值、payload 和接口。
3. 优先复用已经验收的 shared preference primitives。
4. 实施范围保持可控，不顺带重做 Reserve 页面或历史隐藏 Reserve property。

## 3. 非目标

本次不包含：

- 不修改 Reserve Preference 的 property code、API contract、数据库结构或算法导出格式。
- 不修改 `Whole Month / First Half / Second Half / Date Range / Specific Dates` 五种日期范围语义。
- 不新增 Award / Avoid、Any / Every、Save Favorite 或搜索预览。
- 不修改 Reserve coverage calendar、右侧已有条件列表或 tier 行操作。
- 不恢复或重做已隐藏的 Legacy / AA Reserve 工作流。
- 不要求 Reserve 弹窗与 Pairing Preference 使用相同宽度或出现相同字段。

## 4. 方案比较

### 方案 A：受控统一到共享 Preference 组件（推荐）

保留 Reserve 业务字段，统一 Tier、分组标题、日期选择器和 footer；抽取新增与编辑共用的 Reserve Preference 字段编辑器。

优点：

- 用户感知的一致性最高。
- 日期与选择状态可以直接继承已验收行为。
- 新增和编辑不会继续维护两套相似字段逻辑。
- 不改变后端契约。

代价：

- 会同时触达 Reserve 新增弹窗、Reserve 编辑弹窗及少量共享 UI。
- 共享 footer 调整需要补 Pairing 回归，确保外观和行为不变。

### 方案 B：只复制 Pairing CSS 到 Reserve

保留现有组件结构，仅修改 className。

优点是改动表面较小；缺点是继续保留 checkbox Tier、两个独立日期框和重复 footer，后续仍会漂移，也违反“先复用，再新增”的项目规范。

不采用。

### 方案 C：把 Reserve 完全迁入 Pairing 配置组件

让 Reserve Preference 直接进入 `PairingPropertyConfigDialog`。

优点是表面上只剩一套弹窗；缺点是 Reserve 的五种 Date Scope、short-call type 和现有保存流程与 Pairing property contract 不同，会造成模块耦合和不必要的业务改造。

不采用。

## 5. 推荐设计

### 5.1 弹窗骨架

继续使用 Portal 既有的 `PbsDialogFrame`，保留白色轻量弹窗、半透明遮罩、右上关闭按钮及滚动行为。

新增弹窗按以下顺序展示：

1. `Configure Reserve Preference`
2. `TIERS · REQUIRED`
3. `SHORT-CALL TYPE`
4. `DATE SCOPE`
5. footer

移除当前重复解释业务字段的副标题 `Select the short-call type, Tx, and dates to apply.`。字段本身已经足够表达操作目的，与 Pairing Preference 的标题层级保持一致。

弹窗维持适合 Reserve 字段密度的紧凑宽度，不为了视觉统一强制扩大到 Pairing Preference 的宽度。

### 5.2 Tiers

新增 Reserve Preference 时：

- 将 `APPLY TO TX` checkbox 网格替换为 `TIERS` + `TierToggleGroup`。
- T1–T7 保持空选初始状态。这是当前 `DEFAULT_TIERS = []` 的既有行为，由回归测试锁定，不是本次新增规则。
- 没有选中 Tier 时显示 `· REQUIRED`，`ADD BID` 保持禁用。
- 选择、取消选择和排序后的 payload 继续使用当前 `string[]` Tier 值。
- pending 时 Tier 按钮只读，不允许继续修改。

已有 Reserve Preference 的编辑弹窗继续只编辑该行的 bid 值；Tier 仍由已有条件行的 Tier 操作管理。本次不把 Tier 修改职责重复放入编辑弹窗。

### 5.3 Short-call Type

保留当前由 property options 提供的下拉选项和默认值逻辑，不硬编码新的业务选项。新增弹窗继续使用第一个合法 option 作为初始 call type；编辑弹窗继续优先使用已保存值。这些均为当前行为。

控件放入标准 Preference section：

- 标题为 `SHORT-CALL TYPE`。
- 下拉框保持单选。
- 选项为空或当前值不在合法选项中时禁止保存。这是当前 `canConfirm` 的既有校验。
- pending 时禁用。

新增与编辑弹窗复用同一个 feature-local Reserve Preference 字段编辑器，避免分别维护 call type 与 date scope 的 UI。

### 5.4 Date Scope

保留以下五种模式及当前 payload：

- `Whole Month`
- `First Half`
- `Second Half`
- `Date Range`
- `Specific Dates`

由于选项数量为五个，继续使用单一 select，不强行改成拥挤的五段 segmented control。select 的 section 标题、尺寸、focus 和 disabled 状态按 Preference 标准统一。

日期输入改为共享 `PbsDatePicker`：

- `Date Range` 使用一个 `mode="range"` 控件和同一张范围日历，不再显示两个独立日期输入。
- `Specific Dates` 使用一个 `mode="multiple"` 控件，不再使用“单日输入 + ADD DATE + chip”的独立流程。
- 日期选择限制在当前 bid period。
- `periodCode` 的唯一来源为 `ReservePage` 已加载的 `data.rightPanel.draftMeta.periodCode`。新增弹窗直接接收该值；编辑弹窗由 `ReservePage` 的 `renderExistingPropertyEditDialog` 闭包把同一值传给 `ReserveBidDialog`，不修改通用 `RuleBidRightPanel` dialog contract。
- `periodCode` 为空、格式无效或页面数据尚未就绪时，不允许回退为无边界日期选择：Reserve 页面维持 loading/error 状态，Date Range / Specific Dates 控件不可用，主操作按钮禁用，并显示明确的 period unavailable 状态。
- 切换到 Whole Month、First Half 或 Second Half 时，输出 payload 不携带旧 range 或 specific dates。这是当前 `buildEmptyReserveDateScopeForMode` 的既有行为。
- 切换 Date Range / Specific Dates 后，在选择完整值前禁止保存。
- 已保存值必须在编辑弹窗中正确回显。

日期 UI 与现有 payload 之间增加明确的 feature-local adapter，遵守以下等价约束：

- 始终使用 `YYYY-MM-DD` date-only string，不创建 `Date` 对象，不执行本地时区或 UTC 转换。
- `whole_month`、`first_half`、`second_half` 继续只输出 `{ mode }`。
- `date_range` 继续输出 `{ mode: "date_range", from, to }`，字段名和空值规则不变。
- `specific_dates` 继续输出 `{ mode: "specific_dates", dates }`；有效日期保持去重、升序排列，与当前新增流程一致。
- picker 的临时显示状态不得直接进入请求；只有 adapter 生成的完整 `ReserveDateScope` 可以交给现有 `buildReservePreferenceProperty` 或编辑保存入口。

历史兼容处理：

- 初始化时先保留服务端返回的原始 `ReserveDateScope`，不得先过滤、排序或覆盖后再渲染。
- 若历史 specific date 或 range endpoint 超出当前 period，禁止静默删除、截断或自动归入当前月份。
- 如果 `PbsDatePicker` 能无损显示该历史值，则保留显示；如果不能，弹窗必须列出原始越界值并显示兼容警告，`UPDATE BID` 保持禁用，直到用户明确选择一组完整、合法的新日期。取消弹窗不会产生写入。
- 实施前使用当前受控 fixture 和远端只读数据检查该类值是否存在；发现真实越界数据时，停止实施中的推断并回到 Spec 确认兼容展示，不用代码静默“修正”数据。

### 5.5 Footer

Reserve 与 Pairing 使用同一套 bid dialog footer 视觉和状态规则：

- `CANCEL`
- 新增时 `ADD BID` / `ADDING...`
- 编辑时 `UPDATE BID` / `UPDATING...`

实现时将当前 Pairing footer 的通用视觉骨架下沉为 shared bid dialog footer，Pairing 可保留 feature wrapper 以避免大范围调用方改动。

Reserve 不显示 `SAVE FAVORITE`。是否展示 Favorite 按钮由调用方能力显式控制，不能因复用 footer 自动出现。

所有按钮必须保持：

- 相同高度、字号、间距和圆角。
- 正确的 disabled / pending 视觉。
- pending 期间禁止关闭或重复提交。

### 5.6 新增与编辑的数据流

新增流程：

1. Reserve 页面从 `data.rightPanel.draftMeta.periodCode` 提供 property template、当前 period code，以及可选的 coverage calendar 预填日期。
2. 弹窗初始化 call type、空 Tiers 和 date scope。
3. 共用字段编辑器输出 call type 与 `ReserveDateScope`。
4. 页面继续使用现有 `buildReservePreferenceProperty` 和保存入口。

编辑流程：

1. Existing property 继续通过当前 Reserve 编辑入口打开。
2. `ReservePage` 在 `renderExistingPropertyEditDialog` 中把 `data.rightPanel.draftMeta.periodCode` 传给 `ReserveBidDialog`。
3. 共用字段编辑器从已有 `reserve-call-type-date-scope` bid 回显 call type 和原始 date scope。
4. `UPDATE BID` 继续提交现有 `RuleBidExistingProperty`，不改变接口形状。

coverage calendar 点击某日时，仍以 `Specific Dates` 打开并预填该日期。

## 6. 验证与错误处理

- 必填 Tier、call type 或日期不完整时，主操作按钮禁用，不发送请求。
- Tiers 空选、call type 合法性检查、scope 切换清理和日期完整性检查均沿用当前初始化/校验规则；本次只改变呈现组件。若实施核对发现当前规则与本文描述不同，必须先回到 Spec 确认，不能借 UI 统一修改业务默认值。
- Date Range 的结束日期不能早于开始日期。
- Specific Dates 至少选择一个日期。
- 保存失败继续使用现有页面 message 错误提示，弹窗保留用户输入。
- 保存成功后关闭弹窗并刷新已有 Reserve properties，行为保持现状。
- pending 期间关闭按钮、字段和 footer 操作均不可用，防止重复写入。

## 7. 可访问性

- 弹窗继续提供明确的 dialog accessible name。
- Tier 使用语义化 button、`aria-pressed` 和准确的 Tier label。
- 下拉框和日期控件必须有稳定的英文 accessible name。
- 所有可点击控件显示 pointer，disabled 状态显示不可点击语义。
- keyboard focus 不被弹窗边缘或 footer 裁切。
- 日期 picker 支持键盘打开、清空和选择。

## 8. 测试与验收标准

### 8.1 自动化测试

Focused Vitest 至少覆盖：

1. 新增弹窗初始 Tiers 为空，显示 REQUIRED，ADD BID 禁用。
2. 使用 `TierToggleGroup` 选择 T1–T7，并保持正确 payload。
3. 对五种 Date Scope 分别比较迁移前后的 `buildReservePreferenceProperty` 输入及最终 service 请求 payload，断言 mode、字段名、date-only string、排序、去重和空值规则完全等价。
4. call type 与五种 Date Scope 保持当前默认值、切换清理和重新打开回显。
5. Date Range 使用单一 range picker，并校验不完整/倒序范围。
6. Specific Dates 使用 multiple picker，支持添加、删除、去重、排序和回显。
7. coverage calendar 日期预填仍然有效，真实请求 payload 仍为 `specific_dates`。
8. 缺失/无效 period code 时日期控件和提交禁用，不退回无边界 picker。
9. 编辑包含越界 historical range/specific dates 时不静默过滤或提交；显示兼容状态并保留原始 bid。
10. pending 期间字段、关闭和 footer 均不可操作。
11. 编辑已有 Reserve Preference 时正确回显，并提交与迁移前等价的 UPDATE BID payload。
12. 共享 footer 改动后，Pairing 新增、更新和 Save Favorite 行为无回归。

Playwright 至少覆盖真实 Reserve 页面：

1. 从 `ADD RESERVE PREFERENCE` 打开弹窗。
2. 选择 Tier、Short-call Type 和 Date Scope 后保存。
3. 从 coverage calendar 点击日期，验证 Specific Dates 预填并保存。
4. 编辑已有 Reserve Preference，验证回显和更新。
5. 断言新增弹窗采用标准 Tier buttons，Date Range 只有一个范围入口。
6. 拦截并断言新增、coverage 预填和编辑更新的真实 HTTP request body；不能只检查页面文字或视觉状态。

Playwright 使用 `tests/pbs-portal/reserve-preference.spec.ts` 现有的受控 route fixture/mock API：

- 测试驱动真实 Portal UI 和 service 调用，但所有写请求由 fixture 拦截，不向 SIT、开发、UAT 或共享业务账号写入测试 bid。
- fixture 必须记录并断言请求 method、URL 和 payload；后端 schema/contract 兼容由 focused service/mapper tests 负责。
- 每个用例初始化独立 draft fixture，不依赖前一用例写入，也不需要清理远端数据。
- `--no-deps` 执行前要求 Playwright 配置对应的 Portal web server 已可用；若本机未启动依赖服务，则去掉 `--no-deps` 使用配置负责启动，不能连接共享环境完成写入型测试。
- 如需额外真实环境 smoke，必须使用明确授权的隔离测试账号和可恢复数据，并作为单独步骤执行，不属于本 Spec 的默认验收。

### 8.2 人工 QA

在 `docs/test-cases/pbs/reserve/` 增加独立测试案例，覆盖：

- 1920×1080 基线布局。
- 较低视口下弹窗滚动、footer 固定及 focus 不裁切。
- T1–T7 一行显示和 required 状态。
- Whole / First / Second Half。
- Date Range / Specific Dates。
- 新增、编辑、取消、pending 和保存失败。
- Reserve 与 Pairing Preference 弹窗并排视觉核对。

### 8.3 交付命令

实施完成后至少运行：

```bash
cd pbs-portal
npm test
npm run lint -- --quiet
npm run build

cd ..
npm run check:ui

cd e2e
npx playwright test tests/pbs-portal/reserve-preference.spec.ts \
  --config=config/playwright.config.ts \
  --project=pbs-portal --no-deps

cd ..
git diff --check
node .gitnexus/run.cjs detect-changes --scope unstaged
```

## 9. 验收结果

满足以下条件视为完成：

- Reserve Preference 与 Pairing Preference 使用一致的标题、section、Tier 和 footer 视觉语言。
- 新增弹窗不再出现 checkbox Tier 网格。
- Date Range 不再显示两个独立日期输入。
- Specific Dates 不再使用独立 ADD DATE 流程。
- Reserve 独有的 short-call type 和五种 Date Scope 语义完整保留。
- 新增、coverage calendar 预填、编辑和错误处理行为无回归。
- 五种 scope 的新增/编辑请求均有 payload 等价断言；API payload、数据库和算法导出格式不变。
- UI 检查零 hard violation，相关 Vitest 与 Playwright 全部通过。

## 10. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 主要改动集中在 Reserve dialog、共用 date scope/editor 和 shared footer，组件与测试调用链紧密；并行编辑容易在相同文件产生冲突，协调成本高于收益。
- Suggested split: 单一实现者完成组件与 focused tests，再顺序更新 Playwright 和 QA 文档。
- Write boundaries: 不拆分并行写入。
- Conflict risk: 若多人同时修改 Reserve dialogs、Pairing footer 或 `reserve-preference.spec.ts`，冲突风险较高。
- Execution gate: 用户审阅并明确批准本 Spec 后才进入实施。

## 11. 风险与控制

- shared footer 可能影响 Pairing 多种 property：实施前必须运行 GitNexus upstream impact，并补 Pairing focused regression。
- `PbsDatePicker` 会把日期限制在 period code：需要验证 coverage calendar 预填日期和历史已保存值均属于当前 bid period并可回显。
- Reserve 编辑弹窗还承载历史 property 分支：只替换当前 Reserve Preference 的 field editor，不能顺带改变其他分支。
- 本次不扩大到 Reserve 页面布局或已有属性表，避免 UI 统一演变为无关重构。
