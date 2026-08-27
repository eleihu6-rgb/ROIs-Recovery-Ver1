#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7239/LimitCourseDeviceTypeForEvaFdRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkCourseDeviceTypeForEvaFd(RULE_LEGALITY* pCrew) {

	LimitCourseDeviceTypeForEvaFdRule* rule = _ruleFactory->GetCheckRule<LimitCourseDeviceTypeForEvaFdRule>();
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
