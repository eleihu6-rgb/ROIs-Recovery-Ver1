/**
 * @file UlrFdpClassificationMismatchForSQRuleParam.cpp
 */

#include "UlrFdpClassificationMismatchForSQRuleParam.h"

#include "StringUtil.h"
#include "../framework/constant/Constants.h"
#include "../framework/utils/TimeUtils.h"

namespace {
std::string normalizeToken(const std::string& value) {
    return strToUpper(trim(value));
}
}

void UlrFdpClassificationMismatchForSQRuleParam::ParseParam(const std::string& paramString) {
    this->SetId(RuleFuncId);
    this->SetRuleParamId(0);
    this->SetPhase(0);

    std::vector<std::string> tokens;
    split(paramString, tokens, ",");
    const auto getToken = [&](std::size_t idx) -> std::string {
        return idx < tokens.size() ? trim(tokens[idx]) : "";
    };

    applyHeaderValue("DUTY PATTERN", getToken(0));
    applyHeaderValue("FLEET GROUP", getToken(1));
    applyHeaderValue("IS ULR", getToken(2));
    applyHeaderValue("MIN FDP", getToken(3));
    applyHeaderValue("MAX FDP", getToken(4));
}

void UlrFdpClassificationMismatchForSQRuleParam::ParseParam(const DBRule& dbRule) {
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

bool UlrFdpClassificationMismatchForSQRuleParam::MatchesDutyPattern(const std::string& dutyDep,
                                                                    const std::string& dutyArr) const {
    if (!_dutyPattern.depWildcard && _dutyPattern.depUpper != dutyDep) {
        return false;
    }
    if (!_dutyPattern.arrWildcard && _dutyPattern.arrUpper != dutyArr) {
        return false;
    }
    return true;
}

bool UlrFdpClassificationMismatchForSQRuleParam::MatchesUlr(bool dutyIsUlr) const {
    switch (_ulrRequirement) {
        case UlrRequirement::Any:
            return true;
        case UlrRequirement::Require:
            return dutyIsUlr;
        case UlrRequirement::Forbid:
            return !dutyIsUlr;
    }
    return true;
}

bool UlrFdpClassificationMismatchForSQRuleParam::IsFdpInRange(int fdpMinutes) const {
    if (_checkMinFdp && fdpMinutes < _minFdpMinutes) {
        return false;
    }
    if (_checkMaxFdp && fdpMinutes > _maxFdpMinutes) {
        return false;
    }
    return true;
}

void UlrFdpClassificationMismatchForSQRuleParam::applyHeaderValue(const std::string& headerUpper,
                                                                  const std::string& value) {
    const std::string valueUpper = normalizeToken(value);
    if (headerUpper == "DUTY PATTERN") {
        parseDutyPattern(value);
    } else if (headerUpper == "FLEET GROUP" || headerUpper == "FLEET GROUPS" ||
               headerUpper == "FLEET GROUP(GRP)" || headerUpper == "FLEET GRP" ||
               headerUpper == "FLEETGRP") {
        if (isAllTokenUpper(valueUpper)) {
            _fleetGroupsUpper.clear();
            _fleetGroupLabel = "*";
        } else {
            _fleetGroupsUpper = splitPipeUpper(value);
            _fleetGroupLabel = value;
        }
    } else if (headerUpper == "IS ULR" || headerUpper == "HAS ULR DUTY" || headerUpper == "HAS ULR") {
        _isUlrLabel = value.empty() ? "*" : value;
        if (valueUpper == RuleParamConstant::YES || valueUpper == "Y") {
            _ulrRequirement = UlrRequirement::Require;
        } else if (valueUpper == RuleParamConstant::NO || valueUpper == "N") {
            _ulrRequirement = UlrRequirement::Forbid;
        } else {
            _ulrRequirement = UlrRequirement::Any;
            _isUlrLabel = "*";
        }
    } else if (headerUpper == "MIN FDP") {
        _minFdpLabel = value.empty() ? "*" : value;
        if (isAllTokenUpper(valueUpper)) {
            _checkMinFdp = false;
            _minFdpMinutes = 0;
            _minFdpLabel = "*";
        } else {
            _checkMinFdp = true;
            _minFdpMinutes = parseDurationMinutes(value, 0);
        }
    } else if (headerUpper == "MAX FDP") {
        _maxFdpLabel = value.empty() ? "*" : value;
        if (isAllTokenUpper(valueUpper)) {
            _checkMaxFdp = false;
            _maxFdpMinutes = std::numeric_limits<int>::max();
            _maxFdpLabel = "*";
        } else {
            _checkMaxFdp = true;
            _maxFdpMinutes = parseDurationMinutes(value, std::numeric_limits<int>::max());
        }
    } else if (headerUpper == "ROW NUM") {
        _rowNum = atoi(value.c_str());
    } else if (headerUpper == "SEVERITY") {
        this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(value.c_str())));
    }
}

bool UlrFdpClassificationMismatchForSQRuleParam::isAllTokenUpper(const std::string& valueUpper) {
    return valueUpper.empty() || valueUpper == "*" || valueUpper == RuleParamConstant::ALL ||
           valueUpper == RuleParamConstant::IGNORED || valueUpper == RuleParamConstant::IGNORED_2;
}

int UlrFdpClassificationMismatchForSQRuleParam::parseDurationMinutes(const std::string& value,
                                                                     int defaultValue) {
    const int minutes = TimeUtils::hhmmToMinutes(trim(value));
    return minutes < 0 ? defaultValue : minutes;
}

std::vector<std::string> UlrFdpClassificationMismatchForSQRuleParam::splitPipeUpper(const std::string& raw) {
    std::vector<std::string> out;
    std::vector<std::string> tokens;
    split(trim(raw).c_str(), '|', tokens);
    out.reserve(tokens.size());
    for (const auto& token : tokens) {
        const std::string upper = normalizeToken(token);
        if (!upper.empty()) {
            out.push_back(upper);
        }
    }
    return out;
}

void UlrFdpClassificationMismatchForSQRuleParam::parseDutyPattern(const std::string& value) {
    _dutyPatternLabel = value.empty() ? "*" : value;
    _dutyPattern = DutyPattern{};

    const std::string trimmed = trim(value);
    if (trimmed.empty() || trimmed == RuleParamConstant::ALL || trimmed == "*") {
        _dutyPatternLabel = "*";
        return;
    }
    const auto dashPos = trimmed.find('-');
    if (dashPos == std::string::npos) {
        _dutyPatternLabel = "*";
        return;
    }

    const std::string dep = normalizeToken(trimmed.substr(0, dashPos));
    const std::string arr = normalizeToken(trimmed.substr(dashPos + 1));

    if (!dep.empty() && dep != "*") {
        _dutyPattern.depUpper = dep;
        _dutyPattern.depWildcard = false;
    }
    if (!arr.empty() && arr != "*") {
        _dutyPattern.arrUpper = arr;
        _dutyPattern.arrWildcard = false;
    }
}
