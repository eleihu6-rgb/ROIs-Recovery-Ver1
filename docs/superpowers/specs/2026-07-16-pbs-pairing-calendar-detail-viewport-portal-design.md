# PBS Pairing 日历详情弹窗工作台级 Portal 修订设计

日期：2026-07-16
状态：用户已确认，已实施
范围：`pbs-portal` 左侧 `BIDDING CALENDAR` 蓝色 Pairing bid 详情弹窗

## 1. 问题复盘

Pairing bid 详情最初渲染在左侧日历组件树中，受 calendar clipper 和 transform containing block 限制，只能覆盖左栏。第一次修复把弹窗 portal 到 `document.body`，解决了左栏裁切，却把 overlay 和居中坐标改成整个浏览器 viewport。

在窄而高的窗口（例如 `423×1259`）中，工作台按 `1888×968` 桌面基线缩小后只占页面顶部。body portal 的 `fixed inset-0` 仍覆盖完整 1259px 高度，于是：

- 下方大量空白参与 overlay 和居中计算；
- 弹窗落到工作台下方的页面中部；
- 后续手动乘 canvas scale 后，弹窗又小又远；
- Playwright 错误地断言 overlay 必须等于整个浏览器 viewport，反而锁定了错误行为。

正确参考是普通 Airport Preference 弹窗：overlay 覆盖完整工作台区域，弹窗相对工作台居中，并自然继承工作台 scale；页面下方空白不参与 overlay 和居中。

## 2. 目标

1. Pairing 详情遮罩覆盖完整工作台的左右区域，不再局限左侧日历。
2. 遮罩不覆盖工作台下方因窄高 viewport 产生的页面空白。
3. 弹窗相对工作台居中，而不是相对整个浏览器高度居中。
4. 弹窗自然继承 `ScaledPageCanvas` 的唯一 scale，不手动复制或重算比例。
5. Pairing 详情使用 880px 设计宽度，比标准 620px 配置弹窗略宽一档。
6. 其他普通配置弹窗的 DOM、尺寸、缩放、焦点和保存行为完全不变。
7. 保留 Pairing 详情的 Close、Save Bid、Escape、遮罩点击、焦点陷阱和关闭后焦点归还。

## 3. 非目标

- 不修改 `ScaledPageCanvas` 的 scale 公式、breakpoint、canvas 宽高或 transform。
- 不修改工作台列宽、日历折叠、路由或数据状态。
- 不修改 Pairing detail API、ID/date/rank 匹配或保存 payload。
- 不修改数据库、migration、contracts 或后端。
- 不把所有业务弹窗迁移到新的工作台 portal。
- 不继续使用 body portal + 手动 scale 的错误方案。

## 4. 方案比较

### 方案 A：body portal + 手动复制 canvas scale

能覆盖浏览器 viewport，但居中仍包含工作台下方空白；需要额外换算 width/height/scale，容易再次漂移。已验证错误，不采用。

### 方案 B：恢复左栏 inline dialog

能自然继承 scale，但重新受 calendar clipper 限制，只覆盖左栏。不采用。

### 方案 C：ScaledPageCanvas 根级 portal host（采用）

在每个 `ScaledPageCanvas` 的根画布内提供 portal host。host 与页面内容处于同一个 transform/scale 坐标系，但位于业务列和左栏 clipper 外部。Pairing 详情 portal 到该 host：

- overlay 的 containing block 是完整 canvas；
- overlay 覆盖工作台左右区域；
- panel 相对 canvas 居中；
- panel 自动继承 canvas scale；
- 页面下方空白不进入坐标计算。

该方案不需要第二套 scale 或 viewport resize 逻辑。

## 5. 推荐设计

### 5.1 `ScaledPageCanvas` portal host

`ScaledPageCanvas` 保持现有 metrics 和 `transform: scale(...)` 不变，只新增：

- canvas 节点成为定位容器（`relative`）。
- canvas 内容末尾增加一个透明 portal host，覆盖 canvas 的设计宽高。
- host 位于业务内容之上，但空闲时不得拦截鼠标事件。
- 通过 React Context 暴露当前 host element。

Context 只暴露 portal target，不暴露、不复制 `pageScale`。React portal 保留 Context，且目标节点位于 scaled canvas 内，因此弹窗自然继承现有 transform。

Dashboard 独立页面和 Shared Bidding Workbench 都使用 `ScaledPageCanvas`，因此无需分别修改两个页面布局。

### 5.2 `PbsDialogFrame` 显式 portal target

`PbsDialogFrame` 增加显式、可选的 portal target：

- 未传 target：保持现有 inline 行为。
- `portalToBody=true`：保留已有 body portal 能力，供明确需要浏览器 viewport 的场景使用。
- 传入 canvas target：portal 到该 target，不进入 `document.body`。

portal 模式的焦点陷阱、scroll lock、Escape 和 focus restore 同时适用于 body target 和 canvas target。

不得保留本轮错误添加的 `portalPanelStyle` 或手动 `transform: scale(...)`。默认调用方不传 target，因此普通 Airport/Pairing/Days Off/Line/Reserve/Tier 弹窗行为不变。

### 5.3 Pairing 详情接入

`PairingCalendarBidDetailDialog` 从 canvas context 读取 portal target，并显式传给 `PbsDialogFrame`：

- 不再传 `portalToBody`。
- 不再读取 `pageScale`、viewport width/height。
- 不再设置 panel transform 或手动 max-height 换算。
- 使用 Pairing detail 局部强制样式锁定 `880px` 设计宽度，明确覆盖 `PbsDialogFrame` 默认的 `min(620px, 100vw - 32px)`；不得让默认 viewport-unit width 参与计算。
- panel max-height 使用 canvas 已有的 `--portal-page-shell-height` 设计坐标（减去固定安全边距），明确覆盖默认 `100vh - 32px`；不得让浏览器 `vh` 在祖先 scale 前再次压缩 panel。
- 保留详情局部横向滚动。

如果组件在没有 `ScaledPageCanvas` provider 的独立测试/故事环境中渲染，安全回退为 inline dialog，不得抛错。

### 5.4 Portal host 指针与层级

- 空 host 使用 `pointer-events: none`，不能挡住正常工作台。
- Pairing overlay 显式恢复 `pointer-events: auto`，打开时拦截整个工作台交互。
- overlay 继续使用当前高层级，覆盖左右两栏。
- overlay 的 `fixed inset-0` 在 transformed canvas 下以 canvas 为 containing block；不得改为 body viewport 坐标。

## 6. 影响范围

修改范围：

- `pbs-portal/src/shared/components/layout/scaled-page-canvas.tsx`
- `pbs-portal/src/shared/components/layout/scaled-page-canvas.test.tsx`
- `pbs-portal/src/shared/components/ui/pbs-dialog-frame.tsx`
- `pbs-portal/src/shared/components/ui/pbs-dialog-frame.test.tsx`
- `pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.tsx`
- `pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx`
- `pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx`
- `e2e/tests/pbs-portal/dashboard-pairing-bid-detail.spec.ts`
- `docs/test-cases/pbs/dashboard/2026-07-02-pairing-bid-detail-dialog-overlay.md`

明确不修改：

- `SharedBiddingWorkbenchLayout` 和 `DashboardPage` 生产代码。
- 普通业务 editor/dialog。
- `pbs-server`、contracts、SQL。

## 7. 自动化测试

### 7.1 单元测试

`ScaledPageCanvas`：

1. portal target 是 canvas 的后代。
2. target 位于业务 children 之外/之后，不受业务列 clipper 限制。
3. 空 target 不拦截指针。

`PbsDialogFrame`：

1. 未传 target 的 inline dialog 行为不变。
2. body portal 行为仍可用。
3. canvas target portal 挂到指定 target，而不是 body。
4. 两种 portal 的焦点陷阱和 focus restore 不回退。

Pairing 详情：

1. 有 canvas target 时挂到 canvas portal root。
2. 无 provider 时安全 inline 回退。
3. 880px 宽度、内部横向滚动、详情字段和 tiers 行为不变。

### 7.2 Playwright 真实 UI

从真实工作台点击 Pairing 蓝条，覆盖 `1920×1080`、`633×1259`、`423×1259`、`1024×768`：

1. overlay bounding box 与 scaled canvas/workbench bounding box 一致，不与 window viewport 一致。
2. dialog 中心与工作台中心一致。
3. `423×1259` 下 dialog 位于顶部工作台范围内，不掉入下方空白。
4. dialog computed transform 不再包含单独的手动 scale；缩放来自祖先 canvas。
5. `dialog.getBoundingClientRect().width` 必须约等于 `880 × canvasScale`（允许 2px 像素误差），证明 `100vw` 没有再次压缩 panel。
6. dialog 的顶部、底部和视觉高度必须落在 canvas/workbench bounds 内；低高度时只滚动 dialog body。
7. overlay 覆盖左右两栏，点击背景关闭。
8. 对照 Airport Preference：普通配置弹窗尺寸、居中和 DOM 行为没有变化。
9. footer 可见；详情过宽时只在详情区域横向滚动。

必须删除上一版以下错误断言：

- overlay width/height 等于 `window.innerWidth/innerHeight`。
- dialog 自身 computed scale 等于 canvas scale。

正确断言是 overlay/dialog 继承同一个祖先 canvas transform，并以工作台 bounds 为几何基准。

## 8. QA 验收

1. 在宽屏打开 Pairing 详情：覆盖完整工作台，居中，略宽于普通配置弹窗。
2. 将窗口改为 `423×1259`：详情仍位于顶部工作台中央，下方空白不被遮罩。
3. 打开 Airport Preference 对照：两者视觉密度一致，Pairing 详情只宽一档。
4. 点击 overlay、Close、Escape 均能关闭；关闭后焦点回到蓝条。
5. 普通页面操作在未打开详情时不被透明 portal host 阻挡。

## 9. 风险与控制

- `ScaledPageCanvas` impact 为 HIGH：只增加 portal host/context，不改 metrics 和 transform。
- `PbsDialogFrame` impact 为 CRITICAL：target 为显式 opt-in，默认 inline 与已有 body portal 分支保持不变。
- `PairingCalendarBidDetailDialog` impact 为 HIGH：只改变挂载目标和几何，不改数据/保存逻辑。
- 必须运行 Portal 全量测试、完整 detail E2E、Airport Preference 对照 E2E、lint/build/check:ui。

## 10. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: canvas host、dialog portal 和 Pairing detail 几何强耦合，拆分会产生共享文件冲突。
- Suggested split: 不拆分。
- Write boundaries: 仅限第 6 节文件。
- Conflict risk: Medium；工作区存在并行 Deadhead 等改动，必须精确保护文件边界。
- Execution gate: 用户已明确要求写 spec 并修改代码；spec 独立审阅通过后按本设计实施，不提交 git。
