#include "RuleEngine.h"
#include <iostream>

#include "CrewDB.h"
#include "StringUtil.h"
#include "rule6104/OffDutyPeriodsForCumulativeIn28DaysRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkOffDutyPeriodsForCumulativeIn28Days_QQ(RULE_LEGALITY * pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	OffDutyPeriodsForCumulativeIn28DaysRule* rule = _ruleFactory->GetCheckRule<OffDutyPeriodsForCumulativeIn28DaysRule>();
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