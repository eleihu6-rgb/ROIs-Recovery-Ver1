/**
 * @file CheckNightRestPeriodForEvaRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2024-08-19
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "CheckNightRestPeriodForEvaRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/CompositionRule.h"
#include "../constant/Constants.h"

#include "RuleParams.h"

using namespace std;

void CheckNightRestPeriodForEvaRuleParam::ParseParam(const DBRule& dbRule) {
    RuleParam::ParseParam(dbRule);
    map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
    //Bases,Ranks,Fleets,Teams,Compositions,Duty Assignments,Duty Type,Consecutive Hours,Cumulative Max BLH,Min Rest
    string header, headeValue;
    for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
    {
        header = iter->first;
        headeValue = iter->second;

        if (header == "BASES") {
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _bases);
            }
        }
        else if (header == "RANKS") {
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _ranks);
            }
        }
        else if (header == "FLEETS") {
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _fleets);
            }
        }
        else if (header == "TEAMS") {
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _teams);
            }
        }
        else if (header == "COMPOSITIONS") {
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _compositions);
            }
        }
        else if (header == "DUTY ASSIGNMENTS") {
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _dutyAssignments);
            }
        }
        else if (header == "CHECK TYPE") {
            _checkType = headeValue;
        }
        else if (header == "TYPE VALUE") {
            _typeValue = TimeUtils::hhmmToMinutes(headeValue);
        }
        else if (header == "NIGHT START") {


            _nightStart = TimeUtils::hhmmToMinutes(headeValue);
        }
        else if (header == "NIGHT END") {
            _nightEnd = TimeUtils::hhmmToMinutes(headeValue);
        }
        else if (header == "MIN REST BEFORE") {
            _minRestBefore = TimeUtils::hhmmToMinutes(headeValue);
        }
        else if (header == "SLEEP CYCLE START") {
            _sleepCycleStart = TimeUtils::hhmmToMinutes(headeValue);
        }
        else if (header == "SLEEP CYCLE END") {
            _sleepCycleEnd = TimeUtils::hhmmToMinutes(headeValue);
        }
        else if (header == "MIN SLEEP CYCLES") {
            _minSleepCycles = atoi(headeValue.c_str());
        }
        else
            Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
    }
}

bool CheckNightRestPeriodForEvaRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
    std::vector<string> positions;
    if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
        return true;
    return false;
}

bool CheckNightRestPeriodForEvaRuleParam::MatchNightDuty(Duty* duty) const {
    const auto& seg = duty->getFirstSegment();
    if (seg == nullptr)
        return false;
    if (TimeUtils::IsTimesInRange(seg->getStartTimeLocAct(), _nightStart, _nightEnd)) {
        return true;
    }
    return false;
}

bool CheckNightRestPeriodForEvaRuleParam::MatchComposition(Duty* duty) const {
    if (_compositions.empty()) {
        return true;
    }
    bool isEditorModel = this->GetRule()->IsEditorModel();
    string compName = duty->getCompositionName();

    //Always recalcuate in editor application
    if (compName.empty() || isEditorModel)
        compName = CompositionRule::GetMinCompositionForRest(duty, this->GetRule()->GetDataContext());

    auto iter = std::find(_compositions.cbegin(), _compositions.cend(), compName);
    return iter != _compositions.cend();
}

bool CheckNightRestPeriodForEvaRuleParam::MatchDutyAssignments(Duty* duty) const {
    if (_dutyAssignments.empty()) {
        return true;
    }
    string assignment = duty->getAssignment();
    auto iter = std::find(_dutyAssignments.cbegin(), _dutyAssignments.cend(), assignment);
    return iter != _dutyAssignments.cend();
}

bool CheckNightRestPeriodForEvaRuleParam::MatchCheckType(Duty* duty) const {
    if (_checkType == "BLH")
        return duty->getActualBlockTime() > _typeValue;
    if (_checkType == "FDP")
        return duty->getActualFDP() > _typeValue;
    return false;
}

bool CheckNightRestPeriodForEvaRuleParam::MatchRule(Duty* duty) const {

    if (!MatchNightDuty(duty)) {
        return false;
    }

    if (!MatchComposition(duty)) {
        return false;
    }

    if (!MatchDutyAssignments(duty)) {
        return false;
    }

    if (!MatchCheckType(duty)) {
        return false;
    }

    return true;
}

bool CheckNightRestPeriodForEvaRuleParam::CheckMinRestBefore(const time_t startTimeLoc, const time_t endTimeLoc) const {
    int restTime = static_cast<int>(endTimeLoc - startTimeLoc);
    return restTime >= _minRestBefore * 60;
}

bool CheckNightRestPeriodForEvaRuleParam::CheckSleepCycles(const time_t startTimeLoc, const time_t endTimeLoc) const {
    int sleepCycles = GetSleepCycleNum(startTimeLoc, endTimeLoc);
    return sleepCycles >= _minSleepCycles;
}

int CheckNightRestPeriodForEvaRuleParam::GetSleepCycleNum(const time_t startTimeLoc, const time_t endTimeLoc) const {

    int numberOfSleepCycles = 0;

    //步骤1：获得开始计算第一天startLocalDay，以及结束最后一天（结束日期）endLocalDay
    //开始日期（本地时间：天）
    time_t startLocalDay = TimeUtils::Floor(startTimeLoc, ChronoUnit::DAYS);
    //结束日期（本地时间：天）
    time_t endLocalDay = TimeUtils::Floor(endTimeLoc, ChronoUnit::DAYS);

    time_t firstDayLocalNightLower = -1;
    time_t firstDayLocalNightUpper = -1;
    time_t lastDayLocalNightLower = -1;
    time_t lastDayLocalNightUpper = -1;

    int minSleepCycleMinute = 0;
    if (_sleepCycleEnd < _sleepCycleStart) {
        minSleepCycleMinute = _sleepCycleEnd + 3600 * 24 - _sleepCycleStart;
    }
    else {
        minSleepCycleMinute = _sleepCycleEnd - _sleepCycleStart;
    }
   
    //步骤2：获得第一天满足本地夜晚开始下限值firstDayLocalNightLower、结束上限firstDayLocalNightUpper
    firstDayLocalNightLower = startLocalDay + _sleepCycleStart * 60;
    firstDayLocalNightUpper = firstDayLocalNightLower + minSleepCycleMinute * 60;

    //步骤3：获得最后一天满足本地夜晚上限值lastDayLocalNightUpper、下限值lastDayLocalNightLower
    lastDayLocalNightLower = endLocalDay + _sleepCycleStart * 60;
    lastDayLocalNightUpper = lastDayLocalNightLower + minSleepCycleMinute * 60;
    


    //第一天和最后一天处理，注意可能是同一天特殊处理。
    bool matchFirstDay = false;
    if (startTimeLoc <= firstDayLocalNightLower && endTimeLoc >= firstDayLocalNightUpper) {
        matchFirstDay = true;
        numberOfSleepCycles++;
    }
    bool matchLastDay = false;
    if (startTimeLoc <= lastDayLocalNightLower && endTimeLoc >= lastDayLocalNightUpper) {
        matchLastDay = true;
        numberOfSleepCycles++;
    }
    //针对首尾是同一天，并且都匹配到规则，则减去重复计算多出1天。
    if (matchLastDay && matchFirstDay && (startLocalDay == endLocalDay)) {
        numberOfSleepCycles--;
    }

    int secondsOfDay = 24 * 60 * 60; //每天秒数
    int intervalDayNums = static_cast<int>(endLocalDay - startLocalDay) / secondsOfDay - 1;
    numberOfSleepCycles += (intervalDayNums < 0 ? 0 : intervalDayNums);
    return numberOfSleepCycles;
    
}


