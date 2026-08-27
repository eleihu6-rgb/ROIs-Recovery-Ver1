#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7257/LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkNumberOfTraineeForCoursesOnSameDayForEvaFdRule(RULE_LEGALITY* pCrew) {

	LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRule* rule = _ruleFactory->GetCheckRule<LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRule>();
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
