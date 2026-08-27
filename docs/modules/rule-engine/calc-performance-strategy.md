# 计算结果更新策略 — 控制计算量

## 核心原则

**不全量算，只算变化的；不实时算，按需算。**

---

## 策略一：脏标记 + 按需计算

不主动计算，只标记"需要重算"，在需要使用时才真正计算。

### calc_result 增加脏标记字段

```sql
alter table calc_result add column is_dirty boolean not null default false;
alter table calc_result add column dirty_reason varchar(50);
```

### 流程

```
排班变更（如修改 Pairing #123 的航段）
  → 不立即重算
  → 只标记: UPDATE calc_result SET is_dirty = true WHERE target_type='PAIRING' AND target_id=123
  → 同时标记关联的 Crew: is_dirty = true（累计值可能变了）

Gantt 请求 Pairing #123 的数据
  → live-server 查 calc_result，发现 is_dirty = true
  → 调法规引擎重算（只算这一个环）
  → 更新 calc_result，is_dirty = false
  → 返回最新数据

Gantt 请求 Pairing #456（未变更）
  → 查 calc_result，is_dirty = false
  → 直接返回缓存数据，不重算
```

---

## 策略二：影响范围精确定位

一次操作只标记受影响的对象为 dirty，不扩散。

### 变更 → 影响范围

| 操作 | 标脏范围 | 不影响 |
|------|---------|--------|
| 修改 Pairing #123 的航段 | Pairing #123 + 涉及的 Crew | 其他 Pairing |
| Crew C001 分配新环 | Crew C001 + 该 Pairing | 其他 Crew |
| 航班时刻变更 Flight #456 | 包含该航班的所有 Pairing | 不含该航班的 Pairing |
| Crew 资质变更 | 该 Crew 记录 | 其 Pairing 不受影响（资质不影响 FDP 计算） |
| 批量导入航班 | 被导入的 Flight + 关联 Pairing | 未变更的 Flight |

### 实现方式

```typescript
// live-server 中的变更事件处理
async function onPairingChanged(pairingId: bigint) {
  // 只标脏这一个环
  await db.update(calcResult)
    .set({ isDirty: true, dirtyReason: 'pairing_modified' })
    .where(and(eq(calcResult.targetType, 'PAIRING'), eq(calcResult.targetId, pairingId)))

  // 找到关联的 Crew，标脏累计值
  const crewIds = await getCrewByPairing(pairingId)
  if (crewIds.length > 0) {
    await db.update(calcResult)
      .set({ isDirty: true, dirtyReason: 'related_pairing_changed' })
      .where(and(eq(calcResult.targetType, 'CREW'), inArray(calcResult.targetId, crewIds)))
  }
}
```

---

## 策略三：分层计算频率

不同对象类型用不同的更新策略。

| target_type | 计算策略 | 说明 |
|-------------|---------|------|
| **PAIRING** | 脏标记 + 按需计算 | 只在 Gantt 查看或法规检查时才重算脏的环 |
| **CREW** | 脏标记 + 按需计算 + 每日兜底 | 排班变更时标脏，查看时重算；每日凌晨批量刷新未访问的脏记录 |
| **FLIGHT** | 导入时一次性计算 | 航班数据变更低频，导入时批量算完 |
| **ROSTER** | 月度定时 + 发布时计算 | 不实时算，发布排班时或月度汇总任务时计算 |

### 每日兜底任务（BullMQ）

```typescript
// 每日凌晨 02:00 执行
async function dailyCalcRefresh() {
  // 只处理 dirty 的 CREW 记录（未被 Gantt 按需触发的）
  const dirtyCrew = await db.select()
    .from(calcResult)
    .where(and(eq(calcResult.targetType, 'CREW'), eq(calcResult.isDirty, true)))
    .limit(500) // 分批处理，避免一次性压力过大

  for (const crew of dirtyCrew) {
    await recalculate(crew)
  }
}
```

---

## 策略四：批量操作合并计算

多次操作合并为一次计算，避免重复计算。

```
排班员连续操作：
  10:01:00 修改 Pairing #123 → 标脏
  10:01:05 修改 Pairing #123 → 已经是脏的，跳过
  10:01:10 修改 Pairing #123 → 已经是脏的，跳过
  10:01:30 Gantt 刷新显示 → 发现 #123 is_dirty → 重算一次（不是三次）
```

### 批量导入场景

```typescript
// 批量导入 500 条航班
async function onFlightBatchImport(flightIds: bigint[]) {
  // 1. 批量计算 Flight
  const flightCalcResults = await batchCalcFlights(flightIds)
  await batchUpsertCalcResult('FLIGHT', flightCalcResults)

  // 2. 找到关联的 Pairing，只标脏不立即算
  const affectedPairingIds = await getPairingsByFlights(flightIds)
  await db.update(calcResult)
    .set({ isDirty: true, dirtyReason: 'flight_import' })
    .where(and(
      eq(calcResult.targetType, 'PAIRING'),
      inArray(calcResult.targetId, affectedPairingIds)
    ))
  // Pairing 等 Gantt 查看时再按需重算
}
```

---

## 策略五：跳过无变化的重算

重算前比对版本，如果上游数据未变化则跳过。

```typescript
async function recalculateIfNeeded(targetType: string, targetId: bigint) {
  const existing = await getCalcResult(targetType, targetId)

  if (!existing || !existing.isDirty) {
    return existing // 不脏，直接返回
  }

  // 重算
  const newCalcData = await ruleEngine.calculate(targetType, targetId)

  // 比对结果是否真的变了
  if (JSON.stringify(newCalcData) === JSON.stringify(existing.calcData)) {
    // 数据没变，只清脏标记，不更新 version
    await db.update(calcResult)
      .set({ isDirty: false, dirtyReason: null })
      .where(eq(calcResult.id, existing.id))
    return existing
  }

  // 数据变了，更新
  await db.update(calcResult)
    .set({
      calcData: newCalcData,
      isDirty: false,
      dirtyReason: null,
      computedAt: new Date(),
      version: existing.version + 1
    })
    .where(eq(calcResult.id, existing.id))

  // 数据变了才触发标签刷新
  await refreshTagsForTarget(targetType, targetId, newCalcData)
}
```

---

## 计算量估算

假设一家航司：5000 机组 / 3000 航班/天 / 500 环/天

| 场景 | 全量计算 | 优化后 |
|------|---------|--------|
| 排班员修改 1 个环 | 全量: 500 环 + 5000 Crew | **1 个环 + 2-4 个 Crew** |
| 导入 500 条航班 | 全量: 500 Flight + 500 环 | **500 Flight 立即算 + 环标脏等按需** |
| 每日 Crew 刷新 | 全量: 5000 Crew | **只刷新 dirty 的 Crew（通常 < 200）** |
| Gantt 打开查看 | 全量: 所有可见环 | **只重算 dirty 的可见环** |

---

## 总结

| 策略 | 核心思路 |
|------|---------|
| 脏标记 | 变更时不算，只标脏；使用时才真正计算 |
| 精确定位 | 只标脏受影响的对象，不扩散 |
| 分层频率 | PAIRING/CREW 按需算，FLIGHT 导入时算，ROSTER 定时算 |
| 批量合并 | 连续操作只标脏一次，查看时算一次 |
| 跳过无变化 | 重算后比对结果，没变就不更新标签 |
