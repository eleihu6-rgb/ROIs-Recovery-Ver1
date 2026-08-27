#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7223/CheckMaxLayoversInTripsForMonthRule.h"
#include "RuleFactory.h"


bool LegalityChecker::CheckMaxLayoversInTripsForMonth(RULE_LEGALITY* pCrew) {

	CheckMaxLayoversInTripsForMonthRule* rule = _ruleFactory->GetCheckRule<CheckMaxLayoversInTripsForMonthRule>();
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