# Testing Discipline — full rule text

> Detail for the Testing Discipline rules summarised in root `CLAUDE.md`. Rule names (§…) are canonical; this file holds the full requirements, tables, rationale and examples. Moved here 2026-09-12 (agent context optimization Ver2).
> Full text refreshed 2026-10-22 from the pre-router root `CLAUDE.md`; edit rules here, not in a second copy.

## 测试策略总览

| 模块 | 单元测试 | 集成测试 | E2E 测试 |
|------|---------|---------|---------|
| live-server | Vitest — service 业务逻辑 | Vitest — API + DB + **缓存一致性** | — |
| po-engine | pytest — 优化算法、约束验证 | — | — |
| ro-engine | pytest — 分配算法、约束校验 | — | — |
| pbs-server | Vitest — 申请校验、权限逻辑 | Vitest — API + DB + **缓存一致性** + 并发 | — |
| gantt | — | — | Playwright — UI 流程回归 |
| pbs-portal / pbs-app | — | — | Playwright — UI 流程回归 |

覆盖率目标：后端 ≥ 80%，集成测试 ≥ 70%，新功能必须附带测试用例。

## Testing Discipline（强制执行 — UI 变更硬性门禁）

### §Playwright-Required — every feature and every bug fix ships with a Playwright test

**Non-negotiable.** After implementing ANY feature OR fixing ANY bug that touches the UI (gantt / pbs-portal / pbs-app) — see §User-Operation-Playwright-Required below for the broader rule covering changes that affect a user operation even when the change itself is backend-only, a script, or a raw SQL/migration:

1. Write a Playwright e2e test under `e2e/tests/<module>/` (focused module tests apply to pure backend logic with no UI surface).
2. From `e2e/`, run `npx playwright test --config=config/playwright.config.ts --project=<module> tests/<module>/<your-test-file>.spec.ts --reporter=list`, selecting the touched area's actual config/project and environment.
3. All tests must pass before the work is considered done.

The Playwright and screenshot gates are shared; the target environment is developer-specific. Use the developer's configured `GANTT_BASE_URL` and corresponding backend environment. Keep personal URL preferences in user-level agent instructions, not shared project defaults. Verify that the chosen target serves the code under test, and report the actual URL with the validation receipt.

Minimum coverage per change type:

| Change type | Minimum coverage |
|---|---|
| New UI feature | Specific data visible; empty state vs. load failure distinguished; all interactive elements exercised |
| Bug fix | A regression test that would have caught the bug **before** the fix — not just a test that passes after it |
| New API endpoint (with UI) | 200 response shape asserted via UI action; error path handled gracefully |
| State / filter change | Correct items shown after filter; wrong items absent |
| Any change affecting a user operation, regardless of layer (backend logic, data/permission change, script, **raw SQL/migration**) | Real UI simulation of that operation as the affected user(s); user-visible outcome asserted, not status codes/DB flags — see §User-Operation-Playwright-Required |

Anti-patterns — do NOT write these:

| Anti-pattern | Correct replacement |
|---|---|
| `toBeVisible()` alone | `toContainText(specificValue)` or `toHaveCount(n)` |
| Single-step workflow test | 2+ sequential steps with intermediate assertions |
| "No error shown" as proof of success | Loader gone + correct data present + count matches |
| Test added after marking done | Write the test first, or alongside the code — never after |

File naming: `e2e/tests/<module>/<feature-name>.spec.ts`, named after the changed component or bug, e.g. `test('scenario list filters to PO only when PO sidebar item is active', ...)`.

### §User-Operation-Playwright-Required — any change touching a user operation must be validated by Playwright as a real user

**Non-negotiable, and scope is by effect, not by layer.** If a change affects anything a real user does or experiences in gantt / pbs-portal / pbs-app — logs in, clicks, filters, edits, assigns, gets a permission/role, hits a limit, sees data or an error — it must be validated end-to-end as that user, regardless of whether the change itself was frontend code, backend logic, a one-off script, or a raw SQL migration run directly against a database. "I only touched the DB / a script / the backend" is not an exemption.

1. Identify the concrete user operation the change affects (e.g. "Tiao logs in and sees the Live nav", "dispatcher filters flights by fleet", "crew member is reassigned off a pairing").
2. Write or extend a Playwright test that performs that operation through the **real UI** (§Simulate-User — real clicks/typing/navigation, no `request.post`/API-injection shortcut for the operation under test itself).
3. Assert the outcome a real user would actually see (correct data, correct permissions/menus, correct error message) — never a 200 status, a DB flag, or "no error thrown".
4. Run it and paste the PASS/FAIL result (§No-Illusion) before calling the change done.

**Why:** code/DB/API can look correct while the user path breaks (missing permission binding, timezone-sensitive `eff_dt`/`exp_dt`, stale cache, multi-step race).

### §Flight-Change-Ripple-Required — 航班时间变更必须验证对 pairing/roster 的连锁影响，禁止孤立处理（强制执行）

**Non-negotiable.** 航班不是孤立实体：`pairing` 由多个 `pairing_segment` 组成，`roster_flight` 是机组 × 航段的执行记录。航班的计划/实际时间发生变化（延误、提前、改期、取消）时，**同一 pairing 内的所有下游元素**（换乘 connection、layover、机组 rest、返回 base 的 duty 时间/checkout）都必须重新计算，同时**受影响机组的 roster KPI**（Credit / DP / FDP / rest 等积分与限制指标，参见 [[pairing-build-fresh-pairing-kpis-not-computed]]）也必须相应更新——绝不能只验证被改动的这一条 flight/segment/roster_flight 记录本身正确，也不能把它当作与 KPI 无关的孤立事件。

任何触碰航班时间变更的代码改动（延误录入、改期、取消、reschedule API、批量导入/seed 脚本、UI 拖拽调整时间）测试时必须：

1. 不能只断言被改动的那一条 flight/pairing_segment/roster_flight 记录时间正确——必须同时检查同一 pairing 内**全部下游元素**（不止紧邻的下一条 leg）的 connection/layover/rest/duty end 是否符合预期。
2. 必须检查受影响机组的 **roster KPI 是否同步更新**（Credit/DP/FDP 等）——若 KPI 因架构原因暂不随延误重算，测试要显式断言这一点并说明原因，而不是没测到。
3. 若下游确实需要重算，必须有测试证明重算**发生**且数值正确；若产品设计上确认**不**自动重算（需要人工确认/手动改派），测试要显式断言"下游未变"，而不是干脆没测到——沉默的空白不等于已验证的设计决策。
4. 新增/修改与航班时间相关的 Playwright/单元测试用例时，用例标题与断言范围要覆盖"对相邻 leg 与 KPI 的影响"，不能只孤立验证被改的那一条。

**Why:** 只测被改的单条记录，会漏掉换乘时间错误、法定休息不足、回基地时间错误、KPI 与延误脱节等连锁 bug。

### §Real-Business-Case-Test — 测试 fixture 必须是真实业务场景，禁止孤立/简化的合成数据（强制执行）

**Non-negotiable.** Playwright / 单元测试里构造的 pairing、roster、flight 等 fixture，必须是这个业务在生产中真实会出现的形状，不能为了"少写几行 setup"而简化成不代表真实场景的合成数据。

具体要求：

1. **Pairing fixture 必须是真实结构**：至少覆盖同一 duty 内多个 leg（≥2 flights）、从 base 出发再回到 base 的完整往返；单航段 pairing 在生产中几乎不存在（建造逻辑允许，但只是边界情况，不是典型 fixture）。
2. **航班/机场/机型组合必须真实可信**：优先复用已在库里验证过的真实航班号、真实航线（同一 base 进出）、真实机型/airline 搭配，避免捏造不存在的航班号或不符合 home-base 规则的航线组合。新增 fixture 前，先用只读查询（或已有 dry-run 接口，如 `POST /api/pairing/build`）验证该组合在真实规则下是合法的，而不是假设它合法。
3. **禁止为了让测试"更好写"而回避真实结构**：如果某个 cascade/规则本该在多航段 duty、跨 leg 影响下验证，就不能只用单航段简化掉这部分覆盖——单航段能测的东西，多航段测试大多数情况下也能覆盖，反过来不成立。
4. 与 [[pairing-build-fresh-pairing-kpis-not-computed]] 和 §Flight-Change-Ripple-Required 配合：真实的多航段 pairing fixture 才能验证"未改动的相邻 leg 保持不变"这类关键断言——单航段 fixture 天然测不出这类边界。

**Why:** 简化 fixture 的 PASS 只证明代码在不真实输入下工作。例：`flight-delay-pairing-roster-propagation.spec.ts` Scenario 2 从单航段改为 ET137/ET136（ADD→ASO→ADD）后，才补出"未改动的出港 leg 必须保持不变"断言。

### §Simulate-User — Playwright must drive the REAL UI

**Playwright must reproduce the real user experience — click the product's actual buttons, menus, and dialogs, and let the UI fire its own network calls.**

**禁止**让脚本直接 `fetch` / `request.post` 业务写接口来代替用户操作（即使浏览器开着）；「DB 层面已生效」不算成功标准。只读 seed/校验前置数据可以走 API，但被测的用户动作本身必须经 UI 完成；纯后端逻辑走 Vitest。若某个用户动作**还没有 UI 入口**，先把 UI 补上再测，不要写脚本直接调 API 假装功能可用。

### §No-Illusion — prove it, do not claim it

**Claims are worthless. The test output is the proof.** A feature is not working until a test proves it works; a bug is not fixed until a test proves it cannot recur. Never state "this should work" or "this looks correct" — run the test and paste the result.

Required after behavior changes: write/update the relevant test, run it with the module's actual configuration, and report the command and PASS/FAIL result. Every change affecting what a user does or sees requires real-UI Playwright validation and a visually inspected screenshot from the same run, regardless of implementation layer. Backend tests supplement this gate; only behavior with no user-operation impact may use focused module tests alone. Bug fixes require regression coverage, or an explicit explanation of why it was infeasible. PBS business changes also require considering manual cases under `docs/test-cases/pbs/`. Development-documentation-only changes need diff, path, and consistency checks rather than runtime tests; in-app Help and other user-visible content remain subject to the Playwright and screenshot gates. Report unrun required checks and remaining risk. Do not use tautological assertions or visibility alone as proof of correct behavior.

Verify actual outcomes, not just successful tool execution. Select checks for affected behavior, critical boundaries, and necessary integration paths; regression risks, complex logic, and contract changes need assertions capable of exposing errors. Once required checks pass, expand or repeat them only for new changes, failures, or unresolved concerns.

### §PW-Snapshot — every UI-related Playwright validation captures a screenshot, versioned per iteration

**A passing test is not enough — capture a screenshot in the same Playwright run as visible proof of what rendered.**

- Save under `docs/assets/screenshots/<module>/<feature-name>.png` (module = `gantt`/`pbs-portal`/`pbs-app`/etc., feature-name matches the changed component or spec).
- **Re-validation rounds never overwrite** earlier screenshots — suffix `-Ver<N>`, incrementing per round. The first capture may omit the suffix or start at `Ver1`; stay consistent within one feature's history.
- Capture via a Playwright script/test (`page.screenshot()` / `locator.screenshot()`), not a manual/out-of-band screenshot — it must come from the same automated run that proves the behavior, per §No-Illusion.
- After capturing, inspect the PNG before reporting done; confirm the intended element and state are visible.
  - **If the session's model accepts image input**, use the agent's image-viewing tool.
  - **If it does not** (`view_image` returns *"not allowed because you do not support image inputs"* — a **model capability** gate driven by the active model catalog, not a file or permission problem), you are still expected to inspect the capture. Use `node scripts/screenshot-review/review.mjs <png> --expect "<text you must see on screen>" --vision`:
    - `--vision` delegates a genuine visual read to a multimodal model on the same local gateway (`scripts/screenshot-review/vision.mjs`), covering colour/layout/rendering defects.
    - The same run OCRs the capture via native macOS Vision (no installs), measures it, and exits non-zero when the expected content is missing or the image is blank.
    - Use `--diff <previous-Ver.png>` to prove an iteration actually changed pixels, and where.
    - Report the sidecar paths (`<png>.review.txt`, `<png>.vision.txt`) and PASS/FAIL in the delivery report.
  - **Never claim a visual inspection you could not perform.** If neither path is available, say so explicitly and record the inspection as an unrun required check with the residual risk.
- Include the screenshot path alongside the exact Playwright command and PASS/FAIL result in the delivery report. This applies to every user-related validation, including backend/data changes verified through the UI, not only visual styling changes.

### §Stale-Test — update it, never just report it

**If a test is stale (asserts a DOM/API/behavior that no longer exists because the code was legitimately refactored), UPDATE it to validate the current implementation — same intent, new selectors/endpoints/assertions. Do not ask first, do not skip it, do not leave it red.** Then run it and paste the PASS receipt (§No-Illusion).

Stale = selector/route/field renamed but the feature still exists, or UI structure changed after a redesign. **NOT stale** (don't silently "fix"): test is red because the code is actually broken (debug the code, never weaken the test), the feature was intentionally removed (delete the test, say so), or you're unsure whether the behavior change was intended (investigate first — may be a regression).

---
