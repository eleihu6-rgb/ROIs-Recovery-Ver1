#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7248/RestrictTraineeHoldAssignmentForEvaFdRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkTraineeHoldAssignmentForEvaFd(RULE_LEGALITY* pCrew) {

	RestrictTraineeHoldAssignmentForEvaFdRule* rule = _ruleFactory->GetCheckRule<RestrictTraineeHoldAssignmentForEvaFdRule>();
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
