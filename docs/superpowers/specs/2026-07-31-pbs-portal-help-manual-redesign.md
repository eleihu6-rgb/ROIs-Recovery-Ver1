# PBS Portal Help 通用操作手册改版设计

## 1. 背景

PBS Portal 当前 Help 仍以早期页面和功能为基础，内容覆盖不完整，且部分操作说明已经与当前 Portal 不一致。

本次改版将 Help 定位为所有机组人员共用的 PBS Portal 操作手册。用户不需要具备 PBS 使用经验，也不需要先理解排班算法，即可通过 Help 找到对应功能并完成基本操作。

Help 不区分前舱、后舱、资历或岗位，也不使用“新人”“小白”“实习生”“初学者”等身份标签。

## 2. 目标

- 用通俗、准确的方式说明 PBS Portal 各页面的用途。
- 提供从进入 Portal 到完成一次 Bid 的完整基本操作路径。
- 说明 `Current Bid`、`Standing Bid`、`Tier` 等完成操作所必需的概念。
- 覆盖查看、添加、修改、删除和确认 Bid 的主要操作。
- 确保 Help 中的页面名称、按钮、字段和行为与当前真实 Portal 一致。
- 让用户可以按操作流程学习，也可以按页面快速查找。

## 3. 非目标

- 不解释 PBS 排班算法、评分模型或优化计算细节。
- 不提供如何提高排班结果概率的投标策略。
- 不承诺某个 Bid 条件一定会获得对应排班结果。
- 不区分前舱、后舱或其他岗位。
- 不记录尚未上线、用户当前无法操作的功能。
- 不修改 Bid、Reserve、Standing Bid、Award 等业务逻辑。
- 不重新设计一套与当前 Portal 不一致的 Help 视觉体系。

## 4. 信息架构

### 4.1 Quick Start

- `PBS Portal Overview`
  - Portal 的用途。
  - 顶部主要页面分别用于什么。
- `Before You Begin`
  - 确认当前 Bid 周期和个人信息。
  - 认识 Current Bid、Standing Bid 和 Tier。
- `Complete a Bid`
  - 查看当前周期。
  - 添加 Bid 条件。
  - 选择 Tier。
  - 检查已保存内容。
  - 修改或删除条件。
  - 了解结果发布后前往 Award 查看结果。

Award 是 Bid 完成后的独立阶段。Help 不得暗示保存 Bid 后会立即产生 Award；只有当前 Portal 显示结果可用时，用户才可查看。

### 4.2 Dashboard

- 查看当前 Bid 周期。
- 查看个人信息和当前上下文。
- 阅读 Bidding Calendar。
- 查看已有 Bid 条目。

### 4.3 Bid

- 了解 Bid 工作区。
- 独立主题 `Use the Bidding Calendar` 说明左侧共享日历的用途和操作，不再只在 Dashboard 中把它当作只读概览简单带过。
  - 说明月份、当前 Bid period、`T1–T7` 热力矩阵、日期格、彩色 Bid 条目分别表示什么。
  - 说明点击 `T1–T7` 会切换当前 Tier 上下文。
  - 说明收起与展开按钮，以及收起状态会在浏览器中保留。
  - 说明在 Bid 页面点击日期可进入 `DAYS OFF` 或 `PAIRING` 操作；点击星期标题可批量处理对应星期的 Days Off；点击已有 Pairing 条目可查看或修改其 Tier。
  - 明确不同页面的边界：Dashboard 主要用于查看日历摘要和 Pairing 详情；Reserve 的条件仍通过 Reserve 自己的 Preference / Coverage Calendar 流程维护，不能暗示左侧日历会新增 Reserve 条件。
- 添加 Days Off 条件。
- 添加 Pairing 条件。
- 添加 Roster 条件。
- 选择 `T1–T7`。
- 查看、编辑和删除 Existing Bid Properties。
- 收藏和复用支持收藏的条件。
- 使用 Search Pairings 查找和预览 Pairing。

Help 应以当前统一 Bid 页面为准，不再按已废弃的独立旧页面组织内容。

旧 Help 中的 `Line` 内容和截图不得作为独立主题保留。实施时应以当前 Portal 的真实 UI 术语为准，将仍然有效的操作内容归入 `Roster`，其余旧内容删除。

### 4.4 Reserve

- 了解 Reserve 页面的用途。
- 添加 Reserve 条件。
- 配置当前 Portal 实际提供的 Reserve Preference。
- 查看、编辑和删除已保存的 Reserve 条件。
- 说明日期范围、Tier 和其他实际可用字段。

### 4.5 Standing Bid

- 说明 Standing Bid 是独立于 Current Bid 的长期备用条件。
- 说明当前 Bid period 中的 Current Bid 不包含任何已正式保存的业务条件时，Standing Bid 才作为兜底。
- 添加当前可见的 Standing 条件。
- 选择 `T1–T7`。
- 查看、筛选、编辑和删除 Existing Standing Bid。
- 说明 Standing Bid 不接受明确年月日、具体 Pairing 或其他仅适用于特定 Bid 月份的条件。
- 说明条件可见性以当前 Portal 返回的可见目录为准。

### 4.6 Award

- 说明 Award 页面用于查看最终结果。
- 说明页面中的主要信息区域和状态。
- 说明查看结果时用户能够执行的实际操作。
- 不解释内部算法过程，也不承诺结果与某个单独条件一一对应。

### 4.7 Common Questions

至少覆盖：

- 为什么某个按钮不可用？
- 保存后在哪里查看条件？
- 如何确认条件已经保存？
- Current Bid 和 Standing Bid 应该分别在哪里填写？
- 如何修改或删除已有条件？
- 为什么某些条件在 Standing Bid 中看不到？
- 保存失败或页面加载失败时应该怎么做？

错误说明只展示产品层面的结果和下一步操作，不暴露接口原始错误、异常对象、堆栈或内部实现。

## 5. Help 页面与文章形式

### 5.1 页面结构

- 保留当前 Help 的左侧目录和右侧文章布局。
- Help 首页首先提供 `Quick Start` 入口。
- 左侧目录按照本设计的信息架构重新整理。
- 用户既可以顺序阅读，也可以直接进入某个页面主题。

### 5.2 文章结构

操作类文章按需要使用以下结构：

1. `What This Page Is For`
2. `Before You Begin`
3. `Step-by-Step Instructions`
4. 真实 Portal 截图
5. `What Happens Next`
6. `Things to Know`

不是每篇文章都必须机械展示全部小节；短文章可以合并，但术语和操作顺序必须保持一致。

### 5.3 语言与措辞

- 产品 Help 使用简单、直接的英文，与 Portal 当前英文界面保持一致。
- 开发 spec、实施说明和 QA 文档使用简体中文。
- 不使用“新人”“小白”“实习生”“初学者”等身份描述。
- 不使用 `beginner`、`novice`、`intern`、`trainee`、`new user` 等英文身份标签或同义表达。
- 不按 `flight deck`、`cabin crew`、`pilot`、`flight attendant` 等岗位身份拆分操作说明。
- 使用 `Tier / Tiers / T1–T7`，不得恢复旧的 `Layer` 术语。
- 按钮、菜单、字段和页面标题使用真实 UI 的准确英文文案。
- 说明操作结果，避免只写“点击这里”而不解释下一步会发生什么。

## 6. 内容来源与维护规则

- Portal 当前实现是 Help 内容的操作事实来源。
- 写每个主题前必须阅读对应页面、弹窗、服务契约和相关测试。
- Help registry 与 topic map 必须同步更新。
- 已废弃或与当前 UI 不一致的旧 Help 内容应删除或重写，不保留误导性的兼容说明。
- 只记录当前用户实际可见、可操作的功能。
- Standing Bid 已有正式页面，因此本次纳入 Help。
- Help 不自行硬编码数据库控制的 property 可见列表；文章只说明用户在当前可见目录中选择条件。

## 7. 截图

- 截图必须来自真实运行的 PBS Portal 页面。
- 截图只能使用非生产测试环境、测试账号和脱敏或合成数据。
- 截图不得包含可识别的真实机组姓名、员工编号、排班、Award 结果或其他敏感业务信息；写入仓库前必须人工检查。
- 不使用模拟面板、设计稿或旧版截图代替真实页面。
- 现有 Dashboard、Days Off、Pairing、Reserve、Tier 截图需要逐一核对；与当前页面不一致的截图必须替换。
- 旧 `Line` 截图不再保留为独立主题；仍然有效的内容应以当前 `Roster` UI 重新截图。
- 新增 Quick Start、Bid、Standing Bid、Award 等文章时，只在截图能明显帮助理解操作时加入。
- `Bid / Use the Bidding Calendar` 必须使用一张专门从真实 Bid 工作台截取的左侧 `BIDDING CALENDAR` 图片，不得复用只包含右侧 Bid 条件区的 `bid-overview.png`。
- 该专用截图必须清楚显示 `BIDDING CALENDAR` 标题、当前周期状态、月份、`T1–T7`、日期格、至少一个合成彩色 Bid 条目和收起按钮；图片说明和替代文本必须与截图实际内容一致。
- 每个 `HelpScreenshot` 引用必须恰好对应一个存在且尺寸有效的图片文件。
- 自动化测试检查每篇文章声明的准确截图数量和图片尺寸，防止空图、重复引用或损坏图片。

## 8. Help 中的错误与异常说明

- Help 应根据 Portal 当前已有的错误交互，说明字段校验失败时用户需要修改哪个输入。
- Help 应说明页面或内容加载失败、短暂保存失败时用户可执行的恢复步骤。
- Help 文案不得暴露原始 API 错误、Axios/RPC 信息、异常对象、堆栈或敏感诊断信息。
- 常见问题应提供可执行的下一步，例如重新检查必填项、重新加载页面或联系支持。
- 本任务不修改业务页面、业务逻辑、服务契约或现有错误交互；如核对时发现问题，只记录并另行向用户确认。

## 9. 验收标准

- Help 首页存在清晰的 `Quick Start` 入口。
- Help 目录至少覆盖 Quick Start、Dashboard、Bid、Reserve、Standing Bid、Award 和 Common Questions。
- 不出现前舱/后舱差异说明。
- 不出现“新人”“小白”“实习生”“初学者”等身份标签。
- 不出现 `beginner`、`novice`、`intern`、`trainee`、`new user` 等英文身份标签或同义表达。
- 不按前舱/后舱、`flight deck/cabin crew`、`pilot/flight attendant` 等岗位身份拆分操作说明。
- 不出现已废弃的 `Layer` 业务术语。
- Help 中的页面、按钮和字段名称与当前 Portal 一致。
- Bid 目录存在独立的 `Use the Bidding Calendar` 主题；用户能从该文章了解左侧日历的用途、`T1–T7`、日期与星期操作、Pairing 条目、收起/展开，以及 Dashboard / Bid / Reserve 的操作边界。
- `Use the Bidding Calendar` 必须引用新的专用图片而非 `bid-overview.png`；图片必须真正展示左侧日历，并清楚包含 `BIDDING CALENDAR` 标题、当前周期状态、月份、`T1–T7`、日期格、至少一个合成彩色 Bid 条目和收起按钮，且 alt/caption 与这些实际内容匹配。
- 用户能够仅通过 Help 找到并完成以下基本操作：
  - 查看当前 Bid 周期。
  - 添加一个 Current Bid 条件并选择 Tier。
  - 查看、修改和删除已有 Bid 条件。
  - 添加和维护 Reserve 条件。
  - 添加和维护 Standing Bid 条件。
  - 查看 Award。
- Current Bid 与 Standing Bid 的关系说明必须与当前服务契约一致：当前 Bid period 中存在至少一个已正式保存的 Current 业务条件时使用 Current；不存在此类条件时才由 Standing 兜底。Help 不得自行扩展“空”的业务定义。
- Award 被说明为结果发布后的独立阶段，不暗示保存 Bid 后立即产生结果。
- 不包含算法细节、投标策略或结果承诺。
- 所有引用截图存在且可正常加载。

## 10. 验证范围

### 10.1 自动化验证

- 更新 Help registry、topic map 和文章内容的相关前端测试。
- 更新 `e2e/tests/pbs-portal/help/` 下的 Playwright 内容回归：
  - Help 首页和目录导航。
  - Quick Start 关键内容。
  - Dashboard、Bid、Reserve、Standing Bid、Award 文章入口。
  - 禁止术语检查。
  - 关键真实 UI 标签检查。
  - `Use the Bidding Calendar` 主题入口、用途说明、实际操作与页面边界。
  - `Use the Bidding Calendar` 引用新的专用截图而非 `bid-overview.png`，并断言与截图内容一致的 alt/caption。
  - 截图数量、`naturalWidth` 和 `naturalHeight` 检查。
- 自动化检查至少核对当前 Portal 的页面标题和核心操作标签；准确标签清单在实施前从真实页面与对应组件中提取，并固定在实施计划和测试断言中。
- 静态 Help E2E 使用 mocked `/api/auth/session`，避免依赖后端业务数据。
- 前端样式发生变化时运行 `npm run check:ui`。
- 按模块规则运行相关 test、lint 和 build。

### 10.2 人工 QA

更新 `docs/test-cases/pbs/help/`，覆盖：

- 从 Help 首页进入 Quick Start。
- 按顺序完成一次基本 Bid 操作。
- 从左侧目录直接查找单独页面。
- 确认 Current Bid 与 Standing Bid 的说明准确。
- 检查各文章真实截图。
- 逐项确认 Bidding Calendar 专用截图实际显示标题、周期状态、月份、`T1–T7`、日期格、合成彩色 Bid 条目和收起按钮。
- 检查常见问题中的恢复步骤。
- 检查不同窗口尺寸下 Help 导航和文章可阅读。

每个核心 QA 场景必须写明：

- 使用非生产测试环境和测试账号。
- 必要的 Bid period、可见 property 和已有数据前置条件。
- Help 文章入口。
- 用户操作步骤。
- 可观察的成功结果，例如 Existing Bid Properties 出现对应记录、Tier 标签正确、编辑后摘要更新、删除后记录消失。

## 11. 影响范围

预计只涉及：

- `pbs-portal/src/features/help/`
- `pbs-portal/public/help/screenshots/`
- `e2e/tests/pbs-portal/help/`
- `e2e/scripts/capture-pbs-portal-help-screenshots.ts`
- `docs/test-cases/pbs/help/`

本任务不得修改其他业务模块、业务页面、服务契约或业务逻辑。核对过程中发现的业务 UI 或交互问题只记录，另行向用户确认后再处理。

## 12. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: Help 目录、文章、截图和测试共享同一套术语与操作顺序，拆分后容易出现内容不一致。
- Suggested split: 由一个实现流程统一完成内容核对、文章改版、截图和测试。
- Write boundaries: Help 内容、Help 截图、Help E2E、Help QA 文档。
- Conflict risk: Low。
- Execution gate: 本 spec 经用户审阅并明确批准实施后再开始修改 Help 代码。
