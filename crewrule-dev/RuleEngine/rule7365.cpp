#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7365/CheckLegalDaysOffFor5JRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkLegalDaysOffFor5J(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	CheckLegalDaysOffFor5JRule* rule = _ruleFactory->GetCheckRule<CheckLegalDaysOffFor5JRule>();
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