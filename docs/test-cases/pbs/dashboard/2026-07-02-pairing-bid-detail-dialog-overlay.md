# PBS Dashboard Pairing Bid Detail Dialog Overlay QA 测试案例

日期：2026-07-02  
范围：PBS Portal Dashboard / shared Bidding Calendar 中 Pairing Bid 详情弹窗的遮罩、居中、滚动锁定和关闭交互。

## 前置条件

- PBS Portal 可正常访问并登录。
- 当前 bid period 有至少一条 calendar pairing bid。
- 测试账号可进入 Dashboard 或任一包含左侧 `BIDDING CALENDAR` 的 PBS 工作台页面。
- 使用 `1920×1080`、`1024×768`、`633×1259`、`423×1259` 四种视口验证。

## 场景 1：弹窗相对工作台居中

1. 打开 Dashboard 或 Pairing 页面。
2. 在左侧 `BIDDING CALENDAR` 点击一条 pairing bid。

预期结果：

- 页面打开 `Pairing Bid` 弹窗。
- 弹窗相对顶部 PBS 工作台水平、垂直居中，不贴左侧日历。
- 半透明遮罩覆盖完整工作台左右区域，其边界与 scaled canvas 一致。
- 窄而高的窗口中，工作台下方空白不参与遮罩或居中计算。
- 浏览器页面级滚动条不因弹窗出现而继续滚动背景页面。
- `1024×768` 下弹窗仍位于工作台内，内容过高时只滚动弹窗 body，`Close / SAVE BID` 保持可见。
- 打开弹窗前后，工作台和左侧日历原有缩放、自适应宽度与展开/收起布局不发生改变。
- `633×1259` 和 `423×1259` 下弹窗仍位于顶部工作台中央，不得掉到页面下方空白；字体、按钮和间距与标准配置弹窗使用同一祖先缩放。
- Pairing 详情设计宽度为 `880px`，其视觉宽度为 `880px × 当前工作台 scale`；不再使用 `1600px` 或 `100vw - 96px`。

## 场景 2：点击背景关闭

1. 保持 `Pairing Bid` 弹窗打开。
2. 点击弹窗外的灰白遮罩区域。

预期结果：

- 弹窗关闭。
- 背景页面恢复可滚动。
- 左侧日历和当前页面内容保持原状态。
- 键盘焦点回到刚才点击的 Pairing 蓝条。

## 场景 3：点击弹窗内部不误关闭

1. 再次打开 `Pairing Bid` 弹窗。
2. 点击弹窗标题、summary grid、Pairing Details 内容区域。
3. 如果当前模式可编辑，点击 `APPLY TO TIERS` 内的 checkbox。

预期结果：

- 弹窗保持打开。
- 内部点击不会触发背景关闭。
- checkbox / radio 等内部控件仍可正常交互。

## 场景 4：显式关闭按钮

1. 保持 `Pairing Bid` 弹窗打开。
2. 点击右下角 `Close`。

预期结果：

- 弹窗关闭。
- 背景页面恢复可滚动。
- 页面无残留遮罩。
- 键盘焦点回到刚才点击的 Pairing 蓝条。

## 场景 5：键盘焦点与 Escape

1. 使用键盘激活一条 Pairing 蓝条。
2. 确认弹窗打开后焦点进入弹窗。
3. 连续按 `Tab` 和 `Shift+Tab`。
4. 按 `Escape` 关闭弹窗。

预期结果：

- 焦点只能在当前 Pairing 详情弹窗的可交互元素之间循环，不进入顶部导航、左侧日历或背景工作台。
- `Escape` 只关闭当前 Pairing 详情弹窗。
- 关闭后焦点回到原 Pairing 蓝条。

## 场景 6：可编辑保存回归

1. 在可编辑 period 内打开一条可修改 tier 的 pairing bid。
2. 修改 tier 勾选。
3. 点击 `SAVE BID`。

预期结果：

- 保存按钮和 pending 状态正常。
- 保存成功后日历数据刷新。
- 点击 `SAVE BID` 本身不会因为事件冒泡而误触发背景关闭。

## 异常与边界场景

- Pairing Details loading / error / empty 状态下，背景点击仍可关闭。
- 多个 pairing row 的 `EDIT` radio 选择不应关闭弹窗。
- 内容高度超过工作台时，只允许弹窗内部滚动，背景页面不滚。
- Pairing Details 内容横向溢出时，只滚动详情区域，不扩大整个弹窗。
- 弹窗打开期间改变浏览器尺寸，遮罩继续覆盖新的工作台 bounds，弹窗保持相对工作台居中。
- Pairing 详情是顶层独占弹窗；本流程不应从详情内部再打开第二层配置弹窗。

## 自动化验证

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal
npm test -- src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx src/app/layout/shared-bidding-workbench-layout.test.tsx src/features/dashboard/pages/dashboard-page.test.tsx
npm test
npm run lint
npm run build
```

## UI 与 E2E 回归

```bash
cd /Users/lei/Codehub/rois-ai
npm run check:ui

cd /Users/lei/Codehub/rois-ai/e2e
npx playwright test \
  --config=config/playwright.config.ts \
  --project=pbs-portal \
  --no-deps \
  tests/pbs-portal/dashboard-pairing-bid-detail.spec.ts
```
