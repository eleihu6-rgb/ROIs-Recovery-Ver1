#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7313/CalculateMaxDPByComplementForPRRule.h"
#include "RuleFactory.h"


void LegalityChecker::setMaxDPByComplement_PR(Duty* duty) {
	CalculateMaxDPByComplementForPRRule* rule = _ruleFactory->GetCalcRule<CalculateMaxDPByComplementForPRRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}

void LegalityChecker::setMaxDPByComplement_PR(Pairing* pairing) {
	CalculateMaxDPByComplementForPRRule* rule = _ruleFactory->GetCalcRule<CalculateMaxDPByComplementForPRRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}

void LegalityChecker::setMaxDPByComplement_PR(SharedPtr<ROSTER> roster) {
	CalculateMaxDPByComplementForPRRule* rule = _ruleFactory->GetCalcRule<CalculateMaxDPByComplementForPRRule>();
	if (rule == nullptr) {
		return;
	}
	std::vector<const ROSTER*> rosters;
	rosters.emplace_back(roster.get());
	rule->CalculateDuty(rosters);
}