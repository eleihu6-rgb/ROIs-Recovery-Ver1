#include "RuleEngine.h"
#include "Utility.h"

#include "RuleFactory.h"
#include "rule7410/CalculateAnrMaxFdpRule.h"
#include "rule7410/CheckAnrMaxFdpRule.h"

using namespace std;

bool LegalityChecker::checkMaxFlightDutyPeriod_ANR(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {
    CheckAnrMaxFdpRule* rule = _ruleFactory->GetCheckRule<CheckAnrMaxFdpRule>();
    if (rule == nullptr) {
        return true;
    }
    rule->setRuleLegality(ruleLegality);

    for (const auto& duty : pairing->getDutyVec()) {
        if (!rule->CheckRule(duty)) {
            if (!rule->IsEditorModel())
                return false;
        }
    }

    return true;
}

bool LegalityChecker::checkMaxFlightDutyPeriodSingleDuty_ANR(Duty* duty) {
    CheckAnrMaxFdpRule* rule = _ruleFactory->GetCheckRule<CheckAnrMaxFdpRule>();
    if (rule == nullptr || duty == nullptr) {
        return true;
    }

    rule->setRuleLegality(nullptr);
    return rule->CheckRule(duty);
}

void LegalityChecker::calculateMaxFlightDutyPeriod_ANR(Duty* duty, SharedPtr<ROSTER> roster) {
    CalculateAnrMaxFdpRule* rule = _ruleFactory->GetCalcRule<CalculateAnrMaxFdpRule>();
    if (rule == nullptr || duty == nullptr) {
        return;
    }

    if (!roster) {
        rule->CalculateDuty(duty);
    } else {
        std::vector<const ROSTER*> rosters;
        rosters.emplace_back(roster.get());
        rule->CalculateDuty(rosters);
    }
}

void LegalityChecker::calculateMaxFlightDutyPeriod_ANR(Pairing* pairing) {
    CalculateAnrMaxFdpRule* rule = _ruleFactory->GetCalcRule<CalculateAnrMaxFdpRule>();
    if (rule == nullptr || pairing == nullptr) {
        return;
    }
    rule->CalculateDuty(pairing);
}

