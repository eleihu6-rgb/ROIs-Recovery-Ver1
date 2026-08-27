/**
 * @file CheckLegalDaysOffFor5JRuleParam.cpp
 * @brief Rule 7365 - Legal Days Off validation for 5J
 *
 * [CMSCEB-1178] [BUG][CEB]7365法规在分配OFF时抛出告警
 *
 * Phase 1 (CMSCEB-1178 初版):
 *   Include Blank Day 关闭 DO 组时不得把结束时间延伸到后续 FLY 开工点，否则单条 OFF 会
 *   被按「OFF 结束 → 下次执勤开始」量 36:00 / Local Night 而误报。
 *
 * Phase 2:
 *     Fix A: 恢复延伸到任意地面 roster（不限 DO），配合 v2 leading blank fallback。
 *     Fix B: GetFirstLeadingBlankBlockStartLoc 使用 cursorDayStart 逐日检查。
 *
 * Phase 3/4（CMSCEB-1178 统一终检 + 空白天后扩）:
 *   支柱1 — end 上界：DO 后第一条阻塞执勤开工点（地面/FLY 相同；窗在 FLY/AS 开始前结束）。
 *   支柱2 — 开区间内不得夹非 DO 执勤（禁止窗穿过 AS/FLY，场景5 不得推到 22:00 假通过）。
 *   支柱3 — 时长：校验窗 [start,end] 跨度 ≥ Day Off Duration。
 *   支柱4 — LN：仅计窗内 DutyUtils::GetLocalNightNums，不另加日历 DO 日额度（场景5 仍告警）。
 *   支柱5 — LN/时长不足时后扩 end（TryExtendGroupEndForLegalRequirements）：
 *            newEnd = min(法规所需最小 end, 下一非 DO 上界, scenario.end)；未来全空白天可扩至 scenario。
 *   支柱6 — 前导空白天 v2：后扩仍不足则向前扩 start，每次刷新 end 后扩。
 *   支柱7 — OFF 与 duty 重叠裁切：计量从非重叠时刻起算（见 TrimValidationWindowForDutyOverlap）。
 *
 * Leading blank-day fallback (v2): 后向 end 已到顶后校验；未过则按分钟精确向前补缺口，
 * 从紧邻的首个空白天 00:00 起试，每次扩展后校验，满足即停；告警区间为扩展后整段 UTC。
 *
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2025-04-14
**/

#include <sstream>
#include <map>
#include <algorithm>
#include <limits>
#include "spdlog/spdlog.h"
#include "CheckLegalDaysOffFor5JRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "StringUtil.h"

using namespace std;

namespace {

/** 阻塞 roster 的开工时刻（UTC），用于判断是否在 DO 组结束之后。 */
time_t GetWorkStartTimeUtcForRoster(const ROSTER* roster) {
    return roster->pairing == nullptr ? roster->actStrUtc : roster->pairing->getStartTimeUtcAct();
}

/** 阻塞 roster 的开工时刻（基地本地），作为校验窗 end 上界（场景6 → FLY 21:25，非当日 00:00）。 */
time_t GetWorkStartTimeLocForRoster(const ROSTER* roster) {
    return roster->pairing == nullptr ? roster->actStrLoc : roster->pairing->getStartTimeLocAct();
}

/** [CMSCEB-1178 旧路径] 将 DO 组 end 对齐到下一条 DO 的开工点；Phase4 主路径见 ExtendGroupEndToNextGroundRosterAfterBlank。 */
void ExtendGroupEnd(CheckLegalDaysOffFor5JRuleParam::DayOffGroupInfo& group, const ROSTER* nextRoster) {
    if (nextRoster == nullptr) {
        return;
    }
    group.endUtc = GetWorkStartTimeUtcForRoster(nextRoster);
    group.endLoc = GetWorkStartTimeLocForRoster(nextRoster);
}
}

void CheckLegalDaysOffFor5JRuleParam::ParseParam(const std::string& paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        substr = strToUpper(trim(substr));
        if (!substr.empty()) {
            switch (i) {
            case enum_to_underlying(ParamLocation::DAYS_OFF_ASSIGNMENT_GROUPS): {
                if (substr != RuleParamConstant::ALL) {
                    split(substr, '|', _daysOffAssignmentGroups);
                    _daysOffAssignmentGroupsMatch.SetExpression(substr, this->GetRule());
                }
                break;
            }
            case enum_to_underlying(ParamLocation::DAYS_OFF_ASSIGNMENTS): {
                if (substr != RuleParamConstant::ALL) {
                    split(substr, '|', _daysOffAssignments);
                    _daysOffAssignmentsMatch.SetExpression(substr, this->GetRule());
                }
                break;
            }
            case enum_to_underlying(ParamLocation::DAY_OFF_DURATION): {
                if (substr != RuleParamConstant::ALL) {
                    _dayOffDurationStr = substr;
                    _dayOffDurationMinutes = TimeUtils::hhmmToMinutes(substr);
                }
                break;
            }
            case enum_to_underlying(ParamLocation::LOCAL_NIGHTS): {
                if (substr != RuleParamConstant::ALL) {
                    _localNightsStr = substr;
                    _localNights = stoi(substr);
                }
                break;
            }
            case enum_to_underlying(ParamLocation::ADDITIONAL_DAY_OFF_DURATION): {
                if (substr != RuleParamConstant::ALL) {
                    _additionalDayOffDurationStr = substr;
                    _additionalDayOffDurationMinutes = TimeUtils::hhmmToMinutes(substr);
                }
                break;
            }
            case enum_to_underlying(ParamLocation::ADDITIONAL_DAY_OFF_LOCAL_NIGHT): {
                if (substr != RuleParamConstant::ALL) {
                    _additionalDayOffLocalNightStr = substr;
                    _additionalDayOffLocalNight = stoi(substr);
                }
                break;
            }
            case enum_to_underlying(ParamLocation::INCLUDE_BLANK_DAY): {
                if (substr != RuleParamConstant::ALL) {
                    _includeBlankDay = substr;
                }
                break;
            }
            case enum_to_underlying(ParamLocation::INCLUDE_LAYOVER_REST): {
                if (substr != RuleParamConstant::ALL) {
                    _includeLayoverRest = substr;
                }
                break;
            }
            case enum_to_underlying(ParamLocation::INCLUDE_PAIRING_BASE_REST): {
                if (substr != RuleParamConstant::ALL) {
                    _includePairingBaseRest = substr;
                }
                break;
            }
            default:
                Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void CheckLegalDaysOffFor5JRuleParam::ParseParam(const DBRule& dbRule) {
    RuleParam::ParseParam(dbRule);
    map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
    string header, headeValue;
    for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
    {
        header = strToUpper(trim(iter->first));
        headeValue = strToUpper(trim(iter->second));

        if (header == "DAYS OFF ASSIGNMENT GROUPS") {
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _daysOffAssignmentGroups);
                _daysOffAssignmentGroupsMatch.SetExpression(headeValue, this->GetRule());
            }
        }
        else if (header == "DAYS OFF ASSIGNMENTS") {
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _daysOffAssignments);
                _daysOffAssignmentsMatch.SetExpression(headeValue, this->GetRule());
            }
        }
        else if (header == "DAY OFF DURATION") {
            if (headeValue != RuleParamConstant::ALL) {
                _dayOffDurationStr = headeValue;
                _dayOffDurationMinutes = TimeUtils::hhmmToMinutes(headeValue);
            }
        }
        else if (header == "LOCAL NIGHTS") {
            if (headeValue != RuleParamConstant::ALL) {
                _localNightsStr = headeValue;
                _localNights = stoi(headeValue);
            }
        }
        else if (header == "ADDITIONAL DAY OFF DURATION") {
            if (headeValue != RuleParamConstant::ALL) {
                _additionalDayOffDurationStr = headeValue;
                _additionalDayOffDurationMinutes = TimeUtils::hhmmToMinutes(headeValue);
            }
        }
        else if (header == "ADDITIONAL DAY OFF LOCAL NIGHT") {
            if (headeValue != RuleParamConstant::ALL) {
                _additionalDayOffLocalNightStr = headeValue;
                _additionalDayOffLocalNight = stoi(headeValue);
            }
        }
        else if (header == "INCLUDE BLANK DAY") {
            if (headeValue != RuleParamConstant::ALL) {
                _includeBlankDay = headeValue;
            }
        }
        else if (header == "INCLUDE LAYOVER REST") {
            if (headeValue != RuleParamConstant::ALL) {
                _includeLayoverRest = headeValue;
            }
        }
        else if (header == "INCLUDE PAIRING BASE REST") {
            if (headeValue != RuleParamConstant::ALL) {
                _includePairingBaseRest = headeValue;
            }
        }
        else
            Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
    }
}

bool CheckLegalDaysOffFor5JRuleParam::MatchDoAssignment(const Activity* activity) const {
    if (!_daysOffAssignmentGroupsMatch.Match(*activity)) {
        return false;
    }
    if (!_daysOffAssignmentsMatch.Match(*activity)) {
        return false;
    }
    return true;
}

/**
 * 简单 DO 组校验（无空白天扩展）：仅比较 [start,end] 时长与 LN。
 * 用于 Include Blank Day=N 或 _dbData==nullptr；Roster Editor 主路径用 ValidateDayOffGroupWithLeadingBlankDayFallback。
 */
bool CheckLegalDaysOffFor5JRuleParam::ValidateDayOffGroup(const time_t groupStartLoc, const time_t groupEndLoc, int numDaysOff) const {
    if (numDaysOff <= 0) {
        return true;
    }

    const auto groupDurationMinutes = (groupEndLoc - groupStartLoc) / 60;

    // 计算所需的总时长和总local night数
    int requiredTotalDurationMinutes = 0;
    int requiredTotalLocalNights = 0;

    // 第一个DO的要求
    if (!_dayOffDurationStr.empty() && _dayOffDurationStr != "*") {
        requiredTotalDurationMinutes += _dayOffDurationMinutes;
    }
    if (!_localNightsStr.empty() && _localNightsStr != "*") {
        requiredTotalLocalNights += _localNights;
    }

    // 后续每个连续DO的要求（从第二个开始）
    if (numDaysOff > 1) {
        if (!_additionalDayOffDurationStr.empty() && _additionalDayOffDurationStr != "*") {
            requiredTotalDurationMinutes += _additionalDayOffDurationMinutes * (numDaysOff - 1);
        }
        if (!_additionalDayOffLocalNightStr.empty() && _additionalDayOffLocalNightStr != "*") {
            requiredTotalLocalNights += _additionalDayOffLocalNight * (numDaysOff - 1);
        }
    }

    // 验证总时长
    if (requiredTotalDurationMinutes > 0 && groupStartLoc != 0 && groupDurationMinutes < requiredTotalDurationMinutes) {
        return false;
    }

    // 验证总Local Night数量
    if (requiredTotalLocalNights > 0) {
        const auto localNight = DutyUtils::GetLocalNightNums(groupStartLoc, groupEndLoc);
        if (localNight < requiredTotalLocalNights) {
            return false;
        }
    }

    return true;
}

std::vector<std::vector<const ROSTER*>> CheckLegalDaysOffFor5JRuleParam::GetConsecutiveDayOffGroups(const std::vector<const ROSTER*>& rosters) const {
    std::vector<std::vector<const ROSTER*>> consecutiveGroups;
    std::vector<const ROSTER*> currentGroup;

    time_t prevEndTimeUtc = -1;

    for (const auto& roster : rosters) {
        // 只检查地面任务（pairing为nullptr）
        if (roster->pairing != nullptr) {
            // 非地面任务，如果当前组不为空，保存并开始新组
            if (!currentGroup.empty()) {
                consecutiveGroups.push_back(currentGroup);
                currentGroup.clear();
            }
            prevEndTimeUtc = -1;
            continue;
        }

        // 检查是否匹配筛选条件
        if (!MatchDoAssignment(roster)) {
            // 不匹配，如果当前组不为空，保存并开始新组
            if (!currentGroup.empty()) {
                consecutiveGroups.push_back(currentGroup);
                currentGroup.clear();
            }
            prevEndTimeUtc = -1;
            continue;
        }

        // 检查是否与上一个DO连续
        if (prevEndTimeUtc > 0 && IsConsecutiveRest(prevEndTimeUtc, roster)) {
            // 连续，添加到当前组
            currentGroup.push_back(roster);
        }
        else {
            // 不连续，保存当前组并开始新组
            if (!currentGroup.empty()) {
                consecutiveGroups.push_back(currentGroup);
            }
            currentGroup.clear();
            currentGroup.push_back(roster);
        }

        prevEndTimeUtc = roster->actEndUtc;
    }

    // 保存最后一个组
    if (!currentGroup.empty()) {
        consecutiveGroups.push_back(currentGroup);
    }

    return consecutiveGroups;
}

/**
 * [CMSCEB-1178] [BUG][CEB]7365法规在分配OFF时抛出告警
 *
 * 按时间顺序扫描 crew roster，拼出连续 DO 组并计算校验用的 start/end（本地/UTC）。
 * - 组内多条 DO：IsConsecutiveRest 合并；
 * - Include Blank Day=Y：组开始前可从前序任务结束拉回（见循环内 i>0 分支）；
 *   若前序 roster 日历跨越本条 OFF，用 OFF 前的 workEndLoc（含 actRestStrLoc）作起点（场景2）；
 * - 组结束：Phase4 将 end 止于 DO 后第一条阻塞执勤开工点（FLY/AS 均在开工时刻结束窗）。
 */
std::vector<CheckLegalDaysOffFor5JRuleParam::DayOffGroupInfo> CheckLegalDaysOffFor5JRuleParam::GetConsecutiveDayOffGroupInfos(
    const std::vector<const ROSTER*>& rosters, const string& base) const {
    std::vector<DayOffGroupInfo> groups;
    DayOffGroupInfo currentGroup;
    time_t prevEndTimeUtc = -1;
    const bool includeBlankDay = _includeBlankDay == "Y";
    const bool includePairingBaseRest = _includePairingBaseRest == "Y";
    std::size_t lastDoRosterIndexInList = 0;

    // 关闭当前 DO 组：支柱1 将 end 拉到 DO 后第一条阻塞点（FLY/AS 开工时刻，含 OFF 后空白）
    auto closeCurrentGroup = [&]() {
        if (currentGroup.rosters.empty()) {
            return;
        }
        // 建组阶段无 CrewDataContext：只写 endLoc；ValidateDayOffGroupWithLeadingBlankDayFallback 内再写 endUtc
        ExtendGroupEndToNextGroundRosterAfterBlank(currentGroup, rosters, lastDoRosterIndexInList, base, nullptr);
        groups.push_back(currentGroup);
        currentGroup = DayOffGroupInfo();
    };

    for (std::size_t i = 0; i < rosters.size(); ++i) {
        const auto* roster = rosters[i];
        // pairing≠nullptr（FLY 等）或非 DO：结束本组；下一条阻塞点决定 end（场景3→11/6 10:15，场景6→11/4 21:25）
        if (roster->pairing != nullptr || !MatchDoAssignment(roster)) {
            closeCurrentGroup();
            prevEndTimeUtc = -1;
            continue;
        }

        if (!currentGroup.rosters.empty() && prevEndTimeUtc > 0 && IsConsecutiveRest(prevEndTimeUtc, roster)) {
            currentGroup.rosters.push_back(roster);
            currentGroup.endUtc = roster->actEndUtc;
            currentGroup.endLoc = roster->actEndLoc;
            lastDoRosterIndexInList = i;
        }
        else {
            closeCurrentGroup();
            currentGroup.rosters.push_back(roster);
            lastDoRosterIndexInList = i;
            currentGroup.startUtc = roster->actStrUtc;
            currentGroup.endUtc = roster->actEndUtc;
            currentGroup.startLoc = roster->actStrLoc;
            currentGroup.endLoc = roster->actEndLoc;

            // [CMSCEB-1178] Include Blank Day=Y：新 DO 组起点可从前序任务结束时刻（含 Pairing Base Rest）拉回。
            if (includeBlankDay && i > 0) {
                const auto* prevRoster = rosters[i - 1];
                const time_t offStartLoc = currentGroup.startLoc;
                const time_t workEndLoc = GetWorkEndTimeLocForRoster(prevRoster, includePairingBaseRest, base);
                const time_t workEndUtc = GetWorkEndTimeUTCForRoster(prevRoster, includePairingBaseRest, base);

                // 前序 roster 在日历上跨越本条 OFF（例：AS 11/1 05:00–11/3 11:00，OFF 11/2 00:00）。
                // 此时 actEnd 往往晚于 OFF 开工，旧逻辑 prevEndUtc <= OFF.start 不成立，组起点会停在 OFF 00:00，
                // 无法计入 OFF 前一段休息（如 11/1 18:30–11/2 00:00），导致 7365 场景2误报。
                const bool prevSpansOff = prevRoster->actStrLoc < offStartLoc
                    && prevRoster->actEndLoc > offStartLoc;

                if (prevSpansOff && workEndLoc < offStartLoc) {
                    // 方案1：仅当「OFF 前执勤收工点」早于 OFF 开工时，用该时刻作为 DO 组 start。
                    // Include Pairing Base Rest=Y 时不跳过航后/base REST（起点=执勤收工 actRestStrLoc /
                    // pairing getEndTimeLocAct）；跨日 AS 须在数据中维护 OFF 前收工点（如 11/1 18:30）。
                    currentGroup.startLoc = workEndLoc;
                    currentGroup.startUtc = workEndUtc;
                }
                else {
                    // 非跨 OFF：前序整段结束不晚于 OFF 开始时，沿用原逻辑（连续 DO 或前序已结束）。
                    const auto prevEndUtc = workEndUtc;
                    if (prevEndUtc <= currentGroup.startUtc) {
                        currentGroup.startUtc = prevEndUtc;
                        currentGroup.startLoc = workEndLoc;
                    }
                }
            }
        }

        prevEndTimeUtc = roster->actEndUtc;
    }

    closeCurrentGroup();
    return groups;
}

/**
 * 前序 roster 的「执勤收工点」，用于 Include Blank Day=Y 时拉回 DO 组起点。
 *
 * Include Pairing Base Rest（isUtilizePostDutyRest）语义与 7361 一致：
 *   Y — 不跳过航后/base REST：取执勤收工（地面 actRestStr* / pairing getEndTime*Act），
 *       其后 REST 计入合法 DO 校验窗；
 *   N — 跳过 REST：取含航后休息结束后的时刻（地面 actEnd* / pairing getEndTimeIncludingRest*Act），
 *       DO 起点在 REST 结束之后。
 */
time_t CheckLegalDaysOffFor5JRuleParam::GetWorkEndTimeUTCForRoster(const ROSTER* roster, const bool isUtilizePostDutyRest, const string base) const {
    if (roster->pairing == nullptr) {
        return isUtilizePostDutyRest ? roster->actRestStrUtc : roster->actEndUtc;
    }
    return isUtilizePostDutyRest ? roster->pairing->getEndTimeUtcAct() : roster->pairing->getEndTimeIncludingRestUtcAct();
}

time_t CheckLegalDaysOffFor5JRuleParam::GetWorkEndTimeLocForRoster(const ROSTER* roster, const bool isUtilizePostDutyRest, const string base) const {
    if (roster->pairing == nullptr) {
        return isUtilizePostDutyRest ? roster->actRestStrLoc : roster->actEndLoc;
    }
    return isUtilizePostDutyRest ? roster->pairing->getEndTimeLocAct() : roster->pairing->getEndTimeIncludingRestLocAct();
}

bool CheckLegalDaysOffFor5JRuleParam::IsConsecutiveRest(const time_t prevRestEndTimeUtc, const ROSTER* currRoster) const {
    if (prevRestEndTimeUtc > 0 && RestPeriod::IsConsecutiveTime(prevRestEndTimeUtc, currRoster->actStrUtc)) {
        return true;
    }
    return false;
}

bool CheckLegalDaysOffFor5JRuleParam::IsConsecutiveRest(const time_t prevRestEndTimeUtc, const Duty* currDuty) const {
    if (prevRestEndTimeUtc > 0 && RestPeriod::IsConsecutiveTime(prevRestEndTimeUtc, currDuty->getStartTimeUtcAct())) {
        return true;
    }
    return false;
}

bool CheckLegalDaysOffFor5JRuleParam::IsRosterInDayOffGroup(const ROSTER* roster,
    const std::vector<const ROSTER*>& groupRosters) {
    return std::find(groupRosters.begin(), groupRosters.end(), roster) != groupRosters.end();
}

/** 取 roster 在基地本地的活动区间，供「是否夹在休息窗内」与 leading blank 重叠判断使用。 */
void CheckLegalDaysOffFor5JRuleParam::GetRosterActivityLocInterval(const ROSTER* roster,
    const bool includePairingBaseRest, time_t& outStartLoc, time_t& outEndLoc) const {
    if (roster->pairing == nullptr) {
        outStartLoc = roster->actStrLoc;
        // 跨多日地面任务（actEnd 距 actRestStr 超过 1 天）仍按整段 actEnd 计执勤，避免场景2误放行。
        constexpr time_t SECONDS_OF_DAY = 24 * 60 * 60;
        const bool multiDayDutySpan = TimeUtils::Floor(roster->actStrLoc, ChronoUnit::DAYS)
            < TimeUtils::Floor(roster->actEndLoc, ChronoUnit::DAYS)
            && roster->actEndLoc > roster->actRestStrLoc + SECONDS_OF_DAY;
        if (multiDayDutySpan) {
            outEndLoc = roster->actEndLoc;
            return;
        }
        // 与 pairing 相同：Y 时 end=执勤收工（REST 不计入执勤阻塞）；N 时 end=含 REST 结束。
        outEndLoc = includePairingBaseRest ? roster->actRestStrLoc : roster->actEndLoc;
        return;
    }
    // FLY：整段 pairing 时间；Include Pairing Base Rest=Y 时 end 为 pairing 收工（非含航后休息的延长 end）
    outStartLoc = roster->pairing->getStartTimeLocAct();
    outEndLoc = includePairingBaseRest ? roster->pairing->getEndTimeLocAct()
        : roster->pairing->getEndTimeIncludingRestLocAct();
}

bool CheckLegalDaysOffFor5JRuleParam::HasNonGroupRosterOverlapInLocRange(const std::vector<const ROSTER*>& allRosters,
    const std::vector<const ROSTER*>& groupRosters, const time_t rangeStartLoc, const time_t rangeEndLoc,
    const bool includePairingBaseRest) const {
    if (rangeEndLoc <= rangeStartLoc) {
        return false;
    }
    for (const auto* roster : allRosters) {
        if (IsRosterInDayOffGroup(roster, groupRosters)) {
            continue;
        }
        time_t rosterStartLoc = 0;
        time_t rosterEndLoc = 0;
        GetRosterActivityLocInterval(roster, includePairingBaseRest, rosterStartLoc, rosterEndLoc);
        if (rosterStartLoc < rangeEndLoc && rosterEndLoc > rangeStartLoc) {
            return true;
        }
    }
    return false;
}

time_t CheckLegalDaysOffFor5JRuleParam::GetScenarioStartLoc(const CrewDataContext& dbData, const string& base) {
    const int offsetMinutes = dbData.airportUtcOffsetMap.count(base) > 0 ? dbData.airportUtcOffsetMap.at(base) : 0;
    return dbData.scenario.startDtUTC + static_cast<time_t>(offsetMinutes) * 60;
}

time_t CheckLegalDaysOffFor5JRuleParam::LocToUtcForBase(const time_t loc, const string& base,
    const CrewDataContext& dbData) {
    const int offsetMinutes = dbData.airportUtcOffsetMap.count(base) > 0 ? dbData.airportUtcOffsetMap.at(base) : 0;
    return loc - static_cast<time_t>(offsetMinutes) * 60;
}

void CheckLegalDaysOffFor5JRuleParam::GetRequiredLegalDayOffTotals(const int numDaysOff,
    int& requiredDurationMinutes, int& requiredLocalNights) const {
    requiredDurationMinutes = 0;
    requiredLocalNights = 0;
    if (numDaysOff <= 0) {
        return;
    }
    if (!_dayOffDurationStr.empty() && _dayOffDurationStr != "*") {
        requiredDurationMinutes += _dayOffDurationMinutes;
    }
    if (!_localNightsStr.empty() && _localNightsStr != "*") {
        requiredLocalNights += _localNights;
    }
    if (numDaysOff > 1) {
        if (!_additionalDayOffDurationStr.empty() && _additionalDayOffDurationStr != "*") {
            requiredDurationMinutes += _additionalDayOffDurationMinutes * (numDaysOff - 1);
        }
        if (!_additionalDayOffLocalNightStr.empty() && _additionalDayOffLocalNightStr != "*") {
            requiredLocalNights += _additionalDayOffLocalNight * (numDaysOff - 1);
        }
    }
}

int CheckLegalDaysOffFor5JRuleParam::GetDurationDeficitMinutes(const time_t groupStartLoc, const time_t groupEndLoc,
    const int numDaysOff) const {
    int requiredDurationMinutes = 0;
    int requiredLocalNights = 0;
    GetRequiredLegalDayOffTotals(numDaysOff, requiredDurationMinutes, requiredLocalNights);
    if (requiredDurationMinutes <= 0 || groupStartLoc == 0) {
        return 0;
    }
    const int actualMinutes = static_cast<int>((groupEndLoc - groupStartLoc) / 60);
    return std::max(0, requiredDurationMinutes - actualMinutes);
}

int CheckLegalDaysOffFor5JRuleParam::GetBackwardExpansionStepMinutes(const time_t groupStartLoc,
    const time_t groupEndLoc, const int numDaysOff,
    const std::vector<const ROSTER*>& groupRosters) const {
    const int durationDeficit = GetDurationDeficitMinutes(groupStartLoc, groupEndLoc, numDaysOff);
    if (durationDeficit > 0) {
        return durationDeficit;
    }

    int requiredDurationMinutes = 0;
    int requiredLocalNights = 0;
    GetRequiredLegalDayOffTotals(numDaysOff, requiredDurationMinutes, requiredLocalNights);
    if (requiredLocalNights <= 0) {
        return 0;
    }
    const int actualLocalNights = CountLocalNightsInWindow(groupStartLoc, groupEndLoc);
    if (actualLocalNights >= requiredLocalNights) {
        return 0;
    }

    auto& localNight = RuleParams::GetInstancePtr()->getLocalNightDefinition();
    const int minLocalNightMinutes = TimeUtils::hhmmToMinutes(localNight.MinRestInterval);
    return minLocalNightMinutes > 0 ? minLocalNightMinutes : 60;
}

time_t CheckLegalDaysOffFor5JRuleParam::GetFirstLeadingBlankBlockStartLoc(const time_t anchorStartLoc,
    const std::vector<const ROSTER*>& allRosters, const std::vector<const ROSTER*>& groupRosters, const string& base,
    const CrewDataContext& dbData) const {
    if (anchorStartLoc <= 0) {
        return anchorStartLoc;
    }

    const bool includePairingBaseRest = _includePairingBaseRest == "Y";
    const time_t lowerBound = GetScenarioStartLoc(dbData, base);
    constexpr time_t SECONDS_OF_DAY = 24 * 60 * 60;

    time_t firstBlankDayStartLoc = anchorStartLoc;
    time_t cursorDayStart = TimeUtils::Floor(anchorStartLoc, ChronoUnit::DAYS);

    while (cursorDayStart > lowerBound) {
        time_t prevDayStart = cursorDayStart - SECONDS_OF_DAY;
        if (prevDayStart < lowerBound) {
            prevDayStart = lowerBound;
        }
        // [CMSCEB-1178] [BUG][CEB]7365法规在分配OFF时抛出告警
        // 改前：使用 anchorStartLoc 作为范围终点，当 anchor 不在 00:00 整点（如
        // 被前序 AS 拉回到 10:49）时，范围 [prevDayStart, anchorStartLoc) 跨越两天，
        // 被 anchor 所在日的非组 roster 误判阻断，导致前导空白天的更早部分无法利用。
        // 改后：使用 cursorDayStart（每日 00:00）作为范围终点，实现逐日独立检查，
        // 确保每天空白状态独立判定，不被相邻日 roster 误伤。
        if (HasNonGroupRosterOverlapInLocRange(allRosters, groupRosters, prevDayStart, cursorDayStart,
            includePairingBaseRest)) {
            break;
        }
        firstBlankDayStartLoc = prevDayStart;
        cursorDayStart = prevDayStart;
        if (prevDayStart <= lowerBound) {
            break;
        }
    }

    return firstBlankDayStartLoc;
}

time_t CheckLegalDaysOffFor5JRuleParam::ClampStartToValidLeadingBlank(const time_t candidateStartLoc,
    const time_t anchorStartLoc, const time_t earliestLoc, const std::vector<const ROSTER*>& allRosters,
    const std::vector<const ROSTER*>& groupRosters) const {
    time_t clampedStart = std::max(candidateStartLoc, earliestLoc);
    if (clampedStart >= anchorStartLoc) {
        return anchorStartLoc;
    }

    const bool includePairingBaseRest = _includePairingBaseRest == "Y";
    if (!HasNonGroupRosterOverlapInLocRange(allRosters, groupRosters, clampedStart, anchorStartLoc,
        includePairingBaseRest)) {
        return clampedStart;
    }

    time_t latestEndBeforeAnchor = earliestLoc;
    for (const auto* roster : allRosters) {
        if (IsRosterInDayOffGroup(roster, groupRosters)) {
            continue;
        }
        time_t rosterStartLoc = 0;
        time_t rosterEndLoc = 0;
        GetRosterActivityLocInterval(roster, includePairingBaseRest, rosterStartLoc, rosterEndLoc);
        if (rosterStartLoc < anchorStartLoc && rosterEndLoc > clampedStart) {
            latestEndBeforeAnchor = std::max(latestEndBeforeAnchor, rosterEndLoc);
        }
    }

    if (latestEndBeforeAnchor >= anchorStartLoc) {
        return anchorStartLoc;
    }
    return std::max(latestEndBeforeAnchor, earliestLoc);
}

// =============================================================================
// [CMSCEB-1178 Phase4] 校验窗 [start,end] 的终检与空白天后扩
// -----------------------------------------------------------------------------
// 语义：窗内只能是休息（连续 DO/OFF + 前后无 roster 的空白），不得包含 AS/FLY 执勤时段。
//
// ValidateDayOffGroupWithLeadingBlankDayFallback 调用顺序：
//   A. ExtendGroupEndToNextGroundRosterAfterBlank  — 支柱1：end ≥ 下一阻塞开工点
//   B. TryExtendGroupEndForLegalRequirements       — 支柱5：在上界内后扩凑够 LN/时长
//   A7. TrimValidationWindowForDutyOverlap         — 支柱7：OFF 与 duty 重叠裁切
//   C. ValidateDayOffGroupFull                     — 支柱2/3/4：无夹执勤 + 时长 + 窗内 LN
//   D. 若 C 失败且 Include Blank Day=Y → 前导空白天 v2 前移 start，回到 A（支柱6）
//
// 场景对照（7365.md）：
//   场景1/2 — 前导 blank + end→下一 AS 06:30 → 合法
//   场景3   — end→FLY 11/6 10:15（非 11/7 AS）→ 合法
//   场景4   — 月末无后续 roster，后扩至 scenario.end → 合法
//   场景5   — end→AS 04:23，窗内仅 1 LN → 告警
//   场景6   — end→FLY 11/4 21:25（非 Floor 日 00:00）→ 合法
//
// 支柱7（OFF 重叠裁切，7365.md）：
//   refresh 后、ValidateDayOffGroupFull 前调用 TrimValidationWindowForDutyOverlap。
// =============================================================================

void CheckLegalDaysOffFor5JRuleParam::GetDayOffUnionLocInterval(const std::vector<const ROSTER*>& groupRosters,
    time_t& outUnionStartLoc, time_t& outUnionEndLoc) {
    outUnionStartLoc = 0;
    outUnionEndLoc = 0;
    if (groupRosters.empty()) {
        return;
    }
    outUnionStartLoc = groupRosters.front()->actStrLoc;
    outUnionEndLoc = groupRosters.front()->actEndLoc;
    for (std::size_t i = 1; i < groupRosters.size(); ++i) {
        const auto* roster = groupRosters[i];
        outUnionStartLoc = std::min(outUnionStartLoc, roster->actStrLoc);
        outUnionEndLoc = std::max(outUnionEndLoc, roster->actEndLoc);
    }
}

/**
 * [Phase4 支柱7] 按 OFF 日历并集裁切校验窗，剔除与 AS/FLY 等重叠的分钟。
 *
 * 仅当 non-DO 执勤区间与 [offUnionStart, offUnionEnd] 相交时参与裁切，避免跨日 AS 误伤前导 blank：
 *   - 左端：dutyEnd 落在 OFF 并集内 → startLoc = max(startLoc, dutyEnd + 1min)
 *   - 右端：dutyStart 落在 OFF 并集内 → endLoc = min(endLoc, dutyStart - 1min)
 *
 * @return false 表示裁切后 endLoc <= startLoc（无有效 DO 区间）
 */
bool CheckLegalDaysOffFor5JRuleParam::TrimValidationWindowForDutyOverlap(DayOffGroupInfo& group,
    const std::vector<const ROSTER*>& allRosters, const string& base,
    const CrewDataContext* dbData) const {
    if (group.rosters.empty() || group.startLoc <= 0 || group.endLoc <= group.startLoc) {
        return false;
    }

    time_t offUnionStartLoc = 0;
    time_t offUnionEndLoc = 0;
    GetDayOffUnionLocInterval(group.rosters, offUnionStartLoc, offUnionEndLoc);
    if (offUnionStartLoc <= 0 || offUnionEndLoc <= offUnionStartLoc) {
        return false;
    }

    const bool includePairingBaseRest = _includePairingBaseRest == "Y";
    time_t trimmedStartLoc = group.startLoc;
    time_t trimmedEndLoc = group.endLoc;

    for (const auto* roster : allRosters) {
        if (IsRosterInDayOffGroup(roster, group.rosters)) {
            continue;
        }

        time_t dutyStartLoc = 0;
        time_t dutyEndLoc = 0;
        GetRosterActivityLocInterval(roster, includePairingBaseRest, dutyStartLoc, dutyEndLoc);
        if (dutyEndLoc <= dutyStartLoc) {
            continue;
        }
        // 与 OFF 日历并集无交集则跳过（端点相切仍算重叠，如 OFF 止于 23:50、下一 AS 始于 23:50）
        if (dutyStartLoc > offUnionEndLoc || dutyEndLoc < offUnionStartLoc) {
            continue;
        }

        // 前重叠：执勤收工落在 OFF 并集内 → DO 从收工后 1 分钟起算（例 00:20 → 00:21）
        if (dutyEndLoc >= offUnionStartLoc && dutyEndLoc <= offUnionEndLoc) {
            const time_t candidateStart = dutyEndLoc ;
            if (candidateStart > trimmedStartLoc) {
                trimmedStartLoc = candidateStart;
            }
        }

        // 后重叠：执勤开工落在 OFF 并集内 → DO 止于开工前 1 分钟（例 23:50 → 23:49）
        if (dutyStartLoc >= offUnionStartLoc && dutyStartLoc <= offUnionEndLoc) {
            const time_t candidateEnd = dutyStartLoc;
            if (candidateEnd < trimmedEndLoc) {
                trimmedEndLoc = candidateEnd;
            }
        }
    }

    if (trimmedEndLoc <= trimmedStartLoc) {
        return false;
    }

    group.startLoc = trimmedStartLoc;
    group.endLoc = trimmedEndLoc;
    if (dbData != nullptr) {
        group.startUtc = LocToUtcForBase(trimmedStartLoc, base, *dbData);
        group.endUtc = LocToUtcForBase(trimmedEndLoc, base, *dbData);
    }
    return true;
}

bool CheckLegalDaysOffFor5JRuleParam::HasInteriorNonGroupRosterOverlap(const time_t windowStartLoc,
    const time_t windowEndLoc, const std::vector<const ROSTER*>& allRosters,
    const std::vector<const ROSTER*>& groupRosters) const {
    if (windowEndLoc <= windowStartLoc) {
        return false;
    }
    const bool includePairingBaseRest = _includePairingBaseRest == "Y";
    for (const auto* roster : allRosters) {
        if (IsRosterInDayOffGroup(roster, groupRosters)) {
            continue;
        }
        time_t rosterStartLoc = 0;
        time_t rosterEndLoc = 0;
        GetRosterActivityLocInterval(roster, includePairingBaseRest, rosterStartLoc, rosterEndLoc);
        // 开区间 (windowStart, windowEnd)：端点可相切（end=下一班开工、start=前序收工），仅禁止「夹在中间」
        // 例：场景3 若 end 误延到 11/7 AS 则 Nov6 FLY 落在开区间内 → 应判失败
        if (rosterStartLoc > windowStartLoc && rosterEndLoc < windowEndLoc) {
            return true;
        }
    }
    return false;
}

int CheckLegalDaysOffFor5JRuleParam::CountLocalNightsInWindow(const time_t windowStartLoc,
    const time_t windowEndLoc) {
    if (windowStartLoc <= 0 || windowEndLoc <= windowStartLoc) {
        return 0;
    }
    // 只统计 [start,end] 窗内的 LN（DutyUtils）；场景5 在 end=04:23 时仅 1 LN，应报 7365。
    return DutyUtils::GetLocalNightNums(windowStartLoc, windowEndLoc);
}

/**
 * [Phase4 终检] 在已定好的 [windowStart, windowEnd] 上做法规校验（Include Blank Day=Y 时由 fallback 调用）。
 *
 * 校验项（全部通过才合法）:
 *   1. 开区间 (start,end) 内无非 DO 组 roster — 休息窗不得穿过执勤
 *   2. 时长 (end-start) ≥ 参数 Day Off Duration（及附加 DO）
 *   3. 窗内 Local Night 数 ≥ 参数要求 — 仅用 GetLocalNightNums，不对 OFF 日历日额外 +1
 */
bool CheckLegalDaysOffFor5JRuleParam::ValidateDayOffGroupFull(const time_t windowStartLoc,
    const time_t windowEndLoc, const int numDaysOff, const std::vector<const ROSTER*>& groupRosters,
    const std::vector<const ROSTER*>& allRosters) const {
    if (numDaysOff <= 0) {
        return true;
    }

    // 支柱2：窗内不得夹非 DO 执勤（旧逻辑曾把 end 延到远 AS 导致窗内穿过 FLY）
    if (HasInteriorNonGroupRosterOverlap(windowStartLoc, windowEndLoc, allRosters, groupRosters)) {
        return false;
    }

    int requiredTotalDurationMinutes = 0;
    int requiredTotalLocalNights = 0;
    GetRequiredLegalDayOffTotals(numDaysOff, requiredTotalDurationMinutes, requiredTotalLocalNights);

    // 支柱3：总时长
    if (requiredTotalDurationMinutes > 0 && windowStartLoc != 0) {
        const int actualMinutes = static_cast<int>((windowEndLoc - windowStartLoc) / 60);
        if (actualMinutes < requiredTotalDurationMinutes) {
            return false;
        }
    }

    // 支柱4：窗内 Local Night 数（不另加日历 DO 额度）
    if (requiredTotalLocalNights > 0) {
        const int actualLocalNights = CountLocalNightsInWindow(windowStartLoc, windowEndLoc);
        if (actualLocalNights < requiredTotalLocalNights) {
            return false;
        }
    }

    return true;
}

/**
 * [Phase4 支柱1] 求 DO 组在列表中最后一条 roster 之后，第一条「阻塞」执勤对应的 end 上界（本地时间）。
 *
 * - 地面 / 配对（AS、FLY 等）统一：上界 = 该条 roster 开工点（本地时间）
 *   校验窗在 FLY 开始前结束，OFF 后至 FLY start 的空白天计入（场景6 → 11/4 21:25）
 * - 之后无 roster：返回 max()，由 TryExtendGroupEndForLegalRequirements 用 scenario.end 作上界
 */
time_t CheckLegalDaysOffFor5JRuleParam::GetFirstBlockingEndCapLocAfterIndex(
    const std::vector<const ROSTER*>& allRosters, const std::size_t afterRosterIndex,
    const time_t notBeforeEndUtc) {
    for (std::size_t j = afterRosterIndex + 1; j < allRosters.size(); ++j) {
        const auto* candidate = allRosters[j];
        const time_t candidateStartUtc = GetWorkStartTimeUtcForRoster(candidate);
        if (candidateStartUtc < notBeforeEndUtc) {
            continue;
        }
        // 地面与 FLY 均返回开工点本地时间；校验窗在该时刻结束，OFF 后至该点的空白计入
        return GetWorkStartTimeLocForRoster(candidate);
    }
    return std::numeric_limits<time_t>::max();
}

/**
 * [Phase4 支柱1] 将组 end 至少延伸到 DO 之后第一条阻塞点（OFF 结束至下一执勤间的空白天计入窗内）。
 * 完整后扩（为凑够 LN/时长）由 TryExtendGroupEndForLegalRequirements 在同上界内继续推进。
 */
void CheckLegalDaysOffFor5JRuleParam::ExtendGroupEndToNextGroundRosterAfterBlank(DayOffGroupInfo& group,
    const std::vector<const ROSTER*>& allRosters, const std::size_t afterRosterIndex, const string& base,
    const CrewDataContext* dbData) const {
    if (_includeBlankDay != "Y" || group.rosters.empty()) {
        return;
    }

    // 至少把 end 拉到 DO 组最后一条 roster 之后、第一条阻塞 roster 的开工点
    const time_t capEndLoc = GetFirstBlockingEndCapLocAfterIndex(allRosters, afterRosterIndex, group.endUtc);
    if (capEndLoc == std::numeric_limits<time_t>::max()) {
        return;
    }
    if (capEndLoc >= group.endLoc) {
        group.endLoc = capEndLoc;
        if (dbData != nullptr) {
            group.endUtc = LocToUtcForBase(capEndLoc, base, *dbData);
        }
    }
}

/**
 * [Phase4 支柱5] 当校验窗 [start,end] 内 Local Night 或时长不足时，向后纳入 OFF 之后的合法空白天。
 *
 * 算法:
 *   upperBound = min(下一非 DO 阻塞点, scenario.endDt)
 *   neededEnd  = max(当前 end, 覆盖 N 个 LN 的最小 end, start + 所需时长)
 *   newEnd     = min(neededEnd, upperBound)
 *
 * 典型场景:
 *   - 场景1/2：下一 AS 06:30 为上界，空白天 00:00–06:30 计入，凑够 2 LN
 *   - 场景4：无后续 roster，上界为 scenario.end，可扩至满足 2 LN
 *   - 场景5：上界为下一 AS 04:23，几何上无法凑满第 2 LN → 后扩无效，终检仍告警
 *
 * 注意: 后扩后仍用 ValidateDayOffGroupFull 按窗内 GetLocalNightNums 计数，不额外加 LN。
 */
void CheckLegalDaysOffFor5JRuleParam::TryExtendGroupEndForLegalRequirements(DayOffGroupInfo& group,
    const std::vector<const ROSTER*>& allRosters, const std::size_t lastDoRosterIndexInList,
    const string& base, const CrewDataContext* dbData) const {
    if (_includeBlankDay != "Y" || group.rosters.empty() || group.startLoc <= 0) {
        return;
    }

    const int numDaysOff = static_cast<int>(group.rosters.size());
    int requiredDurationMinutes = 0;
    int requiredLocalNights = 0;
    GetRequiredLegalDayOffTotals(numDaysOff, requiredDurationMinutes, requiredLocalNights);

    // --- 后扩上界（不得超过下一执勤，也不得超过场景结束）---
    time_t upperBound = GetFirstBlockingEndCapLocAfterIndex(allRosters, lastDoRosterIndexInList, group.endUtc);

    if (dbData != nullptr) {
        const time_t scenarioEndLoc = GetScenarioEndLoc(*dbData, base);
        if (scenarioEndLoc > 0) {
            if (upperBound == std::numeric_limits<time_t>::max()) {
                upperBound = scenarioEndLoc;
            }
            else {
                upperBound = std::min(upperBound, scenarioEndLoc);
            }
        }
    }

    if (upperBound == std::numeric_limits<time_t>::max()) {
        return;
    }

    time_t neededEndLoc = group.endLoc;

    // --- LN 不足：需要的最早 end（从 start 起第 N 个完整 LN 带结束时刻）---
    if (requiredLocalNights > 0) {
        const int actualLn = CountLocalNightsInWindow(group.startLoc, group.endLoc);
        if (actualLn < requiredLocalNights) {
            const time_t lnEndLoc = CalculateMinEndForRequiredLocalNights(group.startLoc, requiredLocalNights, base);
            if (lnEndLoc > 0 && lnEndLoc > neededEndLoc) {
                neededEndLoc = lnEndLoc;
            }
        }
    }

    // --- 时长不足：start + Day Off Duration ---
    if (requiredDurationMinutes > 0) {
        const int actualMinutes = static_cast<int>((group.endLoc - group.startLoc) / 60);
        if (actualMinutes < requiredDurationMinutes) {
            const time_t durationEndLoc = group.startLoc + static_cast<time_t>(requiredDurationMinutes) * 60;
            if (durationEndLoc > neededEndLoc) {
                neededEndLoc = durationEndLoc;
            }
        }
    }

    const time_t newEndLoc = std::min(neededEndLoc, upperBound);
    if (newEndLoc <= group.endLoc) {
        return;
    }

    group.endLoc = newEndLoc;
    if (dbData != nullptr) {
        group.endUtc = LocToUtcForBase(newEndLoc, base, *dbData);
    }
}

/**
 * [CMSCEB-1178] 带空白天 fallback 的 DO 组合法校验（Roster Editor 分配 OFF 时入口）。
 *
 * 阶段 A — 后向定 end:
 *   ExtendGroupEndToNextGroundRosterAfterBlank + TryExtendGroupEndForLegalRequirements
 * 阶段 B — 终检:
 *   ValidateDayOffGroupFull（窗内 LN / 时长 / 无夹执勤）
 * 阶段 C — 前导空白天 v2（仅当 B 失败且 Include Blank Day=Y）:
 *   向前扩 start，每步重新执行阶段 A（start 变早后 end 上界可能需重新后扩）
 */
bool CheckLegalDaysOffFor5JRuleParam::ValidateDayOffGroupWithLeadingBlankDayFallback(DayOffGroupInfo& group,
    const std::vector<const ROSTER*>& allRosters, const string& base, const CrewDataContext& dbData) const {
    const int numDaysOff = static_cast<int>(group.rosters.size());
    if (numDaysOff <= 0) {
        return true;
    }

    // 定位 DO 组最后一条 roster 在全列表中的下标，供支柱1/5 查找「其后」的阻塞点
    std::size_t lastDoRosterIndexInList = 0;
    for (std::size_t k = 0; k < allRosters.size(); ++k) {
        if (allRosters[k] == group.rosters.back()) {
            lastDoRosterIndexInList = k;
            break;
        }
    }

    // 阶段 A + 支柱7：后向定 end/后扩后，按 OFF 并集裁切与 duty 重叠段
    auto refreshAndTrimWindow = [&]() -> bool {
        ExtendGroupEndToNextGroundRosterAfterBlank(group, allRosters, lastDoRosterIndexInList, base, &dbData);
        TryExtendGroupEndForLegalRequirements(group, allRosters, lastDoRosterIndexInList, base, &dbData);
        return TrimValidationWindowForDutyOverlap(group, allRosters, base, &dbData);
    };

    if (!refreshAndTrimWindow()) {
        return false;
    }

    time_t endMaxLoc = group.endLoc;
    time_t windowStartLoc = group.startLoc;

    // 阶段 B：终检；已通过则写回 group 并返回（场景6 在仅后向定 end 时即可通过）
    if (ValidateDayOffGroupFull(windowStartLoc, endMaxLoc, numDaysOff, group.rosters, allRosters)) {
        return true;
    }

    if (_includeBlankDay != "Y") {
        return false;
    }

    // 阶段 C：前导空白天 — 找 anchor 之前连续无 roster 的最早 00:00（Fix B 逐日检查）
    const time_t anchorStartLoc = windowStartLoc;
    const time_t earliestLoc = GetFirstLeadingBlankBlockStartLoc(anchorStartLoc, allRosters, group.rosters, base, dbData);
    if (earliestLoc >= anchorStartLoc) {
        return false;
    }

    // 阶段 D：按缺口分钟向前试缩 start，每步刷新 end 并终检（场景1 → start 可至 10/31 或 11/1 18:30）
    constexpr int maxIterations = 512;
    for (int iteration = 0; iteration < maxIterations; ++iteration) {
        if (ValidateDayOffGroupFull(windowStartLoc, endMaxLoc, numDaysOff, group.rosters, allRosters)) {
            group.startLoc = windowStartLoc;
            group.startUtc = LocToUtcForBase(windowStartLoc, base, dbData);
            return true;
        }

        const int stepMinutes = GetBackwardExpansionStepMinutes(windowStartLoc, endMaxLoc, numDaysOff, group.rosters);
        if (stepMinutes <= 0) {
            break;
        }

        time_t candidateStartLoc = windowStartLoc - static_cast<time_t>(stepMinutes) * 60;
        if (candidateStartLoc < earliestLoc) {
            candidateStartLoc = earliestLoc;
        }
        candidateStartLoc = ClampStartToValidLeadingBlank(candidateStartLoc, anchorStartLoc, earliestLoc, allRosters,
            group.rosters);

        if (candidateStartLoc >= windowStartLoc) {
            break;
        }
        windowStartLoc = candidateStartLoc;
        group.startLoc = windowStartLoc;
        if (!refreshAndTrimWindow()) {
            return false;
        }
        endMaxLoc = group.endLoc;
    }

    // 用尽前导步进后：以最终 start/end 再刷新、裁切并做最后一次终检
    group.startLoc = windowStartLoc;
    if (!refreshAndTrimWindow()) {
        return false;
    }
    return ValidateDayOffGroupFull(group.startLoc, group.endLoc, numDaysOff, group.rosters, allRosters);
}

// =====================================================================
// 场景时间边界与「满足 N 个 LN 的最小 end」几何计算（供 TryExtendGroupEndForLegalRequirements 使用）
// =====================================================================

/**
 * 将 scenario.endDtUTC 转为基地本地时间，作为空白天后扩的上界之一。
 *
 * 行为：
 *   - 正常情况：返回 endDtUTC + offsetMinutes*60（base 本地时区的 scenario 结束点）。
 *   - endDtUTC == 0（scenario 未设置或异常）：返回 0，调用方应解释为"无上界，跳过 trailing 扩展"。
 *   - 基地未注册时区：offsetMinutes = 0，使用 UTC。
 *
 * @param dbData  场景数据上下文
 * @param base    基地 IATA（如 "MNL"）
 * @return        base 本地的 scenario 结束时间；0 表示无效
 */
time_t CheckLegalDaysOffFor5JRuleParam::GetScenarioEndLoc(const CrewDataContext& dbData, const string& base) {
    if (dbData.scenario.endDtUTC == 0) {
        // scenario 未设置 endDt — 调用方应跳过 trailing 扩展
        return 0;
    }
    const int offsetMinutes = dbData.airportUtcOffsetMap.count(base) > 0
        ? dbData.airportUtcOffsetMap.at(base) : 0;
    return dbData.scenario.endDtUTC + static_cast<time_t>(offsetMinutes) * 60;
}

/**
 * 从 startLoc 起，计算使 [startLoc, endLoc] 至少能覆盖 requiredLocalNights 个「完整 LN 带」的最小 endLoc。
 *
 * 基于 Local_Night_Definition（LocalStart/LocalEnd/MinRestInterval）:
 *   1. 找 start 之后第一个 LocalStart（如 22:00）
 *   2. 第一个完整 LN 带结束于 firstNightEndLoc（次日 LocalEnd，如 08:00）
 *   3. 每多 1 个 LN，end 再 +24h
 *
 * 说明: 这是后扩用的几何下界；最终是否合法仍以 ValidateDayOffGroupFull 内 GetLocalNightNums 为准，
 *       且 end 不得超过下一非 DO 执勤（场景5 上界 04:23 时几何下界可能高于上界，后扩无效）。
 */
time_t CheckLegalDaysOffFor5JRuleParam::CalculateMinEndForRequiredLocalNights(const time_t startLoc,
    const int requiredLocalNights, const string& base) {
    (void)base;
    if (startLoc <= 0 || requiredLocalNights <= 0) {
        return 0;
    }

    auto& localNight = RuleParams::GetInstancePtr()->getLocalNightDefinition();
    int localStartMin = TimeUtils::hhmmToMinutes(localNight.LocalStart);
    int localEndMin = TimeUtils::hhmmToMinutes(localNight.LocalEnd);
    int minRestMin = TimeUtils::hhmmToMinutes(localNight.MinRestInterval);
    if (localStartMin < 0) {
        localStartMin = 22 * 60;
    }
    if (localEndMin < 0) {
        localEndMin = 8 * 60;
    }
    if (minRestMin <= 0) {
        minRestMin = 60;
    }

    constexpr time_t SECONDS_PER_DAY = 24 * 60 * 60;
    constexpr time_t SECONDS_PER_MINUTE = 60;

    const time_t startDayMidnight = TimeUtils::Floor(startLoc, ChronoUnit::DAYS);
    time_t firstNightStartLoc = startDayMidnight + static_cast<time_t>(localStartMin) * SECONDS_PER_MINUTE;
    if (firstNightStartLoc < startLoc) {
        firstNightStartLoc += SECONDS_PER_DAY;
    }

    time_t firstNightEndLoc = firstNightStartLoc + SECONDS_PER_DAY;
    const int lnBandMinutes = (24 * 60 - localStartMin + localEndMin);
    if (minRestMin > lnBandMinutes) {
        firstNightStartLoc += SECONDS_PER_DAY;
        firstNightEndLoc += SECONDS_PER_DAY;
    }

    time_t endLoc = firstNightEndLoc;
    for (int nightIndex = 1; nightIndex < requiredLocalNights; ++nightIndex) {
        endLoc += SECONDS_PER_DAY;
    }
    return endLoc;
}

time_t CheckLegalDaysOffFor5JRuleParam::CalculateMinEndForTwoLocalNights(const time_t startLoc, const string& base) {
    return CalculateMinEndForRequiredLocalNights(startLoc, 2, base);
}
