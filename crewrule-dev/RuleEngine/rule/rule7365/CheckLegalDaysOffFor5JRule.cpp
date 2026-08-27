/**
 * @file CheckLegalDaysOffFor5JRule.cpp
 * @brief Rule 7365 - Legal Days Off validation for 5J
 *
 * [CMSCEB-1178] Roster Editor 分配 OFF 时校验连续 DO 组是否满足 36:00 + Local Night 等参数。
 * 有 CrewDataContext 时走 Phase4：ValidateDayOffGroupWithLeadingBlankDayFallback（空白天前后扩 + 终检）；
 * 违规区间使用扩展后的 group_start / group_end（UTC）上报。
 *
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2025-04-14
**/

#include "RuleSytem.h"
#include "CheckLegalDaysOffFor5JRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "TimezoneUtils.h"
#include "../period/RestPeriod.h"

using namespace std;

bool CheckLegalDaysOffFor5JRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
    if (this->_ruleParams.empty() || rosters.empty()) {
        return true;
    }

    bool passAllRule = true;
    auto& crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
    string base = crew->getPrimeBase();

    for (const auto& ruleParam : _ruleParams) {
        _ruleViolation.SetRuleParam(ruleParam);
        _ruleViolation.SetParam("crew_id", crew->idCrew);
        _ruleViolation.SetParam("base", base);

        // 按时间序拼连续 DO 组，并做支柱1 初定 [start,end]（含 FLY 开工点为 end 上界）
        auto consecutiveGroups = ruleParam.GetConsecutiveDayOffGroupInfos(rosters, base);

        // 每组走 Phase4 fallback；失败则抛出「Date assigned not legal days off」
        for (auto dayOffGroup : consecutiveGroups) {
            if (!ValidateConsecutiveDayOffGroup(dayOffGroup, ruleParam, base, rosters)) {
                passAllRule = false;
            }
        }
    }

    return passAllRule;
}

bool CheckLegalDaysOffFor5JRule::ValidateConsecutiveDayOffGroup(CheckLegalDaysOffFor5JRuleParam::DayOffGroupInfo& dayOffGroup,
    const CheckLegalDaysOffFor5JRuleParam& ruleParam, const string& base,
    const std::vector<const ROSTER*>& allRosters) const {

    if (dayOffGroup.rosters.empty()) {
        return true;
    }

    // 无场景数据：仅按 OFF 条目的 [start,end] 做简单时长/LN 校验（不含空白天扩展）
    if (this->_dbData == nullptr) {
        return ruleParam.ValidateDayOffGroup(dayOffGroup.startLoc, dayOffGroup.endLoc,
            static_cast<int>(dayOffGroup.rosters.size()));
    }

    // Phase4 主路径：后向定 end、后扩、终检、前导空白天 v2
    if (!ruleParam.ValidateDayOffGroupWithLeadingBlankDayFallback(dayOffGroup, allRosters, base, *this->_dbData)) {
        if (this->_application == ROSTER_OPTIMIZER) {
            return false;
        }
        const int numDaysOff = static_cast<int>(dayOffGroup.rosters.size());
        _ruleViolation.SetParam("group_start", to_string(dayOffGroup.startUtc));
        _ruleViolation.SetParam("group_end", to_string(dayOffGroup.endUtc));
        _ruleViolation.SetParam("num_days_off", to_string(numDaysOff));

        ThrowRuleViolation(dayOffGroup.startUtc, dayOffGroup.endUtc);
        return false;
    }

    return true;
}

void CheckLegalDaysOffFor5JRule::ThrowRuleViolation(const time_t groupStartUtc, const time_t groupEndUtc) const {
    string crewId = _ruleViolation.GetParam("crew_id");
    string msg = "Date assigned not legal days off";

    _ruleViolation.GetRuleLegality()->isLegal = false;
    _ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
    RULE_VIOLATION* rv = new RULE_VIOLATION();
    rv->crewId = crewId;

    // 告警区间为 fallback 扩展后的整段 UTC（含纳入的空白天）
    rv->startDTUtc = groupStartUtc;
    rv->endDTUtc = groupEndUtc;
    rv->violation_msg = msg;
    rv->type = VIOLATION_TYPE::CREW_VIOLATION;
    _ruleViolation.AddRuleViolations(rv);
}

void CheckLegalDaysOffFor5JRule::ParseParam(const InputType& input) {
    for (const auto& dbRule : input.dbRules) {
        _ruleParams.emplace_back(CheckLegalDaysOffFor5JRuleParam(this));
        auto& newParam = _ruleParams.back();
        newParam.ParseParam(dbRule);
    }
}
