#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7361/CheckDaysOffFor5JRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkMinDaysOffFor5J(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	CheckDaysOffFor5JRule* rule = _ruleFactory->GetCheckRule<CheckDaysOffFor5JRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(pCrew);
	//pCrew->RosterIndex
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}
	return rule->CheckRule(rosters);
}
