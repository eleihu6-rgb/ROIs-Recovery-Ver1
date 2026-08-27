#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7491/CalculateFdpExtensionForCcForHXRule.h"
#include "RuleFactory.h"


void LegalityChecker::setMaxFdpExtensionForCcForHX(Duty* duty) {
	CalculateFdpExtensionForCcForHXRule* rule = _ruleFactory->GetCalcRule<CalculateFdpExtensionForCcForHXRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}

void LegalityChecker::setMaxFdpExtensionForCcForHX(Pairing* pairing) {
	CalculateFdpExtensionForCcForHXRule* rule = _ruleFactory->GetCalcRule<CalculateFdpExtensionForCcForHXRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}

void LegalityChecker::setMaxFdpExtensionForCcForHX(SharedPtr<ROSTER> roster) {
	CalculateFdpExtensionForCcForHXRule* rule = _ruleFactory->GetCalcRule<CalculateFdpExtensionForCcForHXRule>();
	if (rule == nullptr) {
		return;
	}
	std::vector<const ROSTER*> rosters;
	rosters.emplace_back(roster.get());
	rule->CalculateDuty(rosters);
}

void LegalityChecker::setMaxFdpExtensionForCcForHX(RULE_LEGALITY* pCrew) {
	CalculateFdpExtensionForCcForHXRule* rule = _ruleFactory->GetCalcRule<CalculateFdpExtensionForCcForHXRule>();
	if (rule == nullptr) {
		return;
	}
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}
	rule->CalculateDuty(rosters);
}
