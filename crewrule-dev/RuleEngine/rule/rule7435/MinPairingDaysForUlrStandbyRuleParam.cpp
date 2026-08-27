/**
 * @file MinPairingDaysForUlrStandbyRuleParam.cpp
 */

#include "MinPairingDaysForUlrStandbyRuleParam.h"

#include <cstdlib>

#include "Log/Logger.h"
#include "StringUtil.h"
#include "../framework/constant/Constants.h"

using namespace std;

namespace {
constexpr char kParamDelimiter = ',';
}

void MinPairingDaysForUlrStandbyRuleParam::ParseParam(const std::string& paramString) {
    this->SetId(RuleFuncId);
    this->SetRuleParamId(0);
    this->SetPhase(0);

    vector<string> tokens;
    split(paramString, tokens, string(1, kParamDelimiter));
    const auto getToken = [&](size_t index) -> std::string {
        if (index >= tokens.size()) {
            return "";
        }
        return trim(tokens[index]);
    };

    ApplyHeader("SERVICE TYPE", getToken(0));
    ApplyHeader("FLEET GROUP", getToken(1));
    ApplyHeader("HAS ULR DUTY", getToken(2));
    ApplyHeader("LAYOVER AIRPORT", getToken(3));
    ApplyHeader("LAYOVER COUNTRY", getToken(4));
    ApplyHeader("HAS DUTY ASSIGNMENT", getToken(5));
    ApplyHeader("MIN PAIRING DAYS", getToken(6));
    if (tokens.size() > 7) {
        const std::string token7Upper = strToUpper(trim(getToken(7)));
        if (token7Upper == "DEBRIEF" || token7Upper == "DEBRIEFING" ||
            token7Upper == "TRANSPORT" || token7Upper == "DROPOFF" ||
            token7Upper == "DROP OFF" || token7Upper == "DROP-OFF") {
            ApplyHeader("PAIRING LENGTH ENDS AT", getToken(7));
            if (tokens.size() > 8) {
                ApplyHeader("SEVERITY", getToken(8));
            }
        } else {
            ApplyHeader("SEVERITY", getToken(7));
        }
    }
}

void MinPairingDaysForUlrStandbyRuleParam::ParseParam(const DBRule& dbRule) {
    RuleParam::ParseParam(dbRule);
    _rowNum = dbRule.rowNum;
    for (const auto& kv : dbRule.params) {
        const std::string headerUpper = strToUpper(trim(kv.first));
        const std::string value = trim(kv.second);
        ApplyHeader(headerUpper, value);
    }
    if (dbRule.severity > 0) {
        this->SetSeverity(underlying_to_enum<ViolationSeverity>(dbRule.severity));
    }
}

std::string MinPairingDaysForUlrStandbyRuleParam::NormalizeToken(const std::string& value) {
    return strToUpper(trim(value));
}

void MinPairingDaysForUlrStandbyRuleParam::ParseListValue(const std::string& value,
                                                          std::vector<std::string>& target) {
    target.clear();
    if (value.empty() || value == RuleParamConstant::ALL || value == RuleParamConstant::IGNORED ||
        value == RuleParamConstant::IGNORED_2 || value == "*") {
        return;
    }
    std::vector<std::string> tokens;
    split(value, tokens, "|");
    for (auto& token : tokens) {
        const std::string normalized = NormalizeToken(token);
        if (!normalized.empty()) {
            target.push_back(normalized);
        }
    }
}

MinPairingDaysForUlrStandbyRuleParam::PairingLengthEndsAt
MinPairingDaysForUlrStandbyRuleParam::ParsePairingLengthEndsAt(const std::string& value) {
    const std::string normalized = NormalizeToken(value);
    if (normalized == "DEBRIEF" || normalized == "DEBRIEFING") {
        return PairingLengthEndsAt::Debrief;
    }
    if (normalized == "TRANSPORT" || normalized == "DROPOFF" ||
        normalized == "DROP OFF" || normalized == "DROP-OFF") {
        return PairingLengthEndsAt::Transport;
    }
    return PairingLengthEndsAt::Transport;
}

void MinPairingDaysForUlrStandbyRuleParam::ApplyHeader(const std::string& headerUpper,
                                                       const std::string& value) {
    if (headerUpper == "SERVICE TYPE") {
        const std::string valueUpper = NormalizeToken(value);
        _serviceTypeUpper = valueUpper.empty() ? "*" : valueUpper;
    } else if (headerUpper == "FLEET GROUP" || headerUpper == "FLEET GROUPS" ||
               headerUpper == "FLEET GROUP(GRP)" || headerUpper == "FLEET GRP" ||
               headerUpper == "FLEETGRP") {
        ParseListValue(value, _fleetGroupsUpper);
    } else if (headerUpper == "HAS ULR DUTY" || headerUpper == "ULR DUTY" || headerUpper == "HAS ULR") {
        ParseUlrRequirement(value);
    } else if (headerUpper == "LAYOVER AIRPORT" || headerUpper == "LAYOVER AIRPORTS" ||
               headerUpper == "LAYOVER STATION") {
        ParseListValue(value, _layoverAirportsUpper);
    } else if (headerUpper == "LAYOVER COUNTRY" || headerUpper == "LAYOVER COUNTRIES") {
        ParseListValue(value, _layoverCountriesUpper);
    } else if (headerUpper == "HAS DUTY ASSIGNMENT" || headerUpper == "DUTY ASSIGNMENT" ||
               headerUpper == "ASSIGNMENT") {
        ParseListValue(value, _assignmentsUpper);
    } else if (headerUpper == "MIN PAIRING DAYS" || headerUpper == "MIN PAIRING CALENDAR DAYS") {
        _minPairingDays = atoi(value.c_str());
    } else if (headerUpper == "PAIRING LENGTH ENDS AT" || headerUpper == "PAIRING ENDS AT") {
        _pairingLengthEndsAt = ParsePairingLengthEndsAt(value);
    } else if (headerUpper == "ROWNUM") {
        _rowNum = atoi(value.c_str());
    } else if (headerUpper == "SEVERITY") {
        if (!value.empty()) {
            this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(value.c_str())));
        }
    } else {
        Logger::getRuleLogger()->debug(
            "Rule 7435 ignoring param '{}' for idRule:{} idRuleParam:{}",
            headerUpper,
            this->GetId(),
            this->GetRuleParamId());
    }
}

void MinPairingDaysForUlrStandbyRuleParam::ParseUlrRequirement(const std::string& value) {
    const std::string normalized = NormalizeToken(value);
    if (normalized == "Y" || normalized == "YES" || normalized == "TRUE" || normalized == "T") {
        _ulrRequirement = UlrRequirement::Require;
    } else if (normalized == "N" || normalized == "NO" || normalized == "FALSE" ||
               normalized == "F") {
        _ulrRequirement = UlrRequirement::Forbid;
    } else {
        _ulrRequirement = UlrRequirement::Any;
    }
}
