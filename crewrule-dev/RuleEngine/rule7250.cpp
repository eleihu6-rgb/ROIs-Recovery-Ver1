#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7250/CheckUnassignedCourseForEvaFdRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkUnassignedCourseForEvaFd(RULE_LEGALITY* pCrew) {

	CheckUnassignedCourseForEvaFdRule* rule = _ruleFactory->GetCheckRule<CheckUnassignedCourseForEvaFdRule>();
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
