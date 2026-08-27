#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7240/CheckCourseDeviceAvailForEvaFdRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkCourseDeviceAvailForEvaFd(RULE_LEGALITY* pCrew) {

	CheckCourseDeviceAvailForEvaFdRule* rule = _ruleFactory->GetCheckRule<CheckCourseDeviceAvailForEvaFdRule>();
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
