#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7263/CheckMaxEarlyStartOrLateFinishWithinPeriodRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkMaxEarlyStartOrLateFinishWithinPeriod(RULE_LEGALITY* pCrew) {

	CheckMaxEarlyStartOrLateFinishWithinPeriodRule* rule = _ruleFactory->GetCheckRule<CheckMaxEarlyStartOrLateFinishWithinPeriodRule>();
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
