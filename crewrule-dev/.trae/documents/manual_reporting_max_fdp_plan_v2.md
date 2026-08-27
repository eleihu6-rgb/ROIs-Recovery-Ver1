# ROSCRW-18798 手动修改 Reporting Time 时 MAX FDP 计算优化方案（修订版）

## 需求描述

手动修改 reporting time 时，计算 Max FDP 应使用 `reportingTime + (Brief - MaxFdpBrief)` 作为 checkin 时间匹配规则表，最终 Max FDP = 匹配到的 Max FDP + (Brief - MaxFdpBrief)。

### 示例

- Duty Reporting time 从 `2026/06/01 06:50` 手动修改为 `2026/06/01 07:50`（延后 1h）
- 3021法规配置：`Brief = 2:00`，`Max FDP Brief = 1:30`，差值 = `00:30`
- 计算：
  1. adjusted checkin = `07:50 + 00:30 = 08:20`
  2. 查规则表：`08:20` 对应的 Max FDP = `11:00`
  3. 最终 Max FDP = `11:00 + 00:30 = 11:30`

### 关键约束

**手动修改 reporting time 记录在 PairingDutyNode 的 brief 节点标记 `is_manual_modify=Y`**，而非 Duty 级别的 `isManualModify`。

参照函数：`LegalityChecker::resetDutyNodeTime()`（RuleEngine.cpp:24365），该函数通过 `brief->getIsManualModify()` 判断 brief 节点是否被手动修改。

---

## 当前代码状态分析

### 已有的 `AdjustCheckInByMaxFdpBrief` 函数（L35-55）

```cpp
time_t AdjustCheckInByMaxFdpBrief(const Duty* duty, const SharedPtr<CrewDataContext>& dbData, time_t currentCheckInUtc) {
    const auto& brief = duty->getFirstBreif();
    if (brief && brief->getIsManualModify()) {
        // 如果brief被人工修改过，则不进行调整
        return currentCheckInUtc;
    }
    // ... 计算 normalBrief - maxFdpBrief 并偏移
    return currentCheckInUtc + static_cast<time_t>(normalBrief - maxFdpBrief) * 60;
}
```

### 问题：`AdjustCheckInByMaxFdpBrief` 的逻辑与需求相反

当前逻辑：**brief 被手动修改时 → 不调整**（返回原始 checkInTime）

需求逻辑：**brief 被手动修改时 → 需要调整**（返回 checkInTime + BriefDelta）

### 当前 `AdjustCheckInByMaxFdpBrief` 被调用的位置

| 位置 | 行号 | 当前调用 |
|------|------|----------|
| `CalculateAcclimatizeDuty` 回退路径 | L201 | `AdjustCheckInByMaxFdpBrief(duty, _dbData, duty->getStartTimeUtcAct())` |
| `CalculateAcclimatizeDuty` 计划比较路径 | L205 | `AdjustCheckInByMaxFdpBrief(duty, _dbData, duty->getOriginalStartTimeUtcSch())` |
| `GetDutyCheckInTime` originalCheckInTime | L331 | `AdjustCheckInByMaxFdpBrief(duty, _dbData, duty->getOriginalStartTimeUtcSch()) + fdpStartTimeDelta` |
| `GetDutyCheckInTime` revisedCheckInTime | L332 | `AdjustCheckInByMaxFdpBrief(duty, _dbData, duty->getStartTimeUtcAct()) + fdpStartTimeDelta` |
| `CalculateUnkownDuty(int,P*)` 回退路径 | L449 | `AdjustCheckInByMaxFdpBrief(duty, _dbData, duty->getStartTimeUtcAct())` |
| `CalculateUnkownDuty(int,P*)` 计划比较路径 | L453 | `AdjustCheckInByMaxFdpBrief(duty, _dbData, duty->getStartTimeUtcSch())` |
| `CalculateUnkownDuty(D*,R*)` 回退路径 | L527 | `AdjustCheckInByMaxFdpBrief(duty, _dbData, duty->getStartTimeUtcAct())` |
| `CalculateUnkownDuty(D*,R*)` 计划比较路径 | L531 | `AdjustCheckInByMaxFdpBrief(duty, _dbData, duty->getStartTimeUtcSch())` |

### 当前 `CalculateAcclimatizeDuty` 中缺失的 BriefDelta 加法

原代码在 L183 有 `maxFdpToSet += GetMaxFdpBriefDeltaMinutes(...)`，但当前代码 L210-219 中**没有**这行。这意味着即使 checkin 时间被偏移后匹配到了正确的 Max FDP，最终值也没有加上 BriefDelta。

---

## 修改方案

### 核心修改：反转 `AdjustCheckInByMaxFdpBrief` 的判断逻辑

**修改前**（L41-44）：
```cpp
if (brief && brief->getIsManualModify()) {
    // 如果brief被人工修改过，则不进行调整
    return currentCheckInUtc;
}
```

**修改后**：
```cpp
// ROSCRW-18798 ：仅当brief被手动修改时才调整checkin时间，用(reportingTime + BriefDelta)匹配MaxFDP规则表
if (!brief || !brief->getIsManualModify()) {
    return currentCheckInUtc;
}
```

### 逻辑说明

| 场景 | brief->getIsManualModify() | 行为 |
|------|---------------------------|------|
| 手动修改 reporting time | `true` | 偏移 checkin = currentCheckInUtc + (Brief - MaxFdpBrief) |
| 未手动修改 | `false` | 不偏移，返回原始 currentCheckInUtc |
| brief 节点不存在 | N/A | 不偏移 |

这与 `resetDutyNodeTime()` 中 `brief->getIsManualModify()` 的判断模式一致：只有 brief 被手动修改时才需要特殊处理。

### 需要同步修改：`CalculateAcclimatizeDuty` 中添加 BriefDelta 加法

当前 `CalculateAcclimatizeDuty()`（L210-219）在设置 Max FDP 值时，**没有**加 BriefDelta。按照需求，最终 Max FDP = 规则匹配值 + BriefDelta。

**修改前**（L210-219）：
```cpp
if (ruleParam != nullptr && ruleParam->_maxFdp > 0) {
    long fdp = duty->getFDPInSecs();
    if (!ruleParam->_overrideDutyAttributes.empty() && ...) {
        duty->setLimitationValue(..., ruleParam->_maxFdp + ruleParam->_maxFdpExtension, ...);
    }
    else {
        duty->setLimitationValue(..., ruleParam->_maxFdp, ...);
    }
}
```

**修改后**：
```cpp
if (ruleParam != nullptr && ruleParam->_maxFdp > 0) {
    long fdp = duty->getFDPInSecs();
    int maxFdpToSet = ruleParam->_maxFdp;
    // ROSCRW-18798 ：手动修改reporting time时，最终MaxFDP需加上(Brief-MaxFdpBrief)差值
    maxFdpToSet += RuleParams::GetMaxFdpBriefDeltaMinutes(duty, this->_dbData, GetPairingBaseForDuty(duty, this->_dbData));
    if (!ruleParam->_overrideDutyAttributes.empty() && ...) {
        duty->setLimitationValue(..., maxFdpToSet + ruleParam->_maxFdpExtension, ...);
    }
    else {
        duty->setLimitationValue(..., maxFdpToSet, ...);
    }
}
```

### 不需要修改的部分

1. **`GetDutyCheckInTime()` 中的调用**（L331-332）：已经使用了 `AdjustCheckInByMaxFdpBrief`，反转判断逻辑后自动生效
2. **`CalculateUnkownDuty(int,P*)` 和 `CalculateUnkownDuty(D*,R*)` 中的调用**：同样已经使用了 `AdjustCheckInByMaxFdpBrief`，自动生效
3. **`GetMatchedRuleWhenUnknown()` 调用**：`AdjustCheckInByMaxFdpBrief` 已应用于传入的 checkInTime 参数，不需要额外修改

---

## 修改汇总

| 修改点 | 文件 | 行号 | 说明 |
|--------|------|------|------|
| 反转 `AdjustCheckInByMaxFdpBrief` 判断 | CalculateMaxFlightDutyPeriodRule.cpp | L41-44 | `brief->getIsManualModify()` 为 true 时才偏移 |
| `CalculateAcclimatizeDuty` 添加 BriefDelta | CalculateMaxFlightDutyPeriodRule.cpp | L210-219 | `maxFdpToSet += GetMaxFdpBriefDeltaMinutes(...)` |

### 影响范围

- **修改文件**：仅 `CalculateMaxFlightDutyPeriodRule.cpp`
- **修改函数**：2 处（`AdjustCheckInByMaxFdpBrief` 匿名函数 + `CalculateAcclimatizeDuty`）
- **自动生效的调用点**：8 处 `AdjustCheckInByMaxFdpBrief` 调用均自动获得正确行为

### 验证示例

以需求示例验算（reporting time 从 06:50 手动修改为 07:50，Brief=2:00, MaxFdpBrief=1:30）：

1. `brief->getIsManualModify()` = true → 进入偏移逻辑
2. `briefDelta = 2:00 - 1:30 = 30` 分钟
3. 回退路径：`adjustCheckIn = 07:50 + 0:30 = 08:20` → 匹配规则得 Max FDP = 11:00
4. `maxFdpToSet = 11:00 + 0:30 = 11:30` ✅
