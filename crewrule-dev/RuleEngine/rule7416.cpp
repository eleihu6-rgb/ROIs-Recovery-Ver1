#include "RuleEngine.h"
#include "CrewDB.h"

#include "rule7416/CheckAnrMinDayOffInPeriodRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkAnrMinDayOffInPeriod_ANR(
    Pairing* pairing,
    RULE_LEGALITY* ruleLegality) {
    CheckAnrMinDayOffInPeriodRule* rule =
        _ruleFactory->GetCheckRule<CheckAnrMinDayOffInPeriodRule>();
    if (rule == nullptr || pairing == nullptr) {
        return true;
    }

    if (ruleLegality) {
        rule->setRuleLegality(ruleLegality);
    }
    return rule->CheckRule(pairing);
}

bool LegalityChecker::checkAnrMinDayOffInPeriod_ANR(RULE_LEGALITY* pCrew) {
    if (pCrew == nullptr || pCrew->crewIndex < 0) {
        return true;
    }

    CheckAnrMinDayOffInPeriodRule* rule =
        _ruleFactory->GetCheckRule<CheckAnrMinDayOffInPeriodRule>();
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

