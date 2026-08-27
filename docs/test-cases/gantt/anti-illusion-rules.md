# Gantt 测试「避免假象」规则（Anti-Illusion Rules）

> 适用：`e2e/tests/gantt/**`。借鉴 ROIs-Suit-MM 的 §No-Illusion / Advanced-Testing 规则，
> 并针对本项目 **Canvas 渲染的 Gantt** 做了专门约定。
> 与根 `CLAUDE.md` 的 §No-Illusion、§Playwright-Required 一并强制执行。

## 0. 一句话原则

> 声明毫无价值，测试输出才是证据。
> 「画了东西」不等于「画对了对象」；「面板可见」不等于「数据加载成功」。

功能没被测试证明能用之前，它就没完成；bug 没被测试证明不再复现之前，它就没修复。

---

## 1. Canvas 专属铁律：禁止「像素即通过」

Gantt 主体是 Canvas，DOM 上**没有**按对象的节点，因此：

- ❌ **禁止**用 `canvas.getImageData(...)` 里「存在非空像素」来证明对象已渲染。
  非空像素可能只是网格线、表头、底色——**这是最典型的假象**。
- ✅ **必须**通过测试自省钩子 `window.__ganttTest` 断言「实际渲染/加载了哪些对象」。

钩子来源：`gantt/src/utils/gantt-test-hook.ts`（仅非生产构建注入；生产构建 `import.meta.env.PROD` 守卫直接 return，不进产物）。封装见 `e2e/utils/gantt-hook.ts`。

钩子提供的真值：

| 方法 | 含义 | 典型断言 |
|------|------|---------|
| `counts()` | 各面板已加载对象数（store 真值） | `> 0` |
| `render()` | Canvas 每次绘制后的回执（`totalRows` / `renders`） | `totalRows > 0 && renders > 0` |
| `ready()` | 所有可见数据面板「对象已呈现」（不在加载中 + 计数>0 + 已绘制） | `toBe(true)` |
| `roster()/pairings()/flights()` | 已加载对象的轻量字段列表 | 逐条匹配筛选条件 |
| `zoom()` | `pxPerHour` 等缩放状态 | 缩放前后变化 |

「对象确实被画出来」的标准三连（缺一不可）：
1. `counts().<pane> > 0` —— 数据确实加载
2. `render()` 中该面板回执 `totalRows > 0 && renders > 0` —— Canvas 确实画了
3. `ready()` 为 `true` —— 不在加载中、非空白

---

## 2. 断言数据，而不是可见性

| 反模式 | 正确做法 |
|--------|---------|
| `expect(pane).toBeVisible()` 单独使用 | `expect(counts.roster).toBeGreaterThan(0)` + `render().totalRows>0` |
| 「没有报错」当作成功 | loader 消失 + `ready()` 为真 + 计数匹配 |
| 筛选后只断言「面板还在」 | 断言**每一条**呈现对象都满足筛选条件 |
| `toContainText` 猜测 Canvas 内文字 | 读 `window.__ganttTest` 的对象字段 |

筛选类用例的核心断言形如：
```ts
const objs = await pairingObjects(page)
expect(objs.length).toBeGreaterThan(0)                 // 确有对象
expect(objs.every(p => p.base === 'YVR')).toBe(true)   // 每条都匹配条件
```

---

## 3. 筛选条件必须「确实收窄 + 对象级可判定」

写筛选用例前，先用 API 探查该条件是否**真的会收窄**、其值是否**落在对象字段上可逐条核对**。否则就是假象。

本 demo 数据的已验证可用条件（其它请先探查再用）：

| 条件 | 可判定字段 | 是否收窄 | 备注 |
|------|-----------|---------|------|
| Pairing Base（如 YVR） | `pairing.base` | ✅ 6054→1455 | 推荐 |
| Flight Dep Airport（如 YYZ） | `flight.depArp` | ✅ 全部命中 | 需先新增 Flight 面板 |
| ❌ Crew Division (P/C) | `roster.division` | 不纯 | 飞行员的 roster 里也可能出现 C 段，**不可**作逐条不变量 |
| ❌ Pairing Fully-Crewed | `pairing.isFull` | demo 全为 true | 不构成判别 |

> 教训：不要假设「按 X 筛选 → 每个对象 X 都相等」。先探查 API 分布，再决定断言。

---

## 4. 多步骤优先，单步只能算 stub

真实排班员会连续操作：筛选 → 反悔清除 → 再叠加。单步「happy path」测不到状态机 bug。

筛选类/工作流类用例**至少**覆盖：应用 → 中间断言 → 清除/反选 → 恢复断言（见 `multi-step-workflow.spec.ts`）。
清除后必须断言「对象恢复到基线集合」，而不是只看面板还在。

---

## 5. 区分空态与静默失败

空面板有两种：(a) 正确加载但 0 条；(b) 数据请求静默失败。用例必须区分：

- 有数据场景：`ready()` 为真 + 计数>0 + Canvas `totalRows>0`。
- 真·空态场景：断言 loader 消失 + 无错误态 + 计数显式为 0。

绝不接受「面板可见」作为加载成功的证据。

---

## 6. 性能用例：先测量、再断言、如实报告

`load-speed.spec.ts`（§Req5）：

- 「加载完成」严格等于 `ready()`（所有对象已呈现），计时从「打开 Gantt（点击 Live）」开始。
- 始终把真实耗时 `attach` 到报告并 `console.log`。
- `TARGET_MS=1000` 是目标；当前跨洲远端库 + 未压缩负载下大概率超标（实测约 3.1s）。
- 用 `GATE_MS` 作防回归门禁让用例可通过，并如实报告与 1s 的差距，作为性能增强阶段的验收依据。
  达标后将 `GATE_MS` 收紧到 `TARGET_MS`。
- ❌ 禁止写一个「永远通过」的性能断言来制造达标假象。

---

## 7. 提交完成时必须附测试回执

任何「修好了 / 通过了 / 能用了」的结论，都必须附上：
```
npx playwright test e2e/tests/gantt/<file>.spec.ts --reporter=list
```
的最终 PASS/FAIL 摘要。没有回执 = 未完成（§No-Illusion）。

---

## 8. 反模式速查表

| 反模式 | 替换为 |
|--------|--------|
| Canvas 像素非空即通过 | `__ganttTest.counts()/render()/ready()` 真值 |
| 仅 `toBeVisible()` | 计数>0 + 逐条匹配 + 已绘制 |
| 假设筛选必然收窄 | 先 API 探查分布，选可判别条件 |
| 单步用例当通过 | 多步链 + 中间断言 + 清除后恢复断言 |
| 永远通过的性能断言 | 测量 + attach + 防回归门禁 + 如实报告目标差距 |
| 标记完成却无测试输出 | 贴出 `--reporter=list` 的 PASS/FAIL |
