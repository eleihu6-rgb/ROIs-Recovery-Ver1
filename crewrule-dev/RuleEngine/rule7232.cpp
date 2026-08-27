#include "RuleEngine.h"
#include "Utility.h"
#include <iostream>
#include "CrewDB.h"
#include "StringUtil.h"
#include "rule7232/CheckConsecutiveRosterForItRule.h"
#include "RuleFactory.h"

bool LegalityChecker::CheckConsecutiveRosterForIt(RULE_LEGALITY* pCrew) {
	CheckConsecutiveRosterForItRule* rule = _ruleFactory->GetCheckRule<CheckConsecutiveRosterForItRule>();
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
