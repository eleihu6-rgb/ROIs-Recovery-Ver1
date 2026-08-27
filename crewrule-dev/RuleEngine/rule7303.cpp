#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7303/CalculateMaxDPPerAvgBLHOfCBAForPRRule.h"
#include "RuleFactory.h"


void LegalityChecker::setMaxDPPerAvgBLHOfCBA_PR(Duty * duty) {
	CalculateMaxDPPerAvgBLHOfCBAForPRRule* rule = _ruleFactory->GetCalcRule<CalculateMaxDPPerAvgBLHOfCBAForPRRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}

void LegalityChecker::setMaxDPPerAvgBLHOfCBA_PR(Pairing* pairing) {
	CalculateMaxDPPerAvgBLHOfCBAForPRRule* rule = _ruleFactory->GetCalcRule<CalculateMaxDPPerAvgBLHOfCBAForPRRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}

void LegalityChecker::setMaxDPPerAvgBLHOfCBA_PR(SharedPtr<ROSTER> roster) {
	CalculateMaxDPPerAvgBLHOfCBAForPRRule* rule = _ruleFactory->GetCalcRule<CalculateMaxDPPerAvgBLHOfCBAForPRRule>();
	if (rule == nullptr) {
		return;
	}
	std::vector<const ROSTER*> rosters;
	rosters.emplace_back(roster.get());
	rule->CalculateDuty(rosters);
}