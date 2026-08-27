#include "AnrMinDayOffInPeriodRuleParam.h"

#include <algorithm>

#include "CrewDB.h"
#include "Log/Logger.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "StringUtil.h"
#include "UtilFunc.h"

namespace {
constexpr int kDefaultPeriod = 2;
constexpr int kDefaultMinDaysOff = 2;
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

void AnrMinDayOffInPeriodRuleParam::ParseFromRuleInput(const RuleInput& input) {
    _hasConfig = false;
    _configs.clear();
    for (const auto& dbRule : input.dbRules) {
        // Single-table rules can come through with tableNum==0 or 1, depending on data source.
        // Skip only when there are multiple parameter tables.
        if (dbRule.tableNum != 0 && dbRule.tableNum != 1) {
            continue;
        }
        AnrMinDayOffInPeriodConfig config;
        parseDbRule(dbRule, config);
        _configs.push_back(std::move(config));
        _hasConfig = true;
    }
}

std::vector<const AnrMinDayOffInPeriodConfig*>
AnrMinDayOffInPeriodRuleParam::findConfigsForPairing(
    const Pairing* pairing,
    const CrewDataContext* dbData) const {
    std::vector<const AnrMinDayOffInPeriodConfig*> matched;
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

void AnrMinDayOffInPeriodRuleParam::parseDbRule(const DBRule& dbRule,
                                                AnrMinDayOffInPeriodConfig& configOut) {
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
    configOut.unit = "CW";
    configOut.period = kDefaultPeriod;
    configOut.minDaysOff = kDefaultMinDaysOff;
    configOut.weekStartOn = 1;

    for (const auto& kv : dbRule.params) {
        std::string header = strToUpper(trim(kv.first));
        std::string value = trim(kv.second);
        std::string valueUpper = strToUpper(value);

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
        } else if (header == "UNIT") {
            if (!value.empty()) {
                configOut.unit = strToUpper(value);
            }
        } else if (header == "PERIOD") {
            if (!value.empty() && isNumberStr(value.c_str(), value.size())) {
                int v = atoi(value.c_str());
                if (v > 0) {
                    configOut.period = v;
                }
            }
        } else if (header == "MIN DAYS OFF" ||
                   header == "MIN DAY OFFS" ||
                   header == "MIN DAYSOFF") {
            if (!value.empty() && isNumberStr(value.c_str(), value.size())) {
                int v = atoi(value.c_str());
                if (v >= 0) {
                    configOut.minDaysOff = v;
                }
            }
        } else if (header == "WEEK START ON") {
            if (!value.empty() && isNumberStr(value.c_str(), value.size())) {
                int v = atoi(value.c_str());
                if (v >= 0 && v <= 7) {
                    configOut.weekStartOn = v;
                }
            }
        } else {
            Logger::getRuleLogger()->debug(
                "Rule 7416 ignoring param '{}' for idRule:{}, idRuleParam:{}",
                header,
                dbRule.idRule,
                dbRule.idRuleParam);
        }
    }

    if (configOut.period <= 0) {
        configOut.period = kDefaultPeriod;
    }
    if (configOut.minDaysOff < 0) {
        configOut.minDaysOff = kDefaultMinDaysOff;
    }
}
