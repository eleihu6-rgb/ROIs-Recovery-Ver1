#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7100/CalculateMinRestForEvaFdRule.h"
#include "RuleFactory.h"


void LegalityChecker::setMinRest_EvaFd(Duty * duty) {
	CalculateMinRestForEvaFdRule* rule = _ruleFactory->GetCalcRule<CalculateMinRestForEvaFdRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}

void LegalityChecker::setMinRest_EvaFd(Pairing* pairing) {
	CalculateMinRestForEvaFdRule* rule = _ruleFactory->GetCalcRule<CalculateMinRestForEvaFdRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}

void LegalityChecker::setMinRest_EvaFd(SharedPtr<ROSTER> roster) {
	CalculateMinRestForEvaFdRule* rule = _ruleFactory->GetCalcRule<CalculateMinRestForEvaFdRule>();
	if (rule == nullptr) {
		return;
	}
	std::vector<const ROSTER*> rosters;
	rosters.emplace_back(roster.get());
	rule->CalculateDuty(rosters);
}