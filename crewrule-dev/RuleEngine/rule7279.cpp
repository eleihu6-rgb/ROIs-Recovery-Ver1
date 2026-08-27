#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7279/LimitULROnTrainingForEvaFdRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkLimitULROnTrainingForEvaFD(RULE_LEGALITY* pCrew) {

	LimitULROnTrainingForEvaFdRule* rule = _ruleFactory->GetCheckRule<LimitULROnTrainingForEvaFdRule>();
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
