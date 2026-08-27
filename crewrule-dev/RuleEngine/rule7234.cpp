#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7234/LimitCourseRoleQualForEvaFdRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkCourseRoleQualForEvaFd(RULE_LEGALITY* pCrew) {

	LimitCourseRoleQualForEvaFdRule* rule = _ruleFactory->GetCheckRule<LimitCourseRoleQualForEvaFdRule>();
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
