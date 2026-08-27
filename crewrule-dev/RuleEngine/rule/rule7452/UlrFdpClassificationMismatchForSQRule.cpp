/**
 * @file UlrFdpClassificationMismatchForSQRule.cpp
 */

#include "UlrFdpClassificationMismatchForSQRule.h"

#include <algorithm>

#include "Utility.h"
#include "../utils/RosterUtils.h"
#include "../framework/utils/StringUtils.h"

namespace {
constexpr const char* kFixedHeader = "Duty ULR/FDP mismatch";
}

void UlrFdpClassificationMismatchForSQRule::ParseParam(const InputType& input) {
    _params.clear();

    if (!input.dbRules.empty()) {
        for (const auto& dbRule : input.dbRules) {
            if (dbRule.tableNum > 1) {
                continue;
            }
            UlrFdpClassificationMismatchForSQRuleParam param(this);
            param.ParseParam(dbRule);
            _params.push_back(std::move(param));
        }
    } else {
        int rowNum = 1;
        for (const auto& paramString : input.ruleParamString) {
            UlrFdpClassificationMismatchForSQRuleParam param(this);
            param.ParseParam(paramString);
            param.SetRowNum(rowNum++);
            _params.push_back(std::move(param));
        }
    }

    std::sort(_params.begin(),
              _params.end(),
              [](const UlrFdpClassificationMismatchForSQRuleParam& lhs,
                 const UlrFdpClassificationMismatchForSQRuleParam& rhs) {
                  if (lhs.GetRowNum() != rhs.GetRowNum()) {
                      return lhs.GetRowNum() < rhs.GetRowNum();
                  }
                  return lhs.GetRuleParamId() < rhs.GetRuleParamId();
              });
}

bool UlrFdpClassificationMismatchForSQRule::CheckRule(const Pairing* pairing) const {
    if (pairing == nullptr || _params.empty()) {
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

bool UlrFdpClassificationMismatchForSQRule::CheckRule(const Duty* duty) const {
    if (_params.empty()) {
        return true;
    }
    return checkDuty(duty);
}

bool UlrFdpClassificationMismatchForSQRule::checkDuty(const Duty* duty) const {
    if (duty == nullptr) {
        return true;
    }

    std::string sectorDep;
    std::string sectorArr;
    if (!resolveSingleOperatingSector(*duty, sectorDep, sectorArr)) {
        return true;
    }

    const bool dutyIsUlr = duty->isULR();
    const int fdpMinutes = static_cast<int>(duty->getFDPInSecs() / 60);
    bool pass = true;

    for (const auto& param : _params) {
        if (!param.MatchesDutyPattern(sectorDep, sectorArr)) {
            continue;
        }
        if (!param.MatchesUlr(dutyIsUlr)) {
            continue;
        }
        if (!dutyMatchesFleetGroups(*duty, param.GetFleetGroupsUpper(), this->_dbData.get())) {
            continue;
        }

        _ruleViolation.SetRuleParam(param);
        if (!param.IsFdpInRange(fdpMinutes)) {
            throwViolation(duty, param, fdpMinutes, sectorDep, sectorArr);
            pass = false;
            if (!IsCheckAllRule()) {
                break;
            }
        }
    }

    return pass;
}

void UlrFdpClassificationMismatchForSQRule::throwViolation(
    const Duty* duty,
    const UlrFdpClassificationMismatchForSQRuleParam& param,
    int fdpMinutes,
    const std::string& sectorDep,
    const std::string& sectorArr) const {

    const std::string actualFdpLabel = Utility::GetInstancePtr()->formatMinutes(fdpMinutes);
    const std::string ulrLabel = duty->isULR() ? "ULR" : "non-ULR";
    const bool hasMinFdp = param.GetMinFdpLabel() != "*";
    const bool hasMaxFdp = param.GetMaxFdpLabel() != "*";
    std::string allowedFdpLabel;
    if (hasMinFdp && hasMaxFdp) {
        allowedFdpLabel = StringUtils::Format("allowed FDP for {0:ulr_label} must be between {1:min_fdp} and {2:max_fdp}.",
                                              ulrLabel,
                                              param.GetMinFdpLabel(),
                                              param.GetMaxFdpLabel());
    } else if (hasMaxFdp) {
        allowedFdpLabel = StringUtils::Format("allowed FDP for {0:ulr_label} is up to {1:max_fdp}.",
                                              ulrLabel,
                                              param.GetMaxFdpLabel());
    } else if (hasMinFdp) {
        allowedFdpLabel = StringUtils::Format("allowed FDP for {0:ulr_label} must be at least {1:min_fdp}.",
                                              ulrLabel,
                                              param.GetMinFdpLabel());
    } else {
        allowedFdpLabel =
            StringUtils::Format("allowed FDP configuration for {0:ulr_label} is invalid.", ulrLabel);
    }

    const std::string message = StringUtils::Format(
        std::string(kFixedHeader) +
            ": {0:sector} sector is classified as {1:ulr_label}, with actual FDP {2:fdp}; but {3:allowed_fdp}",
        sectorDep + "-" + sectorArr,
        ulrLabel,
        actualFdpLabel,
        allowedFdpLabel);

    _ruleViolation.SetParam("duty_pattern", sectorDep + "-" + sectorArr);
    _ruleViolation.SetParam("sector", sectorDep + "-" + sectorArr);
    _ruleViolation.SetParam("is_ulr", duty->isULR() ? "Y" : "N");
    _ruleViolation.SetParam("fdp_minutes", std::to_string(fdpMinutes));
    _ruleViolation.SetParam("min_fdp", param.GetMinFdpLabel());
    _ruleViolation.SetParam("max_fdp", param.GetMaxFdpLabel());
    _ruleViolation.SetParam("fleet_group", param.GetFleetGroupLabel());

    RULE_VIOLATION* rv = new RULE_VIOLATION();
    rv->idRule = UlrFdpClassificationMismatchForSQRule::RuleFuncId;
    rv->ruleParamId = param.GetRuleParamId();
    rv->pairingId = duty->getPairingId();
    rv->dutySequenceNumber = duty->getDutySeq();
    rv->startDTUtc = duty->getStartTimeUtcAct();
    rv->endDTUtc = duty->getEndTimeUtcAct();
    rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
    rv->reference = "SQ";
    rv->description = "Duty";
    rv->violation_msg = message;

    rv->operation_result.insert(std::make_pair("ruleId", StringUtils::lltos(rv->idRule)));
    rv->operation_result.insert(std::make_pair("ruleParamId", StringUtils::lltos(rv->ruleParamId)));
    rv->operation_result.insert(std::make_pair("reference", "SQ"));
    rv->operation_result.insert(std::make_pair("category", "Duty"));
    rv->operation_result.insert(std::make_pair("duty_pattern", sectorDep + "-" + sectorArr));
    rv->operation_result.insert(std::make_pair("sector", sectorDep + "-" + sectorArr));
    rv->operation_result.insert(std::make_pair("is_ulr", duty->isULR() ? "Y" : "N"));
    rv->operation_result.insert(std::make_pair("fdp_minutes", std::to_string(fdpMinutes)));
    rv->operation_result.insert(std::make_pair("min_fdp", param.GetMinFdpLabel()));
    rv->operation_result.insert(std::make_pair("max_fdp", param.GetMaxFdpLabel()));
    rv->operation_result.insert(std::make_pair("fleet_group", param.GetFleetGroupLabel()));

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
        _ruleViolation.SetLegalityMessage(const_cast<Duty*>(duty), message,
                                          UlrFdpClassificationMismatchForSQRule::RuleFuncId);
    }

    _ruleViolation.AddRuleViolations(rv);
}

bool UlrFdpClassificationMismatchForSQRule::resolveSingleOperatingSector(const Duty& duty,
                                                                         std::string& sectorDep,
                                                                         std::string& sectorArr) {
    sectorDep.clear();
    sectorArr.clear();

    int operatingSectorCount = 0;
    for (const auto* seg : duty.getSegmentsRead()) {
        if (seg != nullptr && seg->getIsOperating()) {
            sectorDep = seg->getDepStation();
            sectorArr = seg->getArrStation();
            if (sectorDep.empty() || sectorArr.empty()) {
                return false;
            }

            ++operatingSectorCount;
            if (operatingSectorCount > 1) {
                return false;
            }
        }
    }
    return operatingSectorCount == 1;
}

bool UlrFdpClassificationMismatchForSQRule::dutyMatchesFleetGroups(
    const Duty& duty,
    const std::vector<std::string>& allowedFleetGroupsUpper,
    const CrewDataContext* dbData) {
    if (allowedFleetGroupsUpper.empty()) {
        return true;
    }
    if (dbData == nullptr) {
        return false;
    }
    for (const auto* seg : duty.getSegmentsRead()) {
        if (seg == nullptr || !seg->getIsOperating()) {
            continue;
        }
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
            std::find(allowedFleetGroupsUpper.begin(), allowedFleetGroupsUpper.end(), fleetGroupUpper) ==
                allowedFleetGroupsUpper.end()) {
            return false;
        }
    }
    return true;
}
