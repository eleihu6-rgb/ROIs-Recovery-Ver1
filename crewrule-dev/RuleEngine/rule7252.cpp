#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7252/CheckFailedCourseForEvaFdRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkFailedCourseForEvaFd(RULE_LEGALITY* pCrew) {

	CheckFailedCourseForEvaFdRule* rule = _ruleFactory->GetCheckRule<CheckFailedCourseForEvaFdRule>();
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
