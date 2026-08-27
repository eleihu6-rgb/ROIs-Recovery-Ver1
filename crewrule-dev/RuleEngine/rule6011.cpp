#include "RuleEngine.h"
#include <iostream>

#include "CrewDB.h"
#include "StringUtil.h"
#include "rule6011/CheckMinRestBetweenConsecutiveDaysRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkMinRestBetweenConsecutiveDays(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	CheckMinRestBetweenConsecutiveDaysRule* rule = _ruleFactory->GetCheckRule<CheckMinRestBetweenConsecutiveDaysRule>();
	if (rule == nullptr) {
		return true;
	}
	//pCrew->RosterIndex
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}
	rule->setRuleLegality(pCrew);
	return rule->CheckRule(rosters);
}