#include "RuleEngine.h"

#include "CrewDB.h"
#include "StringUtil.h"
#include "rule7017/CalculateMaxFdpExtensionOfCcForTGRule.h"
#include "RuleFactory.h"

void LegalityChecker::calculateMaxFDPExtension_TG_CC(Duty * duty) {
	CalculateMaxFdpExtensionOfCcForTGRule* rule = _ruleFactory->GetCalcRule<CalculateMaxFdpExtensionOfCcForTGRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}

void LegalityChecker::calculateMaxFDPExtension_TG_CC(Pairing * pairing) {
	CalculateMaxFdpExtensionOfCcForTGRule* rule = _ruleFactory->GetCalcRule<CalculateMaxFdpExtensionOfCcForTGRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}