#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7237/LimitDependBetweenCoursesForEvaFdRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkDependBetweenCoursesForEvaFd(RULE_LEGALITY* pCrew) {

	LimitDependBetweenCoursesForEvaFdRule* rule = _ruleFactory->GetCheckRule<LimitDependBetweenCoursesForEvaFdRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(pCrew);
	if (this->GetApplication() == PAIRING_OPTIMIZER) {
		return true;
	}

	//std::vector<const ROSTER*> rosters;
	//for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
	//	rosters.emplace_back(roster.get());
	//}
	return rule->CheckRule(_dbData->crewList[pCrew->crewIndex]);
}
