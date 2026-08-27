/**
 * @file RestrictCoterminalDutyConnectionForSQRuleParam.cpp
 */

#include "RestrictCoterminalDutyConnectionForSQRuleParam.h"

#include <algorithm>
#include <cstdlib>
#include <sstream>

#include "StringUtil.h"
#include "../constant/Constants.h"
#include "Log/Logger.h"

namespace {
bool IsIgnoredValue(const std::string& value) {
    const std::string trimmed = trim(value);
    if (trimmed.empty()) {
        return true;
    }
    const std::string upper = strToUpper(trimmed);
    return upper == RuleParamConstant::IGNORED;
}

bool IsHeaderRow(const DBRule& dbRule) {
    for (const auto& entry : dbRule.params) {
        const std::string headerUpper = strToUpper(trim(entry.first));
        if (headerUpper == "TABLEHEADER" || headerUpper == "TABLE HEADER") {
            return true;
        }
    }
    return false;
}
}

void RestrictCoterminalDutyConnectionForSQRuleParam::ParseParam(const std::string& paramString) {
    std::stringstream ss(paramString);
    std::string column;
    std::vector<std::string> columns;
    while (std::getline(ss, column, ',')) {
        columns.emplace_back(trim(column));
    }
    if (!columns.empty()) {
        ParsePrevArrAirport(columns[0]);
    }
    if (columns.size() > 1) {
        ParsePrevAssignment(columns[1]);
    }
    if (columns.size() > 2) {
        ParseNextDepAirport(columns[2]);
    }
    if (columns.size() > 3) {
        ParseNextAssignment(columns[3]);
    }
}

void RestrictCoterminalDutyConnectionForSQRuleParam::ParseParam(const DBRule& dbRule) {
    RuleParam::ParseParam(dbRule);
    if (dbRule.severity > 0) {
        this->SetSeverity(underlying_to_enum<ViolationSeverity>(dbRule.severity));
    }
    if (IsHeaderRow(dbRule)) {
        return;
    }

    auto& parameters = const_cast<DBRule&>(dbRule).params;
    for (auto iter = parameters.begin(); iter != parameters.end(); ++iter) {
        const std::string headerUpper = strToUpper(trim(iter->first));
        const std::string value = trim(iter->second);
        if (IsIgnoredValue(value) || value == RuleParamConstant::ALL) {
            continue;
        }

        if (headerUpper == "PREV DUTY ARRIVAL" || headerUpper == "PREV DUTY ARR" || headerUpper == "PREV ARRIVAL") {
            ParsePrevArrAirport(value);
        } else if (headerUpper == "PREV DUTY ASSIGNMENT" || headerUpper == "PREV ASSIGNMENT") {
            ParsePrevAssignment(value);
        } else if (headerUpper == "NEXT DUTY DEPART" || headerUpper == "NEXT DUTY DEP" || headerUpper == "NEXT DEPART") {
            ParseNextDepAirport(value);
        } else if (headerUpper == "NEXT DUTY ASSIGNMENT" || headerUpper == "NEXT ASSIGNMENT") {
            ParseNextAssignment(value);
        } else if (headerUpper == "ROW NUM") {
            _rowNum = atoi(value.c_str());
        } else if (headerUpper == "SEVERITY") {
            this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(value.c_str())));
        } else if (headerUpper == "ACTIVE" || headerUpper == "ENABLED" || headerUpper == "IS ACTIVE") {
            // handled at rule level
        } else {
            Logger::getRuleLogger()->warn("Rule 7451 parameter ignored, header: {}", iter->first);
        }
    }
}

bool RestrictCoterminalDutyConnectionForSQRuleParam::Matches(const std::string& prevArrAirport,
                                                            const std::string& prevDutyAssignment,
                                                            const std::string& nextDepAirport,
                                                            const std::string& nextDutyAssignment) const {
    return _prevArrAirport.Matches(prevArrAirport) &&
           _prevAssignment.Matches(prevDutyAssignment) &&
           _nextDepAirport.Matches(nextDepAirport) &&
           _nextAssignment.Matches(nextDutyAssignment);
}

bool RestrictCoterminalDutyConnectionForSQRuleParam::MatchPattern::Matches(const std::string& candidate) const {
    if (allowAny) {
        return true;
    }
    const std::string normalized = NormalizeToken(candidate);
    const bool contains = std::find(values.cbegin(), values.cend(), normalized) != values.cend();
    return isNegated ? !contains : contains;
}

RestrictCoterminalDutyConnectionForSQRuleParam::MatchPattern
RestrictCoterminalDutyConnectionForSQRuleParam::BuildPattern(const std::string& rawValue) {
    MatchPattern pattern{};
    std::string normalized = trim(rawValue);
    if (normalized.empty() || normalized == RuleParamConstant::ALL || normalized == "*") {
        pattern.allowAny = true;
        return pattern;
    }
    pattern.allowAny = false;
    if (!normalized.empty() && normalized.front() == '!') {
        pattern.isNegated = true;
        normalized.erase(normalized.begin());
        normalized = trim(normalized);
        if (!normalized.empty() && normalized.front() == '(' && normalized.back() == ')' && normalized.size() > 1) {
            normalized = normalized.substr(1, normalized.size() - 2);
            normalized = trim(normalized);
        }
    }

    std::vector<std::string> tokens;
    split(normalized.c_str(), '|', tokens);
    for (auto& token : tokens) {
        const std::string normalizedToken = NormalizeToken(token);
        if (normalizedToken.empty()) {
            continue;
        }
        pattern.values.emplace_back(normalizedToken);
    }
    if (pattern.values.empty()) {
        pattern.allowAny = true;
        pattern.isNegated = false;
    }
    return pattern;
}

std::string RestrictCoterminalDutyConnectionForSQRuleParam::NormalizeToken(const std::string& value) {
    return strToUpper(trim(value));
}

void RestrictCoterminalDutyConnectionForSQRuleParam::ParsePrevArrAirport(const std::string& value) {
    _prevArrAirportRaw = value;
    _prevArrAirport = BuildPattern(value);
}

void RestrictCoterminalDutyConnectionForSQRuleParam::ParsePrevAssignment(const std::string& value) {
    _prevAssignmentRaw = value;
    _prevAssignment = BuildPattern(value);
}

void RestrictCoterminalDutyConnectionForSQRuleParam::ParseNextDepAirport(const std::string& value) {
    _nextDepAirportRaw = value;
    _nextDepAirport = BuildPattern(value);
}

void RestrictCoterminalDutyConnectionForSQRuleParam::ParseNextAssignment(const std::string& value) {
    _nextAssignmentRaw = value;
    _nextAssignment = BuildPattern(value);
}

