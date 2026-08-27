/**
 * @file MaxDutyPeriodRuleForSQParam.cpp
 */

#include "MaxDutyPeriodRuleForSQParam.h"
#include "StringUtil.h"
#include "RuleParam.h"
#include "../framework/utils/TimeUtils.h"
#include "../constant/Constants.h"
#include <algorithm>
#include <limits>

namespace {
int parseLimitMinutesOrUnlimited(const std::string& value) {
    if (value.empty() || value == "*") {
        return std::numeric_limits<int>::max();
    }
    auto ret = TimeUtils::hhmmToMinutes(value);
    if (ret < 0) {
        ret = std::numeric_limits<int>::max();
    }
    return ret;
}

bool isAllTokenUpper(const std::string& trimmedUpper) {
    return trimmedUpper.empty() || trimmedUpper == "*" || trimmedUpper == RuleParamConstant::ALL ||
           trimmedUpper == RuleParamConstant::IGNORED || trimmedUpper == RuleParamConstant::IGNORED_2;
}

std::vector<std::string> splitPipeUpper(const std::string& raw) {
    std::vector<std::string> out;
    std::vector<std::string> tmp;
    split(trim(raw).c_str(), '|', tmp);
    out.reserve(tmp.size());
    for (const auto& t : tmp) {
        const std::string u = strToUpper(trim(t));
        if (!u.empty()) {
            out.push_back(u);
        }
    }
    return out;
}
} // namespace

void MaxDutyPeriodRuleForSQParam::ParseParam(const DBRule& dbRule) {
    RuleParam::ParseParam(dbRule);
    _rowNum = dbRule.rowNum;

    for (const auto& kv : dbRule.params) {
        const std::string headerUpper = strToUpper(trim(kv.first));
        const std::string value = trim(kv.second);
        applyHeaderValue(headerUpper, value);
    }

    if (dbRule.severity > 0) {
        this->SetSeverity(underlying_to_enum<ViolationSeverity>(dbRule.severity));
    }
}

bool MaxDutyPeriodRuleForSQParam::Matches(const std::string& fleet,
                                         const std::string& composition,
                                         bool hasFleetChange,
                                         bool hasFleetGroupChange) const {
    const bool fleetMatch = _fleets.empty() ||
                            std::find(_fleets.begin(), _fleets.end(), fleet) != _fleets.end();

    const bool compositionMatch =
        _compositions.empty() ||
        std::find(_compositions.begin(), _compositions.end(), composition) != _compositions.end();

    bool fleetChangeMatch = false;
    if (_checkFleetChange == false) { // match all  
        fleetChangeMatch = true;
    } else if (_hasFleetChange) {
        fleetChangeMatch = hasFleetChange;
    } else { // 'N'
        fleetChangeMatch = !hasFleetChange;
    }

    bool fleetGroupChangeMatch = false;
    if (_checkFleetGroupChange == false) { // match all
        fleetGroupChangeMatch = true;
    } else if (_hasFleetGroupChange) {
        fleetGroupChangeMatch = hasFleetGroupChange;
    } else { // 'N'
        fleetGroupChangeMatch = !hasFleetGroupChange;
    }

    return fleetMatch && compositionMatch && fleetChangeMatch && fleetGroupChangeMatch;
}

bool MaxDutyPeriodRuleForSQParam::MatchesServiceType(const std::string& dutyServiceTypeUpper) const {
    if (isAllTokenUpper(_serviceTypeUpper)) {
        return true;
    }
    return _serviceTypeUpper == dutyServiceTypeUpper;
}

void MaxDutyPeriodRuleForSQParam::applyHeaderValue(const std::string& headerUpper,
                                                               const std::string& value) {
    if (headerUpper == "SERVICE TYPE") {
        const std::string trimmed = trim(value);
        _serviceTypeLabel = trimmed.empty() ? "*" : trimmed;
        _serviceTypeUpper = strToUpper(trimmed);
        if (_serviceTypeUpper.empty()) {
            _serviceTypeUpper = "*";
        }
    } else if (headerUpper == "FLEET GROUP" || headerUpper == "FLEET GROUPS" ||
               headerUpper == "FLEET GROUP(GRP)" || headerUpper == "FLEET GRP" ||
               headerUpper == "FLEETGRP") {
        const std::string valueUpper = strToUpper(trim(value));
        if (isAllTokenUpper(valueUpper)) {
            _fleetGroupsUpper.clear();
            _fleetGroupLabel = "*";
        } else {
            _fleetGroupsUpper = splitPipeUpper(value);
            _fleetGroupLabel = value;
        }
    } else if (headerUpper == "FLEET") {
        parseListValue(value, _fleets, _fleetLabel);
    } else if (headerUpper == "COMPOSITION") {
        parseListValue(value, _compositions, _compositionLabel);
    } else if (headerUpper == "FLEET CHANGE") {
        _fleetChangeLabel = value;
        if (value == RuleParamConstant::YES) {
			_checkFleetChange = true;
			_hasFleetChange = true;
        }
        else if (value == RuleParamConstant::NO) {
			_checkFleetChange = true;
			_hasFleetChange = false;
        }
        else {
            _checkFleetChange = false;
        }

    } else if (headerUpper == "FLEET GROUP CHANGE") {
        _fleetGroupChangeLabel = value;
        if (value == RuleParamConstant::YES) {
            _checkFleetGroupChange = true;
            _hasFleetGroupChange = true;
        } else if (value == RuleParamConstant::NO) {
            _checkFleetGroupChange = true;
            _hasFleetGroupChange = false;
        } else {
            _checkFleetGroupChange = false;
        }
    } else if (headerUpper == "HAS ASSIGNMENT AFTER FDP") {
        parseListValue(value, _assignmentsAfterFDP, _assignmentsAfterFDPLabel);
    } else if (headerUpper == "DUTY ASSIGNMENT" || headerUpper == "DUTY ASSIGNMENTS") {
        const std::string valueUpper = strToUpper(trim(value));
        if (isAllTokenUpper(valueUpper)) {
            _dutyAssignments.clear();
            _dutyAssignmentsLabel = "*";
        } else {
            _dutyAssignments = splitPipeUpper(value);
            _dutyAssignmentsLabel = value;
        }
    } else if (headerUpper == "MAX DP") {
        _maxDutyPeriodMinutes = parseLimitMinutesOrUnlimited(value);
    } else if (headerUpper == "MAX FDP") {
        _maxFlightDutyPeriodMinutes = parseLimitMinutesOrUnlimited(value);
    }
}

void MaxDutyPeriodRuleForSQParam::parseListValue(const std::string& value, std::vector<std::string>& target, std::string& label) {
    if (value == "*") {
        target.clear(); // Empty vector means wildcard
        label = "*";
    } else {
        split(value.c_str(), '|', target);
        label = value;
    }
}
