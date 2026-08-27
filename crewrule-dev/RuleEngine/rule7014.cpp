#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7014/RecurrentExtendedRecoveryRestPeriodRule.h"
#include "RuleFactory.h"

bool LegalityChecker::RecurrentExtendedRecoveryRestPeriod(RULE_LEGALITY * pCrew) {
	RecurrentExtendedRecoveryRestPeriodRule* rule = _ruleFactory->GetCheckRule<RecurrentExtendedRecoveryRestPeriodRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(pCrew);
	if (this->GetApplication() == PAIRING_OPTIMIZER) {
		return true;
	}
	//pCrew->RosterIndex
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}

	return rule->CheckRule(rosters);
}
