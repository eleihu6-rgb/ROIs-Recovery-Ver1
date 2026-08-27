/**
 * @file RestrictMidDutyBaseTurnRuleParam.cpp
 */

#include <algorithm>
#include <cstdlib>
#include <sstream>

#include "RestrictMidDutyBaseTurnRuleParam.h"
#include "Log/Logger.h"
#include "StringUtil.h"
#include "../constant/Constants.h"

void RestrictMidDutyBaseTurnRuleParam::ParseParam(const std::string& paramString) {
    std::stringstream ss(paramString);
    std::string column;
    std::vector<std::string> columns;
    while (std::getline(ss, column, ',')) {
        columns.emplace_back(trim(column));
    }
    if (!columns.empty()) {
        ParseStartStation(columns[0]);
    }
    if (columns.size() > 1) {
        ParseEndStation(columns[1]);
    }
    if (columns.size() > 3) {
        ParseTotalNumberInPairing(columns[3]);
    }
}

void RestrictMidDutyBaseTurnRuleParam::ParseParam(const DBRule& dbRule) {
    RuleParam::ParseParam(dbRule);
    if (dbRule.severity > 0) {
        this->SetSeverity(underlying_to_enum<ViolationSeverity>(dbRule.severity));
    }
    auto& parameters = const_cast<DBRule&>(dbRule).params;
    for (auto iter = parameters.begin(); iter != parameters.end(); ++iter) {
        const std::string header = strToUpper(iter->first);
        const std::string value = iter->second;
        if (header == "DUTY START STATION" || header == "START STATION") {
            ParseStartStation(value);
        }
        else if (header == "DUTY END STATION" || header == "END STATION") {
            ParseEndStation(value);
        }
        else if (header == "SEVERITY") {
            this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(value.c_str())));
        }
        else if (header == "TOTAL NUMBER IN PAIRING" ||
                 header == "TOTAL NUMBER" ||
                 header == "NUMBER OF SUCH DUTIES IN PAIRING" ||
                 header == "NUMBER OF DUTIES IN PAIRING") {
            ParseTotalNumberInPairing(value);
        }
        else {
            Logger::getRuleLogger()->warn("Rule 7460 parameter ignored, header: {}", iter->first);
        }
    }
}

bool RestrictMidDutyBaseTurnRuleParam::Matches(const std::string& startStation,
                                               const std::string& endStation) const {
    return _startPattern.Matches(startStation) &&
           _endPattern.Matches(endStation);
}

bool RestrictMidDutyBaseTurnRuleParam::MatchPattern::Matches(const std::string& candidate) const {
    if (allowAny) {
        return true;
    }
    std::string normalized = strToUpper(trim(candidate));
    bool contains = std::find(values.cbegin(), values.cend(), normalized) != values.cend();
    return isNegated ? !contains : contains;
}

RestrictMidDutyBaseTurnRuleParam::MatchPattern RestrictMidDutyBaseTurnRuleParam::BuildPattern(const std::string& rawValue) {
    MatchPattern pattern{};
    std::string normalized = Normalize(rawValue);
    if (normalized.empty() || normalized == RuleParamConstant::ALL) {
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
        std::string trimmedToken = trim(token);
        if (trimmedToken.empty()) {
            continue;
        }
        pattern.values.emplace_back(strToUpper(trimmedToken));
    }
    if (pattern.values.empty()) {
        pattern.allowAny = true;
        pattern.isNegated = false;
    }
    return pattern;
}

std::string RestrictMidDutyBaseTurnRuleParam::Normalize(const std::string& value) {
    return trim(value);
}

void RestrictMidDutyBaseTurnRuleParam::ParseStartStation(const std::string& value) {
    _startRaw = value;
    _startPattern = BuildPattern(value);
}

void RestrictMidDutyBaseTurnRuleParam::ParseEndStation(const std::string& value) {
    _endRaw = value;
    _endPattern = BuildPattern(value);
}

void RestrictMidDutyBaseTurnRuleParam::ParseTotalNumberInPairing(const std::string& value) {
    _totalNumberInPairing = std::max(0, atoi(trim(value).c_str()));
}
