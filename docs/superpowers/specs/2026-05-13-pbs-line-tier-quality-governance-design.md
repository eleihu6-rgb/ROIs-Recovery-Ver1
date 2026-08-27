# PBS Line / Tier 性能与可读性治理设计

## 背景

Line 和 Tier 当前已经完成主要业务能力开发，下一步需要做交付前质量治理。用户明确要求：

- 继续参考之前 PBS 模块做过的性能优化和大文件治理方式。
- 检查 Line / Tier 是否有性能退化、重复请求、缓存失效不合理、可读性下降、大文件变成“屎山代码”的风险。
- 优化完成后不能把已经开发好的功能改坏。

当前只读摸底发现：

- `pbs-server/src/services/line/line-bid-service.ts` 约 1566 行，是 Line 后端最大的风险文件。
- `pbs-portal/src/features/tier/components/tier-right-panel.tsx` 约 927 行，是 Tier 前端主面板的大组件风险点。
- `pbs-portal/src/features/tier/components/tier-detail-dialog.tsx` 约 719 行，混合了详情展示、编辑 Tx、删除确认、只读原因等逻辑。
- PBS 已有 `perf:pbs` 性能基线脚本，覆盖 `line current draft`、`lineholder summary` 等关键接口，可作为改造前后验证工具。

## 目标

1. 保持 Line / Tier 已有功能、UI 行为、API contract 和数据库 schema 不变。
2. 检查并修正明显性能问题：
   - 重复 current draft 请求。
   - 不必要的全量保存。
   - 不合理的 cache invalidate。
   - 后端可能的 N+1 查询或重复 catalog/current period 加载。
3. 降低大文件风险，让核心文件职责更清晰。
4. 保持代码阅读路径清楚，避免为了行数而硬拆。
5. 补齐必要测试，确保已有功能不被改坏。

## 非目标

- 不新增 Line / Tier 业务功能。
- 不改变用户当前看到的文案、按钮、弹窗、布局和交互流程，除非发现明显 bug 且单独确认。
- 不修改数据库 schema、migration、seed。
- 不接入 RO / PO / 法规 / Award 算法逻辑。
- 不新增依赖。
- 不把性能治理扩大成全项目重构。

## 可选方案

### 方案 A：只做审计，不改代码

只输出问题清单、风险等级和后续建议。

优点：最安全，不会影响功能。

缺点：不能真正降低当前大文件和性能风险，问题仍留在代码里。

### 方案 B：按批次做低风险治理（推荐）

先做 Line 后端，再做 Tier 前端。每批只拆有明确收益的逻辑，配套测试和性能验证。

优点：风险可控，能实际降低大文件和性能风险，也符合之前 PBS 大文件治理方式。

缺点：需要多轮验证，时间比纯审计更长。

### 方案 C：一次性大重构

一次性把 Line / Tier 大文件拆成多个服务、hook、组件和测试 fixture。

优点：行数下降明显。

缺点：容易改坏已完成功能，测试回归压力大，不适合当前临近交付的状态。

推荐采用方案 B。

## 治理范围

### Line 后端

重点文件：

- `pbs-server/src/services/line/line-bid-service.ts`
- `pbs-server/src/services/line/line-validation.ts`
- `pbs-server/src/services/line/line-property-catalog.ts`
- `pbs-server/src/routes/line-bids.ts`
- 相关测试文件

检查方向：

- property catalog / current period / draft 读取是否复用已有缓存。
- add / patch / delete 是否仍走逐条接口，避免退回整份 draft 保存。
- Tx merge、duplicate 判断、favorite 保存、mutation response 是否能拆成清晰 helper。
- SQL 写入与 tier sync 是否存在重复构建逻辑。

预期治理方式：

- 优先抽纯函数和写入 helper。
- 保持 route 与 service 外部接口不变。
- 给拆出的 helper 补轻量单测。
- 保留主 service 的编排职责，不拆散事务主流程到难追踪的位置。
- 不以行数作为唯一拆分标准。如果 Line 的事务编排和业务逻辑天然集中，拆分后反而需要跨多个文件追踪完整流程，就保留在同一文件，并通过局部 helper、清晰命名和测试降低阅读风险。

### Tier 前端

重点文件：

- `pbs-portal/src/features/tier/components/tier-right-panel.tsx`
- `pbs-portal/src/features/tier/components/tier-detail-dialog.tsx`
- `pbs-portal/src/features/tier/tier-editing-actions.ts`
- `pbs-portal/src/features/tier/tier-detail-selectors.ts`
- 相关测试文件

检查方向：

- `View Pairing Set` 是否继续复用 Pairing current draft 缓存，不重复打慢接口。
- `Edit Tx` / `Delete Bid` / `Remove Day Off` 是否仍复用原模块真实 mutation API。
- summary tab、detail dialog、preview dialog、diagnostics 是否能分离成更小组件或纯逻辑。
- 避免在组件 render 中做昂贵计算；必要时用稳定 selector / memo。

预期治理方式：

- 把纯 UI 子块、selector、preview 状态辅助逻辑拆出去。
- 保持用户看到的 Tier 页面不变。
- 保留现有测试语义，必要时提取测试 fixture，降低测试文件重复。
- 不为了把组件压到某个固定行数而拆 UI。如果一个面板本身就是完整业务视图，拆出去会让状态、回调和阅读路径更分散，就保留主组件，只抽真正独立、可测试、可复用的部分。

## 性能验收标准

- `/api/line-bids/current`、`/api/lineholder-bids/current/summary` 在本地性能基线中保持 2 秒预算内。
- 已缓存 Pairing current draft 时，Tier 的 `View Pairing Set` 不重复请求 `/api/pairing-bids/current`。
- Line 的 add / patch / delete 不触发整份 draft 保存。
- 不新增明显重复 invalidate，涉及 Tier summary、Calendar、Pairing、DaysOff、Line 的缓存失效保持最小必要范围。

## 功能回归验收标准

以下能力必须保持可用：

- Line 页面加载 current draft。
- Line add property、patch property Tx / bid / modifier、delete property、favorite / unfavorite。
- Tier 页面加载 BID SUMMARY、TIER REVIEW、summary tabs。
- Tier detail dialog 查看详情。
- Tier `Edit Tx`、`Delete Bid`、Calendar `Remove Day Off`。
- Tier `View Pairing Set` preview。
- legacy / T8+ 只读提示不被改坏。

## 测试计划

后端：

- `cd pbs-server && npm test -- --test-name-pattern=line`
- `cd pbs-server && npm test -- --test-name-pattern=lineholder`
- `cd pbs-server && npx tsc --noEmit`
- 必要时跑 `npm run perf:pbs -- --base-url=http://127.0.0.1:3002 --samples=5 --budget-ms=2000`

前端：

- `cd pbs-portal && npx vitest run src/features/line src/features/tier`
- `cd pbs-portal && npx tsc --noEmit`
- `cd pbs-portal && npm run lint`

全量：

- 根目录 `npm run verify:pbs`

## 执行顺序

1. 记录当前工作区和现有未提交改动，避免误回滚用户或前序改动。
2. 跑当前定向测试，确认改造前基线。
3. 第一批治理 Line 后端大文件。
4. 跑 Line 后端定向测试。
5. 第二批治理 Tier 前端大组件。
6. 跑 Tier 前端定向测试。
7. 跑 TypeScript、lint、`verify:pbs` 和必要性能基线。
8. 输出改动说明、剩余风险和人工测试建议。

## 风险控制

- 每批只改一类问题，避免大范围同时变动。
- 不为了行数硬拆事务流程、复杂用户流程测试或强耦合状态编排。
- 大文件治理的判断标准是“职责是否清楚、是否重复、是否难测、是否有性能风险”，不是单纯看是否超过 1000 行。如果某个文件承载的是一个完整且连续的业务流程，拆分后阅读更困难或边界不合理，就不拆。
- 如果发现需要 schema、索引或 API contract 变化才能真正解决性能问题，先停下来说明，不直接改。
- 如果遇到已有未提交改动，先判断是否属于当前任务；不回滚无关改动。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 当前治理会触碰 Line / Tier 核心文件，且工作区已有未提交 Tier 改动。单人按批次推进更容易控制行为不变和测试回归。
- Suggested split: 不拆分代理。先 Line 后端，再 Tier 前端。
- Write boundaries: `pbs-server/src/services/line/*`、`pbs-server/src/routes/line-bids*`、`pbs-portal/src/features/tier/*`、相关测试和 QA 文档。
- Conflict risk: 中等。主要风险来自 Tier 近期功能仍在工作区中，以及 Line service 文件过大。
- Execution gate: 用户确认本 spec 后再开始修改业务代码。
