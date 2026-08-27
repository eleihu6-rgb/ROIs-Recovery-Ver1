

#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7503/LimitConsecutiveWoclForCARSRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkConsecutiveWoclForCARS(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0) {
		return true;
	}

	LimitConsecutiveWoclForCARSRule* rule = _ruleFactory->GetCheckRule<LimitConsecutiveWoclForCARSRule>();
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
