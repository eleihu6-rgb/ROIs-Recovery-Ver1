#include "RuleEngine.h"
#include "Utility.h"
#include <iostream>
#include "CrewDB.h"
#include "StringUtil.h"
#include "rule7008/CheckConsecutiveDutyRule.h"
#include "RuleFactory.h"

bool LegalityChecker::CheckConsecutiveDuty(RULE_LEGALITY * pCrew) {
	CheckConsecutiveDutyRule* rule = _ruleFactory->GetCheckRule<CheckConsecutiveDutyRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(pCrew);
	if (this->GetApplication() == PAIRING_OPTIMIZER) {
		return true;
	}
	//pCrew->RosterIndex
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}

	return rule->CheckRule(rosters);
}
