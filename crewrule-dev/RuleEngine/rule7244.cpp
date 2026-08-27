#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7244/LimitProgramCourseOnFlightForEvaFdRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkProgramCourseOnFlightForEvaFd(RULE_LEGALITY* pCrew) {

	LimitProgramCourseOnFlightForEvaFdRule* rule = _ruleFactory->GetCheckRule<LimitProgramCourseOnFlightForEvaFdRule>();
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
