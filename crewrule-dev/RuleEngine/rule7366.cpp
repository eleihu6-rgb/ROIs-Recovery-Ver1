#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule/rule7366/CheckConsecutiveDaysOffRequirementFor5JRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkConsecutiveDaysOffRequirementFor5J(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	CheckConsecutiveDaysOffRequirementFor5JRule* rule = _ruleFactory->GetCheckRule<CheckConsecutiveDaysOffRequirementFor5JRule>();
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
