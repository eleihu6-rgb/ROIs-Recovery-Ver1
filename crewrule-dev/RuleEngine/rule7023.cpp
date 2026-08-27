#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7023/CalculateMinRestAtLayoverForTGRule.h"
#include "RuleFactory.h"


void LegalityChecker::setMinRestAtLayover_TG(Duty * duty) {
	CalculateMinRestAtLayoverForTGRule* rule = _ruleFactory->GetCalcRule<CalculateMinRestAtLayoverForTGRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}

void LegalityChecker::setMinRestAtLayover_TG(Pairing* pairing) {
	CalculateMinRestAtLayoverForTGRule* rule = _ruleFactory->GetCalcRule<CalculateMinRestAtLayoverForTGRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}

void LegalityChecker::setMinRestAtLayover_TG(SharedPtr<ROSTER> roster) {
	CalculateMinRestAtLayoverForTGRule* rule = _ruleFactory->GetCalcRule<CalculateMinRestAtLayoverForTGRule>();
	if (rule == nullptr) {
		return;
	}
	std::vector<const ROSTER*> rosters;
	rosters.emplace_back(roster.get());
	rule->CalculateDuty(rosters);
}