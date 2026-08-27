/**
 * @file LimitPositioningInCopForSQRule.h
 * @brief
 * @author
 * @version 1.0
 * @date 2026-01-11
**/

#ifndef _LIMITPOSITIONINGINCOPFORSQRULE_H_
#define _LIMITPOSITIONINGINCOPFORSQRULE_H_

#include <string>
#include <vector>

#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitPositioningInCopForSQRuleParam.h"

class LimitPositioningInCopForSQRule : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7468;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

    explicit LimitPositioningInCopForSQRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, LimitPositioningInCopForSQRule::RuleFuncId, LimitPositioningInCopForSQRule::AvailableInterface) {
        ParseParam(input);
    }
    ~LimitPositioningInCopForSQRule() override = default;

    bool CheckRule(const Pairing* pairing) const override;
    bool CheckRule(const Duty* duty) const override;

private:
    std::vector<LimitPositioningInCopForSQRuleParam> _ruleParams;

    void ParseParam(const InputType& input);
    bool CheckRule(const std::vector<Duty*>& duties) const;

    void ThrowSectorLimitViolation(const std::vector<Duty*>& duties, const LimitPositioningInCopForSQRuleParam& ruleParam, int actual, int limit) const;
    void ThrowDutyLimitViolation(const std::vector<Duty*>& duties, const LimitPositioningInCopForSQRuleParam& ruleParam, int actual, int limit) const;
};

inline bool LimitPositioningInCopForSQRule::CheckRule(const Pairing* pairing) const {
    return CheckRule(pairing->getDutyVec());
}

inline bool LimitPositioningInCopForSQRule::CheckRule(const Duty* duty) const {
    std::vector<Duty*> duties(1, const_cast<Duty*>(duty));
    return CheckRule(duties);
}

inline bool LimitPositioningInCopForSQRule::CheckRule(const std::vector<Duty*>& duties) const {
    if (_ruleParams.empty() || duties.empty()) {
        return true;
    }

    std::string base = duties.front()->getBase();
    if (base.empty()) {
        base = duties.front()->getDepStationRead();
    }

    bool passAllRule = true;
    for (const auto& ruleParam : _ruleParams) {
        _ruleViolation.SetRuleParam(ruleParam);
        if (!ruleParam.MatchBase(base) || !ruleParam.MatchOperatingScope(duties, _dbData.get())) {
            continue;
        }

        int sectorCount = 0;
        int dutyCount = 0;
        for (const auto& duty : duties) {
            if (ruleParam.MatchDutyAssignment(duty)) {
                ++dutyCount;
            }
            for (const auto& segment : duty->getSegmentsRead()) {
                if (ruleParam.MatchSectorAssignment(segment)) {
                    ++sectorCount;
                }
            }
        }

        if (ruleParam._maxLimitedSectors >= 0 && sectorCount > ruleParam._maxLimitedSectors) {
            passAllRule = false;
            ThrowSectorLimitViolation(duties, ruleParam, sectorCount, ruleParam._maxLimitedSectors);
            if (!this->IsCheckAllRule()) {
                return passAllRule;
            }
        }

        if (ruleParam._maxLimitedDuties >= 0 && dutyCount > ruleParam._maxLimitedDuties) {
            passAllRule = false;
            ThrowDutyLimitViolation(duties, ruleParam, dutyCount, ruleParam._maxLimitedDuties);
            if (!this->IsCheckAllRule()) {
                return passAllRule;
            }
        }
    }
    return passAllRule;
}

inline void LimitPositioningInCopForSQRule::ParseParam(const InputType& input) {
    for (const auto& dbRule : input.dbRules) {
        _ruleParams.emplace_back(LimitPositioningInCopForSQRuleParam(this));
        auto& newParam = _ruleParams.back();
        newParam.ParseParam(dbRule);
    }
    if (!_ruleParams.empty()) {
        return;
    }
    for (const auto& singleRuleParamString : input.ruleParamString) {
        _ruleParams.emplace_back(LimitPositioningInCopForSQRuleParam(this));
        auto& newParam = _ruleParams.back();
        newParam.ParseParam(singleRuleParamString);
    }
}

inline void LimitPositioningInCopForSQRule::ThrowSectorLimitViolation(const std::vector<Duty*>& duties,
                                                                      const LimitPositioningInCopForSQRuleParam& ruleParam,
                                                                      int actual,
                                                                      int limit) const {
    if (duties.empty()) {
        return;
    }

    std::string msg = "{0:assignment} sectors in COP ({1:actual}) exceeds the limitation ({2:limit}).";
    msg = StringUtils::Format(msg, ruleParam.GetSectorAssignmentDescription(), std::to_string(actual), std::to_string(limit));

    RULE_VIOLATION* rv = new RULE_VIOLATION();
    rv->idRule = LimitPositioningInCopForSQRule::RuleFuncId;
    rv->pairingId = duties.front()->getPairingId();
    rv->dutySequenceNumber = duties.front()->getDutySegNum();
    rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
    rv->startDTUtc = duties.front()->getStartTimeUtcAct();
    rv->endDTUtc = duties.back()->getEndTimeUtcAct();
    rv->violation_msg = msg;
    Pairing* pairing = nullptr;
    if (_dbData != nullptr) {
        const auto pairingIt = _dbData->pairingIdMap.find(duties.front()->getPairingId());
        if (pairingIt != _dbData->pairingIdMap.end()) {
            pairing = pairingIt->second;
        }
    }
    if (pairing != nullptr) {
        _ruleViolation.SetLegalityMessage(pairing, msg);
    } else {
        _ruleViolation.SetLegalityMessage(duties.front(), msg, LimitPositioningInCopForSQRule::RuleFuncId);
    }

    rv->operation_result.insert(std::make_pair("ruleId", StringUtils::lltos(rv->idRule)));
    rv->operation_result.insert(std::make_pair("actualSectors", std::to_string(actual)));
    rv->operation_result.insert(std::make_pair("limitSectors", std::to_string(limit)));
    _ruleViolation.AddRuleViolations(rv);
}

inline void LimitPositioningInCopForSQRule::ThrowDutyLimitViolation(const std::vector<Duty*>& duties,
                                                                    const LimitPositioningInCopForSQRuleParam& ruleParam,
                                                                    int actual,
                                                                    int limit) const {
    if (duties.empty()) {
        return;
    }

    std::string msg = "{0:assignment} duties in COP ({1:actual}) exceeds the limitation ({2:limit}).";
    msg = StringUtils::Format(msg, ruleParam.GetDutyAssignmentDescription(), std::to_string(actual), std::to_string(limit));

    RULE_VIOLATION* rv = new RULE_VIOLATION();
    rv->idRule = LimitPositioningInCopForSQRule::RuleFuncId;
    rv->pairingId = duties.front()->getPairingId();
    rv->dutySequenceNumber = duties.front()->getDutySegNum();
    rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
    rv->startDTUtc = duties.front()->getStartTimeUtcAct();
    rv->endDTUtc = duties.back()->getEndTimeUtcAct();
    rv->violation_msg = msg;
    Pairing* pairing = nullptr;
    if (_dbData != nullptr) {
        const auto pairingIt = _dbData->pairingIdMap.find(duties.front()->getPairingId());
        if (pairingIt != _dbData->pairingIdMap.end()) {
            pairing = pairingIt->second;
        }
    }
    if (pairing != nullptr) {
        _ruleViolation.SetLegalityMessage(pairing, msg);
    } else {
        _ruleViolation.SetLegalityMessage(duties.front(), msg, LimitPositioningInCopForSQRule::RuleFuncId);
    }

    rv->operation_result.insert(std::make_pair("ruleId", StringUtils::lltos(rv->idRule)));
    rv->operation_result.insert(std::make_pair("actualDuties", std::to_string(actual)));
    rv->operation_result.insert(std::make_pair("limitDuties", std::to_string(limit)));
    _ruleViolation.AddRuleViolations(rv);
}

#endif  // _LIMITPOSITIONINGINCOPFORSQRULE_H_
