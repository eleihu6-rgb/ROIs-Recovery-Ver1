# RosterGround Flight 导入: 5 元组匹配 + act_* 更新 / 不存在新增

## 状态

设计草案，待用户确认后进入实施。

## 背景

connector-server 走 F8 RosterGround 接口拉取 Flight 类型的机组排班记录
（pairingId=0 的单段航班），目前在 live-server 端的
roster-ground-inbound-worker 里通过两套查表来定位对应 flight 行：

1. 先按 interface_flt_id 命中
2. 否则按 flt_num + sch_dep_dt_utc 命中
3. 都没命中就调 createMissingFlight 新建一个最小化 flight 行

问题：
- F8 上游 rosterGround.label 形如 F8001（带 F8 航司二字码前缀）。
- F8 航班入库路径（flight-inbound-worker）会先把 ^${airline} 前缀剥掉
  再写 flight.flt_num，所以 flight 表里存的是 001。
- 两边对 flt_num 的写法不一致，导致 RosterGround 走 fallback 路径创建
  flt_num='F8001' 的脏行；后续 F8 flight 正常导入既匹配不上（flt_num 写法不同），
  也不能按 5 元组识别同一条航班。
- createMissingFlight 直接 INSERT，新建时 act_*=sch_*，不会更新任何已存在行的
  实际时间。

## 目标

1. 在 RosterGround 导入生成 flight 行时，把 2 位航司二字码从原始 label 里
   拆出来：
   - airline = label.slice(0, 2)（即 F8）
   - flt_num = label.slice(2)（即 001）
2. 改用 5 元组 airline / flt_dt / dep_arp / arv_arp / flt_num 匹配已有 flight 行。
3. 命中已有行时，只更新 act_* 字段，原 sch_* 字段保留（不被新数据覆盖）。
4. 未命中时，按现有规则 INSERT 新行（sch_* = act_* = 新时间）。

## 数据流

    F8 rosterGround Flight 记录
      label = "F8001", strDtUtc, endTimeUtc, startLocation, endLocation
            |
            v  connector-server/src/transform/f8/db/transform-roster-ground.ts
            |   label.slice(0,2) -> airline ("F8")
            |   label.slice(2)   -> fltNum  ("001")
            v
    SingleLegFlightRecord { interfaceFltId, label: "001", airline: "F8", ... }
            |  (job.filiale 不再被当作 airline 来源)
            v  live-server/src/workers/roster-ground-inbound-worker.ts
            |
            |  loadFlightLookups: 5 元组 IN 查询 -> byKey
            |
            |  for each rec:
            |    flight = resolveFlight(rec, byKey)        # 5 元组匹配
            |    if flight:  updateActTimes(flight, rec)    # 仅 act_*
            |    else:       insertMissingFlight(rec)       # sch_*=act_*=新时间
            v
    flight 表

## 关键改动

### 1. connector-server/src/transform/f8/db/transform-roster-ground.ts

- transformF8RosterGround(groundRaw, singleLegRaw, crewSet, airline) 新增 airline
  参数（与 transformF8RosterFlight 的 filiale 参数风格一致）。
- 在生成 SingleLegFlightRecord.label 时做拆分：
  - 仅当 r['label'] 长度 >= 3 且前两位大写等于 airline.toUpperCase() 时
    airline = label.slice(0,2), fltNum = label.slice(2)，并写到新字段
    singleLegRecord.airline（在 SingleLegFlightRecord 类型里新增 airline）。
  - 否则 airline 用传入参数做兜底，fltNum 维持 label 原值。
- replay-from-raw.ts 等调用方同步补 airline 参数。
- 两个调用点（f8-sync-orchestrator.ts 的两处 transformF8RosterGround）传入
  filiale。
- 类型 SingleLegFlightRecord 增加 airline: string 字段；测试
  transform-roster-ground-db.test.ts 增加新断言。

### 2. live-server/src/workers/roster-ground-inbound-worker.ts

- loadFlightLookups 改为 5 元组批量查：
    SELECT id, interface_flt_id, flt_num, dep_arp, arv_arp, flt_dt, fleet, airline,
           sch_dep_dt_utc, sch_arv_dt_utc, act_dep_dt_utc, act_arv_dt_utc,
           act_dep_arp, act_arv_arp, blk_min
    FROM   flight
    WHERE  airline IN (...)
      AND  flt_dt   IN (...)
      AND  dep_arp  IN (...)
      AND  arv_arp  IN (...)
      AND  flt_num  IN (...)
  5 元组构建 key = ${airline}|${flt_dt}|${dep_arp}|${arv_arp}|${flt_num}。
  移除原 byIface、byNumTime 两套映射。
- resolveFlight(rec, byKey) 改用 5 元组 key。
- createMissingFlight 重构为：
  - 命中（resolveFlight 返回非空）：执行
    UPDATE flight SET act_dep_dt_utc=$1, act_arv_dt_utc=$2, updated_by='F8_IMPORT',
    updated_at=now() WHERE id=$3
    累加 result.updated，不重写任何 sch_*。
  - 未命中：保持原 INSERT ... ON CONFLICT (interface_flt_id) DO UPDATE 行为；
    注意此时 fltNum/airline 已是拆分后的规范值。
- 移除 interface_flt_id 早返回路径带来的副作用（已经包含在上面的 5 元组中，
  多份相同 interface_flt_id 的脏行也会被规范化）。

### 3. 测试更新

- live-server/src/__tests__/unit/roster-ground-inbound-worker.test.ts:
  - 把既有用例里的 flt_num: 'F8001' 改成 flt_num: '001'，airline: 'F8'。
  - processRosterGroundImportJob 直接调用时，singleLegRecords 改为带
    airline: 'F8'。
  - 新增一条 5 元组命中测试：mock 一个 5 元组行，断言 UPDATE flight 出现
    且 act_dep_dt_utc / act_arv_dt_utc 被刷新、sch_dep_dt_utc 没出现在
    SET 子句；同时 result.updated >= 1。
  - 新增一条 5 元组未命中测试：断言走 INSERT flight 路径，写入拆分后的
    flt_num='001'。
- connector-server/src/__tests__/unit/transform-roster-ground-db.test.ts:
  - 单段用例 label: 'F8001' -> singleLegRecords[0].airline === 'F8'、
    singleLegRecords[0].label === '001'。
  - 增一个 label 不带前缀 / 长度 < 3 的兜底用例。

## 不在范围

- 不动 flight-inbound-worker.ts（F8 正常航班导入保持 flt_num 剥前缀的现有
  行为）。
- 不动 roster-inbound-worker.ts、pairing-inbound-worker.ts。
- 不重写 RosterGroundRecord 的地面（non-Flight）字段。
- 不引入 schema 迁移；flight 表已有 airline / flt_dt / dep_arp / arv_arp / flt_num
  五列。

## 验证范围

- cd connector-server && pnpm vitest run src/__tests__/unit/transform-roster-ground-db.test.ts
- cd live-server && pnpm vitest run src/__tests__/unit/roster-ground-inbound-worker.test.ts
- 触达了 SingleLegFlightRecord 类型，需要再跑：
  - cd live-server && pnpm vitest run src/__tests__/unit/scenario-import-pbs-material-route.test.ts
  - live-server 里所有 import RosterGroundImportJob / SingleLegFlightRecord 的
    测试。
  - 任何覆盖到 transformF8RosterGround 的间接调用（replay-from-raw.ts）
    也需在 vitest 列表里 grep 一遍。
