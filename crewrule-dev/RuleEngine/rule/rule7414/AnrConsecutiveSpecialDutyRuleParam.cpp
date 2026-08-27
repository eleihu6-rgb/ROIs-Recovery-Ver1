/**
 * @file AnrConsecutiveSpecialDutyRuleParam.cpp
 */

#include "AnrConsecutiveSpecialDutyRuleParam.h"

#include <algorithm>
#include <unordered_map>

#include "Log/Logger.h"
#include "../framework/utils/TimeUtils.h"
#include "StringUtil.h"
#include "../constant/Constants.h"

namespace {
constexpr int kDefaultConsecutiveTimes = 3;
constexpr int kDefaultMinRestMinutes = 24 * 60;
constexpr int kDefaultMinLocalNights = 1;

bool isAllTokenUpper(const std::string& trimmedUpper) {
    return trimmedUpper.empty() || trimmedUpper == "*" || trimmedUpper == RuleParamConstant::ALL ||
           trimmedUpper == RuleParamConstant::IGNORED || trimmedUpper == RuleParamConstant::IGNORED_2;
}

bool isNoneOrNoTokenUpper(const std::string& trimmedUpper) {
    return trimmedUpper == "NO" || trimmedUpper == "NONE";
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
}

void AnrConsecutiveSpecialDutyRuleParam::ParseFromRuleInput(const RuleInput& input) {
    _instances.clear();
    std::unordered_map<long long, std::size_t> instanceIndexByRuleId;
    instanceIndexByRuleId.reserve(input.dbRules.size());

    auto getOrCreateInstance = [&](long long ruleId) -> AnrConsecutiveSpecialDutyRuleInstance& {
        const auto it = instanceIndexByRuleId.find(ruleId);
        if (it != instanceIndexByRuleId.end()) {
            return _instances[it->second];
        }
        const std::size_t idx = _instances.size();
        instanceIndexByRuleId.emplace(ruleId, idx);
        _instances.emplace_back();
        _instances.back().ruleId = ruleId;
        return _instances.back();
    };

    for (const auto& dbRule : input.dbRules) {
        const long long ruleId = dbRule.idRule == 0 ? RULES::ANR_CONSECUTIVE_SPECIAL_DUTY : dbRule.idRule;
        if (dbRule.tableNum == 1 || dbRule.tableNum == 0) {
            auto& instance = getOrCreateInstance(ruleId);
            instance.configs.push_back(parseDbRule(dbRule));
        } else if (dbRule.tableNum == 2) {
            auto& instance = getOrCreateInstance(ruleId);
            parseControlRow(dbRule, instance.control);
        }
    }
}

AnrConsecutiveSpecialDutyConfig AnrConsecutiveSpecialDutyRuleParam::parseDbRule(
    const DBRule& dbRule) {
    AnrConsecutiveSpecialDutyConfig config{};
    config.idRule = dbRule.idRule;
    config.idRuleParam = dbRule.idRuleParam;
    config.rowNum = dbRule.rowNum;
    config.overrideAbility = dbRule.overridebility;
    config.description = dbRule.description;
    config.reference = dbRule.reference;
    config.includeTrailingDeadhead = true;
    config.restType = AnrConsecutiveSpecialDutyRestType::IN;
    config.restTypeLabel = "IN";
    config.numConsecutiveDuties = kDefaultConsecutiveTimes;
    config.minRestMinutes = kDefaultMinRestMinutes;
    config.minLocalNights = kDefaultMinLocalNights;

    for (const auto& kv : dbRule.params) {
        const std::string header = strToUpper(trim(kv.first));
        const std::string value = trim(kv.second);

        if (header == "INCLUDE TRAILING DEADHEAD") {
            if (!value.empty() && value != RuleParamConstant::IGNORED && value != "*") {
                if (value == "Y" || value == "y") {
                    config.includeTrailingDeadhead = true;
                } else if (value == "N" || value == "n") {
                    config.includeTrailingDeadhead = false;
                }
            }
        } else if (header == "REST TYPE" || header == "RESTTYPE") {
            config.restType = parseRestType(value, config.restTypeLabel);
        } else if (header == "CONSECUTIVE TIMES" || header == "MAX CONSECUTIVE TIMES" ||
                   header == "CONSECUTIVE SPECIAL DUTIES" || header == "NUM CONSECUTIVE DUTIES" ||
                   header == "NUM CONSECUTIVE SPECIAL DUTIES") {
            config.numConsecutiveDuties =
                parseIntValue(value, config.numConsecutiveDuties);
        } else if (header == "MIN REST TIME" || header == "MIN REST MINUTES") {
            config.minRestMinutes = parseMinutes(value, config.minRestMinutes);
        } else if (header == "MIN LOCAL NIGHTS") {
            if (value == RuleParamConstant::IGNORED || value == "*") {
                config.minLocalNights = -1;
            } else {
                config.minLocalNights = parseIntValue(value, config.minLocalNights);
            }
        } else {
            Logger::getRuleLogger()->debug(
                "Rule 7414 ignoring param '{}' for idRule:{}, idRuleParam:{}",
                header,
                dbRule.idRule,
                dbRule.idRuleParam);
        }
    }

    return config;
}

void AnrConsecutiveSpecialDutyRuleParam::parseControlRow(
    const DBRule& dbRule,
    AnrConsecutiveSpecialDutyControlParam& control) {
    const auto& parameters = dbRule.params;
    for (auto it = parameters.begin(); it != parameters.end(); ++it) {
        const std::string headerUpper = strToUpper(trim(it->first));
        const std::string valueUpper = strToUpper(trim(it->second));

        if (headerUpper == "IGNORE INTERMEDIATE DUTY ASSIGNMENTS") {
            if (isAllTokenUpper(valueUpper) || isNoneOrNoTokenUpper(valueUpper)) {
                control.ignoreIntermediateAssignmentsUpper.clear();
            } else {
                control.ignoreIntermediateAssignmentsUpper = splitPipeUpper(valueUpper);
            }
        } else if (headerUpper == "ASSIGNMENTS REDUCE REST AND LOCAL NIGHT") {
            if (isNoneOrNoTokenUpper(valueUpper)) {
                control.reduceAllIntermediateAssignments = false;
                control.reduceRestAndLocalNightAssignmentsUpper.clear();
            } else if (isAllTokenUpper(valueUpper)) {
                control.reduceAllIntermediateAssignments = true;
                control.reduceRestAndLocalNightAssignmentsUpper.clear();
            } else {
                control.reduceAllIntermediateAssignments = false;
                control.reduceRestAndLocalNightAssignmentsUpper = splitPipeUpper(valueUpper);
            }
        } else {
            Logger::getRuleLogger()->warn("Rule 7414 control parameter ignored, header: {}", it->first);
        }
    }
}

AnrConsecutiveSpecialDutyRestType AnrConsecutiveSpecialDutyRuleParam::parseRestType(
    const std::string& value,
    std::string& label) {

    if (value == "IN" || value == "in" || value == "Inside" || value == "inside") {
        label = "IN";
        return AnrConsecutiveSpecialDutyRestType::IN;
    }
    if (value == "PRE" || value == "pre" || value == "Prior" || value == "prior") {
        label = "PRE";
        return AnrConsecutiveSpecialDutyRestType::PRE;
    }
    if (value == "POST" || value == "post" || value == "After" || value == "after") {
        label = "POST";
        return AnrConsecutiveSpecialDutyRestType::POST;
    }
    label = value;
    return AnrConsecutiveSpecialDutyRestType::UNKNOWN;
}

int AnrConsecutiveSpecialDutyRuleParam::parseMinutes(const std::string& value, int defaultValue) {
    if (value.empty()) {
        return defaultValue;
    }
    if (value.find(':') != std::string::npos) {
        const int minutes = TimeUtils::hhmmToMinutes(value);
        return minutes >= 0 ? minutes : defaultValue;
    }
    const int minutes = parseIntValue(value, defaultValue);
    return minutes >= 0 ? minutes : defaultValue;
}

int AnrConsecutiveSpecialDutyRuleParam::parseIntValue(const std::string& value, int defaultValue) {
    if (value.empty()) {
        return defaultValue;
    }
    try {
        return std::stoi(value);
    } catch (...) {
        Logger::getRuleLogger()->warn("Rule 7414 failed to parse integer value: {}", value);
        return defaultValue;
    }
}
