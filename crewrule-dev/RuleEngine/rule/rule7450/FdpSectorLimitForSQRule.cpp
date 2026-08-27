/**
 * @file FdpSectorLimitForSQRule.cpp
 */

#include "FdpSectorLimitForSQRule.h"

#include <algorithm>
#include <unordered_map>
#include <utility>

#include "Utility.h"
#include "StringUtil.h"
#include "../framework/utils/StringUtils.h"
#include "../framework/constant/Constants.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/TimeUtils.h"

using namespace std;

namespace {
std::string resolveDutyFleetGroupUpper(const Duty& duty, const CrewDataContext* dbData) {
    if (dbData == nullptr) {
        return "";
    }
    for (auto* seg : duty.getSegmentsRead()) {
        if (seg == nullptr || !seg->getIsOperating()) {
            continue;
        }
        const std::string fleet = seg->getFleetCD();
        if (fleet.empty()) {
            continue;
        }
        const auto it = dbData->fleetMap.find(fleet);
        if (it == dbData->fleetMap.end()) {
            continue;
        }
        const std::string fleetGroupUpper = it->second.fleetGrp;
        if (!fleetGroupUpper.empty()) {
            return fleetGroupUpper;
        }
    }
    return "";
}
}  // namespace

namespace {
bool isAllTokenUpper(const std::string& trimmedUpper) {
    return trimmedUpper.empty() || trimmedUpper == "*" || trimmedUpper == RuleParamConstant::ALL ||
           trimmedUpper == RuleParamConstant::IGNORED || trimmedUpper == RuleParamConstant::IGNORED_2;
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

bool FdpSectorLimitForSQRule::CheckRule(const Pairing* pairing) const {
    if (pairing == nullptr || _ruleInstances.empty()) {
        return true;
    }
    bool passAll = true;
    for (auto* duty : pairing->getDutyVec()) {
        if (!checkDuty(duty)) {
            passAll = false;
            if (!IsCheckAllRule()) {
                break;
            }
        }
    }
    return passAll;
}

bool FdpSectorLimitForSQRule::CheckRule(const Duty* duty) const {
    if (_ruleInstances.empty()) {
        return true;
    }
    return checkDuty(duty);
}

void FdpSectorLimitForSQRule::ParseParam(const InputType& input) {
    _ruleInstances.clear();
    std::unordered_map<long long, std::size_t> instanceIndexByRuleId;
    instanceIndexByRuleId.reserve(input.dbRules.size());

    auto getOrCreateInstance = [&](long long ruleId) -> RuleInstance& {
        const auto it = instanceIndexByRuleId.find(ruleId);
        if (it != instanceIndexByRuleId.end()) {
            return _ruleInstances[it->second];
        }
        const std::size_t idx = _ruleInstances.size();
        _ruleInstances.push_back(RuleInstance{});
        _ruleInstances.back().ruleId = ruleId;
        instanceIndexByRuleId.emplace(ruleId, idx);
        return _ruleInstances.back();
    };

    if (!input.dbRules.empty()) {
        for (const auto& dbRule : input.dbRules) {
            if (dbRule.tableNum == 2) {
                parseControlRow(dbRule, getOrCreateInstance(dbRule.idRule).control);
                continue;
            }
            if (dbRule.tableNum > 2) {
                continue;
            }
            FdpSectorLimitForSQRuleParam param(this);
            param.ParseParam(dbRule);
            getOrCreateInstance(dbRule.idRule).params.emplace_back(std::move(param));
        }
    } else {
        auto& instance = getOrCreateInstance(0);
        int rowNum = 1;
        for (const auto& paramString : input.ruleParamString) {
            FdpSectorLimitForSQRuleParam param(this);
            param.ParseParam(paramString);
            param.SetRowNum(rowNum++);
            instance.params.emplace_back(std::move(param));
        }
    }

    for (auto& instance : _ruleInstances) {
        std::sort(instance.params.begin(),
                  instance.params.end(),
                  [](const FdpSectorLimitForSQRuleParam& lhs,
                     const FdpSectorLimitForSQRuleParam& rhs) {
                      if (lhs.GetRowNum() != rhs.GetRowNum()) {
                          return lhs.GetRowNum() < rhs.GetRowNum();
                      }
                      return lhs.GetRuleParamId() < rhs.GetRuleParamId();
                  });
    }
}

bool FdpSectorLimitForSQRule::checkDuty(const Duty* duty) const {
    if (duty == nullptr || _ruleInstances.empty()) {
        return true;
    }

    std::string composition = duty->getCompositionName();
    if (composition.empty() || this->IsEditorModel()) {
        composition = DutyUtils::GetCompositionByDutyFor3(const_cast<Duty*>(duty), this->_dbData);
    }
    const int fdpMinutes = static_cast<int>(duty->getFDPInSecs() / 60);

    bool pass = true;
    for (const auto& instance : _ruleInstances) {
        if (instance.params.empty()) {
            continue;
        }
        if (!matchesControl(duty, instance.control, this->_dbData.get())) {
            continue;
        }
        const FdpSectorLimitForSQRuleParam* matched = nullptr;
        for (const auto& param : instance.params) {
            if (!param.Matches(duty, composition, fdpMinutes)) {
                continue;
            }
            matched = &param;
            break;
        }
        if (matched == nullptr) {
            continue;
        }

        _ruleViolation.SetRuleParam(*matched);
        if (!evaluateDutyWithParam(duty, *matched, fdpMinutes, instance.control)) {
            pass = false;
            if (!IsCheckAllRule()) {
                break;
            }
        }
    }
    return pass;
}

bool FdpSectorLimitForSQRule::evaluateDutyWithParam(const Duty* duty,
                                                    const FdpSectorLimitForSQRuleParam& param,
                                                    int fdpMinutes,
                                                    const SectorCountControl& control) const {
    const int allowedSectors = param.GetMaxSectors();
    if (allowedSectors <= 0) {
        return true;
    }
    const int actualSectors = countSectorsWithinFdp(*duty, control);
    if (actualSectors <= allowedSectors) {
        return true;
    }

    std::string composition = duty->getCompositionName();
    if (composition.empty()) {
        composition = param.GetCompositionLabel();
    }
    std::string fleetGroup = resolveDutyFleetGroupUpper(*duty, this->_dbData.get());
    throwViolation(duty, param, actualSectors, allowedSectors, fdpMinutes, composition, fleetGroup);
    return false;
}

int FdpSectorLimitForSQRule::countSectorsWithinFdp(const Duty& duty, const SectorCountControl& control) const {
    int sectors = 0;
    int pendingDeadheads = 0;
    const bool countDeadheads = control.shouldCountDeadheads();
    const bool countFinalDeadheads = control.shouldCountFinalDeadheads();
    for (auto* segment : duty.getSegmentsRead()) {
        if (segment == nullptr) {
            continue;
        }
        if (segment->getIsOperating()) {
            ++sectors;
            if (countDeadheads) {
                sectors += pendingDeadheads;
            }
            pendingDeadheads = 0;
        } else if (countDeadheads) {
            ++pendingDeadheads;
        }
    }
    if (countFinalDeadheads) {
        sectors += pendingDeadheads;
    }
    return sectors;
}

void FdpSectorLimitForSQRule::parseControlRow(const DBRule& dbRule, SectorCountControl& control) {
    auto& parameter = const_cast<DBRule&>(dbRule).params;
    for (auto it = parameter.begin(); it != parameter.end(); ++it) {
        const std::string headerUpper = strToUpper(trim(it->first));
        const std::string value = trim(it->second);
        const std::string valueUpper = strToUpper(value);
        if (headerUpper == "SERVICE TYPE") {
            control.serviceTypeUpper = valueUpper.empty() ? "*" : valueUpper;
        } else if (headerUpper == "FLEET GROUP" || headerUpper == "FLEET GROUPS" ||
                   headerUpper == "FLEET GROUP(GRP)" || headerUpper == "FLEET GRP" ||
                   headerUpper == "FLEETGRP") {
            if (isAllTokenUpper(valueUpper)) {
                control.fleetGroupsUpper.clear();
            } else {
                control.fleetGroupsUpper = splitPipeUpper(valueUpper);
            }
        } else if (headerUpper == "COUNT DEADHEAD SECTORS") {
            if (!value.empty() && value != RuleParamConstant::IGNORED && value != "*") {
                control.countDeadheadSectors = (valueUpper == "Y");
            }
        } else if (headerUpper == "EXCLUDE FINAL DEADHEAD SECTORS") {
            if (!value.empty() && value != RuleParamConstant::IGNORED && value != "*") {
                control.excludeFinalDeadheadSectors = (valueUpper == "Y");
            }
        }
    }
}

bool FdpSectorLimitForSQRule::matchesControl(const Duty* duty,
                                             const SectorCountControl& control,
                                             const CrewDataContext* dbData) {
    if (duty == nullptr) {
        return true;
    }

    const std::string serviceFilterUpper = control.serviceTypeUpper;
    if (!isAllTokenUpper(serviceFilterUpper)) {
        if (deriveDutyServiceTypeUpper(*duty) != serviceFilterUpper) {
            return false;
        }
    }

    if (!control.fleetGroupsUpper.empty()) {
        if (!dutyMatchesFleetGroups(*duty, control.fleetGroupsUpper, dbData)) {
            return false;
        }
    }
    return true;
}

void FdpSectorLimitForSQRule::throwViolation(const Duty* duty,
                                             const FdpSectorLimitForSQRuleParam& param,
                                             int actualSectors,
                                             int maxAllowed,
                                             int fdpMinutes,
                                             const std::string& composition,
                                             const std::string& fleetGroup) const {
    const std::string fdpLabel = Utility::GetInstancePtr()->formatMinutes(fdpMinutes);
    const std::string compositionLabel = composition.empty() ? std::string("UNKNOWN") : composition;
    const std::string fleetLabel = fleetGroup.empty() ? std::string("UNKNOWN") : fleetGroup;
    const std::string header = param.GetViolationHeader();
    const std::string prefix = header.empty() ? "" : header + " ";

    std::string message = prefix + "FDP ({0:fdp}) with composition {1:composition} is limited to "
                                    "{2:max} sectors within FDP but scheduled {3:actual} sectors (fleet group {4:fleet}).";
    message = StringUtils::Format(message,
                                  fdpLabel,
                                  compositionLabel,
                                  std::to_string(maxAllowed),
                                  std::to_string(actualSectors),
                                  fleetLabel);
    if (param.GetFdpLowerMinutes() == 0 && (param.GetFdpLowerMinutes() == std::numeric_limits<int>::max() || param.GetFdpLowerMinutes() == 0)) {
        message = "Sector BLH ({0:blhLower}-{1:blhUpper}) with composition {2:composition} is limited to "
            "{3:max} sectors but scheduled {4:actual} sectors (fleet group {5:fleet}).";
        message = StringUtils::Format(message,
            Utility::GetInstancePtr()->formatMinutes(param.GetSectorBlhLowerMinutes()),
            Utility::GetInstancePtr()->formatMinutes(param.GetSectorBlhUpperMinutes()),
            compositionLabel,
            std::to_string(maxAllowed),
            std::to_string(actualSectors),
            fleetLabel);
    }

    _ruleViolation.SetParam("fdp_minutes", std::to_string(fdpMinutes));
    _ruleViolation.SetParam("max_sectors", std::to_string(maxAllowed));
    _ruleViolation.SetParam("actual_sectors", std::to_string(actualSectors));
    _ruleViolation.SetParam("composition", compositionLabel);
    _ruleViolation.SetParam("fleet_group", fleetLabel);
    _ruleViolation.SetParam("fleet", fleetLabel);

    RULE_VIOLATION* rv = new RULE_VIOLATION();
    rv->pairingId = duty->getPairingId();
    rv->dutySequenceNumber = duty->getDutySeq();
    rv->startDTUtc = duty->getStartTimeUtcAct();
    rv->endDTUtc = duty->getEndTimeUtcAct();
    rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
    rv->violation_msg = message;
    rv->operation_result.insert(std::make_pair("ruleId", StringUtils::lltos(param.GetId())));
    rv->operation_result.insert(std::make_pair(
        "category", param.GetReference().empty() ? "CA" : param.GetReference()));
    rv->operation_result.insert(std::make_pair("fdp_minutes", std::to_string(fdpMinutes)));
    rv->operation_result.insert(std::make_pair("max_sectors", std::to_string(maxAllowed)));
    rv->operation_result.insert(std::make_pair("actual_sectors", std::to_string(actualSectors)));
    rv->operation_result.insert(std::make_pair("composition", compositionLabel));
    rv->operation_result.insert(std::make_pair("fleet_group", fleetLabel));
    rv->operation_result.insert(std::make_pair("fleet", fleetLabel));

    if (_ruleViolation.GetRuleLegality() != nullptr) {
        auto* legality = _ruleViolation.GetRuleLegality();
        if (legality->crewIndex >= 0 && legality->crewIndex < static_cast<int>(_dbData->crewList.size())) {
            SharedPtr<CREW> crew = this->_dbData->crewList[legality->crewIndex];
            const SharedPtr<ROSTER> roster =
                RosterUtils::GetRosterByPairingId(crew->rosterList, duty->getPairingId());
            rv->crewId = crew->idCrew;
            rv->rosterId = roster == nullptr ? -1 : roster->rosterId;
            _ruleViolation.SetLegalityMessage(crew, message);
        }
    } else {
        _ruleViolation.SetLegalityMessage(const_cast<Duty*>(duty), message, FdpSectorLimitForSQRule::RuleFuncId);
    }

    _ruleViolation.AddRuleViolations(rv);
}
