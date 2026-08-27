#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7021/CalculateMinRestByDutyPeriodForTGRule.h"
#include "RuleFactory.h"


void LegalityChecker::setMinRestByDP_TG(Duty * duty) {
	CalculateMinRestByDutyPeriodForTGRule* rule = _ruleFactory->GetCalcRule<CalculateMinRestByDutyPeriodForTGRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}

void LegalityChecker::setMinRestByDP_TG(Pairing* pairing) {
	CalculateMinRestByDutyPeriodForTGRule* rule = _ruleFactory->GetCalcRule<CalculateMinRestByDutyPeriodForTGRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}

void LegalityChecker::setMinRestByDP_TG(SharedPtr<ROSTER> roster) {
	CalculateMinRestByDutyPeriodForTGRule* rule = _ruleFactory->GetCalcRule<CalculateMinRestByDutyPeriodForTGRule>();
	if (rule == nullptr) {
		return;
	}
	std::vector<const ROSTER*> rosters;
	rosters.emplace_back(roster.get());
	rule->CalculateDuty(rosters);
}