# F8 API 字段差异对照表

> 采集日期：2026-05-27
> 数据范围：2026-05-27 ~ 2026-05-31（5天）
> 对比基准：data-migration 程序当前使用的字段 vs API 实际返回的字段

---

## 1. Crew (`/crew`)

API 返回 824 条记录。

### 1.1 顶层字段

| API 字段 | 类型 | 示例值 | 程序状态 | 当前映射目标 | 备注 |
|----------|------|--------|----------|-------------|------|
| `owner` | string | `"F8"` | 已使用 | — | |
| `crewId` | string | `"296"` | 已使用 | `crew.interface_id` / `crew.crew_id` | |
| `firstName` | string | `" Peter "` | 已使用 | `crew.first_name` | 注意：值含前后空格 |
| `middleName` | string | `""` | 已使用 | `crew.middle_name` | |
| `lastName` | string | `"Adams"` | 已使用 | `crew.last_name` | |
| `nickName` | string | `""` | 已使用 | `crew.preferred_name` | |
| `gender` | string | `"Male"` | 已使用 | `crew.gender` | |
| `birthday` | datetime | `"1965-12-23T00:00:00Z"` | 已使用 | `crew.birthday` | |
| `seniorityNum` | int | `28` | 已使用 | `crew.seniority_num` | |
| `telephone` | string | `"647-449-2247"` | 已使用 | `crew.tel` | |
| `homeAddress` | string | `"Yellow Brick Road"` | 已使用 | `crew.home_address` | |
| `cityOfResidence` | string | `"Brampton"` | 已使用 | `crew.city_of_residence` | |
| `stateOfResidence` | string | `""` | 已使用 | `crew.state_of_residence` | |
| `countryOfResidence` | string | `"CA"` | 已使用 | `crew.country_of_residence` | |
| `postalCode` | string | `"L6V4L1"` | 已使用 | `crew.postal_code` | |
| `workEmail` | string | `"peter.adams@flyflair.com"` | 已使用 | `crew.email_addr` | |
| `bases` | array | — | 已使用 | → `crew_base` 表 | |
| `ranks` | array | — | 已使用 | → `crew_rank` / `crew_status` 表 | |
| `fleets` | array | — | 已使用 | → `crew_fleet` 表 | |
| `certificates` | array | — | 已使用 | → `crew_certificate` 表 | |
| `qualifications` | array | — | 已使用 | → `crew_qualification` 表 | |
| **`contractType`** | **string** | **`"Pilots"`** | **NEW** | ? | **新增字段** |
| **`joinDate`** | **datetime** | **`"2018-06-22T00:00:00Z"`** | **NEW** | ? | **新增字段** |
| **`lastModifiedDt`** | **datetime** | **`"2025-09-09T18:27:13Z"`** | **NEW** | ? | **新增字段，各层级都有** |

### 1.2 bases[]

| API 字段 | 类型 | 示例值 | 程序状态 | 当前映射目标 |
|----------|------|--------|----------|-------------|
| `base` | string | `"YYZ"` | 已使用 | `crew_base.base` |
| `effDt` | datetime | `"2018-06-22T00:00:00Z"` | 已使用 | `crew_base.eff_dt` |
| `expDt` | datetime | `"2055-09-16T23:59:59Z"` | 已使用 | `crew_base.exp_dt` |
| `isPrimary` | bool | `true` | 已使用 | `crew_base.is_prime_base` |
| `crewId` | string | `"296"` | **NEW** | ? |
| `owner` | string | `"F8"` | **NEW** | ? |
| `lastModifiedDt` | datetime | `"2025-09-09T18:27:13Z"` | **NEW** | ? |

### 1.3 ranks[]

| API 字段 | 类型 | 示例值 | 程序状态 | 当前映射目标 |
|----------|------|--------|----------|-------------|
| `rank` | string | `"CA"` | 已使用 | `crew_rank.rank` |
| `effDt` | datetime | `"2018-06-22T00:00:00Z"` | 已使用 | `crew_rank.eff_dt` |
| `expDt` | datetime | `"2199-12-31T23:59:59Z"` | 已使用 | `crew_rank.exp_dt` |
| `crewId` | string | `"296"` | **NEW** | ? |
| `owner` | string | `"F8"` | **NEW** | ? |
| `lastModifiedDt` | datetime | `"2025-09-09T18:27:13Z"` | **NEW** | ? |

### 1.4 fleets[]

| API 字段 | 类型 | 示例值 | 程序状态 | 当前映射目标 |
|----------|------|--------|----------|-------------|
| `fleet` | string | `"737"` | 已使用 | `crew_fleet.fleet_specific` |
| `effDt` | datetime | `"2018-06-22T00:00:00Z"` | 已使用 | `crew_fleet.eff_dt` |
| `expDt` | datetime | `"2199-12-31T23:59:59Z"` | 已使用 | `crew_fleet.exp_dt` |
| `crewId` | string | `"296"` | **NEW** | ? |
| `owner` | string | `"F8"` | **NEW** | ? |
| `lastModifiedDt` | datetime | `"2025-09-09T18:27:13Z"` | **NEW** | ? |

### 1.5 certificates[]

| API 字段 | 类型 | 示例值 | 程序状态 | 当前映射目标 | 备注 |
|----------|------|--------|----------|-------------|------|
| `certificate` | string | `"LIC"` | 已使用 | `crew_certificate.certificate` | |
| `expDt` | datetime | `"2034-01-01T00:00:00Z"` | 已使用 | `crew_certificate.exp_dt` | |
| `isValid` | bool | `true` | 已使用 | `crew_certificate.is_valid` | |
| ~~`effDt`~~ | — | — | **MISSING** | `crew_certificate.eff_dt` | **API 不再返回，程序 fallback 到 `1970-01-01`** |
| `crewId` | string | `"296"` | **NEW** | ? | |
| `owner` | string | `"F8"` | **NEW** | ? | |
| `firstName` | string | `"PETER"` | **NEW** | ? | 证书上的姓名 |
| `middleName` | string | `"NORMAN"` | **NEW** | ? | |
| `lastName` | string | `"ADAMS"` | **NEW** | ? | |
| **`issueAgency`** | **string** | **`"TRANSPORT CANADA"`** | **NEW** | ? | **签发机构** |
| **`issueCountry`** | **string** | **`"CA"`** | **NEW** | ? | **签发国家** |
| **`certCountry`** | **string** | **`"CA"`** | **NEW** | ? | **证书国家** |
| `lastModifiedDt` | datetime | `"2024-03-19T18:39:56Z"` | **NEW** | ? | |

### 1.6 qualifications[]

| API 字段 | 类型 | 示例值 | 程序状态 | 当前映射目标 |
|----------|------|--------|----------|-------------|
| `qualification` | string | `"737"` | 已使用 | `crew_qualification.qualification` |
| `effDt` | datetime | `"2018-06-22T00:00:00Z"` | 已使用 | `crew_qualification.eff_dt` |
| `expDt` | datetime | `"2199-12-31T23:59:59Z"` | 已使用 | `crew_qualification.exp_dt` |
| `isValid` | bool | `true` | 已使用 | `crew_qualification.is_valid` |
| `crewId` | string | `"296"` | **NEW** | ? |
| `owner` | string | `"F8"` | **NEW** | ? |
| **`fleet`** | **string** | **`"737"`** | **NEW** | ? | **关联的机队** |
| `lastModifiedDt` | datetime | `"2025-09-09T18:27:13Z"` | **NEW** | ? |

---

## 2. Flight (`/flight`)

API 返回 280 条记录。

| API 字段 | 类型 | 示例值 | 程序状态 | 当前映射目标 | 备注 |
|----------|------|--------|----------|-------------|------|
| `owner` | string | `"F8"` | 已使用 | 硬编码 `"F8"` | |
| `legNo` | int | `286685` | 已使用 | `flt_num` 的 fallback | |
| `datOp` | datetime | `"2026-05-26 00:00:00"` | 已使用 | → `flt_dt`（经 UTC-7 转换） | |
| `fltId` | string | `"286685"` | 已使用 | `flight.interface_flt_id` | |
| `fltNum` | string | `"F82635"` | 已使用 | `flight.flt_num` | |
| `depStn` | string | `"PUJ"` | 已使用 | `flight.dep_arp` / `act_dep_arp` | |
| `arrStn` | string | `"YYZ"` | 已使用 | `flight.arv_arp` / `act_arv_arp` | |
| `status` | string | `"Completed"` | 已使用 | 仅在 model 中声明，未写入DB | |
| `std` | datetime | `"2026-05-26 19:55:00"` | 已使用 | `flight.sch_dep_dt_utc` | |
| `sta` | datetime | `"2026-05-27 00:30:00"` | 已使用 | `flight.sch_arv_dt_utc` | |
| `atd` | datetime | `"2026-05-26 19:47:00"` | 已使用 | `flight.act_dep_dt_utc` | |
| `ata` | datetime | `"2026-05-27 00:27:00"` | 已使用 | `flight.act_arv_dt_utc` | |
| `acGrp` | string | `"7M8"` | 已使用 | `flight.fleet` | |
| `acReg` | string | `"C-FLGD"` | 已使用 | `flight.register` | |
| **`etd`** | **datetime\|null** | **`null`** | **NEW** | ? | **预计出发时间** |
| **`eta`** | **datetime\|null** | **`"2026-05-27 00:19:00"`** | **NEW** | ? | **预计到达时间** |
| **`toff`** | **datetime** | **`"2026-05-26 20:00:00"`** | **NEW** | ? | **实际起飞 (takeoff)** |
| **`tdwn`** | **datetime** | **`"2026-05-27 00:09:00"`** | **NEW** | ? | **实际落地 (touchdown)** |
| **`stc`** | **string\|null** | **`"J"`** | **NEW** | ? | **service type code** |
| **`divCode`** | **string\|null** | **`null`** | **NEW** | ? | **航线代码** |

---

## 3. Pairing (`/pairing`)

API 返回 278 条记录。

### 3.1 顶层字段

| API 字段 | 类型 | 示例值 | 程序状态 | 当前映射目标 | 备注 |
|----------|------|--------|----------|-------------|------|
| `pairingId` | string | `"109086"` | 已使用 | `pairing.interface_id` | |
| `pairingDt` | datetime | `"2026-05-23 00:00:00"` | 已使用 | `pairing.pairing_dt` | |
| `label` | string | `"YYZ/YYC/YVR/..."` | 已使用 | `pairing.label` | |
| `base` | string | `"YYZ"` | 已使用 | `pairing.base` | |
| `fleet` | string | `"737"` | 已使用 | `pairing.fleet` | |
| `durationDays` | int | `4` | 已使用 | `pairing.duration_days` | |
| `pairingCompositions` | array | — | 已使用 | → `pairing_composition` 表 | |
| `pairingDutyList` | array | — | 已使用 | → `pairing_duty` 表 | duty 数组 key 为此名 |
| **`schStrDtUtc`** | **datetime** | **`"2026-05-23 13:56:00"`** | **NEW** | ? | **计划开始时间（之前从首个 duty 推导）** |
| **`schEndDtUtc`** | **datetime** | **`"2026-05-28 00:30:00"`** | **NEW** | ? | **计划结束时间（之前从末个 duty 推导）** |
| **`actStrDtUtc`** | **datetime** | **`"2026-05-23 13:00:00"`** | **NEW** | ? | **实际开始时间** |
| **`actEndDtUtc`** | **datetime** | **`"2026-05-28 00:45:00"`** | **NEW** | ? | **实际结束时间** |
| **`assignmentGroup`** | **string** | **`"FLY"`** | **NEW** | ? | **之前硬编码 `"FLY"`** |
| **`assignment`** | **string** | **`"FLY"`** | **NEW** | ? | **之前硬编码 `"FLY"`** |
| **`division`** | **string** | **`"P"`** | **NEW** | ? | **之前从 compositions 推导** |
| **`filiale`** | **string** | **`""`** | **NEW** | ? | **之前硬编码 `"F8"`** |
| **`tafb`** | **int** | **`4`** | **NEW** | ? | **Time Away From Base** |
| **`comments`** | **string** | **`""`** | **NEW** | ? | **pairing 级备注** |
| **`changeLabel`** | **string** | **`"I"`** | **NEW** | ? | **变更标记** |
| **`perDiemMins`** | **int** | **`0`** | **NEW** | ? | **补贴分钟数** |
| **`perDiemMinsAdjustment`** | **int** | **`0`** | **NEW** | ? | **补贴调整** |
| **`fmLhPerDiemMins`** | **int** | **`0`** | **NEW** | ? | |
| **`wpMins`** | **int** | **`1475`** | **NEW** | ? | **工作分钟数** |
| **`wpMinsAdjustment`** | **int** | **`0`** | **NEW** | ? | **工作分钟数调整** |

### 3.2 pairingCompositions[]

| API 字段 | 类型 | 示例值 | 程序状态 | 当前映射目标 | 备注 |
|----------|------|--------|----------|-------------|------|
| `actingRank` | string | `"CAP"` | 已使用 | `pairing_composition.acting_rank` | |
| `planValue` | int | `1` | 已使用 | `pairing_composition.plan_value` | |
| **`division`** | **string** | **`"P"`** | **NEW** | ? | **之前从 actingRank 推导 P/C** |

### 3.3 pairingDutyList[]

| API 字段 | 类型 | 示例值 | 程序状态 | 当前映射目标 | 备注 |
|----------|------|--------|----------|-------------|------|
| `dutySeq` | int | `1` | 已使用 | `pairing_duty.duty_seq` | |
| `assignment` | string | `"FLY"` | 已使用 | `pairing_duty.assignment` | |
| `strArp` | string | `"YYZ"` | 已使用 | `pairing_duty.str_arp` | |
| `endArp` | string | `"YVR"` | 已使用 | `pairing_duty.end_arp` | |
| `actStrDtUtc` | datetime | `"2026-05-23 13:00:00"` | 已使用 | `pairing_duty.act_str_dt_utc` | |
| `actEndDtUtc` | datetime | `"2026-05-23 23:57:00"` | 已使用 | `pairing_duty.act_end_dt_utc` | |
| `creditedMinutes` | int | `360` | 已使用 | `pairing_duty.credited_minutes` | |
| `comments` | string | `""` | 已使用 | `pairing_duty.comments` | |
| `pairingDutyNodes` | array | — | 已使用 | → `pairing_duty_node` 表 | |
| `pairingDutySegments` | array | — | 已使用 | → `pairing_duty_segment` 表 | |
| ~~`dutyId`~~ | — | — | **MISSING** | 程序未直接写入 | **API 不再返回，不影响** |
| ~~`arrArp`~~ | — | — | **MISSING** | 程序有 fallback 到 `endArp` | **已改名为 `endArp`** |
| ~~`creditMin`~~ | — | — | **MISSING** | 程序有 fallback 到 `creditedMinutes` | **已改名为 `creditedMinutes`** |
| **`fdpDiscretionMin`** | **int** | **`0`** | **NEW** | ? | **FDP 自由裁量分钟** |
| **`maxFdpMin`** | **int** | **`0`** | **NEW** | ? | **最大 FDP 分钟** |
| **`minRestMin`** | **int** | **`600`** | **NEW** | ? | **最小休息分钟** |
| **`actRestMin`** | **int** | **`600`** | **NEW** | ? | **实际休息分钟** |
| **`layoverNits`** | **int** | **`1`** | **NEW** | ? | **过夜次数** |
| **`planFlightMin`** | **int** | **`360`** | **NEW** | ? | **计划飞行分钟** |
| **`planFdpMin`** | **int** | **`657`** | **NEW** | ? | **计划 FDP 分钟** |
| **`actFlightMin`** | **int** | **`340`** | **NEW** | ? | **实际飞行分钟** |
| **`actFdpMin`** | **int** | **`657`** | **NEW** | ? | **实际 FDP 分钟** |
| **`actualDutyMinutes`** | **int** | **`657`** | **NEW** | ? | **实际 duty 分钟** |
| **`briefMin`** | **int** | **`56`** | **NEW** | ? | **签到时间分钟** |
| **`debriefMin`** | **int** | **`15`** | **NEW** | ? | **签退时间分钟** |

### 3.4 pairingDutyNodes[]

| API 字段 | 类型 | 示例值 | 程序状态 | 当前映射目标 |
|----------|------|--------|----------|-------------|
| `sequence` | int | `1` | 已使用 | `pairing_duty_node.sequence` |
| `node` | string | `"PICKUP"` | 已使用 | `pairing_duty_node.node` |
| `airport` | string | `"YYZ"` | 已使用 | `pairing_duty_node.airport` |
| `startUtc` | datetime | `"2026-05-23 13:00:00"` | 已使用 | `pairing_duty_node.start_utc` |
| `endUtc` | datetime | `"2026-05-23 13:00:00"` | 已使用 | `pairing_duty_node.end_utc` |

> ~~`arp`~~ — 程序代码有 fallback 读 `arp`，但 API 实际用 `airport`，无影响。

### 3.5 pairingDutySegments[]

| API 字段 | 类型 | 示例值 | 程序状态 | 当前映射目标 | 备注 |
|----------|------|--------|----------|-------------|------|
| `dutySeq` | int | `1` | 已使用 | `pairing_duty_segment.duty_seq` | |
| `segSeq` | int | `1` | 已使用 | `pairing_duty_segment.seg_seq` | |
| `fltId` | string | `"323562"` | 已使用 | `pairing_duty_segment.interface_flt_id` / 关联 `flight` | |
| `fltDt` | datetime | `"2026-05-23 00:00:00"` | 已使用 | `pairing_duty_segment.flt_dt` | |
| `assignment` | string | `"FLY"` | 已使用 | `pairing_duty_segment.assignment` | |
| `airline` | string | `""` | 已使用 | `pairing_duty_segment.airline` | |
| `fltNum` | string | `"F8623"` | 已使用 | `pairing_duty_segment.flt_num` | |
| `depArp` | string | `"YYZ"` | 已使用 | `pairing_duty_segment.dep_arp` | |
| `arvArp` | string | `"YYC"` | 已使用 | `pairing_duty_segment.arv_arp` | |
| `fleet` | string | `"7M8"` | 已使用 | `pairing_duty_segment.fleet` | |
| `actStrDtUtc` | datetime | `"2026-05-23 13:56:00"` | 已使用 | `pairing_duty_segment.act_str_dt_utc` | |
| `actEndDtUtc` | datetime | `"2026-05-23 18:03:00"` | 已使用 | `pairing_duty_segment.act_end_dt_utc` | |
| **`isLongTransit`** | **int** | **`0`** | **NEW** | ? | **是否长过站** |

> ~~`arrArp`~~ — 程序代码有 fallback 读 `arrArp`，但 API 实际返回 `arvArp`，无影响。

---

## 4. RosterFlight (`/rosterFlight`)

API 返回 1751 条记录。

### 4.1 顶层字段

| API 字段 | 类型 | 示例值 | 程序状态 | 当前映射目标 | 备注 |
|----------|------|--------|----------|-------------|------|
| `rosterFlightId` | int | `2661062` | 已使用 | — (未直接写入) | |
| `rosterId` | int | `5510` | 已使用 | `roster.live_id` | |
| `pairingId` | int | `109075` | 已使用 | → 关联 `pairing.interface_id` | |
| `fltId` | int | `2661062` | 已使用 | — (未直接写入) | |
| `depArp` | string | `"GDL"` | 已使用 | — (未直接写入) | |
| `arrArp` | string | `"YYZ"` | 已使用 | — (未直接写入) | |
| `dutyStrUtc` | datetime | `"2026-05-26T13:10:00Z"` | 已使用 | — (未直接写入) | |
| `pairingStrUtc` | datetime | `"2026-05-26T14:05:00Z"` | 已使用 | `roster_flight.pairing_start_utc` | |
| `fltType` | string | `""` | 已使用 | → 转换为 `roster_flight.assignment` | |
| `crew` | object | — | 已使用 | → 展开到 roster/roster_flight 各字段 | |
| **`dutyId`** | **int** | **`0`** | **NEW** | ? | |
| **`dutySeq`** | **int** | **`1`** | **NEW** | ? | |
| **`segSeq`** | **int** | **`1`** | **NEW** | ? | |
| **`airline`** | **string** | **`"F8"`** | **NEW** | ? | |
| **`flightNum`** | **string** | **`"2661"`** | **NEW** | ? | **注意：不含航司前缀** |
| **`suffix`** | **string** | **`""`** | **NEW** | ? | |
| **`fltDtUtc`** | **string** | **`"2026-05-26"`** | **NEW** | ? | **航班日期** |
| **`stdUtc`** | **datetime** | **`"2026-05-26T20:10:00Z"`** | **NEW** | ? | **计划出发** |
| **`staUtc`** | **datetime** | **`"2026-05-27T00:55:00Z"`** | **NEW** | ? | **计划到达** |
| **`etdUtc`** | **string** | **`""`** | **NEW** | ? | **预计出发** |
| **`etaUtc`** | **datetime** | **`"2026-05-27T00:38:00Z"`** | **NEW** | ? | **预计到达** |
| **`atdUtc`** | **datetime** | **`"2026-05-26T20:10:00Z"`** | **NEW** | ? | **实际出发** |
| **`ataUtc`** | **datetime** | **`"2026-05-27T00:40:00Z"`** | **NEW** | ? | **实际到达** |
| **`actDepArp`** | **string** | **`"GDL"`** | **NEW** | ? | **实际出发机场** |
| **`actArrArp`** | **string** | **`"YYZ"`** | **NEW** | ? | **实际到达机场** |
| **`dutyEndUtc`** | **datetime** | **`"2026-05-27T00:55:00Z"`** | **NEW** | ? | |
| **`fleet`** | **string** | **`"7M8"`** | **NEW** | ? | |
| **`regNo`** | **string** | **`"7M8"`** | **NEW** | ? | **注册号** |
| **`status`** | **string** | **`"Confirmed"`** | **NEW** | ? | **航班状态** |
| **`assignmentGroup`** | **string** | **`"Crewing"`** | **NEW** | ? | **之前从 crew 子对象取** |
| **`complements`** | **array** | **`[]`** | **NEW** | ? | |
| **`trainings`** | **array** | **`[]`** | **NEW** | ? | |
| **`lastModifiedDt`** | **datetime** | **`"2025-09-09T18:27:13Z"`** | **NEW** | ? | |

### 4.2 crew 子对象

| API 字段 | 类型 | 示例值 | 程序状态 | 当前映射目标 | 备注 |
|----------|------|--------|----------|-------------|------|
| `crewId` | string | `"296"` | 已使用 | `roster.crew_id` / `roster_flight.crew_id` | |
| `crewName` | string | `"Peter Adams"` | 已使用 | — (未直接写入) | |
| `actingRank` | string | `"CA"` | 已使用 | `roster.acting_rank` / `roster_flight.acting_rank` | |
| `activeRank` | string | `"CA"` | 已使用 | `roster_flight.active_rank` | |
| `division` | string | `"P"` | 已使用 | `roster_flight.division` | |
| `seqOrder` | int | `28` | 已使用 | `roster_flight.seq_order` | |
| ~~`assignmentGroup`~~ | — | — | **MISSING** | `roster.assignment_group` | **移到 top_level 了** |
| **`assignment`** | **string** | **`"F82661"`** | **NEW** | ? | |
| **`crewFirstName`** | **string** | **`"Peter"`** | **NEW** | ? | |
| **`crewMiddleName`** | **string** | **`""`** | **NEW** | ? | |
| **`crewLastName`** | **string** | **`"Adams"`** | **NEW** | ? | |
| **`gender`** | **string** | **`"Male"`** | **NEW** | ? | |
| **`nationality`** | **string** | **`"CA"`** | **NEW** | ? | |
| **`owner`** | **string** | **`"F8"`** | **NEW** | ? | |
| **`telephone`** | **string** | **`"647-449-2247"`** | **NEW** | ? | |

---

## 5. RosterGround (`/rosterGround`)

API 返回 4515 条记录（Unknown 类型，Leave 类型返回 0 条）。

| API 字段 | 类型 | 示例值 | 程序状态 | 当前映射目标 | 备注 |
|----------|------|--------|----------|-------------|------|
| `crewId` | string | — | 已使用 | `roster_ground.crew_id` | |
| `startTimeUtc` | datetime | — | 已使用 | `roster_ground.str_dt_utc` | |
| `endTimeUtc` | datetime | — | 已使用 | `roster_ground.end_dt_utc` | |
| `assignment` | string | — | 已使用 | `roster_ground.assignment` | |
| `assignmentGroup` | string | — | 已使用 | `roster_ground.assignment_group` | |
| `location` | string | — | 已使用 | `roster_ground.location` | |
| `division` | string | — | 已使用 | `roster_ground.division` | |
| `label` | string | — | 已使用 | `roster_ground.label` | |
| `trainingRole` | string | — | 已使用 | `roster_ground.role` | |
| **`fltId`** | **string** | — | **NEW** | ? | |
| **`pairingId`** | **string** | — | **NEW** | ? | |
| **`owner`** | **string** | — | **NEW** | ? | |
| **`trainings`** | **array** | — | **NEW** | ? | **培训信息** |
| **`lastModifiedDt`** | **datetime** | — | **NEW** | ? | |

---

## 6. Manday (`/manday`)

API 返回 1700 条记录。

| API 字段 | 类型 | 示例值 | 程序状态 | 当前映射目标 | 备注 |
|----------|------|--------|----------|-------------|------|
| `crewId` | string | `"274"` | 已使用 | `crew_manday_fd.crew_id` / `crew_manday_cc_am.crew_id` | |
| `crewBaseDt` | string | `"2026-05-27"` | 已使用 | `.crew_base_dt` | |
| `blh` | int | `440` | 已使用 | `.blh` | |
| `fdp` | int | `640` | 已使用 | `.fdp` | |
| `dp` | int | `655` | 已使用 | `.dp` | |
| `credit` | float | `0` | 已使用 | `.credit` | |
| **`dt`** | **int** | **`0`** | **NEW** | ? | **待确认与 `dp` 的关系** |
| **`owner`** | **string** | **`"F8"`** | **NEW** | ? | |

---

## 关键变更总结

### 需要处理的问题

| # | 端点 | 问题 | 影响 | 优先级 |
|---|------|------|------|--------|
| 1 | crew/certificates | `effDt` 字段不再返回 | `crew_certificate.eff_dt` 会 fallback 到 `1970-01-01` | **HIGH** |
| 2 | rosterFlight/crew | `assignmentGroup` 移到 top_level | `roster.assignment_group` 取值会失败，fallback 到 `"FLY"` | **HIGH** |
| 3 | pairing/duty | `creditMin` 改名 `creditedMinutes` | 程序已有 fallback，**无影响** | LOW |
| 4 | pairing/duty | `arrArp` 改名 `endArp` | 程序已有 fallback，**无影响** | LOW |
| 5 | pairing/duty | `dutyId` 不再返回 | 程序未直接使用，**无影响** | LOW |

### 可以利用的新数据

| # | 端点 | 字段 | 价值 |
|---|------|------|------|
| 1 | pairing | `schStrDtUtc`/`schEndDtUtc`/`actStrDtUtc`/`actEndDtUtc` | 可直接取代从 duty 推导的逻辑 |
| 2 | pairing | `division`/`assignment`/`assignmentGroup`/`filiale` | 可直接取代硬编码/推导逻辑 |
| 3 | pairing | `tafb` | 可直接写入 `pairing.tafb` |
| 4 | pairing/duty | 完整的 duty 统计字段 | 可写入 `pairing_duty` 对应列（已预留但当前填 0） |
| 5 | pairing/compositions | `division` | 可直接取代从 rank 推导 P/C 的逻辑 |
| 6 | crew | `contractType`/`joinDate` | 新增员工信息 |
| 7 | flight | `etd`/`eta`/`toff`/`tdwn`/`stc` | 更丰富的航班时间和类型信息 |
| 8 | rosterFlight | 完整航班时间/状态/机型 | 之前只用于 roster 关联，现在可获得完整航班信息 |
| 9 | 全部 | `lastModifiedDt` | 可用于增量同步判断 |
