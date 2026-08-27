# PBS Portal 当前状态

> 这份文档记录 `pbs-portal` 当前已落地的页面、兼容入口和阶段状态。
> 这里可以放会随迭代变化的内容；长期稳定的协作约束放在 `AGENTS.md`。

## 当前路由

- `/login`
- `/dashboard`
- `/days-off`
- `/pairing`
- `/pairing/search`
- `/line`
- `/reserve`
- `/tier`
- `/award`
- `/help`
- `/403`
- `/404`
- `/500`

## 当前导航状态

- 顶部导航当前顺序见 `src/shared/constants/top-nav-items.ts`
- 当前已落地页面：
  - `Dashboard`
  - `Days Off`
  - `Pairing`
  - `Line`
  - `Reserve`
  - `Tier`
  - `Award`
  - `Help`
- 当前仍指向 `/404` 的导航项：
  - `Standing Bid`

## 当前兼容入口

- `/` 跳转到 `/dashboard`
- `/portal/*` 作为历史入口，统一重定向到新路由
- `/auth/callback` 是兼容入口，实际 SSO 收口走 `/login?token=...`

## 当前数据阶段

- 现阶段仍存在一部分前端 mock 数据，用于保持参考交互和页面节奏。
- 认证链路已经接入 `pbs-server` 的 `JWT + Bearer` 模式。
- 后续页面接真实接口时，应优先保持当前页面边界和交互稳定，再逐步替换 mock 数据源。

## 当前响应式基线

- `pbs-portal` 当前桌面工作台以 `1920 x 1080` 为共享视觉基线。
- 顶部导航与页面画布使用统一缩放语义：`1080-1920` 优先按比例自适应，`>1920` 可放大但要兼顾可用高度，`<1080` 切换到完整缩小展示模式。
- 页面主工作区通过共享画布壳层填满可用视口高度，同时保留“可略微增高”的余量，避免底部留白和内容裁切。
- `Pairing / Days Off / Line / Reserve / Tier` 等页面中的 `T1-T7` tier 控件应保持共享宽度与文案一致，避免缩放时换行。

## 当前交互基线

- `pbs-portal` 当前把“hover 显示小手光标”作为统一交互约束：所有可点击的 icon、tab、文本按钮和图标按钮都应明确显示 `cursor-pointer`。
- 纯展示型 icon 保持默认光标，避免给用户造成“看起来能点、实际不能点”的误导。
- 新增交互控件时，优先复用共享按钮或切换组件的光标语义，不要在单页里零散遗漏。

## 当前共享工作台约束

- 左侧 `BIDDING CALENDAR` 被定义为跨 PBS 页面共享的固定工作台区域，长期目标是不因路由切换而重新拉取、重新初始化或丢失用户当前交互状态。
- 典型共享状态包括当前选中的 tier，以及后续可能接入的共享日历过滤条件、月份上下文和选中日期。
- 新页面接入时，优先复用共享日历容器或共享 store，不要在每个 feature 页面里各自维护一份独立的左侧日历本地状态。

## 当前维护建议

- 修改路由或导航状态时，优先同步更新：
  - `src/app/router/app-routes.tsx`
  - `src/shared/constants/top-nav-items.ts`
  - 相关 route tests
  - 本文档
- 修改响应式壳层或共享布局常量时，优先同步检查：
  - `src/app/layout/use-dashboard-header-layout.ts`
  - `src/shared/components/layout/scaled-page-canvas.tsx`
  - `src/shared/components/layers/layer-toggle-group.tsx`
  - 受影响页面的布局和回归测试
