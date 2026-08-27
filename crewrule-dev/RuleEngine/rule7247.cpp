#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7247/RestrictInstructorHoldRoleForEvaFdRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkInstructorHoldRoleForEvaFd(RULE_LEGALITY* pCrew) {

	RestrictInstructorHoldRoleForEvaFdRule* rule = _ruleFactory->GetCheckRule<RestrictInstructorHoldRoleForEvaFdRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(pCrew);
	if (this->GetApplication() == PAIRING_OPTIMIZER) {
		return true;
	}

	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}
	return rule->CheckRule(rosters);
}
