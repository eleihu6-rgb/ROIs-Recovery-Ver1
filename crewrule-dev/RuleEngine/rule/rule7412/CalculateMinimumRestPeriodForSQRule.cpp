#include "../RuleSytem.h"
#include "CalculateMinimumRestPeriodForSQRule.h"
#include "MinRestRequirementCalculator.h"

#include <algorithm>
#include <unordered_map>

#include "UtilFunc.h"
#include "Log/Logger.h"
#include "../utils/DutyUtils.h"
#include "../constant/Constants.h"

namespace {

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

std::string dutyAssignmentUpperOrDefault(const Duty& duty) {
    const std::string a = duty.getAssignment();
    return a.empty() ? "FLY" : a;
}

bool assignmentInListUpper(const std::string& assignmentUpper, const std::vector<std::string>& listUpper) {
    if (listUpper.empty()) {
        return false;
    }
    return std::find(listUpper.begin(), listUpper.end(), assignmentUpper) != listUpper.end();
}

bool isDutyIgnoredByControl(const Duty& duty, const MinRest7412ControlParam& control) {
    if (control.ignoreIntermediateAssignmentsUpper.empty()) {
        return false;
    }
    return assignmentInListUpper(dutyAssignmentUpperOrDefault(duty), control.ignoreIntermediateAssignmentsUpper);
}

}  // namespace

void CalculateMinimumRestPeriodForSQRule::CalculateDuty(Duty* duty) {

    std::vector<Duty*> duties(1, duty);
    CalculateDuty(duties);
}

void CalculateMinimumRestPeriodForSQRule::CalculateDuty(Pairing* pairing) {

    CalculateDuty(pairing->getDutyVec());

    Duty* lastDuty = pairing->getLastDuty();
    if (lastDuty == nullptr) {
        return;
    }
    if (!pairing->getBase().empty() &&
        lastDuty->getArrivalStation() == pairing->getBase() &&
        lastDuty->getMinRest() > lastDuty->getMinRestAtBase()) {
        lastDuty->setMinRestAtBase(lastDuty->getMinRest());
    }
}

void CalculateMinimumRestPeriodForSQRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {

    std::vector<Duty*> duties = DutyUtils::GetDuties(rosters, this->_dbData);
    if (duties.empty()) {
        return;
    }
    CalculateDuty(duties);
}

void CalculateMinimumRestPeriodForSQRule::CalculateDuty(std::vector<Duty*> duties) {
    if (duties.empty()) {
        return;
    }
    const auto& dataContext = this->GetDataContext();

    struct BestMinRest {
        int minutes{0};
        const CheckMinimumRestPeriodForSQRuleParam* param{nullptr};
    };
    std::unordered_map<const Duty*, BestMinRest> bestByDuty;

    for (const auto& instance : _ruleInstances) {
        if (instance.params.empty()) {
            continue;
        }
        const auto& params = instance.params;
        const auto& control = instance.control;

        std::vector<std::size_t> boundaryIdx;
        boundaryIdx.reserve(duties.size());
        for (std::size_t i = 0; i < duties.size(); ++i) {
            const Duty* d = duties[i];
            if (d == nullptr) {
                continue;
            }
            if (isDutyIgnoredByControl(*d, control)) {
                continue;
            }
            boundaryIdx.push_back(i);
        }
        if (boundaryIdx.empty()) {
            continue;
        }

        for (std::size_t bi = 0; bi < boundaryIdx.size(); ++bi) {
            Duty* currDuty = duties[boundaryIdx[bi]];
            Duty* nextDuty = (bi + 1) < boundaryIdx.size() ? duties[boundaryIdx[bi + 1]] : nullptr;
            if (currDuty == nullptr) {
                continue;
            }

            time_t restStartUtc = 0;
            DutyUtils::GetActualRestMinutes(restStartUtc, currDuty, nextDuty, dataContext);

            // performance: assume duty time setup correctly, duty local time - duty utc time = offset minutes
            int offsetMinutesRest = static_cast<int>((currDuty->getEndTimeLocAct() - currDuty->getEndTimeUtcAct()) / 60);
            if (currDuty->getEndTimeLocAct() == 0) {
                offsetMinutesRest = DutyUtils::GetTimeZoneOffsetByArr(*currDuty, dataContext);
            }
            const std::string restZoneId = (nextDuty != nullptr)
                ? dataContext->getAirportZoneId(nextDuty->getDepartureStation())
                : dataContext->getAirportZoneId(currDuty->getArrivalStation());

            int minRestMinutes = 0;
            const CheckMinimumRestPeriodForSQRuleParam* bestParamInGroup = nullptr;

            if (!MatchesControl(currDuty, nextDuty, control)) {
                continue;
            }
            for (const auto& ruleParam : params) {
                if (!ruleParam.MatchRule(*currDuty, nextDuty)) {
                    continue;
                }
                const int dpMinutes = static_cast<int>(currDuty->getDPInSecs() / 60);
                const int requiredRestMinutes =
                    MinRestRequirementCalculator::Calculate(ruleParam, dpMinutes, restStartUtc, offsetMinutesRest, restZoneId);
                if (requiredRestMinutes > minRestMinutes) {
                    minRestMinutes = requiredRestMinutes;
                    bestParamInGroup = &ruleParam;
                }
            }

            if (bestParamInGroup != nullptr) {
                auto& best = bestByDuty[currDuty];
                if (minRestMinutes > best.minutes) {
                    best.minutes = minRestMinutes;
                    best.param = bestParamInGroup;
                }
            }
        }
    }

    for (const auto& it : bestByDuty) {
        const Duty* dutyKey = it.first;
        const auto& best = it.second;
        if (dutyKey == nullptr || best.param == nullptr) {
            continue;
        }
        const_cast<Duty*>(dutyKey)->setMinRest(best.minutes);
        const_cast<Duty*>(dutyKey)->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST,
                                                       best.minutes,
                                                       best.param->GetId(),
                                                       best.param->GetRuleParamId(),
                                                       best.param->GetOverrideAbility(),
                                                       best.param->GetClassType(),
                                                       best.param->GetDescription(),
                                                       best.param->GetReference(),
                                                       false,
                                                       false,
                                                       false);
    }
}

void CalculateMinimumRestPeriodForSQRule::ParseControlRow(const DBRule& dbRule, MinRest7412ControlParam& control) {
    const auto& parameters = dbRule.params;
    for (auto it = parameters.begin(); it != parameters.end(); ++it) {
        const std::string headerUpper = strToUpper(trim(it->first));
        const std::string valueUpper = strToUpper(trim(it->second));

        if (headerUpper == "SERVICE TYPE") {
            control.serviceTypeUpper = valueUpper.empty() ? "*" : valueUpper;
        } else if (headerUpper == "FLEET GROUP" || headerUpper == "FLEET GROUPS" || headerUpper == "FLEET GROUP(GRP)" ||
                   headerUpper == "FLEET GRP" || headerUpper == "FLEETGRP") {
            if (isAllTokenUpper(valueUpper)) {
                control.fleetGroupsUpper.clear();
            } else {
                control.fleetGroupsUpper = splitPipeUpper(valueUpper);
            }
        } else if (headerUpper == "IGNORE INTERMEDIATE DUTY ASSIGNMENTS") {
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
            Logger::getRuleLogger()->warn("Rule 7412 control parameter ignored, header: {}", it->first);
        }
    }
}

bool CalculateMinimumRestPeriodForSQRule::MatchesControl(const Duty* currDuty,
                                                        const Duty* nextDuty,
                                                        const MinRest7412ControlParam& control) const {
    auto matchesSingleDuty = [this, &control](const Duty* duty) -> bool {
        if (duty == nullptr) {
            return false;
        }

        const std::string serviceFilterUpper = control.serviceTypeUpper;
        if (!isAllTokenUpper(serviceFilterUpper)) {
            if (deriveDutyServiceTypeUpper(*duty) != serviceFilterUpper) {
                return false;
            }
        }

        if (!control.fleetGroupsUpper.empty()) {
            const auto& ctx = this->GetDataContext();
            if (!dutyMatchesFleetGroups(*duty, control.fleetGroupsUpper, ctx.get())) {
                return false;
            }
        }

        return true;
    };

    if (currDuty == nullptr) {
        return true;
    }

    if (matchesSingleDuty(currDuty)) {
        return true;
    }

    return matchesSingleDuty(nextDuty);
}

void CalculateMinimumRestPeriodForSQRule::ParseParam(const InputType& input) {
    _ruleInstances.clear();

    std::unordered_map<long long, std::size_t> instanceIndexByRuleId;
    instanceIndexByRuleId.reserve(input.dbRules.size());

    auto getOrCreateInstance = [&](long long ruleId) -> RuleInstance& {
        const auto it = instanceIndexByRuleId.find(ruleId);
        if (it != instanceIndexByRuleId.end()) {
            return _ruleInstances[it->second];
        }
        const std::size_t idx = _ruleInstances.size();
        instanceIndexByRuleId.emplace(ruleId, idx);
        _ruleInstances.emplace_back();
        _ruleInstances.back().ruleId = ruleId;
        return _ruleInstances.back();
    };

    for (const auto& dbRule : input.dbRules) {
        if (dbRule.tableNum == 2) {
            auto& instance = getOrCreateInstance(dbRule.idRule);
            ParseControlRow(dbRule, instance.control);
            continue;
        }
        if (dbRule.tableNum != 0 && dbRule.tableNum != 1) {
            continue;
        }
        auto& instance = getOrCreateInstance(dbRule.idRule);
        instance.params.emplace_back(CheckMinimumRestPeriodForSQRuleParam(this));
        auto& newParam = instance.params.back();
        newParam.ParseParam(dbRule);
    }
    for (const auto& instance : _ruleInstances) {
        if (!instance.params.empty()) {
            return;
        }
    }

    if (!input.ruleParamString.empty()) {
        RuleInstance instance;
        for (const auto& singleRuleParamString : input.ruleParamString) {
            instance.params.emplace_back(CheckMinimumRestPeriodForSQRuleParam(this));
            auto& newParam = instance.params.back();
            newParam.ParseParam(singleRuleParamString);
        }
        _ruleInstances.emplace_back(std::move(instance));
    }
}
