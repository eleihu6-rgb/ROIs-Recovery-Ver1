# PBS Dashboard USER INFORMATION 真实数据接入设计

## 状态

- 文档状态：已确认，第一阶段已实现
- 目标页面：`pbs-portal` Dashboard 页面
- 目标区域：左侧用户卡片中的 `USER INFORMATION`
- 实现状态：第一阶段实现 `email / base / rank / division` 等稳定字段；扩展画像字段留待第二阶段确认口径

## 背景

当前 Dashboard 左侧用户卡片看起来是用户信息面板，但实际数据来源仍以 mock 为主：

- `DashboardPage` 只从 `useAuthSessionStore` 读取登录用户，并只覆盖 `name`。
- 邮箱由前端用用户名拼接 `@rois-tech.com`，不是后端真实邮箱。
- `BASE / POSITION / LANGUAGE / SENIORITY / STATUS / FLEET / EXISTING CREDIT / TRAINING MONTH` 等值来自 `dashboardUserPanelData`，仍是写死内容。
- `DashboardLeftPanel` 只负责渲染传入数据，不直接获取真实用户资料。

后端已有部分真实数据基础：

- `pbs_user` 已包含 `email / base / rank / division`。
- `sync-pbs-users.ts` 已从 live 侧同步 `division / base / rank` 到 `pbs_user`。
- live 侧存在更完整的机组画像表，例如 `crew`、`crew_fleet`、`crew_language`、`crew_rank`、`crew_status`、月度 manday 表等。

因此，本任务不应继续在前端补 mock，而应建立 Dashboard 用户资料数据模型，让 UI 展示真实字段，并对暂时无法稳定确定口径的字段给出明确 fallback。

## 目标

- Dashboard 左侧顶部姓名和邮箱使用真实登录用户资料。
- `USER INFORMATION` 中可稳定获得的字段优先接入真实数据。
- 消除前端伪造邮箱和固定写死的核心用户信息。
- 保留 Dashboard 左侧面板现有视觉布局，不借本任务改版。
- 对无法可靠计算的字段显示明确 fallback，例如 `-`，不继续展示误导性的 mock 值。
- 为后续扩展 `seniority / fleet / language / status / existing credit / training month` 留出清晰接口边界。

## 非目标

- 不重做 Dashboard 整体布局。
- 不调整 `BIDDING CALENDAR`、`MESSAGE CENTER`、排班日历点击逻辑。
- 不新增数据库表。
- 不修改 live schema 或 pbs schema。
- 不在前端硬编码航司特有业务常量。
- 不在本轮直接实现完整 PBS 资历排名、培训月、历史状态口径，除非已有明确数据源和业务定义。

## 现状证据

- `pbs-portal/src/features/dashboard/pages/dashboard-page.tsx`
  - `formatPortalEmail(name)` 用前端拼接邮箱。
  - `userPanelData` 只覆盖 `name / email`。
- `pbs-portal/src/features/dashboard/mock.ts`
  - `dashboardUserPanelData` 写死用户信息和 `USER INFORMATION` 表格内容。
- `packages/contracts/pbs-auth.d.ts`
  - `PbsAuthenticatedUser` 当前只有 `id / name / employeeNo`。
- `pbs-server/src/services/auth/auth-service.ts`
  - `mapUserToSessionUser` 和 `buildSession` 只返回 `id / name / employeeNo`。
- `pbs-server/src/models/pbs/pbs-user.ts`
  - 已有 `email / division / base / rank` 字段。
- `pbs-server/src/scripts/sync-pbs-users.ts`
  - 已从 live `crew / crew_base / crew_rank` 回填 `division / base / rank`。

## 数据字段映射建议

第一阶段接入稳定字段：

| UI 字段 | 建议来源 | 说明 |
|---|---|---|
| 姓名 | `pbs_user.user_name` | 当前 session 已返回 `name`，继续使用真实登录用户姓名 |
| 工号 | `pbs_user.crew_id` | 当前 session 已返回 `employeeNo`，可按后续 UI 需要展示 |
| 邮箱 | `pbs_user.email` | 替换前端拼接邮箱；为空时显示 `-` |
| BASE | `pbs_user.base` | 已由同步脚本从当前主基地回填 |
| POSITION | `pbs_user.rank` | 当前有效职级代码，来自 `crew_rank` 同步 |
| division | `pbs_user.division` | 不一定直接显示，但用于后续选择数据口径 |

第二阶段扩展画像字段：

| UI 字段 | 可能来源 | 需要确认的问题 |
|---|---|---|
| FLEET | live `crew_fleet` 当前有效记录 | 多机队排序、换行和过期记录过滤规则 |
| LANGUAGE | live `crew_language` 当前有效记录 | 是否只显示有效语言，是否显示等级 |
| SENIORITY | live `crew.seniority_num` 或 `crew_seniority` | UI 是显示资历号、资历分，还是相对排名 |
| STATUS | live `crew.status` 或 `crew_status` | UI 是显示在职状态，还是 PBS bidding status 组合标签 |
| EXISTING CREDIT | live `crew_manday_fd_monthly` / `crew_manday_cc_am_monthly` | 需要按 bid period、division 和统计月份确定 |
| TRAINING MONTH | 待确认 | 当前未发现稳定直连字段 |

## 推荐方案

推荐采用“Dashboard 专用 user profile view model”。

做法：

- 后端新增或扩展一个明确的 Dashboard 用户资料读取能力，返回 Dashboard 左侧面板需要的 view model。
- 第一阶段只填充 `pbs_user` 已有稳定字段。
- 第二阶段在同一 view model 下继续聚合 live 画像字段。
- 前端 Dashboard 不再直接依赖 mock 的 `USER INFORMATION` 值，而是通过 mapper 把后端 profile 转成 `DashboardUserPanelData`。

推荐原因：

- Dashboard 面板需要的是展示模型，不完全等同 auth session。
- auth session 不宜无限扩张成所有业务页面的 profile container。
- 后续 `fleet / language / existing credit` 需要查询和聚合 live 侧数据，放在专用 service 中更清晰。
- 可以保留 session 的轻量身份语义，同时让 Dashboard 有可测试、可演进的数据契约。

## 备选方案

### 方案 A：只扩展 auth session

把 `email / base / rank / division` 加到 `PbsAuthenticatedUser` 和 JWT payload 中，Dashboard 直接从 auth store 显示。

优点：

- 改动较小。
- 登录后立即可用，不需要额外请求。

缺点：

- JWT payload 会携带更多用户资料，后续继续加 `fleet / language / credit` 不合适。
- 已登录用户的旧 token 不含新字段，需要兼容 fallback。
- Dashboard 业务展示和认证身份边界混在一起。

### 方案 B：Dashboard 专用 profile API（推荐）

新增 `GET /api/dashboard/profile` 或同等语义接口，后端基于 `request.authUser.employeeNo` 读取 `pbs_user`，返回 Dashboard user profile。

优点：

- 认证身份和页面展示模型边界清楚。
- 可渐进扩展 live 画像字段。
- 能在字段缺失时集中处理 fallback。
- 更适合测试和后续性能优化。

缺点：

- 需要新增 contract、route/service、前端 query 和测试。
- Dashboard 首屏多一个 profile 请求，需要提供 loading 骨架或保留布局尺寸。

### 方案 C：前端临时用 session + mock fallback

只在前端改 mapper，能取到什么显示什么，取不到继续用 mock。

优点：

- 改动最小。

缺点：

- 会继续展示不真实数据。
- 无法接入 `pbs_user.email/base/rank/division`。
- 与项目“禁止用 mock 顶真实异步数据”的 Portal 约定冲突。

## 后端设计

新增 Dashboard profile 契约，建议放在 `packages/contracts/pbs-dashboard-profile.*` 或合并到明确的 Dashboard contract。

建议响应模型：

```ts
export type PbsDashboardUserProfile = {
  id: string;
  employeeNo: string;
  name: string;
  email: string | null;
  base: string | null;
  rank: string | null;
  division: string | null;
  fleet: string[] | null;
  languages: string[] | null;
  seniorityLabel: string | null;
  statusLabel: string | null;
  existingCreditLabel: string | null;
  trainingMonthLabel: string | null;
};
```

第一阶段后端填充：

- `id`
- `employeeNo`
- `name`
- `email`
- `base`
- `rank`
- `division`

第一阶段后端暂不填充或返回 `null`：

- `fleet`
- `languages`
- `seniorityLabel`
- `statusLabel`
- `existingCreditLabel`
- `trainingMonthLabel`

查询规则：

- 根据已认证用户 `employeeNo` 查询 `pbs_user.crew_id`。
- 仅返回当前登录用户自己的资料。
- 如果 `pbs_user` 找不到对应记录，返回 404 或明确错误消息。
- 不把敏感字段返回给前端，例如 password hash、登录失败次数、token version、联系方式之外的个人敏感信息。

## 前端设计

新增 Dashboard profile service/hook：

- 请求统一走 `src/shared/services/request`。
- Dashboard 页面使用 TanStack Query 获取 profile。
- `DashboardLeftPanel` 继续保持纯渲染组件。
- 新增 mapper，把 profile 转成 `DashboardUserPanelData`。

显示规则：

- `name`：profile name；缺失时使用 session name；再缺失显示 `-`。
- `email`：profile email；缺失显示 `-`，不再拼假邮箱。
- `BASE`：profile base；缺失显示 `-`。
- `POSITION`：profile rank；缺失显示 `-`。
- `FLEET`：profile fleet join 后换行；第一阶段为空时显示 `-`。
- `LANGUAGE`：profile languages join 后换行；第一阶段为空时显示 `-`。
- `SENIORITY / STATUS / EXISTING CREDIT / TRAINING MONTH`：第一阶段显示 `-`，或保留字段标签但不展示 mock 值。

Loading 规则：

- 首次加载 profile 时保持左侧面板尺寸稳定。
- 可显示轻量 skeleton 或 `-`，但不得先展示 mock 再切真实数据。
- profile 加载失败时显示 fallback `-`，并保留页面可用。

## 测试设计

后端自动化测试：

- profile route 未登录返回 401。
- 已登录用户能获取自己的 `email / base / rank / division`。
- 字段为空时返回 `null`，不报错。
- 不返回敏感字段。

前端自动化测试：

- Dashboard 使用 profile email，不再显示拼接邮箱。
- Dashboard 显示真实 `BASE / POSITION`。
- profile 字段为空时显示 `-`，不显示 mock 中的 `LAX / 320/737/... / 12:25 / DEC` 等旧值。
- profile loading 时左侧面板不闪出 mock。

QA 人工测试案例：

- 新增 `docs/test-cases/pbs/dashboard/<YYYY-MM-DD>-dashboard-user-information-profile.md`。
- 覆盖登录后 Dashboard 用户信息展示、字段为空 fallback、接口失败 fallback、刷新页面 session 恢复后的展示。

## 验收标准

- Dashboard 左侧用户邮箱来自后端真实字段，不再由前端拼接。
- `USER INFORMATION` 不再显示写死 mock 值。
- `BASE / POSITION` 能显示当前登录用户真实数据。
- 缺失字段显示 `-` 或约定 fallback，不显示误导性旧 mock。
- 相关 contract、后端 route/service、前端 service/hook/mapper 和测试同步更新。
- 不新增未经评审的依赖。
- 不修改数据库 schema。
- 不记录敏感用户资料到浏览器 console。

## 关键假设

- `pbs_user.email/base/rank/division` 已通过同步脚本保持可用。
- `rank` 可以作为当前 UI 的 `POSITION` 第一阶段展示值。
- 第一阶段允许 `fleet/language/seniority/status/existing credit/training month` 先显示 `-`，不继续显示 mock。
- 第二阶段再确认完整 live profile 口径。

## 待确认问题

最关键的问题：

- 第一阶段是否接受只接入稳定字段，并把暂未确定口径的字段显示为 `-`？

如果不接受，则实现前必须先确认以下字段口径：

- `SENIORITY` 的显示含义。
- `STATUS` 的组合规则。
- `EXISTING CREDIT` 对应哪个 bid month 和哪张 manday 表。
- `TRAINING MONTH` 的数据来源。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 第一阶段改动虽然跨前后端，但范围集中在 Dashboard profile contract、一个后端读取接口、一个前端查询/mapper 和对应测试。拆成多 agent 容易在 contract 字段和 fallback 语义上产生重复协调成本。
- Suggested split: 暂不拆分。
- Write boundaries: 预计涉及 `packages/contracts`、`pbs-server/src/routes`、`pbs-server/src/services`、`pbs-portal/src/features/dashboard`、`pbs-portal/src/shared/services`、测试文件和 QA 文档。
- Conflict risk: 中等，主要风险是 auth session 与 Dashboard profile 契约边界不清。
- Execution gate: 用户确认本 spec 后再进入 implementation plan 和代码实现。

## 实施门禁

Above is my understanding of the requirement/spec. Please confirm, and I will implement after your approval.
