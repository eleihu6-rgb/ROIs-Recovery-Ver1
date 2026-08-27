

#include "CheckMinimumRestPeriodForSQRuleParam.h"
#include <algorithm>
#include <sstream>
#include <map>
#include <cstdlib>
#include <cctype>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/AssignmentUtils.h"
#include "../utils/CompositionRule.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

namespace {

bool isAllDigits(const std::string& value) {
    if (value.empty()) {
        return false;
    }
    for (char ch : value) {
        if (!std::isdigit(static_cast<unsigned char>(ch))) {
            return false;
        }
    }
    return true;
}

bool isAllToken(const std::string& value) {
    const std::string t = trim(value);
    return t.empty() || t == "*" || t == RuleParamConstant::ALL || t == RuleParamConstant::IGNORED ||
           t == RuleParamConstant::IGNORED_2;
}

std::vector<std::string> splitDashOutsideParen(const std::string& value) {
    std::vector<std::string> parts;
    int depth = 0;
    std::string current;
    for (char c : value) {
        if (c == '(') {
            ++depth;
            current.push_back(c);
        } else if (c == ')') {
            if (depth > 0) {
                --depth;
            }
            current.push_back(c);
        } else if (c == '-' && depth == 0) {
            parts.push_back(trim(current));
            current.clear();
        } else {
            current.push_back(c);
        }
    }
    parts.push_back(trim(current));
    parts.erase(std::remove_if(parts.begin(), parts.end(), [](const std::string& s) { return s.empty(); }), parts.end());
    return parts;
}

int parseMinutesOrDefault(const std::string& value, int defaultMinutes) {
    const std::string t = trim(value);
    if (isAllToken(t)) {
        return defaultMinutes;
    }
    const int minutes = TimeUtils::hhmmToMinutes(t.c_str());
    if (minutes >= 0) {
        return minutes;
}
    if (isAllDigits(t)) {
        const long hours = std::strtol(t.c_str(), nullptr, 10);
        if (hours >= 0) {
            return static_cast<int>(hours * 60);
        }
    }
    return defaultMinutes;
}

}  // namespace

void CheckMinimumRestPeriodForSQRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    const int totalNumParam = enum_to_underlying(ParamLocation::MIN_LOCAL_NIGHT) + 1;
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        substr = trim(substr);
        if (!substr.empty()) {
            switch (i) {
            case enum_to_underlying(ParamLocation::CURRENT_DUTY_PATTERN):
                _currentDutyPatternExpr = ParseDutyPatternExpr(substr);
                break;
            case enum_to_underlying(ParamLocation::NEXT_DUTY_PATTERN):
                _nextDutyPatternExpr = ParseDutyPatternExpr(substr);
                break;
            case enum_to_underlying(ParamLocation::CURRENT_DUTY_ASSIGNMENTS):
                if (!isAllToken(substr)) {
                    split(substr, '|', _currentDutyAssignments);
                }
                break;
            case enum_to_underlying(ParamLocation::NEXT_DUTY_ASSIGNMENTS):
                if (!isAllToken(substr)) {
                    split(substr, '|', _nextDutyAssignments);
                }
                break;
            case enum_to_underlying(ParamLocation::DP_RANGE): {
                vector<string> splitstrs;
                split(substr.c_str(), '-', splitstrs);
                if (splitstrs.size() >= 2) {
                    _dpRangeRaw = substr;
                    _dpRangeMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
                    _dpRangeMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
                }
                break;
            }
            case enum_to_underlying(ParamLocation::HAS_LOCAL_NIGHT):
                _hasLocalNightSpecified = (substr == RuleParamConstant::YES || substr == RuleParamConstant::NO);
                _hasLocalNight = substr == RuleParamConstant::YES;
                break;
            case enum_to_underlying(ParamLocation::MIN_REST_TIME):
                _minRestTimeMinutes = parseMinutesOrDefault(substr, _minRestTimeMinutes);
                break;
            case enum_to_underlying(ParamLocation::INCREMENTAL_REST_PER_DP_HOUR):
                _incrementalRestPerDpHourMinutes = parseMinutesOrDefault(substr, 0);
                break;
            case enum_to_underlying(ParamLocation::MIN_LOCAL_NIGHT):
                _minLocalNights = isAllToken(substr) ? -1 : atoi(substr.c_str());
                break;
            default:
                Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void CheckMinimumRestPeriodForSQRuleParam::ParseParam(const DBRule &dbRule) {
    RuleParam::ParseParam(dbRule);
    map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
    //Current Duty Assignments,Next Duty Assignments,DP Range,Has Local Night,Min Rest Time,Min Local Nights
    string header, headeValue;
    for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
    {
        header = strToUpper(trim(iter->first));
        headeValue = trim(iter->second);
		
        if (header == "CURRENT DUTY PATTERN") {
            _currentDutyPatternExpr = ParseDutyPatternExpr(headeValue);
        }
        else if (header == "NEXT DUTY PATTERN") {
            _nextDutyPatternExpr = ParseDutyPatternExpr(headeValue);
        }
        else if (header == "CURRENT DUTY ASSIGNMENTS") {
            if (!isAllToken(headeValue)) {
                split(headeValue, '|', _currentDutyAssignments);
            }
        }
        else if (header == "NEXT DUTY ASSIGNMENTS") {
            if (!isAllToken(headeValue)) {
                split(headeValue, '|', _nextDutyAssignments);
            }
        }
        else if (header == "DP RANGE") {
            vector<string> splitstrs;
            split(headeValue.c_str(), '-', splitstrs);
            if (splitstrs.size() >= 2) {
                _dpRangeRaw = headeValue;
                _dpRangeMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
                _dpRangeMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
            }
        }
        else if (header == "HAS LOCAL NIGHT(Y/N)" || header == "HAS LOCAL NIGHT") {
            _hasLocalNightSpecified = (headeValue == RuleParamConstant::YES || headeValue == RuleParamConstant::NO);
            _hasLocalNight = headeValue == RuleParamConstant::YES;
        }
        else if (header == "MIN REST TIME") {
            if (!headeValue.empty()) {
                _minRestTimeMinutes = parseMinutesOrDefault(headeValue, _minRestTimeMinutes);
            }
        }
        else if (header == "MIN LOCAL NIGHTS") {
            _minLocalNights = isAllToken(headeValue) ? -1 : atoi(headeValue.c_str());
        }
        else if (header == "INCREMENTAL REST PER DP HOUR" || header == "INCREMENTAL REST/DP HOUR" ||
                 header == "INCREMENTAL REST PER DP HR") {
            _incrementalRestPerDpHourMinutes = parseMinutesOrDefault(headeValue, 0);
        }
        else {
            Logger::getRuleLogger()->warn("Rule 7412 parameter ignored, header: {}", iter->first);
        }
    }
}

bool CheckMinimumRestPeriodForSQRuleParam::MatchCurrentDutyAssignment(const Duty& duty) const {
    if (_currentDutyAssignments.empty()) {
        return true;
    }
    const std::shared_ptr<CrewDataContext>& dbData = this->GetRule()->GetDataContext();

    string assignment = duty.getAssignment().empty() ? "FLY" : duty.getAssignment();
    for (auto& currAssigment : _currentDutyAssignments) {
        //if (dbData->isAssignmentInGroup(assignment, assigmentGroup)) {
        //    return true;
        //}
        // for now use assignment instead of assignment group
        if (assignment == currAssigment) {
            return true;
		}
    }
    return false;
}

bool CheckMinimumRestPeriodForSQRuleParam::MatchNextDutyAssignment(const Duty& duty) const {
    if (_nextDutyAssignments.empty()) {
        return true;
    }
    const std::shared_ptr<CrewDataContext>& dbData = this->GetRule()->GetDataContext();


    string assignment = duty.getAssignment().empty() ? "FLY" : duty.getAssignment();
    for (auto& nextDutyAssigment : _nextDutyAssignments) {
        //if (dbData->isAssignmentInGroup(assignment, assigmentGroup)) {
        //    return true;
        //}
		// for now use duty assignment instead of composition group
        if (assignment == nextDutyAssigment) {
            return true;
		}
    }
    return false;
}

bool CheckMinimumRestPeriodForSQRuleParam::MatchDutyPattern(const Duty& duty, const DutyPatternExpr& pattern) const {
    if (pattern.allowAny) {
        return true;
    }

    const std::shared_ptr<CrewDataContext>& dbData = this->GetRule()->GetDataContext();
    return pattern.depExpr.MatchesAirport(duty.getDepartureStation(), dbData.get()) &&
           pattern.arrExpr.MatchesAirport(duty.getArrivalStation(), dbData.get());
}

CheckMinimumRestPeriodForSQRuleParam::DutyPatternExpr
CheckMinimumRestPeriodForSQRuleParam::ParseDutyPatternExpr(const std::string& rawValue) {
    DutyPatternExpr expr{};
    if (isAllToken(rawValue)) {
        return expr;
    }

    const std::vector<std::string> tokens = splitDashOutsideParen(rawValue);
    if (tokens.size() != 2) {
        Logger::getRuleLogger()->warn("Rule 7412 duty pattern ignored (expected DEP-ARR): {}", rawValue);
        return expr;
    }

    expr.allowAny = false;
    expr.depExpr = LocationMatchUtils::LocationExpr::Parse(tokens[0]);
    expr.arrExpr = LocationMatchUtils::LocationExpr::Parse(tokens[1]);
    return expr;
}

int CheckMinimumRestPeriodForSQRuleParam::GetMinRestTimeMinutesForDp(int dpMinutes) const {
    if (_incrementalRestPerDpHourMinutes <= 0) {
        return _minRestTimeMinutes;
    }

    const int baseMinRest = _minRestTimeMinutes;
    if (_dpRangeMinutesLower <= 0 || _dpRangeMinutesLower == INT_MIN) {
        return baseMinRest;
    }

    const int above = dpMinutes - _dpRangeMinutesLower;
    if (above <= 0) {
        return baseMinRest;
    }

    const int steps = above / 60;  // full hours above the DP_RANGE lower bound
    if (steps <= 0) {
        return baseMinRest;
    }
    return baseMinRest + steps * _incrementalRestPerDpHourMinutes;
}

bool CheckMinimumRestPeriodForSQRuleParam::HasDpRangeFilter() const {
    return !_dpRangeRaw.empty() && !isAllToken(_dpRangeRaw);
}

std::string CheckMinimumRestPeriodForSQRuleParam::GetViolationCriteriaSuffix(int actualLocalNights) const {
    std::vector<std::string> criteria;
    if (HasDpRangeFilter()) {
        criteria.push_back("actual DP range [" + _dpRangeRaw + "]");
    }
    if (_hasLocalNightSpecified) {
        criteria.push_back("actual local night = " + std::to_string(actualLocalNights));
    }
    if (criteria.empty()) {
        return "";
    }

    std::string suffix = " with " + criteria[0];
    for (std::size_t i = 1; i < criteria.size(); ++i) {
        suffix += " and " + criteria[i];
    }
    return suffix;
}

bool CheckMinimumRestPeriodForSQRuleParam::MatchRule(const Duty& currDuty, const Duty* nextDuty) const {

    long dp = const_cast<Duty&>(currDuty).getDPInSecs() / 60;
    if (dp < _dpRangeMinutesLower || dp > _dpRangeMinutesUpper) {
        return false;
    }

    if (!MatchDutyPattern(currDuty, _currentDutyPatternExpr)) {
        return false;
    }

    if (!MatchCurrentDutyAssignment(currDuty)) {
        return false;
    }

    if (nextDuty != nullptr) {
        if (!MatchDutyPattern(*nextDuty, _nextDutyPatternExpr)) {
            return false;
        }
        if (!MatchNextDutyAssignment(*nextDuty)) {
            return false;
        }
    }

    // has local night filter is moved to rule check, 
    // since we want to compute rest time requirement based on param only and not on next duty
    // has local night is not known if there is no next duty

    return true;
}

