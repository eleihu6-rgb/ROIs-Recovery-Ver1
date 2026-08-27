#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7235/LimitCourseRoleNumbersForEvaFdRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkCourseRoleNumbersForEvaFd(RULE_LEGALITY* pCrew) {

	LimitCourseRoleNumbersForEvaFdRule* rule = _ruleFactory->GetCheckRule<LimitCourseRoleNumbersForEvaFdRule>();
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
