/**
 * @file CalculateAnrMaxFdpRule.cpp
 */

#include "CalculateAnrMaxFdpRule.h"

#include "Utility.h"
#include "../utils/DutyUtils.h"

using namespace std;

namespace {

std::string getDutyComposition(const Duty* duty, const SharedPtr<CrewDataContext>& dbData) {
    if (duty == nullptr) {
        return {};
    }
    std::string composition = duty->getCompositionName();
    if (composition.empty() && dbData) {
        const std::string derivedComposition =
            DutyUtils::GetCompositionByDutyFor3(const_cast<Duty*>(duty), dbData);
        if (!derivedComposition.empty()) {
            composition = derivedComposition;
        }
    }
    return composition;
}

bool isUlrExemptedFromMaxFdp(const Duty* duty,
                            const SharedPtr<CrewDataContext>& dbData,
                            const AnrMaxFdpControl& control) {
    if (duty == nullptr || !duty->isULR()) {
        return false;
    }
    if (duty->getNumSegments() != 1) {
        return false;
    }

    const std::string& exemptComposition = control.ulrExemptionComposition;

    if (control.ulrExemptionRestFacility == -2) {
        return false;
    }

    if (!exemptComposition.empty() && exemptComposition != "*") {
        const std::string dutyComposition = getDutyComposition(duty, dbData);
        if (dutyComposition != exemptComposition) {
            return false; // case-sensitive
        }
    }

    if (control.ulrExemptionRestFacility == -1) {
        return true; // wildcard rest facility
    }
    if (!dbData) {
        return false;
    }
    const int dutyRestFacility = DutyUtils::GetRestfacility(duty, dbData);
    return dutyRestFacility == control.ulrExemptionRestFacility;
}

} // namespace

void CalculateAnrMaxFdpRule::CalculateDuty(Duty* duty) {
    if (!_dbData || _ruleInstances.empty() || duty == nullptr) {
        return;
    }
    calculateDutyInternal(duty);
}

void CalculateAnrMaxFdpRule::CalculateDuty(Pairing* pairing) {
    if (!_dbData || _ruleInstances.empty() || pairing == nullptr) {
        return;
    }
    for (auto* duty : pairing->getDutyVec()) {
        calculateDutyInternal(duty);
    }
}

void CalculateAnrMaxFdpRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
    if (!_dbData || _ruleInstances.empty() || rosters.empty()) {
        return;
    }
    for (const auto* roster : rosters) {
        if (!roster || !roster->pairing) {
            continue;
        }
        for (auto* duty : roster->pairing->getDutyVec()) {
            calculateDutyInternal(duty);
        }
    }
}

void CalculateAnrMaxFdpRule::calculateDutyInternal(Duty* duty) {
    if (duty == nullptr) {
        return;
    }
    // position duty should have max FDP = 0
    if (duty->getNumFlySegs() <= 0)
        return;
    for (const auto& instance : _ruleInstances) {
        const auto& param = instance.param;
        if (param.getRows().empty()) {
            continue;
        }

        // ULR exemption: only when duty is ULR, has exactly 1 segment, and composition matches.
        if (isUlrExemptedFromMaxFdp(duty, _dbData, param.getControl())) {
            duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP,
                                     duty->getFDPInSecs() / 60,
                                     param.GetId(),
                                     param.GetRuleParamId(),
                                     param.GetOverrideAbility(),
                                     param.GetClassType(),
                                     param.GetDescription(),
                                     param.GetReference(),
                                     true,
                                     false,
                                     false);
            continue;
        }

        AnrMaxFdpLimit limit;
        if (!param.findEffectiveLimit(duty, this->_dbData, this->_application, limit)) {
            continue;
        }

        duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP,
                                 limit.maxFdpMinutes,
                                 limit.idRule,
                                 limit.idRuleParam,
                                 limit.overrideAbility,
                                 limit.classType,
                                 limit.description,
                                 limit.reference,
                                 false,
                                 false,
                                 false);
    }
}

void CalculateAnrMaxFdpRule::ParseParam(const InputType& input) {
    _ruleInstances.clear();

    if (input.dbRules.empty()) {
        return;
    }

    std::unordered_map<long long, std::size_t> indexByRuleId;
    indexByRuleId.reserve(input.dbRules.size());

    std::vector<long long> ruleIds;
    std::vector<std::vector<DBRule>> dbRulesByInstance;

    for (const auto& dbRule : input.dbRules) {
        const long long ruleId = dbRule.idRule;
        auto it = indexByRuleId.find(ruleId);
        if (it == indexByRuleId.end()) {
            const std::size_t idx = ruleIds.size();
            indexByRuleId.emplace(ruleId, idx);
            ruleIds.push_back(ruleId);
            dbRulesByInstance.emplace_back();
            it = indexByRuleId.find(ruleId);
        }
        dbRulesByInstance[it->second].push_back(dbRule);
    }

    _ruleInstances.reserve(ruleIds.size());
    for (std::size_t i = 0; i < ruleIds.size(); ++i) {
        RuleInstance instance(this, ruleIds[i]);
        RuleInput local;
        local.dbRules = std::move(dbRulesByInstance[i]);
        // Dependent rule tables are treated as global (shared) for all 7410 instances.
        local.dependDbRules = input.dependDbRules;
        local.ruleParamString = input.ruleParamString;
        instance.param.ParseFromRuleInput(local);
        _ruleInstances.emplace_back(std::move(instance));
    }
}
