# PBS-3510 合并 Bid 页面回归测试重写计划

## 目标

将已经失效的单条 PBS-3510 独立页面回归，替换为基于当前 `/bid` 合并页面的四条可独立执行的 Playwright 用例。

## 影响范围

- 主要修改：
  - `e2e/tests/pbs-portal/condition-default-favorites.spec.ts`
- 参考但原则上不修改：
  - `e2e/tests/pbs-portal/bid-merged-workbench.spec.ts`
  - `pbs-portal/src/features/bid/pages/bid-page.test.tsx`
- 不修改：
  - 产品代码
  - API contract
  - 数据库和 migration

## 实施步骤

### 1. 建立 PBS-3510 专用的当前 Bid 页面导航 helper

- 新增独立的 `openBidCategory` 类 helper，使四条 PBS-3510 测试统一执行：
  1. `page.goto('bid')`
  2. 等待 `bid-page`
  3. 在 `Bid property categories` 中点击目标 Tab
- 所有类别内容查询限制在 `bid-page`，减少全局同名元素造成的误判。
- 保留现有 `expectFavoriteTabIsDefault(page, workspaceTestId)` 和其他被非 PBS-3510 用例复用的 helper，不修改其签名。

验证：

```bash
cd e2e
npx playwright test -c config/playwright.config.ts \
  --project=pbs-portal --no-deps \
  tests/pbs-portal/condition-default-favorites.spec.ts \
  -g 'PBS-3510A' --workers=1
```

### 2. 拆出 PBS-3510A 默认收藏用例

- 验证 `/bid` 默认停留在 `FAVORITED PROPERTIES`。
- 验证四个一级 Tab 的名称与顺序。
- 验证收藏内容来自多个业务类别。
- 移除与 `bid-merged-workbench.spec.ts` 重复的布局和滚动断言。

### 3. 拆出 PBS-3510B Days Off 用例

- 点击 `DAYS OFF`。
- 将旧 `/days-off` 断言迁移到当前 Bid workspace。
- 验证 Existing Prefer Off 摘要。
- 验证默认收藏和 `DAYS OFF` 类别内容分离。
- 验证合并页不显示旧 `ALL PROPERTIES` 子 Tab。
- 验证 footer 不包含旧 Reset/Cancel 操作。

### 4. 拆出 PBS-3510C Pairing 用例

- 点击 `PAIRING`。
- 迁移 Pairing Length、Pairing Preference、View Rules、Search Pairings 和单条件 Preview 断言。
- 搜索页面返回 Bid 时，重新进入 `/bid` 并再次点击 `PAIRING`，不再访问 `/pairing`。
- 更新所有可访问名称为当前摘要，例如：
  - `Preview Award pairings 1–3 days long`
  - `Pairing Length: Award pairings 1–3 days long`
- 保留编辑弹窗边界检查。
- 保留 Pairing 收藏与 `PAIRING` 类别分类检查。

### 5. 拆出 PBS-3510D Roster 用例

- 点击 `ROSTER`。
- 将旧 `/line` 和 `LINE` 断言迁移为当前 Roster 命名。
- 根据当前 mock catalog 验证 Roster 收藏和 `ROSTER` 类别条件。
- 删除旧 `rule-bid-add-properties-workspace` 页面假设。

### 6. 清理旧 PBS-3510 用例

- 删除原单条 `PBS-3510` 测试体。
- 仅删除因 PBS-3510 拆分后确定不再使用的局部变量或局部逻辑。
- 不删除或改签名同文件其他测试仍使用的通用 helper。
- 不改与本任务无关的 PBS-3511 及后续用例。

### 7. 定向回归

先逐条运行，便于定位：

```bash
cd e2e
npx playwright test -c config/playwright.config.ts \
  --project=pbs-portal --no-deps \
  tests/pbs-portal/condition-default-favorites.spec.ts \
  -g 'PBS-3510A|PBS-3510B|PBS-3510C|PBS-3510D' \
  --workers=1
```

再回归同文件内与 Pairing 摘要直接相关的当前用例：

```bash
cd e2e
npx playwright test -c config/playwright.config.ts \
  --project=pbs-portal --no-deps \
  tests/pbs-portal/condition-default-favorites.spec.ts \
  -g 'PBS-3510A|PBS-3510B|PBS-3510C|PBS-3510D|PBS-3603|PBS-3636' \
  --workers=1
```

### 8. 完成质量门禁

```bash
git diff --check
npm run check:ui
node .gitnexus/run.cjs detect-changes --scope compare --base-ref main
```

如修改了测试 helper 符号，编辑前先执行对应 GitNexus upstream impact；若风险为 HIGH 或 CRITICAL，停止并向用户说明。

## 完成定义

- PBS-3510 已拆成 A～D 四条当前流程用例。
- 四条用例从 `/bid` 开始，只通过 Tab 切换类别。
- PBS-3510A～D 内不再出现 `/days-off`、`/pairing`、`/line` 和旧 `LINE` 断言；同文件其他测试不在本计划范围内。
- A～D、PBS-3603、PBS-3636 定向 Playwright 全部通过。
- 没有产品代码、数据库或 migration 改动。
- 未经用户明确要求，不提交 Git。
