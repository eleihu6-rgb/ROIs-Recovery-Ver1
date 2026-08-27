# Playwright E2E 测试说明

> ROIS 项目前端端到端测试规范，覆盖 gantt、pbs-portal、pbs-app 三个项目。

## 测试 ID 命名规范（强制）

每个 Playwright 测试标题必须以**全局唯一**的 `Prefix-NNNN` 前缀开头（按 tab/功能域分配千位段），便于在 Regression 管理台按域分组与追踪：

| 前缀 | 段位 | 功能域 |
|------|------|--------|
| `Live-` | 1xxx | Live（Gantt 排班主视图） |
| `Scen-` | 2xxx | Scenario |
| `PBS-`  | 3xxx | PBS portal / app |
| `Perf-` | 4xxx | 性能基准 |
| `Data-` | 5xxx | Data tab（基础数据维护：Assignment、Crew Master 等） |
| `Legal-` | 6xxx | Legality tab（旧法规 ruleset 103 / PBS Solver Ruleset 参数查看） |
| `Rule-` | 3xxx | Rule engine（法规引擎跨窗口校验，如 8002/006 MAX_CUM_BLOCK 28/100/200 天累积窗口） |

> ID 只增不复用；同一前缀内编号唯一。新增 Data tab 测试用 `Data-5xxx`（如 `Data-5020`）；新增 Legality tab 测试用 `Legal-6xxx`；新增 Rule engine 跨窗口校验用 `Rule-3xxx`（如 `Rule-3001`）。
>
> 注：`Rule-3xxx` 与 `PBS-3xxx` 共用千位段 3xxx 但前缀不同——本仓库要求「`Prefix-NNNN` 全局唯一」，前缀本身区分功能域，故 `Rule-3001` 与任何 `PBS-3xxx` 不冲突。
>
> 已分配 PBS 子段：`PBS-33xx` = NPBS-Legend 机组 bids 模拟（`tests/pbs-portal/npbs-crew-bids-simulation.spec.ts`，每个机组一条，`PBS-3301`…）。回放 legacy NPBS 导出的机组 bids 到 portal UI，详见 `docs/modules/pbs/npbs-bids-simulation-playbook.md` 与 skill `108-npbs-bids-portal-simulation`。
>
> 已分配 PBS 子段：`PBS-34xx` = 场景专属机组 bids 包（`tests/gantt/scenario-scoped-crew-bids.spec.ts`，`PBS-3401`/`PBS-3402`）。验证 kick-off 时 pbs-server `algorithm-export/scenario-package` 按场景 crew 范围生成 solver 偏好 CSV（而非写死的 YEG-14），用 scenario 537（26 crew，含 274/499）与 yeg-14 对比。
> `PBS-3325` = Employee `19` 当前月份专项 bid 回放（`tests/pbs-portal/npbs-employee-19-current-month-bid.spec.ts`）。以 legacy March 2026 / Feb confirmation 记录为来源证据，但按当前 portal RP（当前测试环境为 June 2026）清空并重放 5 个 T1-T5 来源条件；其中 T5 来源条件拆成两条普通 T5 UI bid。
>
> `PBS-3510` = OR seniority `PAIRING_SCORE.csv` Portal 回放（`tests/pbs-portal/or-seniority-pairing-score-replay.spec.ts`）。把结果文件中的 crew `247,274,383,499,536` 按 crew+tier 聚合成 8 条 `Pairing Number` specific-date bid，经真实 Portal UI 清空 Days Off / Pairing 后重录。

## 目录

- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [两套独立认证系统](#两套独立认证系统)
- [快速开始](#快速开始)
- [运行测试](#运行测试)
- [编写测试](#编写测试)
- [认证机制详解](#认证机制详解)
- [Page Object 规范](#page-object-规范)
- [测试数据与工具](#测试数据与工具)
- [CI/CD 集成](#cicd-集成)
- [常见问题](#常见问题)

---

## 技术栈

| 组件 | 版本 |
|------|------|
| Playwright | ^1.59.1 |
| TypeScript | ES2022 target |
| 模块系统 | ES Modules |
| 断言 | Playwright built-in expect |
| 报告格式 | HTML + JUnit XML |

---

## 项目结构

```
e2e/
├── config/
│   └── playwright.config.ts          # 主配置（多项目、双认证、独立 storageState）
├── fixtures/                          # 认证夹具（按项目隔离）
│   ├── shared/
│   │   └── timezone.fixture.ts        # 共享时区工具
│   ├── gantt/
│   │   └── auth.fixture.ts            # Gantt 独立登录 fixture
│   └── pbs/
│       └── auth.fixture.ts            # PBS 共享登录 fixture
├── pages/                             # Page Object Models
│   ├── shared/
│   │   └── global.modal.ts            # 通用弹窗组件
│   ├── gantt/
│   │   ├── gantt-login-page.ts        # Gantt 登录页
│   │   └── gantt-dashboard-page.ts    # Gantt 主面板
│   ├── pbs-portal/
│   │   ├── pbs-login-page.ts          # PBS Portal 登录页
│   │   └── pbs-dashboard-page.ts      # PBS Portal 主页
│   └── pbs-app/
│       └── pbs-app-page.ts            # PBS App 移动端页面对象
├── tests/                             # 测试用例（按项目隔离）
│   ├── gantt/
│   │   ├── auth.setup.ts              # Gantt 预登录（生成 storageState）
│   │   ├── auth.spec.ts               # 登录功能测试
│   │   ├── pairing-pane.spec.ts       # Pairing Pane 渲染与交互
│   │   └── roster-pane.spec.ts        # Roster Pane 测试
│   ├── pbs-portal/
│   │   ├── auth.setup.ts              # PBS 预登录（Portal & App 共享）
│   │   ├── auth.spec.ts               # PBS 登录功能测试
│   │   └── schedule.spec.ts           # PBS 排班视图测试
│   └── pbs-app/
│       ├── auth.setup.ts              # PBS App 认证占位
│       └── home.spec.ts               # PBS App 首页测试
├── utils/                             # 工具库
│   ├── gantt/
│   │   └── api.ts                     # Gantt API 辅助（独立认证）
│   ├── pbs/
│   │   └── api.ts                     # PBS API 辅助（共享认证）
│   ├── db-helper.ts                   # PostgreSQL 数据库辅助
│   └── test-data.ts                   # 测试数据生成器
├── results/                           # 运行产物（不提交）
│   ├── .auth/                         # 认证状态文件（per-auth-system）
│   ├── html-report/                   # HTML 测试报告
│   └── test-results/                  # 测试截图/录像
├── .env.example                       # 环境变量模板
├── .gitignore
└── package.json                       # 运行脚本
```

---

## 两套独立认证系统

Gantt 和 PBS 是 **完全隔离** 的认证体系，互不影响：

| 维度 | Gantt | PBS（Portal + App） |
|------|-------|---------------------|
| **后端** | live-server（端口 3000） | pbs-server（端口 3002） |
| **登录 API** | `POST /api/auth/login` | `POST /auth/session` |
| **Token 存储** | `sessionStorage['rois-auth']` | `localStorage['auth-token']` |
| **Auth State 文件** | `results/.auth/gantt-admin.json` | `results/.auth/pbs-admin.json` |
| **Playwright Project** | `gantt` + `gantt-setup` | `pbs-portal` + `pbs-app` + `pbs-setup` |
| **环境变量前缀** | `GANTT_*` | `PBS_*` |

**核心原则：**
- 每个认证系统有独立的 `*.setup.ts` 文件，运行一次登录并保存 `storageState`
- 项目测试通过 `storageState` 配置项加载对应认证状态
- Gantt 和 PBS 的 storageState 文件路径不同，绝不混用

---

## 快速开始

### 1. 安装依赖

```bash
cd e2e
npm install
npx playwright install --with-deps chromium
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，按需修改 URL 和测试账号
```

默认配置：

```env
GANTT_BASE_URL=http://localhost:5173
GANTT_API_URL=http://localhost:3000
PBS_PORTAL_BASE_URL=http://localhost:5174
PBS_API_URL=http://localhost:3002
GANTT_TEST_USER=admin
GANTT_TEST_PASS=123456
PBS_TEST_USER=admin
PBS_TEST_PASS=123456
```

### 3. 启动前端服务

确保以下服务已运行（E2E 配置为 `reuseExistingServer: true`，不会自动重启）：

```bash
# Gantt
cd gantt && npm run dev          # → http://localhost:5173

# PBS Portal
cd pbs-portal && npm run dev     # → http://localhost:5174
```

### 4. 运行全部测试

```bash
npm test
```

---

## 运行测试

### 按项目运行

```bash
# 仅 Gantt
npm run test:gantt

# 仅 PBS Portal
npm run test:pbs-portal

# 仅 PBS App
npm run test:pbs-app
```

### 有头模式（可视化调试）

```bash
npm run test:gantt:headed
npm run test:pbs-portal:headed
npm run test:pbs-app:headed
```

### UI 模式（交互调试器）

```bash
npm run test:ui
```

### Smoke 测试

带有 `@smoke` 标签的核心用例：

```bash
npm run test:smoke
```

### 查看报告

```bash
npm run report
```

HTML 报告位于 `results/html-report/index.html`。

### 单文件/单用例

```bash
# 运行指定文件
npx playwright test tests/gantt/pairing-pane.spec.ts --config=config/playwright.config.ts

# 运行指定用例（匹配名称）
npx playwright test --grep "should scroll" --config=config/playwright.config.ts
```

---

## 编写测试

### 新建项目测试

1. 在 `tests/<project>/` 下创建 `.spec.ts` 文件
2. 使用 `@playwright/test` 的 `test` 和 `expect`
3. 优先使用 Page Object，不要直接操作 locators

### 标准模板

```typescript
import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'

test.describe('Feature Name', () => {
  let page: GanttDashboardPage

  test.beforeEach(async ({ page: pg }) => {
    page = new GanttDashboardPage(pg)
    await page.goto()
  })

  test('should do something @smoke', async () => {
    await expect(page.ganttCanvas).toBeVisible()
  })
})
```

### 标签规范

- `@smoke` — 核心路径必过用例
- `@critical` — 关键业务流程
- `@wip` — 正在开发中

### 命名约定

- 文件：`<feature>.spec.ts`
- 用例描述：`should + 动词 + 预期结果`
  - ✅ `should login successfully with valid credentials`
  - ✅ `should show error with invalid credentials`
  - ❌ `test 1`、`login test`

---

## 认证机制详解

### Auth Setup 流程

每个认证系统的 `*.setup.ts` 执行以下操作：

```
1. 调用后端 API 登录（POST /api/auth/login 或 POST /auth/session）
2. 获取 JWT token
3. 通过 page.addInitScript() 预注入 token 到浏览器存储
4. 导航到前端页面确认认证生效
5. 调用 page.context().storageState({ path }) 保存认证状态
6. 后续测试通过 storageState 配置项复用此状态
```

### 文件映射

| Setup 文件 | 输出文件 | 使用此文件的项目 |
|-----------|---------|----------------|
| `tests/gantt/auth.setup.ts` | `results/.auth/gantt-admin.json` | `gantt` |
| `tests/pbs-portal/auth.setup.ts` | `results/.auth/pbs-admin.json` | `pbs-portal`, `pbs-app` |

### 依赖关系

```
gantt-setup → gantt（所有 gantt tests）
pbs-setup → pbs-portal（所有 pbs-portal tests）
          → pbs-app（所有 pbs-app tests）
```

### Fixture 方式（不通过 setup）

如果需要运行时动态登录（而非预保存状态），使用 fixture：

```typescript
import { ganttAuthTest } from '../../fixtures/gantt/auth.fixture'

ganttAuthTest('dynamic login test', async ({ page, ganttLogin }) => {
  const token = await ganttLogin()
  // token 已注入，页面已认证
})
```

---

## Page Object 规范

### 基本原则

1. **每个页面对应一个 Page Object 类**
2. **构造函数接收 `page`**
3. **Locators 作为 getter 属性**
4. **Actions 作为 async 方法**
5. **Assertions 作为 `expect*` 方法**

### 标准结构

```typescript
import { type Page, type Locator, expect } from '@playwright/test'

export class MyPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  // ─── Locators ────────────────────────────────────────────────────────
  get submitButton(): Locator { return this.page.getByTestId('submit-btn') }
  get errorMessage(): Locator { return this.page.getByTestId('error-msg') }

  // ─── Actions ─────────────────────────────────────────────────────────
  async goto(): Promise<void> {
    await this.page.goto('/')
  }

  async submit(): Promise<void> {
    await this.submitButton.click()
  }

  // ─── Assertions ──────────────────────────────────────────────────────
  async expectLoaded(): Promise<void> {
    await expect(this.submitButton).toBeVisible()
  }
}
```

### Locator 优先级

1. `getByTestId()` — 首选（`data-testid` 属性，最稳定）
2. `getByRole()` — 语义化元素（按钮、链接、对话框）
3. `getByText()` — 文本内容（需谨慎，可能随 i18n 变化）
4. `locator()` — CSS/XPath（最后手段）

### data-testid 命名规范

```
<项目前缀>-<组件/区域>-<用途>

示例：
gantt-canvas
login-user-code
login-sign-in
pbs-login-password
pbs-apply-btn
timezone-switcher
refresh-btn
```

---

## 测试数据与工具

### 数据生成器

```typescript
import { createTestCrew, createTestPairing, testId, TEST_ACCOUNTS } from '../../utils/test-data'

const crew = createTestCrew({ rank: 'FO', base: 'YYZ' })
const pairing = createTestPairing({ fleet: 'B738' })
const uniqueName = testId('test-pairing')
```

### API 辅助

```typescript
// Gantt API（独立认证）
import { createAuthenticatedGanttApi } from '../../utils/gantt/api'

const api = await createAuthenticatedGanttApi(request, ganttApiUrl, user, pass)
const crews = await api.getCrewList({ page: '1' })
const detail = await api.getCrewDetail(crewId)

// PBS API（共享认证）
import { createAuthenticatedPbsApi } from '../../utils/pbs/api'

const pbsApi = await createAuthenticatedPbsApi(request, pbsApiUrl, user, pass)
const pairings = await pbsApi.getPairings()
```

### 数据库辅助

```typescript
import { createDbHelper } from '../../utils/db-helper'

const db = await createDbHelper({ schema: 'f8' })
const rows = await db.query('SELECT * FROM crew WHERE user_code = $1', ['admin'])
await db.close()
```

> 注意：数据库辅助需要安装 `pg` 包（`npm install --save-dev pg`），或改用 `runDbQueryViaApi` 通过后端代理查询。

---

## CI/CD 集成

### GitHub Actions 示例

```yaml
name: E2E Tests
on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    env:
      GANTT_BASE_URL: http://localhost:5173
      PBS_PORTAL_BASE_URL: http://localhost:5174
      GANTT_API_URL: http://localhost:3000
      PBS_API_URL: http://localhost:3002
      GANTT_TEST_USER: ${{ secrets.E2E_GANTT_USER }}
      GANTT_TEST_PASS: ${{ secrets.E2E_GANTT_PASS }}
      PBS_TEST_USER: ${{ secrets.E2E_PBS_USER }}
      PBS_TEST_PASS: ${{ secrets.E2E_PBS_PASS }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with: { node-version: 20 }

      - name: Install E2E deps
        run: cd e2e && npm ci

      - name: Install browsers
        run: cd e2e && npx playwright install --with-deps chromium

      - name: Start Gantt
        run: cd gantt && npm run dev &

      - name: Start PBS Portal
        run: cd pbs-portal && npm run dev &

      - name: Wait for services
        run: |
          npx wait-on http://localhost:5173 http://localhost:5174 --timeout 60000

      - name: Run E2E tests
        run: cd e2e && npm test
        env: { CI: true }

      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: e2e/results/html-report/
```

---

## 常见问题

### Q: 测试报 401 未认证

**原因：** setup 未执行或 storageState 文件不存在/过期。

**解决：**
```bash
# 重新运行 setup
npx playwright test tests/gantt/auth.setup.ts --config=config/playwright.config.ts

# 检查文件是否存在
ls results/.auth/
```

### Q: Gantt 和 PBS 登录冲突

**不可能发生。** 两套认证系统：
- 使用不同的 API endpoint
- 使用不同的浏览器存储 key（`rois-auth` vs `auth-token`）
- 使用不同的 storageState 文件
- 在独立的 Playwright browser context 中运行

### Q: 如何跳过 webServer 启动

配置中已设置 `reuseExistingServer: true`，如果服务已在运行会自动跳过。确认服务在 `.env` 中配置的 URL 上可访问即可。

### Q: 如何调试单个测试

```bash
# 有头模式（可以看到浏览器）
npx playwright test --grep "should login" --config=config/playwright.config.ts --headed

# UI 模式（交互式）
npx playwright test --config=config/playwright.config.ts --ui

# 加调试日志
npx playwright test --config=config/playwright.config.ts --debug
```

### Q: 如何添加新的测试账号

在 `utils/test-data.ts` 的 `TEST_ACCOUNTS` 中添加：

```typescript
export const TEST_ACCOUNTS = {
  admin:  { userCode: 'admin',  password: '123456' },
  user01: { userCode: 'user01', password: '123456' },
  user02: { userCode: 'user02', password: '123456' },
  // 新增
  captain: { userCode: 'captain', password: '123456' },
} as const
```

### Q: results/.auth/ 文件需要提交吗？

**不需要。** 已在 `.gitignore` 中排除。这些文件包含 JWT token，不应提交到版本库。每次新克隆后首次运行测试会自动执行 setup 生成这些文件。
