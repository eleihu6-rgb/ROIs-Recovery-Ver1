#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule6121/CheckAssignmentOverlappableRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkAssignmentOverlap(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	CheckAssignmentOverlappableRule* rule = _ruleFactory->GetCheckRule<CheckAssignmentOverlappableRule>();
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

