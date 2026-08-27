#include "RuleEngine.h"

#include "CrewDB.h"
#include "StringUtil.h"
#include "rule7028/CalculateSplitDutyMaxFdpExtensionForTGRule.h"
#include "RuleFactory.h"

void LegalityChecker::calculateSplitDutyMaxFDPExtension_TG(Duty* duty) {
	CalculateSplitDutyMaxFdpExtensionForTGRule* rule = _ruleFactory->GetCalcRule<CalculateSplitDutyMaxFdpExtensionForTGRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}

void LegalityChecker::calculateSplitDutyMaxFDPExtension_TG(Pairing* pairing) {
	CalculateSplitDutyMaxFdpExtensionForTGRule* rule = _ruleFactory->GetCalcRule<CalculateSplitDutyMaxFdpExtensionForTGRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}