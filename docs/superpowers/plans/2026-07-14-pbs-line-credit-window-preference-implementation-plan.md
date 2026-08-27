# PBS Line「Credit Window Preference」实施计划

## 1. 前置状态

已批准 spec：

- `docs/superpowers/specs/2026-07-14-pbs-line-credit-window-preference-design.md`

已确认产品表达：

- 新增 `property_code=429 Credit Window Preference`。
- UI 使用 `Low credit` / `High credit` / `Custom`。
- `Low credit` / `High credit` 是公司定义窗口，用户不可输入具体 credit。
- `Custom` 才展示 `Minimum credit` / `Maximum credit`。
- 旧 401/402 不清理、不迁移；已有数据只读显示、可删除、继续 legacy export。
- Standing Lineholder 同步上 429。
- Legacy importer：`Maximum Credit Window` → `low`，`Minimum Credit Window` → `high`。
- 本轮不实现 429 的 algorithm export；导出给算法的契约最后单独设计。

## 2. Implementation Start Gates

开始写产品代码前必须满足：

1. `dictionary` 中存在 `PBS_LINE_CREDIT_WINDOW_CONFIG` 配置组，后续管理端可编辑。

字段结构：

| parent_code | code | code_value |
| --- | --- | --- |
| `SYS_PARAM` | `PBS_LINE_CREDIT_WINDOW_CONFIG` | `null` |
| `PBS_LINE_CREDIT_WINDOW_CONFIG` | `MMG_CREDIT` | `70:00` |
| `PBS_LINE_CREDIT_WINDOW_CONFIG` | `OVERTIME_THRESHOLD` | `90:00` |
| `PBS_LINE_CREDIT_WINDOW_CONFIG` | `LOW_MIN_CREDIT` | `70:00` |
| `PBS_LINE_CREDIT_WINDOW_CONFIG` | `LOW_MAX_CREDIT` | `78:00` |
| `PBS_LINE_CREDIT_WINDOW_CONFIG` | `HIGH_MIN_CREDIT` | `82:00` |
| `PBS_LINE_CREDIT_WINDOW_CONFIG` | `HIGH_MAX_CREDIT` | `90:00` |

这些是可改默认值，不是代码常量；如果业务确认了不同值，改字典即可。

## 3. 实施顺序

### Phase 1：共享契约与数据定义

Owner：Main agent

文件范围：

- `packages/contracts/pbs-line-bids.js`
- `packages/contracts/pbs-line-bids.d.ts`
- `packages/contracts/pbs-standing-bids.js`
- `sql/seed/10-pbs-bid-property.sql`
- 新增 `sql/migration/*credit-window-preference*.sql`

工作内容：

1. 新增 429 property code 和 `credit-window-preference` bid value type。
2. Line supported catalog / recommended order 用 429 替换 401/402。
3. Standing Lineholder catalog 暴露 429，不再暴露可新增 401/402。
4. seed / migration 增加 429，隐藏 401/402 的新增入口，但不清理历史数据。
5. migration 创建 `PBS_LINE_CREDIT_WINDOW_CONFIG` 父子字典项，保留已有非空配置值。

验收：

- Contract tests 覆盖 429 catalog、Line / Standing catalog 和 bid union。
- 旧 401/402 metadata 仍可用于 legacy display / export。

### Phase 2：PBS Server

Owner：Worker B 或 Main agent

文件范围：

- `pbs-server/src/routes/**`
- `pbs-server/src/services/lineholder/**`
- `pbs-server/src/services/crew-bid-import/**`
- server focused tests

工作内容：

1. 新增 credit window config route/service。
2. 解析 dictionary 字段，返回 `mmgCredit`、`overtimeThreshold`、low/high window。
3. 保存 Line draft / favorite 时校验并规范化 429 payload。
4. Low/High 保存时由服务端配置覆盖 min/max，不能信任前端隐藏值。
5. Custom 校验 `HH:MM`、min <= max、min >= MMG、max <= overtime threshold。
6. Summary formatter 输出 `Low credit`、`High credit`、`Custom credit HH:MM - HH:MM`。
7. importer 将旧文本映射到 429，并记录 warning。
8. 不实现 429 export 语义；如果现有 algorithm export 遇到未知 Line property 会报错，只做最小保护让 429 跳过，旧 401/402 existing data 保持 legacy export。

验收：

- Config route 成功 / 缺失 / 字段非法 / 边界非法。
- 429 保存校验覆盖 Low、High、Custom。
- importer 映射覆盖 `Maximum Credit Window` 和 `Minimum Credit Window`。
- export guard 覆盖 429 不导致现有导出崩溃；不验证 429 导出语义。

### Phase 3：PBS Portal

Owner：Worker A 或 Main agent

文件范围：

- `pbs-portal/src/features/line/**`
- `pbs-portal/src/features/standing-bid/**`
- `pbs-portal/src/shared/services/line-service.ts`
- portal focused tests
- relevant Playwright tests

工作内容：

1. 新增 `LineCreditWindowPreferenceControl`。
2. `LineBidDialog` 对 429 使用专属 UI，顺序为 `TIERS` → `PREFERENCE` → `WINDOW`。
3. 使用 `PbsDialogFrame`、`TierToggleGroup`、`PreferenceSegmentedControl`、`PreferenceNumberRange` 或同等共享 primitive。
4. Low/High 只显示 `Company low window` / `Company high window`。
5. Custom 展示 min/max 输入，初始为空。
6. Footer 禁用逻辑与 spec 一致。
7. Line page 和 Standing Lineholder 使用同一 429 契约。
8. 旧 401/402 existing row 只允许 display/delete，不允许 edit/favorite add。

验收：

- Portal Vitest 覆盖初始态、三种 mode、校验、回显、legacy 401/402 行为。
- Playwright 覆盖真实 Line 页面和 Standing Lineholder 主路径。
- `npm run check:ui` 通过。

### Phase 4：QA 文档与最终验证

Owner：Main agent

文件范围：

- `docs/test-cases/pbs/line/2026-07-14-credit-window-preference.md`

工作内容：

1. 写人工 QA 用例：Current Line、Standing Lineholder、Low/High/Custom、legacy 401/402。
2. 集成并解决 contract/server/portal 测试断点。
3. 跑最终验证命令。

## 4. 并行策略

推荐并行，但必须先由 Main agent 完成 Phase 1 的契约落地。

- Worker A：只写 Portal 和 Playwright 范围。
- Worker B：只写 pbs-server config / validation / importer / server tests；不写 429 algorithm export 语义。
- Main agent：写 contracts / SQL / migration / QA 文档，并负责最终集成。

冲突风险：

- `packages/contracts/**` 是共享依赖，不能多人同时改。
- `sql/seed/10-pbs-bid-property.sql` 已有其他窗口改动风险，编辑前必须重新读文件并只做 429 最小 patch。
- Deadhead Flying 相关文件属于另一个窗口，不能触碰。

## 5. 验证命令

实施后按以下顺序跑：

```bash
npm --prefix pbs-portal test -- line
npm --prefix pbs-server test -- line
npm --prefix pbs-server run build
npm --prefix pbs-portal run lint -- --quiet
npm --prefix pbs-portal run build
npm run check:ui
npm run verify:pbs
git diff --check
```

还需要补跑对应 Playwright：

```bash
npm --prefix pbs-portal run test:e2e -- <credit-window-preference spec>
```

实际命令以仓库现有脚本为准；若脚本名不同，实施时先读取 `package.json` 后调整。
