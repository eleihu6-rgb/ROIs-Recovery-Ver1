#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "rule7496/LimitMinWorkDaysBetweenAssignmentsForHXRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkMinWorkDaysBetweenAssignmentsForHX(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	LimitMinWorkDaysBetweenAssignmentsForHXRule* rule = _ruleFactory->GetCheckRule<LimitMinWorkDaysBetweenAssignmentsForHXRule>();
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