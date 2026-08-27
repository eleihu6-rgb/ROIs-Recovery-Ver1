# 开发上下文（2026-06-05）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-06-05 10:08:26 CST
- Wing：`pbs`
- Topic：`pairing-number-detail-api-cleanup`
- Title：PBS Pairing Number 稳定 ID 与日历详情接口清理
- Git branch：`main`

## 本轮对话上下文

# PBS Pairing Number 稳定 ID 与日历详情接口清理上下文

## 本轮核心背景

用户持续强调：Pairing Number 有稳定 ID 时必须使用 ID，展示字段只负责展示；项目尚未上线，不兼容旧错数据，旧错数据可以删除或拒绝。

本轮围绕 Pairing Number / Pairing Search / 左侧日历详情完成了几件强相关工作：

1. Pairing Number 移除旧 `tag-list` / `tag-list-date` 兼容。
2. Pairing Number Entire Month 下方 pairing 按钮从单选改为多选。
3. 左侧日历点击 pairing detail 不再走 `/api/pairing-search/preview`，新增专门轻量接口 `/api/pairing-search/pairing-details`。
4. 继续保留全局 `tag-list`，因为 Days Off / Reserve / Line / Pairing 非 Pairing Number 条件仍正常使用它。

## 已写 spec

- `docs/superpowers/specs/2026-06-02-pbs-pairing-number-remove-legacy-tag-list-design.md`
- `docs/superpowers/specs/2026-06-02-pbs-pairing-number-entire-month-multiselect-mode-design.md`
- `docs/superpowers/specs/2026-06-02-pbs-calendar-pairing-detail-api-design.md`

## 关键设计结论

### Pairing Number bid 类型

Pairing Number 只允许：

- 整月：`pairing-id-list`
  - 保存 `pairingIds: string[]`，必须是数据库稳定数字 ID。
  - `pairingLabels` 只用于展示。
- 指定日期 / 具体 run：`pairing-occurrence-list`
  - 保存 `occurrences[]`，每项至少含 `pairingId`, `pairingNumber`, `originDate`。

Pairing Number 不再接受：

- `tag-list`
- `tag-list-date`

后端收到 Pairing Number + 旧类型要 400，不做转换、不做兼容。

### tag-list 是否删除

不能全局删除 `tag-list`。它仍被这些场景使用：

- Days Off 日期 / Prefer Off 等。
- Reserve 日期选择。
- Line 部分复杂条件。
- Pairing 中机场、城市、航班号、crew id、layover 等非 Pairing Number 条件。

本轮只清 Pairing Number 旧路径。

### Entire Month 多选交互

Pairing Number 配置弹窗中：

- BID 输入框仍负责搜索/添加 pairing。
- Entire Month 模式下，下方 pairing 按钮是多选，默认全选。
- 用户取消某个按钮，本次保存不包含该 pairing。
- `ADD BID` / `SAVE FAVORITE` 保存时只保存高亮的 pairing IDs。
- Specific Date 模式下，下方 pairing 按钮仍是单选，用来决定当前加载哪个 pairing 的 run dates。

### 左侧日历 pairing detail 专门接口

旧问题：左侧日历详情曾构造如下旧 payload 调 preview：

```json
{
  "periodCode": "Jun 2026",
  "preview": {
    "mode": "criteria",
    "properties": [
      {
        "propertyCode": 102,
        "name": "Pairing Number",
        "bid": {
          "type": "tag-list-date",
          "values": ["11962"],
          "date": "2026-06-21"
        }
      }
    ]
  }
}
```

移除旧兼容后该 payload 必然 400：`Invalid pairing search preview payload.`

新设计：日历详情不是复杂搜索条件，而是已知 pairingId/originDate 的 detail lookup，所以新增：

`POST /api/pairing-search/pairing-details`

请求：

```json
{
  "periodCode": "Jun 2026",
  "targets": [
    {
      "pairingId": "11962",
      "originDate": "2026-06-21"
    }
  ]
}
```

如果无具体日期，可只传 `pairingId`。

## 主要代码改动

### Contracts

- `packages/contracts/pbs-search-pairings.js`
  - 增加 `pbsSearchPairingRoutes.pairingDetails = "/pairing-search/pairing-details"`。
- `packages/contracts/pbs-search-pairings.d.ts`
  - 增加 `PbsPairingDetailTarget`。
  - 增加 `PbsPairingDetailsRequest`。
  - 增加 `PbsPairingDetailsResponse`。

### 后端 pbs-server

- `pbs-server/src/routes/pairing-search.ts`
  - 增加 `pairingDetailsRequestSchema`。
  - 新增 `POST /pairing-search/pairing-details` route。
  - payload 校验要求：
    - `targets` 1 到 50 个。
    - `pairingId` 必须是数字字符串。
    - `originDate` 可选，若有必须是 `YYYY-MM-DD`。
- `pbs-server/src/services/pairing-search/types.ts`
  - `PbsPairingSearchService` 增加 `getPairingDetails`。
- `pbs-server/src/services/pairing-search/pairing-search-service.ts`
  - 接入 `executePairingDetailsQuery`。
- `pbs-server/src/services/pairing-search/pairing-search-preview-query.ts`
  - 新增 `executePairingDetailsQuery`。
  - 抽出 segment 加载 helper 供 preview/detail 共用。
  - detail 查询按 pairing IDs 先过滤，避免扫全表。
  - periodCode 使用 `parsePeriodMonth` 校验并限制 origin date 月份。
- `pbs-server/src/app.ts`
  - skipDatabase fallback mock 增加 `getPairingDetails`。
- `pbs-server/src/routes/pairing-search.test.ts`
  - mock service 增加 `getPairingDetails`。
  - 增加 detail 成功和 invalid payload 测试。

### 前端 pbs-portal

- `pbs-portal/src/shared/services/pairing-service.ts`
  - 增加 `getPairingDetails(periodCode, targets)`。
- `pbs-portal/src/features/dashboard/pairing-calendar-detail.ts`
  - 删除旧 `buildPairingDetailCriteria`。
  - `loadPairingDetailResults` 改用 `pairingService.getPairingDetails`。
  - dashboard 代码中不再构造 `tag-list-date`。
- `pbs-portal/src/features/dashboard/pairing-calendar-detail.test.ts`
  - 增加断言：日历详情通过 dedicated detail endpoint 加载，不调用 `previewCriteria`。
- `pbs-portal/src/features/dashboard/pages/dashboard-page.test.tsx`
  - mock 从 `previewCriteria` 改为 `getPairingDetails`。
  - 断言 payload 为 `periodCode + targets`。
- `pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx`
  - 新增 Entire Month 多选状态 `entireMonthPairingIds`。
  - 保存整月时只使用选中的 pairing IDs。
  - Specific Date 仍保持单选 active pairing。
- `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx`
  - 增加 Entire Month 下多个 pairing 默认全选、取消后只保存剩余 selected pairing 的测试。

## 已执行验证

后端：

```bash
pnpm --filter pbs-server exec tsc --noEmit
DATABASE_URL=postgresql://test:test@localhost:5432/rois pnpm --filter pbs-server exec node --import tsx --test src/routes/pairing-search.test.ts src/services/pairing-search/pairing-search-service.test.ts
DATABASE_URL=postgresql://test:test@localhost:5432/rois pnpm --filter pbs-server exec node --import tsx --test src/services/pairing-search/pairing-search-condition-builder.test.ts src/routes/pairing-search.test.ts
```

前端：

```bash
pnpm --filter pbs-portal exec tsc --noEmit
pnpm --filter pbs-portal exec vitest run src/features/dashboard/pairing-calendar-detail.test.ts src/features/dashboard/pages/dashboard-page.test.tsx
pnpm --filter pbs-portal exec vitest run src/features/pairing/pages/search-pairings-page.test.tsx src/features/pairing/pages/pairing-page.test.tsx src/features/pairing/search-pairings-page-logic.test.ts
pnpm --filter pbs-portal exec vitest run src/shared/services/pairing-service.test.ts src/features/dashboard/pairing-calendar-detail.test.ts
```

这些都通过。

## 当前工作区状态提醒

当前工作区有多处未提交改动，包含本轮和之前 Pairing Number stable ID / preview eye semantics 相关改动。不要随意回滚用户或前序改动。

`git status --short` 中看到的主要改动包括：

- `packages/contracts/pbs-search-pairings.*`
- `pbs-server/src/routes/pairing-search.*`
- `pbs-server/src/services/pairing-search/*`
- `pbs-server/src/app.ts`
- `pbs-portal/src/shared/services/pairing-service.ts`
- `pbs-portal/src/features/dashboard/*`
- `pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx`
- `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx`
- 以及若干 spec / test-case 文档。

## 新窗口继续时优先检查

1. 先读 `NEXT_CONTEXT.md` 和本上下文。
2. 如果用户问为什么左侧日历 detail 还 400，检查浏览器 Network：现在应该请求 `/api/pairing-search/pairing-details`，payload 应为 `periodCode + targets`，不应再有 `preview/properties/tag-list-date`。
3. 如果仍请求旧 preview，多半是前端 dev server 没重启或缓存旧 bundle。
4. 如果新接口 400，重点看 `pairingId` 是否为数字字符串，`originDate` 是否 `YYYY-MM-DD`。
5. 不要恢复 Pairing Number 的 `tag-list/tag-list-date` 兼容。

## 当前工作树快照

### git status --short

```text
(clean)
```

### unstaged changed files

```text
(none)
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-06-05-pbs-pairing-number-detail-api-cleanup.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
