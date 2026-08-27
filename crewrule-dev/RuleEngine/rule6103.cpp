#include "RuleEngine.h"
#include <iostream>
#include "CrewDB.h"
#include "StringUtil.h"
#include "rule6103/OffDutyPeriodsForCumulativeIn7DaysRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkOffDutyPeriodsForCumulativeIn7Days_QQ(RULE_LEGALITY * pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	OffDutyPeriodsForCumulativeIn7DaysRule* rule = _ruleFactory->GetCheckRule<OffDutyPeriodsForCumulativeIn7DaysRule>();
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