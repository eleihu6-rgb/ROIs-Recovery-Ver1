# PBS Portal Help 同步 Dashboard、Bidding Calendar 与 Pairing Filters 设计

## 状态

- 文档状态：待用户审阅
- 日期：2026-08-18
- 目标模块：`pbs-portal`
- 目标区域：PBS Portal in-app Help
- 需求类型：Help 内容与截图同步

## 背景

近期 PBS Portal 已调整多处员工端可见功能，但 Help 仍有部分旧内容：

- Dashboard 旧截图仍显示 `TOTAL BIDDER`、`BASE LINE AVERAGE`、fleet / sub-fleet 信息。
- Dashboard 右侧 `MESSAGE CENTER` 已改为展示 `Pre-assigned Duties`，并隐藏 `BID PACKAGE`，Help 还没有准确说明。
- Dashboard 左侧 `REMAINING` 已改为粗粒度倒计时，只显示天和小时，不再显示分钟。
- Dashboard 左侧 `USER INFORMATION` 保留 `EXISTING CREDIT`，并展示 `BASE / FLEET / POSITION / SENIORITY / LANGUAGE / TRAINING MONTH / LAST LOGIN` 等字段，Help 里还保留了过时的 `Bid metrics` 表述。
- `BIDDING CALENDAR` 日期格底部新增 `23/33` 这类 Days Off 容量数字，Help 还没有解释含义和颜色。
- `Configure Pairing Preference` 内的 `Filters` 已改为弹窗，并增加 station、layover、credit、Redeye、DHD 等筛选条件，Help 还没有覆盖。

因此需要同步 Help，使用户看到的操作手册与当前 Portal UI 一致。

## 目标

- 更新 Help 正文，准确解释当前 Dashboard、BIDDING CALENDAR、Pairing Filters。
- 更新过期截图，至少包括：
  - `pbs-portal/public/help/screenshots/dashboard-overview.png`
  - `pbs-portal/public/help/screenshots/bid-calendar.png`
- 更新 Help E2E 内容断言，防止旧文案或旧截图含义回退。
- 更新 Help 人工测试文档，供 QA 按当前功能验证。
- 保持 Help 文案使用当前 Portal UI 英文标签，不使用旧 `Layer` 术语。

## 非目标

- 不实现新业务功能。
- 不改 Dashboard、Pairing、Days Off 的业务逻辑。
- 不改 `/api/bidding-calendar/current`、`/api/dashboard/summary`、Pairing preview API contract。
- 不新增数据库 migration。
- 不写暂缓中的 `Reserve Short Call` 合并说明。
- 不把 `Simulated Crew Portal` 写进员工端 PBS Portal Help。该功能属于后台/admin 工具，不是 crew portal 员工操作手册范围。
- 不新增 Standing Bid 未完成或未确认的操作说明。

## 方案选择

### 方案 A：只改正文，不更新截图

优点：

- 改动小，速度最快。

缺点：

- `dashboard-overview.png` 和 `bid-calendar.png` 已明显过期，用户会看到旧字段和旧右侧信息。
- Help 图文不一致，容易继续引发误解。

### 方案 B：正文、截图、自动化和人工测试一起同步（推荐）

优点：

- Help 与真实 UI 对齐。
- E2E 可以锁住关键 Help 文案，避免旧内容回退。
- QA 文档也同步，不会出现测试说明和产品 Help 不一致。

缺点：

- 需要重新捕获至少两张截图。
- 需要多跑 Help E2E 与截图校验。

### 方案 C：重构 Help 分类，拆出更多 Dashboard / Calendar / Pairing 子文章

优点：

- 长期结构更细。

缺点：

- 当前需求只是同步已有变更，重构目录会扩大范围。
- 容易引入导航、截图数量和 E2E 覆盖的额外改动。

推荐采用方案 B：保持当前 Help 分类结构，聚焦更新现有文章、截图和测试。

## 内容同步范围

### 1. Dashboard Overview

目标文件：

- `pbs-portal/src/features/help/topics/dashboard/dashboard-overview.tsx`
- `pbs-portal/public/help/screenshots/dashboard-overview.png`

需要同步：

- `BID INFORMATION-LOCAL TIME`：
  - `BID START`
  - `BID END`
  - `REMAINING`
- `REMAINING` 说明：
  - open 时显示剩余时间的粗粒度值，例如 `5 DAYS 3 HRS`。
  - 不显示分钟，避免用户误认为它逐分钟实时跳动。
  - closed 时显示 `Closed`。
- `USER INFORMATION`：
  - `BASE`
  - `FLEET`
  - `POSITION`
  - `SENIORITY`
  - `LANGUAGE`
  - `EXISTING CREDIT`
  - `TRAINING MONTH`
  - `LAST LOGIN`
- 删除或改写过时的 `Bid metrics` 说明：
  - 不再说明 `TOTAL BIDDER`。
  - 不再说明 `TARGETED LINE`。
  - 不再说明 `TARGETED RESERVE`。
- `MESSAGE CENTER`：
  - 说明当前显示 `Pre-assigned Duties`。
  - 说明 `Duties` 是当前 period 已预占 duty 数量。
  - 说明 `Covered days` 是这些预占 duty 覆盖的唯一日期数量。
  - 说明分类包含 `Pairing`、`Days Off`、`Unavailable` 等类型。
  - 说明 `Duty Details` 展示即将/已预占的 duty 明细，并且列表可滚动。
  - 明确不显示 `BID PACKAGE` / fleet pool count。

建议不新增新的 Dashboard topic，先更新现有 `dashboard-overview`，避免 Help 导航膨胀。

### 2. Dashboard Calendar

目标文件：

- `pbs-portal/src/features/help/topics/dashboard/dashboard-calendar.tsx`

需要同步：

- 解释 `BIDDING CALENDAR` 在 Dashboard 上是阅读视图。
- 说明 `T1-T7` 是 tier 行，选中行代表当前 tier context。
- 说明彩色 calendar entries：
  - 绿色：Days Off / Prefer Off 类活动。
  - 蓝色：Pairing 类活动。
  - 黄色：其他警示或特殊状态类活动（按现有 schedule tone 展示）。
- 说明 Dashboard 上查看 Pairing entry 是为了 review detail；真正编辑仍回到 Bid 工作区。

### 3. Bid Calendar / Shared BIDDING CALENDAR

目标文件：

- `pbs-portal/src/features/help/topics/bid/bid-calendar.tsx`
- `pbs-portal/public/help/screenshots/bid-calendar.png`

需要同步 `23/33` 容量数字：

- 展示格式：`requested/max`，例如 `23/33`。
- `requested`：当前 base / division / current period 下，当天申请 Days Off 的 crew 数量。
- `requested` 按 crew 去重：同一个 crew 在同一天即使跨多个 tier 申请，也只算 1 个。
- `max`：当天最多可支持的 Days Off 人数。
- `max` 计算口径：

```text
total crew count
- pairing demand count
- reserve demand count
- pre-assigned days off count
```

颜色规则：

- 绿色：`requested < max`，仍未超过容量。
- 黄色：`requested === max`，刚好达到容量。
- 红色：`requested > max`，申请人数超过容量。

交互说明：

- 容量 badge 只是提示，不替代保存校验。
- badge 不抢占日期格点击；日期格仍可用于支持的 calendar action。
- 如果没有容量数据，则不显示该 badge。

### 4. Days Off Calendar / Tiers

目标文件：

- `pbs-portal/src/features/help/topics/days-off/days-off-calendar-tiers.tsx`

需要补充：

- 在添加 Days Off 前，可以参考 calendar cell 的 `requested/max`。
- `requested/max` 是群体容量提示，不是当前 crew 自己已经申请了多少次。
- 即使绿色也不代表最终一定能 award，只代表从当前请求与容量角度看没有超过。
- 红色或黄色时，用户应意识到该日期竞争更高。

### 5. Pairing Configure / Pairing Filters

目标文件：

- `pbs-portal/src/features/help/topics/pairing/pairing-configure.tsx`

需要新增 `Pairing Filters` 小节，说明：

- 在 `Configure Pairing Preference` 的 pairing list 中点击 `Filters` 打开筛选弹窗。
- Filters 用于缩小可选 pairing 列表，不会直接保存 bid。
- 筛选后仍需选中 pairing，并通过 `ADD BID` / `UPDATE BID` 保存。

字段说明：

- `Pairing start dates`：限制 pairing 起始日期范围。
- `Check-in`：限制 check-in time 范围。
- `Check-out`：限制 check-out time 范围。
- `Length`：限制 pairing 天数范围。
- `Route station`：限制 pairing route 中经过的 station。
- `Layover station`：限制 layover station。
- `Layover count`：限制 layover 数量范围。
- `Credit`：限制 total credit 范围，输入格式 `HH:MM`。
- `Redeye`：只看 redeye pairing。
- `DHD`：只看 deadhead / DHD 相关 pairing。
- `Clear All`：清空弹窗中的筛选条件。
- `Apply Filters`：应用筛选并刷新 pairing list。
- `Cancel`：关闭弹窗，不应用未保存的筛选改动。

校验说明：

- from 不能大于 to。
- station code 使用系统提供的 station options。
- `Credit` 使用 `HH:MM` 格式。
- 错误以弹窗内字段/提示显示，不应写成 raw error。

## 截图更新

需要重新捕获或替换：

- `dashboard-overview.png`
  - 不应再显示 `TOTAL BIDDER`。
  - 不应再显示 `BASE LINE AVERAGE`。
  - 不应再显示右侧 fleet / sub-fleet bid package。
  - 应显示当前 `Pre-assigned Duties` / `Duty Details`。
- `bid-calendar.png`
  - 应显示当前 `BIDDING CALENDAR`。
  - 应包含 `requested/max` badge，例如 `23/33`。
  - 应保留 period status、month、T1-T7、date grid、collapse control。

截图必须来自真实 Portal UI 或现有 Help screenshot capture 脚本，不使用手工拼图或 mock placeholder。

## 自动化测试更新

目标目录：

- `e2e/tests/pbs-portal/help/`

建议更新：

- `help-content-dashboard.spec.ts`
  - 断言 `Pre-assigned Duties`、`Duty Details`、`Covered days`。
  - 断言 `BID PACKAGE` 不出现。
  - 断言 `TOTAL BIDDER` 不出现。
  - 断言 `REMAINING` 说明不含分钟实时跳动含义。
- `help-content-rule-bids.spec.ts`
  - 在 `bid-calendar` topic 断言 `requested/max`、`Days Off capacity` 或等价说明。
  - 断言绿色/黄色/红色规则。
  - 在 `pairing-configure` topic 断言 `Pairing Filters`、`Route station`、`Layover station`、`Credit`、`Redeye`、`DHD`、`Apply Filters`。
- `help-screenshots.spec.ts`
  - 如果截图数量不变，只需确保更新后的图片仍通过 naturalWidth / naturalHeight 校验。

## 人工测试更新

目标文件：

- `docs/test-cases/pbs/help/2026-07-31-pbs-portal-help-manual.md`

需要更新或新增用例：

- Dashboard Help：
  - 打开 Dashboard Overview Help。
  - 确认截图与当前 Dashboard UI 一致。
  - 确认 Help 解释 `Pre-assigned Duties` 与 `Duty Details`。
  - 确认 Help 不再提 `TOTAL BIDDER` / `BID PACKAGE`。
- BIDDING CALENDAR Help：
  - 确认 Help 解释 `23/33`。
  - 确认 Help 解释绿色、黄色、红色。
  - 确认 Help 说明容量数字不替代保存校验。
- Pairing Filters Help：
  - 打开 Pairing 配置相关 Help。
  - 确认 Help 解释 `Filters` 弹窗字段和 `Apply Filters`。
  - 确认 Help 说明 Filters 不会直接保存 bid。

## 验收标准

- Help 不再展示或说明旧 Dashboard `TOTAL BIDDER` / `TARGETED LINE` / `TARGETED RESERVE`。
- Help 不再说明 Dashboard 右侧 `BID PACKAGE`。
- Help 准确说明 `MESSAGE CENTER` 的 `Pre-assigned Duties`。
- Help 准确说明 `Duties`、`Covered days`、`Duty Details`。
- Help 准确说明 `BIDDING CALENDAR` 的 `requested/max`。
- Help 准确说明绿色、黄色、红色容量含义。
- Help 准确说明 Pairing Filters 弹窗字段与保存边界。
- Help screenshots 能正常加载，且与当前 UI 不冲突。
- Playwright Help E2E 通过。
- 人工测试文档覆盖本次 Help 更新内容。

## 验证计划

Focused Help E2E：

```bash
cd e2e
npx playwright test -c config/playwright.config.ts \
  --project=pbs-portal \
  tests/pbs-portal/help/ \
  --reporter=list \
  --no-deps
```

Help screenshot 校验：

```bash
cd e2e
npx playwright test -c config/playwright.config.ts \
  --project=pbs-portal \
  tests/pbs-portal/help/help-screenshots.spec.ts \
  --reporter=list \
  --no-deps
```

Portal build：

```bash
pnpm --dir pbs-portal build
```

UI gate：

```bash
npm run check:ui
```

提交前检查：

```bash
git diff --check
```

## 风险与注意事项

- 截图数据可能依赖当前测试种子或登录态，必须用现有 Help screenshot capture 方式，避免环境不稳定。
- `requested/max` 的解释必须避免让用户误解为个人成功率；它只是 days off 申请人数与最大容量的当前提示。
- `requested` 是 crew 去重后的数量，不是 bid row 数，也不是 tier 数。
- `max` 是按当前 scope 计算出的 capacity，不是固定配置值。
- Pairing Filters 只过滤列表，不保存 bid；这点必须写清楚。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次是 Help 文案、截图和测试同步，文件集中且内容需要统一口径；并行拆分容易造成术语和截图不一致。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/help/`、`pbs-portal/public/help/screenshots/`、`e2e/tests/pbs-portal/help/`、`docs/test-cases/pbs/help/`。
- Conflict risk: Medium。主要风险是截图与文案口径不一致。
- Execution gate: 用户确认本 spec 后再开始修改 Help、截图与测试。
