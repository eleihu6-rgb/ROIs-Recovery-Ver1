# PBS Pairing 与 AA 文档差距分析设计文档

**日期：** 2026-04-23  
**作者：** Codex + lei  
**状态：** 待评审  
**优先级：** Gap 收口 → 下一阶段实现排序

---

## 背景

当前 `pbs-portal` 的 `Pairing` 页面已经完成了第一阶段的“规则编辑器”能力：

- 左侧共享 `BIDDING CALENDAR`
- 右侧 `EXISTING PAIRING PROPERTIES`
- 右侧 `ADD PAIRING PROPERTIES`
- `ALL PROPERTIES / FAVORITED PROPERTIES`
- `Current` draft 的真实后端保存
- Pairing favorites 的真实后端持久化

但在与 AA / N-PBS / PRD 对齐时，当前页面仍然不能被视为“完整 Pairing 能力”。当前实现更准确地说，是一个：

- `generic pairing rules editor`

而不是：

- 真实 `Search Pairings` 检索器
- `Specific Bid` 指定页
- 完整的 pairing pool 构建与预览页

因此本设计文档的目标不是重复描述当前页面，而是明确：

1. 当前已经实现到了哪一层
2. 按 AA / PRD 还差哪些能力
3. 这些能力应该按什么顺序补

---

## 参考来源

本次 gap 分析主要参考：

- `init-docs/AA-Flight-Attendant-PBS-Guide_10JAN19.pdf`
- `init-docs/PBS 智能排班竞标系统需求规格书.md`
- `init-docs/crew_bids_reference-2026-03-16-072929.md`
- `docs/superpowers/specs/2026-04-20-pbs-portal-pairing-design.md`
- `docs/superpowers/specs/2026-04-21-pairing-persistence-design.md`

本次判断口径：

- `AA / PRD` 决定目标系统 Pairing 的业务语义
- `crew_bids_reference` 只作为旧系统真实数据形态参考
- 当前 `portal` 代码只代表现阶段实现，不代表目标规则已经全部完成

---

## 业务口径

### 1. Pairing 页面当前应如何理解

当前 `Pairing` 页面应理解为：

- 给某个 `Layer` 配置一组 pairing 规则
- 用这些规则定义该层允许进入 pairing pool 的 pairing 条件

因此：

- `PRIORITY` 更准确地说是 property / condition / rule
- `BID` 是这条规则的参数值
- `LAYERS` 是这条规则在哪些层生效

它不是：

- 最终 award 页面
- 具体 pairing 的最终分配结果
- 已选 pairing 清单

### 2. `ADD PAIRING PROPERTIES` 当前语义

`ADD PAIRING PROPERTIES` 当前应理解为：

- generic pairing filters / property catalog

它本质上是：

- 可加入当前 layer draft 的条件模板池

而不是：

- 公司当月真实 pairing 列表

### 3. `Search Pairings` 当前语义

当前 `Search Pairings` 只是：

- 本地过滤 available properties 的交互壳

它还不是 PRD 里的：

- 真实 pairing 检索引擎
- `Pairing ID` 精准搜索入口
- mini calendar 结果页

---

## 当前已完成的部分

截至 2026-04-23，`Pairing` 已完成的能力如下。

### 1. Generic pairing property catalog 已有一版可用实现

当前 `ALL PROPERTIES` 已经不再只是占位项，而是按 AA generic pairing 思路补成一整套条件目录。对应定义在：

- `packages/contracts/pbs-pairing-bids.js`
- `pbs-portal/src/features/pairing/pairing-property-catalog.ts`

目前覆盖的方向已经包括：

- Pairing length
- Duty / report / release time
- Pairing type
- TAFB / duty / block / connection 限制
- Deadhead 偏好
- Layover / landing / aircraft / positions order

### 2. Generic pairing rules draft 已真实持久化

当前以下能力已经打通：

- `GET /api/pairing-bids/current`
- `PUT /api/pairing-bids/current`
- 当前用户、当前周期、`Current` draft 的真实保存与回显

因此当前 Pairing 右侧上半部分：

- 新增规则
- 删除规则
- 修改 layer

都已经属于真实后端链路，而不是纯前端 mock。

### 3. Favorites 已真实持久化

当前 `FAVORITED PROPERTIES` 已不再是静态预置列表，而是：

- `ALL PROPERTIES` 中可操作的用户收藏
- 后端真实保存
- 刷新后仍保留

对应新增：

- `pbs_bid_pairing_favorite`
- 收藏 / 取消收藏接口

### 4. 基础交互与分页已具备

当前页面已有：

- `ALL / FAVORITED` tab
- 搜索框
- 10 条分页
- Footer 贴底
- 收藏乐观更新
- UI inspector 唯一 UID 机制

---

## 与 AA / PRD 的主要差距

### Gap 1：`Search Pairings` 还不是真实 pairing 检索器

PRD 明确要求 `Search Pairings` 是：

- 浏览当月真实 pairing 资源的专用入口
- 可以按 `Pairing ID` 精准搜
- 结果旁带 mini calendar
- 冲突日期不可投标

当前未实现：

- 真实 pairing 数据源
- `Pairing ID` 搜索框
- 结果卡片列表
- mini calendar
- 冲突日期禁用
- `Bid These Properties`

这意味着当前 `Search Pairings` 还不能算 PRD 对应功能完成。

### Gap 2：`Specific Bid` 还没进入 Pairing 主链

PRD 明确区分：

- `Specific Bid`
- `Generic Bid`

当前页面只做了 `Generic Bid` 这一半。

尚未进入系统的包括：

- `Pairing ID`
- `Pairing ID on Date`
- `Pairing ID for Entire Month`

因此当前 Pairing 还不能支持“狙击某条具体 pairing”。

### Gap 3：当前规则表达模型还是简化版

当前 portal 一条 Pairing rule 主要只有：

- `propertyCode`
- `bid`
- `layers`

但从 PRD 和旧系统数据看，完整规则模型通常还需要：

- `award / avoid`
- `any / every`
- operator（`<`, `=`, `>`, `between`, `in`）
- 多值输入
- 条件链

当前这些维度还没有真正暴露给用户，也没有在 Pairing 页建立完整表达模型。

### Gap 4：AND / OR 语义还未实现为真正的规则组

PRD 对同层规则有明确要求：

- 异类属性默认 `AND`
- 同类属性默认 `OR`
- 5 组强制 OR 特例需要系统硬编码拦截

当前页面仍然是“平铺的 property 列表编辑器”，不是：

- 有分组语义的规则构造器
- 也没有显示或维护真正的 group / node / chain 结构

### Gap 5：默认 pairing pool 规则尚未进入系统

PRD 里有一条很重要：

- 默认池不包含 `RedEye / ODAN / Satellite`
- 只有显式添加对应条件，才解除默认排斥

当前 portal 只是把这些属性项列出来了，但并没有：

- 在真实 pool 构建层强制执行默认排斥
- 也没有给用户明确展示“默认未开启”的系统状态

### Gap 6：existing rules 的编辑能力不完整

当前 `existing pairing properties` 有一个明显边界：

- `Bid` 还是只读展示

也就是说：

- 规则加进 draft 后，并不能像最终产品那样直接完整编辑参数

这会导致一个真实体验问题：

- 修改规则参数时，用户更像是在“删掉重加”
- 不像成熟 PBS 界面里的“直接编辑当前已投规则”

### Gap 7：没有“命中多少条 pairing”的结果反馈

从业务理解上，Pairing 页应该逐步支持：

- 配一条规则
- 看它会命中多少 pairing
- 再决定是否加入 layer

当前完全没有：

- hit count
- real pool preview
- 筛选结果反馈

因此当前用户无法判断一条 generic rule 是太宽还是太窄。

### Gap 8：搜索结果与规则投递尚未打通

PRD 中存在：

- 先查真实 pairing
- 再把筛选条件打包投到某个 layer 的路径

当前页面并没有这条链：

- 搜索结果不是 pairing
- 也没有从搜索结果回填规则组到 layer 的能力

---

## 差距优先级判断

不是所有 gap 都适合同一阶段补齐。当前建议按下面优先级推进。

### P1：先补规则表达模型与 existing row 可编辑

这是下一阶段最值得先做的部分，因为它决定了：

- 当前 Pairing 页面能不能真正承载 AA generic rule
- 后续真实搜索接进来时是否还要重做模型

建议范围：

- existing row 的 `Bid` 直接可编辑
- 明确引入 operator / typed value 的表达层
- 为 `award / avoid`、`any / every` 预留模型位置

### P2：再补 `Search Pairings` 真搜索 + `Specific Bid`

在规则模型站稳后，再接真实 pairing 搜索更合理。

建议范围：

- `Pairing ID` 搜索
- `Pairing ID on Date`
- pairing 结果列表
- mini calendar
- 冲突日期禁用

### P3：最后补 real pool preview / hit count / default pool rules

这是体验和准确性都很重要的一层，但它依赖前两层更稳定的规则模型与真实 pairing 数据。

建议范围：

- 命中条数
- 规则效果预览
- 默认池规则提示与约束执行
- OR 特例拦截

---

## 推荐下一阶段范围

推荐下一阶段不要同时做完所有 gap，而是只做：

### 阶段 A：Pairing Rule Model Hardening

目标：

- 把 `Pairing` 页面从“能展示 generic property 列表”推进到“能更严谨表达 generic pairing rules”

建议包含：

1. existing rule 的 `Bid` 改为可编辑  
2. 引入更清晰的 rule value / operator 模型  
3. 为 `award / avoid`、`any / every` 做前后端可扩展结构  
4. 校准现有 generic properties 的输入控件语义  
5. 保持 `ALL PROPERTIES`、favorites、自动保存链路不坏

不包含：

- 真实 pairing 搜索
- `Pairing ID`
- mini calendar
- hit count

### 为什么先做这个阶段

原因有三个：

1. 当前 Pairing 页的最大问题不是“没有真实列表”，而是“规则表达还不完整”
2. 如果表达模型不稳定，后续 `Search Pairings` 接进来还要返工
3. 这个阶段投入更可控，也最符合当前 portal 已经在做的方向

---

## 验收标准

当这个 gap spec 被采用后，下一阶段的验收标准建议按阶段定义。

### 阶段 A 验收

- existing pairing rule 可直接编辑参数
- generic rule 的参数类型与展示语义更接近 AA / PRD
- 不破坏现有：
  - favorites
  - 分页
  - 自动保存
  - layer 绑定
- `Pairing` 页面仍然明确是 rule editor，而不是误装成 real search page

### 后续阶段 B 验收

- `Search Pairings` 可以按真实 pairing 资源查询
- 支持 `Pairing ID`
- 结果带 mini calendar
- 冲突日期不可投标

### 后续阶段 C 验收

- 可看到规则命中的 pairing 数量或预览
- 默认池规则开始生效
- OR 特例规则开始受到系统约束

---

## 结论

截至 2026-04-23，`Pairing` 页面已经完成：

- generic property catalog
- real draft persistence
- favorites persistence
- 基础列表与交互壳

但仍未完成 AA / PRD 里 Pairing 的完整能力。

最合理的下一步不是直接上真实 `Search Pairings`，而是先补：

- `Pairing rule model hardening`

也就是先把“规则本身怎么表达、怎么编辑、怎么持久化得更像 PBS”这层做稳，再继续补：

- `Specific Bid`
- 真搜索
- 命中结果预览

这会让后续 Pairing 的每一步都更少返工。
