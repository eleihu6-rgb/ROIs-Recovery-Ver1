#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7213/CheckNightRestPeriodForEvaRule.h"
#include "RuleFactory.h"


bool LegalityChecker::CheckNightRestPeriodForEva(RULE_LEGALITY* pCrew) {

	CheckNightRestPeriodForEvaRule* rule = _ruleFactory->GetCheckRule<CheckNightRestPeriodForEvaRule>();
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

bool LegalityChecker::CheckNightRestPeriodForEva(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {

	CheckNightRestPeriodForEvaRule* rule = _ruleFactory->GetCheckRule<CheckNightRestPeriodForEvaRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}