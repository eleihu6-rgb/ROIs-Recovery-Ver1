#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7245/LimitTrainingRoleInTeamForEvaFdRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkTrainingRoleInTeamForEvaFd(RULE_LEGALITY* pCrew) {

	LimitTrainingRoleInTeamForEvaFdRule* rule = _ruleFactory->GetCheckRule<LimitTrainingRoleInTeamForEvaFdRule>();
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
