#include "LimitSingleDayFreeFromDutyForCARSRuleParam.h"

#include <map>
#include <sstream>

#include "Utility.h"
#include "UtilFunc.h"
#include "../constant/Constants.h"
#include "../utils/TimeUtils.h"

/** @copydoc LimitSingleDayFreeFromDutyForCARSRuleParam::ParseParam(const std::string&) */
void LimitSingleDayFreeFromDutyForCARSRuleParam::ParseParam(const std::string& paramString) {
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 9;

    enum class ParamLocation {
        BASES = 1,
        RANKS,
        FLEETS,
        TEAMS,
        PERIOD,
        UNIT,
        DUTY_END_BUFFER,
        MIN_LIMITS,
        SEVERITY
    };

    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (substr.empty()) {
            continue;
        }
        switch (i) {
        case enum_to_underlying(ParamLocation::BASES):
            if (substr != RuleParamConstant::ALL) {
                split(substr, '|', _bases);
            }
            break;
        case enum_to_underlying(ParamLocation::RANKS):
            if (substr != RuleParamConstant::ALL) {
                split(substr, '|', _ranks);
            }
            break;
        case enum_to_underlying(ParamLocation::FLEETS):
            if (substr != RuleParamConstant::ALL) {
                split(substr, '|', _fleets);
            }
            break;
        case enum_to_underlying(ParamLocation::TEAMS):
            if (substr != RuleParamConstant::ALL) {
                split(substr, '|', _teams);
            }
            break;
        case enum_to_underlying(ParamLocation::PERIOD):
            _period = atoi(substr.c_str());
            break;
        case enum_to_underlying(ParamLocation::UNIT):
            _unit = strToUpper(substr);
            break;
        case enum_to_underlying(ParamLocation::DUTY_END_BUFFER):
            _dutyEndBuffer = substr;
            _dutyEndBufferMinutes = TimeUtils::hhmmToMinutes(substr.c_str());
            break;
        case enum_to_underlying(ParamLocation::MIN_LIMITS):
            _minLimits = atoi(substr.c_str());
            break;
        case enum_to_underlying(ParamLocation::SEVERITY):
            SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(substr.c_str())));
            break;
        default:
            break;
        }
    }
}

/** @copydoc LimitSingleDayFreeFromDutyForCARSRuleParam::ParseParam(const DBRule&) */
void LimitSingleDayFreeFromDutyForCARSRuleParam::ParseParam(const DBRule& dbRule) {
    RuleParam::ParseParam(dbRule);
    std::map<std::string, std::string>& parameter = const_cast<DBRule&>(dbRule).params;
    for (const auto& iter : parameter) {
        const std::string& header = iter.first;
        const std::string& value = iter.second;
        if (header == "BASES") {
            if (value != RuleParamConstant::ALL) {
                split(value, '|', _bases);
            }
        } else if (header == "RANKS") {
            if (value != RuleParamConstant::ALL) {
                split(value, '|', _ranks);
            }
        } else if (header == "FLEETS") {
            if (value != RuleParamConstant::ALL) {
                split(value, '|', _fleets);
            }
        } else if (header == "TEAMS") {
            if (value != RuleParamConstant::ALL) {
                split(value, '|', _teams);
            }
        } else if (header == "PERIOD") {
            _period = atoi(value.c_str());
        } else if (header == "UNIT") {
            _unit = strToUpper(value);
        } else if (header == "DUTY END BUFFER") {
            _dutyEndBuffer = value;
            _dutyEndBufferMinutes = TimeUtils::hhmmToMinutes(value.c_str());
        } else if (header == "MIN LIMITS") {
            _minLimits = atoi(value.c_str());
        } else if (header == "SEVERITY") {
            SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(value.c_str())));
        }
    }
}

/** @copydoc LimitSingleDayFreeFromDutyForCARSRuleParam::MatchCrewQualification */
bool LimitSingleDayFreeFromDutyForCARSRuleParam::MatchCrewQualification(const SharedPtr<CREW>& crew,
                                                                        const time_t& checkedStartTime,
                                                                        const time_t& checkedEndTime) const {
    std::vector<std::string> positions;
    return Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions,
                                                     checkedStartTime, checkedEndTime);
}
