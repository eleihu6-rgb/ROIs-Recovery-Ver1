# F8 航空全量第三方接口对接正式文档（含完整JSON示例）

**文档版本**：V1\.2 正式开发版

> **更新记录（2026\-05\-28）**：依据 F8 API 最新返回字段对齐 connector\-server 同步逻辑。
> - Flight 新增 `etd` / `eta` / `toff` / `tdwn` / `stc` / `divCode`。
> - Pairing 新增顶层 `schStrDtUtc` / `actStrDtUtc` 等时间、`assignmentGroup` / `assignment` / `division` / `tafb` / `comments` / 津贴与工时分钟字段，duty 新增完整统计分钟字段，segment 新增 `isLongTransit`；移除已废弃的 `arrArp` / `arp` / `creditMin` / `dutyId` 兼容回退。
> - 新增 **RosterGround** 接口（按 assignment 类型轮询）：非 Flight 类型写入地面任务，Flight 且 `pairingId=0` 的单段任务物化为合成 pairing\+roster。

**运行环境**：Dev 开发专属环境

**传输协议**：HTTPS 加密传输

**统一请求方式**：POST 无例外

**统一数据格式**：标准 JSON

**全局时间规范**：所有入参、返参时间全部为 UTC 标准时间

**对接前置要求**：全部业务接口强制依赖全局 Token 鉴权，无Token直接拦截报错

---

## 全局前置规范（开发必看）

1、优先调用**获取令牌认证接口**，合法获取全局 accessToken；

2、后续所有机组、航班、配对、排班类业务接口，请求头固定携带：AuthorizationToken=有效令牌；

3、令牌临近过期/返回401/403报错，立即重新刷新令牌，无需改动其他业务参数；

4、全量接口禁止私自篡改固定公共参数，超时、网络波动需配置重试策略。

---

## 一、统一认证接口：Authentication 获取全局访问令牌

### 1\. 基础接口元信息

**接口名称**：获取业务访问令牌

**请求请求地址**：https://ceje1h57tg\.execute\-api\.ca\-central\-1\.amazonaws\.com/Dev/third/auth/getToken

**请求方式**：POST

**使用场景**：系统启动初始化、令牌过期刷新、每日定时预热鉴权

### 2\. 接口入参（Body 一级JSON参数）

|参数字段名|数据类型|是否必填|字段业务说明|
|---|---|---|---|
|clientId|字符串 String|是|系统固定密钥标识，全局不可修改，固定值：ROIS|
|timestamp|数字 Number|是|当前系统10位秒级标准时间戳，实时动态生成|
|sign|字符串 String|是|全局固定加密签名，无需自研算法，直接复用固定字符串|

### 3\. 完整请求 JSON 示例

```json
{
  "clientId": "ROIS",
  "timestamp": 1777387821,
  "sign": "f7a2c9e1b4d83f6a0e5c2b7d9f1a4e8c"
}
```

### 4\. 接口出参（响应返回字段说明）

|返回字段名|数据类型|字段业务说明|
|---|---|---|
|accessToken|字符串 String|全局业务接口通行令牌，所有下游接口必须携带|
|accessTokenExpirationTime|字符串 String|令牌UTC标准过期时间，提前30秒自动刷新容错|

### 5\. 完整响应 JSON 示例

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJST0lTIiwiaWF0IjoxNzc3Mzg3ODIxLCJleHAiOjE3Nzk5Nzk4MjF9.f68-3eMJM-oT7Wk6K6nAvy1_JnTJDX-IfbPa5JBl9C8",
  "accessTokenExpirationTime": "2026-05-28T14:50:21Z"
}
```

---

## 二、业务接口一：Crew 获取全量可排班机组人员信息

### 1\. 基础接口元信息

**接口名称**：全量机组人员基础信息拉取接口

**请求请求地址**：https://87kbu8v1m6\.execute\-api\.ca\-central\-1\.amazonaws\.com/Dev/rois/out/crew

**请求方式**：POST

**特殊说明**：数据体量较大，极易超时，开发必须配置3次及以上重试机制

### 2\. 请求头强制配置

Key：AuthorizationToken \&amp;nbsp;\&amp;nbsp; Value：上一步认证接口返回的合法 accessToken

### 3\. 接口入参说明

无任何 Body 业务参数，仅携带请求头鉴权即可直接请求。

### 4\. 完整响应 JSON 片段示例（标准返回格式）

```json
[
  {
    "owner": "F8",
    "crewId": 5510,
    "firstName": "Peter",
    "middleName": "",
    "lastName": "Adams",
    "gender": "Male",
    "telephone": "647-449-2247",
    "workEmail": "peter.adams@flyflair.com",
    "bases": [
      {
        "crewId": 5510,
        "base": "YYZ",
        "effDt": "2018-06-22T00:00:00Z",
        "expDt": "2055-09-16T23:59:59Z",
        "isPrimary": true
      }
    ],
    "ranks": [
      {
        "rank": "CA",
        "effDt": "2018-06-22T00:00:00Z",
        "expDt": "2199-12-31T23:59:59Z"
      },
      {
        "rank": "FO",
        "effDt": "2025-11-30T00:00:00Z",
        "expDt": "2055-12-01T23:59:59Z"
      }
    ],
    "certificates": [
      {
        "certificate": "RHS",
        "isValid": true,
        "expDt": "2026-11-30T00:00:00Z"
      }
    ]
  }
]
```

### 5\. 配套强制业务解析规则（开发必执行）

① 职级优先级：CA 机长 \&gt; FO 副驾，只保留有效期最远的最高有效职级写入crew\_rank字段；

② 同步遍历certificates数组，抓取 isValid=true 的 RHS 有效资质绑定人员档案；

③ 过滤所有已过期、无效职级与过期资质，不参与后续排班运算。

---

## 三、业务接口二：FLIGHT 按时间范围拉取全量航班数据

### 1\. 基础接口元信息

**接口名称**：周期航班基础计划数据查询接口

**请求请求地址**：https://87kbu8v1m6\.execute\-api\.ca\-central\-1\.amazonaws\.com/Dev/rois/out/flight

**请求方式**：POST

### 2\. 请求头强制配置

Key：AuthorizationToken \&amp;nbsp;\&amp;nbsp; Value：全局有效 accessToken

### 3\. 接口入参（Body 业务参数）

|参数字段名|数据类型|是否必填|字段业务说明|
|---|---|---|---|
|startDt|字符串 String|是|查询起始日期，固定格式：yyyy\-MM\-dd|
|endDt|字符串 String|是|查询截止日期，固定格式：yyyy\-MM\-dd，区间闭环查询|

### 4\. 完整请求 JSON 示例

```json
{
  "startDt": "2026-03-01",
  "endDt": "2026-03-05"
}
```

### 5\. 完整响应 JSON 示例

```json
[
  {
    "owner": "F8 - Flair Airlines",
    "legNo": 804,
    "datOp": "2026-03-04T00:00:00Z",
    "fltId": "F8804",
    "fltNum": "F8804",
    "depStn": "YVR",
    "arrStn": "YYC",
    "status": "Completed",
    "std": "2026-03-04T16:50:00Z",
    "sta": "2026-03-04T18:20:00Z",
    "atd": "2026-03-04T16:50:00Z",
    "ata": "2026-03-04T18:18:00Z",
    "etd": null,
    "eta": "2026-03-04T18:19:00Z",
    "toff": "2026-03-04T17:00:00Z",
    "tdwn": "2026-03-04T18:09:00Z",
    "stc": "J",
    "divCode": null,
    "acGrp": "7M8",
    "acReg": "C-FLGD"
  }
]
```

### 6\. 字段映射与解析规则

| API 字段 | 类型 | 映射目标（flight 表） | 说明 |
|---|---|---|---|
| `fltId` | string | `interface_flt_id` | 外部航班唯一键，缺失则跳过该记录 |
| `fltNum` / `legNo` | string | `flt_num` | 优先 `fltNum`，回退 `legNo` |
| `datOp` | datetime | `flt_dt` | 取日期部分 |
| `depStn` / `arrStn` | string | `dep_arp` / `arv_arp`（同时写 `act_dep_arp` / `act_arv_arp`） | |
| `std` / `sta` | datetime | `sch_dep_dt_utc` / `sch_arv_dt_utc` | 计划起落 |
| `atd` / `ata` | datetime | `act_dep_dt_utc` / `act_arv_dt_utc` | 缺失回退到 `std` / `sta` |
| **`etd`** / **`eta`** | datetime\|null | `est_dep_dt_utc` / `est_arv_dt_utc` | **新增**，预计起落 |
| **`toff`** / **`tdwn`** | datetime\|null | `act_take_off_utc` / `act_touch_down_utc` | **新增**，实际离地/接地 |
| **`stc`** | string\|null | `seg_type` | **新增**，缺省 `"J"` |
| **`divCode`** | string\|null | `device_code` | **新增**，缺省空串 |
| `acGrp` | string | `fleet` | 缺省 `"-"` |
| `acReg` | string | `register` | |

> `blk_min` 由 `sta - std` 计算；`flight_flag` 固定 `A`，`airline` 固定 `F8`。

---

## 四、业务接口三：PAIRING 按周期获取机组执勤配对任务

### 1\. 基础接口元信息

**接口名称**：机组执勤链路配对任务全量查询

**请求请求地址**：https://87kbu8v1m6\.execute\-api\.ca\-central\-1\.amazonaws\.com/Dev/rois/out/pairing

**请求方式**：POST

### 2\. 请求头强制配置

Key：AuthorizationToken \&amp;nbsp;\&amp;nbsp; Value：全局有效 accessToken

### 3\. 接口入参（Body 业务参数）

|参数字段名|数据类型|是否必填|字段业务说明|
|---|---|---|---|
|startDt|字符串 String|是|配对任务起始日期，格式：yyyy\-MM\-dd|
|endDt|字符串 String|是|配对任务截止日期，格式：yyyy\-MM\-dd|

### 4\. 完整请求 JSON 示例

```json
{
  "startDt": "2026-03-01",
  "endDt": "2026-03-10"
}
```

### 5\. 完整响应 JSON 核心示例

```json
{
  "statusCode": 200,
  "body": [
    {
      "pairingId": "101198",
      "pairingDt": "2026-02-23 00:00:00",
      "label": "YYZ/KIN/YYZ/FLL/YYZ/FLL/YYZ/YXX/YYZ",
      "base": "YUL",
      "fleet": "737",
      "durationDays": 5,
      "schStrDtUtc": "2026-02-23 13:56:00",
      "schEndDtUtc": "2026-02-28 00:30:00",
      "actStrDtUtc": "2026-02-23 13:00:00",
      "actEndDtUtc": "2026-02-28 00:45:00",
      "assignmentGroup": "FLY",
      "assignment": "FLY",
      "division": "P",
      "tafb": 4,
      "comments": "",
      "perDiemMins": 0,
      "perDiemMinsAdjustment": 0,
      "fmLhPerDiemMins": 0,
      "wpMins": 1475,
      "wpMinsAdjustment": 0,
      "pairingCompositions": [
        { "actingRank": "CAP", "planValue": 1, "division": "P" }
      ],
      "pairingDutyList": [
        {
          "dutySeq": 1,
          "assignment": "FLY",
          "strArp": "YYZ",
          "endArp": "YVR",
          "actStrDtUtc": "2026-02-23 13:00:00",
          "actEndDtUtc": "2026-02-23 23:57:00",
          "creditedMinutes": 360,
          "comments": "",
          "fdpDiscretionMin": 0,
          "maxFdpMin": 0,
          "minRestMin": 600,
          "actRestMin": 600,
          "layoverNits": 1,
          "planFlightMin": 360,
          "planFdpMin": 657,
          "actFlightMin": 340,
          "actFdpMin": 657,
          "actualDutyMinutes": 657,
          "briefMin": 56,
          "debriefMin": 15,
          "pairingDutyNodes": [
            { "sequence": 1, "node": "PICKUP", "airport": "YYZ", "startUtc": "2026-02-23 13:00:00", "endUtc": "2026-02-23 13:00:00" }
          ],
          "pairingDutySegments": [
            {
              "dutySeq": 1, "segSeq": 1, "fltId": "323562", "fltDt": "2026-02-23 00:00:00",
              "assignment": "FLY", "airline": "", "fltNum": "F8623",
              "depArp": "YYZ", "arvArp": "YYC", "fleet": "7M8",
              "actStrDtUtc": "2026-02-23 13:56:00", "actEndDtUtc": "2026-02-23 18:03:00",
              "isLongTransit": 0
            }
          ]
        }
      ]
    }
  ]
}
```

### 6\. 顶层字段映射（pairing 表）

| API 字段 | 类型 | 映射目标 | 说明 |
|---|---|---|---|
| `pairingId` | string | `interface_id` | 缺失则跳过 |
| `label` | string | `pairing_label` | |
| `base` / `fleet` | string | `base` / `fleet` | |
| `durationDays` | int | `duration_days` | 缺省 1 |
| **`schStrDtUtc`** / **`schEndDtUtc`** | datetime | `sch_str_dt_utc` / `sch_end_dt_utc` | **新增**，优先取顶层，回退首/末 duty |
| **`actStrDtUtc`** / **`actEndDtUtc`** | datetime | `act_str_dt_utc` / `act_end_dt_utc` | **新增**，回退到 sch |
| **`assignmentGroup`** / **`assignment`** | string | `assignment_group` / `assignment` | **新增**，缺省 `"FLY"`（不再硬编码） |
| **`division`** | string | `division` | **新增**，非 P/C 时由编组 actingRank 推导 |
| **`tafb`** | int | `tafb` | **新增**，缺失则按时间差计算 |
| **`comments`** | string | `comments` | **新增** |
| **`perDiemMins`** / **`perDiemMinsAdjustment`** | int | `per_diem_mins` / `per_diem_mins_adjustment` | **新增** |
| **`fmLhPerDiemMins`** | int | `fm_lh_per_diem_mins` | **新增** |
| **`wpMins`** / **`wpMinsAdjustment`** | int | `wp_mins` / `wp_mins_adjustment` | **新增** |

### 7\. duty 与 segment 映射（pairing\_segment 宽表）

> connector\-server 将 duty / node / segment 三层合并写入 `pairing_segment`（同 duty 的所有 seg 行 `duty_*` 字段一致）。

| API 字段（duty） | 映射目标 | 说明 |
|---|---|---|
| `dutySeq` | `duty_seq` | |
| `strArp` / `endArp` | `duty_str_arp` / `duty_end_arp` | 已移除 `arrArp` 兼容回退 |
| `actStrDtUtc` / `actEndDtUtc` | `duty_act_str_dt_utc` / `duty_act_end_dt_utc`（同时写 `duty_sch_*`） | |
| `creditedMinutes` | `duty_act_credited_minutes` | 已移除 `creditMin` 兼容回退 |
| **`fdpDiscretionMin`** | `duty_fdp_discretion_min` | **新增** |
| **`maxFdpMin`** | `duty_max_fdp_min` | **新增** |
| **`minRestMin`** / **`actRestMin`** | `duty_sch_rest_min` / `duty_act_rest_min` | **新增** |
| **`layoverNits`** | `duty_layover_nits` | **新增** |
| **`planFlightMin`** / **`planFdpMin`** | `duty_sch_flt_min` / `duty_sch_fdp_min` | **新增** |
| **`actFlightMin`** / **`actFdpMin`** | `duty_act_flt_min` / `duty_act_fdp_min` | **新增** |
| **`actualDutyMinutes`** | `duty_act_duty_min` | **新增** |
| `comments` | `duty_comments` | |
| `pairingDutyNodes[]` | `pickup_*` / `brief_*` / `debrief_*` / `dropoff_*` | `CHECKIN`/`CHECKOUT` 自动展开为四类节点；node 机场只读 `airport`（已移除 `arp` 回退） |

| API 字段（segment） | 映射目标 | 说明 |
|---|---|---|
| `fltId` | `flt_id`（经 `interface_flt_id` 关联 flight） | |
| `fltNum` / `airline` / `fleet` | `flt_num` / `airline` / `fleet_seg` | |
| `depArp` / `arvArp` | `dep_arp` / `arv_arp` | 已移除 `arrArp` 兼容回退 |
| `actStrDtUtc` / `actEndDtUtc` | `act_str_dt_utc` / `act_end_dt_utc`（同时写 `sch_*`） | |
| `assignment` | `seg_assignment` | 归一化：`FLIGHT→FLY`、`TRANSPORT→DHD`、`TRAINING→GRD`、`RESERVE→SBY`；`DH` 保持原样（API 现用 `DH` 而非 `DHD`） |
| **`isLongTransit`** | `is_long_transit` | **新增** |

---

## 五、业务接口四：ROSTER FLIGHT 机组个人排班航班明细查询

### 1\. 基础接口元信息

**接口名称**：机组人员个人排班任务明细接口

**请求请求地址**：https://87kbu8v1m6\.execute\-api\.ca\-central\-1\.amazonaws\.com/Dev/rois/out/rosterFlight

**请求方式**：POST

### 2\. 请求头强制配置

Key：AuthorizationToken \&amp;nbsp;\&amp;nbsp; Value：全局有效 accessToken

### 3\. 接口入参（Body 业务参数）

|参数字段名|数据类型|是否必填|字段业务说明|
|---|---|---|---|
|startDt|字符串 String|是|排班查询起始日期，格式固定 yyyy\-MM\-dd|
|endDt|字符串 String|是|排班查询截止日期，格式固定 yyyy\-MM\-dd|

### 4\. 完整请求 JSON 示例

```json
{
  "startDt": "2026-03-01",
  "endDt": "2026-03-10"
}
```

### 5\. 完整响应 JSON 示例（含区分规则）

```json
[
  {
    "rosterFlightId": 2656138,
    "pairingId": 0,
    "fltId": "FLYXX",
    "depArp": "YVR",
    "arrArp": "YYZ",
    "dutyStrUtc": "2026-06-12T17:35:00Z",
    "crew": {
      "crewId": "535",
      "crewName": "Alistair Camplin   NO US",
      "actingRank": "CA"
    }
  }
]
```

### 6\. 强制过滤业务规则

✅ pairingId = 0：本接口直接跳过，**不在此处建排班**——这些单段/地面任务由 **RosterGround 接口**（见第六节）统一处理；

✅ pairingId ≠ 0：正规联动飞行排班，按 `pairingId` 关联 `pairing.interface_id`，对该环的每个航段展开为 `roster_flight` 行。

> 机组归属字段：`crew.crewId`（须存在于 crew 表，否则记入 rejected 文件）、`crew.actingRank` / `crew.activeRank` / `crew.division` / `crew.seqOrder`。`assignmentGroup` 已上移到顶层。

---

## 六、业务接口五：ROSTER GROUND 机组地面任务与单段飞行查询

### 1\. 基础接口元信息

**接口名称**：机组地面任务/休假/待命/培训等全量查询

**请求请求地址**：https://87kbu8v1m6\.execute\-api\.ca\-central\-1\.amazonaws\.com/Dev/rois/out/rosterGround

**请求方式**：POST

### 2\. 请求头强制配置

Key：AuthorizationToken &nbsp;&nbsp; Value：全局有效 accessToken

### 3\. 接口入参（Body 业务参数）

|参数字段名|数据类型|是否必填|字段业务说明|
|---|---|---|---|
|startDt|字符串 String|是|起始日期，格式 yyyy\-MM\-dd|
|endDt|字符串 String|是|截止日期，格式 yyyy\-MM\-dd|
|assignment|字符串 String|是|任务类型，**按类型逐一轮询拉取**（见下表枚举）|

> connector\-server 会对下列 assignment 类型逐一发起请求并汇总：`Flight`、`Illness`、`Vacation`、`Compensation`、`Transport`、`StandBy`、`StationStandBy`、`Training`、`Simulator`、`DayOff`、`Shift`、`Reserve`。**`Unknown` 类型不拉取、不导入。**

### 4\. 完整请求 JSON 示例

```json
{
  "startDt": "2026-03-01",
  "endDt": "2026-03-10",
  "assignment": "Illness"
}
```

### 5\. 完整响应 JSON 示例

```json
[
  {
    "crewId": "535",
    "assignment": "Illness",
    "assignmentGroup": "GRD",
    "location": "YVR",
    "division": "P",
    "label": "",
    "trainingRole": "",
    "startTimeUtc": "2026-03-04T00:00:00Z",
    "endTimeUtc": "2026-03-05T00:00:00Z",
    "fltId": "",
    "pairingId": "0",
    "owner": "F8"
  }
]
```

### 6\. 字段映射与解析规则

**（A）非 Flight 类型 → 地面任务**：写入 `roster_flight` 且 `pairing_id = NULL`（live\-server 已将原 roster\_ground 表合并进 roster\_flight，地面任务以空 pairing 表示）。

| API 字段 | 类型 | 映射目标（roster\_flight） | 说明 |
|---|---|---|---|
| `crewId` | string | `crew_id` | 须存在于 crew 表，否则 rejected |
| `assignment` | string | `assignment` | 归一化：`ILLNESS→ILL`、`VACATION→VAC`、`COMPENSATION→COMP`、`STANDBY→SBY`、`STATIONSTANDBY→SSB`、`TRAINING→GRD`、`SIMULATOR→SIM`、`DAYOFF→DO`、`SHIFT→SFT`、`RESERVE→SBY`、`TRANSPORT→DHD` |
| `assignmentGroup` | string | `assignment_group` | 缺省 `GRD` |
| `location` | string | （地面任务的发生地，截断 3 位） | |
| `startTimeUtc` / `endTimeUtc` | datetime | `sch_str_dt_utc` / `sch_end_dt_utc` | 任务时间范围 |
| `division` | string | `division` | |
| `label` | string | `label` | |
| `trainingRole` | string | `role` | |

> 同步策略：按日期范围**物理替换**该区间内 `source='F8'` 且 `pairing_id IS NULL` 的地面行后重新写入；`acting_rank` 因 payload 无职级，按 division 缺省（P→CA，否则 FA）。

**（B）`Flight` 类型**：按 `pairingId` 二次分流。

- `pairingId > 0`：已由 Pairing / RosterFlight 接口覆盖，**此处忽略**（仅计数）。
- `pairingId = 0`：**单段飞行任务**，物化为合成环。connector 仅携带 `crewId` / `fltId` / `label` / `startTimeUtc` / `division`，由 live\-server worker 解析：
  1. 用 `fltId` 匹配 `flight.interface_flt_id`；失败则用 `label`（航班号）\+ `startTimeUtc`（起飞时间）回退匹配；
  2. 按解析到的真实航班分组，幂等生成合成 `pairing`（`interface_id = GND-{interface_flt_id}`）、`pairing_segment`（1 段，提前 1 小时签到）、`pairing_composition`（按 division）以及每名机组一条 `roster_flight`；
  3. 无法匹配航班的记录只上报、不建数据。

---

## 七、全局通用异常、超时、容错对接规范

1、鉴权报错 401/403：立即放弃当前请求，串行重新调用获取令牌接口，刷新后重试业务；

2、Crew 机组接口固定容错：超时阈值60秒，失败自动重试3次，间隔2秒休眠；

3、全量时间字段：后端统一接收、存储UTC时间，前端展示自动做本地时区换算；

4、所有枚举字段统一口径：Rank 只保留 CA、FO，杜绝 CAP、CP 混用乱码问题。

> （注：文档部分内容可能由 AI 生成）
