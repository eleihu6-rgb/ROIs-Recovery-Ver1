#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7238/LimitCourseStartTimeForEvaFdRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkCourseStartTimeForEvaFd(RULE_LEGALITY* pCrew) {

	LimitCourseStartTimeForEvaFdRule* rule = _ruleFactory->GetCheckRule<LimitCourseStartTimeForEvaFdRule>();
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
