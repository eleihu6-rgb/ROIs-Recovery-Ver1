# PBS Portal Help 小白验收缺口修复设计

## 背景

2026-08-19 完成一轮 PBS Portal Help bid condition 图文说明增强后，又派发了一个只读“小白用户评审”子智能体。该子智能体不读代码、不读 spec、不读数据库，只通过真实 PBS Portal UI 和 Help 理解系统，并覆盖 Dashboard、Current Bid、Reserve、Standing Bid、Award 页面。

评审结论：Current Bid 条件主体已经能找到并能基本理解，但 Dashboard 字段字典、Reserve short-call 代码、Standing Bid 与 Current Bid 差异、Award 状态/空数据说明仍然不够清楚；另外 Standing Bid / Award 页面存在几个需要先只读排查的 blocker，不能直接当作 Help 文案问题处理。

## 目标

让“完全不了解 PBS 的 crew 用户”只靠 Portal Help 能理解以下内容：

- Dashboard 每个展示字段的含义、单位、period、对 crew 的用途。
- Current Bid 与 Standing Bid 的区别，尤其是 Standing Bid 的 reusable / fallback 含义。
- Reserve Preference 的 short-call 代码和 Date Scope。
- Award 页面在未发布、已发布、没有 snapshot、Reason Report 不可用时分别代表什么。
- Standing Bid 中某些条件没有选项、一直 loading 或 disabled 时，用户应如何理解。

同时必须先排查真实 UI / API blocker，避免把产品 bug 写成“正常说明”。

## 非目标

- 不在本轮 spec 中直接改数据库、修复 SIT/UAT 数据、执行 migration。
- 不修改 bid 保存算法、Award 发布算法、solver、导入逻辑。
- 不让 Help 文档代替真实功能 bug 修复。
- 不新增新的 UI 框架或 Help 文档系统。
- 不在没有业务确认的情况下编造 `Existing Credit`、short-call code、GDO/VGDO 的业务含义。

## 子智能体发现的问题归类

### Help 内容缺口

1. Dashboard 字段解释不足：
   - `Existing Credit` 的单位和统计 period 不清楚。
   - `Seniority` 数字大小含义不清楚。
   - `Language` / `Training Month` 显示 `-` 时含义不清楚。
   - `Last Login` 时区不清楚。
   - Bidding Calendar 上 `36/12` 这类数字不清楚。
   - Message Center 中 `GDO`、`VGDO`、`Unavailable`、跨日时间含义不清楚。
2. Reserve short-call 代码未解释：
   - `CRAM`、`CRPM`、`PRAM`、`PRMM`、`PRPM`、`RESA`、`RESB`。
3. Standing Bid 说明仍偏粗：
   - Help 说 reusable，但用户仍不清楚保存后什么时候参与 Current Bid。
   - 同名条件在 Current / Standing 中容易混淆。
   - Standing Reserve Preference UI 看到的 Date Scope 选项和 Help 通用说明可能不完全一致。
4. Award 页面说明不足：
   - `Awaiting publication`、`Published`、`No snapshot`、`Reason Report disabled` 语义不清楚。
   - `Duties`、`Days Off`、`Pairings`、`Credit Hours`、`Block Hours` 为 `0` 或 `--` 时含义不清楚。
   - crew 是否有发布权限、没有发布结果时该看什么不清楚。

### 需要只读排查的 blocker

1. Standing `Airport Preference` 机场/城市选择框显示 `No airports or cities match`。
2. Standing `Flight Number Preference` 选择 Charter 后仍显示 `Loading Flight Numbers...`。
3. Standing `Time Between Flights` 控件 disabled。
4. Award 没有 published roster snapshot，Reason Report disabled。
5. Award 未看到 period 切换或发布按钮。

这些 blocker 可能分别来自：

- 正常权限/数据状态。
- Help 缺少空状态解释。
- 前端组件复用 Current Bid 逻辑导致 Standing 传参缺失。
- 后端接口没有返回 Standing 所需 autocomplete/config。
- Award 页面只面向 crew 查看结果，不包含发布操作。

必须通过只读 UI/network/API/code inspection 先确认，不能直接定性。

## 方案对比

### 方案 A：只补 Help 文案

优点：

- 速度最快。
- 风险低，不触碰业务逻辑。

缺点：

- 如果 Standing / Award 的 blocker 是真实 bug，Help 会变成掩盖问题。
- 用户继续实操时仍可能卡住。

结论：不推荐单独采用。

### 方案 B：先做只读 blocker 排查，再补 Help，并把真实 bug 单独列出

优点：

- 不会把 bug 写成正常说明。
- 可以快速补齐 Help 的确定性缺口。
- 对 Standing / Award 的真实问题保留证据和后续修复边界。

缺点：

- 比纯 Help 文案多一步排查。
- 如果排查确认有 bug，需要进入下一轮实现。

结论：推荐采用。

### 方案 C：Help 补齐 + 同轮修复所有 Standing / Award bug

优点：

- 交付后用户体验最完整。

缺点：

- 范围大，涉及 Help、Standing Bid、Award、可能还有 pbs-server。
- blocker 的根因未确认前，直接承诺修复容易误改。

结论：不作为第一步。只有只读排查明确根因后，再决定是否拆出 bug-fix spec。

## 推荐设计

采用方案 B，分两阶段完成。

### 阶段 1：只读排查 blocker

#### 排查前置条件

开始排查前记录以下上下文，作为后续 Help 文案和 bug 结论的证据：

- 环境：本地 dev / SIT / UAT，URL 和 period。
- 登录用户：crew 用户、管理员用户或模拟登录用户；不要记录密码或 token。
- 账号 role / 权限：是否 crew-only，是否具备 Award 发布权限。
- 当前 bid period / roster period：Dashboard、Bid、Standing Bid、Award 页面各自显示的 period。
- Award 数据状态：目标 period 是否存在 published roster snapshot，Reason Report / explanation 数据是否存在。
- Standing 数据状态：相关 autocomplete/config 接口是否返回可用数据。

如果缺少数据或权限，只能标记为 `data blocker` / `permission blocker`，不能直接写成正常产品行为。

排查目标：

- 判断 Standing `Airport Preference` 无选项是数据空、接口限制、搜索关键字问题，还是组件 bug。
- 判断 Standing `Flight Number Preference` loading 是否是接口未返回、请求卡住、错误被吞掉，还是数据缺失。
- 判断 Standing `Time Between Flights` disabled 是否是 config 未加载、合法禁用状态，还是组件状态错误。
- 判断 Award 页面是否本来是 crew-only result view，不提供发布入口；Reason Report disabled 的启用条件是什么；没有 snapshot 时用户应该看到什么。
- 判断 Award 当前 period 来源、是否支持 period 切换、没有切换入口是设计、权限、数据状态还是 bug；Help 必须说明 crew 如何确认正在查看哪个 award period。

只读手段：

- 使用浏览器 DevTools / Playwright 观察 UI 和 network response。
- 阅读相关前端组件和 service，确认 UI 状态来源。
- 必要时只读调用本地 API 或查看已有 mock/test。
- 不修改数据库。
- 不保存 bid。
- 不点击会产生持久化写入的操作。

#### Blocker 排查矩阵

每个 blocker 必须用同一张矩阵沉淀证据：

| Blocker | UI 复现步骤 | 允许的只读操作 | Network / API 证据 | 代码或配置证据 | 结论分类 | 是否写入 Help |
| --- | --- | --- | --- | --- | --- | --- |
| Standing Airport Preference no options | 打开 Standing Bid -> Pairing -> Airport Preference | 展开选择框、输入搜索词、观察 network GET | endpoint、status、payload 摘要 | 相关 service / editor 状态来源 | 正常 / Help 缺口 / 前端 bug / 后端或数据问题 / 仍需确认 | 是 / 否 / 待确认 |
| Standing Flight Number loading | 打开 Standing Bid -> Pairing -> Flight Number Preference | 切换 Type、观察 loading 和 network GET | endpoint、status、payload 摘要 | autocomplete service 和 loading 状态来源 | 同上 | 同上 |
| Standing Time Between disabled | 打开 Standing Bid -> Pairing -> Time Between Flights | 观察 disabled 控件、network/config GET | endpoint、status、payload 摘要 | limits/config 状态来源 | 同上 | 同上 |
| Award no snapshot / Reason disabled | 打开 Award | 观察状态、Reason button、network GET | endpoint、status、payload 摘要 | Award mapper / disabled 条件 | 同上 | 同上 |
| Award period switch / publish button missing | 打开 Award，查找 period 控件和 publish 操作 | 只观察，不点击任何发布类动作 | endpoint、status、payload 摘要 | route / permission / role guard | 同上 | 同上 |

只读操作边界：

- 允许打开页面、打开弹窗、展开下拉框、输入搜索关键词、切换本地 UI 过滤项、查看 GET response。
- 禁止点击 `ADD BID`、`SAVE BID`、`UPDATE BID`、`DELETE`、`PUBLISH` 或任何会持久化数据的按钮。
- 如需验证保存按钮启用条件，只观察 disabled/enabled 状态，不提交。

产出：

- 每个 blocker 的结论：`正常状态 / Help 缺口 / 前端 bug / 后端或数据问题 / 仍需业务确认`。
- 如果是 bug，列出最小修复范围和风险。
- 如果是正常状态，写入 Help 的空状态解释。

### 阶段 2：补 Help 内容和截图

#### Dashboard Help

Dashboard Help 不把所有字段继续堆在一个长 Overview 里，按现有信息架构拆开：

- `Dashboard / Overview`：保留页面用途、关键区域、用户应该先确认哪些上下文。
- `Dashboard / User and bid information`：集中解释左侧 identity、Bid Information、User Information 字段。
- `Dashboard / Read the bidding calendar`：解释 calendar、T1-T7、日期 badge、颜色。
- `Dashboard / Read calendar entries` 或新增 `Dashboard / Message Center`：解释 pre-assigned duties、Duties、Covered days、Duty Details。

如果现有 Help topic 已注册但内容不足，优先扩充现有 topic；只有现有 topic 承载不下时才新增并注册独立 topic。

具体内容：

- 增加 `BID INFORMATION-LOCAL TIME` 字段表：
  - `Bid Start` / `Bid End`：bid window 的开关时间，说明为何 May bid window 对 Jun roster period。
  - `Remaining`：open period 的粗粒度倒计时；closed period 显示 `Closed`。
- 增加 `USER INFORMATION` 字段表：
  - `Base`、`Fleet`、`Position`、`Seniority`、`Language`、`Existing Credit`、`Training Month`、`Last Login`。
  - 对单位、period、时区、`-` 含义必须基于实现或业务确认，不猜。
- 增加 `BIDDING CALENDAR` badge 解释：
  - `requested/max`，例如 `36/12`。
  - 绿色/黄色/红色含义。
  - 同一 crew 多个 tier 重复申请时如何计数。
- 增加 `Pre-assigned Duties` 字段表：
  - `Duties`、`Covered days`、`Pairing`、`Days Off`、`Unavailable`。
  - `GDO`、`VGDO` 等 duty label 的含义来源。
  - 跨日时间段，例如 `18:05-04:55`。

#### Reserve Help

更新 `Reserve / Add Reserve Preference`、`Reserve Conditions -> Reserve Preference`：

- 增加 short-call code glossary。
- 增加 Date Scope 选项逐项说明。
- 明确 Current Reserve Preference 和 Standing Reserve Preference 的差异：
  - Current 绑定当前 bid period。
  - Standing 是长期 reusable preference。
  - 如果 UI 中 Standing 只支持部分 scope，Help 要按实际 UI 描述，不写不存在选项。

#### Standing Bid Help

更新 `Standing Bid / Overview`、`Standing Bid / Add and manage Standing Bid`、`Standing Bid Conditions`：

- 增加 Standing Bid 生命周期说明：
  - 保存在哪里。
  - 何时作为 fallback 使用。
  - Current Bid 有业务条件时，Standing Bid 如何参与或不参与。
- 对同名条件增加 context：
  - `Current Bid condition`：当前 period。
  - `Standing Bid condition`：reusable long-term。
- 增加空状态 / disabled / loading 说明，但只写排查确认后的事实。
- 如果某个 blocker 是 bug，不在 Help 中包装成正常现象；改为记录在实现计划中。

#### Award Help

更新 `Award / Overview`：

- 增加 Award 状态表：
  - `Awaiting publication`
  - `Published`
  - `No matching published roster snapshot`
  - `Reason Report disabled`
- 增加 KPI 字段解释：
  - `Duties`
  - `Days Off`
  - `Pairings`
  - `Credit Hours`
  - `Block Hours`
- 增加空数据解释：
  - `0` 和 `--` 的区别。
  - 没有 published snapshot 时的正常阅读方式。
- 明确 crew portal 是否可以发布 Award：
  - 如果不能发布，Help 必须说 Award 是查看结果页，不是发布控制台。
  - 如果应有发布入口但缺失，则作为 bug 单独修复。
- 明确 Award period：
  - Award 页面当前 period 从哪里来。
  - 用户在哪里确认正在看的 result period。
  - 如果支持切换 period，Help 要说明切换入口。
  - 如果 crew portal 不支持切换，Help 要说明原因；如果应支持但缺失，作为 bug。

#### Help 导航

根据排查结果决定是否调整：

- 若同名 Current / Standing 条件确实造成混淆，在 Help 搜索结果或三级目录中增加上下文标签。
- 不改变现有分类骨架，除非必要。
- 点击三级目录必须定位到对应 condition 卡片。

## 预计修改文件

Help 内容：

- `pbs-portal/src/features/help/topics/dashboard/dashboard-overview.tsx`
- `pbs-portal/src/features/help/topics/dashboard/dashboard-calendar.tsx`
- `pbs-portal/src/features/help/topics/award/award-overview.tsx`
- `pbs-portal/src/features/help/topics/reserve/reserve-add-bids.tsx`
- `pbs-portal/src/features/help/topics/reserve/reserve-short-call.tsx`
- `pbs-portal/src/features/help/topics/standing-bid/standing-bid-overview.tsx`
- `pbs-portal/src/features/help/topics/standing-bid/standing-bid-manage.tsx`
- `pbs-portal/src/features/help/topics/bid-conditions/condition-help-data.ts`
- `pbs-portal/src/features/help/topics/bid-conditions/condition-reference.tsx`

可能涉及 Help 导航：

- `pbs-portal/src/features/help/components/help-nav.tsx`
- `pbs-portal/src/features/help/components/help-view.tsx`
- `pbs-portal/src/features/help/help-data.ts`

截图和测试：

- `e2e/scripts/capture-pbs-portal-help-screenshots.ts`
- `pbs-portal/public/help/screenshots/*.png`
- `e2e/tests/pbs-portal/help/help-content-dashboard.spec.ts`
- `e2e/tests/pbs-portal/help/help-content-rule-bids.spec.ts`
- `e2e/tests/pbs-portal/help/help-content-bid-conditions.spec.ts`
- `e2e/tests/pbs-portal/help/help-navigation.spec.ts`
- `docs/test-cases/pbs/help/2026-07-31-pbs-portal-help-manual.md`

如果 blocker 排查确认是 bug，可能另行涉及：

- Standing Bid 相关 property editor / autocomplete service。
- Award page service / status mapper。
- 对应 pbs-server route 或 query。

这些不在 Help-only 修改中混入，除非根因非常小且用户确认同轮修。

## 数据与业务定义来源

实现前必须确认以下定义来源：

- `Existing Credit` 的单位与 period。
- `Seniority` 排序方向。
- `Language` / `Training Month` 的 `-` 含义。
- `Last Login` 时区。
- `GDO` / `VGDO` / unavailable duty label 的来源。
- short-call code 的权威定义。
- Award 状态与 Reason Report 启用条件。

优先来源：

1. 当前 UI 组件和 pbs-server API mapper。
2. 数据字典 / catalog / config service。
3. 已有产品文档或测试。
4. 如果仍无法确认，向用户标记“需要业务确认”，不猜。

实现时必须维护一张“定义证据表”，可放在对应 spec / QA 文档 / 实施总结中：

| 字段或代码 | 最终 Help 文案 | 来源类型 | 来源位置 | 未确认项处理 |
| --- | --- | --- | --- | --- |
| Existing Credit | 待确认 | API / mapper / 产品确认 | 待填写 | 未确认前不写死 |
| Seniority | 待确认 | API / mapper / 产品确认 | 待填写 | 未确认前不写死 |
| GDO / VGDO | 待确认 | duty type dictionary / mapper | 待填写 | 未确认前不写死 |
| CRAM / CRPM / PRAM / PRMM / PRPM / RESA / RESB | 待确认 | dictionary / config / 产品确认 | 待填写 | 未确认前不写死 |
| Award status | 待确认 | Award API / mapper | 待填写 | 未确认前只写空状态，不写业务判断 |

## 验收标准

1. Dashboard Help 能解释当前页面可见字段，不再让用户问“这个数字是什么单位、哪个 period”。
2. Bidding Calendar Help 明确 `requested/max` 和颜色含义。
3. Message Center Help 明确 pre-assigned duties、covered days、duty detail、duty type/tag。
4. Reserve Help 明确 short-call code 和 Date Scope。
5. Standing Bid Help 明确 Current / Standing 差异和 reusable/fallback 行为。
6. Standing blocker 有排查结论，不再只有“无法操作”。
7. Award Help 明确状态、空数据、Reason Report disabled、crew 是否能发布、当前 period 来源与是否支持 period 切换。
8. Help 导航不会让 Current / Standing 同名条件产生明显混淆。
9. Playwright Help 回归通过。
10. 新增或更新人工 QA 用例。
11. 业务定义证据表已完成；未确认项不会进入最终 Help 文案。

## 测试计划

只读排查：

- 按“Blocker 排查矩阵”逐项记录 UI、network、代码/config 证据。
- 允许使用 Playwright 或 Chrome DevTools 做只读观察。
- 允许只读 API 调用；禁止任何保存/发布/删除。
- 排查完成后再运行 Help E2E，确认已有 Help 不被破坏。

Help 自动化：

```bash
cd /Users/lei/Codehub/rois-ai/e2e
npx tsx scripts/capture-pbs-portal-help-screenshots.ts
npx playwright test -c config/playwright.config.ts --project=pbs-portal tests/pbs-portal/help/ --reporter=list --no-deps
```

构建与规范：

```bash
cd /Users/lei/Codehub/rois-ai
pnpm --dir pbs-portal build
npm run check:ui
git diff --check
node .gitnexus/run.cjs detect-changes -r /Users/lei/Codehub/rois-ai
```

人工 QA：

- 复跑 `docs/test-cases/pbs/help/2026-07-31-pbs-portal-help-manual.md` 中 Dashboard、Bid Conditions、Standing Bid、Award 相关章节。
- 再派发一个只读小白子智能体做回归，要求它重点复验本次缺口。

## 风险与控制

- 风险：Help 文案写了未确认业务含义。
  - 控制：实现前先确认来源；不能确认就标注为业务确认项。
- 风险：把真实 bug 写成正常空状态。
  - 控制：先做只读 blocker 排查，再决定 Help / bug fix。
- 风险：Standing 和 Current 同名条件文案重复导致误导。
  - 控制：增加 context 说明，必要时调整导航显示。
- 风险：截图与真实 UI 不一致。
  - 控制：所有截图通过现有脚本从真实 UI 采集，并由 Playwright 验证加载。

## Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: 本任务可拆成只读排查、Help 文案实现、截图/测试验证三个独立方向。排查和文案不能完全并行，因为 blocker 结论会影响文案，但截图/测试更新可在文案定稿后独立验证。
- Suggested split:
  - 主智能体：整合排查结论，修改 Help、测试、QA 文档。
  - 只读排查 agent：检查 Standing/Award blocker，不写文件。
  - 只读小白复验 agent：实现后只用 UI/Help 复验缺口。
- Write boundaries:
  - 排查 agent 和复验 agent 不写文件。
  - 主智能体负责所有代码和文档修改。
- Conflict risk: Low for read-only agents; Medium if bug fix expands into frontend/backend code.
- Execution gate: 用户确认本 spec 后，先进行只读 blocker 排查；排查结论回来后再执行 Help 修改。若确认有真实 bug，先向用户说明根因和最小修复范围。
