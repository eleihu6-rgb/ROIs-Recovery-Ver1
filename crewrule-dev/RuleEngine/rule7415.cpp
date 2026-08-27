#include "RuleEngine.h"
#include "CrewDB.h"

#include "rule7415/CheckAnrDayOffSpacingRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkAnrDayOffSpacing_ANR(Pairing* pairing,
                                                RULE_LEGALITY* ruleLegality) {
    CheckAnrDayOffSpacingRule* rule =
        _ruleFactory->GetCheckRule<CheckAnrDayOffSpacingRule>();
    if (rule == nullptr || pairing == nullptr) {
        return true;
    }

    rule->setRuleLegality(ruleLegality);
    return rule->CheckRule(pairing);
}

bool LegalityChecker::checkAnrDayOffSpacing_ANR(RULE_LEGALITY* pCrew) {
    if (pCrew == nullptr || pCrew->crewIndex < 0) {
        return true;
    }

    CheckAnrDayOffSpacingRule* rule =
        _ruleFactory->GetCheckRule<CheckAnrDayOffSpacingRule>();
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

