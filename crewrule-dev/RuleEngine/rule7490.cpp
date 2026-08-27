#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7490/CalculateFdpExtensionForHXRule.h"
#include "RuleFactory.h"


void LegalityChecker::setMaxFdpExtensionForHX(Duty* duty) {
	CalculateFdpExtensionForHXRule* rule = _ruleFactory->GetCalcRule<CalculateFdpExtensionForHXRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}

void LegalityChecker::setMaxFdpExtensionForHX(Pairing* pairing) {
	CalculateFdpExtensionForHXRule* rule = _ruleFactory->GetCalcRule<CalculateFdpExtensionForHXRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}

void LegalityChecker::setMaxFdpExtensionForHX(SharedPtr<ROSTER> roster) {
	CalculateFdpExtensionForHXRule* rule = _ruleFactory->GetCalcRule<CalculateFdpExtensionForHXRule>();
	if (rule == nullptr) {
		return;
	}
	std::vector<const ROSTER*> rosters;
	rosters.emplace_back(roster.get());
	rule->CalculateDuty(rosters);
}

void LegalityChecker::setMaxFdpExtensionForHX(RULE_LEGALITY* pCrew) {
	CalculateFdpExtensionForHXRule* rule = _ruleFactory->GetCalcRule<CalculateFdpExtensionForHXRule>();
	if (rule == nullptr) {
		return;
	}
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}
	rule->CalculateDuty(rosters);
}
