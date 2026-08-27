# PBS Business Time 独立管理页面设计

日期：2026-08-04
状态：已确认并实施
范围：`gantt` PBS 管理导航与页面、`live-server` 管理接口、自动化测试与 PBS 人工回归用例

## 1. 背景

当前 Gantt 的 `PBS > Period` 页面同时承担两类职责：

1. 管理 PBS Period，包括查询、新增、编辑、删除和按年生成。
2. 查看和修改 PBS Business Time。

Business Time 会改变 PBS 判断“当前时间”的口径，并进一步影响 Portal 当前 Period、Bid Open/Close、剩余时间、是否可编辑和 Award 当前 Period。该功能主要用于开发和测试，权限和风险都高于普通 Period 管理，不应继续混在 Period 页面中。

当前系统尚未接入完整 Profile/RBAC 权限运行时。本次按已确认范围，暂时只使用数据库 `users.is_admin = 1` 控制访问；该数值原样进入 JWT 和前端登录状态，即 `authUser.isAdmin = 1`。

## 2. 目标

1. 从 `PBS > Period` 页面彻底移除 Business Time 展示和操作。
2. 在 `PBS Admin` 左侧导航新增独立的 `Business Time` 页面。
3. 仅 `is_admin = 1` 的登录用户可以看到页面、读取状态或修改 Business Time。
4. 将 Business Time API 从 Period 管理路由中拆出，形成独立管理边界。
5. 使用清晰、无歧义的时间标签解释 Rolling 模式和各时间字段。
6. 不改变 PBS Server 当前 Business Clock 的业务计算、字典存储和 60 秒缓存行为。

## 3. 非目标

- 本次不建设完整 Profile/RBAC 权限系统。
- 不新增 `is_developer`、开发账号白名单或账号硬编码。
- 不修改服务器操作系统时间。
- 不新增 Business Time 数据表或数据库 migration。
- 不修改 Business Time 的三个 dictionary key。
- 不增加 `FROZEN` 等新时间模式；仍只支持 `ROLLING`。
- 不改变 Period 的自动选择、Bid 窗口判断或 Award 当前 Period 规则。
- 不修改普通 PBS Portal 页面。

## 4. 已确认业务语义

Business Time 使用滚动模式：

```text
PBS Business Time = Anchor Business Time + (Real Time - Anchor Real Time)
```

因此管理员设置一个模拟时间后，PBS Business Time 不会停住，而会和真实时间按相同速度继续推进。

页面字段定义：

| 页面字段 | 含义 |
| --- | --- |
| `Mode` | 当前有效模式。合法配置显示 `Rolling`；非法配置回退系统时间时显示 `System Time`，同时在 warning 中说明原配置无效。 |
| `Real Time` | 当前真实时间。 |
| `PBS Business Time` | PBS 当前用于 Period 和 Bid 生命周期判断的业务时间。 |
| `Override Set At` | 本次 Business Time override 建立时对应的真实时间，即 `anchorReal`。 |

所有页面时间统一显示为 `Asia/Shanghai (UTC+8)`。不再显示容易与北美 Central Standard Time 混淆的 `CST`。

状态定义：

- `SYSTEM TIME`：没有有效 override，PBS Business Time 等于真实时间。
- `OVERRIDE`：Business Time anchor 和真实时间 anchor 均有效，PBS 使用 Rolling 业务时间。
- 配置非法时，PBS 回退到真实时间，`source` 返回 `system`，并在管理页面显示持久 warning。

配置完整性规则：

- `mode` 为空或为 `ROLLING`，且两个 anchor 都为空：合法 `SYSTEM TIME`。
- `mode` 为空或为 `ROLLING`，且 `anchor`、`anchorReal` 均为合法时间戳：合法 `OVERRIDE`；空 mode 继续沿用现有默认 `ROLLING` 的兼容语义。
- 其他组合均为非法配置，包括未知 mode、只有一个 anchor、任一 anchor 无法解析；统一回退真实时间并返回 warning。

## 5. 权限设计

### 5.1 前端权限

- 数据库 `is_admin = 1` 经登录/JWT 保持为数值 `authUser.isAdmin = 1`：显示 `PBS Admin > Business Time` 导航项，可进入页面并执行操作。
- `is_admin != 1`：不显示导航项。
- 等待认证状态恢复完成后再判断权限；如果普通用户的本地 Shell 状态仍保存着 `business-time`，必须将当前 Zustand 状态和对应持久化状态一并改回 `period`，确保导航选中态、页面内容和下次恢复一致。
- 前端隐藏只是用户体验控制，不作为安全边界。

### 5.2 后端权限

- Business Time 的 GET 和 PUT 接口都必须严格检查 `request.authUser?.isAdmin === 1`；前端严格检查 `user?.isAdmin === 1`。`0`、`null`、缺失值或其他数值均不得放行。
- 非管理员统一返回 `403` 和产品化错误 `Admin access required`。
- 未登录请求仍由全局认证插件返回 `401`。
- 后端权限是最终安全边界，不能依赖前端页面是否显示。

## 6. 导航与页面设计

### 6.1 PBS Admin 左侧导航

管理员看到：

```text
PBS Admin
├── Period
├── Bid Definitions
├── Business Time
└── Admin Tools
```

普通用户不显示 `Bid Definitions` 和 `Business Time`。本次不扩大范围处理 `Period`、`Admin Tools` 对普通用户的现有可见性问题。

### 6.2 Period 页面

移除以下全部内容：

- `PBS Business Time` 卡片。
- Business Time 状态加载。
- Business Time 输入与保存状态。
- `Set Business Time`、`Use Real Time`、Business Time `Refresh`。
- Business Time 专属错误和成功消息。

Period 页面保留：

- Period 总数。
- Period Refresh。
- Generate Year。
- Add Period。
- Filters。
- Period 表格及增删改。

### 6.3 Business Time 页面

页面标题：`PBS Business Time`。

页面顶部使用明确的警示说明，但不将其作为普通正文混排错误：

```text
Development and testing control. Changes affect the current PBS period,
bid-window availability, remaining time, and Award period selection.
```

页面主体采用现有 Gantt 管理页面的高密度样式，不复制 Period 的整张大卡片。内容包括：

1. 状态栏：`SYSTEM TIME` 或 `OVERRIDE` badge。
2. 四个状态字段：`Mode`、`Real Time`、`PBS Business Time`、`Override Set At`。
3. 一行操作区：
   - `Business Time (Asia/Shanghai, UTC+8)` datetime-local 输入。
   - `Set Business Time`。
   - `Use Real Time`。
   - `Refresh`。
4. 配置 warning 区域，仅在后端返回 warnings 时显示。
5. 辅助说明：Rolling 模式会让模拟时间随着真实时间继续推进。

页面中的时间是每次 GET/刷新后的状态快照，不新增前端逐秒计时器。

不增加新的确认弹窗，保留现有直接设置交互，避免扩大交互范围。按钮在请求期间禁用并显示明确进行中状态，防止重复提交。

## 7. API 与代码边界

### 7.1 新接口

从 `period-admin.ts` 拆出以下接口：

```text
GET /api/admin/pbs-business-time
PUT /api/admin/pbs-business-time
```

GET 返回结构继续复用当前契约：

```ts
type PbsBusinessTimeStatus = {
  mode: string
  source: 'system' | 'override'
  realNow: string
  businessNow: string
  anchor: string | null
  anchorReal: string | null
  warnings: string[]
}
```

PUT 请求：

```json
{ "action": "CLEAR" }
```

或：

```json
{
  "action": "SET",
  "businessTimeLocal": "2026-07-03T08:00"
}
```

### 7.2 旧接口处理

删除以下旧管理端接口，不保留兼容别名：

```text
GET /api/pbs/period-admin/business-time
PUT /api/pbs/period-admin/business-time
```

原因：当前调用方只有同仓库 Gantt 管理页，项目尚未上线；保留别名会继续制造 Period 与 Business Time 的错误耦合。

### 7.3 后端文件边界

- 新建独立的 admin route 文件管理 Business Time GET/PUT。
- Business Time 配置读取、状态计算、SET/CLEAR 写入逻辑从 `period-admin.ts` 移到独立模块。
- Period 列表仍需要 Business Time 来计算 `computedStage`，因此它应调用共享的只读 Business Time service，而不是重新实现公式。
- `pbs-server` 继续读取同一组 dictionary key，不改其现有 Business Clock 实现。

### 7.4 前端文件边界

- 新增独立 `PbsBusinessTimeView`。
- `ActivePbsItem` 新增 `business-time`。
- `ShellSidebar` 只为管理员加入该导航项。
- `PbsView` 对页面渲染再次执行管理员判断，并为无权限或陈旧状态回退到 Period。
- Business Time API 类型和请求从 `pbs-period-admin-api.ts` 移到独立 service 文件。
- `PbsPeriodView` 不再引用 Business Time 类型或请求。

## 8. 数据与缓存

继续读写 Live schema 的 `dictionary`：

```text
parent_code = SYS_PARAM
PBS_BUSINESS_TIME_MODE
PBS_BUSINESS_TIME_ANCHOR
PBS_BUSINESS_TIME_ANCHOR_REAL
```

SET：

- mode 写入 `ROLLING`。
- anchor 写入所选 Asia/Shanghai 时间转换后的 UTC ISO。
- anchorReal 写入保存动作发生时的真实 UTC ISO。

CLEAR：

- mode 保持 `ROLLING`。
- anchor 和 anchorReal 清空。

`pbs-server` 当前最多缓存 Business Time 配置约 60 秒。保存成功消息必须继续说明 Portal 可能最多等待 60 秒才反映变化。本次不新增跨服务缓存失效机制。

## 9. 错误处理

- datetime 为空或非法：输入控件保持错误状态，并提供可访问的字段说明，不发送请求。
- `401`：沿用全局登录失效处理。
- GET `403`：使用全局 toast 显示无权访问，将当前与持久化导航状态改回 `period`，并返回 Period 页面；不显示无意义的 Retry。
- PUT `403`：使用全局 toast 显示无权操作，并返回 Period 页面；后端保持稳定错误码。
- GET 网络错误、超时或 `5xx`：页面显示持久的局部错误状态与 `Retry`，因为用户需要继续参考和恢复；不只发送短暂 toast。
- SET/CLEAR 失败：使用项目统一全局 toast；保留输入和当前状态，允许用户重试。
- 后端配置 warnings：使用页面内持久 warning，不当作普通业务文案，也不重复触发 toast。
- 持久错误与 warning 使用可访问的 alert 语义和明确名称；恢复按钮可通过键盘操作。
- 不向用户展示原始异常、SQL 或内部配置详情。

## 10. 测试与验证

### 10.1 Live Server

新增或更新聚焦测试，覆盖：

1. 管理员 GET 返回 system 状态。
2. 管理员 GET 返回 Rolling override 和正确计算的 Business Time。
3. 管理员 PUT SET 写入三个 dictionary key。
4. 管理员 PUT CLEAR 清空两个 anchor。
5. 非管理员 GET/PUT 均返回 403。
6. 未登录 GET/PUT 均返回 401。
7. 非法 Business Time（包括无效日历日期）返回 400。
8. `2026-07-03T08:00` 按 `Asia/Shanghai` 保存为 `2026-07-03T00:00:00.000Z`。
9. 未知 mode、单侧 anchor、非法 anchor 时间戳均回退 system time，并返回可展示 warning。
10. 空 mode 配合两个合法 anchor 继续返回 Rolling override，保持现有兼容语义。
11. Period 列表在拆分后仍使用同一 Business Time 计算 `computedStage`。
12. 旧 `/api/pbs/period-admin/business-time` 的 GET、PUT 均返回 404。

### 10.2 Gantt 单元/组件测试

覆盖：

1. `is_admin = 1` 显示 Business Time 导航和页面。
2. 普通用户不显示 Business Time 导航。
3. 普通用户遇到本地保存的 `business-time` 状态时回退 Period。
4. Period 页面不再渲染 Business Time 卡片。
5. 页面字段名称、UTC+8 标识、风险说明和 Rolling 说明正确。
6. SET/CLEAR 请求期间按钮禁用。
7. 加载失败显示局部 Retry 状态。
8. GET/PUT `403` 回退 Period，且不会显示 Retry。
9. 持久错误与 warning 具备 alert 可访问语义。

### 10.3 Playwright

使用真实 Gantt UI 覆盖：

1. 管理员进入 `PBS > Business Time`。
2. `PBS > Period` 页面不再显示 Business Time。
3. 管理员设置 Business Time 后，状态显示 `OVERRIDE`。
4. 管理员点击 `Use Real Time` 后，状态显示 `SYSTEM TIME`。
5. 普通用户看不到 Business Time 导航，并且不能通过保存状态进入该页面。
6. 设置一个跨越 Period/Bid 窗口边界的 Business Time 后，打开 PBS Portal 验证当前 Period、Bid 可编辑状态和剩余时间随 Business Clock 变化；清除 override 后恢复真实时间口径。

### 10.4 必跑命令

- Live Server 聚焦 Vitest。
- `cd live-server && pnpm exec tsc --noEmit --pretty false`。
- Gantt 聚焦 Vitest。
- Gantt Playwright 回归。
- 更新并执行 `docs/test-cases/pbs/` 下 Business Time 对 Portal Period、Bid window、remaining time 与 Award period 的人工回归用例。
- `cd gantt && pnpm run build`。
- 根目录 `npm run check:ui`，Hard violations 必须为 0。
- `git diff --check`。

## 11. 验收标准

1. Period 页面只显示 Period 管理内容。
2. 管理员可在独立 `PBS Admin > Business Time` 页面查看和修改 Business Time。
3. 普通用户看不到页面，直接请求接口得到 403。
4. 页面不再使用 `CST`，明确显示 `Asia/Shanghai (UTC+8)`。
5. 四个字段含义清楚，Rolling 模式有简短说明。
6. SET、CLEAR 后 PBS Business Time 计算与拆分前完全一致。
7. Portal 当前 Period、Bid 窗口和 Award 继续消费相同 Business Clock。
8. Period 的 `computedStage` 在拆分后没有行为变化。
9. 没有新增数据库 migration，也没有账号硬编码。

## 12. 风险与控制

| 风险 | 控制措施 |
| --- | --- |
| 只移动 UI，旧接口仍与 Period 耦合 | 同时拆分后端路由和共享只读 service。 |
| 前端隐藏被绕过 | 后端 GET/PUT 都检查 `isAdmin`。 |
| Period stage 因代码搬迁发生变化 | Period 与 Business Time Admin 复用同一状态计算 service，并补回归测试。 |
| 管理员误解 Rolling 为冻结时间 | 页面明确显示 Rolling 说明和 Override Set At。 |
| `CST` 时区歧义 | 全部显示为 `Asia/Shanghai (UTC+8)`。 |
| 保存后 Portal 暂未变化 | 成功消息保留最多 60 秒缓存提示。 |

## 13. 关键假设

- 当前 `is_admin = 1` 用户即本阶段允许使用 Business Time 的管理员。
- 项目尚未上线，旧管理接口没有外部调用方，可以直接删除。
- Business Time 是全 PBS 范围共用口径，不按 C/P/A 单独配置。
- 后续引入完整 RBAC 时，可将页面和接口的 `isAdmin` 判断替换为专用权限码，不改变页面功能。

## 14. Multi-Agent Parallelism Assessment

- Recommendation：No。
- Rationale：前端导航、页面、API 路径、后端共享 Business Time service 和回归测试属于同一紧密契约，拆分并行容易产生路径和行为不一致。
- Suggested split：不拆分，由一个实现流依次完成后端抽取、前端接入和验证。
- Write boundaries：`live-server` Business Time route/service/test、`gantt` PBS navigation/view/service/test、`e2e` 与 `docs/test-cases/pbs/period`。
- Conflict risk：中等；`pbs-period-view.tsx` 和 `period-admin.ts` 是现有大文件，必须只移动 Business Time 相关代码，避免碰触 Period 业务。
- Execution gate：用户审阅并明确批准本 spec 后才能实施。
