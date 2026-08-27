#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7233/LimitCourseTimePeriodForEvaFdRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkCourseTimePeriodForEvaFd(RULE_LEGALITY* pCrew) {

	LimitCourseTimePeriodForEvaFdRule* rule = _ruleFactory->GetCheckRule<LimitCourseTimePeriodForEvaFdRule>();
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
