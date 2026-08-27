#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule2001/CalculateManualLimitRule.h"
#include "RuleFactory.h"


void LegalityChecker::setManualLimit(Duty * duty) {
	CalculateManualLimitRule* rule = _ruleFactory->GetCalcRule<CalculateManualLimitRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}

void LegalityChecker::setManualLimit(Pairing* pairing) {
	CalculateManualLimitRule* rule = _ruleFactory->GetCalcRule<CalculateManualLimitRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}

void LegalityChecker::setManualLimit(SharedPtr<ROSTER>& roster) {
	CalculateManualLimitRule* rule = _ruleFactory->GetCalcRule<CalculateManualLimitRule>();
	if (rule == nullptr) {
		return;
	}
	std::vector<const ROSTER*> rosters;
	rosters.emplace_back(roster.get());
	rule->CalculateDuty(rosters);
}

void LegalityChecker::setManualLimit(RULE_LEGALITY* pCrew) {
	CalculateManualLimitRule* rule = _ruleFactory->GetCalcRule<CalculateManualLimitRule>();
	if (rule == nullptr) {
		return;
	}
	//pCrew->RosterIndex
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}
	rule->CalculateDuty(rosters);
}