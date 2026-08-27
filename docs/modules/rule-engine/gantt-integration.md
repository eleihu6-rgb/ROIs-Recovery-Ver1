# 法规引擎 × Gantt 集成

> 2026-04-01 实现，覆盖：数据库 seed → 数据转换 → API 对接 → 前端自动触发 → 违规显示

---

## 1. 整体数据流

```
┌────────────────────────────────────────────────────────────────────┐
│  Gantt 前端                                                        │
│                                                                    │
│  用户修改 roster                                                    │
│    ↓                                                               │
│  roster-store 更新 rosterItems                                     │
│    ↓                                                               │
│  useRuleCheck hook 检测变化（500ms 防抖）                            │
│    ↓                                                               │
│  buildCheckInputs()                                                │
│  ├─ 过滤 pairingId > 0 且含 FLT/DHD 段的任务                       │
│  ├─ 按 crewId → pairingId → dutySeq 分组                           │
│  └─ 构建 CheckInput { ruleGroupCode, pairing, crew }              │
│    ↓                                                               │
│  ruleApi.check() → HTTP POST                                      │
└─────────────┬──────────────────────────────────────────────────────┘
              │  http://<host>:7789/api/rules/check
              ↓
┌────────────────────────────────────────────────────────────────────┐
│  Rule Engine (TypeScript + Fastify, port 7789)                     │
│                                                                    │
│  RuleLoader.loadRules('ccar121_gantt')                             │
│  ├─ 查询 rule_group + rule_group_item + rule_instance              │
│  └─ 内存缓存 1 小时                                                │
│    ↓                                                               │
│  RuleEngine.check(input)                                           │
│  ├─ Phase 1: Calculators (fdp, flight_hour, duty, rest, fatigue)  │
│  └─ Phase 2: Checkers (max_fdp, min_rest, max_ft, max_dp, ...)   │
│    ↓                                                               │
│  返回 EngineResult { calcResults, checkResults, passedAll }        │
└─────────────┬──────────────────────────────────────────────────────┘
              │
              ↓
┌────────────────────────────────────────────────────────────────────┐
│  Gantt 前端 — 违规展示                                              │
│                                                                    │
│  rule-check-store 存储 violations（按 pairing + crew 双维度）       │
│    ↓                                                               │
│  roster-pane violationMap: taskId → maxSeverity                    │
│    ↓                                                               │
│  Canvas 渲染：                                                     │
│  ├─ 任务块右上角：铃铛图标 + severity 颜色（黄/橙/红）               │
│  ├─ 左侧面板：crew 行违规圆点指示                                   │
│  └─ Hover 悬浮窗：违规详情卡片（规则名 + 消息 + severity）          │
│                                                                    │
│  StatusBar：显示总违规数                                            │
└────────────────────────────────────────────────────────────────────┘
```

---

## 2. 数据库 Seed 数据

### 2.1 rule_template（21 条）

法规算法模板，代码中实现对应逻辑。

| category | 模板数 | 示例 |
|----------|-------|------|
| FDP | 3 + 1 calc | `max_fdp`, `max_fdp_split`, `max_fdp_extension`, `fdp_calculator` |
| FLIGHT_TIME | 4 + 1 calc | `max_ft_24h/7d/28d/365d`, `flight_hour_calculator` |
| REST | 3 + 1 calc | `min_rest`, `min_rest_weekly`, `min_rest_post_night`, `rest_calculator` |
| DUTY | 2 + 1 calc | `max_dp`, `max_dp_7d`, `duty_period_calculator` |
| FATIGUE | 1 (BOTH) | `fatigue_risk_index` |
| QUALIFICATION | 3 | `qual_airport`, `qual_fleet`, `qual_recency` |
| COMPOSITION | 1 | `composition_check` |

### 2.2 rule_instance（21 条，f8 航司飞行员）

基于模板创建，CCAR-121-R5 标准参数。示例：

```json
// max_fdp_std — FDP 限制表（按航段数 × 报到时刻窗口）
{
  "base_limit_minutes": 780,
  "fdp_table": [
    { "min_seg": 1, "max_seg": 1, "windows": [
      { "start": "06:00", "end": "13:59", "limit": 780 },
      { "start": "14:00", "end": "17:59", "limit": 720 },
      { "start": "18:00", "end": "21:59", "limit": 660 },
      { "start": "22:00", "end": "05:59", "limit": 600 }
    ]},
    ...
  ]
}

// min_rest_std — 最小休息
{ "base_rest_minutes": 600, "rest_ratio": 1.0, "absolute_min_minutes": 600 }
```

### 2.3 rule_group（4 个）

| group_code | usage | 说明 | 特殊处理 |
|-----------|-------|------|---------|
| `ccar121_gantt` | GANTT | Gantt 实时检查 | 全部 21 条启用 |
| `ccar121_po` | PO | 组环优化 | 资质类降级为 WARNING |
| `ccar121_ro` | RO | 分配优化 | 资质类降级为 WARNING |
| `ccar121_pbs` | PBS | 机组竞标 | 疲劳检查禁用 |

### 2.4 rule_group_item（84 条）

每个集合 21 条，执行顺序：Calculators (1xx) → FDP checks (2xx) → Flight time (3xx) → Rest (4xx) → Duty (5xx) → Fatigue (6xx) → Qualifications (7xx) → Composition (8xx)

**Seed 文件**：`sql/seed/07b-rule-instance-group.sql`（幂等，ON CONFLICT DO NOTHING）

---

## 3. 前端关键文件

| 文件 | 职责 |
|------|------|
| `utils/roster-to-check-input.ts` | RosterItem[] → CheckInput 数据转换 |
| `services/rule-api.ts` | Rule engine HTTP 客户端（check/batch/groups） |
| `stores/rule-check-store.ts` | 违规状态管理（checkCrews、violations Map） |
| `hooks/use-rule-check.ts` | 监听 roster 变化，防抖自动触发检查 |
| `components/gantt/violation-overlay.ts` | Canvas 铃铛图标 + crew 违规圆点 |
| `components/gantt/violation-tooltip.tsx` | DOM 浮动违规详情卡片 |

---

## 4. 数据转换逻辑

`buildCheckInputs(crewId, items, ruleGroupCode)`:

```
RosterItem[]（扁平行）
  │
  ├─ 过滤：pairingId > 0 + 有时间 + 含 FLT/DHD 段
  ├─ 按 pairingId 分组
  ├─ 每个 pairing 内按 dutySeq 分组
  ├─ 每个 duty 内按 schStrDtUtc 排序生成 segments
  ├─ 计算 duty 间 restAfterMinutes
  └─ 输出 CheckInput { ruleGroupCode, pairing, crew }
```

**不检查的任务**：
- `pairingId = 0` 的散单任务（OFF、SL、SBY、GRD 等）
- 没有 FLT/DHD 飞行段的 pairing（纯地面）
- 无时间的任务项

---

## 5. 违规显示设计

### 5.1 Canvas 渲染

**任务块铃铛图标**（`violation-overlay.ts`）：
- 位置：任务块右上角
- 样式：10px 彩色圆 + 白色 "!" 符号
- 颜色：severity 1-2 黄色 / 3 橙色 / 4-5 红色（`VIOLATION_SEVERITY_COLORS`）

**Crew 行指示器**：
- 位置：左侧面板行末
- 样式：4px 彩色圆点，颜色同上

### 5.2 浮动详情卡片

**ViolationTooltip**（`violation-tooltip.tsx`）：

- **触发**：hover 有违规的任务
- **延迟**：鼠标离开任务 300ms 后隐藏，移入 tooltip 则保持
- **可交互**：tooltip 可滚动查看（max-h 200px）
- **内容**：
  - Header：红色圆点 + "Rule Violations" + 计数 badge
  - 列表：severity 颜色点 + 级别标签 + 规则名 + 违规消息
- **样式**（ui-ux-pro-max）：
  - `bg-popover/95 backdrop-blur-sm shadow-lg`
  - `animate-in fade-in-0 zoom-in-95`
  - severity 颜色与 Canvas 铃铛一致
  - 语义化主题色，支持 5 套主题

### 5.3 Severity 映射

| Rule Engine | Gantt 显示 | 颜色 | 行为 |
|-------------|-----------|------|------|
| 1 (INFO) | 黄色铃铛 | `#eab308` | 仅提示 |
| 2 (WARNING) | 黄色铃铛 | `#eab308` | 提示，允许操作 |
| 3 (ERROR) | 红色铃铛 | `#ef4444` | 阻止操作 |

---

## 6. API 接口

### POST /api/rules/check

```typescript
// 请求
{
  ruleGroupCode: "ccar121_gantt",
  pairing: {
    pairingId: 16,
    crewBase: "TPE",
    duties: [{
      dutySeq: 1,
      reportUtc: "2026-03-31T00:00:00Z",
      releaseUtc: "2026-03-31T10:00:00Z",
      segments: [{
        fltNo: "F8001",
        depPort: "TPE", arrPort: "NRT",
        stdUtc: "2026-03-31T00:00:00Z",
        staUtc: "2026-03-31T03:00:00Z",
        blockMinutes: 180,
        isNight: false
      }, ...]
    }]
  },
  crew: {  // 可选
    crewId: "CA001",
    division: "P", rank: "CA",
    fleetQuals: [], airportQuals: [],
    recentFlightHours: { last24h: 0, last7d: 0, ... }
  }
}

// 响应
{
  code: 200,
  data: {
    calcResults: [
      { ruleCode: "fdp_calculator", value: 600, unit: "minutes", ... }
    ],
    checkResults: [
      { ruleCode: "max_fdp", passed: true, severity: 3,
        actualValue: 600, limitValue: 780, message: "..." },
      { ruleCode: "min_rest", passed: false, severity: 3,
        actualValue: 480, limitValue: 600, message: "..." }
    ],
    passedAll: false,
    highestSeverity: 3
  }
}
```

### GET /api/rules/groups

返回所有法规集合列表（供前端选择器使用）。

---

## 7. 配置

| 项目 | 配置 | 说明 |
|------|------|------|
| Rule Engine 端口 | 7789 | `.env` `PORT=7789` |
| Gantt API baseURL | `http://<host>:7789` | `services/rule-api.ts` |
| 默认法规集合 | `ccar121_gantt` | `stores/rule-check-store.ts` |
| 检查防抖 | 500ms | `hooks/use-rule-check.ts` |
| Tooltip 隐藏延迟 | 300ms | `components/gantt/violation-tooltip.tsx` |
| 规则缓存 TTL | 1 小时 | `rule-engine/src/engine/rule-loader.ts` |

---

## 8. 待完善

| 项目 | 状态 | 说明 |
|------|------|------|
| Crew 资质数据 | 待接入 | fleetQuals/airportQuals/recentFlightHours 目前传空 |
| 法规集合选择 UI | 待开发 | 当前硬编码 `ccar121_gantt`，需加下拉选择器 |
| 阻止操作逻辑 | 待完善 | ERROR 级别违规应阻止 roster 修改并弹窗提示 |
| 批量检查优化 | 待优化 | 当前逐 pairing 调用，可改用 /check/batch 减少请求 |
| 增量检查 | 待优化 | 当前全量检查所有 crew，应只检查被修改的 crew |
| sub pane 支持 | 待补充 | 当前只监听 main pane 的 rosterItems |
