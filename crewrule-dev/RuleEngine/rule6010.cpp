#include "RuleEngine.h"
#include <iostream>

#include "CrewDB.h"
#include "StringUtil.h"
#include "rule6010/LimitBeforeAnnualLeaveRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkLimitBeforeAnnualLeave_QQ(RULE_LEGALITY * pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	LimitBeforeAnnualLeaveRule* rule = _ruleFactory->GetCheckRule<LimitBeforeAnnualLeaveRule>();
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