#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7300/CalculateMaxDutyTimeForPRRule.h"
#include "RuleFactory.h"


void LegalityChecker::setMaxDP_PR(Duty * duty) {
	CalculateMaxDutyTimeForPRRule* rule = _ruleFactory->GetCalcRule<CalculateMaxDutyTimeForPRRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}

void LegalityChecker::setMaxDP_PR(Pairing* pairing) {
	CalculateMaxDutyTimeForPRRule* rule = _ruleFactory->GetCalcRule<CalculateMaxDutyTimeForPRRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}

void LegalityChecker::setMaxDP_PR(SharedPtr<ROSTER> roster) {
	CalculateMaxDutyTimeForPRRule* rule = _ruleFactory->GetCalcRule<CalculateMaxDutyTimeForPRRule>();
	if (rule == nullptr) {
		return;
	}
	std::vector<const ROSTER*> rosters;
	rosters.emplace_back(roster.get());
	rule->CalculateDuty(rosters);
}