# ROIS-AI 安全审计第三阶段修复设计

日期：2026-07-07
阶段：Phase 3 / P2 输入输出安全
范围：`pbs-server`、`live-server`、PBS crew bid import、算法导出 CSV、PBS crew search 权限
总路线参考：`docs/superpowers/plans/2026-07-07-security-audit-remediation-roadmap.md`
上一阶段参考：`docs/superpowers/specs/2026-07-07-security-audit-phase-2-session-auth-hardening-design.md`

## 背景

第一阶段已经处理 WebSocket 鉴权、登录页明文测试密码和生产依赖审计；第二阶段已经处理 JWT `token_version`、logout 撤销、登录枚举风险和 PBS SSO URL token 短期缓解。

第三阶段处理输入输出边界。当前主要风险集中在三类路径：

1. Crew bid import 上传 `.txt` 文件时只限制大小，缺少扩展名、MIME、UTF-8 和格式前置校验。
2. 算法导出 CSV 当前只处理引号、逗号和换行，缺少 Excel 公式注入防护。
3. PBS crew autocomplete / crew search 可被普通认证用户用于横向枚举人员信息。

本阶段目标是先在不改变核心业务模型的前提下，把导入、导出、搜索这三个边界收紧到审计可解释状态。

## 目标

1. `pbs-server` 与 `live-server` 的 crew bid import 上传入口统一校验文件名、扩展名、MIME、UTF-8 和最小业务格式。
2. 非 `.txt`、明显二进制、非 UTF-8、空文件、缺少 crew bid 基本结构的上传应在进入 import service 前被拒绝。
3. 建立统一 CSV cell escape 规则，防止 Excel / LibreOffice 将导出字段当公式执行。
4. 替换 `pbs-server` 与 `live-server` 算法导出中的局部 CSV escape 实现，保持 CSV 列顺序与现有输出兼容。
5. 收敛 PBS crew search 权限：普通用户默认只可搜索本人和同 `base + division` 范围内人员；admin 可全量搜索。
6. 覆盖自动化回归测试，并补 PBS auth / import / export / search 的手工 QA 说明。

## 非目标

- 不在本阶段引入 AV 扫描服务或隔离队列；如部署环境要求，后续单独接入。
- 不把 crew bid import 改成完整 streaming parser；当前仍沿用 multipart size limit 和现有 parser。
- 不改变 crew bid import 的业务解析、dry-run、confirm、rollback 语义。
- 不改变算法导出包结构、文件名、CSV 列名或字段顺序。
- 不重做 PBS Portal 搜索 UI。
- 不处理 Gantt Vite host allowlist、iframe allowlist、`dangerouslySetInnerHTML` 或 HttpOnly Cookie；这些属于后续前端部署与长期治理阶段。
- 不写入真实账号、密码、token、数据库连接串或生产样例数据。

## 当前问题确认

### 1. Crew bid import 上传校验不足

当前事实：

- `pbs-server/src/routes/crew-bid-imports.ts` 中 `readMultipartImportRequest` 对上传文件执行 `part.toBuffer()` 后直接 `fileBuffer.toString("utf8")`。
- `live-server/src/routes/admin/pbs-crew-bid-imports.ts` 有几乎相同的逻辑。
- 两个入口都限制 `files: 1`、`fileSize: 25 * 1024 * 1024`，但没有校验：
  - 文件扩展名。
  - MIME / content type。
  - UTF-8 是否有效。
  - 是否含 NUL / 明显二进制内容。
  - 是否包含 crew bid report 的基本结构。

风险：

- 非文本或伪装文件会进入业务 parser。
- `Buffer.toString("utf8")` 会用替换字符吞掉非法字节，无法明确拒绝坏编码。
- 恶意或错误文件会消耗后续解析、DB dry-run、问题记录资源。

### 2. CSV / Excel 公式注入

当前事实：

- `pbs-server/src/services/algorithm-export/days-off-export.ts`
- `pbs-server/src/services/algorithm-export/pairing-score-export.ts`
- `pbs-server/src/services/algorithm-export/line-rules-csv.ts`
- `live-server/src/services/algorithm-export/days-off-export.ts`
- `live-server/src/services/algorithm-export/pairing-score-export.ts`
- `live-server/src/services/algorithm-export/line-rules-csv.ts`

这些文件各自有局部 `escapeCsvCell`，主要处理 CSV 结构字符，没有统一处理 Excel 公式前缀。

风险：

- 字段值以 `=`、`+`、`-`、`@` 开头时，Excel 打开 CSV 可能按公式执行。
- 如果未来用户可控字段进入导出包，攻击面会扩大。

### 3. PBS crew search 横向枚举

当前事实：

- `pbs-server/src/routes/pairing-search.ts` 的 `/pairing-search/crew-ids` 调用 `pairingSearchService.searchCrewIds`。
- `pbs-server/src/services/pairing-search/pairing-search-service.ts` 当前 `searchCrewIds(_actor, request)` 忽略 actor。
- `pbs-server/src/services/pairing-search/crew-id-search-query.ts` 直接从 live `crew` 表搜索全员。
- `pbs-server/src/routes/pbs-users.ts` 的 `/pbs-users/crew-options` 调用 `pbsUserService.searchCrewOptions(parsed.data)`，没有传入 actor。
- `pbs-server/src/services/pbs-user/pbs-user-service.ts` 从 `pbs_user` 返回 `crewId/userCode/userName/base/rank/division`，普通认证用户可枚举活跃 crew。

风险：

- 普通 PBS Portal 用户可通过 autocomplete 枚举不应看到的人员资料。
- 两个 crew 搜索入口口径不一致，修一个不修另一个会留下旁路。

## 方案比较

### 方案 A：只在 route 上补最小校验

做法：

- 在两个 import route 内直接写扩展名、MIME、UTF-8 和格式判断。
- CSV 和 crew search 分别局部修。

优点：

- 改动最小。
- 不需要新 helper。

缺点：

- `pbs-server` / `live-server` 已有重复实现，继续复制会增加漂移风险。
- CSV escape 也会继续多处散落。
- 后续新增导入/导出路径容易漏掉安全规则。

结论：不推荐作为主方案。

### 方案 B：模块内统一 helper，保持业务边界不变（推荐）

做法：

- 在 `pbs-server` 与 `live-server` 各自模块内新增小型安全 helper：
  - crew bid import upload validation helper。
  - algorithm export CSV cell escape helper。
  - PBS crew search scope helper。
- 两个服务保持现有部署和依赖边界，不强行抽共享包。
- 用相同测试样例约束两个模块的行为一致性。

优点：

- 改动边界清晰。
- 不引入新依赖。
- 适合当前 `pbs-server` / `live-server` 已经存在相似代码但未完全共享的现状。
- 后续如要抽成共享 package，有明确候选 helper。

缺点：

- 两个模块仍有少量重复 helper。
- 需要靠测试和文档保持规则一致。

结论：本阶段采用方案 B。

### 方案 C：一次性引入共享安全包 + streaming parser + AV

做法：

- 新增跨模块安全 package。
- 上传改 streaming 解析，接入 AV / EICAR 扫描。
- 所有导入导出统一走共享包。

优点：

- 长期治理最完整。
- 可扩展到更多上传/导出路径。

缺点：

- 影响范围过大。
- 需要部署扫描服务或外部依赖确认。
- 容易把第三阶段从安全收敛扩大成平台改造。

结论：作为后续长期方向，不进入本阶段。

## 修复设计

### A. Crew bid import 文件安全

#### A1. 校验入口

覆盖两个入口：

- `pbs-server/src/routes/crew-bid-imports.ts`
- `live-server/src/routes/admin/pbs-crew-bid-imports.ts`

在 `part.toBuffer()` 后、写入 `sourceText` 前执行统一校验：

1. 校验 multipart field name 必须为 `file`。
2. 校验原始文件名存在且扩展名为 `.txt`，大小写不敏感。
3. 校验 MIME：
   - 允许 `text/plain`。
   - 允许浏览器或测试环境常见的 `application/octet-stream`。
   - 如果 MIME 缺失但扩展名合法，可继续走内容校验。
   - 明确拒绝 `image/*`、`application/zip`、`application/gzip`、`application/pdf`、`application/x-msdownload` 等非文本类型。
4. 校验 UTF-8：
   - 使用 `new TextDecoder("utf-8", { fatal: true })` 或等价方式。
   - 非 UTF-8 字节直接返回 400。
   - 去除 UTF-8 BOM。
5. 校验明显二进制：
   - 拒绝包含 NUL 字符的文本。
   - 拒绝控制字符比例异常的文本；保留 `\r`、`\n`、`\t`。
6. 校验最小业务结构：
   - 至少存在 `Period:` 行。
   - 至少存在一行匹配 `Seniority <num> Category <value> Employee # <value>`。
   - 至少存在 `Default Bid` 或 `Current Bid`。

#### A2. 错误响应

保持现有 response envelope，不暴露 parser 内部细节：

- 非 multipart：沿用 `Crew bid import requires multipart/form-data with a file field.`
- 字段名错误：沿用 `Crew bid import file must use form field name file.`
- 超大小：沿用 `Crew bid import file is too large.`
- 扩展名错误：`Crew bid import file must be a .txt file.`
- MIME 错误：`Crew bid import file type is not allowed.`
- 编码错误：`Crew bid import file must be valid UTF-8 text.`
- 二进制/格式错误：`Crew bid import file format is invalid.`

#### A3. 测试要求

`pbs-server/src/routes/crew-bid-imports.test.ts` 和 `live-server` 对应 admin route tests 需要覆盖：

- 合法 `.txt` dry-run 仍成功。
- `.csv` / `.zip` / `.pdf` 文件被拒绝。
- 非 UTF-8 buffer 被拒绝。
- 含 NUL 字节被拒绝。
- 缺少 `Period:` 或 crew header 的文本被拒绝。
- 超大文件仍返回原有明确错误。

### B. CSV / Excel 公式注入防护

#### B1. 统一规则

新增 module-local CSV helper，例如：

- `pbs-server/src/services/algorithm-export/csv.ts`
- `live-server/src/services/algorithm-export/csv.ts`

建议 API：

```ts
export const escapeCsvCell = (value: string | number | null | undefined): string
```

规则：

1. `null` / `undefined` 输出空字符串。
2. `number` 直接按字符串输出，不做公式前缀处理。
3. `string` 先保持原始内容，不 trim。
4. 如果字符串第一个有效字符可能触发公式，前置单引号 `'`：
   - `=`
   - `+`
   - `-`
   - `@`
   - 制表符或回车换行开头
   - 前导空白后出现上述公式字符
5. CSV 结构转义继续保持：
   - 包含 `"`、`,`、`\r`、`\n` 的字段用双引号包裹。
   - 字段中的 `"` 变成 `""`。

#### B2. 替换范围

替换以下局部 `escapeCsvCell`：

- `pbs-server/src/services/algorithm-export/days-off-export.ts`
- `pbs-server/src/services/algorithm-export/pairing-score-export.ts`
- `pbs-server/src/services/algorithm-export/line-rules-csv.ts`
- `live-server/src/services/algorithm-export/days-off-export.ts`
- `live-server/src/services/algorithm-export/pairing-score-export.ts`
- `live-server/src/services/algorithm-export/line-rules-csv.ts`

不改变：

- CSV header。
- 行排序。
- 字段顺序。
- tar/gzip 包结构。

#### B3. 测试要求

新增或更新测试覆盖：

- `=cmd|'/C calc'!A0` 输出为 `'=cmd|'/C calc'!A0` 或等价安全前缀。
- `+1+1`、`-1+1`、`@SUM(1,1)` 均被前置安全前缀。
- `  =SUM(1,1)` 也被前置安全前缀。
- 普通文本、逗号、引号、换行仍按 CSV 规则输出。
- 数字 `-1` 如果以 number 类型传入，不被当作公式字符串处理。

### C. PBS crew search 权限收敛

#### C1. 权限口径

默认业务口径：

- Admin 用户：可搜索全量活跃 crew。
- 普通 PBS 用户：
  - 可搜索本人。
  - 可搜索同 `base + division` 的活跃 crew。
  - 若当前用户缺少 `base` 或 `division`，只返回本人。

理由：

- 比全员枚举更安全。
- 比“只能本人”更少破坏 Pairing / DaysOff 中涉及其他 crew 的 bid autocomplete。
- 与 reserve coverage 等现有 PBS 逻辑常用的 `base/division` scoping 更一致。

需要用户确认的业务点：

- 如果 PBS Portal 普通用户确实必须跨 base 或跨 division 搜索全员，应在实现前明确写入例外规则，并考虑 audit log / rate limit / 更少字段返回。

#### C2. 覆盖入口

必须同时覆盖：

- `/api/pairing-search/crew-ids`
  - route：`pbs-server/src/routes/pairing-search.ts`
  - service：`pbs-server/src/services/pairing-search/pairing-search-service.ts`
  - query helper：`pbs-server/src/services/pairing-search/crew-id-search-query.ts`
- `/api/pbs-users/crew-options`
  - route：`pbs-server/src/routes/pbs-users.ts`
  - service：`pbs-server/src/services/pbs-user/pbs-user-service.ts`

#### C3. Actor scope 解析

建议新增 `resolvePbsCrewSearchScope` helper：

输入：

- `authUser.employeeNo`
- `authUser.userCode`
- `authUser.isAdmin`

输出：

```ts
type PbsCrewSearchScope =
  | { kind: "admin" }
  | { kind: "base_division"; crewId: string; base: string; division: string }
  | { kind: "self"; crewId: string }
```

解析规则：

- `isAdmin === true`：`admin`。
- 非 admin：从 `pbs_user` 读取当前用户 `crew_id/base/division/status/eff_dt/exp_dt`。
- 当前用户不存在、禁用、过期：返回 `self` 或拒绝 403。推荐复用第二阶段 auth hook 后，route 内只需要处理 scope 缺失为 `self`。
- `base` 或 `division` 缺失：`self`。
- 有完整 `base + division`：`base_division`。

#### C4. SQL 过滤

`/pairing-search/crew-ids` 当前查 live `crew` 表。普通用户 scoping 需要增加 join 或子查询来限制 crew 范围：

- `admin`：保持当前全量活跃 crew 搜索。
- `base_division`：只搜索同 base + division crew。
- `self`：只搜索当前 `crewId`。

`/pbs-users/crew-options` 当前查 `pbs_user`，直接在 where 增加：

- `admin`：保持当前 active 条件。
- `base_division`：`pu.base = actor.base and pu.division = actor.division`，并允许本人。
- `self`：`pu.crew_id = actor.crewId`。

#### C5. 返回字段

本阶段保持现有 contracts：

- `/pairing-search/crew-ids`：`crewId/firstName/lastName`
- `/pbs-users/crew-options`：`crewId/userCode/userName/base/rank/division`

不新增字段。

如果后续审计要求进一步最小化普通用户返回字段，可单独设计 contract 变更。

#### C6. 测试要求

需要覆盖：

- Admin 可搜索不同 base/division。
- 普通用户只能看到同 base/division 和本人。
- 普通用户缺少 base/division 时只看到本人。
- 查询为空仍返回空 options。
- limit clamp 行为不回归。
- Pairing employee schedule preference autocomplete 使用路径不回归。

## 实施范围

### 需要修改的主要文件

PBS Server：

- `pbs-server/src/routes/crew-bid-imports.ts`
- `pbs-server/src/routes/crew-bid-imports.test.ts`
- `pbs-server/src/services/algorithm-export/*.ts`
- `pbs-server/src/services/algorithm-export/*.test.ts`
- `pbs-server/src/routes/pairing-search.ts`
- `pbs-server/src/services/pairing-search/*`
- `pbs-server/src/routes/pairing-search.test.ts`
- `pbs-server/src/routes/pbs-users.ts`
- `pbs-server/src/services/pbs-user/*`
- `pbs-server/src/routes/pbs-users.test.ts`

Live Server：

- `live-server/src/routes/admin/pbs-crew-bid-imports.ts`
- `live-server/src/services/algorithm-export/*.ts`
- `live-server/src/services/algorithm-export/*.test.ts`
- `live-server/src/services/crew-bid-import/__tests__/*`（如需要补 import 流程测试）

文档：

- `docs/test-cases/pbs/auth/` 或 `docs/test-cases/pbs/import/` 下新增本阶段手工 QA 文档。

### 版本号

本阶段会触及后端代码：

- `gantt/src/version.ts`：`BACKEND_VERSION +1`
- 若改动 PBS Server：`PBS_BACKEND_VERSION +1`
- 若不改 PBS Portal 前端：`PBS_FRONTEND_VERSION` 不递增

## 验收标准

### 自动化验收

至少运行：

```bash
cd pbs-server && node --import tsx --test src/routes/crew-bid-imports.test.ts src/routes/pairing-search.test.ts src/routes/pbs-users.test.ts
cd pbs-server && node --import tsx --test src/services/algorithm-export/days-off-export.test.ts src/services/algorithm-export/pairing-score-export.test.ts src/services/algorithm-export/line-rules-export.test.ts
cd pbs-server && pnpm build

cd live-server && pnpm vitest run src/services/algorithm-export/algorithm-export-service.test.ts src/services/algorithm-export/line-rules-export.test.ts src/routes/admin/pbs-crew-bid-imports.test.ts
cd live-server && pnpm build
```

如果某个 live-server route test 当前不存在，实施时应补一个 focused route test，不能只靠 service test。

### 手工 QA

1. 上传合法 `CLASS-BidsReport_*.txt`，dry-run 和 confirm 均不回归。
2. 上传 `.zip`、`.pdf`、非 UTF-8、缺少 crew header 的 `.txt`，均返回明确 400。
3. 下载算法导出包，确认 `DAYSOFF.csv`、`PAIRING_SCORE.csv`、`LINE_RULES.csv` 列顺序不变。
4. 用含公式前缀的测试数据导出 CSV，Excel 打开后不执行公式。
5. 普通 PBS 用户 autocomplete 不再看到其他 base/division 的 crew。
6. Admin 账号仍可搜索全量必要 crew。

## 风险与缓解

- **业务口径风险**：普通 crew 是否允许全员搜索需要确认。默认收敛为同 `base + division`，实现前如业务不同需调整。
- **重复实现风险**：`pbs-server` / `live-server` 仍各有一套 helper。用同名测试样例降低漂移，后续可抽共享 package。
- **导出兼容风险**：给公式前缀加 `'` 会改变危险字符串的可见值。该行为是安全要求，且只影响风险前缀字符串。
- **MIME 兼容风险**：不同浏览器上传 `.txt` 可能给 `text/plain`、`application/octet-stream` 或空 MIME。设计允许这些情况，但仍以扩展名和内容校验为主。
- **性能风险**：UTF-8 和格式 precheck 在 25MB 限制内可接受；不做全量复杂解析，只做低成本正则扫描。

## Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: 本阶段可拆成上传校验、CSV 导出、crew search 权限三条相对独立的工作流；测试边界清晰。
- Suggested split:
  - Agent A：`pbs-server` / `live-server` crew bid import 上传校验与 route tests。
  - Agent B：`pbs-server` / `live-server` algorithm export CSV helper 与 export tests。
  - Agent C：`pbs-server` crew search scope helper、routes/services/tests。
- Write boundaries:
  - Agent A 只写 import routes、import helper、import tests。
  - Agent B 只写 algorithm-export helper、export files、export tests。
  - Agent C 只写 pbs crew search / pbs-user search 相关文件和 tests。
  - 主 agent 统一版本号、QA 文档、最终 build/test 集成。
- Conflict risk: Medium
  - `pbs-server` 测试和版本号会有交叉。
  - `algorithm-export` 两个模块存在重复文件，需要主 agent 审阅一致性。
- Execution gate:
  - 本 spec 经用户确认后再进入实现。
  - 若启用多 agent，开始前明确每个 agent 的文件写入边界。

## 待确认

实现前唯一需要确认的业务口径：

- 普通 PBS Portal 用户的 crew autocomplete 是否接受默认限制为“本人 + 同 base + division”？

如果确认该口径，本阶段即可进入实现；如果业务必须全员搜索，需要在实现前明确例外理由和替代控制（例如只返回 `crewId`、增加 rate limit 或审计日志）。
