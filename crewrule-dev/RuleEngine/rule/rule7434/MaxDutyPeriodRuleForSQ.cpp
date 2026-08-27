/**
 * @file MaxDutyPeriodRuleForSQ.cpp
 */

#include "MaxDutyPeriodRuleForSQ.h"
#include "Duty.h"
#include "Pairing.h"
#include "BaseSegment.h"
#include "Segment.h"
#include "CrewDB.h"

#include <algorithm>
#include <limits>
#include <set>

#include "Utility.h"
#include "StringUtil.h"
#include "../framework/utils/TimeUtils.h"
#include "../utils/StringUtils.h"

namespace {
bool isUnlimitedLimit(int minutes) {
    return minutes == std::numeric_limits<int>::max();
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
} // namespace

void MaxDutyPeriodRuleForSQ::ParseParam(const InputType& input) {
    _ruleParams.clear();
    for (const auto& dbRule : input.dbRules) {
        if (dbRule.function == RuleFuncId) {
            MaxDutyPeriodRuleForSQParam param(this);
            param.ParseParam(dbRule);
            _ruleParams.push_back(param);
        }
    }
}

bool MaxDutyPeriodRuleForSQ::CheckRule(const Pairing* pairing) const {
    if (pairing == nullptr || _ruleParams.empty()) {
        return true;
    }
    bool passAll = true;
    for (const auto* duty : pairing->getDutyVec()) {
        if (!checkDuty(duty)) {
            passAll = false;
            if (!IsCheckAllRule()) {
                break;
            }
        }
    }
    return passAll;
}

bool MaxDutyPeriodRuleForSQ::CheckRule(const Duty* duty) const {
    if (duty == nullptr || _ruleParams.empty()) {
        return true;
    }
    return checkDuty(duty);
}

bool MaxDutyPeriodRuleForSQ::checkDuty(const Duty* duty) const {
    if (duty == nullptr) {
        return true;
    }

    const bool dutyHasFleetChange = hasFleetChange(*duty);
    const bool dutyHasFleetGroupChange = hasFleetGroupChange(*duty);
    const std::string dutyFleet = duty->getFltCD();
    const std::string dutyComposition = duty->getCompositionName();
    const std::string dutyServiceTypeUpper = deriveDutyServiceTypeUpper(*duty);
    const int dutyPeriodMinutes = duty->getDPInSecs() / 60;
    const int dutyFdpMinutes = duty->getFDPInSecs() / 60;
    const auto& ctx = GetDataContext();

    bool passAll = true;
    const std::string dutyAssignment = duty->getAssignment();

    for (const auto& param : _ruleParams) {
        _ruleViolation.SetRuleParam(param);
        const auto& dutyAssignments = param.GetDutyAssignments();
        const bool dutyAssignmentMatch = dutyAssignments.empty() ||
                                         (!dutyAssignment.empty() &&
                                          std::find(dutyAssignments.begin(), dutyAssignments.end(), dutyAssignment) != dutyAssignments.end());
        if (param.Matches(dutyFleet, dutyComposition, dutyHasFleetChange, dutyHasFleetGroupChange) &&
            param.MatchesServiceType(dutyServiceTypeUpper) &&
            dutyMatchesFleetGroups(*duty, param.GetFleetGroupsUpper(), ctx.get()) &&
            dutyAssignmentMatch) {
            const auto& assignments = param.GetAssignmentsAfterFDP();
            const bool assignmentConditionMet = assignments.empty() || hasMatchingAssignmentAfterFDP(*duty, assignments);

            const int maxDpMinutes = param.GetMaxDutyPeriodMinutes();
            const int maxFdpMinutes = param.GetMaxFlightDutyPeriodMinutes();
            const bool dpExceeded = !isUnlimitedLimit(maxDpMinutes) && dutyPeriodMinutes > maxDpMinutes;
            const bool fdpExceeded = !isUnlimitedLimit(maxFdpMinutes) && dutyFdpMinutes > maxFdpMinutes;

            if (assignmentConditionMet && (dpExceeded || fdpExceeded)) {
                throwViolation(duty, param, dutyPeriodMinutes, dutyFdpMinutes);
                passAll = false;
                if (!IsCheckAllRule()) {
                    break;
                }
            }
        }
    }
    return passAll;
}

bool MaxDutyPeriodRuleForSQ::hasMatchingAssignmentAfterFDP(const Duty& duty, const std::vector<std::string>& assignments) const {
    const auto& segments = duty.getSegmentsRead();
    if (segments.empty() || assignments.empty()) {
        return false;
    }

    int lastOperatingSegmentIndex = -1;
    for (int i = segments.size() - 1; i >= 0; --i) {
        if (segments[i] != nullptr && segments[i]->getIsOperating()) {
            lastOperatingSegmentIndex = i;
            break;
        }
    }

    if (lastOperatingSegmentIndex == -1) {
        return false; // No operating segments, so no FDP to be after
    }

    for (int i = lastOperatingSegmentIndex + 1; i < segments.size(); i++) {
		auto seg = segments.at(i);
        if (seg != nullptr) {
            for (const auto& assignmentCode : assignments) {
                if (seg->getAssignment() == assignmentCode) {
                    return true;
                }
            }
        }
    }

    return false;
}

bool MaxDutyPeriodRuleForSQ::hasFleetChange(const Duty& duty) const {
    const auto& segments = duty.getSegmentsRead();
    if (segments.size() < 2) {
        return false;
    }

    std::string firstOperatingFleet;
    for (const auto* seg : segments) {
        if (seg != nullptr && seg->getIsOperating()) {
            if (firstOperatingFleet.empty()) {
                firstOperatingFleet = seg->getFleetCD();
			}
            else if (seg->getFleetCD() != firstOperatingFleet) {
                return true;
			}
        }
    }
    return false;
}

bool MaxDutyPeriodRuleForSQ::hasFleetGroupChange(const Duty& duty) const {
    const auto& segments = duty.getSegmentsRead();
    if (segments.size() < 2) {
        return false;
    }

    std::string firstOperatingFleetGroup;
    for (const auto* seg : segments) {
        if (seg == nullptr || !seg->getIsOperating()) {
            continue;
        }

        std::string fleetGroup = seg->getFleetCD();
        const auto& dbData = GetDataContext();
        if (dbData != nullptr) {
            const auto it = dbData->fleetMap.find(seg->getFleetCD());
            if (it != dbData->fleetMap.end() && !it->second.fleetGrp.empty()) {
                fleetGroup = it->second.fleetGrp;
            }
        }

        if (firstOperatingFleetGroup.empty()) {
            firstOperatingFleetGroup = fleetGroup;
            continue;
        }

        if (fleetGroup != firstOperatingFleetGroup) {
            return true;
        }
    }

    return false;
}


void MaxDutyPeriodRuleForSQ::throwViolation(const Duty* duty,
                                       const MaxDutyPeriodRuleForSQParam& param,
                                       int actualDutyMinutes,
                                       int actualFdpMinutes) const {
    const int limitMinutes = param.GetMaxDutyPeriodMinutes();
    const int limitFdpMinutes = param.GetMaxFlightDutyPeriodMinutes();
    const std::string header = param.GetViolationHeader();
    const std::string prefix = header.empty() ? "" : header + " ";

    const bool dpExceeded = !isUnlimitedLimit(limitMinutes) && actualDutyMinutes > limitMinutes;
    const bool fdpExceeded = !isUnlimitedLimit(limitFdpMinutes) && actualFdpMinutes > limitFdpMinutes;
    
    std::string message;
    if (dpExceeded && fdpExceeded) {
        const std::string dpLimitLabel = Utility::GetInstancePtr()->formatMinutes(limitMinutes);
        const std::string dpActualLabel = Utility::GetInstancePtr()->formatMinutes(actualDutyMinutes);
        const std::string fdpLimitLabel = Utility::GetInstancePtr()->formatMinutes(limitFdpMinutes);
        const std::string fdpActualLabel = Utility::GetInstancePtr()->formatMinutes(actualFdpMinutes);
        message = prefix + "Duty period {0:dp_actual} exceeds max {1:dp_limit}; FDP {2:fdp_actual} exceeds max {3:fdp_limit}.";
        message = StringUtils::Format(message, dpActualLabel, dpLimitLabel, fdpActualLabel, fdpLimitLabel);
    } else if (dpExceeded) {
        const std::string dpLimitLabel = Utility::GetInstancePtr()->formatMinutes(limitMinutes);
        const std::string dpActualLabel = Utility::GetInstancePtr()->formatMinutes(actualDutyMinutes);
        message = prefix + "Duty period {0:actual} exceeds max {1:limit}.";
        message = StringUtils::Format(message, dpActualLabel, dpLimitLabel);
    } else {
        const std::string fdpLimitLabel = Utility::GetInstancePtr()->formatMinutes(limitFdpMinutes);
        const std::string fdpActualLabel = Utility::GetInstancePtr()->formatMinutes(actualFdpMinutes);
        message = prefix + "FDP {0:actual} exceeds max {1:limit}.";
        message = StringUtils::Format(message, fdpActualLabel, fdpLimitLabel);
    }

    _ruleViolation.SetParam("dp_minutes", std::to_string(actualDutyMinutes));
    if (!isUnlimitedLimit(limitMinutes)) {
        _ruleViolation.SetParam("max_dp_minutes", std::to_string(limitMinutes));
    }
    _ruleViolation.SetParam("fdp_minutes", std::to_string(actualFdpMinutes));
    if (!isUnlimitedLimit(limitFdpMinutes)) {
        _ruleViolation.SetParam("max_fdp_minutes", std::to_string(limitFdpMinutes));
    }
    _ruleViolation.SetParam("fleet", param.GetFleetLabel());
    _ruleViolation.SetParam("composition", param.GetCompositionLabel());
    _ruleViolation.SetParam("service_type", param.GetServiceTypeLabel());
    _ruleViolation.SetParam("fleet_group", param.GetFleetGroupLabel());
    _ruleViolation.SetParam("fleet_change", param.GetFleetChangeLabel());
    _ruleViolation.SetParam("fleet_group_change", param.GetFleetGroupChangeLabel());
    _ruleViolation.SetParam("assignment_after_fdp", param.GetAssignmentsAfterFDPLabel());
    _ruleViolation.SetParam("duty_assignment", param.GetDutyAssignmentsLabel());


    auto* rv = new RULE_VIOLATION();
    rv->pairingId = duty->getPairingId();
    rv->dutySequenceNumber = duty->getDutySeq();
    rv->startDTUtc = duty->getStartTimeUtcAct();
    rv->endDTUtc = duty->getEndTimeUtcAct();
    rv->idRule = MaxDutyPeriodRuleForSQ::RuleFuncId;
    rv->ruleParamId = param.GetRuleParamId();
    rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
    rv->violation_msg = message;
    
    rv->operation_result.insert(std::make_pair("ruleId", StringUtils::lltos(param.GetId())));
    rv->operation_result.insert(std::make_pair(
        "category", param.GetReference().empty() ? "CA" : param.GetReference()));
    rv->operation_result.insert(std::make_pair("dp_minutes", std::to_string(actualDutyMinutes)));
    if (!isUnlimitedLimit(limitMinutes)) {
        rv->operation_result.insert(std::make_pair("max_dp_minutes", std::to_string(limitMinutes)));
    }
    rv->operation_result.insert(std::make_pair("fdp_minutes", std::to_string(actualFdpMinutes)));
    if (!isUnlimitedLimit(limitFdpMinutes)) {
        rv->operation_result.insert(std::make_pair("max_fdp_minutes", std::to_string(limitFdpMinutes)));
    }
    rv->operation_result.insert(std::make_pair("fleet", param.GetFleetLabel()));
    rv->operation_result.insert(std::make_pair("composition", param.GetCompositionLabel()));
    rv->operation_result.insert(std::make_pair("service_type", param.GetServiceTypeLabel()));
    rv->operation_result.insert(std::make_pair("fleet_group", param.GetFleetGroupLabel()));
    rv->operation_result.insert(std::make_pair("fleet_change", param.GetFleetChangeLabel()));
    rv->operation_result.insert(std::make_pair("fleet_group_change", param.GetFleetGroupChangeLabel()));
    rv->operation_result.insert(std::make_pair("assignment_after_fdp", param.GetAssignmentsAfterFDPLabel()));
    rv->operation_result.insert(std::make_pair("duty_assignment", param.GetDutyAssignmentsLabel()));

    _ruleViolation.SetLegalityMessage(const_cast<Duty*>(duty), message, MaxDutyPeriodRuleForSQ::RuleFuncId);
    _ruleViolation.AddRuleViolations(rv);
}
