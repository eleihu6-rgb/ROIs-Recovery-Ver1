#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7243/LimitSameRoleInstructorForEvaFdRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkSameRoleInstructorForEvaFd(RULE_LEGALITY* pCrew) {

	LimitSameRoleInstructorForEvaFdRule* rule = _ruleFactory->GetCheckRule<LimitSameRoleInstructorForEvaFdRule>();
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
