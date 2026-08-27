#include "AnrReportingDebriefRuleParam.h"

#include <algorithm>

#include "CrewDB.h"
#include "Log/Logger.h"
#include "../constant/Constants.h"
#include "../utils/TimeUtils.h"
#include "RuleParams.h"
#include "StringUtil.h"
#include "UtilFunc.h"

namespace {
constexpr int kDefaultMinTotalMinutes = 90;
constexpr int kDefaultMinBriefMinutes = 60;
}

namespace {
bool isAllTokenUpper(const std::string& trimmedUpper) {
    return trimmedUpper.empty() || trimmedUpper == "*" || trimmedUpper == RuleParamConstant::ALL ||
           trimmedUpper == RuleParamConstant::IGNORED || trimmedUpper == RuleParamConstant::IGNORED_2;
}

std::vector<std::string> splitPipeUpper(const std::string& raw) {
    std::vector<std::string> out;
    std::vector<std::string> tmp;
    split(trim(raw), '|', tmp);
    out.reserve(tmp.size());
    for (const auto& t : tmp) {
        const std::string u = strToUpper(trim(t));
        if (!u.empty()) {
            out.push_back(u);
        }
    }
    return out;
}

std::string deriveDutyServiceTypeUpper(const Duty& duty) {
    bool sawOperating = false;
    bool allOperatingAreFreighter = true;
    for (auto* seg : duty.getSegmentsRead()) {
        if (seg == nullptr || !seg->getIsOperating()) {
            continue;
        }
        sawOperating = true;
        if (seg->getServiceType() != "F") {
            allOperatingAreFreighter = false;
            break;
        }
    }
    return (sawOperating && allOperatingAreFreighter) ? "F" : "J";
}

bool dutyMatchesFleetGroups(const Duty& duty,
                            const std::vector<std::string>& allowedFleetGroupsUpper,
                            const CrewDataContext* dbData) {
    if (allowedFleetGroupsUpper.empty()) {
        return true;
    }
    if (dbData == nullptr) {
        return false;
    }

    bool foundOperatingSegment = false;
    for (auto* seg : duty.getSegmentsRead()) {
        if (seg == nullptr || !seg->getIsOperating()) {
            continue;
        }
        foundOperatingSegment = true;

        const std::string fleet = seg->getFleetCD();
        if (fleet.empty()) {
            return false;
        }
        const auto it = dbData->fleetMap.find(fleet);
        if (it == dbData->fleetMap.end()) {
            return false;
        }
        const std::string fleetGroupUpper = it->second.fleetGrp;
        if (fleetGroupUpper.empty() ||
            std::find(allowedFleetGroupsUpper.begin(), allowedFleetGroupsUpper.end(), fleetGroupUpper) == allowedFleetGroupsUpper.end()) {
            return false;
        }
    }
    return foundOperatingSegment;
}
}  // namespace

void AnrReportingDebriefRuleParam::ParseFromRuleInput(const RuleInput& input) {
    _hasConfig = false;
    _configs.clear();
    for (const auto& dbRule : input.dbRules) {
        // Single-table rules can come through with tableNum==0 or 1, depending on data source.
        // Skip only when there are multiple parameter tables.
        if (dbRule.tableNum != 0 && dbRule.tableNum != 1) {
            continue;
        }
        AnrReportingDebriefConfig config;
        parseDbRule(dbRule, config);
        _configs.push_back(std::move(config));
        _hasConfig = true;
    }
}

std::vector<const AnrReportingDebriefConfig*>
AnrReportingDebriefRuleParam::findConfigsForDuty(
    const Duty* duty,
    const CrewDataContext* dbData) const {
    std::vector<const AnrReportingDebriefConfig*> matched;
    if (!_hasConfig || _configs.empty()) {
        return matched;
    }
    if (duty == nullptr) {
        for (const auto& config : _configs) {
            matched.push_back(&config);
        }
        return matched;
    }

    const std::string dutyAssignmentUpper = strToUpper(trim(duty->getAssignment()));

    for (const auto& config : _configs) {
        const std::string serviceFilterUpper = config.serviceTypeUpper;
        if (!isAllTokenUpper(serviceFilterUpper)) {
            if (deriveDutyServiceTypeUpper(*duty) != serviceFilterUpper) {
                continue;
            }
        }
        if (!config.fleetGroupsUpper.empty()) {
            if (!dutyMatchesFleetGroups(*duty, config.fleetGroupsUpper, dbData)) {
                continue;
            }
        }
        if (!config.dutyAssignmentsUpper.empty()) {
            if (dutyAssignmentUpper.empty() ||
                std::find(config.dutyAssignmentsUpper.begin(),
                          config.dutyAssignmentsUpper.end(),
                          dutyAssignmentUpper) == config.dutyAssignmentsUpper.end()) {
                continue;
            }
        }
        matched.push_back(&config);
    }
    return matched;
}

void AnrReportingDebriefRuleParam::parseDbRule(const DBRule& dbRule,
                                               AnrReportingDebriefConfig& configOut) {
    RuleParam::ParseParam(dbRule);

    configOut = {};
    configOut.idRule = dbRule.idRule;
    configOut.idRuleParam = dbRule.idRuleParam;
    configOut.rowNum = dbRule.rowNum;
    configOut.overrideAbility = dbRule.overridebility;
    configOut.description = dbRule.description;
    configOut.reference = dbRule.reference;
    configOut.serviceTypeUpper = "*";
    configOut.fleetGroupsUpper.clear();
    configOut.dutyAssignmentsUpper.clear();
    configOut.minTotalMinutes = kDefaultMinTotalMinutes;
    configOut.minBriefMinutes = kDefaultMinBriefMinutes;

    for (const auto& kv : dbRule.params) {
        const std::string header = strToUpper(trim(kv.first));
        const std::string value = trim(kv.second);
        const std::string valueUpper = strToUpper(value);

        if (header == "SERVICE TYPE") {
            configOut.serviceTypeUpper = valueUpper.empty() ? "*" : valueUpper;
        } else if (header == "FLEET GROUP" || header == "FLEET GROUPS" ||
                   header == "FLEET GROUP(GRP)" || header == "FLEET GRP" ||
                   header == "FLEETGRP") {
            if (isAllTokenUpper(valueUpper)) {
                configOut.fleetGroupsUpper.clear();
            } else {
                configOut.fleetGroupsUpper = splitPipeUpper(valueUpper);
            }
        } else if (header == "DUTY ASSIGNMENT" || header == "DUTY ASSIGNMENTS" ||
                   header == "ASSIGNMENT" || header == "ASSIGNMENTS") {
            if (isAllTokenUpper(valueUpper)) {
                configOut.dutyAssignmentsUpper.clear();
            } else {
                configOut.dutyAssignmentsUpper = splitPipeUpper(valueUpper);
            }
        } else if (header == "MIN TOTAL BRIEF+DEBRIEF" ||
                   header == "MIN TOTAL" ||
                   header == "MIN TOTAL MINUTES" ||
                   header == "MIN REPORTING+DEBRIEF") {
            if (isAllTokenUpper(valueUpper)) {
                configOut.minTotalMinutes = 0;
            } else {
                const int minutes = parseMinutes(value, configOut.minTotalMinutes);
                if (minutes >= 0) {
                    configOut.minTotalMinutes = minutes;
                }
            }
        } else if (header == "MIN BRIEF" ||
                   header == "MIN REPORTING" ||
                   header == "MIN REPORTING MINUTES") {
            if (isAllTokenUpper(valueUpper)) {
                configOut.minBriefMinutes = 0;
            } else {
                const int minutes = parseMinutes(value, configOut.minBriefMinutes);
                if (minutes >= 0) {
                    configOut.minBriefMinutes = minutes;
                }
            }
        } else {
            Logger::getRuleLogger()->debug(
                "Rule 7417 ignoring param '{}' for idRule:{}, idRuleParam:{}",
                header,
                dbRule.idRule,
                dbRule.idRuleParam);
        }
    }

    if (configOut.minTotalMinutes < 0) {
        configOut.minTotalMinutes = kDefaultMinTotalMinutes;
    }
    if (configOut.minBriefMinutes < 0) {
        configOut.minBriefMinutes = kDefaultMinBriefMinutes;
    }
}

int AnrReportingDebriefRuleParam::parseMinutes(const std::string& value,
                                               int defaultValue) {
    if (value.empty()) {
        return defaultValue;
    }
    if (value.find(':') != std::string::npos) {
        return TimeUtils::hhmmToMinutes(value);
    }
    if (isNumberStr(value.c_str(), value.size())) {
        return atoi(value.c_str());
    }
    Logger::getRuleLogger()->warn("Rule 7417 invalid minutes value: {}", value);
    return defaultValue;
}
