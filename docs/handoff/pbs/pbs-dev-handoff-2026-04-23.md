# PBS 开发交接上下文（2026-04-23）

> 这份文档用于给后续新窗口的 AI / 开发者提供 2026-04-23 这一轮 PBS 最新结论。
> 只记录开发侧上下文，不写数据库密码、明文账号密码或其他运行时敏感信息。

## 这一轮先读什么

继续做 PBS 前，建议按这个顺序读：

1. `pbs-portal/AGENTS.md`
2. `pbs-server/AGENTS.md`
3. `docs/handoff/pbs/pbs-dev-handoff-2026-04-21.md`
4. `docs/handoff/pbs/pbs-dev-handoff-2026-04-22.md`
5. 本文档
6. `docs/superpowers/specs/2026-04-22-lineholder-bidding-design.md`
7. `docs/superpowers/specs/2026-04-23-pbs-pairing-aa-gap-design.md`
8. `docs/superpowers/specs/2026-04-23-pbs-search-pairings-ui-design.md`

## 这一轮最重要的结论

- 当前 PBS 一期主线仍然只做 `Lineholder`
- `Pairing` 页面当前应理解为：
  - `generic pairing rules editor`
  - 不是完整的 `Search Pairings` 真数据页
- `ADD PAIRING PROPERTIES`
  - 本质是可加入某个 layer 的 pairing 筛选条件池
  - 不是“当月真实 pairing 列表”
- `FAVORITED PROPERTIES`
  - 现在已经做成真实可操作、真实持久化的用户收藏区
  - 不再只是前端静态预置 tab
- `Search Pairings`
  - 现在已经从 `Pairing` 页拆成独立页面 `/pairing/search`
  - 当前阶段只做 UI，不接真实后端查询
  - 左侧继续复用系统现有共享工作台
  - 右侧必须以 `demo.html / demo.css / common.css` 为最高优先级严格还原

## Pairing 页面业务语义已经定下来的口径

### 1. `Pairing` 页不是“直接选我要飞哪条 pairing”

当前页面主要做的是：

- 定义某个 `Layer` 想要什么样的 pairing 条件
- 这些条件用于塑造或筛选该层的 pairing pool

不要把当前 `Pairing` 页理解成：

- 浏览真实 pairing 列表
- 直接选中某条 pairing 去飞
- 最终 award 结果页

### 2. `BID` 的含义不是“出价”

在当前 `Pairing` 页里：

- `PRIORITY` 更准确地说是 pairing property / pairing condition
- `BID` 表示这条条件的参数值
- `LAYERS` 表示这条条件在哪些 layer 生效

例如：

- `Prefer Pairing Length = 3`
- `Prefer Pairing Type = RedEye`
- `Report Between = 09:00 - 18:30`

这些都是规则参数，不是具体 pairing 编号。

### 3. `Search Pairings` 仍不是“真实 pairing 搜索引擎”

当前 portal 实现里：

- 上半部分 `EXISTING PAIRING PROPERTIES`
  - 已是真实 draft 保存链
- 下半部分 `ADD PAIRING PROPERTIES`
  - 仍是规则模板 / 条件池
- `SEARCH PAIRINGS`
  - 当前仍是本地过滤 available properties
  - 不是 gantt / 实时 pairing 资源搜索

如果未来要接真数据，应单独做：

- `Specific Bid`
- `Pairing ID / Pairing ID on Date`
- 命中多少条真实 pairing 的预览

## Search Pairings 当前结论

### 1. `Search Pairings` 和 `ADD PAIRING PROPERTIES` 已经明确分层

这轮已经确认：

- `ADD PAIRING PROPERTIES`
  - 是 generic pairing rules editor
  - 用来配置筛选条件并加入 layer
- `Search Pairings`
  - 是独立 pairing 检索模块
  - 不应再和 available property 本地过滤混为一谈

### 2. 目标语义里其实有两种“搜索”

已经在对话里确认过，后续不要再混淆：

- `generic rule preview`
  - 根据一组 generic 条件预览会命中多少条 pairing
  - 目的：避免浪费 layer
- `specific bid`
  - 直接按 `Pairing ID / Pairing ID on Date / Pairing ID for Entire Month` 搜具体 pairing
  - 目的：精准竞标某一条 pairing

AA / PRD 中的 `Search Pairings` 更接近第二种，即真实 pairing 检索入口。

### 3. 当前实现状态

这轮已经落了 UI-only 第一阶段：

- 新路由：
  - `/pairing/search`
- 从 `Pairing` 页点 `SEARCH PAIRINGS`
  - 会跳转到新页面
- 顶部导航 `Pairing`
  - 在 `/pairing/search` 子路由下仍保持激活
- 页面右侧
  - 使用本地 mock criteria + mock results
  - 暂不读取当前 `/pairing` 页已配置规则
  - 暂不接真实接口

对应主要实现：

- `pbs-portal/src/app/router/app-routes.tsx`
- `pbs-portal/src/app/layout/dashboard-top-nav.tsx`
- `pbs-portal/src/features/pairing/pages/search-pairings-page.tsx`
- `pbs-portal/src/features/pairing/components/pairing-search-panel.tsx`
- `pbs-portal/src/features/pairing/components/pairing-search-panel.module.css`
- `pbs-portal/src/features/pairing/mock.ts`

### 4. 右侧 UI 的实现原则已经定死

这一点是后续新上下文最容易做偏的地方：

- 左侧共享工作台
  - 继续使用现有系统实现
  - 不按 demo 重做
- 右侧 `Search Pairings`
  - 必须严格按照用户提供的 `demo.html / demo.css / common.css` 还原
  - 不能再用“更符合项目风格”为理由自行改造视觉

如果右侧与 demo 不一致，默认以 demo 为准，而不是以当前 portal 风格为准。

### 5. 当前小日历的状态

右侧结果卡里的小日历已经往 demo 拉近一轮：

- 白底描边卡片
- 324px 固定宽
- 28x28 日格
- 前置灰字日期 `27-30`
- 紫色实心激活态

但这一块仍然属于持续微调区域。如果后续继续修：

- 优先只改小日历局部
- 不要顺手重做整个 `Search Pairings` 页面
- 本轮已修掉一个真实 bug：
  - 最后一排日期曾经溢出到卡片外
  - 现在已通过改为固定 `grid` 布局收回到卡片内

## AA 文档对应结论

### 1. 这轮只补齐了 AA 的 generic pairing properties

当前 `ALL PROPERTIES` 已按 AA 的 generic pairing 思路补成完整一版，用于构建 pairing pool 的规则条件。

这一轮明确不包含：

- `Pairing ID`
- `Pairing ID on Date`
- `Pairing ID for Entire Month`

这些属于 `specific bid / search real pairings` 的另一条能力线。

### 2. 当前 portal 对 AA 的完成度判断

如果只看：

- `ALL PROPERTIES = generic pairing filters catalog`

那么当前可以认为：

- 第一阶段基本完成

如果按 AA 完整 pairing 能力来算，则还没完成的部分包括：

- specific bid
- 真实 pairing 搜索
- 命中结果预览
- 真实 search results 到 layer 的投标动作

## Pairing Favorites 已经落地的设计

### 1. 产品语义

`FAVORITED PROPERTIES` 现在应理解为：

- 在 `ALL PROPERTIES` 里点心形收藏
- 该 property 出现在 `FAVORITED PROPERTIES`
- 在 `ALL` 里已收藏项显示红色心形
- 再点红心会先弹确认框
- 确认后才取消收藏

### 2. 为什么 favorites 不应塞进 existing pairing rules

收藏的是：

- 用户对 available property 模板的偏好

不是：

- 一条真正已投出的 pairing rule

因此这轮用了“独立 favorites 持久化”方案，而不是把收藏硬塞进 pairing draft 本身。

### 3. 当前持久化设计

当前 favorites 是按以下维度真实保存：

- 当前用户
- 当前 PBS 周期
- `bid_context = Current`
- `property_code`

对应新增表：

- `pbs_bid_pairing_favorite`

对应 migration：

- `sql/migration/2026-04-23-add-pbs-bid-pairing-favorite.sql`

### 4. 当前接口分工

`GET /api/pairing-bids/current`

- 现在除了返回 current draft 和 property catalog
- 还会返回：
  - `favoritePropertyCodes`

新增收藏接口：

- `PUT /api/pairing-bids/current/favorites/:propertyCode`
- `DELETE /api/pairing-bids/current/favorites/:propertyCode`

前端由这些文件接住：

- `pbs-portal/src/shared/services/pairing-service.ts`
- `pbs-portal/src/features/pairing/pairing-draft-mappers.ts`
- `pbs-portal/src/features/pairing/components/pairing-right-panel.tsx`

### 5. 这一轮顺手修掉的交互坑

收藏状态刚接入时有一个真实问题：

- 点收藏后因为同步了 query cache
- `PairingRightPanel` 会把整份数据当成“全量新 hydration”
- 导致当前分页 / 搜索 / 预览上下文被重置

现在已经收成：

- 收藏只同步 favorite 状态
- 不再因为点心形就自动跳回第一页

## UI Inspector 当前结论

这轮确认了 `pbs-portal` 的放大镜逻辑应跟 `Royce-Flair` 一样：

- 优先显示手工 `data-uiid`
- 如果元素没有 `data-uiid`
  - inspector 开启时自动打 `data-uid="ui-1" / ui-2 / ..."`
- 用 `MutationObserver` 补后续新增节点

因此现在不需要再手工给 `Pairing` 页每个小元素逐一写唯一 id。

对应实现：

- `pbs-portal/src/shared/hooks/use-ui-inspector.ts`
- `pbs-portal/src/shared/components/dev/ui-inspector-overlay.test.tsx`

## 当前数据库注意事项

这轮新增了两张 PBS 相关表：

- `pbs_bid_day_off`
- `pbs_bid_pairing_favorite`

如果当前运行环境没有应用 migration，最容易出现的错误是：

- `calendar-days-off/current` 因缺 `pbs_bid_day_off` 报 500
- favorites 接口因缺 `pbs_bid_pairing_favorite` 报 500

对应 migration：

- `sql/migration/2026-04-22-add-pbs-bid-day-off.sql`
- `sql/migration/2026-04-23-add-pbs-bid-pairing-favorite.sql`

## 当前验证状态

本轮与 `Pairing favorites` 直接相关的验证已通过：

### pbs-portal

- `npm test -- --run src/features/pairing/pages/pairing-page.test.tsx`
- `npm test -- --run src/features/pairing/pages/search-pairings-page.test.tsx src/app/router/app-routes.test.tsx src/app/layout/dashboard-top-nav.test.tsx`
- `npm run build`

### pbs-server

- `npm test -- --run src/routes/pairing-bids.test.ts src/app.test.ts`
- `npm run build`

说明：

- `pbs-server` 当前没有本地 eslint 配置，因此不要默认执行裸 `npx eslint`

## 给下一个上下文的最短说明

如果只是要让另一个上下文快速接手今天这轮 PBS，可以直接告诉它：

- 当前 PBS 一期主线仍只做 `Lineholder`
- `Pairing` 页当前是 generic pairing rules editor，不是实时 pairing 搜索页
- `ALL PROPERTIES` 已按 AA generic pairing properties 补齐一版
- `FAVORITED PROPERTIES` 已经是真实后端持久化收藏
- 收藏按当前用户 + 当前 period + `Current` 保存
- favorites 用独立表 `pbs_bid_pairing_favorite`，不要塞回 existing pairing rules
- `Search Pairings` 已拆成 `/pairing/search` 独立页面，但当前仍是 UI-only mock
- 左侧继续复用共享工作台，右侧必须以 `demo.html / demo.css / common.css` 为准
- 当前真正还没做的是：真实 `Specific Bid`、真实 pairing 查询接口、命中结果预览
- `pbs-server` 运行前要确认 2026-04-22 / 2026-04-23 这两条 migration 都已应用
