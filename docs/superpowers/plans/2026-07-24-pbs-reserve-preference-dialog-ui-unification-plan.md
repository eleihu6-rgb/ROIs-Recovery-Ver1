# PBS Reserve Preference 配置弹窗 UI 统一实施计划

## 1. 实施边界

按已批准 Spec 实施：

- Reserve Preference 新增弹窗统一 Tier、section、日期选择器和 footer。
- Reserve Preference 新增/编辑复用 feature-local 字段编辑器。
- 保留 Short-call Type、五种 Date Scope、API payload、数据库与算法格式。
- 不修改 Reserve 页面布局、coverage 业务规则、隐藏 Legacy / AA 工作流。

## 2. 实施步骤

### 步骤一：锁定现有行为

涉及文件：

- `pbs-portal/src/features/reserve/components/reserve-short-call-type-dialog.test.tsx`
- `pbs-portal/src/features/reserve/components/reserve-bid-dialog.test.tsx`
- `pbs-portal/src/features/reserve/pages/reserve-page.test.tsx`

操作：

1. 补充当前默认 call type、空 Tiers、五种 Date Scope、coverage 预填和请求 payload 等价测试。
2. 增加 periodCode 缺失和历史越界日期不会被静默修改的回归测试。

验证：

```bash
cd pbs-portal
npx vitest run \
  src/features/reserve/components/reserve-short-call-type-dialog.test.tsx \
  src/features/reserve/components/reserve-bid-dialog.test.tsx \
  src/features/reserve/pages/reserve-page.test.tsx
```

### 步骤二：抽取 Reserve Preference 字段编辑器

涉及文件：

- 新增 `pbs-portal/src/features/reserve/components/reserve-preference-editor.tsx`
- 新增对应 focused test
- 调整 `reserve-short-call-type-dialog.tsx`
- 调整 `reserve-bid-dialog.tsx`

操作：

1. 复用 Short-call Type 与 Date Scope 状态映射。
2. Date Range 使用 `PbsDatePicker mode="range"`。
3. Specific Dates 使用 `PbsDatePicker mode="multiple"`。
4. 用显式 adapter 保持 `ReserveDateScope` 的 date-only payload。
5. periodCode 无效或历史日期越界时阻止静默提交。

验证：运行 editor、新增弹窗和编辑弹窗 focused tests。

### 步骤三：统一 Tier 与 footer

涉及文件：

- `reserve-short-call-type-dialog.tsx`
- `pairing-property-dialog-footer.tsx`
- 必要时新增 shared bid dialog footer
- Pairing footer focused tests

操作：

1. Reserve 新增弹窗使用 `TierToggleGroup` 和 `TIERS · REQUIRED`。
2. 将通用 footer 视觉骨架下沉到 shared，Pairing 保留轻量 wrapper。
3. Reserve 使用同一 footer，仅显示 Cancel 与 Add/Update Bid。

验证：

- Reserve footer 状态测试。
- Pairing Add / Update / Save Favorite 回归测试。

### 步骤四：接入 periodCode 与页面流程

涉及文件：

- `pbs-portal/src/features/reserve/pages/reserve-page.tsx`
- `reserve-page.test.tsx`

操作：

1. 新增和编辑弹窗均从 `data.rightPanel.draftMeta.periodCode` 取值。
2. 保持 coverage calendar Specific Dates 预填。
3. 保持现有 add/update service payload。

验证：Reserve page focused tests。

### 步骤五：真实 UI 回归与 QA

涉及文件：

- `e2e/tests/pbs-portal/reserve-preference.spec.ts`
- `docs/test-cases/pbs/reserve/2026-07-24-reserve-preference-dialog-ui-unification.md`

操作：

1. 使用既有 route fixture 驱动真实 UI。
2. 断言 Tier buttons、单一 range picker、multiple picker。
3. 拦截并断言新增、coverage 预填和更新请求 payload。
4. 不向共享环境写测试数据。

## 3. 完整验证

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

## 4. 完成标准

- 已批准 Spec 的全部验收项有对应实现与测试。
- Reserve payload 与改动前完全等价。
- Pairing footer 无视觉或行为回归。
- Vitest、Playwright、lint、build、UI gate 和 diff check 全部通过。
- 不混入工作区中与本任务无关的改动。
