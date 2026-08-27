
#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7505/MinimumDaysOffForCARSRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkMinimumDaysOffForCARS(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0) {
		return true;
	}

	MinimumDaysOffForCARSRule* rule = _ruleFactory->GetCheckRule<MinimumDaysOffForCARSRule>();
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
