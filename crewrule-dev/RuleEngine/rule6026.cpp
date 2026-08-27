#include "RuleEngine.h"
#include <iostream>

#include "CrewDB.h"
#include "StringUtil.h"
#include "rule6026/LimitFleetForStandbyRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkFleetForStandby_QQ(RULE_LEGALITY * pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	LimitFleetForStandbyRule* rule = _ruleFactory->GetCheckRule<LimitFleetForStandbyRule>();
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