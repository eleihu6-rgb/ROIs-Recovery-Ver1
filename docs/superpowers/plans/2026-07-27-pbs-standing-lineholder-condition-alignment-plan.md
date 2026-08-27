# PBS Lineholder Standing Bid 条件对齐实施计划

日期：2026-07-27  
对应设计：`docs/superpowers/specs/2026-07-27-pbs-standing-lineholder-condition-alignment-design.md`  
执行方式：单人、分阶段、小步验证

## 1. 实施原则

- 只调整 Lineholder Standing Bid；Reserve 现有行为保持不变。
- 复用当前 Bid 页的整行属性列表与既有编辑器，不新增卡片目录或新的 UI 体系。
- 先改并验证条件合同，再改后端，再改 Portal；每一步通过 focused test 后才进入下一步。
- 不修改数据库 schema，不新增依赖，不改 Current Bid 的业务行为。
- 保留工作树中其他 PBS 改动，不做无关重构。

## 2. 影响范围

GitNexus 初步影响分析：

- `pbsStandingLineholderPropertyCatalog`：LOW。
- `mapStandingBidResponseToPageData`：LOW。
- `StandingBidPage`：LOW。

实施前仍需对每个将修改的函数执行精确 upstream impact；若出现 HIGH / CRITICAL，暂停并先报告。

预计写入范围：

- `packages/contracts/pbs-standing-bids.js`
- `packages/contracts/pbs-standing-bids.d.ts`
- `packages/contracts/pbs-standing-bids.test.mjs`（新增）
- `pbs-server/src/services/standing-bid/standing-bid-service.ts`
- `pbs-server/src/services/standing-bid/standing-bid-service.test.ts`
- `pbs-server/src/routes/standing-bids.test.ts`
- `pbs-portal/src/features/standing-bid/standing-bid-draft-mappers.ts`
- `pbs-portal/src/features/standing-bid/standing-bid-draft-mappers.test.ts`
- `pbs-portal/src/features/standing-bid/pages/standing-bid-page.tsx`
- `pbs-portal/src/features/standing-bid/pages/standing-bid-page.test.tsx`
- `pbs-portal/src/features/standing-bid/components/standing-bid-dialog.tsx`
- `pbs-portal/src/features/pairing/components/pairing-bid-date-or-dow-control.tsx`
- 对应 focused component test（优先扩展现有测试；只有缺少承载位置时新增）
- `e2e/tests/pbs-portal/standing-bid-phase-one.spec.ts`
- `docs/test-cases/pbs/standing-bid/2026-07-07-standing-bid-reusable-property-catalog.md`

## 3. 阶段一：锁定 Lineholder Standing 条件合同

### 目标

先把“哪些条件允许进入 Standing”变成可执行、可回归的唯一合同。

### 测试先行

新增 `packages/contracts/pbs-standing-bids.test.mjs`，断言：

- Lineholder catalog 包含 `168 / 428 / 218`。
- Lineholder catalog 不包含 `101 / 104 / 102 / 204`。
- `428` 的 `bidType` 为 `Pairing`。
- `218` 的 `bidType` 为 `DaysOff`。
- 目标 Days Off、Pairing、Line code 集合与已确认 spec 完全一致。
- 所有 date-or-dow 默认值不包含具体日期。

### 实现

更新 `pbs-standing-bids.js`：

- Days Off 通用集合收敛为 `201`，另保留 Standing 专属 `218`。
- Pairing 集合替换为 spec 中确认的 `168 / 428 / 103 / 107 / 110 / 112 / 116 / 117 / 122 / 129 / 163`。
- Line 集合收敛为 `429 / 407 / 408 / 410 / 427`。
- 删除旧 `101 / 104`，不引入 `102 / 204`。
- `428` 从 Line 迁到 Pairing。
- 保持 contract 从 Current Bid catalog 派生，不复制 property 定义。

同步检查 `.d.ts`，只在公开类型或导出发生变化时修改。

### 验证

```bash
node --test packages/contracts/pbs-standing-bids.test.mjs
```

## 4. 阶段二：后端 catalog、旧数据保护与保存硬校验

### 测试先行

更新 Standing service / route tests，覆盖：

- GET 返回可见的 `168 / 428 / 218`，不返回 `101 / 104 / 102 / 204`。
- inactive 或 Portal hidden 条件不进入返回 catalog。
- `428` 按 Pairing 条件返回并可保存。
- `168` 可保存。
- `102 / 204` 构造请求返回 `400`。
- 非空绝对日期、日期数组、日期范围、具体 Pairing ID / occurrence 返回 `400`。
- 遇到已保存但新 catalog 不支持的旧 property 时不得静默丢弃，应返回可处理的持久错误并阻止覆盖保存。
- T1-T7 和 draftVersion 冲突规则保持不变。

### 实现

- 继续使用 `resolveStandingPropertyCatalog()` 将 contract 支持集合与数据库 active / visible 状态取交集。
- 保持 hidden 但 active 的受支持 property 可用于历史草稿反序列化。
- 修改 `loadDraftProperties()` 的 unsupported property 分支：不再 `continue` 静默隐藏，改为抛出明确服务错误，防止下一次整份保存误删旧数据。
- 复用现有 `disallowStandingDateBoundBid()`、`validateStandingBidValue()`；只补缺失的嵌套日期与新 catalog 回归，不另建第二套 validator。

### 部署前只读 preflight

使用远端权威 PostgreSQL 环境变量执行只读查询，统计：

- `StandingLineholder / StandingReserve`
- `period_code='STANDING'`
- 已保存 property code 不属于新支持集合的记录

判定：

- 结果为 0：继续。
- 结果非 0：停止部署，列出 code 和数量，另行确认迁移、只读保留或清理方案。

不得在计划或回执中记录数据库密码。

### 验证

```bash
cd pbs-server
DATABASE_URL=postgresql://test:test@localhost:5432/rois \
  node --import tsx --test \
  src/services/standing-bid/standing-bid-service.test.ts \
  src/routes/standing-bids.test.ts
```

## 5. 阶段三：Portal 数据映射与分类

### 测试先行

更新 mapper tests，断言：

- 不再过滤 `428`。
- `168 / 428` 都映射到 `Pairing`。
- `218` 映射到 `Days Off`，不生成单独 `Standing` 分类。
- `Line` 数据在页面标签中显示为 `Roster`。
- Standing 数据不包含 favorite rows，也不依赖 favorite 状态。
- 保存 mapper 继续拒绝具体日期和具体 Pairing。

### 实现

更新 `mapStandingBidResponseToPageData()`：

- 删除 `propertyCode !== 428` 的临时过滤。
- 删除 draft 中对 `428` 的临时过滤。
- 将 UI 分类改为 `Days Off / Pairing / Roster`。
- 将 `218` 归入 `Days Off`。
- Reserve 的现有分类与行为保持原样。

### 验证

```bash
cd pbs-portal
npx vitest run \
  src/features/standing-bid/standing-bid-draft-mappers.test.ts
```

## 6. 阶段四：Standing 页面按 V3 复用 Current Bid 列表样式

### 测试先行

更新 `standing-bid-page.test.tsx`，先让测试证明：

- 页面没有旧的宽大左侧说明栏。
- Lineholder / Reserve 是顶部横向 Tab。
- Existing 区没有数据时显示空状态，不显示示例规则。
- Add 区只有 `All Properties / Days Off / Pairing / Roster`。
- 不显示 `FAVORITED PROPERTIES`，不提供收藏入口。
- 可选属性使用既有整行列表与圆形添加入口。
- Existing 真数据仍可编辑、删除和自动保存。
- loading / error 状态保持同一单列工作台骨架，错误使用现有持久错误状态。

### 实现

- 移除 `StandingBidLayout` 的 `360px + content` 两列结构和对应左栏 loading skeleton。
- 在页面顶部实现紧凑的 Lineholder / Reserve Tab 与短说明。
- 优先复用 Current Bid 的：
  - `PanelStripHeader`
  - existing row / empty state
  - available property row
  - 搜索框
  - 分类 Tab 样式
- Standing 页面不传入或渲染 favorite Tab、favorite action、favorite dialog footer。
- 不复制假数据；展示内容只来自 Standing API。
- 保持现有 Standing 保存、draftVersion、编辑 dialog 和 Query cache 流程。

如果现有 `RuleBidRightPanel` 无法在不影响 Current Bid 的情况下隐藏 Favorites，应新增一个最小 presentation prop（默认保持旧行为），不得为 Standing 复制整套通用 panel。

### 验证

```bash
cd pbs-portal
npx vitest run \
  src/features/standing-bid/pages/standing-bid-page.test.tsx
```

## 7. 阶段五：日期区域可见、空值、禁用

### 测试先行

增加 Standing dialog focused tests，断言：

- 对 date-or-dow 类型，Date 区域仍可见。
- 日期输入和 `Add Date` 为 disabled。
- 初始日期值为空。
- 有明确文字：`Applies to any date in the bid month.`
- 星期选择仍可用。
- 提交 payload 的 `dates` 保持空数组。
- Current Bid 使用同一共享控件时行为不变。

### 实现

为 `DateOrDowListControl` 增加最小向后兼容配置，例如：

- `showDisabledDates`
- `dateDisabledHint`

默认值保持 Current Bid 现状；Standing dialog 显式开启“显示但禁用”的日期区域。

不得使用只靠颜色表达的禁用状态；input / button 需要真实 `disabled` 语义。

### 验证

```bash
cd pbs-portal
npx vitest run \
  src/features/standing-bid \
  src/features/pairing/components
```

## 8. 阶段六：真实 UI 回归与 QA 文档

### Playwright

更新 `standing-bid-phase-one.spec.ts`，通过真实页面交互覆盖：

1. 打开 `/standing-bid`。
2. 验证 V3 单列骨架、顶部模式 Tab、无 Favorites。
3. 验证 `168 / 428 / 218` 显示。
4. 验证 `101 / 104 / 102 / 204` 不显示。
5. 新增并保存 `Airport Preference`。
6. 新增并保存 `Efficient Flying First`。
7. 刷新后验证回显与编辑。
8. 验证 Date 区域可见、为空且不可填写。
9. 在 1920、1366、1280 宽度验证无横向溢出。

### QA 文档

更新现有 Standing Bid QA：

- 分类改为 `Days Off / Pairing / Roster`。
- 删除 Favorites 和单独 Standing Tab 的期望。
- `Day of Week Off` 归入 Days Off。
- 日期区域从“隐藏”改为“显示但禁用且为空”。
- 增加 168、428、排除 102、204、空状态、后端绕过校验用例。

### 最终验证

按从小到大顺序：

```bash
node --test packages/contracts/pbs-standing-bids.test.mjs

cd pbs-server
npm test
npm run build

cd ../pbs-portal
npm test
npm run lint
npm run build

cd ..
npm run check:ui

cd e2e
npx playwright test tests/pbs-portal/standing-bid-phase-one.spec.ts --reporter=list

cd ..
npm run verify:pbs
git diff --check
node .gitnexus/run.cjs detect_changes --scope compare --base-ref main
```

最终回执必须逐条写明 PASS / FAIL；未执行项必须说明原因和剩余风险。

## 9. 阶段提交建议

为方便回滚与审查，建议拆为三个提交：

1. `test/feat: 对齐 Standing Lineholder 条件合同与服务校验`
2. `feat: 按 Bid 列表样式重做 Standing Bid 页面`
3. `test/docs: 补齐 Standing Bid E2E 与 QA 用例`

提交前只 stage 本功能文件，并运行 GitNexus `detect_changes`。原型 HTML 与本地截图不进入产品提交。

