
#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7506/SingleDailyCheckinForCARSRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkSingleDailyCheckinForCARS(RULE_LEGALITY* pCrew) {
    if (pCrew->crewIndex < 0) {
        return true;
    }

    SingleDailyCheckinForCARSRule* rule = _ruleFactory->GetCheckRule<SingleDailyCheckinForCARSRule>();
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
