/**
 * @file CheckSchMinRestAfterCumulativeFTForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "CheckSchMinRestAfterCumulativeFTForEvaFdRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/SchDutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/CompositionRule.h"
#include "../constant/Constants.h"

#include "RuleParams.h"

using namespace std;

void CheckSchMinRestAfterCumulativeFTForEvaFdRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
            case enum_to_underlying(ParamLocation::BASES): {
                if (substr != RuleParamConstant::ALL) {
                    split(substr, '|', _bases);
                }
                break;
            }
            case enum_to_underlying(ParamLocation::RANKS): {
                if (substr != RuleParamConstant::ALL) {
                    split(substr, '|', _ranks);
                }
                break;
            }
            case enum_to_underlying(ParamLocation::FLEETS): {
                if (substr != RuleParamConstant::ALL) {
                    split(substr, '|', _fleets);
                }
                break;
            }
            case enum_to_underlying(ParamLocation::TEAMS): {
                if (substr != RuleParamConstant::ALL) {
                    split(substr, '|', _teams);
                }
                break;
            }
            case enum_to_underlying(ParamLocation::COMPOSITIONS): {
                if (substr != RuleParamConstant::ALL) {
                    split(substr, '|', _compositions);
                }
                break;
            }
            case enum_to_underlying(ParamLocation::DUTY_ASSIGNMENTS): {
                if (substr != RuleParamConstant::ALL) {
                    split(substr, '|', _dutyAssignments);
                }
                break;
            }
            case enum_to_underlying(ParamLocation::DUTY_TYPE): {
                if (substr != RuleParamConstant::ALL) {
                    split(substr, '|', _dutyTypes);
                }
                break;
            }
            case enum_to_underlying(ParamLocation::CONSECUTIVE_HOURS): {
                _strConsecutiveHours = substr;
                _consecutiveHoursMinutes = TimeUtils::hhmmToMinutes(substr);
                break;
            }
            case enum_to_underlying(ParamLocation::CUMULATIVE_MAX_BLH): {
                _strCumulativeMaxFT = substr;
                _cumulativeMaxFTMinutes = TimeUtils::hhmmToMinutes(substr);
                break;
            }
            case enum_to_underlying(ParamLocation::MIN_REST): {
                _strMinRest = substr;
                _minRestMinutes = TimeUtils::hhmmToMinutes(substr);
                break;
            }
            case enum_to_underlying(ParamLocation::SEVERITY):
                this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(substr.c_str())));
                break;
            default:
                Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void CheckSchMinRestAfterCumulativeFTForEvaFdRuleParam::ParseParam(const DBRule& dbRule) {
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
        else if (header == "DUTY TYPE" || header == "DUTY DIR") {
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _dutyTypes);
            }
        }
        else if (header == "CONSECUTIVE HOURS") {
            _strConsecutiveHours = headeValue;
            _consecutiveHoursMinutes = TimeUtils::hhmmToMinutes(headeValue);
        }
        else if (header == "CUMULATIVE MAX BLH") {
            _strCumulativeMaxFT = headeValue;
            _cumulativeMaxFTMinutes = TimeUtils::hhmmToMinutes(headeValue);
        }
        else if (header == "MIN REST") {
            _strMinRest = headeValue;
            _minRestMinutes = TimeUtils::hhmmToMinutes(headeValue);
        }
        else if (header == "SEVERITY")
            this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
        else
            Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
    }
}

bool CheckSchMinRestAfterCumulativeFTForEvaFdRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
    std::vector<string> positions;
    if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
        return true;
    return false;
}

bool CheckSchMinRestAfterCumulativeFTForEvaFdRuleParam::MatchComposition(const Duty& duty) const {
    if (_compositions.empty()) {
        return true;
    }
    bool isEditorModel = this->GetRule()->IsEditorModel();
    string compName = duty.getCompositionName();

    //Always recalcuate in editor application
    if (compName.empty() || isEditorModel)
        compName = CompositionRule::GetMinCompositionForRest(const_cast<Duty*>(&duty), this->GetRule()->GetDataContext());

    auto iter = std::find(_compositions.cbegin(), _compositions.cend(), compName);
    return iter != _compositions.cend();
}

bool CheckSchMinRestAfterCumulativeFTForEvaFdRuleParam::MatchDutyAssignments(const Duty& duty) const {
    if (_dutyAssignments.empty()) {
        return true;
    }
    string assignment = duty.getAssignment();
    auto iter = std::find(_dutyAssignments.cbegin(), _dutyAssignments.cend(), assignment);
    return iter != _dutyAssignments.cend();
}

bool CheckSchMinRestAfterCumulativeFTForEvaFdRuleParam::MatchDutyTypes(const Duty& duty) const {
    if (_dutyTypes.empty()) {
        return true;
    }
    string domIntType = duty.getDomIntType();
    auto iter = std::find(_dutyTypes.cbegin(), _dutyTypes.cend(), domIntType);
    return iter != _dutyTypes.cend();
}

bool CheckSchMinRestAfterCumulativeFTForEvaFdRuleParam::MatchRule(const Duty& duty) const {

    if (!MatchComposition(duty)) {
        return false;
    }

    if (!MatchDutyAssignments(duty)) {
        return false;
    }

    if (!MatchDutyTypes(duty)) {
        return false;
    }

    return true;
}

bool CheckSchMinRestAfterCumulativeFTForEvaFdRuleParam::CheckRule(const Duty* currDuty, const Duty* nextDuty, const int minRest) const {
    int	scheduleRest = SchDutyUtils::GetScheduleRestMinutes(currDuty, nextDuty, this->GetRule()->GetDataContext());
    time_t schRestStartTimeUtc = SchDutyUtils::GetDutySchEndTimeUtc(currDuty);
    this->GetRule()->getRuleViolation().SetParam("scheduleRest", TimeUtils::MinutesTohhmm(scheduleRest));
    this->GetRule()->getRuleViolation().SetParam("schRestStartTimeUtc", StringUtils::lltos((long long)schRestStartTimeUtc));
    this->GetRule()->getRuleViolation().SetParam("schRestEndTimeUtc", StringUtils::lltos((long long)(schRestStartTimeUtc + (time_t)scheduleRest * 60)));

    return scheduleRest >= minRest;
}