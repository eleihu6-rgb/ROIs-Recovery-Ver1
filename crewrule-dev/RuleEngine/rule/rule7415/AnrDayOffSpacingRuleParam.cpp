#include "AnrDayOffSpacingRuleParam.h"

#include <algorithm>

#include "CrewDB.h"
#include "Log/Logger.h"
#include "../utils/TimeUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "StringUtil.h"
#include "UtilFunc.h"

namespace {
constexpr int kDefaultMaxWorkingDays = 7;
constexpr int kDefaultLastDayBufferMinutes = 21 * 60;  // 21:00
constexpr Anr7415WorkDayEndsAt kDefaultWorkDayEndsAt =
    Anr7415WorkDayEndsAt::Transport;
}

namespace {
bool isAllTokenUpper(const std::string& trimmedUpper) {
    return trimmedUpper.empty() || trimmedUpper == "*" || trimmedUpper == RuleParamConstant::ALL ||
           trimmedUpper == RuleParamConstant::IGNORED || trimmedUpper == RuleParamConstant::IGNORED_2;
}

Anr7415WorkDayEndsAt parseWorkDayEndsAt(const std::string& valueUpper,
                                        Anr7415WorkDayEndsAt defaultValue,
                                        long long idRule,
                                        long long idRuleParam) {
    if (isAllTokenUpper(valueUpper)) {
        return defaultValue;
    }
    if (valueUpper == "TRANSPORT" || valueUpper == "DROPOFF" ||
        valueUpper == "DROP OFF" || valueUpper == "DROP-OFF") {
        return Anr7415WorkDayEndsAt::Transport;
    }
    if (valueUpper == "DEBRIEF" || valueUpper == "DEBRIEFING") {
        return Anr7415WorkDayEndsAt::Debrief;
    }

    Logger::getRuleLogger()->warn(
        "Rule 7415 invalid WORK DAY ENDS AT value '{}' for idRule:{} "
        "idRuleParam:{}; fallback to default",
        valueUpper,
        idRule,
        idRuleParam);
    return defaultValue;
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

std::string derivePairingServiceTypeUpper(const Pairing& pairing) {
    bool sawOperating = false;
    bool allOperatingAreFreighter = true;
    for (const auto* duty : pairing.getDutyVec()) {
        if (duty == nullptr) {
            continue;
        }
        for (auto* seg : duty->getSegmentsRead()) {
            if (seg == nullptr || !seg->getIsOperating()) {
                continue;
            }
            sawOperating = true;
            if (seg->getServiceType() != "F") {
                allOperatingAreFreighter = false;
                break;
            }
        }
        if (!allOperatingAreFreighter) {
            break;
        }
    }
    return (sawOperating && allOperatingAreFreighter) ? "F" : "J";
}

bool pairingMatchesFleetGroups(const Pairing& pairing,
                               const std::vector<std::string>& allowedFleetGroupsUpper,
                               const CrewDataContext* dbData) {
    if (allowedFleetGroupsUpper.empty()) {
        return true;
    }
    if (dbData == nullptr) {
        return false;
    }

    bool foundOperatingSegment = false;
    for (const auto* duty : pairing.getDutyVec()) {
        if (duty == nullptr) {
            continue;
        }
        for (auto* seg : duty->getSegmentsRead()) {
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
                std::find(allowedFleetGroupsUpper.begin(),
                          allowedFleetGroupsUpper.end(),
                          fleetGroupUpper) == allowedFleetGroupsUpper.end()) {
                return false;
            }
        }
    }
    return foundOperatingSegment;
}
}  // namespace

void AnrDayOffSpacingRuleParam::ParseFromRuleInput(const RuleInput& input) {
    _hasConfig = false;
    _configs.clear();
    for (const auto& dbRule : input.dbRules) {
        // Single-table rules can come through with tableNum==0 or 1, depending on data source.
        // Skip only when there are multiple parameter tables.
        if (dbRule.tableNum != 0 && dbRule.tableNum != 1) {
            continue;
        }
        AnrDayOffSpacingConfig config;
        parseDbRule(dbRule, config);
        _configs.push_back(std::move(config));
        _hasConfig = true;
    }
}

std::vector<const AnrDayOffSpacingConfig*> AnrDayOffSpacingRuleParam::findConfigsForPairing(
    const Pairing* pairing,
    const CrewDataContext* dbData) const {
    std::vector<const AnrDayOffSpacingConfig*> matched;
    if (!_hasConfig || _configs.empty()) {
        return matched;
    }
    if (pairing == nullptr) {
        for (const auto& config : _configs) {
            matched.push_back(&config);
        }
        return matched;
    }

    for (const auto& config : _configs) {
        const std::string serviceFilterUpper = config.serviceTypeUpper;
        if (!isAllTokenUpper(serviceFilterUpper)) {
            if (derivePairingServiceTypeUpper(*pairing) != serviceFilterUpper) {
                continue;
            }
        }
        if (!config.fleetGroupsUpper.empty()) {
            if (!pairingMatchesFleetGroups(*pairing, config.fleetGroupsUpper, dbData)) {
                continue;
            }
        }
        matched.push_back(&config);
    }
    return matched;
}

void AnrDayOffSpacingRuleParam::parseDbRule(const DBRule& dbRule,
                                            AnrDayOffSpacingConfig& configOut) {
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
    configOut.maxWorkingDays = kDefaultMaxWorkingDays;
    configOut.lastDayBufferMinutes = kDefaultLastDayBufferMinutes;
    configOut.workDayEndsAt = kDefaultWorkDayEndsAt;

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
        } else if (header == "MAX WORKING DAYS" || header == "MAX CONSECUTIVE DAYS" ||
            header == "MAX DAYS") {
            if (!value.empty() && isNumberStr(value.c_str(), value.size())) {
                const int parsed = atoi(value.c_str());
                if (parsed > 0) {
                    configOut.maxWorkingDays = parsed;
                }
            }
        } else if (header == "LAST DAY BUFFER" ||
                   header == "LAST DAY BUFFER MINUTES" ||
                   header == "LAST DAY BUFFER HHMM") {
            const int minutes = parseMinutes(value, configOut.lastDayBufferMinutes);
            if (minutes >= 0) {
                configOut.lastDayBufferMinutes = minutes;
            }
        } else if (header == "WORK DAY ENDS AT") {
            configOut.workDayEndsAt = parseWorkDayEndsAt(
                valueUpper,
                configOut.workDayEndsAt,
                dbRule.idRule,
                dbRule.idRuleParam);
        } else {
            Logger::getRuleLogger()->debug(
                "Rule 7415 ignoring param '{}' for idRule:{}, idRuleParam:{}",
                header,
                dbRule.idRule,
                dbRule.idRuleParam);
        }
    }

    if (configOut.maxWorkingDays <= 0) {
        configOut.maxWorkingDays = kDefaultMaxWorkingDays;
    }
    if (configOut.lastDayBufferMinutes < 0) {
        configOut.lastDayBufferMinutes = kDefaultLastDayBufferMinutes;
    }
}

int AnrDayOffSpacingRuleParam::parseMinutes(const std::string& value,
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
    Logger::getRuleLogger()->warn("Rule 7415 invalid buffer minutes value: {}", value);
    return defaultValue;
}
