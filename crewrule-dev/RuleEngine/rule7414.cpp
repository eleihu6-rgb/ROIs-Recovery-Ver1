#include "RuleEngine.h"
#include "CrewDB.h"

#include "rule7414/CheckAnrConsecutiveSpecialDutyRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkAnrConsecutiveSpecialDuty_ANR(Pairing* pairing,
                                                         RULE_LEGALITY* ruleLegality) {
    CheckAnrConsecutiveSpecialDutyRule* rule =
        _ruleFactory->GetCheckRule<CheckAnrConsecutiveSpecialDutyRule>();
    if (rule == nullptr || pairing == nullptr) {
        return true;
    }

    rule->setRuleLegality(ruleLegality);
    return rule->CheckRule(pairing);
}

bool LegalityChecker::checkAnrConsecutiveSpecialDuty_ANR(RULE_LEGALITY* pCrew) {
    if (pCrew == nullptr || pCrew->crewIndex < 0) {
        return true;
    }

    CheckAnrConsecutiveSpecialDutyRule* rule =
        _ruleFactory->GetCheckRule<CheckAnrConsecutiveSpecialDutyRule>();
    if (rule == nullptr) {
        return true;
    }

    rule->setRuleLegality(pCrew);

    std::vector<const ROSTER*> rosters;
    for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
        rosters.emplace_back(roster.get());
    }

    return rule->CheckRule(rosters);
}
