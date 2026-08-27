#include "RuleEngine.h"
#include <iostream>

#include "CrewDB.h"
#include "StringUtil.h"
#include "rule7019/LimitActualFdpOnStandbyOfCcForTGRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkActualFdpOnStandbyOfCc_TG(RULE_LEGALITY * pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	LimitActualFdpOnStandbyOfCcForTGRule* rule = _ruleFactory->GetCheckRule<LimitActualFdpOnStandbyOfCcForTGRule>();
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