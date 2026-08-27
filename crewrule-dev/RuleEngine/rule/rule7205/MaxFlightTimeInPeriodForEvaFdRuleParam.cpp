/**
 * @file MaxFlightTimeInPeriodForEvaFdRuleParam.cpp
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
#include "MaxFlightTimeInPeriodForEvaFdRuleParam.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"

using namespace std;

void MaxFlightTimeInPeriodForEvaFdRuleParam::ParseParam(const std::string &paramString) {
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
                _strDutyType = substr;
                if (substr != RuleParamConstant::ALL) {
                    split(substr, '|', _dutyTypes);
                }
                break;
            }
            case enum_to_underlying(ParamLocation::DISCRETION_APPLICABLE): {
                _strDiscretionApplicable = substr;
                if (substr != RuleParamConstant::ALL && !substr.empty()) {
                    _isDiscretionApplicable = (substr == RuleParamConstant::YES);
                }
                break;
            }
            case enum_to_underlying(ParamLocation::SERVICE_TYPE): {
                _strServiceType = substr;
                if (substr != RuleParamConstant::ALL && !substr.empty()) {
                    split(substr, '|', _serviceTypes);
                }
                break;
            }
            case enum_to_underlying(ParamLocation::PERIOD): {
                _timePeriod = atoi(substr.c_str());
                break;
            }
            case enum_to_underlying(ParamLocation::UNIT): {
                _timePeriodUnit = substr;
                break;
            }
            case enum_to_underlying(ParamLocation::LIMIT_BLH_RANGE): {
                _limitBLHRange = substr;

                vector<string> splitstrs;
                split(_limitBLHRange.c_str(), '-', splitstrs);
                if (splitstrs.size() >= 2) {
                    _limitBLHMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
                    _limitBLHMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
                }
                break;
            }
            case enum_to_underlying(ParamLocation::LIMIT_FDP_RANGE): {
                _limitFDPRange = substr;

                vector<string> splitstrs;
                split(_limitFDPRange.c_str(), '-', splitstrs);
                if (splitstrs.size() >= 2) {
                    _limitFDPMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
                    _limitFDPMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
                }
                break;
            }
            case enum_to_underlying(ParamLocation::LIMIT_DP_RANGE): {
                _limitDPRange = substr;

                vector<string> splitstrs;
                split(_limitDPRange.c_str(), '-', splitstrs);
                if (splitstrs.size() >= 2) {
                    _limitDPMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
                    _limitDPMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
                }
                break;
            }
            case enum_to_underlying(ParamLocation::SEVERITY): {
                this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(substr.c_str())));
                break;
            }
            default:
                Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void MaxFlightTimeInPeriodForEvaFdRuleParam::ParseParam(const DBRule& dbRule) {
    RuleParam::ParseParam(dbRule);
    map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
    string header, headeValue;
    for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
    {
        header = iter->first;
        headeValue = iter->second;
        //Bases,Ranks,Fleets,Teams,Compositions,Duty Assignments,Duty Type,Period,Unit,Limit BLH Range,Limit FDP Range,Limit DP Range
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
            _strDutyType = headeValue;
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _dutyTypes);
            }
        }
        else if (header == "DISCRETION APPLICABLE(Y/N)" || header == "DISCRETION APPLICABLE") {
            _strDiscretionApplicable = headeValue;
            if (headeValue != RuleParamConstant::ALL && !headeValue.empty()) {
                _isDiscretionApplicable = (headeValue == RuleParamConstant::YES);
            }
        }
        else if (header == "SERVICE TYPE") {
            _strServiceType = headeValue;
            if (headeValue != RuleParamConstant::ALL && !headeValue.empty()) {
                split(headeValue, '|', _serviceTypes);
            }
        }
        else if (header == "PERIOD") {
            _timePeriod = atoi(headeValue.c_str());
        }
        else if (header == "UNIT") {
            _timePeriodUnit = headeValue;
        }
        else if (header == "LIMIT RANGES" || header == "LIMIT BLH RANGE" || header == "LIMIT FLIGHT TIME RANGE" || header == "LIMIT FT RANGE") {
            _limitBLHRange = headeValue;

            vector<string> splitstrs;
            split(_limitBLHRange.c_str(), '-', splitstrs);
            if (splitstrs.size() >= 2) {
                _limitBLHMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
                _limitBLHMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
            }
        }
        else if (header == "LIMIT FDP RANGE") {
            _limitFDPRange = headeValue;

            vector<string> splitstrs;
            split(_limitFDPRange.c_str(), '-', splitstrs);
            if (splitstrs.size() >= 2) {
                _limitFDPMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
                _limitFDPMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
            }
        }
        else if (header == "LIMIT DP RANGE") {
            _limitDPRange = headeValue;

            vector<string> splitstrs;
            split(_limitDPRange.c_str(), '-', splitstrs);
            if (splitstrs.size() >= 2) {
                _limitDPMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
                _limitDPMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
            }
        }
       else if (header == "SEVERITY") {
            this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
        }
        else
            Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
    }
}

bool MaxFlightTimeInPeriodForEvaFdRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
    std::vector<string> positions;
    if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
        return true;
    return false;
}

bool MaxFlightTimeInPeriodForEvaFdRuleParam::MatchComposition(const Duty& duty) const {
    if (_compositions.empty()) {
        return true;
    }
    bool isEditorModel = this->GetRule()->IsEditorModel();
    string compName = duty.getCompositionName();
    //Always recalcuate in editor application
    if (compName.empty() || isEditorModel) {
        //compName = DutyUtils::GetCompositionByDutyFor3(&duty, this->GetRule()->GetDataContext(), true);
        compName = DutyUtils::GetCompositionByDutyFor3(&duty, this->GetRule()->GetDataContext());
        const_cast<Duty&>(duty).setCompositionName(compName);
    }

    auto iter = std::find(_compositions.cbegin(), _compositions.cend(), compName);
    return iter != _compositions.cend();
}

bool MaxFlightTimeInPeriodForEvaFdRuleParam::MatchDutyAssignments(const Duty& duty) const {
    if (_dutyAssignments.empty()) {
        return true;
    }
    string assignment = duty.getAssignment();
    auto iter = std::find(_dutyAssignments.cbegin(), _dutyAssignments.cend(), assignment);
    return iter != _dutyAssignments.cend();
}

bool MaxFlightTimeInPeriodForEvaFdRuleParam::MatchDutyTypes(const string& domIntType) const {
    if (_dutyTypes.empty()) {
        return true;
    }
    auto iter = std::find(_dutyTypes.cbegin(), _dutyTypes.cend(), domIntType);
    return iter != _dutyTypes.cend();
}

bool MaxFlightTimeInPeriodForEvaFdRuleParam::MatchServiceType(const std::set<string>& flightServiceTypes) const {
    if (_serviceTypes.empty() || _strServiceType.empty() || _strServiceType == RuleParamConstant::ALL) {
        return true; // 未设置Service Type或为*，表示匹配所有
    }
    for (const auto& serviceType : flightServiceTypes) {
        auto iter = std::find(_serviceTypes.cbegin(), _serviceTypes.cend(), serviceType);
        if (iter != _serviceTypes.cend()) {
            return true; // 找到匹配的service type
        }
    }
    return false; // 没有航段匹配service type
}

bool MaxFlightTimeInPeriodForEvaFdRuleParam::MatchActivityPeriodRule(const shared_ptr<BaseActivityPeriod>& activityPeriod) const {

    //if (!MatchComposition(duty)) {
    //    return false;
    //}

    //if (!MatchDutyAssignments(duty)) {
    //    return false;
    //}

    return true;
}

bool MaxFlightTimeInPeriodForEvaFdRuleParam::MatchDutyRule(const Duty& duty) const {

    if (!MatchComposition(duty)) {
        return false;
    }

    if (!MatchDutyAssignments(duty)) {
        return false;
    }

    return true;
}

int MaxFlightTimeInPeriodForEvaFdRuleParam::CheckParam(const MaxFlightTimeInPeriodForEvaFdRuleParam::CumulativeDuration& cumulativeDuration) const {

    if (!MatchServiceType(cumulativeDuration.flightServiceTypes)) {
		//如果航班服务类型不匹配，则不进行BLH/FDP/DP的限制，直接返回不告警
        return (int)WarnCode::NO_WARN;
    }

    int cumulativeBLHMinutes = cumulativeDuration.cumulativeBLHMinutes;
    int cumulativeFDPMinutes = cumulativeDuration.cumulativeFDPMinutes;
    int cumulativeDPMinutes = cumulativeDuration.cumulativeDPMinutes;

	int cumulativeBLHDiscretion = 0, cumulativeFDPDiscretion = 0, cumulativeDPDiscretion = 0;
    if (this->_isDiscretionApplicable) {
        cumulativeBLHDiscretion = cumulativeDuration.cumulativeBLHDiscretion;
        cumulativeFDPDiscretion = cumulativeDuration.cumulativeFDPDiscretion;
        cumulativeDPDiscretion = cumulativeDuration.cumulativeDPDiscretion;
    }
    
    int warnCode = (int)WarnCode::NO_WARN;
    if (!_limitBLHRange.empty() && _limitBLHRange != "*") {
        bool valid = (cumulativeBLHMinutes >= _limitBLHMinutesLower && cumulativeBLHMinutes < (_limitBLHMinutesUpper + cumulativeBLHDiscretion));
        if (!valid) {
            warnCode = warnCode | (int)WarnCode::BLH_WARN;
        }
    }

    if (!_limitFDPRange.empty() && _limitFDPRange != "*") {
        bool valid = cumulativeFDPMinutes >= _limitFDPMinutesLower && cumulativeFDPMinutes < (_limitFDPMinutesUpper + cumulativeFDPDiscretion);
        if (!valid) {
            warnCode = warnCode | (int)WarnCode::FDP_WARN;
        }
    }

    if (!_limitDPRange.empty() && _limitDPRange != "*") {
        bool valid = cumulativeDPMinutes >= _limitDPMinutesLower && cumulativeDPMinutes < (_limitDPMinutesUpper + cumulativeDPDiscretion);
        if (!valid) {
            warnCode = warnCode | (int)WarnCode::DP_WARN;
        }
    }
    return warnCode;
}
