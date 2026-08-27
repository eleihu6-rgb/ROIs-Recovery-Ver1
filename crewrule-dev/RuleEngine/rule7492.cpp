#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7492/CalculateMaxFdpExtensionForSplitDutyForHXRule.h"
#include "RuleFactory.h"


void LegalityChecker::setMaxFdpExtensionForSplitDutyForHX(Duty* duty) {
	CalculateMaxFdpExtensionForSplitDutyForHXRule* rule = _ruleFactory->GetCalcRule<CalculateMaxFdpExtensionForSplitDutyForHXRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}

void LegalityChecker::setMaxFdpExtensionForSplitDutyForHX(Pairing* pairing) {
	CalculateMaxFdpExtensionForSplitDutyForHXRule* rule = _ruleFactory->GetCalcRule<CalculateMaxFdpExtensionForSplitDutyForHXRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}

void LegalityChecker::setMaxFdpExtensionForSplitDutyForHX(SharedPtr<ROSTER> roster) {
	CalculateMaxFdpExtensionForSplitDutyForHXRule* rule = _ruleFactory->GetCalcRule<CalculateMaxFdpExtensionForSplitDutyForHXRule>();
	if (rule == nullptr) {
		return;
	}
	std::vector<const ROSTER*> rosters;
	rosters.emplace_back(roster.get());
	rule->CalculateDuty(rosters);
}